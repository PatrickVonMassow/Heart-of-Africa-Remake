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
import { readLauncherRecord, stopDaemon } from './batch-launcher.mjs'
import { probePid } from './batch-singleton.mjs'

const LAUNCHER = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'batch-launcher.mjs')).href

/** Long enough that no daemon reaches a second tick while the race is judged, so
 *  what the test watches is the singleton and not the interval. */
const TICK_MS = 10 * 60 * 1000
/** How many daemons start at once. The count the live probe failed at. */
const RACERS = 6
/** How long the survivors get to converge. Convergence is a publish apart. */
const SETTLE_MS = 10_000

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

async function settle(running, deadlineMs) {
  const deadline = Date.now() + deadlineMs
  while (running.size > 1 && Date.now() < deadline) await sleep(100)
  // One more moment so a late loser's exit is counted rather than raced against.
  await sleep(300)
}

describe('runDaemon — six starts at once leave exactly one launcher', () => {
  it('lets one daemon own the record and every other leave it alone', { timeout: 90_000 }, async () => {
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
        expect(probePid(survivors[0].pid).exists).toBe(false)
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
