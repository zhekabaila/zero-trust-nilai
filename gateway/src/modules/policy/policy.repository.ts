import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { Role } from './policy.types.js';

interface UserAttrRow extends RowDataPacket {
  id: number;
  role: Role;
  is_active: number;
  nim: string | null;
}

export interface UserAttributes {
  id: number;
  role: Role;
  isActive: boolean;
  nim: string | null;
}

export interface NilaiForPolicy {
  status: 'DRAFT' | 'FINAL';
  dosenId: number;
}

export class PolicyRepository {
  constructor(private readonly pool: Pool) {}

  async getUserAttributes(id: number): Promise<UserAttributes | null> {
    const [rows] = await this.pool.query<UserAttrRow[]>(
      'SELECT id, role, is_active, nim FROM users WHERE id = ?',
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, role: row.role, isActive: row.is_active === 1, nim: row.nim };
  }

  async isDeviceRegistered(userId: number, deviceId: string): Promise<boolean> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT 1 AS ok FROM devices WHERE user_id = ? AND device_id = ? AND is_active = 1 LIMIT 1',
      [userId, deviceId],
    );
    return rows.length > 0;
  }

  async getClassOwner(kelasId: number): Promise<number | null> {
    const [rows] = await this.pool.query<(RowDataPacket & { dosen_id: number })[]>(
      'SELECT dosen_id FROM kelas WHERE id = ?',
      [kelasId],
    );
    return rows[0]?.dosen_id ?? null;
  }

  async getNilaiForPolicy(nilaiId: number): Promise<NilaiForPolicy | null> {
    const [rows] = await this.pool.query<(RowDataPacket & { status: 'DRAFT' | 'FINAL'; dosen_id: number })[]>(
      `SELECT n.status AS status, k.dosen_id AS dosen_id
       FROM nilai n JOIN kelas k ON k.id = n.kelas_id
       WHERE n.id = ?`,
      [nilaiId],
    );
    const row = rows[0];
    if (!row) return null;
    return { status: row.status, dosenId: row.dosen_id };
  }
}
