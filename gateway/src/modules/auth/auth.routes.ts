import { Router, json as jsonBody } from 'express';
import { validate } from '../../common/middlewares/validate.js';
import type { AuthController } from './auth.controller.js';
import { loginSchema, refreshSchema, logoutSchema, serviceTokenSchema } from './auth.schema.js';

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();
  // D10: body parser is applied ONLY to /auth/*, never to proxied routes.
  router.use(jsonBody({ limit: '64kb' }));

  router.post('/login', validate(loginSchema, 'body'), controller.login);
  router.post('/refresh', validate(refreshSchema, 'body'), controller.refresh);
  router.post('/logout', validate(logoutSchema, 'body'), controller.logout);
  router.post('/service', validate(serviceTokenSchema, 'body'), controller.serviceToken);

  return router;
}
