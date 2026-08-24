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
  it('is live only while everything agrees', () => {
    expect(agreementVerdict({ durable: block(), probes: liveProbes(), now: 100_000 })).toEqual({ verdict: 'live', alerts: [] })
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
  it('hands over only a live transferable lane', () => {
    expect(laneBoundaryVerdict({ durable: block(), agreement: { verdict: 'live', alerts: [] } })).toEqual({ verdict: 'hand-over' })
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
