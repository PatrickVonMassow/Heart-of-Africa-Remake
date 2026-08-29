#!/usr/bin/env node
import { resolve } from 'node:path'
import { isMainModule } from './is-main.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  ACTIVITY_CLASSES,
  STANDSTILL_THRESHOLD_MS,
  STANDSTILL_THRESHOLD_REASON,
  classifyTimeline,
  commitGapSummary,
  journalIntervals,
  timelineTotals,
} from './batch-standstill-core.mjs'
import {
  autostartEvidence,
  autostartLastEvidence,
  boundaryMarkerEvidence,
  delegatedBranchProgress,
  declaredInputPaths,
  firstParentCommitTimes,
  readJournal,
  readText,
  pauseMarkerEvidence,
  timestampedLogBoundaries,
  transcriptEvidence,
  transcriptFiles,
  verificationRecordEvidence,
} from './batch-standstill-inputs.mjs'

export function parseWindow(value, now = Date.now()) {
  const relative = String(value).match(/^(\d+(?:\.\d+)?)(m|h|d)$/i)
  if (relative) {
    const unitMs = { m: 60_000, h: 60 * 60_000, d: 24 * 60 * 60_000 }[relative[2].toLowerCase()]
    return now - Number(relative[1]) * unitMs
  }
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new TypeError(`invalid UTC time/window: ${value}`)
  return parsed
}

function argsOf(argv) {
  const value = (name, fallback = null) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : fallback
  }
  const now = Date.now()
  const end = parseWindow(value('--until', new Date(now).toISOString()), now)
  return {
    repo: resolve(value('--repo', REPO_ROOT)),
    ref: value('--ref', 'main'),
    end,
    start: parseWindow(value('--since', '14d'), end),
    thresholdMs: Number(value('--threshold-min', STANDSTILL_THRESHOLD_MS / 60_000)) * 60_000,
    json: argv.includes('--json'),
  }
}

const fmtDuration = (ms) => {
  const seconds = Math.round(ms / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(rest).padStart(2, '0')}s`
}

const pct = (part, total) => total > 0 ? `${(part * 100 / total).toFixed(2)}%` : '0.00%'

export function gatherStandstillReport({
  repo, ref = 'main', start, end, thresholdMs = STANDSTILL_THRESHOLD_MS, verificationProcessAlive,
} = {}) {
  const paths = declaredInputPaths(repo, transcriptFiles({ repo, start }), ref)
  const journal = readJournal(paths.journal)
  const journalDerived = journalIntervals(journal.records, { start, end })
  const commits = firstParentCommitTimes({ repo, ref, start, end })
  const auto = autostartEvidence(readText(paths.autostartLog), { end })
  const autoLast = autostartLastEvidence(readText(paths.autostartLast))
  const boundaryEvents = timestampedLogBoundaries(readText(paths.boundaryLog)).map((entry) => entry.at)
  const boundaryMarker = boundaryMarkerEvidence(readText(paths.boundaryMarker), { end })
  const delegatedProgress = delegatedBranchProgress(readText(paths.inFlight), { repo, records: journal.records, start, end })
  const pauseMarker = pauseMarkerEvidence(readText(paths.pauseMarker), { start, end })
  const verification = verificationRecordEvidence(resolve(repo, 'local', 'verify-logs'), {
    start, end, processAlive: verificationProcessAlive,
  })
  const transcripts = paths.sessionTranscripts.map((path) => transcriptEvidence(readText(path), { session: path.split(/[\\/]/).at(-1)?.replace(/\.jsonl$/, '') }))
  const intervals = [journalDerived, auto, autoLast, boundaryMarker, pauseMarker, verification, ...transcripts].flatMap((input) => input.intervals)
  const boundaries = [
    ...commits, ...journalDerived.boundaries, ...auto.boundaries, ...autoLast.boundaries, ...boundaryEvents,
    ...boundaryMarker.boundaries, ...pauseMarker.boundaries,
    ...verification.boundaries, ...transcripts.flatMap((input) => input.boundaries),
  ]
  const timeline = classifyTimeline({ start, end, intervals, boundaries, journalStartedAt: journal.startedAt ?? end })
  const totals = timelineTotals(timeline)
  const gaps = commitGapSummary(commits, thresholdMs)
  const reportedIntervals = timeline.filter((item) => item.durationMs >= thresholdMs)
  const removalCandidates = Object.entries(totals.byClass)
    .filter(([className, durationMs]) => durationMs >= thresholdMs && ![
      ACTIVITY_CLASSES.FOREGROUND, ACTIVITY_CLASSES.DELEGATED, ACTIVITY_CLASSES.VERIFICATION,
      ACTIVITY_CLASSES.CI_WAIT, ACTIVITY_CLASSES.UNKNOWN,
    ].includes(className))
    .sort((a, b) => b[1] - a[1])
    .map(([className, durationMs]) => ({ className, durationMs }))
  return {
    window: { start, end, elapsedMs: end - start },
    threshold: { ms: thresholdMs, reason: STANDSTILL_THRESHOLD_REASON },
    inputs: paths,
    inputHealth: { journalRecords: journal.records.length, rejectedJournalLines: journal.rejected, transcriptFiles: paths.sessionTranscripts.length },
    commitGaps: gaps,
    batchProgress: [
      ...commits.map((at) => ({ at, kind: 'first-parent-commit' })),
      ...boundaryMarker.batchProgress,
      ...delegatedProgress,
    ].sort((a, b) => a.at - b.at),
    verificationLeases: verification.leases,
    timeline,
    reportedIntervals,
    totals,
    removalCandidates,
  }
}

export function renderStandstillReport(report) {
  const lines = [
    `Batch standstill ${new Date(report.window.start).toISOString()} .. ${new Date(report.window.end).toISOString()} (UTC)`,
    `Threshold: ${report.threshold.ms / 60_000} minutes — ${report.threshold.reason}`,
    `Declared inputs: ${JSON.stringify(report.inputs)}`,
    `First-parent commits: ${report.commitGaps.commits}; gaps >= threshold: ${report.commitGaps.gaps.length}, ${fmtDuration(report.commitGaps.gapMs)}`,
    '',
    'Intervals at or above threshold:',
  ]
  if (report.reportedIntervals.length === 0) lines.push('  none')
  for (const item of report.reportedIntervals) {
    lines.push(
      `  ${new Date(item.start).toISOString()} .. ${new Date(item.end).toISOString()} | ${fmtDuration(item.durationMs)} | ${item.className} | ${item.cause} | ${JSON.stringify(item.evidence)}`,
    )
  }
  lines.push('', 'Totals (every wall-clock millisecond exactly once):')
  for (const [className, durationMs] of Object.entries(report.totals.byClass)) {
    lines.push(`  ${className}: ${fmtDuration(durationMs)} (${pct(durationMs, report.totals.elapsedMs)})`)
  }
  lines.push(`  TOTAL: ${fmtDuration(report.totals.elapsedMs)} (100.00%)`)
  lines.push('', `Removal candidates: ${report.removalCandidates.length ? report.removalCandidates.map((x) => `${x.className} ${fmtDuration(x.durationMs)}`).join(', ') : 'none measured above threshold'}`)
  if (report.inputHealth.rejectedJournalLines.length) {
    lines.push(`Journal warnings: ${JSON.stringify(report.inputHealth.rejectedJournalLines)}`)
  }
  return lines.join('\n')
}

async function main(argv = process.argv.slice(2)) {
  const options = argsOf(argv)
  if (!(options.start < options.end)) throw new TypeError('--since must be before --until')
  if (!(Number.isFinite(options.thresholdMs) && options.thresholdMs > 0)) throw new TypeError('--threshold-min must be positive')
  const report = gatherStandstillReport(options)
  process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${renderStandstillReport(report)}\n`)
}

if (isMainModule(import.meta.url)) main().catch((error) => {
  process.stderr.write(`batch-standstill-report: ${error?.message ?? error}\n`)
  process.exitCode = 1
})
