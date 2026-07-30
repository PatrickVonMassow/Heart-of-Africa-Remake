// The escalation ladder (point 434, remainder of part 1) — the I/O half and the
// notify() wiring. The rungs themselves are proven in
// alert-escalation-core.test.mjs; what is proven HERE is that no file, clock or
// environment edge can turn the throttle into a swallowed alert.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { escalate, higherPriority, readLadder, writeLadder, logLine, boardCard, PRIORITY_ORDER } from './alert-escalation.mjs'
import { ALERT_GAPS_MS, ALERT_PAUSE_RUNG } from './alert-escalation-core.mjs'
import { notify } from './notify.mjs'

const T0 = Date.UTC(2026, 6, 30, 0, 0, 0)
const MIN_MS = 60 * 1000

let dir
/** A ladder on real temp files, with the pause API and the board stubbed — so
 *  the REAL rung logic runs instead of falling through the fail-open catch. */
const harness = () => {
  const cards = []
  return {
    ladderPath: join(dir, 'ladder.json'),
    logPath: join(dir, 'ladder.log'),
    board: (...args) => (cards.push(args), true),
    pause: { isPaused: () => false, setPaused: () => {} },
    cards,
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hoa-alert-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

describe('higherPriority — the ladder may RAISE a caller’s priority, never lower it', () => {
  it('keeps an urgent caller urgent on rung 0', () => {
    // Would have prevented: the model-guard capability-breach alert arriving as
    // an ordinary notification because rung 0's own priority is "default".
    expect(higherPriority('urgent', 'default')).toBe('urgent')
  })

  it('raises a default caller to the rung’s priority', () => {
    expect(higherPriority('default', 'urgent')).toBe('urgent')
    expect(higherPriority('default', 'high')).toBe('high')
  })

  it('tolerates a priority it does not know rather than dropping the alert', () => {
    expect(higherPriority('made-up', 'high')).toBe('high')
    expect(higherPriority('high', 'made-up')).toBe('high')
    expect(PRIORITY_ORDER).toContain('urgent')
  })
})

describe('readLadder — a broken ladder file never silences the channel', () => {
  it('answers an empty ladder when the file is absent', () => {
    expect(readLadder(join(dir, 'nope.json'))).toEqual({ alerts: {} })
  })

  it('answers an empty ladder on a half-written document', () => {
    const p = join(dir, 'l.json')
    writeFileSync(p, '{"alerts": {"k": {"rung"')
    expect(readLadder(p)).toEqual({ alerts: {} })
  })

  it('round-trips a written ladder', () => {
    const p = join(dir, 'l.json')
    writeLadder({ alerts: { k: { rung: 2, lastSentAt: 1 } } }, p)
    expect(readLadder(p).alerts.k.rung).toBe(2)
  })
})

describe('escalate — the off switch and the fail-open path', () => {
  it('delivers everything unthrottled with HOA_ALERT_ESCALATION=off', async () => {
    const v = await escalate({ title: 't', message: 'm', env: { HOA_ALERT_ESCALATION: 'off' } })
    expect(v).toMatchObject({ deliver: true, disabled: true })
  })

  it('is case-insensitive about the off switch', async () => {
    expect((await escalate({ title: 't', env: { HOA_ALERT_ESCALATION: 'OFF' } })).deliver).toBe(true)
  })

  it('leaves the ladder ON by default', async () => {
    const v = await escalate({ title: 'independence probe', message: 'first ever', env: {}, ...harness() })
    expect(v.disabled).toBeUndefined()
    expect(v.deliver).toBe(true)
  })

  it('delivers unthrottled when the pause API itself throws (fail-open = deliver)', async () => {
    // The one thing an alerting throttle must never do is swallow a message
    // because its own machinery broke.
    const h = harness()
    const v = await escalate({
      title: 't',
      message: 'm',
      env: {},
      ladderPath: h.ladderPath,
      logPath: h.logPath,
      board: h.board,
      pause: {
        isPaused() {
          throw new Error('lock unreadable')
        },
        setPaused() {},
      },
    })
    expect(v.deliver).toBe(true)
    expect(v.error).toMatch(/lock unreadable/)
  })
})

describe('escalate — the full climb, on real files', () => {
  it('sends the first alert, holds the identical second, and books each rung', async () => {
    // THE NIGHT: the watchdog fires every 30 min. Without the ladder that is
    // eight identical buzzes before morning; with it, four rising ones.
    const h = harness()
    const first = await escalate({ title: 'Batch steht', message: 'kein Push seit 121 Minuten', env: {}, now: T0, ...h })
    expect(first.deliver).toBe(true)
    expect(first.decision.rung).toBe(0)

    // Same alert, different minute count — the SAME key, and inside the gap.
    const second = await escalate({ title: 'Batch steht', message: 'kein Push seit 151 Minuten', env: {}, now: T0 + 5 * MIN_MS, ...h })
    expect(second.deliver).toBe(false)
    expect(second.decision.rung).toBe(1)

    const third = await escalate({ title: 'Batch steht', message: 'kein Push seit 181 Minuten', env: {}, now: T0 + 16 * MIN_MS, ...h })
    expect(third.deliver).toBe(true)
    expect(third.decision.rung).toBe(1)
    expect(readLadder(h.ladderPath).alerts[Object.keys(readLadder(h.ladderPath).alerts)[0]].rung).toBe(2)
  })

  it('PAUSES the batch with a board card at the last rung, and says why in the log', async () => {
    // The rung that makes the difference: an alert can be slept through, a
    // paused batch with a card cannot.
    const h = harness()
    let now = T0
    let paused = null
    const pause = { isPaused: () => paused != null, setPaused: (r) => (paused = r) }
    for (let i = 0; i <= ALERT_PAUSE_RUNG; i++) {
      await escalate({ title: 'Batch steht', message: `kein Push seit ${100 + i * 30} Minuten`, env: {}, now, ...h, pause })
      now += ALERT_GAPS_MS[Math.min(i + 1, ALERT_GAPS_MS.length - 1)] + MIN_MS
    }
    expect(paused).toMatch(/Eskalation/)
    expect(paused).toMatch(/batch-paused/)
    expect(h.cards).toHaveLength(1)
    expect(h.cards[0][0]).toMatch(/Batch pausiert/)
    expect(readFileSync(h.logPath, 'utf8')).toMatch(/PAUSED THE BATCH/)
  })

  it('does not pause a second time while the batch is already paused', async () => {
    const h = harness()
    const setPaused = vi.fn()
    const pause = { isPaused: () => true, setPaused }
    let now = T0
    for (let i = 0; i <= ALERT_PAUSE_RUNG + 1; i++) {
      await escalate({ title: 'Batch steht', message: `kein Push seit ${100 + i * 30} Minuten`, env: {}, now, ...h, pause })
      now += ALERT_GAPS_MS[Math.min(i + 1, ALERT_GAPS_MS.length - 1)] + MIN_MS
    }
    expect(setPaused).not.toHaveBeenCalled()
    expect(h.cards).toHaveLength(0)
  })

  it('keeps two different alerts on two ladders, though they share one ntfy topic', async () => {
    // Would have prevented: a CI-red alert being throttled into silence by the
    // watchdog's climb, or vice versa.
    const h = harness()
    await escalate({ title: 'Batch steht', message: 'kein Push seit 121 Minuten', env: {}, now: T0, ...h })
    const ci = await escalate({ title: 'CI rot', message: 'main ist rot', env: {}, now: T0 + MIN_MS, ...h })
    expect(ci.deliver).toBe(true)
    expect(ci.decision.rung).toBe(0)
    expect(Object.keys(readLadder(h.ladderPath).alerts)).toHaveLength(2)
  })
})

describe('the reason reaches the morning reader', () => {
  it('logLine appends a timestamped line', () => {
    const p = join(dir, 'a.log')
    logLine('[k] pause-and-send', p)
    expect(readFileSync(p, 'utf8')).toMatch(/pause-and-send/)
  })

  it('logLine swallows an unwritable path instead of costing the alert', () => {
    expect(() => logLine('x', join(dir, 'no-dir', 'a.log'))).not.toThrow()
  })

  it('boardCard reports failure instead of throwing when the board cannot be written', () => {
    // Would have prevented: the whole pause path dying on a board error and
    // leaving neither a card NOR a pause.
    expect(boardCard('t', 'q', { cwd: dir })).toBe(false)
    expect(existsSync(join(dir, '.batch-dashboard.html'))).toBe(false)
  })
})

describe('notify — the wiring', () => {
  it('sends nothing and asks the ladder nothing when no topic is configured', async () => {
    // The channel being off must not accumulate ladder state that then throttles
    // the first REAL alert after it is switched on.
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await notify('t', 'm')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('accepts the ladder options without breaking the old three-argument callers', async () => {
    // Every existing caller (launcher, board watchdog, model guard, deferral)
    // still calls notify(title, message, priority).
    const fetchSpy = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('fetch', fetchSpy)
    await expect(notify('t', 'm', 'high')).resolves.toBe(false) // no topic in a worktree
    await expect(notify('t', 'm', 'high', { escalate: false })).resolves.toBe(false)
    await expect(notify('t', 'm', 'high', { key: 'explicit' })).resolves.toBe(false)
  })
})

describe('INDEPENDENCE — the ladder acts while the other layers are missing', () => {
  it('escalates without a batch lock, a launcher log or an in-flight declaration', async () => {
    // The launcher log ENDED at 02:21 on the night this was built for. The only
    // state this layer needs is its own file, and it works without that too.
    const h = harness()
    const v = await escalate({ title: 'probe', message: 'no other layer has written anything', env: {}, now: T0, ...h })
    expect(v.deliver).toBe(true)
    expect(v.decision.rung).toBe(0)
  })

  it('climbs on its own state alone, with the ladder file freshly deleted mid-climb', async () => {
    // A stale or swept state file must not lock the channel: the ladder simply
    // starts over and still delivers.
    const h = harness()
    await escalate({ title: 'x', message: 'y', env: {}, now: T0, ...h })
    rmSync(h.ladderPath, { force: true })
    const again = await escalate({ title: 'x', message: 'y', env: {}, now: T0 + MIN_MS, ...h })
    expect(again.deliver).toBe(true)
    expect(again.decision.rung).toBe(0)
  })
})
