// Shared state I/O for the render-verify (both-backends) toolchain
// (render-verify-guard, render-verify-recorder). One JSON state file under
// .claude/, git-ignored:
//
//   render-verify-state.json — { clearedHead,              legacy scalar baseline (mirror)
//                                clearedHeads: {branch:sha}, per-BRANCH verified baselines
//                                clearedAt, runs: [...],   recorded verify-suite runs
//                                deferral, lastDeferral }  the loud escape valve
//
// A "run" record is written by the recorder from INSIDE a verify-suite process
// (armed in scripts/verify/_browser.mjs), so it is ground truth — backend,
// suite, exit code and the screenshots the run actually wrote — never a parsed
// self-report. Writes are atomic (tmp + rename, via dashboard-state.mjs)
// because a suite's exit handler can race the Stop-hook in the same moment.
import { fileURLToPath } from 'node:url'
import { readJson, writeJsonAtomic, REPO_ROOT } from './dashboard-state.mjs'

export { REPO_ROOT }
export const RENDER_STATE_PATH = fileURLToPath(
  new URL('../.claude/render-verify-state.json', import.meta.url),
)

/** Keep only the most recent run records (a bounded evidence window). */
export const MAX_RUNS = 40

/** The whole state; null when absent/unreadable (callers decide, fail-open). */
export function readRenderState() {
  return readJson(RENDER_STATE_PATH)
}

/** Merge a patch without clobbering unrelated fields; `undefined` DELETES a key. */
export function mergeRenderState(patch) {
  const state = readRenderState() ?? {}
  const next = { ...state, ...patch }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key]
  }
  writeJsonAtomic(RENDER_STATE_PATH, next)
  return next
}

/** Append a verify-run record (called from a suite's exit handler). */
export function recordRun(run) {
  const state = readRenderState() ?? {}
  const runs = Array.isArray(state.runs) ? state.runs.slice() : []
  runs.push(run)
  while (runs.length > MAX_RUNS) runs.shift()
  writeJsonAtomic(RENDER_STATE_PATH, { ...state, runs })
}
