#!/usr/bin/env node
// The measured verdict is the only path in this command that enables the lane.
// usage: node scripts/batch-trial.mjs --batch <id> --baseline <baseline.json> --report <trial.json> [--repo <dir>]
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { writeJsonAtomic } from './atomic-write.mjs'
import { batchMetricsReport } from './batch-metrics.mjs'
import { trialVerdict } from './batch-metrics-core.mjs'
import { flagChange } from './durable-lane-flag-core.mjs'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'

const FLAG_PATH = join('.claude', 'durable-lane-flag.json')

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

export function parseTrialArgs(argv = []) {
  const allowed = new Set(['--repo', '--batch', '--baseline', '--report'])
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!allowed.has(flag)) return { ok: false, reason: `unknown trial option: ${flag}` }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) return { ok: false, reason: `${flag} requires a value` }
    values[flag.slice(2)] = value
    index += 1
  }
  if (!values.batch || !values.baseline || !values.report) return { ok: false, reason: '--batch, --baseline, and --report are required' }
  return { ok: true, repoDir: resolve(values.repo ?? REPO_ROOT), batchId: values.batch, baselinePath: values.baseline, reportPath: values.report }
}

export function runTrial({
  repoDir = REPO_ROOT,
  batchId,
  baselinePath,
  reportPath,
  decidedAt = Date.now(),
  durableReader = batchMetricsReport,
  changeFlag = flagChange,
  write = writeJsonAtomic,
} = {}) {
  const baselineAbsolute = resolve(repoDir, baselinePath ?? '')
  const reportAbsolute = resolve(repoDir, reportPath ?? '')
  if (!batchId || !baselinePath || !reportPath) return { ok: false, reason: 'trial requires batch, baseline report, and verdict report paths' }
  if (existsSync(reportAbsolute)) return { ok: false, reason: `trial report already exists and is not replaced: ${reportAbsolute}` }

  let baseline
  try { baseline = readJson(baselineAbsolute) } catch (error) { return { ok: false, reason: `baseline report is unreadable: ${error.message}` } }
  if (baseline?.ok !== true || baseline?.kind !== 'baseline') return { ok: false, reason: 'the baseline input is not a recorded baseline-day report' }

  const durable = durableReader({ repoDir, batchId })
  // In particular, this propagates validateSamplingPlan's late-seal refusal.
  // A malformed measurement never reaches a verdict or a flag write.
  if (!durable?.ok) return { ok: false, reason: durable?.reason ?? 'the durable report could not be reconstructed' }
  const verdict = trialVerdict({ durable, baseline })
  const changedBy = relative(repoDir, reportAbsolute).replace(/\\/g, '/') || reportAbsolute
  const report = {
    ok: verdict.ok,
    kind: 'durable-lane-trial-verdict',
    decidedAt,
    batchId,
    durable,
    baseline: { path: relative(repoDir, baselineAbsolute).replace(/\\/g, '/'), day: baseline.day, medianHandoverContext: baseline.medianHandoverContext, pointsPerDay: baseline.pointsPerDay },
    verdict,
  }

  if (!verdict.ok) {
    write(reportAbsolute, report)
    return { ok: false, flagChanged: false, reportPath: reportAbsolute, report, failures: verdict.failures }
  }

  const flagPath = resolve(repoDir, FLAG_PATH)
  let flag
  try { flag = readJson(flagPath) } catch (error) { return { ok: false, reason: `durable lane flag is unreadable: ${error.message}` } }
  const changed = changeFlag({ flag, enable: true, boundaryMode: flag.boundaryMode, at: decidedAt, by: changedBy })
  if (!changed.ok) return { ok: false, reason: changed.reason, verdict, flagChanged: false }
  // The report lands first, so changedBy never names evidence that did not get
  // recorded. The bytes written to the flag are exactly flagChange's result.
  write(reportAbsolute, report)
  write(flagPath, changed.flag)
  return { ok: true, flagChanged: true, flagPath, reportPath: reportAbsolute, report, flag: changed.flag }
}

if (isMainModule(import.meta.url)) {
  const parsed = parseTrialArgs(process.argv.slice(2))
  if (!parsed.ok) {
    console.error('usage: node scripts/batch-trial.mjs --batch <id> --baseline <baseline.json> --report <trial.json> [--repo <dir>]')
    console.error(parsed.reason)
    process.exit(2)
  }
  const result = runTrial(parsed)
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.ok ? 0 : 1)
}
