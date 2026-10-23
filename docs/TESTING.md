# TESTING — Matriks pengujian

Kolom **Hasil** = status HTTP + `error.code`. Akun & device: `docs/DATABASE.md` §3. Setiap ID dirujuk dari `PLAN.md` dan `SECURITY.md`.

## 1. Cara menjalankan
- Unit test: `npm test` di tiap app (policy, token, grading, provider token service, IPK).
- Integrasi: `docker compose up -d --build`, lalu `npm run test:integration` di `gateway/` (menembak `localhost:3000`, dan service langsung di `127.0.0.1:3001/3002` untuk T-GW).
- Demo/regresi manual: `scripts/demo.sh` (urutan sama dengan `docs/DEMO.md`) atau `postman/collection.json`.
- Ubah jam akses tanpa edit kode: `ACCESS_HOURS_START=00:00 ACCESS_HOURS_END=23:59 docker compose up -d gateway` (dalam jam) atau rentang yang tidak mencakup waktu sekarang (luar jam).
- Reset data seed antar-skenario: `docker compose down -v && docker compose up -d --build`.
- Klien DB untuk cek `audit_logs` & grant: phpMyAdmin `http://127.0.0.1:8081` (root = semua tabel; `zt_*` = sesuai grant) atau MySQL `127.0.0.1:3307`.

## 2. Auth & token (4.1)

| ID | Skenario | Hasil |
|---|---|---|
| T-AUTH-01 | login `dosen01` + `DEV-DOSEN-01` | 200; `expires_in=600`; JWT berisi `sub`,`role`,`typ=access` |
| T-AUTH-02 | login password salah | 401 `INVALID_CREDENTIALS` |
| T-AUTH-03 | login username tidak ada | 401 `INVALID_CREDENTIALS` (pesan identik T-AUTH-02) |
| T-AUTH-04 | login tanpa `X-Device-ID` / device asing `DEV-UNKNOWN-99` | 403 `DEVICE_HEADER_MISSING` / `DEVICE_NOT_REGISTERED` |
| T-AUTH-05 | refresh valid | 200 pasangan token baru; refresh lama `revoked_at` terisi |
| T-AUTH-06 | refresh dengan token lama (sudah dirotasi) | 401 `REFRESH_REVOKED` |
| T-AUTH-07 | refresh kedaluwarsa (set `expires_at` ke masa lalu) | 401 `REFRESH_EXPIRED` |
| T-AUTH-08 | access token kedaluwarsa dipakai | 401 `TOKEN_EXPIRED` |
| T-AUTH-09 | logout lalu refresh dengan token itu | 204 lalu 401 `REFRESH_REVOKED` |
| T-AUTH-10 | token `alg:none`, HS256, atau tanda tangan rusak | 401 `TOKEN_INVALID` |
| T-AUTH-11 | refresh dari device berbeda dari saat login | 403 `DEVICE_NOT_REGISTERED` |

## 3. Token service (4.1)

| ID | Skenario | Hasil |
|---|---|---|
| T-SVC-01 | `POST /auth/service` kredensial benar | 200; `expires_in=300`; `role=service`, `typ=service` |
| T-SVC-02 | secret salah | 401 `CLIENT_INVALID` |
| T-SVC-03 | client_id tidak dikenal | 401 `CLIENT_INVALID` |
| T-SVC-04 | token service dipakai ke `GET /nilai` | 403 `SERVICE_TOKEN_ON_USER_ENDPOINT` |

## 4. Gateway secret & verifikasi ulang (4.1)

| ID | Skenario | Hasil |
|---|---|---|
| T-GW-01 | `curl 127.0.0.1:3001/nilai` tanpa secret | 403 `GATEWAY_SECRET_INVALID` |
| T-GW-02 | `curl 127.0.0.1:3002/transkrip/227006001` tanpa secret | 403 `GATEWAY_SECRET_INVALID` |
| T-GW-03 | langsung ke service dengan secret **palsu**; dan via gateway dengan header `X-Gateway-Secret` palsu dari klien | 403 langsung; via gateway diabaikan (diganti secret asli) sehingga hasil mengikuti kebijakan |
| T-GW-04 | langsung ke service dengan secret **benar** tanpa token | 401 `TOKEN_MISSING` |
| T-GW-05 | secret benar + token kedaluwarsa / tanda tangan rusak | 401 `TOKEN_EXPIRED` / `TOKEN_INVALID` |
| T-GW-06 | `GET /foo` (tak terdaftar) dengan token valid | 403 `ROUTE_NOT_REGISTERED` |
| T-GW-07 | endpoint non-`/auth` tanpa token | 401 `TOKEN_MISSING` |

## 5. Konteks (4.3)

| ID | Skenario | Hasil |
|---|---|---|
| T-CTX-01 | request user tanpa `X-Device-ID` | 403 `DEVICE_HEADER_MISSING` |
| T-CTX-02 | device tidak terdaftar | 403 `DEVICE_NOT_REGISTERED` |
| T-CTX-03 | mhs01 memakai `DEV-MHS-02` (milik user lain) | 403 `DEVICE_NOT_REGISTERED` |
| T-CTX-04 | `PUT /nilai/1` saat dalam jam akses | 200 |
| T-CTX-05 | `PUT /nilai/1` di luar jam akses | 403 `OUTSIDE_ACCESS_HOURS` |
| T-CTX-06 | finalisasi di luar jam → 403; `GET /nilai` di luar jam tetap 200 | hanya ubah/finalisasi dibatasi |
| (unit) | batas: 07:00:00 allow, 20:59:59 allow, 21:00:00 deny, TZ `Asia/Jakarta` | |

## 6. Nilai, Kelas, Transkrip (4.2)

| ID | Aktor | Skenario | Hasil |
|---|---|---|---|
| T-NIL-01 | mhs01 | `GET /nilai` | 200 hanya 2 nilai miliknya |
| T-NIL-02 | mhs01 | `GET /nilai?nim=227006002` | 403 `NOT_OWN_DATA` |
| T-NIL-03 | dosen01 | `GET /nilai` | 200 hanya kelas 1 (3 baris) |
| T-NIL-04 | dosen01 | `GET /nilai?kelas_id=2` | 403 `NOT_CLASS_OWNER` |
| T-NIL-05 | dosen01 | `PUT /nilai/4` (kelas dosen02) | 403 `NOT_CLASS_OWNER` |
| T-NIL-06 | dosen01 | `PUT /nilai/1` `{nilai_angka:88}` | 200; huruf `A`, bobot 4.0 |
| T-NIL-07 | dosen01 | `PUT` pada nilai yang sudah FINAL | 403 `GRADE_ALREADY_FINAL` |
| T-NIL-08 | mhs01 / admin | `PUT /nilai/1`; admin `GET /nilai` | 403 `ROLE_NOT_ALLOWED` |
| T-NIL-09 | (lewat service langsung, secret+token valid) | update nilai FINAL atau kelas bukan miliknya | ditolak guard SQL (`affectedRows=0`) walau PE dilewati |
| T-NIL-10 | dosen01 | body `{nilai_angka:101}` / `"abc"` | 400 `VALIDATION_ERROR` |
| T-NIL-11 | dosen01 | `PUT /nilai/9999` | 404 `RESOURCE_NOT_FOUND` |
| T-KLS-01 | dosen01 | `POST /kelas/1/finalisasi` | 200 `sync_status=SYNCED`; transkrip terisi |
| T-KLS-02 | dosen02 | finalisasi kelas 1 | 403 `NOT_CLASS_OWNER` |
| T-KLS-03 | dosen01 | finalisasi ulang | 409 `ALREADY_FINALIZED` |
| T-KLS-04 | dosen01 | ada `nilai_angka` NULL | 422 `GRADES_INCOMPLETE` |
| T-KLS-05 | dosen01 | matikan Transkrip → finalisasi; nyalakan → ulang | 502 `SYNC_FAILED` (`sync_status=FAILED`) → 200 `SYNCED` |
| T-KLS-06 | mhs01 | finalisasi | 403 `ROLE_NOT_ALLOWED` |
| T-KLS-07 | dosen01 | `POST /kelas/9999/finalisasi` | 404 `RESOURCE_NOT_FOUND` |
| T-TRN-01 | mhs01 | `GET /transkrip/227006001` (setelah final) | 200 |
| T-TRN-02 | admin01 | `GET /transkrip/:nim` untuk NIM mana pun | 200 |
| T-TRN-03 | mhs01 | `GET /transkrip/227006002` | 403 `NOT_OWN_DATA` |
| T-TRN-04 | dosen01 | `GET /transkrip/:nim` | 403 `ROLE_NOT_ALLOWED` |
| T-TRN-05 | token service | `GET /transkrip/:nim` | 403 `SERVICE_TOKEN_ON_USER_ENDPOINT` |
| T-TRN-06 | admin/dosen/mhs | `POST /transkrip/sinkron` | 403 `USER_TOKEN_ON_SERVICE_ENDPOINT` |
| T-TRN-07 | token service | `POST /transkrip/sinkron` dua kali, payload sama | 200 keduanya; jumlah baris `transkrip` tetap |
| T-TRN-08 | (unit) | IPK = Σ(bobot×sks)/Σ(sks), 2 desimal | |

## 7. Audit & DB (4.4)

| ID | Skenario | Hasil |
|---|---|---|
| T-AUD-01 | setiap request di atas (allow, deny, 401, login) | tepat 1 baris `audit_logs` dengan waktu, subjek, endpoint, device, hasil, alasan |
| T-AUD-02 | bandingkan `reason` audit dengan `error.code` respons | identik |
| T-AUD-03 | cari password/token di tabel audit dan log container | tidak ada |
| T-AUD-04 | admin01 `GET /audit` | 200; items urut terbaru; item pertama = request ini sendiri (`/audit`, allow, `ADMIN_AUDIT_READ`) |
| T-AUD-05 | dosen01 / mhs01 / admin01 tanpa `X-Device-ID` → `GET /audit` | 403 `ROLE_NOT_ALLOWED` (dosen/mhs); 403 `DEVICE_HEADER_MISSING` (admin tanpa header) |
| T-AUD-06 | token service → `GET /audit` | 403 `SERVICE_TOKEN_ON_USER_ENDPOINT` |
| T-AUD-07 | admin `GET /audit?decision=deny&subject_id=2&limit=5` | 200; semua item deny, subject "2", ≤5 baris. `?limit=0`/`?decision=xxx` → 400 `VALIDATION_ERROR` (baris audit request ini tetap allow — PE sebelum validasi) |
| T-DB-01 | login sebagai `zt_nilai`: `SELECT password_hash FROM users` | ditolak |
| T-DB-02 | login sebagai `zt_transkrip`: `SELECT * FROM users` | ditolak |
