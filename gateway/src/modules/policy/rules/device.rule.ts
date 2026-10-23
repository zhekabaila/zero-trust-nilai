import { Reason } from '../../../common/errors/reason-codes.js';
import { deny, type Decision, type PolicyContext } from '../policy.types.js';
import type { PolicyRepository } from '../policy.repository.js';

/**
 * Device / subject-state context check (applies only to user subjects;
 * service tokens are exempt per ARCHITECTURE §5). Returns a deny Decision when the
 * request must be refused, or `undefined` when it passes.
 */
export class DeviceRule {
  constructor(private readonly repo: PolicyRepository) {}

  async evaluate(ctx: PolicyContext): Promise<Decision | undefined> {
    if (ctx.subject.type !== 'user') return undefined;
    if (!ctx.deviceId) {
      return deny(Reason.DEVICE_HEADER_MISSING, 403);
    }
    const user = await this.repo.getUserAttributes(ctx.subject.id);
    if (!user || !user.isActive) {
      return deny(Reason.USER_INACTIVE, 403);
    }
    const registered = await this.repo.isDeviceRegistered(ctx.subject.id, ctx.deviceId);
    if (!registered) {
      return deny(Reason.DEVICE_NOT_REGISTERED, 403);
    }
    return undefined;
  }
}
