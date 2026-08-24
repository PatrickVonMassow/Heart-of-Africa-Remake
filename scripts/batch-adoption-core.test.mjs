// THE ADOPTION RECORD'S DECISIONS (point 834, step 4): the durable block is
// all-or-nothing, the agreement probe expires LOUDLY — never silently — and a
// lane crosses a boundary only as a live, transferable, agreeing whole.
import { describe, it, expect } from 'vitest'
import { AGREEMENT_SILENCE_MS, agreementVerdict, durableBlock, laneBoundaryVerdict } from './batch-adoption-core.mjs'

const block = () => durableBlock({ batchId: 'b', pointId: 'p834', attemptId: 'a1', pid: 100, pidStartedAt: 5000, transferable: true }).durable

const liveProbes = (over = {}) => ({
  heartbeatAt: 99_000,
  logAdvancedAt: 98_000,
  workerProbe: { live: true, pid: 100, startedAt: 5000 },
  launcherOwned: true,
  checkpointSha: 'abc123',
  remoteSha: 'abc123',
  remoteHasCheckpoint: true,
  ...over,
})

describe('durableBlock', () => {
  it('accepts a complete block and freezes it', () => {
    const res = durableBlock({ batchId: 'b', pointId: 'p', attemptId: 'a', pid: 1, pidStartedAt: 2, transferable: false })
    expect(res.ok).toBe(true)
    expect(Object.isFrozen(res.durable)).toBe(true)
  })

  it('refuses half an identity, naming every missing field', () => {
    const res = durableBlock({ batchId: 'b', pid: 1, transferable: true })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/pointId/)
    expect(res.reason).toMatch(/attemptId/)
    expect(res.reason).toMatch(/pidStartedAt/)
  })

  it('requires transferable to be an explicit boolean', () => {
    expect(durableBlock({ batchId: 'b', pointId: 'p', attemptId: 'a', pid: 1, pidStartedAt: 2 }).ok).toBe(false)
    expect(durableBlock({ batchId: 'b', pointId: 'p', attemptId: 'a', pid: 1, pidStartedAt: 2, transferable: 'yes' }).ok).toBe(false)
  })
})

describe('agreementVerdict (M18)', () => {
  it('is live only while everything agrees, and names the lane it judged', () => {
    expect(agreementVerdict({ durable: block(), probes: liveProbes(), now: 100_000 })).toEqual({
      verdict: 'live',
      alerts: [],
      lane: { batchId: 'b', pointId: 'p834', attemptId: 'a1' },
    })
  })

  it('refuses a malformed durable block instead of judging its probes', () => {
    // The bypass the review demonstrated: a persisted fragment carrying only
    // `transferable`, a PID and a start time must never reach the probe logic.
    const fragment = { transferable: true, pid: 100, pidStartedAt: 5000 }
    const res = agreementVerdict({ durable: fragment, probes: liveProbes(), now: 100_000 })
    expect(res.verdict).toBe('invalid')
    expect(res.alerts.join('; ')).toMatch(/batchId/)
  })

  it('fails closed without a finite clock: omitted, NaN and Infinity all refuse', () => {
    for (const now of [undefined, NaN, Infinity, -Infinity]) {
      const res = agreementVerdict({ durable: block(), probes: liveProbes(), now })
      expect(res.verdict, String(now)).toBe('invalid')
      expect(res.alerts.join('; ')).toMatch(/finite current time/)
    }
    const badWindow = agreementVerdict({ durable: block(), probes: liveProbes(), now: 100_000, maxSilenceMs: NaN })
    expect(badWindow.verdict).toBe('invalid')
  })

  it('reads a future probe timestamp as disagreement, never as freshness', () => {
    // A rolled-back clock or corrupt far-future mtime would otherwise look
    // permanently fresh.
    const future = agreementVerdict({ durable: block(), probes: liveProbes({ heartbeatAt: 200_000 }), now: 100_000 })
    expect(future.verdict).toBe('expired')
    expect(future.alerts.join('; ')).toMatch(/in the future/)
    const futureLog = agreementVerdict({ durable: block(), probes: liveProbes({ logAdvancedAt: 10 ** 15 }), now: 100_000 })
    expect(futureLog.verdict).toBe('expired')
    expect(futureLog.alerts.join('; ')).toMatch(/in the future/)
  })

  it('never expires silently: every expiry names what stopped agreeing', () => {
    const cases = [
      [liveProbes({ workerProbe: { live: false } }), /not the one running/],
      [liveProbes({ workerProbe: { live: true, pid: 100, startedAt: 99_999 } }), /recycled pid/],
      [liveProbes({ heartbeatAt: 100_000 - AGREEMENT_SILENCE_MS - 1 }), /heartbeat is/],
      [liveProbes({ heartbeatAt: null }), /heartbeat is unreadable/],
      [liveProbes({ logAdvancedAt: 100_000 - AGREEMENT_SILENCE_MS - 1 }), /log stopped advancing/],
      [liveProbes({ launcherOwned: undefined }), /launcher does not affirm/],
      [liveProbes({ checkpointSha: 'abc123', remoteSha: 'fff000', remoteHasCheckpoint: false }), /not verified reachable/],
      // MISSING evidence is disagreement, never a pass: an unverified or
      // unpushed checkpoint must not produce `live`.
      [liveProbes({ checkpointSha: null }), /no acknowledged checkpoint/],
      [liveProbes({ remoteSha: null }), /remote tip is unreadable/],
      [liveProbes({ remoteHasCheckpoint: undefined }), /not verified reachable/],
    ]
    for (const [probes, pattern] of cases) {
      const res = agreementVerdict({ durable: block(), probes, now: 100_000 })
      expect(res.verdict, pattern.source).toBe('expired')
      expect(res.alerts.join('; '), pattern.source).toMatch(pattern)
    }
  })

  it('reads a missing or non-transferable block as its own verdict, not as expiry', () => {
    expect(agreementVerdict({ durable: null, probes: liveProbes(), now: 100_000 }).verdict).toBe('not-transferable')
    const nonTransferable = durableBlock({ batchId: 'b', pointId: 'p', attemptId: 'a', pid: 100, pidStartedAt: 5000, transferable: false }).durable
    expect(agreementVerdict({ durable: nonTransferable, probes: liveProbes(), now: 100_000 }).verdict).toBe('not-transferable')
  })

  it('agrees through the ancestry verdict, never through string prefixes', () => {
    // A legitimate DESCENDANT tip agrees when the prober verified ancestry —
    // string equality is not required.
    const descendant = liveProbes({ checkpointSha: 'abc123', remoteSha: 'ffee00112233', remoteHasCheckpoint: true })
    expect(agreementVerdict({ durable: block(), probes: descendant, now: 100_000 }).verdict).toBe('live')
    // A PREFIX match between abbreviated hashes proves nothing: without the
    // affirmative ancestry verdict it is a disagreement.
    const prefixAlias = liveProbes({ checkpointSha: 'abc123', remoteSha: 'abc123def4567890', remoteHasCheckpoint: null })
    expect(agreementVerdict({ durable: block(), probes: prefixAlias, now: 100_000 }).verdict).toBe('expired')
  })
})

describe('laneBoundaryVerdict', () => {
  const laneOf = (d) => ({ batchId: d.batchId, pointId: d.pointId, attemptId: d.attemptId })

  it('hands over only a live transferable lane whose agreement names it', () => {
    const d = block()
    expect(laneBoundaryVerdict({ durable: d, agreement: { verdict: 'live', alerts: [], lane: laneOf(d) } })).toEqual({ verdict: 'hand-over' })
  })

  it('BLOCKS an agreement bound to another lane, or to none', () => {
    const d = block()
    const foreign = { verdict: 'live', alerts: [], lane: { batchId: 'b', pointId: 'p777', attemptId: 'a9' } }
    expect(laneBoundaryVerdict({ durable: d, agreement: foreign }).verdict).toBe('block')
    const unbound = { verdict: 'live', alerts: [] }
    expect(laneBoundaryVerdict({ durable: d, agreement: unbound }).verdict).toBe('block')
  })

  it('BLOCKS a malformed durable block that claims transferability', () => {
    const fragment = { transferable: true, pid: 100, pidStartedAt: 5000 }
    const res = laneBoundaryVerdict({ durable: fragment, agreement: { verdict: 'live', alerts: [], lane: { batchId: undefined, pointId: undefined, attemptId: undefined } } })
    expect(res.verdict).toBe('block')
    expect(res.reason).toMatch(/unusable/)
  })

  it('drains session-bound and non-transferable lanes — the M61 fallback', () => {
    expect(laneBoundaryVerdict({ durable: null }).verdict).toBe('drain')
    const nonTransferable = { ...block(), transferable: false }
    expect(laneBoundaryVerdict({ durable: nonTransferable }).verdict).toBe('drain')
  })

  it('BLOCKS a transferable lane that does not agree, carrying the alerts', () => {
    const res = laneBoundaryVerdict({ durable: block(), agreement: { verdict: 'expired', alerts: ['the heartbeat is 1ms old'] } })
    expect(res.verdict).toBe('block')
    expect(res.reason).toMatch(/heartbeat/)
    expect(laneBoundaryVerdict({ durable: block(), agreement: null }).verdict).toBe('block')
  })
})
