import type { Request, Response } from 'express';
import { AccessDeniedError } from '../../common/errors/access-denied.error.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import type { SyncBody } from './transkrip.schema.js';
import type { TranskripService } from './transkrip.service.js';

export class TranskripController {
  constructor(private readonly service: TranskripService) {}

  get = asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AccessDeniedError.tokenMissing();
    const data = await this.service.getByNim(req.auth.subject, req.params.nim);
    res.status(200).json({ data });
  });

  sync = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as SyncBody;
    const data = await this.service.sync(body);
    res.status(200).json({ data });
  });
}
