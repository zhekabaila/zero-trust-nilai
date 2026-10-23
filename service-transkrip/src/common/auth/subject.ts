export type Role = 'mahasiswa' | 'dosen' | 'admin' | 'service';

export type Subject =
  | { type: 'user'; id: number; role: Role }
  | { type: 'service'; id: string; role: 'service' };
