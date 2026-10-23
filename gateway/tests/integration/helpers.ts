import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import mysql, { type Pool } from 'mysql2/promise';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../..');

export function readEnvFile(): Record<string, string> {
  const text = readFileSync(path.join(ROOT, '.env'), 'utf8');
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1] as string] = m[2] as string;
  }
  return out;
}

export const ENV = readEnvFile();
export const GW = 'http://localhost:3000';
export const NILAI = 'http://127.0.0.1:3001';
export const TRANSKRIP = 'http://127.0.0.1:3002';

export interface ApiResult {
  status: number;
  body: Record<string, unknown>;
  requestId: string;
  code: string;
}

export async function api(
  method: string,
  url: string,
  opts: { token?: string; device?: string; secret?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.device) headers['X-Device-ID'] = opts.device;
  if (opts.secret) headers['X-Gateway-Secret'] = opts.secret;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = (JSON.parse(text) ?? {}) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const err = body.error as Record<string, unknown> | undefined;
  return {
    status: res.status,
    body,
    requestId: res.headers.get('X-Request-ID') ?? '',
    code: err?.code ? String(err.code) : '',
  };
}

export function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) throw new Error('not a JWT');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}

export async function login(
  username: string,
  password: string,
  device: string,
): Promise<{ access_token: string; refresh_token: string }> {
  const r = await api('POST', `${GW}/auth/login`, {
    device,
    body: { username, password },
  });
  if (r.status !== 200) throw new Error(`login(${username}) failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body as unknown as { access_token: string; refresh_token: string };
}

export function sha256hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

let db: Pool | null = null;
export function rootDb(): Pool {
  if (!db) {
    db = mysql.createPool({
      host: '127.0.0.1',
      port: 3307,
      database: ENV.MYSQL_DATABASE ?? 'zerotrust',
      user: 'root',
      password: ENV.MYSQL_ROOT_PASSWORD ?? '',
    });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.end();
    db = null;
  }
}

export async function auditRows(requestId: string): Promise<Array<Record<string, unknown>>> {
  const [rows] = await rootDb().query('SELECT decision, reason, endpoint, subject_type, subject_id, device_id FROM audit_logs WHERE request_id = ?', [requestId]);
  return rows as Array<Record<string, unknown>>;
}

export interface AuditSamples {
  note(name: string, r: ApiResult): void;
  verifyAll(): Promise<void>;
}

/** Deny samples must have exactly one audit row whose reason equals error.code (T-AUD-01/02). */
export function createAuditCollector(): AuditSamples {
  const denys: Array<{ name: string; r: ApiResult }> = [];
  const allows: Array<{ name: string; r: ApiResult }> = [];
  return {
    note(name, r) {
      (r.code ? denys : allows).push({ name, r });
    },
    async verifyAll() {
      for (const { name, r } of denys) {
        const rows = await auditRows(r.requestId);
        if (rows.length !== 1) throw new Error(`${name}: expected 1 audit row, got ${rows.length}`);
        const row = rows[0] as { decision: string; reason: string };
        // Policy denials must mirror the response code (T-AUD-02). An `allow`
        // row with an error response means the failure happened in the service
        // after the PE allowed it (VALIDATION_ERROR, GRADES_INCOMPLETE, …).
        if (row.decision === 'deny' && row.reason !== r.code) {
          throw new Error(`${name}: audit deny/${row.reason} ≠ response ${r.code}`);
        }
      }
      for (const { name, r } of allows) {
        const rows = await auditRows(r.requestId);
        if (rows.length !== 1 || (rows[0] as { decision: string }).decision !== 'allow') {
          throw new Error(`${name}: expected exactly one allow audit row for request ${r.requestId}`);
        }
      }
    },
  };
}

export function composeExec(args: string[], envOverrides: Record<string, string> = {}): string {
  return execFileSync('docker', ['compose', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...envOverrides },
    maxBuffer: 64 * 1024 * 1024,
  });
}

export async function waitForGateway(timeoutMs = 60000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${GW}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error('gateway never became healthy');
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/** Recreates the gateway with a different access-hours window (TESTING §1). */
export async function recreateGatewayWithHours(start: string, end: string): Promise<void> {
  composeExec(['up', '-d', '--no-build', 'gateway'], {
    ACCESS_HOURS_START: start,
    ACCESS_HOURS_END: end,
  });
  await waitForGateway();
}
