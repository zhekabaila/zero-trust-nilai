import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ValidationError } from '../errors/app-error.js';

type Source = 'body' | 'query' | 'params';

function overwrite(req: Request, source: Source, value: unknown): void {
  Object.defineProperty(req, source, { value, writable: true, configurable: true, enumerable: true });
}

export function validate(schema: ZodTypeAny, source: Source): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      overwrite(req, source, parsed);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
        next(new ValidationError('Request validation failed', issues));
        return;
      }
      next(err);
    }
  };
}
