// Mechanical evidence that a verify suite REALLY ran on a given renderer
// backend (point 210's lesson: the sea-coast fix was called done after a
// WebGL2-only check while the user's WebGPU picture was still broken). Armed by
// scripts/verify/_browser.mjs the moment a suite launches its browser; on
// process exit it appends a run record — backend, suite name, exit code,
// whether assertBackend confirmed the backend, and the screenshots the run
// actually wrote — to .claude/render-verify-state.json. The Stop-hook
// render-verify-guard.mjs judges dual-backend coverage from these records, so
// "I ran it" can never be a hollow claim: the record only exists when the suite
// process itself wrote it, and only an exit-0 record counts as coverage.
//
// Observe-only and total: every step is wrapped so the bookkeeping can NEVER
// fail a verify suite.
import { basename, join } from 'node:path'
import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { recordRun } from './render-verify-state.mjs'

const SCREENSHOT_DIR = fileURLToPath(new URL('../verification', import.meta.url))

let armed = null

/** Screenshot files written since the run started — the "it rendered" evidence. */
function screenshotsSince(startedAt) {
  const names = []
  try {
    for (const f of readdirSync(SCREENSHOT_DIR)) {
      if (!f.endsWith('.png')) continue
      try {
        if (statSync(join(SCREENSHOT_DIR, f)).mtimeMs >= startedAt) names.push(f)
      } catch {
        /* racing writer — skip this file */
      }
    }
  } catch {
    /* no screenshot dir — a non-screenshot suite */
  }
  return names
}

/** Arm the once-per-process exit recorder. Called from launchVerifyBrowser. */
export function armRunRecorder(backend) {
  try {
    if (armed) return
    armed = {
      backend,
      suite: basename(String(process.argv[1] ?? 'unknown'), '.mjs'),
      startedAt: Date.now(),
      asserted: false,
    }
    process.on('exit', (code) => {
      try {
        const shots = screenshotsSince(armed.startedAt)
        recordRun({
          backend: armed.backend,
          suite: armed.suite,
          startedAt: armed.startedAt,
          at: Date.now(),
          exit: code ?? 0,
          asserted: armed.asserted,
          screenshotCount: shots.length,
          screenshots: shots.slice(0, 12),
        })
      } catch {
        /* never fail a suite over the bookkeeping */
      }
    })
  } catch {
    /* fail-open: recording is evidence, not a gate */
  }
}

/** Called by assertBackend on success — the backend was CONFIRMED, not assumed. */
export function markBackendAsserted() {
  if (armed) armed.asserted = true
}
