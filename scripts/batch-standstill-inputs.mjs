import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve, win32 } from 'node:path'
import { parseActivityJournal } from './batch-activity-journal-core.mjs'
import { ACTIVITY_EVENTS } from './batch-activity-journal-core.mjs'
import { ACTIVITY_CLASSES, evidenceInterval } from './batch-standstill-core.mjs'
import { parsePauseRecord } from './batch-pause-core.mjs'

const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const isoAtStart = /^\[?(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)\]?\s+(.*)$/

export function readText(path) {
  try { return readFileSync(path, 'utf8') } catch { return '' }
}

export function firstParentCommitTimes({ repo, ref = 'main', start, end } = {}) {
  try {
    return execFileSync('git', [
      '-C', repo, 'log', ref, '--first-parent', '--format=%ct',
      `--since=${new Date(start).toISOString()}`, `--until=${new Date(end).toISOString()}`,
    ], { encoding: 'utf8', windowsHide: true, timeout: 30_000, stdio: ['ignore', 'pipe', 'ignore'] })
      .trim().split(/\s+/).filter(Boolean).map((seconds) => Number(seconds) * 1000).filter(finite)
  } catch {
    return []
  }
}

export function timestampedLogBoundaries(text = '') {
  const entries = []
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(isoAtStart)
    if (!match) continue
    const at = Date.parse(match[1])
    if (finite(at)) entries.push({ at, text: match[2] })
  }
  return entries.sort((a, b) => a.at - b.at)
}

/** Legacy launcher text provides event boundaries and a conservative no-worker
 * state only when the line itself says both facts. It never promotes a living
 * writer or heartbeat to work. Journal-era vetoes carry exact bounds elsewhere. */
export function autostartEvidence(text = '', { end = Number.POSITIVE_INFINITY } = {}) {
  const entries = timestampedLogBoundaries(text)
  const intervals = []
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const next = Math.min(entries[index + 1]?.at ?? end, end)
    if (next <= entry.at) continue
    if (/skip: no owner lock and no live batch-writer process measured/i.test(entry.text)) {
      intervals.push(evidenceInterval({
        start: entry.at, end: next, className: null, state: 'no-worker', source: 'autostart.log',
        cause: 'launcher-skip-no-owner', evidence: { line: entry.text },
      }))
    }
  }
  return { intervals: intervals.filter(Boolean), boundaries: entries.map((entry) => entry.at) }
}

/** Atomic JSON state contributes boundaries and, where it carries the launcher's
 * measured veto object, the exact maximum veto interval. */
export function autostartLastEvidence(text = '') {
  let record
  try { record = JSON.parse(text) } catch { return { intervals: [], boundaries: [] } }
  const at = Number(record?.at)
  if (!finite(at)) return { intervals: [], boundaries: [] }
  const intervals = []
  for (const writer of record?.measured?.batchWriters ?? []) {
    if (writer?.sameProcess !== true || writer?.recentWrite !== true || !finite(writer.batchWriterAt)) continue
    intervals.push(evidenceInterval({
      start: at,
      end: writer.batchWriterAt + 2 * 60 * 60_000,
      className: ACTIVITY_CLASSES.BLOCKED_WRITER_VETO,
      source: 'autostart-last.json',
      cause: 'measured-writer-veto',
      evidence: {
        writerSession: writer.sessionId ?? null,
        pid: writer.pid ?? null,
        pidStartedAt: writer.recordedStartedAt ?? null,
        lastFencedOperationAt: writer.batchWriterAt,
      },
    }))
  }
  return { intervals: intervals.filter(Boolean), boundaries: [at] }
}

export function markerBoundary(text = '') {
  try {
    const marker = JSON.parse(text)
    return finite(marker?.at) ? [marker.at] : []
  } catch {
    return []
  }
}

export function boundaryMarkerEvidence(text = '', { end } = {}) {
  let marker
  try { marker = JSON.parse(text) } catch { return { intervals: [], boundaries: [], batchProgress: [] } }
  if (!finite(marker?.at)) return { intervals: [], boundaries: [], batchProgress: [] }
  const interval = marker.phase === 'committed'
    ? evidenceInterval({
        start: marker.at, end, className: ACTIVITY_CLASSES.HANDOVER,
        source: 'batch-boundary.json', cause: marker.cause === 'context' ? 'context-boundary' : 'point-boundary',
        evidence: { session: marker.sessionId ?? null, point: marker.point ?? null, phase: marker.phase },
      })
    : null
  const progress = marker.phase === 'committed'
    ? { at: marker.at, kind: 'committed-boundary', point: marker.point ?? null }
    : null
  return { intervals: [interval].filter(Boolean), boundaries: [marker.at], batchProgress: [progress].filter(Boolean) }
}

function delegatedTip(item, { repo } = {}) {
  const address = item?.kind === 'branch' ? String(item.ref ?? '').trim() : String(item?.path ?? '').trim()
  if (!repo || !address) return null
  const args = item.kind === 'branch'
    ? ['-C', repo, 'rev-parse', `${address}^{commit}`]
    : ['-C', address, 'rev-parse', 'HEAD^{commit}']
  try {
    const sha = execFileSync('git', args, {
      encoding: 'utf8', windowsHide: true, timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (!/^[0-9a-f]{40}$/i.test(sha)) return null
    // A tip already contained by main is counted by the first-parent source.
    // Only an independently moved delegate branch belongs in this source.
    try {
      execFileSync('git', ['-C', repo, 'merge-base', '--is-ancestor', sha, 'main'], {
        windowsHide: true, timeout: 8000, stdio: 'ignore',
      })
      return null
    } catch (error) {
      if (error?.status !== 1) return null
    }
    const seconds = Number(execFileSync('git', ['-C', repo, 'show', '-s', '--format=%ct', sha], {
      encoding: 'utf8', windowsHide: true, timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim())
    return Number.isFinite(seconds) && seconds > 0 ? { at: seconds * 1000, sha } : null
  } catch {
    return null
  }
}

/** A declaration is not progress. Only a commit at the named delegated output
 * is, and only while that tip is not already represented on main. */
export function delegatedBranchProgress(text = '', { repo, records = [], start = -Infinity, end = Infinity, tipOf = delegatedTip } = {}) {
  let declaration
  try { declaration = JSON.parse(text) } catch { declaration = null }
  const events = []
  const seen = new Set()
  const historical = records
    .filter((record) => record?.event === 'delegated-start' || record?.event === 'delegated-finish')
    .flatMap((record) => record?.evidence?.items ?? [])
  for (const item of [...(declaration?.evidence ?? []), ...historical]) {
    if (item?.kind !== 'branch' && item?.kind !== 'worktree') continue
    const tip = tipOf(item, { repo })
    if (!finite(tip?.at) || !/^[0-9a-f]{40}$/i.test(tip?.sha) || tip.at < start || tip.at > end || seen.has(tip.sha)) continue
    seen.add(tip.sha)
    events.push({ at: tip.at, kind: 'delegated-branch-moved', sha: tip.sha, point: item.point ?? null })
  }
  return events
}

export function pauseMarkerEvidence(text = '', { start, end } = {}) {
  if (!text) return { intervals: [], boundaries: [] }
  const pause = parsePauseRecord(text)
  const began = finite(pause.pausedAt) ? pause.pausedAt : start
  const until = finite(pause.retryAfter) ? Math.min(end, pause.retryAfter) : end
  const interval = evidenceInterval({
    start: began, end: until, className: ACTIVITY_CLASSES.BLOCKED_USER,
    source: 'batch-paused', cause: pause.cause ?? 'user-pause',
    evidence: { reason: pause.reason || null, retryAfter: pause.retryAfter ?? null },
  })
  return { intervals: [interval].filter(Boolean), boundaries: [began, until].filter(finite) }
}

function recordFiles(dir) {
  try {
    return readdirSync(dir).filter((name) => name.endsWith('.run.json')).map((name) => join(dir, name))
  } catch {
    return []
  }
}

/** Resolve the log ONCE for both progress attribution and process identity.
 * Run records store repository-relative display paths; native and Windows
 * absolute spellings are already complete and must not be rebased. */
export function resolveVerificationLog(recordLog, { repo } = {}) {
  if (typeof recordLog !== 'string' || !recordLog.trim()) return null
  if (isAbsolute(recordLog) || win32.isAbsolute(recordLog)) return recordLog
  return typeof repo === 'string' && repo.trim() ? resolve(repo, recordLog) : null
}

function emittedVerificationProgress(records, record, path, end) {
  let latest = null
  for (const event of records ?? []) {
    const evidence = event?.evidence
    const sameRecord = evidence?.recordPath === path || evidence?.id === path
    if (event?.event !== ACTIVITY_EVENTS.VERIFICATION_PROGRESS || !sameRecord) continue
    if (Number(evidence?.startedAt) !== Number(record?.startedAt) || event?.pid !== record?.pid) continue
    const at = Number(event?.atMs)
    if (!finite(at) || at <= Number(record.startedAt) || at > end) continue
    latest = latest === null ? at : Math.max(latest, at)
  }
  return latest
}

/** Finished named runs are explicit verification intervals. A running record is
 * accepted only to the last output-triggered journal event plus a renewable
 * lease, and the interval never exceeds that lease. A timestamp-only touch of
 * either adjacent file emits no event and therefore proves no progress. */
export function verificationRecordEvidence(dir, {
  repo, start, end, leaseMs = 15 * 60_000, records = [], processAlive: processAliveProbe,
} = {}) {
  const intervals = []
  const boundaries = []
  const leases = []
  for (const path of recordFiles(dir)) {
    let record
    try { record = JSON.parse(readFileSync(path, 'utf8')) } catch { continue }
    const began = Number(record?.startedAt)
    if (!finite(began)) continue
    let finished = Number(record?.finishedAt)
    let progressAt = null
    const logPath = resolveVerificationLog(record.log, { repo })
    if (record.status === 'running' && logPath) {
      progressAt = emittedVerificationProgress(records, record, path, end)
      finished = finite(progressAt) ? Math.min(end, progressAt + leaseMs) : NaN
    }
    if (!finite(finished) || finished <= began) continue
    intervals.push(evidenceInterval({
      start: Math.max(start, began), end: Math.min(end, finished), className: ACTIVITY_CLASSES.VERIFICATION,
      source: 'verification-record', cause: record.status === 'running' ? 'advancing-run-record' : 'completed-run-record',
      evidence: {
        record: path, command: record.command ?? null, suites: record.suites ?? [], pid: record.pid ?? null,
        progressAt, result: record.status === 'finished' ? { exitCode: record.exitCode, finishedAt: record.finishedAt } : null,
      },
    }))
    if (record.status === 'running' && finite(progressAt)) {
      let processAlive = false
      try { processAlive = processAliveProbe?.(record, path, logPath) === true } catch { /* no identity proof */ }
      leases.push({
        record: path,
        log: record.log ?? null,
        command: record.command ?? null,
        status: record.status,
        startedAt: began,
        progressAt,
        leaseUntil: progressAt + leaseMs,
        pid: record.pid ?? null,
        processAlive,
      })
    }
    boundaries.push(began, finished)
  }
  return { intervals: intervals.filter(Boolean), boundaries, leases }
}

function transcriptTimestamp(row) {
  const candidates = [row?.timestamp, row?.at, row?.created_at, row?.message?.timestamp]
  for (const value of candidates) {
    const parsed = typeof value === 'number' ? value : Date.parse(value)
    if (finite(parsed)) return parsed
  }
  return null
}

/** Pair transcript tool_use/tool_result records. Merely having a transcript line
 * is not work; only a tool call with both timestamped ends becomes an interval. */
export function transcriptEvidence(text = '', { session = null } = {}) {
  const open = new Map()
  const intervals = []
  const boundaries = []
  for (const line of String(text).split(/\r?\n/)) {
    let row
    try { row = JSON.parse(line) } catch { continue }
    const at = transcriptTimestamp(row)
    if (!finite(at)) continue
    boundaries.push(at)
    const content = Array.isArray(row?.message?.content) ? row.message.content : Array.isArray(row?.content) ? row.content : []
    for (const block of content) {
      if (block?.type === 'tool_use' && typeof block.id === 'string') {
        open.set(block.id, { at, tool: block.name ?? null })
      }
      if (block?.type === 'tool_result' && typeof block.tool_use_id === 'string') {
        const begun = open.get(block.tool_use_id)
        if (!begun || at <= begun.at) continue
        intervals.push(evidenceInterval({
          start: begun.at, end: at, className: ACTIVITY_CLASSES.FOREGROUND,
          source: 'session-transcript', cause: 'completed-tool-call',
          evidence: { session, toolUseId: block.tool_use_id, tool: begun.tool },
        }))
        open.delete(block.tool_use_id)
      }
    }
  }
  return { intervals: intervals.filter(Boolean), boundaries }
}

export function transcriptFiles({ repo, start, home = homedir() } = {}) {
  const slug = String(repo).replace(/[\\/.]/g, '-')
  const dir = join(home, '.claude', 'projects', slug)
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => join(dir, name))
      .filter((path) => {
        try { return statSync(path).mtimeMs >= start } catch { return false }
      })
  } catch {
    return []
  }
}

export function readJournal(path) {
  const parsed = parseActivityJournal(readText(path))
  return { ...parsed, startedAt: parsed.records[0]?.atMs ?? null }
}

export function declaredInputPaths(repo, transcriptPaths = [], ref = 'main') {
  return {
    firstParentCommits: `git:${repo}:${ref}:first-parent`,
    autostartLog: join(repo, '.claude', 'autostart.log'),
    autostartLast: join(repo, '.claude', 'autostart-last.json'),
    boundaryLog: join(repo, '.claude', 'boundary.log'),
    boundaryMarker: join(repo, '.claude', 'batch-boundary.json'),
    inFlight: join(repo, '.claude', 'batch-in-flight.json'),
    pauseMarker: join(repo, '.claude', 'batch-paused'),
    verificationRecords: join(repo, 'local', 'verify-logs', '*.run.json'),
    sessionTranscripts: transcriptPaths,
    journal: join(repo, '.claude', 'batch-activity.jsonl'),
  }
}

export function existing(path) { return existsSync(path) }
