// THE CONTEXT-OVERSHOOT SERIES (point 742) — the pure half.
//
// WHY: the boundary MEASURES an overshoot, prints it, and forgets it. A session
// handed over at 311,039 tokens against the 150,000 ceiling (19.08.2026) and the
// next reading started from zero, so nobody could say whether arming the context
// fence (point 542) changed anything. This module turns a single reading into a
// SERIES: one appended record per incident, each carrying the measurement, the
// per-turn context growth of that session and the growth PER KIND OF CALL with
// its input size — so the later decision rests on readings instead of guesses.
//
// WHAT IT DELIBERATELY DOES NOT DO: no triage, no ranking, no queue action. The
// record is evidence. `scripts/context-incidents.mjs` reads it back.
//
// THE RESIDUAL, WITH ITS DIRECTION: a session that dies without taking a
// boundary writes NO record, so the series UNDER-counts and never over-counts.
// Closing that would mean deriving the reading at session start from the
// predecessor's transcript — a separate point, not claimed here.
import { expandSegments, headAndArgs, segmentInvokesPathWhere, segmentInvokesScript } from './command-classify-core.mjs'

/** Record format version. Readers keep older versions readable; a writer only
 *  ever appends the newest. */
export const INCIDENT_VERSION = 1

/** WHAT KIND OF INCIDENT a record describes.
 *  'overshoot' — a boundary taken further past the ceiling than the margin.
 *  'startup'   — a session that stood past the trigger at its FIRST complete
 *                api usage event, having done no work. Measured, never
 *                estimated from the preamble's character count: right after
 *                SessionStart `parseContextTokens` returns nothing at all, so a
 *                reading taken there would be silently absent rather than wrong. */
export const INCIDENT_KINDS = { OVERSHOOT: 'overshoot', STARTUP: 'startup' }

/**
 * THE KINDS OF CALL the growth is charged to (point 745 needs a cost per KIND,
 * not a per-turn average). Every kind is decided from the tool call itself —
 * name plus, for a shell line, the segments it really runs.
 */
export const CALL_KINDS = {
  AGENT: 'agent',
  BROWSER_SUITE: 'browser-suite',
  DELEGATED_ASK: 'delegated-ask',
  FAST_GATE: 'fast-gate',
  READ: 'read',
  SEARCH: 'search',
  WRITE: 'write',
  WEB: 'web',
  BASH: 'bash',
  OTHER: 'other',
  /** No tool call at all: a plain answer, or the user's own turn. */
  TURN: 'turn',
}

/**
 * WHICH KIND A BUNDLED TURN IS CHARGED TO. Several tool calls in ONE response
 * share one growth step and the step cannot be split between them, so it is
 * charged to the most expensive kind present and EVERY kind is named beside it
 * (`kinds`), which keeps the attribution auditable rather than silently
 * averaged.
 */
export const KIND_PRECEDENCE = [
  CALL_KINDS.AGENT,
  CALL_KINDS.BROWSER_SUITE,
  CALL_KINDS.DELEGATED_ASK,
  CALL_KINDS.WEB,
  CALL_KINDS.READ,
  CALL_KINDS.SEARCH,
  CALL_KINDS.FAST_GATE,
  CALL_KINDS.WRITE,
  CALL_KINDS.BASH,
  CALL_KINDS.OTHER,
  CALL_KINDS.TURN,
]

/** The UPPER quantile the reading reports per kind. A single observed 40,000-token
 *  jump is neither a maximum nor an expected value, so a mean would mislead in
 *  both directions. */
export const UPPER_QUANTILE = 0.9

/** How many of the largest growth steps a record keeps in full. Bounded so an
 *  incident record stays small; the per-kind samples carry the distribution. */
export const TOP_STEPS = 10

/** Per-kind sample cap. Beyond it an even-stride subsample is kept (and marked),
 *  so a long session cannot grow the record without bound while the quantile
 *  stays representative — dropping the largest or the smallest would not. */
export const MAX_KIND_SAMPLES = 400

const AGENT_TOOLS = new Set(['Agent', 'Task'])
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const SEARCH_TOOLS = new Set(['Grep', 'Glob'])
const WEB_TOOLS = new Set(['WebFetch', 'WebSearch'])
const READ_TOOLS = new Set(['Read'])

/** The sanctioned browser-suite launchers, and the delegating asks. Same names
 *  the context fence classifies as "starting new work" — one vocabulary. */
const SUITE_SCRIPTS = ['run-all.mjs', 'run-logged.mjs']
const ASK_SCRIPTS = ['ask-sol.mjs', 'author-sol.mjs', 'review-sol.mjs']
const VERIFY_PREFIX = /(?:^|\/)scripts\/verify\/[^\s]+\.mjs$/i
/** npm subcommands that ARE a browser run, and the fast gates beside them. */
const NPM_SUITE_ARGS = new Set(['test', 'test:small', 'test:large'])
const NPM_GATE_ARGS = new Set(['test:unit', 'build', 'lint'])

/** The most expensive kind in a set, by KIND_PRECEDENCE. */
export function dominantKind(kinds = []) {
  const present = new Set((kinds ?? []).filter(Boolean).map(String))
  if (present.size === 0) return CALL_KINDS.TURN
  for (const kind of KIND_PRECEDENCE) if (present.has(kind)) return kind
  return CALL_KINDS.OTHER
}

/** What a single shell line runs, as one kind. PURE — the segments are judged
 *  by `command-classify-core`, so quotes, wrappers and `$(…)` cannot hide a
 *  suite launch and a `grep "npm test"` is not mistaken for one. */
export function shellKind(command) {
  const cmd = typeof command === 'string' ? command.trim() : ''
  if (!cmd) return CALL_KINDS.BASH
  const found = new Set()
  for (const seg of expandSegments(cmd)) {
    if (segmentInvokesScript(seg, SUITE_SCRIPTS)) found.add(CALL_KINDS.BROWSER_SUITE)
    if (segmentInvokesPathWhere(seg, (p) => VERIFY_PREFIX.test(p))) found.add(CALL_KINDS.BROWSER_SUITE)
    if (segmentInvokesScript(seg, ASK_SCRIPTS)) found.add(CALL_KINDS.DELEGATED_ASK)
    const { head, args } = headAndArgs(seg)
    if (head === 'npm' || head === 'pnpm' || head === 'yarn') {
      const words = (args ?? []).map((a) => String(a?.text ?? a)).filter((w) => !w.startsWith('-'))
      // `npm run test:small` and `npm test:small` both name the script in the
      // words after the head; `run` is not itself a script name.
      for (const w of words) {
        if (NPM_SUITE_ARGS.has(w)) found.add(CALL_KINDS.BROWSER_SUITE)
        if (NPM_GATE_ARGS.has(w)) found.add(CALL_KINDS.FAST_GATE)
      }
    }
  }
  return found.size ? dominantKind([...found]) : CALL_KINDS.BASH
}

/** The kind of ONE tool call. PURE. */
export function callKind({ name = '', input = null } = {}) {
  const tool = String(name ?? '').trim()
  if (AGENT_TOOLS.has(tool)) return CALL_KINDS.AGENT
  if (WRITE_TOOLS.has(tool)) return CALL_KINDS.WRITE
  if (SEARCH_TOOLS.has(tool)) return CALL_KINDS.SEARCH
  if (WEB_TOOLS.has(tool)) return CALL_KINDS.WEB
  if (READ_TOOLS.has(tool)) return CALL_KINDS.READ
  if (tool === 'Bash' || tool === 'BashOutput') return shellKind(input?.command)
  return tool ? CALL_KINDS.OTHER : CALL_KINDS.TURN
}

/**
 * THE INPUT SIZE of a call, in characters of material — every string the tool
 * input carries (the shell line, the agent's prompt, the material handed to a
 * delegated ask). JSON punctuation is deliberately not counted: the reading is
 * "how much did I hand in", not "how big was the envelope".
 */
export function callInputChars(input, depth = 0) {
  if (depth > 6 || input == null) return 0
  if (typeof input === 'string') return input.length
  if (typeof input === 'number' || typeof input === 'boolean') return String(input).length
  if (Array.isArray(input)) return input.reduce((sum, v) => sum + callInputChars(v, depth + 1), 0)
  if (typeof input === 'object') {
    let sum = 0
    for (const v of Object.values(input)) sum += callInputChars(v, depth + 1)
    return sum
  }
  return 0
}

const tokensOfUsage = (usage) => {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
  return n(usage.input_tokens) + n(usage.cache_read_input_tokens) + n(usage.cache_creation_input_tokens)
}

const contentBlocks = (entry) => {
  const content = entry?.message?.content
  return Array.isArray(content) ? content : []
}

/**
 * EVERY API CALL OF THE SESSION, in order, from a transcript (JSONL text). PURE.
 *
 * One entry per api call — a streamed response split across several transcript
 * lines shares its `requestId`, so its usage is counted ONCE and the tool_use
 * blocks of all its lines belong to that one call. Sidechain lines are skipped
 * for the same reason `parseContextTokens` skips them: a subagent's usage
 * describes the subagent's context, not this session's. A torn or non-JSON line
 * proves nothing and is skipped.
 *
 * Returns [{ id, at, tokens, tools: [{ name, kind, chars }] }].
 */
export function extractCalls(text) {
  const byRequest = new Map()
  const order = []
  for (const line of String(text ?? '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let entry
    try {
      entry = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (!entry || typeof entry !== 'object') continue
    if (entry.isSidechain === true) continue
    const usage = entry.message?.usage ?? entry.usage
    if (!usage || typeof usage !== 'object') continue
    const tokens = tokensOfUsage(usage)
    if (tokens <= 0) continue
    const id = String(entry.requestId ?? entry.message?.id ?? entry.uuid ?? `#${order.length}`)
    const at = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : NaN
    let call = byRequest.get(id)
    if (!call) {
      call = { id, at: Number.isFinite(at) ? at : null, tokens, tools: [] }
      byRequest.set(id, call)
      order.push(call)
    }
    for (const block of contentBlocks(entry)) {
      if (block?.type !== 'tool_use') continue
      call.tools.push({
        name: String(block.name ?? ''),
        kind: callKind({ name: block.name, input: block.input }),
        chars: callInputChars(block.input),
      })
    }
  }
  return order
}

/**
 * THE PER-TURN GROWTH, step by step. PURE.
 *
 * The step from call n-1 to call n is CHARGED TO WHAT CALL n-1 STARTED: its
 * tool calls are what the next call has to carry. That is the whole point of
 * Sol's audit finding — a call that starts BELOW the mark and whose response
 * crosses it appears in no "calls past the mark" list, so every step records
 * `fromTokens` and stays visible wherever it began.
 *
 * A negative step is kept as measured (a context compaction is real), never
 * clipped to zero.
 */
export function growthSteps(calls = []) {
  const out = []
  const list = Array.isArray(calls) ? calls : []
  for (let i = 1; i < list.length; i += 1) {
    const prev = list[i - 1]
    const cur = list[i]
    const kinds = [...new Set((prev.tools ?? []).map((t) => t.kind))]
    out.push({
      index: i,
      at: cur.at ?? prev.at ?? null,
      fromTokens: prev.tokens,
      toTokens: cur.tokens,
      delta: cur.tokens - prev.tokens,
      kind: dominantKind(kinds),
      kinds: kinds.length ? kinds : [CALL_KINDS.TURN],
      inputChars: (prev.tools ?? []).reduce((sum, t) => sum + (t.chars ?? 0), 0),
      tools: (prev.tools ?? []).map((t) => t.name),
    })
  }
  return out
}

/** The single largest step, or null. Ties keep the FIRST — the earlier one is
 *  the one whose beginning is furthest from the mark. */
export function maxGrowthStep(steps = []) {
  let best = null
  for (const step of steps ?? []) if (!best || step.delta > best.delta) best = step
  return best
}

/** Linear-interpolated quantile of `values` (unsorted, any order). Null when
 *  there is nothing to read. */
export function quantileOf(values = [], q = UPPER_QUANTILE) {
  const list = (values ?? []).filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b)
  if (!list.length) return null
  const p = Math.min(Math.max(Number(q), 0), 1)
  const pos = (list.length - 1) * p
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return list[lo]
  return Math.round(list[lo] + (list[hi] - list[lo]) * (pos - lo))
}

/** Keep at most `max` samples, evenly strided. Dropping the largest or the
 *  smallest would bend the quantile; a stride keeps the shape. */
export function strideSample(list = [], max = MAX_KIND_SAMPLES) {
  const all = Array.isArray(list) ? list : []
  if (all.length <= max) return { samples: all, sampled: false }
  const step = all.length / max
  const out = []
  for (let i = 0; i < max; i += 1) out.push(all[Math.floor(i * step)])
  return { samples: out, sampled: true }
}

/**
 * THE GROWTH PER KIND OF CALL, with its input size. PURE.
 *
 * Each kind carries its raw [delta, inputChars] samples so the SERIES-level
 * quantile can be recomputed across incidents later — an aggregate alone cannot
 * be merged. Sorted by the upper quantile, descending: the most expensive kind
 * first.
 */
export function byKindSummary(steps = [], { quantile = UPPER_QUANTILE, maxSamples = MAX_KIND_SAMPLES } = {}) {
  const groups = new Map()
  for (const step of steps ?? []) {
    const kind = step.kind ?? CALL_KINDS.TURN
    if (!groups.has(kind)) groups.set(kind, [])
    groups.get(kind).push([step.delta, step.inputChars ?? 0])
  }
  const out = []
  for (const [kind, pairs] of groups) {
    const { samples, sampled } = strideSample(pairs, maxSamples)
    const deltas = pairs.map((p) => p[0])
    const chars = pairs.map((p) => p[1])
    out.push({
      kind,
      calls: pairs.length,
      quantile,
      p: quantileOf(deltas, quantile),
      max: Math.max(...deltas),
      min: Math.min(...deltas),
      medianInputChars: quantileOf(chars, 0.5),
      maxInputChars: Math.max(...chars),
      samples,
      sampled,
    })
  }
  return out.sort((a, b) => (b.p ?? 0) - (a.p ?? 0) || b.max - a.max)
}

/** The FIRST complete api usage event of the session — the MEASURED startup
 *  cost, never an estimate from the preamble's character count. Null when the
 *  transcript carries no usage record at all. */
export function startupReading(calls = []) {
  const first = (calls ?? [])[0]
  return first ? { tokens: first.tokens, at: first.at ?? null } : null
}

/** How far past `ceiling` a reading stands, and whether that exceeds the stated
 *  margin. `over` is null when there is no usable reading — an unmeasured
 *  distance must never read as a small one. */
export function overshootOf({ tokens, ceiling, margin } = {}) {
  const usable = typeof tokens === 'number' && Number.isFinite(tokens) && tokens > 0
  if (!usable) return { over: null, beyondMargin: false }
  const over = tokens - Number(ceiling)
  return { over, beyondMargin: over > Number(margin) }
}

/**
 * DOES THIS BOUNDARY OWE A RECORD? The same condition the printed distance note
 * uses (`contextDistanceNote`): a measured reading further past the ceiling than
 * the stated margin. No reading → no record: an incident is a MEASUREMENT, and
 * the missing-reading case is what the boundary's own note already says loudly.
 */
export function shouldRecordIncident({ tokens, ceiling, margin } = {}) {
  return overshootOf({ tokens, ceiling, margin }).beyondMargin
}

/**
 * THE INCIDENT RECORD. PURE — every input is handed in, nothing is read here.
 *
 * `watermark` is the mark the overshoot is measured against (the cost CEILING at
 * a boundary); `trigger` is the admission mark a growth step is judged against,
 * so a step that BEGAN below it is visible as such.
 */
export function buildIncident({
  kind = INCIDENT_KINDS.OVERSHOOT,
  at = Date.now(),
  sessionId = null,
  point = null,
  cause = null,
  head = null,
  tokens = null,
  watermark = null,
  margin = null,
  trigger = null,
  calls = [],
  note = '',
  quantile = UPPER_QUANTILE,
} = {}) {
  const steps = growthSteps(calls)
  const max = maxGrowthStep(steps)
  const startup = startupReading(calls)
  const { over } = overshootOf({ tokens, ceiling: watermark, margin })
  const belowTrigger = (from) =>
    typeof trigger === 'number' && Number.isFinite(trigger) ? from < trigger : null
  const stepRecord = (step) => ({
    at: step.at,
    fromTokens: step.fromTokens,
    toTokens: step.toTokens,
    delta: step.delta,
    kind: step.kind,
    kinds: step.kinds,
    inputChars: step.inputChars,
    tools: step.tools,
    // Sol's audit finding, recorded per step: the growth that CROSSED the mark
    // began below it, and a "calls past the mark" list would never show it.
    beganBelowTrigger: belowTrigger(step.fromTokens),
  })
  return {
    v: INCIDENT_VERSION,
    kind,
    at: new Date(at).toISOString(),
    atMs: at,
    sessionId: sessionId ? String(sessionId) : null,
    point: Number.isInteger(point) ? point : null,
    cause: cause ? String(cause) : null,
    head: head ? String(head) : null,
    tokens,
    watermark,
    margin,
    overshoot: over,
    trigger,
    // MEASURED at the first complete api usage event, not estimated (point 747
    // wants exactly this reading for the recalibration).
    startupTokens: startup ? startup.tokens : null,
    calls: (calls ?? []).length,
    growth: {
      steps: steps.length,
      totalTokens: steps.reduce((sum, s) => sum + s.delta, 0),
      quantile,
      p: quantileOf(steps.map((s) => s.delta), quantile),
      max: max ? stepRecord(max) : null,
      top: [...steps]
        .sort((a, b) => b.delta - a.delta)
        .slice(0, TOP_STEPS)
        .map(stepRecord),
    },
    byKind: byKindSummary(steps, { quantile }),
    note: note ? String(note) : '',
    residual: 'under-counts: a session that dies without taking a boundary writes no record',
  }
}

/** Is this a record a reader may count? Kept liberal on everything but the two
 *  fields every reading needs, so a future writer can add fields freely. */
export function usableIncident(rec) {
  return Boolean(
    rec &&
      typeof rec === 'object' &&
      typeof rec.atMs === 'number' &&
      Number.isFinite(rec.atMs) &&
      typeof rec.tokens === 'number' &&
      Number.isFinite(rec.tokens),
  )
}

/** Parse a JSONL series. A corrupt line is COUNTED, never fatal — the series
 *  outlives the code that writes it, and one bad line must not blind a reading. */
export function parseIncidents(text) {
  const records = []
  let malformed = 0
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue
    let rec
    try {
      rec = JSON.parse(line)
    } catch {
      malformed += 1
      continue
    }
    if (usableIncident(rec)) records.push(rec)
    else malformed += 1
  }
  records.sort((a, b) => a.atMs - b.atMs)
  return { records, malformed }
}

/** The records at or after `sinceMs`, optionally of one kind only. */
export function filterSeries(records = [], { sinceMs = null, kind = null } = {}) {
  return (records ?? []).filter(
    (r) => (sinceMs == null || r.atMs >= sinceMs) && (kind == null || r.kind === kind),
  )
}

/**
 * THE READING the deferred decision needs: how many overshoots, how big they
 * were, what each session was doing, and what the growth cost PER KIND across
 * the whole series. PURE.
 */
export function summarizeSeries(records = [], { quantile = UPPER_QUANTILE, sinceMs = null, sinceLabel = '' } = {}) {
  const list = filterSeries(records, { sinceMs })
  const counts = {}
  for (const r of list) counts[r.kind ?? 'unknown'] = (counts[r.kind ?? 'unknown'] ?? 0) + 1
  const overshoots = list.map((r) => r.overshoot).filter((v) => typeof v === 'number' && Number.isFinite(v))
  const kindSamples = new Map()
  for (const r of list) {
    for (const k of r.byKind ?? []) {
      if (!kindSamples.has(k.kind)) kindSamples.set(k.kind, { deltas: [], chars: [], calls: 0, sampled: false })
      const bucket = kindSamples.get(k.kind)
      bucket.calls += Number(k.calls ?? 0)
      bucket.sampled = bucket.sampled || k.sampled === true
      for (const [delta, chars] of k.samples ?? []) {
        bucket.deltas.push(delta)
        bucket.chars.push(chars)
      }
    }
  }
  const byKind = [...kindSamples.entries()]
    .map(([kind, b]) => ({
      kind,
      calls: b.calls,
      p: quantileOf(b.deltas, quantile),
      max: b.deltas.length ? Math.max(...b.deltas) : null,
      medianInputChars: quantileOf(b.chars, 0.5),
      maxInputChars: b.chars.length ? Math.max(...b.chars) : null,
      sampled: b.sampled,
    }))
    .sort((a, b) => (b.p ?? 0) - (a.p ?? 0))
  return {
    count: list.length,
    counts,
    sinceLabel: sinceLabel || null,
    sinceMs,
    quantile,
    first: list.length ? list[0].at : null,
    last: list.length ? list[list.length - 1].at : null,
    overshoot: {
      min: overshoots.length ? Math.min(...overshoots) : null,
      median: quantileOf(overshoots, 0.5),
      p: quantileOf(overshoots, quantile),
      max: overshoots.length ? Math.max(...overshoots) : null,
    },
    incidents: list.map((r) => ({
      at: r.at,
      kind: r.kind ?? null,
      sessionId: r.sessionId ?? null,
      point: r.point ?? null,
      cause: r.cause ?? null,
      head: r.head ?? null,
      tokens: r.tokens,
      watermark: r.watermark ?? null,
      overshoot: r.overshoot ?? null,
      startupTokens: r.startupTokens ?? null,
      calls: r.calls ?? null,
      maxStep: r.growth?.max
        ? {
            delta: r.growth.max.delta,
            kind: r.growth.max.kind,
            fromTokens: r.growth.max.fromTokens,
            beganBelowTrigger: r.growth.max.beganBelowTrigger ?? null,
            inputChars: r.growth.max.inputChars ?? null,
          }
        : null,
      note: r.note ?? '',
    })),
    byKind,
  }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '—')

/** The printed reading. PURE, so its wording is pinned by tests rather than
 *  improvised at the one moment somebody needs it. */
export function formatSeriesReport(summary, { malformed = 0, sources = [] } = {}) {
  const q = Math.round((summary?.quantile ?? UPPER_QUANTILE) * 100)
  const lines = []
  lines.push(
    `CONTEXT OVERSHOOT SERIES — ${summary.count} record(s)` +
      (summary.sinceLabel ? ` since ${summary.sinceLabel}` : ' (whole series)'),
  )
  if (sources.length) lines.push(`  read from: ${sources.join(', ')}`)
  if (malformed) lines.push(`  WARNING: ${malformed} unreadable line(s) skipped — the count is a LOWER bound`)
  const kinds = Object.entries(summary.counts ?? {})
  if (kinds.length) lines.push(`  by record kind: ${kinds.map(([k, n]) => `${k} ${n}`).join(', ')}`)
  if (!summary.count) {
    lines.push('  NO RECORDS. Either no boundary overshot the margin in that span, or a session died without')
    lines.push('  taking a boundary — the series UNDER-counts by construction and never over-counts.')
    return lines.join('\n')
  }
  lines.push(`  span: ${summary.first} … ${summary.last}`)
  lines.push(
    `  overshoot past the ceiling: min ${num(summary.overshoot.min)}, median ${num(summary.overshoot.median)}, ` +
      `p${q} ${num(summary.overshoot.p)}, max ${num(summary.overshoot.max)} tokens`,
  )
  lines.push('  PER INCIDENT (what the session was doing):')
  for (const inc of summary.incidents) {
    const step = inc.maxStep
    lines.push(
      `    ${inc.at}  ${inc.kind ?? '?'}  ${num(inc.tokens)} tokens` +
        (inc.watermark != null ? ` vs ${num(inc.watermark)}` : '') +
        (inc.overshoot != null ? ` (over by ${num(inc.overshoot)})` : '') +
        `  point ${inc.point ?? '—'}  cause ${inc.cause ?? '—'}`,
    )
    lines.push(
      `      session ${inc.sessionId ?? '—'}  head ${inc.head ?? '—'}  startup ${num(inc.startupTokens)}  ` +
        `calls ${num(inc.calls)}`,
    )
    if (step) {
      lines.push(
        `      largest growth step: +${num(step.delta)} by ${step.kind} from ${num(step.fromTokens)} tokens` +
          (step.beganBelowTrigger === true ? ' — BEGAN BELOW THE TRIGGER' : '') +
          (step.inputChars != null ? `, ${num(step.inputChars)} chars in` : ''),
      )
    }
    if (inc.note) lines.push(`      note: ${inc.note}`)
  }
  if (summary.byKind.length) {
    lines.push(`  GROWTH PER KIND OF CALL (p${q} of the per-step growth, with the material handed in):`)
    for (const k of summary.byKind) {
      lines.push(
        `    ${k.kind.padEnd(14)} calls ${String(k.calls).padStart(5)}  p${q} ${String(num(k.p)).padStart(7)}  ` +
          `max ${String(num(k.max)).padStart(7)}  median in ${num(k.medianInputChars)} chars` +
          (k.sampled ? '  (subsampled)' : ''),
      )
    }
  }
  lines.push(
    '  RESIDUAL, with its direction: a session that dies without taking a boundary writes no record, so this',
  )
  lines.push('  series UNDER-counts and never over-counts. Nothing here is filed or ranked automatically.')
  return lines.join('\n')
}
