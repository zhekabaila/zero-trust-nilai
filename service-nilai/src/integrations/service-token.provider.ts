import { logger } from '../common/utils/logger.js';
import type { Clock } from '../common/utils/clock.js';
import type { GatewayClient } from './gateway.client.js';

interface ServiceTokenResponse {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

/** Caches the service token and refreshes it shortly before expiry, with single-flight. */
export class ServiceTokenProvider {
  private cached?: CachedToken;
  private inflight?: Promise<string>;

  constructor(
    private readonly client: GatewayClient,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly clock: Clock,
  ) {}

  async getToken(): Promise<string> {
    const nowMs = this.clock.now().getTime();
    if (this.cached && this.cached.expiresAtMs - nowMs > 60_000) {
      return this.cached.token;
    }
    if (!this.inflight) {
      this.inflight = this.issue().finally(() => {
        this.inflight = undefined;
      });
    }
    return this.inflight;
  }

  private async issue(): Promise<string> {
    const res = await this.client.post<ServiceTokenResponse>('/auth/service', {
      body: { client_id: this.clientId, client_secret: this.clientSecret },
    });
    if (res.status !== 200 || !res.json?.access_token) {
      logger.error({ status: res.status }, 'failed to obtain service token');
      throw new Error('service token issuance failed');
    }
    const token = res.json.access_token;
    const ttl = res.json.expires_in ?? 300;
    this.cached = { token, expiresAtMs: this.clock.now().getTime() + ttl * 1000 };
    return token;
  }
}
