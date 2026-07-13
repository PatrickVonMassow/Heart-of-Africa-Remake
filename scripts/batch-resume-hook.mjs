// SessionStart hook: auto-resume the TASKS.md batch (user mandate 2026-07-14 —
// the batch must complete autonomously; no session may sit idle waiting for a
// "continue" from the user). Prints the resume instruction only while TASKS.md
// still has unticked points, so finished batches start sessions silently.
import { readFileSync } from 'node:fs'

try {
  const tasks = readFileSync(new URL('../TASKS.md', import.meta.url), 'utf8')
  const open = tasks.match(/^- \[ \] (\d+)\./gm)
  if (open && open.length > 0) {
    const nums = open.map((l) => l.match(/\d+/)[0]).join(', ')
    console.log(
      `[batch-resume] TASKS.md has ${open.length} open point(s): ${nums}. ` +
        'Standing user instruction: continue the batch autonomously per ' +
        'CLAUDE.md/TASKS.md (implement -> docs -> tests on both layers -> ' +
        'full regression -> atomic commit + push -> tick), point by point, ' +
        'then the Closing steps — without waiting for the user to say ' +
        '"continue". First check git status and any in-progress point for ' +
        'work already underway, and do not double-start regressions.',
    )
  }
} catch {
  // No TASKS.md — nothing to resume; stay silent.
}
