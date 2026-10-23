import express, { type Express } from 'express';
import { env } from './config/env.js';
import { pool } from './database/pool.js';
import { systemClock, type Clock } from './common/utils/clock.js';
import { requestId } from './common/middlewares/request-id.js';
import { createErrorHandler } from './common/middlewares/error-handler.js';
import { createAuthenticate } from './middlewares/authenticate.js';
import { createAuthorize, routeNotRegistered } from './middlewares/authorize.js';

import { AuditRepository } from './modules/audit/audit.repository.js';
import { AuditService } from './modules/audit/audit.service.js';
import { AuditController } from './modules/audit/audit.controller.js';
import { createAuditRouter } from './modules/audit/audit.routes.js';
import { PolicyRepository } from './modules/policy/policy.repository.js';
import { PolicyEngine } from './modules/policy/policy.engine.js';
import { TokenService } from './modules/auth/token.service.js';
import { UserRepository } from './modules/auth/user.repository.js';
import { DeviceRepository } from './modules/auth/device.repository.js';
import { RefreshTokenRepository } from './modules/auth/refresh-token.repository.js';
import { ServiceClientRepository } from './modules/auth/service-client.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createServiceProxy } from './modules/proxy/proxy.factory.js';
import { createProxyRouter } from './modules/proxy/proxy.routes.js';
import { createDocsRouter } from './modules/docs/docs.routes.js';

export interface GatewayContainer {
  clock: Clock;
  audit: AuditService;
  authService: AuthService;
  engine: PolicyEngine;
  tokenService: TokenService;
}

function buildContainer(): GatewayContainer {
  const clock = systemClock;

  const audit = new AuditService(new AuditRepository(pool));
  const policyRepo = new PolicyRepository(pool);
  const engine = new PolicyEngine(
    policyRepo,
    { start: env.ACCESS_HOURS_START, end: env.ACCESS_HOURS_END, tz: env.ACCESS_HOURS_TZ },
    clock,
  );

  const tokenService = new TokenService();
  const authService = new AuthService(
    new UserRepository(pool),
    new DeviceRepository(pool),
    new RefreshTokenRepository(pool),
    new ServiceClientRepository(pool),
    tokenService,
    audit,
    clock,
    { refreshTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS },
  );

  return { clock, audit, authService, engine, tokenService };
}

export function createApp(container?: GatewayContainer): Express {
  const c = container ?? buildContainer();
  const app = express();
  app.disable('x-powered-by');

  app.use(requestId);

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  const authenticate = createAuthenticate(c.tokenService);
  const authorize = createAuthorize(c.engine, c.audit, c.clock);

  const authController = new AuthController(c.authService);
  app.use('/auth', createAuthRouter(authController));

  const auditController = new AuditController(c.audit);
  app.use(createAuditRouter({ authenticate, authorize, controller: auditController }));

  if (env.SWAGGER_ENABLED) {
    app.use(createDocsRouter());
  }

  const nilaiProxy = createServiceProxy({ target: env.SERVICE_NILAI_URL, gatewaySecret: env.GATEWAY_SECRET });
  const transkripProxy = createServiceProxy({ target: env.SERVICE_TRANSKRIP_URL, gatewaySecret: env.GATEWAY_SECRET });

  app.use(
    createProxyRouter({ authenticate, authorize, nilaiProxy, transkripProxy }),
  );

  // Default deny for anything not registered above.
  app.all('*', authenticate, routeNotRegistered);

  app.use(createErrorHandler(c.audit, c.clock));

  return app;
}

export { buildContainer };
