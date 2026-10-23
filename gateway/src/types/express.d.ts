import type { Subject } from '../modules/policy/policy.types.js';

declare global {
  namespace Express {
    interface Request {
      auth?: { subject: Subject; deviceId?: string };
      requestId: string;
    }
  }
}

export {};
