export interface Grade {
  huruf: string;
  bobot: number;
}

const SCALE: ReadonlyArray<{ min: number; huruf: string; bobot: number }> = [
  { min: 85, huruf: 'A', bobot: 4.0 },
  { min: 80, huruf: 'A-', bobot: 3.7 },
  { min: 75, huruf: 'B+', bobot: 3.3 },
  { min: 70, huruf: 'B', bobot: 3.0 },
  { min: 65, huruf: 'B-', bobot: 2.7 },
  { min: 60, huruf: 'C+', bobot: 2.3 },
  { min: 55, huruf: 'C', bobot: 2.0 },
  { min: 40, huruf: 'D', bobot: 1.0 },
];

export function toGrade(nilaiAngka: number): Grade {
  for (const band of SCALE) {
    if (nilaiAngka >= band.min) return { huruf: band.huruf, bobot: band.bobot };
  }
  return { huruf: 'E', bobot: 0.0 };
}
