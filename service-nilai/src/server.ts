import { createApp } from './app.js';
import { env } from './config/env.js';
import { pingDatabase } from './database/pool.js';
import { logger } from './common/utils/logger.js';

async function main(): Promise<void> {
  await pingDatabase();
  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'service-nilai listening');
  });
}

main().catch((err) => {
  logger.error({ err: (err as Error).message }, 'fatal startup error');
  process.exit(1);
});
