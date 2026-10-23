import type { Pool, RowDataPacket } from 'mysql2/promise';

export interface ServiceClientRecord {
  id: number;
  clientId: string;
  secretHash: string;
  name: string;
  isActive: boolean;
}

interface Row extends RowDataPacket {
  id: number;
  client_id: string;
  secret_hash: string;
  name: string;
  is_active: number;
}

export class ServiceClientRepository {
  constructor(private readonly pool: Pool) {}

  async findByClientId(clientId: string): Promise<ServiceClientRecord | null> {
    const [rows] = await this.pool.query<Row[]>(
      'SELECT id, client_id, secret_hash, name, is_active FROM service_clients WHERE client_id = ?',
      [clientId],
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, clientId: row.client_id, secretHash: row.secret_hash, name: row.name, isActive: row.is_active === 1 };
  }
}
