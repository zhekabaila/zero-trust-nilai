import { Reason } from '../../../common/errors/reason-codes.js';
import { allow, deny, type Decision, type PolicyContext, type PolicyRule } from '../policy.types.js';
import type { PolicyRepository } from '../policy.repository.js';

export function createKelasRules(repo: PolicyRepository): PolicyRule[] {
  const kelasFinalize: PolicyRule = {
    key: 'kelas.finalize',
    allowedRoles: ['dosen'],
    requiresAccessHours: true,
    async evaluate(ctx: PolicyContext): Promise<Decision> {
      const subject = ctx.subject;
      const kelasId = Number.parseInt(ctx.params.id ?? '', 10);
      if (!Number.isInteger(kelasId)) return deny(Reason.RESOURCE_NOT_FOUND, 404);
      const owner = await repo.getClassOwner(kelasId);
      if (owner === null) return deny(Reason.RESOURCE_NOT_FOUND, 404);
      if (subject.type !== 'user' || owner !== subject.id) {
        return deny(Reason.NOT_CLASS_OWNER, 403);
      }
      return allow(Reason.CLASS_OWNER);
    },
  };
  return [kelasFinalize];
}
