import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('X-Request-ID');
  const id = incoming && /^[0-9a-f-]{36}$/i.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}
