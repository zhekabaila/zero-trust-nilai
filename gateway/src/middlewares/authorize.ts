import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AccessDeniedError } from '../common/errors/access-denied.error.js';
import { Reason, type ReasonCode } from '../common/errors/reason-codes.js';
import { buildAudit } from '../common/http/audit-context.js';
import type { Clock } from '../common/utils/clock.js';
import type { AuditService } from '../modules/audit/audit.service.js';
import type { PolicyEngine } from '../modules/policy/policy.engine.js';
import type { PolicyContext } from '../modules/policy/policy.types.js';

function flatten(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string') out[k] = v;
    else if (Array.isArray(v) && typeof v[0] === 'string') out[k] = v[0];
  }
  return out;
}

export function createAuthorize(engine: PolicyEngine, audit: AuditService, clock: Clock) {
  return function authorize(ruleKey: string): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!req.auth) {
        next(AccessDeniedError.tokenMissing());
        return;
      }
      const ctx: PolicyContext = {
        subject: req.auth.subject,
        deviceId: req.auth.deviceId,
        method: req.method,
        path: req.path,
        params: flatten(req.params) as Record<string, string>,
        query: flatten(req.query) as Record<string, string>,
        now: clock.now(),
        requestId: req.requestId,
      };
      const decision = await engine.decide(ruleKey, ctx);
      if (decision.effect === 'deny') {
        res.locals.auditReason = decision.reason satisfies ReasonCode;
        next(new AccessDeniedError(decision.reason, `Access denied by policy: ${decision.reason}`, decision.status));
        return;
      }
      await audit.record(buildAudit(req, ctx.now, 'allow', decision.reason));
      res.locals.auditPending = false;
      next();
    };
  };
}

// Default deny: reached only after `authenticate` on unmatched protected paths.
export function routeNotRegistered(req: Request, res: Response, next: NextFunction): void {
  res.locals.auditReason = Reason.ROUTE_NOT_REGISTERED;
  next(new AccessDeniedError(Reason.ROUTE_NOT_REGISTERED, 'Route is not registered', 403));
}
