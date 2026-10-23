import { Reason } from '../../../common/errors/reason-codes.js';
import { allow, deny, type Decision, type PolicyContext, type PolicyRule } from '../policy.types.js';
import type { PolicyRepository } from '../policy.repository.js';

export const SERVICE_CLIENT_ID = 'service-nilai';

export function createTranskripRules(repo: PolicyRepository): PolicyRule[] {
  const transkripGet: PolicyRule = {
    key: 'transkrip.get',
    allowedRoles: ['mahasiswa', 'admin'],
    requiresAccessHours: false,
    async evaluate(ctx: PolicyContext): Promise<Decision> {
      const subject = ctx.subject;
      const nim = ctx.params.nim;
      if (subject.type === 'user' && subject.role === 'admin') return allow(Reason.ADMIN_ALL);
      if (subject.type === 'user' && subject.role === 'mahasiswa') {
        const user = await repo.getUserAttributes(subject.id);
        if (user && user.nim === nim) return allow(Reason.OWN_DATA);
        return deny(Reason.NOT_OWN_DATA, 403);
      }
      return deny(Reason.ROLE_NOT_ALLOWED, 403);
    },
  };

  const transkripSync: PolicyRule = {
    key: 'transkrip.sync',
    allowedRoles: ['service'],
    requiresAccessHours: false,
    async evaluate(ctx: PolicyContext): Promise<Decision> {
      if (ctx.subject.type === 'service' && ctx.subject.id === SERVICE_CLIENT_ID) {
        return allow(Reason.SERVICE_TOKEN);
      }
      return deny(Reason.SERVICE_NOT_ALLOWED, 403);
    },
  };

  return [transkripGet, transkripSync];
}
