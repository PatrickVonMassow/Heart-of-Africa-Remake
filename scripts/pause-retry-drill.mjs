// THE RESTART-CLOCK DRILL (point 445).
//
// The Vitest layer proves the DECISION (scripts/batch-pause-core.test.mjs); this
// proves the WIRING: that the real launcher tick — `node scripts/batch-autostart.mjs`,
// the same process, the same code path, the same classification — parks on a clock
// that is still running and RESUMES the batch the moment it runs out.
//
// It parks with a SIXTY-SECOND clock and waits it out on the real wall clock, so
// what the drill measures is the mechanism and not a mocked "now".
//
// HOW IT STAYS SAFE ON A LIVE MACHINE. It never writes `.claude/batch-paused`: the
// record it parks with is its own file under the git-ignored local/, handed to the
// launcher's `--pause-report <file>` mode, which runs the real classification and
// exits BEFORE the tick's first side effect. So the drill spawns no session, clears
// no record, touches no state file, and cannot become a second owner beside a
// running batch. The live pause record is read once, before and after, purely to
// assert that the drill left it alone.
//
//   node scripts/pause-retry-drill.mjs        (~70 s; --fast skips the real wait)
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { formatPauseRecord } from './batch-pause-core.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const LAUNCHER = join(REPO, 'scripts', 'batch-autostart.mjs')
const SCRATCH = join(REPO, 'local', 'pause-retry-drill')
const LIVE_PAUSE = join(REPO, '.claude', 'batch-paused')
const CLOCK_MS = 60 * 1000
const FAST = process.argv.includes('--fast')

/** One real launcher tick, stopped at the pause verdict. */
const report = (name) => {
  const out = execFileSync(process.execPath, [LAUNCHER, '--pause-report', join(SCRATCH, name)], {
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

const liveBefore = existsSync(LIVE_PAUSE) ? readFileSync(LIVE_PAUSE, 'utf8') : null
mkdirSync(SCRATCH, { recursive: true })
try {
  // 1. PARK WITH A SIXTY-SECOND CLOCK.
  const parkedAt = Date.now()
  writeFileSync(
    join(SCRATCH, 'clocked'),
    formatPauseRecord({
      reason: 'restart-clock drill: a cause that clears itself (a red CI run)',
      cause: 'drill',
      retryAfter: parkedAt + CLOCK_MS,
      pausedAt: parkedAt,
    }),
  )
  const parked = report('clocked')
  console.log(`tick verdict while the clock runs: ${JSON.stringify(parked)}`)
  check(parked.state === 'wait', "the tick reads a running clock as 'wait'")
  check(parked.parksTheTick === true, 'and parks — no session is started')
  check(parked.reason.startsWith('restart-clock drill:'), 'the reason survives into the verdict')

  // 2. THE CLOCK RUNS OUT — the next tick resumes the batch.
  const waitMs = FAST ? 0 : Math.max(0, parkedAt + CLOCK_MS - Date.now()) + 1500
  if (FAST) {
    // --fast re-parks with a clock that has already run out. The mechanism is the
    // same; only the waiting is skipped, for a machine that cannot spare 70 s.
    writeFileSync(
      join(SCRATCH, 'clocked'),
      formatPauseRecord({
        reason: 'restart-clock drill: a cause that clears itself (a red CI run)',
        cause: 'drill',
        retryAfter: Date.now() - CLOCK_MS,
        pausedAt: Date.now() - 2 * CLOCK_MS,
      }),
    )
  } else {
    console.log(`waiting out the 60 s clock (${Math.round(waitMs / 1000)} s)…`)
    await new Promise((r) => setTimeout(r, waitMs))
  }
  const resumed = report('clocked')
  console.log(`tick verdict after the clock: ${JSON.stringify(resumed)}`)
  check(resumed.state === 'retry', "the next tick reads the expired clock as 'retry'")
  check(resumed.parksTheTick === false, 'the tick is no longer parked — it goes on to start a session')
  check(resumed.clearsTheRecord === true, 'and the pause record is cleared by that tick')

  // 3. THE CONTROL: a clockless legacy marker is never resumed.
  writeFileSync(
    join(SCRATCH, 'legacy'),
    'autostart watchdog: 3 resurrections made no progress (auth expired? model flag?) — investigate, then delete this file.\n',
  )
  const legacy = report('legacy')
  console.log(`tick verdict on a legacy marker: ${JSON.stringify(legacy)}`)
  check(legacy.state === 'hold', "a marker written without a clock reads as 'hold'")
  check(legacy.parksTheTick === true, 'and parks the batch — a missing clock is never an expired one')
  check(legacy.clearsTheRecord === false, 'nothing removes it but a human')

  // 4. THE LIVE RECORD WAS NEVER TOUCHED.
  const liveAfter = existsSync(LIVE_PAUSE) ? readFileSync(LIVE_PAUSE, 'utf8') : null
  check(liveAfter === liveBefore, 'the real .claude/batch-paused is exactly as the drill found it')
} finally {
  if (existsSync(SCRATCH)) rmSync(SCRATCH, { recursive: true, force: true })
}

if (failures.length) {
  console.error(`\nDRILL FAILED (${failures.length}): ${failures.join('; ')}`)
  process.exit(1)
}
console.log('\nDRILL PASSED — a park with a clock resumes itself, a park without one does not.')
