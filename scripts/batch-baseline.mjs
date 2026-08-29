#!/usr/bin/env node
// Record one immutable UTC baseline day from today's-path measured history.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { writeJsonAtomic } from './atomic-write.mjs'
import { baselineReportFromHistory, utcDayWindow } from './batch-baseline-core.mjs'
import { isMainModule } from './is-main.mjs'
import { mainCheckoutOf } from './measure-context-cost-core.mjs'
import { listTranscripts, readTurns, transcriptDir } from './measure-context-cost.mjs'
import { REPO_ROOT } from './repo-paths.mjs'

const read = (path) => {
  try { return readFileSync(path, 'utf8') } catch { return '' }
}

export function firstParentLandingHistory({ repoDir, ref = 'main', start, end } = {}) {
  const text = execFileSync('git', [
    '-C', repoDir, 'log', ref, '--first-parent', '--merges',
    '--format=%H%x09%ct%x09%s', `--since=${new Date(start).toISOString()}`, `--until=${new Date(end).toISOString()}`,
  ], { encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 })
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    const [sha, seconds, ...subject] = line.split('\t')
    return { sha, at: Number(seconds) * 1000, subject: subject.join('\t') }
  })
}

export async function gatherBaselineDay({ repoDir = REPO_ROOT, ref = 'main', day } = {}) {
  const window = utcDayWindow(day)
  if (!window.ok) return window
  const mainRoot = mainCheckoutOf(repoDir) ?? repoDir
  const activityPath = join(mainRoot, '.claude', 'batch-activity.jsonl')
  const boundaryPath = join(mainRoot, '.claude', 'boundary.log')
  const transcriptsDir = transcriptDir({ repoRoot: mainRoot })
  const transcriptPaths = listTranscripts(transcriptsDir).map((entry) => entry.path)
  const turns = await readTurns(transcriptsDir)
  const commits = firstParentLandingHistory({ repoDir, ref, start: window.start, end: window.end })
  return baselineReportFromHistory({
    day,
    activityText: read(activityPath),
    boundaryText: read(boundaryPath),
    turns,
    commits,
    sources: {
      activityJournal: relative(repoDir, activityPath),
      boundaryLog: relative(repoDir, boundaryPath),
      firstParentRef: ref,
      firstParentCommitShas: commits.map((commit) => commit.sha),
      sessionTranscripts: transcriptPaths,
    },
  })
}

export async function recordBaselineDay({ repoDir = REPO_ROOT, ref = 'main', day, output } = {}) {
  const outputPath = resolve(repoDir, output ?? '')
  if (!output) return { ok: false, reason: 'baseline recording requires an output path' }
  if (existsSync(outputPath)) return { ok: false, reason: `baseline report already exists and is not replaced: ${outputPath}` }
  const report = await gatherBaselineDay({ repoDir, ref, day })
  if (!report.ok) return report
  writeJsonAtomic(outputPath, report)
  return { ok: true, path: outputPath, report }
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const arg = (name, fallback = null) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback
  const day = arg('--day')
  const output = arg('--output')
  if (!day || !output) {
    console.error('usage: node scripts/batch-baseline.mjs --day YYYY-MM-DD --output <report.json> [--repo <dir>] [--ref main]')
    process.exit(2)
  }
  recordBaselineDay({ repoDir: resolve(arg('--repo', REPO_ROOT)), ref: arg('--ref', 'main'), day, output }).then((result) => {
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.ok ? 0 : 1)
  }).catch((error) => {
    console.error(`batch-baseline: ${error?.message ?? error}`)
    process.exit(1)
  })
}
