// The launcher's own stall alarm, pinned on the 23.08.2026 incident's shapes
// (point 859): dead ticks, the suspend, the recovery — judged pure, no clock,
// no network, no child processes.
import { describe, expect, it } from 'vitest'
import {
  STALL_ALERT_AFTER,
  SUSPEND_OVERSHOOT_MS_MIN,
  initialStallState,
  judgeSleep,
  judgeTick,
  markAlertDelivered,
} from './launcher-stall-core.mjs'

const MIN = 60 * 1000
const T0 = 1_787_476_800_000 // an arbitrary fixed epoch — the core never reads a clock

function deadTicks(n, { state = initialStallState(), startAt = T0, stepMs = 15 * MIN } = {}) {
  const out = []
  let s = state
  for (let i = 0; i < n; i++) {
    const v = judgeTick({ state: s, alive: false, now: startAt + i * stepMs })
    out.push(v)
    s = v.state
  }
  return out
}

describe('judgeTick — the incident itself: consecutive dead ticks', () => {
  it('stays quiet on the first dead tick and alerts on the second', () => {
    const [first, second] = deadTicks(2)
    expect(first.alert).toBeNull()
    expect(first.log).toMatch(/dead tick 1\//)
    expect(second.alert).not.toBeNull()
    expect(second.alert.priority).toBe('high')
    expect(second.alert.message).toMatch(/2 tick\(s\)/)
    expect(second.alert.message).toMatch(/restart VS Code/)
  })

  it('the third dead tick does not double the alert: same episode, same ladder key', () => {
    const [, second, third] = deadTicks(3)
    // The demand REPEATS on purpose — a send can fail while the network is down,
    // and the ladder books a rung only on confirmed delivery — but it repeats as
    // the SAME climbing alert, never as a second independent one.
    expect(third.alert).not.toBeNull()
    expect(third.alert.key).toBe(second.alert.key)
    expect(third.alert.title).toBe(second.alert.title)
  })

  it('the NEXT stall is a new episode: fresh ladder key, no inherited history', () => {
    const firstEpisode = deadTicks(2)
    const recovered = judgeTick({
      state: markAlertDelivered(firstEpisode[1].state),
      alive: true,
      now: T0 + 60 * MIN,
    })
    const secondEpisode = deadTicks(2, { state: recovered.state, startAt: T0 + 120 * MIN })
    expect(secondEpisode[1].alert).not.toBeNull()
    expect(secondEpisode[1].alert.key).not.toBe(firstEpisode[1].alert.key)
    for (const v of [firstEpisode[1], secondEpisode[1]]) expect(v.alert.key).toMatch(/^launcher-stall:\d+$/)
  })

  it('counts the stall duration from the FIRST dead tick', () => {
    const verdicts = deadTicks(3, { stepMs: 15 * MIN })
    expect(verdicts[2].alert.message).toMatch(/dead for 30 min/)
  })

  it('a lost/garbage state never throws and behaves as a fresh run', () => {
    for (const state of [null, undefined, 'junk', 42]) {
      const v = judgeTick({ state, alive: false, now: T0 })
      expect(v.alert).toBeNull()
      expect(v.state.deadRun).toBe(1)
    }
  })
})

describe('judgeSleep — the host suspend', () => {
  const tickMs = 15 * MIN

  it('marks a sleep that overshot by more than an interval as a suspend', () => {
    const v = judgeSleep({
      state: initialStallState(),
      plannedMs: tickMs,
      actualMs: tickMs + tickMs + MIN, // slept one whole extra interval and change
      tickMs,
    })
    expect(v.state.suspended).toBe(true)
    expect(v.log).toMatch(/suspend/)
  })

  it('lets ordinary lag pass — early wakes and small overshoots are not suspends', () => {
    for (const actualMs of [20 * 1000, tickMs, tickMs + 30 * 1000]) {
      const v = judgeSleep({ state: initialStallState(), plannedMs: tickMs, actualMs, tickMs })
      expect(v.state.suspended).toBeFalsy()
      expect(v.log).toBeNull()
    }
  })

  it('holds the five-minute floor, so a short test interval cannot flag scheduling hiccups', () => {
    const shortTick = 40
    const v = judgeSleep({
      state: initialStallState(),
      plannedMs: shortTick,
      actualMs: shortTick + 2 * MIN, // huge relative to the interval, small absolutely
      tickMs: shortTick,
    })
    expect(v.state.suspended).toBeFalsy()
    expect(SUSPEND_OVERSHOOT_MS_MIN).toBeGreaterThanOrEqual(5 * MIN)
  })

  it('after a suspend the FIRST dead tick alerts immediately', () => {
    const slept = judgeSleep({
      state: initialStallState(),
      plannedMs: 15 * MIN,
      actualMs: 3 * 60 * MIN, // the incident: hours gone
      tickMs: 15 * MIN,
    })
    const v = judgeTick({ state: slept.state, alive: false, now: T0 })
    expect(v.alert).not.toBeNull()
    expect(v.alert.message).toMatch(/host suspend/)
  })
})

describe('judgeTick — recovery', () => {
  it('the first working tick after a DELIVERED alert sends the one-time recovery notice and resets', () => {
    const dead = deadTicks(3)
    const delivered = markAlertDelivered(dead[dead.length - 1].state)
    const back = judgeTick({ state: delivered, alive: true, now: T0 + 60 * MIN })
    expect(back.recovery).not.toBeNull()
    expect(back.recovery.priority).toBe('default')
    expect(back.recovery.message).toMatch(/3 dead attempt/)
    expect(back.state).toEqual(initialStallState())
    // The NEXT working tick has nothing to say — the notice is once per episode.
    const after = judgeTick({ state: back.state, alive: true, now: T0 + 75 * MIN })
    expect(after.recovery).toBeNull()
    expect(after.log).toBeNull()
  })

  it('"alerted" means DELIVERED: a stall whose every send failed ends without a recovery notice', () => {
    // Three demands went out and none was confirmed — the daemon never called
    // markAlertDelivered, so there is no received alert to stand down.
    const dead = deadTicks(3)
    const back = judgeTick({ state: dead[dead.length - 1].state, alive: true, now: T0 + 60 * MIN })
    expect(back.recovery).toBeNull()
    expect(back.log).toMatch(/no alert had been delivered/)
    expect(back.state).toEqual(initialStallState())
  })

  it('a working tick after UN-alerted dead ticks resets silently — no alert, no notice', () => {
    const [first] = deadTicks(1)
    const back = judgeTick({ state: first.state, alive: true, now: T0 + 15 * MIN })
    expect(back.recovery).toBeNull()
    expect(back.state).toEqual(initialStallState())
  })

  it('a recovery also clears the suspend mark, so the next episode starts at the ordinary threshold', () => {
    const slept = judgeSleep({ state: initialStallState(), plannedMs: 15 * MIN, actualMs: 60 * MIN, tickMs: 15 * MIN })
    const deadOnce = judgeTick({ state: slept.state, alive: false, now: T0 })
    const back = judgeTick({ state: deadOnce.state, alive: true, now: T0 + 15 * MIN })
    const deadAgain = judgeTick({ state: back.state, alive: false, now: T0 + 30 * MIN })
    expect(deadAgain.alert).toBeNull()
    expect(STALL_ALERT_AFTER).toBe(2)
  })
})
