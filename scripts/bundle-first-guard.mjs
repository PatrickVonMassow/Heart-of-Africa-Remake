#!/usr/bin/env node
// Stop hook: the BUNDLE-FIRST rule, until now memory only
// (`bundle-first-not-new-point`). A new finding joins an existing bundle point;
// a standalone point is the exception. `docs/work-packages.md` states the
// property — "every open point in TASKS.md appears in exactly one bundle here,
// or in the unbundled list below" — and this guard is what makes it true, over
// the FULL open set, so a point that silently left a bundle is caught with the
// same comparison as one that never joined.
//
// The decision logic lives in bundle-first-core.mjs (pure, Vitest-covered).
// This wrapper only reads the two files and is fail-OPEN: any internal error →
// allow, so a guard bug never traps the session. It stands down for a paused
// batch and for a session that does not own the batch lock.
//
//   node scripts/bundle-first-guard.mjs --status
import { readFileSync, existsSync } from 'node:fs'
import { evaluate, statusLine } from './bundle-first-core.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { isMainModule } from './is-main.mjs'
import { repoPath } from './repo-paths.mjs'

// RESOLVED ON USE, NEVER AT IMPORT (cross-vendor review finding): a path
// resolved at module scope is computed BEFORE the try below and its throw would
// leave the process nonzero instead of allowing the stop. Every call site of
// this reader stands inside a fail-open, so this is where the resolution
// belongs. What remains out of this file's reach is another module's own
// top-level initialisation, which no try here can enclose.
const guardPaths = () => ({
  tasks: repoPath('TASKS.md'),
  workPackages: repoPath('docs/work-packages.md'),
  pause: repoPath('.claude/batch-paused'),
})

/** The guard's I/O half, shared with the preflight (point 365 D). */
export function gatherBundleFirstInputs({ sessionId = '' } = {}) {
  const { tasks, workPackages, pause } = guardPaths()
  if (existsSync(pause)) return { applicable: false, why: 'the batch is paused' }
  if (heldByOtherLiveOwner(sessionId)) {
    return { applicable: false, why: 'another live session owns the batch lock', cause: 'not-lock-owner' }
  }
  if (!existsSync(workPackages)) return { applicable: false, why: 'no docs/work-packages.md in this checkout' }
  if (!existsSync(tasks)) return { applicable: false, why: 'no TASKS.md in this checkout' }
  return {
    applicable: true,
    inputs: {
      tasksMd: readFileSync(tasks, 'utf8'),
      workPackagesMd: readFileSync(workPackages, 'utf8'),
    },
  }
}

if (isMainModule(import.meta.url)) {
  try {
    if (process.argv.includes('--status')) {
      const gathered = gatherBundleFirstInputs({ sessionId: 'status-run' })
      if (!gathered.applicable) {
        console.log(`bundle-first-guard: not applicable — ${gathered.why}`)
        process.exit(0)
      }
      const result = evaluate(gathered.inputs)
      // The sentence is the core's (round-fifteen review finding): a fail-open
      // and a measured invariant are the same DECISION and a very different
      // statement, and that difference belongs where a unit case can reach it.
      console.log(statusLine(result))
      process.exit(0)
    }

    let sid = ''
    try {
      sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
    } catch {
      /* no/non-JSON stdin (manual run) — the rule is global truth, not session-local */
    }

    const gathered = gatherBundleFirstInputs({ sessionId: sid })
    if (!gathered.applicable) process.exit(0)

    const result = evaluate(gathered.inputs)
    if (result.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }))
    process.exit(0)
  } catch (e) {
    console.error(`bundle-first-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
