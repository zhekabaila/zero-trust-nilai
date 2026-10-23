import { z } from 'zod';

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  decision: z.enum(['allow', 'deny']).optional(),
  subject_id: z.string().min(1).max(64).optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
