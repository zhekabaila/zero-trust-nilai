import { describe, expect, it } from 'vitest';
import { AccessDeniedError } from '../../src/common/errors/access-denied.error.js';
import { NotFoundError } from '../../src/common/errors/app-error.js';
import { NilaiService } from '../../src/modules/nilai/nilai.service.js';
import type { NilaiRepository, NilaiView } from '../../src/modules/nilai/nilai.repository.js';

function view(overrides: Partial<NilaiView> = {}): NilaiView {
  return {
    id: 1,
    kelasId: 1,
    kode: 'KP70065004',
    nama: 'Keamanan Informasi',
    sks: 3,
    nim: '227006001',
    namaMahasiswa: 'Ahmad Fauzi',
    nilaiAngka: 88,
    nilaiHuruf: 'A',
    bobot: 4,
    status: 'DRAFT',
    ...overrides,
  };
}

interface Fakes {
  affected?: number;
  existing?: NilaiView | null;
  fresh?: NilaiView | null;
  forMahasiswa?: NilaiView[];
  forDosen?: NilaiView[];
}

function fakeRepo(f: Fakes): NilaiRepository {
  return {
    listForMahasiswa: async () => f.forMahasiswa ?? [view()],
    listForDosen: async () => f.forDosen ?? [view()],
    getById: async () => f.fresh ?? f.existing ?? null,
    updateAtomik: async () => f.affected ?? 0,
  } as unknown as NilaiRepository;
}

const dosen = { type: 'user', id: 2, role: 'dosen' } as const;
const mhs = { type: 'user', id: 4, role: 'mahasiswa' } as const;

describe('NilaiService.update — atomic guard results (D11, T-NIL-09)', () => {
  it('affected=1 → returns fresh grade with computed huruf/bobot', async () => {
    const svc = new NilaiService(fakeRepo({ affected: 1, fresh: view({ nilaiAngka: 88, nilaiHuruf: 'A', bobot: 4 }) }));
    const out = await svc.update(dosen as never, 1, 88);
    expect(out).toEqual({ id: 1, kelas_id: 1, nilai_angka: 88, nilai_huruf: 'A', bobot: 4, status: 'DRAFT' });
  });

  it('affected=0 + row missing → NotFoundError', async () => {
    const svc = new NilaiService(fakeRepo({ affected: 0, existing: null }));
    await expect(svc.update(dosen as never, 9999, 80)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('affected=0 + row FINAL → GRADE_ALREADY_FINAL', async () => {
    const svc = new NilaiService(fakeRepo({ affected: 0, existing: view({ status: 'FINAL' }) }));
    const err = await svc.update(dosen as never, 1, 80).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AccessDeniedError);
    expect((err as AccessDeniedError).code).toBe('GRADE_ALREADY_FINAL');
  });

  it('affected=0 + row DRAFT of foreign class → NOT_CLASS_OWNER', async () => {
    const svc = new NilaiService(fakeRepo({ affected: 0, existing: view({ status: 'DRAFT' }) }));
    const err = await svc.update(dosen as never, 4, 80).catch((e: unknown) => e);
    expect((err as AccessDeniedError).code).toBe('NOT_CLASS_OWNER');
  });

  it('non-dosen subject is rejected before touching SQL', async () => {
    const svc = new NilaiService(fakeRepo({ affected: 1 }));
    await expect(svc.update(mhs as never, 1, 80)).rejects.toBeInstanceOf(AccessDeniedError);
  });
});

describe('NilaiService.list — role scoping', () => {
  it('mahasiswa is always scoped to the token subject (nim query ignored)', async () => {
    let calledId = 0;
    const repo = {
      listForMahasiswa: async (id: number) => {
        calledId = id;
        return [view()];
      },
    } as unknown as NilaiRepository;
    const svc = new NilaiService(repo);
    await svc.list(mhs as never, { nim: '227006002' });
    expect(calledId).toBe(4);
  });

  it('dosen passes kelas_id filter; admin/service denied', async () => {
    let seenKelas: number | undefined;
    const repo = {
      listForDosen: async (_id: number, kelasId?: number) => {
        seenKelas = kelasId;
        return [];
      },
    } as unknown as NilaiRepository;
    const svc = new NilaiService(repo);
    await svc.list(dosen as never, { kelas_id: '2' });
    expect(seenKelas).toBe(2);
    await expect(svc.list({ type: 'user', id: 1, role: 'admin' } as never, {})).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
