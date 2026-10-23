import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';
import { env } from '../config/env.js';
import { logger } from '../common/utils/logger.js';

export const pool: Pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: false,
  decimalNumbers: true,
  timezone: 'Z',
  dateStrings: false,
});

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function pingDatabase(retries = 20, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      logger.warn({ attempt, err: (err as Error).message }, 'database not ready, retrying');
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('database never became ready');
}
