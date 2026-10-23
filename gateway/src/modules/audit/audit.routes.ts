import { Router, type RequestHandler } from 'express';
import { validate } from '../../common/middlewares/validate.js';
import { auditQuerySchema } from './audit.schema.js';
import type { AuditController } from './audit.controller.js';

export interface AuditRouterDeps {
  authenticate: RequestHandler;
  authorize: (ruleKey: string) => RequestHandler;
  controller: AuditController;
}

export function createAuditRouter(deps: AuditRouterDeps): Router {
  const { authenticate, authorize, controller } = deps;
  const router = Router();

  router.get('/audit', authenticate, authorize('audit.list'), validate(auditQuerySchema, 'query'), controller.list);

  return router;
}
