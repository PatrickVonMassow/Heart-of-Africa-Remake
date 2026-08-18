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
// and hands the review to Fable 5 — and the record it prints then carries
// Fable's name with an EMPTY verdict, so nothing can be recorded as reviewed
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
  FALLBACK_CHAIN,
  formatReviewReport,
  isUnknownModelRefusal,
  modelsInTrailerField,
  newFilePathsIn,
  parseVerdict,
  probeFreshness,
  PROBE_MAX_AGE_MS,
  REVIEW_TIMEOUT_MS,
  savedAuthPathFrom,
  solAuthored,
  SOL_MODEL_ID,
  SOL_MODEL_NAME,
  SOL_REASONING_EFFORT,
} from './review-sol-core.mjs'
import {
  assembleMaterial,
  formatBudgetNotice,
  formatPassManifest,
  formatShortfall,
  isBinaryPatchSection,
  joinPatchSections,
  materialShortfall,
  MATERIAL_BUDGET_CHARS,
  passByIndex,
  planPasses,
  planShortfall,
  splitPatchByFile,
  undecodablePaths,
} from './review-material-core.mjs'

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
function git(args, { required = true, raw = false } = {}) {
  const res = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
  })
  if (res.status !== 0 || res.error) {
    if (!required) return null
    throw new Error(`git ${args.join(' ')} failed: ${(res.stderr || res.error?.message || '').trim()}`)
  }
  // `raw` skips the trim for output that IS paths: a legal path may begin or
  // end in whitespace, and trimming the stream eats it off the first and last
  // one (cross-vendor review, third round).
  return raw ? (res.stdout ?? '') : (res.stdout ?? '').trim()
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
function gatherRange(sha, base) {
  // THE WHOLE RANGE, NOT THE LAST COMMIT (10.08.2026). One record covers every
  // commit it CONTAINS — that is how both gates read the ledger — so a review of
  // a branch head that only saw the head's own diff would clear commits nobody
  // looked at. mergeBase() therefore never hands over an empty base; it refuses.
  // A range DIFF (rather than per-commit patches) is what carries a merge
  // commit's conflict resolution, which `git log --patch` omits.
  const range = `${base}..${sha}`
  // NUL-SEPARATED, because the newline-separated form is QUOTED: a path with a
  // tab, a quote or a high byte in it arrives as `"scripts/x\ty.mjs"`, which no
  // `git show` resolves — the file then reached neither the content list nor a
  // pass, and nothing said so (cross-vendor review, second round). `-z` hands
  // over the raw bytes, and they are kept RAW: trimming a path with edge
  // whitespace makes a different path, one `git show` misses — the real file
  // then travelled in no pass while nothing named the loss (third round).
  const paths = git(['diff', '--name-only', '-z', range], { raw: true }).split('\0').filter(Boolean)
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
  const patch = git(['diff', range], { raw: true })
  // A BINARY FILE'S BYTES CANNOT TRAVEL AS REVIEW TEXT (fourth cross-vendor
  // round, pass 4, finding 7). An ADDED binary was skipped as "covered by the
  // patch" while the ordinary diff carries only `Binary files … differ` — the
  // blob never travelled and nothing recorded the loss; a MODIFIED one came
  // back through the utf8 read as mojibake recorded complete. Binary paths are
  // read off the patch's own sections and travel DECLARED (assembleMaterial
  // writes the marker the reviewer sees and the accounting carries).
  const binaryPaths = new Set(
    splitPatchByFile(patch)
      .filter((s) => isBinaryPatchSection(s.text))
      .map((s) => s.path),
  )
  // A file the patch ADDS whole is already there in full; sending its content
  // again only spends the budget the other files need — but only while the patch
  // itself fits, or the file would fall out of both halves.
  const added = addedFilesAreCoveredByPatch(patch.length) ? newFilePathsIn(patch) : new Set()
  const files = []
  for (const path of [...new Set(paths)]) {
    if (binaryPaths.has(path)) {
      files.push({ path, binary: true })
      continue
    }
    if (added.has(path)) continue
    // RAW, like the patch and the paths (fourth cross-vendor round, pass 4):
    // the default read trims, which strips a body's leading/trailing
    // whitespace and its final newline — and the assembly then recorded that
    // ALTERED string as complete, so byte-inexact delivery passed the
    // accounting. What the commit holds is what travels.
    const text = git(['show', `${sha}:${path}`], { required: false, raw: true })
    // Null = the commit does not carry that path (it was deleted); the patch
    // above still shows what happened to it.
    if (text === null) continue
    // A binary whose SECTION carries no marker — a pure rename diffs nothing —
    // still cannot travel as text. NUL in the blob is git's own binary
    // heuristic, and shipping the utf8 read would record mojibake as complete.
    if (text.includes('\0')) {
      files.push({ path, binary: true })
      continue
    }
    files.push({ path, text })
  }
  // THE RAW PARTS, NOT THE FORMATTED MATERIAL (point 714). The budget decision,
  // the pass plan and the accounting all need the parts separately; assembling
  // here would leave the caller with a string and no way to tell what it lost.
  return { stat: git(['diff', '--stat', range], { raw: true }), patch, files }
}

/**
 * The material for ONE pass — the pass's own files, their patch sections, and the
 * whole range's diffstat so the reviewer still sees the shape of what it is a
 * part of. `patchOnly` files travel as their complete diff without the
 * surrounding file, which is the only way a bookkeeping file measured in
 * megabytes is reviewable at all (see planPasses).
 */
function assemblePass(range, pass, plan = null) {
  const sections = new Map(splitPatchByFile(range.patch).map((s) => [s.path, s.text]))
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
function measureRange(sha, base) {
  try {
    return planPasses({ ...gatherRange(sha, base), budget: MATERIAL_BUDGET_CHARS })
  } catch (e) {
    console.error(`review-sol: the range could not be measured against the budget: ${(e && e.message) || e}`)
    return null
  }
}

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

/** Every model that authored a commit in the reviewed range. */
function authorsIn(sha, base) {
  const field = '%(trailers:key=Co-Authored-By,valueonly,separator=;)'
  const log = git(['log', `--format=${field}`, `${base}..${sha}`])
  // EVERY model on each line, not just its first: a commit naming two would
  // otherwise hide one, and the chain could hand the review to an author.
  return String(log).split('\n').flatMap((line) => modelsInTrailerField(line))
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
    'usage: node scripts/review-sol.mjs --sha <sha> --brief "<what to judge>" \\',
    '           [--mode review|blind-parallel] [--point <N>] [--since <ref>] [--timeout <ms>] \\',
    '           [--pass <k>]',
    '       node scripts/review-sol.mjs --probe            (is -m honoured?)',
    '       node scripts/review-sol.mjs --save-login | --restore-login',
    '',
    'The material is the whole range <since>..<sha> (--since defaults to main), because',
    'one record covers every commit it contains.',
    `A round carries at most ${MATERIAL_BUDGET_CHARS} characters. A range beyond that is REFUSED`,
    'and split into PASSES over the FILE SET — --pass <k> reviews one of them, and the',
    'record it prints covers that pass alone. Splitting by COMMIT does not help: every',
    'commit ships the current content of the files it touches.',
    `Reviews run on ${SOL_MODEL_NAME} at reasoning effort ${SOL_REASONING_EFFORT} (CLAUDE.md §6). When it`,
    `cannot be reached the review is HANDED OVER to the first model of ${FALLBACK_CHAIN.join(' → ')}`,
    'that authored no part of the reviewed range — the recorded review always names the',
    'model that ACTUALLY ran, and none of them may review its own work.',
  ].join('\n')

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  const flag = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : ''
  }
  try {
    if (argv.includes('--save-login')) process.exit(saveLogin())
    if (argv.includes('--restore-login')) process.exit(restoreLogin())
    if (argv.includes('--probe')) process.exit(probe())

    const sha = flag('--sha')
    const brief = flag('--brief')
    const mode = flag('--mode') || 'review'
    const point = flag('--point')
    const timeoutMs = Number(flag('--timeout')) || REVIEW_TIMEOUT_MS
    if (!sha || !brief) {
      console.error('review-sol: --sha and --brief are both required.\n')
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

    if (routeFor('review', share.setting) !== 'sol') {
      const base = mergeBase(sinceFlag || 'main', full, { explicit: Boolean(sinceFlag) })
      const decision = decideReview({
        outcome: { ok: false, kind: OUTCOME.SWITCHED_OFF, cause: causeTextFor(OUTCOME.SWITCHED_OFF) },
        parsed: { ok: false },
        authorModel: authorsIn(full, base),
      })
      // THE FIT IS MEASURED ON THIS PATH TOO (cross-vendor review, second
      // round). No round is spent here, but the record command printed for the
      // hand-over covers the WHOLE range — and printing that template while
      // nobody has measured whether the range is reviewable in one round is the
      // assumption this point removes. The measurement costs git, not an
      // allowance.
      const handOverPlan = measureRange(full, base)
      console.log(
        formatReviewReport({
          decision,
          sha: full,
          mode,
          point,
          partial: partialFor(base),
          shortfall: planShortfall(handOverPlan),
          plan: handOverPlan,
        }),
      )
      process.exit(3)
    }

    // WHO WROTE IT DECIDES WHO MAY JUDGE IT, and that is asked BEFORE a codex
    // call is paid for (point 667). Sol AUTHORS now, and a review it may not
    // give is not worth an allowance: a Sol-authored range goes straight to the
    // Claude reviewer that also runs the suites, judges the picture and lands.
    const base = mergeBase(sinceFlag || 'main', full, { explicit: Boolean(sinceFlag) })
    const rangeAuthors = authorsIn(full, base)
    if (solAuthored(rangeAuthors)) {
      const decision = decideReview({
        outcome: { ok: false, kind: OUTCOME.SELF_REVIEW, cause: causeTextFor(OUTCOME.SELF_REVIEW) },
        parsed: { ok: false },
        authorModel: rangeAuthors,
      })
      // Same measurement, same reason: the role swap hands the WHOLE range on,
      // and a range no single round can hold must be handed on as its passes.
      const swapPlan = measureRange(full, base)
      console.log(
        formatReviewReport({
          decision,
          sha: full,
          mode,
          point,
          partial: partialFor(base),
          shortfall: planShortfall(swapPlan),
          plan: swapPlan,
        }),
      )
      process.exit(3)
    }

    console.error(
      `review-sol: asking ${SOL_MODEL_NAME} (effort ${SOL_REASONING_EFFORT}) to review ${full.slice(0, 7)} …`,
    )
    // THE IDENTITY IS PROVEN BEFORE THE REVIEW, NOT MENTIONED AFTER IT (second
    // cross-vendor round). Nothing in a run's output names the model that
    // answered, so the whole attribution rests on the server refusing an unknown
    // id. A note under the record was too weak: the record command naming Sol
    // was printed either way. The probe therefore RUNS when its receipt is
    // missing or stale, and a failed probe stops the review before a word of it
    // can be attributed to a model that may not have written it.
    if (!ensureModelProven()) {
      console.error('review-sol: the model id is not proven honoured — refusing to attribute a review to it.')
      process.exit(2)
    }

    // What a record at this sha would CLEAR: everything back to where the branch
    // left `main`. A narrower review is allowed, but it may not be recorded.
    // FAILING TO ANSWER IS NOT AN ANSWER OF "FULL COVERAGE" (fourth round): a
    // sha with no merge base against `main` used to leave this empty, which
    // switched the check OFF and printed a record for a range nobody bounded.
    // The decision itself is pure and tested (coverageDecision).
    const partial = partialFor(base)

    // THE THRESHOLD IS NAMED BEFORE THE ROUND IS SPENT (point 714). A caller who
    // learns of the overflow from the verdict has already paid for a review that
    // covers less than it looks like it does; a caller who learns of it here can
    // split the review instead.
    const range = gatherRange(full, base)
    const plan = planPasses({ ...range, budget: MATERIAL_BUDGET_CHARS })
    console.error(formatBudgetNotice(plan, { sha: full }))

    const passFlag = flag('--pass')
    let pass = null
    let assembly
    if (plan.fits) {
      if (passFlag) {
        console.error(
          `review-sol: --pass ${passFlag} names a pass of a split this range does not need — it fits in one round.`,
        )
        process.exit(2)
      }
      // The single pass the plan produced, so the patch gets the room the plan
      // costed it: the standing half-share would cut a diff-heavy range the plan
      // called complete, and the round would be paid for before anyone noticed.
      assembly = plan.passes.length === 1
        ? assemblePass(range, plan.passes[0])
        : assembleMaterial({ ...range, budget: MATERIAL_BUDGET_CHARS })
    } else {
      // A ROUND OVER MATERIAL THAT CANNOT FIT IS A ROUND SPENT ON A RECORD THAT
      // WILL BE REFUSED. The plan above says how to split it, so the run stops
      // here rather than paying for a verdict nothing may rest on.
      if (!passFlag) {
        console.error(
          'review-sol: REFUSING to spend a round on a range that cannot fit one — run the passes above.',
        )
        process.exit(4)
      }
      pass = passByIndex(plan, passFlag)
      if (!pass) {
        console.error(`review-sol: --pass ${passFlag}: this range splits into ${plan.passes.length} pass(es).`)
        process.exit(2)
      }
      assembly = assemblePass(range, pass, plan)
    }
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
    const run = runCodex({
      prompt: buildReviewPrompt({ sha: full, brief, mode, pass, receipt: assembly.receipt }),
      input: assembly.text,
      timeoutMs,
    })
    const outcome = classifyOutcome(run)
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
    // WHO AUTHORED IT decides who may review it if Sol is unavailable: Fable
    // cannot review its own commit (see fallbackReviewerFor), and the record
    // covers the whole range, so every author in it counts.
    const decision = decideReview({ outcome, parsed, authorModel: rangeAuthors, shortfall })
    // THE FINDINGS ARE THE POINT, not the verdict word: a `do-not-merge` whose
    // reasons were never printed cannot be acted on, and the evidence line the
    // ledger carries is one sentence by design. So the reviewer's whole answer
    // is printed above the record command.
    const said = String(run.finalMessage ?? '').trim()
    if (said) {
      console.log(`--- ${SOL_MODEL_NAME} said ---\n${said}\n--- end of review ---\n`)
    }
    console.log(formatReviewReport({ decision, sha: full, mode, point, partial, shortfall, plan, pass }))
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
