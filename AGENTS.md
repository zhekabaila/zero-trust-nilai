# AGENTS.md — Panduan untuk AI agent

Proyek: **Sistem Nilai Zero Trust** (tugas praktikum Keamanan Informasi, Unsil). API Gateway = PEP, Policy Engine di dalam gateway, Service Nilai, Service Transkrip, MySQL, audit log. Penilaian fokus pada **mekanisme kontrol akses**, bukan tampilan.

## 0. Urutan baca (wajib)
1. `PLAN.md` — keputusan (D1–D17), fase, checklist. Kerjakan **berurutan**, centang saat selesai.
2. `docs/ARCHITECTURE.md` — pipeline, Policy Engine, token, layering, struktur folder (normatif).
3. `docs/DATABASE.md` + `db/init/*.sql` — skema, seed, grants.
4. `docs/API.md` — kontrak endpoint & error. `docs/TESTING.md` — kriteria selesai (ID T-*).
5. `docs/SECURITY.md` — aturan keamanan & keterbatasan. `docs/DEMO.md` — kode yang akan ditunjukkan di video (harus mudah dibaca).

## 1. Stack
Node 22 · TypeScript strict · Express · `mysql2/promise` (raw SQL) · `zod` · `jsonwebtoken` (RS256) · `bcryptjs` · `http-proxy-middleware` · `pino` · `swagger-ui-express` + `yaml` · `vitest` + `supertest` · Docker Compose · MySQL 8.4. Pin versi paket saat `npm install`.

## 2. Aturan layering (tidak boleh dilanggar)
`routes → controller → service → repository → database` (detail: ARCHITECTURE §8)
- Controller: hanya `req`/`res`; **tanpa SQL, tanpa aturan bisnis**.
- Service: aturan bisnis & transaksi; **tanpa `req`/`res`**, tanpa SQL mentah.
- Repository: **hanya SQL terparameter** (`?`); kembalikan objek bertipe; tanpa aturan bisnis.
- Policy rule: hanya memutuskan allow/deny (mengembalikan `Decision`); **tidak mengubah data**.
- Validasi input dengan zod di `*.schema.ts` + middleware `validate`; jangan validasi manual di controller.
- Error: lempar `AppError`/`AccessDeniedError` dengan reason code; hanya error handler global yang membuat respons.

## 3. Aturan keamanan (non-negosiasi)
- **Default deny**: rute/rule tak terdaftar ⇒ `ROUTE_NOT_REGISTERED`.
- Token: `algorithms: ['RS256']`, cek `iss` dan `typ`. Service **hanya** punya public key.
- Gateway menghapus `X-Gateway-Secret` dari klien lalu memasang yang asli. Service menolak tanpa secret **dan** memverifikasi ulang token — keduanya wajib, tanpa pengecualian (termasuk health).
- Bandingkan secret dengan `crypto.timingSafeEqual`.
- Jangan log/echo: password, token, refresh token, secret. Pakai redact pino.
- Atribut kepemilikan dibaca dari DB (bukan dari isi token). Cek ulang atomik di SQL pada update/finalisasi (D11).
- Tidak ada rahasia di kode/repo selain seed dev yang sudah ditandai.
- Jangan menambah endpoint di luar `docs/API.md` tanpa persetujuan; jangan melonggarkan grant DB.

## 4. Konvensi kode
- TypeScript `strict`; **tanpa `any`**; tipe eksplisit di batas modul. ES module, import relatif lewat `src/`.
- Nama file: `kebab-case` dengan sufiks peran (`nilai.service.ts`, `device.rule.ts`). Kelas/tipe `PascalCase`, fungsi/variabel `camelCase`, konstanta `UPPER_SNAKE`.
- Dependency injection lewat konstruktor/factory (bukan singleton global) agar mudah di-mock; rakit di `app.ts`.
- `clock` diinjeksi untuk logika waktu (jam akses, expiry). Waktu internal UTC.
- Satu fungsi satu tugas; komentar hanya untuk "kenapa", bukan "apa". Pesan error/komentar kode: Bahasa Inggris untuk identifier, Bahasa Indonesia boleh untuk pesan `message`.
- Format respons sukses `{ data: … }`; error `{ error: { code, message, requestId } }`.
- Commit kecil per tugas fase, format `feat(gateway): …`, `fix(nilai): …`, `docs: …`, `test: …`, `chore: …`.

## 5. Cara kerja
1. Ambil tugas berikutnya yang belum dicentang di `PLAN.md`.
2. Tulis/ubah kode **dan test-nya** sesuai ID T-* terkait di `docs/TESTING.md`.
3. Jalankan: `npm run lint && npm test` di app terkait; untuk perubahan lintas-komponen, `docker compose up -d --build` lalu `npm run test:integration`.
4. Perbarui dokumen yang terdampak (API/DATABASE/ARCHITECTURE/OpenAPI) **pada commit yang sama**.
5. Centang tugas di `PLAN.md`. Bila fase selesai, pastikan kriteria "Selesai bila" terpenuhi sebelum lanjut.

**Definition of Done (per tugas):** lulus lint + test terkait · tidak melanggar §2–§3 · dokumen sinkron · tidak ada rahasia di log/repo · baris audit tercipta untuk setiap keputusan.

## 6. Hal yang sering salah (hindari)
- Memasang `express.json()` global di gateway → body proxy hilang. Pakai hanya di `/auth/*`.
- Memutuskan kepemilikan dari klaim token, bukan DB.
- Memakai waktu server lokal untuk jam akses; harus `ACCESS_HOURS_TZ` (default `Asia/Jakarta`), interval `[START, END)`.
- `UPDATE` nilai tanpa `AND status='DRAFT' AND dosen_id=?`.
- Lupa `sync_status`: finalisasi harus idempoten dan bisa di-retry (ARCHITECTURE §7).
- Menulis audit dua kali untuk satu request, atau tidak menulis untuk 401.
- Mengubah `db/init/*` lalu lupa `docker compose down -v` (init hanya jalan di volume kosong).
- Healthcheck service tanpa `X-Gateway-Secret`.

## 7. Peta file cepat
| Butuh… | Lihat |
|---|---|
| Aturan Tabel 3 | `gateway/src/modules/policy/rules/*.ts`, ARCHITECTURE §5 |
| Terbit/verifikasi token | `gateway/src/modules/auth/token.service.ts`, `service-*/src/common/middlewares/verify-token.ts` |
| Proxy + secret | `gateway/src/modules/proxy/` |
| Audit | `gateway/src/modules/audit/` |
| Finalisasi & sinkron | `service-nilai/src/modules/kelas/`, `service-nilai/src/integrations/` |
| Skema, seed, akun | `db/init/`, `docs/DATABASE.md` |
| Perintah | `docker compose up -d --build` · `docker compose logs -f gateway` · `docker compose down -v` |

## 8. Jika ragu
Pilih opsi yang lebih ketat (deny) dan catat asumsi di `PLAN.md` bagian keputusan. Pertanyaan yang mengubah desain: tanyakan ke pemilik proyek sebelum mengimplementasikan.
