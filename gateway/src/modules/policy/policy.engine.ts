import { Reason } from '../../common/errors/reason-codes.js';
import type { AccessHours } from '../../common/utils/access-hours.js';
import type { Clock } from '../../common/utils/clock.js';
import { deny, type Decision, type PolicyContext } from './policy.types.js';
import type { PolicyRepository } from './policy.repository.js';
import { buildRuleMap } from './rules/index.js';
import { DeviceRule } from './rules/device.rule.js';
import { AccessHoursRule } from './rules/access-hours.rule.js';
import type { PolicyRule } from './policy.types.js';

export class PolicyEngine {
  private readonly rules: Map<string, PolicyRule>;
  private readonly deviceRule: DeviceRule;
  private readonly accessHoursRule: AccessHoursRule;

  constructor(
    repo: PolicyRepository,
    accessHours: AccessHours,
    _clock: Clock,
  ) {
    this.rules = buildRuleMap(repo);
    this.deviceRule = new DeviceRule(repo);
    this.accessHoursRule = new AccessHoursRule(accessHours);
  }

  hasRule(key: string): boolean {
    return this.rules.has(key);
  }

  /**
   * Evaluate the policy for a rule key. Deny order (ARCHITECTURE §5):
   * ① user/service scope mismatch ② device & subject state (users only)
   * ③ role ④ access hours ⑤ rule attribute/ownership evaluation.
   */
  async decide(ruleKey: string, ctx: PolicyContext): Promise<Decision> {
    const rule = this.rules.get(ruleKey);
    if (!rule) {
      return deny(Reason.ROUTE_NOT_REGISTERED, 403);
    }

    const serviceOnly = rule.allowedRoles.includes('service');
    if (serviceOnly && ctx.subject.type === 'user') {
      return deny(Reason.USER_TOKEN_ON_SERVICE_ENDPOINT, 403);
    }
    if (!serviceOnly && ctx.subject.type === 'service') {
      return deny(Reason.SERVICE_TOKEN_ON_USER_ENDPOINT, 403);
    }

    if (ctx.subject.type === 'user') {
      const ctxDeny = await this.deviceRule.evaluate(ctx);
      if (ctxDeny) return ctxDeny;
    }

    if (!rule.allowedRoles.includes(ctx.subject.role)) {
      return deny(Reason.ROLE_NOT_ALLOWED, 403);
    }

    const hoursDeny = this.accessHoursRule.evaluate(ctx, rule.requiresAccessHours);
    if (hoursDeny) return hoursDeny;

    return rule.evaluate(ctx);
  }
}
