// The pause record and its restart clock (point 445).
//
// The verifiable claim of the point, in three states: a reason and a retry-after
// survive the round trip, an EXPIRED clock yields 'retry', and a CLOCKLESS park —
// every marker written before this mechanism existed, and every one a human writes
// by hand — yields 'hold', however long ago it was written.
import { describe, it, expect } from 'vitest'
import {
  CLOCKLESS_CAUSES,
  PAUSE_RETRY_LADDER_MS,
  classifyPause,
  describePause,
  formatPauseRecord,
  isClocklessCause,
  parseInstant,
  parsePauseRecord,
  planPause,
} from './batch-pause-core.mjs'

const NOW = Date.parse('2026-08-06T12:00:00.000Z')
const MIN = 60 * 1000

describe('the record round-trips its reason and its clock', () => {
  it('writes and reads back reason, cause, attempt and retry-after', () => {
    const text = formatPauseRecord({
      reason: 'child-retry: the environment is out (git push refused)',
      cause: 'outage',
      retryAfter: NOW + 20 * MIN,
      pausedAt: NOW,
      attempt: 1,
    })
    const rec = parsePauseRecord(text)
    expect(rec.reason).toBe('child-retry: the environment is out (git push refused)')
    expect(rec.cause).toBe('outage')
    expect(rec.retryAfter).toBe(NOW + 20 * MIN)
    expect(rec.pausedAt).toBe(NOW)
    expect(rec.attempt).toBe(1)
  })

  it('keeps a multi-line reason whole, colons and all', () => {
    const reason = 'autostart watchdog: 3 resurrections made no progress\ninvestigate: auth? push? the current point?'
    const rec = parsePauseRecord(formatPauseRecord({ reason, retryAfter: NOW }))
    expect(rec.reason).toBe(reason)
  })

  it('reads an epoch-millisecond stamp as well as an ISO one', () => {
    expect(parseInstant('2026-08-06T12:00:00.000Z')).toBe(NOW)
    expect(parseInstant(String(NOW))).toBe(NOW)
    expect(parseInstant('tomorrow-ish')).toBeNull()
    expect(parseInstant(null)).toBeNull()
  })

  // The one corruption that could flip the mechanism toward resuming: a torn write
  // leaves a TRUNCATED stamp, and `Date.parse('2026')` is 1 January 2026 — a date in
  // the past, which would read as an expired clock (four-eyes review, finding 4).
  it('refuses a truncated stamp instead of reading it as a past instant', () => {
    for (const torn of ['2026', '2026-08', '2026-08-06', '2026-08-06T']) {
      expect(parseInstant(torn), `${torn} must not parse`).toBeNull()
      expect(classifyPause({ text: `torn write\nretry-after: ${torn}\n`, now: NOW }).state).toBe('hold')
    }
  })

  it('records a clockless park as a decision (`never`), not as an omission', () => {
    const text = formatPauseRecord({ reason: 'serving model outside the allowlist', cause: 'serving-model', retryAfter: null })
    expect(text).toMatch(/retry-after: never/)
    expect(parsePauseRecord(text).clocklessOnPurpose).toBe(true)
  })
})

describe('what the launcher does with what it found', () => {
  it('an ABSENT record is not a pause at all', () => {
    expect(classifyPause({ text: null, now: NOW }).state).toBe('none')
  })

  it('an EXPIRED clock yields retry', () => {
    const text = formatPauseRecord({ reason: 'red CI run', cause: 'ci', retryAfter: NOW - MIN, pausedAt: NOW - 21 * MIN })
    const v = classifyPause({ text, now: NOW })
    expect(v.state).toBe('retry')
    expect(v.reason).toBe('red CI run')
    expect(describePause(v)).toMatch(/PAUSE CLOCK EXPIRED/)
  })

  it('a clock still running yields wait, with the time left', () => {
    const text = formatPauseRecord({ reason: 'guard loop', retryAfter: NOW + 12 * MIN })
    const v = classifyPause({ text, now: NOW })
    expect(v.state).toBe('wait')
    expect(v.waitMs).toBe(12 * MIN)
    expect(describePause(v)).toMatch(/12 min left/)
  })

  it('the boundary second is a retry, not a wait', () => {
    const text = formatPauseRecord({ reason: 'x', retryAfter: NOW })
    expect(classifyPause({ text, now: NOW }).state).toBe('retry')
  })

  // The whole safety direction of the point: a missing clock may NEVER be read as
  // an expired one, or a genuinely unsafe park would resume itself.
  it('a CLOCKLESS legacy marker holds — however old it is', () => {
    const legacy = 'autostart watchdog: 3 resurrections made no progress (auth expired? model flag?) — investigate, then delete this file.\n'
    for (const now of [NOW, NOW + 400 * 24 * 60 * MIN]) {
      const v = classifyPause({ text: legacy, now })
      expect(v.state).toBe('hold')
      expect(v.reason).toContain('autostart watchdog')
    }
  })

  it('an EMPTY marker file is a park, not an absence', () => {
    expect(classifyPause({ text: '', now: NOW }).state).toBe('hold')
  })

  it('`retry-after: never` holds and says so', () => {
    const text = formatPauseRecord({ reason: 'Haiku answered', cause: 'serving-model', retryAfter: null })
    const v = classifyPause({ text, now: NOW })
    expect(v.state).toBe('hold')
    expect(v.why).toMatch(/on purpose/)
    expect(describePause(v)).toMatch(/no restart clock/)
  })

  it('an UNREADABLE stamp holds rather than resuming', () => {
    const v = classifyPause({ text: 'something broke\nretry-after: soon\n', now: NOW })
    expect(v.state).toBe('hold')
    expect(v.why).toMatch(/unreadable/)
  })
})

describe('the clock a new park gets', () => {
  it('climbs the ladder rung by rung', () => {
    for (const [attempt, delay] of PAUSE_RETRY_LADDER_MS.entries()) {
      const plan = planPause({ cause: 'runaway', attempt, now: NOW })
      expect(plan.clockless).toBe(false)
      expect(plan.retryAfter).toBe(NOW + delay)
    }
  })

  it('parks without a clock once the ladder is exhausted', () => {
    const plan = planPause({ cause: 'runaway', attempt: PAUSE_RETRY_LADDER_MS.length, now: NOW })
    expect(plan.clockless).toBe(true)
    expect(plan.retryAfter).toBeNull()
    expect(plan.cause).toBe('runaway')
    expect(plan.why).toBe(CLOCKLESS_CAUSES['retries-exhausted'])
  })

  it('never puts a clock on a cause from the written-down unsafe list', () => {
    for (const cause of Object.keys(CLOCKLESS_CAUSES)) {
      expect(isClocklessCause(cause)).toBe(true)
      expect(planPause({ cause, attempt: 0, now: NOW }).retryAfter).toBeNull()
    }
    expect(isClocklessCause('outage')).toBe(false)
    expect(isClocklessCause(null)).toBe(false)
  })

  it('the list stays SHORT — a growing one is the mechanism dying by exception', () => {
    expect(Object.keys(CLOCKLESS_CAUSES).length).toBeLessThanOrEqual(5)
  })

  it('a plan written out reads back as the state it planned', () => {
    const plan = planPause({ cause: 'outage', attempt: 0, now: NOW })
    const text = formatPauseRecord({ reason: 'ntfy unreachable', ...plan, pausedAt: NOW })
    expect(classifyPause({ text, now: NOW }).state).toBe('wait')
    expect(classifyPause({ text, now: NOW + PAUSE_RETRY_LADDER_MS[0] }).state).toBe('retry')
  })
})
