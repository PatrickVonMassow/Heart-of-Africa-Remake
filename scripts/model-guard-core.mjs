// Pure decision core of the serving-model tripwire (point 309). rule:model-policy@740d83c2
// On 24.07.2026 the session silently degraded to Haiku 4.5 and merged defective work.
// The Co-Authored-By field in `git log` is the mechanical record of which MODEL
// authored a commit. A reviewer uses the distinct Reviewed-By key and therefore
// never enters this author record. This module only decides — no I/O; the
// gathering and blocking live in the fail-open wrapper scripts/model-guard.mjs.
//
// Model policy (users 25.07.2026 / 13.08.2026 / 18.08.2026): ONLY the lanes of
// scripts/model-lanes.mjs may run the batch — the main chain (and its fallback
// model), the cross-vendor lane, and the scarce lane while the shared lane switch
// admits it. Every other model — Sonnet and Haiku included — is a policy breach:
// the batch must stop rather than run on it. Hence an ALLOWLIST, not a Haiku
// blocklist: an unknown future model name fails closed. The list names the lane
// FAMILIES, not pinned versions — deliberately, see the note at `ALLOWED` — so a
// point release inside a lane's family passes; what the tripwire is bought
// against is the silent swap to another family.
//
// THE CROSS LANE AUTHORS UNDER A ROLE SWAP (point 667). Where it authors, the main
// chain reviews, runs the suites, judges the picture and lands — so the change is
// still seen by two vendors and no model reviews its own work. Admitting that lane
// as an author is therefore the ONE thing that loosens here; everything else is
// TIGHTENED in the same breath (see MODEL_FAMILY_WORD, MODEL_VENDOR_ADDRESS,
// namesUnprefixedModel): a trailer naming a model without the main vendor's prefix
// word used to pass this guard unread, because "no prefix token" was taken for "no
// model evidence". A degraded session stamping some other versioned model walked
// straight through.

// AN UNNAMED AUTHOR IS NOT A FORBIDDEN ONE (point 397, observed 28.07.2026 and
// again on 29.07.2026): commits carrying the bare `Co-Authored-By: Claude
// <main-vendor address>` — the trailer with no model name at all — failed the
// allowlist exactly as a Haiku trailer does and demanded the full breach ritual,
// though every session live in that window was the main chain. The guard is not softened:
// a bare trailer is no proof of compliance either. It is SPLIT, because the two
// states have different answers — a forbidden model stops the batch, an
// unidentified one is LOOKED UP in the local transcripts and then resolved.

// THE ALLOWLIST JUDGES THE PARSED NAME, NEVER THE RAW LINE (point 527, found
// 06.08.2026 by the four-eyes review of points 397/425, recorded as C9 in
// docs/rule-corpus-audit.md). `ALLOWED` used to be searched inside the whole
// trailer, so any line merely CONTAINING "opus" or "fable" passed the guard
// whose entire purpose is to catch a silently degraded session — a
// `Claude Haiku 4.5 (<main family> mode)` or a `Claude Sonnet 5 / <main lane>` walked
// straight through. The name is therefore parsed out first and matched WHOLE,
// and a trailer claiming more than one model is a finding rather than a pass on
// its first allowed name: ONE TRAILER names exactly one model.
// THE COMMIT may carry SEVERAL AUTHORS (point 854), so the trailers are judged
// SEPARATELY and the commit passes when every author model named is allowed.
// Reducing them to one string is what once raised a breach on an allowed pair.
// A cross-vendor reviewer is not an author and uses Reviewed-By (point 982).

import { laneIsOn, laneRefusalReason } from './lane-switch-core.mjs'
import { FOREIGN_FAMILY_WORDS, LANES, MAIN, VENDORS, laneFamilyWords, trailerFor } from './model-lanes.mjs'

const escapeRegExp = (word) => String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const alternation = (words) => words.map(escapeRegExp).join('|')

/** The versioned vendor markers (`gpt-` style): a model word only with a digit attached. */
const VERSIONED_MARKERS = Object.values(VENDORS).flatMap((vendor) => vendor.versionedMarkers)
/** Every bare model word: lane families, vendor marker words, foreign families. */
const BARE_MODEL_WORDS = [
  ...new Set([...laneFamilyWords(), ...Object.values(VENDORS).flatMap((vendor) => vendor.markerWords), ...FOREIGN_FAMILY_WORDS]),
]

/** The anchored pattern of one lane: its vendor's optional versioned marker, then a
 *  family word, then version digits only. */
function lanePattern(record) {
  const markers = VENDORS[record.vendor].versionedMarkers
  const prefix = markers.length ? `(?:(?:${alternation(markers)})[\\s.\\d]*)?` : ''
  return new RegExp(`^${prefix}(?:${alternation(record.familyWords)})[\\s.\\d]*$`, 'i')
}

/** Model names allowed to author batch commits, ONE PATTERN PER AUTHORING LANE,
 *  matched against the name PARSED out of a trailer (`modelNamesIn`) — anchored,
 *  so an allowed name carrying any addition is no longer allowed by accident.
 *  Everything after the family word must be version digits: the policy names the
 *  lane FAMILIES (the scarce lane separately, in the switch-gated SCARCE_ALLOWED
 *  below), and a pinned version would redden the whole batch the day the harness
 *  serves a point release or writes the raw model id (14 commits on 29.07.2026
 *  carried the `[1m]` id spelling, which normalises to the family plus version).
 *
 *  A lane whose vendor has a versioned marker demands its own family word too: the
 *  marker alone is NOT an author here, so a session degraded to some other model of
 *  that vendor is a breach exactly as Haiku is. Every family word of a lane stays
 *  admitted, retired ones included, because the guard judges PAST commits against
 *  this same list and the trailers those commits carry must keep verifying. */
export const ALLOWED = Object.freeze(LANES.filter((record) => !record.scarce).map(lanePattern))

/** The switch-gated lanes' patterns. */
const SCARCE_ALLOWED = Object.freeze(LANES.filter((record) => record.scarce).map(lanePattern))
const namesScarceLane = (name) => SCARCE_ALLOWED.some((pattern) => pattern.test(String(name ?? '').trim()))

/** Explicit opt-out from switch policy for pure parsing fixtures and historic-log tests. */
export const POLICY_NEUTRAL = Symbol('model-policy-neutral')

/**
 * The scarce-lane policy that governed one historical commit.
 *
 * The state record describes the latest transition: at `changedAt` its recorded
 * direction took effect, and before that instant the opposite direction was in
 * force. Commit-message callers deliberately do not use this function — a new
 * commit is always judged against the policy in force now.
 */
export function laneStateAtCommit(commitWhen, scarceState) {
  if (scarceState === undefined || scarceState === POLICY_NEUTRAL) return scarceState
  const currentIsOn = laneIsOn(scarceState) // validates the complete state; an unreadable policy never grandfathers history
  const when = Number(commitWhen)
  if (!Number.isFinite(when)) throw new Error('the commit timestamp is invalid')
  if (when >= scarceState.changedAt) return scarceState
  return { ...scarceState, state: currentIsOn ? 'off' : 'on' }
}

/** Missing switch policy fails closed; policy-neutral parsing must say so at the call site. */
const admitsScarce = (scarceState) =>
  scarceState === POLICY_NEUTRAL || (scarceState !== undefined && laneIsOn(scarceState))

/** May this PARSED model name author a commit here? */
export function isAllowedModelName(name, scarceState) {
  const value = String(name ?? '').trim()
  return (
    value !== '' &&
    (ALLOWED.some((pattern) => pattern.test(value)) || (admitsScarce(scarceState) && namesScarceLane(value)))
  )
}

/** The prefix words of the lanes' own trailer names — the vendor marker words that
 *  stand in front of a family word ("Claude …"). Each one opens a claim, and a trailer
 *  carrying one is model evidence (human co-authors are not). */
const TRAILER_PREFIX_WORDS = [
  ...new Set(
    LANES.flatMap((record) => [record.trailerName, record.fallback?.trailerName ?? '', ...record.retired])
      .flatMap((name) => String(name).toLowerCase().split(/[^a-z]+/))
      .filter((word) => Object.values(VENDORS).some((vendor) => vendor.markerWords.includes(word))),
  ),
]
const PREFIX_WORD = new RegExp(`\\b(?:${alternation(TRAILER_PREFIX_WORDS)})\\b`, 'i')
const PREFIX_SPLIT = new RegExp(`\\b(?:${alternation(TRAILER_PREFIX_WORDS)})\\b`, 'gi')

/**
 * The family word of any model this project would recognise — the LLM vendors'
 * names, not only the two lanes that may author.
 *
 * IT DELIBERATELY NAMES MODELS THAT MAY NOT AUTHOR (cross-vendor review of point
 * 667, P0). Recognising is not allowing: a trailer reading `Haiku 4.5 <x@y>` or
 * `Gemini 2.5 Pro <x@y>` carries no "Claude" token, so before this it produced
 * no model evidence and was waved through as a human co-author — inside the very
 * guard whose purpose is to catch a session that silently degraded. Every name
 * here becomes evidence the ALLOWLIST then judges, and only the lanes' families (retired
 * names included), the scarce one while the switch admits it, survive that.
 */
const MODEL_FAMILY_WORD = new RegExp(
  `\\b(${alternation(BARE_MODEL_WORDS)}|o\\d(?:-\\w+)?)\\b${VERSIONED_MARKERS.length ? `|${alternation(VERSIONED_MARKERS)}` : ''}`,
  'i',
)

/**
 * The addresses the two vendors' MODELS commit under. A trailer carrying one is
 * model evidence WHATEVER it calls itself, which is what catches the family this
 * list has never heard of — `<Vendor> o3 <noreply@<cross vendor>.com>`.
 *
 * THE LOCAL PART IS PART OF THE TEST (third cross-vendor round). Any address at
 * the vendor's domain used to qualify, so a HUMAN who works there —
 * `Alice <alice@<cross vendor>.com>` — was read as a model and then refused as one
 * outside the allowlist. Only the no-reply/bot forms our harnesses actually
 * write count.
 *
 * The local part is matched WHOLE, not as a prefix (fourth round): `botany@` and
 * `assistant-professor@` are people, and a prefix test called them robots.
 *
 * THE DOMAIN ENDS AT `.com` (cross-vendor review of a4975b0): `\b` alone let
 * `assistant@<cross vendor>.com.evil` qualify, so a human at a look-alike domain was
 * read as a model and refused as one. Nothing our harnesses write continues
 * after the TLD, so any word character, dot or hyphen behind it disqualifies.
 */
const VENDOR_ADDRESS_DOMAINS = Object.values(VENDORS).map((vendor) => vendor.trailerAddress.split('@')[1])
const MODEL_VENDOR_ADDRESS = new RegExp(
  `(?:^|[\\s<"'(])(?:noreply|no-reply|bot|assistant)@(?:${alternation(VENDOR_ADDRESS_DOMAINS)})(?![\\w.-])`,
  'i',
)

/** A family word with a VERSION ATTACHED TO IT — `Haiku 4.5`, `llama-3`,
 *  `<marker>-<version> <cross family>`, `o3`. A digit merely somewhere in the line is not a version:
 *  it made `Sol Smith 2nd` a model (third cross-vendor round). */
const FAMILY_WITH_VERSION = new RegExp(
  [
    `\\b(?:${alternation(BARE_MODEL_WORDS)})[\\s.\\-_]*\\d`,
    ...(VERSIONED_MARKERS.length ? [`(?:${alternation(VERSIONED_MARKERS)})[\\s.\\-_]*\\d`] : []),
    '\\bo\\d(?:-\\w+)?\\b',
  ].join('|'),
  'i',
)

/**
 * Does a NON-Claude trailer name a model rather than a person?
 *
 * A family word alone is not enough in both directions, and the second
 * cross-vendor round found each: `Sol Smith <s@example.com>` is a human this
 * guard would have reddened, while `<Vendor> o3 <noreply@<cross vendor>.com>` is a model
 * no word list will contain. So a non-Claude trailer counts as a model when it
 * carries a VENDOR ADDRESS, or when its family word is followed by a VERSION —
 * which every model designation in this project's history is, and which a human
 * name is not.
 *
 * RESIDUAL, stated rather than implied: recognition is a heuristic and the
 * allowlist is not. Everything RECOGNISED fails closed; a model that calls
 * itself nothing on the list and commits from a private address is not
 * recognised at all. The Claude branch below is unchanged and needs none of
 * this — the word is in every trailer our own harness writes.
 */
function namesUnprefixedModel(cleaned, raw = cleaned) {
  const text = String(cleaned ?? '')
  if (MODEL_VENDOR_ADDRESS.test(String(raw ?? ''))) return true
  if (!MODEL_FAMILY_WORD.test(text)) return false
  // A version ATTACHED to the family word: `Haiku 4.5`, the cross lane's versioned name, `llama-3`.
  return FAMILY_WITH_VERSION.test(text)
}

/** Words that stand beside "Claude" without naming a MODEL: the product words
 *  `Code` and `Agent` (context-window suffixes are dropped earlier, with their
 *  brackets). A trailer left with nothing after these names no model, so it is
 *  unidentified rather than forbidden. */
const NON_MODEL_WORDS = /\b(code|agent)\b/gi

/** One claimed designation, reduced to the bare name an allowlist can match. */
function bareName(segment) {
  return String(segment)
    .replace(NON_MODEL_WORDS, ' ')
    .replace(/[\s,;/&_-]+/g, ' ')
    .trim()
}

/**
 * The model names a single co-author trailer CLAIMS, with the address, the
 * parenthesised/bracketed suffixes and the non-model words stripped, and the
 * model-id spelling (`<prefix>-<family>-<version>[1m]`) normalised to the written one
 * (`<family> <version>`). Each "Claude" token opens one claim, so
 * `Claude Sonnet 5 / <main lane trailer>` reads as the two names it is rather than as
 * one string an allowlist search can be fooled by.
 * Empty means the trailer names no model at all.
 *
 * A trailer that names a model WITHOUT the word "Claude" — the cross lane's
 * versioned name, or a degraded session's bare `Haiku 4.5` — has no token to
 * split on, so the whole cleaned line is the one name it claims, unless symbols
 * or `and`/`und` join several segments that each name a model (see below).
 *
 * WHAT STANDS BEFORE THE FIRST "Claude" IS A CLAIM TOO (cross-vendor review of
 * point 667, P0). The split used to DISCARD it, so `<other versioned model> / <main lane trailer>`
 * — and, for the whole life of this guard, `Sonnet 5 / <main lane trailer>` — read as
 * the single allowed main-lane name and passed. That is precisely the smuggling
 * shape point 527 closed for names AFTER the first token, left open in front of
 * it because every test wrote the forbidden model second.
 */
export function modelNamesIn(trailer) {
  const raw = String(trailer ?? '')
  // A SUFFIX IS DROPPED ONLY WHERE IT NAMES NO MODEL (second cross-vendor round).
  // The strip exists for `(1M context)` and `[1m]`, and it took the claim with
  // it: `<main lane> (Haiku 4.5)` and `<main lane> [Sonnet 5]` were reduced
  // to the allowed main-lane name before anything judged them, while a plausible
  // `<marker>-<version> (<cross family>)` lost the very word that identifies it.
  const dropEmpty = (_, inner) => (MODEL_FAMILY_WORD.test(inner) ? ` ${inner} ` : ' ')
  const cleaned = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\(([^)]*)\)/g, dropEmpty)
    .replace(/\[([^\]]*)\]/g, dropEmpty)
    .replace(/\bco-authored-by:/gi, ' ')
  if (PREFIX_WORD.test(cleaned)) {
    const parts = cleaned.split(PREFIX_SPLIT)
    const names = parts.slice(1).map(bareName).filter(Boolean)
    const head = bareName(parts[0])
    // Only a head that NAMES something counts: the ordinary trailer's head is
    // empty, and a stray word is not a second model.
    if (head && MODEL_FAMILY_WORD.test(head)) names.unshift(head)
    return names
  }
  if (namesUnprefixedModel(cleaned, raw)) {
    // SEVERAL NON-CLAUDE CLAIMS IN ONE TRAILER (cross-vendor review of a4975b0): with no
    // "Claude" token to split on, `<cross lane> / <cross lane>` collapsed into one
    // composite name and took the FORBIDDEN path instead of the documented
    // several-names-is-unidentified one. Only segments that name a model ON
    // THEIR OWN count as claims, and only when MORE THAN ONE does is the line
    // read as several — a lone model beside filler words stays the single
    // composite name that fails the allowlist LOUD, so the smuggling shape of
    // point 527 (`<cross lane> / Haiku`) cannot pass as its allowed half.
    // The separators are symbols AND the textual conjunctions (the confirming
    // pass): `<cross lane> and <cross lane>` is the same two claims as with `/`.
    const claims = cleaned
      .split(/[/&+]|\b(?:and|und)\b/i)
      .map(bareName)
      .filter((segment) => segment && namesUnprefixedModel(segment))
    if (claims.length > 1) return claims
    const name = bareName(cleaned)
    return name ? [name] : []
  }
  return []
}

/** What a trailer says the model is, as one string — the single name in the
 *  normal case, every claimed name joined when a line names several. Empty
 *  means the trailer names no model. */
export function modelNameIn(trailer) {
  return modelNamesIn(trailer).join(' + ')
}

/** The three states a commit's co-author field can be in, worst first. */
export const CLASSES = Object.freeze(['forbidden', 'unidentified', 'allowed'])

/**
 * Judge ONE co-author trailer value. Returns `{ verdict, names }` — the names
 * are what the wording of a finding is built from, so a refusal can say which
 * model it read rather than only that it disliked the line.
 *
 * 'forbidden'    a name outside the allowlist stands in the trailer — this wins
 *                even when the trailer names several
 * 'unidentified' the trailer is model evidence (a Claude token or a vendor
 *                address) but names NO model, or names SEVERAL allowed ones:
 *                neither can show which single model authored the commit. The
 *                path is the same — look the turn up in the transcripts — so
 *                they share a verdict.
 * 'allowed'      exactly one name, and it is on the allowlist (or the trailer
 *                carries no model evidence at all, as a human co-author)
 */
export function judgeTrailer(trailer, scarceState) {
  const names = modelNamesIn(trailer)
  if (!names.length) {
    // A trailer that IS model evidence but names nothing readable — the bare
    // `Claude <…>` — is unidentified; anything else is a human co-author.
    const text = String(trailer ?? '')
    const isModel = PREFIX_WORD.test(text) || MODEL_VENDOR_ADDRESS.test(text)
    return { verdict: isModel ? 'unidentified' : 'allowed', names }
  }
  if (names.some((name) => !isAllowedModelName(name, scarceState))) return { verdict: 'forbidden', names }
  return { verdict: names.length > 1 ? 'unidentified' : 'allowed', names }
}

/**
 * Split a `%(trailers:…,separator=%x2C)` field — or one commit-message trailer
 * line — into the values judged SEPARATELY. The separator ALWAYS separates,
 * a bracket notwithstanding.
 *
 * A bracket-AWARE split was built and withdrawn in the four-eyes review of
 * point 527: every version of it let an UNCLOSED bracket swallow the separator
 * and MERGE the next co-author into an allowed trailer, because the suffix
 * strip then carried the forbidden name away with it —
 * `<main lane> (1M context <a@x>,Claude Haiku 4.5 <b@x>,<main lane> (1M
 * context) <c@x>` read as the plain main-lane name. Splitting unconditionally errs toward
 * MORE parts, which is the safe direction for a tripwire: every part is judged
 * on its own: a half cut out of a suffix that names a model outside the list
 * fails LOUD, and a half that names nothing is no model evidence, so no cut
 * can silently allow a forbidden name.
 * The commit-msg gate splits the same way, so such a trailer is refused AT the
 * commit rather than pausing the batch from history later.
 */
export function splitTrailerField(field) {
  return String(field ?? '').split(/[,;]/)
}

/**
 * Classify a commit's `Co-Authored-By` field (see `judgeTrailer` for the three
 * states). A commit may carry several co-authors; each is judged alone and the
 * WORST verdict wins, so one forbidden co-author flags the commit even next to
 * an allowed one, and one bare trailer beside a named one is still unidentified.
 */
export function classifyTrailer(trailerField, scarceState) {
  let worst = 'allowed'
  for (const part of splitTrailerField(trailerField)) {
    const { verdict } = judgeTrailer(part, scarceState)
    if (verdict === 'forbidden') return 'forbidden'
    if (verdict === 'unidentified' && worst === 'allowed') worst = 'unidentified'
  }
  return worst
}

/** True when a commit's trailer field NAMES any recognised model outside the
 *  allowlist. A trailer naming nothing is not a breach — it is unidentified
 *  (`classifyTrailer`), which has its own, resolvable path. */
export function isPolicyBreach(trailerField, scarceState) {
  return classifyTrailer(trailerField, scarceState) === 'forbidden'
}

// ---------------------------------------------------------------------------
// CATCH IT AT THE SOURCE (points 397 b / 425 a). The classification above is the
// net under the commits already in history; this is the grip that keeps an
// unnamed trailer out of it. A delegated agent stamping the bare trailer is not
// a rare accident — it happened on five commits of one branch on 29.07.2026 —
// and the guard above can only ever report it after the fact, at a cost of a
// research pass no unattended session would have done.
//
// Driven from the versioned `commit-msg` hook via scripts/model-trailer-gate.mjs,
// so it binds every session, in the main tree and in a worktree. It deliberately
// does NOT stand down for a paused batch or a session that owns no lock: a
// subagent is exactly whose commits this is for, and a commit is not batch work.

/**
 * The models that may author now, in remedy order: the main lane, the scarce lane while
 * the switch admits it, the main fallback, then the other lanes. `{ name, trailer }`.
 */
function authoringModels(scarceState) {
  const entry = (record, fallback = false) => ({
    name: fallback ? record.fallback.displayName : record.displayName,
    trailer: trailerFor(record.role, { fallback }),
  })
  return [
    entry(MAIN),
    ...(admitsScarce(scarceState) ? LANES.filter((record) => record.scarce).map((record) => entry(record)) : []),
    ...(MAIN.fallback ? [entry(MAIN, true)] : []),
    ...LANES.filter((record) => record !== MAIN && !record.scarce).map((record) => entry(record)),
  ]
}

/** Names as one phrase: `a, b and c`. */
const phraseOf = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join(''))

/** The trailers a commit may carry, generated from the switch for every remedy. */
export function allowedTrailers(scarceState) {
  return Object.freeze(authoringModels(scarceState).map(({ trailer }) => `Co-Authored-By: ${trailer}`))
}

/**
 * The documented reviewer forms use a distinct key but the same model roster.
 * `Reviewed-By` wins over a marked co-author because every Git author-field
 * reader would still ingest the latter; it wins over ledger-only identity
 * because the commit keeps its local provenance without conflating roles.
 */
export function allowedReviewerTrailers(scarceState) {
  return Object.freeze(allowedTrailers(scarceState).map((trailer) => trailer.replace(/^Co-Authored-By:/, 'Reviewed-By:')))
}

/** The authoring lanes in one phrase, generated for the same refusal surface. */
function allowedModelsPhrase(scarceState) {
  return phraseOf(authoringModels(scarceState).map(({ name }) => name))
}

/** The `Co-Authored-By` values in a commit message, git's comment lines dropped
 *  so a hint in the commit template is never read as the author's own trailer. */
export function coAuthorTrailers(message) {
  const out = []
  for (const line of String(message ?? '').split(/\r?\n/)) {
    if (line.startsWith('#')) continue
    const m = /^[ \t]*co-authored-by:[ \t]*(.+?)[ \t]*$/i.exec(line)
    if (m) out.push(m[1])
  }
  return out
}

/** The `Reviewed-By` values in a commit message, kept separate from authors. */
export function reviewerTrailers(message) {
  const out = []
  for (const line of String(message ?? '').split(/\r?\n/)) {
    if (line.startsWith('#')) continue
    const m = /^[ \t]*reviewed-by:[ \t]*(.+?)[ \t]*$/i.exec(line)
    if (m) out.push(m[1])
  }
  return out
}

/**
 * Model identities carried by the two documented commit-message keys.
 *
 * The role comes only from the key. In particular, a second Co-Authored-By line
 * remains a second author: an old ambiguous line cannot be reclassified from
 * its value or order without inventing evidence the commit does not contain.
 */
export function modelTrailerIdentities(message) {
  const names = (trailers) =>
    trailers.flatMap((trailer) => splitTrailerField(trailer).flatMap((part) => modelNamesIn(part)))
  return { authors: names(coAuthorTrailers(message)), reviewers: names(reviewerTrailers(message)) }
}

/** Reviewer-looking model trailers which do not use the documented key. */
function undocumentedReviewerTrailers(message) {
  const out = []
  for (const line of String(message ?? '').split(/\r?\n/)) {
    if (line.startsWith('#')) continue
    const m = /^[ \t]*([a-z][a-z-]*review[a-z-]*|review[a-z-]*):[ \t]*(.+?)[ \t]*$/i.exec(line)
    if (!m || /^reviewed-by$/i.test(m[1])) continue
    if (modelNamesIn(m[2]).length || PREFIX_WORD.test(m[2]) || MODEL_VENDOR_ADDRESS.test(m[2])) {
      out.push({ key: m[1], value: m[2] })
    }
  }
  return out
}

/**
 * May this commit MESSAGE be committed? Every model author or reviewer trailer
 * must name one model from the allowlist. A human co-author is not model
 * evidence and is ignored, and a message with no model trailer at all is not
 * this gate's business (a merge, or a commit made outside the agent tooling).
 *
 * A trailer LINE is split exactly as the Stop hook splits the log field, so the
 * two can never disagree: what this gate lets through can never turn up as a
 * breach in history, and one line carrying two co-authors is judged as two.
 *
 * Returns { block, findings: [{ rule, trailer, detail }], allowedTrailers,
 * allowedReviewerTrailers, allowedModelsPhrase }. A malformed trailer never
 * throws; an invalid switch state does, resolved before the fail-open boundary.
 */
export function evaluateCommitTrailers(message, scarceState) {
  // Resolve before the fail-open parsing boundary: an unknown switch is a missing
  // policy, not a malformed trailer that may be ignored.
  const trailers = allowedTrailers(scarceState)
  const phrase = allowedModelsPhrase(scarceState)
  const switchRefusal = scarceState !== undefined && !admitsScarce(scarceState) ? laneRefusalReason(scarceState) : ''
  const findings = []
  try {
    for (const [role, values] of [
      ['author', coAuthorTrailers(message)],
      ['reviewer', reviewerTrailers(message)],
    ]) {
      for (const trailer of values) {
        for (const part of splitTrailerField(trailer)) {
          const { verdict, names } = judgeTrailer(part, scarceState)
          if (verdict === 'unidentified' && names.length > 1) {
            findings.push({
              rule: role === 'author' ? 'multiple-model-trailer' : 'multiple-model-reviewer-trailer',
              trailer,
              detail: `names ${names.length} models (${names.join(', ')}) — one ${role} trailer must identify one model`,
            })
          } else if (verdict === 'unidentified') {
            findings.push({
              rule: role === 'author' ? 'unnamed-model-trailer' : 'unnamed-model-reviewer-trailer',
              trailer,
              detail: `names no model — it cannot identify the commit's ${role}`,
            })
          } else if (verdict === 'forbidden') {
            const scarceDetail = names.some(namesScarceLane) && switchRefusal ? `; ${switchRefusal}` : ''
            findings.push({
              rule: role === 'author' ? 'forbidden-model-trailer' : 'forbidden-model-reviewer-trailer',
              trailer,
              detail: `names a model outside the allowlist (read as "${names.join(' + ')}"; only ${phrase} may ${role === 'author' ? 'author' : 'review'} here${scarceDetail})`,
            })
          }
        }
      }
    }
    for (const trailer of undocumentedReviewerTrailers(message)) {
      findings.push({
        rule: 'undocumented-reviewer-trailer',
        trailer: `${trailer.key}: ${trailer.value}`,
        detail: 'reviewer model identity uses exactly the Reviewed-By key',
      })
    }
  } catch {
    /* fail-open: a broken gate must never make the tree uncommittable */
  }
  return {
    block: findings.length > 0,
    findings,
    allowedTrailers: trailers,
    allowedReviewerTrailers: allowedReviewerTrailers(scarceState),
    allowedModelsPhrase: phrase,
  }
}

/** The refusal, naming every offender and the exact trailer to write instead. */
export function formatCommitTrailerVerdict(verdict) {
  if (!verdict?.block) return ''
  const lines = ['model-trailer-gate: refusing this commit message.', '']
  for (const f of verdict.findings) lines.push(`  ${f.rule}: "${f.trailer}"`, `      ${f.detail}`)
  lines.push(
    '',
    'Every commit records its AUTHORING MODEL in its co-author trailer — it is the only',
    'machine-readable evidence the serving-model tripwire has, and an unnamed one reads',
    'from the outside exactly like the silent degradation the tripwire exists to catch.',
    '',
    'Write your own model:',
    '',
    ...(verdict.allowedTrailers ?? allowedTrailers()).map((t) => `    ${t}`),
    '',
    'Name a cross-vendor reviewer only with the distinct reviewer key:',
    '',
    ...(verdict.allowedReviewerTrailers ?? allowedReviewerTrailers()).map((t) => `    ${t}`),
    '',
    'The `(1M context)` suffix is fine. If you do not know which model you are:',
    '',
    ...TRANSCRIPT_HINT,
  )
  return lines.join('\n')
}

/** Parse one log line of the form `sha|isoDate|trailer[,trailer…]`.
 *  Returns null for anything malformed (merge commits print an empty trailer
 *  field but still parse — they carry no model evidence and never flag). */
export function parseLogLine(line) {
  const parts = String(line ?? '').split('|')
  if (parts.length < 3) return null
  const sha = parts[0].trim()
  const when = Date.parse(parts[1])
  if (!/^[0-9a-f]{7,40}$/i.test(sha) || Number.isNaN(when)) return null
  return { sha, when, trailers: parts.slice(2).join('|') }
}

/** Commits at/after sinceMs whose trailer field falls into `wanted`. */
function findCommitsClassified(logText, sinceMs, wanted, scarceState) {
  // Validate once even for an empty/malformed log: an invalid policy throws
  // here. A missing one (undefined) admits no scarce lane, so it fails closed per
  // commit rather than making the whole history look compliant.
  laneStateAtCommit(sinceMs, scarceState)
  const hits = []
  for (const line of String(logText ?? '').split(/\r?\n/)) {
    const c = parseLogLine(line)
    if (!c || c.when < sinceMs) continue
    const policyAtCommit = laneStateAtCommit(c.when, scarceState)
    if (classifyTrailer(c.trailers, policyAtCommit) === wanted) {
      hits.push({ sha: c.sha, when: c.when, trailer: c.trailers.trim() })
    }
  }
  return hits
}

/** Commits at/after sinceMs authored by a model NAMED outside the allowlist. */
export function findForbiddenCommits(logText, sinceMs, scarceState) {
  return findCommitsClassified(logText, sinceMs, 'forbidden', scarceState)
}

/** Commits at/after sinceMs whose model trailer names no single model: none,
 *  several allowed ones, or a nameless vendor-address trailer. */
export function findUnidentifiedCommits(logText, sinceMs, scarceState) {
  return findCommitsClassified(logText, sinceMs, 'unidentified', scarceState)
}

// ---------------------------------------------------------------------------
// THE BLOCK TEXTS. Pure, so the Vitest layer can pin what the session is told —
// a remedy that has to be rediscovered is the failure this point fixes.

/** Where the true serving model per turn is readable: the harness writes one
 *  JSONL line per request, each carrying `message.model`. */
const TRANSCRIPT_HINT = [
  'The authoring model is READABLE, not a matter of assumption. The local transcripts record it',
  'per turn in their `message.model` field:',
  '',
  '    ~/.claude/projects/<repo-slug>/<session>.jsonl',
  '    ~/.claude/projects/<repo-slug>/<session>/subagents/agent-*.jsonl   (delegated work)',
  ...LANES.filter((record) => record.runtime === 'codex').map(
    (record) => `    ~/.codex/sessions/<yyyy>/…                                        (the ${record.displayName} lane)`,
  ),
]

/** The prefix git's history-rewriting tools park the pre-rewrite commits under. */
const BACKUP_REF_PREFIX = 'refs/original/'

/** The backup refs out of a `git for-each-ref --format=%(refname)` listing. */
export function backupRefsIn(refListing) {
  return String(refListing ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith(BACKUP_REF_PREFIX))
}

/**
 * The trap the remedy itself sets (measured 30.07.2026): rewriting a trailer with
 * `git filter-branch` leaves the OLD commits alive under `refs/original/…`, and
 * this guard reads `git log --all` — so it stays red on a branch that is already
 * fixed, invisibly, because every worktree shares one `.git` and nobody looks
 * there. Naming the refs turns a second "policy breach" into a one-line cleanup.
 */
function backupRefNotice(backupRefs) {
  const refs = (backupRefs ?? []).filter(Boolean)
  if (!refs.length) return []
  return [
    '',
    `NOTE — this repository still holds ${refs.length} pre-rewrite backup ref(s), and the guard reads`,
    '`git log --all`, so a trailer you have ALREADY rewritten is still reported from them. Delete',
    'them once the rewrite is confirmed good:',
    '',
    ...refs.map((r) => `    git update-ref -d ${r}`),
  ]
}

const shaList = (hits) => (hits ?? []).map((h) => `${h.sha.slice(0, 7)} (${h.trailer})`).join(', ')

/** Explain why a forbidden scarce-lane trailer is history or a present emergency. */
function scarceTimingNotices(hits, scarceState) {
  if (scarceState === undefined || scarceState === POLICY_NEUTRAL) return []
  const current = laneIsOn(scarceState) ? 'ON' : 'OFF'
  const changedAt = Number(scarceState.changedAt)
  return (hits ?? []).flatMap((hit) => {
    const namesScarce = modelNamesIn(hit?.trailer).some(namesScarceLane)
    if (!namesScarce || !Number.isFinite(hit?.when)) return []
    const commitAt = new Date(hit.when).toISOString()
    const switchAt = new Date(changedAt).toISOString()
    if (hit.when >= changedAt) {
      return [
        `Commit ${hit.sha.slice(0, 7)} was made at ${commitAt}, after the lane switch changed to ${current} ` +
          `at ${switchAt}; it is judged under that post-switch ${current} policy.`,
      ]
    }
    const previous = current === 'ON' ? 'OFF' : 'ON'
    return [
      `Commit ${hit.sha.slice(0, 7)} was made at ${commitAt}, before the lane switch changed to ${current} ` +
        `at ${switchAt}; it is historical and is judged under the previous ${previous} policy.`,
    ]
  })
}

/** The HARD stop: a named model outside the allowlist. The wrapper transfers the
 *  batch to a fresh allowed lane rather than asking the suspect to repair itself.
 *  `alsoUnidentified` are the unnamed commits found in the same window: they are
 *  NAMED here rather than dropped, because advancing the baseline past the
 *  forbidden ones would otherwise clear them unseen (four-eyes review). */
export function formatForbiddenReason(hits, { backupRefs = [], alsoUnidentified = [], scarceState } = {}) {
  const unnamed = (alsoUnidentified ?? []).filter(Boolean)
  const switchRefusal = scarceState !== undefined && !admitsScarce(scarceState) ? ` ${laneRefusalReason(scarceState)}` : ''
  return [
    `SERVING-MODEL TRIPWIRE: commit(s) ${shaList(hits)} carry a co-author trailer NAMING a model ` +
      `outside the allowlist in force at each commit's own time (${phraseOf(authoringModels(undefined).map(({ name }) => name))} ` +
      `may author throughout; ${phraseOf(LANES.filter((record) => record.scarce).map((record) => record.displayName))} ` +
      'may author only while its recorded policy is ON; Sonnet and Haiku ' +
      `are never admitted; user policy 25.07./13.08.2026).${switchRefusal} Do NOT continue batch work. ` +
      'The tripwire records a handoff to the next allowed lane of the serving chain. Only that fresh lane, ' +
      'after transcript metadata proves which model answered and it re-reads every trailer, may advance ' +
      '.claude/model-guard-baseline.json past these commits; an unreachable chain probes on a clock.',
    ...scarceTimingNotices(hits, scarceState),
    ...(unnamed.length
      ? [
          '',
          `The same window also holds ${unnamed.length} commit(s) whose trailer names NO SINGLE model — ` +
            `${shaList(unnamed)}. Resolve those from the transcripts too; advancing the baseline ` +
            'past the breach would otherwise clear them unseen.',
        ]
      : []),
    ...backupRefNotice(backupRefs),
  ].join('\n')
}

/** The RESOLVABLE block: the trailer names no single model, so nobody knows yet what
 *  authored it. Look it up, then take the path the answer dictates. */
export function formatUnidentifiedReason(hits, { backupRefs = [], scarceState } = {}) {
  const phrase = allowedModelsPhrase(scarceState).replace(/, /g, ' / ').replace(/ and /, ' / ')
  return [
    `UNIDENTIFIED AUTHOR: commit(s) ${shaList(hits)} carry a model co-author trailer that names NO ` +
      'SINGLE model — no model at all, or several at once — so they cannot show WHICH model wrote ' +
      'them. This is NOT a policy breach yet — do not pause the batch over it. Resolve it FIRST, ' +
      'before any other work:',
    '',
    ...TRANSCRIPT_HINT,
    '',
    `  · an ALLOWED model (${phrase}) → advance .claude/model-guard-baseline.json`,
    '    past these commits and carry on; no user interruption is owed.',
    '  · a model outside the allowlist, or no transcript covers the commit → treat it as the ',
    '    forbidden case: record the trusted-lane handoff; only that lane may advance the baseline.',
    '',
    'Then stop it recurring: write your own model into the trailer, one of —',
    ...allowedTrailers(scarceState).map((t) => `    ${t}`),
    ...backupRefNotice(backupRefs),
  ].join('\n')
}
