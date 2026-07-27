// The autonomous session boundary (point 373, user 27.07.2026), pinned.
//
// The three witnesses the point names, plus the ways the mechanism could be
// abused into the two failures it must never cause:
//   - stopping mid-point (the idle stop the batch-progress-guard exists to
//     prevent), and
//   - stopping with a launcher that will never fire, which would not shorten a
//     session but END the batch.
import { describe, it, expect } from 'vitest'
import {
  BOUNDARY_FRESH_MS,
  assessBoundary,
  boundaryVerdict,
  classifyLauncherState,
  pointClosure,
} from './batch-boundary-core.mjs'
import { progressGuardDecision } from './batch-singleton.mjs'

const NOW = 1_785_000_000_000
const SID = 'session-abc'
const marker = (over = {}) => ({ v: 1, sessionId: SID, point: 373, at: NOW - 1000, ...over })

// ---------------------------------------------------------------------------
describe('classifyLauncherState — armed means "will fire again on its own"', () => {
  it('reads the Ready/Queued/Running states as armed, by name and by number', () => {
    for (const v of ['Ready', 'ready', 'Queued', 'Running', 3, '3', 2, 4]) {
      expect(classifyLauncherState(v)).toBe('armed')
    }
  })

  it('reads Disabled as disabled', () => {
    expect(classifyLauncherState('Disabled')).toBe('disabled')
    expect(classifyLauncherState(1)).toBe('disabled')
  })

  it('reads a missing, empty or unrecognised answer as unknown — never as armed', () => {
    for (const v of [null, undefined, '', '   ', 'Unknown', 0, 'ObjectNotFound']) {
      expect(classifyLauncherState(v)).toBe('unknown')
    }
  })
})

// ---------------------------------------------------------------------------
describe('pointClosure — the work order decides, not the claim', () => {
  const open = '- [ ] 374. Something still to do\n- [x] 999. leftover tick\n'
  const archive = '- [x] 373. The session boundary becomes autonomous\n'

  it('calls a point still listed open OPEN, even if the archive also has a tick', () => {
    expect(pointClosure(374, open, `${archive}- [x] 374. half-moved\n`)).toBe('open')
  })

  it('calls a point ticked in the archive CLOSED', () => {
    expect(pointClosure(373, open, archive)).toBe('closed')
  })

  it('accepts a tick that has not been archived yet (tick and move are not one commit)', () => {
    expect(pointClosure(999, open, '')).toBe('closed')
  })

  it('calls a point that appears nowhere UNKNOWN — absence is not completion', () => {
    expect(pointClosure(500, open, archive)).toBe('unknown')
  })

  it('rejects a non-point', () => {
    expect(pointClosure('x', open, archive)).toBe('unknown')
    expect(pointClosure(0, open, archive)).toBe('unknown')
  })

  it('does not confuse a point number with a longer one sharing its prefix', () => {
    expect(pointClosure(37, '- [ ] 373. open\n', '')).toBe('unknown')
  })
})

// ---------------------------------------------------------------------------
describe('assessBoundary', () => {
  it('accepts a fresh marker of this session for a closed point', () => {
    const b = assessBoundary({ marker: marker(), sid: SID, now: NOW, closure: 'closed' })
    expect(b).toEqual({ valid: true, point: 373, reason: 'boundary' })
  })

  it('reports no marker as no-marker (not as a refusal)', () => {
    expect(assessBoundary({ marker: null, sid: SID, now: NOW, closure: 'closed' }).reason).toBe(
      'no-marker',
    )
  })

  it('refuses a marker for a point that is still open', () => {
    const b = assessBoundary({ marker: marker(), sid: SID, now: NOW, closure: 'open' })
    expect(b.valid).toBe(false)
    expect(b.reason).toBe('point-still-open')
  })

  it('refuses a point whose closure cannot be verified', () => {
    expect(assessBoundary({ marker: marker(), sid: SID, now: NOW, closure: 'unknown' }).reason).toBe(
      'point-not-verifiable',
    )
  })

  it('refuses a marker left by a different session', () => {
    const b = assessBoundary({ marker: marker(), sid: 'other', now: NOW, closure: 'closed' })
    expect(b.valid).toBe(false)
    expect(b.reason).toBe('marker-foreign-session')
  })

  it('refuses when the asking session has no id at all', () => {
    expect(assessBoundary({ marker: marker(), sid: '', now: NOW, closure: 'closed' }).valid).toBe(false)
  })

  it('refuses a stale marker — an abandoned attempt must not authorise a later stop', () => {
    const old = marker({ at: NOW - BOUNDARY_FRESH_MS - 1 })
    expect(assessBoundary({ marker: old, sid: SID, now: NOW, closure: 'closed' }).reason).toBe(
      'marker-stale',
    )
  })

  it('refuses a malformed marker', () => {
    expect(assessBoundary({ marker: { sessionId: SID }, sid: SID, now: NOW, closure: 'closed' }).reason).toBe(
      'marker-malformed',
    )
    expect(
      assessBoundary({ marker: marker({ at: 'soon' }), sid: SID, now: NOW, closure: 'closed' }).reason,
    ).toBe('marker-stale')
  })
})

// ---------------------------------------------------------------------------
describe('boundaryVerdict', () => {
  const good = { valid: true, point: 373, reason: 'boundary' }

  it('allows the stop with an armed launcher', () => {
    expect(boundaryVerdict({ boundary: good, launcher: 'armed' })).toBe('allow-boundary')
  })

  it('blocks with a disabled or unknown launcher — a stop then ends the BATCH', () => {
    expect(boundaryVerdict({ boundary: good, launcher: 'disabled' })).toBe('block-launcher')
    expect(boundaryVerdict({ boundary: good, launcher: 'unknown' })).toBe('block-launcher')
  })

  it('stays out of the way when no boundary is claimed', () => {
    expect(boundaryVerdict({ boundary: null, launcher: 'armed' })).toBe(null)
    expect(
      boundaryVerdict({ boundary: { valid: false, reason: 'no-marker' }, launcher: 'armed' }),
    ).toBe(null)
  })

  it('falls through (→ the ordinary block) on a refused claim', () => {
    expect(
      boundaryVerdict({ boundary: { valid: false, point: 373, reason: 'point-still-open' }, launcher: 'armed' }),
    ).toBe(null)
  })
})

// ---------------------------------------------------------------------------
describe('progressGuardDecision at a point boundary (the point-373 witnesses)', () => {
  const base = {
    sid: SID,
    paused: false,
    openCount: 5,
    formatSuspect: false,
    ownership: 'mine',
    unhandledAlert: false,
  }
  const closed = { valid: true, point: 373, reason: 'boundary' }
  const stillOpen = { valid: false, point: 373, reason: 'point-still-open' }

  it('ALLOWS a boundary stop with a closed point and an armed launcher', () => {
    expect(progressGuardDecision({ ...base, boundary: closed, launcher: 'armed' })).toBe(
      'allow-boundary',
    )
  })

  it('BLOCKS the same stop while the point is still open', () => {
    expect(progressGuardDecision({ ...base, boundary: stillOpen, launcher: 'armed' })).toBe(
      'block-continue',
    )
  })

  it('BLOCKS with an unarmed launcher, so a disabled task can never strand the batch', () => {
    expect(progressGuardDecision({ ...base, boundary: closed, launcher: 'disabled' })).toBe(
      'block-launcher',
    )
    expect(progressGuardDecision({ ...base, boundary: closed, launcher: 'unknown' })).toBe(
      'block-launcher',
    )
  })

  it('keeps every pre-existing verdict unchanged when no boundary is claimed', () => {
    expect(progressGuardDecision(base)).toBe('block-continue')
    expect(progressGuardDecision({ ...base, boundary: null, launcher: 'armed' })).toBe('block-continue')
    expect(progressGuardDecision({ ...base, ownership: 'held', boundary: closed, launcher: 'armed' })).toBe(
      'stand-down',
    )
    expect(progressGuardDecision({ ...base, paused: true, boundary: closed, launcher: 'armed' })).toBe(
      'allow',
    )
  })

  it('never lets a boundary skip the parallel-session remediation', () => {
    expect(
      progressGuardDecision({ ...base, unhandledAlert: true, boundary: closed, launcher: 'armed' }),
    ).toBe('block-remediate')
  })

  it('never lets a boundary hide an unparseable work order', () => {
    expect(
      progressGuardDecision({ ...base, formatSuspect: true, boundary: closed, launcher: 'armed' }),
    ).toBe('block-format')
  })
})
