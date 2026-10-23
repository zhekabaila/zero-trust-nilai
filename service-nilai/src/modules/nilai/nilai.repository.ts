import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export interface NilaiView {
  id: number;
  kelasId: number;
  kode: string;
  nama: string;
  sks: number;
  nim: string;
  namaMahasiswa: string;
  nilaiAngka: number | null;
  nilaiHuruf: string | null;
  bobot: number | null;
  status: 'DRAFT' | 'FINAL';
}

interface NilaiViewRow extends RowDataPacket {
  id: number;
  kelas_id: number;
  kode: string;
  nama: string;
  sks: number;
  nim: string;
  nama_mahasiswa: string;
  nilai_angka: number | null;
  nilai_huruf: string | null;
  bobot: number | null;
  status: 'DRAFT' | 'FINAL';
}

function mapRow(row: NilaiViewRow): NilaiView {
  return {
    id: row.id,
    kelasId: row.kelas_id,
    kode: row.kode,
    nama: row.nama,
    sks: row.sks,
    nim: row.nim,
    namaMahasiswa: row.nama_mahasiswa,
    nilaiAngka: row.nilai_angka,
    nilaiHuruf: row.nilai_huruf,
    bobot: row.bobot,
    status: row.status,
  };
}

const LIST_SELECT = `
  SELECT n.id AS id, n.kelas_id AS kelas_id, mk.kode AS kode, mk.nama AS nama, mk.sks AS sks,
         u.nim AS nim, u.full_name AS nama_mahasiswa,
         n.nilai_angka AS nilai_angka, n.nilai_huruf AS nilai_huruf, n.bobot AS bobot, n.status AS status
  FROM nilai n
  JOIN kelas k ON k.id = n.kelas_id
  JOIN mata_kuliah mk ON mk.id = k.mata_kuliah_id
  JOIN users u ON u.id = n.mahasiswa_id`;

export interface UpdateNilaiInput {
  id: number;
  dosenId: number;
  nilaiAngka: number;
  nilaiHuruf: string;
  bobot: number;
  updatedBy: number;
}

export class NilaiRepository {
  constructor(private readonly pool: Pool) {}

  async listForMahasiswa(mahasiswaId: number): Promise<NilaiView[]> {
    const [rows] = await this.pool.query<NilaiViewRow[]>(
      `${LIST_SELECT} WHERE n.mahasiswa_id = ? ORDER BY n.id`,
      [mahasiswaId],
    );
    return rows.map(mapRow);
  }

  async listForDosen(dosenId: number, kelasId?: number): Promise<NilaiView[]> {
    if (kelasId !== undefined) {
      const [rows] = await this.pool.query<NilaiViewRow[]>(
        `${LIST_SELECT} WHERE k.dosen_id = ? AND n.kelas_id = ? ORDER BY n.id`,
        [dosenId, kelasId],
      );
      return rows.map(mapRow);
    }
    const [rows] = await this.pool.query<NilaiViewRow[]>(
      `${LIST_SELECT} WHERE k.dosen_id = ? ORDER BY n.id`,
      [dosenId],
    );
    return rows.map(mapRow);
  }

  async getById(id: number, conn?: PoolConnection): Promise<NilaiView | null> {
    const executor = conn ?? this.pool;
    const [rows] = await executor.query<NilaiViewRow[]>(
      `${LIST_SELECT} WHERE n.id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  /** Atomic guard (D11): update only when row is DRAFT and owned by this dosen. */
  async updateAtomik(input: UpdateNilaiInput): Promise<number> {
    const [result] = await this.pool.query<ResultSetHeader>(
      `UPDATE nilai n
         JOIN kelas k ON k.id = n.kelas_id
        SET n.nilai_angka = ?, n.nilai_huruf = ?, n.bobot = ?, n.updated_by = ?
      WHERE n.id = ? AND k.dosen_id = ? AND n.status = 'DRAFT'`,
      [input.nilaiAngka, input.nilaiHuruf, input.bobot, input.updatedBy, input.id, input.dosenId],
    );
    return result.affectedRows;
  }
}
