import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { parseActivityJournal } from './batch-activity-journal-core.mjs'
import { ACTIVITY_CLASSES, evidenceInterval } from './batch-standstill-core.mjs'

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

function recordFiles(dir) {
  try {
    return readdirSync(dir).filter((name) => name.endsWith('.run.json')).map((name) => join(dir, name))
  } catch {
    return []
  }
}

/** Finished named runs are explicit verification intervals. A running record is
 * accepted only to the last output-log progress plus a renewable lease, and the
 * interval never exceeds that lease. */
export function verificationRecordEvidence(dir, { start, end, leaseMs = 15 * 60_000 } = {}) {
  const intervals = []
  const boundaries = []
  for (const path of recordFiles(dir)) {
    let record
    try { record = JSON.parse(readFileSync(path, 'utf8')) } catch { continue }
    const began = Number(record?.startedAt)
    if (!finite(began)) continue
    let finished = Number(record?.finishedAt)
    let progressAt = null
    const logPath = typeof record.log === 'string' ? (record.log.startsWith('/') ? record.log : join(dir, basename(record.log))) : null
    if (record.status === 'running' && logPath) {
      try { progressAt = statSync(logPath).mtimeMs } catch { /* no progress proof */ }
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
    boundaries.push(began, finished)
  }
  return { intervals: intervals.filter(Boolean), boundaries }
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

export function declaredInputPaths(repo, transcriptPaths = []) {
  return {
    firstParentCommits: `git:${repo}:main:first-parent`,
    autostartLog: join(repo, '.claude', 'autostart.log'),
    autostartLast: join(repo, '.claude', 'autostart-last.json'),
    boundaryLog: join(repo, '.claude', 'boundary.log'),
    boundaryMarker: join(repo, '.claude', 'batch-boundary.json'),
    verificationRecords: join(repo, 'local', 'verify-logs', '*.run.json'),
    sessionTranscripts: transcriptPaths,
    journal: join(repo, '.claude', 'batch-activity.jsonl'),
  }
}

export function existing(path) { return existsSync(path) }

