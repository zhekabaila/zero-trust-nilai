import type { Subject } from '../../common/auth/subject.js';
import type { SyncBody } from './transkrip.schema.js';
import { computeIpk } from './ipk.js';
import type { TranskripItem, TranskripRepository } from './transkrip.repository.js';

export interface TranskripView {
  nim: string;
  items: TranskripItem[];
  total_sks: number;
  ipk: number;
}

export class TranskripService {
  constructor(private readonly repository: TranskripRepository) {}

  /**
   * NIM ownership is decided by the gateway Policy Engine (ARCHITECTURE §5);
   * this service keeps only the coarse role guard because its DB user has no
   * access to `users` (least privilege, T-DB-02).
   */
  async getByNim(_subject: Subject, nim: string): Promise<TranskripView> {
    const items = await this.repository.findByNim(nim);
    const { total_sks, ipk } = computeIpk(items);
    return { nim, items, total_sks, ipk };
  }

  async sync(payload: SyncBody): Promise<{ upserted: number }> {
    await this.repository.upsert(payload);
    return { upserted: payload.items.length };
  }
}
