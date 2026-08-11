// TEMPORARY INSTRUMENTATION (work-order point 644) — REMOVE once the CI run is read.
//
// It measures, ON THE HOST THAT ACTUALLY RUNS IT and under the real load of the
// whole unit suite, the one quantity that decides whether
// `scripts/batch-launcher-daemon.test.mjs > ticks again within seconds of an IDLE
// lapse too` passes: HOW LONG AFTER A TICK THE DAEMON'S FIRST LOCK POLL RUNS.
//
// The daemon reacts to a CHANGE of the ownership signal and treats its FIRST
// observation of a sleep as the baseline ("first observation — nothing to
// compare"). The daemon tests hand the lock its new state from a 60 ms timer. So
// if the first poll — armed for `pollMs` (20 ms) after the tick, but only once the
// tick's synchronous record work is done — lands AFTER that 60 ms, the ended
// ownership becomes the baseline, nothing ever changes again, and the daemon
// sleeps the whole interval out. That is a TIMEOUT, not a slow tick, which is
// exactly the shape of the red on `main` (run 31504918389).
//
// It asserts nothing about the timing: it prints the distribution and the
// per-iteration verdict, so a green CI run carries the measurement.
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeJsonAtomic } from './atomic-write.mjs'
import { runDaemon } from './batch-launcher.mjs'

const ITERATIONS = 100
/** Short enough that an iteration whose wake never came recovers at the ordinary
 *  tick instead of hanging the suite — the interval IS the failure signature. */
const TICK_MS = 800
const CHANGE_AFTER_MS = 60

const arena = () => {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-firstpoll-'))
  return {
    recordPath: join(dir, 'r.json'),
    logPath: join(dir, 'r.log'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

describe('POINT 644 PROBE — when does the daemon first look at the lock after a tick?', () => {
  it('measures the first-poll delay and the wake it decides', { timeout: 240_000 }, async () => {
    const rows = []
    for (let i = 0; i < ITERATIONS; i++) {
      const place = arena()
      let lock = { sessionId: 's1', claimedAt: Date.now(), acquiredAt: Date.now() }
      let tick1At = 0
      let changeAt = 0
      let firstPollAt = 0
      const ticks = []
      await runDaemon({
        recordPath: place.recordPath,
        logPath: place.logPath,
        tickMs: TICK_MS,
        pollMs: 20,
        wakeGapMs: 0,
        readLock: () => {
          if (!firstPollAt && tick1At) firstPollAt = Date.now()
          return lock
        },
        isPaused: () => false,
        tick: () => {
          ticks.push(Date.now())
          if (ticks.length === 1) {
            tick1At = Date.now()
            setTimeout(() => {
              const at = Date.now() - 6 * 60 * 1000
              changeAt = Date.now()
              lock = { sessionId: 's1', claimedAt: at, acquiredAt: at, pid: process.pid }
            }, CHANGE_AFTER_MS)
          } else {
            writeJsonAtomic(place.recordPath, { stopped: true, stoppedAt: Date.now() + 1 })
          }
          return Promise.resolve(0)
        },
      })
      rows.push({
        overheadMs: firstPollAt - tick1At - 20,
        pollAfterChange: changeAt > 0 && firstPollAt >= changeAt,
        gapMs: ticks[1] - ticks[0],
      })
      place.cleanup()
    }

    const overheads = rows.map((r) => r.overheadMs).sort((a, b) => a - b)
    const late = rows.filter((r) => r.pollAfterChange)
    const waitedOut = rows.filter((r) => r.gapMs >= TICK_MS * 0.8)
    const at = (q) => overheads[Math.min(overheads.length - 1, Math.floor(overheads.length * q))]
    console.log(
      `POINT 644 PROBE (${ITERATIONS} runs): first-poll overhead ms — min ${overheads[0]}, p50 ${at(0.5)}, ` +
        `p90 ${at(0.9)}, p99 ${at(0.99)}, max ${overheads[overheads.length - 1]}; ` +
        `first poll landed AFTER the ${CHANGE_AFTER_MS} ms change in ${late.length}/${ITERATIONS}; ` +
        `the wake never came (waited the ${TICK_MS} ms interval out) in ${waitedOut.length}/${ITERATIONS}.`,
    )
    console.log(
      `POINT 644 PROBE late runs: ${JSON.stringify(late.slice(0, 20).map((r) => ({ o: r.overheadMs, gap: r.gapMs })))}`,
    )
    expect(rows).toHaveLength(ITERATIONS)
  })
})
