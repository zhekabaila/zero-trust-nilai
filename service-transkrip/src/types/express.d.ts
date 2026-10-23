import type { Subject } from '../common/auth/subject.js';

declare global {
  namespace Express {
    interface Request {
      auth?: { subject: Subject };
      requestId: string;
    }
  }
}

export {};
