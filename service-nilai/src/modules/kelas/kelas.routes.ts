import { Router, type RequestHandler } from 'express';
import { requireRole } from '../../common/middlewares/require-role.js';
import type { KelasController } from './kelas.controller.js';

export interface KelasRouterDeps {
  verifyGatewaySecret: RequestHandler;
  verifyToken: RequestHandler;
  controller: KelasController;
}

export function createKelasRouter(deps: KelasRouterDeps): Router {
  const { verifyGatewaySecret, verifyToken, controller } = deps;
  const router = Router();

  router.post(
    '/kelas/:id/finalisasi',
    verifyGatewaySecret,
    verifyToken,
    requireRole('dosen'),
    controller.finalize,
  );

  return router;
}
