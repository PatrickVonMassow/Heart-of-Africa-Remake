// The hook-set wait marker (point 592). Every case here is really one question:
// can the no-idle-stop guard go blind on this? It may not — so the marker is
// written only where the same evidence a hand-written declaration would name is
// genuinely there, and it is withdrawn the moment that evidence is over.
import { describe, it, expect } from 'vitest'
import { LOG_FRESH_MS, MARKER_SOURCE, describeRun, markerDeclaration, waitMarkerDecision } from './wait-marker-core.mjs'

const NOW = 1_760_000_000_000
const RUN = { command: 'verify large', log: 'local/verify-logs/x.log', expectedRuntimeMs: 2_536_000 }
const live = (over = {}) => ({
  sid: 's1',
  ownsBatch: true,
  paused: false,
  record: RUN,
  recordLive: true,
  logMtime: NOW - 1000,
  declaration: null,
  now: NOW,
  ...over,
})
const mine = (over = {}) => ({ source: MARKER_SOURCE, runLog: RUN.log, sessionId: 's1', ...over })

describe('the marker is written only where the evidence really is', () => {
  it('declares for a running verify run whose log is still moving', () => {
    const d = waitMarkerDecision(live())
    expect(d.action).toBe('declare')
    expect(d.evidence).toEqual([{ kind: 'log', path: RUN.log }])
    expect(d.waitingOn).toMatch(/verify large/)
  })

  it('NEVER declares for a session that does not own the batch', () => {
    expect(waitMarkerDecision(live({ ownsBatch: false })).action).toBe('none')
    expect(waitMarkerDecision(live({ ownsBatch: false })).reason).toBe('not-owner')
  })

  it('stands down for a paused batch and for a session with no id', () => {
    expect(waitMarkerDecision(live({ paused: true })).reason).toBe('paused')
    expect(waitMarkerDecision(live({ sid: '' })).reason).toBe('no-session')
  })

  it('declares nothing when no run is recorded at all', () => {
    expect(waitMarkerDecision(live({ record: null, recordLive: false }))).toMatchObject({ action: 'none', reason: 'no-run' })
  })

  it('refuses a run whose process lives but whose log has gone quiet — that is a wedge, not a wait', () => {
    const d = waitMarkerDecision(live({ logMtime: NOW - LOG_FRESH_MS - 1 }))
    expect(d).toMatchObject({ action: 'none', reason: 'log-quiet' })
  })

  it('refuses a log it cannot read at all', () => {
    expect(waitMarkerDecision(live({ logMtime: null })).reason).toBe('log-unreadable')
    expect(waitMarkerDecision(live({ logMtime: 'soon' })).reason).toBe('log-unreadable')
  })
})

describe('it never overwrites a person’s declaration, only its own', () => {
  it('leaves a hand-written declaration alone', () => {
    const d = waitMarkerDecision(live({ declaration: { waitingOn: 'three agents building', evidence: [] } }))
    expect(d).toMatchObject({ action: 'none', reason: 'declared-by-hand' })
  })

  it('does nothing when its own marker already names this run', () => {
    expect(waitMarkerDecision(live({ declaration: mine() })).reason).toBe('already-marked')
  })

  it('refreshes its own marker when a DIFFERENT run is now going', () => {
    const d = waitMarkerDecision(live({ declaration: mine({ runLog: 'local/verify-logs/old.log' }) }))
    expect(d).toMatchObject({ action: 'declare', reason: 'run-changed', runLog: RUN.log })
  })
})

describe('it withdraws itself when the run is over — the guard must block again', () => {
  it('clears its own marker once the run has finished', () => {
    const d = waitMarkerDecision(live({ recordLive: false, declaration: mine() }))
    expect(d).toMatchObject({ action: 'clear', reason: 'run-finished' })
  })

  it('clears its own marker when the run record has disappeared entirely', () => {
    const d = waitMarkerDecision(live({ record: null, recordLive: false, declaration: mine() }))
    expect(d).toMatchObject({ action: 'clear', reason: 'run-record-gone' })
  })

  it('does NOT clear a hand-written declaration when a run ends', () => {
    const d = waitMarkerDecision(live({ recordLive: false, declaration: { waitingOn: 'an agent' } }))
    expect(d).toMatchObject({ action: 'none', reason: 'run-finished' })
  })

  it('clears nothing for a non-owner, even when its own marker is lying there', () => {
    expect(waitMarkerDecision(live({ ownsBatch: false, recordLive: false, declaration: mine() })).action).toBe('none')
  })
})

describe('the declaration body is the one batch-in-flight writes', () => {
  it('carries v1, the lock’s process identity, the evidence and its own provenance', () => {
    const decision = waitMarkerDecision(live())
    const body = markerDeclaration({ sid: 's1', lock: { pid: 42, pidStartedAt: 7 }, decision, now: NOW })
    expect(body).toMatchObject({
      v: 1,
      sessionId: 's1',
      pid: 42,
      pidStartedAt: 7,
      at: NOW,
      evidence: [{ kind: 'log', path: RUN.log }],
      slotsFree: '',
      source: MARKER_SOURCE,
      runLog: RUN.log,
    })
  })

  it('tolerates a lock that names no process', () => {
    const body = markerDeclaration({ sid: 's1', lock: null, decision: waitMarkerDecision(live()), now: NOW })
    expect(body.pid).toBeNull()
    expect(body.pidStartedAt).toBeNull()
  })

  it('names the run and the way to its result', () => {
    expect(describeRun(RUN)).toMatch(/run-wait\.mjs --receipt/)
    expect(describeRun(RUN)).toMatch(/expected 42 min/)
    expect(describeRun(null)).toMatch(/a verify run/)
  })
})
