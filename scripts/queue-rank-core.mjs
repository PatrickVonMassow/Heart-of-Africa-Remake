// THE APPEND GATE (point 590) — an appended point is ranked ONCE, deliberately.
// Pure — no fs, no git — so the Vitest layer sweeps every rule
// (scripts/queue-rank-core.test.mjs).
//
// WHY THIS EXISTS. Point 608 moved the board's queue ORDER back to the work
// order: the Warteschlange is rendered from the open points of `TASKS.md` in the
// sequence that file states (`openPointsOf`/`queueOrder` in board-queue-core),
// and `queueOrderDrift` blocks a published board that shows another. Re-ranking a
// point therefore means MOVING its block inside `TASKS.md`.
//
// That leaves exactly one hole, and it is the one the user hit on 09.08.2026:
// append-and-defer puts a new point at the END, and since the board renders that
// order, the end is also where the user sees it. That position is a DEFAULT, not
// a judgment — the freshly appended 589 landed at the very back although he
// wanted it worked at once. So the turn that appends a point owes ONE decision,
// at the moment its content is freshest: move the block in `TASKS.md`, or record
// that last is right. Everything here serves that single question.
//
// THE STATE, all of it, is the tracked `.claude/queue-rank.json`:
//   { "ranked":  { "<N>": { "at": …, "why": … } },      the deliberate decisions
//     "settled": { "at": …, "points": [ … ], "why"? } } the PROVENANCE baseline —
// the open set as it stood the last time no rank question was outstanding. A
// point is "appended since" exactly when it is missing from that set, which is
// the one thing its NUMBER and its POSITION cannot tell anybody (`appendGateState`).
//
// THIS MODULE OWNS NO ORDER. It is deliberately separate from board-queue-core:
// that module renders the queue, this one judges provenance, and the guard
// consumes both. Nothing here imports anything, so no import cycle can form
// between the ranking and the rendering — a second copy of the ORDER is precisely
// the failure points 590 and 608 were opened about.

/** Record the rank of a point that stays where append-and-defer put it. */
export const RANK_CMD = 'node scripts/queue-rank.mjs --ranked <N> --why "<one line>"'

/** Arm the gate: record the order as it stands today as judged, in one go. */
export const SEED_CMD = 'node scripts/queue-rank.mjs --seed --why "<one line>"'

/** Where the deliberate "last is right" decisions AND the provenance baseline are
 *  recorded (TRACKED, not runtime state: both are repository history, and a clone
 *  that inherited neither would re-ask about every point ever appended). */
export const RANK_RECORD_PATH = '.claude/queue-rank.json'

/** The open points as clean integers, in the order they were handed over, each
 *  once. `openPointsOf` does not deduplicate, and a number listed twice would
 *  otherwise make the same point read as both remembered and appended. */
function pointList(open) {
  const out = []
  for (const v of Array.isArray(open) ? open : []) {
    const n = Number(v)
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n)
  }
  return out
}

/**
 * PROVENANCE, NOT POSITION — which points are NEW since anybody last judged the
 * order.
 *
 * The first two cuts of this gate inferred "this point was appended" from where
 * it stands: the last point (and the ascending run before it) was taken to be
 * the append default. The cross-vendor review (GPT-5.6 Sol, 10.08.2026) refuted
 * that twice over, and both refutations are decisive rather than cosmetic:
 *   - CLOSING a point makes its predecessor last. Open `[9, 5, 4]` with 4 ranked
 *     becomes `[9, 5]` when 4 lands, and 5 — which has stood there all along —
 *     was asked about as if it had just been appended. A gate that fires where
 *     nothing happened is a block loop.
 *   - Appending DESCENDING numbers hid behind the running-maximum walk: `[9, 5]`
 *     plus the reopened 4, then 3, gives `[9, 5, 4, 3]`, and only 3 was ever
 *     questioned. A gate with a silent escape is worse than no gate.
 * No arrangement of numbers can tell the two apart, because the numbers are not
 * where the information is. So the record REMEMBERS the open set as it stood
 * when the order was last settled (`settled.points`), and a point is new exactly
 * when it is not in that set.
 *
 * A new point that stands BEFORE a point already in the baseline was placed
 * there deliberately — that is the "move it in TASKS.md" answer — so only the
 * new points standing BEHIND every remembered one are at the append default.
 * A new point placed before ANOTHER NEW one is still asked about, and that is
 * the safe direction rather than an oversight: two points appended in the same
 * turn arrive exactly like that, and reading "stands before another new point"
 * as a judgment would let the earlier of them through unasked — the silent
 * escape this gate was rebuilt to close. An extra question costs one command.
 *
 * A REOPENED point is new by this reading, and that is the intended answer, not
 * a side effect: re-entering the open order at the end puts it exactly where an
 * append lands — the default nobody judged — so it is asked once, like any other
 * point standing there. What is never asked about is the SURVIVOR, a point the
 * baseline still remembers, whatever position the closings around it left it in.
 */
function appendsSinceSettled(open, known) {
  const list = pointList(open)
  let lastKnown = -1
  for (let i = 0; i < list.length; i++) if (known.has(list[i])) lastKnown = i
  return list.filter((n, i) => i > lastKnown && !known.has(n))
}

/** A stored baseline in the shape this module works with, or null if there is none. */
function normaliseSettled(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.points)) return null
  const points = []
  for (const v of raw.points) {
    const n = Number(v)
    if (Number.isInteger(n) && n > 0 && !points.includes(n)) points.push(n)
  }
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '')
  const out = { at: str(raw.at), points: points.sort((a, b) => a - b) }
  if (str(raw.why)) out.why = str(raw.why)
  return out
}

/**
 * THE TORN MARK BELONGS TO THE PARSER, AND NO FILE CAN CARRY IT (cross-vendor
 * review, 11.08.2026).
 *
 * `torn` used to be read straight off the record — `src.torn === true` — which
 * made it the one field a record could assert about ITSELF. A syntactically
 * perfect `{"ranked":{},"settled":{…},"torn":true}` therefore disabled the gate
 * for ever and locked the door behind it: the guard drew no verdict from a "torn"
 * record, and every CLI write was refused as unreadable, so nothing could repair
 * the file that did it. One hand-edit, one bad merge or one careless copy of a
 * parse result was enough.
 *
 * A SYMBOL CANNOT BE WRITTEN IN JSON, so the flag is carried on one — set only
 * where the bytes actually failed to parse, and non-enumerable so it never
 * reaches a serialiser or a comparison. Whatever a record says about itself, only
 * the parser decides that it is torn. Nothing writes the field back either:
 * `pruneRankRecord` and `settleRecord` build `{ranked, settled}`, so a file that
 * arrived carrying `"torn"` loses it at the next write.
 */
const PARSER_TORN = Symbol('queue-rank.torn')

/** Mark a record as unreadable — the parser's own hand, not the file's. */
function markTorn(record) {
  return Object.defineProperty(record, PARSER_TORN, { value: true, enumerable: false })
}

/**
 * The stored record: `{ ranked: { "<N>": {at, why} }, settled: {at, points[], why?}, torn }`.
 *
 * `ranked` holds the deliberate "last is right" decisions; `settled` is the
 * PROVENANCE baseline described above — the open set as of the last run in which
 * no rank question stood, plus when that was. Both live in one tracked file
 * because both are the same fact from two sides: what was judged, and what the
 * order looked like when the judging was done.
 *
 * A DECISION WITHOUT A REASON IS NOT A DECISION (cross-vendor review, 10.08.2026).
 * `recordRank` demands a `why`, but the file is hand-editable and tracked, so an
 * entry typed or merged in without one used to count all the same and silence the
 * gate for that point for ever. Such an entry is DROPPED here — it reads exactly
 * like the point never having been ranked, which is what it is. It cannot silence
 * the gate by the back door either: whether the gate is ARMED is read off
 * `settled` alone, so an emptied `ranked` no longer looks like a fresh checkout.
 */
export function normaliseRankRecord(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const ranked = {}
  const entries = src.ranked && typeof src.ranked === 'object' && !Array.isArray(src.ranked) ? src.ranked : {}
  for (const [key, value] of Object.entries(entries)) {
    const n = Number(key)
    if (!Number.isInteger(n) || n <= 0 || !value || typeof value !== 'object') continue
    const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '')
    const why = str(value.why)
    if (!why) continue
    ranked[n] = { at: str(value.at), why }
  }
  // NOT `src.torn`: the flag is read off the parser's mark, so a record can never
  // declare itself unreadable and silence the gate.
  const torn = raw !== null && raw !== undefined && raw[PARSER_TORN] === true
  const out = { ranked, settled: normaliseSettled(src.settled), torn }
  return torn ? markTorn(out) : out
}

/**
 * The rank record from the file's raw bytes.
 *
 * ABSENT IS NOT TORN (cross-vendor review, 10.08.2026). An absent file means
 * "nothing recorded yet" and the gate applies; bytes that do not parse mean the
 * state is UNREADABLE, and a guard may draw no verdict from that — every guard
 * here is fail-OPEN by CLAUDE.md §7.2 decree, so an unreadable record must not be
 * able to block a turn. The flag travels with the record so the CLI can be LOUD
 * about the same file the guard is quiet about, and so nothing overwrites a torn
 * file with a fresh one (the point-530 lesson: a file that does not parse is not
 * empty).
 *
 * AND AN EXISTING EMPTY FILE IS TORN, NOT ABSENT (cross-vendor review,
 * 11.08.2026). A zero-byte or whitespace-only record used to read as "nothing
 * recorded yet", which got both halves exactly backwards: the guard blocked as
 * UNARMED while the CLI cheerfully wrote over the file. The parser cannot tell
 * absence from an empty file — but the READER can, and it already says so in the
 * only vocabulary needed: `null` when the file is not there, a STRING when it is.
 * So `null`/`undefined` is the one and only absence, and any string that does not
 * parse — the empty one included — is torn. Every reader here already passes
 * `existsSync(path) ? readFileSync(path) : null`.
 */
export function parseRankRecord(text) {
  const empty = { ranked: {}, settled: null, torn: false }
  const broken = markTorn({ ranked: {}, settled: null, torn: true })
  if (text === null || text === undefined) return empty
  // Anything that is not the file's own bytes is not a record either.
  if (typeof text !== 'string' || !text.trim()) return broken
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return broken
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return broken
  if ('ranked' in parsed && (!parsed.ranked || typeof parsed.ranked !== 'object' || Array.isArray(parsed.ranked))) {
    return broken
  }
  // A baseline that is present but unreadable is TORN, not absent: reading it as
  // "never armed" would turn a damaged file into a clean-slate exemption, which
  // is the very silencing route this gate had to close.
  if ('settled' in parsed && !normaliseSettled(parsed.settled)) return broken
  return normaliseRankRecord(parsed)
}

/**
 * WHERE THE APPEND GATE STANDS, in one value:
 *   - `torn`     the record does not parse — no verdict may be drawn from it, and
 *                the guard fails OPEN (CLAUDE.md §7.2); the CLI is the loud half.
 *   - `unarmed`  no baseline was ever recorded, so nothing can say which points
 *                are new. The gate does NOT fall silent here — that is exactly
 *                the exemption that let a damaged or half-merged record swallow
 *                an unranked append — it asks ONCE for the baseline, which
 *                `--seed` writes in one go for the whole open order.
 *   - `pending`  points were appended since the baseline and nobody has said
 *                whether that is where they belong.
 *   - `settled`  every point in the order is either remembered or decided.
 * `appended` names the new points standing at the append default, `inside` the
 * new ones somebody placed deliberately between remembered points (already a
 * judgment, so never asked about).
 */
export function appendGateState(open, record) {
  const list = pointList(open)
  const { ranked, settled, torn } = normaliseRankRecord(record)
  if (torn) return { state: 'torn', pending: [], appended: [], inside: [], baseline: [] }
  if (!settled) return { state: 'unarmed', pending: [], appended: [], inside: [], baseline: [] }
  const known = new Set(settled.points)
  const appended = appendsSinceSettled(list, known)
  const inside = list.filter((n) => !known.has(n) && !appended.includes(n))
  const pending = appended.filter((n) => !ranked[n])
  return { state: pending.length ? 'pending' : 'settled', pending, appended, inside, baseline: settled.points }
}

/**
 * The appended points whose rank nobody has settled yet — the question the gate
 * asks. One of two things ends it: moving the point inside TASKS.md (it then
 * stands before a remembered point, which IS the judgment), or recording that
 * last is right.
 */
export function unrankedAppends(open, record) {
  return appendGateState(open, record).pending
}

/**
 * The record as it should stand once nothing is pending — the baseline advanced
 * to today's open set, and decisions about closed points dropped.
 *
 * IT NEVER GROWS WHILE A QUESTION STANDS. That is the whole safety property:
 * an append swallowed into the baseline before anybody answered for it would be
 * invisible for ever afterwards, so an outstanding question, an unarmed record
 * and a torn one all leave the remembered set alone, and only an ARMED, answered
 * order takes today's open set as the new mark. Arming itself is never automatic
 * either — `--seed` is a stated decision, not a side effect.
 *
 * IT DOES SHRINK, THOUGH, AND IT HAS TO (cross-vendor review, 11.08.2026).
 * Blocking every write while a question stood also stopped CLOSED points from
 * leaving the baseline, and that lost a whole class of REOPEN. Baseline `[1, 2]`
 * with 3 outstanding: 2 lands, so the open order reads `[1, 3]` and nothing is
 * written; 2 then reopens at the end, giving `[1, 3, 2]`. The baseline still
 * remembers 2, so 2 reads as a survivor and 3 — an append nobody answered for —
 * reads as deliberately placed INSIDE it. Two questions vanish at once, and the
 * gate falls silent without anybody deciding anything.
 *
 * Dropping a closed point is the opposite of swallowing an append: the remembered
 * set only ever gets SMALLER, so the gate can only ever ask MORE. Hence the two
 * directions are separated — grow only when nothing is outstanding, shrink to
 * what is still open at every turn end. (A work order read as partial would
 * narrow the baseline wrongly; that risk is not new — the settled branch has
 * always taken the read at face value — and a read of ZERO open points, the one
 * that would erase everything, is refused outright below.)
 */
export function settleRecord(open, record, { at = '' } = {}) {
  const list = pointList(open)
  // AN EMPTY ORDER SETTLES NOTHING. A work order that momentarily reads as zero
  // open points — unreadable, half-written, a checkout mid-merge — would
  // otherwise erase the baseline, and every open point would come back as an
  // append the moment it read normally again.
  //
  // THE PRICE, TAKEN DELIBERATELY (cross-vendor review, 11.08.2026): where the
  // order really is empty, the baseline FREEZES. With a baseline of [4], closing
  // 4 leaves the order empty, 4 stays remembered for ever, and its later REOPEN
  // is never asked about — one missed question, on the last point of a finished
  // batch. The alternative costs incomparably more: an unreadable or half-written
  // read would erase the baseline and hand back EVERY open point as an append at
  // once, a block loop out of a transient file state. Nothing here can tell the
  // two apart — a genuinely finished work order and a mangled one both parse to
  // zero open points, and every rule that would separate them (does a checklist
  // heading survive, how many lines, did it shrink) is a guess about a file that
  // is by then already broken. The READER could distinguish "no TASKS.md" from
  // "TASKS.md with nothing open", and the guard already stands down on the first;
  // the second is the ambiguous one, and it stays unresolved rather than guessed.
  if (!list.length) return { changed: false, record: null }
  const state = appendGateState(list, record)
  const { ranked, settled } = normaliseRankRecord(record)
  if (state.state !== 'settled') {
    // A QUESTION STANDS, so the baseline may not take today's order — but the
    // points it remembers that are no longer OPEN are dropped all the same, or a
    // closure that happened while the question stood would let the point back in
    // unquestioned when it reopens. Shrinking can only add questions.
    if (state.state !== 'pending') return { changed: false, record: null }
    const kept = settled.points.filter((n) => list.includes(n))
    if (kept.length === settled.points.length) return { changed: false, record: null }
    // The baseline keeps its own `at`/`why`: this is the same settlement, minus
    // what has since closed, not a new one.
    const narrowed = { ...pruneRankRecord({ ranked }, list), settled: { ...settled, points: kept } }
    return { changed: true, record: narrowed }
  }
  const points = [...list].sort((a, b) => a - b)
  const next = { ...pruneRankRecord({ ranked }, list), settled: { at: String(at ?? '').trim(), points } }
  // Unchanged is unchanged — the same baseline AND the same live decisions. The
  // caller writes only on a difference, so a settled order costs no file churn.
  const sameBaseline =
    settled && settled.points.length === points.length && settled.points.every((n, i) => n === points[i])
  const sameRanked = Object.keys(next.ranked).length === Object.keys(ranked).length
  if (sameBaseline && sameRanked) return { changed: false, record: null }
  return { changed: true, record: next }
}

/** What a caller is told when it tries to write over an unreadable record. */
export const TORN_RECORD_MESSAGE =
  `${RANK_RECORD_PATH} exists but does not parse. Refusing to write: every decision it holds would be ` +
  'replaced by this one. Repair the file (or move it aside deliberately), then run the command again. ' +
  'Until then the append gate stays QUIET rather than blocking — an unreadable record is not a verdict.'

/** Record one deliberate "it stays where it is" decision (pure). */
export function recordRank(record, point, { why = '', at = '' } = {}) {
  const n = Number(point)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`not a point number: ${point}`)
  const reason = String(why ?? '').replace(/\s+/g, ' ').trim()
  if (!reason) throw new Error('--why is required — one line saying why this point belongs where it stands')
  const { ranked, settled, torn } = normaliseRankRecord(record)
  // A TORN record must never be written over (the point-530 lesson).
  if (torn) throw new Error(TORN_RECORD_MESSAGE)
  const next = { ranked: { ...ranked, [n]: { at: String(at ?? '').trim(), why: reason } } }
  return settled ? { ...next, settled } : next
}

/**
 * What `--seed` is told when it is aimed at a record that is ALREADY armed
 * (cross-vendor review, 11.08.2026).
 *
 * Arming exists for a record that has NO baseline. On an armed one it was an
 * ESCAPE HATCH straight out of the gate: the very turn the gate was blocking
 * could reseed, and every outstanding append became part of "the order as
 * judged" on one collective reason — the opposite of the one-decision-per-point
 * this whole mechanism is. The command even said so, printing "this also settles
 * …" as if it were a feature.
 *
 * It is refused on ANY armed record, not only on one with questions standing.
 * Re-seeding a settled record cannot express anything `settleRecord` has not
 * already written (the guard advances the baseline to the open set at every turn
 * end), so the only thing an allowed-but-pointless case buys is a second door
 * that has to keep being argued about.
 *
 * AND THE REFUSAL PRINTS NO WAY ROUND ITSELF (cross-vendor review, 11.08.2026).
 * It used to close by naming one: move the record aside, and the checkout reads
 * as unarmed, and `--seed` takes the whole current order — outstanding appends
 * included — on one collective reason. That is the escape hatch this message was
 * added to shut, spelled out as a procedure. A refusal states WHY it refuses and
 * what answers the question it is guarding; the removal route is closed in
 * `seedRecord` (see `REMOVED_RECORD_MESSAGE`) and named nowhere.
 */
export function alreadyArmedMessage(pending = []) {
  const head = `${RANK_RECORD_PATH} is already armed, so there is nothing to seed. `
  if (pending.length) {
    return (
      `${head}${pending.length} appended point(s) are still outstanding: ${pending.join(', ')}. Seeding would ` +
      'settle them all at once on one reason, which is exactly the decision the gate is asking for point by ' +
      `point. Each is answered on its own: MOVE its block inside TASKS.md to where it belongs, or ${RANK_CMD}`
    )
  }
  return (
    `${head}Every appended point has been decided, and the guard keeps the baseline on the open set by itself, ` +
    'so there is nothing left for an arming to state.'
  )
}

/**
 * What arming is told when the record is missing from the WORKING TREE while the
 * repository still carries it (cross-vendor review, 11.08.2026).
 *
 * `--seed` exists for a checkout that never had a baseline. The record is
 * TRACKED, so every clone inherits one and that case arises exactly once in the
 * repository's life — which means a checkout reading as unarmed today is a record
 * that was REMOVED, and removing it is precisely how an outstanding question was
 * escaped: the gate blocks, the file goes aside, the seed takes the whole current
 * order on one reason, and the appended point nobody judged is now part of "the
 * order as judged". So a record the repository knows is RESTORED, never re-armed,
 * and the caller is told the one command that does it.
 */
export const REMOVED_RECORD_MESSAGE =
  `${RANK_RECORD_PATH} is missing here, but this repository carries it — so this checkout HAS a baseline and ` +
  'is not arming a first one. A record that exists is restored, not re-armed, or every question outstanding ' +
  `when it went missing would count as answered by the arming: git checkout -- ${RANK_RECORD_PATH}`

/**
 * ARM the gate: everything standing in the order today counts as judged, with one
 * stated reason for the lot.
 *
 * This is the ONLY way a baseline comes into being — a fresh checkout would
 * otherwise owe a separate answer for every open point, which is a block loop
 * rather than a decision. It is a command somebody runs, never something the
 * guard does for itself, so an appended point can never be grandfathered by a
 * mechanism nobody watched. And it applies ONLY to a record that carries no
 * baseline yet; see `alreadyArmedMessage` for why an armed one is refused.
 *
 * `tracked` is the caller's answer to "does this repository carry the record at
 * all" (index or history — `scripts/queue-rank.mjs` asks git). It closes the
 * REMOVAL route: an unarmed reading of a record the repository knows is a file
 * that was moved aside, not a repository that never had a baseline. The caller
 * decides it because this module is pure; it FAILS CLOSED there, since the only
 * legitimate arming in a git checkout happens before the record is ever
 * committed.
 */
export function seedRecord(record, open, { why = '', at = '', tracked = false } = {}) {
  const reason = String(why ?? '').replace(/\s+/g, ' ').trim()
  if (!reason) throw new Error('--why is required — one line saying why the order as it stands is right')
  const { ranked, torn } = normaliseRankRecord(record)
  if (torn) throw new Error(TORN_RECORD_MESSAGE)
  const list = pointList(open)
  const state = appendGateState(list, record)
  if (state.state !== 'unarmed') throw new Error(alreadyArmedMessage(state.pending))
  if (tracked) throw new Error(REMOVED_RECORD_MESSAGE)
  const points = [...list].sort((a, b) => a - b)
  return {
    ...pruneRankRecord({ ranked }, list),
    settled: { at: String(at ?? '').trim(), why: reason, points },
  }
}

/** Drop decisions about points that are no longer open — the file records live
 *  judgments, not history the archive already keeps. The baseline is carried
 *  through untouched; only `settleRecord` and `seedRecord` may move it. */
export function pruneRankRecord(record, open) {
  const keep = new Set((Array.isArray(open) ? open : [...(open ?? [])]).map(Number))
  const { ranked, settled } = normaliseRankRecord(record)
  const out = {}
  for (const [key, value] of Object.entries(ranked)) if (keep.has(Number(key))) out[key] = value
  return settled ? { ranked: out, settled } : { ranked: out }
}
