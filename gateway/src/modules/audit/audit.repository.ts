import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { AuditRecord, AuditTrailEntry, AuditTrailFilters } from './audit.types.js';

const TRAIL_COLUMNS =
  'id, request_id, occurred_at, subject_type, subject_id, role, method, endpoint, device_id, decision, reason, ip';

export class AuditRepository {
  constructor(private readonly pool: Pool) {}

  async list(filters: AuditTrailFilters): Promise<AuditTrailEntry[]> {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filters.decision) {
      where.push('decision = ?');
      params.push(filters.decision);
    }
    if (filters.subject_id) {
      where.push('subject_id = ?');
      params.push(filters.subject_id);
    }
    const sql =
      `SELECT ${TRAIL_COLUMNS} FROM audit_logs` +
      (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
      ' ORDER BY id DESC LIMIT ?';
    params.push(filters.limit);
    const [rows] = await this.pool.query<AuditTrailRow[]>(sql, params);
    return rows.map(toEntry);
  }

  async insert(record: AuditRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_logs
         (request_id, occurred_at, subject_type, subject_id, role, method, endpoint, device_id, decision, reason, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.requestId,
        record.occurredAt,
        record.subjectType,
        record.subjectId ?? null,
        record.role ?? null,
        record.method,
        record.endpoint,
        record.deviceId ?? null,
        record.decision,
        record.reason,
        record.ip ?? null,
      ],
    );
  }
}

interface AuditTrailRow extends RowDataPacket {
  id: number;
  request_id: string;
  occurred_at: Date;
  subject_type: AuditTrailEntry['subject_type'];
  subject_id: string | null;
  role: string | null;
  method: string;
  endpoint: string;
  device_id: string | null;
  decision: AuditTrailEntry['decision'];
  reason: string;
  ip: string | null;
}

function toEntry(row: AuditTrailRow): AuditTrailEntry {
  return {
    id: row.id,
    request_id: row.request_id,
    occurred_at: row.occurred_at,
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    role: row.role,
    method: row.method,
    endpoint: row.endpoint,
    device_id: row.device_id,
    decision: row.decision,
    reason: row.reason,
    ip: row.ip,
  };
}
