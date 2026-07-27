// Stop hook: the constantly-read documents stay within their budgets
// (user 26.07.2026). Decision logic is pure and Vitest-covered; this wrapper
// only reads the files.
//
// A CONTENT guard, so it does NOT stand down while the batch is paused — the
// documents are edited during pauses, which is exactly when a check that sleeps
// would miss the growth. Fail-OPEN on an internal error.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DOC_BUDGETS, evaluateDocBudgets, formatDocBudgetVerdict } from './doc-budget-core.mjs'
import { TASKS_PATH } from './tasks-source.mjs'
import { isMainModule } from './is-main.mjs'

const REPO_ROOT = resolve(TASKS_PATH, '..')

/** The guard's I/O half, shared with the preflight (point 365 D). */
export function gatherDocBudgetInputs() {
  const docs = DOC_BUDGETS.map(({ path }) => {
    const full = resolve(REPO_ROOT, path)
    return { path, text: existsSync(full) ? readFileSync(full, 'utf8') : null }
  })
  return { applicable: true, inputs: { docs } }
}

if (isMainModule(import.meta.url)) {
  try {
    const verdict = evaluateDocBudgets(gatherDocBudgetInputs().inputs.docs)
    if (verdict.block) {
      process.stdout.write(
        JSON.stringify({ decision: 'block', reason: formatDocBudgetVerdict(verdict) }),
      )
    }
    process.exit(0)
  } catch (e) {
    console.error(`doc-budget-guard error (allowing the stop): ${e && e.message}`)
    process.exit(0)
  }
}
