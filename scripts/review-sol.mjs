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
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, sep as sep_ } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { modelFromTrailers } from './mechanism-review-core.mjs'
import {
  buildReviewPrompt,
  classifyOutcome,
  codexArgs,
  CODEX_BIN,
  decideReview,
  formatReviewMaterial,
  formatReviewReport,
  isUnknownModelRefusal,
  parseVerdict,
  probeFreshness,
  REVIEW_TIMEOUT_MS,
  savedAuthPathFrom,
  SOL_MODEL_ID,
  SOL_MODEL_NAME,
  SOL_REASONING_EFFORT,
} from './review-sol-core.mjs'

/** Where codex keeps the ChatGPT login, and where we park a copy of it. */
export const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex')
export const AUTH_FILE = join(CODEX_HOME, 'auth.json')

/** The MAIN checkout's `local/` — never the throwaway worktree's (see the core). */
export const SAVED_AUTH_FILE = savedAuthPathFrom(
  spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  }).stdout ?? '',
  REPO_ROOT,
  { sep: sep_ },
)

/**
 * One git read. `required` reads FAIL LOUD: an ignored exit status would send a
 * reviewer an empty patch and call the silence a review (four-eyes finding,
 * 10.08.2026). The optional reads are the per-file ones, where "not in this
 * commit" is an ordinary answer.
 */
function git(args, { required = true } = {}) {
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
  return (res.stdout ?? '').trim()
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
function gatherMaterial(sha, base = '') {
  // THE WHOLE BRANCH, NOT THE LAST COMMIT (10.08.2026). One record covers every
  // commit it CONTAINS — that is how both gates read the ledger — so a review of
  // a branch head that only saw the head's own diff would clear commits nobody
  // looked at. A range DIFF (rather than per-commit patches) is what carries a
  // merge commit's conflict resolution, which `git log --patch` omits.
  const range = base ? `${base}..${sha}` : ''
  const paths = (range
    ? git(['diff', '--name-only', range])
    : git(['show', '--pretty=format:', '--name-only', sha])
  ).split('\n').map((p) => p.trim()).filter(Boolean)
  const files = []
  for (const path of [...new Set(paths)]) {
    const text = git(['show', `${sha}:${path}`], { required: false })
    // Null = the commit does not carry that path (it was deleted); the patch
    // above still shows what happened to it.
    if (text !== null) files.push({ path, text })
  }
  return formatReviewMaterial({
    stat: range ? git(['diff', '--stat', range]) : git(['show', '--stat', sha]),
    patch: range ? git(['diff', range]) : git(['show', sha]),
    files,
  })
}

/** The commit the review's range starts at: where `ref` and `sha` diverged. */
function mergeBase(ref, sha) {
  const res = spawnSync('git', ['merge-base', ref, sha], { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true })
  const base = (res.stdout ?? '').trim()
  return res.status === 0 && base && base !== sha ? base : ''
}

/** Run codex once and hand back everything the classifier needs. */
function runCodex({ prompt, input = '', modelId = SOL_MODEL_ID, timeoutMs = REVIEW_TIMEOUT_MS }) {
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
  return {
    spawnError: res.error ?? null,
    exitCode: res.status ?? 1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    // `timeout` kills with SIGTERM AND sets an ETIMEDOUT error; either half on
    // its own would otherwise read as an ordinary error exit.
    timedOut: res.signal === 'SIGTERM' || String(res.error?.code ?? '') === 'ETIMEDOUT',
    finalMessage: last || res.stdout || '',
  }
}

/** The receipt of the last passed model-id probe (see probeFreshness). */
export const PROBE_RECEIPT_FILE = join(dirname(SAVED_AUTH_FILE), 'review-sol-probe.json')

function readProbeReceipt() {
  try {
    return JSON.parse(readFileSync(PROBE_RECEIPT_FILE, 'utf8'))
  } catch {
    return null
  }
}

/** `--probe`: prove the -m flag is honoured rather than silently substituted. */
function probe() {
  const bogus = 'gpt-does-not-exist-9.9'
  const res = runCodex({ prompt: 'Answer with the single word: ok', modelId: bogus, timeoutMs: 120_000 })
  const text = `${res.stderr}\n${res.stdout}`
  const refused = res.exitCode !== 0 && isUnknownModelRefusal(text)
  if (refused) {
    mkdirSync(dirname(PROBE_RECEIPT_FILE), { recursive: true })
    writeFileSync(PROBE_RECEIPT_FILE, `${JSON.stringify({ at: Date.now(), refused: true, id: bogus })}\n`)
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
  const ignored = spawnSync('git', ['check-ignore', '-q', SAVED_AUTH_FILE], {
    cwd: REPO_ROOT,
    windowsHide: true,
  })
  if (ignored.status !== 0) {
    console.error(
      `review-sol --save-login: REFUSING — git does not ignore ${SAVED_AUTH_FILE}.\n` +
        '  A login token written where git can see it is one `git add -A` away from the repository.',
    )
    return 1
  }
  if (existsSync(SAVED_AUTH_FILE) && lstatSync(SAVED_AUTH_FILE).isSymbolicLink()) {
    console.error(`review-sol --save-login: REFUSING — ${SAVED_AUTH_FILE} is a symlink; it would write through it.`)
    return 1
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
    '           [--mode review|blind-parallel] [--point <N>] [--since <ref>] [--timeout <ms>]',
    '       node scripts/review-sol.mjs --probe            (is -m honoured?)',
    '       node scripts/review-sol.mjs --save-login | --restore-login',
    '',
    'The material is the whole range <since>..<sha> (--since defaults to main), because',
    'one record covers every commit it contains.',
    `Reviews run on ${SOL_MODEL_NAME} at reasoning effort ${SOL_REASONING_EFFORT} (CLAUDE.md §6) and fall`,
    'back to Fable 5 when it cannot be reached — the recorded review always names the',
    'model that ACTUALLY ran.',
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

    console.error(
      `review-sol: asking ${SOL_MODEL_NAME} (effort ${SOL_REASONING_EFFORT}) to review ${full.slice(0, 7)} …`,
    )
    const base = mergeBase(flag('--since') || 'main', full)
    const material = gatherMaterial(full, base)
    console.error(
      `  material: ${material.length} characters of diff and file content` +
        `${base ? ` (${base.slice(0, 7)}..${full.slice(0, 7)} — the whole branch)` : ' (this commit)'}`,
    )
    const run = runCodex({ prompt: buildReviewPrompt({ sha: full, brief, mode }), input: material, timeoutMs })
    const outcome = classifyOutcome(run)
    const parsed = outcome.ok ? parseVerdict(run.finalMessage) : { ok: false }
    // WHO AUTHORED IT decides who may review it if Sol is unavailable: Fable
    // cannot review its own commit (see fallbackReviewerFor).
    const authorModel = modelFromTrailers(
      git(['show', '-s', '--format=%(trailers:key=Co-Authored-By,valueonly,separator=;)', full]) ?? '',
    )
    const decision = decideReview({ outcome, parsed, authorModel })
    // THE FINDINGS ARE THE POINT, not the verdict word: a `do-not-merge` whose
    // reasons were never printed cannot be acted on, and the evidence line the
    // ledger carries is one sentence by design. So the reviewer's whole answer
    // is printed above the record command.
    const said = String(run.finalMessage ?? '').trim()
    if (said) {
      console.log(`--- ${SOL_MODEL_NAME} said ---\n${said}\n--- end of review ---\n`)
    }
    console.log(formatReviewReport({ decision, sha: full, mode, point }))
    // The identity of the model that answered rests on the server refusing an
    // unknown id; nothing in a run's output names it. Say so when that has not
    // been demonstrated here lately, rather than implying it silently.
    const freshness = probeFreshness(readProbeReceipt())
    if (!decision.fellBack && !freshness.fresh) console.log(`\n  NOTE: ${freshness.warning}`)
    // A fallback is not an error of THIS command — it did its job by refusing to
    // invent a review — but it must not read as a finished one either, so the
    // exit code distinguishes them for any script that chains on it.
    process.exit(decision.fellBack ? 3 : 0)
  } catch (e) {
    console.error(`review-sol failed: ${(e && e.message) || e}`)
    process.exit(1)
  }
}
