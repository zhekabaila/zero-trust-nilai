import { AccessDeniedError } from '../../common/errors/access-denied.error.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import { Reason } from '../../common/errors/reason-codes.js';
import type { Subject } from '../../common/auth/subject.js';
import { NilaiRepository, type NilaiView } from './nilai.repository.js';
import { toGrade } from './grading.js';

export interface NilaiDto {
  id: number;
  kelas_id: number;
  mata_kuliah: { kode: string; nama: string; sks: number };
  nim: string;
  nama_mahasiswa: string;
  nilai_angka: number | null;
  nilai_huruf: string | null;
  status: 'DRAFT' | 'FINAL';
}

export interface NilaiUpdateDto {
  id: number;
  kelas_id: number;
  nilai_angka: number | null;
  nilai_huruf: string | null;
  bobot: number | null;
  status: 'DRAFT' | 'FINAL';
}

function toDto(v: NilaiView): NilaiDto {
  return {
    id: v.id,
    kelas_id: v.kelasId,
    mata_kuliah: { kode: v.kode, nama: v.nama, sks: v.sks },
    nim: v.nim,
    nama_mahasiswa: v.namaMahasiswa,
    nilai_angka: v.nilaiAngka,
    nilai_huruf: v.nilaiHuruf,
    status: v.status,
  };
}

export class NilaiService {
  constructor(private readonly repo: NilaiRepository) {}

  async list(subject: Subject, query: { nim?: string; kelas_id?: string }): Promise<NilaiDto[]> {
    if (subject.type === 'user' && subject.role === 'mahasiswa') {
      // Defense in depth: always scoped to the token subject, ignoring any nim.
      const rows = await this.repo.listForMahasiswa(subject.id);
      return rows.map(toDto);
    }
    if (subject.type === 'user' && subject.role === 'dosen') {
      const kelasId = query.kelas_id ? Number.parseInt(query.kelas_id, 10) : undefined;
      const rows = await this.repo.listForDosen(subject.id, Number.isInteger(kelasId) ? kelasId : undefined);
      return rows.map(toDto);
    }
    throw AccessDeniedError.roleNotAllowed();
  }

  async update(subject: Subject, id: number, nilaiAngka: number): Promise<NilaiUpdateDto> {
    if (subject.type !== 'user' || subject.role !== 'dosen') {
      throw AccessDeniedError.roleNotAllowed();
    }
    const grade = toGrade(nilaiAngka);
    const affected = await this.repo.updateAtomik({
      id,
      dosenId: subject.id,
      nilaiAngka,
      nilaiHuruf: grade.huruf,
      bobot: grade.bobot,
      updatedBy: subject.id,
    });

    if (affected === 0) {
      const existing = await this.repo.getById(id);
      if (!existing) throw new NotFoundError('Grade not found');
      if (existing.status === 'FINAL') {
        throw new AccessDeniedError(Reason.GRADE_ALREADY_FINAL, 'Grade is already finalized', 403);
      }
      throw new AccessDeniedError(Reason.NOT_CLASS_OWNER, 'You do not own this class', 403);
    }

    const fresh = await this.repo.getById(id);
    if (!fresh) throw new NotFoundError('Grade not found');
    return {
      id: fresh.id,
      kelas_id: fresh.kelasId,
      nilai_angka: fresh.nilaiAngka,
      nilai_huruf: fresh.nilaiHuruf,
      bobot: fresh.bobot,
      status: fresh.status,
    };
  }
}
