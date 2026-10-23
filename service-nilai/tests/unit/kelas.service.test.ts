import { beforeAll, describe, expect, it } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';
import { stubServiceNilaiEnv } from './stub-env.js';
import type { KelasForUpdate, FinalizableNilai } from '../../src/modules/kelas/kelas.repository.js';
import type { SyncPayload } from '../../src/integrations/transkrip-sync.client.js';

stubServiceNilaiEnv();

type KelasServiceCtor = typeof import('../../src/modules/kelas/kelas.service.js').KelasService;
let KelasService: KelasServiceCtor;
let AppErrors: typeof import('../../src/common/errors/app-error.js');
let AccessDenied: typeof import('../../src/common/errors/access-denied.error.js').AccessDeniedError;

beforeAll(async () => {
  ({ KelasService } = await import('../../src/modules/kelas/kelas.service.js'));
  AppErrors = await import('../../src/common/errors/app-error.js');
  AccessDenied = (await import('../../src/common/errors/access-denied.error.js')).AccessDeniedError;
});

function kelas(overrides: Partial<KelasForUpdate> = {}): KelasForUpdate {
  return {
    id: 1,
    mataKuliahId: 1,
    dosenId: 2,
    namaKelas: 'A',
    semester: 'Ganjil',
    tahunAjaran: '2026/2027',
    finalizedAt: null,
    syncStatus: 'NONE',
    kodeMk: 'KP70065004',
    namaMk: 'Keamanan Informasi',
    sks: 3,
    ...overrides,
  };
}

const filled: FinalizableNilai[] = [
  { id: 1, nim: '227006001', nilaiAngka: 88, nilaiHuruf: 'A', bobot: 4 },
  { id: 2, nim: '227006002', nilaiAngka: 78, nilaiHuruf: 'B+', bobot: 3.3 },
];

function harness(opts: {
  kelasRow?: KelasForUpdate | null;
  nilai?: FinalizableNilai[];
  syncFails?: boolean;
}): { service: InstanceType<KelasServiceCtor>; calls: string[]; syncPayloads: SyncPayload[]; syncStatuses: string[] } {
  const calls: string[] = [];
  const syncPayloads: SyncPayload[] = [];
  const syncStatuses: string[] = [];
  const repo = {
    async getForUpdate() {
      calls.push('getForUpdate');
      return opts.kelasRow === undefined ? kelas() : opts.kelasRow;
    },
    async listFinalizableNilai() {
      return opts.nilai ?? filled;
    },
    async markDraftsFinal() {
      calls.push('markDraftsFinal');
    },
    async setFinalized() {
      calls.push('setFinalized');
    },
    async setSyncStatus(_id: number, status: string) {
      syncStatuses.push(status);
    },
  };
  const syncClient = {
    async sync(payload: SyncPayload) {
      calls.push('sync');
      syncPayloads.push(payload);
      if (opts.syncFails) throw new Error('transkrip sync failed with status 503');
    },
  };
  const transact = <T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> => fn({} as PoolConnection);
  const clock = { now: () => new Date('2026-01-01T06:00:00Z') };
  const service = new KelasService(
    repo as never,
    syncClient as never,
    transact as never,
    clock as never,
  );
  return { service, calls, syncPayloads, syncStatuses };
}

describe('KelasService.finalize — transaction + sync_status (D12, T-KLS-*)', () => {
  it('class not found → 404', async () => {
    const { service } = harness({ kelasRow: null });
    await expect(service.finalize(2, 9999)).rejects.toBeInstanceOf(AppErrors.NotFoundError);
  });

  it('foreign dosen → NOT_CLASS_OWNER (T-KLS-02)', async () => {
    const { service } = harness({});
    const err = await service.finalize(3, 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AccessDenied);
    expect((err as InstanceType<typeof AccessDenied>).code).toBe('NOT_CLASS_OWNER');
  });

  it('already finalized + SYNCED → ALREADY_FINALIZED (T-KLS-03)', async () => {
    const { service, calls } = harness({ kelasRow: kelas({ finalizedAt: new Date(), syncStatus: 'SYNCED' }) });
    const err = await service.finalize(2, 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppErrors.ConflictError);
    expect((err as InstanceType<typeof AppErrors.ConflictError>).code).toBe('ALREADY_FINALIZED');
    expect(calls).toEqual(['getForUpdate']);
  });

  it('empty grade → GRADES_INCOMPLETE, no writes (T-KLS-04)', async () => {
    const { service, calls } = harness({ nilai: [{ id: 1, nim: '227006001', nilaiAngka: null, nilaiHuruf: null, bobot: null }] });
    const err = await service.finalize(2, 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppErrors.UnprocessableError);
    expect((err as InstanceType<typeof AppErrors.UnprocessableError>).code).toBe('GRADES_INCOMPLETE');
    expect(calls).toEqual(['getForUpdate']);
  });

  it('fresh finalize → SYNCED with full payload (T-KLS-01)', async () => {
    const { service, calls, syncPayloads, syncStatuses } = harness({});
    const out = await service.finalize(2, 1);
    expect(out).toEqual({
      kelas_id: 1,
      finalized_at: '2026-01-01T06:00:00.000Z',
      jumlah_nilai: 2,
      sync_status: 'SYNCED',
    });
    expect(calls).toEqual(['getForUpdate', 'markDraftsFinal', 'setFinalized', 'sync']);
    expect(syncStatuses).toEqual(['PENDING', 'SYNCED']);
    expect(syncPayloads[0]?.items).toHaveLength(2);
    expect(syncPayloads[0]?.kode_mk).toBe('KP70065004');
  });

  it('sync failure → SYNC_FAILED + sync_status=FAILED (T-KLS-05a)', async () => {
    const { service, syncStatuses } = harness({ syncFails: true });
    const err = await service.finalize(2, 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppErrors.BadGatewayError);
    expect((err as InstanceType<typeof AppErrors.BadGatewayError>).code).toBe('SYNC_FAILED');
    expect(syncStatuses).toEqual(['PENDING', 'FAILED']);
  });

  it('retry after FAILED re-syncs WITHOUT re-finalising (T-KLS-05b)', async () => {
    const { service, calls, syncStatuses } = harness({
      kelasRow: kelas({ finalizedAt: new Date('2026-01-01T05:00:00Z'), syncStatus: 'FAILED' }),
    });
    const out = await service.finalize(2, 1);
    expect(out.sync_status).toBe('SYNCED');
    expect(out.finalized_at).toBe('2026-01-01T05:00:00.000Z');
    expect(calls).toEqual(['getForUpdate', 'sync']);
    expect(syncStatuses).toEqual(['PENDING', 'SYNCED']);
  });
});
