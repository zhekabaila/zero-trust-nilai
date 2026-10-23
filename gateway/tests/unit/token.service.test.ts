import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';

type TokenServiceCtor = typeof import('../../src/modules/auth/token.service.js').TokenService;
let TokenService: TokenServiceCtor;
let privateKeyPath = '';

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zt-keys-'));
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  privateKeyPath = join(dir, 'private.pem');
  writeFileSync(privateKeyPath, keys.privateKey);
  writeFileSync(join(dir, 'public.pem'), keys.publicKey);

  Object.assign(process.env, {
    DB_HOST: 'test',
    DB_NAME: 'test',
    DB_USER: 'test',
    DB_PASSWORD: 'test',
    JWT_PRIVATE_KEY_PATH: privateKeyPath,
    JWT_PUBLIC_KEY_PATH: join(dir, 'public.pem'),
    JWT_ISSUER: 'zt-gateway',
    GATEWAY_SECRET: 'x'.repeat(40),
    SERVICE_NILAI_URL: 'http://nilai.test',
    SERVICE_TRANSKRIP_URL: 'http://transkrip.test',
  });
  ({ TokenService } = await import('../../src/modules/auth/token.service.js'));
});

describe('TokenService (RS256)', () => {
  it('signs an access token with sub/role/typ/iss/jti and 600s expiry (T-AUTH-01)', () => {
    const svc = new TokenService();
    const { token, expiresInSeconds } = svc.signAccess(4, 'mahasiswa');
    expect(expiresInSeconds).toBe(600);
    const res = svc.verify(token);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.claims.sub).toBe('4');
      expect(res.claims.role).toBe('mahasiswa');
      expect(res.claims.typ).toBe('access');
      expect(res.claims.iss).toBe('zt-gateway');
      expect(res.claims.exp - res.claims.iat).toBe(600);
    }
  });

  it('signs a service token with typ=service and 300s expiry (T-SVC-01)', () => {
    const svc = new TokenService();
    const { token } = svc.signService('service-nilai');
    const res = svc.verify(token);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.claims.typ).toBe('service');
      expect(res.claims.role).toBe('service');
      expect(res.claims.exp - res.claims.iat).toBe(300);
    }
  });

  it('rejects a tampered signature (T-AUTH-10)', () => {
    const svc = new TokenService();
    const { token } = svc.signAccess(4, 'mahasiswa');
    const broken = `${token.slice(0, -6)}AAAAAA`;
    expect(svc.verify(broken)).toEqual({ ok: false, reason: 'TOKEN_INVALID' });
  });

  it('rejects HS256 and alg:none tokens (T-AUTH-10)', () => {
    const svc = new TokenService();
    const payload = { sub: '4', role: 'mahasiswa', typ: 'access' };
    const hs = jwt.sign(payload, 'some-secret', { algorithm: 'HS256', issuer: 'zt-gateway' });
    expect(svc.verify(hs).ok).toBe(false);
    const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...payload, iss: 'zt-gateway', exp: Math.floor(Date.now() / 1000) + 60 })}.`;
    expect(svc.verify(none)).toEqual({ ok: false, reason: 'TOKEN_INVALID' });
  });

  it('rejects a foreign issuer', () => {
    const svc = new TokenService();
    const token = jwt.sign({ sub: '4', role: 'mahasiswa', typ: 'access' }, readPrivKey(), {
      algorithm: 'RS256',
      issuer: 'evil',
      expiresIn: 60,
    });
    expect(svc.verify(token)).toEqual({ ok: false, reason: 'TOKEN_INVALID' });
  });

  it('reports expired tokens distinctly from invalid ones (T-AUTH-08)', () => {
    const svc = new TokenService();
    const nowSec = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      { sub: '4', role: 'mahasiswa', typ: 'access', iss: 'zt-gateway', iat: nowSec - 700, exp: nowSec - 60 },
      readPrivKey(),
      { algorithm: 'RS256' },
    );
    expect(svc.verify(token)).toEqual({ ok: false, reason: 'TOKEN_EXPIRED' });
  });
});

function readPrivKey(): string {
  return readFileSync(privateKeyPath, 'utf8');
}
