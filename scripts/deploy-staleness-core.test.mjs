// The stale-site watchdog's decision logic (point 528). Pure — no network, no
// git, no clock: every input is passed in.
import { describe, it, expect } from 'vitest'
import { BUILD_INFO_FILE, buildInfoJson, buildInfoPayload, normalizeSha, resolveBuildCommit } from './build-info.mjs'
import {
  DEPLOY_GRACE_MS,
  IN_FLIGHT_GRACE_MS,
  MAX_DISPATCHES,
  RETRY_COOLDOWN_MS,
  judgeServedRevision,
  nextAttempts,
  parseBuildInfo,
  retryDecision,
  stalenessAlert,
} from './deploy-staleness-core.mjs'

const MAIN = 'ee125053aa11bb22cc33dd44ee55ff6677889900'
const OTHER = 'c728c816aa11bb22cc33dd44ee55ff6677889911'
const NOW = Date.parse('2026-08-06T18:00:00Z')
const served = (commit, extra = {}) => ({ status: 200, body: buildInfoJson(buildInfoPayload({ commit, ...extra })) })

describe('the revision marker the build emits', () => {
  it('round-trips through the reader — emitter and reader cannot drift apart', () => {
    const payload = buildInfoPayload({ commit: MAIN, ref: 'main', builtAt: '2026-08-06T17:00:00.000Z' })
    const back = parseBuildInfo(buildInfoJson(payload))
    expect(back).toEqual({ commit: MAIN, short: MAIN.slice(0, 7), ref: 'main', builtAt: '2026-08-06T17:00:00.000Z' })
    expect(BUILD_INFO_FILE).toBe('build-info.json')
  })

  it('never claims a revision it does not have', () => {
    expect(buildInfoPayload({ commit: 'not-a-sha' }).commit).toBe('unknown')
    expect(normalizeSha('  EE125053  ')).toBe('ee125053')
    expect(normalizeSha(null)).toBe('unknown')
    expect(parseBuildInfo(buildInfoJson(buildInfoPayload({ commit: '' })))).toBeNull()
  })

  it('takes the commit from GIT first, because a tag build runs where GITHUB_SHA names main', () => {
    expect(resolveBuildCommit({ gitSha: OTHER, env: { GITHUB_SHA: MAIN } })).toBe(OTHER)
    expect(resolveBuildCommit({ gitSha: '', env: { GITHUB_SHA: MAIN } })).toBe(MAIN)
    expect(resolveBuildCommit({})).toBe('unknown')
  })

  it('reads nothing that is not a marker', () => {
    expect(parseBuildInfo('<!doctype html><html>404</html>')).toBeNull()
    expect(parseBuildInfo('[]')).toBeNull()
    expect(parseBuildInfo('')).toBeNull()
    expect(parseBuildInfo(undefined)).toBeNull()
  })
})

describe('judgeServedRevision', () => {
  const base = { mainSha: MAIN, mainCommittedAt: NOW - 60 * 60 * 1000, now: NOW }

  it('calls the site current when it serves exactly main', () => {
    const v = judgeServedRevision({ ...base, fetched: served(MAIN) })
    expect(v.verdict).toBe('current')
    expect(v.servedSha).toBe(MAIN)
  })

  it('calls a site AHEAD of this clone current, not stale', () => {
    // A local ref that was never fetched must not send a session chasing git.
    const v = judgeServedRevision({ ...base, fetched: served(OTHER), servedContainsMain: true })
    expect(v.verdict).toBe('current')
    expect(v.reason).toContain('already contains')
  })

  it('names BOTH revisions when the site lags', () => {
    const v = judgeServedRevision({ ...base, fetched: served(OTHER) })
    expect(v.verdict).toBe('stale')
    expect(v.servedSha).toBe(OTHER)
    expect(v.mainSha).toBe(MAIN)
    expect(v.reason).toContain(OTHER.slice(0, 7))
    expect(v.reason).toContain(MAIN.slice(0, 7))
  })

  it('reads a 404 marker as a site that predates the marker — a site up with no marker is behind by definition', () => {
    const v = judgeServedRevision({ ...base, fetched: { status: 404, body: 'not found' } })
    expect(v.verdict).toBe('stale')
    expect(v.servedSha).toBeNull()
    expect(v.reason).toContain('no revision marker')
    expect(v.reason).toContain(MAIN.slice(0, 7))
  })

  // MEASURED 06.08.2026, 21:13 Berlin: two pushes to `main` created NO workflow
  // run at all — earlier in the evening runs were created and died without a
  // runner, now GitHub does not even create one. A detector that waits for a RED
  // RUN sees absolutely nothing in that state while the site ages in silence.
  // Hence: the verdict is anchored on the SERVED REVISION vs `main`, which is an
  // observation, never on a run outcome, which can simply be absent.
  it('calls the site stale with NO deploy run in existence — the run list is not the anchor', () => {
    const v = judgeServedRevision({ ...base, fetched: served(OTHER), latestRun: null })
    expect(v.verdict).toBe('stale')
    expect(v.reason).toContain('no deploy run exists')
    expect(v.servedSha).toBe(OTHER)
    expect(v.mainSha).toBe(MAIN)
  })

  it('and retries that no-run case, because GitHub answering with an empty list IS an answer', () => {
    const v = judgeServedRevision({ ...base, fetched: served(OTHER), latestRun: null })
    const d = retryDecision({ verdict: v.verdict, mainSha: v.mainSha, githubAnswering: true, now: NOW })
    expect(d.dispatch).toBe(true)
  })

  it('still holds fire on a commit younger than the window even with no run', () => {
    const v = judgeServedRevision({ ...base, mainCommittedAt: NOW - 60_000, fetched: served(OTHER), latestRun: null })
    expect(v.verdict).toBe('pending')
  })

  it('holds fire while the deploy is still within its window', () => {
    const v = judgeServedRevision({
      ...base,
      fetched: served(OTHER),
      latestRun: { createdAt: NOW - DEPLOY_GRACE_MS + 60_000, status: 'completed', conclusion: 'success' },
    })
    expect(v.verdict).toBe('pending')
  })

  it('holds fire while a run is genuinely in flight — but not forever', () => {
    const live = (ageMs) => judgeServedRevision({ ...base, fetched: served(OTHER), latestRun: { createdAt: NOW - ageMs, status: 'in_progress' } })
    expect(live(IN_FLIGHT_GRACE_MS - 60_000).verdict).toBe('pending')
    // A run that never gets a runner is the fault, not progress (06.08.2026).
    expect(live(IN_FLIGHT_GRACE_MS + 60_000).verdict).toBe('stale')
  })

  it('counts the window from the RUN, not from the commit date', () => {
    // A commit authored long before it was pushed must not be "overdue" on arrival.
    const v = judgeServedRevision({
      ...base,
      mainCommittedAt: NOW - 10 * 60 * 60 * 1000,
      fetched: served(OTHER),
      latestRun: { createdAt: NOW - 60_000, status: 'completed', conclusion: 'failure' },
    })
    expect(v.verdict).toBe('pending')
  })

  it('is UNKNOWN, never an alarm, on anything unclear', () => {
    const cases = [
      { fetched: { error: 'timed out after 15000 ms' } },
      { fetched: { status: 503, body: '' } },
      { fetched: { status: 200, body: 'not json' } },
      { fetched: served(MAIN), mainSha: '' },
      { fetched: served(MAIN), mainSha: 'nonsense' },
    ]
    for (const c of cases) expect(judgeServedRevision({ ...base, ...c }).verdict).toBe('unknown')
    expect(judgeServedRevision().verdict).toBe('unknown')
    expect(() => judgeServedRevision(null)).not.toThrow()
  })

  it('tolerates a short sha on either side', () => {
    expect(judgeServedRevision({ ...base, mainSha: MAIN.slice(0, 7), fetched: served(MAIN) }).verdict).toBe('current')
  })
})

describe('retryDecision', () => {
  const base = { verdict: 'stale', mainSha: MAIN, githubAnswering: true, now: NOW }

  it('dispatches a stale site once GitHub answers again', () => {
    const d = retryDecision(base)
    expect(d.dispatch).toBe(true)
    expect(d.attempt).toBe(1)
  })

  it('never dispatches into an outage', () => {
    expect(retryDecision({ ...base, githubAnswering: false }).dispatch).toBe(false)
  })

  it('never dispatches on a verdict that is not stale', () => {
    for (const verdict of ['current', 'pending', 'unknown']) {
      expect(retryDecision({ ...base, verdict }).dispatch).toBe(false)
    }
  })

  it('waits out the cooldown between two dispatches for one commit', () => {
    const attempts = { sha: MAIN, count: 1, at: NOW - RETRY_COOLDOWN_MS + 60_000 }
    expect(retryDecision({ ...base, attempts }).dispatch).toBe(false)
    expect(retryDecision({ ...base, attempts, now: NOW + 120_000 }).dispatch).toBe(true)
  })

  it('stops after the cap and says a human is needed', () => {
    const d = retryDecision({ ...base, attempts: { sha: MAIN, count: MAX_DISPATCHES, at: NOW - 10 * 60 * 60 * 1000 } })
    expect(d.dispatch).toBe(false)
    expect(d.exhausted).toBe(true)
    expect(d.reason).toContain('human')
  })

  it('gives a NEW commit its own budget', () => {
    const spent = { sha: OTHER, count: MAX_DISPATCHES, at: NOW - 60_000 }
    const d = retryDecision({ ...base, attempts: spent })
    expect(d.dispatch).toBe(true)
    expect(d.attempt).toBe(1)
  })

  it('never throws', () => {
    expect(() => retryDecision()).not.toThrow()
    expect(() => retryDecision(null)).not.toThrow()
    expect(retryDecision({ ...base, attempts: 'nonsense' }).dispatch).toBe(true)
  })
})

describe('stalenessAlert', () => {
  const stale = { verdict: 'stale', servedSha: OTHER, mainSha: MAIN, reason: `the site serves ${OTHER.slice(0, 7)} while \`main\` stands at ${MAIN.slice(0, 7)}`, now: NOW }

  it('is silent on every verdict but stale', () => {
    for (const verdict of ['current', 'pending', 'unknown']) {
      expect(stalenessAlert({ ...stale, verdict }).notify).toBe(false)
    }
  })

  it('names both revisions and what was done about it', () => {
    const a = stalenessAlert({ ...stale, dispatch: { dispatch: true, attempt: 1 }, dispatchOutcome: 'accepted' })
    expect(a.notify).toBe(true)
    expect(a.message).toContain(OTHER.slice(0, 7))
    expect(a.message).toContain(MAIN.slice(0, 7))
    expect(a.message).toContain('Re-dispatched')
    expect(a.priority).toBe('default')
  })

  it('reports one unchanged fault once', () => {
    const first = stalenessAlert({ ...stale, dispatch: { dispatch: false, reason: 'waiting' } })
    const again = stalenessAlert({ ...stale, dispatch: { dispatch: false, reason: 'waiting' }, lastKey: first.key })
    expect(first.notify).toBe(true)
    expect(again.notify).toBe(false)
    expect(again.key).toBe(first.key)
  })

  it('keys on the STORED attempt count, so a dispatch and its cooldown are one fault', () => {
    // The tick that dispatches and the next tick, which finds the cooldown
    // running, describe the same standing fault — it must be announced once.
    const dispatched = stalenessAlert({ ...stale, attemptCount: 1, dispatch: { dispatch: true, attempt: 1 } })
    const cooling = stalenessAlert({ ...stale, attemptCount: 1, dispatch: { dispatch: false, attempt: 0, reason: 'cooldown' }, lastKey: dispatched.key })
    expect(dispatched.notify).toBe(true)
    expect(cooling.notify).toBe(false)
    // …but the NEXT dispatch is news again.
    const second = stalenessAlert({ ...stale, attemptCount: 2, dispatch: { dispatch: true, attempt: 2 }, lastKey: dispatched.key })
    expect(second.notify).toBe(true)
  })

  it('never claims a dispatch that was not made', () => {
    const a = stalenessAlert({ ...stale, dispatch: { dispatch: false, reason: 'no token to dispatch with' } })
    expect(a.message).not.toContain('Re-dispatched')
    expect(a.message).toContain('no token')
  })

  it('re-announces HOURLY once the retries are exhausted — a standing condition must climb the ladder', () => {
    const exhausted = { ...stale, dispatch: { dispatch: false, exhausted: true, reason: 'needs a human' } }
    const first = stalenessAlert(exhausted)
    expect(first.priority).toBe('high')
    expect(stalenessAlert({ ...exhausted, lastKey: first.key }).notify).toBe(false)
    const anHourOn = stalenessAlert({ ...exhausted, now: NOW + 3_600_000, lastKey: first.key })
    expect(anHourOn.notify).toBe(true)
  })

  it('never throws', () => {
    expect(() => stalenessAlert()).not.toThrow()
    expect(() => stalenessAlert(null)).not.toThrow()
    expect(() => nextAttempts(null)).not.toThrow()
  })
})

describe('nextAttempts', () => {
  it('forgets everything as soon as the site is current', () => {
    expect(nextAttempts({ verdict: 'current', mainSha: MAIN, attempts: { sha: MAIN, count: 2, at: NOW } })).toBeNull()
  })

  it('counts up per commit and starts a new commit at one', () => {
    const first = nextAttempts({ verdict: 'stale', mainSha: MAIN, attempts: null, dispatched: true, now: NOW })
    expect(first).toEqual({ sha: MAIN, count: 1, at: NOW })
    const second = nextAttempts({ verdict: 'stale', mainSha: MAIN, attempts: first, dispatched: true, now: NOW + 1 })
    expect(second.count).toBe(2)
    const other = nextAttempts({ verdict: 'stale', mainSha: OTHER, attempts: second, dispatched: true, now: NOW + 2 })
    expect(other).toEqual({ sha: OTHER, count: 1, at: NOW + 2 })
  })

  it('leaves the record alone when nothing was dispatched', () => {
    const a = { sha: MAIN, count: 1, at: NOW }
    expect(nextAttempts({ verdict: 'stale', mainSha: MAIN, attempts: a, dispatched: false })).toBe(a)
  })
})
