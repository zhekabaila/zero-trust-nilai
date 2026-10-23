import type { NextFunction, Request, Response } from 'express';
import { AccessDeniedError } from '../common/errors/access-denied.error.js';
import type { TokenService } from '../modules/auth/token.service.js';
import type { Role, Subject } from '../modules/policy/policy.types.js';

const VALID_ROLES: Role[] = ['mahasiswa', 'dosen', 'admin', 'service'];

function toSubject(sub: string, role: Role): Subject {
  if (role === 'service') return { type: 'service', id: sub, role: 'service' };
  const id = Number.parseInt(sub, 10);
  if (!Number.isInteger(id)) throw AccessDeniedError.tokenInvalid();
  return { type: 'user', id, role };
}

export function createAuthenticate(tokenService: TokenService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.locals.auditPending = true;
    const header = req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) {
      next(AccessDeniedError.tokenMissing());
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    const result = tokenService.verify(token);
    if (!result.ok) {
      next(result.reason === 'TOKEN_EXPIRED' ? AccessDeniedError.tokenExpired() : AccessDeniedError.tokenInvalid());
      return;
    }
    const { sub, role, typ } = result.claims;
    if (!VALID_ROLES.includes(role) || (typ === 'service' && role !== 'service')) {
      next(AccessDeniedError.tokenInvalid());
      return;
    }
    try {
      const subject = toSubject(sub, role);
      const deviceId = req.header('X-Device-ID') ?? undefined;
      req.auth = { subject, deviceId };
      next();
    } catch (err) {
      next(err);
    }
  };
}
