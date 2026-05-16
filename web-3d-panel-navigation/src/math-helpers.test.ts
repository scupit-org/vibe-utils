import { clamp, DEG2RAD, RAD2DEG } from './math-helpers';

const EPS = 1e-5;

describe('math-helpers', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('DEG2RAD constant', () => {
    expect(Math.abs(DEG2RAD - Math.PI / 180)).toBeLessThan(EPS);
  });

  it('RAD2DEG constant', () => {
    expect(Math.abs(RAD2DEG - 180 / Math.PI)).toBeLessThan(EPS);
  });
});
