import express, { type Express, type RequestHandler } from 'express';
import { env } from './config/env.js';
import { pool, withTransaction } from './database/pool.js';
import { systemClock } from './common/utils/clock.js';
import { requestId } from './common/middlewares/request-id.js';
import { errorHandler } from './common/middlewares/error-handler.js';
import { verifyGatewaySecret } from './common/middlewares/verify-gateway-secret.js';
import { createVerifyToken } from './common/middlewares/verify-token.js';
import { createTokenVerifier } from './common/auth/token-verify.js';
import { logger } from './common/utils/logger.js';

import { NilaiRepository } from './modules/nilai/nilai.repository.js';
import { NilaiService } from './modules/nilai/nilai.service.js';
import { NilaiController } from './modules/nilai/nilai.controller.js';
import { createNilaiRouter } from './modules/nilai/nilai.routes.js';
import { KelasRepository } from './modules/kelas/kelas.repository.js';
import { KelasService } from './modules/kelas/kelas.service.js';
import { KelasController } from './modules/kelas/kelas.controller.js';
import { createKelasRouter } from './modules/kelas/kelas.routes.js';
import { GatewayClient } from './integrations/gateway.client.js';
import { ServiceTokenProvider } from './integrations/service-token.provider.js';
import { TranskripSyncClient } from './integrations/transkrip-sync.client.js';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);

  const clock = systemClock;
  const tokenVerifier = createTokenVerifier();
  const verifyToken: RequestHandler = createVerifyToken(tokenVerifier);

  app.get('/internal/health', verifyGatewaySecret, (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'service-nilai' });
  });

  const gatewayClient = new GatewayClient(env.GATEWAY_URL);
  const tokenProvider = new ServiceTokenProvider(gatewayClient, env.SERVICE_CLIENT_ID, env.SERVICE_CLIENT_SECRET, clock);
  const syncClient = new TranskripSyncClient(gatewayClient, tokenProvider);

  const nilaiService = new NilaiService(new NilaiRepository(pool));
  const kelasService = new KelasService(new KelasRepository(pool), syncClient, withTransaction, clock);

  app.use(createNilaiRouter({ verifyGatewaySecret, verifyToken, controller: new NilaiController(nilaiService) }));
  app.use(createKelasRouter({ verifyGatewaySecret, verifyToken, controller: new KelasController(kelasService) }));

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Resource not found', requestId: req.requestId } });
  });

  app.use(errorHandler);

  logger.info({ port: env.PORT }, 'service-nilai routes registered');
  return app;
}
