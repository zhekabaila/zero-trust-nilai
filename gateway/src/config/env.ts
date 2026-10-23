import { z } from 'zod';

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),

  JWT_PRIVATE_KEY_PATH: z.string().min(1),
  JWT_PUBLIC_KEY_PATH: z.string().min(1),
  JWT_ISSUER: z.string().min(1),

  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  SERVICE_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  GATEWAY_SECRET: z.string().min(32, 'GATEWAY_SECRET must be at least 32 chars'),

  SERVICE_NILAI_URL: z.string().url(),
  SERVICE_TRANSKRIP_URL: z.string().url(),

  ACCESS_HOURS_START: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'ACCESS_HOURS_START must be HH:MM')
    .default('07:00'),
  ACCESS_HOURS_END: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'ACCESS_HOURS_END must be HH:MM')
    .default('21:00'),
  ACCESS_HOURS_TZ: z.string().min(1).default('Asia/Jakarta'),

  SWAGGER_ENABLED: booleanish.default('true'),
  LOG_LEVEL: z.string().default('info'),
});

export interface Env {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  JWT_PRIVATE_KEY_PATH: string;
  JWT_PUBLIC_KEY_PATH: string;
  JWT_ISSUER: string;
  ACCESS_TOKEN_TTL_SECONDS: number;
  REFRESH_TOKEN_TTL_SECONDS: number;
  SERVICE_TOKEN_TTL_SECONDS: number;
  GATEWAY_SECRET: string;
  SERVICE_NILAI_URL: string;
  SERVICE_TRANSKRIP_URL: string;
  ACCESS_HOURS_START: string;
  ACCESS_HOURS_END: string;
  ACCESS_HOURS_TZ: string;
  SWAGGER_ENABLED: boolean;
  LOG_LEVEL: string;
}

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data as Env;
}

export const env: Env = loadEnv();
