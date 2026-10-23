# PLAN — Sistem Nilai Zero Trust

> **Status:** Fase 0–10 selesai & terverifikasi (unit test 75 + integrasi 48 lulus; `scripts/demo.sh` jalankan seluruh alur DEMO.md tanpa intervensi). Tambahan: D18 `GET /audit` (admin only). Sisa: Fase 11 — rekaman video (manual).
> **Aturan kerja agent:** kerjakan fase berurutan, centang `[x]` saat selesai, jangan loncat fase. Baca `AGENTS.md` dulu.

Tugas: Praktikum Individu Zero Trust Security — Keamanan Informasi (KP70065004), Informatika Unsil.
Ringkas: API Gateway sebagai PEP (port 3000) + Policy Engine/Administrator di dalam gateway, Service Nilai (3001), Service Transkrip (3002), satu database MySQL, audit log. Diuji via Postman/curl. Luaran: repo + README, video demo 6–9 menit.

---

## 1. Keputusan teknis (default — ubah sebelum Fase 0 bila perlu)

| ID | Topik | Keputusan | Alasan singkat |
|----|-------|-----------|----------------|
| D1 | Bahasa/runtime | TypeScript (strict) + Node 22 + Express | Tipe membantu `PolicyContext`/`Decision`; direkomendasikan tugas (Node+Express) |
| D2 | Akses DB | `mysql2/promise`, **raw SQL di repository**, tanpa ORM | Query terlihat jelas saat video; mudah menunjukkan cek atomik |
| D3 | Algoritma JWT | **RS256**: private key hanya gateway, service hanya public key | *Assume breach*: service yang bobol tidak bisa mencetak token |
| D4 | Refresh token | String acak 256-bit, simpan **hash SHA-256**, rotasi tiap refresh | Bisa dicabut; DB bocor ≠ token bocor |
| D5 | Password | `bcryptjs` cost 10 | Murni JS, tanpa build native di Alpine |
| D6 | Validasi input | `zod` di layer validator | Satu sumber skema untuk request |
| D7 | Swagger | OpenAPI 3.0 YAML tulis tangan, **satu dokumen di gateway** (`/docs`) | Gateway satu-satunya pintu; service tidak bisa diakses langsung |
| D8 | Policy Engine | Modul in-process di gateway, rule per endpoint, **default deny** | Sesuai Tabel 2 (modul di dalam gateway) |
| D9 | Hak DB | User MySQL terpisah per komponen, grant minimum (column-level) | Least privilege sampai lapisan data |
| D10 | Body parser | `express.json()` **hanya** di `/auth/*`; rute yang di-proxy tidak diparse | Hindari masalah re-stream body di `http-proxy-middleware`; rule PE hanya perlu params/query/header |
| D11 | Cek ulang di service | Kepemilikan & status dicek lagi **atomik di SQL** (`UPDATE … WHERE dosen_id=? AND status='DRAFT'`) | Tutup race TOCTOU antara keputusan PE dan eksekusi |
| D12 | Finalisasi + sinkron | Status `sync_status` (NONE/PENDING/SYNCED/FAILED) + upsert idempoten + retry | Tidak ada nilai final yang "hilang" bila Transkrip gagal |
| D13 | Kode bersama | Middleware kecil (secret, token, role, error) **diduplikasi** di 2 service | Docker build sederhana; ±60 baris |
| D14 | Port service | Dipublish ke `127.0.0.1` hanya untuk demo (akses langsung → ditolak) | Bukti "service tidak bisa diakses langsung" |
| D15 | Jam akses | Interval `[START, END)`, TZ `Asia/Jakarta`, dari env, clock bisa di-inject | Mudah didemokan & dites |
| D16 | Seed | SQL di `db/init` (hash bcrypt tetap) | `docker compose up` langsung siap, tanpa langkah tambahan |
| D17 | Logging | `pino` JSON, redact `authorization`, `x-gateway-secret`, password | Tidak membocorkan rahasia ke log |
| D18 | Endpoint audit trail | `GET /audit` **ditangani gateway sendiri** (bukan proxy), rule `audit.list` admin-only, reason allow `ADMIN_AUDIT_READ`; `zt_gateway` dapat `SELECT` `audit_logs` (tetap tanpa UPDATE/DELETE); query `limit`/`decision`/`subject_id` tervalidasi zod | Permintaan pemilik proyek (2026-10-24); tabel audit milik gateway, menambah service baru tidak memberi nilai; anti-tamper terjaga |
| D19 | phpMyAdmin | Service `phpmyadmin` (image `phpmyadmin/phpmyadmin:5.2.2`) di compose, bind `127.0.0.1:8081`, `PMA_HOST=mysql` | Klien DB untuk demo/inspeksi tanpa installs eksternal; tetap localhost-only dan dicatat sebagai keterbatasan lab (`SECURITY.md` §4) |

**Pertanyaan terbuka (tidak memblokir):** (a) pakai TypeScript atau JavaScript biasa? (b) cukup HS256 bila ingin lebih sederhana? Bila jawabannya berubah, perbarui D1/D3 dan `AGENTS.md`.

---

## 2. Traceability — kebutuhan tugas → implementasi

| Kebutuhan (bagian) | Implementasi | Lokasi rencana | Test |
|---|---|---|---|
| 4.1 Access token JWT 10 menit, `sub`+`role` | `TokenService.signAccess` | `gateway/src/modules/auth/token.service.ts` | T-AUTH-01, T-AUTH-08 |
| 4.1 Refresh token 1 hari, di DB, dapat dicabut | `RefreshTokenRepository`, `AuthService.refresh` | `gateway/src/modules/auth/` | T-AUTH-05..07 |
| 4.1 Logout mencabut refresh token | `AuthService.logout` | idem | T-AUTH-09 |
| 4.1 Token service 5 menit, role `service` | `POST /auth/service` | `auth.controller.ts`, `service-client.repository.ts` | T-SVC-01..03 |
| 4.1 Gateway secret | Proxy menambah header; service memverifikasi | `gateway/.../proxy.factory.ts`, `service-*/src/common/middlewares/verify-gateway-secret.ts` | T-GW-01..03 |
| 4.1 Verifikasi ulang token di service | `verify-token.ts` (RS256, exp, iss, typ) | `service-*/src/common/middlewares/` | T-GW-04..05 |
| 4.2 Tabel 3 (semua endpoint) | Rule per endpoint | `gateway/src/modules/policy/rules/*.ts` | T-NIL-*, T-KLS-*, T-TRN-* |
| 4.3 Device terdaftar | `DeviceRule` | `policy/rules/device.rule.ts` | T-CTX-01..03 |
| 4.3 Jam akses dapat dikonfigurasi | `AccessHoursRule` + env | `policy/rules/access-hours.rule.ts` | T-CTX-04..06 |
| 4.4 Audit log (waktu, subjek, endpoint, device, hasil, alasan) | `AuditService` | `gateway/src/modules/audit/` | T-AUD-01..03 |
| 5 Seed 1 admin, 2 dosen, 3 mhs, 2 kelas, 1 device/user | `02-seed.sql` | `db/init/02-seed.sql` | ✔ (sudah ada) |
| 6 README + video | `README.md`, `docs/DEMO.md` | root | checklist Fase 11 |

---

## 3. Fase kerja

Estimasi jam = perkiraan kasar satu orang.

### Fase 0 — Scaffolding & Docker (≈2 jam)
- [x] Salin struktur folder dari `docs/ARCHITECTURE.md` §9; init `package.json` + `tsconfig` (strict) di `gateway/`, `service-nilai/`, `service-transkrip/`
- [x] Dockerfile multi-stage tiap app (build → runtime `node:22-alpine`, user non-root)
- [x] `docker compose up -d --build` sukses; `mysql` healthy; `keygen` selesai
- [x] Tiap app punya `GET /health` (gateway publik; service `/internal/health` + secret)
- **Selesai bila:** 4 container `healthy`, `curl localhost:3000/health` → 200.

### Fase 1 — Database (≈1 jam)
- [x] Verifikasi `db/init/*` berjalan di **MySQL 8.4** (bukan hanya MariaDB): tabel, seed, grants
- [x] Cek grant: `zt_nilai` tidak bisa `SELECT password_hash`; `zt_transkrip` tidak bisa menyentuh `users`
- [x] Pool koneksi + helper transaksi di tiap app (`src/database/`)
- **Selesai bila:** query uji tiap user DB sesuai matriks di `docs/DATABASE.md` §5.

### Fase 2 — Fondasi umum tiap app (≈2 jam)
- [x] `config/env.ts` (zod; gagal start bila env tidak valid)
- [x] `common/errors` (`AppError`, `AccessDeniedError`, …), error handler global, format error seragam
- [x] Logger pino, `X-Request-ID` middleware, `asyncHandler`, `validate(schema)` middleware
- **Selesai bila:** error 400/404/500 berbentuk `{error:{code,message,requestId}}`.

### Fase 3 — Gateway: modul Auth (≈4 jam)
- [x] Repository: user, device, refresh-token, service-client
- [x] `TokenService` (sign/verify RS256, claim `typ`, `iss`, `jti`)
- [x] `AuthService`: login (password + device), refresh (rotasi + binding device), logout, service token
- [x] Controller + routes + schema zod `/auth/*`
- **Selesai bila:** T-AUTH-* dan T-SVC-* lulus.

### Fase 4 — Gateway: pipeline & audit (≈3 jam)
- [x] `authenticate` middleware (Bearer → `req.auth`; 401 + reason)
- [x] `AuditService` + repository; semua deny dari error handler, allow dari `authorize`
- **Selesai bila:** setiap request (termasuk 401 & login) menghasilkan 1 baris `audit_logs`.

### Fase 5 — Gateway: Policy Engine (≈4 jam)
- [x] `PolicyContext`, `Decision`, `ReasonCode`, `PolicyEngine.decide()` (urutan: role → jam → atribut)
- [x] `DeviceRule`, `AccessHoursRule`, `PolicyRepository` (ownership queries)
- [x] Rule: `nilai.list`, `nilai.update`, `kelas.finalize`, `transkrip.get`, `transkrip.sync`
- [x] Default deny untuk rute tak terdaftar; unit test per rule (clock & repo di-mock)
- **Selesai bila:** semua baris Tabel 3 + T-CTX-* lulus di unit test.

### Fase 6 — Gateway: proxy & gateway secret (≈2 jam)
- [x] `proxy.factory.ts`: hapus `X-Gateway-Secret` dari klien, set secret asli, teruskan `Authorization`, `X-Device-ID`, `X-Request-ID`
- [x] `proxy.routes.ts`: `router.METHOD(path, authenticate, authorize('rule.key'), proxy)`
- **Selesai bila:** T-GW-* lulus (akses langsung ke 3001/3002 tanpa secret → 401/403).

### Fase 7 — Service Nilai (≈5 jam)
- [x] Middleware: `verifyGatewaySecret` (timing-safe), `verifyToken`, `requireRole`
- [x] Modul `nilai`: list (scoping by token), update (guard atomik), grading util (angka→huruf/bobot)
- [x] Modul `kelas`: finalisasi (transaksi, validasi semua nilai terisi → 422)
- [x] `ServiceTokenProvider` (cache, refresh sebelum exp, single-flight) + `TranskripSyncClient` lewat gateway
- [x] Alur `sync_status`: PENDING → SYNCED / FAILED; retry idempoten
- **Selesai bila:** T-NIL-*, T-KLS-* lulus, termasuk skenario Transkrip mati.

### Fase 8 — Service Transkrip (≈2 jam)
- [x] Middleware sama; `GET /transkrip/:nim` (+ total SKS, IPK); `POST /transkrip/sinkron` (upsert idempoten, hanya token `service`)
- **Selesai bila:** T-TRN-* lulus.

### Fase 9 — Swagger (≈2 jam)
- [x] OpenAPI YAML per tag, digabung saat start; `GET /docs`, `GET /openapi.json`; skema keamanan `bearerAuth` + header `X-Device-ID`
- **Selesai bila:** semua endpoint di `docs/API.md` tampil dan bisa dicoba dari Swagger UI.

### Fase 10 — Pengujian & skrip demo (≈3 jam)
- [x] Unit test (policy, token, grading) + integrasi (supertest/compose) sesuai `docs/TESTING.md`
- [x] `scripts/demo.sh` (urut sesuai `docs/DEMO.md`) + `postman/collection.json`
- [x] (D18, permintaan pemilik) `GET /audit` — rule `audit.list` admin-only, grant SELECT `zt_gateway`, OpenAPI `audit.yaml`, T-AUD-04..07
- **Selesai bila:** seluruh matriks T-* lulus dan `demo.sh` berjalan tanpa intervensi.

### Fase 11 — README & video (≈3 jam)
- [x] Lengkapi `README.md` (cara run, akun, device ID — draft sudah ada)
- [x] Diagram Mermaid `docs/diagrams/*.mmd` (arsitektur + alur login/request/finalisasi/audit trail, tervalidasi parser mermaid)
- [ ] Rekam video 6–9 menit mengikuti `docs/DEMO.md`; cek durasi
- **Selesai bila:** repo bisa di-clone → `docker compose up` → demo berjalan di mesin lain.

**Total ≈ 33 jam.** Jalur minimum bila waktu mepet: Fase 0–8 + README; Swagger dan Postman dikerjakan terakhir.

---

## 4. Risiko & mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Body JSON hilang saat di-proxy | PUT/POST gagal | D10: tidak parse body di rute proxy |
| Race: finalisasi tepat saat PUT nilai | Nilai berubah setelah final | D11: guard atomik di SQL + transaksi finalisasi |
| Transkrip mati saat finalisasi | Nilai final tapi tak masuk transkrip | D12: `sync_status`, retry idempoten |
| Zona waktu salah (UTC vs WIB) | Jam akses meleset | Waktu DB = UTC; evaluasi jam dengan `Intl` + `ACCESS_HOURS_TZ`; clock di-inject |
| Kunci JWT tidak terbaca container | Gateway gagal start | Service `keygen` + `depends_on: service_completed_successfully` |
| Healthcheck MySQL lulus di fase init | App gagal konek | Healthcheck lewat TCP `-h 127.0.0.1` + retry koneksi di app |
| Rahasia bocor lewat log | Pelanggaran prinsip tugas | D17 redact; larangan di `AGENTS.md` |
| Seed hash tidak cocok password | Login gagal | Hash sudah diverifikasi; cara regenerasi di `docs/DATABASE.md` §6 |

## 5. Di luar lingkup (stretch, setelah semuanya lulus)
- Deteksi pemakaian ulang refresh token lama → cabut seluruh token user (reuse detection)
- Rate limit / lockout pada `/auth/login`
- mTLS atau TLS antar-container
- Endpoint baca audit untuk admin (menambah endpoint di luar Tabel 3 — hanya bila dosen menyetujui)
