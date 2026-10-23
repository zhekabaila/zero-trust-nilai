import { z } from 'zod';

export const nimParamsSchema = z.object({
  nim: z.string().regex(/^\d{4,20}$/, 'nim must be 4-20 digits'),
});
export type NimParams = z.infer<typeof nimParamsSchema>;

const syncItemSchema = z
  .object({
    nim: z.string().regex(/^\d{4,20}$/, 'nim must be 4-20 digits'),
    nilai_angka: z
      .number({ invalid_type_error: 'nilai_angka must be a number' })
      .min(0, 'nilai_angka must be >= 0')
      .max(100, 'nilai_angka must be <= 100'),
    nilai_huruf: z.string().regex(/^[A-E][-+]?$|^[DE]$/, 'invalid nilai_huruf'),
    bobot: z
      .number({ invalid_type_error: 'bobot must be a number' })
      .min(0, 'bobot must be >= 0')
      .max(4, 'bobot must be <= 4'),
  })
  .strict();

export const syncSchema = z
  .object({
    kelas_id: z.number({ invalid_type_error: 'kelas_id must be a number' }).int().positive(),
    kode_mk: z.string().min(1).max(20),
    nama_mk: z.string().min(1).max(100),
    sks: z.number({ invalid_type_error: 'sks must be a number' }).int().min(1).max(6),
    semester: z.enum(['Ganjil', 'Genap']),
    tahun_ajaran: z.string().regex(/^\d{4}\/\d{4}$/, 'tahun_ajaran must look like 2026/2027'),
    items: z.array(syncItemSchema).min(1).max(500),
  })
  .strict();
export type SyncBody = z.infer<typeof syncSchema>;
