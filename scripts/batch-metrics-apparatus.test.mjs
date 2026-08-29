import { readFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { contextSampleFromTranscript, recordContextSample } from './batch-context-samples.mjs'
import { sealSamplingPlanIntoJournal } from './batch-metrics.mjs'

const roots = []
const repo = () => {
  const root = mkdtempSync(join(tmpdir(), 'metrics-apparatus-'))
  roots.push(root)
  execFileSync('git', ['init', '-q', root], { windowsHide: true })
  return root
}
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

const transcript = [
  { timestamp: '2026-08-29T08:00:00.000Z', sessionId: 'session-1', message: { id: 'response-1', usage: { input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 300, output_tokens: 5 } } },
  { timestamp: '2026-08-29T08:00:01.000Z', sessionId: 'session-1', message: { id: 'response-1', usage: { input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 300, output_tokens: 40 } } },
].map(JSON.stringify).join('\n')

describe('durable trial input apparatus', () => {
  it('seals the clock-stamped plan through record-metric under the coordinator fence', async () => {
    const calls = []
    const result = await sealSamplingPlanIntoJournal({
      repoDir: '/repo', batchId: 'b1', sessionId: 's1', fence: 9, sealedAt: 100,
      input: { method: 'fixed daily cohort', batchMix: ['hard'], eligibleIntervals: [{ start: 200, end: 300 }], exclusions: [], sealedAt: -1 },
      record: async (request) => { calls.push(request); return { ok: true, eventId: 'metric-plan' } },
    })
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ repoDir: '/repo', batchId: 'b1', sessionId: 's1', fence: 9 })
    expect(calls[0].event).toMatchObject({ kind: 'sampling-plan', at: 100, plan: { sealedAt: 100 } })
    expect(calls[0].event.planHash).toBe(result.planHash)
  })

  it('derives a handover sample from the final transcript response and records it independently', () => {
    const measured = contextSampleFromTranscript({ text: transcript, source: '/measured/session-1.jsonl', scope: 'handover', recordedAt: 500 })
    expect(measured).toMatchObject({ ok: true, sample: { tokens: 420, scope: 'handover', at: Date.parse('2026-08-29T08:00:01.000Z'), recordedAt: 500, session: 'session-1' } })
    const root = repo()
    const first = recordContextSample({ repoDir: root, batchId: 'trial-1', sample: measured.sample })
    const second = recordContextSample({ repoDir: root, batchId: 'trial-1', sample: measured.sample })
    expect(first.alreadyRecorded).toBe(false)
    expect(second.alreadyRecorded).toBe(true)
    const ledger = JSON.parse(readFileSync(first.path, 'utf8'))
    expect(ledger.samples).toEqual([measured.sample])
    expect(ledger.definition).toMatch(/final complete coordinator response before initiating handover/)
  })

  it('has no path that accepts an asserted token count', () => {
    const measured = contextSampleFromTranscript({ text: '', source: '/measured/session.jsonl', scope: 'handover', tokens: 123 })
    expect(measured.ok).toBe(false)
    expect(measured.reason).toMatch(/no complete response/)
  })
})
