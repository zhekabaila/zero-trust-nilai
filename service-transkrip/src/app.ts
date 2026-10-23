import express, { type Express, type RequestHandler } from 'express';
import { requestId } from './common/middlewares/request-id.js';
import { errorHandler } from './common/middlewares/error-handler.js';
import { verifyGatewaySecret } from './common/middlewares/verify-gateway-secret.js';
import { createVerifyToken } from './common/middlewares/verify-token.js';
import { createTokenVerifier } from './common/auth/token-verify.js';
import { pool } from './database/pool.js';
import { logger } from './common/utils/logger.js';
import { env } from './config/env.js';
import { TranskripRepository } from './modules/transkrip/transkrip.repository.js';
import { TranskripService } from './modules/transkrip/transkrip.service.js';
import { TranskripController } from './modules/transkrip/transkrip.controller.js';
import { createTranskripRouter } from './modules/transkrip/transkrip.routes.js';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);

  const tokenVerifier = createTokenVerifier();
  const verifyToken: RequestHandler = createVerifyToken(tokenVerifier);

  app.get('/internal/health', verifyGatewaySecret, (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'service-transkrip' });
  });

  const transkripService = new TranskripService(new TranskripRepository(pool));

  app.use(
    createTranskripRouter({
      verifyGatewaySecret,
      verifyToken,
      controller: new TranskripController(transkripService),
    }),
  );

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Resource not found', requestId: req.requestId } });
  });

  app.use(errorHandler);

  logger.info({ port: env.PORT }, 'service-transkrip routes registered');
  return app;
}
