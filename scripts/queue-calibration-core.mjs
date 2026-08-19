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
// THE SPAN ENDS AT THE LANDING, NOT AT THE MERGE. The estimate this measures is
// defined as the time by which the work is VISIBLY DONE — merged, gated, ticked,
// board updated. A span that stopped at the merge left the gate, the picture
// check and the board update outside the very duration the promise is calibrated
// against, and every one of those happens after it.
//
// A DISTRIBUTION, NEVER A MEAN. The elapsed times are heavy-tailed — a branch cut
// early and merged days later sits in the same sample as one built and landed in
// forty minutes — so a mean is dominated by the tail. Every reading here is a
// five-number summary, and every correction factor is a MEDIAN of ratios.
//
// THE CLASSES DECIDE WHETHER ONE FACTOR IS HONEST. The reading is split three
// ways — the point's criticality tag, whether it was delegated to a branch or
// done in the main session, and whether a picture verification was part of it —
// and a single global factor is adopted ONLY if no axis separates. When one does,
// the global factor is REFUSED by name and the rewrite falls back to the one axis
// that is knowable BEFORE a point starts: its criticality tag.

/**
 * Where the measured defaults live — beside the board data they serve, and
 * git-ignored like it. The constant sits in the PURE core because the command
 * itself measures at import time: a consumer that only wants the path must not
 * have to run the tool to learn it.
 */
export const CALIBRATION_PATH = '.claude/queue-calibration.json'

/** How many landed comparables a class needs before its factor is trusted. */
export const MIN_CLASS_SAMPLES = 5

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

const asNumber = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

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
  const named = new Map()
  const owner = new Map()
  for (const c of rows) {
    const point = mergedBranchPoint(c.subject)
    if (point === null) continue
    owner.set(c.sha, point)
    if (!named.has(point)) named.set(point, c)
  }
  const claimed = new Set()
  const out = new Map()
  const events = [...(Array.isArray(ticks) ? ticks : [])].sort((a, b) => a.at - b.at)
  // PASS 1 — every merge that names its own branch, before any guess is made.
  for (const tick of events) {
    const byName = named.get(tick.point)
    if (!byName || claimed.has(byName.sha)) continue
    claimed.add(byName.sha)
    out.set(tick.point, { merge: byName, attribution: 'branch-name' })
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
      out.set(tick.point, { merge: c, attribution: 'nearest-merge' })
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
 * WHY a landing has, or has not, a measurable span — the difference between
 * "nobody has measured this yet" and "this can never be measured".
 *
 * `no-branch` is STRUCTURAL: a point done in the main session leaves no branch,
 * so no amount of further landings will ever give its class a span. `unknown` is
 * incidental — a merge exists but its second parent is gone after a history
 * rewrite — and more landings WILL fill that class in.
 */
export const SPAN_MEASURED = 'branch-to-landing'
export const SPAN_NO_BRANCH = 'no-branch'
export const SPAN_UNKNOWN = 'unknown'

/** The bases that no further landing of the same kind can ever turn into a span. */
const STRUCTURAL_SPAN_BASES = new Set([SPAN_NO_BRANCH])

/** A landing's span basis — inferred for a row that does not carry one. */
export function spanBasisOf(landing) {
  const stated = landing?.spanBasis
  if (stated === SPAN_MEASURED || stated === SPAN_NO_BRANCH || stated === SPAN_UNKNOWN) return stated
  return asNumber(landing?.elapsedHours) !== null ? SPAN_MEASURED : SPAN_UNKNOWN
}

/**
 * Which class a landing falls into on each axis.
 *
 * A landing whose merge was never found has no file list either, so whether a
 * picture check was part of it is UNKNOWN — not "no picture". Saying "no" there
 * would be the same silent guess the lane axis was making.
 */
export function classesOf(landing) {
  const picture = landing?.picture
  return {
    criticality: landing?.criticality ?? UNTAGGED,
    lane: landing?.delegated ? 'delegated' : 'main-session',
    picture: picture === null || picture === undefined ? 'picture-unknown' : picture ? 'picture' : 'no-picture',
  }
}

/**
 * One axis's classes, each with its elapsed and ratio distributions.
 *
 * A landing with no MEASURABLE elapsed time still counts towards the class's
 * size — a main-session point has no branch, so it has no first-commit-to-landing
 * span at all, and reporting the class as empty would hide that it exists.
 *
 * A class where EVERY member is unmeasurable for a structural reason is marked
 * `structural`, and that mark is what keeps the decision below honest: such a
 * class is not thin, it is unknowable, and the two must not be reported alike.
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
    const rated = members.filter((m) => asNumber(m.elapsedHours) !== null && asNumber(m.estimateHours))
    out.push({
      axis,
      name,
      points: members.length,
      elapsed: summarise(members.map((m) => m.elapsedHours)),
      ratio: summarise(rated.map((m) => m.elapsedHours / m.estimateHours)),
      comparable: rated.length >= MIN_CLASS_SAMPLES,
      structural: members.length > 0 && members.every((m) => STRUCTURAL_SPAN_BASES.has(spanBasisOf(m))),
    })
  }
  return out.sort((a, b) => b.ratio.n - a.ratio.n || String(a.name).localeCompare(String(b.name)))
}

/**
 * How far apart an axis's trustworthy classes sit — max factor over min — plus
 * WHY it could not be measured when it could not.
 *
 * `structural` names the classes that can never carry a span; `pending` counts
 * the ones that merely have too few measured landings so far. An axis with a
 * null spread means something different in each case, and the decision below
 * treats them differently.
 */
export function axisSpread(summaries) {
  const rows = Array.isArray(summaries) ? summaries : []
  const factors = rows.filter((s) => s.comparable).map((s) => s.ratio.median).filter((f) => asNumber(f) && f > 0)
  const structural = rows.filter((s) => s.structural).map((s) => s.name)
  const pending = rows.filter((s) => !s.comparable && !s.structural && (s.points ?? 0) > 0).length
  const base = { classes: factors.length, structural, pending }
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
 * BUT AN AXIS THAT CAN NEVER BE COMPARED IS NOT A VOTE AGAINST. The lane axis is
 * exactly that: main-session work leaves no branch, so its class carries no span
 * and never will. Counting it as "too few measured" made the refusal permanent
 * and the adopt path unreachable — a decision that always says the same thing
 * decides nothing. Such an axis is reported as NOT DECIDABLE, by name and with
 * its classes, and is left out of the vote; the residual it leaves is stated
 * rather than dressed up as evidence. An axis whose classes are merely THIN still
 * refuses, because more landings would settle it.
 */
export function globalFactorDecision(byAxis, { tolerance = GLOBAL_FACTOR_TOLERANCE } = {}) {
  const spreads = AXES.map((axis) => ({ axis, ...axisSpread(byAxis[axis] ?? []) }))
  const compared = spreads.filter((s) => asNumber(s.spread) !== null)
  const offenders = compared.filter((s) => s.spread > tolerance)
  const undecidable = spreads.filter((s) => asNumber(s.spread) === null && s.pending === 0 && s.structural.length > 0)
  const mute = spreads.filter((s) => asNumber(s.spread) === null && !undecidable.includes(s))
  const residual = undecidable.map((u) => `${u.axis} not decidable — ${u.structural.join(', ')} can carry no measured span`)
  if (offenders.length || mute.length || !compared.length) {
    const said = [
      ...offenders.map((o) => `${o.axis} classes differ by ${o.spread.toFixed(2)}×`),
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
    decision: { ...decision, factor: decision.adopted ? overall.ratio.median : null },
    factors: Object.fromEntries(
      byAxis.criticality.filter((c) => c.comparable).map((c) => [c.name, c.ratio.median]),
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
export function factorForCard(reading, criticality) {
  const label = criticality ?? UNTAGGED
  if (reading?.decision?.adopted && asNumber(reading.decision.factor)) {
    return { factor: reading.decision.factor, basis: 'global', label }
  }
  const factor = asNumber(reading?.factors?.[label])
  if (factor && factor > 0) return { factor, basis: `criticality:${label}`, label }
  return { factor: null, basis: null, label }
}

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
    if (!current) continue
    const prev = ledgerEntry(out, point)
    // Our own last write, or the untouched baseline: the baseline stands.
    if (prev && (prev.applied?.estimate === current || prev.baseline === current)) continue
    out[String(point)] = { baseline: current, baselineAt: Math.floor(now) }
  }
  return out
}

/**
 * The estimate a landing is judged against, and where it came from.
 *
 * `snapshot` is the frozen promise; `current` is the live card, used only where
 * no snapshot exists yet — every landing from before this ledger was introduced.
 * The difference is REPORTED rather than smoothed over.
 */
export function estimateForLanding(ledger, point, currentEstimate) {
  const entry = ledgerEntry(ledger, point)
  if (entry?.baseline) return { estimate: entry.baseline, source: 'snapshot' }
  if (currentEstimate) return { estimate: currentEstimate, source: 'current' }
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
export function rewritePlan(reading, { cards = {}, open = [], criticality = new Map(), ledger = {} } = {}) {
  const crit = criticality instanceof Map ? criticality : new Map(Object.entries(criticality).map(([k, v]) => [Number(k), v]))
  const plan = []
  for (const point of [...open].map(Number).filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b)) {
    const from = cards?.[point]?.estimate ?? null
    const entry = ledgerEntry(ledger, point)
    const baseline = entry?.baseline ?? from
    const hours = parseEstimateHours(baseline)
    const { factor, basis, label } = factorForCard(reading, crit.get(point))
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
        reason: `class "${label}" has no landed comparable (fewer than ${MIN_CLASS_SAMPLES} measured landings) — estimate kept`,
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
 * The ledger after a rewrite was APPLIED — each corrected card remembers the
 * baseline it came from and the factor that was used, which is what makes the
 * next run recognise its own writing instead of correcting it a second time.
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
  }
  return out
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
    if (!c.comparable) continue
    const hours = roundHours(c.elapsed.median)
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
export function inheritedEstimate(point, { defaults = {}, criticality = new Map() } = {}) {
  const crit = criticality instanceof Map ? criticality : new Map(Object.entries(criticality).map(([k, v]) => [Number(k), v]))
  return inheritedEstimateForClass(crit.get(Number(point)) ?? UNTAGGED, defaults)
}
