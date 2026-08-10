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
  // The recorder too: the suite RUNS the record command the report prints, which
  // is the only honest way to claim that command is complete.
  'mechanism-review.mjs',
  'mechanism-review-core.mjs',
  'repo-paths.mjs',
  'is-main.mjs',
]

let dir = ''
let repo = ''
let stubDir = ''
let stateDir = ''
let script = ''
let mainSha = ''
let headSha = ''
let fableSha = ''
let orphanSha = ''

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
const answer = process.env.STUB_ANSWER || 'VERDICT: merge\\nEVIDENCE: read the whole range and both test files'
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

const git = (...args) => {
  const r = spawnSync('git', ['-C', repo, '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=', ...args], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, ...HERMETIC_GIT },
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
    env: {
      ...process.env,
      ...HERMETIC_GIT,
      PATH: `${stubDir}${delimiter}${process.env.PATH}`,
      REVIEW_SOL_STATE_DIR: stateDir,
      CODEX_HOME: join(dir, 'codex-home'),
      STUB_LOG: join(dir, 'calls.log'),
      STUB_STDIN: join(dir, 'stdin.txt'),
      ...env,
    },
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
  spawnSync('git', ['init', '-q', '-b', 'main', repo], { windowsHide: true })
  script = join(repo, 'scripts', 'review-sol.mjs')
  for (const file of SCRIPT_FILES) copyFileSync(resolve('scripts', file), join(repo, 'scripts', file))
  // `local/` is ignored here as it is in the real repository — the saved-login
  // path is refused unless git PROVES it ignored, and that proof is a property
  // of the checkout the file lives in.
  writeFileSync(join(repo, '.gitignore'), '/local/\nnode_modules\n')
  mainSha = commit('world.txt', 'the fixture world\n', 'Lay down the fixture world', 'Opus 5')

  git('checkout', '-q', '-b', 'feat')
  commit('world.txt', 'the fixture world, revised\n', 'Revise the world', 'Opus 5')
  headSha = commit('added.txt', 'a file the patch carries whole\n', 'Add a file', 'Opus 5')

  git('checkout', '-q', '-b', 'fable-work', 'main')
  fableSha = commit('fable.txt', 'written by the fallback reviewer\n', 'Write something as Fable', 'Fable 5')

  // A history sharing no ancestor with the rest: the third form of "not a proper
  // ancestor", which merge-base answers with nothing at all.
  git('checkout', '-q', '--orphan', 'unrelated')
  git('rm', '-rqf', '--ignore-unmatch', '.')
  orphanSha = commit('orphan.txt', 'no common ancestor with anything\n', 'Start an unrelated history', 'Opus 5')
  git('checkout', '-q', '-f', 'feat')
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

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
      env: { ...process.env, ...HERMETIC_GIT },
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
    // …and it is the whole BRANCH, both commits above main, not just the head.
    expect(received).toContain('the fixture world, revised')
    expect(received).toContain('a file the patch carries whole')
    expect(r.stderr).toMatch(/material: \d+ characters/)
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
    // The printed record cannot be run as it stands: the verdict is a placeholder.
    expect(r.stdout).toMatch(/--verdict <merge\|merge-with-fixes\|do-not-merge>/)
    expect(r.stdout).not.toContain('--model "GPT-5.6 Sol"')
  })

  it('treats an answer that admits it saw nothing as no review at all', () => {
    provenId()
    const r = run(['--sha', headSha, '--brief', 'judge it'], {
      STUB_ANSWER: 'VERDICT: do-not-merge\nEVIDENCE: I could not read the repository, so nothing was verified',
    })
    expect(r.status).toBe(3)
    expect(r.stdout).toContain('FALLBACK')
  })

  it('hands a Fable-authored range to Opus 5, never back to Fable', () => {
    provenId()
    const r = run(['--sha', fableSha, '--brief', 'judge it'], { STUB_MODE: 'fail' })
    expect(r.status).toBe(3)
    expect(r.stdout).toContain(SECOND_FALLBACK_MODEL_NAME)
    expect(r.stdout).toContain(`--model "${SECOND_FALLBACK_MODEL_NAME}"`)
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
    symlinkSync(elsewhere, linked)
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
