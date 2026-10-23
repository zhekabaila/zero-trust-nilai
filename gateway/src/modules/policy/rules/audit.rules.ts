import { Reason } from '../../../common/errors/reason-codes.js';
import { allow, type Decision, type PolicyRule } from '../policy.types.js';

export function createAuditRules(): PolicyRule[] {
  const auditList: PolicyRule = {
    key: 'audit.list',
    allowedRoles: ['admin'],
    requiresAccessHours: false,
    async evaluate(): Promise<Decision> {
      return allow(Reason.ADMIN_AUDIT_READ);
    },
  };

  return [auditList];
}
