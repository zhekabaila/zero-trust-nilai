import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../../config/env.js';
import type { Role } from '../policy/policy.types.js';

export interface AccessClaims {
  sub: string;
  role: Role;
  typ: 'access';
  iss: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface ServiceClaims {
  sub: string;
  role: 'service';
  typ: 'service';
  iss: string;
  iat: number;
  exp: number;
  jti: string;
}

export type TokenClaims = AccessClaims | ServiceClaims;

export type TokenVerifyResult =
  | { ok: true; claims: TokenClaims }
  | { ok: false; reason: 'TOKEN_INVALID' | 'TOKEN_EXPIRED' };

export class TokenService {
  private readonly privateKey: string;
  private readonly publicKey: string;
  private readonly issuer: string;

  constructor() {
    this.privateKey = readFileSync(env.JWT_PRIVATE_KEY_PATH, 'utf8');
    this.publicKey = readFileSync(env.JWT_PUBLIC_KEY_PATH, 'utf8');
    this.issuer = env.JWT_ISSUER;
  }

  signAccess(userId: number, role: Role): { token: string; expiresInSeconds: number } {
    const token = jwt.sign(
      { sub: String(userId), role, typ: 'access', jti: randomUUID() },
      this.privateKey,
      { algorithm: 'RS256', issuer: this.issuer, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS },
    );
    return { token, expiresInSeconds: env.ACCESS_TOKEN_TTL_SECONDS };
  }

  signService(clientId: string): { token: string; expiresInSeconds: number } {
    const token = jwt.sign(
      { sub: clientId, role: 'service', typ: 'service', jti: randomUUID() },
      this.privateKey,
      { algorithm: 'RS256', issuer: this.issuer, expiresIn: env.SERVICE_TOKEN_TTL_SECONDS },
    );
    return { token, expiresInSeconds: env.SERVICE_TOKEN_TTL_SECONDS };
  }

  verify(token: string): TokenVerifyResult {
    try {
      const decoded = jwt.verify(token, this.publicKey, {
        algorithms: ['RS256'],
        issuer: this.issuer,
      }) as JwtPayload;
      const typ = decoded.typ;
      if (typ !== 'access' && typ !== 'service') {
        return { ok: false, reason: 'TOKEN_INVALID' };
      }
      const claims = decoded as unknown as TokenClaims;
      if (typeof claims.sub !== 'string' || typeof claims.role !== 'string') {
        return { ok: false, reason: 'TOKEN_INVALID' };
      }
      return { ok: true, claims };
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        return { ok: false, reason: 'TOKEN_EXPIRED' };
      }
      return { ok: false, reason: 'TOKEN_INVALID' };
    }
  }
}
