import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import { Reason } from '../errors/reason-codes.js';
import { logger } from '../utils/logger.js';

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const isApp = err instanceof AppError;
  const statusCode = isApp ? err.statusCode : 500;
  const code = isApp ? err.code : Reason.INTERNAL_ERROR;
  const message = isApp ? err.message : 'Internal server error';

  if (!isApp) {
    logger.error({ err, requestId: req.requestId }, 'unhandled error');
  }

  if (res.headersSent) return;
  res.status(statusCode).json({ error: { code, message, requestId: req.requestId } });
};
