import { logger } from '../common/utils/logger.js';

export interface PostOptions {
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface PostResult<T> {
  status: number;
  json: T | null;
}

export class GatewayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async post<T>(path: string, opts: PostOptions): Promise<PostResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
        body: JSON.stringify(opts.body ?? {}),
        signal: controller.signal,
      });
      const text = await res.text();
      let json: T | null = null;
      if (text) {
        try {
          json = JSON.parse(text) as T;
        } catch {
          json = null;
        }
      }
      return { status: res.status, json };
    } finally {
      clearTimeout(timer);
      logger.debug({ path }, 'gateway client POST');
    }
  }
}
