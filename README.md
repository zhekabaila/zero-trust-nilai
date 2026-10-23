# Sistem Nilai — Zero Trust Security

Tugas Praktikum Individu · Keamanan Informasi (KP70065004) · Informatika Universitas Siliwangi.
API Gateway (PEP) + Policy Engine, Service Nilai, Service Transkrip, MySQL, audit log — semuanya via Docker Compose.

Implementasi selesai: matriks uji `docs/TESTING.md` lulus semua (71 unit + 43 integrasi). Skenario demo video ada di `docs/DEMO.md`; jalankan otomatis lewat `scripts/demo.sh` atau manual via Postman (`postman/collection.json`) / Swagger UI.

## Menjalankan
Prasyarat: Docker + Docker Compose.

```bash
cp .env.example .env        # ubah password & GATEWAY_SECRET
docker compose up -d --build
docker compose ps           # semua healthy
```
- Gateway: <http://localhost:3000> · Swagger UI: <http://localhost:3000/docs>
- phpMyAdmin (inspeksi DB, localhost-only): <http://127.0.0.1:8081> — login `root` + `MYSQL_ROOT_PASSWORD` dari `.env`, atau login `zt_nilai`/`zt_transkrip` untuk melihat pembatasan grant (T-DB-01/02). Alat lab di luar jalur PEP; hapus di produksi.
- Reset data: `docker compose down -v && docker compose up -d --build`
- Log: `docker compose logs -f gateway`

## Pengujian
```bash
cd gateway && npm test              # unit Policy Engine, jam akses, token
cd service-nilai && npm test        # unit grading, service, finalisasi, provider token
cd service-transkrip && npm test    # unit IPK
cd gateway && npm run test:integration   # 43 uji end-to-end ke stack Docker (butuh stack seed baru)
```
Sebelum integrasi/demo yang memfinalisasi kelas, reset seed: `docker compose down -v && docker compose up -d --build`.

## Akun seed (password semua user: `Password123!`)
| Username | Role | Device ID terdaftar | Keterangan |
|---|---|---|---|
| `admin01` | admin | `DEV-ADMIN-01` | |
| `dosen01` | dosen | `DEV-DOSEN-01` | mengampu kelas 1 (Keamanan Informasi) |
| `dosen02` | dosen | `DEV-DOSEN-02` | mengampu kelas 2 (Pemrograman Web) |
| `mhs01` | mahasiswa | `DEV-MHS-01` | NIM 227006001 |
| `mhs02` | mahasiswa | `DEV-MHS-02` | NIM 227006002 |
| `mhs03` | mahasiswa | `DEV-MHS-03` | NIM 227006003 |

Device tidak terdaftar untuk uji negatif: `DEV-UNKNOWN-99`. Client service: `service-nilai` / `nilai-service-secret-dev` (dev saja).

## Contoh cepat
```bash
# 1. login dosen01 → simpan access token
TOKEN=$(curl -s -X POST localhost:3000/auth/login \
  -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-DOSEN-01' \
  -d '{"username":"dosen01","password":"Password123!"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).access_token))")

# 2. lihat nilai kelas yang diampu
curl -s localhost:3000/nilai -H "Authorization: Bearer $TOKEN" -H 'X-Device-ID: DEV-DOSEN-01'

# 3. ubah nilai (hanya dalam jam akses 07:00–21:00)
curl -s -X PUT localhost:3000/nilai/1 \
  -H "Authorization: Bearer $TOKEN" -H 'X-Device-ID: DEV-DOSEN-01' \
  -H 'Content-Type: application/json' -d '{"nilai_angka":88}'

# 4. finalisasi kelas 1 → service token memanggil sinkron transkrip otomatis
curl -s -X POST localhost:3000/kelas/1/finalisasi \
  -H "Authorization: Bearer $TOKEN" -H 'X-Device-ID: DEV-DOSEN-01'

# 5. baca transkrip (login sebagai mahasiswa)
MTOKEN=$(curl -s -X POST localhost:3000/auth/login \
  -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-MHS-01' \
  -d '{"username":"mhs01","password":"Password123!"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).access_token))")
curl -s localhost:3000/transkrip/227006001 -H "Authorization: Bearer $MTOKEN" -H 'X-Device-ID: DEV-MHS-01'

# 6. baca audit trail (hanya admin)
ADMIN_TOKEN=$(curl -s -X POST localhost:3000/auth/login \
  -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-ADMIN-01' \
  -d '{"username":"admin01","password":"Password123!"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).access_token))")
curl -s "localhost:3000/audit?limit=10" -H "Authorization: Bearer $ADMIN_TOKEN" -H 'X-Device-ID: DEV-ADMIN-01'

# 7. akses langsung ke service tanpa secret (harus ditolak 403)
curl -i 127.0.0.1:3001/nilai
```

## Jam akses
Ubah/finalisasi nilai hanya `07:00–21:00` (`Asia/Jakarta`, rentang `[mulai, selesai)`). Atur lewat `.env`: `ACCESS_HOURS_START`, `ACCESS_HOURS_END`, `ACCESS_HOURS_TZ`, lalu `docker compose up -d gateway`.

## Struktur & dokumentasi
`gateway/` · `service-nilai/` · `service-transkrip/` · `db/init/` · `docs/` (ARCHITECTURE, DATABASE, API, SECURITY, TESTING, DEMO) · `PLAN.md` · `AGENTS.md`

## Keterbatasan
Lihat `docs/SECURITY.md` §4 (tanpa TLS antar-container, secret gateway statis, seed hanya untuk dev, port service dibuka ke localhost hanya untuk demo).
