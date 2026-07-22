import { defineConfig } from 'vitest/config'

// Fast, deterministic unit/component layer (CLAUDE.md §7.2): pure logic, store
// transitions and the HTML HUD components run in jsdom with no browser or dev
// server, so the bulk of the regression finishes in seconds and never flickers
// on RAF/browser timing. The remaining browser-only checks stay in Playwright
// (scripts/verify/*.mjs).
//
// JSX is transformed by esbuild with the automatic React runtime (no
// @vitejs/plugin-react — its vite-8/rolldown build does not load under
// Vitest's bundled vite, so its JSX transform would silently fall back to the
// classic runtime and break component tests).
export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    environment: 'jsdom',
    // scripts/*.test.mjs covers the plain-JS tooling layer (e.g. the dashboard
    // Stop-hook guard's decision logic) — pure modules, no game imports.
    include: ['src/**/*.test.{ts,tsx}', 'scripts/*.test.mjs'],
    setupFiles: ['./src/test/setup.ts'],
    // The R3F/three scenes never render here; only pure modules and HUD
    // components are imported, so no canvas/WebGL is needed.
    css: false,
    restoreMocks: true,
  },
})
