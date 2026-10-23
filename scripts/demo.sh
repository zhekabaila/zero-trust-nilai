#!/usr/bin/env bash
# scripts/demo.sh — urutan sama dengan docs/DEMO.md; cadangan saat rekaman video.
# Prasyarat: `docker compose up -d --build` dari data seed baru (down -v bila perlu mengulang).
# Catatan: jangan menampilkan .env / private key di layar.
set -uo pipefail
cd "$(dirname "$0")/.."

GW=http://localhost:3000
NILAI=http://127.0.0.1:3001
PWD_DEV='Password123!'

step() { printf '\n\033[1m=== %s\033[0m\n' "$1"; }
show() { printf '\033[2m$ %s\033[0m\n' "$1"; }

jget() { # jget <json> <path dotted>
  printf '%s' "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const o=JSON.parse(d);console.log(process.argv[1].split('.').reduce((a,k)=>a?.[k],o)??'')}catch{console.log('')}})" "$2"
}

do_login() { # do_login <user> <device> -> echoes access token
  local resp
  resp=$(curl -s -X POST "$GW/auth/login" -H 'Content-Type: application/json' -H "X-Device-ID: $2" -d "{\"username\":\"$1\",\"password\":\"$PWD_DEV\"}")
  jget "$resp" access_token
}

step "0. Status container"
docker compose ps

# Di luar jam akses 07:00–21:00 WIB, segmen ubah/finalisasi akan deny OUTSIDE_ACCESS_HOURS.
# Buka window sementara (restore ke default .env terjadi di langkah 6).
NOW_WIB=$((10#$(TZ=Asia/Jakarta date +%H%M)))
if [ "$NOW_WIB" -lt 700 ] || [ "$NOW_WIB" -ge 2100 ]; then
  step "0b. Sekarang $(TZ=Asia/Jakarta date +%H:%M) WIB — di luar jam akses; gateway dibuka sementara 00:00–23:59"
  ACCESS_HOURS_START=00:00 ACCESS_HOURS_END=23:59 docker compose up -d --no-build gateway >/dev/null 2>&1
  for _ in $(seq 1 30); do curl -sf "$GW/health" >/dev/null && break; sleep 1; done
fi

step "1. (4.1) Login dosen01 + decode klaim JWT (sub, role, typ, exp)"
show "POST $GW/auth/login (dosen01, DEV-DOSEN-01)"
RESP=$(curl -s -X POST "$GW/auth/login" -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-DOSEN-01' -d "{\"username\":\"dosen01\",\"password\":\"$PWD_DEV\"}")
DT=$(jget "$RESP" access_token); RT=$(jget "$RESP" refresh_token)
echo "expires_in=$(jget "$RESP" expires_in) user.role=$(jget "$RESP" user.role)"
echo "$DT" | node -e "let t='';process.stdin.on('data',c=>t+=c).on('end',()=>{const p=JSON.parse(Buffer.from(t.trim().split('.')[1],'base64url').toString());console.log('claims:',JSON.stringify({sub:p.sub,role:p.role,typ:p.typ,iss:p.iss,exp:p.exp}))})"

step "2. (4.1) Refresh: token baru; token lama ditolak; logout mencabut"
show "POST $GW/auth/refresh"
R2=$(curl -s -X POST "$GW/auth/refresh" -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-DOSEN-01' -d "{\"refresh_token\":\"$RT\"}")
DT=$(jget "$R2" access_token)
show "POST $GW/auth/refresh (token lama yang sudah dirotasi)"
curl -s -X POST "$GW/auth/refresh" -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-DOSEN-01' -d "{\"refresh_token\":\"$RT\"}"; echo
show "POST $GW/auth/logout"
curl -s -o /dev/null -w 'logout: %{http_code}\n' -X POST "$GW/auth/logout" -H 'Content-Type: application/json' -d "{\"refresh_token\":\"$(jget "$R2" refresh_token)\"}"
# token dosen untuk langkah berikutnya (login ulang singkat)
DT=$(do_login dosen01 DEV-DOSEN-01)

step "3. (4.1) Gateway secret: akses langsung ke service ditolak"
show "GET $NILAI/nilai tanpa X-Gateway-Secret"
curl -s "$NILAI/nilai" | head -c 200; echo
show "GET $NILAI/nilai dengan secret, tanpa token"
SECRET=$(grep '^GATEWAY_SECRET=' .env | cut -d= -f2)
curl -s "$NILAI/nilai" -H "X-Gateway-Secret: $SECRET" | head -c 200; echo

step "4. (4.2) Kebijakan akses — nilai"
MT=$(do_login mhs01 DEV-MHS-01)
show "mhs01 GET $GW/nilai (milik sendiri → 200)"
curl -s "$GW/nilai" -H "Authorization: Bearer $MT" -H 'X-Device-ID: DEV-MHS-01' | head -c 300; echo
show "mhs01 GET '/nilai?nim=227006002' (NIM orang lain → 403 NOT_OWN_DATA)"
curl -s "$GW/nilai?nim=227006002" -H "Authorization: Bearer $MT" -H 'X-Device-ID: DEV-MHS-01'; echo
show "dosen01 PUT /nilai/1 {88} (kelasnya → 200)"
curl -s -X PUT "$GW/nilai/1" -H "Authorization: Bearer $DT" -H 'X-Device-ID: DEV-DOSEN-01' -H 'Content-Type: application/json' -d '{"nilai_angka":88}'; echo
show "dosen01 PUT /nilai/4 (kelas dosen02 → 403 NOT_CLASS_OWNER)"
curl -s -X PUT "$GW/nilai/4" -H "Authorization: Bearer $DT" -H 'X-Device-ID: DEV-DOSEN-01' -H 'Content-Type: application/json' -d '{"nilai_angka":88}'; echo

step "5. (4.2) Finalisasi kelas 1 → token service → sinkron transkrip"
show "dosen01 POST /kelas/1/finalisasi"
curl -s -X POST "$GW/kelas/1/finalisasi" -H "Authorization: Bearer $DT" -H 'X-Device-ID: DEV-DOSEN-01'; echo
AT=$(do_login admin01 DEV-ADMIN-01)
show "admin GET /transkrip/227006001 (ADMIN_ALL)"
curl -s "$GW/transkrip/227006001" -H "Authorization: Bearer $AT" -H 'X-Device-ID: DEV-ADMIN-01'; echo
show "mhs01 POST /transkrip/sinkron (token user di endpoint service → 403)"
curl -s -X POST "$GW/transkrip/sinkron" -H "Authorization: Bearer $MT" -H 'X-Device-ID: DEV-MHS-01' -H 'Content-Type: application/json' -d '{"kelas_id":1,"kode_mk":"X","nama_mk":"X","sks":3,"semester":"Ganjil","tahun_ajaran":"2026/2027","items":[]}'; echo
show "dosen01 PUT /nilai/1 (sudah FINAL → 403)"
curl -s -X PUT "$GW/nilai/1" -H "Authorization: Bearer $DT" -H 'X-Device-ID: DEV-DOSEN-01' -H 'Content-Type: application/json' -d '{"nilai_angka":90}'; echo

step "6. (4.3) Device asing & jam akses"
show "mhs01 GET /nilai memakai DEV-DOSEN-01 (device user lain → 403)"
curl -s "$GW/nilai" -H "Authorization: Bearer $MT" -H 'X-Device-ID: DEV-DOSEN-01'; echo
show "Restart gateway di luar jam akses (00:00–00:01) lalu PUT"
ACCESS_HOURS_START=00:00 ACCESS_HOURS_END=00:01 docker compose up -d --no-build gateway >/dev/null 2>&1
for _ in $(seq 1 30); do curl -sf "$GW/health" >/dev/null && break; sleep 1; done
D2=$(do_login dosen02 DEV-DOSEN-02)
curl -s -X PUT "$GW/nilai/5" -H "Authorization: Bearer $D2" -H 'X-Device-ID: DEV-DOSEN-02' -H 'Content-Type: application/json' -d '{"nilai_angka":80}'; echo
show "Kembalikan window normal"
docker compose up -d --no-build gateway >/dev/null 2>&1
for _ in $(seq 1 30); do curl -sf "$GW/health" >/dev/null && break; sleep 1; done

step "7. (4.4) Audit log — baris allow & deny"
show "admin GET /audit?limit=8 (endpoint audit trail, admin-only)"
curl -s "$GW/audit?limit=8" -H "Authorization: Bearer $AT" -H 'X-Device-ID: DEV-ADMIN-01' | head -c 400; echo
show "mahasiswa GET /audit (harus ditolak ROLE_NOT_ALLOWED)"
curl -s "$GW/audit" -H "Authorization: Bearer $MT" -H 'X-Device-ID: DEV-MHS-01'; echo
show "SELECT ... FROM audit_logs ORDER BY id DESC LIMIT 8"
docker compose exec -T mysql mysql -uroot -p"$(grep '^MYSQL_ROOT_PASSWORD=' .env | cut -d= -f2)" zerotrust -e \
  "SELECT occurred_at, subject_id, endpoint, decision, reason FROM audit_logs ORDER BY id DESC LIMIT 8;" 2>/dev/null

step "Selesai — Swagger: $GW/docs · Kode yang dipasangkan tiap langkah: lihat docs/DEMO.md"
