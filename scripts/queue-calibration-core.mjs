// WHAT A QUEUE CARD PROMISES, MEASURED AGAINST WHAT THE WORK TOOK (point 730).
//
// The board's Warteschlange carries an estimate on every card, and
// `dashboard-guard-core.mjs` defines it as the time by which the work is VISIBLY
// DONE — merged, verified, board updated. That makes it a falsifiable promise to
// the reader. None of the stored estimates was ever derived from a measurement,
// and on 19.08.2026 the reader said so: the batch had got markedly faster and the
// queue still promised the old pace.
//
// THIS MODULE IS THE MEASUREMENT, and only the arithmetic of it — every git and
// file read lives in `queue-calibration.mjs`, so each rule below is testable
// against a recorded fixture instead of against a repository.
//
// TWO NUMBERS, NEVER ONE. A point's ELAPSED time (its first commit to its
// LANDING) and the queue's CADENCE (landing to landing) answer different
// questions, and the pool runs three points at once, so the cadence is the
// smaller of the two whenever it does. Averaging them would produce a figure
// that is true of neither. They are computed apart and reported apart.
//
// BOTH ENDPOINTS ARE TICKS. A point's elapsed span ends at its own work-order
// TICK, and cadence runs from one work-order TICK to the next. The estimate is
// the time by which the work is VISIBLY DONE — merge, gate, picture check and
// board update all happen before that tick reaches the reader. Ending at the
// merge would calibrate the promise against a moment the reader never sees.
//
// A DISTRIBUTION, NEVER A MEAN. The elapsed times are heavy-tailed — a branch cut
// early and merged days later sits in the same sample as one built and landed in
// forty minutes — so a mean is dominated by the tail. Every reading here is a
// five-number summary, and every correction factor is a MEDIAN of ratios.
//
// THE CLASSES DECIDE WHETHER ONE FACTOR IS HONEST. The reading is split three
// ways — the point's criticality tag, an established delegated lane or an
// unestablished lane, and an established picture verification or an
// unestablished picture class. Missing-information classes are residuals, never
// negative evidence. A single global factor is adopted ONLY if every eligible
// axis agrees; otherwise the rewrite falls back to criticality, the one axis a
// queued card already establishes.

/**
 * Where the measured defaults live — beside the board data they serve, and
 * git-ignored like it. The constant sits in the PURE core because the command
 * itself measures at import time: a consumer that only wants the path must not
 * have to run the tool to learn it.
 */
export const CALIBRATION_PATH = '.claude/queue-calibration.json'

/** How many landed comparables a class needs before its factor is trusted. */
export const MIN_CLASS_SAMPLES = 5

/**
 * The basis name for a correction taken from MEASURED ELAPSED TIME rather than
 * from estimate-versus-actual ratios. Named apart because the two rest on
 * different evidence, and a reader must be able to tell which one moved a card.
 */
export const ELAPSED_BIAS_BASIS = 'measured-elapsed'

/** Beyond this spread between an axis's class factors, one global factor lies. */
export const GLOBAL_FACTOR_TOLERANCE = 1.5

/** No card ever promises less than this, however small the measured factor. */
export const ESTIMATE_FLOOR_HOURS = 0.5

/** The board writes half-hour steps; a card reading "~0,73 h" helps nobody. */
export const ESTIMATE_STEP_HOURS = 0.5

/** The criticality labels the work order actually uses, lowest first. */
export const CRITICALITY_LEVELS = Object.freeze(['low', 'medium', 'high'])

/** The label a point with no `Criticality:` line carries — a class, not a gap. */
export const UNTAGGED = 'untagged'

/** The axes the reading is split by, in report order. */
export const AXES = Object.freeze(['criticality', 'lane', 'picture'])

/** Missing-information classes can never become comparisons by adding members. */
export const UNKNOWABLE_CLASSES = new Set(['lane-unestablished', 'picture-unestablished'])

const asNumber = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Parse the calibration command without letting an option consume another one. */
export function parseCalibrationArgs(argv, { now = Date.now() } = {}) {
  const args = (Array.isArray(argv) ? argv : []).map(String)
  const out = { apply: false, since: '14d', sinceSeconds: null, limit: 0, stateDir: null }
  const seen = new Set()
  const valueAfter = (i, name) => {
    const value = args[i + 1]
    if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`)
    return value
  }
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (seen.has(arg)) throw new Error(`${arg} was given more than once`)
    if (arg === '--apply') {
      seen.add(arg)
      out.apply = true
      continue
    }
    if (arg === '--since') {
      seen.add(arg)
      out.since = valueAfter(i, arg)
      i += 1
      continue
    }
    if (arg === '--limit') {
      seen.add(arg)
      const value = valueAfter(i, arg)
      if (!/^\d+$/.test(value) || Number(value) <= 0) throw new Error('--limit must be a positive integer')
      out.limit = Number(value)
      i += 1
      continue
    }
    if (arg === '--state-dir') {
      seen.add(arg)
      out.stateDir = valueAfter(i, arg)
      i += 1
      continue
    }
    throw new Error(`unrecognised argument "${arg}"`)
  }
  if (out.since === 'all') return out
  const relative = /^(\d+(?:\.\d+)?)([dh])$/.exec(out.since)
  if (relative) {
    const seconds = Number(relative[1]) * (relative[2] === 'd' ? 86400 : 3600)
    out.sinceSeconds = Math.floor(now / 1000 - seconds)
    return out
  }
  const parsed = Date.parse(out.since)
  if (!Number.isFinite(parsed)) throw new Error(`--since value "${out.since}" is not a duration, date, or "all"`)
  out.sinceSeconds = Math.floor(parsed / 1000)
  return out
}

/**
 * Hours out of a stored estimate: `~1,5 h · Feature` → 1.5.
 *
 * The comma is the German decimal separator the board is written in, and the
 * ` · …` tail is a NOTE, not part of the duration — `formatEstimate` puts it back.
 */
export function parseEstimateHours(estimate) {
  const m = /~\s*(\d+(?:[.,]\d+)?)\s*h/i.exec(String(estimate ?? ''))
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Whatever a card says AFTER its duration, or '' — preserved verbatim.
 *
 * The note is not always a ` · …` clause: cards carry `~4 h (mehrere Sitzungen)`
 * too, and a tail rule that only knew the middot silently deleted it.
 */
export function estimateTail(estimate) {
  const s = String(estimate ?? '')
  const m = /~\s*\d+(?:[.,]\d+)?\s*h\s*(\S.*)$/i.exec(s)
  return m ? ` ${m[1].trim()}` : ''
}

/** Round to the board's half-hour step, never below the floor. */
export function roundHours(hours) {
  const h = asNumber(hours)
  if (h === null) return null
  const stepped = Math.round(h / ESTIMATE_STEP_HOURS) * ESTIMATE_STEP_HOURS
  return Math.max(ESTIMATE_FLOOR_HOURS, Number(stepped.toFixed(2)))
}

/**
 * Render hours the way the board spells them, keeping the old card's note.
 * The separator is a comma because `dashboard-guard-core`'s meta rule and every
 * existing card use one.
 */
export function formatEstimate(hours, previous = '') {
  const h = roundHours(hours)
  if (h === null) return null
  const text = Number.isInteger(h) ? String(h) : String(h).replace('.', ',')
  return `~${text} h${estimateTail(previous)}`
}

/**
 * Every point's criticality label out of a work-order text (open file or archive).
 *
 * `Criticality: raised to HIGH` is a level, not a level called "raised", so the
 * whole line is searched for a known level once the first word is not one. A word
 * the work order invented (`MAXIMUM`, twice) is kept AS ITS OWN LABEL rather than
 * folded into `high`: folding it would be the guess this point exists to remove,
 * and a class with no landed comparable has a defined answer already.
 */
export function parseCriticality(text) {
  const out = new Map()
  let point = null
  for (const line of String(text ?? '').split('\n')) {
    const head = /^- \[[x ]\] (\d+)\./.exec(line)
    if (head) {
      point = Number(head[1])
      continue
    }
    if (/^- \[/.test(line)) {
      point = null
      continue
    }
    const tag = /^\s+Criticality:\s*(.+)$/.exec(line)
    if (!tag || point === null || out.has(point)) continue
    const words = tag[1].toLowerCase().match(/[a-z]+/g) ?? []
    const level = words.find((w) => CRITICALITY_LEVELS.includes(w)) ?? words[0] ?? null
    if (level) out.set(point, level)
  }
  return out
}

/**
 * The `[ ]→[x]` events out of a `git log -p` over the two work-order files.
 *
 * THE TICK IS THE LANDING, not the merge (point 730). Most merges name their
 * branch — `Merge branch 'feat/701-…'` — but 208 of 283 first-parent merges on
 * this repository carry a written subject instead, and a point done in the main
 * session has no merge at all. The tick is the one event every landed point has.
 *
 * `log` is newest-first, so the LAST occurrence of a point is its FIRST tick —
 * the one that counts, since a point re-ticked after a revert landed twice.
 */
export function parseTickEvents(log, { mark = '@@COMMIT@@' } = {}) {
  const first = new Map()
  let commit = null
  for (const line of String(log ?? '').split('\n')) {
    if (line.startsWith(mark)) {
      const [sha, at] = line.slice(mark.length).trim().split(/\s+/)
      commit = { sha, at: Number(at) }
      continue
    }
    const m = /^\+- \[x\] (\d+)\./.exec(line)
    if (m && commit && Number.isFinite(commit.at)) first.set(Number(m[1]), { point: Number(m[1]), ...commit })
  }
  return [...first.values()].sort((a, b) => a.at - b.at)
}

/** The point number a `Merge branch 'feat/<N>-…'` subject names, or null. */
export function mergedBranchPoint(subject) {
  const m = /^Merge branch '(?:origin\/)?feat\/(\d+)-/.exec(String(subject ?? ''))
  return m ? Number(m[1]) : null
}

/** How far back from a tick a landing's merge may sit, in first-parent commits. */
export const MERGE_LOOKBACK = 3

/**
 * …and how long before the tick it may sit, in hours.
 *
 * MEASURED, not guessed: over the 73 landings whose merge NAMES its branch, the
 * gap from merge to tick runs 0.03 h (median) to 1.55 h (max), p99 0.34 h —
 * `land-point.mjs` merges, gates and ticks in one command. Three hours is twice
 * the widest one ever recorded, so it excludes nothing real while it cuts the
 * case this bound exists for: a main-session tick that happens to follow
 * somebody else's merge from hours or days earlier.
 */
export const MERGE_MAX_LAG_HOURS = 3

/**
 * `main`'s first-parent chain out of `git log --pretty=%H %ct %p<TAB>%s`,
 * newest first — sha, time, parent count and subject, nothing else.
 */
export function parseFirstParentChain(log) {
  const out = []
  for (const line of String(log ?? '').split('\n')) {
    if (!line.trim()) continue
    const [head, subject = ''] = line.split('\t')
    const parts = head.trim().split(/\s+/)
    if (parts.length < 2) continue
    out.push({ sha: parts[0], at: Number(parts[1]), parents: parts.slice(2), subject })
  }
  return out
}

/**
 * WHICH MERGE BUILT WHICH POINT — the two attributions, strongest first.
 *
 * A merge that NAMES its branch (`Merge branch 'feat/701-…'`) says so itself, and
 * that is taken as given. But 208 of this repository's 283 first-parent merges
 * carry a WRITTEN subject instead, and every point landed through one of them
 * would otherwise have no measurable span at all — which is how the untagged
 * class came out empty while a hundred untagged points had landed.
 *
 * The second attribution uses the landing SEQUENCE `land-point.mjs` enforces:
 * merge, gate, then the tick commit. So the merge within `MERGE_LOOKBACK`
 * first-parent commits AND `MERGE_MAX_LAG_HOURS` before a tick is that point's
 * merge. It is a heuristic, so it is fenced on three sides, because a point done
 * in the MAIN SESSION has no merge at all and must not inherit somebody else's:
 *
 *   1. EVERY named merge is claimed FIRST, in a pass of its own. Before, a merge
 *      was claimed only when its own point's tick came up, so a main-session tick
 *      that happened to be processed earlier could take it.
 *   2. A merge whose subject names ANOTHER point's branch is never taken, even
 *      unclaimed — it says whose it is.
 *   3. The merge must sit BEFORE the tick and no further back than the measured
 *      lag bound above. A tick hours or days after the last merge gets none.
 *
 * A merge is claimed by ONE point only, so a second tick behind the same merge is
 * left unmeasured rather than counted twice — without fence 1 that held for the
 * guessed merges but not for the named ones, and one merge on this repository was
 * in fact attributed to two points.
 *
 * CROSS-VALIDATED by blinding each self-naming merge in turn and asking the rule
 * to find it: 67 of 73 recovered exactly, 4 left unattributed, 2 wrong. Without
 * the three fences the same check reads 68 / 2 / 3 — the fences trade one
 * recovery for one fewer WRONG attribution, which is the trade this measurement
 * wants: a wrong merge invents a lane and a duration, an abstention only leaves
 * one point unmeasured.
 */
export function attributeMerges(chain, ticks, { lookback = MERGE_LOOKBACK, maxLagHours = MERGE_MAX_LAG_HOURS } = {}) {
  const rows = Array.isArray(chain) ? chain : []
  const index = new Map(rows.map((c, i) => [c.sha, i]))
  const owner = new Map()
  for (const c of rows) {
    const point = mergedBranchPoint(c.subject)
    if (point === null) continue
    owner.set(c.sha, point)
  }
  const claimed = new Set()
  const out = new Map()
  const events = [...(Array.isArray(ticks) ? ticks : [])].sort((a, b) => a.at - b.at)
  // PASS 1 — every merge that names its own branch, before any guess is made.
  for (const tick of events) {
    // `rows` is newest-first: this is the newest matching merge on or BEFORE
    // the first tick. A later rework merge cannot build an earlier landing.
    const byName = rows.find(
      (c) => owner.get(c.sha) === tick.point && c.at <= tick.at && !claimed.has(c.sha),
    )
    if (!byName || claimed.has(byName.sha)) continue
    claimed.add(byName.sha)
    out.set(tick.point, { merge: byName, attribution: 'named' })
  }
  // PASS 2 — the landing sequence, for the ticks that pass 1 left over.
  const maxLag = Math.max(0, Number(maxLagHours) || 0) * 3600
  for (const tick of events) {
    if (out.has(tick.point)) continue
    const start = index.get(tick.sha)
    if (start === undefined) continue
    // The chain is newest-first, so walking towards OLDER means walking forward.
    for (let i = start; i < rows.length && i < start + 1 + lookback; i++) {
      const c = rows[i]
      if (c.parents.length < 2 || claimed.has(c.sha)) continue
      const belongsTo = owner.get(c.sha)
      if (belongsTo !== undefined && belongsTo !== tick.point) continue
      if (!(c.at <= tick.at)) continue
      // Older still means further away, so nothing behind this one can qualify.
      if (tick.at - c.at > maxLag) break
      claimed.add(c.sha)
      out.set(tick.point, { merge: c, attribution: 'inferred' })
      break
    }
  }
  return out
}

/** The five-number summary the reading reports instead of an average. */
export function summarise(values) {
  const xs = (Array.isArray(values) ? values : []).map(asNumber).filter((v) => v !== null).sort((a, b) => a - b)
  if (!xs.length) return { n: 0, min: null, p25: null, median: null, p75: null, max: null }
  const at = (p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]
  const mid = xs.length >> 1
  return {
    n: xs.length,
    min: xs[0],
    p25: at(0.25),
    median: xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2,
    p75: at(0.75),
    max: xs[xs.length - 1],
  }
}

/**
 * WHY a landing has, or has not, a measurable span. These describe individual
 * rows only; they never make a criticality class permanently unmeasurable.
 * Future delegated landings can always add measured spans to that class.
 */
export const SPAN_MEASURED = 'branch-to-landing'
export const SPAN_NO_BRANCH = 'no-branch'
export const SPAN_UNKNOWN = 'unknown'

/** A landing's span basis — inferred for a row that does not carry one. */
export function spanBasisOf(landing) {
  const stated = landing?.spanBasis
  if (stated === SPAN_MEASURED || stated === SPAN_NO_BRANCH || stated === SPAN_UNKNOWN) return stated
  return asNumber(landing?.elapsedHours) !== null ? SPAN_MEASURED : SPAN_UNKNOWN
}

/**
 * Which class a landing falls into on each axis.
 *
 * Absence of a named merge does not establish main-session work, and absence of
 * retained render state does not establish "no picture". Both become explicit
 * missing-information classes instead of proxy-derived answers.
 */
export function classesOf(landing) {
  const lane = landing?.lane ?? laneForAttribution(landing?.attribution ?? (landing?.delegated === true ? 'named' : null))
  const picture = landing?.pictureClass ?? (landing?.picture === true ? 'picture-verified' : 'picture-unestablished')
  return {
    criticality: landing?.criticality ?? UNTAGGED,
    lane,
    picture,
  }
}

/** Only a self-naming merge establishes delegation; inference establishes a span only. */
export function laneForAttribution(attribution) {
  return attribution === 'named' ? 'delegated' : 'lane-unestablished'
}

/** Points whose still-retained branch record establishes a picture verification. */
export function pictureVerifiedPoints(clearedHeads) {
  const out = new Set()
  const heads = clearedHeads && typeof clearedHeads === 'object' && !Array.isArray(clearedHeads) ? clearedHeads : {}
  for (const branch of Object.keys(heads)) {
    const m = /^(?:origin\/)?feat\/(\d+)-/.exec(branch)
    if (m) out.add(Number(m[1]))
  }
  return out
}

/**
 * Elapsed hours from a branch's first commit to the work-order TICK.
 *
 * The merge time is deliberately not an input. The gate, picture check and
 * board update sit after it, and the reader sees completion only at the tick.
 */
export function elapsedHoursToTick(firstCommitAt, tickAt) {
  const first = asNumber(firstCommitAt)
  const tick = asNumber(tickAt)
  return first !== null && tick !== null && tick >= first ? (tick - first) / 3600 : null
}

/**
 * One axis's classes, each with its elapsed and ratio distributions.
 *
 * A landing with no MEASURABLE elapsed time still counts towards the class's
 * size. Reporting only rated members would hide the evidence gaps themselves.
 *
 * Only a class whose NAME records missing information is unknowable. Every
 * criticality class and every established process class is pending when thin:
 * more measured landings can settle it.
 */
export function classSummaries(landings, axis) {
  const groups = new Map()
  for (const l of Array.isArray(landings) ? landings : []) {
    const key = classesOf(l)[axis]
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(l)
  }
  const out = []
  for (const [name, members] of groups) {
    const unknowable = UNKNOWABLE_CLASSES.has(name)
    const elapsed = summarise(members.map((m) => m.elapsedHours))
    // THE NUMERATOR MUST SPEAK FOR THE SAME POPULATION AS THE DENOMINATOR.
    // A render card is held out of the correction, so a render LANDING may not
    // sit inside the median that corrects everything else: pooling six 1-hour
    // process landings with six 3-hour render ones yields a 2-hour centre that
    // belongs to neither.
    //
    // WHICH LANDINGS THOSE ARE IS READ FROM THE SPEC, exactly as it is for a
    // queued card. The verification store is capped and pruned, so a landing
    // that DID owe a rendered proof can arrive here with no surviving
    // attestation and would otherwise slip back into the numerator the
    // denominator excludes it from. Both signals are used: the spec says what
    // was owed, the attestation says what was proven, and either one holds the
    // landing out.
    const correctableRows = members.filter((m) => !owesRenderedProof(m))
    const correctable = summarise(correctableRows.map((m) => m.elapsedHours))
    const rated = members.filter((m) => asNumber(m.elapsedHours) !== null && asNumber(m.estimateHours))
    // TWO POPULATIONS, TWO PURPOSES, KEPT APART.
    //
    // `ratio` covers the WHOLE class and answers the question the axes ask: do
    // these classes differ? Blinding it to render work would make the picture
    // axis permanently unmeasurable and silently mute the global-factor test.
    //
    // `correctableRatio` covers only what a correction may be measured on. It is
    // the one a card's factor comes from, so render work can reach a card by
    // neither route — not through the elapsed median and not through the ratio.
    const correctableRated = correctableRows.filter(
      (m) => asNumber(m.elapsedHours) !== null && asNumber(m.estimateHours),
    )
    out.push({
      axis,
      name,
      points: members.length,
      elapsed,
      correctable,
      ratio: summarise(rated.map((m) => m.elapsedHours / m.estimateHours)),
      correctableRatio: summarise(correctableRated.map((m) => m.elapsedHours / m.estimateHours)),
      comparable: !unknowable && rated.length >= MIN_CLASS_SAMPLES,
      // The eligibility the DECISION runs on. A global factor is applied to
      // cards and measured on the correctable population, so the question of
      // whether the classes agree enough to adopt one has to be asked of that
      // same population — or adoption could succeed on evidence the factor is
      // never drawn from, and once did, yielding an adopted factor of null.
      correctableComparable: !unknowable && correctableRated.length >= MIN_CLASS_SAMPLES,
      // A class can be measured WITHOUT any landing-time snapshot: the elapsed
      // span is read off git, while the ratio needs a promise recorded while the
      // point was still open. Two separate kinds of evidence — and the second one
      // exists only for landings after this command's first run.
      elapsedComparable: !unknowable && correctable.n >= MIN_CLASS_SAMPLES,
      unknowable,
    })
  }
  return out.sort((a, b) => b.ratio.n - a.ratio.n || String(a.name).localeCompare(String(b.name)))
}

/**
 * How far apart an axis's trustworthy classes sit — max factor over min — plus
 * WHY it could not be measured when it could not.
 *
 * `unknowable` names missing-information buckets; `pending` names establishable
 * classes that merely have too few measured landings so far.
 */
export function axisSpread(summaries) {
  const rows = Array.isArray(summaries) ? summaries : []
  // The picture-verified class is OUTSIDE the correctable population by
  // construction — a render landing is exactly what the correction is never
  // measured on — so no number of further landings can make it comparable. It is
  // missing information for this decision, not a class that is merely thin;
  // calling it "pending" would refuse every global factor for ever and read as
  // if more evidence were on its way.
  const outsideCorrection = (s) => s.name === PICTURE_VERIFIED
  const eligible = (s) => (s.correctableComparable === undefined ? s.comparable : s.correctableComparable)
  const median = (s) => (s.correctableComparable === undefined ? s.ratio?.median : s.correctableRatio?.median)
  const factors = rows.filter(eligible).map(median).filter((f) => asNumber(f) && f > 0)
  const unknowable = rows.filter((s) => !eligible(s) && (s.unknowable || outsideCorrection(s))).map((s) => s.name)
  const pending = rows
    .filter((s) => !eligible(s) && !s.unknowable && !outsideCorrection(s) && (s.points ?? 0) > 0)
    .map((s) => s.name)
  const base = { classes: factors.length, unknowable, pending }
  if (factors.length < 2) return { ...base, spread: null }
  return { ...base, spread: Math.max(...factors) / Math.min(...factors) }
}

/**
 * IS ONE CORRECTION FACTOR HONEST FOR THE WHOLE QUEUE? (point 730's central test.)
 *
 * Only when EVERY axis was actually compared and none separated its classes by
 * more than the tolerance. The moment one does, a single factor would be right
 * for the average point and wrong for every actual one, so it is refused BY NAME
 * and the caller falls back to per-class factors on the axis it can apply.
 *
 * AN AXIS THAT COULD NOT BE COMPARED REFUSES IT TOO. The spec adopts one factor
 * only if the measurement SHOWS the classes do not differ, and an axis with one
 * comparable class shows nothing either way. Treating silence as agreement is how
 * the first run of this command adopted a global factor while the picture axis —
 * under-sampled, and therefore mute — sat at 7.5× against 0.28×.
 *
 * An axis whose only non-comparable classes are missing-information buckets is
 * excluded from the vote and reported as a residual. A PENDING class always
 * refuses adoption, even when two already-comparable neighbours agree: the
 * unseen establishable class may still be radically different.
 */
export function globalFactorDecision(byAxis, { tolerance = GLOBAL_FACTOR_TOLERANCE } = {}) {
  const spreads = AXES.map((axis) => ({ axis, ...axisSpread(byAxis[axis] ?? []) }))
  const undecidable = spreads.filter((s) => s.pending.length === 0 && s.unknowable.length > 0)
  const compared = spreads.filter((s) => asNumber(s.spread) !== null && !undecidable.includes(s))
  const offenders = compared.filter((s) => s.spread > tolerance)
  const pending = spreads.filter((s) => s.pending.length > 0)
  const mute = spreads.filter(
    (s) => asNumber(s.spread) === null && !undecidable.includes(s) && !pending.includes(s),
  )
  // Two different silences, and the reader is owed the difference: a class that
  // GROUPS unestablished information, and a class the correction is never
  // measured on at all. Naming both under one wording said something false
  // about one of them.
  const residual = undecidable.map((u) => {
    const grouping = u.unknowable.filter((n) => n !== PICTURE_VERIFIED)
    const parts = []
    if (grouping.length) parts.push(`${grouping.join(', ')} groups landings whose ${u.axis} is not established`)
    if (u.unknowable.includes(PICTURE_VERIFIED)) {
      parts.push(`${PICTURE_VERIFIED} is outside the population a correction is measured on`)
    }
    return `${u.axis} excluded — ${parts.join('; ')}`
  })
  if (offenders.length || pending.length || mute.length || !compared.length) {
    const said = [
      ...offenders.map((o) => `${o.axis} classes differ by ${o.spread.toFixed(2)}×`),
      ...pending.map((p) => `${p.axis} pending classes lack comparables: ${p.pending.join(', ')}`),
      ...mute.map((m) => `${m.axis} has ${m.classes} comparable class(es), too few to compare`),
      ...(compared.length ? [] : ['no axis was compared at all']),
    ]
    return {
      adopted: false,
      factor: null,
      spreads,
      undecidable: residual,
      reason: `refused — ${[...said, ...residual].join('; ')} (tolerance ${tolerance.toFixed(2)}×)`,
    }
  }
  return {
    adopted: true,
    factor: null,
    spreads,
    undecidable: residual,
    reason:
      `adopted — ${compared.map((s) => s.axis).join(', ')} compared and within ${tolerance.toFixed(2)}×` +
      (residual.length ? `; ${residual.join('; ')}` : ''),
  }
}

/**
 * The whole reading: window, both distributions, the class split, the decision.
 *
 * `cadence` is the gap between consecutive landings and is computed from the
 * landing TIMES alone — it is what the reader waits, not what the work costs, and
 * nothing here ever folds the two together.
 */
export function calibrationReading(landings, { cadenceHours = [], window = null, tolerance } = {}) {
  const rows = Array.isArray(landings) ? landings : []
  const rated = rows.filter((r) => asNumber(r.elapsedHours) !== null && asNumber(r.estimateHours))
  const correctableRated = rated.filter((r) => !owesRenderedProof(r))
  const byAxis = Object.fromEntries(AXES.map((axis) => [axis, classSummaries(rows, axis)]))
  const overall = {
    landings: rows.length,
    elapsed: summarise(rows.map((r) => r.elapsedHours)),
    ratio: summarise(rated.map((r) => r.elapsedHours / r.estimateHours)),
    estimate: summarise(rows.map((r) => r.estimateHours)),
  }
  const decision = globalFactorDecision(byAxis, tolerance === undefined ? {} : { tolerance })
  return {
    window,
    overall,
    cadence: summarise(cadenceHours),
    byAxis,
    // An ADOPTED global factor is applied to cards, so it too is measured on the
    // population a card may be corrected from.
    decision: {
      ...decision,
      factor: decision.adopted ? summarise(correctableRated.map((r) => r.elapsedHours / r.estimateHours)).median : null,
    },
    // The factors a CARD may take, so they rest on the correctable population.
    factors: Object.fromEntries(
      byAxis.criticality
        .filter((c) => !c.unknowable && c.correctableRatio.n >= MIN_CLASS_SAMPLES)
        .map((c) => [c.name, c.correctableRatio.median]),
    ),
  }
}

/**
 * The factor a card gets, and why — the one axis knowable before work starts.
 *
 * Criticality is a property of the SPEC, so an unstarted point already has it.
 * The lane and the picture axes are properties of how the work turned out and
 * cannot be read off a queued card, so they inform the DECISION above and never
 * a card's own number.
 */
export function factorForCard(reading, criticality, { promiseMedian = null } = {}) {
  const label = criticality ?? UNTAGGED
  const ownClass = (reading?.byAxis?.criticality ?? []).find((c) => c.name === label)
  const ratioComparable = !ownClass?.unknowable && (ownClass?.correctableRatio?.n ?? 0) >= MIN_CLASS_SAMPLES
  if (ratioComparable) {
    if (reading?.decision?.adopted && asNumber(reading.decision.factor)) {
      return { factor: reading.decision.factor, basis: 'global', label, reason: null }
    }
    const factor = asNumber(reading?.factors?.[label])
    if (factor && factor > 0) return { factor, basis: `criticality:${label}`, label, reason: null }
  }
  // THE SECOND BASIS, and the one that answers the question this point was filed
  // for. A ratio needs a promise recorded at the landing, and those snapshots
  // begin only with this command's first run — so on the day it ships, every
  // class is "pending" and the queue keeps a promise no measurement supports.
  // The bias is measurable without a single snapshot: the class's MEASURED
  // median elapsed against the median of what its open cards currently promise.
  // Applied as a FACTOR, so each card keeps its position relative to its
  // neighbours; only the class's centre moves onto the measurement.
  const promise = asNumber(promiseMedian)
  const measured = asNumber(ownClass?.correctable?.median)
  if (ownClass?.elapsedComparable && promise > 0 && measured > 0) {
    return { factor: measured / promise, basis: `${ELAPSED_BIAS_BASIS}:${label}`, label, reason: null }
  }
  if (!ratioComparable) {
    return {
      factor: null,
      basis: null,
      label,
      reason: ownClass?.elapsedComparable
        ? `class "${label}" is measured but its open cards promise nothing comparable`
        : `class "${label}" has no landed comparable (fewer than ${MIN_CLASS_SAMPLES} measured landings)`,
    }
  }
  return { factor: null, basis: null, label, reason: `class "${label}" has no usable factor` }
}

/**
 * THE MEDIAN PROMISE PER CRITICALITY CLASS, over the cards still open.
 *
 * The denominator of the bias above. It reads each card's BASELINE — what it
 * promised before any correction — so a second run divides by the same number
 * the first one did instead of compounding its own writing. An inherited class
 * median is not a promise anybody made and is left out.
 */
export function promiseMedians({ cards = {}, open = [], criticality = new Map(), ledger = {}, exclude = new Set() } = {}) {
  const crit = criticality instanceof Map ? criticality : new Map(Object.entries(criticality).map(([k, v]) => [Number(k), v]))
  // THE DENOMINATOR MUST HOLD THE SAME CARDS THE NUMERATOR SPEAKS FOR. A render
  // point's promise is larger than a process point's, so leaving the excluded
  // cards in would carry their weight into the factor applied to everything
  // else — reintroducing the very confounder the exclusion exists to keep out.
  const skip = exclude instanceof Set ? exclude : new Set(exclude ?? [])
  const groups = new Map()
  for (const point of [...open].map(Number).filter((n) => Number.isInteger(n) && n > 0)) {
    if (skip.has(point)) continue
    const from = cards?.[point]?.estimate ?? null
    // A card that promises nothing NOW promises nothing. The ledger remembers
    // what a card said before a correction touched it — it is not a store the
    // card can be restored from, and reading it here resurrected estimates that
    // had been removed and let them weigh on the denominator.
    if (from === null || from === undefined) continue
    const baseline = ledgerEntry(ledger, point)?.baseline ?? from
    // BOTH values, exactly as the plan tests them. A card showing an inherited
    // class median while the ledger still remembers an older ordinary promise is
    // refused a correction — so that old promise may not weigh on the factor the
    // other cards get either.
    if (
      String(from ?? '').includes(INHERITED_ESTIMATE_NOTE) ||
      String(baseline ?? '').includes(INHERITED_ESTIMATE_NOTE)
    ) {
      continue
    }
    const hours = parseEstimateHours(baseline)
    if (!hours) continue
    const label = crit.get(point) ?? UNTAGGED
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push(hours)
  }
  const out = new Map()
  for (const [label, xs] of groups) {
    const median = summarise(xs).median
    if (median) out.set(label, median)
  }
  return out
}

/**
 * WHICH OPEN POINTS ASK FOR A PICTURE PROOF — the confounder, made operative.
 *
 * Point 730's own measurement carries a binding limit: its window holds no
 * render point with a picture check, so its factor "must NOT be carried over to
 * render points". A queued card's picture axis cannot be READ off the board —
 * whether a picture check happened is a property of how the work turned out —
 * but the point's own spec says whether one is OWED, and that is the half that
 * exists before the work starts.
 *
 * The markers are deliberately narrow: a demand for a rendered PROOF, not any
 * mention of pictures. A process point that discusses the picture lane is not a
 * render point, and excluding it would quietly shrink the correction.
 */
export const PICTURE_VERIFIED = 'picture-verified'

/**
 * WHY A CARD WAS HELD OUT — one string, so the plan's reason and the count the
 * report prints beside it can never drift apart into two different truths.
 */
export const PICTURE_HOLDOUT_REASON =
  'the point asks for a rendered proof, and this measurement cannot establish what one costs'

export const PICTURE_PROOF_MARKERS = [
  /\bbrowser frames?\b/i,
  /\bscreenshots?\b/i,
  // "picture check" and "picture proof" name a DEMAND. "picture verification",
  // by contrast, is how the process talks about itself, and taking it marked
  // every process point that mentions the lane as a render point.
  // PLURALS COUNT: "attach picture proofs" demands exactly what "attach a
  // picture proof" demands, and the singular-only marker let it through.
  /\bpicture[- ](checks?|proofs?)\b/i,
  /\brendered proofs?\b/i,
  /\bam Bild\b/i,
]

/**
 * "on both backends" is NOT a proof demand by itself — a guard, a worker or a
 * shader path is implemented on both backends without anybody looking at a
 * picture. It counts only where the same clause also names something VISUAL,
 * which is how a render point's VERIFIABLE actually reads.
 */
export const PICTURE_BACKEND_MARKER = /\bboth backends\b/i
export const PICTURE_VISUAL_COMPANION = /\b(pictures?|screenshots?|frames?|framing|renders?|rendered|rendering|visual|visually|Bild|Ansicht)\b/i

/**
 * A mention that DENIES the proof rather than demanding it. Narrow on purpose:
 * it exists so "no screenshot is required here" does not mark a process point as
 * a render point, and it is not a general-purpose negation parser.
 */
const PROOF_NOUN = '(screenshots?|browser frames?|picture[- ]\\w+|rendered proofs?)'

export const PICTURE_PROOF_DENIALS = [
  // "no screenshot", "without a browser frame", "kein Screenshot"
  new RegExp(`\\b(no|without|kein|keine|ohne)\\s+(\\w+\\s+){0,2}${PROOF_NOUN}`, 'i'),
  // "a screenshot is not required", "the browser frame was not needed"
  new RegExp(`${PROOF_NOUN}\\s+(\\w+\\s+){0,3}(is|are|was|were)?\\s*not\\s+(required|needed|necessary)`, 'i'),
  // "does not require a screenshot", "will not need a browser frame"
  new RegExp(`\\bnot\\s+(\\w+\\s+){0,2}(require|requires|need|needs)\\s+(\\w+\\s+){0,2}${PROOF_NOUN}`, 'i'),
  // German postfix: "ein Screenshot ist nicht nötig"
  new RegExp(`${PROOF_NOUN}[^.]{0,40}\\bnicht\\s+(nötig|noetig|erforderlich)`, 'i'),
  /\bnot\s+(\w+\s+){0,2}picture[- ]verified\b/i,
  // A DENIAL WITH ITS NOUN ON THE OTHER SIDE OF A BOUNDARY: "Not required: a
  // screenshot." The fragment names no proof at all, so nothing marked it as a
  // denial and the bare noun behind the colon read as a demand.
  /^\s*(not|no longer|nicht|kein|keine)\s+(required|needed|necessary|nötig|noetig|erforderlich)\s*$/i,
]

/**
 * A clause that HANDLES a proof artefact instead of asking for one.
 *
 * The markers name a DEMAND, not any mention — but every mention matched, so
 * "Delete the obsolete screenshot fixture" was held out as render work. Narrow
 * and symmetrical to the denials above: a housekeeping verb reaching a proof
 * noun, or a proof noun naming a stored artefact. Nothing here touches
 * "screenshot test" or "picture check", which is how a point ASKS for a proof.
 */
const UPKEEP_VERB =
  '(delete|deletes|deleted|remove|removes|removed|drop|drops|dropped|rename|renames|renamed|' +
  'move|moves|moved|prune|prunes|pruned|purge|purges|purged|' +
  'lösche|loesche|löschen|loeschen|entferne|entfernen|umbenennen|verschieben)'

/**
 * ONLY WHAT THE VERB DIRECTLY GOVERNS may stand between it and the proof noun:
 * a determiner and a few adjectives, nothing that could be a second statement.
 * A free gap reached straight through the demand behind it — "remove the old
 * helper AND ATTACH A SCREENSHOT" is a demand, and a 40-character window
 * swallowed it. An artefact rule of the shape "<proof noun> file(s)" is gone for
 * the same reason: "provide screenshot files for review" asks for exactly what
 * it names.
 */
const UPKEEP_GAP =
  '(?:\\s+(?:the|a|an|its|this|that|old|obsolete|stale|unused|leftover|remaining|' +
  'der|die|das|den|dem|ein|eine|einen|alte|alten|alter|altes|veraltete|veralteten|unbenutzte|unbenutzten))*'

/**
 * ONE VERB MAY GOVERN SEVERAL OBJECTS: "remove the screenshots and browser
 * frames" deletes both. Only glue may join them — a second verb ends the reach,
 * which is what keeps "remove the screenshots and attach a browser frame" a
 * demand.
 */
const UPKEEP_MORE = `(?:\\s*,?\\s*(?:and|or|und|oder)?${UPKEEP_GAP}\\s+${PROOF_NOUN})*`

export const PICTURE_PROOF_UPKEEP = [
  new RegExp(`\\b${UPKEEP_VERB}\\b${UPKEEP_GAP}\\s+${PROOF_NOUN}${UPKEEP_MORE}`, 'i'),
]

/**
 * ONE LINE, CUT INTO THE CLAUSES A DENIAL CAN REACH.
 *
 * A denial governs its own clause and no further, so the cut has to include the
 * ordinary boundaries: a comma and a dash separate two statements as surely as a
 * semicolon does, and "no screenshot is required — provide a browser frame" was
 * read as a denial while it was one string.
 */
export const splitClauses = (line) => String(line ?? '').split(/[;.,:]|—|–|--/)

/**
 * A fragment that states nothing of its own — the tail of a coordinated list.
 *
 * "No screenshot, browser frame, or picture proof is required" cuts into three,
 * and the last two are bare nouns that a marker test happily accepts. They are
 * not new statements; they belong to the clause in front of them. A fragment
 * that carries a word of its own ("provide a browser frame") does state
 * something, and the clause before it does not reach that far.
 *
 * The conjunction that JOINS an item is glue like the article that carries it;
 * what is not glue here is the shared PREDICATE, and lending that out is the
 * separate licence `LIST_TAIL_GLUE` grants.
 */
const LIST_GLUE =
  /^(?:\s|\b(?:a|an|the|ein|eine|einen|einem|einer|eines|der|die|das|den|dem|des|or|and|nor|noch|oder|und)\b|[^a-zA-Z\u00c0-\u024f]+)*$/i

/**
 * The tail of a coordinated list may carry the predicate the whole list shares:
 * "No screenshot, browser frame, or picture proof IS REQUIRED" — the last item
 * finishes the sentence the denial began. That licence belongs to the shared
 * predicate alone; "and a browser frame MUST BE SUPPLIED" says something new.
 *
 * The conjunctions are glue here too, because the item that finishes the list
 * carries the one that joins it — leading after an Oxford comma, and INTERNAL
 * without one.
 */
const LIST_TAIL_GLUE =
  /^(?:\s|\b(?:a|an|the|ein|eine|einen|einem|einer|eines|der|die|das|den|dem|des|or|and|nor|noch|oder|und|is|are|was|were|be|been|required|needed|necessary|nötig|noetig|erforderlich)\b|[^a-zA-Z\u00c0-\u024f]+)*$/i

/**
 * The conjunction that shows a fragment finishes a coordinated list. It may
 * LEAD the fragment ("…, or picture proof is required") or sit INSIDE it, which
 * is what an English list without an Oxford comma looks like: "No screenshot,
 * browser frame or picture proof is required" cuts into two, and the second half
 * carries both the last item and the predicate the whole list shares.
 */
const LIST_CONJUNCTION = /\b(or|and|nor|noch|oder|und)\b/i

/**
 * A DENIAL THAT ALREADY SAID "IS REQUIRED" HAS FINISHED ITS SENTENCE.
 *
 * The shared predicate can only be lent onward by a denial that is still open:
 * "No screenshot, browser frame or picture proof IS REQUIRED" names the
 * predicate once, at the end. Where the denial carries its own — "No screenshot
 * IS REQUIRED, a browser frame and picture proof ARE REQUIRED" — the clause
 * behind it is a new sentence with a predicate of its own, and reading it as the
 * tail of the negative list turned a demand into a denial.
 */
/**
 * THE ONE PLACE AN ATTRIBUTIVE ADJECTIVE CAN STAND, in both languages, is
 * between a determiner and its noun. That is the whole rule below, and it
 * replaced three rounds of regexes that each traded one misreading for another.
 *
 * "No screenshot showing THE required state" describes what the screenshot would
 * show — the sentence has not said what it demands yet, and the list is still
 * running. "No screenshot NECESSARY for this change" and "Kein Screenshot NÖTIG
 * für diese Änderung" state it, complement and all, and the clause behind them
 * is a new sentence.
 */
const DETERMINER =
  '(the|a|an|this|that|these|those|its|their|our|your|his|her|no|any|some|' +
  'der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines|' +
  'diese|dieser|diesem|diesen|dieses|jede|jeder|jedem|jeden|ihr|ihre|ihren|sein|seine|seinen)'

const REQUIREMENT = '(required|needed|necessary|require|requires|need|needs|nötig|noetig|erforderlich)'

const DENIAL_CARRIES_PREDICATE = new RegExp(`(?<!\\b${DETERMINER}\\s)\\b${REQUIREMENT}\\b`, 'i')

export const denialIsOpen = (fragment) => !DENIAL_CARRIES_PREDICATE.test(String(fragment ?? ''))

/**
 * A NEGATIVE CONTINUATION — "No screenshot is required, NOR is a browser frame
 * required." The denial in front has finished its own sentence and can lend
 * nothing, but "nor" carries the negation itself.
 *
 * It only counts BEHIND a denial. On its own, "Noch einen Screenshot anhängen"
 * is an ordinary German demand for one more screenshot, and reading the word as
 * a negation wherever it appeared admitted a render card for correction.
 */
export const NEGATIVE_CONTINUATION = /^\s*(nor|noch)\b/i

/**
 * …and it must SAY NOTHING OF ITS OWN either. "Noch" also means "another", so
 * "Noch ein Browser Frame wird gebraucht" is a demand standing behind a denial,
 * not a continuation of it.
 *
 * THE TWO WORDS DIFFER IN WHAT THEY NEGATE. English "nor" negates the predicate
 * it shares — "nor IS a browser frame REQUIRED" is a denial in full, so the
 * shared predicate may come with it. German "noch" negates nothing on its own:
 * "nötig" and "erforderlich" behind it are positive requirements, and lending
 * them the same licence suppressed "Noch ein Browser Frame erforderlich". Only a
 * BARE item continues a denial there.
 */
export const continuesDenial = (fragment) => {
  const text = String(fragment ?? '')
  const lead = NEGATIVE_CONTINUATION.exec(text)
  if (!lead) return false
  return isListContinuation(text, PICTURE_PROOF_MARKERS, { allowPredicate: /^nor$/i.test(lead[1]) })
}

export const isListContinuation = (fragment, markers = PICTURE_PROOF_MARKERS, { allowPredicate = true } = {}) => {
  const text = String(fragment ?? '')
  // Nothing but the proof noun and the words that carry it: no statement of its
  // own. A fragment that says something ("provide …", "must be supplied") is a
  // statement and ends whatever the fragment before it decided — a leading "and"
  // does not turn it back into a list item.
  const bare = markers.reduce((acc, re) => acc.replace(new RegExp(re.source, 'gi'), ' '), text)
  const glue = allowPredicate && LIST_CONJUNCTION.test(text) ? LIST_TAIL_GLUE : LIST_GLUE
  return glue.test(bare)
}

/** Does ONE clause demand a rendered proof? */
export function clauseDemandsPicture(clause) {
  const text = String(clause ?? '')
  // A denial suppresses its OWN clause only. "No screenshot is required; provide
  // a browser frame" is a demand, and reading the whole line at once lost it.
  if (PICTURE_PROOF_DENIALS.some((re) => re.test(text))) return false
  // A mention is not a demand: the clause that deletes or renames a proof
  // artefact asks for no picture, and holding its point out would shrink the
  // correction over work that never owed one. Upkeep only REMOVES what it
  // explains — "rename the screenshot helper and check the rendered river on
  // both backends" still demands the picture its second half asks for.
  const asked = PICTURE_PROOF_UPKEEP.reduce(
    (acc, re) => acc.replace(new RegExp(re.source, 'gi'), ' '),
    text,
  )
  if (PICTURE_PROOF_MARKERS.some((re) => re.test(asked))) return true
  return PICTURE_BACKEND_MARKER.test(asked) && PICTURE_VISUAL_COMPANION.test(asked)
}

/**
 * Does one LINE demand a rendered proof? Clause by clause, left to right, with a
 * denial governing the bare list items that trail it.
 */
export function lineDemandsPicture(line) {
  // The two clauses that SUPPRESS the proof nouns trailing them are kept apart,
  // because only one of them can carry a negation onward: a DENIAL denies its
  // list, while HOUSEKEEPING merely deletes its objects. Conflating them made
  // "Lösche den alten Screenshot. Noch einen Browser Frame anhängen." lose its
  // second sentence. The list is cut at commas, so a verb's coordinated objects
  // arrive as separate fragments and inherit the same way a denied list does.
  let denied = false
  let upkept = false
  // …and whether the denial may still lend its predicate to what trails it.
  let open = false
  for (const fragment of splitClauses(line)) {
    // "…, nor is a browser frame required": the negation carries on by itself,
    // but only behind a real denial and only where it adds nothing of its own.
    if (denied && continuesDenial(fragment)) continue
    if (PICTURE_PROOF_DENIALS.some((re) => re.test(fragment))) {
      denied = true
      upkept = false
      open = denialIsOpen(fragment)
      continue
    }
    // A bare list item INHERITS the decision in front of it: suppressed after a
    // denial or a housekeeping clause, and a demand of its own where nothing did.
    if (isListContinuation(fragment, PICTURE_PROOF_MARKERS, { allowPredicate: open })) {
      if (denied || upkept) continue
      if (clauseDemandsPicture(fragment)) return true
      continue
    }
    const demands = clauseDemandsPicture(fragment)
    // A clause naming a proof noun that is NOT a demand, because a housekeeping
    // verb governs it, governs the bare objects behind it too.
    upkept = !demands && PICTURE_PROOF_UPKEEP.some((re) => re.test(fragment))
    denied = false
    open = false
    if (demands) return true
  }
  return false
}

export function pictureBearingPoints(text) {
  const out = new Set()
  let point = null
  for (const line of String(text ?? '').split('\n')) {
    const head = /^- \[[x ]\] (\d+)\./.exec(line)
    if (head) point = Number(head[1])
    else if (/^- \[/.test(line)) point = null
    if (point === null || out.has(point)) continue
    // The head line carries the point's title, and a title can name the proof.
    if (lineDemandsPicture(line)) out.add(point)
  }
  return out
}

/**
 * DOES THIS LANDING OWE A RENDERED PROOF? The spec first, the attestation second.
 *
 * `owesPicture` is read off the point's own work-order text by the caller, the
 * same way a queued card is read. `picture` is the surviving attestation from
 * the verification store. Either one is enough: a proof that was owed but whose
 * record was pruned still belonged to the render lane.
 */
export const owesRenderedProof = (landing) =>
  landing?.owesPicture === true || classesOf(landing).picture === PICTURE_VERIFIED

/** The cards a plan held out for the render confounder — what the report counts. */
export const heldOutForPicture = (plan) =>
  (Array.isArray(plan) ? plan : []).filter((p) => p?.reason?.includes(PICTURE_HOLDOUT_REASON))

/**
 * THE BASELINE LEDGER — what each card promised BEFORE any correction touched it.
 *
 * Two defects made this necessary, and one fact made it the only possible shape:
 * `.claude/board-queue.json` is GIT-IGNORED, so there is no commit to read a past
 * estimate out of. Provenance can only be BUILT FORWARD, by recording what the
 * file said each time the command looked at it.
 *
 *   · A ratio measured against today's mutable card is not the promise that stood
 *     at the landing. Once a point has landed, its ledger entry is FROZEN — the
 *     last thing the card said while the point was still open is the promise the
 *     reader was given, and nothing later can edit it.
 *   · A correction applied to an already-corrected card multiplies the same
 *     factor in again. So the target is always BASELINE × factor, never
 *     CURRENT × factor: re-running the same reading writes the same value, and a
 *     reading that has moved is recomputed from the baseline instead of stacked
 *     on top of the last one.
 *
 * A card the user rewrites by hand becomes its own new baseline — a number a
 * human just chose is a fresh promise, not a corrected one.
 */
export function ledgerEntry(ledger, point) {
  const l = ledger && typeof ledger === 'object' ? ledger : {}
  return l[String(point)] ?? l[Number(point)] ?? null
}

/**
 * The ledger after this run looked at the file. Only OPEN points are touched:
 * a landed point's entry is the promise that stood at its landing and is frozen.
 */
export function updateEstimateLedger(ledger, { cards = {}, open = [], now = Math.floor(Date.now() / 1000) } = {}) {
  const out = { ...(ledger && typeof ledger === 'object' ? ledger : {}) }
  for (const point of [...open].map(Number).filter((n) => Number.isInteger(n) && n > 0)) {
    const current = cards?.[point]?.estimate ?? null
    if (!current || String(current).includes(INHERITED_ESTIMATE_NOTE)) continue
    const prev = ledgerEntry(out, point)
    // Our own last write, the value we announced we were about to write, or the
    // untouched baseline: in all three the baseline stands. Without the announced
    // value, a run interrupted between the queue write and its ledger entry came
    // back to a corrected card it did not recognise and snapshotted the
    // correction as a fresh promise.
    if (prev && (prev.applied?.estimate === current || prev.intent?.estimate === current || prev.baseline === current)) {
      continue
    }
    out[String(point)] = { baseline: current, baselineAt: Math.floor(now) }
  }
  return out
}

/**
 * The estimate a landing is judged against, and where it came from.
 *
 * `snapshot` is the frozen promise. Without one, today's mutable value is only
 * CONTEXT and is marked `unreconstructable`; callers must not put it into a
 * ratio. Both queue data and board HTML are untracked, so there is no history
 * from which the landing-time value could be recovered.
 */
export function estimateForLanding(ledger, point, currentEstimate) {
  const entry = ledgerEntry(ledger, point)
  if (entry?.baseline && !String(entry.baseline).includes(INHERITED_ESTIMATE_NOTE)) {
    return { estimate: entry.baseline, source: 'snapshot' }
  }
  if (currentEstimate) return { estimate: currentEstimate, source: 'unreconstructable' }
  return { estimate: null, source: null }
}

/**
 * WHAT THE REWRITE WOULD WRITE, per card — pure, so it is reviewable before it runs.
 *
 * A card is only moved when its class HAS a landed comparable and its stored
 * estimate parses. Otherwise it keeps exactly what it had, and the plan carries
 * the reason in words: a guessed correction on a class nobody measured would put
 * back the very thing this point removes.
 *
 * IDEMPOTENT BY CONSTRUCTION: the factor is applied to the card's BASELINE, so a
 * second run of the same reading computes the same target and changes nothing.
 */
export function rewritePlan(reading, { cards = {}, open = [], criticality = new Map(), ledger = {}, pictureBearing = new Set() } = {}) {
  const crit = criticality instanceof Map ? criticality : new Map(Object.entries(criticality).map(([k, v]) => [Number(k), v]))
  // A POINT THAT OWES A RENDERED PROOF IS HELD OUT, FULL STOP.
  //
  // This is the spec's own confounder and it is a statement about EVIDENCE: the
  // measurement knows nothing about what a picture check costs. An earlier draft
  // let the holdout lapse as soon as the picture axis became measurable — but the
  // evidence it would have lapsed on is `render-verify-state.json`, which is
  // git-ignored, capped at 40 runs and pruned at branch end. A switch that flips
  // on evidence the tool itself reports as unreliable is worse than no switch:
  // it would correct render cards from a class of four surviving rows and call
  // that measured. So the holdout stands, the report says what would be needed
  // to lift it, and lifting it is a decision with its own measurement behind it.
  const picture = pictureBearing instanceof Set ? pictureBearing : new Set(pictureBearing ?? [])
  // A card belongs in a denominator only where it is corrected from that
  // numerator. These cards are corrected from nothing, so they weigh on nothing.
  const promises = promiseMedians({ cards, open, criticality: crit, ledger, exclude: picture })
  const plan = []
  for (const point of [...open].map(Number).filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b)) {
    const from = cards?.[point]?.estimate ?? null
    const entry = ledgerEntry(ledger, point)
    // Same rule as the denominator's: with no estimate on the card there is
    // nothing to correct, and a remembered baseline is not a replacement for one.
    const baseline = from === null || from === undefined ? null : (entry?.baseline ?? from)
    // BEFORE EVERY OTHER BRANCH: owing a rendered proof is a property of the
    // POINT, not of what its card happens to hold right now. Testing the live
    // estimate let a render card with an empty card but a surviving ledger
    // baseline fall through and be corrected from that stale baseline.
    if (picture.has(point)) {
      plan.push({
        point,
        from,
        baseline,
        to: from,
        changed: false,
        reason: `${PICTURE_HOLDOUT_REASON} — the confounder forbids carrying this factor here, so the estimate is kept`,
      })
      continue
    }
    if (String(from ?? '').includes(INHERITED_ESTIMATE_NOTE) || String(baseline ?? '').includes(INHERITED_ESTIMATE_NOTE)) {
      plan.push({
        point,
        from,
        baseline,
        to: from,
        changed: false,
        reason: `inherited class median (${INHERITED_ESTIMATE_NOTE}) is not a stored baseline — estimate kept`,
      })
      continue
    }
    const hours = parseEstimateHours(baseline)
    const label0 = crit.get(point) ?? UNTAGGED
    const { factor, basis, label, reason: factorReason } = factorForCard(reading, crit.get(point), {
      promiseMedian: promises.get(label0) ?? null,
    })
    if (!hours) {
      plan.push({ point, from, baseline, to: from, changed: false, reason: 'no stored estimate to correct — the card keeps its "no estimate yet" marker' })
      continue
    }
    if (!factor) {
      plan.push({
        point,
        from,
        baseline,
        to: from,
        changed: false,
        reason: `${factorReason ?? `class "${label}" has no landed comparable`} — estimate kept`,
      })
      continue
    }
    const to = formatEstimate(hours * factor, baseline)
    const changed = to !== from
    const corrected = baseline !== from
    plan.push({
      point,
      from,
      baseline,
      to,
      changed,
      factor,
      basis,
      reason: changed
        ? `${basis} factor ${factor.toFixed(2)}×` + (corrected ? ` on the uncorrected ${baseline}` : '')
        : corrected
          ? `${basis} factor ${factor.toFixed(2)}× — the card already carries this correction of ${baseline}`
          : `${basis} factor ${factor.toFixed(2)}× leaves it where it is (half-hour steps, floor ${ESTIMATE_FLOOR_HOURS} h)`,
    })
  }
  return plan
}

/**
 * WHICH PLANNED CHANGES MAY STILL BE WRITTEN, given the file as it stands NOW.
 *
 * The measurement takes seconds to minutes and the main session writes the same
 * file, so this cheap pre-filter avoids spawning a writer for a card already
 * known to have moved. It does NOT close the race: the board command's lock and
 * compare-and-set guard make the later comparison and write one transaction.
 */
export function applicableChanges(plan, liveCards = {}) {
  const written = []
  const skipped = []
  for (const p of (Array.isArray(plan) ? plan : []).filter((x) => x?.changed)) {
    const now = liveCards?.[p.point]?.estimate ?? null
    if (now !== p.from) skipped.push({ ...p, now })
    else written.push(p)
  }
  return { written, skipped }
}

/**
 * WHAT A SNAPSHOT ACTUALLY CONTRIBUTED — compared, or merely stored.
 *
 * A landing counts as COMPARED only where a ratio could be computed from it: a
 * frozen promise that parses AND a measured span. Counting every stored snapshot
 * let the report claim comparisons while `ACTUAL ÷ ESTIMATE` read n=0, which is
 * the one number a reader checks the claim against.
 */
export function isComparedSnapshot(row) {
  return row?.estimateSource === 'snapshot' && row?.elapsedHours !== null && row?.elapsedHours !== undefined && Boolean(row?.estimateHours)
}

/** The four provenance counts, over the rows a reading was taken from. */
export function estimateProvenance(rows = []) {
  const all = Array.isArray(rows) ? rows : []
  return {
    snapshot: all.filter((r) => isComparedSnapshot(r)).length,
    snapshotUncomparable: all.filter((r) => r?.estimateSource === 'snapshot' && !isComparedSnapshot(r)).length,
    unreconstructable: all.filter((r) => r?.estimateSource === 'unreconstructable').length,
    none: all.filter((r) => !r?.estimateSource).length,
  }
}

/**
 * The ledger after a rewrite was APPLIED — each corrected card remembers the
 * baseline it came from and the factor that was used, which is what makes the
 * next run recognise its own writing instead of correcting it a second time.
 * The INTENT is cleared here: the write it stood in for has happened.
 */
export function ledgerAfterApply(ledger, plan, { now = Math.floor(Date.now() / 1000) } = {}) {
  const out = { ...(ledger && typeof ledger === 'object' ? ledger : {}) }
  for (const p of Array.isArray(plan) ? plan : []) {
    if (!p || !asNumber(p.factor) || !p.baseline || !p.to) continue
    out[String(p.point)] = {
      ...(ledgerEntry(out, p.point) ?? {}),
      baseline: p.baseline,
      applied: { estimate: p.to, factor: p.factor, basis: p.basis ?? null, at: Math.floor(now) },
    }
    delete out[String(p.point)].intent
  }
  return out
}

/**
 * THE LEDGER BEFORE A CARD IS WRITTEN — baseline recorded, write announced.
 *
 * The card is written by a separate process that commits on its own, so there is
 * always an instant where the queue has moved and this ledger has not. Recording
 * the INTENT first closes it: whichever of the two values the card holds when a
 * run is interrupted, the ledger already names the promise it came from, and
 * `updateEstimateLedger` recognises the announced value as this tool's own
 * writing instead of snapshotting a corrected estimate as a fresh baseline.
 */
export function ledgerWithIntent(ledger, p, { now = Math.floor(Date.now() / 1000) } = {}) {
  const out = { ...(ledger && typeof ledger === 'object' ? ledger : {}) }
  if (!p || !p.baseline || !p.to) return out
  out[String(p.point)] = {
    ...(ledgerEntry(out, p.point) ?? {}),
    baseline: p.baseline,
    intent: { estimate: p.to, at: Math.floor(now) },
  }
  return out
}

/** …and the ledger after that write was REFUSED: the announcement is withdrawn. */
export function ledgerWithoutIntent(ledger, point) {
  const out = { ...(ledger && typeof ledger === 'object' ? ledger : {}) }
  const entry = ledgerEntry(out, point)
  if (!entry?.intent) return out
  const rest = { ...entry }
  delete rest.intent
  out[String(point)] = rest
  return out
}

/**
 * WRITE THE CORRECTIONS, KEEPING THE LEDGER AHEAD OF THE QUEUE.
 *
 * The order is the whole content of this function, which is why it is here and
 * not in the command: for every card the ledger is persisted BEFORE the write
 * and again AFTER it, so no interruption can leave a corrected card whose
 * promise nothing remembers. `writeCard` returns 'written' or 'refused' and
 * throws only on a real failure; a throw stops the run with everything written
 * so far already on the ledger.
 */
export function applyCorrections({
  plan = [],
  carried = [],
  ledger = {},
  writeCard,
  persist,
  now = Math.floor(Date.now() / 1000),
} = {}) {
  let estimates = { ...(ledger && typeof ledger === 'object' ? ledger : {}) }
  const written = []
  const refused = []
  const save = (next) => {
    estimates = next
    persist(estimates)
    return estimates
  }
  for (const p of Array.isArray(plan) ? plan : []) {
    save(ledgerWithIntent(estimates, p, { now }))
    // A THROW LEAVES THE ANNOUNCEMENT STANDING, deliberately and without a
    // handler: a failure does not prove the card stayed as it was — the writer
    // can commit its atomic write and then be killed before it exits, and
    // withdrawing here would delete the only recognition of the value now on the
    // card. Left standing, the ledger recognises BOTH values, so the baseline
    // survives either way, and everything written before this stands too.
    const outcome = writeCard(p)
    if (outcome?.refused) {
      // A REFUSAL IS DIFFERENT: the writer compared under its lock and wrote
      // nothing, so the announcement is known to be false and is withdrawn.
      save(ledgerWithoutIntent(estimates, p.point))
      refused.push({ ...p, detail: outcome.detail ?? '' })
      continue
    }
    save(ledgerAfterApply(estimates, [p], { now }))
    written.push(p)
  }
  // The cards that carry a factor but did not move keep their baseline too.
  save(ledgerAfterApply(estimates, carried, { now }))
  return { written, refused, estimates }
}

/**
 * The measured defaults a NEWLY FILED card inherits — median hours per class.
 *
 * Stored beside the board's own data and read by the queue generator, so a point
 * appended without an estimate shows its class's measured median instead of the
 * "no estimate yet" marker. A class with no landed comparable is simply absent
 * here, which is what keeps that marker alive for the case where no class fits.
 */
export function inheritanceDefaults(reading) {
  const out = {}
  for (const c of reading?.byAxis?.criticality ?? []) {
    // Measured elapsed time is the default's whole content, so a class settles
    // this the moment it HAS measured landings — a ratio snapshot adds nothing
    // to a median the git history already answers. The test is `elapsedComparable`
    // ALONE: it is the eligibility of the correctable population, which is the
    // population the median below is taken from. Accepting whole-class rated
    // eligibility here published a median drawn from as little as one row.
    if (!c.elapsedComparable) continue
    // The SAME population the eligibility was judged on. Taking the pooled median
    // here handed a new card a number measured partly on render work that no
    // card of this kind is ever corrected from.
    const hours = roundHours(c.correctable.median)
    if (hours) out[c.name] = hours
  }
  return out
}

/**
 * The note an inherited estimate carries, so the reader can tell a measured
 * default from a duration somebody actually thought about.
 */
export const INHERITED_ESTIMATE_NOTE = '· Klassenmedian'

/** The inherited estimate for one class label, or null when that class has none. */
export function inheritedEstimateForClass(label, defaults = {}) {
  const hours = asNumber(defaults?.[label ?? UNTAGGED])
  if (!hours || hours <= 0) return null
  return formatEstimate(hours, `~0 h ${INHERITED_ESTIMATE_NOTE}`)
}

/**
 * The inherited estimate for a POINT — its criticality class's measured median.
 *
 * Criticality is the only one of the three axes a point already carries before
 * anybody starts it, so it is the only one a freshly filed card can inherit from.
 * Null when its class was never measured, which is what keeps the existing
 * "no estimate yet" marker alive for the case where no class fits.
 */
export function inheritedEstimate(point, { defaults = {}, criticality = new Map(), pictureBearing = new Set() } = {}) {
  const crit = criticality instanceof Map ? criticality : new Map(Object.entries(criticality).map(([k, v]) => [Number(k), v]))
  // The medians are measured from landings whose picture is not established, so
  // they say nothing about a point that owes a rendered proof. Such a card keeps
  // the "no estimate yet" marker rather than inheriting a number measured on
  // other work — the same holdout the rewrite applies, at the other door in.
  const declared = pictureBearing instanceof Set ? pictureBearing : new Set(pictureBearing ?? [])
  if (declared.has(Number(point))) return null
  return inheritedEstimateForClass(crit.get(Number(point)) ?? UNTAGGED, defaults)
}
