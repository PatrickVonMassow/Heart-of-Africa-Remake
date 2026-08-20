// The record half of the four-eyes gate on mechanisms (point 377).
//
//   node scripts/mechanism-review.mjs --record <sha> --model <name> \
//       --verdict <merge|merge-with-fixes|do-not-merge> --evidence "<one line>" \
//       --mode <review|blind-parallel> [--framing "<one line>"] [--point <N>] \
//       [--author-framing "<one line>" | --spec-examination <sound|amended>]
//   node scripts/mechanism-review.mjs --list
//
// `--mode` names which half of the four-eyes principle the verdict covers
// (CLAUDE.md §6, point 541). Only the CONVERGENT half had an enforcer; nothing
// recorded whether a DIVERGENT step ran blind parallel or as a review of an
// already-finished list — the anchoring failure the rule exists to prevent — and
// no guard can detect that, because it stands in no file. So the recorder asks,
// and refuses to default the answer.
//
// `--point <N>` names the work-order point the review settles. It is what the
// CRITICALITY gate (point 298, criticality-review-guard.mjs) looks for: that gate
// judges a change by its DECLARED criticality rather than by its file path, so a
// high-criticality point with no mechanism file in its diff is covered too. One
// ledger and one command serve both gates — a guard change that closes a high
// point is recorded ONCE, with the point named.
//
// The record is the hard part of this rule, so it is kept cheap and honest: one
// appended line naming which model reviewed, how it ended, one line of evidence,
// and the commit it judged — plus the model that AUTHORED that commit, read from
// its own Co-Authored-By trailer rather than typed in. A self-review is REFUSED
// here (and again at the gate), because a self-review in the ledger is worse than
// an empty one: the gate then reads green.
//
// The ledger is TRACKED in git on purpose. A review happens on a feature branch
// and the gate bites in the session that MERGES it; an untracked file would never
// make that journey, and the branch would block on a review that had been done.
// One JSON object per line so two branches appending never conflict beyond the
// last line.
//
// The decision logic is pure (mechanism-review-core.mjs); this file does I/O and
// fails LOUD — it is a command, not a hook.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { REPO_ROOT } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { accountUnion, formatAccounting, parseListText, summaryLine, validateInputs } from './blind-merge-core.mjs'
import {
  formatArgErrors,
  KNOWN_FLAGS,
  ledgerPathFrom,
  modelFromTrailers,
  modelsFromTrailers,
  MODES,
  parseArgs,
  validatePass,
  validateRecord,
  VERDICTS,
} from './mechanism-review-core.mjs'
import { quotePassFile } from './review-material-core.mjs'

// Re-exported so the flag surface has ONE definition (the pure parser's) and one
// import path for its callers.
export { KNOWN_FLAGS }

/** An injective identity for an unordered set of Git paths. */
export const reviewFileSetKey = (files = []) => JSON.stringify([...(files ?? [])].map(String).sort())

/** The git toplevel of a working directory, or '' outside a checkout. Its own
 *  spawn rather than `git()` above: that one is pinned to REPO_ROOT, which is
 *  the very assumption this lookup exists to replace, and a missing checkout is
 *  an answer here, not a failure.
 *
 *  Only git's TERMINATING LINE BREAK is stripped (cross-vendor review, rounds 1
 *  and 2): a POSIX directory may end in a space — trimming would then name a
 *  path that is not the checkout — and it may legitimately end in a CARRIAGE
 *  RETURN, which is why `\r` is only stripped where it is really part of the
 *  platform's line ending and cannot occur inside a path. */
export function gitToplevel(cwd = process.cwd()) {
  const res = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', windowsHide: true })
  if (res.status !== 0 || res.error) return ''
  const out = (res.stdout ?? '').replace(/\n$/, '')
  return process.platform === 'win32' ? out.replace(/\r$/, '') : out
}

/** The tracked ledger of the checkout this command RUNS IN, or `null` outside
 *  any checkout — see ledgerPathFrom for why there is no fallback tree. */
export function recordsPathFor(cwd = process.cwd()) {
  return ledgerPathFrom(gitToplevel(cwd))
}

/** The tracked ledger of recorded mechanism reviews (JSON Lines), or `null`
 *  when this command runs outside a checkout. Resolved ONCE at load against the
 *  invocation's working directory: no script here chdirs, and a per-call git
 *  spawn on every default argument would be paid by every reader of the ledger.
 *  A caller that needs another checkout passes its own. */
export const RECORDS_PATH = recordsPathFor()

// AN ARGUMENT VECTOR, NEVER A SHELL LINE (landing-round pass 4): the sha this
// command interpolated reached a shell before any validation ran, so a value
// like `HEAD"; <command>; echo "` executed. execFileSync hands git its
// arguments directly — there is no shell to inject into.
const git = (args) => execFileSync('git', args, { windowsHide: true, cwd: REPO_ROOT, encoding: 'utf8' }).trim()

/** Every recorded review. A malformed line is skipped, never fatal — the ledger
 *  outlives the code that writes it, and one bad line must not blind the gate. */
export function readRecords(path = RECORDS_PATH) {
  // No checkout, no ledger — an empty history, not another tree's file.
  if (!path) return []
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch (e) {
    // ABSENT IS AN EMPTY HISTORY; UNREADABLE IS NOT (cross-vendor review of
    // point 780, round 3). EACCES, EISDIR and an I/O error all used to answer
    // "no reviews recorded" — which a writer reads as a clean ledger and a gate
    // reads as a ledger with nothing in it: two different wrong answers out of
    // one silent catch. The flag is what keeps the gates from treating it as
    // the environment error their fail-open catch waves through.
    if (e && e.code === 'ENOENT') return []
    const error = new Error(`cannot read the review ledger at ${path}: ${(e && e.message) || e}`)
    error.ledgerUnreadable = true
    throw error
  }
  const out = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const rec = JSON.parse(line)
      // The sha shape is checked HERE, not only where it is used: the guard
      // interpolates it into a `git merge-base` command line, and a ledger is a
      // file anyone can hand-edit (four-eyes review, 27.07.2026).
      if (rec && typeof rec.sha === 'string' && /^[0-9a-f]{7,40}$/i.test(rec.sha)) out.push(rec)
    } catch {
      /* a corrupted line is not a review; the gate then simply lacks it */
    }
  }
  return out
}

/** Append one record. Callers validate first — this only writes. */
export function appendRecord(record, path = RECORDS_PATH) {
  // A WRITE HAS NO FALLBACK TREE (cross-vendor review of point 780): appending
  // to the module's own checkout from outside any checkout is exactly the
  // silent cross-tree write this resolution was changed to end.
  if (!path) {
    throw new Error(
      'mechanism-review: no ledger here — this command is running outside a git checkout, ' +
        'and the record belongs to the checkout it judges. Run it inside one.',
    )
  }
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${JSON.stringify(record)}\n`)
  return record
}

/**
 * COUNT the union from the files themselves, and return the receipt line.
 *
 * The recorder does the accounting rather than trusting a pasted line: the two
 * lists and the union are read here, and a union that does not account for every
 * entry cannot be recorded as a merge at all. Returns { ok, summary, errors }.
 */
export function countUnionFiles({ unionPath, listAPath, listBPath }) {
  const read = (p) => {
    try {
      return readFileSync(p, 'utf8')
    } catch (e) {
      throw new Error(`cannot read ${p}: ${(e && e.message) || e}`)
    }
  }
  let union
  try {
    union = JSON.parse(read(unionPath))
  } catch (e) {
    return { ok: false, errors: [`--union ${unionPath}: ${(e && e.message) || e}`] }
  }
  let a
  let b
  try {
    a = parseListText('A', read(listAPath))
    b = parseListText('B', read(listBPath))
  } catch (e) {
    return { ok: false, errors: [(e && e.message) || String(e)] }
  }
  const inputs = validateInputs(a, b)
  if (!inputs.ok) return { ok: false, errors: inputs.errors }
  const result = accountUnion({ a, b, union })
  if (!result.ok) return { ok: false, errors: [formatAccounting(result)] }
  return { ok: true, summary: summaryLine(result), errors: [] }
}

/**
 * Build the record for `sha`, reading the authoring model from the commit itself.
 * Returns { ok, record, errors } — the caller prints and exits.
 */
export function buildRecord({
  sha = '',
  model = '',
  verdict = '',
  evidence = '',
  point = '',
  mode = '',
  framing = '',
  authorFraming = '',
  specExamination = '',
  mergedBy = '',
  mergeFallback = '',
  accounting = '',
  unionPath = '',
  listAPath = '',
  listBPath = '',
  pass = '',
  passFiles = '',
  passCommits = '',
  carriedFrom = '',
  now = Date.now(),
  resolve = resolveCommit,
  countUnion = countUnionFiles,
} = {}) {
  // A MISSING --record NEVER REACHES GIT (point 540). With an empty sha the
  // resolve step used to answer `fatal: ambiguous argument '^{commit}'` from
  // deep inside git, so the one refusal that names what the command wants — the
  // usage block below — was the one the caller never saw.
  if (!String(sha).trim()) {
    return {
      ok: false,
      errors: validateRecord({
        sha: '',
        model,
        verdict,
        evidence,
        mode,
        framing,
        authorFraming,
        specExamination,
        mergedBy,
        mergeFallback,
        accounting,
        pass,
        passFiles,
        passCommits,
      }).errors,
    }
  }
  // THE SHA IS VALIDATED BY SHAPE BEFORE ANYTHING RESOLVES IT (landing-round
  // pass 4): the record command is only ever printed with a hex sha, so
  // anything else — HEAD, a branch name, a shell fragment — is refused here
  // with the usage, and never reaches git in any form. The remaining flags
  // are still checked so the refusal names everything at once.
  const ref = String(sha).trim()
  if (!/^[0-9a-f]{7,40}$/i.test(ref)) {
    const rest = validateRecord({
      sha: '',
      model,
      verdict,
      evidence,
      mode,
      framing,
      authorFraming,
      specExamination,
      mergedBy,
      mergeFallback,
      accounting,
      pass,
      passFiles,
      passCommits,
    }).errors.filter((e) => !/--record\b/.test(e))
    return {
      ok: false,
      errors: [`--record <sha>: "${ref}" is not a commit sha (7–40 hex characters)`, ...rest],
    }
  }
  // A CARRY IS ITS OWN FLOW (delta rounds, 18.08.2026): everything but the
  // sha, the pass scope and the point comes verified from the source reading.
  if (String(carriedFrom ?? '').trim()) {
    if (String(passCommits ?? '').trim()) {
      return {
        ok: false,
        errors: [
          '--pass-commits cannot be carried: contribution boundaries are tied to the authorship plan that was actually reviewed',
        ],
      }
    }
    return buildCarriedRecord({
      sha: ref,
      carriedFrom,
      pass,
      passFiles,
      point,
      model,
      verdict,
      evidence,
      mode,
      framing,
      now,
      resolve,
    })
  }
  // THE RECEIPT IS COUNTED HERE WHERE IT CAN BE (four-eyes review, third round):
  // a typed `--accounting` line is a claim, and the recorder can turn it into a
  // measurement by reading the two lists and the union itself. Hand the files to
  // `--union/--list-a/--list-b` and the line is COMPUTED, not believed.
  const paths = [
    ['--union', unionPath],
    ['--list-a', listAPath],
    ['--list-b', listBPath],
  ]
  const missing = paths.filter(([, v]) => !String(v ?? '').trim()).map(([flag]) => flag)
  let source = 'stated'
  let receipt = accounting
  if (missing.length < paths.length) {
    if (missing.length) {
      return { ok: false, errors: [`counting the union needs all three files; missing ${missing.join(' and ')}`] }
    }
    const counted = countUnion({ unionPath, listAPath, listBPath })
    if (!counted.ok) return { ok: false, errors: counted.errors }
    receipt = counted.summary
    source = 'computed'
  }
  const commit = resolve(sha)
  const check = validateRecord({
    sha: commit.sha,
    model,
    verdict,
    evidence,
    authoredBy: commit.authoredBy,
    // EVERY model named in the trailers, not only the first: two co-authors mean
    // two list authors, and the merger has to be neither (four-eyes, point 634).
    authors: commit.authors,
    mode,
    framing,
    authorFraming,
    specExamination,
    mergedBy,
    mergeFallback,
    accounting: receipt,
    pass,
    passFiles,
    passCommits,
  })
  const errors = [...check.errors]
  // Optional, but never sloppy: a mistyped point number would record a review
  // for a point nobody is closing, and the criticality gate would still block
  // the real one while the ledger LOOKED like it held the answer.
  const wanted = String(point ?? '').trim()
  if (wanted && !/^\d+$/.test(wanted)) {
    errors.push('--point <N>: the work-order point this review settles, as a plain number')
  }
  if (errors.length) return { ok: false, errors }
  let passField = validatePass({ pass, passFiles, passCommits }).pass
  // A CONTRIBUTION BOUNDARY IS STORED WHOLE. The flag accepts a 7–40 character
  // sha, but the gate matches a record's commits against the range's FULL shas
  // by exact string — an abbreviated boundary therefore covered NOTHING while
  // the record looked complete, the silent shape point 714 exists to refuse. So
  // the boundary is resolved here, and a sha this repository cannot resolve is
  // a refusal rather than a row nobody can act on.
  if (passField?.commits) {
    const resolved = []
    for (const boundary of passField.commits) {
      try {
        resolved.push(resolve(boundary).sha)
      } catch (e) {
        return { ok: false, errors: [`--pass-commits ${boundary}: ${(e && e.message) || e}`] }
      }
    }
    if (new Set(resolved).size !== resolved.length) {
      return {
        ok: false,
        errors: ['--pass-commits: two boundaries resolve to the same commit; each contribution is named once'],
      }
    }
    passField = { ...passField, commits: resolved }
  }
  return {
    ok: true,
    record: {
      sha: commit.sha,
      subject: commit.subject,
      authoredBy: commit.authoredBy,
      model: String(model).trim(),
      verdict: String(verdict).trim(),
      evidence: String(evidence).trim(),
      // The four-eyes MODE travels with the verdict (point 541). Rows written
      // before this flag existed carry none, and every reader here treats a
      // missing mode as unknown rather than invalid — the ledger is tracked and
      // outlives the CLI that wrote it.
      mode: String(mode).trim(),
      ...(String(framing).trim() ? { framing: String(framing).trim() } : {}),
      ...(String(authorFraming).trim() ? { authorFraming: String(authorFraming).trim() } : {}),
      ...(String(specExamination).trim() ? { specExamination: String(specExamination).trim() } : {}),
      // WHO FOLDED THE TWO LISTS (point 634). A blind-parallel record carries it
      // — the merge is the one step where a finding can vanish, so the model
      // that wrote neither list does it and the record NAMES that model. Rows
      // written before this flag carry none, and read as unrecorded.
      ...(String(mergedBy).trim() ? { mergedBy: String(mergedBy).trim() } : {}),
      ...(String(mergeFallback).trim() ? { mergeFallback: String(mergeFallback).trim() } : {}),
      // The count itself, so the ledger holds the receipt and not only the claim
      // — and WHERE it came from: `computed` was measured from the files here,
      // `stated` was typed by whoever ran the merge.
      ...(String(receipt).trim() ? { accounting: String(receipt).trim(), accountingSource: source } : {}),
      // WHICH PASS OF WHICH SPLIT, AND OVER WHICH FILES (point 714). A range no
      // single round can hold is reviewed in passes over the file set; the gate
      // clears it only once every pass of the same total is on record, so this
      // field is what turns several partial verdicts into one coverage.
      ...(passField ? { pass: passField } : {}),
      // MACHINE-READABLE SCOPE BESIDE THE VERDICT (point 684). A pass is a
      // partial review of the range even when its own material fitted perfectly;
      // storing the mark prevents a later ledger reader from mistaking that
      // verdict for the whole branch. The gate still composes the pass metadata
      // itself — this label explains scope, it never grants coverage.
      ...(passField ? { partialReview: true } : {}),
      ...(wanted ? { point: Number(wanted) } : {}),
      at: now,
      atIso: new Date(now).toISOString(),
    },
  }
}

/**
 * Build a CARRIED pass record (delta-scoped rounds, user decision 18.08.2026):
 * a pass of an earlier round carries to a new head where every file it read is
 * byte-identical there. The recorder VERIFIES rather than believes — the
 * source sha must be an ancestor of the head, every pass file's blob must be
 * identical at both, and the ledger must hold the source reading itself, whose
 * verdict/model/evidence/mode are COPIED (a carry is provenance, never a fresh
 * judgment; that is why --model/--verdict/--evidence/--mode are refused
 * beside it). The gates re-verify the blob identity on every read
 * (verifyCarried), so a hand-edited carried row clears nothing.
 */
export function buildCarriedRecord({
  sha = '',
  carriedFrom = '',
  pass = '',
  passFiles = '',
  point = '',
  model = '',
  verdict = '',
  evidence = '',
  mode = '',
  framing = '',
  now = Date.now(),
  resolve = resolveCommit,
  records = null,
} = {}) {
  const errors = []
  if ([model, verdict, evidence, mode, framing].some((v) => String(v ?? '').trim())) {
    errors.push('--carried-from copies model, verdict, evidence and mode from the source pass — do not pass them')
  }
  const from = String(carriedFrom).trim()
  if (!/^[0-9a-f]{7,40}$/i.test(from)) {
    errors.push(`--carried-from: "${from}" is not a commit sha (7–40 hex characters)`)
  }
  const passCheck = validatePass({ pass, passFiles })
  if (!passCheck.pass) {
    errors.push('--carried-from needs --pass <k>/<n> and --pass-files — a carry is always one pass of a split')
  }
  const wanted = String(point ?? '').trim()
  if (wanted && !/^\d+$/.test(wanted)) {
    errors.push('--point <N>: the work-order point this review settles, as a plain number')
  }
  if (errors.length) return { ok: false, errors }
  const commit = resolve(sha)
  const source = resolve(from)
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', source.sha, commit.sha], {
      windowsHide: true,
      cwd: REPO_ROOT,
      stdio: 'ignore',
    })
  } catch {
    errors.push(`--carried-from: ${source.sha.slice(0, 7)} is not an ancestor of ${commit.sha.slice(0, 7)} — a carry only moves a reading FORWARD along this history`)
  }
  if (source.sha === commit.sha) {
    errors.push('--carried-from names the recorded sha itself — record the original pass, not a carry')
  }
  for (const file of passCheck.pass?.files ?? []) {
    let a = null
    let b = null
    try {
      a = git(['rev-parse', `${source.sha}:${file}`])
    } catch {
      errors.push(`--carried-from: ${file} does not exist at ${source.sha.slice(0, 7)} — nothing there to carry`)
      continue
    }
    try {
      b = git(['rev-parse', `${commit.sha}:${file}`])
    } catch {
      errors.push(`--carried-from: ${file} does not exist at ${commit.sha.slice(0, 7)} — deleted content cannot be covered by a carry`)
      continue
    }
    if (a !== b) {
      errors.push(
        `--carried-from: ${file} CHANGED between ${source.sha.slice(0, 7)} and ${commit.sha.slice(0, 7)} — a carry may only rest on identical blobs; review it fresh`,
      )
    }
  }
  const all = records ?? readRecords()
  // The same INJECTIVE set key as verifyCarried.
  const wantedSet = reviewFileSetKey(passCheck.pass?.files)
  const sources = all.filter(
    (r) =>
      r.sha === source.sha &&
      r.pass &&
      Array.isArray(r.pass.files) &&
      reviewFileSetKey(r.pass.files) === wantedSet &&
      VERDICTS.includes(String(r.verdict)) &&
      // The source must be the ORIGINAL reading: blob identity is transitive,
      // so where the source is itself carried, carry from ITS original.
      r.carried === undefined,
  )
  if (!sources.length) {
    errors.push(
      `--carried-from: no recorded pass at ${source.sha.slice(0, 7)} covers exactly these files — a carry may only rest on a reading that happened (and where that reading is itself a carry, carry from its original)`,
    )
  }
  if (errors.length) return { ok: false, errors }
  const src = sources.reduce((x, y) => (Number(y.at ?? 0) >= Number(x.at ?? 0) ? y : x))
  const copiedEvidence = `CARRIED from ${source.sha.slice(0, 7)} (blobs verified identical): ${String(src.evidence ?? '').trim()}`
  const check = validateRecord({
    sha: commit.sha,
    model: src.model,
    verdict: src.verdict,
    evidence: copiedEvidence,
    authoredBy: commit.authoredBy,
    authors: commit.authors,
    mode: src.mode,
    pass,
    passFiles,
  })
  if (check.errors.length) return { ok: false, errors: check.errors }
  return {
    ok: true,
    record: {
      sha: commit.sha,
      subject: commit.subject,
      authoredBy: commit.authoredBy,
      model: String(src.model).trim(),
      verdict: String(src.verdict).trim(),
      evidence: copiedEvidence,
      mode: String(src.mode).trim(),
      pass: passCheck.pass,
      partialReview: true,
      carried: { from: source.sha },
      ...(wanted ? { point: Number(wanted) } : {}),
      at: now,
      atIso: new Date(now).toISOString(),
    },
  }
}

/**
 * Re-measure every carried row's WHOLE claim and STAMP it (the gates' half of
 * the carry contract): for each record with `carried.from`,
 *   - every pass file's blob must be identical between the source and the
 *     recorded sha,
 *   - the source must be a strict ancestor of the recorded sha,
 *   - and the SOURCE READING itself must stand in the ledger — an original
 *     (non-carried) pass row at the source sha over the exact file set whose
 *     model, verdict and mode the carried row COPIED, and whose evidence the
 *     carried evidence quotes. Blob identity alone let a hand-edited carried
 *     row INVENT its verdict and still stamp true (third landing round,
 *     pass 5) — the copied fields are part of the claim, so they are part of
 *     the proof.
 * Anything that cannot be verified — a malformed sha, a missing file, a git
 * failure, no matching source row — stamps false, and the cores refuse the
 * row. Mutates and returns `records`.
 */
export function verifyCarried(records, allRecords = null) {
  let ledger = null
  for (const r of records ?? []) {
    if (!r || typeof r !== 'object' || r.carried === undefined) continue
    r.carriedVerified = (() => {
      try {
        const from = String(r.carried?.from ?? '')
        if (!/^[0-9a-f]{7,40}$/i.test(from)) return false
        if (!/^[0-9a-f]{7,40}$/i.test(String(r.sha ?? ''))) return false
        if (from === r.sha) return false
        try {
          execFileSync('git', ['merge-base', '--is-ancestor', from, r.sha], {
            windowsHide: true,
            cwd: REPO_ROOT,
            stdio: 'ignore',
          })
        } catch {
          return false
        }
        const files = Array.isArray(r.pass?.files) ? r.pass.files : null
        if (!files || !files.length) return false
        for (const file of files) {
          if (typeof file !== 'string' || !file) return false
          const a = git(['rev-parse', `${from}:${file}`])
          const b = git(['rev-parse', `${r.sha}:${file}`])
          if (!a || a !== b) return false
        }
        if (!ledger) ledger = allRecords ?? readRecords()
        // An INJECTIVE set key (JSON, never a join): a legal path may contain any
        // separator a join could pick, and a collision would let one file set
        // impersonate another.
        const wantedSet = reviewFileSetKey(files)
        const source = ledger.find(
          (s) =>
            s !== r &&
            s.carried === undefined &&
            String(s.sha) === from &&
            Array.isArray(s.pass?.files) &&
            reviewFileSetKey(s.pass.files) === wantedSet &&
            String(s.model) === String(r.model) &&
            String(s.verdict) === String(r.verdict) &&
            String(s.mode) === String(r.mode) &&
            String(r.evidence ?? '').endsWith(String(s.evidence ?? '').trim()) &&
            /^CARRIED from [0-9a-f]{7} \(blobs verified identical\): /.test(String(r.evidence ?? '')),
        )
        return Boolean(source)
      } catch {
        return false
      }
    })()
  }
  return records
}

/** Resolve a (possibly short) sha to the commit, its subject and its author model.
 *
 *  Each free-text fact through its OWN single-format `git show` (escalation
 *  round, pass 2): a combined format needs a separator, and a legal SUBJECT
 *  containing that separator shifted the trailers out of their field — the
 *  authoring model then read wrong, and the self-review refusal missed. With
 *  one format per call there is no separator to forge. */
export function resolveCommit(sha, { run = git } = {}) {
  // VALIDATED BEFORE GIT SEES IT (landing-round pass 4): the record command is
  // only ever printed with a hex sha, so anything else is refused by shape —
  // with the one message that names what this command wants.
  const ref = String(sha).trim()
  if (!/^[0-9a-f]{7,40}$/i.test(ref)) {
    throw new Error(`--record <sha>: "${ref}" is not a commit sha (7–40 hex characters)`)
  }
  // RESOLVED AGAINST THE OBJECT DATABASE, NOT AGAINST REFS. `git rev-parse`
  // answers a REF first, and a branch or tag may legally be named in hex — so
  // a ref named like a sha prefix would silently record a DIFFERENT commit than
  // the boundary given, and the coverage reader would then clear contributions
  // nobody read. `--disambiguate` never consults refs: it lists the objects
  // whose id carries the prefix, and anything but exactly one commit is refused.
  const candidates = run(['rev-parse', `--disambiguate=${ref.toLowerCase()}`])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const commits = candidates.filter((candidate) => {
    // AN UNREADABLE CANDIDATE IS NOT A NON-COMMIT. Swallowing the error dropped
    // it from the list, so a prefix naming one readable commit beside one
    // unreadable object resolved as unambiguous — ambiguity failing OPEN, which
    // is the one direction this check exists to prevent.
    let type
    try {
      type = run(['cat-file', '-t', candidate])
    } catch (e) {
      throw new Error(`--record <sha>: "${ref}" names an object this repository cannot read (${candidate.slice(0, 12)}): ${(e && e.message) || e}`)
    }
    return type === 'commit'
  })
  if (!commits.length) {
    throw new Error(`--record <sha>: "${ref}" names no commit in this repository`)
  }
  if (commits.length > 1) {
    throw new Error(
      `--record <sha>: "${ref}" is ambiguous — it names ${commits.length} commits (${commits.map((c) => c.slice(0, 12)).join(', ')})`,
    )
  }
  const full = commits[0]
  const subject = run(['show', '-s', '--format=%s', full])
  const trailers = run(['show', '-s', '--format=%(trailers:key=Co-Authored-By,valueonly,separator=;)', full])
  return {
    sha: full,
    subject,
    authoredBy: modelFromTrailers(trailers),
    authors: modelsFromTrailers(trailers),
  }
}

/** The one description of what this command takes — printed by both refusals. */
export const usage = () =>
  `usage: node scripts/mechanism-review.mjs --record <sha> --model <name> ` +
  `--verdict <${VERDICTS.join('|')}> --evidence "<one line>" \\\n` +
  `           --mode <${MODES.join('|')}> [--framing "<one line>"] [--point <N>]\n` +
  `           [--author-framing "<one line>" | --spec-examination <sound|amended>]\n` +
  `           --merged-by "<model>" --accounting "<the blind-merge summary line>" \\\n` +
  `           [--merge-fallback "<which model was unavailable>"]           (blind-parallel)\n` +
  `       node scripts/mechanism-review.mjs --list        (the recorded reviews)\n` +
  `\n--mode names which half of the four-eyes principle this verdict covers ` +
  `(CLAUDE.md §6):\n` +
  `       review          one artefact judged — a diff, an implementation, a measurement\n` +
  `       blind-parallel  a DIVERGENT step (what could go wrong, which cases to test,\n` +
  `                       which designs are possible) where both models worked from the\n` +
  `                       same inputs without seeing each other's result\n` +
  `--framing records how a second blind run by the SAME model was decorrelated, and\n` +
  `       belongs to blind-parallel alone.\n` +
  `--author-framing records the hostile-tester stance of a re-authoring commission\n` +
  `       beside the review that followed it. Rounds zero and one have none.\n` +
  `--spec-examination records the one cross-vendor reading before Fable escalation:\n` +
  `       sound when the text survived the findings, amended when the work order changed.\n` +
  `--merged-by names the model that folded the two lists into the union — the one that\n` +
  `       wrote NEITHER of them, because a merge can lose a finding silently — and the\n` +
  `       COUNT says none did. Hand over the FILES and it is counted here:\n` +
  `       --union <U.json> --list-a <A> --list-b <B>   (preferred; --accounting then\n` +
  `       needs no value). Or run node scripts/blind-merge.mjs first and pass the line\n` +
  `       it prints as --accounting "<summary>".\n` +
  `--pass <k>/<n> --pass-files "<a,b,c>" records ONE pass of a range whose material no\n` +
  `       single review round can hold. The passes cut through the FILE SET, and the gate\n` +
  `       clears the range only once EVERY pass of the same total is recorded — a pass on\n` +
  `       its own covers the files it names and nothing else. review-sol.mjs prints them.\n` +
  `       A path holding a comma, a quote or edge whitespace is written C-QUOTED, exactly\n` +
  `       as git prints it; nothing is ever trimmed into a different path.\n` +
  `       An authorship-cut pass adds --pass-commits "<sha,sha>" so a mixed-vendor\n` +
  `       file is credited only at the commit boundaries this reviewer actually read.\n` +
  `       A commit written to answer a finding is still a NEW contribution by design: the\n` +
  `       confirming clean pass must review and record it. This convergence cost is accepted.\n` +
  `--carried-from <sha> carries an EARLIER round's pass to this head where every file it\n` +
  `       read is byte-identical there: the recorder verifies the blob identity and the\n` +
  `       source reading, and COPIES its verdict/model/evidence — do not pass them. The\n` +
  `       gates re-verify the blobs on every read; a changed file refuses the carry.\n` +
  `\nWHO REVIEWS (CLAUDE.md §6): the OTHER vendor, never an author of the range.\n` +
  `       Claude authored it → GPT-5.6 Sol at reasoning effort high, and when Sol is\n` +
  `       unavailable the first of Fable 5 / Opus 5 / Opus 4.8 that wrote no part of it.\n` +
  `       SOL authored it → the first of Opus 5 / Fable 5 / Opus 4.8 that wrote no part\n` +
  `       of it, which also runs the suites, judges the picture and lands the point.\n` +
  `       Run it — never a hand-typed codex line — with:\n` +
  `       node scripts/review-sol.mjs --sha <sha> --brief "<what to judge>"\n` +
  `\nThe GATES are separate commands and answer --status themselves:\n` +
  `       node scripts/mechanism-review-guard.mjs --status\n` +
  `       node scripts/criticality-review-guard.mjs --status`

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2)
  try {
    // AN UNRECOGNISED ARGUMENT IS A QUESTION, NOT A RECORD (points 437 H / 540).
    // The parse is pure and lives in the core; this half only prints it. Note the
    // order: the refusal comes BEFORE --list, because `--list --wibble` is as
    // unrecognised a command line as any other.
    const parsed = parseArgs(args)
    if (!parsed.ok) {
      console.error(formatArgErrors(parsed.errors))
      console.error(`\n${usage()}`)
      process.exit(2)
    }

    if (parsed.mode === 'list') {
      const records = readRecords()
      if (!records.length) {
        console.log('no mechanism reviews recorded yet')
      }
      // EVERY FREE-TEXT FIELD RENDERS AS ONE LINE (landing-round pass 4):
      // readRecords validates only the sha, and a hand-edited row with a
      // newline in any field forged arbitrary listing lines — the shape a
      // reader greps and trusts. Whitespace runs flatten to one space, and
      // TERMINAL CONTROLS (ESC and the other C0/C1 bytes, which \s does not
      // cover) are dropped outright — a hand-edited field must not drive the
      // reader's terminal either.
      const oneLine = (v) =>
        String(v ?? '')
          .replace(/\s+/g, ' ')
          // eslint-disable-next-line no-control-regex
          .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
      // …and the pass CLAIM is validated whole before it is rendered: Number()
      // turns any decorated or multi-line index into NaN, a files value that
      // is no array is part of the malformed claim, and a claim that is not a
      // plausible k-of-n over a file list is printed as the hand-edit it is.
      const passLine = (p) => {
        const index = Number(p?.index)
        const total = Number(p?.total)
        const files = (Array.isArray(p?.files) ? p.files : []).map((q) => quotePassFile(q)).join(', ')
        const shaped =
          Number.isSafeInteger(index) &&
          Number.isSafeInteger(total) &&
          index >= 1 &&
          index <= total &&
          Array.isArray(p?.files)
        const commits = Array.isArray(p?.commits) ? p.commits.map((sha) => oneLine(sha)).join(', ') : ''
        return shaped
          ? `\n      PARTIAL REVIEW — pass ${index}/${total} over: ${files}${commits ? `\n      contribution commits: ${commits}` : ''}`
          : `\n      pass (MALFORMED claim ${oneLine(JSON.stringify({ index: p?.index, total: p?.total, files: Array.isArray(p?.files) ? undefined : p?.files })).slice(0, 100)}) over: ${files}`
      }
      for (const r of records) {
        console.log(
          `${String(r.sha).slice(0, 7)}  ${oneLine(r.verdict).padEnd(16)} by ${oneLine(r.model).padEnd(12)} ` +
            `(authored by ${oneLine(r.authoredBy) || 'unknown'})${r.point ? `  point ${oneLine(r.point)}` : ''}  ` +
            // A row from before --mode existed has none; it reads as unrecorded,
            // never as one of the two modes.
            `[${oneLine(r.mode) || 'mode not recorded'}]  ${oneLine(r.atIso ?? '')}` +
            `\n      ${oneLine(r.evidence ?? '')}${r.framing ? `\n      framing: ${oneLine(r.framing)}` : ''}` +
            `${r.authorFraming ? `\n      author framing: ${oneLine(r.authorFraming)}` : ''}` +
            `${r.specExamination ? `\n      spec examination: ${oneLine(r.specExamination)}` : ''}` +
            `${r.mergedBy ? `\n      union merged by: ${oneLine(r.mergedBy)}${r.mergeFallback ? ` (two-model fallback: ${oneLine(r.mergeFallback)})` : ''}` : ''}` +
            `${r.accounting ? `\n      accounting: ${oneLine(r.accounting)}` : ''}` +
            // Quoted like every structural path list (round-2 pass 3): a path
            // holding a newline or comma must not forge a line here either.
            // And GUARDED (final-round pass 4): readRecords validates only the
            // sha, so a hand-edited `pass.files` that is no array crashed the
            // whole listing.
            `${r.pass ? passLine(r.pass) : ''}`,
        )
      }
      process.exit(0)
    }

    const built = buildRecord(parsed.values)
    if (!built.ok) {
      console.error('mechanism-review: refusing to record this review.\n')
      for (const e of built.errors) console.error(`  · ${e}`)
      console.error(`\n${usage()}`)
      process.exit(1)
    }
    appendRecord(built.record)
    console.log(
      `recorded: ${built.record.sha.slice(0, 7)} "${built.record.subject}" reviewed by ` +
        `${built.record.model} → ${built.record.verdict} (${built.record.mode})\n  ${built.record.evidence}\n` +
        `  ledger: ${RECORDS_PATH} (tracked — commit it with the change it judges)`,
    )
    process.exit(0)
  } catch (e) {
    console.error(`mechanism-review failed: ${(e && e.message) || e}`)
    process.exit(1)
  }
}
