import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { modelHandoffDecision, modelHandoffSpawn, readModelHandoff } from './model-handoff-core.mjs'

const NOW = Date.parse('2026-08-23T12:00:00Z')
const route = [
  { model: 'Opus 5', id: 'claude-opus-5[1m]' },
  { model: 'Fable 5', id: 'claude-fable-5' },
  { model: 'Opus 4.8', id: 'claude-opus-4-8[1m]' },
]
const hits = [{ sha: 'a'.repeat(40), trailer: 'Claude Haiku 4.5 <noreply@anthropic.com>', when: NOW - 1000 }]

describe('forbidden serving-model handoff', () => {
  it('skips the suspect primary and records the next lane', () => {
    const decision = modelHandoffDecision({ hits, route, sessionId: 'suspect', currentModel: 'Haiku 4.5', now: NOW })
    expect(decision).toMatchObject({ action: 'handoff', state: { targetIndex: 1, requestedBy: 'suspect', route } })
    expect(modelHandoffSpawn(decision.state, NOW)).toMatchObject({ model: 'claude-fable-5', fallbackModel: 'claude-opus-4-8[1m]' })
  })

  it('never lets the requesting session consume a lane or verify itself', () => {
    const first = modelHandoffDecision({ hits, route, sessionId: 'suspect', now: NOW })
    const again = modelHandoffDecision({ hits, state: first.state, sessionId: 'suspect', currentModel: 'Fable 5', now: NOW + 1 })
    expect(again).toMatchObject({ action: 'handoff', state: { targetIndex: 1, requestedBy: 'suspect' } })
  })

  it('advances only when a fresh session proves the recorded target', () => {
    const first = modelHandoffDecision({ hits, route, sessionId: 'suspect', now: NOW })
    const wrong = modelHandoffDecision({ hits, state: first.state, sessionId: 'fresh', currentModel: 'Haiku 4.5', now: NOW + 1 })
    expect(wrong).toMatchObject({ action: 'handoff', state: { targetIndex: 2 } })

    const verified = modelHandoffDecision({
      hits,
      state: wrong.state,
      sessionId: 'trusted',
      currentModel: 'claude-opus-4-8[1m]',
      baselineMs: NOW - 10_000,
      now: NOW + 2,
    })
    expect(verified).toMatchObject({ action: 'verify', verifiedBy: 'Opus 4.8', verifiedThrough: NOW - 1000 })
  })

  it('does not advance over an unidentified trailer beside the breach', () => {
    const first = modelHandoffDecision({ hits, route, sessionId: 'suspect', now: NOW })
    const decision = modelHandoffDecision({
      hits,
      unidentified: [{ sha: 'b' }],
      state: first.state,
      sessionId: 'trusted',
      currentModel: 'Fable 5',
      now: NOW + 1,
    })
    expect(decision.action).toBe('probe')
    expect(decision.retryAfter).toBeGreaterThan(NOW)
  })

  it('puts missing transcript proof on a clock without consuming the target lane', () => {
    const first = modelHandoffDecision({ hits, route, sessionId: 'suspect', now: NOW })
    const decision = modelHandoffDecision({ hits, state: first.state, sessionId: 'fresh', currentModel: '', now: NOW + 1 })
    expect(decision).toMatchObject({ action: 'probe', state: { targetIndex: 1, requestedBy: 'fresh' } })
  })

  it('probes on a clock after every allowed lane was unreachable', () => {
    const first = modelHandoffDecision({ hits, route, sessionId: 'suspect', now: NOW })
    const second = modelHandoffDecision({ hits, state: first.state, sessionId: 'fable-run', currentModel: 'Haiku 4.5', now: NOW + 1 })
    const exhausted = modelHandoffDecision({ hits, state: second.state, sessionId: 'opus48-run', currentModel: 'Haiku 4.5', now: NOW + 2 })
    expect(exhausted).toMatchObject({ action: 'probe', state: { targetIndex: 0 } })
    expect(exhausted.retryAfter).toBe(NOW + 2 + 20 * 60 * 1000)
    expect(exhausted.decisionRecord.title).toMatch(/^Entscheidungsprotokoll:/)
    expect(exhausted.decisionRecord.body).toMatch(/Retroaktives Veto/)
    expect(exhausted.state.decisionRecord).toEqual(exhausted.decisionRecord)
    expect(modelHandoffSpawn(exhausted.state, NOW + 2)).toMatchObject({ waitMs: exhausted.retryAfter - (NOW + 2) })
    expect(modelHandoffSpawn(exhausted.state, exhausted.retryAfter)).toMatchObject({ model: 'claude-opus-5[1m]' })
  })

  it('a missing owner session still leaves the serving route on a clock', () => {
    const decision = modelHandoffDecision({ hits, route, sessionId: '', now: NOW })
    expect(decision).toMatchObject({
      action: 'probe',
      retryAfter: NOW + 20 * 60 * 1000,
      state: { requestedBy: 'model-guard-clocked-probe', targetIndex: 0 },
    })
    expect(decision.decisionRecord.body).toMatch(/Baseline bleibt.*unverändert/)
  })

  it('rejects malformed durable state instead of inventing a target', () => {
    expect(readModelHandoff({ version: 1, route, targetIndex: 99, requestedBy: 'x', requestedAt: NOW })).toBeNull()
    expect(modelHandoffSpawn({})).toBeNull()
  })

  it('backfills a veto record into valid pre-record state', () => {
    const state = {
      version: 1,
      route,
      targetIndex: 1,
      requestedBy: 'old-session',
      requestedAt: NOW,
      probeAfter: NOW + 1000,
      offending: hits,
    }
    expect(readModelHandoff(state).decisionRecord.body).toMatch(/Retroaktives Veto/)
  })
})

describe('the guard and launcher use the state machine', () => {
  const guard = readFileSync(resolve(process.cwd(), 'scripts', 'model-guard.mjs'), 'utf8')

  it('writes and starts a handoff, but writes the baseline only in the verified branch', () => {
    expect(guard).toMatch(/handoff\.action === 'verify'[\s\S]*writeJsonAtomic\(BASELINE/)
    expect(guard).toMatch(/handoff\.action === 'handoff'[\s\S]*writeJsonAtomic\(HANDOFF[\s\S]*handoverAndRequest/)
    expect(guard).toMatch(/transcriptModel\(payload\.transcript_path/)
  })

  it('uses a typed timed pause only for the exhausted probe path', () => {
    const probe = guard.match(/handoff\.action === 'probe'[\s\S]*?\} else if \(handoff\.action === 'handoff'/)?.[0] ?? ''
    expect(probe).toMatch(/type: PAUSE_TYPES\.AUTOMATIC/)
    expect(probe).toMatch(/retryAfter: handoff\.retryAfter/)
    expect(guard.match(/handoff\.action === 'handoff'[\s\S]*?\} else \{/g)?.[0] ?? '').not.toContain('writeTextAtomic(PAUSE')
  })
})
