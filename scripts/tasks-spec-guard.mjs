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

const TASKS = fileURLToPath(new URL('../TASKS.md', import.meta.url))
const PAUSE = fileURLToPath(new URL('../.claude/batch-paused', import.meta.url))

try {
  try {
    JSON.parse(readFileSync(0, 'utf8')) // hook stdin (session_id) — unused, tolerated missing
  } catch {
    /* no/non-JSON stdin (manual run) — the rule is repo truth, not session-local */
  }

  if (existsSync(PAUSE)) process.exit(0) // user-paused: don't trap a paused session
  if (!existsSync(TASKS)) process.exit(0) // no work log — nothing to hold clean

  const result = evaluate({ tasksMd: readFileSync(TASKS, 'utf8') })
  if (result.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }))
  process.exit(0)
} catch (e) {
  console.error(`tasks-spec-guard error (allowing stop): ${e && e.message}`)
  process.exit(0)
}
