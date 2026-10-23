import { pino } from 'pino';
import { env } from '../../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-gateway-secret"]',
      '*.authorization',
      '*["x-gateway-secret"]',
      '*.password',
      '*.refresh_token',
      '*.client_secret',
      '*.access_token',
      '*.token',
      '*.token_hash',
      '*.secret',
    ],
    censor: '[redacted]',
  },
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});
