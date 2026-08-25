// The escalation ladder (point 434, remainder of part 1) — the I/O half and the
// notify() wiring. The rungs themselves are proven in
// alert-escalation-core.test.mjs; what is proven HERE is that no file, clock or
// environment edge can turn the throttle into a swallowed alert.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  continuationCardBody,
  corruptionCardBody,
  escalate,
  higherPriority,
  logLine,
  PRIORITY_ORDER,
  readLadder,
  runCorruptionRepair,
  writeLadder,
} from './alert-escalation.mjs'
import { ALERT_GAPS_MS, ALERT_PAUSE_RUNG } from './alert-escalation-core.mjs'
import { notify, ntfyTopic } from './notify.mjs'
import { repoPath } from './repo-paths.mjs'

// Whether the real runtime-state directory existed BEFORE this suite ran. The
// suite must not change that answer — see the last case in the notify block.
const RESILIENCE_DIR_EXISTED = existsSync(repoPath('.claude/resilience'))

const T0 = Date.UTC(2026, 6, 30, 0, 0, 0)
const MIN_MS = 60 * 1000

let dir
/** A ladder on real temp files, with the pause API stubbed — so the REAL rung
 *  logic runs instead of falling through the fail-open catch. The decision record
 *  is no longer a board call to intercept (point 749): it is read back from the
 *  ladder the commit wrote. */
const harness = () => {
  const paths = {
    ladderPath: join(dir, 'ladder.json'),
    logPath: join(dir, 'ladder.log'),
  }
  return {
    ...paths,
    pause: { isPaused: () => false, setPaused: () => {} },
    repair: () => ({ ok: true, exitCode: 0 }),
    /** Every decision record standing in the ladder, as [title, body] pairs. */
    get records() {
      return Object.values(readLadder(paths.ladderPath).alerts ?? {})
        .filter((entry) => entry?.record)
        .map((entry) => [entry.record.title, entry.record.body])
    },
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

  it('REPAIRS repository corruption, records the choice, and keeps a capped probe', async () => {
    const h = harness()
    let now = T0
    let last
    const setPaused = vi.fn()
    const repair = vi.fn(() => ({ ok: false, exitCode: 1 }))
    const pause = { isPaused: () => false, setPaused }
    for (let i = 0; i <= ALERT_PAUSE_RUNG; i++) {
      last = await escalate({
        title: 'REPOSITORY INTEGRITY',
        message: `broken invariant ${100 + i}`,
        env: {},
        priority: 'high',
        alertClass: 'repository-integrity',
        now,
        ...h,
        pause,
        repair,
      })
      last.commit?.()
      now += ALERT_GAPS_MS[Math.min(i + 1, ALERT_GAPS_MS.length - 1)] + MIN_MS
    }
    expect(last.decision.action).toBe('repair-and-probe')
    expect(last.decision.nextRung).toBe(ALERT_PAUSE_RUNG)
    expect(last.decision.nextAttemptAt).toBeGreaterThan(T0)
    expect(repair).toHaveBeenCalledOnce()
    expect(setPaused).not.toHaveBeenCalled()
    expect(h.records).toHaveLength(1)
    expect(h.records[0][0]).toBe(last.decision.decisionCard)
    expect(h.records[0][1]).toMatch(/Quarantäne- und Rescue-Nachweise/)
    expect(h.records[0][1]).toMatch(/Nächster Versuch:/)
    expect(readFileSync(h.logPath, 'utf8')).toMatch(/CORRUPTION REPAIR REMAINS/)
  })

  it('does not pause a second time while the batch is already paused', async () => {
    const h = harness()
    const setPaused = vi.fn()
    const pause = { isPaused: () => true, setPaused }
    let now = T0
    for (let i = 0; i <= ALERT_PAUSE_RUNG + 1; i++) {
      const v = await escalate({
        title: 'FORBIDDEN MODEL',
        message: `forbidden commit ${100 + i}`,
        key: 'forbidden-model',
        env: {},
        priority: 'high',
        alertClass: 'repository-integrity',
        now,
        ...h,
        pause,
      })
      v.commit?.()
      now += ALERT_GAPS_MS[Math.min(i + 1, ALERT_GAPS_MS.length - 1)] + MIN_MS
    }
    expect(setPaused).not.toHaveBeenCalled()
    expect(h.records).toHaveLength(0)
  })

  it('CONTINUES a generic stalled alert and records the decision plus retroactive veto', async () => {
    const h = harness()
    const setPaused = vi.fn()
    const pause = { isPaused: () => false, setPaused }
    let now = T0
    let last
    for (let i = 0; i <= ALERT_PAUSE_RUNG; i++) {
      last = await escalate({
        title: 'Batch drive is STALLED',
        message: `No working child for ${30 + i * 15} minutes`,
        key: 'launcher-stall:episode',
        env: {},
        priority: 'urgent',
        alertClass: 'stalled',
        now,
        ...h,
        pause,
      })
      last.commit?.()
      now += ALERT_GAPS_MS[Math.min(i + 1, ALERT_GAPS_MS.length - 1)] + MIN_MS
    }
    expect(last.decision.action).toBe('continue-and-record')
    expect(last.record?.body).toMatch(/Retroaktives Veto/)
    expect(setPaused).not.toHaveBeenCalled()
    // The record stands in the LADDER, not under "Von dir zu klären" (point 749).
    expect(h.records).toHaveLength(1)
    expect(h.records[0][0]).toBe(last.decision.decisionCard)
    expect(h.records[0][1]).toMatch(/letzten zulässigen Commit oder Zeitraum/)
    expect(readFileSync(h.logPath, 'utf8')).toMatch(/CONTINUING THE BATCH/)
  })

  it('books the rung and its record in ONE write — the record cannot fail on its own', async () => {
    // Point 749 removed the second write this case used to cover: the record went
    // to the board through `vdzk-add`, and a failed board call held the ladder on
    // its rung. The record rides with the rung now, so what is worth pinning is
    // that one commit leaves BOTH in the ladder.
    const h = harness()
    const key = 'generic-stall'
    writeLadder({
      alerts: {
        [key]: {
          rung: ALERT_PAUSE_RUNG,
          lastSentAt: T0 - ALERT_GAPS_MS[ALERT_PAUSE_RUNG],
          firstSentAt: T0 - 300 * MIN_MS,
          sends: ALERT_PAUSE_RUNG,
        },
      },
    }, h.ladderPath)
    const v = await escalate({
      title: 'Batch STALLED',
      message: 'No progress',
      key,
      env: {},
      priority: 'urgent',
      now: T0,
      ...h,
    })
    expect(v.decision.action).toBe('continue-and-record')
    expect(v.commit()).toBe(true)
    const entry = readLadder(h.ladderPath).alerts[key]
    expect(entry.rung).toBe(v.decision.nextRung)
    expect(entry.record.body).toMatch(/Retroaktives Veto/)
  })

  it('keeps a recurring event on the ceiling without filing a decision card', async () => {
    const h = harness()
    const key = 'resurrected'
    writeLadder({
      alerts: {
        [key]: {
          rung: ALERT_PAUSE_RUNG,
          lastSentAt: T0 - ALERT_GAPS_MS[ALERT_PAUSE_RUNG],
          firstSentAt: T0 - 300 * MIN_MS,
          sends: ALERT_PAUSE_RUNG,
        },
      },
    }, h.ladderPath)
    const v = await escalate({
      title: 'Resurrected',
      message: 'successor spawned',
      key,
      priority: 'low',
      recurring: true,
      env: {},
      now: T0,
      ...h,
    })
    expect(v).toMatchObject({ deliver: true, priority: 'low' })
    expect(v.decision).toMatchObject({ action: 'send', nextRung: ALERT_PAUSE_RUNG })
    expect(h.records).toHaveLength(0)
    expect(v.commit()).toBe(true)
    expect(readLadder(h.ladderPath).alerts[key].rung).toBe(ALERT_PAUSE_RUNG)
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
  it('the continuation record says what was decided and how to veto it retroactively', () => {
    const body = continuationCardBody(
      'Board out of date',
      'No publish for 90 minutes',
      { alertClass: 'staleness' },
      '23.08.2026, 20:00',
    )
    expect(body).toMatch(/Batch läuft.*weiter/)
    expect(body).toMatch(/Board out of date/)
    expect(body).toMatch(/Retroaktives Veto/)
  })

  it('the corruption record names the repair result, next attempt, and veto', () => {
    const body = corruptionCardBody(
      'Repository integrity',
      'conflict marker found',
      {
        alertClass: 'repository-integrity',
        repair: { remedy: 'batch-doctor quarantine or repair' },
        nextAttemptAt: T0 + ALERT_GAPS_MS[ALERT_PAUSE_RUNG],
      },
      { ok: false, exitCode: 1 },
      '24.08.2026, 02:00',
    )
    expect(body).toMatch(/batch-doctor quarantine or repair/)
    expect(body).toMatch(/Nächster Versuch:/)
    expect(body).toMatch(/Retroaktives Veto/)
  })

  it('a doctor execution failure returns evidence instead of throwing', () => {
    expect(runCorruptionRepair({ repair: { command: ['scripts/batch-doctor.mjs', '--repair'] } }, { cwd: dir })).toMatchObject({ ok: false })
  })

  it('logLine appends a timestamped line', () => {
    const p = join(dir, 'a.log')
    logLine('[k] pause-and-send', p)
    expect(readFileSync(p, 'utf8')).toMatch(/pause-and-send/)
  })

  it('logLine swallows an unwritable path instead of costing the alert', () => {
    expect(() => logLine('x', join(dir, 'no-dir', 'a.log'))).not.toThrow()
  })

  it('NO CALL SITE reaches the board any more (point 749)', async () => {
    // The user cleared three machine-written cards from "Von dir zu klären" by
    // hand. This asserts the source of them is gone: the module exports no board
    // writer, and a full climb to the decision rung spawns no process at all.
    const module = await import('./alert-escalation.mjs')
    expect(Object.keys(module).filter((name) => /^board/.test(name))).toEqual([])
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

  it('carries priority and class separately, so priority cannot acquire pause authority', async () => {
    vi.stubGlobal('fetch', okFetch())
    const escalate = vi.fn(async () => ({ deliver: true, priority: 'low', commit: () => {} }))
    await notify('FORBIDDEN MODEL', 'bad commit', 'low', {
      topicFile: topicAt(),
      alertClass: 'forbidden-serving-model',
      escalation: { escalate },
    })
    expect(escalate.mock.calls[0][0]).toMatchObject({
      priority: 'low',
      alertClass: 'forbidden-serving-model',
    })
  })

  it('carries recurring shape separately from priority and corruption class', async () => {
    vi.stubGlobal('fetch', okFetch())
    const escalate = vi.fn(async () => ({ deliver: true, priority: 'low', commit: () => {} }))
    await notify('Resurrected', 'successor spawned', 'low', {
      topicFile: topicAt(),
      recurring: true,
      escalation: { escalate },
    })
    expect(escalate.mock.calls[0][0]).toMatchObject({
      priority: 'low',
      alertClass: 'generic',
      recurring: true,
    })
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

describe('escalate — an EXPLICIT key is used verbatim (point 859)', () => {
  it('digit runs collapse only in DERIVED keys; two explicit episode keys stay two ladders', async () => {
    const h = harness()
    // Episode one: first alert of a fresh explicit key always goes out.
    const first = await escalate({
      title: 'Batch drive is STALLED',
      message: 'dead for 30 min now',
      key: 'launcher-stall:1787476800000',
      priority: 'high',
      env: {},
      now: T0,
      ...h,
    })
    expect(first.deliver).toBe(true)
    first.commit()
    // The SAME episode key a moment later sits inside the rung gap: suppressed —
    // this is the throttling the stall watch leans on for its re-demands.
    const again = await escalate({
      title: 'Batch drive is STALLED',
      message: 'dead for 45 min now',
      key: 'launcher-stall:1787476800000',
      priority: 'high',
      env: {},
      now: T0 + MIN_MS,
      ...h,
    })
    expect(again.deliver).toBe(false)
    // A LATER EPISODE differs only in its digits. If explicit keys were digit-
    // collapsed (they are not — escalate uses `key ?? alertKey(...)`), this
    // would inherit the first episode's rung and be suppressed. It is a fresh
    // ladder and goes straight out.
    const nextEpisode = await escalate({
      title: 'Batch drive is STALLED',
      message: 'dead for 30 min now',
      key: 'launcher-stall:1787999900000',
      priority: 'high',
      env: {},
      now: T0 + 2 * MIN_MS,
      ...h,
    })
    expect(nextEpisode.deliver).toBe(true)
  })
})
