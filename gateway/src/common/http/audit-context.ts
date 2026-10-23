import type { Request } from 'express';
import type { AuditRecord, AuditSubjectType } from '../../modules/audit/audit.types.js';
import type { ReasonCode } from '../errors/reason-codes.js';
import type { Subject } from '../../modules/policy/policy.types.js';

function subjectParts(subject?: Subject): Pick<AuditRecord, 'subjectType' | 'subjectId' | 'role'> {
  if (!subject) {
    return { subjectType: 'anonymous' as AuditSubjectType, subjectId: null, role: null };
  }
  return {
    subjectType: subject.type,
    subjectId: String(subject.id),
    role: subject.role,
  };
}

export function buildAudit(
  req: Request,
  occurredAt: Date,
  decision: AuditRecord['decision'],
  reason: ReasonCode,
  overrides?: Partial<Pick<AuditRecord, 'deviceId' | 'subjectId' | 'subjectType' | 'role'>>,
): AuditRecord {
  const base = subjectParts(req.auth?.subject);
  return {
    requestId: req.requestId,
    occurredAt,
    subjectType: overrides?.subjectType ?? base.subjectType,
    subjectId: overrides?.subjectId ?? base.subjectId ?? null,
    role: overrides?.role ?? base.role ?? null,
    method: req.method,
    endpoint: req.originalUrl,
    deviceId: overrides?.deviceId ?? req.auth?.deviceId ?? req.header('X-Device-ID') ?? null,
    decision,
    reason,
    ip: req.ip ?? null,
  };
}
