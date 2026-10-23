import type { GatewayClient } from './gateway.client.js';
import type { ServiceTokenProvider } from './service-token.provider.js';

export interface SyncItem {
  nim: string;
  nilai_angka: number;
  nilai_huruf: string;
  bobot: number;
}

export interface SyncPayload {
  kelas_id: number;
  kode_mk: string;
  nama_mk: string;
  sks: number;
  semester: 'Ganjil' | 'Genap';
  tahun_ajaran: string;
  items: SyncItem[];
}

/** Posts the finalised grades to Service Transkrip through the gateway using a service token. */
export class TranskripSyncClient {
  constructor(
    private readonly client: GatewayClient,
    private readonly tokenProvider: ServiceTokenProvider,
  ) {}

  async sync(payload: SyncPayload): Promise<void> {
    const token = await this.tokenProvider.getToken();
    const res = await this.client.post<{ upserted?: number }>('/transkrip/sinkron', {
      headers: { Authorization: `Bearer ${token}` },
      body: payload,
      timeoutMs: 8000,
    });
    if (res.status !== 200) {
      throw new Error(`transkrip sync failed with status ${res.status}`);
    }
  }
}
