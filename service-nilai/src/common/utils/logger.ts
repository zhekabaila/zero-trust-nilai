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
      '*.access_token',
      '*.token',
      '*.secret',
      '*.client_secret',
    ],
    censor: '[redacted]',
  },
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});
