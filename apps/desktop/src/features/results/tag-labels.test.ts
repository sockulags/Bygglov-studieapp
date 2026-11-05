// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { tagName } from './tag-labels';

describe('tagName', () => {
  it('spells known tags in Swedish', () => {
    expect(tagName('handlaggningstid')).toBe('handläggningstid');
    expect(tagName('andrad_anvandning')).toBe('ändrad användning');
  });

  it('falls back to the slug with spaces', () => {
    expect(tagName('lovplikt')).toBe('lovplikt');
    expect(tagName('ny_tagg')).toBe('ny tagg');
  });
});
