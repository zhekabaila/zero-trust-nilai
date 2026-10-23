import type { Pool, RowDataPacket } from 'mysql2/promise';

export class DeviceRepository {
  constructor(private readonly pool: Pool) {}

  async isRegistered(userId: number, deviceId: string): Promise<boolean> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT 1 AS ok FROM devices WHERE user_id = ? AND device_id = ? AND is_active = 1 LIMIT 1',
      [userId, deviceId],
    );
    return rows.length > 0;
  }
}
