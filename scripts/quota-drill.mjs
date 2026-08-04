// THE FAKE-SIGNATURE DRILL (point 444, 30.07.2026).
//
// The Vitest layer proves the decision; this proves the WIRING. It hands the real
// launcher — `node scripts/batch-autostart.mjs --quota-report <segment>`, the same
// process, the same code, the real `.claude/autostart-state.json` — a run-log
// segment carrying the refusal line that actually killed three spawns on
// 22.07.2026, and asserts what comes back:
//
//   1. a limit signature yields state 'quota';
//   2. the fail counter is UNTOUCHED (so the runaway brake is never approached);
//   3. no pause is due, and none was written;
//   4. the next probe is scheduled at the ordinary interval, not a doubled one;
//   5. a segment WITHOUT the signature still climbs the ladder.
//
// It spawns no session and writes nothing outside the git-ignored local/. The
// `--quota-report` path exits before the tick's first side effect, so running this
// on a live machine cannot disturb a running batch.
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const LAUNCHER = join(REPO, 'scripts', 'batch-autostart.mjs')
const SCRATCH = join(REPO, 'local', 'quota-drill')
const PAUSE_FILE = join(REPO, '.claude', 'batch-paused')

/** Verbatim from .claude/autostart-run.log, 22.07.2026. */
const LIMIT_LINE = "You've hit your session limit · resets 4:20pm (Europe/Berlin)"

const report = (segment) => {
  const file = join(SCRATCH, 'segment.log')
  writeFileSync(file, segment, 'utf8')
  const out = execFileSync(process.execPath, [LAUNCHER, '--quota-report', file], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 60000,
    windowsHide: true,
  })
  return JSON.parse(out.trim().split('\n').filter(Boolean).pop())
}

const failures = []
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`)
  if (!ok) failures.push(what)
}

mkdirSync(SCRATCH, { recursive: true })
const pausedBefore = existsSync(PAUSE_FILE)
try {
  // THE DRILL: a real session's report, then the refusal, exactly as the log has it.
  const blocked = report(
    ['**Punkt 444 ist abgeschlossen.**', '', 'Ein paar Zeilen Bericht.', LIMIT_LINE, LIMIT_LINE].join('\n'),
  )
  console.log(`launcher verdict (fake signature): ${JSON.stringify(blocked)}`)
  check(blocked.quotaHit.hit === true, 'the limit line is recognised as a quota signature')
  check(blocked.state === 'quota', "state is 'quota', not 'failed'")
  check(blocked.failCount === blocked.failCountBefore, 'the fail counter is untouched')
  check(blocked.pause === false, 'no pause is due')
  check(existsSync(PAUSE_FILE) === pausedBefore, 'the pause file is unchanged (a quota block never writes one)')
  check(blocked.nextProbeMs === 10 * 60 * 1000, 'the next probe is at the ordinary interval (10 min floor, 15 min tick)')
  check(blocked.announce === false, 'the probe is logged, not pushed')
  check(typeof blocked.note === 'string' && blocked.note.includes('QUOTA BLOCK'), 'the probe is logged with its signature')

  // THE CONTROL: the same tick over an ordinary death still climbs the ladder.
  const ordinary = report('Background tasks still running after 600s; terminating.\n')
  console.log(`launcher verdict (ordinary failure): ${JSON.stringify(ordinary)}`)
  check(ordinary.quotaHit.hit === false, 'an ordinary death carries no quota signature')
  check(ordinary.state === 'failed', "state is 'failed'")
  check(ordinary.failCount === ordinary.failCountBefore + 1, 'the fail counter climbs')
  check(ordinary.nextProbeMs > blocked.nextProbeMs, 'and the backoff is longer than the quota probe interval')
} finally {
  if (existsSync(SCRATCH)) rmSync(SCRATCH, { recursive: true, force: true })
}

if (failures.length) {
  console.error(`\nDRILL FAILED (${failures.length}): ${failures.join('; ')}`)
  process.exit(1)
}
console.log('\nDRILL PASSED — a usage limit is a waiting state; an ordinary failure still climbs the ladder.')
