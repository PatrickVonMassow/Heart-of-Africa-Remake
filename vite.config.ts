import { execSync } from 'node:child_process'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { BUILD_INFO_FILE, buildInfoJson, buildInfoPayload, resolveBuildCommit } from './scripts/build-info.mjs'

function gitOut(args: string): string {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

/** Full commit the bundle is built from — git first, because the workflow builds
 *  each frozen tag in a worktree where GITHUB_SHA still names main (see
 *  scripts/build-info.mjs). */
function buildCommit(): string {
  return resolveBuildCommit({ gitSha: gitOut('rev-parse HEAD'), env: process.env })
}

/** Emit the site's revision marker at `<base>/build-info.json` (point 528): the
 *  one thing on the deployed page that says WHICH commit it was built from, so
 *  the batch can notice a site that lags `main` without a human looking.
 *  Build only — the dev server serves the working tree by definition. */
function buildInfoPlugin(): Plugin {
  return {
    name: 'hoa-build-info',
    apply: 'build',
    generateBundle() {
      const commit = buildCommit()
      this.emitFile({
        type: 'asset',
        fileName: BUILD_INFO_FILE,
        source: buildInfoJson(
          buildInfoPayload({
            commit,
            ref: process.env.GITHUB_REF_NAME || gitOut('rev-parse --abbrev-ref HEAD'),
            builtAt: new Date().toISOString(),
          }),
        ),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // On GitHub Pages the project site is served under /<repo>/, so the CI build
  // (GITHUB_ACTIONS is set on the runners) needs that base path; locally the
  // dev server and preview run at the root.
  base: process.env.GITHUB_ACTIONS ? '/Heart-of-Africa-Remake/' : '/',
  plugins: [react(), buildInfoPlugin()],
  define: {
    // The in-game benchmark report (design.md §21.1, F8) names the SHORT commit,
    // so a measurement sent back from the deployed build can be tied to it.
    'import.meta.env.VITE_BUILD_COMMIT': JSON.stringify(buildCommit().slice(0, 7)),
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
