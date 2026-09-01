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

import { resolve } from 'node:path'

// What a co-author trailer naming a MODEL looks like. It is the author
// allowlist's own answer (scripts/model-guard-core.mjs, which imports nothing),
// so "who authored this" cannot drift from "who may author at all".
import { modelNamesIn } from './model-guard-core.mjs'
import { FABLE_MODEL, fableIsOn, isSwitchFallbackReason, mergeFallbackReason, mergerModel } from './fable-switch-core.mjs'
// …and how a review split into PASSES over the file set composes back into a
// coverage (point 714). Both the recorder and this gate ask the same module, so
// what may be WRITTEN and what CLEARS cannot drift apart.
import { parsePassFiles, parsePassSpec, passComposition, worstVerdict } from './review-material-core.mjs'
import { scopeMandatoryDuty } from './mandatory-duty-core.mjs'

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

/** Where the tracked ledger sits inside ANY checkout of this repository. */
export const LEDGER_RELATIVE_PATH = '.claude/mechanism-reviews.jsonl'

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
  // RECORDING A VERDICT IS EVIDENCE ABOUT A MECHANISM, NOT A NEW MECHANISM.
  // If a ledger-only append triggered this gate, clearing one contribution
  // would create the next contribution and the debt could never converge. The
  // exclusion is deliberately only at the contribution trigger: when a commit
  // changes an actual mechanism too, pendingReviewContributions keeps the
  // commit's complete file set, including this ledger, so a deletion or rewrite
  // co-committed with code is still inside the second reader's material.
  if (raw === LEDGER_RELATIVE_PATH) return false
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

/** The one-time ledger shape used to close debt created by the retired
 * baseline-wide scope. The wrapper stamps matching rows only after Git proves
 * their commit belongs to this fixed revision interval. */
export const CONTRIBUTION_DISPOSITION_KIND = 'mechanism-contribution-disposition'
export const LEGACY_CONTRIBUTION_BASELINE = '265712e40e6c31c81605c1279a01a320be7a8f70'
export const CONTRIBUTION_SCOPE_BOUNDARY = '6edd81fd2e88586df0157b956c7eb7b530a65777'
export const LEGACY_RANGE_RETIREMENT_REASON =
  'legacy baseline-wide debt had no complete contribution-scoped review; measured 45 passes at open, 42 at close, and 115 on main'

/**
 * The ledger of the checkout a command is ACTUALLY RUNNING IN (point 780).
 *
 * It used to be pinned to the module's own directory, which is the MAIN
 * checkout whenever the command is invoked by its main-tree path — and every
 * delegated author runs from an isolation worktree (CLAUDE.md §6). The append
 * then landed in the main tree while the commit that seals it ran in the
 * worktree, so `git add` refused the absolute main path as "outside repository"
 * and the run aborted having already written a line about a commission that
 * never started. Resolving against the git TOPLEVEL of the working directory
 * puts the record on the point's own branch, where the comment above it always
 * said it belonged, and it travels to `main` with the merge.
 *
 * NO FALLBACK CHECKOUT (cross-vendor review of this point, both passes). A run
 * outside any checkout — a bare repository, a stray working directory — has NO
 * ledger, and answering it with the module's own tree is the very defect this
 * function exists to remove, only quieter: it would silently read and write a
 * DIFFERENT checkout's tracked file. `null` says so, and the writers refuse on
 * it rather than guessing.
 *
 * The toplevel is used EXACTLY as git gave it (same review): a POSIX path may
 * legitimately end in a space, so only "git said nothing" is special-cased here
 * and the caller strips git's terminating line break, nothing else.
 */
export function ledgerPathFrom(toplevel) {
  const root = toplevel == null ? '' : String(toplevel)
  if (root === '') return null
  return resolve(root, LEDGER_RELATIVE_PATH)
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
    // AN API ID SEPARATES ITS MINOR WITH A DASH, a human name with a dot, and the
    // version regex below only ever knew the dot — so `claude-opus-4-8` read as
    // version "4" and did NOT match "Opus 4.8", i.e. that pair was silently NOT
    // recognised as one model. It stayed invisible while the only dashed id in use
    // had no minor at all (`claude-fable-5` vs "Fable 5"); moving that lane to
    // Fable 5.1 is what surfaced it (point 1041). A dated snapshot keeps working:
    // `claude-haiku-4-5-20251001` becomes 4.5.20251001 and still reads as 4.5.
    .replace(/(\d)-(?=\d)/g, '$1.')
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

/**
 * Why `reviewer` cannot be independent of EVERY author named by a commit.
 *
 * Four eyes is a vendor boundary, not a model-family boundary.  The author list
 * is authoritative even when it is empty: an empty list means authorship is
 * unknown, never "no author to conflict with".  Keeping this as one predicate
 * gives the recorder, whole-range reviews and file-scoped reviews the same
 * fail-closed answer.
 */
export function reviewIdentityProblem(reviewer, commit = {}) {
  const authors = Array.isArray(commit.authorModels)
    ? commit.authorModels
    : Array.isArray(commit.authors)
      ? commit.authors
      : [commit.authorModel ?? commit.authoredBy].filter(Boolean)
  const named = authors.map((author) => String(author ?? '').trim()).filter(Boolean)
  if (!named.length || named.some((author) => modelVendor(author) === 'unknown')) return 'unknown-author'
  const reviewerVendor = modelVendor(reviewer)
  if (reviewerVendor === 'unknown') return 'unknown-reviewer'
  return named.some((author) => modelVendor(author) === reviewerVendor) ? 'same-vendor' : ''
}

/** The two reasons the preferred OpenAI reader can legitimately yield to the
 *  Claude chain. They are explicit because a same-vendor review without a
 *  handover would otherwise bypass the cross-vendor preference by assertion. */
export const REVIEW_HANDOVERS = Object.freeze(['sol-authored', 'sol-unavailable'])
export const SOL_UNAVAILABLE_REVIEW_CHAIN = Object.freeze([FABLE_MODEL, 'Opus 5', 'Opus 4.8'])
export const SOL_AUTHORED_REVIEW_CHAIN = Object.freeze(['Opus 5', FABLE_MODEL, 'Opus 4.8'])

/** The chain in force for a handover at record time. */
export function handoverChainFor(reason, fableState) {
  const chain = reason === 'sol-authored'
    ? SOL_AUTHORED_REVIEW_CHAIN
    : reason === 'sol-unavailable'
      ? SOL_UNAVAILABLE_REVIEW_CHAIN
      : []
  if (!chain.length) return Object.freeze([])
  if (fableState === undefined || fableIsOn(fableState)) return Object.freeze([...chain])
  return Object.freeze(chain.filter((model) => !sameModel(model, FABLE_MODEL)))
}

/** What is wrong with a recorded handover, or ''. The selected fallback must
 *  be the first chain member that authored no part of the range. */
export function reviewHandoverProblem({ reviewer = '', authors = [], handover = '', chain = null } = {}) {
  const reason = String(handover ?? '').trim()
  if (!REVIEW_HANDOVERS.includes(reason)) return 'missing-or-unknown-handover'
  const named = (Array.isArray(authors) ? authors : [authors]).map(String).filter(Boolean)
  if (!named.length || named.some((author) => modelVendor(author) === 'unknown')) return 'unknown-author'
  const candidates = Array.isArray(chain) && chain.length ? chain.map(String) : handoverChainFor(reason)
  if (!candidates.length) return 'empty-handover-chain'
  if (reason === 'sol-authored' && !named.some((author) => sameModel(author, 'GPT-5.6 Sol'))) {
    return 'sol-was-not-an-author'
  }
  if (reason === 'sol-unavailable' && named.some((author) => sameModel(author, 'GPT-5.6 Sol'))) {
    return 'sol-authorship-requires-role-swap'
  }
  const expected = candidates.find((candidate) => !named.some((author) => sameModel(candidate, author))) ?? ''
  if (!expected) return 'every-handover-model-authored'
  return sameModel(expected, reviewer) ? '' : `expected-${expected}`
}

/** The gate's complete independence ruling for one record. A valid, explicit
 *  handover is the sole exception to the preferred cross-vendor boundary. */
export function independentReviewProblem(record = {}, commit = {}) {
  const ordinary = reviewIdentityProblem(record?.model, commit)
  if (ordinary !== 'same-vendor') return ordinary
  return reviewHandoverProblem({
    reviewer: record?.model,
    authors: commit?.authorModels ?? commit?.authors ?? [commit?.authorModel ?? commit?.authoredBy].filter(Boolean),
    handover: record?.handover,
    chain: record?.handoverChain,
  })
}

/** Only a convergent reading of the changed code can cover that code. */
export function attestsToCodeReading(record = {}) {
  return String(record.mode ?? '').trim() === 'review' && !String(record.specExamination ?? '').trim()
}

const containedBy = (record, sha) => {
  if (String(record?.sha ?? '') === String(sha)) return true
  const fact = record?.containedShas
  return fact instanceof Set
    ? fact.has(String(sha))
    : Array.isArray(fact) && fact.map(String).includes(String(sha))
}

/**
 * How a bounded end-state reading relates to one pending contribution.
 *
 * A file-scoped record says exactly which contribution state it READ:
 * `pass.endState`, cryptographically bound by the recorder to the record sha.
 * An older commit contained by that record may have touched the same file, but
 * it was not the contribution whose verdict the reviewer rendered. Calling it
 * CO-TOUCHING prevents a refusal on the end state from becoming a refusal of
 * every historical edit to that hot file.
 *
 * Only the complete recorder shape earns that narrowing. Missing or mutated
 * bounds return `range`, preserving the pre-existing fail-closed reach for
 * legacy and hand-edited rows. `unrelated` is useful to callers inspecting a
 * broader record set; the gate ordinarily hands this function covering rows.
 */
export function contributionReviewScope(record = {}, commit = {}) {
  const pass = record?.pass
  const files = Array.isArray(pass?.files) ? pass.files : null
  const bounded =
    pass &&
    !Array.isArray(pass.commits) &&
    Number.isInteger(pass.index) &&
    Number.isInteger(pass.total) &&
    pass.index >= 1 &&
    pass.total >= 1 &&
    pass.index <= pass.total &&
    files?.length > 0 &&
    files.every((file) => typeof file === 'string' && file.length > 0) &&
    typeof pass.endState === 'string' &&
    pass.endState === String(record?.sha ?? '')
  if (!bounded) return 'range'
  if (!containedBy(record, commit?.sha)) return 'unrelated'
  const touched = new Set((commit?.files ?? []).map(String))
  if (!files.some((file) => touched.has(String(file)))) return 'unrelated'
  return String(commit?.sha ?? '') === pass.endState ? 'read' : 'co-touching'
}

const descendsFrom = (record, earlier) =>
  String(record?.sha ?? '') !== String(earlier?.sha ?? '') && containedBy(record, earlier?.sha)

/**
 * A later bounded reading may narrow an earlier refusal at the SAME immutable
 * state, but it cannot answer the refusal wholesale. This is scope correction,
 * not a claim that unchanged code was fixed: the clearing row must name a
 * strict subset of the refusal's files and the file currently being judged.
 * Re-reading the same set still fixes nothing and remains blocked.
 */
const narrowsSameStateRefusal = (answer, refusal, requiredFiles = []) => {
  if (String(answer?.sha ?? '') !== String(refusal?.sha ?? '')) return false
  const answerFiles = Array.isArray(answer?.pass?.files) ? [...new Set(answer.pass.files.map(String))] : []
  const refusalFiles = Array.isArray(refusal?.pass?.files) ? [...new Set(refusal.pass.files.map(String))] : []
  if (!answerFiles.length || answerFiles.length >= refusalFiles.length) return false
  if (!answerFiles.every((file) => refusalFiles.includes(file))) return false
  return (requiredFiles ?? []).every((file) => answerFiles.includes(String(file)))
}

const commitAuthors = (commit = {}) => {
  const authors = Array.isArray(commit.authorModels)
    ? commit.authorModels
    : [commit.authorModel ?? commit.authoredBy].filter(Boolean)
  return authors.map((author) => String(author ?? '').trim()).filter(Boolean)
}

/**
 * Files on a refusing contribution which a later contribution by the refusing
 * vendor demonstrably fixed and had read by the other vendor.
 *
 * This belongs at refusal evaluation, not in `review-sol`'s authorship cut.
 * Changing the planner per contribution could OFFER a Sol pass for the old
 * Claude contribution, but it could not make the gate accept the Claude review
 * of Sol's answering commit; the command and the decision would still disagree.
 * Here both file-scoped and legacy refusal paths consume the same ledger fact.
 *
 * The exception is a CHAIN, never a waiver. Each link is machine-checkable:
 * the answering commit is later, is authored wholly by the vendor that made the
 * refusal, touches the refused file, and has an exact-sha code review whose
 * measured ancestry contains the refusal. That review is judged against the
 * ANSWER'S authors, so the original author may clear Sol's fix without being
 * allowed to review their own original contribution.
 */
const filesClearedByRefusingVendor = (refusal, { commits = [], records = [], files = [] } = {}) => {
  const refusingVendor = modelVendor(refusal?.model)
  if (refusingVendor === 'unknown') return new Set()
  const required = new Set((files ?? []).map(String))
  const cleared = new Set()

  for (const answer of commits ?? []) {
    const answerSha = String(answer?.sha ?? '')
    const authors = commitAuthors(answer)
    const allAnswerFiles = [...new Set((answer?.files ?? []).map(String))]
    const answerFiles = allAnswerFiles.filter((file) => required.has(file))
    if (
      !answerSha ||
      answerSha === String(refusal?.sha ?? '') ||
      !answerFiles.length ||
      !authors.length ||
      authors.some((author) => modelVendor(author) !== refusingVendor) ||
      typeof answer?.at !== 'number' ||
      !Number.isFinite(answer.at) ||
      Number(answer.at) <= Number(refusal?.at)
    ) {
      continue
    }

    // Exact-sha is the ancestry proof for the ANSWERING COMMIT itself. A later
    // merge record containing two sibling commits would prove that the review
    // descends from the refusal, but not that the purported answer does.
    const exactCovering = (records ?? []).filter(
      (record) =>
        String(record?.sha ?? '') === answerSha &&
        Number(record?.at) > Number(refusal?.at) &&
        containedBy(record, refusal?.sha),
    )
    const ownReadings = exactCovering.filter(
      (record) =>
        reviewRecordWellFormed(record, { commitAt: answer.at }) &&
        attestsToCodeReading(record) &&
        !independentReviewProblem(record, answer),
    )
    if (!ownReadings.length) continue

    const refusalShaped = (record) =>
      typeof record?.verdict === 'string' && record.verdict.trim().toLowerCase() === BLOCKING_VERDICT
    if (exactCovering.some((record) => refusalShaped(record) && !reviewRecordWellFormed(record, { commitAt: answer.at }))) {
      continue
    }

    // A same-sha re-record never answers a refusal. Apply that boundary to the
    // answering commit too: any sound refusal on its exact state prevents that
    // state from participating in a clean chain.
    const refusedFiles = new Set()
    for (const reading of ownReadings.filter((record) => String(record.verdict) === BLOCKING_VERDICT)) {
      const scopedFiles = Array.isArray(reading?.pass?.files) ? reading.pass.files.map(String) : allAnswerFiles
      for (const file of allAnswerFiles) if (scopedFiles.includes(file)) refusedFiles.add(file)
    }

    const reviewed = new Set()
    const passClaims = ownReadings.filter((record) => record?.pass !== undefined && record?.pass !== null)
    const splitClaimed = exactCovering.some((record) => record?.pass !== undefined && record?.pass !== null)
    if (!splitClaimed) {
      if (ownReadings.some((record) => String(record.verdict) !== BLOCKING_VERDICT)) {
        for (const file of allAnswerFiles) if (!refusedFiles.has(file)) reviewed.add(file)
      }
    } else {
      // Scoped 1/1 rows clear exactly what they name. Larger splits count only
      // as a complete composition, with their worst verdict, just as in the
      // main evaluation path; a pass-less sibling cannot bypass a recorded
      // split, even when the claim itself is malformed or same-vendor.
      for (const reading of passClaims) {
        if (
          Number(reading?.pass?.index) === 1 &&
          Number(reading?.pass?.total) === 1 &&
          String(reading?.pass?.endState ?? '') === answerSha &&
          Array.isArray(reading?.pass?.files) &&
          String(reading.verdict) !== BLOCKING_VERDICT
        ) {
          for (const file of allAnswerFiles) {
            if (reading.pass.files.map(String).includes(file) && !refusedFiles.has(file)) reviewed.add(file)
          }
        }
      }
      for (const composition of passComposition(passClaims, { expect: allAnswerFiles })) {
        if (!composition.complete || worstVerdict(composition.records) === BLOCKING_VERDICT) continue
        for (const file of allAnswerFiles) if (!refusedFiles.has(file)) reviewed.add(file)
      }
    }
    if (allAnswerFiles.length && allAnswerFiles.every((file) => reviewed.has(file))) {
      for (const file of answerFiles) cleared.add(file)
    }
  }

  return cleared
}

const openRefusalsIn = (records = [], chain = {}) => {
  const clearing = records.filter((record) => String(record.verdict) !== BLOCKING_VERDICT)
  const requiredFiles = [...new Set((chain.files ?? []).map(String))]
  return records.filter((refusal) => {
    if (String(refusal.verdict) !== BLOCKING_VERDICT) return false
    // A bounded file review can refuse only the contribution state it names.
    // It still counts as a reading of an ancestor whose code survives in that
    // end state; its negative verdict simply is not re-attributed to work it
    // did not judge. Legacy/unbounded rows retain their full range reach.
    const scopeOf = typeof chain.scopeOf === 'function' ? chain.scopeOf : contributionReviewScope
    if (scopeOf(refusal, chain.commit) === 'co-touching') return false
    const directlyAnswered = clearing.some(
      (answer) =>
        Number(answer.at) > Number(refusal.at) &&
        (descendsFrom(answer, refusal) || narrowsSameStateRefusal(answer, refusal, requiredFiles)),
    )
    if (directlyAnswered) return false
    const chainClearance = filesClearedByRefusingVendor(refusal, chain)
    return !requiredFiles.length || requiredFiles.some((file) => !chainClearance.has(file))
  })
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
 *
 * TWO WORDINGS ARE ACCEPTED for one meaning. The count in the parenthesis has
 * always been INPUT ENTRIES folded, never union rows, but the line used to say
 * only "N merged" next to a union count it does not add up to. The printer names
 * the unit since 24.08.2026; the rows recorded before that say the same thing in
 * the ambiguous words and are read, not rewritten — a receipt is evidence of what
 * the accounting printed, and correcting its text after the fact would forge it.
 */
export const ACCOUNTING_RECEIPT =
  /^(\d+) A \+ (\d+) B entries → (\d+) union entries \((\d+)(?: of the (\d+) input entries)? merged, (\d+) only A, (\d+) only B\): every input entry accounted for$/

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
  // IN BIGINT, or the arithmetic is IEEE-754 rounding instead of counting:
  // individually safe operands still produce unsafe SUMS near 2^53, where two
  // unequal totals compare equal as doubles and a fabricated line balances
  // without adding up (re-review rounds 7 and 8). No real stage counts
  // anywhere near this; a forged one may claim whatever it likes.
  const [a, b, union, merged, statedInputs, onlyA, onlyB] = m
    .slice(1)
    .map((v) => (v === undefined ? undefined : BigInt(v)))
  if (merged + onlyA + onlyB !== a + b) return false
  // The named unit is checked, not just parsed: a line stating a total the two
  // list sizes do not make would otherwise pass on the strength of its shape.
  if (m[5] !== undefined && statedInputs !== a + b) return false
  if (merged === 1n) return false
  if (onlyA > a || onlyB > b) return false
  // THE UNION'S SIZE FOLLOWS FROM THE DISPOSITIONS (four-eyes review, fourth
  // round). Every entry standing alone is one union entry, and the merged ones
  // form between one fold (all of them together) and merged/2 folds (pairs) —
  // so a count claiming fewer union entries than singles is arithmetic nobody
  // could have produced.
  const singles = onlyA + onlyB
  if (!merged) return union === singles
  return union > singles && union <= singles + merged / 2n
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

/** New ledger rows after point 840's recorded commission owe an explicit
 * transcript verdict. The exact boundary preserves every earlier 22.08 row. */
export const AUTHORSHIP_CHECK_SINCE = 1_787_415_913_284

/** From here on, "unverified" is no longer a clearance for a reviewer the
 * harness could have verified. Cross-vendor review of point 889 (pass 3): an
 * unknown actual reviewer could claim an independent model, record the claim
 * with `status: 'unverified'`, and clear the commit — which is the
 * unknown-authorship case the gate exists to refuse. Where the claimed
 * reviewer is an Anthropic model, its session transcript exists in the harness
 * at recording time, so AGREEMENT is achievable and anything less is refused.
 * An OpenAI reviewer runs outside the harness — no Claude transcript can hold
 * its messages, so demanding one would end every cross-vendor review — and
 * stays recordable as unverified, but only with the reason stated; an unknown
 * vendor is refused outright. The boundary preserves the rows recorded under
 * the older reading (both vendors' 24.08 reviews among them). */
export const VERIFIED_REVIEWER_SINCE = 1_787_588_100_000

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
    const switchFallback = isSwitchFallbackReason(reason)
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
    if (switchFallback && !sameModel(who, 'GPT-5.6 Sol')) {
      errors.push(`the Fable-switch fallback is only the recorded reason GPT-5.6 Sol may merge its own blind half`)
    } else if (switchFallback && !conflict) {
      // The general no-fallback-needed error above remains the one explanation.
    } else if (switchFallback) {
      // A decision is not an outage. This exact, command-bearing form is the
      // separately checkable exception; every other reason still owes absence.
    } else if (!named.length) {
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
  return {
    ok: errors.length === 0,
    errors,
    fallback: Boolean(conflict && reason),
  }
}

/** Resolve the switch-owned merger and the fallback owed when it authored a half. */
export function resolveMergePolicy({ mode, mergedBy = '', mergeFallback = '', authors = [], fableState } = {}) {
  const m = String(mode ?? '').trim()
  if (m !== BLIND_PARALLEL || fableState === undefined) {
    return { mergedBy: String(mergedBy ?? '').trim(), mergeFallback: String(mergeFallback ?? '').trim(), errors: [] }
  }
  const expected = mergerModel(fableState, authors)
  const declared = String(mergedBy ?? '').trim()
  const errors = []
  if (declared && !sameModel(declared, expected)) {
    errors.push(
      `--merged-by "${declared}" is not the one this stage owes: ${expected} owns this merge ` +
        '(node scripts/fable-switch.mjs --status)',
    )
  }
  const conflict = (authors ?? []).filter(Boolean).some((author) => sameModel(expected, author))
  const derivedReason = conflict ? mergeFallbackReason(fableState) : ''
  const statedReason = String(mergeFallback ?? '').trim()
  if (statedReason && statedReason !== derivedReason) {
    errors.push('--merge-fallback contradicts the reason generated by the Fable switch')
  }
  return { mergedBy: expected, mergeFallback: statedReason || derivedReason, errors }
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
  halfAuthors,
  fableState,
} = {}) {
  const m = String(mode ?? '').trim()
  const wrote = (Array.isArray(authors) && authors.length ? authors : [authoredBy]).filter(Boolean)
  // THE HALVES THEMSELVES WHERE THEY WERE READ, the trailer proxy only failing that.
  // The proxy treats the union commit's models as the list authors, which is right
  // while the merger is a delegate somebody else commits for, and wrong the moment
  // the merging model commits its own union: it then names the merger as an author
  // of the material and refuses the one model the rule allows.
  const halves = (Array.isArray(halfAuthors) ? halfAuthors : []).map((a) => String(a ?? '').trim()).filter(Boolean)
  const listAuthors = halves.length === 2 ? halves : [model, ...wrote]
  const policy = resolveMergePolicy({
    mode: m,
    mergedBy,
    mergeFallback,
    authors: listAuthors,
    fableState,
  })
  const who = policy.mergedBy
  const reason = policy.mergeFallback
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
  const errors = [...policy.errors, ...validateMerger({ mergedBy: who, authors: listAuthors, fallback: reason }).errors]
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
  '--model-at': true,
  '--model-transcript': true,
  '--model-result': true,
  '--handover': true,
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
  '--model-at': 'modelAt',
  '--model-transcript': 'modelTranscript',
  '--model-result': 'modelResult',
  '--handover': 'handover',
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
 * A pass record is either a bounded one-round scope or the answer to a range no
 * single review round can hold (points 783 and 714): the material is cut through
 * the FILE SET, each pass is reviewed on its own, and the range is cleared only
 * once every contribution (and, for a split, every pass) is on record. So a pass
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
export function validatePass({ pass, passFiles } = {}) {
  const spec = String(pass ?? '').trim()
  // The list is parsed RAW (fourth cross-vendor round): trimming it here strips
  // the FIRST token's leading and the LAST token's trailing whitespace before
  // the parser can refuse them, so ` scripts/a.mjs` silently became a coverage
  // claim about `scripts/a.mjs` — a different path. Only PRESENCE is judged on
  // the trimmed view; the bytes go to the parser untouched, which fails loud.
  const listed = String(passFiles ?? '')
  const hasList = listed.trim() !== ''
  if (!spec && !hasList) return { ok: true, errors: [], pass: null }
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
  if (errors.length) return { ok: false, errors, pass: null }
  return {
    ok: true,
    errors: [],
    pass: { index: parsed.index, total: parsed.total, files: list.files },
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
  commitAt,
  at,
  mode,
  framing,
  authorFraming,
  specExamination,
  mergedBy,
  mergeFallback,
  accounting,
  authors,
  halfAuthors,
  pass,
  passFiles,
  fableState,
  handover,
  handoverChain,
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
  if (authorFrame && /[\r\n]/.test(authorFrame)) {
    errors.push('--author-framing must be one line so it cannot forge the round-history report')
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
  errors.push(...validatePass({ pass, passFiles }).errors)
  errors.push(
    ...validateMergedBy({ mode, mergedBy, mergeFallback, accounting, model, authoredBy, authors, halfAuthors, fableState })
      .errors,
  )
  if (!/^[0-9a-f]{7,40}$/i.test(String(sha ?? '').trim())) {
    errors.push('--record <sha>: the commit that was judged, as a resolvable sha')
  }
  if (!String(model ?? '').trim()) {
    // The example NAMES the reviewer the rule prefers (point 624): reviews go to
    // GPT-5.6 Sol first and to Fable 5 when Sol is unavailable, and nothing here
    // restricts the value — a reviewer this recorder refused could not be used.
    errors.push(`--model <name>: which model performed the review (e.g. "GPT-5.6 Sol", "${FABLE_MODEL}")`)
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
  if (String(model ?? '').trim()) {
    const identity = reviewIdentityProblem(model, {
      authors: Array.isArray(authors) ? authors : [authoredBy].filter(Boolean),
    })
    if (identity === 'unknown-author') {
      errors.push(
        `an INDEPENDENT REVIEW cannot be proved for ${short(sha)}: its commit names no recognised model ` +
          'author in its Co-Authored-By trailers. Unknown authorship is unreviewable, not authorless.',
      )
    } else if (identity === 'unknown-reviewer') {
      errors.push(`the claimed reviewer "${String(model).trim()}" has no recognised vendor, so independence cannot be proved`)
    } else if (identity === 'same-vendor') {
      const namedAuthors = (Array.isArray(authors) ? authors : [authoredBy]).filter(Boolean)
      // A scoped pass is routed from the accumulated authorship of its FILES,
      // while the recorder can resolve only the pass's end-state commit. It
      // therefore validates the durable fact available here (a known
      // handover), then the gate recomputes independence and first eligibility
      // PER FILE before this row clears anything. The reviewer may also have
      // authored an unrelated tip commit; treating that commit as the pass's
      // author is the router/ledger deadlock this file-scoped boundary exists
      // to avoid.
      // WHAT "PER FILE" MEANS EXACTLY, because the deadlock lives in the gap:
      // `pendingEndStateFiles` gives each file the authorship of the LATEST
      // pending commit that touched it, not the union over its whole pending
      // history. That is deliberate — the union would make both vendors authors
      // of every hot file and rebuild the deadlock one level down — but it also
      // means an EARLIER author of the same file inside the same range is not
      // seen by the independence check. The file's own `sourceCommits` carries
      // that history for anything that needs it.
      const deferredPassHandover = String(pass ?? '').trim() && REVIEW_HANDOVERS.includes(String(handover ?? '').trim())
      const handoverProblem = deferredPassHandover
        ? ''
        : reviewHandoverProblem({
            reviewer: model,
            authors: namedAuthors,
            handover,
            chain: handoverChain ?? handoverChainFor(handover, fableState),
          })
      if (handoverProblem) {
        errors.push(
          `a SAME-VENDOR REVIEW is refused: ${short(sha)} was authored by ` +
            `"${namedAuthors.join(', ')}" and "${String(model).trim()}" is from that vendor; ` +
            `the review has no valid first-eligible handover (${handoverProblem}).`,
        )
      }
    }
  }
  if (Number(commitAt) > 0 && ledgerAtUsable(Number(commitAt)) && ledgerAtUsable(at) && Number(at) < Number(commitAt)) {
    errors.push('a review record may not predate the commit it claims to clear')
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
  // TRIMMED, like the well-formedness check reads it: " blind-parallel " passed
  // there and fell out HERE, so a hand-edited row bypassed every fold check by
  // one space (re-review round 6).
  if (String(record.mode ?? '').trim() !== BLIND_PARALLEL) return ''
  // A row is grandfathered only by a REAL timestamp older than the rule. A row
  // with NO `at` is not old, it is unstamped — reading a missing field as legacy
  // was itself a bypass (four-eyes review, third round): omit `at`, `mergedBy`
  // and `accounting` together and nothing was ever checked.
  const at = Number(record.at)
  // The grandfather clause reads the later of row and commit time, like every
  // era cutoff (re-review round 4): a modern hand-edited row backdated before
  // the accounting rule otherwise skips fold validation entirely.
  const foldEra = Math.max(Number.isFinite(at) && at > 0 ? at : 0, Number(commit?.at) || 0)
  if (Number.isFinite(at) && at > 0 && foldEra < MERGE_ACCOUNTING_SINCE) return ''
  const who = String(record.mergedBy ?? '').trim()
  if (!who) return 'no-merger'
  if (!receiptBalances(record.accounting)) return 'no-count'
  // The FALLBACK is judged, not merely present: any word in that field used to
  // buy an author the merge, while the recorder demanded it name the model that
  // was missing. One function answers for both halves.
  // THE HALVES THE RECORD ITSELF NAMES, where it names them from tracked files,
  // and only failing that the commit-trailer proxy. Re-judging a recorded merge
  // by the proxy alone condemns every merge whose merging model committed its own
  // union — which is precisely the case the recorder was taught to accept, so the
  // gate has to read the same fact or the two disagree by construction.
  //
  // BUT THE FIELD IS A CLAIM, NOT EVIDENCE: ledger rows are hand-editable, and
  // two fabricated names excluding the merger would bypass the self-merge
  // fence entirely. The halves therefore decide ONLY when the ledger reader
  // stamped them VERIFIED against the repository's committed bytes
  // (readRecords → verifyHalfAuthors); a claim the repository cannot confirm
  // POISONS the record instead of being trusted or silently ignored — silently
  // falling back to the proxy would let a forger probe until a wording passes.
  const halves = (Array.isArray(record.halfAuthors) ? record.halfAuthors : [])
    .map((a) => String(a ?? '').trim())
    .filter(Boolean)
  if (halves.length && record.halfAuthorsVerified !== true) return 'unverified-halves'
  // A MODERN ROW DOES NOT GET THE PROXY BACK BY DROPPING ITS CLAIM (re-review
  // round 3): with `halfAuthors` deleted from a hand-edited row, the judgment
  // fell through to the commit trailers, which say nothing when the union
  // commit does not name the merger. Since the recorder began refusing folds
  // with unproven halves, every legitimate new blind-parallel row carries its
  // verified halves — one that does not is hand-made and clears nothing. The
  // era reads the later of row and commit time, as everywhere else.
  if (!halves.length && foldEra >= VERIFIED_REVIEWER_SINCE) return 'unverified-halves'
  const authors = (commit.authorModels ?? [commit.authorModel]).filter(Boolean)
  const check = validateMerger({
    mergedBy: who,
    authors: halves.length === 2 ? halves : [...authors, record.model].filter(Boolean),
    fallback: record.mergeFallback,
  })
  return check.ok ? '' : 'self-merge'
}

/** Ledger-era validity shared by the gate and the per-file debt planner. */
export function reviewRecordWellFormed(record = {}, { commitAt = 0 } = {}) {
  if (!VERDICTS.includes(String(record.verdict))) return false
  if (typeof record.model !== 'string' || !record.model.trim()) return false
  if (!ledgerAtUsable(record.at)) return false
  if (typeof record.evidence !== 'string') return false
  const evidence = record.evidence.trim()
  if (evidence.length < 10 || /^<.*>$/.test(evidence) || blindReviewerAdmission(evidence)) return false
  const mode = String(record.mode ?? '').trim()
  const at = Number(record.at)
  if (!MODES.includes(mode)) return false
  // A review cannot happen before the commit it claims to have read.  This is a
  // direct ordering invariant, not an era selector controlled by either clock.
  if (Number(commitAt) > 0 && at < Number(commitAt)) return false
  // Identity evidence became part of the recorder's row shape at a known
  // ledger boundary. Rows written before that boundary cannot acquire evidence
  // the recorder did not yet emit, and remain usable for commits they could
  // actually have reviewed (the ordering invariant above still prevents an old
  // row from clearing newer code). Missing identity on a modern row remains a
  // malformed hand-written claim.
  const authorship = record.reviewerAuthorship
  if (!authorship || typeof authorship !== 'object') {
    return at < AUTHORSHIP_CHECK_SINCE && (record.carried === undefined || record.carriedVerified === true)
  }
  if (authorship.status !== 'agreement' && authorship.status !== 'unverified') return false
  if (!sameModel(authorship.claimedModel, record.model)) return false
  if (authorship.status === 'agreement' && !sameModel(authorship.actualModel, record.model)) return false
  const vendor = modelVendor(record.model)
  if (vendor === 'unknown') return false
  // Anthropic agreement became provable only at the later transcript boundary.
  // Preserve earlier reasoned unverified rows; after it, anything short of the
  // recorder's agreement stamp is malformed.
  if (vendor === 'anthropic' && authorship.status !== 'agreement' && at >= VERIFIED_REVIEWER_SINCE) return false
  if (vendor === 'openai') {
    if (authorship.status !== 'unverified') return false
    if (typeof authorship.reason !== 'string' || !authorship.reason.trim()) return false
  }
  return record.carried === undefined || record.carriedVerified === true
}

/**
 * Stable identity of one recorded file pass for a trusted planner comparison.
 * Every field that can change what the pass means participates: mutating the
 * reviewer, numbering, end state or even one path makes a different key.
 */
export function plannerPassKey(record = {}) {
  const pass = record?.pass ?? {}
  return JSON.stringify([
    String(record?.sha ?? ''),
    String(record?.model ?? ''),
    Number(pass.index),
    Number(pass.total),
    String(pass.endState ?? ''),
    Array.isArray(pass.files) ? pass.files.map(String) : null,
  ])
}

/**
 * Which ledger rows reproduce the runnable planner exactly.
 *
 * The plans are trusted measurements supplied by the wrapper, keyed by their
 * reviewed sha. The ledger supplies no authority: a claimed pass counts only
 * when its current planner has the same index, total, byte-exact file order and
 * assigned reviewer. Returning keys rather than stamping rows keeps a forged
 * `plannerVerified` field inert and makes every relevant mutation fail closed.
 */
export function verifiedPlannerPasses(records = [], plansBySha = new Map()) {
  const plans = plansBySha instanceof Map ? plansBySha : new Map()
  const verified = new Set()
  for (const record of records ?? []) {
    const pass = record?.pass
    if (
      !pass ||
      Number(pass.total) < 2 ||
      String(pass.endState ?? '') !== String(record?.sha ?? '') ||
      !Array.isArray(pass.files)
    ) continue
    const plan = plans.get(String(record.sha ?? ''))
    const planned = (plan?.passes ?? []).find((candidate) => Number(candidate?.index) === Number(pass.index))
    if (
      !planned ||
      Number(planned.total) !== Number(pass.total) ||
      !sameModel(planned.reviewer, record.model) ||
      planned.files?.length !== pass.files.length ||
      !planned.files.every((file, index) => String(file) === String(pass.files[index]))
    ) continue
    verified.add(plannerPassKey(record))
  }
  return verified
}

/**
 * ONE FIXED MIGRATION, NOT A GENERAL WAIVER. Historical debt produced only by
 * the retired baseline-wide scope is settled per contribution in the tracked
 * ledger. The row's own claim buys nothing: the impure wrapper sets the
 * verification stamp only after checking its exact schema and Git ancestry
 * against CONTRIBUTION_SCOPE_BOUNDARY. Later contributions can never match.
 *
 * EXPORTED because a retired contribution must be invisible to EVERY demand the
 * gate prints, not only to the finding loop: the guard reads it too, so its
 * authorship plan cannot report settled history as unreviewable debt.
 */
export function contributionRetiredBy(coveringRecords = [], commit = {}) {
  return (coveringRecords ?? []).some(
    (record) =>
      record?.kind === CONTRIBUTION_DISPOSITION_KIND &&
      record?.disposition === 'retired' &&
      record?.contributionDispositionVerified === true &&
      String(record?.sha) === String(commit?.sha),
  )
}

/** Current file artefacts synthesized from the pending history. */
function pendingEndStateFiles(pendingCommits, endStateFiles) {
  if (endStateFiles === null || endStateFiles === undefined) return pendingCommits ?? []
  const material = new Set((endStateFiles ?? []).map(String))
  const byFile = new Map()
  for (const commit of pendingCommits ?? []) {
    for (const file of [...new Set((commit?.files ?? []).map(String))]) {
      if (!byFile.has(file)) byFile.set(file, [])
      byFile.get(file).push(commit)
    }
  }
  const artefacts = []
  for (const [file, changes] of byFile) {
    if (!material.has(file)) continue
    const latest = changes.at(-1)
    const authors = Array.isArray(latest?.authorModels) && latest.authorModels.length
      ? uniqStrings(latest.authorModels)
      : [latest?.authorModel].filter(Boolean)
    artefacts.push({
      ...latest,
      files: [file],
      authorModel: authors[0] ?? '',
      authorModels: authors,
      sourceCommits: changes.map((commit) => commit.sha),
    })
  }
  return artefacts
}

export const modelVendor = (model) => {
  const value = String(model ?? '').toLowerCase()
  const openai = /\bsol\b|\bgpt[- ]?5(?:\.|\b)/.test(value) || /openai\.com/.test(value)
  const anthropic = /\b(?:claude|opus|fable|sonnet|haiku)\b/.test(value) || /anthropic\.com/.test(value)
  // CONTRADICTORY MARKERS ARE NOBODY, not first-match-wins (re-review round 5):
  // "Claude Opus 5 GPT-5" reached the OpenAI branch and cleared as
  // unverified-with-reason, bypassing both the unknown-vendor refusal and the
  // Anthropic agreement requirement.
  if (openai && anthropic) return 'unknown'
  if (openai) return 'openai'
  if (anthropic) return 'anthropic'
  return 'unknown'
}

/**
 * The gate itself.
 *
 * Inputs (plain data — the wrapper does the git work):
 *   baseline        sha the tree has already confirmed, or null. A missing
 *                   baseline is a refusal: the wrapper may recover only from
 *                   the immutable policy anchor, never from current HEAD.
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
  baselineMissing = false,
  head = '',
  pendingCommits = [],
  records = [],
  endStateFiles = null,
  fence = null,
  sessionId = '',
  reviewScope = contributionReviewScope,
  plannerVerifiedPasses = new Set(),
} = {}) {
  // Missing local evidence is itself a finding. It may never mean "start at
  // HEAD": on main that makes the pending range empty and forgives every debt
  // in one turn. The wrapper may seed a durable recovery anchor after reporting
  // this refusal, but this evaluation never clears on absence.
  if (!baseline || baselineMissing) {
    return {
      block: true,
      clear: false,
      bootstrap: false,
      findings: [{ kind: 'missing-baseline', commit: null, records: [] }],
      head,
    }
  }

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
  const reviewScopesByRecord = new Map()
  // Dependency injection exists for the historical replay: the unit case runs
  // the old range-wide rule and this rule over the SAME immutable Git/ledger
  // facts. The live wrapper supplies no override and always takes the bounded
  // production rule. A non-function cannot weaken it.
  const scopeOf = typeof reviewScope === 'function' ? reviewScope : contributionReviewScope

  const noteReviewScope = (record, commit) => {
    const relation = scopeOf(record, commit)
    if (relation !== 'read' && relation !== 'co-touching') return
    const recordSha = String(record?.sha ?? '')
    if (!reviewScopesByRecord.has(recordSha)) {
      reviewScopesByRecord.set(recordSha, {
        recordSha,
        readContributionSha: '',
        coTouchingContributionShas: [],
        files: [],
      })
    }
    const scope = reviewScopesByRecord.get(recordSha)
    if (relation === 'read') scope.readContributionSha = String(commit?.sha ?? '')
    if (relation === 'co-touching' && !scope.coTouchingContributionShas.includes(String(commit?.sha ?? ''))) {
      scope.coTouchingContributionShas.push(String(commit?.sha ?? ''))
    }
    for (const file of record.pass.files.map(String)) if (!scope.files.includes(file)) scope.files.push(file)
  }

  for (const pendingCommit of pendingEndStateFiles(pendingCommits, endStateFiles)) {
    let commit = pendingCommit
    const covering = [...new Set(commit?.coveringRecordShas ?? [])].flatMap((s) => bySha.get(String(s)) ?? [])
    if (contributionRetiredBy(covering, commit)) continue
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
    const rowWellFormed = (r) => reviewRecordWellFormed(r, { commitAt: commit.at })
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
    for (const refusal of covering.filter(refusalShaped)) noteReviewScope(refusal, commit)
    const malformedRefusals = covering.filter(
      (r) =>
        refusalShaped(r) &&
        scopeOf(r, commit) !== 'co-touching' &&
        !rowWellFormed(r),
    )
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
    const fileClaim = (r) => r?.pass?.endState !== undefined
    const fileScopedShape = (r) =>
      fileClaim(r) &&
      String(r.pass.endState) === String(r.sha) &&
      Array.isArray(r?.pass?.files) &&
      !Array.isArray(r?.pass?.commits)
    // A range planner assigns reviewers by the authorship of EACH FILE GROUP.
    // Its mixed-vendor split may therefore contain a reviewer from the same
    // vendor as an unrelated contribution in that range. The wrapper re-runs
    // that exact planner and supplies mutation-bound keys; only such a match
    // may override the contribution-wide identity check. Whole-range reviews,
    // bounded 1/1 scopes and unverified/mutated split rows retain the old rule.
    const plannerAssigned = (r) =>
      fileScopedShape(r) &&
      Number(r?.pass?.total) >= 2 &&
      plannerVerifiedPasses instanceof Set &&
      plannerVerifiedPasses.has(plannerPassKey(r))
    const independenceProblem = (r) => plannerAssigned(r) ? '' : independentReviewProblem(r, commit)
    const selfReviews = wellFormed.filter(
      (r) => attestsToCodeReading(r) && independenceProblem(r),
    )
    // COVERAGE MEANS ONE THING ON EVERY PATH: a well-formed, convergent reading
    // of this code by a vendor that authored none of it. A spec examination
    // reads the commission; a blind-parallel row attests to independently
    // producing and folding lists. Neither attests to reading this commit, so
    // neither joins `sound` or answers a refusal.
    const sound = wellFormed.filter(
      (r) => attestsToCodeReading(r) && !independenceProblem(r),
    )

    // END-STATE FILE PASSES CLEAR WHAT THEY READ. The record's own sha is the
    // stored end state, and the wrapper selected this artefact at its latest
    // change, so a record covering it remains valid across later commits to
    // other files. Historical pass.commits rows describe superseded
    // contribution slices and deliberately clear nothing here.
    const scoped = sound.filter(fileScopedShape)

    // New recorder rows are file-scoped, but they are still parts of ONE split.
    // No part clears until every numbered part of that split is present. Without
    // this check pass 1/3 cleared its named file and the legacy composition code
    // never saw it because `endState` excluded it from that path.
    // PLAN IDENTITY IS (SHA, TOTAL), not SHA alone. A contribution can be
    // replanned at the same immutable boundary after the historical range cut
    // becomes stale. Mixing the old 6-part file union into a new 2-part plan
    // makes both compositions report each other's files as uncovered, so no
    // complete replan can ever settle the stale split.
    const scopedSplitKeys = [...new Set(
      covering
        .filter(fileClaim)
        .map((r) => `${String(r?.sha ?? '')}\0${Number(r?.pass?.total)}`),
    )]
    const scopedSplits = scopedSplitKeys.flatMap((key) => {
      const [sha, totalText] = key.split('\0')
      const total = Number(totalText)
      const rows = scoped.filter(
        (r) => String(r?.sha ?? '') === sha && Number(r?.pass?.total) === total,
      )
      const expected = [...new Set(rows.flatMap((r) => (Array.isArray(r?.pass?.files) ? r.pass.files : [])))]
      return passComposition(rows, { expect: expected })
    })
    const incompleteScoped = scopedSplits.filter((split) => !split.complete)
    const scopedPlanKey = (sha, total) => `${String(sha ?? '')}\0${Number(total)}`
    const incompleteScopedPlans = new Set(
      incompleteScoped.map((split) => scopedPlanKey(split.sha, split.total)),
    )
    // FILE DEBT IS MEASURED AGAINST THE CURRENT END STATE, not against the
    // numbering of every range plan that once contained that file. A complete
    // scoped reading at another covering sha therefore settles the files it
    // names even when an older range split remains incomplete for other files.
    // This is the same rule outstandingFiles uses for the status/next-pass
    // plan. An incomplete PLAN contributes nothing; another measured plan at
    // the same immutable sha stays independent and may be the complete replan
    // that settles it. A bounded 1/1 is itself a complete file-scoped reading.
    const completeScoped = [
      ...scoped
        .filter((r) =>
          Number(r?.pass?.index) === 1 &&
          Number(r?.pass?.total) === 1 &&
          !incompleteScopedPlans.has(scopedPlanKey(r?.sha, r?.pass?.total)))
        .map((r) => ({ sha: String(r.sha ?? ''), files: r.pass.files.map(String), records: [r] })),
      ...scopedSplits.filter(
        (split) => split.complete && !incompleteScopedPlans.has(scopedPlanKey(split.sha, split.total)),
      ),
    ]
    const scopedWholeReviews = sound.filter((r) => !fileClaim(r) && !r?.pass)
    const standingScoped = incompleteScoped.filter(
      (split) => {
        // A descendant's bounded split measured that descendant contribution,
        // not every ancestor which happens to share one of its files. A broken
        // bound remains range-scoped and therefore cannot take this exit.
        if (split.records.every((record) => scopeOf(record, commit) === 'co-touching')) {
          return false
        }
        const wholeRangeAnswer = scopedWholeReviews.some(
          (answer) => Number(answer.at) > Math.max(...split.records.map((r) => Number(r.at))) && descendsFrom(answer, split),
        )
        const endStateAnswer = completeScoped.some(
          (answer) =>
            (commit.files ?? []).every((file) => answer.files.map(String).includes(String(file))),
        )
        return !wholeRangeAnswer && !endStateAnswer
      },
    )
    if (standingScoped.length) {
      const worst = standingScoped.reduce((a, b) =>
        ((b.missing?.length ?? 0) + (b.uncovered?.length ?? 0) >=
        (a.missing?.length ?? 0) + (a.uncovered?.length ?? 0) ? b : a))
      findings.push({ kind: 'incomplete-passes', commit, records: worst.records, passes: worst, besideSplit: scopedWholeReviews })
      continue
    }
    const remainingFiles = []
    let scopedRefusal = null
    for (const file of commit.files ?? []) {
      const rows = scoped.filter((r) => r.pass.files.map(String).includes(String(file)))
      if (!rows.length) {
        remainingFiles.push(file)
        continue
      }
      const open = openRefusalsIn(rows, {
        commits: pendingCommits,
        records: covering,
        files: [file],
        commit,
        scopeOf,
      })
      if (open.length) {
        const latest = open.reduce((a, b) => (Number(b.at) >= Number(a.at) ? b : a))
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
    const legacyContributionShape = (r) => Array.isArray(r?.pass?.commits)
    const legacySound = sound.filter((r) => !fileClaim(r) && !legacyContributionShape(r))

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
    // a same-vendor review or a broken merge still WITNESSES that the offering tool
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
    // File-scoped rows are split evidence too, but only for REMAINING FILE DEBT
    // they name. Excluding them altogether let a pass-less whole-range row
    // stand beside a recorded 1/3 on the same files and bypass completeness;
    // treating them as range-global later let an unrelated descendant scope
    // revoke an earlier cross-vendor review. A legacy non-file-scoped pass row,
    // or a malformed file claim without a readable file list, still witnesses
    // its whole covering range because it names no narrower boundary by which
    // this gate could soundly cut that reach back.
    const remainingFileDebt = new Set((commit.files ?? []).map(String))
    const split = covering.some((r) =>
      !legacyContributionShape(r) &&
      passRow(r) &&
      scopeOf(r, commit) !== 'co-touching' &&
      (!fileClaim(r) ||
        !Array.isArray(r?.pass?.files) ||
        r.pass.files.some((file) => remainingFileDebt.has(String(file)))),
    )
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
    const open = openRefusalsIn(valid, {
      commits: pendingCommits,
      records: covering,
      files: commit.files,
      commit,
      scopeOf,
    })
    if (open.length) {
      const latest = open.reduce((a, b) => (Number(b.at ?? 0) >= Number(a.at ?? 0) ? b : a))
      findings.push({ kind: 'do-not-merge', commit, records: [latest] })
    }
  }

  const duty = scopeMandatoryDuty({
    owed: findings.length > 0,
    fence,
    guardId: 'mechanism-review-guard',
    sessionId,
    duty: 'the pending cross-vendor mechanism review',
  })
  if (duty.deferred) {
    // `findings` and the unchanged baseline are the successor's durable debt.
    return {
      block: false,
      clear: false,
      bootstrap: false,
      deferred: true,
      reason: duty.message,
      findings,
      reviewScopes: [...reviewScopesByRecord.values()],
      head,
    }
  }
  return {
    block: findings.length > 0,
    clear: findings.length === 0,
    bootstrap: false,
    findings,
    reviewScopes: [...reviewScopesByRecord.values()],
    head,
  }
}

/** Render the verdict as the guard's refusal — every offender, and the way out. */
export function formatMechanismReviewVerdict(
  verdict,
  { authorshipPlan = null, contributionPlan = null, contributionPlanText = '' } = {},
) {
  if (!verdict?.block) return ''
  if ((verdict.findings ?? []).some((finding) => finding.kind === 'missing-baseline')) {
    return [
      'FOUR-EYES GATE ON MECHANISMS: the local review baseline is missing.',
      '',
      'Absence cannot bootstrap at HEAD: on main that would make the pending range empty and',
      'silently grandfather every outstanding mechanism review. This stop is refused. The guard',
      'will seed its tracked-history recovery anchor when available. If this branch cannot reach',
      'that anchor, merge origin/main into this branch. Then end the turn again so the guard can',
      'seed the anchor and judge the complete range from it.',
    ].join('\n')
  }
  // THE PLAN NAMES WHAT IS OWED, NOT WHAT THE RANGE CONTAINS. The authorship
  // plan is built over the whole pending range, so it also carries every
  // contribution a recorded review already cleared. Measured on the merge
  // candidate 27.08.2026: four owed contributions arrived under two hundred
  // group lines of settled history. The groups are therefore narrowed to the
  // contributions THIS verdict reports. A group naming no commit cannot be
  // judged and is kept, and so is every group when any finding names no commit
  // — this trims noise, it never drops a demand.
  const owedShas = new Set(
    (verdict.findings ?? []).map((finding) => String(finding?.commit?.sha ?? '')).filter(Boolean),
  )
  const narrowable =
    (verdict.findings ?? []).length > 0 && (verdict.findings ?? []).every((finding) => finding?.commit?.sha)
  const owedGroup = (group) =>
    !narrowable ||
    !Array.isArray(group?.commits) ||
    !group.commits.length ||
    group.commits.some((sha) => owedShas.has(String(sha)))
  const groups = (Array.isArray(authorshipPlan?.groups) ? authorshipPlan.groups : []).filter(owedGroup)
  const unreviewable = (Array.isArray(authorshipPlan?.unreviewable) ? authorshipPlan.unreviewable : []).filter(
    owedGroup,
  )
  const lines = [
    unreviewable.length
      ? 'FOUR-EYES GATE ON MECHANISMS — UNREVIEWABLE: an owed contribution has no eligible reviewer vendor.'
      : 'FOUR-EYES GATE ON MECHANISMS: a guard, gate or git hook changed here and no ' +
        'second model has recorded a review of it.',
    '',
  ]
  for (const f of verdict.findings) {
    const c = f.commit ?? {}
    const files = (c.files ?? []).join(', ')
    const author = String(c.authorModel ?? '').trim() || 'unknown model'
    if (f.kind === 'do-not-merge') {
      const r = f.records[0] ?? {}
      const scope = (verdict.reviewScopes ?? []).find(
        (candidate) => String(candidate?.recordSha ?? '') === String(r.sha ?? ''),
      )
      const coTouching = (scope?.coTouchingContributionShas ?? []).map(short)
      lines.push(
        `  ✗ ${short(c.sha)} ${c.subject ?? ''}`,
        `      ${files}`,
        `      ${String(r.model).trim()} reviewed this and said DO-NOT-MERGE: ${r.evidence ?? ''}`,
        ...(scope?.readContributionSha
          ? [
              `      verdict scope: READ ${short(scope.readContributionSha)}; ` +
                (coTouching.length
                  ? `CO-TOUCHED ${coTouching.join(', ')} — ${coTouching.length === 1 ? 'that contribution is' : 'those contributions are'} not charged by this refusal.`
                  : 'no other contribution is charged by this refusal.'),
            ]
          : []),
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
      const planned = (contributionPlan?.contributions ?? []).find(
        (entry) => String(entry?.sha ?? '') === String(c.sha ?? ''),
      )
      lines.push(`  ✗ ${short(c.sha)} ${c.subject ?? ''}`, `      ${files}`)
      if ((p.missing ?? []).length) {
        lines.push(
          `      the review was split into ${p.total} passes over the FILE SET and only ${p.have} are on ` +
            `record — missing pass ${(p.missing ?? []).join(', ')}`,
          ...(planned
            ? [
                `      that historical split does not choose the repair command: the contribution planner ` +
                  `measures ${planned.passes?.length ?? 0} runnable ` +
                  `${planned.passes?.length === 1 ? 'pass' : 'passes'} at its immutable parent boundary.`,
                '      The planner wins; run the contribution-scoped command printed below.',
              ]
            : [
                '      No runnable command is printed from the stale split. Ask the guard status to rerun',
                '      the contribution planner at the immutable commit boundary; only that measured plan',
                '      may name a repair pass.',
              ]),
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
      if (problem === 'unverified-halves') {
        return (
          '      the record names half authors the repository does not confirm — ' +
          'a claim the committed halves cannot back clears nothing'
        )
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
          : `      the only review on record is from ${author}'s vendor — a same-vendor review is not independent`,
    )
  }
  if (unreviewable.length) {
    lines.push('', 'UNREVIEWABLE contribution files (none may be treated as an ordinary missing review):')
    for (const group of unreviewable) {
      lines.push(
        `  · ${(group.files ?? []).join(', ') || '<files unknown>'}: ` +
          `${group.unreviewableReason || 'no configured reviewer vendor is eligible'}`,
      )
    }
    lines.push(
      '',
      'No record by the configured reviewer chain can clear those files. Inspect the',
      'authorship split with: node scripts/mechanism-review-guard.mjs --status',
    )
  } else if (groups.length > 1) {
    lines.push('', 'The owed contributions MIX AUTHORSHIP. Review the contribution groups independently:')
    for (const group of groups) {
      lines.push(
        `  · ${group.vendor || 'unknown'}-authored contribution files ` +
          `→ ${group.reviewerVendor || 'unknown'} reviewer ${group.reviewer || '<none>'}: ` +
          `${(group.files ?? []).join(', ') || '<files unknown>'}`,
      )
    }
    lines.push(
      '',
      'Ask the guard status for the runnable contribution commands; each recorded pass clears',
      'only its listed files at that commit boundary:',
      '',
      'Inspect the remaining file debt with: node scripts/mechanism-review-guard.mjs --status',
    )
  } else {
    lines.push(
      '',
      'A mechanism that is wrong is worse than none: the rule then COUNTS as enforced and',
      'nobody looks again. Have the OTHER vendor review the change — plan and result — and',
      'record what it said:',
      '',
      '  node scripts/mechanism-review.mjs --record <sha> --model <name> \\',
      `      --verdict <${VERDICTS.join('|')}> --evidence "<one line>" --mode review`,
      '',
      'Each command printed by the guard status is bounded to one contribution and its parent.',
      'Inspect the finite runnable plan with: node scripts/mechanism-review-guard.mjs --status',
    )
  }
  if (String(contributionPlanText ?? '').trim()) {
    lines.push('', 'RUNNABLE CONTRIBUTION PLAN (the same planner review-sol executes):', contributionPlanText.trim())
  }
  return lines.join('\n')
}
