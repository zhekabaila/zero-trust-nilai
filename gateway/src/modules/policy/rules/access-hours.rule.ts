import { isWithinAccessHours, type AccessHours } from '../../../common/utils/access-hours.js';
import { Reason } from '../../../common/errors/reason-codes.js';
import { deny, type Decision, type PolicyContext } from '../policy.types.js';

/**
 * Configurable access-hours window (ARCHITECTURE §5, D15). Only enforced for rules
 * with `requiresAccessHours`. Returns a deny Decision outside the window, else `undefined`.
 */
export class AccessHoursRule {
  constructor(private readonly hours: AccessHours) {}

  evaluate(ctx: PolicyContext, required: boolean): Decision | undefined {
    if (!required) return undefined;
    if (!isWithinAccessHours(ctx.now, this.hours)) {
      return deny(Reason.OUTSIDE_ACCESS_HOURS, 403);
    }
    return undefined;
  }
}
