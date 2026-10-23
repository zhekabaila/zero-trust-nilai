#!/bin/bash
# 03-grants.sh — satu user database per komponen, hak akses minimum (least privilege).
# Dijalankan oleh entrypoint mysql; variabel diambil dari environment container mysql.
set -euo pipefail

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE USER 'zt_gateway'@'%'    IDENTIFIED BY '${ZT_GATEWAY_DB_PASSWORD}';
CREATE USER 'zt_nilai'@'%'      IDENTIFIED BY '${ZT_NILAI_DB_PASSWORD}';
CREATE USER 'zt_transkrip'@'%'  IDENTIFIED BY '${ZT_TRANSKRIP_DB_PASSWORD}';

-- Gateway (PEP + PE/PA): baca atribut untuk keputusan, kelola token, tulis & baca audit.
-- audit_logs: SELECT diperlukan untuk GET /audit (admin via gateway). Tetap tanpa UPDATE/DELETE (anti-tamper).
GRANT SELECT                 ON ${MYSQL_DATABASE}.users           TO 'zt_gateway'@'%';
GRANT SELECT                 ON ${MYSQL_DATABASE}.devices         TO 'zt_gateway'@'%';
GRANT SELECT                 ON ${MYSQL_DATABASE}.service_clients TO 'zt_gateway'@'%';
GRANT SELECT                 ON ${MYSQL_DATABASE}.kelas           TO 'zt_gateway'@'%';
GRANT SELECT                 ON ${MYSQL_DATABASE}.nilai           TO 'zt_gateway'@'%';
GRANT SELECT, INSERT, UPDATE ON ${MYSQL_DATABASE}.refresh_tokens  TO 'zt_gateway'@'%';
GRANT SELECT, INSERT         ON ${MYSQL_DATABASE}.audit_logs      TO 'zt_gateway'@'%';

-- Service Nilai: kelola nilai/kelas; tidak boleh melihat password_hash.
GRANT SELECT (id, username, full_name, role, nim) ON ${MYSQL_DATABASE}.users TO 'zt_nilai'@'%';
GRANT SELECT                 ON ${MYSQL_DATABASE}.mata_kuliah     TO 'zt_nilai'@'%';
GRANT SELECT, UPDATE         ON ${MYSQL_DATABASE}.kelas           TO 'zt_nilai'@'%';
GRANT SELECT, UPDATE         ON ${MYSQL_DATABASE}.nilai           TO 'zt_nilai'@'%';

-- Service Transkrip: hanya tabel transkrip.
GRANT SELECT, INSERT, UPDATE ON ${MYSQL_DATABASE}.transkrip       TO 'zt_transkrip'@'%';

FLUSH PRIVILEGES;
SQL
