import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AccessDeniedError } from '../errors/access-denied.error.js';
import type { TokenVerifier } from '../auth/token-verify.js';

export function createVerifyToken(verify: TokenVerifier): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header('Authorization');
    if (!header || !header.startsWith('Bearer ')) {
      next(AccessDeniedError.tokenMissing());
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    try {
      const subject = verify(token);
      req.auth = { subject };
      next();
    } catch (err) {
      next(err);
    }
  };
}
