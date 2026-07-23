import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Short commit the bundle was built from. The in-game benchmark report
 *  (design.md §21.1, F8) names it, so a measurement sent back from the
 *  deployed build can be tied to the exact build it was taken on. */
function buildCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  // On GitHub Pages the project site is served under /<repo>/, so the CI build
  // (GITHUB_ACTIONS is set on the runners) needs that base path; locally the
  // dev server and preview run at the root.
  base: process.env.GITHUB_ACTIONS ? '/Heart-of-Africa-Remake/' : '/',
  plugins: [react()],
  define: {
    'import.meta.env.VITE_BUILD_COMMIT': JSON.stringify(buildCommit()),
  },
  // The TTS stack resolves its WASM/worker assets at runtime; esbuild
  // pre-bundling breaks those URLs in dev.
  optimizeDeps: {
    exclude: ['kokoro-js', '@huggingface/transformers', 'onnxruntime-web'],
  },
  build: {
    // three.js (startup) and the lazily loaded TTS stack are single
    // indivisible library chunks well above the default 500 kB limit.
    chunkSizeWarningLimit: 2300,
    rolldownOptions: {
      output: {
        // Vendor chunks: stable libraries cache independently of game code
        // and load in parallel.
        codeSplitting: {
          groups: [
            // TTS stays its own chunk so the dynamic import keeps it out of
            // the eagerly loaded vendor bundle (journal read-aloud only).
            { name: 'tts', test: /node_modules[\\/](kokoro-js|@huggingface|onnxruntime-[^\\/]+|phonemizer)[\\/]/ },
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'vendor', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
})
