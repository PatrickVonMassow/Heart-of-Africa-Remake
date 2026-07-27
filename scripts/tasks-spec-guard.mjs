// Stop hook: GUARANTEE the tasks-spec-final-state-only rule the assistant broke
// despite a memory note — when a user change request alters an existing TASKS.md
// point, that point is REWRITTEN COMPLETELY to state only its final correct
// target, never patched with an iterative "first X, then Y" trail (point 258 kept
// the superseded "buttons" plan beside the new dropdown design). The decision
// logic lives in tasks-spec-guard-core.mjs (pure, Vitest-covered); this wrapper
// only reads TASKS.md and is fail-OPEN: any internal error → allow, so a guard
// bug never traps the session.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { evaluate } from './tasks-spec-guard-core.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { isMainModule } from './is-main.mjs'

const TASKS = fileURLToPath(new URL('../TASKS.md', import.meta.url))
const PAUSE = fileURLToPath(new URL('../.claude/batch-paused', import.meta.url))

/**
 * The guard's I/O half, exported so the preflight (point 365 D) can ask "would
 * this block?" from the SAME gathering the Stop hook uses — a second, drifting
 * copy of it would report a false "clean".
 */
export function gatherTasksSpecInputs({ sessionId = '' } = {}) {
  if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused' }
  if (heldByOtherLiveOwner(sessionId)) return { applicable: false, why: 'another live session owns the batch lock' }
  if (!existsSync(TASKS)) return { applicable: false, why: 'no TASKS.md in this checkout' }
  return { applicable: true, inputs: { tasksMd: readFileSync(TASKS, 'utf8') } }
}

if (isMainModule(import.meta.url)) {
  try {
    let sid = ''
    try {
      sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
    } catch {
      /* no/non-JSON stdin (manual run) — the rule is repo truth, not session-local */
    }

    const gathered = gatherTasksSpecInputs({ sessionId: sid })
    if (!gathered.applicable) process.exit(0) // paused / non-owner / no work log

    const result = evaluate(gathered.inputs)
    if (result.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }))
    process.exit(0)
  } catch (e) {
    console.error(`tasks-spec-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
