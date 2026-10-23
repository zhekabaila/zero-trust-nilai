-- 02-seed.sql — data awal (HANYA UNTUK DEVELOPMENT/DEMO)
-- Password semua user : Password123!
-- Secret service-nilai: nilai-service-secret-dev
-- Hash bcrypt (cost 10) di bawah sudah diverifikasi cocok dengan nilai di atas.
-- NIM, NIDN, nama, dan kode mata kuliah kedua adalah data fiktif.

SET NAMES utf8mb4;

INSERT INTO users (id, username, password_hash, full_name, role, nim, nidn) VALUES
 (1, 'admin01', '$2b$10$HTtZvjEoQbWXxOuv7XFqYuR2DxI//ykJD5LEsZKXJlz.QhXVGFZnG', 'Admin Prodi Informatika',  'admin',     NULL,        NULL),
 (2, 'dosen01', '$2b$10$HTtZvjEoQbWXxOuv7XFqYuR2DxI//ykJD5LEsZKXJlz.QhXVGFZnG', 'Dr. Budi Santoso',        'dosen',     NULL,        '0401018801'),
 (3, 'dosen02', '$2b$10$HTtZvjEoQbWXxOuv7XFqYuR2DxI//ykJD5LEsZKXJlz.QhXVGFZnG', 'Siti Rahmawati, M.Kom',   'dosen',     NULL,        '0402028502'),
 (4, 'mhs01',   '$2b$10$HTtZvjEoQbWXxOuv7XFqYuR2DxI//ykJD5LEsZKXJlz.QhXVGFZnG', 'Ahmad Fauzi',            'mahasiswa', '227006001', NULL),
 (5, 'mhs02',   '$2b$10$HTtZvjEoQbWXxOuv7XFqYuR2DxI//ykJD5LEsZKXJlz.QhXVGFZnG', 'Dewi Lestari',           'mahasiswa', '227006002', NULL),
 (6, 'mhs03',   '$2b$10$HTtZvjEoQbWXxOuv7XFqYuR2DxI//ykJD5LEsZKXJlz.QhXVGFZnG', 'Rizky Pratama',          'mahasiswa', '227006003', NULL);

INSERT INTO devices (user_id, device_id, label) VALUES
 (1, 'DEV-ADMIN-01',  'Laptop Admin'),
 (2, 'DEV-DOSEN-01',  'Laptop Dosen 01'),
 (3, 'DEV-DOSEN-02',  'Laptop Dosen 02'),
 (4, 'DEV-MHS-01',    'HP Mahasiswa 01'),
 (5, 'DEV-MHS-02',    'HP Mahasiswa 02'),
 (6, 'DEV-MHS-03',    'HP Mahasiswa 03');

INSERT INTO service_clients (client_id, secret_hash, name) VALUES
 ('service-nilai', '$2b$10$cENi6GwbF89cvdbJLfXioOFOQ1xfLbd.Z9coMAeuq2XUgp1j/NPpa', 'Service Nilai');

INSERT INTO mata_kuliah (id, kode, nama, sks) VALUES
 (1, 'KP70065004', 'Keamanan Informasi', 3),
 (2, 'KP70065010', 'Pemrograman Web',    3);

INSERT INTO kelas (id, mata_kuliah_id, dosen_id, nama_kelas, semester, tahun_ajaran) VALUES
 (1, 1, 2, 'A', 'Ganjil', '2026/2027'),   -- Keamanan Informasi  — diampu dosen01
 (2, 2, 3, 'A', 'Ganjil', '2026/2027');   -- Pemrograman Web     — diampu dosen02

-- Skala: A>=85(4.00) A-=80(3.70) B+=75(3.30) B=70(3.00) B-=65(2.70) C+=60(2.30) C=55(2.00) D=40(1.00) E<40(0.00)
INSERT INTO nilai (kelas_id, mahasiswa_id, nilai_angka, nilai_huruf, bobot, status) VALUES
 (1, 4, 85.00, 'A',  4.00, 'DRAFT'),
 (1, 5, 78.00, 'B+', 3.30, 'DRAFT'),
 (1, 6, 90.00, 'A',  4.00, 'DRAFT'),
 (2, 4, 72.00, 'B',  3.00, 'DRAFT'),
 (2, 5, 88.00, 'A',  4.00, 'DRAFT');
