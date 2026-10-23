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
  static gatewaySecretInvalid(): AccessDeniedError {
    return new AccessDeniedError(Reason.GATEWAY_SECRET_INVALID, 'Missing or invalid gateway secret', 403);
  }
  static roleNotAllowed(): AccessDeniedError {
    return new AccessDeniedError(Reason.ROLE_NOT_ALLOWED, 'Role not allowed for this resource', 403);
  }
  static serviceTokenOnUserEndpoint(): AccessDeniedError {
    return new AccessDeniedError(Reason.SERVICE_TOKEN_ON_USER_ENDPOINT, 'Service token cannot access a user endpoint', 403);
  }
  static userTokenOnServiceEndpoint(): AccessDeniedError {
    return new AccessDeniedError(Reason.USER_TOKEN_ON_SERVICE_ENDPOINT, 'User token cannot access a service endpoint', 403);
  }
  static notOwnData(): AccessDeniedError {
    return new AccessDeniedError(Reason.NOT_OWN_DATA, 'You may only access your own data', 403);
  }
}
