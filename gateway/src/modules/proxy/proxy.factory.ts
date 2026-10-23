import { createProxyMiddleware, type Options } from 'http-proxy-middleware';
import type { Request, Response } from 'express';
import { logger } from '../../common/utils/logger.js';

export interface ServiceProxyOptions {
  target: string;
  gatewaySecret: string;
}

/**
 * Reverse proxy to an internal service. The client-supplied X-Gateway-Secret is
 * stripped and the real secret is attached (SECURITY §2 threat #2). Authorization,
 * X-Device-ID and X-Request-ID are forwarded untouched.
 */
export function createServiceProxy({ target, gatewaySecret }: ServiceProxyOptions) {
  const options: Options = {
    target,
    changeOrigin: false,
    ws: false,
    xfwd: false,
    logLevel: 'warn',
    onProxyReq(proxyReq, req: Request) {
      proxyReq.removeHeader('x-gateway-secret');
      proxyReq.setHeader('x-gateway-secret', gatewaySecret);
      proxyReq.setHeader('x-request-id', req.requestId);
    },
    onError(err, req: Request, res: Response) {
      logger.error({ err: (err as Error).message, target, requestId: req.requestId }, 'proxy error');
      if (!res.headersSent) {
        res.status(502).json({
          error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Upstream service unavailable', requestId: req.requestId },
        });
      }
    },
  };
  return createProxyMiddleware(options);
}
