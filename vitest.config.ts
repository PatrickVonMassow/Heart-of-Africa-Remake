import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Fast, deterministic unit/component layer (CLAUDE.md §7.2): pure logic, store
// transitions and the HTML HUD components run in jsdom with no browser or dev
// server, so the bulk of the regression finishes in seconds and never flickers
// on RAF/browser timing. The remaining browser-only checks stay in Playwright
// (scripts/verify/*.mjs).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // The R3F/three scenes never render here; only pure modules and HUD
    // components are imported, so no canvas/WebGL is needed.
    css: false,
    restoreMocks: true,
  },
})
