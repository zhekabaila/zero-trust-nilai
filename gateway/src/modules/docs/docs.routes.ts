import { readFileSync } from 'node:fs';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';

type OpenApiDoc = Record<string, unknown>;

const TAG_FILES = ['system.yaml', 'auth.yaml', 'nilai.yaml', 'kelas.yaml', 'transkrip.yaml', 'audit.yaml'];

function loadSpec(): OpenApiDoc {
  const dir = new URL('./openapi/', import.meta.url);
  const base = parse(readFileSync(new URL('base.yaml', dir), 'utf8')) as OpenApiDoc;
  const components = (base.components ?? {}) as Record<string, unknown>;
  const paths: Record<string, unknown> = {};
  for (const file of TAG_FILES) {
    const doc = parse(readFileSync(new URL(file, dir), 'utf8')) as { paths?: Record<string, unknown> };
    Object.assign(paths, doc.paths ?? {});
  }
  return { ...base, components, paths };
}

// Swagger UI is public only when SWAGGER_ENABLED (ARCHITECTURE §3). Mounted before
// the default-deny catch-all so /docs works without a token.
export function createDocsRouter(): Router {
  const router = Router();
  const spec = loadSpec();
  router.get('/openapi.json', (_req, res) => res.json(spec));
  router.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
  return router;
}
