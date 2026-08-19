// THE COMMAND ITSELF, NOT ONLY ITS DECISION CORE (point 624).
//
// The cross-vendor review's sharpest finding was about the test suite rather
// than the code: every case ran against the pure core, so the WRAPPER — the exit
// codes, the range gathering, the probe gate, the handover text, the login
// refusals — was unproven, and two real defects passed a green run. So the real
// command is spawned here against a STUB `codex` on PATH: no network, no
// allowance spent, and every path the operator actually walks is exercised.
//
// IT RUNS AGAINST A FIXTURE REPOSITORY, NOT AGAINST THIS CHECKOUT (measured
// 11.08.2026, at the merge). The first version reviewed `--sha HEAD` of the real
// tree: on a feature branch HEAD diverges from `main` and the range guard is
// satisfied, on `main` it does not and the command correctly refuses — so five
// cases were green on the branch they were written on and red the moment the
// point landed. A suite whose verdict depends on which branch it sits on is
// testing the checkout, not the code, and naming the range explicitly would only
// have hidden that: the material would still have been whatever the repository
// happened to hold that day.
//
// So `beforeAll` builds a small repository with a known history — a `main`, a
// feature branch above it, and one branch whose commit is authored by the
// fallback reviewer itself — copies the command and its imports into it, and
// runs THAT. Every sha, every range and every author below is a fact of the
// fixture, identical on any branch, on any machine, at any time.
//
// All state is redirected into the fixture too (`REVIEW_SOL_STATE_DIR`,
// `CODEX_HOME`), so the suite never touches the developer's checkout or login.
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { FALLBACK_MODEL_NAME, SECOND_FALLBACK_MODEL_NAME, SOL_MODEL_NAME } from './review-sol-core.mjs'

/** The command and everything it imports — copied so REPO_ROOT is the fixture. */
const SCRIPT_FILES = [
  'review-sol.mjs',
  'review-sol-core.mjs',
  // The material budget, its accounting and the pass plan (point 714): the
  // command refuses a record whose round did not carry the range, and the suite
  // exercises that refusal against the real command.
  'review-material-core.mjs',
  // The recorder too: the suite RUNS the record command the report prints, which
  // is the only honest way to claim that command is complete.
  'mechanism-review.mjs',
  'mechanism-review-core.mjs',
  'mechanism-review-range-core.mjs',
  // …which counts a blind-parallel union itself (point 634), so its accounting
  // core travels with it, and asks the AUTHOR allowlist what a model trailer
  // looks like (point 667), so that one does too.
  'blind-merge-core.mjs',
  'model-guard-core.mjs',
  'repo-paths.mjs',
  'is-main.mjs',
  // The share switch the command asks BEFORE it spends an allowance (point 654), and
  // the atomic write it persists a setting with. The fixture leaves the setting unset,
  // so every case below runs at `default` — reviews to Sol, as before.
  'sol-share.mjs',
  'sol-share-core.mjs',
  'ask-sol-core.mjs',
  'atomic-write.mjs',
]

let dir = ''
let repo = ''
let stubDir = ''
let stateDir = ''
let script = ''
let mainSha = ''
let headSha = ''
let fableSha = ''
let solSha = ''
let solHeadSha = ''
let orphanSha = ''
let bulkSha = ''
let oddSha = ''
let gitlinkSha = ''
let bulkSolSha = ''
let edgeSha = ''
/** A name git prints QUOTED, because it is not plain ASCII. */
const ODD_NAME = 'ümlaut.txt'
/** A name git does NOT quote and a trim would corrupt (POSIX only — Windows
 *  cannot create it, so its case skips there). */
const EDGE_NAME = 'edge-space.txt '
/** An EMPTY git template: a host `init.templateDir` must not seed the fixture. */
let emptyTemplate = ''

/** A `codex` that answers however the case's env asks it to. */
const STUB = `#!/usr/bin/env node
const { readFileSync, writeFileSync, appendFileSync } = require('node:fs')
const argv = process.argv.slice(2)
if (argv[0] === '--version') {
  // The fingerprint the probe receipt is bound to reads this.
  process.stdout.write((process.env.STUB_VERSION || 'codex-cli 0.147.0') + '\\n')
  process.exit(0)
}
const out = argv[argv.indexOf('-o') + 1]
const model = argv[argv.indexOf('-m') + 1]
if (process.env.STUB_MODE === 'no-receipt') {
  // The child this mode plays EXITS WITHOUT EVER READING ITS STDIN (finding 8;
  // round-1 pass 4): the earlier stub read everything first and only withheld
  // the token, which tested a different child — one that DID read. Answering
  // before the first read is what makes the receipt impossible to echo for the
  // honest reason.
  const answer = process.env.STUB_ANSWER || 'VERDICT: merge\\nEVIDENCE: read the whole range and both test files'
  if (out) writeFileSync(out, answer)
  process.stdout.write(answer)
  process.exit(0)
}
// What arrived on stdin is recorded: the material travels that way, and an
// assertion on the caller's own log message would stay green without it.
let stdin = ''
try { stdin = readFileSync(0, 'utf8') } catch {}
writeFileSync(process.env.STUB_STDIN, stdin)
appendFileSync(process.env.STUB_LOG, model + '\\n')
if (model !== 'gpt-5.6-sol') {
  // The unknown-id probe: the real server refuses it, which is what proves -m
  // is honoured at all.
  process.stderr.write('The requested model is not supported when using Codex with a ChatGPT account.\\n')
  process.exit(1)
}
if (process.env.STUB_MODE === 'fail') {
  process.stderr.write('stream error: You are not logged in. Run \`codex login\`.\\n')
  process.exit(1)
}
// A compliant reviewer reads the material to its end and echoes the RECEIPT
// token from its last line (finding 8). STUB_MODE=no-receipt plays the child
// that answered without ever reading its stdin.
const token = /=== END OF MATERIAL — RECEIPT ([0-9a-f]+) ===/.exec(stdin)
const receipt = process.env.STUB_MODE === 'no-receipt' || !token ? '' : 'RECEIPT: ' + token[1] + '\\n'
const answer = receipt + (process.env.STUB_ANSWER || 'VERDICT: merge\\nEVIDENCE: read the whole range and both test files')
if (out) writeFileSync(out, answer)
process.stdout.write(answer)
process.exit(0)
`

/**
 * A hermetic git: the developer's own configuration is NOT inherited.
 *
 * `commit.gpgsign=true` in a global config would fail every fixture commit on a
 * machine without the signer, and a global `core.hooksPath` would run somebody
 * else's hooks inside our temp repository (four-eyes finding, 11.08.2026). The
 * suite must answer the same on any machine, which is the whole reason the
 * fixture exists.
 */
const HERMETIC_GIT = Object.freeze({
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
})

/**
 * The environment a fixture git call gets: EVERY inherited `GIT_*` variable is
 * dropped first.
 *
 * Pointing the config FILES at /dev/null is not enough — `GIT_CONFIG_COUNT` with
 * its `GIT_CONFIG_KEY_n`/`VALUE_n` pairs injects configuration straight from the
 * environment, and `GIT_TEMPLATE_DIR` seeds a new repository with somebody
 * else's `info/exclude` (a host template excluding `*.txt` would make the
 * fixture's first commit empty and fail it). Both survive /dev/null, so the slate
 * is wiped and only what this suite sets is put back (four-eyes finding,
 * 11.08.2026).
 */
const hermeticEnv = (extra = {}) => {
  const env = { ...process.env }
  // Case-INSENSITIVELY: Windows environment names are, so an inherited
  // `git_config_count` would survive a `startsWith('GIT_')` filter and git would
  // read it as the uppercase name (four-eyes finding, 11.08.2026).
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key]
  return { ...env, ...HERMETIC_GIT, GIT_TEMPLATE_DIR: emptyTemplate, ...extra }
}

const git = (...args) => {
  const r = spawnSync('git', ['-C', repo, '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=', ...args], {
    encoding: 'utf8',
    windowsHide: true,
    env: hermeticEnv(),
  })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
  return (r.stdout ?? '').trim()
}

/** One fixture commit, with the authoring model in its trailer. */
const commit = (file, text, subject, model) => {
  writeFileSync(join(repo, file), text)
  git('add', '-A')
  git('commit', '--no-verify', '-q', '-m', `${subject}\n\nCo-Authored-By: Claude ${model} <noreply@anthropic.com>`)
  return git('rev-parse', 'HEAD')
}

const run = (args, env = {}) =>
  spawnSync(process.execPath, [script, ...args], {
    windowsHide: true,
    encoding: 'utf8',
    cwd: repo,
    env: hermeticEnv({
      PATH: `${stubDir}${delimiter}${process.env.PATH}`,
      REVIEW_SOL_STATE_DIR: stateDir,
      CODEX_HOME: join(dir, 'codex-home'),
      STUB_LOG: join(dir, 'calls.log'),
      STUB_STDIN: join(dir, 'stdin.txt'),
      ...env,
    }),
  })

/** The record command out of the command's report, as one line. */
const recordCommandIn = (stdout) => {
  const line = String(stdout).split('\n').find((l) => l.includes('mechanism-review.mjs --record'))
  expect(line, 'the report should carry a record command').toBeTruthy()
  return line.trim()
}

/** Split a printed command line into argv, honouring its double quotes. */
const splitCommand = (line) =>
  (line.match(/"(?:[^"\\]|\\.)*"|\S+/g) ?? []).map((token) =>
    token.startsWith('"') ? token.slice(1, -1).replace(/\\(["\\$`])/g, '$1') : token,
  )

const calls = () => {
  try {
    return readFileSync(join(dir, 'calls.log'), 'utf8').split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Prove the model id once, the way the command itself does.
 *
 * A receipt written by hand cannot carry the fingerprint the running codex
 * hashes to, and would be discarded as untied — which is exactly the behaviour
 * the fingerprint was added for. So the warm-up runs the real `--probe`.
 */
const provenId = () => {
  const r = run(['--probe'])
  expect(r.status, r.stderr).toBe(0)
  writeFileSync(join(dir, 'calls.log'), '')
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'review-sol-cli-'))
  emptyTemplate = join(dir, 'empty-git-template')
  mkdirSync(emptyTemplate, { recursive: true })
  repo = join(dir, 'repo')
  stubDir = join(dir, 'bin')
  stateDir = join(repo, 'local')
  mkdirSync(stubDir, { recursive: true })
  mkdirSync(join(repo, 'scripts'), { recursive: true })

  writeFileSync(join(stubDir, 'codex'), STUB)
  chmodSync(join(stubDir, 'codex'), 0o755)
  // Windows cannot execute an extensionless shebang script, and this suite makes
  // Windows-specific assertions elsewhere (four-eyes finding, 11.08.2026).
  if (process.platform === 'win32') {
    writeFileSync(join(stubDir, 'codex.cmd'), `@echo off\r\nnode "%~dp0codex" %*\r\n`)
  }
  writeFileSync(join(dir, 'calls.log'), '')

  // The fixture history: main, a feature branch above it, and a branch whose
  // commit was authored by the fallback reviewer itself.
  // `init` gets the hermetic environment too: a developer's `init.templateDir`
  // would otherwise seed this repository's own config and hooks before the
  // commands below ever disable the global files (four-eyes finding, 11.08.2026).
  spawnSync('git', ['init', '-q', '-b', 'main', '--template', emptyTemplate, repo], {
    windowsHide: true,
    env: hermeticEnv(),
  })
  script = join(repo, 'scripts', 'review-sol.mjs')
  for (const file of SCRIPT_FILES) copyFileSync(resolve('scripts', file), join(repo, 'scripts', file))
  // `local/` is ignored here as it is in the real repository — the saved-login
  // path is refused unless git PROVES it ignored, and that proof is a property
  // of the checkout the file lives in.
  writeFileSync(join(repo, '.gitignore'), '/local/\nnode_modules\n')
  // A path GIT QUOTES lives in the fixture world from the start (cross-vendor
  // review, second round): its non-ASCII name is written `"\303\274mlaut.txt"`
  // in `--name-only` and in the diff header alike, and read literally it
  // resolved in no `git show` and matched no patch section — the file travelled
  // in no pass and nothing said so.
  writeFileSync(join(repo, ODD_NAME), 'the original odd-named file\n')
  // The trailing-space file exists from the start, so the edge branch MODIFIES
  // it and its current content must travel beside the patch.
  if (process.platform !== 'win32') writeFileSync(join(repo, EDGE_NAME), 'the original edge-space file\n')
  mainSha = commit('world.txt', 'the fixture world\n', 'Lay down the fixture world', 'Opus 5')

  git('checkout', '-q', '-b', 'feat')
  commit('world.txt', 'the fixture world, revised\n', 'Revise the world', 'Opus 5')
  headSha = commit('added.txt', 'a file the patch carries whole\n', 'Add a file', 'Opus 5')

  git('checkout', '-q', '-b', 'fable-work', 'main')
  fableSha = commit('fable.txt', 'written by the fallback reviewer\n', 'Write something as Fable', 'Fable 5')

  // …and a branch SOL authored (point 667), which Sol may therefore not review.
  git('checkout', '-q', '-b', 'sol-work', 'main')
  writeFileSync(join(repo, 'sol.txt'), 'written in the OpenAI authoring lane\n')
  git('add', '-A')
  git('commit', '--no-verify', '-q', '-m', 'Write something as Sol\n\nCo-Authored-By: GPT-5.6 Sol <noreply@openai.com>')
  solSha = git('rev-parse', 'HEAD')
  // …with a SECOND commit above it, so a `--since` can narrow the Sol range.
  writeFileSync(join(repo, 'sol2.txt'), 'a second commit in the OpenAI authoring lane\n')
  git('add', '-A')
  git('commit', '--no-verify', '-q', '-m', 'Extend the Sol work\n\nCo-Authored-By: GPT-5.6 Sol <noreply@openai.com>')
  solHeadSha = git('rev-parse', 'HEAD')

  // A branch whose material CANNOT fit one round (point 714): two files of 120k
  // characters, so the range needs more than the 200k budget however it is cut.
  git('checkout', '-q', '-b', 'bulk', 'main')
  writeFileSync(join(repo, 'bulk-a.txt'), `${'a'.repeat(120_000)}\n`)
  writeFileSync(join(repo, 'bulk-b.txt'), `${'b'.repeat(120_000)}\n`)
  git('add', '-A')
  git('commit', '--no-verify', '-q', '-m', 'Add two files no single round can hold\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')
  bulkSha = git('rev-parse', 'HEAD')

  // …and a branch that CHANGES that quoted-name file, so the range carries it as
  // a modification and its current content must travel with the patch.
  git('checkout', '-q', '-b', 'odd-name', 'main')
  oddSha = commit(ODD_NAME, 'the odd-named file, revised in this range\n', 'Revise the odd-named file', 'Opus 5')

  // …and a branch adding a GITLINK (a submodule pointer, mode 160000): its
  // entry names a COMMIT object, so its body is absent by design. cacheinfo
  // writes the entry without any submodule machinery.
  git('checkout', '-q', '-b', 'gitlink', 'main')
  git('update-index', '--add', '--cacheinfo', `160000,${'f'.repeat(40)},vendor-sub`)
  git('commit', '--no-verify', '-q', '-m', 'Pin the vendored subproject\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')
  gitlinkSha = git('rev-parse', 'HEAD')

  // …and a branch touching a path with a TRAILING SPACE, which git prints
  // UNQUOTED — the spelling a trim corrupts into a different path (point 714,
  // third round). Windows cannot create such a file, so the branch is POSIX-only.
  if (process.platform !== 'win32') {
    git('checkout', '-q', '-b', 'edge-name', 'main')
    edgeSha = commit(EDGE_NAME, 'content behind the trailing space\n', 'Touch the edge-space file', 'Opus 5')
  }

  // …and the same bulk, authored by SOL: the role swap hands the whole range to
  // a Claude reviewer, and a range no round can hold must be handed on as passes
  // rather than as a whole-range record template (cross-vendor review, second
  // round).
  git('checkout', '-q', '-b', 'bulk-sol', 'main')
  writeFileSync(join(repo, 'bulk-c.txt'), `${'c'.repeat(120_000)}\n`)
  writeFileSync(join(repo, 'bulk-d.txt'), `${'d'.repeat(120_000)}\n`)
  git('add', '-A')
  git('commit', '--no-verify', '-q', '-m', 'Add two more files no round can hold\n\nCo-Authored-By: GPT-5.6 Sol <noreply@openai.com>')
  bulkSolSha = git('rev-parse', 'HEAD')

  // A history sharing no ancestor with the rest: the third form of "not a proper
  // ancestor", which merge-base answers with nothing at all.
  git('checkout', '-q', '--orphan', 'unrelated')
  git('rm', '-rqf', '--ignore-unmatch', '.')
  orphanSha = commit('orphan.txt', 'no common ancestor with anything\n', 'Start an unrelated history', 'Opus 5')
  git('checkout', '-q', '-f', 'feat')
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('the fixture is hermetic', () => {
  it('drops an inherited GIT_* variable whatever its case, and seeds no host template', () => {
    // Measured on the way in: a host template whose info/exclude holds `*.txt`
    // makes the fixture's first commit fail and skips every case below. The
    // variable names are case-insensitive on Windows, so the filter is too.
    const injected = { GIT_CONFIG_COUNT: '1', git_config_key_0: 'core.excludesFile', Git_Template_Dir: '/somewhere' }
    Object.assign(process.env, injected)
    try {
      const env = hermeticEnv()
      expect(env.GIT_CONFIG_COUNT).toBeUndefined()
      expect(env.git_config_key_0).toBeUndefined()
      expect(env.Git_Template_Dir).toBeUndefined()
      expect(env.GIT_TEMPLATE_DIR).toBe(emptyTemplate)
      expect(env.GIT_CONFIG_GLOBAL).toBe('/dev/null')
      // …and nothing outside git's namespace is thrown away with it.
      expect(env.PATH).toBe(process.env.PATH)
    } finally {
      for (const key of Object.keys(injected)) delete process.env[key]
    }
  })
})

describe('a review that runs', () => {
  it('prints the reviewer, its answer and a complete record command, and exits 0', () => {
    provenId()
    const r = run(['--sha', headSha, '--point', '624', '--brief', 'judge the fallback path'])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain(SOL_MODEL_NAME)
    expect(r.stdout).toContain('read the whole range and both test files')
    // THE RECORD COMMAND IS RUN, not merely pattern-matched (four-eyes finding,
    // 11.08.2026): asserting three of its flags leaves a malformed, unrunnable
    // command green, and "prints a complete record command" is a claim about
    // whether the recorder ACCEPTS it.
    const printed = recordCommandIn(r.stdout)
    expect(printed).toContain('--model "GPT-5.6 Sol"')
    expect(printed).toContain('--verdict merge')
    expect(printed).toContain('--point 624')
    expect(printed).toContain(headSha)
    const recorded = spawnSync(process.execPath, splitCommand(printed).slice(1), {
      cwd: repo,
      encoding: 'utf8',
      windowsHide: true,
      env: hermeticEnv(),
    })
    expect(recorded.status, recorded.stderr).toBe(0)
    const ledger = readFileSync(join(repo, '.claude', 'mechanism-reviews.jsonl'), 'utf8').trim().split('\n')
    expect(JSON.parse(ledger.at(-1))).toMatchObject({
      sha: headSha,
      model: 'GPT-5.6 Sol',
      verdict: 'merge',
      mode: 'review',
      point: 624,
      authoredBy: expect.stringContaining('Opus 5'),
    })
    // The material really REACHES the model — asserted on what the process
    // received, not on the caller's own log line.
    const received = readFileSync(join(dir, 'stdin.txt'), 'utf8')
    expect(received).toContain('=== DIFFSTAT ===')
    expect(received).toContain('=== PATCH ===')
    expect(received).toContain('diff --git')
    // …WHOLE: the size the command claims for the round is the size the child
    // process actually read off its stdin — a real transport check, not the
    // call site's own echo (escalation round).
    const claimed = Number(/material: (\d+) characters/.exec(r.stderr)?.[1])
    expect(received.length).toBe(claimed)
    // …and it is the whole BRANCH, both commits above main, not just the head.
    expect(received).toContain('the fixture world, revised')
    expect(received).toContain('a file the patch carries whole')
    expect(r.stderr).toMatch(/material: \d+ characters/)
  })
})

describe('the file bodies travel byte-exact', () => {
  it('keeps a body’s leading and trailing blank lines, which a trim would eat', () => {
    // Fourth cross-vendor round, pass 4: gatherRange read bodies through the
    // trimming git() default, so every file lost its edge whitespace and final
    // newline — and the assembly recorded the ALTERED string as complete, so
    // byte-inexact delivery passed the accounting. Asserted on what the child
    // process actually received, not on any log line.
    provenId()
    git('checkout', '-q', '-b', 'padded-work', 'main')
    // A MODIFIED file, so its body travels as current content — an added one
    // rides inside the patch and would not exercise the body read.
    const sha = commit('world.txt', '\n\n  body with edges  \n\n', 'Pad a file with blank edges', 'Opus 5')
    const r = run(['--sha', sha, '--brief', 'judge the padding'])
    expect(r.status, r.stderr).toBe(0)
    const sent = readFileSync(join(dir, 'stdin.txt'), 'utf8')
    expect(sent).toContain('=== FILE (current content): world.txt ===\n\n\n  body with edges  \n\n')
  })
})

describe('a binary file in the range', () => {
  it('travels absent-by-design in the material rather than vanishing or arriving as mojibake', () => {
    // Fourth cross-vendor round, pass 4, finding 7: an added binary was
    // skipped as "covered by the patch" while the ordinary diff carries only
    // "Binary files differ" — the blob never travelled, nothing was recorded.
    provenId()
    git('checkout', '-q', '-b', 'binary-work', 'main')
    writeFileSync(join(repo, 'blob.bin'), Buffer.from([0, 1, 2, 3, 250, 251, 0, 90]))
    git('add', '-A')
    git('commit', '--no-verify', '-q', '-m', 'Add a binary blob\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')
    const sha = git('rev-parse', 'HEAD')
    const r = run(['--sha', sha, '--brief', 'judge the blob'])
    expect(r.status, r.stderr).toBe(0)
    const sent = readFileSync(join(dir, 'stdin.txt'), 'utf8')
    expect(sent).toContain('FILE BODY ABSENT BY DESIGN — binary')
    expect(sent).toContain('blob.bin')
    expect(sent).not.toContain('GIT binary patch')
    expect(sent).not.toContain('literal ')
    // The declaration is not a loss: the record command is still offered.
    expect(r.stdout).toContain('mechanism-review.mjs --record')
  })

  // ROUND-1 PASS 5: invalid UTF-8 without a NUL slipped past the binary check
  // as replacement characters, and the ALTERED text was recorded as complete
  // delivery. The strict decode refuses such bytes by name instead.
  it('refuses a range whose diff bytes are not valid UTF-8, rather than recording mojibake', () => {
    provenId()
    git('checkout', '-q', '-b', 'latin1-work', 'main')
    // 0xFF is not valid UTF-8 anywhere, and there is no NUL — git diffs this
    // as TEXT, which is exactly the hole: the lenient decode wrote U+FFFD and
    // called the material complete.
    writeFileSync(join(repo, 'legacy.txt'), Buffer.from([0x61, 0xff, 0x62, 0x0a]))
    git('add', '-A')
    git('commit', '--no-verify', '-q', '-m', 'Add a latin1 body\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')
    const sha = git('rev-parse', 'HEAD')
    const r = run(['--sha', sha, '--brief', 'judge the legacy bytes'])
    expect(r.status).not.toBe(0)
    expect(`${r.stdout}${r.stderr}`).toContain('not valid UTF-8')
    expect(r.stdout).not.toContain('mechanism-review.mjs --record')
  })
})

describe('a child that never read its material', () => {
  it('yields no verdict and no completed record — the receipt closes the unread-stdin hole', () => {
    // Finding 8: a child can exit 0 with a parseable verdict without ever
    // reading an input smaller than the pipe buffer, and the process layer
    // cannot witness the read. The RECEIPT token stands only on the material's
    // last line, so this stub — which answers without it — is exactly that
    // child, and its answer must not become a record.
    provenId()
    const r = run(['--sha', headSha, '--brief', 'judge the change'], { STUB_MODE: 'no-receipt' })
    expect(r.status).toBe(3)
    expect(r.stdout).toContain('no parseable verdict')
    expect(r.stdout).toContain('RECEIPT')
    expect(r.stdout).toContain('The review is NOT done')
    // ROUND-2 PASS 4: the stub deliberately answers `VERDICT: merge`, so a
    // regression that printed a RUNNABLE record command beside the refusal
    // would have passed every line above. What may travel is the hand-over
    // TEMPLATE, whose angle-bracket placeholders the recorder refuses — never
    // the unread child's own verdict as a completed command.
    const out = `${r.stdout}${r.stderr}`
    expect(out).not.toContain('--verdict merge ')
    expect(out).not.toMatch(/--verdict merge$/m)
    if (out.includes('mechanism-review.mjs --record')) {
      expect(out).toContain('--verdict <')
    }
  })
})

describe('a review that does not run', () => {
  it('names the cause, hands the review on, and exits 3 — never 0', () => {
    provenId()
    const r = run(['--sha', headSha, '--brief', 'judge the fallback path'], { STUB_MODE: 'fail' })
    expect(r.status).toBe(3)
    expect(r.stdout).toContain('FALLBACK')
    expect(r.stdout).toMatch(/login/i)
    expect(r.stdout).toContain(FALLBACK_MODEL_NAME)
    expect(r.stdout).toContain('The review is NOT done')
    // A FAILED DELIVERY OFFERS NO RECORD IN ANY SHAPE (escalation round): the
    // run errored, so nothing of the range was read, and even a placeholder
    // template at the whole sha is an offer no completed hand-off backs.
    expect(r.stdout).toContain('NO RECORD COMMAND IS PRINTED')
    expect(r.stdout).not.toContain('mechanism-review.mjs --record')
  })

  it('treats an answer that admits it saw nothing as no review at all', () => {
    provenId()
    const r = run(['--sha', headSha, '--brief', 'judge it'], {
      STUB_ANSWER: 'VERDICT: do-not-merge\nEVIDENCE: I could not read the repository, so nothing was verified',
    })
    expect(r.status).toBe(3)
    expect(r.stdout).toContain('FALLBACK')
  })

  // THE SHARE SWITCH (point 654) at `claude-only` means the operator moved the load off
  // OpenAI, so nothing may be sent — and the review must land exactly where an
  // unreachable Sol lands: with a Claude reviewer and NO verdict. A "switched off" that
  // quietly recorded a green review would be the worst of both.
  it('asks NOTHING at all while the share switch is at claude-only, and still hands the review on', () => {
    provenId()
    const shareFile = join(dir, 'sol-share.json')
    writeFileSync(shareFile, JSON.stringify({ setting: 'claude-only' }))
    writeFileSync(join(dir, 'calls.log'), '')
    const r = run(['--sha', headSha, '--brief', 'judge it'], { SOL_SHARE_FILE: shareFile })
    expect(r.status).toBe(3)
    expect(r.stdout).toContain('FALLBACK')
    expect(r.stdout).toMatch(/claude-only/)
    expect(r.stdout).toContain('The review is NOT done')
    // The allowance is what the switch protects: no codex call may have happened.
    expect(readFileSync(join(dir, 'calls.log'), 'utf8').trim()).toBe('')
    rmSync(shareFile, { force: true })
  })

  it('hands a Fable-authored range to Opus 5, never back to Fable', () => {
    provenId()
    const r = run(['--sha', fableSha, '--brief', 'judge it'], { STUB_MODE: 'fail' })
    expect(r.status).toBe(3)
    // The hand-over names its reviewer in PROSE — after a failed delivery no
    // record command is printed at all, not even a placeholder template.
    expect(r.stdout).toContain(SECOND_FALLBACK_MODEL_NAME)
    expect(r.stdout).not.toContain('mechanism-review.mjs --record')
    expect(r.stdout).not.toMatch(/Hand it to Fable/)
  })
})

describe('the guards around the run', () => {
  it('refuses a --since ref that does not exist instead of silently reviewing one commit', () => {
    provenId()
    const r = run(['--sha', headSha, '--since', 'no-such-branch-here', '--brief', 'judge it'])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/no such commit/)
  })

  it('refuses a sha that is not a commit', () => {
    provenId()
    const r = run(['--sha', 'deadbeefdeadbeef', '--brief', 'judge it'])
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/not a commit/)
  })

  it('refuses a commit that does not diverge from main without a named range', () => {
    // A record covers every commit it CONTAINS, so reviewing one commit while
    // clearing its ancestors is the hole.
    provenId()
    const r = run(['--sha', mainSha, '--brief', 'judge it'])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/does not diverge/)
    expect(r.stderr).toMatch(/--since/)
  })

  it('reviews a narrowed range but prints NO record for it', () => {
    // The verdict is still reported; the ready-to-run command is not, because a
    // record at that sha would clear commits this review never saw.
    provenId()
    const r = run(['--sha', headSha, '--since', `${headSha}~1`, '--brief', 'judge it'])
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/NO RECORD COMMAND IS PRINTED/)
    expect(r.stdout).not.toContain('mechanism-review.mjs --record')
  })

  it('refuses an explicit --since that is not a proper ancestor, in each of its three forms', () => {
    provenId()
    const cases = [
      // the range start IS the reviewed commit …
      { sha: headSha, since: headSha },
      // … a DESCENDANT of it …
      { sha: `${headSha}~1`, since: headSha },
      // … and a history with no common ancestor at all.
      { sha: headSha, since: orphanSha },
    ]
    for (const { sha, since } of cases) {
      const r = run(['--sha', sha, '--since', since, '--brief', 'judge it'])
      expect(r.status, `${since} should be refused as a range start`).not.toBe(0)
      expect(r.stderr).toMatch(/--since|does not diverge/)
      expect(r.stdout).not.toContain('mechanism-review.mjs --record')
    }
  })

  it('PROVES the model id before attributing a review to it, and remembers the proof', () => {
    rmSync(join(stateDir, 'review-sol-probe.json'), { force: true })
    writeFileSync(join(dir, 'calls.log'), '')
    const r = run(['--sha', headSha, '--brief', 'judge it'])
    expect(r.status, r.stderr).toBe(0)
    // The unknown id was tried first, then the real review ran.
    expect(calls()[0]).not.toBe('gpt-5.6-sol')
    expect(calls()).toContain('gpt-5.6-sol')
    expect(JSON.parse(readFileSync(join(stateDir, 'review-sol-probe.json'), 'utf8'))).toMatchObject({ refused: true })
    // …and the next review does not pay for the probe again.
    writeFileSync(join(dir, 'calls.log'), '')
    expect(run(['--sha', headSha, '--brief', 'judge it']).status).toBe(0)
    expect(calls()).toEqual(['gpt-5.6-sol'])
  })

  it('re-proves it the moment the codex it was proven with changes', () => {
    // A cached proof is tied to the binary, its version and the account: it
    // outlives container rebuilds, and an unbound one would let another model's
    // answer be recorded as Sol's.
    provenId()
    writeFileSync(join(dir, 'calls.log'), '')
    expect(run(['--sha', headSha, '--brief', 'judge it'], { STUB_VERSION: 'codex-cli 9.9.9' }).status).toBe(0)
    expect(calls()).toHaveLength(2)
    expect(calls()[0]).not.toBe('gpt-5.6-sol')
  })
})

describe('the saved login', () => {
  // EACH CASE BUILDS ITS OWN WORLD (four-eyes finding, 11.08.2026): the first
  // version had "restores it again" depending on the token the case above it had
  // saved, so running one case alone — or in another order — changed the answer.
  let n = 0
  const world = ({ token = true } = {}) => {
    const id = `login-${n++}`
    const home = join(dir, `${id}-home`)
    const state = join(repo, 'local', id)
    mkdirSync(home, { recursive: true })
    if (token) writeFileSync(join(home, 'auth.json'), `{"tokens":{"access_token":"s","account_id":"${id}"}}`)
    return { id, home, state, env: { CODEX_HOME: home, REVIEW_SOL_STATE_DIR: state } }
  }

  it('says so when there is no login to save', () => {
    const w = world({ token: false })
    const r = run(['--save-login'], w.env)
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/no login found/)
  })

  it('saves a real token into the ignored directory, readable only by its owner', () => {
    const w = world()
    const r = run(['--save-login'], w.env)
    expect(r.status, r.stderr).toBe(0)
    const saved = join(w.state, 'codex-auth.json')
    expect(readFileSync(saved, 'utf8')).toContain(w.id)
    if (process.platform !== 'win32') expect(statSync(saved).mode & 0o777).toBe(0o600)
    // …and git really does ignore where it landed.
    expect(git('check-ignore', '-q', saved)).toBe('')
  })

  it('restores it again, and reports how old it is', () => {
    const w = world()
    expect(run(['--save-login'], w.env).status).toBe(0)
    const restored = join(dir, `${w.id}-restored`)
    const r = run(['--restore-login'], { ...w.env, CODEX_HOME: restored })
    expect(r.status, r.stderr).toBe(0)
    expect(readFileSync(join(restored, 'auth.json'), 'utf8')).toContain(w.id)
    expect(r.stdout).toMatch(/day\(s\) ago/)
  })

  it('REFUSES to write the token where git does not ignore it', () => {
    const w = world()
    const notIgnored = join(repo, 'not-ignored', w.id)
    const r = run(['--save-login'], { ...w.env, REVIEW_SOL_STATE_DIR: notIgnored })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/does not ignore/)
    expect(existsSync(join(notIgnored, 'codex-auth.json'))).toBe(false)
  })

  it('REFUSES a state directory that is a link out of where it claims to be', () => {
    // The lexical ignore check passes for a symlinked `local/`, and the copy
    // would then follow the link.
    const w = world()
    const elsewhere = join(dir, `${w.id}-elsewhere`)
    const linked = join(dir, `${w.id}-linked`)
    mkdirSync(elsewhere, { recursive: true })
    // A JUNCTION on Windows: a plain directory symlink needs Developer Mode or
    // elevation there, and a fixture that cannot be built is not a test result
    // (four-eyes finding, 11.08.2026).
    symlinkSync(elsewhere, linked, process.platform === 'win32' ? 'junction' : 'dir')
    writeFileSync(join(elsewhere, 'codex-auth.json'), '{"tokens":{}}')
    const r = run(['--restore-login'], { ...w.env, REVIEW_SOL_STATE_DIR: linked })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/REFUSING/)
    expect(r.stderr).toMatch(/resolves to/)
  })

  it('says what to do when nothing was ever saved', () => {
    const w = world()
    const r = run(['--restore-login'], { ...w.env, REVIEW_SOL_STATE_DIR: join(dir, `${w.id}-nothing-here`) })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/nothing saved/)
    expect(r.stderr).toMatch(/--save-login/)
  })
})

// POINT 667: Sol authors too, so the command must recognise the range it may not
// judge — and must recognise it BEFORE it spends an allowance on it.
describe('a range SOL authored', () => {
  it('refuses to review its own work, spends no codex call, and names the Claude reviewer', () => {
    writeFileSync(join(dir, 'calls.log'), '')
    const r = run(['--sha', solSha, '--point', '667', '--brief', 'judge the authoring lane'])
    expect(r.status, r.stderr).toBe(3)
    expect(r.stdout).toMatch(/ROLE SWAP/)
    expect(r.stdout).toMatch(/AUTHORED part of/)
    expect(r.stdout).toContain('--model "Opus 5"')
    // Not one call — not even the model-id probe: the question is answered from
    // the trailers, and paying for a review Sol may not give is the waste this
    // ordering exists to prevent.
    expect(calls()).toEqual([])
    // And no verdict is invented: the record command still carries the placeholder.
    expect(r.stdout).toMatch(/--verdict <merge\|/)
  })
})

// POINT 714, second cross-vendor round: a file whose name git QUOTES must reach
// the reviewer like any other, or it is a file the record clears unread.
describe('a path git writes in quotes', () => {
  it('sends its content, not an unresolvable quoted name', () => {
    provenId()
    const r = run(['--sha', oddSha, '--brief', 'judge the odd name'])
    expect(r.status, r.stderr).toBe(0)
    const sent = readFileSync(join(dir, 'stdin.txt'), 'utf8')
    // The CONTENT is the proof the path resolved — asserted CONTIGUOUSLY under
    // ITS OWN header (final-round pass 7): the bare toContain was satisfied by
    // the PATCH carrying the line, so the odd name's body could resolve empty
    // while this stayed green. The header must NAME the odd file and the body
    // must follow it before the next structural marker.
    // The material spells the DECODED name (git's quoted octal form resolves
    // to the real path, and needsQuoting has nothing to escape in it).
    const header = `=== FILE (current content): ${ODD_NAME} ===`
    expect(sent).toContain(header)
    const body = sent.slice(sent.indexOf(header) + header.length)
    const nextMarker = body.indexOf('=== ')
    expect(body.slice(0, nextMarker < 0 ? undefined : nextMarker)).toContain(
      'the odd-named file, revised in this range',
    )
    expect(sent).not.toContain('OMITTED ENTIRELY')
  })
})

// A submodule entry points at a COMMIT object, not a file blob. Its body is a
// named deliberate absence, and the round never tries to read it as content.
describe('a modified gitlink', () => {
  it('is named absent-by-design, and the round completes', () => {
    provenId()
    const r = run(['--sha', gitlinkSha, '--brief', 'judge the submodule pin'])
    expect(r.status, r.stderr).toBe(0)
    const sent = readFileSync(join(dir, 'stdin.txt'), 'utf8')
    expect(sent).toContain(`+Subproject commit ${'f'.repeat(40)}`)
    expect(sent).toContain('FILE BODY ABSENT BY DESIGN — submodule pointer: vendor-sub ===')
    expect(sent).not.toContain('OMITTED ENTIRELY')
  })

  it('keeps a TEXT file text although its hunk holds the pointer line (landing-round pass 8)', () => {
    // The classifier read the `+Subproject commit <hex>` HUNK line as gitlink
    // evidence, so a normal text file merely containing that literal line was
    // assigned no content of its own — silently omitted while the accounting
    // read complete. Only git's own mode headers prove a 160000 entry.
    provenId()
    git('checkout', '-q', '-b', 'fake-gitlink', 'main')
    const body = `prose about submodules\nSubproject commit ${'a'.repeat(40)}\nmore prose\n`
    const sha = commit('world.txt', body, 'Mention a subproject pointer in prose', 'Opus 5')
    const r = run(['--sha', sha, '--brief', 'judge the prose'])
    expect(r.status, r.stderr).toBe(0)
    const sent = readFileSync(join(dir, 'stdin.txt'), 'utf8')
    expect(sent).toContain(`=== FILE (current content): world.txt ===\n${body}`)
  })
})

// ESCALATION ROUND: both early routes hard-coded `partial: null`, so a fitting
// range with an explicit narrowed `--since` printed a whole-SHA record template
// although only the narrowed range was measured — bypassing the coverage
// refusal the normal route makes.
describe('a narrowed --since on the early routes', () => {
  it('prints NO record template at claude-only while --since narrows the range', () => {
    const shareFile = join(dir, 'sol-share.json')
    writeFileSync(shareFile, JSON.stringify({ setting: 'claude-only' }))
    writeFileSync(join(dir, 'calls.log'), '')
    const r = run(['--sha', headSha, '--since', `${headSha}~1`, '--brief', 'judge it'], { SOL_SHARE_FILE: shareFile })
    expect(r.status).toBe(3)
    expect(r.stdout).toMatch(/NO RECORD COMMAND IS PRINTED/)
    expect(r.stdout).toMatch(/clears every commit it contains/)
    expect(r.stdout).not.toContain('mechanism-review.mjs --record')
    expect(readFileSync(join(dir, 'calls.log'), 'utf8').trim()).toBe('')
    rmSync(shareFile, { force: true })
  })

  it('prints NO record template for a narrowed Sol-authored range either', () => {
    writeFileSync(join(dir, 'calls.log'), '')
    const r = run(['--sha', solHeadSha, '--since', `${solHeadSha}~1`, '--brief', 'judge it'])
    expect(r.status).toBe(3)
    expect(r.stdout).toMatch(/NO RECORD COMMAND IS PRINTED/)
    expect(r.stdout).not.toContain('mechanism-review.mjs --record')
    expect(calls()).toEqual([])
  })

  it('still hands over the full template when no --since narrows the early route', () => {
    // The refusal is about the narrowing, not about the hand-over itself.
    writeFileSync(join(dir, 'calls.log'), '')
    const r = run(['--sha', solHeadSha, '--brief', 'judge it'])
    expect(r.status).toBe(3)
    expect(recordCommandIn(r.stdout)).toContain('--verdict <merge|')
  })
})

// POINT 714, third round: a path with a trailing space is printed UNQUOTED by
// git, and a trim anywhere on the way turns it into a different path — the real
// file then reaches no pass and no content list, with nothing said.
describe('a path with a trailing space', () => {
  it.skipIf(process.platform === 'win32')('travels byte-exact, content and all', () => {
    provenId()
    const r = run(['--sha', edgeSha, '--brief', 'judge the edge name'])
    expect(r.status, r.stderr).toBe(0)
    const sent = readFileSync(join(dir, 'stdin.txt'), 'utf8')
    // CONTIGUOUS, header and body as one string (fourth landing round,
    // carried pass 8): asserted separately, the body's presence in the PATCH
    // kept this green even if the current-content lookup failed.
    expect(sent).toContain(`=== FILE (current content): "${EDGE_NAME}" ===\ncontent behind the trailing space\n`)
    expect(sent).not.toContain('OMITTED ENTIRELY')
  })
})

// POINT 714: a range whose material cannot fit one round must be recognised
// BEFORE the round is spent, and no record may be offered for what was not read.
describe('a range too large for one round', () => {
  it('names the threshold, refuses to spend the round, and prints the pass plan', () => {
    provenId()
    const r = run(['--sha', bulkSha, '--brief', 'judge the bulk range'])
    expect(r.status, r.stderr).toBe(4)
    expect(r.stderr).toContain('material budget is 200000 characters')
    expect(r.stderr).toContain('PASSES over the FILE SET')
    expect(r.stderr).toContain('bulk-a.txt')
    expect(r.stderr).toContain('bulk-b.txt')
    expect(r.stderr).toContain('--pass 1')
    // THE ROUND IS NOT SPENT: the whole cost of the old behaviour was a paid
    // review whose record covered files nobody read.
    expect(calls()).toEqual([])
    // And nothing that looks like a record reaches the caller.
    expect(r.stdout).not.toContain('mechanism-review.mjs --record')
  })

  it('reviews ONE pass on demand and offers a record for that pass alone', () => {
    provenId()
    const r = run(['--sha', bulkSha, '--brief', 'judge the bulk range', '--pass', '1'])
    expect(r.status, r.stderr).toBe(0)
    const printed = recordCommandIn(r.stdout)
    expect(printed).toMatch(/--pass 1\/2/)
    expect(printed).toMatch(/--pass-files "bulk-[ab]\.txt"/)
    expect(r.stdout).toContain('NOT cleared until every pass 1..2 is recorded')
    // What actually went to the reviewer stayed inside the budget.
    const sent = readFileSync(join(dir, 'stdin.txt'), 'utf8')
    expect(sent.length).toBeLessThanOrEqual(200_000)
    expect(sent).toContain('=== PATCH ===')
    // THE ARITHMETIC, measured against a doubting review (landing-round pass
    // 7): a 120k added file exceeds the standing patch HALF-share, so the plan
    // widens this pass's patchRoom to the exact joined section — the pass's
    // patch is mandatory material — and delivers the file PATCH-ONLY. Its
    // whole body still travels, as the added lines of its own diff; nothing is
    // truncated, and the completed two-pass record is earned, not fabricated.
    // THE RECORDED SCOPE IS BOUND TO THE TRANSPORTED BYTES (second landing
    // round, pass 7): the file the record command names is the file whose
    // body and diff section actually travelled — not merely "one of the two".
    const scoped = /--pass-files "bulk-([ab])\.txt"/.exec(printed)?.[1]
    expect(['a', 'b']).toContain(scoped)
    const other = scoped === 'a' ? 'b' : 'a'
    expect(sent).toContain(scoped.repeat(120_000))
    expect(sent).not.toContain(other.repeat(120_000))
    expect(sent).toContain(`diff --git a/bulk-${scoped}.txt b/bulk-${scoped}.txt`)
    // …at the PATCH-ONLY delivery level the manifest declares: the body rides
    // inside the PATCH section, and the content slot says so.
    expect(sent).toContain(`its COMPLETE diff is in the PATCH above: bulk-${scoped}.txt ===`)
    const patchAt = sent.indexOf('=== PATCH ===')
    expect(patchAt).toBeGreaterThan(-1)
    expect(sent.indexOf(scoped.repeat(120_000))).toBeGreaterThan(patchAt)
    expect(sent).not.toContain('[TRUNCATED:')
    // THE RECORDER ACCEPTS IT, run rather than pattern-matched: a pass command
    // the recorder refuses is a command that clears nothing.
    const recorded = spawnSync(process.execPath, splitCommand(printed).slice(1), {
      cwd: repo,
      encoding: 'utf8',
      windowsHide: true,
      env: hermeticEnv(),
    })
    expect(recorded.status, recorded.stderr).toBe(0)
    const ledger = readFileSync(join(repo, '.claude', 'mechanism-reviews.jsonl'), 'utf8').trim().split('\n')
    expect(JSON.parse(ledger.at(-1))).toMatchObject({
      sha: bulkSha,
      pass: { index: 1, total: 2, files: [expect.stringMatching(/^bulk-[ab]\.txt$/)] },
    })
  })

  it('reviews the OTHER pass, and the two together name both files', () => {
    provenId()
    const one = run(['--sha', bulkSha, '--brief', 'judge the bulk range', '--pass', '1'])
    const two = run(['--sha', bulkSha, '--brief', 'judge the bulk range', '--pass', '2'])
    expect(two.status, two.stderr).toBe(0)
    const files = [one.stdout, two.stdout]
      .map((out) => /--pass-files "([^"]*)"/.exec(recordCommandIn(out))?.[1] ?? '')
      .join(',')
      .split(',')
    expect([...files].sort()).toEqual(['bulk-a.txt', 'bulk-b.txt'])
  })

  // THE HAND-OVER PATHS SPEND NO ROUND AND STILL OFFER A RECORD (cross-vendor
  // review, second round): both printed a whole-range template while nobody had
  // measured whether the range is reviewable in one round at all.
  it('offers no whole-range record when SOL authored a range too large, and names the passes', () => {
    writeFileSync(join(dir, 'calls.log'), '')
    const r = run(['--sha', bulkSolSha, '--brief', 'judge the bulk Sol range'])
    expect(r.status, r.stderr).toBe(3)
    expect(r.stdout).toMatch(/ROLE SWAP/)
    // The reviewer is still named — a refusal that drops it leaves nobody owning
    // the review.
    expect(r.stdout).toContain('Opus 5')
    expect(r.stdout).toContain('does not fit ONE review round')
    expect(r.stdout).toContain('--pass 1')
    expect(r.stdout).not.toContain('mechanism-review.mjs --record')
    expect(calls()).toEqual([])
  })

  it('offers no whole-range record at claude-only either, while the range does not fit', () => {
    const shareFile = join(dir, 'sol-share.json')
    writeFileSync(shareFile, JSON.stringify({ setting: 'claude-only' }))
    writeFileSync(join(dir, 'calls.log'), '')
    const r = run(['--sha', bulkSha, '--brief', 'judge the bulk range'], { SOL_SHARE_FILE: shareFile })
    expect(r.status).toBe(3)
    expect(r.stdout).toMatch(/claude-only/)
    expect(r.stdout).toContain('does not fit ONE review round')
    expect(r.stdout).toContain('bulk-a.txt')
    expect(r.stdout).not.toContain('mechanism-review.mjs --record')
    expect(calls()).toEqual([])
    rmSync(shareFile, { force: true })
  })

  it('hands over ONE PASS of a range too large when --pass names it (round-2 pass 5)', () => {
    // The flag was parsed only after the hand-off exits, so a pass-scoped
    // hand-off was unreachable: --pass was silently ignored and the report
    // covered the whole range.
    const shareFile = join(dir, 'sol-share.json')
    writeFileSync(shareFile, JSON.stringify({ setting: 'claude-only' }))
    writeFileSync(join(dir, 'calls.log'), '')
    const r = run(['--sha', bulkSha, '--brief', 'judge the bulk range', '--pass', '1'], {
      SOL_SHARE_FILE: shareFile,
    })
    expect(r.status).toBe(3)
    expect(r.stdout).toMatch(/claude-only/)
    expect(r.stdout).toContain('--pass 1/2')
    // The scope is PARSED, not merely present (round-3 pass 6): a hand-off
    // whose record command covered both bulk files would satisfy a bare
    // toContain. Pass 1 of this fixture holds exactly the first bulk file.
    const passFiles = /--pass-files "([^"]*)"/.exec(r.stdout)?.[1]
    expect(passFiles).toBe('bulk-a.txt')
    // The hand-off template carries the not-cleared warning and the ledger
    // pointer too (round-5 pass 6) — a fallback pass template without it read
    // like a cleared range.
    expect(r.stdout).toContain('NOT cleared until every pass 1..2 is recorded')
    expect(r.stdout).toContain('mechanism-review.mjs --list')
    expect(calls()).toEqual([])
    rmSync(shareFile, { force: true })
  })

  it('refuses a pass number the hand-off range does not have, exactly like the paid path', () => {
    const shareFile = join(dir, 'sol-share.json')
    writeFileSync(shareFile, JSON.stringify({ setting: 'claude-only' }))
    const r = run(['--sha', bulkSha, '--brief', 'judge the bulk range', '--pass', '9'], {
      SOL_SHARE_FILE: shareFile,
    })
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('splits into 2 pass(es)')
    rmSync(shareFile, { force: true })
  })

  it('still hands over a record command where the range DOES fit', () => {
    // The refusal is about the material, not about the hand-over: a small range
    // must keep its ready-to-run template.
    const shareFile = join(dir, 'sol-share.json')
    writeFileSync(shareFile, JSON.stringify({ setting: 'claude-only' }))
    const r = run(['--sha', headSha, '--brief', 'judge the ordinary range'], { SOL_SHARE_FILE: shareFile })
    expect(r.status).toBe(3)
    expect(recordCommandIn(r.stdout)).toContain('--verdict <merge|')
    rmSync(shareFile, { force: true })
  })

  it('refuses a pass number this range does not have', () => {
    provenId()
    const r = run(['--sha', bulkSha, '--brief', 'judge the bulk range', '--pass', '9'])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('splits into 2 pass(es)')
    expect(calls()).toEqual([])
  })

  it('refuses --pass on a range that fits, rather than recording a split nobody needs', () => {
    provenId()
    const r = run(['--sha', headSha, '--brief', 'judge the ordinary range', '--pass', '1'])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('fits in one round')
    expect(calls()).toEqual([])
  })

  it('says a range that fits does so, before the round', () => {
    provenId()
    const r = run(['--sha', headSha, '--brief', 'judge the ordinary range'])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).toContain('It fits in one round.')
  })

  it('retires carry planning because recorded contribution coverage now persists directly', () => {
    provenId()
    const r = run([
      '--sha', bulkSha,
      '--brief', 'judge the remaining contributions',
      '--carry-from', headSha,
    ])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('--carry-from is obsolete')
    expect(r.stderr).toContain('commit/file contributions')
    expect(calls()).toEqual([])
  })
})
