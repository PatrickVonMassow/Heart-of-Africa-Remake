#!/usr/bin/env node
// Seal inputs, record independent context samples, and reconstruct trial metrics.
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { openStateStore, readJournal } from './batch-state.mjs'
import { calculateBatchMetrics, metricEventsFromJournal, sealSamplingPlan } from './batch-metrics-core.mjs'
import { readJsonIfAny } from './detached-agent.mjs'
import { recordMetricEvent } from './batch-metric-events.mjs'
import { contextSampleFromTranscript, recordContextSample } from './batch-context-samples.mjs'

export async function sealSamplingPlanIntoJournal({ repoDir = REPO_ROOT, batchId, sessionId, fence, input, sealedAt = Date.now(), record = recordMetricEvent } = {}) {
  // Only the clock supplies sealedAt. A plan file cannot backdate itself to fit
  // observations already seen; validateSamplingPlan remains the final refusal.
  const sealed = sealSamplingPlan({
    method: input?.method,
    batchMix: input?.batchMix,
    eligibleIntervals: input?.eligibleIntervals,
    exclusions: input?.exclusions,
    sealedAt,
  })
  if (!sealed.ok) return sealed
  const event = { kind: 'sampling-plan', at: sealedAt, plan: sealed.plan, planHash: sealed.planHash }
  const recorded = await record({ repoDir, batchId, sessionId, fence, event })
  return recorded.ok ? { ok: true, eventId: recorded.eventId, plan: sealed.plan, planHash: sealed.planHash } : recorded
}

export function batchMetricsReport({ repoDir = REPO_ROOT, batchId, contextPath = null } = {}) {
  const store = openStateStore({ repoDir, batchId })
  const journal = readJournal(store)
  if (journal.verdict !== 'ok') return { ok: false, reason: 'the durable journal is corrupt; metrics refuse reconstruction from selected fragments' }
  const planRecord = [...metricEventsFromJournal(journal.entries)].reverse().find((event) => event.kind === 'sampling-plan')
  if (!planRecord?.plan || !planRecord?.planHash) return { ok: false, reason: 'no sampling plan was sealed into the journal' }
  let contextSamples = []
  try { contextSamples = contextPath ? JSON.parse(readFileSync(contextPath, 'utf8')) : (readJsonIfAny(join(store.dir, 'context-samples.json'))?.samples ?? []) } catch { return { ok: false, reason: 'independent context samples are unreadable' } }
  return calculateBatchMetrics({ events: metricEventsFromJournal(journal.entries).filter((event) => event.kind !== 'sampling-plan'), contextSamples, plan: planRecord.plan, planHash: planRecord.planHash })
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const arg = (name) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : null
  const command = argv[0]?.startsWith('--') ? 'report' : (argv[0] ?? 'report')
  const batchId = arg('--batch')
  if (!batchId) {
    console.error(
      'usage: node scripts/batch-metrics.mjs report --batch <id> [--repo <dir>] [--context <samples.json>]\n' +
      '       node scripts/batch-metrics.mjs seal-plan --batch <id> --session <id> --fence <n> --plan <plan.json> [--repo <dir>]\n' +
      '       node scripts/batch-metrics.mjs sample-context --batch <id> --scope handover|ordinary --transcript <session.jsonl> [--repo <dir>]',
    )
    process.exit(2)
  }
  const repoDir = resolve(arg('--repo') ?? REPO_ROOT)
  let result
  if (command === 'seal-plan') {
    const planPath = arg('--plan')
    const sessionId = arg('--session')
    const fence = Number(arg('--fence'))
    if (!planPath || !sessionId || !Number.isInteger(fence)) {
      console.error('seal-plan requires --plan, --session, and an integer --fence')
      process.exit(2)
    }
    result = await sealSamplingPlanIntoJournal({ repoDir, batchId, sessionId, fence, input: JSON.parse(readFileSync(resolve(planPath), 'utf8')) })
  } else if (command === 'sample-context') {
    const transcriptPath = arg('--transcript')
    if (!transcriptPath) {
      console.error('sample-context requires --transcript and --scope handover|ordinary')
      process.exit(2)
    }
    const absolute = resolve(transcriptPath)
    const measured = contextSampleFromTranscript({ text: readFileSync(absolute, 'utf8'), source: absolute, scope: arg('--scope') })
    result = measured.ok ? recordContextSample({ repoDir, batchId, sample: measured.sample }) : measured
  } else if (command === 'report') {
    result = batchMetricsReport({ repoDir, batchId, contextPath: arg('--context') })
  } else {
    result = { ok: false, reason: `unknown batch metrics command: ${command}` }
  }
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.ok ? 0 : 1)
}
