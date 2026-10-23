import { describe, expect, it } from 'vitest';
import { PolicyEngine } from '../../src/modules/policy/policy.engine.js';
import type { PolicyRepository } from '../../src/modules/policy/policy.repository.js';
import type { PolicyContext, Subject } from '../../src/modules/policy/policy.types.js';
import { FixedClock } from '../../src/common/utils/clock.js';
import type { AccessHours } from '../../src/common/utils/access-hours.js';

const HOURS: AccessHours = { start: '07:00', end: '21:00', tz: 'Asia/Jakarta' };
/** 13:00 WIB — inside the window. */
const WITHIN = new Date('2026-01-01T06:00:00Z');
/** 22:00 WIB — outside the window. */
const OUTSIDE = new Date('2026-01-01T15:00:00Z');

interface RepoFakes {
  users?: Record<number, { role: string; isActive: boolean; nim: string | null }>;
  devices?: Array<[number, string]>;
  classOwners?: Record<number, number>;
  nilais?: Record<number, { status: 'DRAFT' | 'FINAL'; dosenId: number }>;
}

function fakeRepo(fakes: RepoFakes): PolicyRepository {
  return {
    async getUserAttributes(id: number) {
      const u = fakes.users?.[id];
      if (!u) return null;
      return { id, role: u.role as never, isActive: u.isActive, nim: u.nim };
    },
    async isDeviceRegistered(userId: number, deviceId: string) {
      return (fakes.devices ?? []).some(([u, d]) => u === userId && d === deviceId);
    },
    async getClassOwner(kelasId: number) {
      return fakes.classOwners?.[kelasId] ?? null;
    },
    async getNilaiForPolicy(nilaiId: number) {
      return fakes.nilais?.[nilaiId] ?? null;
    },
  } as unknown as PolicyRepository;
}

const USERS = {
  4: { role: 'mahasiswa', isActive: true, nim: '227006001' },
  5: { role: 'mahasiswa', isActive: true, nim: '227006002' },
  2: { role: 'dosen', isActive: true, nim: null },
  3: { role: 'dosen', isActive: true, nim: null },
  1: { role: 'admin', isActive: true, nim: null },
  9: { role: 'mahasiswa', isActive: false, nim: null },
};
const FAKES: RepoFakes = {
  users: USERS,
  devices: [[4, 'DEV-MHS-01'], [2, 'DEV-DOSEN-01'], [3, 'DEV-DOSEN-02'], [1, 'DEV-ADMIN-01']],
  classOwners: { 1: 2, 2: 3 },
  nilais: {
    1: { status: 'DRAFT', dosenId: 2 },
    4: { status: 'DRAFT', dosenId: 3 },
    2: { status: 'FINAL', dosenId: 2 },
  },
};

function user(role: string, id: number): Subject {
  return { type: 'user', id, role } as Subject;
}

function ctx(partial: Partial<PolicyContext> & { subject: Subject }): PolicyContext {
  return {
    deviceId: 'DEV-MHS-01',
    method: 'GET',
    path: '/x',
    params: {},
    query: {},
    now: WITHIN,
    requestId: 'req-1',
    ...partial,
  };
}

function engineAt(now: Date, fakes: RepoFakes = FAKES): PolicyEngine {
  return new PolicyEngine(fakeRepo(fakes), HOURS, new FixedClock(now));
}

describe('PolicyEngine.decide — deny order & Table 3', () => {
  it('rejects unregistered rule keys (default deny, T-GW-06)', async () => {
    const d = await engineAt(WITHIN).decide('whatever.missing', ctx({ subject: user('admin', 1) }));
    expect(d).toEqual({ effect: 'deny', reason: 'ROUTE_NOT_REGISTERED', status: 403 });
  });

  it('service token on user endpoint (T-SVC-04)', async () => {
    const d = await engineAt(WITHIN).decide(
      'nilai.list',
      ctx({ subject: { type: 'service', id: 'service-nilai', role: 'service' } }),
    );
    expect(d.reason).toBe('SERVICE_TOKEN_ON_USER_ENDPOINT');
  });

  it('user token on service-sync endpoint (T-TRN-06)', async () => {
    const d = await engineAt(WITHIN).decide('transkrip.sync', ctx({ subject: user('admin', 1) }));
    expect(d.reason).toBe('USER_TOKEN_ON_SERVICE_ENDPOINT');
  });

  it('user without X-Device-ID (T-CTX-01)', async () => {
    const d = await engineAt(WITHIN).decide(
      'nilai.list',
      ctx({ subject: user('mahasiswa', 4), deviceId: undefined }),
    );
    expect(d.reason).toBe('DEVICE_HEADER_MISSING');
  });

  it('device of another user (T-CTX-03)', async () => {
    const d = await engineAt(WITHIN).decide(
      'nilai.list',
      ctx({ subject: user('mahasiswa', 4), deviceId: 'DEV-MHS-02' }),
    );
    expect(d.reason).toBe('DEVICE_NOT_REGISTERED');
  });

  it('inactive user (USER_INACTIVE)', async () => {
    const d = await engineAt(WITHIN).decide(
      'nilai.list',
      ctx({ subject: user('mahasiswa', 9), deviceId: 'DEV-X' }),
    );
    expect(d.reason).toBe('USER_INACTIVE');
  });

  it('admin on nilai.list → ROLE_NOT_ALLOWED (T-NIL-08)', async () => {
    const d = await engineAt(WITHIN).decide(
      'nilai.list',
      ctx({ subject: user('admin', 1), deviceId: 'DEV-ADMIN-01' }),
    );
    expect(d.reason).toBe('ROLE_NOT_ALLOWED');
  });

  it('mahasiswa nilai.list without nim query → OWN_DATA', async () => {
    const d = await engineAt(WITHIN).decide('nilai.list', ctx({ subject: user('mahasiswa', 4) }));
    expect(d).toEqual({ effect: 'allow', reason: 'OWN_DATA', status: 200 });
  });

  it('mahasiswa nilai.list?nim=other → NOT_OWN_DATA (T-NIL-02)', async () => {
    const d = await engineAt(WITHIN).decide(
      'nilai.list',
      ctx({ subject: user('mahasiswa', 4), query: { nim: '227006002' } }),
    );
    expect(d.reason).toBe('NOT_OWN_DATA');
  });

  it('dosen nilai.list?kelas_id owned → CLASS_OWNER; foreign → NOT_CLASS_OWNER (T-NIL-03/04)', async () => {
    const e = engineAt(WITHIN);
    const own = await e.decide(
      'nilai.list',
      ctx({ subject: user('dosen', 2), deviceId: 'DEV-DOSEN-01', query: { kelas_id: '1' } }),
    );
    expect(own.reason).toBe('CLASS_OWNER');
    const foreign = await e.decide(
      'nilai.list',
      ctx({ subject: user('dosen', 2), deviceId: 'DEV-DOSEN-01', query: { kelas_id: '2' } }),
    );
    expect(foreign.reason).toBe('NOT_CLASS_OWNER');
  });

  it('dosen nilai.update own DRAFT → CLASS_OWNER (T-NIL-06/CTX-04)', async () => {
    const d = await engineAt(WITHIN).decide(
      'nilai.update',
      ctx({ subject: user('dosen', 2), deviceId: 'DEV-DOSEN-01', method: 'PUT', params: { id: '1' } }),
    );
    expect(d.reason).toBe('CLASS_OWNER');
  });

  it('dosen nilai.update foreign class → NOT_CLASS_OWNER (T-NIL-05)', async () => {
    const d = await engineAt(WITHIN).decide(
      'nilai.update',
      ctx({ subject: user('dosen', 2), deviceId: 'DEV-DOSEN-01', method: 'PUT', params: { id: '4' } }),
    );
    expect(d.reason).toBe('NOT_CLASS_OWNER');
  });

  it('dosen nilai.update FINAL grade → GRADE_ALREADY_FINAL (T-NIL-07)', async () => {
    const d = await engineAt(WITHIN).decide(
      'nilai.update',
      ctx({ subject: user('dosen', 2), deviceId: 'DEV-DOSEN-01', method: 'PUT', params: { id: '2' } }),
    );
    expect(d.reason).toBe('GRADE_ALREADY_FINAL');
  });

  it('dosen nilai.update unknown id → RESOURCE_NOT_FOUND 404 (T-NIL-11)', async () => {
    const d = await engineAt(WITHIN).decide(
      'nilai.update',
      ctx({ subject: user('dosen', 2), deviceId: 'DEV-DOSEN-01', method: 'PUT', params: { id: '9999' } }),
    );
    expect(d).toEqual({ effect: 'deny', reason: 'RESOURCE_NOT_FOUND', status: 404 });
  });

  it('nilai.update outside access hours (T-CTX-05)', async () => {
    const d = await engineAt(OUTSIDE).decide(
      'nilai.update',
      ctx({ subject: user('dosen', 2), deviceId: 'DEV-DOSEN-01', method: 'PUT', params: { id: '1' }, now: OUTSIDE }),
    );
    expect(d.reason).toBe('OUTSIDE_ACCESS_HOURS');
  });

  it('nilai.list outside hours still allowed (T-CTX-06)', async () => {
    const d = await engineAt(OUTSIDE).decide(
      'nilai.list',
      ctx({ subject: user('mahasiswa', 4), now: OUTSIDE }),
    );
    expect(d.reason).toBe('OWN_DATA');
  });

  it('kelas.finalize: owner allow, foreign deny, unknown 404, outside hours (T-KLS-01/02/07)', async () => {
    const e = engineAt(WITHIN);
    const base = { subject: user('dosen', 2), deviceId: 'DEV-DOSEN-01', method: 'POST' };
    expect((await e.decide('kelas.finalize', ctx({ ...base, params: { id: '1' } }))).reason).toBe('CLASS_OWNER');
    const foreign = await e.decide(
      'kelas.finalize',
      ctx({ subject: user('dosen', 3), deviceId: 'DEV-DOSEN-02', method: 'POST', params: { id: '1' } }),
    );
    expect(foreign.reason).toBe('NOT_CLASS_OWNER');
    expect((await e.decide('kelas.finalize', ctx({ ...base, params: { id: '9999' } }))).status).toBe(404);
    const late = await e.decide(
      'kelas.finalize',
      ctx({ subject: user('dosen', 2), deviceId: 'DEV-DOSEN-01', method: 'POST', params: { id: '1' }, now: OUTSIDE }),
    );
    expect(late.reason).toBe('OUTSIDE_ACCESS_HOURS');
  });

  it('transkrip.get: admin all, mahasiswa own/other, dosen role-denied (T-TRN-01..04)', async () => {
    const e = engineAt(WITHIN);
    expect(
      (await e.decide('transkrip.get', ctx({ subject: user('admin', 1), deviceId: 'DEV-ADMIN-01', params: { nim: '227006002' } }))).reason,
    ).toBe('ADMIN_ALL');
    expect(
      (await e.decide('transkrip.get', ctx({ subject: user('mahasiswa', 4), params: { nim: '227006001' } }))).reason,
    ).toBe('OWN_DATA');
    expect(
      (await e.decide('transkrip.get', ctx({ subject: user('mahasiswa', 4), params: { nim: '227006002' } }))).reason,
    ).toBe('NOT_OWN_DATA');
    expect(
      (await e.decide('transkrip.get', ctx({ subject: user('dosen', 2), deviceId: 'DEV-DOSEN-01', params: { nim: '227006001' } }))).reason,
    ).toBe('ROLE_NOT_ALLOWED');
  });

  it('transkrip.sync: service-nilai allow, other service deny', async () => {
    const e = engineAt(WITHIN);
    const ok = await e.decide(
      'transkrip.sync',
      ctx({ subject: { type: 'service', id: 'service-nilai', role: 'service' }, deviceId: undefined, method: 'POST' }),
    );
    expect(ok.reason).toBe('SERVICE_TOKEN');
    const bad = await e.decide(
      'transkrip.sync',
      ctx({ subject: { type: 'service', id: 'service-other', role: 'service' }, deviceId: undefined, method: 'POST' }),
    );
    expect(bad.reason).toBe('SERVICE_NOT_ALLOWED');
  });
});

describe('PolicyEngine.decide — audit.list (GET /audit, D18)', () => {
  const admin = () =>
    ctx({ subject: user('admin', 1), deviceId: 'DEV-ADMIN-01', path: '/audit', method: 'GET' });

  it('admin within & outside hours → allow ADMIN_AUDIT_READ (no access-hours constraint)', async () => {
    const e = engineAt(WITHIN);
    expect(await e.decide('audit.list', admin())).toEqual({ effect: 'allow', reason: 'ADMIN_AUDIT_READ', status: 200 });
    const late = await engineAt(OUTSIDE).decide('audit.list', admin());
    expect(late.reason).toBe('ADMIN_AUDIT_READ');
  });

  it('dosen & mahasiswa → ROLE_NOT_ALLOWED (T-AUD-05)', async () => {
    const e = engineAt(WITHIN);
    const dosen = await e.decide('audit.list', ctx({ subject: user('dosen', 2), deviceId: 'DEV-DOSEN-01', path: '/audit' }));
    expect(dosen.reason).toBe('ROLE_NOT_ALLOWED');
    const mhs = await e.decide('audit.list', ctx({ subject: user('mahasiswa', 4), path: '/audit' }));
    expect(mhs.reason).toBe('ROLE_NOT_ALLOWED');
  });

  it('service token → SERVICE_TOKEN_ON_USER_ENDPOINT (T-AUD-06)', async () => {
    const d = await engineAt(WITHIN).decide(
      'audit.list',
      ctx({ subject: { type: 'service', id: 'service-nilai', role: 'service' }, deviceId: undefined, path: '/audit' }),
    );
    expect(d.reason).toBe('SERVICE_TOKEN_ON_USER_ENDPOINT');
  });

  it('admin without X-Device-ID → DEVICE_HEADER_MISSING (T-AUD-05)', async () => {
    const d = await engineAt(WITHIN).decide(
      'audit.list',
      ctx({ subject: user('admin', 1), deviceId: undefined, path: '/audit' }),
    );
    expect(d.reason).toBe('DEVICE_HEADER_MISSING');
  });
});
