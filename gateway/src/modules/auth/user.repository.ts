import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { Role } from '../policy/policy.types.js';

export interface UserRecord {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  nim: string | null;
  passwordHash: string;
  isActive: boolean;
}

interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  nim: string | null;
  password_hash: string;
  is_active: number;
}

const USER_COLUMNS =
  'id, username, full_name, role, nim, password_hash, is_active';

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    nim: row.nim,
    passwordHash: row.password_hash,
    isActive: row.is_active === 1,
  };
}

export class UserRepository {
  constructor(private readonly pool: Pool) {}

  async findByUsername(username: string): Promise<UserRecord | null> {
    const [rows] = await this.pool.query<UserRow[]>(
      `SELECT ${USER_COLUMNS} FROM users WHERE username = ?`,
      [username],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findById(id: number): Promise<UserRecord | null> {
    const [rows] = await this.pool.query<UserRow[]>(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`,
      [id],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }
}
