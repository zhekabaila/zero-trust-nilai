# DEMO — Skenario video 6–9 menit

Tugas meminta video yang menjelaskan **bagaimana setiap kebutuhan bagian 4 diterapkan dengan menunjukkan bagian kode yang menanganinya**. Setiap segmen: tunjukkan **request**, **hasil + audit log**, lalu **kodenya**. Target total ≈ 8 menit (cadangan 1 menit).

Persiapan sebelum rekam: `docker compose down -v && docker compose up -d --build`; buka Postman/terminal, Swagger `localhost:3000/docs`, editor dengan file di bawah, dan klien DB (phpMyAdmin <http://127.0.0.1:8081>) untuk `SELECT * FROM audit_logs ORDER BY id DESC LIMIT 5`.

| Waktu | Segmen | Tunjukkan (request) | Tunjukkan (kode — path rencana) |
|---|---|---|---|
| 0:00–0:45 | Pembuka & arsitektur | `docker compose ps`; gambar arsitektur | `docker-compose.yml`, `docs/ARCHITECTURE.md` diagram |
| 0:45–2:00 | **4.1 Login & token** | login `dosen01` + device → access (10 mnt) & refresh; decode JWT (sub, role, exp) | `auth.service.ts` (login), `token.service.ts` (RS256, TTL) |
| 2:00–2:45 | **4.1 Refresh & logout** | refresh → token baru; pakai token lama → 401; logout → refresh gagal; lihat `refresh_tokens.revoked_at` | `refresh-token.repository.ts`, `auth.service.ts` (rotasi, revoke) |
| 2:45–3:30 | **4.1 Gateway secret & verifikasi ulang** | `curl :3001/nilai` tanpa secret → 403; dengan secret tanpa token → 401 | `proxy.factory.ts`, `verify-gateway-secret.ts`, `verify-token.ts` |
| 3:30–5:00 | **4.2 Kebijakan akses** (inti) | mhs01 lihat nilai sendiri vs NIM orang lain; dosen01 ubah nilai kelasnya vs kelas dosen02; mhs01 baca transkrip sendiri vs orang lain; admin baca semua | `policy.engine.ts`, `nilai.rules.ts`, `transkrip.rules.ts`, `policy.repository.ts` (atribut dari DB), scoping di `nilai.repository.ts` |
| 5:00–6:00 | **4.2 Finalisasi & token service** | dosen01 finalisasi kelas 1 → SYNCED; admin lihat transkrip; token user ke `/transkrip/sinkron` → 403; `PUT` nilai final → 403 | `kelas.service.ts`, `service-token.provider.ts`, `transkrip-sync.client.ts`, `kelas.rules.ts`, rule `transkrip.sync` |
| 6:00–7:00 | **4.3 Konteks** | device asing → 403; ganti `ACCESS_HOURS_*` lalu `PUT` di luar jam → 403 | `device.rule.ts`, `access-hours.rule.ts`, `config/env.ts` |
| 7:00–7:45 | **4.4 Audit log** | admin `GET /audit` (200; baris allow & deny dengan reason, item pertama = request /audit itu sendiri); query langsung `audit_logs` di klien DB | `audit.rules.ts` (rule admin-only), `audit.routes.ts`+`audit.controller.ts`+`audit.repository.ts` (jalur baca), `audit.service.ts`, `error-handler.ts`, `authorize.ts` |
| 7:45–8:30 | Penutup | Swagger UI sekilas; ringkas: default deny, least privilege DB, RS256, keterbatasan | `docs/SECURITY.md` §4 |

## Tips
- Siapkan token/variabel di Postman agar tidak mengetik panjang; jalankan `scripts/demo.sh` sebagai cadangan bila ada langkah yang meleset.
- Urutan data penting: finalisasi kelas 1 **setelah** demo ubah nilai (nilai jadi FINAL dan tidak bisa diubah lagi). Reset dengan `down -v` bila perlu mengulang.
- Perubahan jam akses butuh restart gateway: `ACCESS_HOURS_START=… ACCESS_HOURS_END=… docker compose up -d gateway`.
- Saat menampilkan kode, soroti **baris keputusan** (mis. `dosen_id === subject.id`), bukan seluruh file.
- Jangan menampilkan isi `.env` atau private key di layar.
