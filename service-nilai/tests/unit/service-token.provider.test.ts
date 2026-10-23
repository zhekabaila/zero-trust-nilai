import { beforeEach, describe, expect, it } from 'vitest';
import { stubServiceNilaiEnv } from './stub-env.js';

stubServiceNilaiEnv();

const { ServiceTokenProvider } = await import('../../src/integrations/service-token.provider.js');
const { GatewayClient } = await import('../../src/integrations/gateway.client.js');

class TestClock {
  constructor(public ms: number) {}
  now(): Date {
    return new Date(this.ms);
  }
}

interface Issue {
  count: number;
  resolve?: (v: { status: number; json: unknown }) => void;
}

function fakeClient(clock: TestClock, issue: Issue, delayMs = 0) {
  return {
    async post() {
      issue.count += 1;
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      return {
        status: 200,
        json: { access_token: `tok-${issue.count}`, token_type: 'Bearer', expires_in: 300 },
      };
    },
  } as unknown as InstanceType<typeof GatewayClient>;
}

describe('ServiceTokenProvider — cache, pre-expiry refresh, single-flight', () => {
  let issue: Issue;
  let clock: TestClock;
  const T0 = Date.UTC(2026, 0, 1, 6, 0, 0);

  beforeEach(() => {
    issue = { count: 0 };
    clock = new TestClock(T0);
  });

  it('issues once, then serves from cache', async () => {
    const p = new ServiceTokenProvider(fakeClient(clock, issue), 'service-nilai', 's', clock);
    expect(await p.getToken()).toBe('tok-1');
    expect(await p.getToken()).toBe('tok-1');
    expect(issue.count).toBe(1);
  });

  it('refreshes when less than 60s of validity remain', async () => {
    const p = new ServiceTokenProvider(fakeClient(clock, issue), 'service-nilai', 's', clock);
    await p.getToken();
    clock.ms = T0 + 239_000; // 61s left → still cached
    expect(await p.getToken()).toBe('tok-1');
    clock.ms = T0 + 241_000; // 59s left → refresh
    expect(await p.getToken()).toBe('tok-2');
    expect(issue.count).toBe(2);
  });

  it('concurrent callers share a single in-flight request', async () => {
    const p = new ServiceTokenProvider(fakeClient(clock, issue, 10), 'service-nilai', 's', clock);
    const [a, b] = await Promise.all([p.getToken(), p.getToken()]);
    expect(a).toBe(b);
    expect(issue.count).toBe(1);
  });

  it('failed issuance does not poison the cache and is retryable', async () => {
    const failing = {
      async post() {
        issue.count += 1;
        return { status: 401, json: null };
      },
    } as unknown as InstanceType<typeof GatewayClient>;
    const p = new ServiceTokenProvider(failing, 'service-nilai', 's', clock);
    await expect(p.getToken()).rejects.toThrow('service token issuance failed');
    const ok = fakeClient(clock, issue);
    const p2 = new ServiceTokenProvider(ok, 'service-nilai', 's', clock);
    expect(await p2.getToken()).toBe('tok-2');
  });
});
