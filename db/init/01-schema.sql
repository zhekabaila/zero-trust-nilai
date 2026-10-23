-- 01-schema.sql — skema Sistem Nilai Zero Trust (MySQL 8.4)
-- Dijalankan otomatis oleh image mysql saat volume data masih kosong.
-- Semua waktu disimpan UTC (mysql dijalankan dengan --default-time-zone=+00:00).

SET NAMES utf8mb4;

-- ---------------------------------------------------------------- identitas
CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)  NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  full_name     VARCHAR(100) NOT NULL,
  role          ENUM('mahasiswa','dosen','admin') NOT NULL,
  nim           VARCHAR(20)  NULL,
  nidn          VARCHAR(20)  NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_nim (nim),
  UNIQUE KEY uq_users_nidn (nidn),
  CONSTRAINT chk_users_nim CHECK (
    (role = 'mahasiswa' AND nim IS NOT NULL) OR (role <> 'mahasiswa' AND nim IS NULL)
  )
) ENGINE=InnoDB;

CREATE TABLE devices (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  device_id  VARCHAR(64)  NOT NULL,
  label      VARCHAR(100) NULL,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_devices_user_device (user_id, device_id),
  CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE refresh_tokens (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED    NOT NULL,
  device_id  VARCHAR(64)     NOT NULL,
  token_hash CHAR(64)        NOT NULL,            -- SHA-256 hex dari token mentah
  expires_at DATETIME        NOT NULL,
  revoked_at DATETIME        NULL,
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_token_hash (token_hash),
  KEY idx_refresh_user (user_id),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE service_clients (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id   VARCHAR(50)  NOT NULL,
  secret_hash VARCHAR(100) NOT NULL,
  name        VARCHAR(100) NOT NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_service_client_id (client_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- domain nilai
CREATE TABLE mata_kuliah (
  id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  kode  VARCHAR(20)  NOT NULL,
  nama  VARCHAR(100) NOT NULL,
  sks   TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mk_kode (kode)
) ENGINE=InnoDB;

CREATE TABLE kelas (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  mata_kuliah_id INT UNSIGNED NOT NULL,
  dosen_id       INT UNSIGNED NOT NULL,
  nama_kelas     VARCHAR(10)  NOT NULL,
  semester       ENUM('Ganjil','Genap') NOT NULL,
  tahun_ajaran   VARCHAR(9)   NOT NULL,            -- contoh: 2026/2027
  finalized_at   DATETIME     NULL,
  sync_status    ENUM('NONE','PENDING','SYNCED','FAILED') NOT NULL DEFAULT 'NONE',
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_kelas (mata_kuliah_id, nama_kelas, semester, tahun_ajaran),
  KEY idx_kelas_dosen (dosen_id),
  CONSTRAINT fk_kelas_mk    FOREIGN KEY (mata_kuliah_id) REFERENCES mata_kuliah (id),
  CONSTRAINT fk_kelas_dosen FOREIGN KEY (dosen_id)       REFERENCES users (id)
) ENGINE=InnoDB;

CREATE TABLE nilai (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  kelas_id     INT UNSIGNED NOT NULL,
  mahasiswa_id INT UNSIGNED NOT NULL,
  nilai_angka  DECIMAL(5,2) NULL,
  nilai_huruf  VARCHAR(2)   NULL,
  bobot        DECIMAL(3,2) NULL,
  status       ENUM('DRAFT','FINAL') NOT NULL DEFAULT 'DRAFT',
  updated_by   INT UNSIGNED NULL,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_nilai_kelas_mhs (kelas_id, mahasiswa_id),
  KEY idx_nilai_mhs (mahasiswa_id),
  CONSTRAINT fk_nilai_kelas FOREIGN KEY (kelas_id)     REFERENCES kelas (id),
  CONSTRAINT fk_nilai_mhs   FOREIGN KEY (mahasiswa_id) REFERENCES users (id),
  CONSTRAINT chk_nilai_angka CHECK (nilai_angka IS NULL OR (nilai_angka >= 0 AND nilai_angka <= 100))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- domain transkrip
-- Snapshot nilai final. Sengaja tanpa FK ke kelas/users: batas antar-service.
CREATE TABLE transkrip (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nim          VARCHAR(20)  NOT NULL,
  kelas_id     INT UNSIGNED NOT NULL,
  kode_mk      VARCHAR(20)  NOT NULL,
  nama_mk      VARCHAR(100) NOT NULL,
  sks          TINYINT UNSIGNED NOT NULL,
  semester     ENUM('Ganjil','Genap') NOT NULL,
  tahun_ajaran VARCHAR(9)   NOT NULL,
  nilai_angka  DECIMAL(5,2) NOT NULL,
  nilai_huruf  VARCHAR(2)   NOT NULL,
  bobot        DECIMAL(3,2) NOT NULL,
  synced_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_transkrip_nim_kelas (nim, kelas_id),
  KEY idx_transkrip_nim (nim)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- audit
-- Sengaja tanpa FK: log harus tetap utuh walau user dihapus.
CREATE TABLE audit_logs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id   CHAR(36)     NOT NULL,
  occurred_at  DATETIME(3)  NOT NULL,
  subject_type ENUM('user','service','anonymous') NOT NULL,
  subject_id   VARCHAR(64)  NULL,
  role         VARCHAR(20)  NULL,
  method       VARCHAR(10)  NOT NULL,
  endpoint     VARCHAR(255) NOT NULL,
  device_id    VARCHAR(64)  NULL,
  decision     ENUM('allow','deny') NOT NULL,
  reason       VARCHAR(64)  NOT NULL,
  ip           VARCHAR(45)  NULL,
  PRIMARY KEY (id),
  KEY idx_audit_time (occurred_at),
  KEY idx_audit_subject (subject_id),
  KEY idx_audit_decision (decision),
  KEY idx_audit_request (request_id)
) ENGINE=InnoDB;
