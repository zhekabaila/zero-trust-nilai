import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import { Reason } from '../errors/reason-codes.js';
import { buildAudit } from '../http/audit-context.js';
import { logger } from '../utils/logger.js';
import type { Clock } from '../utils/clock.js';
import type { AuditService } from '../../modules/audit/audit.service.js';

export function createErrorHandler(audit: AuditService, clock: Clock): ErrorRequestHandler {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const isApp = err instanceof AppError;
    const statusCode = isApp ? err.statusCode : 500;
    const code = isApp ? err.code : Reason.INTERNAL_ERROR;
    const message = isApp ? err.message : 'Internal server error';

    if (!isApp) {
      logger.error({ err, requestId: req.requestId }, 'unhandled error');
    } else {
      logger.warn({ code, statusCode, requestId: req.requestId, method: req.method, path: req.originalUrl }, 'request denied');
    }

    if (res.locals.auditPending === true) {
      res.locals.auditPending = false;
      const reason = (res.locals.auditReason as typeof code) ?? code;
      void audit.record(buildAudit(req, clock.now(), 'deny', reason));
    }

    if (res.headersSent) return;
    res.status(statusCode).json({
      error: { code, message, requestId: req.requestId },
    });
  };
}
