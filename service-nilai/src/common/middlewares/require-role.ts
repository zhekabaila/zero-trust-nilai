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
