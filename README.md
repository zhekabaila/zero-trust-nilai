# Sistem Nilai — Zero Trust Security

Sistem manajemen nilai akademik yang dibangun dengan pendekatan **Zero Trust** (NIST SP 800-207): setiap request diverifikasi penuh pada setiap hop — tidak ada kepercayaan berdasarkan asal jaringan, identitas service, maupun posisi di dalam sistem. Semua komponen berjalan dalam satu `docker compose up`.

## Komponen

| Komponen | Peran |
|---|---|
| **API Gateway** (:3000) | Satu-satunya pintu masuk. Policy Enforcement Point (PEP): verifikasi JWT RS256 (`iss`, `typ`, `exp`), Policy Engine *default deny* per tabel rute, audit setiap keputusan, proxy ke backend dengan secret internal. |
| **Service Nilai** (:3001) | CRUD nilai & finalisasi kelas. Menolak request tanpa `X-Gateway-Secret` **dan** memverifikasi ulang token — backend tidak pernah percaya mentah-mentah. |
| **Service Transkrip** (:3002) | Transkrip & sinkronisasi hasil finalisasi. Pola verifikasi sama; satu-satunya penulis adalah jalur service-to-service ber-token khusus. |
| **MySQL 8.4** | User & grant terpisah per komponen (least privilege); guard kepemilikan ditegakkan atomik di SQL. |
| **Audit log** | Satu baris per request (allow & deny, dengan reason code), append-only — tidak ada UPDATE/DELETE. |

## Prinsip yang ditegakkan

- **Default deny** — rute yang tidak terdaftar di tabel kebijakan selalu ditolak (`ROUTE_NOT_REGISTERED`), termasuk endpoint health service.
- **Keputusan dari atribut, bukan dari token** — kepemilikan kelas, NIM, dan role dibaca ulang dari DB saat evaluasi kebijakan.
- **Token bertipe** — token user (`typ=access`) dan token service (`typ=service`, umur 5 menit) tidak saling menggantikan; token service hanya berlaku pada satu endpoint sinkronisasi.
- **Device binding** — setiap request wajib menyertakan `X-Device-ID` yang terdaftar untuk user tersebut.
- **Jam akses** — ubah/finalisasi nilai hanya pada jendela waktu yang dikonfigurasi.
- **Defense in depth** — gateway memutuskan, service memverifikasi ulang, dan SQL meng-guard atomik (`UPDATE ... AND status='DRAFT' AND dosen_id=?`).
- **Audit lengkap** — termasuk kegagalan 401/403; admin dapat membaca trail lewat `GET /audit`, dan trail tidak bisa dimanipulasi oleh user DB mana pun selain append.

## Menjalankan
Prasyarat: Docker + Docker Compose.

```bash
cp .env.example .env        # ubah password & GATEWAY_SECRET
docker compose up -d --build
docker compose ps           # semua healthy
```
- Gateway: <http://localhost:3000> · Swagger UI: <http://localhost:3000/docs>
- phpMyAdmin (inspeksi DB, localhost-only): <http://127.0.0.1:8081> — login `root` + `MYSQL_ROOT_PASSWORD` dari `.env`, atau login `zt_nilai`/`zt_transkrip` untuk melihat pembatasan grant antar user. Alat lab; hapus di produksi.
- Reset data: `docker compose down -v && docker compose up -d --build`
- Log: `docker compose logs -f gateway`

## Pengujian
```bash
cd gateway && npm test              # unit Policy Engine, jam akses, token
cd service-nilai && npm test        # unit grading, service, finalisasi, provider token
cd service-transkrip && npm test    # unit IPK
cd gateway && npm run test:integration   # uji end-to-end ke stack Docker (butuh stack seed baru)
```
Sebelum integrasi yang memfinalisasi kelas, reset seed: `docker compose down -v && docker compose up -d --build`.

Skenario demo siap-jalan ada di `scripts/demo.sh`; koleksi Postman di `postman/collection.json` (folder terakhir berisi urutan demo lengkap).

## Akun seed (password semua user: `Password123!`)
| Username | Role | Device ID terdaftar | Keterangan |
|---|---|---|---|
| `admin01` | admin | `DEV-ADMIN-01` | baca semua transkrip + audit trail |
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

## Struktur
`gateway/` · `service-nilai/` · `service-transkrip/` · `db/init/` · `scripts/` · `postman/`

## Keterbatasan
Tanpa TLS antar-container, secret gateway statis, seed hanya untuk dev, dan port service dibuka ke localhost hanya untuk menguji penolakan akses langsung. Semua koneksi diasumsikan jaringan lab yang terisolasi.
