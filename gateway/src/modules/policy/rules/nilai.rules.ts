import { Reason } from '../../../common/errors/reason-codes.js';
import { allow, deny, type Decision, type PolicyContext, type PolicyRule } from '../policy.types.js';
import type { PolicyRepository } from '../policy.repository.js';

function qstr(query: Record<string, string>, key: string): string | undefined {
  const v = query[key];
  return v === undefined || v === '' ? undefined : v;
}

export function createNilaiRules(repo: PolicyRepository): PolicyRule[] {
  const nilaiList: PolicyRule = {
    key: 'nilai.list',
    allowedRoles: ['mahasiswa', 'dosen'],
    requiresAccessHours: false,
    async evaluate(ctx: PolicyContext): Promise<Decision> {
      const subject = ctx.subject;
      if (subject.type === 'user' && subject.role === 'mahasiswa') {
        const nim = qstr(ctx.query, 'nim');
        if (!nim) return allow(Reason.OWN_DATA);
        const user = await repo.getUserAttributes(subject.id);
        if (user && user.nim === nim) return allow(Reason.OWN_DATA);
        return deny(Reason.NOT_OWN_DATA, 403);
      }
      if (subject.type === 'user' && subject.role === 'dosen') {
        const kelasId = qstr(ctx.query, 'kelas_id');
        if (!kelasId) return allow(Reason.CLASS_OWNER);
        const owner = await repo.getClassOwner(Number.parseInt(kelasId, 10));
        if (owner === subject.id) return allow(Reason.CLASS_OWNER);
        return deny(Reason.NOT_CLASS_OWNER, 403);
      }
      return deny(Reason.ROLE_NOT_ALLOWED, 403);
    },
  };

  const nilaiUpdate: PolicyRule = {
    key: 'nilai.update',
    allowedRoles: ['dosen'],
    requiresAccessHours: true,
    async evaluate(ctx: PolicyContext): Promise<Decision> {
      const subject = ctx.subject;
      const nilaiId = Number.parseInt(ctx.params.id ?? '', 10);
      if (!Number.isInteger(nilaiId)) return deny(Reason.RESOURCE_NOT_FOUND, 404);
      const info = await repo.getNilaiForPolicy(nilaiId);
      if (!info) return deny(Reason.RESOURCE_NOT_FOUND, 404);
      if (subject.type !== 'user' || info.dosenId !== subject.id) {
        return deny(Reason.NOT_CLASS_OWNER, 403);
      }
      if (info.status !== 'DRAFT') return deny(Reason.GRADE_ALREADY_FINAL, 403);
      return allow(Reason.CLASS_OWNER);
    },
  };

  return [nilaiList, nilaiUpdate];
}
