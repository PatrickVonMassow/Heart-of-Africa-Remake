// Stop hook: the work order stays split — TASKS.md open, docs/tasks-archive.md
// finished (user 26.07.2026). The decision logic is pure and Vitest-covered;
// this wrapper only reads the two files.
//
// Unlike the batch-duty guards this one judges FILE CONTENT, so it does NOT
// stand down while the batch is paused: the work order is edited during a pause
// (that is when points get appended and ticked), and a check that sleeps exactly
// then is the "guard that never fires" this project already paid for twice.
// Fail-OPEN on an internal error, like every guard here.
import { readFileSync, existsSync } from 'node:fs'
import { evaluateTasksArchive, formatTasksArchiveVerdict } from './tasks-archive-guard-core.mjs'
import { TASKS_PATH, ARCHIVE_PATH } from './tasks-source.mjs'
import { isMainModule } from './is-main.mjs'

/** The guard's I/O half, shared with the preflight (point 365 D). */
export function gatherTasksArchiveInputs() {
  const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
  return {
    applicable: true,
    inputs: { tasksText: read(TASKS_PATH), archiveText: read(ARCHIVE_PATH) },
  }
}

if (isMainModule(import.meta.url)) {
  try {
    const verdict = evaluateTasksArchive(gatherTasksArchiveInputs().inputs)
    if (verdict.block) {
      process.stdout.write(
        JSON.stringify({ decision: 'block', reason: formatTasksArchiveVerdict(verdict) }),
      )
    }
    process.exit(0)
  } catch (e) {
    console.error(`tasks-archive-guard error (allowing the stop): ${e && e.message}`)
    process.exit(0)
  }
}
