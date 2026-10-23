import { describe, expect, it } from 'vitest';
import { toGrade } from '../../src/modules/nilai/grading.js';

describe('toGrade — grade scale (DATABASE §3 comment)', () => {
  const cases: Array<[number, string, number]> = [
    [100, 'A', 4.0],
    [85, 'A', 4.0],
    [84.99, 'A-', 3.7],
    [80, 'A-', 3.7],
    [79.99, 'B+', 3.3],
    [75, 'B+', 3.3],
    [74.99, 'B', 3.0],
    [70, 'B', 3.0],
    [69.99, 'B-', 2.7],
    [65, 'B-', 2.7],
    [64.99, 'C+', 2.3],
    [60, 'C+', 2.3],
    [59.99, 'C', 2.0],
    [55, 'C', 2.0],
    [54.99, 'D', 1.0],
    [40, 'D', 1.0],
    [39.99, 'E', 0.0],
    [0, 'E', 0.0],
  ];

  for (const [angka, huruf, bobot] of cases) {
    it(`${angka} → ${huruf}/${bobot}`, () => {
      expect(toGrade(angka)).toEqual({ huruf, bobot });
    });
  }
});
