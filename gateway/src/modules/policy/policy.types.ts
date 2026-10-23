import type { ReasonCode } from '../../common/errors/reason-codes.js';

export type Role = 'mahasiswa' | 'dosen' | 'admin' | 'service';

export type Subject =
  | { type: 'user'; id: number; role: Role }
  | { type: 'service'; id: string; role: 'service' };

export interface PolicyContext {
  subject: Subject;
  deviceId?: string;
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  now: Date;
  requestId: string;
}

export type Effect = 'allow' | 'deny';

export interface Decision {
  effect: Effect;
  reason: ReasonCode;
  status: number;
}

export interface PolicyRule {
  key: string;
  allowedRoles: Role[];
  requiresAccessHours: boolean;
  evaluate(ctx: PolicyContext): Promise<Decision>;
}

export function allow(reason: ReasonCode): Decision {
  return { effect: 'allow', reason, status: 200 };
}

export function deny(reason: ReasonCode, status = 403): Decision {
  return { effect: 'deny', reason, status };
}
