import type { PolicyRule } from '../policy.types.js';
import type { PolicyRepository } from '../policy.repository.js';
import { createNilaiRules } from './nilai.rules.js';
import { createKelasRules } from './kelas.rules.js';
import { createTranskripRules } from './transkrip.rules.js';
import { createAuditRules } from './audit.rules.js';

export { SERVICE_CLIENT_ID } from './transkrip.rules.js';

export function buildRuleMap(repo: PolicyRepository): Map<string, PolicyRule> {
  const rules: PolicyRule[] = [
    ...createNilaiRules(repo),
    ...createKelasRules(repo),
    ...createTranskripRules(repo),
    ...createAuditRules(),
  ];
  const map = new Map<string, PolicyRule>();
  for (const rule of rules) map.set(rule.key, rule);
  return map;
}
