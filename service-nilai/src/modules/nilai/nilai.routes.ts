import { Router, json as jsonBody, type RequestHandler } from 'express';
import { validate } from '../../common/middlewares/validate.js';
import { requireRole } from '../../common/middlewares/require-role.js';
import { updateNilaiSchema } from './nilai.schema.js';
import type { NilaiController } from './nilai.controller.js';

export interface NilaiRouterDeps {
  verifyGatewaySecret: RequestHandler;
  verifyToken: RequestHandler;
  controller: NilaiController;
}

export function createNilaiRouter(deps: NilaiRouterDeps): Router {
  const { verifyGatewaySecret, verifyToken, controller } = deps;
  const router = Router();

  router.get(
    '/nilai',
    verifyGatewaySecret,
    verifyToken,
    requireRole('mahasiswa', 'dosen'),
    controller.list,
  );

  router.put(
    '/nilai/:id',
    verifyGatewaySecret,
    verifyToken,
    requireRole('dosen'),
    jsonBody({ limit: '32kb' }),
    validate(updateNilaiSchema, 'body'),
    controller.update,
  );

  return router;
}
