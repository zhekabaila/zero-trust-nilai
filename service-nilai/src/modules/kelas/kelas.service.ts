import type { PoolConnection } from 'mysql2/promise';
import { AccessDeniedError } from '../../common/errors/access-denied.error.js';
import { BadGatewayError, ConflictError, NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import { Reason } from '../../common/errors/reason-codes.js';
import { logger } from '../../common/utils/logger.js';
import type { Clock } from '../../common/utils/clock.js';
import { KelasRepository, type KelasForUpdate, type FinalizableNilai } from './kelas.repository.js';
import type { TranskripSyncClient, SyncPayload } from '../../integrations/transkrip-sync.client.js';

export interface FinalizeResult {
  kelas_id: number;
  finalized_at: string;
  jumlah_nilai: number;
  sync_status: 'SYNCED';
}

type Transact = <T>(fn: (conn: PoolConnection) => Promise<T>) => Promise<T>;

interface TxOutcome {
  kelas: KelasForUpdate;
  finalizedAt: Date;
  nilai: FinalizableNilai[];
}

export class KelasService {
  constructor(
    private readonly repo: KelasRepository,
    private readonly syncClient: TranskripSyncClient,
    private readonly transact: Transact,
    private readonly clock: Clock,
  ) {}

  async finalize(dosenId: number, kelasId: number): Promise<FinalizeResult> {
    const txn = await this.transact<TxOutcome>(async (conn) => {
      const kelas = await this.repo.getForUpdate(conn, kelasId);
      if (!kelas) throw new NotFoundError('Class not found');
      if (kelas.dosenId !== dosenId) {
        throw new AccessDeniedError(Reason.NOT_CLASS_OWNER, 'You do not own this class', 403);
      }
      if (kelas.finalizedAt && kelas.syncStatus === 'SYNCED') {
        throw new ConflictError(Reason.ALREADY_FINALIZED, 'Class already finalized and synchronised');
      }

      let finalizedAt: Date;
      if (!kelas.finalizedAt) {
        const draft = await this.repo.listFinalizableNilai(conn, kelasId);
        if (draft.some((n) => n.nilaiAngka === null)) {
          throw new UnprocessableError(Reason.GRADES_INCOMPLETE, 'Some grades are still empty');
        }
        await this.repo.markDraftsFinal(conn, kelasId);
        finalizedAt = new Date(this.clock.now().getTime());
        await this.repo.setFinalized(conn, kelasId, finalizedAt);
      } else {
        finalizedAt = kelas.finalizedAt; // retry synchronisation only
      }
      const nilai = await this.repo.listFinalizableNilai(conn, kelasId);
      return { kelas, finalizedAt, nilai };
    });

    const payload = this.buildPayload(txn);
    await this.repo.setSyncStatus(kelasId, 'PENDING');
    try {
      await this.syncClient.sync(payload);
      await this.repo.setSyncStatus(kelasId, 'SYNCED');
      return {
        kelas_id: kelasId,
        finalized_at: txn.finalizedAt.toISOString(),
        jumlah_nilai: txn.nilai.length,
        sync_status: 'SYNCED',
      };
    } catch (err) {
      await this.repo.setSyncStatus(kelasId, 'FAILED');
      logger.warn({ err: (err as Error).message, kelasId }, 'transcript sync failed');
      throw new BadGatewayError(Reason.SYNC_FAILED, 'Failed to synchronise final grades to the transcript service');
    }
  }

  private buildPayload(txn: TxOutcome): SyncPayload {
    return {
      kelas_id: txn.kelas.id,
      kode_mk: txn.kelas.kodeMk,
      nama_mk: txn.kelas.namaMk,
      sks: txn.kelas.sks,
      semester: txn.kelas.semester,
      tahun_ajaran: txn.kelas.tahunAjaran,
      items: txn.nilai.map((n) => ({
        nim: n.nim,
        nilai_angka: n.nilaiAngka as number,
        nilai_huruf: n.nilaiHuruf as string,
        bobot: n.bobot as number,
      })),
    };
  }
}
