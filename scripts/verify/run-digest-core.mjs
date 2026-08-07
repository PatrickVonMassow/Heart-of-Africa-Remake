// Pure decision core of the LOGGED verify invocation (point 373 e).
//
// WHY: the session boundary fires between POINTS. Inside one heavy point the
// context still grows unchecked, and the largest single contributor is a verify
// run's own transcript: `run-all.mjs` prints ONE line per suite while it is
// green, but on a red one it echoes the WHOLE captured output — the entire
// vitest dump, the entire tsc/vite build error, the entire lint report. Those
// are the thousands of lines a session pays for, and it pays for them again on
// every poll of a background run.
//
// THE COUNTER-MEASURE IS NOT A COMPACTION: the run's output goes to a FILE, and
// the caller reads a BOUNDED selection of it — the runner's own structured
// lines (every PASS/FAIL/SKIP verdict, every stage heading, every failure echo,
// the retry/flake notices, the final verdict) plus, when the run failed, the
// last few dozen raw lines. What is dropped is the unstructured bulk, which is
// on disk and one `--show` away.
//
// THE FAILING CASE STAYS DIAGNOSABLE — that is the constraint the selection is
// built around, not an afterthought: the failing SUITE names survive as the
// runner's own `FAIL  <suite>` lines, the failing CHECK/TEST names survive as
// the indented `FAIL …` / `ERR: …` echoes beneath them (vitest's own
// ` FAIL  file > case` lines have that shape too), and the digest names them
// once more in a FAILING block so no reader has to scan for them.
//
// Everything here is lines-in / lines-out so the Vitest layer can pin it
// (run-digest-core.test.mjs); all process work — the spawn, the log file, the
// live echo — lives in the wrapper (run-logged.mjs).

/** Defaults for the bounds. Deliberately generous: a digest that hides a
 *  failure costs a whole rerun, while a hundred extra lines cost almost
 *  nothing against the thousands they replace. */
export const DEFAULTS = Object.freeze({
  maxKeptLines: 120,
  tailLines: 40,
  maxLineChars: 300,
})

/**
 * `PASS  world        12 pass, 0 fail…` — the runner's own per-suite/per-stage
 * verdict. The runner pads the name to 12 columns, so the name is followed by
 * TWO spaces (or the line ends). That padding is what tells a verdict line from
 * a test's own `FAIL  <sentence>` console output, which cost a real
 * misattribution the first time this ran on a red suite: `FAIL  frame 18-… —
 * the scene never finished drawing` was read as a failing suite called "frame".
 * A single space is accepted only for a name long enough to have consumed the
 * padding, so a future 12-character suite name cannot silently fall out.
 */
const RESULT_HEAD = /^(PASS|FAIL|SKIP)\s{2,}(\S+)(\s*)/

/** The unit a runner verdict line is about, or null if this is not one. */
export function resultName(line) {
  const m = RESULT_HEAD.exec(String(line ?? ''))
  if (!m) return null
  const [head, , name, gap] = m
  const rest = String(line).slice(head.length)
  if (rest === '') return name
  if (gap.length >= 2) return name
  return name.length >= 12 ? name : null
}

const isResult = (line) => resultName(line) !== null

/** `# lint (oxlint)…`, `# quiet-machine check (point 296): …` — a stage heading. */
const HEADING = /^#\s/
/** `===== LARGE regression — backend 1/2: WebGL 2 (…) =====` */
const BANNER = /^={3,}/
/** The run's own conclusions. */
const FINAL = /^(ALL GREEN\b|\d+\s+SUITE\(S\) FAILED\b|DEFERRED\b|LARGE FAILED\b)/
/** `↻ retry world once…`, `⚠ PASSED ON RETRY  world …` */
const FLAKE = /^[↻⚠]/
/** The runner's indented failure echo (`      FAIL …`, `      ERR: …`,
 *  `      | <crash tail>`) — and vitest's own ` FAIL  file > case` lines, which
 *  wear the same shape and are exactly the names a reader needs. */
const ECHO = /^\s+(FAIL\b|ERR:|\|\s)/
/** Any indented line — kept only as the continuation of a `#` heading (below). */
const INDENTED = /^\s+\S/

/**
 * What kind of line this is, or null for unstructured output (the bulk).
 * Order matters: ECHO before INDENTED, RESULT before everything.
 */
export function classifyLine(line) {
  const s = String(line ?? '')
  if (isResult(s)) return 'result'
  if (ECHO.test(s)) return 'echo'
  if (HEADING.test(s)) return 'heading'
  if (BANNER.test(s)) return 'banner'
  if (FINAL.test(s.trimStart())) return 'final'
  if (FLAKE.test(s.trimStart())) return 'flake'
  return null
}

/** Kinds that must survive the line budget: everything a red run is read for. */
const HIGH_PRIORITY = new Set(['echo', 'flake', 'final'])

/** A FAIL result outranks a PASS result — a red run's budget belongs to it. */
function priorityOf({ kind, line }) {
  if (HIGH_PRIORITY.has(kind)) return 'high'
  if (kind === 'result' && /^FAIL/.test(line)) return 'high'
  return 'low'
}

/**
 * The structured lines of a run, in order.
 *
 * The one context-sensitive rule: an indented line is kept when it continues a
 * `#` heading and no verdict line has intervened. That keeps the quiet-machine
 * report's reasons and leftover list (a heading followed by its indented block)
 * while dropping a vitest failure dump, which is just as indented but always
 * follows the `FAIL  unit` verdict line rather than a heading.
 */
export function selectLines(lines) {
  const select = createSelector()
  const out = []
  for (const [index, raw] of (lines ?? []).entries()) {
    const line = String(raw ?? '')
    const kind = select(line)
    if (kind) out.push({ index, line, kind })
  }
  return out
}

/**
 * The same selection as a STREAMING decision: `select(line)` returns the kind
 * or null, carrying the heading-continuation state across calls. The wrapper
 * uses it to echo lines live while they arrive; selectLines uses it in bulk, so
 * the live echo and the end digest can never diverge.
 */
export function createSelector() {
  let continuing = false
  return function select(raw) {
    const line = String(raw ?? '')
    const kind = classifyLine(line)
    if (kind) {
      continuing = kind === 'heading'
      return kind
    }
    if (continuing && INDENTED.test(line)) return 'continuation'
    if (line.trim() !== '') continuing = false
    return null
  }
}

/**
 * The failing units of a run and what failed inside each: `FAIL  <name>` at the
 * line start is a suite or a preflight stage, and the indented echoes that
 * follow it name the individual checks/tests. `maxDetails` bounds the report,
 * never the truth — the full list is in the log.
 */
export function failureSurface(lines, { maxDetails = 3 } = {}) {
  const units = []
  let current = null
  for (const raw of lines ?? []) {
    const line = String(raw ?? '')
    const name = resultName(line)
    if (name !== null) {
      if (/^FAIL/.test(line)) {
        current = { name, details: [], detailCount: 0 }
        units.push(current)
      } else {
        current = null
      }
      continue
    }
    if (current && ECHO.test(line)) {
      current.detailCount += 1
      if (current.details.length < maxDetails) current.details.push(line.trim())
    }
  }
  return units
}

/** One line, bounded — a vite/tsc error line can be thousands of characters. */
function clip(line, maxLineChars) {
  const s = String(line ?? '')
  return s.length > maxLineChars ? `${s.slice(0, maxLineChars - 1)}…` : s
}

/**
 * Apply the line budget: low-priority lines (PASS verdicts, headings, banners,
 * heading continuations) go first, and from the FRONT — the end of a run is
 * what a reader needs. Only if that is not enough do high-priority lines go,
 * also from the front. Returns the surviving entries and how many were dropped.
 */
export function applyBudget(entries, maxKeptLines) {
  const list = [...(entries ?? [])]
  if (list.length <= maxKeptLines) return { kept: list, dropped: 0 }
  let over = list.length - maxKeptLines
  const doomed = new Set()
  for (const e of list) {
    if (over === 0) break
    if (priorityOf(e) === 'low') {
      doomed.add(e)
      over -= 1
    }
  }
  for (const e of list) {
    if (over === 0) break
    if (!doomed.has(e)) {
      doomed.add(e)
      over -= 1
    }
  }
  return { kept: list.filter((e) => !doomed.has(e)), dropped: doomed.size }
}

/** `4m 12s`, `38s` — a duration a reader can compare against the next run. */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '?'
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

/**
 * The digest a caller reads instead of the transcript.
 *
 * `includeKept: false` is the streaming shape: the wrapper already echoed the
 * structured lines LIVE (so a background poller sees progress and a failure the
 * moment it happens), and repeating them at the end would pay for them twice.
 * The header, the FAILING block and the failure tail are printed either way.
 */
export function buildDigest({
  lines = [],
  command = '',
  exitCode = null,
  durationMs = null,
  logPath = '',
  rawChars = null,
  includeKept = true,
  maxKeptLines = DEFAULTS.maxKeptLines,
  tailLines = DEFAULTS.tailLines,
  maxLineChars = DEFAULTS.maxLineChars,
} = {}) {
  const all = (lines ?? []).map((l) => String(l ?? ''))
  const selected = selectLines(all)
  const failures = failureSurface(all)
  const failed = exitCode !== 0 || failures.length > 0
  const { kept, dropped } = applyBudget(selected, maxKeptLines)

  const out = []
  const chars = rawChars ?? all.reduce((n, l) => n + l.length + 1, 0)
  out.push(
    `── verify digest ── ${command || 'verify run'} ── exit ${exitCode ?? '?'}` +
      `${durationMs === null ? '' : ` after ${formatDuration(durationMs)}`}`,
  )
  out.push(`   captured ${all.length} lines / ${chars} chars → ${logPath || '(no log file)'}`)

  if (includeKept) {
    if (dropped > 0) out.push(`   … ${dropped} earlier structured line(s) dropped by the ${maxKeptLines}-line budget`)
    for (const e of kept) out.push(clip(e.line, maxLineChars))
  }

  if (failures.length > 0) {
    out.push(`FAILING (${failures.length}): ${failures.map((f) => f.name).join(', ')}`)
    for (const f of failures) {
      for (const d of f.details) out.push(`   ${f.name}: ${clip(d, maxLineChars)}`)
      if (f.detailCount > f.details.length) {
        out.push(`   ${f.name}: … and ${f.detailCount - f.details.length} more — see the log`)
      }
    }
  }

  // The tail is the safety net for anything the selection has no pattern for: a
  // crash stack, a runner that changed its wording, a run that printed nothing
  // structured at all. Paid only when it is needed.
  const needTail = failed || selected.length === 0
  if (needTail && tailLines > 0) {
    const tail = all.filter((l) => l.trim() !== '').slice(-tailLines)
    if (tail.length > 0) {
      out.push(`── last ${tail.length} non-empty line(s) ──`)
      for (const l of tail) out.push(clip(l, maxLineChars))
    }
  }

  // The way back to the detail is printed only when there IS detail the digest
  // did not carry — on a green run that hid nothing, two more lines would be
  // the very cost this mechanism exists to cut.
  const hidden = all.filter((l) => l.trim() !== '').length - selected.length
  if (logPath && (failed || hidden > 0 || dropped > 0)) {
    out.push(`── the full output is on disk; read a window of it, never the whole file:`)
    out.push(`   node scripts/verify/run-logged.mjs --show ${logPath} --tail 120`)
    if (failed) out.push(`   node scripts/verify/run-logged.mjs --show ${logPath} --grep "FAIL|ERR:|Error" --max 60`)
  }

  const text = out.join('\n')
  return {
    lines: out,
    text,
    stats: {
      rawLines: all.length,
      rawChars: chars,
      keptLines: kept.length,
      droppedLines: dropped,
      digestLines: out.length,
      digestChars: text.length + 1,
      failing: failures.map((f) => f.name),
    },
  }
}

/** Should the wrapper echo this line LIVE? Exactly the structured selection —
 *  so a background run still shows progress and a red suite still names itself
 *  the moment it happens, at about one line per suite. */
export function heartbeatKinds() {
  return ['result', 'echo', 'heading', 'banner', 'final', 'flake', 'continuation']
}

/**
 * A BOUNDED window of a saved log — the `--show` half. Without it the only way
 * back to the detail would be `cat`, which is the cost this whole mechanism
 * exists to avoid. `grep` filters first (a JS regex, case-insensitive), `tail`
 * then takes the last N of what is left, and `max` caps the answer regardless.
 */
export function showWindow(lines, { grep = null, tail = 120, max = 400 } = {}) {
  let list = (lines ?? []).map((l) => String(l ?? ''))
  let matched = null
  if (grep) {
    const re = grep instanceof RegExp ? grep : new RegExp(grep, 'i')
    list = list.filter((l) => re.test(l))
    matched = list.length
  }
  const total = list.length
  const window = list.slice(-Math.max(0, Math.min(tail, max)))
  return { lines: window, total, matched, truncated: total - window.length }
}
