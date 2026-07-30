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
import { notify, ntfyTopic } from './notify.mjs'
import { repoPath } from './repo-paths.mjs'

// Whether the real runtime-state directory existed BEFORE this suite ran. The
// suite must not change that answer — see the last case in the notify block.
const RESILIENCE_DIR_EXISTED = existsSync(repoPath('.claude/resilience'))

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
  vi.unstubAllEnvs()
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
    first.commit()

    // Same alert, different minute count — the SAME key, and inside the gap.
    const second = await escalate({ title: 'Batch steht', message: 'kein Push seit 151 Minuten', env: {}, now: T0 + 5 * MIN_MS, ...h })
    expect(second.deliver).toBe(false)
    expect(second.decision.rung).toBe(1)
    expect(second.commit).toBeUndefined() // nothing was sent, nothing to book

    const third = await escalate({ title: 'Batch steht', message: 'kein Push seit 181 Minuten', env: {}, now: T0 + 16 * MIN_MS, ...h })
    expect(third.deliver).toBe(true)
    expect(third.decision.rung).toBe(1)
    third.commit()
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
      const v = await escalate({ title: 'Batch steht', message: `kein Push seit ${100 + i * 30} Minuten`, env: {}, priority: 'high', now, ...h, pause })
      v.commit?.()
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
      const v = await escalate({ title: 'Batch steht', message: `kein Push seit ${100 + i * 30} Minuten`, env: {}, priority: 'high', now, ...h, pause })
      v.commit?.()
      now += ALERT_GAPS_MS[Math.min(i + 1, ALERT_GAPS_MS.length - 1)] + MIN_MS
    }
    expect(setPaused).not.toHaveBeenCalled()
    expect(h.cards).toHaveLength(0)
  })

  it('keeps two different alerts on two ladders, though they share one ntfy topic', async () => {
    // Would have prevented: a CI-red alert being throttled into silence by the
    // watchdog's climb, or vice versa.
    const h = harness()
    ;(await escalate({ title: 'Batch steht', message: 'kein Push seit 121 Minuten', env: {}, now: T0, ...h })).commit()
    const ci = await escalate({ title: 'CI rot', message: 'main ist rot', env: {}, now: T0 + MIN_MS, ...h })
    expect(ci.deliver).toBe(true)
    expect(ci.decision.rung).toBe(0)
    ci.commit()
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

describe('notify — the wiring, on an injected topic', () => {
  // HERMETIC BY CONSTRUCTION (four-eyes review, blocker). These cases used to
  // pass only because .claude/ntfy-topic does not exist in a worktree. It DOES
  // exist in the main working directory — the channel is in active use — so on
  // `main` the same tests found a topic, consulted the REAL ladder, wrote REAL
  // state into .claude/resilience/ and asserted the opposite of what happened.
  const topicAt = (name = 'topic') => {
    const p = join(dir, name)
    writeFileSync(p, 'hoa-test-topic' + String.fromCharCode(10))
    return p
  }
  const okFetch = () => vi.fn(async () => ({ ok: true }))

  it('reads the topic from the injected path, not from the working directory', () => {
    expect(ntfyTopic(topicAt())).toBe('hoa-test-topic')
    expect(ntfyTopic(join(dir, 'absent'))).toBeNull()
  })

  it('sends nothing and asks the ladder nothing when no topic is configured', async () => {
    const fetchSpy = okFetch()
    vi.stubGlobal('fetch', fetchSpy)
    const escalation = { escalate: vi.fn() }
    await expect(notify('t', 'm', 'default', { topicFile: join(dir, 'absent'), escalation })).resolves.toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(escalation.escalate).not.toHaveBeenCalled()
  })

  it('POSTs the first alert and books the rung only after the POST succeeded', async () => {
    const fetchSpy = okFetch()
    vi.stubGlobal('fetch', fetchSpy)
    const commit = vi.fn()
    const escalation = { escalate: vi.fn(async () => ({ deliver: true, priority: 'high', commit })) }
    await expect(notify('Batch steht', 'kein Push seit 121 Minuten', 'high', { topicFile: topicAt(), escalation })).resolves.toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][1].headers.Priority).toBe('high')
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('does NOT book the rung when the POST fails — a standing alert stays loud', async () => {
    // Booking before the POST silenced a standing alert for a whole rung gap,
    // up to two hours; board-watchdog.mjs documents guarding against exactly
    // this.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    const commit = vi.fn()
    const escalation = { escalate: vi.fn(async () => ({ deliver: true, priority: 'high', commit })) }
    await expect(notify('t', 'm', 'high', { topicFile: topicAt(), escalation })).resolves.toBe(false)
    expect(commit).not.toHaveBeenCalled()
  })

  it('does not book the rung when the POST throws either', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const commit = vi.fn()
    const escalation = { escalate: vi.fn(async () => ({ deliver: true, priority: 'high', commit })) }
    await expect(notify('t', 'm', 'high', { topicFile: topicAt(), escalation })).resolves.toBe(false)
    expect(commit).not.toHaveBeenCalled()
  })

  it('does not POST at all when the ladder holds the alert back', async () => {
    const fetchSpy = okFetch()
    vi.stubGlobal('fetch', fetchSpy)
    const escalation = { escalate: vi.fn(async () => ({ deliver: false, priority: 'default', decision: {} })) }
    await expect(notify('t', 'm', 'default', { topicFile: topicAt(), escalation })).resolves.toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('POSTs unthrottled with escalate:false, never consulting the ladder', async () => {
    const fetchSpy = okFetch()
    vi.stubGlobal('fetch', fetchSpy)
    const escalation = { escalate: vi.fn() }
    await expect(notify('Resurrected', 'successor spawned', 'low', { topicFile: topicAt(), escalate: false, escalation })).resolves.toBe(true)
    expect(escalation.escalate).not.toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('DELIVERS when the ladder module itself throws (fail-open = deliver)', async () => {
    const fetchSpy = okFetch()
    vi.stubGlobal('fetch', fetchSpy)
    const escalation = { escalate: async () => { throw new Error('ladder broken') } }
    await expect(notify('t', 'm', 'urgent', { topicFile: topicAt(), escalation })).resolves.toBe(true)
    expect(fetchSpy.mock.calls[0][1].headers.Priority).toBe('urgent')
  })

  it('carries the caller priority into the ladder, so the pause gate can read it', async () => {
    vi.stubGlobal('fetch', okFetch())
    const escalate = vi.fn(async () => ({ deliver: true, priority: 'low', commit: () => {} }))
    await notify('Resurrected', 'successor spawned', 'low', { topicFile: topicAt(), escalation: { escalate } })
    expect(escalate.mock.calls[0][0]).toMatchObject({ priority: 'low' })
  })

  it('still accepts the old three-argument call shape every existing caller uses', async () => {
    // HERMETIC, and the second time this lesson was learnt (four-eyes re-review):
    // the earlier version asserted `false` here with the comment "the real path,
    // which in this worktree has no topic". On `main` the topic file EXISTS, so
    // the assertion inverted and the fast gate would have gone red the moment
    // this branch landed — while the call also wrote a real ladder log.
    //
    // What the case actually proves is the FOURTH PARAMETER'S DEFAULT: three
    // arguments must not throw on the destructuring. So the ladder is switched
    // off for the call (no state written anywhere) and the assertion is on the
    // SHAPE, which is the same on every machine.
    vi.stubEnv('HOA_ALERT_ESCALATION', 'off')
    vi.stubGlobal('fetch', okFetch())
    await expect(notify('t', 'm', 'high')).resolves.toBeTypeOf('boolean')
    await expect(notify('t', 'm')).resolves.toBeTypeOf('boolean')
    await expect(notify('t')).resolves.toBeTypeOf('boolean')
  })

  it('writes no ladder state into the repository when the tests run', () => {
    // The guard on the whole class of defect above: whatever the suite did, it
    // must not have created the real runtime-state directory.
    expect(existsSync(repoPath('.claude/resilience'))).toBe(RESILIENCE_DIR_EXISTED)
  })

  it('END TO END through the real ladder: the second identical alert is not POSTed', async () => {
    // The case the non-hermetic tests could not reach at all — notify() and the
    // REAL escalate() together.
    const fetchSpy = okFetch()
    vi.stubGlobal('fetch', fetchSpy)
    const h = harness()
    const escalation = { escalate: (args) => escalate({ ...args, env: {}, ...h }) }
    const opts = { topicFile: topicAt(), escalation }
    await expect(notify('Batch steht', 'kein Push seit 121 Minuten', 'high', opts)).resolves.toBe(true)
    await expect(notify('Batch steht', 'kein Push seit 151 Minuten', 'high', opts)).resolves.toBe(false)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
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
    ;(await escalate({ title: 'x', message: 'y', env: {}, now: T0, ...h })).commit()
    rmSync(h.ladderPath, { force: true })
    const again = await escalate({ title: 'x', message: 'y', env: {}, now: T0 + MIN_MS, ...h })
    expect(again.deliver).toBe(true)
    expect(again.decision.rung).toBe(0)
  })
})
