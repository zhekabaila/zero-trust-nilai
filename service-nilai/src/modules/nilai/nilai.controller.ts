import type { Request, Response } from 'express';
import { AccessDeniedError } from '../../common/errors/access-denied.error.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import type { NilaiService } from './nilai.service.js';
import type { UpdateNilaiBody } from './nilai.schema.js';

export class NilaiController {
  constructor(private readonly service: NilaiService) {}

  list = asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AccessDeniedError.tokenMissing();
    const query = req.query as { nim?: string; kelas_id?: string };
    const data = await this.service.list(req.auth.subject, query);
    res.status(200).json({ data });
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth) throw AccessDeniedError.tokenMissing();
    const id = Number.parseInt(req.params.id, 10);
    const body = req.body as UpdateNilaiBody;
    const data = await this.service.update(req.auth.subject, id, body.nilai_angka);
    res.status(200).json({ data });
  });
}
