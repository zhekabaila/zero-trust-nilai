import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { SyncBody } from './transkrip.schema.js';

export interface TranskripItem {
  kelas_id: number;
  kode_mk: string;
  nama_mk: string;
  sks: number;
  semester: 'Ganjil' | 'Genap';
  tahun_ajaran: string;
  nilai_angka: number;
  nilai_huruf: string;
  bobot: number;
}

interface TranskripRow extends RowDataPacket {
  kelas_id: number;
  kode_mk: string;
  nama_mk: string;
  sks: number;
  semester: 'Ganjil' | 'Genap';
  tahun_ajaran: string;
  nilai_angka: number;
  nilai_huruf: string;
  bobot: number;
}

const SELECT_COLUMNS = `kelas_id, kode_mk, nama_mk, sks, semester, tahun_ajaran,
       nilai_angka, nilai_huruf, bobot`;

function mapRow(row: TranskripRow): TranskripItem {
  return {
    kelas_id: row.kelas_id,
    kode_mk: row.kode_mk,
    nama_mk: row.nama_mk,
    sks: row.sks,
    semester: row.semester,
    tahun_ajaran: row.tahun_ajaran,
    nilai_angka: row.nilai_angka,
    nilai_huruf: row.nilai_huruf,
    bobot: row.bobot,
  };
}

export class TranskripRepository {
  constructor(private readonly pool: Pool) {}

  async findByNim(nim: string): Promise<TranskripItem[]> {
    const [rows] = await this.pool.query<TranskripRow[]>(
      `SELECT ${SELECT_COLUMNS} FROM transkrip WHERE nim = ? ORDER BY kelas_id`,
      [nim],
    );
    return rows.map(mapRow);
  }

  /** Idempotent upsert against UNIQUE(nim, kelas_id) (T-TRN-07). */
  async upsert(payload: SyncBody): Promise<void> {
    const placeholders = payload.items.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const values: (string | number)[] = [];
    for (const item of payload.items) {
      values.push(
        item.nim,
        payload.kelas_id,
        payload.kode_mk,
        payload.nama_mk,
        payload.sks,
        payload.semester,
        payload.tahun_ajaran,
        item.nilai_angka,
        item.nilai_huruf,
        item.bobot,
      );
    }
    await this.pool.query(
      `INSERT INTO transkrip (nim, kelas_id, kode_mk, nama_mk, sks, semester, tahun_ajaran,
                              nilai_angka, nilai_huruf, bobot)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         kode_mk = VALUES(kode_mk), nama_mk = VALUES(nama_mk), sks = VALUES(sks),
         semester = VALUES(semester), tahun_ajaran = VALUES(tahun_ajaran),
         nilai_angka = VALUES(nilai_angka), nilai_huruf = VALUES(nilai_huruf),
         bobot = VALUES(bobot)`,
      values,
    );
  }
}
