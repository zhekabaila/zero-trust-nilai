import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env } from '../../config/env.js';
import { AccessDeniedError } from '../errors/access-denied.error.js';

function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Rejects any request that did not come through the gateway. Compared in constant
 * time after hashing so equal-length prefixes leak nothing (SECURITY §3).
 */
export const verifyGatewaySecret: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const provided = req.header('X-Gateway-Secret');
  if (!provided || !constantTimeEqual(provided, env.GATEWAY_SECRET)) {
    next(AccessDeniedError.gatewaySecretInvalid());
    return;
  }
  next();
};
