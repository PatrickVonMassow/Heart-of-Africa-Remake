#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { openStateStore, readJournal } from './batch-state.mjs'
import { calculateBatchMetrics, metricEventsFromJournal } from './batch-metrics-core.mjs'
import { readJsonIfAny } from './detached-agent.mjs'

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
  const batchId = arg('--batch')
  if (!batchId) { console.error('usage: node scripts/batch-metrics.mjs --batch <id> [--repo <dir>] [--context <samples.json>]'); process.exit(2) }
  const report = batchMetricsReport({ repoDir: resolve(arg('--repo') ?? REPO_ROOT), batchId, contextPath: arg('--context') })
  console.log(JSON.stringify(report, null, 2))
  process.exit(report.ok ? 0 : 1)
}
