import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { calculateBatchMetrics, sealSamplingPlan } from './batch-metrics-core.mjs'
import { flagChange } from './durable-lane-flag-core.mjs'
import { parseTrialArgs, runTrial } from './batch-trial.mjs'

const roots = []
const makeRepo = () => {
  const root = mkdtempSync(join(tmpdir(), 'batch-trial-'))
  roots.push(root)
  execFileSync('git', ['init', '-q', root])
  mkdirSync(join(root, '.claude'), { recursive: true })
  writeFileSync(join(root, '.claude', 'durable-lane-flag.json'), JSON.stringify({ enabled: false, boundaryMode: 'checkpointed-handover', adapters: ['sol'], changedBy: 'awaiting-trial' }))
  writeFileSync(join(root, 'baseline.json'), JSON.stringify({ ok: true, kind: 'baseline', day: '2026-08-28', medianHandoverContext: 200_000, pointsPerDay: 2 }))
  return root
}
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

const passing = {
  ok: true,
  planHash: 'sealed',
  safetyIncidentCount: 0,
  p95CheckpointWaitMs: 1000,
  p95SuccessorReadyMs: 2000,
  highContextShare: 0.05,
  medianHandoverContext: 100_000,
  pointsPerDay: 2,
  utilization: 0.7,
}

describe('verdict-gated durable lane trial command', () => {
  it('a passing verdict is what writes the flag through flagChange and names its report', () => {
    const repoDir = makeRepo()
    const change = vi.fn(flagChange)
    const result = runTrial({ repoDir, batchId: 'trial-1', baselinePath: 'baseline.json', reportPath: 'trial.json', decidedAt: 1234, durableReader: () => passing, changeFlag: change })
    expect(result.ok).toBe(true)
    expect(change).toHaveBeenCalledOnce()
    expect(change.mock.calls[0][0]).toMatchObject({ enable: true, by: 'trial.json', at: 1234 })
    expect(JSON.parse(readFileSync(join(repoDir, '.claude', 'durable-lane-flag.json'), 'utf8'))).toMatchObject({ enabled: true, changedBy: 'trial.json', changedAt: 1234, adapters: ['sol'] })
    expect(JSON.parse(readFileSync(join(repoDir, 'trial.json'), 'utf8'))).toMatchObject({ ok: true, kind: 'durable-lane-trial-verdict', verdict: { ok: true, failures: [] } })
  })

  it('a failing verdict names every failed condition and leaves the flag byte-for-byte untouched', () => {
    const repoDir = makeRepo()
    const flagPath = join(repoDir, '.claude', 'durable-lane-flag.json')
    const before = readFileSync(flagPath, 'utf8')
    const change = vi.fn(flagChange)
    const result = runTrial({
      repoDir, batchId: 'trial-2', baselinePath: 'baseline.json', reportPath: 'failed-trial.json',
      durableReader: () => ({ ok: true, safetyIncidentCount: 1, p95CheckpointWaitMs: null, p95SuccessorReadyMs: 999_999, highContextShare: 0.2, medianHandoverContext: 190_000, pointsPerDay: 1, utilization: 1 }),
      changeFlag: change,
    })
    expect(result.ok).toBe(false)
    expect(result.flagChanged).toBe(false)
    expect(change).not.toHaveBeenCalled()
    expect(readFileSync(flagPath, 'utf8')).toBe(before)
    expect(result.failures).toEqual([
      'safety incidents are nonzero',
      'p95 checkpoint wait exceeds three minutes or is unmeasured',
      'p95 successor-ready latency exceeds five minutes or is unmeasured',
      'high-context share is not below 10%',
      'median handover context is not materially below baseline',
      'points landed per day is worse than baseline',
    ])
    expect(JSON.parse(readFileSync(join(repoDir, 'failed-trial.json'), 'utf8')).verdict.failures).toEqual(result.failures)
  })

  it('refuses a plan sealed after the first measured event before reaching the flag', () => {
    const repoDir = makeRepo()
    const events = [{ kind: 'landing', at: 100, pointId: '1', startedAt: 90, landedAt: 100 }]
    const late = sealSamplingPlan({ method: 'fixed', batchMix: ['hard'], eligibleIntervals: [], exclusions: [], sealedAt: 101 })
    const change = vi.fn(flagChange)
    const result = runTrial({
      repoDir, batchId: 'trial-late', baselinePath: 'baseline.json', reportPath: 'late.json', changeFlag: change,
      durableReader: () => calculateBatchMetrics({ events, plan: late.plan, planHash: late.planHash }),
    })
    expect(result).toMatchObject({ ok: false, reason: 'sampling plan was sealed after the measured interval began' })
    expect(change).not.toHaveBeenCalled()
    expect(readFileSync(join(repoDir, '.claude', 'durable-lane-flag.json'), 'utf8')).toContain('"enabled":false')
  })

  it('has no force or operator-enable option', () => {
    expect(parseTrialArgs(['--batch', 'b', '--baseline', 'base.json', '--report', 'trial.json', '--force'])).toMatchObject({ ok: false, reason: 'unknown trial option: --force' })
    expect(parseTrialArgs(['--batch', 'b', '--baseline', 'base.json', '--report', 'trial.json', '--enable', 'true'])).toMatchObject({ ok: false, reason: 'unknown trial option: --enable' })
  })
})
