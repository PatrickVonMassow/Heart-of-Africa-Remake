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
import { dirname, isAbsolute, relative, resolve as resolvePath, sep } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { REPO_ROOT } from './repo-paths.mjs'
import { isTrackedInGit } from './git-tracked.mjs'
import { isMainModule } from './is-main.mjs'
import { accountUnion, formatAccounting, parseListText, summaryLine, validateInputs } from './blind-merge-core.mjs'
import {
  BLIND_PARALLEL,
  formatArgErrors,
  handoverChainFor,
  KNOWN_FLAGS,
  ledgerPathFrom,
  modelFromTrailers,
  modelsFromTrailers,
  modelVendor,
  MODES,
  parseArgs,
  sameModel,
  validatePass,
  validateRecord,
  resolveMergePolicy,
  VERDICTS,
} from './mechanism-review-core.mjs'
import { quotePassFile } from './review-material-core.mjs'
import { currentFableState } from './fable-switch.mjs'
import {
  FABLE_MODEL,
  FABLE_MODEL_ID,
  OPUS_FALLBACK_MODEL,
  OPUS_FALLBACK_MODEL_ID,
  OPUS_MODEL,
  OPUS_MODEL_ID,
  parseClaudeResultOutput,
} from './fable-switch-core.mjs'
import { authorshipRefusesPermission } from './authorship-check-core.mjs'
import { commitObjectParents } from './mechanism-review-range-core.mjs'
import { checkAuthorshipFile } from './authorship-check-io.mjs'

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
// Every object fact this recorder derives is from the real object graph. A
// replacement ref can substitute commits, trees and blobs alike, so applying
// the flag only to resolveCommit's ancestry reads still let carry verification
// compare attacker-selected trees while claiming the original shas.
const git = (args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    windowsHide: true,
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim()


/** The committed model field and blob oid of a repository half — read from a
 *  COMMIT, never from the working tree, so what it answers is what a commit
 *  somebody can read actually says. `at` names the commit (default HEAD); the
 *  fold consumers pass the reviewed sha, which binds the artefacts to the
 *  commit the record clears instead of to whatever HEAD happens to be
 *  (re-review round 4). Null when the path is not committed JSON with a model
 *  field there. */
export function committedHalfModel(path, { at = 'HEAD' } = {}) {
  try {
    // AN ABSOLUTE PATH INSIDE THE CHECKOUT IS THE SAME ARTEFACT, and refusing it
    // outright made a caller that had resolved its own paths read "no committed
    // JSON with a model field" about a file the repository carries. It is
    // relativised against the checkout instead; anything that leaves the
    // checkout still has no committed bytes here and stays refused.
    const rel = repoRelative(path)
    if (!rel || isAbsolute(rel)) return null
    const ref = /^[0-9a-f]{7,40}$/i.test(String(at)) || at === 'HEAD' ? at : 'HEAD'
    const oid = git(['rev-parse', `${ref}:${rel}`])
    const model = JSON.parse(git(['show', `${ref}:${rel}`]))?.model
    return typeof model === 'string' && model.trim() ? { oid, model: model.trim() } : null
  } catch {
    return null
  }
}

/** The reviewer-vendor matrix, one place for recorder and carry alike: each
 *  vendor must show exactly the evidence it CAN have (re-review round 4 —
 *  the carry path accepted every "agreement" regardless of vendor, so a
 *  fabricated OpenAI or unknown-vendor agreement could be carried forward). */
export function reviewerVendorProblems(model, authorship = {}) {
  const vendor = modelVendor(model)
  const status = String(authorship?.status ?? '').trim()
  // THE EVIDENCE MUST BE ABOUT THE MODEL RECEIVING CREDIT (re-review round 5):
  // a carried source hand-credited to one model beside an agreement quoted for
  // another passed the vendor test on the credit alone.
  const claimed = String(authorship?.claimedModel ?? '').trim()
  if (!claimed) {
    // A claim naming NO model binds its evidence to nobody: a hand-edited
    // source row of bare {status} would otherwise pass the vendor test on the
    // credit alone and be copied forward (re-review round 10).
    return [
      `the reviewer identity evidence names no claimedModel — evidence bound to nobody proves nothing about "${model}"`,
    ]
  }
  if (!sameModel(claimed, model)) {
    return [
      `the reviewer identity evidence is about "${claimed}" while the credit names "${model}" — ` +
        'evidence for one model proves nothing about another',
    ]
  }
  if (status === 'agreement' && authorship?.actualModel && !sameModel(authorship.actualModel, model)) {
    return [
      `the transcript agreement names "${authorship.actualModel}" while the credit names "${model}" — ` +
        'evidence for one model proves nothing about another',
    ]
  }
  // AN AGREEMENT MUST SAY WHERE IT WAS READ (confirming pass, round 13): the
  // recorder's own agreements carry the transcript path, the artefact time and
  // the message id; a hand-forged {status, claimedModel} pair carries none and
  // may not ride a carry onto a new commit.
  if (status === 'agreement') {
    const anchored =
      String(authorship?.transcript ?? authorship?.resultPath ?? '').trim() &&
      typeof authorship?.artefactAt === 'number' &&
      Number.isFinite(authorship.artefactAt) &&
      authorship.artefactAt > 0 &&
      String(authorship?.messageId ?? '').trim()
    if (!anchored) {
      return [
        `the agreement for "${model}" quotes no transcript, artefact time or message id — an identity ` +
          'claim with nothing to audit clears nothing',
      ]
    }
  }
  if (vendor === 'unknown') {
    return [
      `the claimed reviewer "${model}" names no vendor the review roster can place — a reviewer nobody ` +
        'can rule out clears nothing, whatever its claimed status',
    ]
  }
  if (vendor === 'anthropic' && status !== 'agreement') {
    return [
      `the claimed reviewer "${model}" is one whose session transcript the harness holds, so its identity ` +
        'must be VERIFIED: pass --model-at <ISO> and --model-transcript <session.jsonl> so the claim can be ' +
        'checked against message.model — an unverified claim from this vendor no longer clears the gate',
    ]
  }
  if (vendor === 'openai') {
    if (status !== 'unverified') {
      return [
        `the claimed reviewer "${model}" runs outside the harness, so no session transcript can hold its ` +
          'messages — an "agreement" claiming one is fabricated evidence; record it as unverified with the reason stated',
      ]
    }
    if (typeof authorship?.reason !== 'string' || !authorship.reason.trim()) {
      return [
        `the claimed reviewer "${model}" records an unverified identity with no reason — say why no ` +
          'verification exists (external CLI reviewer, no harness transcript)',
      ]
    }
  }
  return []
}

/** Verify the single-result receipt emitted by the read-only Claude CLI. The
 *  top-level model is tied to the result by its exact usage counters; auxiliary
 *  classifier calls neither grant nor spoil reviewer credit. */
export function checkClaudeResultFile({ claimedModel = '', artefactAt = '', resultPath = '' } = {}) {
  const descriptor = [
    { key: 'fable', name: FABLE_MODEL, id: FABLE_MODEL_ID, runtime: 'claude' },
    { key: 'opus', name: OPUS_MODEL, id: OPUS_MODEL_ID, runtime: 'claude' },
    { key: 'opus48', name: OPUS_FALLBACK_MODEL, id: OPUS_FALLBACK_MODEL_ID, runtime: 'claude' },
  ].find((entry) => sameModel(entry.name, claimedModel))
  const at = Date.parse(String(artefactAt ?? '')) || Number(artefactAt) || null
  if (!descriptor || descriptor.runtime !== 'claude') {
    return { status: 'unverified', claimedModel, actualModel: '', artefactAt: at, reason: 'the claimed model is not a Claude reviewer' }
  }
  let raw
  try {
    raw = readFileSync(resultPath, 'utf8')
  } catch (error) {
    return {
      status: 'unverified', claimedModel, actualModel: '', artefactAt: at, resultPath: resultPath || null,
      reason: `cannot read Claude result ${resultPath || '(none)'}: ${(error && error.message) || error}`,
    }
  }
  const parsed = parseClaudeResultOutput(raw, descriptor)
  const base = {
    claimedModel,
    actualModel: parsed.ok ? descriptor.name : parsed.answerModel || '',
    ...(parsed.answerModel ? { servedModel: parsed.answerModel } : {}),
    artefactAt: at,
    messageAt: at,
    messageId: parsed.sessionId || `claude-result:${descriptor.key}`,
    resultPath,
    proof: 'claude-result',
  }
  if (parsed.ok) return { ...base, status: 'agreement', reason: 'the Claude result usage identifies the selected top-level model' }
  if (parsed.answerModel) return { ...base, status: 'disagreement', reason: parsed.error }
  return { ...base, status: 'unverified', reason: parsed.error }
}

/** A spelling no canonicalization may silently repair: dot segments and
 *  duplicate separators are junk, not alternative names (re-review round 11).
 *  A leading empty segment is an absolute path's root and stays legal. */
export function junkSpelling(path) {
  // Split on the PLATFORM's separators only: on POSIX a backslash is a legal
  // filename byte, not a separator, and treating it as one falsely rejected
  // such a name (confirming pass, round 12). On Windows a UNC root —
  // \\server\share — legitimately begins with two empty segments (round 13).
  const raw = String(path ?? '')
  const splitter = sep === '\\' ? /[\\/]/ : /\//
  const unc = sep === '\\' && (raw.startsWith('\\\\') || raw.startsWith('//'))
  const segments = raw.split(splitter).slice(unc ? 2 : 0)
  return segments.some(
    (segment, i) => segment === '.' || segment === '..' || (segment === '' && (unc || i > 0)),
  )
}

/** A checkout path as the repository spells it — relative to REPO_ROOT. A
 *  path OUTSIDE the checkout keeps the caller's spelling (and so stays
 *  refusable); a legal repository name that merely BEGINS with two dots —
 *  `..half.json` — is not "outside" (re-review round 4). */
export function repoRelative(path) {
  // The caller's spelling survives — trimming rewrote a legal whitespace-bearing
  // filename into a different pathname (re-review round 6). Only an argument
  // that is nothing but whitespace is empty.
  const raw = String(path ?? '')
  if (!raw.trim()) return ''
  const rel = relative(REPO_ROOT, resolvePath(REPO_ROOT, raw))
  const outside = !rel || rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith('../')
  // Only the PLATFORM separator is normalised: replacing every backslash
  // corrupted a POSIX filename that legitimately contains one (re-review
  // round 7).
  return outside ? raw : (sep === '\\' ? rel.split(sep).join('/') : rel)
}

/** The committed blob oid at a path, or '' when the commit carries none. */
export function committedOid(path, { at = 'HEAD' } = {}) {
  try {
    const rel = repoRelative(path)
    if (!rel || isAbsolute(rel)) return ''
    const ref = /^[0-9a-f]{7,40}$/i.test(String(at)) || at === 'HEAD' ? at : 'HEAD'
    return git(['rev-parse', `${ref}:${rel}`])
  } catch {
    return ''
  }
}

/** A file's git blob oid, computed from its working-tree bytes AS GIT WOULD
 *  COMMIT THEM — `git hash-object --path` applies the same clean filters and
 *  EOL normalisation a commit applies, so a clean, fully committed artefact
 *  hashes to its committed oid instead of being falsely refused on raw bytes
 *  (re-review round 9). */
export function workingBlobOid(path) {
  try {
    const bytes = readFileSync(path)
    const rel = repoRelative(path)
    return execFileSync('git', ['hash-object', '--path', rel, '--stdin'], {
      windowsHide: true,
      cwd: REPO_ROOT,
      encoding: 'utf8',
      input: bytes,
    }).trim()
  } catch {
    return ''
  }
}

/** Recompute a fold's receipt from three committed blobs — the halves and the
 *  union — so the receipt a row carries is derived from exactly the bytes the
 *  row binds. */
export function recountFromBlobs(oids, blobText = committedBlobText) {
  const texts = oids.map((oid) => blobText(oid))
  const missing = oids.filter((_, i) => texts[i] === null)
  if (missing.length) {
    return { ok: false, errors: missing.map((oid) => `blob ${String(oid).slice(0, 12)} is not in the repository`) }
  }
  let a, b, union
  try {
    a = parseListText('A', texts[0])
    b = parseListText('B', texts[1])
    union = JSON.parse(texts[2])
  } catch (e) {
    return { ok: false, errors: [`the committed artefacts do not parse: ${(e && e.message) || e}`] }
  }
  const inputs = validateInputs(a, b)
  if (!inputs.ok) return { ok: false, errors: inputs.errors }
  const result = accountUnion({ a, b, union })
  if (!result.ok) return { ok: false, errors: [formatAccounting(result)] }
  return { ok: true, summary: summaryLine(result), errors: [] }
}

/** The bytes of one committed blob, by oid — content-addressed, so the answer
 *  is the same from every checkout that has the object. Null when absent. */
export function committedBlobText(oid) {
  try {
    const id = String(oid ?? '').trim()
    if (!/^[0-9a-f]{40}$/i.test(id)) return null
    return git(['cat-file', 'blob', id])
  } catch {
    return null
  }
}

/** Is a ledger row's fold claim BACKED BY THE REPOSITORY? The ledger is
 *  hand-editable, so none of its strings are evidence on their own. The row
 *  names the exact blobs it counted — two halves and the union — and this
 *  RE-PERFORMS the count from those committed bytes (cross-vendor re-review of
 *  point 889: checking only that each path's current committed model matched
 *  meant a hand-edited row could point at unrelated files with suitable model
 *  fields, and neither the union nor the accounting was bound to anything).
 *  Verified now means: the halves' committed model fields say what the row
 *  claims, the union's committed mergedBy says what the row claims, the
 *  recomputed accounting balances and reproduces the recorded receipt, and the
 *  named paths still carry those exact blobs. The gate poisons anything less. */
export function verifyHalfAuthors(record, { committedHalf = committedHalfModel, blobText = committedBlobText, committedOidOf = committedOid } = {}) {
  const authors = Array.isArray(record?.halfAuthors) ? record.halfAuthors : []
  const sources = Array.isArray(record?.halfSources) ? record.halfSources : []
  const blobs = Array.isArray(record?.halfBlobs) ? record.halfBlobs : []
  if (authors.length !== 2 || sources.length !== 2 || blobs.length !== 2) return false
  // ANCHORED AT THE ROW'S OWN COMMIT, not at HEAD: the record clears exactly
  // one sha, so the artefacts it names must be in THAT tree — a fold whose
  // files exist only somewhere else in history is somebody else's fold
  // (re-review round 4: HEAD anchoring let a valid historical fold be replayed
  // under a row naming an unrelated commit, and let a true row rot when HEAD
  // moved past its artefacts).
  const at = String(record?.sha ?? '').trim()
  if (!/^[0-9a-f]{7,40}$/i.test(at)) return false
  // The row's sha is the WHOLE anchor: what its tree carries is immutable
  // evidence, and a working-tree condition would make a true historical row
  // rot when later commits move or delete the artefacts (re-review round 5).
  const anchored = sources.every((src, i) => {
    const committed = committedHalf(src, { at })
    if (committed === null) return false
    if (committed.oid !== String(blobs[i] ?? '').trim()) return false
    return sameModel(committed.model, authors[i])
  })
  if (!anchored) return false
  // The fold itself, recomputed from the committed bytes the row names. The
  // union is anchored exactly like the halves: the row names its PATH and its
  // BLOB, and the blob must be the one HEAD carries at that path — an oid that
  // merely exists somewhere in the object store is not repository provenance
  // (re-review round 3).
  const unionBlob = String(record?.unionBlob ?? '').trim()
  const unionSource = String(record?.unionSource ?? '').trim()
  if (!unionBlob || !unionSource) return false
  if (committedOidOf(unionSource, { at }) !== unionBlob) return false
  const texts = [blobs[0], blobs[1], unionBlob].map((oid) => blobText(oid))
  if (texts.some((t) => t === null)) return false
  let a, b, union
  try {
    a = parseListText('A', texts[0])
    b = parseListText('B', texts[1])
    union = JSON.parse(texts[2])
  } catch {
    return false
  }
  if (!sameModel(a.model, authors[0]) || !sameModel(b.model, authors[1])) return false
  // BOTH merger namings are required and must agree: a union that names no
  // mergedBy beside a row that claims one is a fold whose owner the committed
  // artefact does not corroborate (re-review round 3).
  const declaredMerger = String(record?.mergedBy ?? '').trim()
  const unionMerger = Array.isArray(union) ? '' : String(union?.mergedBy ?? '').trim()
  if (!declaredMerger || !unionMerger || !sameModel(declaredMerger, unionMerger)) return false
  if (!validateInputs(a, b).ok) return false
  const result = accountUnion({ a, b, union })
  if (!result.ok) return false
  return summaryLine(result) === String(record?.accounting ?? '').trim()
}

/** Every recorded review. A malformed line is skipped, never fatal — the ledger
 *  outlives the code that writes it, and one bad line must not blind the gate.
 *  A row claiming half authors is STAMPED with whether the repository confirms
 *  the claim (`halfAuthorsVerified`), because the merge gate must never trust
 *  two hand-editable strings to bypass the self-merge fence. */
/** Re-check a recorded AGREEMENT against the transcript it names, where that
 *  transcript still exists. The two model strings in a ledger row are
 *  hand-editable; the transcript is the evidence they quote. A contradiction
 *  DOWNGRADES the row to disagreement, which the gate refuses; a transcript
 *  that has expired keeps the recorded reading — the ledger outlives the
 *  transcripts, and rotting every old review into a refusal would punish age,
 *  not forgery. The remaining gap — a claim naming a transcript that never
 *  existed — is work-order point 880's. */
export function reverifyReviewerAgreement(
  record,
  { check = checkAuthorshipFile, checkResult = checkClaudeResultFile } = {},
) {
  const claim = record?.reviewerAuthorship
  if (!claim || claim.status !== 'agreement') return claim
  if ((!claim.transcript && !claim.resultPath) || claim.artefactAt == null) return claim
  const fresh = claim.proof === 'claude-result'
    ? checkResult({ claimedModel: claim.claimedModel, artefactAt: claim.artefactAt, resultPath: claim.resultPath })
    : check({ claimedModel: claim.claimedModel, artefactAt: claim.artefactAt, transcriptPath: claim.transcript })
  if (fresh.status !== 'disagreement') return claim
  return { ...claim, status: 'disagreement', actualModel: fresh.actualModel, reason: fresh.reason }
}

export function readRecords(path = RECORDS_PATH, { verifyHalves = verifyHalfAuthors, reverifyReviewer = reverifyReviewerAgreement } = {}) {
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
      if (rec && typeof rec.sha === 'string' && /^[0-9a-f]{7,40}$/i.test(rec.sha)) {
        if (Array.isArray(rec.halfAuthors) && rec.halfAuthors.length) {
          rec.halfAuthorsVerified = verifyHalves(rec) === true
        }
        if (rec.reviewerAuthorship) rec.reviewerAuthorship = reverifyReviewer(rec)
        out.push(rec)
      }
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
  // THE HALVES NAME THEIR OWN AUTHORS, and that beats the commit-trailer proxy the
  // merger check falls back to — see buildRecord below for why the proxy is wrong
  // whenever the merging model is also the one that commits the union.
  const halfAuthors = [a.model, b.model].map((m) => String(m ?? '').trim()).filter(Boolean)
  const unionMergedBy = Array.isArray(union) ? '' : String(union?.mergedBy ?? '').trim()
  return { ok: true, summary: summaryLine(result), halfAuthors, unionMergedBy, errors: [] }
}

/**
 * Build the record for `sha`, reading the authoring model from the commit itself.
 * Returns { ok, record, errors } — the caller prints and exits.
 */
export function buildRecord({
  sha = '',
  model = '',
  modelAt = '',
  modelTranscript = '',
  modelResult = '',
  handover = '',
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
  carriedFrom = '',
  now = Date.now(),
  resolve = resolveCommit,
  countUnion = countUnionFiles,
  isTracked = isTrackedInGit,
  committedHalf = committedHalfModel,
  committedUnion = committedOid,
  blobText = committedBlobText,
  hashFile = workingBlobOid,
  fableState,
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
    }).errors.filter((e) => !/--record\b/.test(e))
    return {
      ok: false,
      errors: [`--record <sha>: "${ref}" is not a commit sha (7–40 hex characters)`, ...rest],
    }
  }
  // A CARRY IS ITS OWN FLOW (delta rounds, 18.08.2026): everything but the
  // sha, the pass scope and the point comes verified from the source reading.
  if (String(carriedFrom ?? '').trim()) {
    if (String(modelAt ?? '').trim() || String(modelTranscript ?? '').trim() || String(modelResult ?? '').trim()) {
      return {
        ok: false,
        errors: ['--carried-from copies the source review identity and cannot carry fresh --model-at/--model-transcript/--model-result evidence'],
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
  /** The two blind halves' own authors, when the files were handed over TRACKED. */
  let halfAuthors = []
  /** …and the paths they were read from, so the record says what it trusted. */
  let halfSources = []
  /** …and the COMMITTED blob oids the authors were read from, so a later
   *  reader can re-derive the exact evidence instead of trusting two strings. */
  let halfBlobs = []
  /** The union the count actually read, as a committed blob too: the receipt is
   *  only re-derivable when all three inputs of the fold are content-addressed
   *  (cross-vendor re-review of point 889). */
  let unionSource = ''
  let unionBlob = ''
  // Resolved before the fold proof: the halves and the union are anchored in
  // the REVIEWED commit's tree, which is what the row will claim (re-review
  // round 4 — HEAD anchoring bound the record to whatever tree the recorder
  // happened to stand on).
  const commit = resolve(sha)
  if (missing.length < paths.length) {
    if (missing.length) {
      return { ok: false, errors: [`counting the union needs all three files; missing ${missing.join(' and ')}`] }
    }
    const counted = countUnion({ unionPath, listAPath, listBPath })
    if (!counted.ok) return { ok: false, errors: counted.errors }
    // THE ARTEFACT NAMES THE MERGER, and this command may not out-talk it
    // (re-review round 5): a union with no mergedBy, or one contradicting the
    // flag, used to record fine and only the GATE later refused the row — a
    // "recorded" the ledger would never honor.
    const unionOwner = String(counted.unionMergedBy ?? '').trim()
    if (!unionOwner) {
      return {
        ok: false,
        errors: [
          `the union (${unionPath}) names no "mergedBy" — the committed union must say who folded it, ` +
            'or the row could never be re-derived',
        ],
      }
    }
    if (String(mergedBy ?? '').trim() && !sameModel(mergedBy, unionOwner)) {
      return {
        ok: false,
        errors: [
          `--merged-by "${mergedBy}" contradicts the committed union, which says "${unionOwner}" merged it`,
        ],
      }
    }
    mergedBy = unionOwner
    receipt = counted.summary
    source = 'computed'
    // ONLY FROM TRACKED HALVES, AND ONLY FROM THEIR COMMITTED BYTES: an
    // untracked path is caller-written, and even a tracked one may have been
    // read from a working tree that changed between the count and this check.
    // The authors stored here are re-read from HEAD's blobs and must agree
    // with what the count saw — anything less binds the record to bytes no
    // commit carries. Where that fails the trailer proxy stands.
    // The caller's spellings are canonicalized DELIBERATELY here — the tracked
    // check refuses non-canonical input by contract (re-review round 9). What
    // the conversion accepts is exactly an absolute path inside the checkout
    // and platform separators; a JUNK spelling — dot segments, duplicate
    // separators — refuses instead of being silently repaired, or the erasure
    // would undo the refusal the tracked check owes (round 11).
    const junk = [listAPath, listBPath, unionPath].filter((path) => junkSpelling(path))
    if (junk.length) {
      return {
        ok: false,
        errors: junk.map(
          (path) => `${path} is not a canonical spelling — no dot segments, no duplicate separators; spell the tree path as the repository does`,
        ),
      }
    }
    const canonA = repoRelative(listAPath)
    const canonB = repoRelative(listBPath)
    const untracked = [
      [listAPath, canonA],
      [listBPath, canonB],
    ]
      .filter(([, canon]) => !canon || !isTracked(canon))
      .map(([path]) => path)
    const committed = untracked.length ? [] : [listAPath, listBPath].map((path) => committedHalf(path, { at: commit.sha }))
    const uncommitted = untracked.length ? [] : [listAPath, listBPath].filter((_, i) => !committed[i])
    const contradicted = untracked.length || uncommitted.length
      ? []
      : [listAPath, listBPath].filter((_, i) => !sameModel(committed[i].model, counted.halfAuthors[i]))
    // The union answers to the same standard as the halves: committed, or the
    // receipt cannot be re-derived by anyone later.
    const canonU = repoRelative(unionPath)
    const unionCommitted = canonU && isTracked(canonU) ? committedUnion(unionPath, { at: commit.sha }) : ''
    if (
      counted.halfAuthors?.length === 2 &&
      !untracked.length &&
      !uncommitted.length &&
      !contradicted.length &&
      unionCommitted
    ) {
      halfAuthors = committed.map((c) => c.model)
      // REPO-RELATIVE, whatever the caller typed: an absolute path is only valid
      // in the checkout that recorded it, and the ledger travels (cross-vendor
      // re-review of point 889).
      halfSources = [listAPath, listBPath].map((path) => repoRelative(path))
      halfBlobs = committed.map((c) => c.oid)
      unionSource = repoRelative(unionPath)
      unionBlob = unionCommitted
      // THE WORKING BYTES MUST BE THE BOUND BYTES, file by file (re-review
      // round 8): models, owner and summary can all agree while the findings
      // themselves were edited — the receipt comparison cannot see a reworded
      // defect line. The hash can.
      const divergent = [
        [listAPath, halfBlobs[0]],
        [listBPath, halfBlobs[1]],
        [unionPath, unionBlob],
      ].filter(([path, oid]) => hashFile(path) !== oid)
      if (divergent.length) {
        return {
          ok: false,
          errors: divergent.map(
            ([path, oid]) =>
              `${path} differs from the blob ${String(oid).slice(0, 12)} the row would bind at ` +
              `${commit.sha.slice(0, 7)} — commit what you counted, then record`,
          ),
        }
      }
      // THE RECEIPT COMES FROM THE BYTES THE ROW BINDS (re-review round 6): the
      // count above read the WORKING TREE, and the row names blobs from the
      // reviewed commit — two sets of bytes that can differ while every model
      // field matches, leaving a row verification must refuse. The fold is
      // therefore recomputed from the committed blobs, and a divergence refuses
      // here rather than surfacing as a poisoned row later.
      const committedReceipt = recountFromBlobs([...halfBlobs, unionBlob], blobText)
      if (!committedReceipt.ok) {
        return {
          ok: false,
          errors: [
            `the committed artefacts at ${commit.sha.slice(0, 7)} do not fold to the counted receipt:`,
            ...committedReceipt.errors,
          ],
        }
      }
      if (committedReceipt.summary !== counted.summary) {
        return {
          ok: false,
          errors: [
            'the working tree and the committed artefacts disagree — the count read ' +
              `"${counted.summary}" while the blobs at ${commit.sha.slice(0, 7)} fold to ` +
              `"${committedReceipt.summary}"; commit what you counted, then record`,
          ],
        }
      }
      // THE OWNER TOO, NOT ONLY THE ARITHMETIC (re-review round 7): an edited
      // working-tree mergedBy leaves the summary identical, and the row would
      // then carry an owner the committed union contradicts — exactly the row
      // verification refuses.
      let committedOwner = ''
      try {
        const committedUnionDoc = JSON.parse(blobText(unionBlob) ?? 'null')
        committedOwner = Array.isArray(committedUnionDoc) ? '' : String(committedUnionDoc?.mergedBy ?? '').trim()
      } catch {
        committedOwner = ''
      }
      if (committedOwner !== unionOwner) {
        return {
          ok: false,
          errors: [
            `the working-tree union says "${unionOwner}" merged it while the committed union at ` +
              `${commit.sha.slice(0, 7)} says "${committedOwner}" — commit what you counted, then record`,
          ],
        }
      }
      mergedBy = committedOwner
      receipt = committedReceipt.summary
    } else if (mode === BLIND_PARALLEL) {
      // A FAILED PROOF IS A REFUSAL, NOT A SHRUG (cross-vendor review of point
      // 889). The caller handed over the three files precisely so the halves
      // would decide instead of the commit trailers; when the proof does not
      // come off, falling back to the trailers writes a blind-parallel record
      // whose authorship nobody established — silently, because the diagnostic
      // below only speaks where something else already failed. That is the
      // unknown-authorship path this command exists to refuse.
      const why = []
      if (counted.halfAuthors?.length !== 2) {
        why.push('neither half names its model, so there is no authorship to prove')
      }
      for (const path of untracked) why.push(`${path} is not a tracked, clean repository artefact`)
      for (const path of uncommitted) why.push(`${path} has no committed JSON with a model field`)
      for (const path of contradicted) {
        const i = [listAPath, listBPath].indexOf(path)
        why.push(
          `${path} was counted as "${counted.halfAuthors[i]}" but the committed blob says ` +
            `"${committed[i].model}" — the count read bytes no commit carries`,
        )
      }
      if (!untracked.length && !uncommitted.length && !contradicted.length && !unionCommitted) {
        why.push(`${unionPath} (the union) is not a tracked, clean committed artefact — the receipt could not be re-derived`)
      }
      return {
        ok: false,
        errors: [
          'the halves were handed over but their authorship cannot be proved from the repository, ' +
            'and a blind-parallel record may not fall back to the trailers of the recording commit:',
          ...why,
        ],
      }
    }
  }
  // WHO WROTE THE TWO HALVES, and only failing that, who touched the commit. The
  // trailer proxy reads the union commit's models as the list authors, which holds
  // only while the merging model is a DELEGATE whose output somebody else commits.
  // Where the merger commits its own union — a merge performed by the session
  // itself — the proxy names the merger as an author of the material and refuses
  // the one model the rule actually allows. Measured on the 13.08.2026 stage: the
  // halves are Fable's and Sol's, Claude wrote neither and merged, and no record
  // of that fact could be written. Supplying --union/--list-a/--list-b replaces the
  // proxy with the halves themselves, which are versioned files a reviewer can read.
  const mergeAuthors = halfAuthors.length === 2
    ? halfAuthors
    : [model, ...(commit.authors?.length ? commit.authors : [commit.authoredBy])]
  // This identity grants the second-model permission, so it is evidence-backed
  // wherever the transcript still exists. Expired evidence stays explicit.
  if (String(modelTranscript).trim() && String(modelResult).trim()) {
    return { ok: false, errors: ['pass one reviewer identity source: --model-transcript or --model-result, not both'] }
  }
  const reviewerAuthorship = String(modelResult).trim()
    ? checkClaudeResultFile({ claimedModel: model, artefactAt: modelAt, resultPath: modelResult })
    : checkAuthorshipFile({ claimedModel: model, artefactAt: modelAt, transcriptPath: modelTranscript })
  const handoverChain = handoverChainFor(handover, fableState)
  const merge = resolveMergePolicy({
    mode,
    mergedBy,
    mergeFallback,
    authors: mergeAuthors,
    fableState,
  })
  const check = validateRecord({
    sha: commit.sha,
    model,
    verdict,
    evidence,
    authoredBy: commit.authoredBy,
    commitAt: commit.at,
    at: now,
    // EVERY model named in the trailers, not only the first: two co-authors mean
    // two list authors, and the merger has to be neither (four-eyes, point 634).
    authors: commit.authors,
    // Read off the halves when they were handed over; see mergeAuthors above.
    halfAuthors,
    mode,
    framing,
    authorFraming,
    specExamination,
    mergedBy: merge.mergedBy,
    mergeFallback: merge.mergeFallback,
    accounting: receipt,
    pass,
    passFiles,
    handover,
    handoverChain,
  })
  const errors = [...merge.errors, ...check.errors]
  // A REFUSAL HAS TO SAY WHAT IT READ. Where the halves were not handed over, every
  // identity above was decided from the RECORDING COMMIT's trailers, and that proxy
  // condemns the one case the rule exists for: a fold committed by the third model
  // names that model as an author of the material. Measured 22.08.2026 on this very
  // stage — a valid Fable fold was refused, and the message blamed the merger's
  // identity without ever saying the halves had not been read. The remedy is one
  // flag triple, so the refusal names it rather than leaving it to be rediscovered.
  if (errors.length && mode === BLIND_PARALLEL && halfAuthors.length !== 2) {
    errors.push(
      'the two halves were NOT read for this check: the identities above come from the recording ' +
        "commit's trailers, which name the merger as an author whenever it committed its own union. " +
        'Hand the tracked files over — --union <U.json> --list-a <A> --list-b <B> — and the merger is ' +
        'judged against the halves themselves.',
    )
  }
  if (authorshipRefusesPermission(reviewerAuthorship)) {
    errors.push(
      `the claimed review model "${reviewerAuthorship.claimedModel}" disagrees with transcript message.model ` +
        `"${reviewerAuthorship.actualModel}" at the review artefact timestamp — four-eyes permission is refused`,
    )
  }
  // WHAT THE GATE WILL NOT COMPOSE, THE RECORDER DOES NOT WRITE (cross-vendor
  // review of point 889, pass 3): from VERIFIED_REVIEWER_SINCE an unverified
  // claim only clears for a reviewer no harness transcript can cover. Writing
  // the row anyway would report "recorded" for a review the gate then ignores —
  // silent debt the recording session believes settled.
  if (!authorshipRefusesPermission(reviewerAuthorship)) {
    for (const problem of reviewerVendorProblems(model, reviewerAuthorship)) errors.push(problem)
  }
  if (String(handover).trim() && reviewerAuthorship.status !== 'agreement') {
    errors.push('a fallback review needs verified reviewer identity; the handover cannot rest on an unverified model claim')
  }
  if (Number(commit.at) > 0 && now < Number(commit.at)) {
    errors.push(
      `the review timestamp ${new Date(now).toISOString()} predates the reviewed commit ` +
        `${new Date(commit.at).toISOString()} — a review cannot read code that did not yet exist`,
    )
  }
  // Optional, but never sloppy: a mistyped point number would record a review
  // for a point nobody is closing, and the criticality gate would still block
  // the real one while the ledger LOOKED like it held the answer.
  const wanted = String(point ?? '').trim()
  if (wanted && !/^\d+$/.test(wanted)) {
    errors.push('--point <N>: the work-order point this review settles, as a plain number')
  }
  if (errors.length) return { ok: false, errors }
  const parsedPass = validatePass({ pass, passFiles }).pass
  // The pass stores the immutable end state it actually read. This is redundant
  // with the containing row's sha by design: it distinguishes the new file-
  // scoped record from historical contribution-scoped rows in the ledger.
  const passField = parsedPass ? { ...parsedPass, endState: commit.sha } : null
  return {
    ok: true,
    record: {
      sha: commit.sha,
      subject: commit.subject,
      authoredBy: commit.authoredBy,
      model: String(model).trim(),
      // A missing transcript is a durable UNVERIFIED result, not an omitted
      // check that later readers mistake for trust.
      reviewerAuthorship: {
        status: reviewerAuthorship.status,
        claimedModel: reviewerAuthorship.claimedModel,
        ...(reviewerAuthorship.actualModel ? { actualModel: reviewerAuthorship.actualModel } : {}),
        ...(reviewerAuthorship.servedModel ? { servedModel: reviewerAuthorship.servedModel } : {}),
        ...(reviewerAuthorship.artefactAt != null
          ? { artefactAt: reviewerAuthorship.artefactAt, artefactAtIso: new Date(reviewerAuthorship.artefactAt).toISOString() }
          : {}),
        ...(reviewerAuthorship.messageAt != null
          ? { messageAt: reviewerAuthorship.messageAt, messageAtIso: new Date(reviewerAuthorship.messageAt).toISOString() }
          : {}),
        ...(reviewerAuthorship.messageId ? { messageId: reviewerAuthorship.messageId } : {}),
        ...(reviewerAuthorship.sidechain ? { sidechain: true } : {}),
        ...(reviewerAuthorship.transcript ? { transcript: reviewerAuthorship.transcript } : {}),
        ...(reviewerAuthorship.resultPath ? { resultPath: reviewerAuthorship.resultPath } : {}),
        ...(reviewerAuthorship.proof ? { proof: reviewerAuthorship.proof } : {}),
        ...(reviewerAuthorship.reason ? { reason: reviewerAuthorship.reason } : {}),
      },
      verdict: String(verdict).trim(),
      evidence: String(evidence).trim(),
      // The four-eyes MODE travels with the verdict (point 541). Rows written
      // before this flag existed carry none, and every reader here treats a
      // missing mode as unknown rather than invalid — the ledger is tracked and
      // outlives the CLI that wrote it.
      mode: String(mode).trim(),
      ...(String(handover).trim() ? { handover: String(handover).trim(), handoverChain } : {}),
      ...(String(framing).trim() ? { framing: String(framing).trim() } : {}),
      ...(String(authorFraming).trim() ? { authorFraming: String(authorFraming).trim() } : {}),
      ...(String(specExamination).trim() ? { specExamination: String(specExamination).trim() } : {}),
      // WHO FOLDED THE TWO LISTS (point 634). A blind-parallel record carries it
      // — the merge is the one step where a finding can vanish, so the model
      // that wrote neither list does it and the record NAMES that model. Rows
      // written before this flag carry none, and read as unrecorded.
      ...(merge.mergedBy ? { mergedBy: merge.mergedBy } : {}),
      ...(merge.mergeFallback ? { mergeFallback: merge.mergeFallback } : {}),
      // WHO WROTE THE TWO HALVES, where tracked files said so. Stored because the
      // GATE re-judges this record later and would otherwise fall back to the
      // commit-trailer proxy, which reads the merging model as an author whenever
      // the merger committed its own union — so a merge accepted here would be
      // condemned as a self-merge on the next read (four-eyes finding on this
      // change). The sources travel with it so the claim stays checkable.
      ...(halfAuthors.length === 2 ? { halfAuthors, halfSources, halfBlobs, unionSource, unionBlob } : {}),
      // The count itself, so the ledger holds the receipt and not only the claim
      // — and WHERE it came from: `computed` was measured from the files here,
      // `stated` was typed by whoever ran the merge.
      ...(String(receipt).trim() ? { accounting: String(receipt).trim(), accountingSource: source } : {}),
      // WHICH PASS, WHICH FILES, AND WHICH END STATE (points 714 and 737). Each
      // pass clears the files it read at this sha; untouched files do not return
      // merely because a later commit moved HEAD elsewhere.
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
    execFileSync('git', ['--no-replace-objects', 'merge-base', '--is-ancestor', source.sha, commit.sha], {
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
      !Array.isArray(r.pass.commits) &&
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
  // A CARRY IS WRITTEN ONLY IF THE GATE WILL COMPOSE IT (cross-vendor re-review
  // of point 889): the carried row clears a NEW commit, so it answers to the
  // commit-era reviewer rule. Copying an unverified Anthropic identity forward
  // would report "recorded" for a row the gate then refuses — silent debt. Such
  // a pass is reviewed fresh instead; the identity of the fresh reviewer can be
  // proven, the legacy one's cannot.
  const copiedAuthorship = src.reviewerAuthorship ?? {
    status: 'unverified',
    claimedModel: String(src.model).trim(),
    reason: 'the source review predates transcript-backed authorship records',
  }
  const vendorProblems = reviewerVendorProblems(src.model, copiedAuthorship)
  if (vendorProblems.length) {
    errors.push(
      `--carried-from: the source pass by "${src.model}" cannot be copied onto a new commit — review these files fresh:`,
      ...vendorProblems,
    )
    return { ok: false, errors }
  }
  const copiedEvidence = `CARRIED from ${source.sha.slice(0, 7)} (blobs verified identical): ${String(src.evidence ?? '').trim()}`
  const check = validateRecord({
    sha: commit.sha,
    model: src.model,
    verdict: src.verdict,
    evidence: copiedEvidence,
    authoredBy: commit.authoredBy,
    commitAt: commit.at,
    at: now,
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
      reviewerAuthorship: copiedAuthorship,
      verdict: String(src.verdict).trim(),
      evidence: copiedEvidence,
      mode: String(src.mode).trim(),
      pass: { ...passCheck.pass, endState: commit.sha },
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
          execFileSync('git', ['--no-replace-objects', 'merge-base', '--is-ancestor', from, r.sha], {
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
            !Array.isArray(s.pass?.commits) &&
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
  const candidates = run(['--no-replace-objects', 'rev-parse', `--disambiguate=${ref.toLowerCase()}`])
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
      type = run(['--no-replace-objects', 'cat-file', '-t', candidate])
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
  // EVERY read here is replacement-blind, not only the authorship ones
  // (cross-vendor review, GPT-5.6 Sol at effort high): a replacement can
  // substitute the recorded subject and, worse, the commit TIME — and a forged
  // older timestamp defeats the later "a review cannot predate its commit" check.
  const subject = run(['--no-replace-objects', 'show', '-s', '--format=%s', full])
  // THE COMMIT'S OWN TRAILERS ARE READ THE SAME WAY (cross-vendor review,
  // GPT-5.6 Sol, third do-not-merge). This read decides whether the ancestry rule
  // below runs at all: a replacement object that gives the merge a trailer it
  // does not have makes `own` non-empty, and the real merged tip is then never
  // consulted — a forged author rather than a hidden one.
  const trailers = run([
    '--no-replace-objects',
    'show',
    '-s',
    '--format=%(trailers:key=Co-Authored-By,valueonly,separator=;)',
    full,
  ])
  const committedAt = Number(run(['--no-replace-objects', 'show', '-s', '--format=%ct', full])) * 1000
  const own = modelsFromTrailers(trailers)
  // POINT 784'S RULING, THE RECORDER'S HALF. A landing merge is written by the
  // machinery and carries no trailer of its own; its contribution belongs to the
  // trailer-bearing tip(s) it merged. The GATE resolves it that way, so without
  // the same reading here the two disagreed in the one direction that deadlocks:
  // the gate owed a review the recorder refused to accept, and a merge that
  // contributed a conflict resolution could never be cleared by any route.
  // Structural ancestry only — never the first parent, which the merge did not
  // take in, and never a guess from the subject line. An ordinary trailerless
  // commit stays authorless-unknown, because absence must not become an
  // assignment.
  //
  // THE PARENTS ARE READ RAW, NOT THROUGH `%P` (cross-vendor review, GPT-5.6 Sol
  // at effort high, do-not-merge on the first form). `%P` is GRAFT-AWARE: at a
  // shallow boundary it prints the rewritten ancestry, so a merge can arrive
  // looking single-parented. This code would then have inherited nothing and the
  // merge would read as an ordinary authorless commit — and an author that is
  // merely INVISIBLE is not an author that is absent, so the model that wrote the
  // hidden tip would no longer be excluded from reviewing it. `cat-file -p` shows
  // the commit object's own parent lines, which no graft rewrites.
  // AND `--no-replace-objects`, because `cat-file` HONOURS `refs/replace`
  // (cross-vendor review, GPT-5.6 Sol, second do-not-merge). A replacement
  // object standing in for the merge can name one parent where the real commit
  // names two, which hides the merged tip's author exactly as a shallow graft
  // would. The same flag guards the trailer reads below: a replaced PARENT could
  // otherwise answer with somebody else's trailers.
  // AND ONLY THE HEADER IS READ: the message below the blank line is attacker-
  // shaped text, and a `parent <sha>` line inside it would otherwise inject a
  // parent git never recorded, whose trailers would become this merge's
  // authorship. `commitObjectParents` owns that bound for both gates.
  const rawParents = (sha) => commitObjectParents(run(['--no-replace-objects', 'cat-file', '-p', sha]))
  // AND THE ANCESTRY IS FOLLOWED AS FAR AS IT GOES (cross-vendor review, GPT-5.6
  // Sol at effort high). Resolving ONE level left a merged tip that is itself a
  // trailerless machinery merge with no authors at all — the very case this rule
  // exists for, one step further out — while `authorshipResolver` on the gate
  // side recurses. The two would then disagree again, which is the deadlock this
  // whole repair removed. `seen` bounds it: a commit graph is acyclic, but a
  // repeated parent must not be read twice.
  //
  // AN UNREADABLE PARENT FAILS CLOSED. `run` throws where the object is missing —
  // a shallow clone that HAS the parent line but not the object — and that throw
  // is deliberately not caught: refusing to record beats recording a review whose
  // independence rests on authorship nobody could read.
  const trailersFor = (sha) =>
    modelsFromTrailers(
      run([
        '--no-replace-objects',
        'show',
        '-s',
        '--format=%(trailers:key=Co-Authored-By,valueonly,separator=;)',
        sha,
      ]),
    )
  const seen = new Set([full])
  const inherit = (sha) => {
    const models = trailersFor(sha)
    if (models.length) return models
    const parents = rawParents(sha)
    if (parents.length < 2) return []
    return parents.slice(1).flatMap((parent) => {
      if (seen.has(parent)) return []
      seen.add(parent)
      return inherit(parent)
    })
  }
  const authors = own.length ? own : [...new Set(inherit(full))]
  return {
    sha: full,
    subject,
    at: Number.isFinite(committedAt) ? committedAt : 0,
    authoredBy: own.length ? modelFromTrailers(trailers) : (authors[0] ?? ''),
    authors,
  }
}

/** The one description of what this command takes — printed by both refusals. */
export const usage = () =>
  `usage: node scripts/mechanism-review.mjs --record <sha> --model <name> ` +
  `--verdict <${VERDICTS.join('|')}> --evidence "<one line>" \\\n` +
  `           [--model-at <ISO timestamp> (--model-transcript <session.jsonl> | --model-result <result.json>)] \\\n` +
  `           [--handover <sol-authored|sol-unavailable>] \\\n` +
  `           --mode <${MODES.join('|')}> [--framing "<one line>"] [--point <N>]\n` +
  `           [--author-framing "<one line>" | --spec-examination <sound|amended>]\n` +
  `           [--merged-by "<switch-selected model>"] --accounting "<the blind-merge summary line>" \\\n` +
  `           [--merge-fallback "<switch-generated reason>"]                (blind-parallel)\n` +
  `       node scripts/mechanism-review.mjs --list        (the recorded reviews)\n` +
  `\n--mode names which half of the four-eyes principle this verdict covers ` +
  `(CLAUDE.md §6):\n` +
  `       review          one artefact judged — a diff, an implementation, a measurement\n` +
  `       blind-parallel  a DIVERGENT step (what could go wrong, which cases to test,\n` +
  `                       which designs are possible) where both models worked from the\n` +
  `                       same inputs without seeing each other's result\n` +
  `--framing records how a second blind run by the SAME model was decorrelated, and\n` +
  `       belongs to blind-parallel alone.\n` +
  `--model-at and --model-transcript check that claimed model against message.model\n` +
  `       at the review artefact timestamp. A disagreement refuses permission; a missing\n` +
  `       transcript is recorded as unverified rather than silently trusted.\n` +
  `--author-framing records the hostile-tester stance of a re-authoring commission\n` +
  `       beside the review that followed it. Rounds zero and one have none.\n` +
  `--spec-examination records the one cross-vendor reading before Fable escalation:\n` +
  `       sound when the text survived the findings, amended when the work order changed.\n` +
  `--merged-by names the model that folded the two lists into the union — selected by\n` +
  `       node scripts/fable-switch.mjs --status, and checked when explicitly supplied — the one that\n` +
  `       wrote NEITHER of them, because a merge can lose a finding silently — and the\n` +
  `       COUNT says none did. Hand over the FILES and it is counted here:\n` +
  `       --union <U.json> --list-a <A> --list-b <B>   (preferred; --accounting then\n` +
  `       needs no value). Or run node scripts/blind-merge.mjs first and pass the line\n` +
  `       it prints as --accounting "<summary>".\n` +
  `--pass <k>/<n> --pass-files "<a,b,c>" records ONE bounded end-state file scope, or one\n` +
  `       pass of a range whose material no single review round can hold. The passes cut\n` +
  `       through the FILE SET. A recorded pass clears the files it names at the reviewed\n` +
  `       end state; the rest of the range stays owed. review-sol.mjs prints the plan.\n` +
  `       A path holding a comma, a quote or edge whitespace is written C-QUOTED, exactly\n` +
  `       as git prints it; nothing is ever trimmed into a different path.\n` +
  `       The record stores the reviewed head as the files' end-state sha. A later commit to\n` +
  `       one of those files owes a fresh pass for that file; a commit touching only other\n` +
  `       files leaves this clearance intact.\n` +
  `--carried-from <sha> carries an EARLIER round's pass to this head where every file it\n` +
  `       read is byte-identical there: the recorder verifies the blob identity and the\n` +
  `       source reading, and COPIES its verdict/model/evidence — do not pass them. The\n` +
  `       gates re-verify the blobs on every read; a changed file refuses the carry.\n` +
  `\nWHO REVIEWS (CLAUDE.md §6): the first eligible model in the required chain, never\n` +
  `       an author of the range. Claude authored it → GPT-5.6 Sol at reasoning effort\n` +
  `       high, and when Sol is unavailable or ineligible the first of Fable 5 / Opus 5 /\n` +
  `       Opus 4.8 that wrote no part of it.\n` +
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
        const endState = /^[0-9a-f]{40}$/i.test(String(p?.endState ?? '')) ? String(p.endState).slice(0, 7) : ''
        return shaped
          ? `\n      PARTIAL REVIEW — pass ${index}/${total} over: ${files}${endState ? `\n      end state: ${endState}` : ''}`
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
            `${r.reviewerAuthorship ? `\n      reviewer authorship: ${oneLine(r.reviewerAuthorship.status)}${r.reviewerAuthorship.actualModel ? ` (message.model: ${oneLine(r.reviewerAuthorship.actualModel)})` : ''}` : ''}` +
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

    const fableState = parsed.values.mode === 'blind-parallel' || parsed.values.handover
      ? currentFableState()
      : undefined
    if (fableState && !fableState.ok) throw new Error(fableState.problem)
    const built = buildRecord({ ...parsed.values, fableState })
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
    // A long turn records many verdicts and reaches no Stop hook; each recording
    // carries the board so the page shows this verdict while the next round runs.
    // OPTIONAL bookkeeping, imported lazily and swallowed whole: this command
    // must still run where the board stack is absent — the CLI fixtures build a
    // minimal repo — and a board that cannot follow must never fail the work.
    await import('./board-heartbeat.mjs')
      .then((m) => m.heartbeat({ trigger: m.TRIGGERS.MECHANISM_RECORD, detail: `Prüfung aufgezeichnet: ${built.record.sha.slice(0, 7)} → ${built.record.verdict}` }))
      .catch(() => {})
    process.exit(0)
  } catch (e) {
    console.error(`mechanism-review failed: ${(e && e.message) || e}`)
    process.exit(1)
  }
}
