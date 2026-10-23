import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
}).strict();
export type LoginBody = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
}).strict();
export type RefreshBody = z.infer<typeof refreshSchema>;

export const logoutSchema = z.object({
  refresh_token: z.string().min(1),
}).strict();
export type LogoutBody = z.infer<typeof logoutSchema>;

export const serviceTokenSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
}).strict();
export type ServiceTokenBody = z.infer<typeof serviceTokenSchema>;
