// THE CONTEXT-OVERSHOOT SERIES (point 742) — the IO half plus the ONE command
// that reads the series back. The decision logic is pure in
// scripts/context-incidents-core.mjs.
//
//   node scripts/context-incidents.mjs                     the whole series
//   node scripts/context-incidents.mjs --since 2026-08-19   since a date
//   node scripts/context-incidents.mjs --since-commit <sha> since a commit
//   node scripts/context-incidents.mjs --file <path>        read one series file
//   node scripts/context-incidents.mjs --quantile 0.95      a different upper quantile
//   node scripts/context-incidents.mjs --json               the summary as JSON
//
// It reports how many overshoots there were, their size distribution, what each
// session was doing, and the growth per KIND of call — the reading the deferred
// decision of point 742 needs: after the context fence was armed (point 542), it
// answers whether overshoots still happen at all.
//
// TWO FILES, ON PURPOSE:
//   .claude/context-incidents.jsonl       the LIVE series the boundary appends
//                                         to. Git-IGNORED, like every other
//                                         .claude runtime record: these are THIS
//                                         machine's session readings, and a
//                                         committed one would hand a clone
//                                         somebody else's history (the same
//                                         reason .claude/batch-fence.json is
//                                         ignored). A boundary is a session's
//                                         LAST repository action, so it cannot
//                                         commit what it writes either.
//   .claude/context-incidents-seed.jsonl  TRACKED. Readings that did not come
//                                         from a boundary and would otherwise be
//                                         lost — the two measured startup
//                                         overshoots of 19./20.08.2026. A new
//                                         third-party reading is appended here by
//                                         hand, with a `note` naming its source.
// Both are read by default, oldest first; `--file` replaces them.
//
// NOTHING IS FILED OR RANKED AUTOMATICALLY (the point says so twice): this
// command prints, and the boundary appends. No queue action, no triage.
import { appendFileSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { CONTEXT_CEILING_TOKENS, CONTEXT_MARGIN_TOKENS } from './context-watermark-core.mjs'
import { locateTranscript, triggerTokens } from './context-watermark.mjs'
import {
  INCIDENT_KINDS,
  UPPER_QUANTILE,
  buildIncident,
  extractCalls,
  formatSeriesReport,
  parseIncidents,
  shouldRecordIncident,
  summarizeSeries,
} from './context-incidents-core.mjs'

/** The live series the boundary appends to (git-ignored runtime state). */
export const INCIDENTS_PATH = repoPath('.claude/context-incidents.jsonl')

/** The tracked seed of readings no boundary could have taken. */
export const SEED_PATH = repoPath('.claude/context-incidents-seed.jsonl')

/** How much transcript is read for the growth series. The WHOLE file is wanted —
 *  the startup reading is its FIRST usage record, which a tail would miss — but a
 *  runaway transcript must not make the boundary chew a gigabyte. Past the cap
 *  the tail is read and the record says so, rather than reporting a startup
 *  reading it never saw. */
export const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024

const readTextOrNull = (path) => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/** Every record of every given series file, oldest first, with what was read and
 *  how many lines were unreadable. */
export function readSeries(paths = [SEED_PATH, INCIDENTS_PATH]) {
  const records = []
  const sources = []
  let malformed = 0
  for (const path of paths) {
    const text = readTextOrNull(path)
    if (text === null) continue
    const parsed = parseIncidents(text)
    records.push(...parsed.records)
    malformed += parsed.malformed
    sources.push(path)
  }
  records.sort((a, b) => a.atMs - b.atMs)
  return { records, malformed, sources }
}

/** Append one record. Callers build it; this only writes. */
export function appendIncident(record, path = INCIDENTS_PATH) {
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${JSON.stringify(record)}\n`)
  return record
}

/** The repository head, or null. Never fatal: the record is evidence, and a
 *  missing sha is a gap in it, not a reason to lose the whole record. */
export function headSha({ cwd = REPO_ROOT, exec = execFileSync } = {}) {
  try {
    return String(exec('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', windowsHide: true })).trim() || null
  } catch {
    return null
  }
}

/** A commit's own timestamp in ms, for `--since-commit`. Null when the revision
 *  cannot be resolved. An ARGUMENT VECTOR, never a shell line. */
export function commitTimeMs(rev, { cwd = REPO_ROOT, exec = execFileSync } = {}) {
  const value = String(rev ?? '').trim()
  if (!/^[0-9A-Za-z._/^~@{}-]{1,80}$/.test(value)) return null
  try {
    const out = String(exec('git', ['show', '-s', '--format=%cI', value], { cwd, encoding: 'utf8', windowsHide: true })).trim()
    const at = Date.parse(out)
    return Number.isFinite(at) ? at : null
  } catch {
    return null
  }
}

/** The session transcript, read whole where that is affordable. Returns
 *  { text, truncated, bytes } — text null when nothing could be read. */
export function readTranscript(path, { maxBytes = MAX_TRANSCRIPT_BYTES } = {}) {
  if (!path) return { text: null, truncated: false, bytes: 0 }
  let bytes = 0
  try {
    bytes = statSync(path).size
  } catch {
    return { text: null, truncated: false, bytes: 0 }
  }
  if (bytes > maxBytes) {
    // The tail only: the growth steps it holds are real, the startup reading is
    // NOT in it, and the record says so instead of implying one.
    const text = readTextOrNull(path)
    return { text: text === null ? null : text.slice(-maxBytes), truncated: true, bytes }
  }
  return { text: readTextOrNull(path), truncated: false, bytes }
}

/**
 * RECORD THE INCIDENT — and NEVER throw. THE HANDOVER MATTERS MORE THAN THE
 * BOOKKEEPING: the boundary is what keeps the batch alive, so every failure here
 * degrades to a returned reason the caller prints as a warning.
 *
 * Returns { written, reason, record, error }:
 *   written false + reason 'below-margin'  the overshoot is inside the stated
 *                                          margin — nothing to record.
 *   written false + reason 'no-reading'     no usable measurement.
 *   written false + reason 'write-failed'   the record could not be written;
 *                                           `error` names why.
 */
export function recordBoundaryIncident({
  tokens = null,
  sessionId = null,
  point = null,
  cause = null,
  transcriptPath = '',
  ceiling = CONTEXT_CEILING_TOKENS,
  margin = CONTEXT_MARGIN_TOKENS,
  trigger = triggerTokens(),
  now = Date.now(),
  path = INCIDENTS_PATH,
  append = appendIncident,
  sha = headSha,
  locate = locateTranscript,
  readText = readTranscript,
} = {}) {
  try {
    if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0) {
      return { written: false, reason: 'no-reading', record: null, error: null }
    }
    if (!shouldRecordIncident({ tokens, ceiling, margin })) {
      return { written: false, reason: 'below-margin', record: null, error: null }
    }
    const resolved = String(transcriptPath ?? '').trim() || locate({ sid: sessionId ?? '' })
    const transcript = readText(resolved)
    const calls = transcript.text ? extractCalls(transcript.text) : []
    const record = buildIncident({
      kind: INCIDENT_KINDS.OVERSHOOT,
      at: now,
      sessionId,
      point,
      cause,
      head: sha(),
      tokens,
      watermark: ceiling,
      margin,
      trigger,
      calls,
      note:
        transcript.text === null
          ? 'no transcript could be read — the growth series of this incident is missing'
          : transcript.truncated
            ? `transcript read from its tail only (${transcript.bytes} bytes) — the startup reading is not in it`
            : '',
    })
    append(record, path)
    return { written: true, reason: null, record, error: null }
  } catch (error) {
    return { written: false, reason: 'write-failed', record: null, error }
  }
}

/** What the boundary prints about its own bookkeeping. One line, and a WARNING
 *  wherever the record was owed and did not happen. */
export function incidentOutcomeLine(outcome, { path = INCIDENTS_PATH } = {}) {
  if (outcome?.written) {
    const rec = outcome.record
    return (
      `context overshoot RECORDED in ${path}: ${rec.tokens} tokens, ${rec.overshoot} past the ${rec.watermark} ` +
      `ceiling, ${rec.growth.steps} growth steps` +
      (rec.growth.max ? `, largest +${rec.growth.max.delta} by ${rec.growth.max.kind}` : '') +
      '. Read the series with `node scripts/context-incidents.mjs`.'
    )
  }
  if (outcome?.reason === 'write-failed') {
    return (
      `WARNING: the context-overshoot record could NOT be written (${outcome.error?.message ?? outcome.error}) — ` +
      'the boundary itself stands, only this incident is missing from the series (which therefore under-counts).'
    )
  }
  return null
}

/** Record and print in one call, and swallow EVERYTHING — the boundary must not
 *  fail because its bookkeeping did. */
export function noteBoundaryIncident(options = {}) {
  try {
    const outcome = recordBoundaryIncident(options)
    const line = incidentOutcomeLine(outcome, { path: options.path ?? INCIDENTS_PATH })
    if (line) console.log(`\n${line}`)
    return outcome
  } catch (error) {
    try {
      console.log(`\nWARNING: the context-overshoot bookkeeping failed (${error?.message ?? error}); the boundary stands.`)
    } catch {
      /* even the warning must not throw */
    }
    return { written: false, reason: 'write-failed', record: null, error }
  }
}

/** The CLI's own argument reading, pure enough to test. */
export function parseReadArgs(argv = []) {
  const files = []
  let since = ''
  let sinceCommit = ''
  let quantile = UPPER_QUANTILE
  let json = false
  const unknown = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i])
    if (arg === '--status') continue
    else if (arg === '--json') json = true
    else if (arg === '--file') files.push(String(argv[++i] ?? ''))
    else if (arg === '--since') since = String(argv[++i] ?? '')
    else if (arg === '--since-commit') sinceCommit = String(argv[++i] ?? '')
    else if (arg === '--quantile') quantile = Number(argv[++i])
    else unknown.push(arg)
  }
  if (!Number.isFinite(quantile) || quantile <= 0 || quantile >= 1) quantile = UPPER_QUANTILE
  return { files: files.filter(Boolean), since, sinceCommit, quantile, json, unknown }
}

/** Resolve `--since` / `--since-commit` to one cut-off. Returns { sinceMs, label, error }. */
export function resolveSince({ since = '', sinceCommit = '', commitTime = commitTimeMs } = {}) {
  if (sinceCommit) {
    const at = commitTime(sinceCommit)
    if (at == null) return { sinceMs: null, label: null, error: `cannot resolve commit "${sinceCommit}"` }
    return { sinceMs: at, label: `commit ${sinceCommit} (${new Date(at).toISOString()})`, error: null }
  }
  if (since) {
    const at = Date.parse(since)
    if (!Number.isFinite(at)) return { sinceMs: null, label: null, error: `cannot read date "${since}"` }
    return { sinceMs: at, label: new Date(at).toISOString(), error: null }
  }
  return { sinceMs: null, label: null, error: null }
}

// --- CLI ------------------------------------------------------------------------

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(
      'node scripts/context-incidents.mjs [--since <date>] [--since-commit <sha>] [--file <path>]… ' +
        '[--quantile <0..1>] [--json]\n\n' +
        'Reads the context-overshoot series: how many overshoots, how big, what each session was doing, and\n' +
        'the growth per kind of call. Nothing is filed or ranked. A session that dies without taking a\n' +
        'boundary writes no record, so the series UNDER-counts and never over-counts.',
    )
    process.exit(0)
  }
  const opts = parseReadArgs(argv)
  if (opts.unknown.length) {
    console.error(`unknown argument(s): ${opts.unknown.join(', ')} — see --help.`)
    process.exit(2)
  }
  const cut = resolveSince(opts)
  if (cut.error) {
    console.error(`${cut.error} — see --help.`)
    process.exit(2)
  }
  const series = readSeries(opts.files.length ? opts.files : [SEED_PATH, INCIDENTS_PATH])
  const summary = summarizeSeries(series.records, {
    quantile: opts.quantile,
    sinceMs: cut.sinceMs,
    sinceLabel: cut.label ?? '',
  })
  if (opts.json) {
    console.log(JSON.stringify({ ...summary, malformed: series.malformed, sources: series.sources }, null, 2))
  } else {
    console.log(formatSeriesReport(summary, { malformed: series.malformed, sources: series.sources }))
  }
}
