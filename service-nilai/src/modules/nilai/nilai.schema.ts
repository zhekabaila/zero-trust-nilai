import { z } from 'zod';

export const updateNilaiSchema = z
  .object({
    nilai_angka: z
      .number({ invalid_type_error: 'nilai_angka must be a number' })
      .min(0, 'nilai_angka must be >= 0')
      .max(100, 'nilai_angka must be <= 100'),
  })
  .strict();
export type UpdateNilaiBody = z.infer<typeof updateNilaiSchema>;
