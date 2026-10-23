import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export type SyncStatus = 'NONE' | 'PENDING' | 'SYNCED' | 'FAILED';

export interface KelasForUpdate {
  id: number;
  mataKuliahId: number;
  dosenId: number;
  namaKelas: string;
  semester: 'Ganjil' | 'Genap';
  tahunAjaran: string;
  finalizedAt: Date | null;
  syncStatus: SyncStatus;
  kodeMk: string;
  namaMk: string;
  sks: number;
}

interface KelasRow extends RowDataPacket {
  id: number;
  mata_kuliah_id: number;
  dosen_id: number;
  nama_kelas: string;
  semester: 'Ganjil' | 'Genap';
  tahun_ajaran: string;
  finalized_at: Date | null;
  sync_status: SyncStatus;
  kode_mk: string;
  nama_mk: string;
  sks: number;
}

interface MataKuliahRow extends RowDataPacket {
  kode: string;
  nama: string;
  sks: number;
}

function mapKelas(row: KelasRow): KelasForUpdate {
  return {
    id: row.id,
    mataKuliahId: row.mata_kuliah_id,
    dosenId: row.dosen_id,
    namaKelas: row.nama_kelas,
    semester: row.semester,
    tahunAjaran: row.tahun_ajaran,
    finalizedAt: row.finalized_at,
    syncStatus: row.sync_status,
    kodeMk: row.kode_mk,
    namaMk: row.nama_mk,
    sks: row.sks,
  };
}

export interface FinalizableNilai {
  id: number;
  nim: string;
  nilaiAngka: number | null;
  nilaiHuruf: string | null;
  bobot: number | null;
}

interface NilaiRow extends RowDataPacket {
  id: number;
  nim: string;
  nilai_angka: number | null;
  nilai_huruf: string | null;
  bobot: number | null;
}

export class KelasRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Locks ONLY the `kelas` row: `zt_nilai` has no UPDATE grant on mata_kuliah, so a
   * joined `FOR UPDATE` would be denied (least-privilege grants, DATABASE §5).
   * The mata_kuliah fields are static reference data, safe to read unlocked.
   */
  async getForUpdate(conn: PoolConnection, id: number): Promise<KelasForUpdate | null> {
    const [rows] = await conn.query<KelasRow[]>(
      `SELECT id, mata_kuliah_id, dosen_id, nama_kelas, semester, tahun_ajaran,
              finalized_at, sync_status
       FROM kelas WHERE id = ? FOR UPDATE`,
      [id],
    );
    const kelas = rows[0];
    if (!kelas) return null;
    const [mkRows] = await conn.query<MataKuliahRow[]>(
      'SELECT kode, nama, sks FROM mata_kuliah WHERE id = ?',
      [kelas.mata_kuliah_id],
    );
    const mk = mkRows[0];
    if (!mk) return null;
    return mapKelas({ ...kelas, kode_mk: mk.kode, nama_mk: mk.nama, sks: mk.sks });
  }

  listFinalizableNilai(conn: PoolConnection, kelasId: number): Promise<FinalizableNilai[]> {
    return conn
      .query<NilaiRow[]>(
        `SELECT n.id, u.nim AS nim, n.nilai_angka, n.nilai_huruf, n.bobot
         FROM nilai n
         JOIN users u ON u.id = n.mahasiswa_id
         WHERE n.kelas_id = ? ORDER BY n.id`,
        [kelasId],
      )
      .then((rows) =>
        rows[0].map((r) => ({
          id: r.id,
          nim: r.nim,
          nilaiAngka: r.nilai_angka,
          nilaiHuruf: r.nilai_huruf,
          bobot: r.bobot,
        })),
      );
  }

  markDraftsFinal(conn: PoolConnection, kelasId: number): Promise<void> {
    return conn
      .query<ResultSetHeader>(`UPDATE nilai SET status = 'FINAL' WHERE kelas_id = ? AND status = 'DRAFT'`, [kelasId])
      .then(() => undefined);
  }

  setFinalized(conn: PoolConnection, kelasId: number, finalizedAt: Date): Promise<void> {
    return conn
      .query<ResultSetHeader>(`UPDATE kelas SET finalized_at = ?, sync_status = 'PENDING' WHERE id = ?`, [finalizedAt, kelasId])
      .then(() => undefined);
  }

  setSyncStatus(kelasId: number, status: SyncStatus): Promise<void> {
    return this.pool.query<ResultSetHeader>('UPDATE kelas SET sync_status = ? WHERE id = ?', [status, kelasId]).then(() => undefined);
  }
}
