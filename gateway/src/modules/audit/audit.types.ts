import type { ReasonCode } from '../../common/errors/reason-codes.js';

export type AuditSubjectType = 'user' | 'service' | 'anonymous';
export type AuditDecision = 'allow' | 'deny';

export interface AuditRecord {
  requestId: string;
  occurredAt: Date;
  subjectType: AuditSubjectType;
  subjectId?: string | null;
  role?: string | null;
  method: string;
  endpoint: string;
  deviceId?: string | null;
  decision: AuditDecision;
  reason: ReasonCode;
  ip?: string | null;
}

export interface AuditTrailEntry {
  id: number;
  request_id: string;
  occurred_at: Date;
  subject_type: AuditSubjectType;
  subject_id: string | null;
  role: string | null;
  method: string;
  endpoint: string;
  device_id: string | null;
  decision: AuditDecision;
  reason: string;
  ip: string | null;
}

export interface AuditTrailFilters {
  limit: number;
  decision?: 'allow' | 'deny';
  subject_id?: string;
}
