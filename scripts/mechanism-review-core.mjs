// Pure decision core of the four-eyes gate for MECHANISMS (point 377).
//
// WHY IT EXISTS: "a new or changed guard is reviewed by the SECOND model before
// it goes live" is this project's own exemplar of enforcing rather than
// remembering — and the rule-corpus audit found it claimed a Stop check that had
// never been built. Carried by intention alone, it was skipped in exactly the
// cases where it mattered: the pre-push gate went live before its review, and
// the review then found that its "documents only" fast path waved through the
// very files this repository measures in its unit layer. The gate would have
// been useless in its most common case, green on every test. Two further
// mechanisms reviewed the same day yielded three defects each.
//
// So the rule gets a mechanism of its own: a mechanism change that has no
// RECORDED review by a DIFFERENT model does not get to end the turn.
//
// Side-effect free — the git work, the state files and the block belong to
// scripts/mechanism-review-guard.mjs (fail-open) and the record CLI
// scripts/mechanism-review.mjs. Pinned by mechanism-review-core.test.mjs.

// What a co-author trailer naming a MODEL looks like. It is the author
// allowlist's own answer (scripts/model-guard-core.mjs, which imports nothing),
// so "who authored this" cannot drift from "who may author at all".
import { modelNamesIn } from './model-guard-core.mjs'
// …and how a review split into PASSES over the file set composes back into a
// coverage (point 714). Both the recorder and this gate ask the same module, so
// what may be WRITTEN and what CLEARS cannot drift apart.
import { parsePassFiles, parsePassSpec, passComposition, worstVerdict } from './review-material-core.mjs'

/** The verdicts a review may end in, weakest refusal last. */
export const VERDICTS = Object.freeze(['merge', 'merge-with-fixes', 'do-not-merge'])

/**
 * THE TWO MODES OF THE FOUR-EYES PRINCIPLE (CLAUDE.md §6, point 541).
 *
 * Only the CONVERGENT half had an enforcer: this gate lets no changed mechanism
 * through without the other model's recorded verdict. Nothing recorded whether a
 * DIVERGENT step — what could go wrong, which cases to test, which designs are
 * possible — ran blind parallel or as a review of an already-finished list,
 * which is the anchoring failure the rule exists to prevent. No guard can DETECT
 * that: whether a step was divergent stands in no file. So the recorder simply
 * ASKS, and refuses to default the answer.
 *
 *   review          one artefact judged — is this diff correct, does this
 *                   implementation match its spec, is this measurement sound
 *   blind-parallel  both models work from the same inputs to their own complete
 *                   result, neither seeing the other's until both are done
 */
export const MODES = Object.freeze(['review', 'blind-parallel'])

/** The mode whose weaker same-model fallback is decorrelated by a framing. */
export const BLIND_PARALLEL = 'blind-parallel'

/** Outcomes of the one pre-escalation reading recorded beside a review. */
export const SPEC_EXAMINATION_VERDICTS = Object.freeze(['sound', 'amended'])

/** The verdict that blocks as loudly as a missing record. */
export const BLOCKING_VERDICT = 'do-not-merge'

/**
 * Mechanism files the NAME rules below cannot reach, named one by one because
 * each is a silent kill of the whole chain (four-eyes review, 27.07.2026):
 *   .claude/settings.json      the authoritative Stop-chain list — deleting one
 *                              line disarms any guard in the project
 *   scripts/guard-hooks.test.mjs  the only proof that the hooks actually FIRE
 *                              when spawned; weaken it and every guard's wiring
 *                              rests on a source review again
 *   scripts/command-classify-core.mjs  the ONE classifier both PreToolUse gates
 *                              ask "does this call change anything" (point 473).
 *                              Its name carries no guard/gate, so no naming rule
 *                              reaches it — while a widening waves work past the
 *                              fence and a narrowing denies reads. Its sweep is
 *                              named with it, for the same reason guard-hooks'
 *                              is: the rules are only as true as the test.
 *   scripts/blind-merge*.mjs   the accounting that makes a blind-parallel MERGE
 *                              countable (point 634). Its name carries no
 *                              guard/gate either, and a weakening there lets the
 *                              one step where a finding vanishes go uncounted
 *                              again — the CLI half included, because the exit
 *                              code is what anyone actually reads.
 */
export const NAMED_MECHANISM_FILES = Object.freeze([
  '.claude/settings.json',
  'scripts/guard-hooks.test.mjs',
  'scripts/command-classify-core.mjs',
  'scripts/command-classify-core.test.mjs',
  'scripts/blind-merge-core.mjs',
  'scripts/blind-merge-core.test.mjs',
  'scripts/blind-merge-cli.test.mjs',
  'scripts/blind-merge.mjs',
])

/**
 * Is `path` part of a mechanism — something that ENFORCES a rule rather than
 * implementing a feature?
 *
 * The four categories are the point's own list:
 *   scripts/<name>-guard*.mjs   the Stop/PreToolUse guards (wrapper, core, test)
 *   scripts/<name>-gate*.mjs    the git-hook gates (wrapper, core, test)
 *   scripts/<stem>*.mjs         anything BESIDE such a guard/gate by name —
 *                               `<stem>-core.mjs`, and the CLI half `<stem>.mjs`
 *   scripts/git-hooks/*         the versioned git hooks themselves
 * plus NAMED_MECHANISM_FILES, the two files that no naming rule reaches and that
 * disarm the whole chain in one line.
 *
 * Deliberately NAME-based, not import-based: a shared helper a guard happens to
 * import (`notify.mjs`, `batch-singleton.mjs`) would drag half the tooling into
 * the gate and train its reader to wave it off. Widening the reach is therefore
 * an edit of this function, in a diff someone can review — which is the whole
 * posture this file argues for.
 *
 * "Beside one" strips ONE decoration (`-core`, `.test`) and stops. Walking
 * shorter prefixes would reach a guard's other helpers, but it would also sweep
 * in the routine tooling that shares their first word — and a gate that fires on
 * ordinary edits is one people learn to wave off.
 *
 * `scriptFiles` is the current listing of scripts/ (bare file names), needed for
 * the "beside one" rule; without it only the -guard/-gate names match.
 */
export function isMechanismPath(path, { scriptFiles = [] } = {}) {
  const raw = String(path ?? '')
  // The RAW spelling is judged FIRST, byte-exact (round-1 pass 1): a backslash
  // is a legal byte inside a POSIX file name, and normalizing it away turned
  // `scripts/foo\bar-guard.mjs` into a different path that then evaded the
  // gate. The Windows-separator spelling is judged BESIDE it, never instead —
  // the normalized reading may only ADD demand.
  const windows = raw.replace(/\\/g, '/')
  return classifiesAsMechanism(raw, scriptFiles) || (windows !== raw && classifiesAsMechanism(windows, scriptFiles))
}

function classifiesAsMechanism(p, scriptFiles) {
  if (NAMED_MECHANISM_FILES.includes(p)) return true
  if (p.startsWith('scripts/git-hooks/') && p.length > 'scripts/git-hooks/'.length) return true
  // ANY single segment under scripts/, whatever bytes its name carries (round-1
  // pass 1): the old `[A-Za-z0-9._-]` class let a guard whose name held one
  // exotic byte fall outside the rule entirely — a `-guard.mjs` with a
  // backslash in its stem was no mechanism to this gate. Widening classifies
  // MORE names, never fewer, so the change can only add demand.
  const m = /^scripts\/([^/]+)\.mjs$/.exec(p)
  if (!m) return false
  const name = m[1]
  if (/-(guard|gate)\b/.test(name)) return true
  // "beside one": strip the decorations the repository actually writes — at
  // most one `.test`, then at most one `-core`, in that order (round-5 pass 2:
  // an unbounded loop also stripped `foo-core-core`, a name no tool here
  // produces, and classified it off a guard it does not belong to).
  let stem = name
  if (stem.endsWith('.test')) stem = stem.slice(0, -'.test'.length)
  if (stem.endsWith('-core')) stem = stem.slice(0, -'-core'.length)
  if (!stem) return false
  const files = Array.isArray(scriptFiles) ? scriptFiles : []
  return files.includes(`${stem}-guard.mjs`) || files.includes(`${stem}-gate.mjs`)
}

/** The millisecond-epoch domain a ledger `at` must live in (round-5 pass 1):
 *  a positive number alone still let `at: 1` — or a seconds-scale epoch —
 *  stand, and any such value loses every "later than" comparison against real
 *  rows, so a refusal dated that way could be read as answered by an earlier
 *  merge. Bounds: the project predates none of its rows (2026), so anything
 *  before Nov 2023 in ms is wrong-scale or forged; anything past 2100 is a
 *  forgery that would out-stand every future row. Shared with the criticality
 *  gate, which reads the same ledger. */
export const LEDGER_AT_MIN_MS = 1_700_000_000_000
export const LEDGER_AT_MAX_MS = 4_102_444_800_000
export const ledgerAtUsable = (at) =>
  typeof at === 'number' && Number.isFinite(at) && at >= LEDGER_AT_MIN_MS && at <= LEDGER_AT_MAX_MS

/** The mechanism paths out of a commit's file list. */
export function mechanismPathsIn(paths, opts) {
  return (paths ?? []).filter((p) => isMechanismPath(p, opts))
}

/**
 * Split a model designation into the two parts a comparison can be honest about.
 * "Claude Opus 4.8 <noreply@anthropic.com>" → { family: 'opus', version: '4.8' }.
 * The vendor word and the address carry no identity and are dropped.
 */
export function parseModel(name) {
  const raw = String(name ?? '').trim()
  const cleaned = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\bclaude\b/gi, ' ')
    .toLowerCase()
  return {
    raw,
    // ONE FAMILY PER MODEL, WHICHEVER HALF OF THE NAME IS WRITTEN (point 667).
    // Sol's designation carries its vendor's word in FRONT of it — "GPT-5.6
    // Sol" — so reading the first word as the family made it a different model
    // from the bare "Sol". Harmless while Sol only reviewed; now that it also
    // AUTHORS, that difference is how a self-review would pass the ledger.
    family: /\bsol\b/.test(cleaned) ? 'sol' : (cleaned.match(/[a-z]+/) ?? [''])[0],
    version: (cleaned.match(/\d+(?:\.\d+)?/) ?? [''])[0],
  }
}

/**
 * Are these two designations the SAME model — i.e. would a review by `a` of work
 * authored by `b` be a self-review?
 *
 * Conservative in the direction that matters: an unknown family on either side
 * can never PROVE a self-review (a merge commit carries no model trailer, and
 * refusing a review because authorship is unreadable would block a turn on a
 * question nobody can answer). A missing version on one side counts as the same
 * model — "opus" reviewing "Claude Opus 5" is the same pair of eyes — while two
 * KNOWN, different versions are different models, which is what makes the
 * project's Opus 5 / Opus 4.8 fallback usable as a reviewer.
 */
export function sameModel(a, b) {
  const x = parseModel(a)
  const y = parseModel(b)
  if (!x.family || !y.family) return false
  if (x.family !== y.family) return false
  if (!x.version || !y.version) return true
  return x.version === y.version
}

/** The family words of a model this project would recognise. */
const MODEL_FAMILY = 'sol|gpt|fable|opus|claude|sonnet|haiku|gemini|grok|llama|mistral|qwen|deepseek'

/** A model designation this project would recognise, for the fallback below. */
const MODEL_NAMED = new RegExp(`\\b(${MODEL_FAMILY})\\b`, 'gi')

/** …with its version where one is given: "Opus 4.8", "GPT-5.6", plain "Sol". */
const MODEL_WITH_VERSION = new RegExp(`\\b(?:${MODEL_FAMILY})(?:[\\s-]*\\d+(?:\\.\\d+)?)?`, 'gi')

/**
 * …and the fallback has to say the model was NOT THERE, not merely name one.
 *
 * `failed` and `refused` are deliberately BOUND to what failed (four-eyes
 * review, sixth round): bare, they matched "Sol failed the review", which is a
 * model that was very much there.
 */
const UNAVAILABLE = new RegExp(
  [
    /\b(unavailable|unreachable|inaccessible|offline|absent|missing|down|no access)\b/.source,
    /\bnot (available|reachable|there|running|up)\b/.source,
    /\bcould ?n[o']?t be reached\b/.source,
    /\bfailed to (respond|answer|reply|start|run|reach|load|launch)\b/.source,
    /\b(call|request|session|login|connection|command|run|attempt)s? (failed|refused|timed out|died)\b/.source,
    /\btimed out\b/.source,
    /\bonly two\b/.source,
  ].join('|'),
  'i',
)

/** "…was NOT unavailable" is not an absence; it is the opposite of one. */
const NEGATED_ABSENCE = /\bnot\s+(unavailable|unreachable|inaccessible|offline|absent|missing|down)\b/i

/**
 * Does `text` name a model that is NOT the one that merged?
 *
 * A designation carrying a VERSION is judged by sameModel, so an Opus 5 merger
 * may name Opus 4.8 as the model that was missing (four-eyes review, sixth
 * round: the family-word test refused that legitimate case). A bare family word
 * falls back to the words of the merger's own name, so "Sol was unreachable"
 * cannot be written by GPT-5.6 Sol about itself.
 */
export function namesOtherModel(text, who) {
  const mine = new Set([...String(who ?? '').matchAll(MODEL_NAMED)].map((m) => m[1].toLowerCase()))
  for (const [designation] of String(text ?? '').matchAll(MODEL_WITH_VERSION)) {
    const family = (designation.match(/[a-z]+/i) ?? [''])[0].toLowerCase()
    if (family === 'claude') continue
    if (parseModel(designation).version) {
      if (!sameModel(designation, who)) return true
      continue
    }
    if (!mine.has(family)) return true
  }
  return false
}

/**
 * The RECEIPT that a union was counted: the summary line
 * `scripts/blind-merge.mjs` prints when every input entry is accounted for.
 * The shape is asserted against a real summaryLine() in blind-merge-core.test.mjs,
 * so the two halves cannot drift apart — the regex lives HERE because this core
 * must not import the accounting one (that one already imports this).
 */
export const ACCOUNTING_RECEIPT =
  /^(\d+) A \+ (\d+) B entries → (\d+) union entries \((\d+) merged, (\d+) only A, (\d+) only B\): every input entry accounted for$/

/**
 * Is this receipt a line the accounting could actually have printed?
 *
 * The shape alone is a copyable string, so the NUMBERS are checked against each
 * other (four-eyes review, third round): every input entry has exactly one
 * disposition, so merged + only A + only B must equal the two list sizes; a
 * union cannot hold more entries than it folded, nor fewer than one when there
 * was anything to fold; and a "fold" of one entry is not a fold. It does not
 * make a fabricated line impossible — only one that has to add up.
 */
export function receiptBalances(line) {
  const m = ACCOUNTING_RECEIPT.exec(String(line ?? '').trim())
  if (!m) return false
  const [a, b, union, merged, onlyA, onlyB] = m.slice(1).map(Number)
  if (merged + onlyA + onlyB !== a + b) return false
  if (merged === 1) return false
  if (onlyA > a || onlyB > b) return false
  // THE UNION'S SIZE FOLLOWS FROM THE DISPOSITIONS (four-eyes review, fourth
  // round). Every entry standing alone is one union entry, and the merged ones
  // form between one fold (all of them together) and merged/2 folds (pairs) —
  // so a count claiming fewer union entries than singles is arithmetic nobody
  // could have produced.
  const singles = onlyA + onlyB
  if (!merged) return union === singles
  return union > singles && union <= singles + Math.floor(merged / 2)
}

/**
 * From when a blind-parallel record OWES its merger and its count.
 *
 * The ledger is tracked and outlives the CLI that wrote it, so the rows written
 * before this rule existed carry neither and must keep clearing the gate. A
 * cutoff grandfathers them by DATE instead of by "the field is missing", which
 * is what let a hand-edited row omit the fields and pass (four-eyes review,
 * second round). 11.08.2026, the day the rule landed.
 */
export const MERGE_ACCOUNTING_SINCE = Date.UTC(2026, 7, 11)

/**
 * From when a record OWES its four-eyes MODE (point 541's recorder demands it;
 * the GATE holds the same line against a hand-edited row — escalation round,
 * pass 1). Grandfathered by DATE like the merge accounting above, never by "the
 * field is missing": the ledger's last legitimately mode-less row is of
 * 07.08.2026, and a row with no timestamp is not old, it is unstamped.
 */
export const MODE_REQUIRED_SINCE = Date.UTC(2026, 7, 8)

/**
 * May THIS model MERGE the two lists of a blind-parallel stage? (point 634)
 *
 * The merge goes to the model that wrote NEITHER list. Until now it was done by
 * one of the two authors, which is the same self-judgment sameModel() refuses one
 * stage earlier for the review — and it sits at the one step where work can
 * disappear without a trace, because the errors of a fold are one-sided:
 * collapsing two entries that were not the same LOSES a finding silently, while
 * keeping them apart costs one duplicated review.
 *
 * `fallback` is the one honest way past it: where only two models were available,
 * that is RECORDED as such rather than silently merged by an author. It waives
 * the identity rule, never the counting — the union still has to account for
 * every entry (scripts/blind-merge.mjs).
 */
export function validateMerger({ mergedBy, authors = [], fallback = '' } = {}) {
  const errors = []
  const who = String(mergedBy ?? '').trim()
  const reason = String(fallback ?? '').trim()
  const named = authors.map((m) => String(m ?? '').trim()).filter(Boolean)
  if (!who) {
    errors.push(
      'no merging model named: the union of a blind-parallel stage is folded by the model that ' +
        'wrote NEITHER list (CLAUDE.md §6), and the record has to name it',
    )
    return { ok: false, errors, fallback: false }
  }
  const conflict = named.find((m) => sameModel(who, m))
  if (conflict && !reason) {
    errors.push(
      `"${who}" authored one of the two lists (${conflict}) and may not merge them: the merge is the one ` +
        'step where a finding can vanish, so it goes to the third model. Where only two models were ' +
        'available, record that as the fallback instead of merging silently.',
    )
  }
  if (reason && !conflict) {
    errors.push(`a two-model fallback is recorded, but "${who}" authored neither list — no fallback was needed`)
  }
  if (reason) {
    // A FALLBACK HAS TO SAY WHICH MODEL WAS NOT THERE (four-eyes review of point
    // 634, rounds one and five). Any eight characters would otherwise buy an
    // author the right to merge its own list — the escape hatch would be the
    // rule — and so would a line that merely mentions a model ("Opus 5 performed
    // the merge"). Nothing can VERIFY the claim; what is enforced is that it is
    // a checkable one: a model OTHER than the merger, and said to be absent.
    const named = [...String(reason).matchAll(MODEL_NAMED)].map((m) => m[1].toLowerCase())
    // THE NAME AND THE ABSENCE MUST BE THE SAME CLAIM (four-eyes review, sixth
    // round). Checked apart, "GPT-5.6 Sol was present; Opus 5 was unavailable"
    // satisfied both halves and said the opposite of what the exception means.
    // So one CLAUSE has to carry the other model AND its absence. The period
    // splits sentences but not version numbers ("GPT-5.6" stays whole).
    const clauses = String(reason).split(/[;,]|(?<!\d)\.|\.(?!\d)|\band\b|\bbut\b|\bwhile\b|\bso\b|\bhowever\b/i)
    const bound = clauses.some(
      (c) => UNAVAILABLE.test(c) && !NEGATED_ABSENCE.test(c) && namesOtherModel(c, who),
    )
    if (!named.length) {
      errors.push(
        `the two-model fallback has to NAME the model that was unavailable ("${reason}" names none) — ` +
          'it is the reason an author was allowed to merge, and an unnamed reason cannot be checked',
      )
    } else if (!namesOtherModel(reason, who)) {
      errors.push(
        `the two-model fallback names only "${who}" itself: it has to say which OTHER model was ` +
          'unavailable, since that is what made an author the merger',
      )
    } else if (!bound) {
      errors.push(
        `the two-model fallback does not say that the OTHER model was the absent one ("${reason}") — ` +
          'name it and say it was unreachable, in one breath: the exception is that model\'s absence',
      )
    }
  }
  return { ok: errors.length === 0, errors, fallback: Boolean(conflict && reason) }
}

/**
 * The merge half of a RECORD: who folded the two lists, on what count, and does
 * that model owe the two-model fallback? Required under blind-parallel and
 * meaningless under a review, which judges one artefact and folds nothing.
 *
 * The list authors are the record's own models: `model` reviewed, and the commit
 * trailers name who wrote it — EVERY Claude co-author (`authors`), not just the
 * first, since a second one named there could otherwise merge its own list
 * (four-eyes review of point 634). The merger has to be none of them.
 *
 * `accounting` is the receipt from `scripts/blind-merge.mjs`. Without it the
 * identity rule would stand alone and a record could claim a merge nobody
 * counted — the same review's second finding — so a blind-parallel record
 * carries the line that says every input entry was accounted for.
 */
export function validateMergedBy({
  mode,
  mergedBy,
  mergeFallback,
  accounting,
  model,
  authoredBy,
  authors,
} = {}) {
  const m = String(mode ?? '').trim()
  const who = String(mergedBy ?? '').trim()
  const reason = String(mergeFallback ?? '').trim()
  const receipt = String(accounting ?? '').trim()
  if (m && m !== BLIND_PARALLEL) {
    const errors = []
    if (who || reason) {
      errors.push(
        `--merged-by is meaningless under --mode ${m}: it names the model that folded two blind lists ` +
          'into one union, and a review has no such fold.',
      )
    }
    if (receipt) errors.push(`--accounting is meaningless under --mode ${m}: there is no union to count.`)
    return { ok: errors.length === 0, errors }
  }
  if (m !== BLIND_PARALLEL) return { ok: true, errors: [] }
  const wrote = (Array.isArray(authors) && authors.length ? authors : [authoredBy]).filter(Boolean)
  const { errors } = validateMerger({ mergedBy: who, authors: [model, ...wrote], fallback: reason })
  if (!receipt) {
    errors.push(
      '--accounting "<the summary line>": the union of a blind-parallel stage is COUNTED, not trusted. ' +
        'Run `node scripts/blind-merge.mjs --a <A> --b <B> --union <U>` and record the line it prints.',
    )
  } else if (!receiptBalances(receipt)) {
    errors.push(
      `--accounting: "${receipt}" is not the line blind-merge.mjs prints for a union that balances ` +
        '("<n> A + <m> B entries → <k> union entries …: every input entry accounted for"). A merge that ' +
        'leaves an entry unaccounted for is not recorded as one.',
    )
  }
  return { ok: errors.length === 0, errors }
}

/** The first MODEL co-author out of a `Co-Authored-By` trailer field. */
export function modelFromTrailers(field) {
  return modelsFromTrailers(field)[0] ?? ''
}

/**
 * EVERY model co-author of a commit, not just the first.
 *
 * The single-author read is right for "who wrote this" — the gate compares one
 * author against one reviewer — but wrong for the merge: a commit naming two
 * models has two list authors, and taking only the first would let the second
 * merge its own list (four-eyes review of point 634).
 *
 * IT ASKS THE AUTHOR ALLOWLIST WHAT A MODEL TRAILER LOOKS LIKE (point 667), and
 * no longer "does it say Claude". Since Sol authors too, a Claude-only reading
 * would report a Sol-authored commit as having no author at all — and every
 * self-review refusal downstream is built on knowing who wrote it. Human
 * co-authors still name no model and are still dropped.
 */
export function modelsFromTrailers(field) {
  const out = []
  for (const part of String(field ?? '').split(/[;,\n]/)) {
    // ASKED OF THE PARSED NAME, not the raw line (second cross-vendor round of
    // point 667): the raw line carries the ADDRESS, so a human co-author writing
    // from `build@sol.example` was returned as a model author — and would then
    // block a legitimate review as a self-review.
    if (part.trim() && modelNamesIn(part).length) out.push(part.trim())
  }
  return out
}

// ---------------------------------------------------------------------------
// THE ARGUMENT PARSER (point 540).
//
// Recording the four-eyes verdict for point 298 with `--point 298` stored NO
// point: the CLI that ran did not yet know the flag, and it neither warned nor
// failed — it dropped it. The consequence surfaced only later, when the
// criticality gate refused the tick with "no review recorded for this point"
// while a verdict for that exact commit sat in the ledger. An unrecognised INPUT
// must not read as an accepted one.
//
// So the parse is a PURE function that refuses everything it cannot account for
// — an unknown, misspelled or abbreviated flag, a flag written twice, a flag
// whose value is missing, an argument belonging to no flag — and the wrapper
// keeps its single responsibility: print what this says and exit.
//
// What it deliberately does NOT do is check whether the REQUIRED flags are
// there: that answer belongs to validateRecord(), whose usage block predates
// this parser and stays unchanged.
// ---------------------------------------------------------------------------

/** Every argument the record command accepts, and whether it takes a value. */
export const FLAG_SPEC = Object.freeze({
  '--record': true,
  '--model': true,
  '--verdict': true,
  '--evidence': true,
  '--point': true,
  '--mode': true,
  '--framing': true,
  '--author-framing': true,
  '--spec-examination': true,
  '--merged-by': true,
  '--merge-fallback': true,
  '--accounting': true,
  '--union': true,
  '--list-a': true,
  '--list-b': true,
  // A range whose material no single round can hold is reviewed in PASSES over
  // the file set, and each pass records what it actually read (point 714).
  '--pass': true,
  '--pass-files': true,
  // Authorship-cut passes also name the commits whose contributions they read.
  // A mixed-vendor path may occur in two passes, one per authoring commit; the
  // commit list makes those two readings distinct and lets the gate advance the
  // baseline for exactly the contribution that was seen.
  '--pass-commits': true,
  // A pass of an EARLIER round carries forward to a new head where every file
  // it read is byte-identical there (delta-scoped rounds, user decision
  // 18.08.2026): the recorder verifies the blob identity and the source
  // reading itself, and copies the source's verdict — a carry is provenance,
  // never a fresh judgment.
  '--carried-from': true,
  '--list': false,
})

/** The flag names, for callers that only ask "is this one of ours?". */
export const KNOWN_FLAGS = new Set(Object.keys(FLAG_SPEC))

/** Where each value-taking flag's value lands in the parsed values. */
const VALUE_KEY = Object.freeze({
  '--record': 'sha',
  '--model': 'model',
  '--verdict': 'verdict',
  '--evidence': 'evidence',
  '--point': 'point',
  '--mode': 'mode',
  '--framing': 'framing',
  '--author-framing': 'authorFraming',
  '--spec-examination': 'specExamination',
  '--merged-by': 'mergedBy',
  '--merge-fallback': 'mergeFallback',
  '--accounting': 'accounting',
  '--union': 'unionPath',
  '--list-a': 'listAPath',
  '--list-b': 'listBPath',
  '--pass': 'pass',
  '--pass-files': 'passFiles',
  '--pass-commits': 'passCommits',
  '--carried-from': 'carriedFrom',
})

/** Levenshtein distance — small inputs only, so the simple two-row form. */
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/**
 * The known flag a mistyped or abbreviated one most likely meant, or ''.
 *
 * An ABBREVIATION is treated as the likelier intent than a typo of the same
 * length: `--po` is four edits from `--point` but nobody types it by accident.
 * Beyond two edits nothing is suggested — a guess that names the wrong flag is
 * worse than none, because the reader then tries it.
 */
export function nearestFlag(token, known = KNOWN_FLAGS) {
  const raw = String(token ?? '')
  let best = ''
  let bestScore = Infinity
  for (const flag of known) {
    const score = raw.length >= 3 && flag.startsWith(raw) ? 0.5 : editDistance(raw, flag)
    if (score < bestScore) {
      bestScore = score
      best = flag
    }
  }
  return bestScore <= 2 ? best : ''
}

/**
 * Parse the argv slice into { ok, mode, values, errors }.
 *   mode    'list' (the ledger read, and the bare invocation) or 'record'
 *   values  { sha, model, verdict, evidence, point } — only what was given
 *   errors  one line per refusal, each NAMING the argument it is about
 */
export function parseArgs(argv = []) {
  const args = (Array.isArray(argv) ? argv : []).map((a) => String(a))
  const errors = []
  const values = {}
  const seen = new Set()
  let list = false

  const isFlagLike = (t) => typeof t === 'string' && t.startsWith('--')

  for (let i = 0; i < args.length; i++) {
    const token = args[i]
    if (!isFlagLike(token)) {
      errors.push(`stray argument "${token}": it belongs to no flag, so it would be dropped without a word`)
      continue
    }
    const eq = token.indexOf('=')
    const name = eq >= 0 ? token.slice(0, eq) : token

    if (!KNOWN_FLAGS.has(name)) {
      const near = nearestFlag(name)
      errors.push(`unknown flag ${name}${near ? ` — did you mean ${near}?` : ''}`)
      // Swallow its value, so the same mistake is not reported twice.
      if (eq < 0 && !isFlagLike(args[i + 1]) && args[i + 1] !== undefined) i++
      continue
    }
    if (eq >= 0) {
      errors.push(`${token}: write "${name} <value>" with a space — this command does not read ${name}=<value>`)
      continue
    }
    if (seen.has(name)) {
      errors.push(`${name} given more than once: one of the two values would be dropped silently`)
      if (FLAG_SPEC[name] && !isFlagLike(args[i + 1]) && args[i + 1] !== undefined) i++
      continue
    }
    seen.add(name)
    if (!FLAG_SPEC[name]) {
      list = true
      continue
    }
    const value = args[i + 1]
    if (value === undefined || isFlagLike(value)) {
      errors.push(
        `${name} expects a value, but ${
          value === undefined ? 'the command line ends there' : `the next argument is the flag ${value}`
        }`,
      )
      continue
    }
    values[VALUE_KEY[name]] = value
    i++
  }

  if (list && Object.keys(values).length) {
    errors.push('--list reads the ledger and --record writes to it: run one or the other, not both')
  }

  return {
    ok: errors.length === 0,
    mode: list || args.length === 0 ? 'list' : 'record',
    values,
    errors,
  }
}

/** The parse refusal, as the command prints it (the usage follows separately). */
export function formatArgErrors(errors = []) {
  return ['mechanism-review: refusing this command line.', '', ...errors.map((e) => `  · ${e}`)].join('\n')
}

/**
 * An answer that ADMITS no review took place: "I could not read the diff",
 * "none of my commands reached the repository", "no access to the patch".
 *
 * It lives here rather than beside the runner that first needed it because BOTH
 * halves must refuse it: the runner when a model answers that way, and
 * validateRecord when a hand writes the same sentence into the ledger. Kept
 * deliberately narrow — about ACCESS, not about findings — so that an ordinary
 * finding ("the parser could not handle CRLF") is still a review.
 *
 * It is a SAFETY NET, never a proof: no pattern list catches every way of
 * saying "I never saw it", and each round of the cross-vendor review found one
 * more phrasing. What keeps the gate honest is the runner falling back on any
 * unusable answer at all; this only stops the ones that would otherwise read as
 * a verdict.
 *
 * TWO TIERS, because the net caught a real review (measured 18.08.2026, point
 * 714 pass 2): a review OF this review tooling describes the tooling's own
 * failure modes in the net's own vocabulary — a finding about a file that ends
 * up "with no patch" association is a defect report, not an admission — and the
 * verdict it carried was routed to a fallback as "could not see the change".
 * A FALSE fallback is the mirror image of the bug the net exists for: it
 * discards a verdict somebody gave. So:
 *   FIRST PERSON  ("I could not read…", "none of my commands…") is always an
 *                 admission — a finding speaks about the code, not about "me".
 *   SUBJECT-ONLY  ("the diff could not be read", "no material") counts only
 *                 while the answer nowhere AFFIRMS a reading: a line that opens
 *                 with what was checked is reporting findings, and a phrase of
 *                 the net inside it describes the code under review.
 * blindReviewerAdmission() is the one entry point; both refusers ask it.
 */
const BLIND_FIRST_PERSON = new RegExp(
  [
    // "I could not read/see/access …", "we were unable to inspect …"
    /\b(?:i|we)\s+(?:could\s+not|couldn't|can(?:no|')t|(?:was|were)\s+(?:unable|not\s+able)\s+to|did\s+not\s+(?:get|receive|have))\b[^.\n]{0,80}\b(?:read|see|inspect|access|reach|open|review|view|retrieve|fetch|verify|validate|confirm|check|examine|evaluate|assess)\b/
      .source,
    // "I did not receive the patch" — a first-person no-review admission whose
    // OBJECT is the material itself, with no second inspection verb to anchor
    // on (landing-round pass 2): what was never received was never reviewed.
    /\b(?:i|we)\s+(?:did\s+not|didn't|never|do\s+not|don't|have\s+not|haven't)\s+(?:get|got|receive[d]?|have|had|obtain(?:ed)?)\b[^.\n]{0,80}\b(?:patch(?:es)?|diff(?:s)?|material|files?|content|repository|repo|change(?:s)?|input|access)\b/
      .source,
    // "none of my commands reached …"
    /\bnone\s+of\s+(?:my|our)\s+commands\b/.source,
  ].join('|'),
  'i',
)

const BLIND_SUBJECT = new RegExp(
  [
    // "…because the repository was unavailable" — the reason half of the same
    // admission, whatever verb the first half used (fifth cross-vendor round).
    /\b(?:repository|repo|diff|patch|material|files?|change|workspace|content)\s+(?:was|were|is|are)\s+(?:unavailable|unreachable|inaccessible|not\s+(?:available|reachable|accessible))\b/
      .source,
    // "no access to the diff", "without access to the files", "had no material"
    /\b(?:no|without|lacking|denied)\s+access\b/.source,
    /\bno\s+(?:material|patch|diff)\b/.source,
    /\b(?:repository|repo|file|material|workspace)\s+access\s+(?:failed|denied|was\s+denied)\b/.source,
    // "could not read the diff", "the patch was not supplied/provided"
    /\b(?:could\s+not|unable\s+to)\s+(?:read|inspect|access|retrieve)\s+(?:the\s+)?(?:diff|patch|files?|repository|material|change)\b/
      .source,
    // …and the same sentence in the passive, which the active form above does
    // NOT match: "the diff could not be read" (third cross-vendor round).
    /\b(?:diff|patch|files?|repository|material|change)\s+(?:could\s+not|cannot|can't)\s+be\s+(?:read|inspected|accessed|retrieved|seen)\b/
      .source,
    /\b(?:diff|patch|material|files?)\s+(?:was|were)\s+(?:not\s+(?:supplied|provided|available|accessible)|un(?:available|supplied|provided))\b/
      .source,
  ].join('|'),
  'i',
)

/**
 * The prompt fixes the evidence shape as "what you actually checked and what
 * you found", so a genuine review opens with a reading verb. Multiline: for the
 * callers that test a whole message, any line that opens so affirms a reading.
 *
 * A VACUOUS object un-affirms it (escalation round, pass 1): "Checked nothing;
 * the material was not supplied" opens with the verb and affirms no reading at
 * all — shielded, it walked the subject-only admission past the net. The verb
 * followed by nothing/none/"no <thing>"/neither is therefore not an affirmation.
 */
// The verb and its OBJECT CLAUSE (up to the first `;`, `.` or line end) are
// read together: the zero-object test must survive qualifiers between them
// (round-3 pass 1 — "Checked exactly 0 files" walked the lookahead).
const AFFIRMED_READING_LINE =
  /^\W*(?:checked|reviewed|read|inspected|examined|verified|compared|traced|audited|analysed|analyzed|assessed|judged|covered)\b([^.;\n]*)/gim
// A vacuous object: optional quantity qualifiers, then a zero word. Scoped to
// the clause START so a genuine finding later in the sentence ("…and found no
// drift") cannot un-affirm a real reading.
const VACUOUS_OBJECT =
  /^[\s:,;–—-]*(?:(?:exactly|only|just|precisely|merely|altogether|literally|in\s+total|a\s+total\s+of|the|all|these|those|its|their|any|some)\s+)*(?:nothing\b|none\b|neither\b|zero\b|0\b|not\s+(?:a\s+single|one|a)\b|no\s)/i
const AFFIRMED_READING = {
  test(t) {
    for (const m of String(t ?? '').matchAll(AFFIRMED_READING_LINE)) {
      if (!VACUOUS_OBJECT.test(m[1] ?? '')) return true
    }
    return false
  },
}

/** The union, kept for callers that want the raw net rather than the judgment. */
export const BLIND_REVIEWER = new RegExp(`${BLIND_FIRST_PERSON.source}|${BLIND_SUBJECT.source}`, 'i')

/**
 * Does this text ADMIT the reviewer never saw the change? The two-tier judgment
 * described at the net above. RESIDUAL, accepted and named: an answer that
 * opens with a reading verb and then reports its own missing material in the
 * subject-only voice ("Checked nothing; the material was not supplied") passes —
 * the net is a safety net, and the material accounting (materialShortfall), not
 * this text scan, is what decides whether a record may rest on a round.
 */
export function blindReviewerAdmission(text) {
  const t = String(text ?? '')
  if (BLIND_FIRST_PERSON.test(t)) return true
  if (AFFIRMED_READING.test(t)) return false
  return BLIND_SUBJECT.test(t)
}

/** Shortest form a message should print a sha in. */
const short = (sha) => String(sha ?? '').slice(0, 7)

/**
 * Is the four-eyes MODE this verdict claims a usable one? (point 541)
 *
 * A missing mode is REFUSED, never defaulted: the whole gap this closes is that
 * a review of an already-finished list passed as the blind-parallel work the
 * rule demands, and a default would re-open it in the quietest possible way.
 *
 * `framing` is the decorrelation used when no second model was available and two
 * blind runs of ONE model had to stand in — "a hostile tester", "a maintainer
 * inheriting the code" (CLAUDE.md §6). It belongs to the BLIND-PARALLEL mode
 * alone: under a review there is no second independent run to decorrelate, so a
 * framing recorded there would describe nothing.
 */
export function validateMode({ mode, framing } = {}) {
  const errors = []
  const m = String(mode ?? '').trim()
  const f = String(framing ?? '').trim()
  if (!m) {
    errors.push(
      `--mode <${MODES.join('|')}>: which form of the four-eyes principle this verdict covers ` +
        '(CLAUDE.md §6) — a CONVERGENT review of one artefact, or a DIVERGENT step run BLIND ' +
        'PARALLEL. There is no default: the two are not interchangeable, and a verdict that ' +
        'covers a finding step must name its form.',
    )
  } else if (!MODES.includes(m)) {
    errors.push(`--mode <v>: one of ${MODES.join(' | ')} — "${m}" is neither`)
  }
  if (f && m && m !== BLIND_PARALLEL) {
    errors.push(
      `--framing is meaningless under --mode ${m}: it records how the SECOND independent run was ` +
        'decorrelated, and a review has no second run. Drop it, or record the step as ' +
        `--mode ${BLIND_PARALLEL}.`,
    )
  }
  if (f && f.length < 8) {
    errors.push('--framing "<one line>": the stance the second blind run was given, not a word')
  }
  return { ok: errors.length === 0, errors }
}

/**
 * Is the PASS this record claims a usable one, and does it say what it read?
 *
 * A pass record is the answer to a range no single review round can hold (point
 * 714): the material is cut through the FILE SET, each pass is reviewed on its
 * own, and the range is cleared only once every pass is on record. So a pass
 * MUST name its files — a verdict that covers "one of three passes" without
 * saying which files it read is a coverage claim nobody can check — and the two
 * flags come as a pair, because either alone describes half a composition.
 *
 * A record naming NO pass is an ordinary whole-range review and stays one — that
 * is what a reviewer reading the repository itself produces, and every row
 * predating this point is of that shape. It is worth saying why the recorder
 * does not measure such a record against the material budget (asked by the
 * cross-vendor review, first round): the budget is the SENDING tool's attention
 * limit, and the recorder does not know the range. A record's range is fixed by
 * the GATE's baseline, not by anything the record carries, so "does this range
 * fit one round" is not a question this function can even ask — while the
 * offering side, which does know, already refuses (review-sol.mjs). What IS
 * checkable travels with the pass: the files it read, which the gate holds
 * against the commit it would clear. The check the recorder cannot make lives
 * where the range IS known (escalation round of the same review): the GATE
 * treats recorded passes at a sha as the measurement that its range did not fit
 * one round, and a pass-less row at that same sha does not stand alone there
 * (evaluateMechanismReview).
 *
 * Returns { ok, errors, pass } with `pass` the parsed record field, or null.
 */
export function validatePass({ pass, passFiles, passCommits } = {}) {
  const spec = String(pass ?? '').trim()
  // The list is parsed RAW (fourth cross-vendor round): trimming it here strips
  // the FIRST token's leading and the LAST token's trailing whitespace before
  // the parser can refuse them, so ` scripts/a.mjs` silently became a coverage
  // claim about `scripts/a.mjs` — a different path. Only PRESENCE is judged on
  // the trimmed view; the bytes go to the parser untouched, which fails loud.
  const listed = String(passFiles ?? '')
  const hasList = listed.trim() !== ''
  const commitList = String(passCommits ?? '').trim()
  const hasCommits = commitList !== ''
  if (!spec && !hasList && !hasCommits) return { ok: true, errors: [], pass: null }
  const errors = []
  if (!spec) {
    errors.push('--pass-files without --pass <k>/<n>: a file list belongs to a pass, and this record names none')
  }
  if (spec && !hasList) {
    errors.push(
      '--pass <k>/<n> without --pass-files: a pass verdict covers the files it actually read, and a ' +
        'record that does not name them claims a coverage nobody can check',
    )
  }
  if (!spec && hasCommits) {
    errors.push('--pass-commits without --pass <k>/<n>: commit scope belongs to a pass, and this record names none')
  }
  const parsed = spec ? parsePassSpec(spec) : { ok: false, errors: [] }
  errors.push(...parsed.errors)
  // The list parse FAILS LOUD on a path it cannot round-trip (a bare token with
  // edge whitespace, an unclosed quote) rather than trimming it into a
  // different path — a collapsed spelling is a coverage claim about a file
  // nobody named (cross-vendor review, third round).
  const list = parsePassFiles(listed)
  errors.push(...list.errors)
  if (hasList && list.ok && !list.files.length) {
    errors.push('--pass-files "<a,b,c>": the paths this pass reviewed, comma-separated')
  }
  const commits = commitList ? commitList.split(',') : []
  if (hasCommits && commits.some((sha) => !/^[0-9a-f]{7,40}$/i.test(sha))) {
    errors.push('--pass-commits "<sha,sha>": every contribution boundary must be a 7–40 character commit sha')
  }
  if (hasCommits && uniqStrings(commits).length !== commits.length) {
    errors.push('--pass-commits: each commit is named once; duplicate boundaries do not add coverage')
  }
  if (errors.length) return { ok: false, errors, pass: null }
  return {
    ok: true,
    errors: [],
    pass: { index: parsed.index, total: parsed.total, files: list.files, ...(hasCommits ? { commits } : {}) },
  }
}

const uniqStrings = (values) => [...new Set((values ?? []).map(String))]

/**
 * Is this a well-formed review record, and may it be WRITTEN?
 *
 * `authoredBy` is the model that authored the reviewed commit, read from its own
 * trailer. A match is REFUSED here rather than warned about: a self-review that
 * lands in the ledger is worse than none, because the gate then reads green.
 */
export function validateRecord({
  sha,
  model,
  verdict,
  evidence,
  authoredBy,
  mode,
  framing,
  authorFraming,
  specExamination,
  mergedBy,
  mergeFallback,
  accounting,
  authors,
  pass,
  passFiles,
  passCommits,
} = {}) {
  const errors = []
  errors.push(...validateMode({ mode, framing }).errors)
  const authorFrame = String(authorFraming ?? '').trim()
  const examination = String(specExamination ?? '').trim()
  if (authorFrame && String(mode ?? '').trim() !== 'review') {
    errors.push('--author-framing belongs to --mode review: it names the re-authoring commission that review judges')
  }
  if (authorFrame && authorFrame.length < 8) {
    errors.push('--author-framing "<one line>": the hostile-tester stance the authoring round received, not a word')
  }
  if (examination && !SPEC_EXAMINATION_VERDICTS.includes(examination)) {
    errors.push(`--spec-examination <v>: one of ${SPEC_EXAMINATION_VERDICTS.join(' | ')}`)
  }
  if (examination && String(mode ?? '').trim() !== 'review') {
    errors.push('--spec-examination belongs to --mode review: it is the cross-vendor reading of the point and brief')
  }
  if (examination && String(verdict ?? '').trim() !== 'merge') {
    errors.push('--spec-examination records its own sound/amended outcome and therefore uses --verdict merge')
  }
  if (examination && authorFrame) {
    errors.push('--spec-examination is not an authoring round and cannot also carry --author-framing')
  }
  errors.push(...validatePass({ pass, passFiles, passCommits }).errors)
  errors.push(...validateMergedBy({ mode, mergedBy, mergeFallback, accounting, model, authoredBy, authors }).errors)
  if (!/^[0-9a-f]{7,40}$/i.test(String(sha ?? '').trim())) {
    errors.push('--record <sha>: the commit that was judged, as a resolvable sha')
  }
  if (!String(model ?? '').trim()) {
    // The example NAMES the reviewer the rule prefers (point 624): reviews go to
    // GPT-5.6 Sol first and to Fable 5 when Sol is unavailable, and nothing here
    // restricts the value — a reviewer this recorder refused could not be used.
    errors.push('--model <name>: which model performed the review (e.g. "GPT-5.6 Sol", "Fable 5")')
  }
  if (!VERDICTS.includes(String(verdict ?? '').trim())) {
    errors.push(`--verdict <v>: one of ${VERDICTS.join(' | ')}`)
  }
  const ev = String(evidence ?? '').trim()
  if (ev.length < 10) {
    errors.push('--evidence "<one line>": what was actually checked — one honest line, not a word')
  } else if (blindReviewerAdmission(ev)) {
    // AN EVIDENCE LINE THAT ADMITS THE REVIEWER NEVER SAW THE CHANGE IS REFUSED
    // (point 624, second cross-vendor round). The first real cross-vendor run
    // answered `do-not-merge` because none of its commands reached the
    // repository — a well-formed verdict for a review that never happened. The
    // runner already falls back on such an answer; the RECORDER must refuse it
    // too, or a hand-typed line reopens the hole the runner closed.
    errors.push(
      `--evidence: "${ev}" says the reviewer could not see the change — that is not a review. ` +
        'Have it reviewed, then record what was actually read.',
    )
  } else if (/^<.*>$/.test(ev)) {
    // A LINE STILL IN ITS ANGLE BRACKETS IS THE PLACEHOLDER, not an observation
    // (four-eyes finding on point 624). The commands that print a record command
    // for a review still to be done leave the evidence as `<…>`, and the length
    // rule above waves a long placeholder straight through — which would put a
    // ledger line naming nothing in front of a gate that then reads green.
    errors.push(`--evidence: "${ev}" is still the placeholder — write what the review actually checked`)
  }
  if (String(model ?? '').trim() && String(authoredBy ?? '').trim() && sameModel(model, authoredBy)) {
    errors.push(
      `a SELF-REVIEW is refused: ${short(sha)} was authored by "${String(authoredBy).trim()}" and ` +
        `"${String(model).trim()}" is the same model. The value of a second pair of eyes is that ` +
        'they are different eyes — have the other model review it.',
    )
  }
  return { ok: errors.length === 0, errors }
}

/**
 * What is wrong with the MERGE this record claims, or '' if nothing is.
 *
 * The gate needs the same answer the recorder gives, on a row that may have been
 * hand-edited or written by a CLI that predates the rule: a blind-parallel row
 * from the rule's era owes a merging model, a receipt that the union balanced,
 * and a merger that wrote neither list (or a recorded two-model fallback).
 * `commit.authorModels` carries EVERY co-author where the wrapper could read it,
 * so a second one named in the trailers cannot merge its own list either.
 */
export function mergeProblem(record = {}, commit = {}) {
  if (String(record.mode ?? '') !== BLIND_PARALLEL) return ''
  // A row is grandfathered only by a REAL timestamp older than the rule. A row
  // with NO `at` is not old, it is unstamped — reading a missing field as legacy
  // was itself a bypass (four-eyes review, third round): omit `at`, `mergedBy`
  // and `accounting` together and nothing was ever checked.
  const at = Number(record.at)
  if (Number.isFinite(at) && at > 0 && at < MERGE_ACCOUNTING_SINCE) return ''
  const who = String(record.mergedBy ?? '').trim()
  if (!who) return 'no-merger'
  if (!receiptBalances(record.accounting)) return 'no-count'
  // The FALLBACK is judged, not merely present: any word in that field used to
  // buy an author the merge, while the recorder demanded it name the model that
  // was missing. One function answers for both halves.
  const authors = (commit.authorModels ?? [commit.authorModel]).filter(Boolean)
  const check = validateMerger({
    mergedBy: who,
    authors: [...authors, record.model].filter(Boolean),
    fallback: record.mergeFallback,
  })
  return check.ok ? '' : 'self-merge'
}

/** Ledger-era validity shared by the gate and the per-file debt planner. */
export function reviewRecordWellFormed(record = {}) {
  if (!VERDICTS.includes(String(record.verdict))) return false
  if (typeof record.model !== 'string' || !record.model.trim()) return false
  if (!ledgerAtUsable(record.at)) return false
  if (typeof record.evidence !== 'string') return false
  const evidence = record.evidence.trim()
  if (evidence.length < 10 || /^<.*>$/.test(evidence) || blindReviewerAdmission(evidence)) return false
  const mode = String(record.mode ?? '').trim()
  const at = Number(record.at)
  if (mode ? !MODES.includes(mode) : !(Number.isFinite(at) && at > 0 && at < MODE_REQUIRED_SINCE)) return false
  return record.carried === undefined || record.carriedVerified === true
}

/**
 * The gate itself.
 *
 * Inputs (plain data — the wrapper does the git work):
 *   baseline        sha the tree has already confirmed, or null (grandfathering:
 *                   with no baseline nothing is owed, which is how the twenty-odd
 *                   guards that predate this gate stay out of it)
 *   head            current HEAD
 *   pendingCommits  [{ sha, subject, at, authorModel, files, coveringRecordShas }]
 *                   — the commits in baseline..HEAD that touch a mechanism path;
 *                   `coveringRecordShas` are the records that CONTAIN this commit
 *                   (the wrapper resolves ancestry, so one review of a branch head
 *                   covers every mechanism commit below it)
 *   records         [{ sha, model, verdict, evidence, at, authoredBy }]
 *
 * Returns { block, clear, bootstrap, findings }.
 */
export function evaluateMechanismReview({
  baseline = null,
  head = '',
  pendingCommits = [],
  records = [],
} = {}) {
  if (!baseline) return { block: false, clear: true, bootstrap: true, findings: [], head }

  // A MULTIMAP, not one row per sha (point 714). A range reviewed in passes has
  // several records at the SAME sha, and keying them by sha alone kept only the
  // last one — which would read as a whole-range review when it covers one pass.
  const bySha = new Map()
  for (const record of records ?? []) {
    const key = String(record?.sha ?? '')
    if (!bySha.has(key)) bySha.set(key, [])
    bySha.get(key).push(record)
  }
  const findings = []

  for (const pendingCommit of pendingCommits ?? []) {
    let commit = pendingCommit
    const covering = [...new Set(commit?.coveringRecordShas ?? [])].flatMap((s) => bySha.get(String(s)) ?? [])
    // A record is only a review if it says who reviewed, how it ended AND what
    // was actually checked; a half-written line must not clear the gate. THE
    // GATE REVALIDATES THE ROW ITSELF, by the recorder's own rules (escalation
    // round, pass 1): the recorder refuses an evidence line that is missing,
    // too thin to mean anything, still the `<…>` placeholder, or an admission
    // that the reviewer never saw the material — but the ledger is a tracked
    // file anyone can hand-edit, and such a row entered `sound` and cleared
    // the range on the recorder's say-so alone. The MODE is held to the same
    // standard from the day the recorder began demanding it (see
    // MODE_REQUIRED_SINCE): a row of that era naming no usable mode can only
    // have arrived by hand.
    const rowWellFormed = reviewRecordWellFormed
    const wellFormed = covering.filter(rowWellFormed)
    // A MALFORMED REFUSAL POISONS, IT DOES NOT VANISH (final-round pass 1,
    // applied to both gates): a covering do-not-merge whose timestamp fails
    // the millisecond domain fell out of wellFormed, and the remaining sound
    // rows — an older merge among them — cleared the commit past a refusal
    // somebody recorded. EVERY well-formedness criterion poisons, not only
    // the timestamp (landing-round pass 2): a refusal with a valid `at` but a
    // `mode: "bogus"`, a missing model or unusable evidence fell out of
    // `sound` the same way, composed nothing, poisoned nothing — and an older
    // complete merge composition cleared past it. The recorder never writes
    // such a row; it can only have arrived by hand, and a hand-edited ledger
    // earns a refusal, never a clearance — it refuses until fixed or removed.
    // …recognised NORMALISED (landing-round pass 2): `"do-not-merge "` fails
    // the strict verdict test AND an exact-match poison net, and vanished
    // between the two.
    const refusalShaped = (r) =>
      typeof r?.verdict === 'string' && r.verdict.trim().toLowerCase() === BLOCKING_VERDICT
    const malformedRefusals = covering.filter((r) => refusalShaped(r) && !rowWellFormed(r))
    if (malformedRefusals.length) {
      findings.push({ kind: 'malformed-record', commit, records: malformedRefusals })
      continue
    }
    // A SELF-MERGE IS AS EMPTY AS A SELF-REVIEW, and the ledger is a tracked file
    // anyone can hand-edit (four-eyes review of point 634): the recorder refuses
    // a blind-parallel row whose merger wrote one of the lists or whose union was
    // never counted, and the gate refuses the same row when it arrives some other
    // way — by an edit, or from a branch whose CLI predates the rule. Rows older
    // than MERGE_ACCOUNTING_SINCE are grandfathered by DATE; treating a MISSING
    // field as legacy is what let an edited row simply omit it.
    const selfReviews = wellFormed.filter((r) => sameModel(r.model, commit?.authorModel) || mergeProblem(r, commit))
    const sound = wellFormed.filter((r) => !sameModel(r.model, commit?.authorModel) && !mergeProblem(r, commit))

    // AUTHORSHIP-SCOPED PASSES ADVANCE PER CONTRIBUTION. Unlike the legacy
    // size-only split below, these rows name the commits whose changes were in
    // the material. Each file can therefore clear as soon as its own
    // contribution was read; missing siblings stay owed by name instead of
    // pulling the cleared file back into every later whole-range demand.
    const scopedShape = (r) => Array.isArray(r?.pass?.commits) && Array.isArray(r?.pass?.files)
    const scoped = sound.filter((r) => scopedShape(r) && r.pass.commits.map(String).includes(String(commit.sha)))
    const remainingFiles = []
    let scopedRefusal = null
    for (const file of commit.files ?? []) {
      const rows = scoped.filter((r) => r.pass.files.map(String).includes(String(file)))
      if (!rows.length) {
        remainingFiles.push(file)
        continue
      }
      const latest = rows.reduce((a, b) => (Number(b.at ?? 0) >= Number(a.at ?? 0) ? b : a))
      if (String(latest.verdict) === BLOCKING_VERDICT) {
        scopedRefusal = !scopedRefusal || Number(latest.at) >= Number(scopedRefusal.at) ? latest : scopedRefusal
        remainingFiles.push(file)
      }
    }
    if (scopedRefusal) {
      findings.push({ kind: 'do-not-merge', commit: { ...commit, files: remainingFiles }, records: [scopedRefusal] })
      continue
    }
    if (!remainingFiles.length) continue
    commit = { ...commit, files: remainingFiles }
    const legacyCovering = covering.filter((r) => !scopedShape(r))
    const legacySound = sound.filter((r) => !scopedShape(r))

    // A PASS CLEARS NOTHING ON ITS OWN (point 714). The material of a large range
    // is cut through the file set and reviewed one pass at a time, so a single
    // pass record covers the files it named and no more; only a COMPLETE
    // composition — every pass of the same total, and their files covering THIS
    // COMMIT'S mechanism paths — stands for the range. An incomplete one is
    // reported as such rather than silently clearing the gate.
    //
    // THE FILE SET IS PASSED IN, and without it the count alone decided (first
    // cross-vendor round on this point): two records naming the same file, or
    // files from nowhere near this commit, read as `1/2` and `2/2` and cleared it.
    // The conservative direction is deliberate — a mechanism path this commit
    // touched and no pass named blocks, even where a later commit reverted it out
    // of the reviewed diff, because the way out is one honest pass record and the
    // way out of the other error is a guard nobody read.
    //
    // THE EXPECTED SET IS THE RECORD'S WHOLE RANGE where the wrapper measured it
    // (escalation round, passes 1 and 2): this gate keeps only mechanism paths
    // per commit, so a composition judged against them alone could read complete
    // while ordinary files of the reviewed range were in no pass — a range-wide
    // clearance over files nobody read. Each record carries `rangeFiles`, the
    // file set of `baseline..record.sha`; the commit's own mechanism paths stay
    // in the union so the older, narrower demand can never be relaxed by the
    // wider one, and a record without the measurement falls back to exactly the
    // narrower check this gate always made.
    // AN UNMEASURED RANGE NEVER NARROWS THE DEMAND (round-2 pass 1): where the
    // wrapper's range measurement failed, the old fallback judged the passes
    // against the commit's own mechanism paths alone — a smaller set, silently,
    // exactly when nothing could say which files the range really changed. An
    // empty expected set is passComposition's own unknown-coverage refusal, so
    // the composition then blocks instead of clearing narrower.
    const compositions = [...new Set(legacySound.map((r) => String(r?.sha ?? '')))].flatMap((sha) => {
      const rows = legacySound.filter((r) => String(r?.sha ?? '') === sha)
      const measured = rows.some((r) => Array.isArray(r?.rangeFiles))
      const range = [...new Set(rows.flatMap((r) => (Array.isArray(r?.rangeFiles) ? r.rangeFiles : [])))]
      return passComposition(rows, {
        expect: measured ? [...new Set([...range, ...(commit?.files ?? [])])] : [],
      })
    })
    const complete = compositions.filter((g) => g.complete)
    const incomplete = compositions.filter((g) => !g.complete)
    // A RECORDED SPLIT IS THE MEASUREMENT THAT ITS RANGE DID NOT FIT ONE ROUND
    // (point 714, escalation round). The RECORDER cannot ask "did this range
    // fit" — a record's range is fixed by this gate's baseline, not by anything
    // the record carries — but the GATE holds both halves: pass records at a sha
    // witness that the offering tool measured that sha's range as needing a
    // split, and the tool never offers a whole-range record for such a range. A
    // pass-less record AT THE SAME SHA therefore claims a reading the recorded
    // measurement contradicts (it can only arrive by hand), and it does not
    // stand alone; the way out is the honest one — complete the passes, or
    // supersede at a head whose range was never measured as oversized.
    // ANY PRESENT PASS CLAIM IS SPLIT EVIDENCE, however malformed (round-6
    // pass 2): the old shape test asked for a parseable total AND index, so a
    // hand-made row with `pass: { total: 2, index: "x" }` was no pass row at
    // all — it neither composed nor poisoned, and a sound pass-less sibling
    // could clear the commit past it. A `pass` field that exists at all can
    // only have been written to claim a split; what cannot be validated blocks.
    const passRow = (r) => r?.pass !== undefined && r?.pass !== null
    // THE SPLIT IS READ OFF EVERY RECORD AT EVERY COVERING SHA, sound or not
    // (fourth cross-vendor round, widened by the fifth): a pass row excluded as
    // a self-review or a broken merge still WITNESSES that the offering tool
    // measured a range containing THIS COMMIT as too large for one round — the
    // measurement stands whether or not that row's verdict may count, and a
    // MALFORMED one (an index outside its total, no file list) witnesses it no
    // less: the recorder refuses to write such a row, so it can only arrive by
    // hand, and a hand-edited ledger earns a refusal, never a clearance.
    // Restricting the poison to the SAME record sha let a pass-less record at a
    // DESCENDANT sha clear the commit while the split's missing passes were
    // never read (fifth round): the descendant's material CAN be smaller — a
    // later commit may delete what overflowed — but this gate reads the ledger
    // and cannot measure that, so it errs where erring only ever refuses. The
    // way out stays honest and is always open: complete the recorded passes.
    // Only records that COMPOSE must be sound; the evidence of the split need
    // not be.
    const split = legacyCovering.some(passRow)
    const besideSplit = split ? legacySound.filter((r) => !r?.pass) : []
    const valid = [
      ...(split ? [] : legacySound.filter((r) => !r?.pass)),
      ...complete.map((g) => ({
        ...g.records.reduce((a, b) => (Number(b.at ?? 0) >= Number(a.at ?? 0) ? b : a)),
        // The composition speaks with the WORST of its passes: one pass saying
        // do-not-merge is a range that must not merge, whatever the others found.
        verdict: worstVerdict(g.records),
        at: Math.max(...g.records.map((r) => Number(r.at ?? 0))),
        composedOf: g.total,
      })),
    ]

    // AN INCOMPLETE SPLIT IS MASKED ONLY BY A STRICTLY LATER VALID REVIEW
    // (final-round pass 2): reporting incomplete compositions only when no
    // complete one existed let an OLDER complete set — even one whose worst
    // verdict was merge — suppress a NEWER incomplete split, including one
    // whose recorded passes already said do-not-merge. A newer incomplete
    // split is a standing demand; only a review recorded AFTER its newest
    // pass supersedes it, which is the same later-answers-earlier rule every
    // verdict here obeys.
    const newestAt = (g) => Math.max(...g.records.map((r) => Number(r.at ?? 0)))
    // …AND BY DESCENT, not the clock alone (fourth landing round, carried
    // pass 3): a later-recorded review of an ANCESTOR or sibling sha — the
    // tool allows reviewing an older sha at any time — must not mask an
    // incomplete split on newer work. The superseding review must be AT the
    // split's sha (the same content, completely covered) or at a DESCENDANT
    // of it; the ancestry fact is the guard's measured containedShas, and a
    // missing fact supersedes nothing.
    const supersedes = (v, g) => {
      if (String(v.sha) === String(g.sha)) return true
      const fact = v.containedShas
      const set = fact instanceof Set ? fact : Array.isArray(fact) ? new Set(fact.map(String)) : null
      return set ? set.has(String(g.sha)) : false
    }
    const standingIncomplete = incomplete.filter(
      (g) => !valid.some((v) => Number(v.at ?? 0) > newestAt(g) && supersedes(v, g)),
    )
    if (standingIncomplete.length) {
      // The widest gap is the one reported: a missing pass and a file no pass
      // named are the same failure — material the composition does not hold.
      const gap = (g) => (g.missing?.length ?? 0) + (g.uncovered?.length ?? 0)
      const worst = standingIncomplete.reduce((a, b) => (gap(b) >= gap(a) ? b : a))
      findings.push({
        kind: 'incomplete-passes',
        commit,
        records: worst.records,
        passes: worst,
        besideSplit,
      })
      continue
    }
    if (!valid.length) {
      findings.push({
        kind: selfReviews.length ? 'self-review' : 'no-review',
        commit,
        records: selfReviews,
      })
      continue
    }
    // Latest valid review wins: a later "merge" is allowed to supersede an
    // earlier refusal, which is what happens when the fixes are made.
    // A REFUSAL IS ANSWERED ONLY BY DESCENT (second landing round, pass 2;
    // user decision 18.08.2026). Timestamp-only supersession let a later
    // merge review of an ANCESTOR — or of the same commit — clear a
    // do-not-merge recorded on newer work: a verdict on work that does not
    // CONTAIN the fix cleared the demand for it. The criticality gate has
    // demanded descent all along; the pair now agrees. The ancestry fact is
    // MEASURED by the impure guard (attachCoverage's rev-list per record,
    // `containedShas`) and handed in as data; a clearing record whose fact is
    // missing answers nothing — no ancestry fact, no clearance — and a
    // same-sha re-record fixes nothing, exactly as at the sibling gate.
    const clearing = valid.filter((r) => String(r.verdict) !== BLOCKING_VERDICT)
    const refusals = valid.filter((r) => String(r.verdict) === BLOCKING_VERDICT)
    const answers = (c, u) => {
      if (String(c.sha) === String(u.sha)) return false
      const fact = c.containedShas
      const set = fact instanceof Set ? fact : Array.isArray(fact) ? new Set(fact.map(String)) : null
      return set ? set.has(String(u.sha)) : false
    }
    const open = refusals.filter(
      (u) => !clearing.some((c) => Number(c.at ?? 0) > Number(u.at ?? 0) && answers(c, u)),
    )
    if (open.length) {
      const latest = open.reduce((a, b) => (Number(b.at ?? 0) >= Number(a.at ?? 0) ? b : a))
      findings.push({ kind: 'do-not-merge', commit, records: [latest] })
    }
  }

  return { block: findings.length > 0, clear: findings.length === 0, bootstrap: false, findings, head }
}

/** Render the verdict as the guard's refusal — every offender, and the way out. */
export function formatMechanismReviewVerdict(verdict) {
  if (!verdict?.block) return ''
  const lines = [
    'FOUR-EYES GATE ON MECHANISMS: a guard, gate or git hook changed here and no ' +
      'second model has recorded a review of it.',
    '',
  ]
  for (const f of verdict.findings) {
    const c = f.commit ?? {}
    const files = (c.files ?? []).join(', ')
    const author = String(c.authorModel ?? '').trim() || 'unknown model'
    if (f.kind === 'do-not-merge') {
      const r = f.records[0] ?? {}
      lines.push(
        `  ✗ ${short(c.sha)} ${c.subject ?? ''}`,
        `      ${files}`,
        `      ${String(r.model).trim()} reviewed this and said DO-NOT-MERGE: ${r.evidence ?? ''}`,
        '      Fix what the review found, then record the re-review at a commit that DESCENDS',
        `      from ${short(r.sha)} — the verdict is not advisory, and a verdict on work that does`,
        '      not contain the fix answers nothing.',
      )
      continue
    }
    if (f.kind === 'malformed-record') {
      const r = f.records[0] ?? {}
      lines.push(
        `  ✗ ${short(c.sha)} ${c.subject ?? ''}`,
        `      ${files}`,
        `      a recorded do-not-merge on ${short(r.sha)} is malformed — a timestamp outside the`,
        "      ledger's millisecond domain (it then cannot be ORDERED against the reviews around",
        '      it), a missing model, unusable evidence or an unknown mode. The recorder never',
        '      writes such a row, so it can only have arrived by hand. It refuses rather than',
        '      vanishes: fix or remove the row, on the record.',
      )
      continue
    }
    if (f.kind === 'incomplete-passes') {
      const p = f.passes ?? {}
      lines.push(`  ✗ ${short(c.sha)} ${c.subject ?? ''}`, `      ${files}`)
      if ((p.missing ?? []).length) {
        lines.push(
          `      the review was split into ${p.total} passes over the FILE SET and only ${p.have} are on ` +
            `record — missing pass ${(p.missing ?? []).join(', ')}`,
          '      A pass covers the files it named; the range is cleared when every pass is recorded:',
          `      node scripts/review-sol.mjs --sha ${short(c.sha)} --brief "<what to judge>" --pass ${(p.missing ?? [])[0] ?? 1}`,
        )
      }
      // COUNTING THE PASSES IS NOT COUNTING THE FILES. Passes that are all on
      // record still cover only what they NAMED, and a mechanism path none of
      // them names is one this record would clear unread.
      if ((p.uncovered ?? []).length) {
        lines.push(
          `      the ${p.have} recorded pass(es) of this ${p.total}-part split name ` +
            `${(p.files ?? []).length} file(s), and these were in NONE of them — nobody read them:`,
          `        ${(p.uncovered ?? []).join(', ')}`,
          '      Review those files in a pass of their own and record it — a composition covers',
          '      its union and not one file more.',
        )
      }
      if ((f.besideSplit ?? []).length) {
        lines.push(
          '      A pass-less record at this sha does NOT stand in for the split: the recorded',
          '      passes ARE the measurement that this range did not fit one review round, so a',
          '      whole-range claim beside them covers files nobody read. Complete the passes.',
        )
      }
      continue
    }
    const blind = (f.records ?? []).find((r) => mergeProblem(r, c))
    const mergeLine = () => {
      const who = String(blind?.mergedBy ?? '').trim()
      const problem = mergeProblem(blind, c)
      if (problem === 'no-merger') {
        return "      the record is blind-parallel and names no merging model — the union's fold is unowned"
      }
      if (problem === 'no-count') {
        return `      ${who} merged the union, but the record carries no count of it — a merge nobody counted`
      }
      return (
        `      the union was merged by ${who}, which wrote one of the two lists — ` +
        'a self-merge is where a finding disappears'
      )
    }
    lines.push(
      `  ✗ ${short(c.sha)} ${c.subject ?? ''}`,
      `      ${files}`,
      f.kind !== 'self-review'
        ? `      authored by ${author}; no review recorded`
        : blind
          ? mergeLine()
          : `      the only review on record is by ${author}'s own model — a self-review is not a review`,
    )
  }
  lines.push(
    '',
    'A mechanism that is wrong is worse than none: the rule then COUNTS as enforced and',
    'nobody looks again. Have the OTHER model review the change — plan and result — and',
    'record what it said:',
    '',
    '  node scripts/mechanism-review.mjs --record <sha> --model <name> \\',
    `      --verdict <${VERDICTS.join('|')}> --evidence "<one line>" --mode <${MODES.join('|')}>`,
    '',
    'One record covers every mechanism commit it contains, so reviewing the branch head is',
    'enough. Inspect the gate with: node scripts/mechanism-review-guard.mjs --status',
  )
  return lines.join('\n')
}
