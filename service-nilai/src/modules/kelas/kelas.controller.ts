import type { Request, Response } from 'express';
import { AccessDeniedError } from '../../common/errors/access-denied.error.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import type { KelasService } from './kelas.service.js';

export class KelasController {
  constructor(private readonly service: KelasService) {}

  finalize = asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AccessDeniedError.tokenMissing();
    if (req.auth.subject.type !== 'user') throw AccessDeniedError.roleNotAllowed();
    const kelasId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(kelasId)) throw new NotFoundError('Class not found');
    const data = await this.service.finalize(req.auth.subject.id, kelasId);
    res.status(200).json({ data });
  });
}
