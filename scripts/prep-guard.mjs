// Stop hook (user mandate 21.07.2026): GUARANTEE waiting-time prep. Mirrors the
// dashboard-guard's "enforce, don't remind" model. When a long background
// validation/regression is in flight that the turn is waiting on, yielding the
// turn to a pure idle-wait WITHOUT doing prep for the upcoming ticket(s) is
// BLOCKED — the reminder alone kept failing (the user's explicit reason).
//
// The marker `.claude/wait-prep.json` is ARMED automatically by the PostToolUse
// companion `prep-arm-hook.mjs` whenever a background validation is launched, so
// the guarantee does not depend on the assistant remembering to arm it. The
// assistant then does read-only prep and records it:
//   node scripts/prep-guard.mjs --prepped   # after doing prep for the next ticket
//   node scripts/prep-guard.mjs --clear      # optional: on consuming the result
//   node scripts/prep-guard.mjs --await "x"  # manual arm (rarely needed)
// Stop-hook mode (no args): BLOCK while the marker exists and prepped == false.
//
// The decision lives in prep-guard-core.mjs (pure, Vitest-covered) since point
// 437 E — it was inline here, which made it unpredictable by the preflight and
// untestable by anything.
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { evaluatePrep } from './prep-guard-core.mjs'
import { CAUSE } from './guard-preflight-core.mjs'

const MARKER = repoPath('.claude/wait-prep.json')
const PAUSE = repoPath('.claude/batch-paused')

/** Everything the core needs — shared with the guard preflight, which must never
 *  gather its own (a second copy would drift and hand back a false "clean"). */
export function gatherPrepInputs({ sessionId = '' } = {}) {
  if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused' }
  if (heldByOtherLiveOwner(sessionId)) {
    return { applicable: false, why: 'another live session owns the batch lock', cause: CAUSE.notLockOwner }
  }
  if (!existsSync(MARKER)) return { applicable: true, inputs: { marker: null } }
  let marker = null
  try {
    marker = JSON.parse(readFileSync(MARKER, 'utf8'))
  } catch {
    /* an unreadable marker judges nothing — evaluatePrep allows on null */
  }
  return { applicable: true, inputs: { marker } }
}

if (isMainModule(import.meta.url)) {
  const arg = process.argv[2]

  if (arg === '--await') {
    const task = process.argv[3] ?? 'a background validation'
    writeFileSync(MARKER, JSON.stringify({ task, prepped: false, at: Date.now() }, null, 2))
    console.log(`prep-guard armed for "${task}": do prep before yielding, then --prepped`)
    process.exit(0)
  }
  if (arg === '--prepped') {
    if (existsSync(MARKER)) {
      const m = JSON.parse(readFileSync(MARKER, 'utf8'))
      m.prepped = true
      writeFileSync(MARKER, JSON.stringify(m, null, 2))
      console.log('prep-guard: prep recorded — yielding is now allowed')
    } else {
      console.log('prep-guard: no active wait marker (nothing to record)')
    }
    process.exit(0)
  }
  if (arg === '--clear') {
    if (existsSync(MARKER)) rmSync(MARKER)
    console.log('prep-guard: wait marker cleared')
    process.exit(0)
  }

  // Stop-hook mode.
  try {
    let sid = ''
    try {
      sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
    } catch {
      /* no/non-JSON stdin (manual run) */
    }
    const gathered = gatherPrepInputs({ sessionId: sid })
    if (!gathered.applicable) process.exit(0)

    const verdict = evaluatePrep(gathered.inputs)
    if (verdict.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: verdict.reason }))
    process.exit(0)
  } catch {
    process.exit(0) // never hard-block on a guard error
  }
}
