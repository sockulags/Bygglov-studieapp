/**
 * WCAG 2 contrast for the design tokens (docs/04: WCAG AA). Pure functions; the test reads
 * tokens.css and checks every text/background pair the components use.
 */

/** "#2f5d50" or "#fff" → [r, g, b] in 0–255. */
export function parseHex(hex: string): [number, number, number] {
  const value = hex.trim().replace(/^#/, '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type TokenTheme = Record<string, string>;

/**
 * Hex tokens per theme from tokens.css: `light` is `:root`, `dark` is `:root[data-theme='dark']`.
 * Only `--name: #hex;` declarations are read.
 */
export function parseTokenThemes(css: string): { light: TokenTheme; dark: TokenTheme } {
  const block = (selector: RegExp): TokenTheme => {
    const match = selector.exec(css);
    if (!match) return {};
    const start = css.indexOf('{', match.index) + 1;
    const end = css.indexOf('}', start);
    const tokens: TokenTheme = {};
    for (const [, name, value] of css
      .slice(start, end)
      .matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
      if (name && value) tokens[name] = value;
    }
    return tokens;
  };
  return {
    light: block(/^:root\s*\{/m),
    dark: block(/^:root\[data-theme='dark'\]\s*\{/m),
  };
}
