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
  const p = String(path ?? '').replace(/\\/g, '/')
  if (NAMED_MECHANISM_FILES.includes(p)) return true
  if (p.startsWith('scripts/git-hooks/') && p.length > 'scripts/git-hooks/'.length) return true
  const m = /^scripts\/([A-Za-z0-9._-]+)\.mjs$/.exec(p)
  if (!m) return false
  const name = m[1]
  if (/-(guard|gate)\b/.test(name)) return true
  // "beside one": strip the trailing -core / .test decorations and ask whether a
  // guard or gate of that stem exists in the same directory.
  let stem = name
  for (let i = 0; i < 4 && /(-core|\.test)$/.test(stem); i++) stem = stem.replace(/(-core|\.test)$/, '')
  if (!stem) return false
  const files = Array.isArray(scriptFiles) ? scriptFiles : []
  return files.includes(`${stem}-guard.mjs`) || files.includes(`${stem}-gate.mjs`)
}

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
    family: (cleaned.match(/[a-z]+/) ?? [''])[0],
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

/** A model designation this project would recognise, for the fallback below. */
const MODEL_NAMED = /\b(sol|gpt|fable|opus|claude|sonnet|haiku|gemini|grok|llama|mistral|qwen|deepseek)\b/i

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
  if (union > a + b) return false
  return a + b === 0 ? union === 0 : union >= 1
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
  if (reason && !MODEL_NAMED.test(reason)) {
    // A FALLBACK HAS TO NAME THE MODEL THAT WAS NOT THERE (four-eyes review of
    // point 634). Any eight characters would otherwise buy an author the right
    // to merge its own list — the escape hatch would be the rule. Nothing can
    // verify the claim, but a claim that names a model is one someone can check
    // against the session, and a vague one is refused where it is cheapest.
    errors.push(
      `the two-model fallback has to NAME the model that was unavailable ("${reason}" names none) — ` +
        'it is the reason an author was allowed to merge, and an unnamed reason cannot be checked',
    )
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

/** The first Claude co-author out of a `Co-Authored-By` trailer field. */
export function modelFromTrailers(field) {
  return modelsFromTrailers(field)[0] ?? ''
}

/**
 * EVERY Claude co-author of a commit, not just the first.
 *
 * The single-author read is right for "who wrote this" — the gate compares one
 * author against one reviewer — but wrong for the merge: a commit naming two
 * models has two list authors, and taking only the first would let the second
 * merge its own list (four-eyes review of point 634).
 */
export function modelsFromTrailers(field) {
  const out = []
  for (const part of String(field ?? '').split(/[;,\n]/)) {
    if (/\bclaude\b/i.test(part) && part.trim()) out.push(part.trim())
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
  '--merged-by': true,
  '--merge-fallback': true,
  '--accounting': true,
  '--union': true,
  '--list-a': true,
  '--list-b': true,
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
  '--merged-by': 'mergedBy',
  '--merge-fallback': 'mergeFallback',
  '--accounting': 'accounting',
  '--union': 'unionPath',
  '--list-a': 'listAPath',
  '--list-b': 'listBPath',
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
 */
export const BLIND_REVIEWER = new RegExp(
  [
    // "I could not read/see/access …", "we were unable to inspect …"
    /\b(?:i|we)\s+(?:could\s+not|couldn't|can(?:no|')t|(?:was|were)\s+(?:unable|not\s+able)\s+to|did\s+not\s+(?:get|receive|have))\b[^.\n]{0,80}\b(?:read|see|inspect|access|reach|open|review|view|retrieve|fetch|verify|validate|confirm|check|examine|evaluate|assess)\b/
      .source,
    // "…because the repository was unavailable" — the reason half of the same
    // admission, whatever verb the first half used (fifth cross-vendor round).
    /\b(?:repository|repo|diff|patch|material|files?|change|workspace|content)\s+(?:was|were|is|are)\s+(?:unavailable|unreachable|inaccessible|not\s+(?:available|reachable|accessible))\b/
      .source,
    // "no access to the diff", "without access to the files", "had no material"
    /\b(?:no|without|lacking|denied)\s+access\b/.source,
    /\bno\s+(?:material|patch|diff)\b/.source,
    // "none of my commands reached …", "repository access failed"
    /\bnone\s+of\s+my\s+commands\b/.source,
    /\b(?:repository|repo|file|material|workspace)\s+access\s+(?:failed|denied|was\s+denied)\b/.source,
    // "the diff could not be read", "the patch was not supplied/provided"
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
  mergedBy,
  mergeFallback,
  accounting,
  authors,
} = {}) {
  const errors = []
  errors.push(...validateMode({ mode, framing }).errors)
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
  } else if (BLIND_REVIEWER.test(ev)) {
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

  const bySha = new Map((records ?? []).map((r) => [String(r?.sha ?? ''), r]))
  const findings = []

  for (const commit of pendingCommits ?? []) {
    const covering = (commit?.coveringRecordShas ?? [])
      .map((s) => bySha.get(String(s)))
      .filter(Boolean)
    // A record is only a review if it says who reviewed and how it ended; a
    // half-written line must not clear the gate.
    const wellFormed = covering.filter(
      (r) => VERDICTS.includes(String(r.verdict)) && String(r.model ?? '').trim(),
    )
    // A SELF-MERGE IS AS EMPTY AS A SELF-REVIEW, and the ledger is a tracked file
    // anyone can hand-edit (four-eyes review of point 634): the recorder refuses
    // a blind-parallel row whose merger wrote one of the lists or whose union was
    // never counted, and the gate refuses the same row when it arrives some other
    // way — by an edit, or from a branch whose CLI predates the rule. Rows older
    // than MERGE_ACCOUNTING_SINCE are grandfathered by DATE; treating a MISSING
    // field as legacy is what let an edited row simply omit it.
    const selfReviews = wellFormed.filter((r) => sameModel(r.model, commit?.authorModel) || mergeProblem(r, commit))
    const valid = wellFormed.filter((r) => !sameModel(r.model, commit?.authorModel) && !mergeProblem(r, commit))

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
    const latest = valid.reduce((a, b) => (Number(b.at ?? 0) >= Number(a.at ?? 0) ? b : a))
    if (latest.verdict === BLOCKING_VERDICT) {
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
        '      Fix what the review found, then record the re-review — the verdict is not advisory.',
      )
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
