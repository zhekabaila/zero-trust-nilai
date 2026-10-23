import type { TranskripItem } from './transkrip.repository.js';

export interface IpkResult {
  total_sks: number;
  ipk: number;
}

/** IPK = Σ(bobot × sks) / Σ(sks), rounded to 2 decimals (T-TRN-08). */
export function computeIpk(items: TranskripItem[]): IpkResult {
  const totalSks = items.reduce((sum, i) => sum + i.sks, 0);
  if (totalSks === 0) return { total_sks: 0, ipk: 0 };
  const totalPoints = items.reduce((sum, i) => sum + i.bobot * i.sks, 0);
  return { total_sks: totalSks, ipk: Math.round((totalPoints / totalSks) * 100) / 100 };
}
