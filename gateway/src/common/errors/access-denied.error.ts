import { AppError } from './app-error.js';
import { Reason, type ReasonCode } from './reason-codes.js';

export class AccessDeniedError extends AppError {
  constructor(code: ReasonCode, message: string, statusCode = 403) {
    super({ statusCode, code, message });
    this.name = 'AccessDeniedError';
  }

  static tokenMissing(): AccessDeniedError {
    return new AccessDeniedError(Reason.TOKEN_MISSING, 'Authorization bearer token is required', 401);
  }
  static tokenInvalid(): AccessDeniedError {
    return new AccessDeniedError(Reason.TOKEN_INVALID, 'Access token is invalid', 401);
  }
  static tokenExpired(): AccessDeniedError {
    return new AccessDeniedError(Reason.TOKEN_EXPIRED, 'Access token has expired', 401);
  }
}
