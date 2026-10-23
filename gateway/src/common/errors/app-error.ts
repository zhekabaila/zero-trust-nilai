import { Reason, type ReasonCode } from './reason-codes.js';

export interface AppErrorOptions {
  statusCode: number;
  code: ReasonCode;
  message: string;
  details?: unknown;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ReasonCode;
  readonly details?: unknown;
  readonly isOperational = true;

  constructor(opts: AppErrorOptions) {
    super(opts.message);
    this.name = 'AppError';
    this.statusCode = opts.statusCode;
    this.code = opts.code;
    this.details = opts.details;
    Error.captureStackTrace?.(this, AppError);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: unknown) {
    super({ statusCode: 400, code: Reason.VALIDATION_ERROR, message, details });
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super({ statusCode: 404, code: Reason.RESOURCE_NOT_FOUND, message });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(code: ReasonCode, message: string) {
    super({ statusCode: 409, code, message });
    this.name = 'ConflictError';
  }
}

export class UnprocessableError extends AppError {
  constructor(code: ReasonCode, message: string) {
    super({ statusCode: 422, code, message });
    this.name = 'UnprocessableError';
  }
}

export class BadGatewayError extends AppError {
  constructor(code: ReasonCode, message: string) {
    super({ statusCode: 502, code, message });
    this.name = 'BadGatewayError';
  }
}
