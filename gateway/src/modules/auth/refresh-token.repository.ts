import type { Pool, RowDataPacket } from 'mysql2/promise';

export interface RefreshTokenRow {
  id: number;
  userId: number;
  deviceId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

interface Row extends RowDataPacket {
  id: number;
  user_id: number;
  device_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

export class RefreshTokenRepository {
  constructor(private readonly pool: Pool) {}

  async create(userId: number, deviceId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.pool.query(
      'INSERT INTO refresh_tokens (user_id, device_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [userId, deviceId, tokenHash, expiresAt],
    );
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
    const [rows] = await this.pool.query<Row[]>(
      'SELECT id, user_id, device_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?',
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, userId: row.user_id, deviceId: row.device_id, expiresAt: row.expires_at, revokedAt: row.revoked_at };
  }

  async revoke(id: number, at: Date): Promise<void> {
    await this.pool.query(
      'UPDATE refresh_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
      [at, id],
    );
  }
}
