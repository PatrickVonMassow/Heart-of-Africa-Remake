#!/usr/bin/env node
// THE ONE COMMAND FOR A CROSS-VENDOR FOUR-EYES REVIEW (work-order point 624).
//
//   node scripts/review-sol.mjs --sha <sha> --brief "<what to judge>" \
//        [--mode review|blind-parallel] [--point <N>] [--since <ref>] [--timeout <ms>]
//   node scripts/review-sol.mjs --probe          # is the -m flag honoured at all?
//   node scripts/review-sol.mjs --save-login     # keep the login across a rebuild
//   node scripts/review-sol.mjs --restore-login
//
// It runs the review through `codex exec` non-interactively in a READ-ONLY
// sandbox and prints the verdict and the evidence in the shape
// `mechanism-review.mjs --record` expects. No session types a codex line by
// hand: the model id, the reasoning effort and the sandbox are decisions of the
// rule (CLAUDE.md §6), not of whoever is at the keyboard.
//
// The ARTEFACT TRAVELS WITH THE REQUEST — the diffstat, the patch and the
// current content of every touched file go in on stdin — because this container
// cannot create user namespaces and codex's sandbox launcher therefore kills
// every command the reviewer would run (see formatReviewMaterial).
//
// WHEN SOL IS NOT AVAILABLE the command says so in ONE line, names the cause,
// and hands the review to the first eligible Claude reviewer — and the record it
// prints then carries that model's name with an EMPTY verdict, so nothing can be recorded as reviewed
// that nobody reviewed. The decision logic is pure (review-sol-core.mjs); this
// half does the process work and fails LOUD. It is a command, not a hook.
//
// THE LOGIN (the point's open question, answered here): `codex login` stores its
// tokens in `$CODEX_HOME/auth.json` (default `~/.codex/`), which lives in the
// CONTAINER's home directory and is therefore lost on a container rebuild.
// `--save-login` copies that file into the repository's git-ignored `local/`,
// `--restore-login` puts it back — one command, no device code, and the secret
// never reaches git (`/local/` is in .gitignore, and the file is written 0600).
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, sep as sep_ } from 'node:path'
import { createHash } from 'node:crypto'
import { REPO_ROOT } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { currentSetting, settingProblemLine } from './sol-share.mjs'
import { routeFor } from './sol-share-core.mjs'
import { currentFableState } from './fable-switch.mjs'
import { readRecords, verifyCarried } from './mechanism-review.mjs'
import { mergeProblem, reviewRecordWellFormed, sameModel } from './mechanism-review-core.mjs'
import { authoringClaudeArgs } from './author-fable-core.mjs'
import { parseClaudeAskOutput } from './ask-sol-core.mjs'
import {
  addedFilesAreCoveredByPatch,
  buildReviewPrompt,
  causeTextFor,
  classifyOutcome,
  codexArgs,
  CODEX_BIN,
  coverageDecision,
  decideReview,
  OUTCOME,
  formatReviewReport,
  formatReviewerCommand,
  isUnknownModelRefusal,
  modelsInTrailerField,
  newFilePathsIn,
  parseVerdict,
  probeFreshness,
  PROBE_MAX_AGE_MS,
  REVIEW_TIMEOUT_MS,
  reviewerDescriptor,
  savedAuthPathFrom,
  solAuthored,
  SOL_MODEL_ID,
  SOL_MODEL_NAME,
  SOL_REASONING_EFFORT,
} from './review-sol-core.mjs'
import {
  assembleMaterial,
  formatCoveragePlan,
  formatPassFiles,
  formatPassManifest,
  formatShortfall,
  gitlinkPathsFromRawDiff,
  isBinaryPatchSection,
  joinPatchSections,
  materialShortfall,
  MATERIAL_BUDGET_CHARS,
  MAX_PASS_TOTAL,
  passByIndex,
  planPasses,
  planShortfall,
  patchSectionMap,
  quotePassFile,
  splitPatchByFile,
  undecodablePaths,
  unquoteGitPath,
} from './review-material-core.mjs'
import {
  formatInvalidatedCoverage,
  mechanismLogCommand,
  outstandingFiles,
  parseRangeLog,
  planAuthorshipGroups,
  reviewEndStateFiles,
} from './mechanism-review-range-core.mjs'

/** Where codex keeps the ChatGPT login, and where we park a copy of it. */
export const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex')
export const AUTH_FILE = join(CODEX_HOME, 'auth.json')

/**
 * Where this command keeps its own state: the saved login and the probe receipt.
 * The MAIN checkout's `local/` — never the throwaway worktree's (see the core).
 * `REVIEW_SOL_STATE_DIR` redirects it, which is how the CLI suite exercises the
 * real command without writing into the developer's checkout.
 */
export const STATE_DIR =
  process.env.REVIEW_SOL_STATE_DIR ||
  dirname(
    savedAuthPathFrom(
      spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        windowsHide: true,
      }).stdout ?? '',
      REPO_ROOT,
      { sep: sep_ },
    ),
  )
export const SAVED_AUTH_FILE = join(STATE_DIR, 'codex-auth.json')

/**
 * One git read. `required` reads FAIL LOUD: an ignored exit status would send a
 * reviewer an empty patch and call the silence a review (four-eyes finding,
 * 10.08.2026). The optional reads are the per-file ones, where "not in this
 * commit" is an ordinary answer.
 */
/** Decodes strictly or throws — the lossy default writes U+FFFD and moves on. */
const utf8Strict = new TextDecoder('utf-8', { fatal: true })

function git(args, { required = true, raw = false } = {}) {
  const res = spawnSync('git', args, {
    cwd: REPO_ROOT,
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
  })
  const errText = (res.stderr ?? Buffer.alloc(0)).toString('utf8')
  if (res.status !== 0 || res.error) {
    // AN OPTIONAL READ IS ONLY OPTIONAL ABOUT ABSENCE (round-2 pass 5,
    // narrowed by round-3 pass 7): null means "git itself answered absent",
    // and the answer that counts as absent depends on the QUESTION. A blob
    // read (`show sha:path`) is absent only when git names the PATH as not in
    // that tree — `bad object` there can mean corruption, and skipping the
    // blob would treat an unreadable change as deleted. The quiet queries
    // (rev-parse --verify --quiet, merge-base) answer absence as a bare
    // non-zero exit with nothing on stderr. A crash, a signal or an overflowed
    // buffer never matches either shape (res.error/res.signal), and everything
    // else fails loud, required or not.
    const blobRead = args[0] === 'show'
    const absent =
      !res.error &&
      res.status !== null &&
      (blobRead
        ? /does not exist|exists on disk, but not in/i.test(errText)
        : /does not exist|exists on disk, but not in|bad revision|unknown revision/i.test(errText) ||
          errText.trim() === '')
    if (!required && absent) return null
    throw new Error(`git ${args.join(' ')} failed: ${(errText || res.error?.message || '').trim()}`)
  }
  const out = res.stdout ?? Buffer.alloc(0)
  // `raw` skips the trim for output that IS paths: a legal path may begin or
  // end in whitespace, and trimming the stream eats it off the first and last
  // one (cross-vendor review, third round). It also decodes STRICTLY (round-1
  // pass 5): the lenient default turned invalid UTF-8 into replacement
  // characters, the NUL-only binary check then read the ALTERED text as
  // complete, and a pass could record byte-inexact material as wholly
  // delivered. Bytes this string pipeline cannot carry are refused by name —
  // the caller decides whether that refuses the round (patch, stat, paths) or
  // degrades the one file to a declared binary (blob reads).
  if (raw) {
    try {
      return utf8Strict.decode(out)
    } catch {
      const e = new Error(
        `git ${args.join(' ')} returned bytes that are not valid UTF-8 — ` +
          'this pipeline cannot carry them byte-exact, and a lossy decode must never be recorded as complete',
      )
      e.undecodable = true
      throw e
    }
  }
  // The trimmed path decodes STRICTLY too (round-2 pass 5): authorship
  // trailers read through this branch, and a lossy U+FFFD copy of a trailer
  // could obscure the very model the self-review routing turns on.
  try {
    return utf8Strict.decode(out).trim()
  } catch {
    const e = new Error(
      `git ${args.join(' ')} returned bytes that are not valid UTF-8 — ` +
        'this pipeline cannot carry them byte-exact, and a lossy decode must never be recorded as complete',
    )
    e.undecodable = true
    throw e
  }
}

/**
 * The material one review is given: the diffstat, the patch, and the content of
 * every file the change touched (see formatReviewMaterial for why it is fed
 * rather than fetched).
 *
 * THE CONTENT COMES FROM THE COMMIT, NOT FROM THE WORKING TREE (four-eyes
 * finding, 10.08.2026). Reading the live tree would follow a symlink — a link
 * committed at a harmless name could have posted the saved ChatGPT login to the
 * model — and would also ship whatever uncommitted local material happens to sit
 * in those files. `git show <sha>:<path>` reads the immutable blob instead, so a
 * symlink yields its own target text (a few harmless bytes, and visible as such)
 * and nothing outside the commit can travel at all.
 */
function gatherRange(sha, base, onlyPaths = null) {
  // THE WHOLE RANGE, NOT THE LAST COMMIT (10.08.2026). One record covers every
  // commit it CONTAINS — that is how both gates read the ledger — so a review of
  // a branch head that only saw the head's own diff would clear commits nobody
  // looked at. mergeBase() therefore never hands over an empty base; it refuses.
  // A range DIFF (rather than per-commit patches) is what carries a merge
  // commit's conflict resolution, which `git log --patch` omits.
  const range = `${base}..${sha}`
  // An explicit empty contribution scope is EMPTY, not the absence of a
  // filter. Treating [] like null widens an excluded-only commit back to every
  // path in it and recreates baseline-style debt at the smallest boundary.
  if (Array.isArray(onlyPaths) && onlyPaths.length === 0) {
    return { stat: '', patch: '', files: [], paths: [] }
  }
  // NUL-SEPARATED, because the newline-separated form is QUOTED: a path with a
  // tab, a quote or a high byte in it arrives as `"scripts/x\ty.mjs"`, which no
  // `git show` resolves — the file then reached neither the content list nor a
  // pass, and nothing said so (cross-vendor review, second round). `-z` hands
  // over the raw bytes, and they are kept RAW: trimming a path with edge
  // whitespace makes a different path, one `git show` misses — the real file
  // then travelled in no pass while nothing named the loss (third round).
  const pathspec = Array.isArray(onlyPaths) && onlyPaths.length ? ['--', ...onlyPaths] : []
  const paths = git(['diff', '--name-only', '-z', '--no-renames', range, ...pathspec], { raw: true }).split('\0').filter(Boolean)
  // A PATH NODE'S STRINGS CANNOT CARRY IS REFUSED, NOT COLLAPSED (fourth
  // cross-vendor round; named residual — see unquoteGitPath). Bytes that are
  // not valid UTF-8 decode to U+FFFD here, distinct real paths can then fall
  // together, `git show` misses the real file, and the coverage accounting
  // would clear a file nobody could even name. Refusing loses the round; the
  // alternative loses the record's meaning.
  const unspeakable = undecodablePaths(paths)
  if (unspeakable.length) {
    throw new Error(
      `a changed path in ${range} is not valid UTF-8 and cannot travel through this pipeline byte-exact: ` +
        `${unspeakable.join(', ')} — no record can be offered for this range; rename the file or review it by another means`,
    )
  }
  // The patch travels RAW too (fourth round): trimming it ate a trailing space
  // off a rename destination's last line together with the final newline — a
  // silently different path, with the accounting none the wiser.
  // Binary bytes are absent by design: ordinary Git patch text names the
  // change, while no base85 payload enters the review material. `--no-textconv` because a
  // configured textconv driver replaces file bytes with a transformed
  // representation while avoiding the binary marker — the real blob then
  // reaches no pass while the accounting reports complete delivery (round-1
  // second run, pass 5).
  // `--no-ext-diff` beside it (round-4 pass 7): a configured diff.external or
  // per-path external driver REPLACES git's own patch generation, so a helper
  // emitting plausible `diff --git` sections could deliver transformed or
  // incomplete content the section accounting accepts as the real patch.
  const patch = git(['diff', '--no-textconv', '--no-ext-diff', range, ...pathspec], { raw: true })
  // Binary bodies are a named absence, never a decode attempt. The ordinary
  // patch marker identifies Git's binary section without carrying the bytes.
  const binaryPaths = new Set(
    splitPatchByFile(patch)
      .filter((s) => isBinaryPatchSection(s.text))
      .map((s) => s.path),
  )
  // A submodule pointer is absent by design too. Identity comes from Git's raw
  // entry modes, never from patch content that an ordinary text file can forge.
  const gitlinkPaths = gitlinkPathsFromRawDiff(
    git(['diff', '--raw', '-z', '--no-renames', range, ...pathspec], { raw: true }),
  )
  // A file the patch ADDS whole is already there in full; sending its content
  // again only spends the budget the other files need — but only while the patch
  // itself fits, or the file would fall out of both halves.
  const added = addedFilesAreCoveredByPatch(patch.length) ? newFilePathsIn(patch) : new Set()
  const files = []
  for (const path of [...new Set(paths)]) {
    if (binaryPaths.has(path)) {
      files.push({ path, absentByDesign: 'binary' })
      continue
    }
    if (gitlinkPaths.has(path)) {
      files.push({ path, absentByDesign: 'submodule pointer' })
      continue
    }
    if (added.has(path)) continue
    // RAW, like the patch and the paths (fourth cross-vendor round, pass 4):
    // the default read trims, which strips a body's leading/trailing
    // whitespace and its final newline — and the assembly then recorded that
    // ALTERED string as complete, so byte-inexact delivery passed the
    // accounting. What the commit holds is what travels. A blob whose bytes
    // are not valid UTF-8 cannot travel as text AT ALL (round-1 pass 5): it
    // degrades to a declared binary, exactly like the NUL case below, never
    // to a replacement-character copy recorded as complete.
    let text
    try {
      text = git(['show', `${sha}:${path}`], { required: false, raw: true })
    } catch (e) {
      if (!e?.undecodable) throw e
      files.push({ path, absentByDesign: 'binary' })
      continue
    }
    // Null = the commit does not carry that path (it was deleted); the patch
    // above still shows what happened to it.
    if (text === null) continue
    // A binary whose SECTION carries no marker — a pure rename diffs nothing —
    // still cannot travel as text. NUL in the blob is git's own binary
    // heuristic, and shipping the utf8 read would record mojibake as complete.
    if (text.includes('\0')) {
      files.push({ path, absentByDesign: 'binary' })
      continue
    }
    files.push({ path, text })
  }
  // THE RAW PARTS, NOT THE FORMATTED MATERIAL (point 714). The budget decision,
  // the pass plan and the accounting all need the parts separately; assembling
  // here would leave the caller with a string and no way to tell what it lost.
  return {
    stat: git(['diff', '--stat', range, ...pathspec], { raw: true }),
    patch,
    files,
    paths: [...new Set(paths)],
  }
}

/** Commit/file authorship facts for a range, in the same path semantics as the guard. */
export function gatherAuthorshipCommits(sha, base) {
  const raw = git(mechanismLogCommand(base, sha), { raw: true })
  const commits = parseRangeLog(raw, { decodePath: unquoteGitPath })
  const inRange = new Set(commits.map((commit) => commit.sha))
  return commits.map((commit) => {
    const field = git([
      'show', '-s', '--format=%(trailers:key=Co-Authored-By,valueonly,separator=;)', commit.sha,
    ])
    const authorModels = modelsInTrailerField(field)
    // A main-into-feature merge's second parent is already reachable from the
    // range base, so `base..sha` deliberately omits that parent commit. The
    // merge's cc-only resolution is still a real contribution. Preserve the
    // merged tip's model evidence beside the merge so the pure resolver can
    // attribute it without widening the reviewed range to unrelated main work.
    const parentAuthorModels = Object.fromEntries(
      (commit.parentShas ?? [])
        .slice(1)
        .filter((parent) => !inRange.has(parent))
        .map((parent) => {
          const trailers = git([
            'show', '-s', '--format=%(trailers:key=Co-Authored-By,valueonly,separator=;)', parent,
          ])
          return [parent, modelsInTrailerField(trailers)]
        }),
    )
    return { ...commit, authorModels, authorModel: authorModels[0] ?? '', parentAuthorModels }
  })
}

/** Historical scoped rows on this exact range, with ancestry re-measured from
 *  Git. Only these measured facts may explain why an old reading is reusable or
 *  why a later file state invalidated it. */
export function gatherHistoricalCoverageRecords(sha, base, allRecords = readRecords()) {
  const branchShas = new Set(git(['rev-list', sha, '--not', base]).split(/\r?\n/).filter(Boolean))
  const records = (allRecords ?? []).filter(
    (record) => branchShas.has(String(record?.sha ?? '')) && Array.isArray(record?.pass?.files),
  )
  for (const record of records) {
    record.containedShas = new Set(
      git(['rev-list', record.sha, '--not', base]).split(/\r?\n/).filter(Boolean),
    )
  }
  return verifyCarried(records, allRecords)
}

/**
 * Size every authorship group with the standing material planner, then flatten
 * the result into one recordable pass sequence at the requested head.
 */
export function buildAuthorshipPassPlan({
  sha,
  base,
  commits = gatherAuthorshipCommits(sha, base),
  records = [],
  recordUsable = () => true,
  paths = null,
} = {}) {
  // The net range is authority for materiality. Commit history supplies only
  // authorship: a reverted path is absent, while a path touched eight times is
  // still one current artefact.
  const fullRange = gatherRange(sha, base, paths)
  const authorship = planAuthorshipGroups({ commits, endStateFiles: fullRange.paths })
  const coverage = outstandingFiles({
    commits,
    endStateFiles: fullRange.paths,
    records,
    recordUsable,
  })
  const passes = []
  const uncoverable = []
  let rawSize = 0
  let statTruncated = false
  for (const group of authorship.groups) {
    const range = gatherRange(sha, base, group.files)
    const sized = planPasses({ ...range, budget: MATERIAL_BUDGET_CHARS })
    rawSize += Number(sized.rawSize ?? 0)
    statTruncated ||= Boolean(sized.statTruncated)
    // No eligible vendor can spend these passes honestly. They stay measured
    // and named through `unreviewable`, but never occupy a runnable pass index:
    // one unavailable slice must not prevent reviewers from reading every
    // independent slice beside it.
    if (!group.reviewer) continue
    uncoverable.push(...(sized.uncoverable ?? []).map((item) => ({ ...item, reviewer: group.reviewer })))
    for (const child of sized.passes ?? []) {
      const childFiles = child.files ?? []
      passes.push({
        ...child,
        files: childFiles,
        endState: sha,
        sourceCommits: group.commits.filter((commitSha) => {
          const source = commits.find((commit) => String(commit.sha) === String(commitSha))
          return (source?.files ?? []).some((file) => childFiles.includes(file))
        }),
        authors: group.authors,
        vendor: group.vendor,
        reviewer: group.reviewer,
        reviewerVendor: group.reviewerVendor,
        unreviewableReason: group.unreviewableReason,
        authorshipKind: group.kind,
        rangeBase: base,
        rangeHead: sha,
        sourceRange: range,
      })
    }
  }
  const total = passes.length
  const numbered = passes.map((pass, index) => ({ ...pass, index: index + 1, total }))
  return {
    fits: total === 1 && uncoverable.length === 0 && authorship.unreviewable.length === 0,
    passes: numbered,
    uncoverable,
    rawSize,
    budget: MATERIAL_BUDGET_CHARS,
    statTruncated,
    mixedFiles: authorship.mixedFiles,
    unreviewable: authorship.unreviewable,
    dropped: authorship.dropped,
    superseded: authorship.superseded,
    invalidatedCoverage: coverage.invalidatedCoverage,
  }
}

/**
 * Plan each owed mechanism contribution against its own first-parent boundary.
 * The baseline chooses HOW MANY entries arrive here and nothing else: material
 * size, reviewer routing and pass numbering are all local to the immutable
 * commit. A contribution that fits today therefore stays runnable even when a
 * stale baseline has accumulated millions of unrelated characters around it.
 */
export function buildContributionPassPlan({ commits = [], buildPlan = buildAuthorshipPassPlan } = {}) {
  const contributions = []
  for (const commit of commits ?? []) {
    const sha = String(commit?.sha ?? '')
    const base = String(commit?.parentShas?.[0] ?? '')
    const files = reviewEndStateFiles(commit?.files ?? [])
    if (!sha || !base) {
      contributions.push({
        sha,
        subject: String(commit?.subject ?? ''),
        base,
        files,
        rawSize: null,
        budget: MATERIAL_BUDGET_CHARS,
        statTruncated: false,
        passes: [],
        uncoverable: [],
        unreviewable: [],
        planningError: 'the contribution has no resolvable first-parent boundary',
      })
      continue
    }
    const plan = buildPlan({ sha, base, commits: [commit], paths: files })
    contributions.push({
      ...plan,
      sha,
      subject: String(commit?.subject ?? ''),
      base,
      files,
    })
  }
  return {
    scope: 'contribution',
    contributions,
    passCount: contributions.reduce((sum, entry) => sum + entry.passes.length, 0),
    rawSize: contributions.reduce(
      (sum, entry) => sum + (Number.isFinite(Number(entry.rawSize)) ? Number(entry.rawSize) : 0),
      0,
    ),
    budget: MATERIAL_BUDGET_CHARS,
  }
}

/** The finite, directly runnable plan printed by the mechanism guard status. */
export function formatContributionPassPlan(plan = {}) {
  const entries = Array.isArray(plan?.contributions) ? plan.contributions : []
  const lines = [
    `contribution-scoped plan: ${entries.length} owed contribution(s), ${Number(plan?.passCount ?? 0)} runnable pass(es)`,
  ]
  for (const entry of entries) {
    const label = `${String(entry.sha).slice(0, 7) || '<unknown>'}${entry.subject ? ` ${entry.subject}` : ''}`
    if (entry.planningError) {
      lines.push(`  UNMEASURED ${label} — ${entry.planningError}`)
      continue
    }
    const recordable =
      !entry.statTruncated &&
      !(entry.uncoverable ?? []).length &&
      !(entry.unreviewable ?? []).length &&
      entry.passes.length > 0 &&
      entry.passes.length <= MAX_PASS_TOTAL
    if (recordable) {
      lines.push(`  ${label} — ${entry.passes.length} runnable ${entry.passes.length === 1 ? 'pass' : 'passes'}:`)
      for (const pass of entry.passes) {
        const passFlag = entry.fits ? '' : ` --pass ${pass.index}`
        // The evaluator may owe only a subset of the original contribution
        // (for example, the unaffected files beside a historical refusal).
        // Repeating that measured scope is what makes the printed command
        // reproduce this plan instead of silently widening back to every file
        // the immutable commit touched.
        const fileFlags = (entry.files ?? []).map((file) => ` --file ${shellQuote(file)}`).join('')
        const reviewer = reviewerDescriptor(pass.reviewer)
        lines.push(
          `    node scripts/review-sol.mjs --sha ${entry.sha} --since ${entry.base} ` +
            `${reviewer ? `--reviewer ${reviewer.key} ` : ''}--brief "<what to judge>"${passFlag}${fileFlags}`,
        )
      }
    }
    for (const item of entry.uncoverable ?? []) {
      lines.push(`  UNASSEMBLABLE ${label}: ${quotePassFile(item.path)} — ${item.reason || 'no pass can carry its complete diff'}`)
    }
    if (entry.statTruncated) lines.push(`  UNASSEMBLABLE ${label}: its diffstat exceeds one pass's fixed share`)
    if (entry.passes.length > MAX_PASS_TOTAL) {
      lines.push(`  UNASSEMBLABLE ${label}: ${entry.passes.length} passes exceed the recordable ${MAX_PASS_TOTAL}`)
    }
    for (const group of entry.unreviewable ?? []) {
      lines.push(
        `  UNREVIEWABLE ${label}: ${(group.files ?? []).map(quotePassFile).join(', ')} — ${group.unreviewableReason}`,
      )
    }
  }
  return lines.join('\n')
}

export function formatAuthorshipPlan(plan, { sha = '' } = {}) {
  const lines = [
    `review-sol: the material budget is ${plan.budget} characters per round; ` +
      `this range has ${plan.rawSize} characters of outstanding material.`,
  ]
  if (!plan.passes.length && plan.dropped?.length) {
    lines.push('  No end-state material remains, so no review round is owed.')
  } else if (plan.fits) lines.push('  It fits in one round.')
  else {
    lines.push(
      `  ${String(sha).slice(0, 7) || 'This range'} has ${plan.passes.length} RUNNABLE ` +
        `${plan.passes.length === 1 ? 'PASS' : 'PASSES'} over the END-STATE FILE SET's reviewable material, ` +
        'cut by independent reviewer and then by size:',
    )
  }
  if (plan.mixedFiles?.length) {
    lines.push(`  mixed-vendor end-state files (kept whole, never split by commit): ${plan.mixedFiles.map(quotePassFile).join(', ')}`)
  }
  for (const pass of plan.passes ?? []) {
    const reviewer = reviewerDescriptor(pass.reviewer)
    lines.push(
      `  pass ${pass.index}/${pass.total} → ${pass.reviewer ? `${pass.reviewerVendor} reviewer ${pass.reviewer}` : 'UNREVIEWABLE'}; ` +
        `${pass.size} characters; end state ${String(pass.endState).slice(0, 7)}; ` +
        `files ${pass.files.map(quotePassFile).join(', ')}`,
      `    node scripts/review-sol.mjs --sha ${sha} --since ${pass.rangeBase} ` +
        `${reviewer ? `--reviewer ${reviewer.key} ` : ''}--brief "<what to judge>" --pass ${pass.index}`,
    )
  }
  for (const group of plan.unreviewable ?? []) {
    lines.push(
      `  UNREVIEWABLE: ${group.files.map(quotePassFile).join(', ')} — ${group.unreviewableReason}`,
    )
  }
  const unavailableFiles = [...new Set((plan.unreviewable ?? []).flatMap((group) => group.files ?? []))]
  if (unavailableFiles.length) {
    lines.push('  These files remain owed until Git verifies an explicit unavailable receipt.')
  }
  const invalidated = formatInvalidatedCoverage(plan.invalidatedCoverage, { quoteFile: quotePassFile })
  if (invalidated) lines.push(invalidated)
  for (const item of plan.dropped ?? []) {
    lines.push(`  DROPPED AS NON-MATERIAL: ${quotePassFile(item.file)} — ${item.reason}.`)
  }
  for (const item of plan.superseded ?? []) {
    lines.push(
      `  DROPPED INTERMEDIATE STATES: ${quotePassFile(item.file)} — ${item.commits.length} ` +
        `${item.commits.length === 1 ? 'state was' : 'states were'} superseded within the range; the current file remains once.`,
    )
  }
  lines.push(formatCoveragePlan(plan))
  return lines.join('\n')
}

const shellQuote = (value) => `"${String(value ?? '').replace(/(["\\$`])/g, '\\$1')}"`

export function formatUnavailableReceiptRoute(plan, { sha = '', point = '' } = {}) {
  const files = [...new Set((plan?.unreviewable ?? []).flatMap((group) => group?.files ?? []))]
  if (!files.length) return ''
  if (!/^\d+$/.test(String(point).trim())) {
    return 'review-sol: unavailable files need a point-bound receipt; rerun this plan with --point <N> to print its verified record command.'
  }
  return [
    'review-sol: after every runnable pass is recorded, record only the measured unavailable remainder:',
    '  node scripts/criticality-review-guard.mjs ' +
      `--record-unavailable ${sha} --point ${String(point).trim()} ` +
      `--files ${shellQuote(formatPassFiles(files))} ` +
      `--reason ${shellQuote('no configured reviewer vendor is independent of these measured contributions')}`,
  ].join('\n')
}

/**
 * The material for ONE pass — the pass's own files, their patch sections, and the
 * whole range's diffstat so the reviewer still sees the shape of what it is a
 * part of. `patchOnly` files travel as their complete diff without the
 * surrounding file, which is the only way a bookkeeping file measured in
 * megabytes is reviewable at all (see planPasses).
 */
function assemblePass(range, pass, plan = null) {
  const sections = patchSectionMap(range.patch)
  const files = pass.files
  return assembleMaterial({
    stat: range.stat,
    // THE SAME HELPER THE PLAN MEASURED WITH, so the string sized and the
    // string sent cannot drift apart again (see joinPatchSections).
    patch: joinPatchSections(files, sections),
    files: range.files.filter((f) => files.includes(f.path)),
    budget: MATERIAL_BUDGET_CHARS,
    patchRoom: pass.patchRoom,
    patchOnly: pass.patchOnly,
    // THE PASS STATES ITS OWN SHAPE INSIDE THE MATERIAL (structural finding,
    // fourth cross-vendor round): which pass of how many, which files it
    // carries at which delivery level, and which files are absent BY DESIGN
    // with the pass covering each — absence by design and absence by
    // truncation mean opposite things about the verdict the reviewer may give.
    manifest: plan && !plan.fits ? formatPassManifest(plan, pass) : '',
  })
}

/**
 * The pass plan for a range, or null when it could not be measured.
 *
 * For the paths that spend NO round and still print a record command for the
 * whole range — the share switch at `claude-only`, and a range Sol authored. A
 * measurement that fails is reported as a measurement that failed: `null` yields
 * the `unplanned` refusal, never a silent "it fits".
 */
/**
 * The commit the review's range starts at: where `ref` and `sha` diverged.
 *
 * EVERY answer that is not a PROPER ANCESTOR fails loud (four-eyes findings,
 * rounds two to four): an unknown ref, a ref that is the sha itself or a
 * descendant of it, one on an unrelated history, or no divergence at all. Each
 * of them used to shrink the material to a single commit while the record still
 * cleared every commit below it — the exact "reviewed" state nobody looked at.
 * This function therefore never returns an empty base; it either names the
 * range's start or refuses.
 */
function mergeBase(ref, sha, { explicit = false } = {}) {
  if (git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { required: false }) === null) {
    throw new Error(`--since ${ref}: no such commit in this repository`)
  }
  const base = git(['merge-base', ref, sha], { required: false })
  // THE BASE MUST BE A PROPER ANCESTOR (fourth cross-vendor round). An explicit
  // `--since` naming the sha itself, a descendant, or an unrelated ref yields a
  // base that shows the reviewer less than the record will clear.
  if (base && base !== sha) {
    const isAncestor = spawnSync('git', ['merge-base', '--is-ancestor', base, sha], {
      cwd: REPO_ROOT,
      windowsHide: true,
    })
    if (isAncestor.status !== 0) {
      throw new Error(`--since ${ref}: ${base.slice(0, 7)} is not an ancestor of ${sha.slice(0, 7)}`)
    }
    return base
  }
  if (explicit) {
    throw new Error(
      `--since ${ref} names no range below ${sha.slice(0, 7)}: it is that commit or a descendant of it.\n` +
        '  A record covers every commit it CONTAINS, so the range must start BELOW the reviewed sha\n' +
        `    --since ${sha.slice(0, 7)}~1   (this commit alone)`,
    )
  }
  // NO DIVERGENCE FROM THE DEFAULT REF: the commit is already on `main`, and
  // falling back to its own diff would show the reviewer ONE commit while the
  // record it produces clears every commit below it (third cross-vendor round).
  // The range must then be named, and the operator is told how.
  throw new Error(
    `${sha.slice(0, 7)} does not diverge from ${ref}, so there is no branch range to show.\n` +
      '  A record covers every commit it CONTAINS, so the range must be named:\n' +
      `    --since ${sha.slice(0, 7)}~1   (this commit alone)\n` +
      '    --since <the last reviewed sha>',
  )
}

/**
 * Run codex once and hand back everything the classifier needs.
 *
 * EXPORTED so `scripts/ask-sol.mjs` runs the SAME path rather than a second one of its
 * own (point 654): the sandbox flags, the stdin hand-off, the temp output file and the
 * timeout are decisions this file already got right the hard way, and two copies of them
 * would drift the day one is fixed.
 */
export function runCodex({ prompt, input = '', modelId = SOL_MODEL_ID, timeoutMs = REVIEW_TIMEOUT_MS }) {
  const outFile = join(tmpdir(), `review-sol-${process.pid}-${Date.now()}.txt`)
  const args = codexArgs({ modelId, effort: SOL_REASONING_EFFORT, cwd: REPO_ROOT, outputFile: outFile, prompt })
  const res = spawnSync(CODEX_BIN, args, {
    encoding: 'utf8',
    // codex appends piped stdin to the prompt as a <stdin> block; that is how
    // the artefact reaches a reviewer whose own shell cannot run here.
    input,
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  })
  let last = ''
  try {
    last = readFileSync(outFile, 'utf8')
  } catch {
    /* codex writes the file only on a completed run; stdout still carries it */
  }
  try {
    rmSync(outFile, { force: true })
  } catch {
    /* a leftover temp file is not worth an exit code */
  }
  const timedOut = res.signal === 'SIGTERM' || String(res.error?.code ?? '') === 'ETIMEDOUT'
  return {
    spawnError: res.error ?? null,
    exitCode: res.status ?? 1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    // `timeout` kills with SIGTERM AND sets an ETIMEDOUT error; either half on
    // its own would otherwise read as an ordinary error exit.
    timedOut,
    finalMessage: last || res.stdout || '',
    // WHAT ACTUALLY WENT OUT (point 714). This is the exact argument the spawn
    // received, so comparing against it pins the CALL SITE — a caller that
    // rebuilt, trimmed or swapped the variable fails the sent-differs check.
    // It is NOT a witness of the transport: nothing codex prints echoes its
    // stdin back. What the process layer DOES report travels beside it
    // (escalation round): a child that closes stdin while more material is
    // still being written surfaces as an EPIPE spawn error even at exit 0
    // (measured 18.08.2026), which lands in transportError below and refuses.
    // NAMED RESIDUAL, erring to a wrong GRANT and not closable from here: a
    // material SMALLER than the kernel pipe buffer (~64 KiB) is accepted by
    // the OS in one write, so a child that exits 0 without ever reading it
    // raises nothing — no spawn error, no signal — and a parseable verdict
    // over unread material would pass this layer. spawnSync exposes no
    // read-side evidence that could close it; the admission check in
    // parseVerdict (a reviewer saying it could not see) is the only, partial,
    // mitigation. What the process layer DOES report is still honoured …
    sentInput: input,
    // … and where the spawn layer reported an error, or the run was killed on
    // its budget mid-stream, whether the material arrived is UNKNOWN — the
    // caller hands this to materialShortfall, and unknown refuses the record.
    transportError: res.error
      ? `the spawn layer reported ${String(res.error.code ?? res.error.message ?? 'an error')} before the run completed`
      : timedOut
        ? 'the run was killed on its time budget, mid-stream'
        : '',
  }
}

/** Run one explicitly selected Claude reviewer with no tools, no persistence
 *  and no fallback substitution. Its raw result JSON is retained outside Git
 *  so the recorder can verify the top-level model before granting credit. */
export function runClaudeReviewer({ prompt, input = '', reviewer, timeoutMs = REVIEW_TIMEOUT_MS, spawn = spawnSync } = {}) {
  const args = authoringClaudeArgs({ modelId: reviewer.id, prompt })
  const dangerous = args.indexOf('--dangerously-skip-permissions')
  if (dangerous >= 0) args.splice(dangerous, 1)
  args.push(
    '--permission-mode', 'dontAsk',
    '--tools', '',
    '--safe-mode',
    '--no-session-persistence',
    '--prompt-suggestions', 'false',
    '--effort', reviewer.effort,
  )
  const res = spawn('claude', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    input,
    timeout: timeoutMs,
    maxBuffer: 128 * 1024 * 1024,
  })
  const modelResult = parseClaudeAskOutput(res.stdout, reviewer)
  const timedOut = res.error?.code === 'ETIMEDOUT' || res.signal != null
  const cause = res.error
    ? `Claude could not complete the review: ${res.error.message}`
    : timedOut
      ? 'Claude timed out before the review completed'
      : res.status !== 0
        ? `Claude exited with code ${res.status}: ${String(res.stderr ?? '').trim().split('\n').slice(-1)[0] || 'no detail'}`
        : !modelResult.ok
          ? modelResult.error
          : ''
  let resultPath = ''
  if (!cause) {
    mkdirSync(STATE_DIR, { recursive: true })
    const id = createHash('sha256').update(String(res.stdout)).digest('hex').slice(0, 16)
    resultPath = join(STATE_DIR, `review-claude-${id}.json`)
    writeFileSync(resultPath, res.stdout, { mode: 0o600 })
    chmodSync(resultPath, 0o600)
  }
  return {
    ok: !cause,
    cause,
    finalMessage: modelResult.result,
    modelResult,
    exitCode: res.status,
    timedOut,
    resultPath,
    modelAt: new Date().toISOString(),
    sentInput: input,
    transportError: res.error
      ? `the spawn layer reported ${String(res.error.code ?? res.error.message ?? 'an error')} before the run completed`
      : timedOut
        ? 'the run was killed on its time budget, mid-stream'
        : '',
  }
}

/** The receipt of the last passed model-id probe (see probeFreshness). */
export const PROBE_RECEIPT_FILE = join(STATE_DIR, 'review-sol-probe.json')

/**
 * What the model-id proof is TIED TO: the codex binary, its version and the
 * logged-in account. The receipt survives container rebuilds, so a proof taken
 * with a different one of those says nothing about the run being attributed now
 * (fifth cross-vendor round). Hashed, because the account id is not ours to
 * scatter through a repository's state files.
 */
export function codexFingerprint() {
  const version = spawnSync(CODEX_BIN, ['--version'], { encoding: 'utf8', windowsHide: true }).stdout ?? ''
  const which = spawnSync('sh', ['-c', `command -v ${CODEX_BIN}`], { encoding: 'utf8', windowsHide: true }).stdout ?? ''
  let account = ''
  try {
    account = String(JSON.parse(readFileSync(AUTH_FILE, 'utf8'))?.tokens?.account_id ?? '')
  } catch {
    /* no login yet — the probe will fail on its own and say so */
  }
  return createHash('sha256').update(`${version.trim()}|${which.trim()}|${account}`).digest('hex').slice(0, 16)
}

export function readProbeReceipt() {
  try {
    return JSON.parse(readFileSync(PROBE_RECEIPT_FILE, 'utf8'))
  } catch {
    return null
  }
}

/** `--probe`: prove the -m flag is honoured rather than silently substituted. */
export function probe() {
  const bogus = 'gpt-does-not-exist-9.9'
  const res = runCodex({ prompt: 'Answer with the single word: ok', modelId: bogus, timeoutMs: 120_000 })
  const text = `${res.stderr}\n${res.stdout}`
  const refused = res.exitCode !== 0 && isUnknownModelRefusal(text)
  if (refused) {
    mkdirSync(dirname(PROBE_RECEIPT_FILE), { recursive: true })
    writeFileSync(
      PROBE_RECEIPT_FILE,
      `${JSON.stringify({ at: Date.now(), refused: true, id: bogus, fingerprint: codexFingerprint() })}\n`,
    )
    console.log(
      `review-sol --probe: PASS — the server REFUSED the unknown id "${bogus}", so \`-m\` is honoured\n` +
        `  and a review run with -m ${SOL_MODEL_ID} really is ${SOL_MODEL_NAME}.`,
    )
    return 0
  }
  console.error(
    `review-sol --probe: FAIL — the unknown id "${bogus}" was NOT refused (exit ${res.exitCode}).\n` +
      '  A model id that is silently substituted makes every recorded Sol review worthless:\n' +
      '  the ledger would name Sol for work some other model did. Do not record Sol reviews\n' +
      `  until this passes again.\n  codex said: ${text.trim().split('\n').slice(-3).join(' | ') || '(nothing)'}`,
  )
  return 1
}

/**
 * Is `-m` PROVEN honoured on this machine, proving it now where the receipt is missing
 * or stale? Returns false when the proof could not be obtained.
 *
 * EXPORTED for `scripts/ask-sol.mjs` (point 654): every kind of work attributed to Sol
 * rests on the same proof, since nothing in a run's output names the model that answered.
 * A second implementation of this check would be a second place for it to be skipped.
 */
export function ensureModelProven({ log = console.error, who = 'review-sol' } = {}) {
  const freshness = probeFreshness(readProbeReceipt(), Date.now(), PROBE_MAX_AGE_MS, codexFingerprint())
  if (freshness.fresh) return true
  log(`${who}: ${freshness.warning}\n  proving the model id first …`)
  return probe() === 0
}

/**
 * Does this path — or any directory on the way to it — resolve outside the
 * directory it claims to be in? Returns the refusal sentence, or ''.
 */
function pathEscapes(target) {
  // The NEAREST EXISTING ancestor is what gets resolved (third cross-vendor
  // round): asking only about the parent answered '' whenever the parent did not
  // exist yet, so a not-yet-created directory under a symlinked ancestor passed
  // inspection and was then created somewhere else entirely.
  let existing = dirname(target)
  while (!existsSync(existing)) {
    const up = dirname(existing)
    if (up === existing) return ''
    existing = up
  }
  try {
    const real = realpathSync(existing)
    if (real !== existing) {
      return `${existing} resolves to ${real}; a link on the way would put the token somewhere else`
    }
  } catch {
    return `${existing} cannot be resolved`
  }
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
    return `${target} is a symlink; it would be followed`
  }
  return ''
}

/** `--save-login` / `--restore-login`: the container-rebuild answer. */
function saveLogin() {
  if (!existsSync(AUTH_FILE)) {
    console.error(`review-sol --save-login: no login found at ${AUTH_FILE} — run \`codex login\` first.`)
    return 1
  }
  mkdirSync(dirname(SAVED_AUTH_FILE), { recursive: true })
  // THE DESTINATION IS PROVEN IGNORED BEFORE A SECRET IS WRITTEN TO IT
  // (four-eyes finding, 10.08.2026): `local/` is git-ignored today, and a token
  // written where git can see it is one `git add -A` away from the repository.
  // The same check refuses a destination that is a symlink pointing elsewhere.
  // Asked in the checkout that OWNS the path, not in this one: from a delegated
  // agent's worktree the destination lies in the MAIN checkout, and git answers
  // "outside repository" — a refusal that has nothing to do with ignoring.
  const ignored = spawnSync('git', ['check-ignore', '-q', SAVED_AUTH_FILE], {
    cwd: dirname(STATE_DIR),
    windowsHide: true,
  })
  if (ignored.status !== 0) {
    console.error(
      `review-sol --save-login: REFUSING — git does not ignore ${SAVED_AUTH_FILE}.\n` +
        '  A login token written where git can see it is one `git add -A` away from the repository.',
    )
    return 1
  }
  // …and no component of the path may be a link out of the checkout: a symlinked
  // `local/` passes the LEXICAL check-ignore above and copyFileSync follows it,
  // putting the credential somewhere else entirely (four-eyes finding, second
  // round). realpath answers for the whole path, not just its last component.
  // Both endpoints: a link at the SOURCE reads a token from wherever it points.
  for (const end of [SAVED_AUTH_FILE, AUTH_FILE]) {
    const escape = pathEscapes(end)
    if (escape) {
      console.error(`review-sol --save-login: REFUSING — ${escape}`)
      return 1
    }
  }
  copyFileSync(AUTH_FILE, SAVED_AUTH_FILE)
  chmodSync(SAVED_AUTH_FILE, 0o600)
  console.log(
    `review-sol: login saved to ${SAVED_AUTH_FILE} (git-ignored, 0600).\n` +
      '  After a container rebuild: node scripts/review-sol.mjs --restore-login',
  )
  return 0
}

function restoreLogin() {
  if (!existsSync(SAVED_AUTH_FILE)) {
    console.error(
      `review-sol --restore-login: nothing saved at ${SAVED_AUTH_FILE}.\n` +
        '  Log in once (`codex login`), then `node scripts/review-sol.mjs --save-login`.',
    )
    return 1
  }
  // Both endpoints, for the same reason as on the way out: a link at either end
  // reads the token from — or writes it to — somewhere nobody named.
  for (const end of [SAVED_AUTH_FILE, AUTH_FILE]) {
    const escape = pathEscapes(end)
    if (escape) {
      console.error(`review-sol --restore-login: REFUSING — ${escape}`)
      return 1
    }
  }
  mkdirSync(CODEX_HOME, { recursive: true })
  copyFileSync(SAVED_AUTH_FILE, AUTH_FILE)
  chmodSync(AUTH_FILE, 0o600)
  const age = Math.round((Date.now() - statSync(SAVED_AUTH_FILE).mtimeMs) / 86_400_000)
  console.log(
    `review-sol: login restored to ${AUTH_FILE} (saved ${age} day(s) ago).\n` +
      '  Check it with: codex login status',
  )
  return 0
}

export const usage = () =>
  [
    'usage: node scripts/review-sol.mjs [--reviewer sol|fable|opus|opus48] --sha <sha> --brief "<what to judge>" \\',
    '           [--mode review|blind-parallel] [--point <N>] [--since <ref>] [--timeout <ms>] \\',
    '           [--pass <k>] [--file <current end-state path>]…',
    '       node scripts/review-sol.mjs --probe            (is -m honoured?)',
    '       node scripts/review-sol.mjs --save-login | --restore-login',
    '',
    'The material is the whole range <since>..<sha> (--since defaults to main), because',
    'one record covers every commit it contains.',
    `A round carries at most ${MATERIAL_BUDGET_CHARS} characters. A range beyond that is REFUSED`,
    'and split into PASSES over the END-STATE FILE SET — --pass <k> reviews one of them, and the',
    'record it prints covers that pass alone. Splitting by COMMIT does not help: every',
    'commit ships the current content of the files it touches.',
    'An explicit --since that narrows a fitting range records one scoped 1/1 pass whose',
    'file list and reviewed sha clear exactly the end-state artefacts that round read.',
    '--file narrows only the current end-state material, not its history: reviewer eligibility',
    'still includes every contributor to that path in the full --since range.',
    'Recorded scoped files remain cleared until those files change; later commits touching',
    'only other files leave them clear. No carry record or carry planning flag is needed.',
    'A commit written to answer a recorded finding owes a confirming clean pass only for',
    'the files it changes. The convergence cost is accepted, not hidden.',
    'Files with no independent reviewer stay outside runnable pass indices instead of blocking',
    'them. With --point <N>, the plan prints the Git-verified unavailable-receipt command for',
    'that exact remainder; the receipt never claims that a review occurred.',
    `Reviews run on ${SOL_MODEL_NAME} at reasoning effort ${SOL_REASONING_EFFORT} (CLAUDE.md §6). When it`,
    'cannot be reached the review is HANDED OVER to the first eligible Claude model',
    'allowed by the shared Fable switch (`node scripts/fable-switch.mjs --status`)',
    'that authored no part of the reviewed range — the recorded review always names the',
    'model that ACTUALLY ran, and none of them may review its own work.',
  ].join('\n')

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const flag = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : ''
  }
  const flags = (name) => argv.map((arg, index) => arg === name ? argv[index + 1] : null)
    .filter((value) => value && !value.startsWith('--'))
  try {
    if (argv.includes('--save-login')) process.exit(saveLogin())
    if (argv.includes('--restore-login')) process.exit(restoreLogin())
    if (argv.includes('--probe')) process.exit(probe())

    const sha = flag('--sha')
    const brief = flag('--brief')
    const mode = flag('--mode') || 'review'
    const point = flag('--point')
    const timeoutMs = Number(flag('--timeout')) || REVIEW_TIMEOUT_MS
    const reviewerFlag = flag('--reviewer')
    const selectedFiles = [...new Set(flags('--file'))]
    const requestedReviewer = reviewerFlag ? reviewerDescriptor(reviewerFlag) : null
    if (!sha || !brief) {
      console.error('review-sol: --sha and --brief are both required.\n')
      console.error(usage())
      process.exit(2)
    }
    if (reviewerFlag && !requestedReviewer) {
      console.error('review-sol: --reviewer must be one of sol, fable, opus, opus48.\n')
      console.error(usage())
      process.exit(2)
    }

    // The sha is resolved HERE, before a model is paid for: a review recorded
    // against a commit that does not exist clears no gate.
    const resolved = spawnSync('git', ['rev-parse', `${sha}^{commit}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
    })
    if (resolved.status !== 0) {
      console.error(`review-sol: "${sha}" is not a commit in this repository.`)
      process.exit(2)
    }
    const full = (resolved.stdout ?? '').trim()

    // THE SHARE SWITCH IS ASKED FIRST (point 654). At `claude-only` the operator has
    // moved the load off OpenAI, so no request is sent at all — and the review lands
    // exactly where every unavailable Sol lands: with a Claude reviewer that authored
    // none of the range, and with NO verdict, because nobody has reviewed it yet.
    const share = currentSetting()
    const fableState = currentFableState()
    if (!fableState.ok) throw new Error(fableState.problem)
    // A fallback nobody is told about is a setting nobody chose (cross-vendor review).
    if (share.problem) console.error(settingProblemLine(share, 'review-sol'))
    // THE COVERAGE QUESTION IS ASKED ON EVERY PATH THAT PRINTS A TEMPLATE
    // (escalation round): the early routes hard-coded `partial: null`, so an
    // explicit narrowed `--since` on a fitting range printed a whole-SHA record
    // template although only the narrowed range was measured — bypassing the
    // refusal the normal route makes. The same three lines answer it everywhere.
    const sinceFlag = flag('--since')
    const partialFor = (base) => {
      const coverageBase = sinceFlag ? git(['merge-base', 'main', full], { required: false }) : base
      return coverageDecision({ reviewedBase: base, coverageBase })
    }

    // PARSED BEFORE THE FIRST EXIT (round-2 pass 5): both hand-off routes
    // leave below, and reading --pass after them made a pass-scoped hand-off
    // impossible — `--pass k` was silently ignored, the report covered the
    // whole range, and an oversized range could never hand on one of its
    // passes. One selection serves every route.
    const passFlag = flag('--pass')
    if (argv.includes('--carry-from')) {
      console.error(
        'review-sol: --carry-from is obsolete — recorded pass coverage follows end-state files, so the next ' +
          'plan automatically omits unchanged files and owes only files changed since their recorded state.',
      )
      process.exit(2)
    }
    const passFor = (plan) => {
      if (!passFlag) return { pass: null }
      if (!plan) return { error: `--pass ${passFlag}: the range could not be measured, so no pass can be selected.` }
      if (plan.fits) {
        return {
          error: `--pass ${passFlag} names a pass of a split this range does not need — it fits in one round.`,
        }
      }
      if (plan.passes.length < 2 && !(plan.unreviewable?.length > 0)) {
        return {
          error:
            `--pass ${passFlag}: this range packs into one coverable pass beside files beyond ` +
            'reach, and a split of one cannot be recorded — narrow the range or split the change.',
        }
      }
      // A split past the recorder's ceiling can never be recorded either
      // (landing-round pass 5): every pass of it would be a paid round whose
      // record parsePassSpec refuses.
      if (plan.passes.length > MAX_PASS_TOTAL) {
        return {
          error:
            `--pass ${passFlag}: this range splits into ${plan.passes.length} passes — more than the ` +
            `${MAX_PASS_TOTAL} a record can hold. Narrow the range or split the change.`,
        }
      }
      const pass = passByIndex(plan, passFlag)
      if (!pass) return { error: `--pass ${passFlag}: this range splits into ${plan.passes.length} pass(es).` }
      return { pass }
    }

    const base = mergeBase(sinceFlag || 'main', full, { explicit: Boolean(sinceFlag) })
    const records = gatherHistoricalCoverageRecords(full, base)
    const plan = buildAuthorshipPassPlan({
      sha: full,
      base,
      records,
      paths: selectedFiles.length ? selectedFiles : null,
      recordUsable: (record, commit) => reviewRecordWellFormed(record, { commitAt: commit?.at }) && !mergeProblem(record, commit),
    })
    console.error(formatAuthorshipPlan(plan, { sha: full }))
    const unavailableRoute = formatUnavailableReceiptRoute(plan, { sha: full, point })
    if (unavailableRoute) console.error(unavailableRoute)
    if (plan.passes.length > MAX_PASS_TOTAL) {
      console.error(
        `review-sol: this range needs ${plan.passes.length} passes — more than the ${MAX_PASS_TOTAL} a record can hold.`,
      )
      process.exit(2)
    }
    if (!plan.passes.length && plan.dropped.length && !plan.uncoverable.length) {
      console.error('review-sol: every touched file returned to its base state; no review record is needed.')
      process.exit(0)
    }
    if (!plan.passes.length || plan.uncoverable.length) {
      console.error(
        plan.unreviewable.length && !plan.uncoverable.length
          ? 'review-sol: no runnable review pass remains; use the verified unavailable receipt route above.'
          : 'review-sol: the authorship plan cannot cover every changed file; no record is offered.',
      )
      process.exit(4)
    }
    const selection = passFor(plan)
    if (selection.error) {
      console.error(`review-sol: ${selection.error}`)
      process.exit(2)
    }
    const selected = plan.fits ? plan.passes[0] : selection.pass
    // A FITTING BUT NARROWED RANGE IS ONE SCOPED PASS. Its file list and record
    // sha are the exact end-state boundary the old pass-less row could not express.
    // A full branch-range review stays pass-less for ledger compatibility.
    const pass = plan.fits ? (selectedFiles.length || partialFor(base) ? selected : null) : selected
    const rangeAuthors = selected
      ? selected.authors
      : [...new Set(plan.passes.flatMap((candidate) => candidate.authors ?? []))]
    if (!selected) {
      console.error('review-sol: REFUSING to spend a round on the whole range — run one of the authored passes above.')
      process.exit(4)
    }
    const commandFor = (decision) => formatReviewerCommand({
      model: decision?.model,
      sha: full,
      brief,
      mode,
      point,
      since: sinceFlag,
      timeout: flag('--timeout'),
      pass: passFlag,
      files: selectedFiles,
    })

    let targetReviewer = requestedReviewer ?? reviewerDescriptor(SOL_MODEL_NAME)
    let handover = ''
    if (requestedReviewer?.runtime === 'claude') {
      handover = solAuthored(rangeAuthors) ? 'sol-authored' : 'sol-unavailable'
      const routed = decideReview({
        outcome: {
          ok: false,
          kind: handover === 'sol-authored' ? OUTCOME.SELF_REVIEW : OUTCOME.UNREACHABLE,
          cause: handover === 'sol-authored' ? causeTextFor(OUTCOME.SELF_REVIEW) : 'the preferred reader was unavailable',
        },
        parsed: { ok: false },
        authorModel: rangeAuthors,
        fableState,
      })
      if (!routed.model || !sameModel(routed.model, requestedReviewer.name)) {
        console.error(
          `review-sol: --reviewer ${requestedReviewer.key} is not this range's first eligible handover; ` +
            `the route names ${routed.model || 'nobody'}.`,
        )
        process.exit(2)
      }
    } else if (requestedReviewer && solAuthored(rangeAuthors)) {
      console.error(`review-sol: ${SOL_MODEL_NAME} authored part of this range and may not review it.`)
      process.exit(2)
    }

    if (!requestedReviewer && routeFor('review', share.setting) !== 'sol') {
      const decision = decideReview({
        outcome: { ok: false, kind: OUTCOME.SWITCHED_OFF, cause: causeTextFor(OUTCOME.SWITCHED_OFF) },
        parsed: { ok: false },
        authorModel: rangeAuthors,
        fableState,
      })
      // THE FIT IS MEASURED ON THIS PATH TOO (cross-vendor review, second
      // round). No round is spent here, but the record command printed for the
      // hand-over covers the WHOLE range — and printing that template while
      // nobody has measured whether the range is reviewable in one round is the
      // assumption this point removes. The measurement costs git, not an
      // allowance.
      console.log(
        formatReviewReport({
          decision,
          sha: full,
          mode,
          point,
          partial: pass || !plan.fits ? null : partialFor(base),
          // A SELECTED PASS is measured by the plan to fit one round, so its
          // hand-over template prints pass-scoped — exactly as a fitting range
          // prints its whole-range template; the whole-range shortfall would
          // suppress the very record the pass split exists to make possible.
          shortfall: pass ? null : planShortfall(plan),
          plan,
          pass,
          reviewerCommand: commandFor(decision),
        }),
      )
      process.exit(3)
    }

    // WHO WROTE IT DECIDES WHO MAY JUDGE IT, and that is asked BEFORE a codex
    // call is paid for (point 667). Sol AUTHORS now, and a review it may not
    // give is not worth an allowance: a Sol-authored range goes straight to the
    // Claude reviewer that also runs the suites, judges the picture and lands.
    if (!requestedReviewer && solAuthored(rangeAuthors)) {
      const decision = decideReview({
        outcome: { ok: false, kind: OUTCOME.SELF_REVIEW, cause: causeTextFor(OUTCOME.SELF_REVIEW) },
        parsed: { ok: false },
        authorModel: rangeAuthors,
        fableState,
      })
      // Same measurement, same reason: the role swap hands the WHOLE range on,
      // and a range no single round can hold must be handed on as its passes.
      console.log(
        formatReviewReport({
          decision,
          sha: full,
          mode,
          point,
          partial: pass || !plan.fits ? null : partialFor(base),
          shortfall: pass ? null : planShortfall(plan),
          plan,
          pass,
          reviewerCommand: commandFor(decision),
        }),
      )
      process.exit(3)
    }

    console.error(
      `review-sol: asking ${targetReviewer.name} (effort ${targetReviewer.effort}) to review ${full.slice(0, 7)} …`,
    )
    // THE IDENTITY IS PROVEN BEFORE THE REVIEW, NOT MENTIONED AFTER IT (second
    // cross-vendor round). Nothing in a run's output names the model that
    // answered, so the whole attribution rests on the server refusing an unknown
    // id. A note under the record was too weak: the record command naming Sol
    // was printed either way. The probe therefore RUNS when its receipt is
    // missing or stale, and a failed probe stops the review before a word of it
    // can be attributed to a model that may not have written it.
    if (targetReviewer.runtime === 'codex' && !ensureModelProven()) {
      console.error('review-sol: the model id is not proven honoured — refusing to attribute a review to it.')
      process.exit(2)
    }

    // A narrowed one-round review records its explicit end-state file scope above;
    // a pass-less record still requires whole-branch coverage. FAILING TO
    // ANSWER IS NOT AN ANSWER OF "FULL COVERAGE" (fourth round): a sha with no
    // merge base against `main` used to leave this empty, which switched the
    // check off and printed a record for a range nobody bounded.
    const partial = pass ? null : partialFor(base)
    const range = selected.sourceRange
    const assembly = assemblePass(range, selected, plan)
    // THE ASSEMBLY IS THE AUTHORITY, THE PLAN ONLY ADVISORY. Where the two
    // disagree the round is not spent: a review whose record will be refused
    // afterwards costs an allowance and answers nothing.
    if (!assembly.fit) {
      console.error(formatShortfall(materialShortfall({ assembly, sent: assembly.text }), { sha: full, plan }))
      process.exit(4)
    }
    console.error(
      `  material: ${assembly.size} characters of diff and file content ` +
        `(${base.slice(0, 7)}..${full.slice(0, 7)}${pass ? `, pass ${pass.index}/${pass.total}` : ''})`,
    )
    const request = {
      prompt: buildReviewPrompt({ sha: full, brief, mode, pass, receipt: assembly.receipt }),
      input: assembly.text,
      timeoutMs,
    }
    const run = targetReviewer.runtime === 'codex'
      ? runCodex(request)
      : runClaudeReviewer({ ...request, reviewer: targetReviewer })
    const outcome = targetReviewer.runtime === 'codex' ? classifyOutcome(run) : run
    // The RECEIPT is demanded back (finding 8): the token stands only on the
    // material's last line, so an answer that cannot repeat it is a run whose
    // material is not proven read — no verdict, and therefore no record.
    const parsed = outcome.ok ? parseVerdict(run.finalMessage, { receipt: assembly.receipt }) : { ok: false }
    // DID THIS ROUND CARRY WHAT IT CLAIMS TO HAVE JUDGED? Asked of the accounting
    // and of the string that actually went to codex — never of the material's own
    // text, which a reviewed source file can carry the truncation marker in — and
    // of the process layer's own report: a hand-off that died mid-transmit is an
    // UNKNOWN coverage, and unknown refuses. Asked BEFORE the decision, because
    // `ready` rests on this answer (escalation round): a clean exit with a
    // parseable verdict is not delivery evidence.
    const shortfall = materialShortfall({ assembly, sent: run.sentInput, transportError: run.transportError })
    // WHO AUTHORED IT decides who may review it if Sol is unavailable: no model
    // can review its own commit (see fallbackReviewerFor), and the record
    // covers the whole range, so every author in it counts.
    const decision = targetReviewer.runtime === 'codex'
      ? decideReview({ outcome, parsed, authorModel: rangeAuthors, shortfall, fableState })
      : outcome.ok && parsed.ok
        ? {
            model: targetReviewer.name,
            ranBy: targetReviewer.name,
            verdict: parsed.verdict,
            evidence: parsed.evidence,
            fellBack: false,
            ready: shortfall === null,
            kind: OUTCOME.OK,
            cause: '',
          }
        : {
            model: targetReviewer.name,
            ranBy: '',
            verdict: '',
            evidence: '',
            fellBack: true,
            ready: false,
            kind: outcome.ok ? OUTCOME.NO_VERDICT : OUTCOME.ERROR_EXIT,
            cause: outcome.ok ? parsed.error : outcome.cause,
          }
    // THE FINDINGS ARE THE POINT, not the verdict word: a `do-not-merge` whose
    // reasons were never printed cannot be acted on, and the evidence line the
    // ledger carries is one sentence by design. So the reviewer's whole answer
    // is printed above the record command.
    const said = String(run.finalMessage ?? '').trim()
    if (said) {
      console.log(`--- ${targetReviewer.name} said ---\n${said}\n--- end of review ---\n`)
    }
    if (targetReviewer.runtime === 'claude' && decision.fellBack) {
      console.log(
        `review-sol: ${targetReviewer.name} did not deliver a recordable review of ${full.slice(0, 7)}: ` +
          `${decision.cause || 'no usable verdict'}.\n  The review is NOT done; no record command is printed.`,
      )
      process.exit(3)
    }
    console.log(formatReviewReport({
      decision,
      sha: full,
      mode,
      point,
      partial,
      shortfall,
      plan,
      pass,
      modelAt: run.modelAt,
      modelResult: run.resultPath,
      handover,
      reviewerCommand: commandFor(decision),
    }))
    // Round N goes on the board while round N+1 runs: fifteen rounds in one turn
    // used to leave the page standing on finished work for hours.
    // OPTIONAL bookkeeping, imported lazily and swallowed whole: this command
    // must still run where the board stack is absent — the CLI fixtures build a
    // minimal repo — and a board that cannot follow must never fail the work.
    await import('./board-heartbeat.mjs')
      .then((m) => m.heartbeat({ trigger: m.TRIGGERS.REVIEW_ROUND, detail: `Prüfrunde zu ${full.slice(0, 7)} beantwortet: ${decision.verdict || 'ohne Urteil'}` }))
      .catch(() => {})
    // A fallback is not an error of THIS command — it did its job by refusing to
    // invent a review — but it must not read as a finished one either, so the
    // exit code distinguishes them for any script that chains on it. A short-fall
    // is the same shape of answer: a verdict was given, no record may rest on it.
    process.exit(decision.fellBack || shortfall ? 3 : 0)
  } catch (e) {
    console.error(`review-sol failed: ${(e && e.message) || e}`)
    process.exit(1)
  }
}
