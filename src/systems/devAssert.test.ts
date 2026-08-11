// The in-game invariant channel (point 207(i)): a failed assert reports itself
// via console.error — which every verify suite's console-error gate turns into
// a failure — and lands in window.__assertLog; per-code rate limiting keeps a
// persistent violation from flooding. DEV-only by the import.meta.env.DEV guard
// (vitest runs with DEV true, so the behaviour is testable here).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createProducerWatch,
  devAssert,
  resetDevAsserts,
  watchProducer,
  LONG_RUN_SUSPEND_SECONDS,
  type ProducerWatch,
} from './devAssert'

describe('devAssert (point 207(i) — broken rules report themselves)', () => {
  let spy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    resetDevAsserts()
    ;(window as unknown as { __assertLog?: unknown[] }).__assertLog = []
    spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => spy.mockRestore())

  it('a passing condition stays silent and never evaluates the detail', () => {
    let evaluated = false
    devAssert(true, 'ok-code', () => {
      evaluated = true
      return 'x'
    })
    expect(spy).not.toHaveBeenCalled()
    expect(evaluated).toBe(false)
  })

  it('a failing condition logs [ASSERT] with the code and detail and records to __assertLog', () => {
    devAssert(false, 'demo-broken', () => 'zebra at NaN')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(String(spy.mock.calls[0][0])).toContain('[ASSERT] demo-broken')
    expect(String(spy.mock.calls[0][0])).toContain('zebra at NaN')
    const log = (window as unknown as { __assertLog: Array<{ code: string }> }).__assertLog
    expect(log.length).toBe(1)
    expect(log[0].code).toBe('demo-broken')
  })

  it('rate-limits per code but not across codes', () => {
    devAssert(false, 'code-a')
    devAssert(false, 'code-a') // suppressed (same code, within the window)
    devAssert(false, 'code-b') // different code fires
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

/**
 * The LONG-RUN family (point 589). The class it exists for is the one no suite
 * can reach: a system that produces for minutes and then stops. The tests below
 * drive simulated MINUTES through the watch in fractions of a real second — that
 * is exactly what makes the alarm cheap to prove and the defect expensive to
 * find any other way.
 */
describe('watchProducer (point 589 — a producer that must keep producing)', () => {
  let spy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    resetDevAsserts()
    ;(window as unknown as { __assertLog?: unknown[] }).__assertLog = []
    spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => spy.mockRestore())

  const fired = () => spy.mock.calls.map((c) => String(c[0]))

  /** Runs `seconds` of world through a watch at 0.5 s steps, producing whenever
   *  `produce` says so and expecting production whenever `expected` does. */
  function run(
    watch: ProducerWatch,
    seconds: number,
    opts: {
      max?: number
      step?: number
      produce?: (t: number) => boolean
      expected?: (t: number) => boolean
    } = {},
  ): void {
    const step = opts.step ?? 0.5
    for (let t = 0; t < seconds; t += step) {
      watchProducer(watch, {
        code: 'demo-producer',
        dt: step,
        produced: opts.produce ? opts.produce(t) : false,
        expected: opts.expected ? opts.expected(t) : true,
        maxSilenceSeconds: opts.max ?? 60,
        detail: () => 'four villagers, three of them on an errand',
      })
    }
  }

  it('says nothing through half an hour of a producer that keeps producing', () => {
    const watch = createProducerWatch()
    // One output every 20 s against a 60 s window — a healthy cadence.
    run(watch, 1800, { produce: (t) => t % 20 < 0.5 })
    expect(fired()).toEqual([])
    expect(watch.produced).toBe(90)
    expect(watch.silence).toBeLessThan(20)
  })

  it('FIRES once the producer has been silent past its own window, and names the silence', () => {
    const watch = createProducerWatch()
    // Produces for a minute, then stops for good — the shape of the defect.
    run(watch, 300, { produce: (t) => t < 60 && t % 20 < 0.5 })
    expect(fired().join(' ')).toContain('[ASSERT] demo-producer')
    expect(fired().join(' ')).toContain('of 60s')
    // The caller's detail rides along, so the alarm names the situation.
    expect(fired().join(' ')).toContain('four villagers')
  })

  it('stays silent on a producer that is legitimately quiet, however long', () => {
    const watch = createProducerWatch()
    run(watch, 3600, { expected: () => false })
    expect(fired()).toEqual([])
    expect(watch.silence).toBe(0)
  })

  it('gives a producer its FULL window again after a legitimate quiet spell', () => {
    const watch = createProducerWatch()
    // Half an hour with nobody to speak to, then the window opens: the alarm
    // must not fire on the first step it is judged again.
    run(watch, 1800, { expected: () => false })
    run(watch, 50, { expected: () => true })
    expect(fired()).toEqual([])
    run(watch, 20, { expected: () => true })
    expect(fired().join(' ')).toContain('demo-producer')
  })

  it('re-arms: producing again clears the clock, and a second stall is reported too', () => {
    const watch = createProducerWatch()
    run(watch, 90)
    expect(fired().length).toBe(1)
    run(watch, 1, { produce: () => true })
    expect(watch.silence).toBe(0)
    resetDevAsserts() // clear only the 5 s per-code rate limit, not the watch
    run(watch, 90)
    expect(fired().length).toBe(2)
  })

  it('does not let a frame-loop gap raise the alarm (a hidden tab is not a stall)', () => {
    const watch = createProducerWatch()
    // Ten minutes of wall clock arriving as one step: the game was not running,
    // so the producer is owed nothing beyond the suspend threshold.
    watchProducer(watch, {
      code: 'demo-producer',
      dt: 600,
      produced: false,
      expected: true,
      maxSilenceSeconds: 60,
    })
    expect(fired()).toEqual([])
    expect(watch.silence).toBe(LONG_RUN_SUSPEND_SECONDS)
  })

  it('still reports a producer stalled on a loop crawling past the suspend threshold', () => {
    // Six-second frames: a game in that state is barely running, but a producer
    // that has stopped in it must not be able to hide behind the frame time.
    const watch = createProducerWatch()
    run(watch, 120, { step: 6, max: 60 })
    expect(fired().join(' ')).toContain('demo-producer')
  })

  it('keeps the window in ELAPSED seconds on a machine running at half a frame a second', () => {
    // The window must not stretch with the frame time: at 2 s steps a 60 s
    // window is still reached after 60 seconds of world, not 120.
    const watch = createProducerWatch()
    run(watch, 58, { step: 2, max: 60 })
    expect(fired()).toEqual([])
    expect(watch.silence).toBeCloseTo(58, 6)
    run(watch, 6, { step: 2, max: 60 })
    expect(fired().join(' ')).toContain('demo-producer')
    // …and a step at the suspend threshold itself still counts.
    expect(LONG_RUN_SUSPEND_SECONDS).toBeGreaterThan(2)
  })

  it('ignores a step that is not a positive number', () => {
    const watch = createProducerWatch()
    for (const dt of [NaN, Infinity, -1, 0]) {
      watchProducer(watch, { code: 'demo-producer', dt, produced: false, expected: true, maxSilenceSeconds: 60 })
    }
    expect(watch.silence).toBe(0)
    expect(fired()).toEqual([])
  })

  it('never evaluates the detail while the producer is healthy', () => {
    const watch = createProducerWatch()
    let evaluated = false
    watchProducer(watch, {
      code: 'demo-producer',
      dt: 0.5,
      produced: true,
      expected: true,
      maxSilenceSeconds: 60,
      detail: () => {
        evaluated = true
        return 'x'
      },
    })
    expect(evaluated).toBe(false)
  })

  it('reports every watched producer on window.__longRun for a live session', () => {
    const watch = createProducerWatch()
    run(watch, 30, { max: 60 })
    const live = (window as unknown as {
      __longRun: Record<string, { silence: number; max: number; produced: number; expected: boolean }>
    }).__longRun
    expect(live['demo-producer'].max).toBe(60)
    expect(live['demo-producer'].expected).toBe(true)
    expect(live['demo-producer'].silence).toBeGreaterThan(25)
    expect(live['demo-producer'].produced).toBe(0)
  })
})
