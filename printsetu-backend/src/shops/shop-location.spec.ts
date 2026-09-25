import { cleanDistrict, resolveLocation } from './shop-location';

describe('resolveLocation', () => {
  it('accepts a pair, rounded to about a metre', () => {
    expect(resolveLocation(23.0225123, 72.5714999)).toEqual({
      latitude: 23.02251,
      longitude: 72.5715,
    });
  });

  it('treats both missing as "not placed"', () => {
    expect(resolveLocation(null, null)).toEqual({ latitude: null, longitude: null });
    expect(resolveLocation(undefined, undefined)).toEqual({ latitude: null, longitude: null });
  });

  it('rejects half a pair or impossible values', () => {
    expect(() => resolveLocation(23, null)).toThrow('Pick the shop location');
    expect(() => resolveLocation(95, 72)).toThrow('not valid');
    expect(() => resolveLocation(23, 200)).toThrow('not valid');
  });
});

describe('cleanDistrict', () => {
  it('trims, and blank means none', () => {
    expect(cleanDistrict('  Surat ')).toBe('Surat');
    expect(cleanDistrict('  ')).toBeNull();
    expect(cleanDistrict(undefined)).toBeNull();
  });
});
