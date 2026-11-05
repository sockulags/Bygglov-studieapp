// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex, parseTokenThemes } from './contrast';

// Read from disk: vitest runs with `css: false`, so a `?raw` import of a .css file is empty.
const tokensCss = readFileSync(new URL('../../styles/tokens.css', import.meta.url), 'utf8');
const themes = parseTokenThemes(tokensCss);

/** [text, background] pairs used for text in the components (4.5:1, WCAG AA). */
const TEXT_PAIRS: readonly [string, string][] = [
  ['ink', 'bg'],
  ['ink', 'paper'],
  ['ink', 'accent-soft'],
  ['ink', 'brick-soft'],
  ['ink', 'success-soft'],
  ['ink', 'plan-yellow-soft'],
  ['muted', 'bg'],
  ['muted', 'paper'],
  ['muted', 'accent-soft'],
  ['accent', 'bg'],
  ['accent', 'paper'],
  ['accent', 'accent-soft'],
  ['accent-ink', 'accent'],
  ['brick', 'paper'],
  ['brick', 'brick-soft'],
  ['success', 'paper'],
  ['success', 'success-soft'],
  // The "NY" badge in the diary: paper-coloured text on brick.
  ['paper', 'brick'],
];

/** Focus ring and other non-text indicators against the surfaces (3:1, WCAG 1.4.11). */
const UI_PAIRS: readonly [string, string][] = [
  ['ring', 'bg'],
  ['ring', 'paper'],
  ['accent', 'accent-soft'],
];

describe('contrast helpers', () => {
  it('computes the WCAG ratio', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('reads both themes from tokens.css', () => {
    expect(themes.light.bg).toBe('#f7f5f0');
    expect(themes.dark.bg).toBe('#15191f');
    expect(Object.keys(themes.dark)).toEqual(expect.arrayContaining(Object.keys(themes.light)));
  });
});

describe.each(['light', 'dark'] as const)('design tokens, %s theme', (theme) => {
  const tokens = themes[theme];
  const ratio = (a: string, b: string) => {
    const fg = tokens[a];
    const bg = tokens[b];
    if (!fg || !bg) throw new Error(`Missing token --${!fg ? a : b} in ${theme}`);
    return contrastRatio(fg, bg);
  };

  it.each(TEXT_PAIRS)('text --%s on --%s reaches 4.5:1', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)('indicator --%s on --%s reaches 3:1', (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3);
  });
});
