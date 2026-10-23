import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2/promise';
import {
  ENV,
  GW,
  NILAI,
  TRANSKRIP,
  api,
  auditRows,
  closeDb,
  composeExec,
  createAuditCollector,
  decodeJwt,
  login,
  recreateGatewayWithHours,
  rootDb,
  sha256hex,
  waitForGateway,
} from './helpers.js';

const PWD = 'Password123!';
const audit = createAuditCollector();

let dosen01 = '';
let dosen01Refresh = '';
let dosen02 = '';
let mhs01 = '';
let mhs01Refresh = '';
let admin01 = '';
let serviceToken = '';

function signExpiredToken(privateKey: string): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { sub: '4', role: 'mahasiswa', typ: 'access', iss: 'zt-gateway', iat: nowSec - 700, exp: nowSec - 60 },
    privateKey,
    { algorithm: 'RS256' },
  );
}

async function gatewayPrivateKey(): Promise<string> {
  return composeExec(['exec', '-T', 'gateway', 'cat', '/run/keys/private/private.pem']);
}

beforeAll(async () => {
  await waitForGateway();
  // Deterministic window so the suite passes at any hour (TESTING §1 note).
  await recreateGatewayWithHours('00:00', '23:59');
  const l = await login('dosen01', PWD, 'DEV-DOSEN-01');
  dosen01 = l.access_token;
  dosen01Refresh = l.refresh_token;
  mhs01 = (await login('mhs01', PWD, 'DEV-MHS-01')).access_token;
  admin01 = (await login('admin01', PWD, 'DEV-ADMIN-01')).access_token;
});

afterAll(async () => {
  // Restore compose defaults and leave seed data tidy.
  await rootDb().query('DELETE FROM transkrip WHERE kelas_id = 999');
  composeExec(['up', '-d', '--no-build', '--force-recreate', 'gateway']);
  await waitForGateway();
  await closeDb();
});

describe('1. Auth & token (T-AUTH)', () => {
  it('T-AUTH-01 login returns 600s access token with sub/role/typ claims', () => {
    const claims = decodeJwt(dosen01);
    expect(claims.role).toBe('dosen');
    expect(claims.typ).toBe('access');
    expect(claims.iss).toBe('zt-gateway');
    expect((claims.exp as number) - (claims.iat as number)).toBe(600);
  });

  it('T-AUTH-02/03 wrong password and unknown user give identical 401', async () => {
    const a = await api('POST', `${GW}/auth/login`, { device: 'DEV-DOSEN-01', body: { username: 'dosen01', password: 'nope' } });
    const b = await api('POST', `${GW}/auth/login`, { device: 'DEV-DOSEN-01', body: { username: 'hantu', password: PWD } });
    expect([a.status, a.code]).toEqual([401, 'INVALID_CREDENTIALS']);
    expect([b.status, b.code]).toEqual([401, 'INVALID_CREDENTIALS']);
    expect((b.body.error as { message: string }).message).toBe((a.body.error as { message: string }).message);
    audit.note('T-AUTH-02', a);
  });

  it('T-AUTH-04 missing/unknown device → 403', async () => {
    const noDev = await api('POST', `${GW}/auth/login`, { body: { username: 'dosen01', password: PWD } });
    expect([noDev.status, noDev.code]).toEqual([403, 'DEVICE_HEADER_MISSING']);
    const badDev = await api('POST', `${GW}/auth/login`, { device: 'DEV-UNKNOWN-99', body: { username: 'dosen01', password: PWD } });
    expect([badDev.status, badDev.code]).toEqual([403, 'DEVICE_NOT_REGISTERED']);
    audit.note('T-AUTH-04a', noDev);
    audit.note('T-AUTH-04b', badDev);
  });

  it('T-AUTH-05/06 refresh rotates; old token is revoked and rejected', async () => {
    const r = await api('POST', `${GW}/auth/refresh`, { device: 'DEV-DOSEN-01', body: { refresh_token: dosen01Refresh } });
    expect([r.status, r.code]).toEqual([200, '']);
    const [rows] = await rootDb().query('SELECT revoked_at FROM refresh_tokens WHERE token_hash = ?', [sha256hex(dosen01Refresh)]);
    expect((rows as Array<{ revoked_at: Date | null }>)[0]?.revoked_at).not.toBeNull();
    const reused = await api('POST', `${GW}/auth/refresh`, { device: 'DEV-DOSEN-01', body: { refresh_token: dosen01Refresh } });
    expect([reused.status, reused.code]).toEqual([401, 'REFRESH_REVOKED']);
    audit.note('T-AUTH-06', reused);
    dosen01 = (r.body as { access_token: string }).access_token;
  });

  it('T-AUTH-11 refresh from a different device → 403 DEVICE_NOT_REGISTERED', async () => {
    const l = await login('mhs01', PWD, 'DEV-MHS-01');
    mhs01Refresh = l.refresh_token;
    const r = await api('POST', `${GW}/auth/refresh`, { device: 'DEV-MHS-02', body: { refresh_token: mhs01Refresh } });
    expect([r.status, r.code]).toEqual([403, 'DEVICE_NOT_REGISTERED']);
    audit.note('T-AUTH-11', r);
  });

  it('T-AUTH-07 expired refresh (DB backdating) → 401 REFRESH_EXPIRED', async () => {
    await rootDb().query('UPDATE refresh_tokens SET expires_at = DATE_SUB(NOW(), INTERVAL 60 SECOND) WHERE token_hash = ?', [sha256hex(mhs01Refresh)]);
    const r = await api('POST', `${GW}/auth/refresh`, { device: 'DEV-MHS-01', body: { refresh_token: mhs01Refresh } });
    expect([r.status, r.code]).toEqual([401, 'REFRESH_EXPIRED']);
    audit.note('T-AUTH-07', r);
  });

  it('T-AUTH-09 logout → 204, then refresh rejected', async () => {
    const l = await login('mhs01', PWD, 'DEV-MHS-01');
    const out = await api('POST', `${GW}/auth/logout`, { body: { refresh_token: l.refresh_token } });
    expect(out.status).toBe(204);
    const r = await api('POST', `${GW}/auth/refresh`, { device: 'DEV-MHS-01', body: { refresh_token: l.refresh_token } });
    expect([r.status, r.code]).toEqual([401, 'REFRESH_REVOKED']);
    audit.note('T-AUTH-09', r);
  });

  it('T-AUTH-08 expired access token → 401 TOKEN_EXPIRED', async () => {
    const expired = signExpiredToken(await gatewayPrivateKey());
    const r = await api('GET', `${GW}/nilai`, { token: expired, device: 'DEV-MHS-01' });
    expect([r.status, r.code]).toEqual([401, 'TOKEN_EXPIRED']);
    audit.note('T-AUTH-08', r);
  });

  it('T-AUTH-10 garbage token → 401 TOKEN_INVALID', async () => {
    const r = await api('GET', `${GW}/nilai`, { token: 'not.a.jwt', device: 'DEV-MHS-01' });
    expect([r.status, r.code]).toEqual([401, 'TOKEN_INVALID']);
  });
});

describe('2. Service token (T-SVC)', () => {
  it('T-SVC-01 issues 300s service token', async () => {
    const r = await api('POST', `${GW}/auth/service`, {
      body: { client_id: 'service-nilai', client_secret: ENV.SERVICE_NILAI_CLIENT_SECRET },
    });
    expect([r.status, r.code]).toEqual([200, '']);
    expect((r.body as { expires_in: number }).expires_in).toBe(300);
    serviceToken = (r.body as { access_token: string }).access_token;
    const claims = decodeJwt(serviceToken);
    expect([claims.role, claims.typ]).toEqual(['service', 'service']);
  });

  it('T-SVC-02/03 bad secret or unknown client → CLIENT_INVALID', async () => {
    const bad = await api('POST', `${GW}/auth/service`, { body: { client_id: 'service-nilai', client_secret: 'wrong' } });
    const unknown = await api('POST', `${GW}/auth/service`, { body: { client_id: 'nope', client_secret: 'x' } });
    expect([bad.status, bad.code]).toEqual([401, 'CLIENT_INVALID']);
    expect([unknown.status, unknown.code]).toEqual([401, 'CLIENT_INVALID']);
    audit.note('T-SVC-02', bad);
  });

  it('T-SVC-04 service token on user endpoint → SERVICE_TOKEN_ON_USER_ENDPOINT', async () => {
    const r = await api('GET', `${GW}/nilai`, { token: serviceToken });
    expect([r.status, r.code]).toEqual([403, 'SERVICE_TOKEN_ON_USER_ENDPOINT']);
    audit.note('T-SVC-04', r);
  });
});

describe('3. Gateway secret & re-verification (T-GW)', () => {
  it('T-GW-01/02 direct service access without secret → 403', async () => {
    const n = await api('GET', `${NILAI}/nilai`, { token: mhs01 });
    const t = await api('GET', `${TRANSKRIP}/transkrip/227006001`, { token: mhs01 });
    expect([n.status, n.code]).toEqual([403, 'GATEWAY_SECRET_INVALID']);
    expect([t.status, t.code]).toEqual([403, 'GATEWAY_SECRET_INVALID']);
  });

  it('T-GW-03 forged secret direct → 403; via gateway the client header is replaced', async () => {
    const direct = await api('GET', `${NILAI}/nilai`, { token: mhs01, secret: 'forged-secret-value' });
    expect(direct.status).toBe(403);
    const viaGw = await api('GET', `${GW}/nilai`, { token: mhs01, device: 'DEV-MHS-01', secret: 'forged-secret-value' });
    expect(viaGw.status).toBe(200);
  });

  it('T-GW-04 direct with real secret, no token → 401 TOKEN_MISSING', async () => {
    const r = await api('GET', `${NILAI}/nilai`, { secret: ENV.GATEWAY_SECRET });
    expect([r.status, r.code]).toEqual([401, 'TOKEN_MISSING']);
  });

  it('T-GW-05 real secret + expired/broken token → 401', async () => {
    const expired = signExpiredToken(await gatewayPrivateKey());
    const e = await api('GET', `${NILAI}/nilai`, { secret: ENV.GATEWAY_SECRET, token: expired });
    expect([e.status, e.code]).toEqual([401, 'TOKEN_EXPIRED']);
    const b = await api('GET', `${NILAI}/nilai`, { secret: ENV.GATEWAY_SECRET, token: 'a.b.c' });
    expect([b.status, b.code]).toEqual([401, 'TOKEN_INVALID']);
  });

  it('T-GW-06 unknown route with valid token → ROUTE_NOT_REGISTERED', async () => {
    const r = await api('GET', `${GW}/foo`, { token: mhs01, device: 'DEV-MHS-01' });
    expect([r.status, r.code]).toEqual([403, 'ROUTE_NOT_REGISTERED']);
    audit.note('T-GW-06', r);
  });

  it('T-GW-07 non-auth endpoint without token → 401 TOKEN_MISSING', async () => {
    const r = await api('GET', `${GW}/nilai`);
    expect([r.status, r.code]).toEqual([401, 'TOKEN_MISSING']);
    audit.note('T-GW-07', r);
  });
});

describe('4. Context rules (T-CTX)', () => {
  it('T-CTX-01/02/03 device header rules on proxied routes', async () => {
    const missing = await api('GET', `${GW}/nilai`, { token: mhs01 });
    expect([missing.status, missing.code]).toEqual([403, 'DEVICE_HEADER_MISSING']);
    const unknown = await api('GET', `${GW}/nilai`, { token: mhs01, device: 'DEV-NOPE' });
    expect([unknown.status, unknown.code]).toEqual([403, 'DEVICE_NOT_REGISTERED']);
    const foreign = await api('GET', `${GW}/nilai`, { token: mhs01, device: 'DEV-MHS-02' });
    expect([foreign.status, foreign.code]).toEqual([403, 'DEVICE_NOT_REGISTERED']);
    audit.note('T-CTX-01', missing);
    audit.note('T-CTX-03', foreign);
  });

  it('T-CTX-04 PUT inside hours → 200 (window set to all-day by beforeAll)', async () => {
    const r = await api('PUT', `${GW}/nilai/1`, { token: dosen01, device: 'DEV-DOSEN-01', body: { nilai_angka: 88 } });
    expect([r.status, r.code]).toEqual([200, '']);
    const g = (r.body as { data: { nilai_huruf: string; bobot: number } }).data;
    expect([g.nilai_huruf, g.bobot]).toEqual(['A', 4]);
    audit.note('T-CTX-04', r);
  });
});

describe('5. Nilai rules (T-NIL)', () => {
  it('T-NIL-01 mahasiswa sees only own two rows', async () => {
    const r = await api('GET', `${GW}/nilai`, { token: mhs01, device: 'DEV-MHS-01' });
    const rows = (r.body as { data: Array<{ nim: string }> }).data;
    expect(rows).toHaveLength(2);
    expect(rows.every((x) => x.nim === '227006001')).toBe(true);
    audit.note('T-NIL-01', r);
  });

  it('T-NIL-02 mahasiswa asks for another NIM → NOT_OWN_DATA', async () => {
    const r = await api('GET', `${GW}/nilai?nim=227006002`, { token: mhs01, device: 'DEV-MHS-01' });
    expect([r.status, r.code]).toEqual([403, 'NOT_OWN_DATA']);
    audit.note('T-NIL-02', r);
  });

  it('T-NIL-03/04 dosen sees class 1 (3 rows), denied for class 2', async () => {
    const all = await api('GET', `${GW}/nilai`, { token: dosen01, device: 'DEV-DOSEN-01' });
    const rows = (all.body as { data: Array<{ kelas_id: number }> }).data;
    expect(rows).toHaveLength(3);
    expect(rows.every((x) => x.kelas_id === 1)).toBe(true);
    const other = await api('GET', `${GW}/nilai?kelas_id=2`, { token: dosen01, device: 'DEV-DOSEN-01' });
    expect([other.status, other.code]).toEqual([403, 'NOT_CLASS_OWNER']);
    audit.note('T-NIL-04', other);
  });

  it('T-NIL-05 dosen edits foreign class grade → NOT_CLASS_OWNER', async () => {
    const r = await api('PUT', `${GW}/nilai/4`, { token: dosen01, device: 'DEV-DOSEN-01', body: { nilai_angka: 90 } });
    expect([r.status, r.code]).toEqual([403, 'NOT_CLASS_OWNER']);
    audit.note('T-NIL-05', r);
  });

  it('T-NIL-08 mahasiswa/admin forbidden where dosen required', async () => {
    const put = await api('PUT', `${GW}/nilai/1`, { token: mhs01, device: 'DEV-MHS-01', body: { nilai_angka: 50 } });
    expect([put.status, put.code]).toEqual([403, 'ROLE_NOT_ALLOWED']);
    const list = await api('GET', `${GW}/nilai`, { token: admin01, device: 'DEV-ADMIN-01' });
    expect([list.status, list.code]).toEqual([403, 'ROLE_NOT_ALLOWED']);
    audit.note('T-NIL-08', put);
  });

  it('T-NIL-10 out-of-range or non-numeric → 400 VALIDATION_ERROR', async () => {
    const high = await api('PUT', `${GW}/nilai/1`, { token: dosen01, device: 'DEV-DOSEN-01', body: { nilai_angka: 101 } });
    const str = await api('PUT', `${GW}/nilai/1`, { token: dosen01, device: 'DEV-DOSEN-01', body: { nilai_angka: 'abc' } });
    expect([high.status, high.code]).toEqual([400, 'VALIDATION_ERROR']);
    expect([str.status, str.code]).toEqual([400, 'VALIDATION_ERROR']);
    audit.note('T-NIL-10', high);
  });

  it('T-NIL-11 unknown grade id → 404', async () => {
    const r = await api('PUT', `${GW}/nilai/9999`, { token: dosen01, device: 'DEV-DOSEN-01', body: { nilai_angka: 80 } });
    expect([r.status, r.code]).toEqual([404, 'RESOURCE_NOT_FOUND']);
    audit.note('T-NIL-11', r);
  });
});

describe('6. Finalization & sync (T-KLS)', () => {
  it('T-KLS-02/06/07 wrong owner, wrong role, unknown class', async () => {
    const l2 = await login('dosen02', PWD, 'DEV-DOSEN-02');
    dosen02 = l2.access_token;
    const foreign = await api('POST', `${GW}/kelas/1/finalisasi`, { token: dosen02, device: 'DEV-DOSEN-02' });
    expect([foreign.status, foreign.code]).toEqual([403, 'NOT_CLASS_OWNER']);
    const mhs = await api('POST', `${GW}/kelas/1/finalisasi`, { token: mhs01, device: 'DEV-MHS-01' });
    expect([mhs.status, mhs.code]).toEqual([403, 'ROLE_NOT_ALLOWED']);
    const missing = await api('POST', `${GW}/kelas/9999/finalisasi`, { token: dosen01, device: 'DEV-DOSEN-01' });
    expect([missing.status, missing.code]).toEqual([404, 'RESOURCE_NOT_FOUND']);
    audit.note('T-KLS-02', foreign);
    audit.note('T-KLS-07', missing);
  });

  it('T-KLS-05a transkrip down → 502 SYNC_FAILED, sync_status=FAILED', async () => {
    composeExec(['stop', 'service-transkrip']);
    const r = await api('POST', `${GW}/kelas/1/finalisasi`, { token: dosen01, device: 'DEV-DOSEN-01' });
    expect([r.status, r.code]).toEqual([502, 'SYNC_FAILED']);
    const [rows] = await rootDb().query("SELECT sync_status FROM kelas WHERE id = 1");
    expect((rows as Array<{ sync_status: string }>)[0]?.sync_status).toBe('FAILED');
    audit.note('T-KLS-05a', r);
    composeExec(['start', 'service-transkrip']);
    await new Promise((res) => setTimeout(res, 8000));
  });

  it('T-KLS-05b retry after recovery → 200 SYNCED, transcript filled', async () => {
    const r = await api('POST', `${GW}/kelas/1/finalisasi`, { token: dosen01, device: 'DEV-DOSEN-01' });
    expect([r.status, r.code]).toEqual([200, '']);
    expect((r.body as { data: { sync_status: string } }).data.sync_status).toBe('SYNCED');
    const [rows] = await rootDb().query('SELECT COUNT(*) c FROM transkrip WHERE kelas_id = 1');
    expect((rows as Array<{ c: number }>)[0]?.c).toBe(3);
    audit.note('T-KLS-05b', r);
  });

  it('T-KLS-03 re-finalize → 409; T-NIL-07 update FINAL grade → 403', async () => {
    const again = await api('POST', `${GW}/kelas/1/finalisasi`, { token: dosen01, device: 'DEV-DOSEN-01' });
    expect([again.status, again.code]).toEqual([409, 'ALREADY_FINALIZED']);
    const upd = await api('PUT', `${GW}/nilai/1`, { token: dosen01, device: 'DEV-DOSEN-01', body: { nilai_angka: 50 } });
    expect([upd.status, upd.code]).toEqual([403, 'GRADE_ALREADY_FINAL']);
    audit.note('T-KLS-03', again);
    audit.note('T-NIL-07', upd);
  });

  it('T-NIL-09 direct service call is stopped by the SQL guard even with valid creds', async () => {
    const final = await api('PUT', `${NILAI}/nilai/1`, {
      secret: ENV.GATEWAY_SECRET,
      token: dosen01,
      body: { nilai_angka: 100 },
    });
    expect([final.status, final.code]).toEqual([403, 'GRADE_ALREADY_FINAL']);
    const foreign = await api('PUT', `${NILAI}/nilai/4`, {
      secret: ENV.GATEWAY_SECRET,
      token: dosen01,
      body: { nilai_angka: 100 },
    });
    expect([foreign.status, foreign.code]).toEqual([403, 'NOT_CLASS_OWNER']);
  });

  it('T-KLS-04 empty grade blocks finalization of class 2', async () => {
    await rootDb().query('UPDATE nilai SET nilai_angka = NULL, nilai_huruf = NULL, bobot = NULL WHERE id = 4');
    const r = await api('POST', `${GW}/kelas/2/finalisasi`, { token: dosen02, device: 'DEV-DOSEN-02' });
    expect([r.status, r.code]).toEqual([422, 'GRADES_INCOMPLETE']);
    audit.note('T-KLS-04', r);
    await rootDb().query("UPDATE nilai SET nilai_angka = 72, nilai_huruf = 'B', bobot = 3.0 WHERE id = 4");
    const ok = await api('POST', `${GW}/kelas/2/finalisasi`, { token: dosen02, device: 'DEV-DOSEN-02' });
    expect(ok.status).toBe(200);
  });
});

describe('7. Transcript (T-TRN)', () => {
  it('T-TRN-01 owner reads own transcript with IPK', async () => {
    const r = await api('GET', `${GW}/transkrip/227006001`, { token: mhs01, device: 'DEV-MHS-01' });
    expect(r.status).toBe(200);
    const d = (r.body as { data: { nim: string; items: unknown[]; total_sks: number; ipk: number } }).data;
    expect(d.nim).toBe('227006001');
    expect(d.items.length).toBeGreaterThanOrEqual(1);
    expect(d.ipk).toBeGreaterThan(0);
    audit.note('T-TRN-01', r);
  });

  it('T-TRN-02 admin reads any NIM', async () => {
    const r = await api('GET', `${GW}/transkrip/227006002`, { token: admin01, device: 'DEV-ADMIN-01' });
    expect(r.status).toBe(200);
    audit.note('T-TRN-02', r);
  });

  it('T-TRN-03/04/05 foreign NIM, dosen role, service token all denied', async () => {
    const foreign = await api('GET', `${GW}/transkrip/227006002`, { token: mhs01, device: 'DEV-MHS-01' });
    expect([foreign.status, foreign.code]).toEqual([403, 'NOT_OWN_DATA']);
    const dosen = await api('GET', `${GW}/transkrip/227006001`, { token: dosen01, device: 'DEV-DOSEN-01' });
    expect([dosen.status, dosen.code]).toEqual([403, 'ROLE_NOT_ALLOWED']);
    const svc = await api('GET', `${GW}/transkrip/227006001`, { token: serviceToken });
    expect([svc.status, svc.code]).toEqual([403, 'SERVICE_TOKEN_ON_USER_ENDPOINT']);
    audit.note('T-TRN-03', foreign);
    audit.note('T-TRN-04', dosen);
    audit.note('T-TRN-05', svc);
  });

  it('T-TRN-06 user token on sync endpoint denied', async () => {
    const payload = {
      kelas_id: 999, kode_mk: 'XX', nama_mk: 'X', sks: 3, semester: 'Ganjil',
      tahun_ajaran: '2026/2027', items: [{ nim: '227006001', nilai_angka: 85, nilai_huruf: 'A', bobot: 4 }],
    };
    const r = await api('POST', `${GW}/transkrip/sinkron`, { token: mhs01, device: 'DEV-MHS-01', body: payload });
    expect([r.status, r.code]).toEqual([403, 'USER_TOKEN_ON_SERVICE_ENDPOINT']);
    audit.note('T-TRN-06', r);
  });

  it('T-TRN-07 service sync twice → idempotent row count', async () => {
    const payload = {
      kelas_id: 999, kode_mk: 'KODE-999', nama_mk: 'Idempoten', sks: 3, semester: 'Ganjil',
      tahun_ajaran: '2026/2027', items: [
        { nim: '227006001', nilai_angka: 85, nilai_huruf: 'A', bobot: 4 },
        { nim: '227006002', nilai_angka: 70, nilai_huruf: 'B', bobot: 3 },
      ],
    };
    const first = await api('POST', `${GW}/transkrip/sinkron`, { token: serviceToken, body: payload });
    expect(first.status).toBe(200);
    const [before] = await rootDb().query('SELECT COUNT(*) c FROM transkrip WHERE kelas_id = 999');
    const second = await api('POST', `${GW}/transkrip/sinkron`, { token: serviceToken, body: payload });
    const [after] = await rootDb().query('SELECT COUNT(*) c FROM transkrip WHERE kelas_id = 999');
    expect(second.status).toBe(200);
    expect((after as Array<{ c: number }>)[0]?.c).toBe((before as Array<{ c: number }>)[0]?.c);
    expect((before as Array<{ c: number }>)[0]?.c).toBe(2);
    audit.note('T-TRN-07', first);
  });
});

describe('8. Outside access hours (T-CTX-05/06)', () => {
  it('T-CTX-05 PUT/finalize outside window → OUTSIDE_ACCESS_HOURS; GET still allowed', async () => {
    await recreateGatewayWithHours('00:00', '00:01');
    try {
      const put = await api('PUT', `${GW}/nilai/3`, { token: dosen01, device: 'DEV-DOSEN-01', body: { nilai_angka: 80 } });
      expect([put.status, put.code]).toEqual([403, 'OUTSIDE_ACCESS_HOURS']);
      const fin = await api('POST', `${GW}/kelas/1/finalisasi`, { token: dosen01, device: 'DEV-DOSEN-01' });
      expect([fin.status, fin.code]).toEqual([403, 'OUTSIDE_ACCESS_HOURS']);
      const list = await api('GET', `${GW}/nilai`, { token: mhs01, device: 'DEV-MHS-01' });
      expect(list.status).toBe(200);
      audit.note('T-CTX-05', put);
    } finally {
      await recreateGatewayWithHours('00:00', '23:59');
    }
  });
});

describe('9. Audit integrity (T-AUD, T-DB)', () => {
  it('T-AUD-01/02 every sampled request has exactly one audit row; deny reason = error.code', async () => {
    await audit.verifyAll();
  });

  it('T-AUD-03 no secrets in audit table or container logs', async () => {
    const [rows] = await rootDb().query(
      "SELECT COUNT(*) c FROM audit_logs WHERE endpoint LIKE '%Password123%' OR reason LIKE '%Password123%' OR subject_id LIKE '%Password123%'",
    );
    expect((rows as Array<{ c: number }>)[0]?.c).toBe(0);
    const logs = composeExec(['logs', '--no-color', 'gateway', 'service-nilai', 'service-transkrip']);
    expect(logs.includes('Password123!')).toBe(false);
    expect(logs.includes(dosen01Refresh.slice(0, 16))).toBe(false);
  });

  it('T-DB-01 zt_nilai cannot read users.password_hash', async () => {
    const conn = await mysql.createConnection({
      host: '127.0.0.1', port: 3307, database: ENV.MYSQL_DATABASE ?? 'zerotrust',
      user: 'zt_nilai', password: ENV.ZT_NILAI_DB_PASSWORD,
    });
    await expect(conn.query('SELECT password_hash FROM users LIMIT 1')).rejects.toMatchObject({
      code: 'ER_COLUMNACCESS_DENIED_ERROR',
    });
    await conn.end();
  });

  it('T-DB-02 zt_transkrip cannot touch users at all', async () => {
    const conn = await mysql.createConnection({
      host: '127.0.0.1', port: 3307, database: ENV.MYSQL_DATABASE ?? 'zerotrust',
      user: 'zt_transkrip', password: ENV.ZT_TRANSKRIP_DB_PASSWORD,
    });
    await expect(conn.query('SELECT * FROM users LIMIT 1')).rejects.toMatchObject({
      code: 'ER_TABLEACCESS_DENIED_ERROR',
    });
    await conn.end();
  });
});

describe('10. Audit trail endpoint (T-AUD-04..07, D18)', () => {
  interface TrailItem {
    id: number;
    request_id: string;
    occurred_at: string;
    subject_type: string;
    subject_id: string | null;
    role: string | null;
    method: string;
    endpoint: string;
    decision: 'allow' | 'deny';
    reason: string;
  }
  function items(r: { body: Record<string, unknown> }): TrailItem[] {
    const data = r.body.data as { items: TrailItem[] } | undefined;
    return data?.items ?? [];
  }

  it('T-AUD-04 admin GET /audit → 200, newest first, own row is first item', async () => {
    const r = await api('GET', `${GW}/audit?limit=10`, { token: admin01, device: 'DEV-ADMIN-01' });
    audit.note('T-AUD-04', r);
    expect(r.status).toBe(200);
    const list = items(r);
    expect(list.length).toBeGreaterThan(1);
    expect(list[0]?.endpoint).toMatch(/^\/audit/);
    expect(list[0]?.decision).toBe('allow');
    expect(list[0]?.reason).toBe('ADMIN_AUDIT_READ');
    const ids = list.map((i) => i.id);
    expect([...ids].sort((a, b) => b - a)).toEqual(ids);
  });

  it('T-AUD-05 dosen/mhs → ROLE_NOT_ALLOWED; admin without device → DEVICE_HEADER_MISSING', async () => {
    const d = await api('GET', `${GW}/audit`, { token: dosen01, device: 'DEV-DOSEN-01' });
    audit.note('T-AUD-05-dosen', d);
    expect([d.status, d.code]).toEqual([403, 'ROLE_NOT_ALLOWED']);
    const m = await api('GET', `${GW}/audit`, { token: mhs01, device: 'DEV-MHS-01' });
    audit.note('T-AUD-05-mhs', m);
    expect([m.status, m.code]).toEqual([403, 'ROLE_NOT_ALLOWED']);
    const noDev = await api('GET', `${GW}/audit`, { token: admin01 });
    audit.note('T-AUD-05-nodev', noDev);
    expect([noDev.status, noDev.code]).toEqual([403, 'DEVICE_HEADER_MISSING']);
  });

  it('T-AUD-06 service token → SERVICE_TOKEN_ON_USER_ENDPOINT', async () => {
    const r = await api('GET', `${GW}/audit`, { token: serviceToken });
    audit.note('T-AUD-06', r);
    expect([r.status, r.code]).toEqual([403, 'SERVICE_TOKEN_ON_USER_ENDPOINT']);
  });

  it('T-AUD-07 filters work; invalid limit/decision → 400 (audit row still allow)', async () => {
    const filtered = await api('GET', `${GW}/audit?decision=deny&subject_id=2&limit=5`, { token: admin01, device: 'DEV-ADMIN-01' });
    audit.note('T-AUD-07-filter', filtered);
    expect(filtered.status).toBe(200);
    const list = items(filtered);
    expect(list.length).toBeGreaterThan(0);
    for (const i of list) {
      expect(i.decision).toBe('deny');
      expect(i.subject_id).toBe('2');
    }
    expect(list.length).toBeLessThanOrEqual(5);

    const badLimit = await api('GET', `${GW}/audit?limit=0`, { token: admin01, device: 'DEV-ADMIN-01' });
    expect([badLimit.status, badLimit.code]).toEqual([400, 'VALIDATION_ERROR']);
    const badDecision = await api('GET', `${GW}/audit?decision=xxx`, { token: admin01, device: 'DEV-ADMIN-01' });
    expect([badDecision.status, badDecision.code]).toEqual([400, 'VALIDATION_ERROR']);
    for (const r of [badLimit, badDecision]) {
      const rows = await auditRows(r.requestId);
      expect(rows.length).toBe(1);
      expect((rows[0] as { decision: string }).decision).toBe('allow');
    }
  });

  it('audit trail exposes no secrets', async () => {
    const r = await api('GET', `${GW}/audit?limit=200`, { token: admin01, device: 'DEV-ADMIN-01' });
    const json = JSON.stringify(r.body);
    expect(json.includes('Password123!')).toBe(false);
    expect(json.includes(dosen01Refresh.slice(0, 16))).toBe(false);
  });
});
