/** Stubs the minimal env that service-nilai modules read at import time. */
export function stubServiceNilaiEnv(): void {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    PORT: '3001',
    DB_HOST: 'test',
    DB_NAME: 'test',
    DB_USER: 'test',
    DB_PASSWORD: 'test',
    JWT_PUBLIC_KEY_PATH: '/dev/null',
    JWT_ISSUER: 'zt-gateway',
    GATEWAY_SECRET: 'x'.repeat(40),
    GATEWAY_URL: 'http://gateway.test',
    SERVICE_CLIENT_ID: 'service-nilai',
    SERVICE_CLIENT_SECRET: 'test-secret',
    LOG_LEVEL: 'silent',
  });
}
