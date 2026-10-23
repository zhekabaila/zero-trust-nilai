import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { AccessDeniedError } from '../../common/errors/access-denied.error.js';
import { Reason, type ReasonCode } from '../../common/errors/reason-codes.js';
import type { Clock } from '../../common/utils/clock.js';
import type { AuditService } from '../audit/audit.service.js';
import type { Role, Subject } from '../policy/policy.types.js';
import { TokenService } from './token.service.js';
import { UserRepository, type UserRecord } from './user.repository.js';
import { DeviceRepository } from './device.repository.js';
import { RefreshTokenRepository } from './refresh-token.repository.js';
import { ServiceClientRepository } from './service-client.repository.js';

// Constant hash so a failed login runs a bcrypt compare regardless of whether the
// user exists, keeping response time similar and the message identical.
const DUMMY_HASH = '$2b$10$cENi6GwbF89cvdbJLfXioOFOQ1xfLbd.Z9coMAeuq2XUgp1j/NPpa';

export interface AuthAuditContext {
  requestId: string;
  method: string;
  endpoint: string;
  deviceId?: string;
  ip?: string;
}

export interface AuthResult {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

export interface LoginResult extends AuthResult {
  refresh_token: string;
  user: { id: number; username: string; full_name: string; role: Role };
}

export interface RefreshResult extends AuthResult {
  refresh_token: string;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface AuthServiceConfig {
  refreshTtlSeconds: number;
}

type AuditSubject = { type: 'user' | 'service'; id: number | string; role?: Role | null };

export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly deviceRepo: DeviceRepository,
    private readonly refreshRepo: RefreshTokenRepository,
    private readonly serviceClientRepo: ServiceClientRepository,
    private readonly tokenService: TokenService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly config: AuthServiceConfig,
  ) {}

  private async deny(ctx: AuthAuditContext, reason: ReasonCode, status: number, message: string, subject?: AuditSubject): Promise<never> {
    await this.record(ctx, 'deny', reason, subject);
    throw new AccessDeniedError(reason, message, status);
  }

  private async record(ctx: AuthAuditContext, decision: 'allow' | 'deny', reason: ReasonCode, subject?: AuditSubject): Promise<void> {
    await this.audit.record({
      requestId: ctx.requestId,
      occurredAt: this.clock.now(),
      subjectType: subject ? subject.type : 'anonymous',
      subjectId: subject ? String(subject.id) : null,
      role: subject?.role ?? null,
      method: ctx.method,
      endpoint: ctx.endpoint,
      deviceId: ctx.deviceId ?? null,
      decision,
      reason,
      ip: ctx.ip ?? null,
    });
  }

  async login(username: string, password: string, ctx: AuthAuditContext): Promise<LoginResult> {
    const deviceId = ctx.deviceId;
    if (!deviceId) {
      return this.deny(ctx, Reason.DEVICE_HEADER_MISSING, 403, 'X-Device-ID header is required');
    }
    const user = await this.userRepo.findByUsername(username);
    let passwordOk: boolean;
    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      passwordOk = false;
    } else {
      passwordOk = await bcrypt.compare(password, user.passwordHash);
    }
    if (!user || !passwordOk) {
      return this.deny(ctx, Reason.INVALID_CREDENTIALS, 401, 'Invalid username or password');
    }
    if (!user.isActive) {
      return this.deny(ctx, Reason.USER_INACTIVE, 403, 'User is not active', this.subjectOf(user));
    }
    const deviceOk = await this.deviceRepo.isRegistered(user.id, deviceId);
    if (!deviceOk) {
      return this.deny(ctx, Reason.DEVICE_NOT_REGISTERED, 403, 'Device is not registered for this user', this.subjectOf(user));
    }

    const now = this.clock.now();
    const access = this.tokenService.signAccess(user.id, user.role);
    const refreshToken = await this.issueRefresh(user.id, deviceId, now);

    await this.record(ctx, 'allow', Reason.LOGIN_OK, this.subjectOf(user));
    return {
      access_token: access.token,
      token_type: 'Bearer',
      expires_in: access.expiresInSeconds,
      refresh_token: refreshToken,
      user: { id: user.id, username: user.username, full_name: user.fullName, role: user.role },
    };
  }

  async refresh(refreshTokenRaw: string, ctx: AuthAuditContext): Promise<RefreshResult> {
    const deviceId = ctx.deviceId;
    if (!deviceId) {
      return this.deny(ctx, Reason.DEVICE_HEADER_MISSING, 403, 'X-Device-ID header is required');
    }
    const hash = sha256Hex(refreshTokenRaw);
    const row = await this.refreshRepo.findByHash(hash);
    if (!row) {
      return this.deny(ctx, Reason.REFRESH_INVALID, 401, 'Refresh token is not valid');
    }
    const now = this.clock.now();
    if (row.revokedAt) {
      return this.deny(ctx, Reason.REFRESH_REVOKED, 401, 'Refresh token has been revoked');
    }
    if (row.expiresAt.getTime() <= now.getTime()) {
      return this.deny(ctx, Reason.REFRESH_EXPIRED, 401, 'Refresh token has expired');
    }
    if (row.deviceId !== deviceId) {
      return this.deny(ctx, Reason.DEVICE_NOT_REGISTERED, 403, 'Device does not match the token');
    }
    const user = await this.userRepo.findById(row.userId);
    if (!user || !user.isActive) {
      return this.deny(ctx, Reason.USER_INACTIVE, 403, 'User is not active');
    }
    const subject = this.subjectOf(user);
    const deviceOk = await this.deviceRepo.isRegistered(user.id, deviceId);
    if (!deviceOk) {
      return this.deny(ctx, Reason.DEVICE_NOT_REGISTERED, 403, 'Device is not registered for this user', subject);
    }

    // rotate: revoke old, issue new
    await this.refreshRepo.revoke(row.id, now);
    const refreshToken = await this.issueRefresh(user.id, deviceId, now);
    const access = this.tokenService.signAccess(user.id, user.role);
    await this.record(ctx, 'allow', Reason.REFRESH_OK, subject);
    return { access_token: access.token, token_type: 'Bearer', expires_in: access.expiresInSeconds, refresh_token: refreshToken };
  }

  async logout(refreshTokenRaw: string, ctx: AuthAuditContext): Promise<void> {
    const hash = sha256Hex(refreshTokenRaw);
    const row = await this.refreshRepo.findByHash(hash);
    if (!row) {
      return this.deny(ctx, Reason.REFRESH_INVALID, 401, 'Refresh token is not valid');
    }
    const now = this.clock.now();
    if (row.revokedAt) {
      return this.deny(ctx, Reason.REFRESH_REVOKED, 401, 'Refresh token has already been revoked');
    }
    if (row.expiresAt.getTime() <= now.getTime()) {
      return this.deny(ctx, Reason.REFRESH_EXPIRED, 401, 'Refresh token has expired');
    }
    await this.refreshRepo.revoke(row.id, now);
    const user = await this.userRepo.findById(row.userId);
    await this.record(ctx, 'allow', Reason.LOGOUT_OK, user ? this.subjectOf(user) : { type: 'user', id: row.userId, role: null });
  }

  async issueServiceToken(clientId: string, clientSecret: string, ctx: AuthAuditContext): Promise<AuthResult> {
    const client = await this.serviceClientRepo.findByClientId(clientId);
    let ok: boolean;
    if (!client || !client.isActive) {
      await bcrypt.compare(clientSecret, DUMMY_HASH);
      ok = false;
    } else {
      ok = await bcrypt.compare(clientSecret, client.secretHash);
    }
    if (!client || !ok) {
      return this.deny(ctx, Reason.CLIENT_INVALID, 401, 'Invalid service client credentials');
    }
    const subject: Subject = { type: 'service', id: client.clientId, role: 'service' };
    const token = this.tokenService.signService(client.clientId);
    await this.record(ctx, 'allow', Reason.SERVICE_TOKEN_ISSUED, subject);
    return { access_token: token.token, token_type: 'Bearer', expires_in: token.expiresInSeconds };
  }

  private subjectOf(user: UserRecord): Subject {
    return { type: 'user', id: user.id, role: user.role };
  }

  private async issueRefresh(userId: number, deviceId: string, now: Date): Promise<string> {
    const raw = generateOpaqueToken();
    const expiresAt = new Date(now.getTime() + this.config.refreshTtlSeconds * 1000);
    await this.refreshRepo.create(userId, deviceId, sha256Hex(raw), expiresAt);
    return raw;
  }
}
