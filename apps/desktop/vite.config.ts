/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

const MARKDOWN_PACKAGES =
  /node_modules\/\.pnpm\/(react-markdown|remark-|rehype-|micromark|mdast-|hast-|unist-|unified|vfile|bail|trough|devlop|property-information|space-separated-tokens|comma-separated-tokens|html-url-attributes|zwitch|longest-streak|markdown-table|ccount|character-entities|decode-named-character-reference|estree-util-|style-to-|inline-style-parser|trim-lines|is-plain-obj|extend|escape-string-regexp)/;

// Tauri sets TAURI_ENV_* while running `tauri dev` / `tauri build`.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Vite options tailored for Tauri development.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host ?? false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
    rollupOptions: {
      output: {
        // Split libraries and the bundled study content out of the app code, so no chunk
        // grows past Vite's size warning as the content grows.
        // Lazily imported Tauri plugins keep their own chunks.
        manualChunks(id) {
          if (id.includes('/content-dist/')) return 'content';
          if (/node_modules\/\.pnpm\/(react|react-dom|scheduler)@/.test(id)) return 'react';
          if (id.includes('node_modules/.pnpm/@tanstack+')) return 'tanstack';
          if (id.includes('node_modules/.pnpm/@radix-ui+')) return 'radix';
          // Markdown rendering (case documents, tutor answers): react-markdown and the
          // unified/remark/micromark ecosystem it pulls in.
          if (MARKDOWN_PACKAGES.test(id)) return 'markdown';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
