import { describe, expect, it } from 'vitest';
import { computeIpk } from '../../src/modules/transkrip/ipk.js';
import type { TranskripItem } from '../../src/modules/transkrip/transkrip.repository.js';

function item(sks: number, bobot: number): TranskripItem {
  return {
    kelas_id: 1,
    kode_mk: 'MK',
    nama_mk: 'Nama',
    sks,
    semester: 'Ganjil',
    tahun_ajaran: '2026/2027',
    nilai_angka: 85,
    nilai_huruf: 'A',
    bobot,
  };
}

describe('computeIpk — Σ(bobot×sks)/Σ(sks), 2 decimals (T-TRN-08)', () => {
  it('empty transcript → 0/0', () => {
    expect(computeIpk([])).toEqual({ total_sks: 0, ipk: 0 });
  });

  it('single course', () => {
    expect(computeIpk([item(3, 4)])).toEqual({ total_sks: 3, ipk: 4 });
  });

  it('weighted average rounds to two decimals', () => {
    // (4*3 + 3.3*2) / 5 = 18.6/5 = 3.72
    expect(computeIpk([item(3, 4), item(2, 3.3)])).toEqual({ total_sks: 5, ipk: 3.72 });
  });

  it('rounds to two decimals: (3×3 + 2×2.3 + 3×2.7)/8 = 2.7125 → 2.71', () => {
    const r = computeIpk([item(3, 3), item(2, 2.3), item(3, 2.7)]);
    expect(r.total_sks).toBe(8);
    expect(r.ipk).toBe(2.71);
  });
});
