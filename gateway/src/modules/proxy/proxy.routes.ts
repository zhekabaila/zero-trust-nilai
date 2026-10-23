import { Router, type RequestHandler } from 'express';

export interface ProxyRouterDeps {
  authenticate: RequestHandler;
  authorize: (ruleKey: string) => RequestHandler;
  nilaiProxy: RequestHandler;
  transkripProxy: RequestHandler;
}

export function createProxyRouter(deps: ProxyRouterDeps): Router {
  const { authenticate, authorize, nilaiProxy, transkripProxy } = deps;
  const router = Router();

  router.get('/nilai', authenticate, authorize('nilai.list'), nilaiProxy);
  router.put('/nilai/:id', authenticate, authorize('nilai.update'), nilaiProxy);
  router.post('/kelas/:id/finalisasi', authenticate, authorize('kelas.finalize'), nilaiProxy);
  router.get('/transkrip/:nim', authenticate, authorize('transkrip.get'), transkripProxy);
  router.post('/transkrip/sinkron', authenticate, authorize('transkrip.sync'), transkripProxy);

  return router;
}
