# API — Kontrak endpoint (via Gateway `http://localhost:3000`)

Dokumen ini menjadi dasar OpenAPI (`gateway/src/modules/docs/openapi/*.yaml`). Ubah endpoint ⇒ ubah dokumen ini, YAML, dan `docs/TESTING.md`.

**Header umum**

| Header | Dipakai di | Keterangan |
|---|---|---|
| `Authorization: Bearer <token>` | semua kecuali `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/service`, `/health`, `/docs` | access token (user) atau token service |
| `X-Device-ID` | semua request **user** (termasuk login & refresh) | harus terdaftar untuk user tsb |
| `X-Request-ID` | opsional | dibuat gateway bila kosong; dikembalikan di respons |

**Format error:** `{ "error": { "code": "…", "message": "…", "requestId": "…" } }` — kode = reason code (`ARCHITECTURE.md` §5), ditambah `VALIDATION_ERROR`, `ALREADY_FINALIZED`, `GRADES_INCOMPLETE`, `SYNC_FAILED`.

---

## Auth (ditangani Gateway)

### POST `/auth/login`
Header: `X-Device-ID`. Body: `{ "username": "dosen01", "password": "Password123!" }`

| Status | Kondisi |
|---|---|
| 200 | `{ access_token, refresh_token, token_type:"Bearer", expires_in:600, user:{id, username, full_name, role} }` |
| 400 | body tidak valid |
| 401 | `INVALID_CREDENTIALS` (pesan sama untuk user tak ada/password salah) |
| 403 | `DEVICE_HEADER_MISSING`, `DEVICE_NOT_REGISTERED`, `USER_INACTIVE` |

### POST `/auth/refresh`
Header: `X-Device-ID` (harus sama dengan device saat login). Body: `{ "refresh_token": "…" }`
200 → `{ access_token, refresh_token, token_type, expires_in }` (refresh token **dirotasi**; yang lama dicabut). 401 → `REFRESH_INVALID|REFRESH_EXPIRED|REFRESH_REVOKED`. 403 → device tidak cocok.

### POST `/auth/logout`
Body: `{ "refresh_token": "…" }` → 204; refresh token dicabut. 401 bila tidak valid/sudah dicabut.

### POST `/auth/service`
Body: `{ "client_id": "service-nilai", "client_secret": "…" }` → 200 `{ access_token, token_type:"Bearer", expires_in:300 }` (claim `role:"service"`). 401 → `CLIENT_INVALID`.

---

## Nilai (Service Nilai)

### GET `/nilai`
Query opsional: `kelas_id` (dosen), `nim` (mahasiswa; hanya NIM sendiri).
- mahasiswa → hanya nilai miliknya. dosen → nilai kelas yang diampu (semua kelasnya bila `kelas_id` kosong).

200:
```json
{ "data": [ {
  "id": 1, "kelas_id": 1,
  "mata_kuliah": { "kode": "KP70065004", "nama": "Keamanan Informasi", "sks": 3 },
  "nim": "227006001", "nama_mahasiswa": "Ahmad Fauzi",
  "nilai_angka": 85.0, "nilai_huruf": "A", "status": "DRAFT"
} ] }
```
Deny: `ROLE_NOT_ALLOWED` (admin/service), `NOT_OWN_DATA`, `NOT_CLASS_OWNER`.

### PUT `/nilai/:id`
Role dosen, dalam jam akses. Body: `{ "nilai_angka": 88.5 }` (0–100). Huruf & bobot dihitung server.
200 `{ "data": { …nilai } }`. Deny: `ROLE_NOT_ALLOWED`, `OUTSIDE_ACCESS_HOURS`, `NOT_CLASS_OWNER`, `GRADE_ALREADY_FINAL` (403); `RESOURCE_NOT_FOUND` (404); 400 validasi.

## Kelas (Service Nilai)

### POST `/kelas/:id/finalisasi`
Role dosen pengampu, dalam jam akses. Tanpa body.
- 200 `{ "data": { "kelas_id": 1, "finalized_at": "…", "jumlah_nilai": 3, "sync_status": "SYNCED" } }`
- 409 `ALREADY_FINALIZED` (sudah final & tersinkron) · 422 `GRADES_INCOMPLETE` (ada nilai kosong) · 502 `SYNC_FAILED` (`sync_status` = FAILED; panggil lagi untuk retry)
- Deny: `ROLE_NOT_ALLOWED`, `OUTSIDE_ACCESS_HOURS`, `NOT_CLASS_OWNER` (403); `RESOURCE_NOT_FOUND` (404)

## Transkrip (Service Transkrip)

### GET `/transkrip/:nim`
Mahasiswa (NIM sendiri) atau admin (semua NIM).
200:
```json
{ "data": { "nim": "227006001", "items": [ {
  "kelas_id": 1, "kode_mk": "KP70065004", "nama_mk": "Keamanan Informasi", "sks": 3,
  "semester": "Ganjil", "tahun_ajaran": "2026/2027",
  "nilai_angka": 85.0, "nilai_huruf": "A", "bobot": 4.0
} ], "total_sks": 3, "ipk": 4.0 } }
```
NIM tanpa data → 200 dengan `items: []`, `total_sks: 0`, `ipk: 0`. Deny: `ROLE_NOT_ALLOWED` (dosen/service), `NOT_OWN_DATA`.

### POST `/transkrip/sinkron`
**Hanya token service.** Dipanggil Service Nilai lewat gateway. Body:
```json
{ "kelas_id": 1, "kode_mk": "KP70065004", "nama_mk": "Keamanan Informasi", "sks": 3,
  "semester": "Ganjil", "tahun_ajaran": "2026/2027",
  "items": [ { "nim": "227006001", "nilai_angka": 85, "nilai_huruf": "A", "bobot": 4.0 } ] }
```
200 `{ "data": { "upserted": 3 } }` (idempoten: `UNIQUE(nim, kelas_id)`). Deny: `USER_TOKEN_ON_SERVICE_ENDPOINT` (token user mana pun), `SERVICE_NOT_ALLOWED`.

## Audit (ditangani Gateway — D18)

### GET `/audit`
Role **admin** saja. Gateway membaca `audit_logs` langsung (grant `SELECT` khusus `zt_gateway`; tidak lewat service, tanpa `X-Gateway-Secret`). Baris keputusan request ini sendiri (`ADMIN_AUDIT_READ`) sudah tertulis **sebelum** SELECT, sehingga selalu muncul sebagai item pertama.

Query opsional: `limit` (1–200, default 50), `decision` (`allow`|`deny`), `subject_id` (id user atau client_id service).

200:
```json
{ "data": { "items": [ {
  "id": 42, "request_id": "…uuid…", "occurred_at": "2026-10-24T01:00:00.000Z",
  "subject_type": "user", "subject_id": "2", "role": "dosen",
  "method": "PUT", "endpoint": "/nilai/4", "device_id": "DEV-DOSEN-01",
  "decision": "deny", "reason": "NOT_CLASS_OWNER", "ip": "::ffff:172.18.0.1"
} ], "count": 1 } }
```
Urut terbaru dulu (`ORDER BY id DESC`). Deny: `ROLE_NOT_ALLOWED` (mahasiswa/dosen), `SERVICE_TOKEN_ON_USER_ENDPOINT` (token service), `DEVICE_HEADER_MISSING`/`DEVICE_NOT_REGISTERED`; `limit`/`decision` salah → 400 `VALIDATION_ERROR` (baris audit tetap allow — PE memutuskan sebelum validasi query).

## Lainnya

| Endpoint | Akses | Keterangan |
|---|---|---|
| `GET /health` (gateway) | publik | `{status:"ok"}` |
| `GET /docs`, `GET /openapi.json` | publik (bila `SWAGGER_ENABLED`) | Swagger UI & spesifikasi; skema keamanan `bearerAuth` + header `X-Device-ID` |
| `GET /internal/health` (service) | wajib `X-Gateway-Secret` | untuk healthcheck Docker |
