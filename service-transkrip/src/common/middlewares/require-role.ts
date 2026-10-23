import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AccessDeniedError } from '../errors/access-denied.error.js';
import type { Role } from '../auth/subject.js';

export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(AccessDeniedError.tokenMissing());
      return;
    }
    if (!roles.includes(req.auth.subject.role)) {
      next(AccessDeniedError.roleNotAllowed());
      return;
    }
    next();
  };
}

/**
 * Coarse subject-kind guard, mirroring the Policy Engine's mismatch checks so a
 * token of the wrong kind is reported with the same reason code as the gateway.
 */
export function requireSubjectKind(kind: 'user' | 'service'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(AccessDeniedError.tokenMissing());
      return;
    }
    if (req.auth.subject.type !== kind) {
      next(
        kind === 'service'
          ? AccessDeniedError.userTokenOnServiceEndpoint()
          : AccessDeniedError.serviceTokenOnUserEndpoint(),
      );
      return;
    }
    next();
  };
}
