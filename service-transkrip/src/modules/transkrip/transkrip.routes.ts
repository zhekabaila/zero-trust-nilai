import { Router, json as jsonBody, type RequestHandler } from 'express';
import { validate } from '../../common/middlewares/validate.js';
import { requireRole, requireSubjectKind } from '../../common/middlewares/require-role.js';
import { nimParamsSchema, syncSchema } from './transkrip.schema.js';
import type { TranskripController } from './transkrip.controller.js';

export interface TranskripRouterDeps {
  verifyGatewaySecret: RequestHandler;
  verifyToken: RequestHandler;
  controller: TranskripController;
}

export function createTranskripRouter(deps: TranskripRouterDeps): Router {
  const { verifyGatewaySecret, verifyToken, controller } = deps;
  const router = Router();

  router.get(
    '/transkrip/:nim',
    verifyGatewaySecret,
    verifyToken,
    requireSubjectKind('user'),
    requireRole('mahasiswa', 'admin'),
    validate(nimParamsSchema, 'params'),
    controller.get,
  );

  router.post(
    '/transkrip/sinkron',
    verifyGatewaySecret,
    verifyToken,
    requireSubjectKind('service'),
    requireRole('service'),
    jsonBody({ limit: '256kb' }),
    validate(syncSchema, 'body'),
    controller.sync,
  );

  return router;
}
