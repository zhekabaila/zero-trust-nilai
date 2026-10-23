import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import type { AuthService, AuthAuditContext } from './auth.service.js';
import type { LoginBody, RefreshBody, LogoutBody, ServiceTokenBody } from './auth.schema.js';

function auditCtx(req: Request): AuthAuditContext {
  return {
    requestId: req.requestId,
    method: req.method,
    endpoint: req.originalUrl,
    deviceId: req.header('X-Device-ID') ?? undefined,
    ip: req.ip ?? undefined,
  };
}

export class AuthController {
  constructor(private readonly service: AuthService) {}

  login = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as LoginBody;
    const result = await this.service.login(body.username, body.password, auditCtx(req));
    res.status(200).json(result);
  });

  refresh = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as RefreshBody;
    const result = await this.service.refresh(body.refresh_token, auditCtx(req));
    res.status(200).json(result);
  });

  logout = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as LogoutBody;
    await this.service.logout(body.refresh_token, auditCtx(req));
    res.status(204).end();
  });

  serviceToken = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as ServiceTokenBody;
    const result = await this.service.issueServiceToken(body.client_id, body.client_secret, auditCtx(req));
    res.status(200).json(result);
  });
}
