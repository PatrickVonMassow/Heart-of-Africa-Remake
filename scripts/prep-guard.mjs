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
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const R = (p) => fileURLToPath(new URL(p, import.meta.url))
const MARKER = R('../.claude/wait-prep.json')
const PAUSE = R('../.claude/batch-paused')

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
  if (existsSync(PAUSE)) process.exit(0) // batch user-paused: no work in flight
  if (!existsSync(MARKER)) process.exit(0) // no wait armed
  const m = JSON.parse(readFileSync(MARKER, 'utf8'))
  if (m.prepped) process.exit(0) // prep already recorded for this wait
  const reason =
    `WAITING-TIME PREP REQUIRED. A background task ("${m.task}") is in flight and you are about ` +
    `to yield without having done prep. Standing rule (enforced, not reminded): use the wait to ` +
    `do READ-ONLY prep for the NEXT queue ticket — investigate the relevant code, sharpen the ` +
    `plan/estimate, update the dashboard queue card. Then record it: node scripts/prep-guard.mjs ` +
    `--prepped (or --clear once you have consumed the task result). If there is genuinely nothing ` +
    `to prep, run --prepped to acknowledge.`
  process.stdout.write(JSON.stringify({ decision: 'block', reason }))
  process.exit(0)
} catch {
  process.exit(0) // never hard-block on a guard error
}
