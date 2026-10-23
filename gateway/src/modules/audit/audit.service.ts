import { logger } from '../../common/utils/logger.js';
import type { AuditRepository } from './audit.repository.js';
import type { AuditRecord, AuditTrailFilters } from './audit.types.js';

export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  list(filters: AuditTrailFilters) {
    return this.repo.list(filters);
  }

  async record(entry: AuditRecord): Promise<void> {
    try {
      await this.repo.insert(entry);
    } catch (err) {
      logger.error({ err: (err as Error).message, requestId: entry.requestId }, 'failed to write audit log');
    }
  }
}
