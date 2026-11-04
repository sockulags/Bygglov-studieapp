import { describe, expect, it } from 'vitest';
import { normalizeText, parseNumber, parseQuantity, unitsCompatible } from './normalize';

describe('normalize', () => {
  it('normalizeText trims, collapses whitespace, lower-cases Swedish letters and NFC-normalises', () => {
    expect(normalizeText('  ÅÄÖ   Plan  ')).toBe('åäö plan');
    expect(normalizeText('Ångermanland'.normalize('NFD'))).toBe('ångermanland');
    expect(normalizeText('"Bygglov."')).toBe('bygglov');
    expect(normalizeText('Åre', { caseSensitive: true })).toBe('Åre');
  });

  it('parseNumber reads comma and point decimals, thousands separators and minus signs', () => {
    expect(parseNumber('4,5')).toBe(4.5);
    expect(parseNumber('4.5')).toBe(4.5);
    expect(parseNumber(' 1 000 ')).toBe(1000);
    expect(parseNumber('−3')).toBe(-3);
    expect(parseNumber(',5')).toBe(0.5);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('4,5,6')).toBeNull();
    expect(parseNumber('tio')).toBeNull();
  });

  it('parseQuantity splits number and unit', () => {
    expect(parseQuantity('10 veckor')).toEqual({ value: 10, unit: 'veckor' });
    expect(parseQuantity('4,5m')).toEqual({ value: 4.5, unit: 'm' });
    expect(parseQuantity('30 kvm.')).toEqual({ value: 30, unit: 'kvm' });
    expect(parseQuantity('veckor 10')).toBeNull();
  });

  it('unitsCompatible accepts abbreviations, inflections and aliases', () => {
    expect(unitsCompatible('v', 'veckor')).toBe(true);
    expect(unitsCompatible('vecka', 'veckor')).toBe(true);
    expect(unitsCompatible('m²', 'kvm')).toBe(true);
    expect(unitsCompatible('dagar', 'veckor')).toBe(false);
    expect(unitsCompatible('m', '')).toBe(false);
    expect(unitsCompatible('', 'm')).toBe(true);
  });
});
