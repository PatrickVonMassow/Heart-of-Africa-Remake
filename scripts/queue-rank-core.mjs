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
//   { "ranked":   { "<N>": { "at": …, "why": …, "origin": … } },  the decisions
//     "settled":  { "at": …, "points": [ … ], "why"? },  the PROVENANCE baseline —
//     "boundary": { "at": …, "points": [ … ], "why"? } } the FROZEN release front
// The baseline is the open set as it stood the last time no rank question was
// outstanding: a point is "appended since" exactly when it is missing from it,
// which is the one thing its NUMBER and its POSITION cannot tell anybody
// (`appendGateState`). The boundary is the set that stood in FRONT of the release
// point when the release rule was armed — frozen, never advanced, because a
// grandfather set that moved with the order would forgive every point moved into
// the front afterwards (`releaseBoundaryState`).
//
// THIS MODULE OWNS NO ORDER, AND IT OWNS NO POINT NUMBER. It is deliberately
// separate from board-queue-core: that module renders the queue and names the
// RELEASE point once (`RELEASE_TAG_POINT`), this one judges provenance and
// urgency, and the guard consumes both. Nothing here imports from the rendering
// side, so no import cycle can form between the ranking and the order — a second
// copy of the ORDER, or of the release number, is precisely the failure points
// 590, 608 and 789 were opened about. The one import is the URGENCY reading
// (`criticalityOf`), for the same reason: the tag convention is read in one place.
import { criticalityOf } from './criticality-review-guard-core.mjs'

/** Record the rank of a point that stays where append-and-defer put it. */
export const RANK_CMD = 'node scripts/queue-rank.mjs --ranked <N> --why "<one line>"'

/** Arm the gate: record the order as it stands today as judged, in one go. */
export const SEED_CMD = 'node scripts/queue-rank.mjs --seed --why "<one line>"'

// ---- THE RELEASE BOUNDARY (point 789) --------------------------------------
//
// The append gate above asks ONE question — is the end of the order where this
// point belongs? — and accepts both answers equally. It knows nothing about WHO
// filed the point or how urgent it is, so the machine's own tickets (drained
// findings, charged reds, review findings, guard remedies) kept ranking
// themselves in front of the release: on 20.08.2026 the user moved eight of them
// behind point 174 by hand and asked for the mechanism that stops it happening
// again ("nur bei hoher Dringlichkeit vorne … sind sie nicht so dringend, sollen
// sie hinter 174 eingereiht werden").
//
// So a SECOND question is asked, and only of a point standing BEFORE the release:
// who filed it, and does the point itself state high urgency? The user's own
// points are exempt — he ranks those himself — which is why the record keeps the
// two origins apart rather than inferring them.

/** A point the machine filed for itself: a drained finding, a charged red, a
 *  review finding, a guard remedy — anything the user did not ask for. */
export const ORIGIN_MACHINE = 'machine'

/** A point the user asked for in so many words. He ranks it himself. */
export const ORIGIN_USER = 'user'

/** The two origins the record keeps apart. An entry naming neither reads as
 *  MACHINE: the exemption must be claimed, never inherited by omission. */
export const ORIGINS = Object.freeze([ORIGIN_MACHINE, ORIGIN_USER])

/** Record a machine-filed point's place ahead of the release, with its reason. */
export const URGENT_RANK_CMD =
  'node scripts/queue-rank.mjs --ahead <N> --why "<why it cannot wait for the release>"'

// EACH GATE NEEDS ITS OWN DECISION, NOT ANY DECISION (cross-vendor review,
// 21.08.2026). A rank entry used to be one undifferentiated "somebody judged
// this", and the two gates read the same field — so a point answered with "last
// is right", then MOVED in front of the release, arrived carrying a reason that
// says nothing about the front, and the boundary let it through. The reverse
// holds just as well: a front reason must not answer the append question after
// the point drops back to the end. So the entry records WHICH placement was
// decided, and each gate accepts only its own.

/** The append gate's answer: the end of the order is where this point belongs. */
export const PLACE_LAST = 'last'

/** The release rule's answer: it stands in FRONT of the release, and why. */
export const PLACE_AHEAD = 'ahead'

/** The placements a decision can be about. An entry naming neither is `last` —
 *  the only thing `--ranked` ever meant before the release rule existed. */
export const PLACES = Object.freeze([PLACE_LAST, PLACE_AHEAD])

/** Record that a point standing in FRONT of the release is the USER's own
 *  ranking. It is a decision about the FRONT like any other, so it is recorded
 *  as one: an exemption inherited from a "last is right" entry would cross the
 *  two gates in both directions (cross-vendor review, 21.08.2026). */
export const USER_RANK_CMD = 'node scripts/queue-rank.mjs --ahead <N> --origin user --why "<one line>"'

/** Arm the release rule: freeze the front of the order as it stands today. */
export const BOUNDARY_SEED_CMD = 'node scripts/queue-rank.mjs --seed-boundary --why "<one line>"'

/**
 * The blocking conditions a point may NAME instead of carrying the tag — the
 * four the spec enumerates, and no more. They are matched narrowly and in
 * ENGLISH only, because the work order is written in English and a loose cue
 * here does not block a turn, it EXCUSES one: every pattern that fires lets a
 * machine-filed point stand in front of the release.
 */
export const BLOCKING_PATTERNS = Object.freeze([
  /\bstops?\s+the\s+batch\b/i,
  /\bblocks?\s+(?:a|the|every|another)\s+lane\b/i,
  /\bblocks?\s+(?:the\s+)?release\b/i,
  // THE QUALIFICATION IS PART OF THE CONDITION, IN FULL (cross-vendor review,
  // 21.08.2026, twice). A bare "holds a red" matched "it holds a red
  // temporarily, but the red can otherwise close"; stopping at "cannot" then
  // matched "holds a red that cannot reproduce the defect". Both are the
  // opposite of what the spec names, and every pattern here EXCUSES a point
  // rather than blocking one, so the whole condition is required.
  /\bholds?\s+a\s+red\s+(?:that\s+|which\s+)?cannot\s+(?:otherwise\s+)?close\b/i,
])

/**
 * A DENIED blocking condition is not a blocking condition. Point bodies are
 * written as measurements, and the most natural way to say a defect is bearable
 * is to name what it does NOT do — "this does not stop the batch", "nothing
 * blocks the release". Read as a claim, such a sentence would excuse exactly the
 * point the rule exists to place behind the release, so a match is dropped when
 * a negation stands close in front of it.
 */
const NEGATION_CUE = /\b(?:not|never|nothing|cannot|can't|won't|doesn't|without|neither|nor|no)\b/i

/** How far in front of a match a negation still governs it. */
const NEGATION_WINDOW = 60

/**
 * Where a preceding clause ENDS — a full stop, a semicolon, a colon, or the
 * contrast words that flip a sentence back to a claim.
 *
 * A COMMA IS NOT ONE, AND NEITHER IS A NEWLINE (cross-vendor review,
 * 21.08.2026). Both were, and both let a plain denial through: "It does not, in
 * practice, stop the batch" put the negation behind the last comma, and every
 * point body in this work order is HARD-WRAPPED, so "does not\nstop the batch"
 * had a line break sitting between the two halves of one clause. Read as claims,
 * those sentences excuse exactly the point the rule exists to place behind the
 * release.
 */
const CLAUSE_END = /[.;:!?—]|\bbut\b|\bhowever\b/gi

/**
 * The words standing in front of a match inside its OWN clause, on one line.
 *
 * The text is whitespace-collapsed first, so a wrap can never separate a
 * negation from what it denies, and only a real clause end cuts the window: a
 * negation binds to the clause it stands in, and "it does not block a lane, but
 * it stops the batch" states the second condition outright.
 */
function clauseBefore(text, at) {
  const window = text.slice(Math.max(0, at - NEGATION_WINDOW), at)
  const breaks = [...window.matchAll(CLAUSE_END)]
  const last = breaks.length ? breaks[breaks.length - 1].index + breaks[breaks.length - 1][0].length : 0
  return window.slice(last)
}

/**
 * The rest of the match's own clause — because a negation can stand AFTER what it
 * denies (cross-vendor review, 21.08.2026): «"blocks the release" is not the
 * observed failure» reads as a claim to anything that only looks backwards.
 */
function clauseAfter(text, at) {
  const window = text.slice(at, at + NEGATION_WINDOW)
  const end = window.search(CLAUSE_END)
  return end < 0 ? window : window.slice(0, end)
}

/**
 * Does the point itself STATE high urgency?
 *
 * Two readings, both off the point's own text and never off an impression: the
 * `Criticality: high` tag every point carries (read by the one parser that owns
 * that convention), or one of the blocking conditions named above. A point
 * stating neither is not high — that is the whole decision, and it is the reason
 * the answer cannot be argued into the record by whoever files the point.
 *
 * THE RESIDUAL, STATED RATHER THAN CHASED (cross-vendor review, fourth pass).
 * This reads English prose by cue, and no cue list closes every construction: a
 * denial split across sentences — "Does it block the release? No." — still reads
 * as a claim. The regress stops here because of what a wrong reading can and
 * cannot do. It CANNOT let a point through: reading it as high only moves the
 * refusal from `not-high` to `unrecorded`, and the gate still demands an explicit
 * `--ahead` decision with a stated reason before anything stands in front of the
 * release. So the worst a false reading costs is a refusal that names the other
 * remedy first — and a human recording a front reason for a point that is not
 * urgent is an edit to a TRACKED record under review, which is where this file
 * puts that class of question everywhere else.
 */
export function statesHighUrgency(body) {
  const raw = String(body ?? '')
  if (criticalityOf(raw).level === 'high') return true
  // ONE LINE, whatever the point's wrapping: the reading below is about words in
  // front of words, and a hard wrap is not a break in the sentence.
  const text = raw.replace(/\s+/g, ' ')
  return BLOCKING_PATTERNS.some((re) => {
    // EVERY occurrence, not the first: a body that denies one blocking condition
    // and names another states the second one all the same.
    for (const m of text.matchAll(new RegExp(re.source, `${re.flags.replace(/g/g, '')}g`))) {
      // The clause AROUND the match, minus the matched words themselves — the
      // condition's own "cannot" must not read as a denial of the condition.
      const clause = `${clauseBefore(text, m.index)} ${clauseAfter(text, m.index + m[0].length)}`
      if (!NEGATION_CUE.test(clause)) return true
    }
    return false
  })
}

/** Where the deliberate "last is right" decisions AND the provenance baseline are
 *  recorded (TRACKED, not runtime state: both are repository history, and a clone
 *  that inherited neither would re-ask about every point ever appended). */
export const RANK_RECORD_PATH = '.claude/queue-rank.json'

/** Put the tracked record back — from HEAD, NOT from the index (cross-vendor
 *  review, fifth pass). `git checkout -- <path>` restores the INDEX copy, which a
 *  staged `git rm` has already removed and a half-repaired index still holds
 *  broken; naming HEAD covers a plain delete, a staged one and a damaged index
 *  alike, so the remedy a refusal prints actually ends the refusal. */
export const RESTORE_CMD = `git checkout HEAD -- ${RANK_RECORD_PATH}`

/**
 * Where to look when nothing in git holds a READABLE copy — the state itself,
 * rather than a restore command that cannot work.
 */
export const INSPECT_CMD = `git log --oneline -- ${RANK_RECORD_PATH}`

/**
 * Does the repository carry the record, and what puts it back — decided from what
 * git ANSWERED, so the decision is pure and swept by the unit layer rather than
 * only by a live repository (cross-vendor reviews, sixth to eighth pass).
 *
 * TWO QUESTIONS, KEPT APART. Whether the record is CARRIED decides whether arming
 * is refused, and ANY entry answers it — an unmerged conflict side or an
 * intent-to-add stub is no restorable copy, but it is proof the repository has
 * the record, and reading it as "never carried" reopens the removal route arming
 * was closed against. Which command RESTORES it is the other question, and only a
 * copy that actually PARSES may be named: a remedy handing back torn bytes moves
 * the caller from one refusal into the next, and a staged-but-malformed record is
 * exactly that. So the caller reports what each candidate HOLDS — `headOk`,
 * `indexOk`, `removedIn` (the commit that removed a readable copy) — plus
 * `known`, and where nothing readable can be named the answer is
 * carried-but-unrecoverable: arming stays refused and the caller is pointed at
 * the state instead of at a command.
 */
export function recordProvenanceFrom({ headOk = false, indexOk = false, removedIn = '', known = false } = {}) {
  // THE STAGED COPY COMES FIRST (cross-vendor review, eleventh pass). Preferring
  // HEAD restored an OLDER record over a newer staged one and silenced the gate
  // with it: HEAD remembers [1, 2], point 2 closes and the narrowed [1] is
  // staged, 2 reopens, the working copy is lost — and `git checkout HEAD` would
  // put 2 back into the baseline, so the reopen is never asked about. The index
  // is what the next commit would record, so it is never the staler of the two.
  if (indexOk) return { tracked: true, restore: `git checkout -- ${RANK_RECORD_PATH}` }
  if (headOk) return { tracked: true, restore: RESTORE_CMD }
  const at = String(removedIn ?? '').trim()
  // The parent of the commit that removed it — and only where that really is an
  // object id, since a guessed revision is another command that cannot work.
  // SHA-256 repositories name 64 hex digits, SHA-1 ones 40.
  if (/^[0-9a-f]{7,64}$/i.test(at)) return { tracked: true, restore: `git checkout ${at}^ -- ${RANK_RECORD_PATH}` }
  if (known) return { tracked: true, restore: '' }
  return { tracked: false, restore: RESTORE_CMD }
}

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

/**
 * The stored shape, carrying exactly the parts that exist.
 *
 * EVERY WRITER GOES THROUGH IT. The record grew a third part (`boundary`) and
 * five functions rebuild the record from destructured halves; one of them
 * forgetting the new part would silently drop a frozen decision, which is the
 * failure mode this file spends most of its length guarding against.
 */
function storedRecord({ ranked = {}, settled = null, boundary = null } = {}) {
  const out = { ranked }
  if (settled) out.settled = settled
  if (boundary) out.boundary = boundary
  return out
}

/** A stored point set with its stamp — the shape both `settled` and `boundary`
 *  have — or null if the raw value is not one. */
function normalisePointSet(raw) {
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
    // ONE LINE MEANS ONE LINE (cross-vendor review, 21.08.2026). `recordRank`
    // collapses the reason it is handed, but the record is TRACKED and
    // hand-editable, so a pasted or merged entry could carry a whole paragraph
    // and still satisfy every "the reason is recorded" check. Collapsing here
    // makes the rule true of the file rather than of one writer.
    const why = str(value.why).replace(/\s+/g, ' ')
    if (!why) continue
    // AN UNKNOWN ORIGIN IS NO ORIGIN, and no origin reads as the machine's
    // (see `originOf`). Dropping the field rather than keeping the odd string
    // means a typo — `--origin users` — can never be mistaken for the exemption.
    const origin = ORIGINS.includes(str(value.origin)) ? str(value.origin) : ''
    // An unknown or absent placement is `last`: that is what every entry written
    // before the release rule existed meant, and it is the reading that grants
    // nothing — the front has to be claimed in so many words.
    const place = PLACES.includes(str(value.place)) ? str(value.place) : PLACE_LAST
    ranked[n] = origin ? { at: str(value.at), why, origin, place } : { at: str(value.at), why, place }
  }
  // NOT `src.torn`: the flag is read off the parser's mark, so a record can never
  // declare itself unreadable and silence the gate.
  const torn = raw !== null && raw !== undefined && raw[PARSER_TORN] === true
  const out = { ranked, settled: normalisePointSet(src.settled), boundary: normalisePointSet(src.boundary), torn }
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
  const empty = { ranked: {}, settled: null, boundary: null, torn: false }
  const broken = markTorn({ ranked: {}, settled: null, boundary: null, torn: true })
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
  if ('settled' in parsed && !normalisePointSet(parsed.settled)) return broken
  // The FROZEN release boundary is read the same way and for the same reason: a
  // present-but-unreadable one would turn a damaged file into a clean-slate
  // exemption, which is the silencing route every rule here is closed against.
  if ('boundary' in parsed && !normalisePointSet(parsed.boundary)) return broken
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
  // …and symmetrically: a FRONT reason does not answer the append question once
  // the point has dropped back to the end of the order.
  const pending = appended.filter((n) => !ranked[n] || ranked[n].place === PLACE_AHEAD)
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
 * THE RELEASE BOUNDARY (point 789): which points stand in front of the release
 * that have not earned the place.
 *
 * `releasePoint` is handed in — this module never spells the number, so the
 * repository keeps naming it once (`RELEASE_TAG_POINT`) — and the boundary is
 * read from where that point CURRENTLY stands in the order it is shown, never
 * from a stored index. Re-sequencing the work order therefore moves the boundary
 * with it, and a release point that has closed leaves no boundary at all.
 *
 * THE GRANDFATHER SET IS FROZEN, NOT THE MOVING BASELINE (cross-vendor review,
 * 21.08.2026). The first cut exempted every point the PROVENANCE baseline
 * remembered, which reads right for one turn and is a bypass ever after: the
 * baseline advances at every turn end, so a machine point settled anywhere in the
 * order could afterwards be MOVED in front of the release and the rule stayed
 * silent — the very act it exists to refuse, done in two turns instead of one.
 * The exemption is therefore the `boundary` set, written ONCE by an arming and
 * never advanced: exactly the points that stood in front of the release when the
 * rule landed. Everything else in front of it is judged, whenever it got there.
 *
 * `bodies` is `{ <point>: '<the point block text>' }`; a point with no body
 * supplied states nothing, and a point stating nothing is not high.
 *
 * Returns `{ state, breaches, ahead }`:
 *   - `torn`        the record cannot be read — no verdict, the guard is quiet;
 *   - `unarmed`     no frozen front was ever recorded, so nothing can tell the
 *                   legacy order from a point that pushed in front afterwards.
 *                   The rule ASKS for the arming rather than falling silent;
 *   - `no-boundary` the release point is not in the order (it closed) — there is
 *                   no front to earn;
 *   - `breach`/`ok` the judgment itself.
 * `ahead` is the open points standing in front of the release — what an arming
 * freezes — and `breaches` is `[{ point, cause }]`, `cause` being:
 *   - `not-high`   the point states neither the high tag nor a blocking
 *                  condition, so no reason CAN be recorded for it;
 *   - `unrecorded` it does state high urgency, but nothing in the record says so
 *                  in one line, and an urgency nobody wrote down is an impression.
 */
export function releaseBoundaryState(open, record, { releasePoint, bodies = {} } = {}) {
  const quiet = (state) => ({ state, breaches: [], ahead: [] })
  const list = pointList(open)
  const release = Number(releasePoint)
  if (!Number.isInteger(release)) return quiet('no-boundary')
  const at = list.indexOf(release)
  if (at < 0) return quiet('no-boundary')
  const { ranked, boundary, torn } = normaliseRankRecord(record)
  if (torn) return quiet('torn')
  const ahead = list.slice(0, at)
  if (!boundary) return { state: 'unarmed', breaches: [], ahead }
  const grandfathered = new Set(boundary.points)
  const breaches = []
  for (const n of ahead) {
    if (grandfathered.has(n)) continue
    // ONLY a decision about the FRONT counts here — a "last is right" reason
    // carried forward by a later move explains nothing about standing here, and
    // that holds for the USER's exemption exactly as it holds for the urgency.
    const entry = ranked[n]
    const front = entry && entry.place === PLACE_AHEAD ? entry : null
    if (front && front.origin === ORIGIN_USER) continue
    if (!statesHighUrgency(bodies[n])) breaches.push({ point: n, cause: 'not-high' })
    else if (!front) breaches.push({ point: n, cause: 'unrecorded' })
  }
  return { state: breaches.length ? 'breach' : 'ok', breaches, ahead }
}

/** Just the breaches — what the settle must freeze on and the guard reports. */
export function releaseBoundaryBreaches(open, record, options = {}) {
  return releaseBoundaryState(open, record, options).breaches
}

/**
 * What the release rule is told where no front was ever frozen.
 *
 * It does NOT fall silent there, for the reason the append gate does not either:
 * a clean-slate exemption is how a damaged or half-merged record swallows the
 * whole question. One arming states, once, which points were standing in front of
 * the release when the rule landed; everything that arrives there afterwards is
 * judged on its own.
 */
export const boundaryUnarmedMessage = (ahead = [], releasePoint) =>
  `RELEASE BOUNDARY NOT ARMED: nothing records which points stood in front of point ${releasePoint} when the ` +
  'rule landed, so no check can tell that order from a point that pushed its way in front afterwards. Arm it ' +
  `once, for the whole front at once (${ahead.length} point(s) today) — ${BOUNDARY_SEED_CMD} — and every point ` +
  'that reaches the front after that is judged on its own.'

/** What an arming is told when the front is already frozen. Re-arming would
 *  grandfather exactly the points the rule is currently refusing. */
export const boundaryArmedMessage = (points = []) =>
  `${RANK_RECORD_PATH} already carries a frozen release front (${points.length} point(s)), so there is nothing ` +
  'to arm. Re-arming would take whatever stands in front of the release TODAY as legacy order — including every ' +
  'point the rule is refusing right now, which is the one thing the freeze exists to prevent.'

/**
 * Freeze the front of the order: the points standing in front of the release
 * point today count as the legacy arrangement.
 *
 * Like `seedRecord`, it is a command somebody RUNS with a stated reason, never
 * something a guard does for itself — an automatic freeze would grandfather the
 * breach it was looking at. It is refused on an already-armed record for the same
 * reason, and refused where the release point is not in the order at all, because
 * a front nobody can see is not a front anybody may freeze.
 *
 * AND THE REMOVAL ROUTE IS CLOSED THE SAME WAY (cross-vendor review, 21.08.2026).
 * "Armed once" read off the record alone is armed-until-somebody-deletes-it: the
 * gate refuses, the record goes aside, the arming takes today's front — breaches
 * and all — as legacy order. So this writer is handed the same evidence
 * `seedRecord` gets: a record the repository CARRIES but the checkout is MISSING
 * was moved aside, not never written, and arming is refused with the restore
 * named. The deliberate residual is identical too, and it is the one this whole
 * file accepts: deleting the `boundary` PART out of a present record cannot be
 * told from a legitimate edit by any mechanism here — the record is TRACKED, and
 * what answers that is the diff under review.
 */
export function seedBoundary(
  record,
  open,
  { releasePoint, why = '', at = '', tracked = false, present = true, restore = RESTORE_CMD } = {},
) {
  const reason = String(why ?? '').replace(/\s+/g, ' ').trim()
  if (!reason) throw new Error('--why is required — one line saying why the front as it stands is the legacy order')
  const { ranked, settled, boundary, torn } = normaliseRankRecord(record)
  if (torn) throw new Error(TORN_RECORD_MESSAGE)
  if (boundary) throw new Error(boundaryArmedMessage(boundary.points))
  if (tracked && !present) throw new Error(removedRecordMessage(restore))
  const state = releaseBoundaryState(open, { ranked, settled }, { releasePoint })
  if (state.state === 'no-boundary') {
    throw new Error(
      `point ${releasePoint} is not in the open work order, so there is no front to freeze. Arm the boundary ` +
        'while the release point stands in the order it is the boundary of.',
    )
  }
  const points = [...state.ahead].sort((a, b) => a - b)
  return storedRecord({ ranked, settled, boundary: { at: String(at ?? '').trim(), why: reason, points } })
}

/**
 * The refusal, naming BOTH remedies for every breach — moving the block behind
 * the release point, or recording the reason — because a refusal that names only
 * the one it prefers is a refusal the reader argues with instead of ending.
 *
 * The `not-high` half deliberately names the move FIRST and the record second:
 * a point that states no urgency cannot honestly record one, so the second
 * remedy there is to say so IN THE POINT — raise its criticality tag or name the
 * blocking condition — rather than in the rank record.
 */
export function releaseBoundaryMessage(breaches, releasePoint) {
  const list = Array.isArray(breaches) ? breaches : []
  if (!list.length) return ''
  const of = (cause) => list.filter((b) => b && b.cause === cause).map((b) => b.point)
  const notHigh = of('not-high')
  const unrecorded = of('unrecorded')
  const parts = [
    `MACHINE-FILED POINT IN FRONT OF THE RELEASE: point(s) ${list.map((b) => b.point).join(', ')} stand before ` +
      `point ${releasePoint} without having earned the place. The user ruled on 20.08.2026 that a point the ` +
      'MACHINE files itself — a drained finding, a charged red, a review finding, a guard remedy — is ranked by ' +
      'its urgency, and only a high one may stand before the release.',
  ]
  if (notHigh.length) {
    parts.push(
      `Point(s) ${notHigh.join(', ')} state neither "Criticality: high" nor a blocking condition (it stops the ` +
        'batch, blocks a lane or the release, or holds a red that cannot otherwise close), so no urgency can be ' +
        `recorded for them: MOVE the block inside TASKS.md to BEHIND point ${releasePoint}, or — if it truly is ` +
        'urgent — say so IN THE POINT and rank it there.',
    )
  }
  if (unrecorded.length) {
    parts.push(
      `Point(s) ${unrecorded.join(', ')} do state high urgency, but nothing records why they cannot wait: MOVE ` +
        `the block inside TASKS.md to BEHIND point ${releasePoint}, or record the reason in one line — ` +
        `${URGENT_RANK_CMD}.`,
    )
  }
  // THE MOVE IS NOT THE WHOLE REMEDY, AND SAYING SO IS THIS MECHANISM'S JOB
  // (cross-vendor review, 21.08.2026). Behind the release is often the END of the
  // order, which is where append-and-defer puts a point — so the append gate asks
  // its own question about the same block the moment it lands there. A refusal
  // that names a remedy leading straight into the next refusal is a refusal the
  // reader cannot close.
  parts.push(
    `A point the USER asked for is exempt, and says so: ${USER_RANK_CMD}. And where the move lands the block at ` +
      `the END of the order, the append gate asks about that placement in the same turn — answer it with ` +
      `${RANK_CMD}.`,
  )
  return parts.join(' ')
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
 * either — `--seed` is a stated decision, not a side effect. `blocked` extends
 * the same freeze to a question this module cannot see for itself: the
 * release-boundary breaches the caller found (point 789).
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
 * always taken the read at face value — and a read of ZERO open points, where
 * absence would erase everything, shrinks on the TICK instead, see below.)
 */
export function settleRecord(open, record, { at = '', closed = [], blocked = [] } = {}) {
  const list = pointList(open)
  const { ranked, settled, boundary, torn } = normaliseRankRecord(record)
  if (torn || !settled) return { changed: false, record: null }
  // AN EMPTY ORDER ADVANCES NOTHING — a work order that momentarily reads as zero
  // open points (unreadable, half-written, a checkout mid-merge) would otherwise
  // erase the baseline, and every open point would come back as an append the
  // moment it read normally again. ABSENCE proves nothing here: a genuinely
  // finished work order and a mangled one parse alike.
  //
  // A TICK DOES PROVE SOMETHING, THOUGH (cross-vendor review, sixth pass). This
  // used to end in a documented price — baseline [4], 4 closes, the order reads
  // empty, 4 stays remembered for ever and its REOPEN is never asked about. The
  // way out is not a better guess about an empty file but different evidence:
  // the work order STATES that a point is finished, by ticking it and moving it
  // into the archive, and a point the work order calls finished leaves the
  // baseline whatever the open order looks like. A half-written file cannot
  // fabricate a tick — it can only fail to show one, which drops nothing and
  // leaves the freeze exactly as it was. The caller supplies the ticks (the
  // guard reads the archive only in this case, which is the only one that needs
  // it — 1.3 MB at every turn end for a question that never arises otherwise).
  //
  // THE RESIDUAL, and why it is not closed further (cross-vendor review, seventh
  // pass): this — like every rule here — reads the state it is SHOWN. Where a
  // point closes and reopens without one readable observation in between, the
  // transition is not seen and the reopen is not asked about. Widening the rule
  // to "an empty order empties the baseline" would close it and reopen something
  // far worse: a mangled TASKS.md reads as zero open points too, so the baseline
  // would be erased on a transient bad read and EVERY open point would come back
  // as an append — the block loop this file keeps refusing to build. Confirmed
  // finished is therefore the only thing dropped, and the residual stays with a
  // test that states it.
  if (!list.length) {
    const finished = new Set(pointList(closed))
    const kept = settled.points.filter((n) => !finished.has(n))
    if (kept.length === settled.points.length) return { changed: false, record: null }
    const live = {}
    for (const [key, value] of Object.entries(ranked)) if (!finished.has(Number(key))) live[key] = value
    // The FROZEN FRONT loses the same PROVEN-CLOSED points, and nothing else
    // (cross-vendor review, 21.08.2026). Carrying it through untouched here kept
    // a grandfathered point exempt through a close-and-reopen that happened
    // while the order read empty — the very transition the tick evidence exists
    // to catch. Absence still narrows nothing: only a tick drops anything.
    const front = boundary ? { ...boundary, points: boundary.points.filter((n) => !finished.has(n)) } : boundary
    return storedChange({ ranked: live, settled: { ...settled, points: kept }, boundary: front })
  }
  const state = appendGateState(list, record)
  // A RELEASE-BOUNDARY BREACH FREEZES THE BASELINE EXACTLY AS AN UNRANKED APPEND
  // DOES (point 789), and it has to. The breaching point is NEW, and the baseline
  // is what makes it new: advancing it at the turn end that first saw the breach
  // would remember the point as a survivor and the rule would never look at it
  // again — a gate with a one-turn life, which is no gate. The caller names the
  // points (this module is not shown the release position here), and the answer
  // is the same freeze: shrink to what is still open, grow nothing.
  const held = pointList(blocked).filter((n) => list.includes(n))
  if (state.state !== 'settled' || held.length) {
    // A QUESTION STANDS, so the baseline may not take today's order — but the
    // points it remembers that are no longer OPEN are dropped all the same, or a
    // closure that happened while the question stood would let the point back in
    // unquestioned when it reopens. Shrinking can only add questions.
    // Torn and unarmed are already answered above; naming them again keeps this
    // branch total should `appendGateState` ever learn a fourth state.
    if (state.state === 'torn' || state.state === 'unarmed') return { changed: false, record: null }
    const kept = settled.points.filter((n) => list.includes(n))
    // NO INFERRED DECISION IS EVER WRITTEN DOWN (cross-vendor reviews, fifth and
    // eighth pass — they pull in opposite directions and this is the resolution).
    // The fifth pass observed that "stands ahead of a remembered point" is a
    // decision read off a NEIGHBOUR, and the neighbour can close: baseline [1, 2]
    // with 3 moved to [1, 3, 2] and 4 outstanding reads correctly until 2 lands,
    // and [1, 3, 4] then asks a second time for a placement somebody made. It was
    // fixed by recording the placement — and the eighth pass showed what that
    // costs: the same inference from a TRANSIENT view (a half-written file, an
    // order mid-move, a checkout mid-merge) would be frozen into a permanent
    // decision nobody took, and the gate would never ask about that point again.
    // An extra question costs ONE command and is always answerable; a silent
    // permanent exemption is the failure this whole mechanism exists to prevent.
    // So a placement stays a live reading, and only a HUMAN writes a decision.
    if (kept.length === settled.points.length) return { changed: false, record: null }
    // The baseline keeps its own `at`/`why`: this is the same settlement, minus
    // what has since closed, not a new one.
    return storedChange({ ...pruneRankRecord({ ranked, boundary }, list), settled: { ...settled, points: kept } })
  }
  const points = [...list].sort((a, b) => a - b)
  const next = { ...pruneRankRecord({ ranked, boundary }, list), settled: { at: String(at ?? '').trim(), points } }
  // Unchanged is unchanged — the same baseline AND the same live decisions. The
  // caller writes only on a difference, so a settled order costs no file churn.
  const sameBaseline =
    settled && settled.points.length === points.length && settled.points.every((n, i) => n === points[i])
  const sameRanked = Object.keys(next.ranked).length === Object.keys(ranked).length
  // The frozen front SHRINKS with the order too, so an unchanged verdict has to
  // ask about it as well — otherwise a narrowing was computed and never written.
  const sameBoundary = !boundary || (next.boundary?.points.length ?? 0) === boundary.points.length
  if (sameBaseline && sameRanked && sameBoundary) return { changed: false, record: null }
  return { changed: true, record: next }
}

/**
 * What a caller is told when it tries to write over an unreadable record.
 *
 * IT NAMES THE RESTORE THE CALLER ESTABLISHED (cross-vendor review, ninth pass).
 * A fixed `git checkout HEAD -- …` is wrong wherever HEAD has no copy, or holds
 * the damaged bytes itself; the caller that can ask git says which source has a
 * readable record, exactly as the arming refusal does, and where none has, it
 * says to repair the file rather than printing a command that cannot work.
 */
export const tornRecordMessage = (restore = RESTORE_CMD) =>
  `${RANK_RECORD_PATH} exists but does not parse. Refusing to write: every decision it holds would be ` +
  'replaced by this one. ' +
  (restore
    ? `Restore a readable copy — ${restore} — or repair the bytes by hand, then run the command again. `
    : `No copy of it in git parses either (${INSPECT_CMD}), so repair the bytes by hand, then run the ` +
      'command again. ') +
  'Until then the append gate stays QUIET rather than blocking: an unreadable record is not a verdict, so ' +
  'this command is the loud half.'

/** The same refusal where nothing established a better restore — the pure layer's
 *  default, kept as a constant because `recordRank`/`seedRecord` throw it without
 *  ever asking git. */
export const TORN_RECORD_MESSAGE = tornRecordMessage()

/**
 * Record one deliberate placement decision (pure) — "it stays where it is" for
 * the append gate, and, since point 789, WHO placed it there.
 *
 * The origin is stated, never inferred: an omitted one is recorded as the
 * machine's, so the user's exemption can only ever be claimed out loud. An
 * unknown word is refused rather than dropped — a rejected `--origin users`
 * would otherwise be silently recorded as machine work and read as a decision.
 */
export function recordRank(record, point, { why = '', at = '', origin = ORIGIN_MACHINE, place = PLACE_LAST } = {}) {
  const n = Number(point)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`not a point number: ${point}`)
  const reason = String(why ?? '').replace(/\s+/g, ' ').trim()
  if (!reason) throw new Error('--why is required — one line saying why this point belongs where it stands')
  const who = String(origin ?? '').trim() || ORIGIN_MACHINE
  if (!ORIGINS.includes(who)) throw new Error(`--origin must be ${ORIGINS.join(' or ')} — got "${origin}"`)
  const where = String(place ?? '').trim() || PLACE_LAST
  if (!PLACES.includes(where)) throw new Error(`place must be ${PLACES.join(' or ')} — got "${place}"`)
  const { ranked, settled, boundary, torn } = normaliseRankRecord(record)
  // A TORN record must never be written over (the point-530 lesson).
  if (torn) throw new Error(TORN_RECORD_MESSAGE)
  return storedRecord({
    ranked: { ...ranked, [n]: { at: String(at ?? '').trim(), why: reason, origin: who, place: where } },
    settled,
    boundary,
  })
}

/**
 * Who filed a point, as the record has it — MACHINE wherever nothing says
 * otherwise.
 *
 * That default is the whole safety property of the exemption: a point with no
 * record at all, a record entry written before origins existed, and one whose
 * origin did not survive normalisation all read the same way, so nothing can
 * acquire the user's exemption by being old, damaged or silent.
 */
export function originOf(record, point) {
  const { ranked } = normaliseRankRecord(record)
  const entry = ranked[Number(point)]
  return entry && entry.origin === ORIGIN_USER ? ORIGIN_USER : ORIGIN_MACHINE
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
export const removedRecordMessage = (restore = RESTORE_CMD) =>
  `${RANK_RECORD_PATH} is missing here, but this repository carries it — so this checkout HAS a baseline and ` +
  'is not arming a first one. A record that exists is restored, not re-armed, or every question outstanding ' +
  'when it went missing would count as answered by the arming: ' +
  // No readable copy anywhere in git: naming a restore that cannot work would
  // only walk the caller into the next refusal, so name the state instead.
  (restore || `no copy of it in git parses as a record — see what is there (${INSPECT_CMD}) and recover it first`)

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
 * all" (any index entry or any history — `scripts/queue-rank.mjs` asks git), and
 * `present` whether the file is in the working tree at all. Together they close
 * the REMOVAL route: a record the repository knows, MISSING from the checkout,
 * was moved aside — not a repository that never had a baseline. The caller
 * decides both because this module is pure, and `tracked` FAILS CLOSED there.
 *
 * IT IS THE REMOVAL THAT IS REFUSED, NOT A BROKEN RECORD (cross-vendor review,
 * ninth pass). Refusing every tracked record made a PRESENT one that carries no
 * baseline unanswerable: the guard blocks as unarmed, `--ranked` cannot create a
 * baseline and arming was refused, with no command left to run. A record that is
 * THERE is armed normally. That is the deliberate boundary of this gate: it
 * defends against the append DEFAULT going unnoticed, not against somebody
 * editing the tracked record — blanking `settled` by hand and writing a point
 * into it are the same act, no mechanism here can tell them from a legitimate
 * edit, and what answers them is the diff of a tracked file under review.
 */
export function seedRecord(
  record,
  open,
  { why = '', at = '', tracked = false, present = true, restore = RESTORE_CMD } = {},
) {
  const reason = String(why ?? '').replace(/\s+/g, ' ').trim()
  if (!reason) throw new Error('--why is required — one line saying why the order as it stands is right')
  const { ranked, boundary, torn } = normaliseRankRecord(record)
  if (torn) throw new Error(TORN_RECORD_MESSAGE)
  const list = pointList(open)
  const state = appendGateState(list, record)
  if (state.state !== 'unarmed') throw new Error(alreadyArmedMessage(state.pending))
  if (tracked && !present) throw new Error(removedRecordMessage(restore))
  const points = [...list].sort((a, b) => a - b)
  return {
    ...pruneRankRecord({ ranked, boundary }, list),
    settled: { at: String(at ?? '').trim(), why: reason, points },
  }
}

/**
 * Drop decisions about points that are no longer open — the file records live
 * judgments, not history the archive already keeps. The baseline is carried
 * through untouched; only `settleRecord` and `seedRecord` may move it.
 *
 * THE FROZEN FRONT SHRINKS HERE TOO, and only ever shrinks. A grandfathered point
 * that CLOSES must leave, or its reopen would walk back into the front carrying
 * an exemption nobody granted it — the same reasoning that makes the baseline
 * shrink. It can never grow: only an arming writes it, and only once. An EMPTY
 * open order narrows nothing, because absence proves nothing about a work order.
 */
export function pruneRankRecord(record, open) {
  const list = Array.isArray(open) ? open : [...(open ?? [])]
  const keep = new Set(list.map(Number))
  const { ranked, settled, boundary } = normaliseRankRecord(record)
  const out = {}
  for (const [key, value] of Object.entries(ranked)) if (keep.has(Number(key))) out[key] = value
  const front =
    boundary && list.length ? { ...boundary, points: boundary.points.filter((n) => keep.has(n)) } : boundary
  return storedRecord({ ranked: out, settled, boundary: front })
}

/** A settle result that carries the whole record shape, so no writer here can
 *  drop a part by rebuilding it from halves. */
function storedChange(parts) {
  return { changed: true, record: storedRecord(parts) }
}
