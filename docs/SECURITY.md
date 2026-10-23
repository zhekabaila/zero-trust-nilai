# SECURITY — Model ancaman & keterbatasan

## 1. Pemetaan NIST SP 800-207

| Logical component | Di sistem ini |
|---|---|
| Policy Enforcement Point (PEP) | API Gateway :3000 (`authenticate`, `authorize`, `proxy`) |
| Policy Engine (PE) | `PolicyEngine.decide()` + rule + `PolicyRepository` (atribut dari DB) |
| Policy Administrator (PA) | Modul auth: login, terbit/cabut token (`AuthService`, `TokenService`) |
| Resource | Service Nilai, Service Transkrip, MySQL |
| Data source | `audit_logs`, `users`, `devices`, `kelas`, `nilai` |

## 2. Ancaman → mitigasi

| # | Ancaman | Mitigasi | Test |
|---|---|---|---|
| 1 | Akses langsung ke service (bypass gateway) | `X-Gateway-Secret` wajib di service; port hanya demo | T-GW-01..02 |
| 2 | Klien memalsukan `X-Gateway-Secret` | Gateway menghapus header dari klien, memasang yang asli | T-GW-03 |
| 3 | Gateway secret bocor, token tidak ada | Service tetap verifikasi tanda tangan + `exp` token | T-GW-04..05 |
| 4 | Pemalsuan token / `alg:none` / HS256 confusion | RS256 saja (`algorithms:['RS256']`), cek `iss`, `typ` | T-AUTH-10 |
| 5 | Service bobol lalu mencetak token | Service hanya punya public key | (desain) |
| 6 | Pencurian token | Access 10 menit; refresh dapat dicabut & dirotasi; terikat device | T-AUTH-05..09 |
| 7 | Dosen mengubah nilai kelas orang lain | Rule `NOT_CLASS_OWNER` + guard atomik SQL | T-NIL-05, T-NIL-09 |
| 8 | Mahasiswa melihat nilai/transkrip orang lain | Rule `NOT_OWN_DATA`; Service Nilai menyaring dengan `sub` | T-NIL-02, T-TRN-03 |
| 9 | Token user dipakai ke `/transkrip/sinkron` | Hanya role `service`; token user ditolak | T-TRN-06 |
| 10 | Eskalasi lewat service token (mis. ke `/nilai`) | Role `service` ditolak di endpoint user | T-SVC-04 |
| 11 | Ubah nilai setelah final / balapan dengan finalisasi | Cek status di PE + `WHERE status='DRAFT'` di SQL | T-NIL-07, T-NIL-09 |
| 12 | Perangkat tak dikenal | `X-Device-ID` wajib & terdaftar per user | T-CTX-01..03 |
| 13 | Perubahan nilai di luar jam | `AccessHoursRule` (TZ & rentang dari env) | T-CTX-04..06 |
| 14 | Rute baru lupa diberi kebijakan | Default deny `ROUTE_NOT_REGISTERED` | T-GW-06 |
| 15 | SQL injection | Query terparameter di repository; zod di input | review kode |
| 16 | Kebocoran hash/secret via DB atau log | Grant column-level (tanpa `password_hash` untuk `zt_nilai`); redact log; refresh token disimpan hash | T-DB-01..02 |
| 17 | Brute force login | (stretch) rate limit; pesan error seragam | – |
| 18 | Penghapusan jejak | `zt_gateway` hanya INSERT + SELECT di `audit_logs` (SELECT khusus `GET /audit`); tanpa UPDATE/DELETE, tanpa FK | T-AUD-* |
| 19 | Jejak audit dibaca pihak yang tidak berhak | `GET /audit` hanya rule `audit.list` (admin); non-admin `ROLE_NOT_ALLOWED`, token service `SERVICE_TOKEN_ON_USER_ENDPOINT`; isi baris tanpa rahasia (reason/endpoint saja) | T-AUD-05..06 |

## 3. Aturan implementasi wajib
- Bandingkan secret dengan `crypto.timingSafeEqual` (panjang disamakan dulu lewat hash).
- Jangan pernah log: password, token, refresh token, `X-Gateway-Secret`, client secret.
- Pesan `INVALID_CREDENTIALS` sama untuk user tidak ada dan password salah; lakukan bcrypt compare dummy agar waktu respons mirip.
- Semua SQL terparameter (`?`); dilarang interpolasi string.
- Rahasia hanya dari env/volume; tidak ada di kode atau repo (kecuali seed dev yang ditandai).
- Container berjalan sebagai user non-root.

## 4. Keterbatasan yang diterima (sebutkan di video/README)
- Jaringan antar-container tanpa TLS/mTLS (lingkup lab, satu mesin).
- `X-Gateway-Secret` statis (tanpa rotasi otomatis).
- Respons deny membuka `reason`/`404` sehingga bisa membocorkan keberadaan resource — dipilih agar demo jelas; produksi menyeragamkan.
- Kepemilikan NIM pada `GET /transkrip/:nim` hanya diputuskan PE; Service Transkrip hanya cek role kasar. Opsi penguatan: beri `zt_transkrip` SELECT kolom `(id, nim)` di `users` dan cek ulang di service.
- Akun/secret seed hanya untuk dev; port service dipublish ke localhost hanya untuk demo.
- Tidak ada rate limit/lockout (stretch).
- `GET /audit` membuka metadata lalu-lintas (ip, device_id, pola endpoint) ke role admin — dianggap wajar untuk tinjauan keamanan di lab; produksi biasanya membatasi kolom/akses SIEM.
- phpMyAdmin (`:8081`, localhost-only) mengakses MySQL **di luar** jalur PEP — murni alat lab/demo; di produksi tidak boleh ada, akses data lewat `GET /audit`/API saja.
