import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/async-handler.js';
import type { AuditService } from './audit.service.js';
import type { AuditQuery } from './audit.schema.js';

export class AuditController {
  constructor(private readonly service: AuditService) {}

  list = asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as AuditQuery;
    const items = await this.service.list({
      limit: q.limit,
      decision: q.decision,
      subject_id: q.subject_id,
    });
    res.status(200).json({ data: { items, count: items.length } });
  });
}
