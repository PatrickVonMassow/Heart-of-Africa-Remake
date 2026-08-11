// THE LAUNCHER MUST RUN ONCE (point 474, user 03.08.2026) — raced for real.
//
// The daemon's singleton used to be a check-then-publish: read the record, and if
// nothing armed is in it, start ticking. Two starts milliseconds apart both read
// the same empty record, and node's own ~50–100 ms boot makes that window trivial
// to hit — six simultaneous starts left two to five daemons running, in every
// round of a live probe. Worse, `--stop` then killed the one pid the record named,
// wrote `stopped`, and reported `disabled` while a survivor went on ticking and
// re-armed the record at its next publish.
//
// A test that only asserts the new rule back to itself would prove none of that,
// so this one RACES: real processes, spawned in one synchronous burst on a
// throwaway record, each running the real `runDaemon`. Only the tick is injected —
// the race is over the record, and the batch is never touched.
import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { writeJsonAtomic } from './atomic-write.mjs'
import { readLauncherRecord, runDaemon, stopDaemon } from './batch-launcher.mjs'
import { probePid } from './batch-singleton.mjs'

const LAUNCHER = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'batch-launcher.mjs')).href

/** Long enough that no daemon reaches a second tick while the race is judged, so
 *  what the test watches is the singleton and not the interval. */
const TICK_MS = 10 * 60 * 1000
/** How many daemons start at once. The count the live probe failed at. */
const RACERS = 6
/** How long the losers get to boot, look and leave. Convergence itself is one
 *  publish — measured at ~1.5 s for the whole race on a quiet machine — so this is
 *  margin, not a budget: a green round never waits it out, and it is generous for
 *  the same reason `vitest.config.ts` raised its own timeouts, because six extra
 *  node boots beside four vitest workers are what the machine is actually doing. */
const SETTLE_MS = 30_000

const EXIT_YIELDED = 20
const EXIT_REFUSED = 21

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** One daemon, in its own process, on the injected tick. */
const RUNNER = `
import { runDaemon } from ${JSON.stringify(LAUNCHER)}
const outcome = await runDaemon({
  recordPath: process.env.HOA_RECORD,
  logPath: process.env.HOA_LOG,
  tickMs: Number(process.env.HOA_TICK_MS),
  tick: () => new Promise((r) => setTimeout(() => r(0), 20)),
}).catch(() => 'refused')
process.exit(outcome === 'stopped' ? 0 : outcome === 'yielded' ? ${EXIT_YIELDED} : ${EXIT_REFUSED})
`

function arena() {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-launcher-race-'))
  const runner = join(dir, 'runner.mjs')
  writeFileSync(runner, RUNNER, 'utf8')
  return {
    dir,
    runner,
    recordPath: join(dir, 'batch-launcher.json'),
    logPath: join(dir, 'batch-launcher.log'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

/** Spawns them in ONE synchronous burst — no await between, which is what a
 *  session running `--start` twice in a breath actually produces. */
function race(place, count) {
  const kids = []
  const running = new Set()
  for (let i = 0; i < count; i++) {
    const kid = spawn(process.execPath, [place.runner], {
      env: {
        ...process.env,
        HOA_RECORD: place.recordPath,
        HOA_LOG: place.logPath,
        HOA_TICK_MS: String(TICK_MS),
      },
      stdio: 'ignore',
      windowsHide: true,
    })
    kid.on('exit', (code) => {
      kid.stoppedWith = code
      running.delete(kid)
    })
    kids.push(kid)
    running.add(kid)
  }
  return { kids, running }
}

/** Does the pid still exist? A process that has died but not yet been reaped is
 *  still a pid to `kill(pid, 0)`, so the answer is polled briefly rather than
 *  taken from the first look — the claim is "it is gone", not "it went in one go". */
async function gone(pid, waitMs = 5000) {
  const deadline = Date.now() + waitMs
  while (probePid(pid).exists && Date.now() < deadline) await sleep(100)
  return probePid(pid).exists
}

async function settle(running, deadlineMs) {
  const deadline = Date.now() + deadlineMs
  while (running.size > 1 && Date.now() < deadline) await sleep(100)
  // One more moment so a late loser's exit is counted rather than raced against.
  await sleep(300)
}

describe('runDaemon — six starts at once leave exactly one launcher', () => {
  it('lets one daemon own the record and every other leave it alone', { timeout: 150_000 }, async () => {
    // Two rounds, because a race that happens to come out right once proves
    // nothing; the defect this pins produced two to five survivors every round.
    for (let round = 0; round < 2; round++) {
      const place = arena()
      const { kids, running } = race(place, RACERS)
      try {
        await settle(running, SETTLE_MS)

        const survivors = [...running]
        expect(survivors.map((k) => k.pid)).toHaveLength(1)

        // The one still ticking is the one the record names — a launcher nobody
        // can find is as bad as two of them.
        const record = readLauncherRecord(place.recordPath)
        expect(record?.pid).toBe(survivors[0].pid)
        expect(record?.stopped).not.toBe(true)
        expect(probePid(survivors[0].pid).exists).toBe(true)

        // And the losers left because they lost, not because they crashed: they
        // yielded the record (or were refused outright by the pre-check).
        for (const kid of kids) {
          if (kid === survivors[0]) continue
          expect([EXIT_YIELDED, EXIT_REFUSED]).toContain(kid.stoppedWith)
        }

        // `--stop` may not report a disarmed launcher while one still ticks. With
        // one survivor it can be believed — and it is checked against the process,
        // not against the mark it wrote itself.
        const stopped = await stopDaemon({ recordPath: place.recordPath, tickMs: TICK_MS })
        expect(stopped.stopped).toBe(true)
        expect(stopped.state).toBe('disabled')
        expect(await gone(survivors[0].pid)).toBe(false)
      } finally {
        for (const kid of kids) {
          try {
            kid.kill('SIGKILL')
          } catch {
            /* already gone */
          }
        }
        place.cleanup()
      }
    }
  })
})

// --- THE RELEASE BRINGS THE TICK FORWARD (point 612) --------------------------
// The pure decision is pinned in batch-launcher-core.test; what THIS one proves is
// that the loop acts on it — the failure of 10.08.2026 was not a wrong decision
// but a sleep that nobody interrupted, and a decision nothing consults would
// reproduce it exactly while every unit test stayed green.
describe('runDaemon — a released lock is not waited out', () => {
  /** The daemon is stopped from inside its own tick, by laying down the stop mark
   *  its next publish honours. No signals: this runs in the vitest process. */
  const stopFrom = (recordPath) => writeJsonAtomic(recordPath, { stopped: true, stoppedAt: Date.now() + 1 })

  it('ticks again within seconds of a handover, not at the next quarter hour', { timeout: 30_000 }, async () => {
    const place = arena()
    try {
      // One whole interval is far longer than this test waits: a SECOND tick can
      // only come from the watcher.
      const tickMs = 10 * 60 * 1000
      let lock = { sessionId: 's1', claimedAt: Date.now() }
      const ticks = []
      const started = Date.now()
      const outcome = await runDaemon({
        recordPath: place.recordPath,
        logPath: place.logPath,
        tickMs,
        pollMs: 20,
        wakeGapMs: 0,
        readLock: () => lock,
        isPaused: () => false,
        tick: () => {
          ticks.push(Date.now() - started)
          if (ticks.length === 1) {
            // The boundary marks the lock handed over a moment after the tick that
            // saw it held — precisely the 13:20/13:31 gap that cost half an hour.
            setTimeout(() => {
              lock = { sessionId: 's1', handedOver: true, handedOverAt: Date.now() }
            }, 60)
          } else {
            stopFrom(place.recordPath)
          }
          return Promise.resolve(0)
        },
      })
      expect(ticks.length).toBeGreaterThanOrEqual(2)
      // SECONDS, not a quarter of an hour. The bound is deliberately loose against
      // a loaded machine and still two orders of magnitude under the interval.
      expect(ticks[1] - ticks[0]).toBeLessThan(5000)
      expect(outcome).toBe('yielded')
    } finally {
      place.cleanup()
    }
  })

  it('ticks again within seconds of an IDLE lapse too, not only a handover', { timeout: 30_000 }, async () => {
    // 612's refinement: an idle lapse and an expired lease end ownership just as
    // definitively as a handover, and a signal hung on the mark alone would leave
    // those waiting out the quarter hour — the very latency this removes. The
    // verdict is `assessOwner`'s here, exactly as in the tick.
    const place = arena()
    try {
      let lock = { sessionId: 's1', claimedAt: Date.now(), acquiredAt: Date.now() }
      const ticks = []
      const started = Date.now()
      const outcome = await runDaemon({
        recordPath: place.recordPath,
        logPath: place.logPath,
        tickMs: 10 * 60 * 1000,
        pollMs: 20,
        wakeGapMs: 0,
        readLock: () => lock,
        isPaused: () => false,
        tick: () => {
          ticks.push(Date.now() - started)
          if (ticks.length === 1) {
            setTimeout(() => {
              // Took the lock, never ran a thing, and the window has passed.
              const at = Date.now() - 6 * 60 * 1000
              lock = { sessionId: 's1', claimedAt: at, acquiredAt: at, pid: process.pid }
            }, 60)
          } else {
            stopFrom(place.recordPath)
          }
          return Promise.resolve(0)
        },
      })
      expect(ticks.length).toBeGreaterThanOrEqual(2)
      expect(ticks[1] - ticks[0]).toBeLessThan(5000)
      expect(outcome).toBe('yielded')
    } finally {
      place.cleanup()
    }
  })

  // THE WAKE MAY NOT DEPEND ON WHEN THE FIRST POLL HAPPENS TO RUN (point 644,
  // measured 11.08.2026 — the red on `main`, CI run 31504918389).
  //
  // The two tests above have a 40 ms margin and nothing guarding it: the daemon
  // arms its first poll 20 ms after the tick, they hand the lock its new state at
  // 60 ms, and the poll is armed only once the tick's record writes are done
  // (polls measured at 20/41/61 ms here and on the runner, against a change at
  // 60 ms). Stall the worker's event loop wider than that margin — a loaded CI
  // runner does it by itself, and 300 in-place samples there bounded the ordinary
  // lag at 23 ms, which is why no local load ever reproduced this — and the two
  // swap: the daemon's baseline used to be whatever its FIRST POLL saw, so an
  // ownership that had already ended became the baseline instead of an event,
  // nothing changed afterwards, and the loop slept the whole interval out. Vitest
  // reports that as a 30 s TIMEOUT, not as a missed budget, which is exactly the
  // shape the red had.
  //
  // So the stall is INJECTED rather than waited for, and this pins the property on
  // every host: 120 ms of busy loop inside the tick, after the change timer is
  // armed. Against the old loop it times out every single time; the wake now comes
  // from the baseline taken BEFORE the tick, so the change is an event whenever it
  // lands. The same case arises without any stall at all when ownership ends WHILE
  // the tick runs — a handover a second before the tick's child finishes.
  it('wakes when a stall lets ownership end before the sleep first polls', { timeout: 30_000 }, async () => {
    const place = arena()
    try {
      let lock = { sessionId: 's1', claimedAt: Date.now(), acquiredAt: Date.now() }
      const ticks = []
      const started = Date.now()
      const outcome = await runDaemon({
        recordPath: place.recordPath,
        logPath: place.logPath,
        tickMs: 10 * 60 * 1000,
        pollMs: 20,
        wakeGapMs: 0,
        readLock: () => lock,
        isPaused: () => false,
        tick: () => {
          ticks.push(Date.now() - started)
          if (ticks.length === 1) {
            setTimeout(() => {
              // Took the lock, never ran a thing, and the window has passed.
              const at = Date.now() - 6 * 60 * 1000
              lock = { sessionId: 's1', claimedAt: at, acquiredAt: at, pid: process.pid }
            }, 60)
            // The starvation, made deliberate: while this runs the loop cannot arm
            // the poll timer, so the change above is certain to land first.
            const until = Date.now() + 120
            while (Date.now() < until) {
              /* busy on purpose */
            }
          } else {
            stopFrom(place.recordPath)
          }
          return Promise.resolve(0)
        },
      })
      expect(ticks.length).toBeGreaterThanOrEqual(2)
      expect(ticks[1] - ticks[0]).toBeLessThan(5000)
      expect(outcome).toBe('yielded')
    } finally {
      place.cleanup()
    }
  })

  it('sleeps the whole interval out while the owner holds the lock', { timeout: 30_000 }, async () => {
    const place = arena()
    try {
      const ticks = []
      const lock = { sessionId: 's1', claimedAt: Date.now() }
      const outcome = await runDaemon({
        recordPath: place.recordPath,
        logPath: place.logPath,
        tickMs: 2500,
        pollMs: 20,
        wakeGapMs: 0,
        // A heartbeat moves `claimedAt` on every tool call — that is a change, and
        // it must not be read as a release, or a working owner would be ticked at
        // five times a second.
        readLock: () => ({ ...lock, claimedAt: Date.now() }),
        isPaused: () => false,
        tick: () => {
          ticks.push(Date.now())
          if (ticks.length >= 2) stopFrom(place.recordPath)
          return Promise.resolve(0)
        },
      })
      expect(ticks.length).toBe(2)
      expect(ticks[1] - ticks[0]).toBeGreaterThanOrEqual(2000)
      expect(outcome).toBe('yielded')
    } finally {
      place.cleanup()
    }
  })

  it('does NOT bring a tick forward while the batch is paused', { timeout: 30_000 }, async () => {
    const place = arena()
    try {
      let lock = { sessionId: 's1', claimedAt: Date.now() }
      const ticks = []
      const outcome = await runDaemon({
        recordPath: place.recordPath,
        logPath: place.logPath,
        tickMs: 2500,
        pollMs: 20,
        wakeGapMs: 0,
        readLock: () => lock,
        isPaused: () => true,
        tick: () => {
          ticks.push(Date.now())
          if (ticks.length === 1) setTimeout(() => (lock = null), 60)
          else stopFrom(place.recordPath)
          return Promise.resolve(0)
        },
      })
      expect(ticks.length).toBe(2)
      expect(ticks[1] - ticks[0]).toBeGreaterThanOrEqual(2000)
      expect(outcome).toBe('yielded')
    } finally {
      place.cleanup()
    }
  })

  it('a lock that cannot be read never takes the launcher down', { timeout: 30_000 }, async () => {
    const place = arena()
    try {
      const ticks = []
      const outcome = await runDaemon({
        recordPath: place.recordPath,
        logPath: place.logPath,
        tickMs: 2000,
        pollMs: 20,
        wakeGapMs: 0,
        readLock: () => {
          throw new Error('EACCES')
        },
        isPaused: () => false,
        tick: () => {
          ticks.push(Date.now())
          if (ticks.length >= 2) stopFrom(place.recordPath)
          return Promise.resolve(0)
        },
      })
      // The 15-minute backstop is what still runs, and it did.
      expect(ticks.length).toBe(2)
      expect(outcome).toBe('yielded')
    } finally {
      place.cleanup()
    }
  })
})
