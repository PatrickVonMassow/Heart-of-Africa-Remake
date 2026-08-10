// THE COMMAND ITSELF, NOT ONLY ITS DECISION CORE (point 624, second
// cross-vendor round).
//
// The reviewer's sharpest finding was about the test suite rather than the code:
// every case ran against the pure core, so the WRAPPER — the exit codes, the
// range gathering, the probe gate, the handover text, the login refusals — was
// unproven, and two real defects passed a green run. So the real command is
// spawned here against a STUB `codex` on PATH: no network, no allowance spent,
// and every path the operator actually walks is exercised.
//
// All state is redirected into a temp directory (`REVIEW_SOL_STATE_DIR`,
// `CODEX_HOME`), so this suite never touches the developer's checkout or login.
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { FALLBACK_MODEL_NAME, SOL_MODEL_NAME } from './review-sol-core.mjs'

const SCRIPT = resolve(process.cwd(), 'scripts', 'review-sol.mjs')

let dir = ''
let stubDir = ''
let stateDir = ''

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

const run = (args, env = {}) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    windowsHide: true,
    encoding: 'utf8',
    cwd: process.cwd(),
    env: {
      ...process.env,
      PATH: `${stubDir}${delimiter}${process.env.PATH}`,
      REVIEW_SOL_STATE_DIR: stateDir,
      CODEX_HOME: join(dir, 'codex-home'),
      STUB_LOG: join(dir, 'calls.log'),
      STUB_STDIN: join(dir, 'stdin.txt'),
      ...env,
    },
  })

const calls = () => {
  try {
    return readFileSync(join(dir, 'calls.log'), 'utf8').split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/** A probe receipt that is fresh, so a case can skip the probe it is not testing. */
const provenId = () =>
  writeFileSync(join(stateDir, 'review-sol-probe.json'), JSON.stringify({ at: Date.now(), refused: true }))

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'review-sol-cli-'))
  stubDir = join(dir, 'bin')
  stateDir = join(dir, 'state')
  mkdirSync(stubDir, { recursive: true })
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(join(stubDir, 'codex'), STUB)
  chmodSync(join(stubDir, 'codex'), 0o755)
  writeFileSync(join(dir, 'calls.log'), '')
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('a review that runs', () => {
  it('prints the reviewer, its answer and a complete record command, and exits 0', () => {
    provenId()
    const r = run(['--sha', 'HEAD', '--point', '624', '--brief', 'judge the fallback path'])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain(SOL_MODEL_NAME)
    expect(r.stdout).toContain('read the whole range and both test files')
    expect(r.stdout).toContain('--model "GPT-5.6 Sol"')
    expect(r.stdout).toContain('--verdict merge')
    expect(r.stdout).toContain('--point 624')
    // The material really REACHES the model — asserted on what the process
    // received, not on the caller's own log line.
    const received = readFileSync(join(dir, 'stdin.txt'), 'utf8')
    expect(received).toContain('=== DIFFSTAT ===')
    expect(received).toContain('=== PATCH ===')
    expect(received).toContain('diff --git')
    expect(r.stderr).toMatch(/material: \d+ characters/)
  })
})

describe('a review that does not run', () => {
  it('names the cause, hands the review on, and exits 3 — never 0', () => {
    provenId()
    const r = run(['--sha', 'HEAD', '--brief', 'judge the fallback path'], { STUB_MODE: 'fail' })
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
    const r = run(['--sha', 'HEAD', '--brief', 'judge it'], {
      STUB_ANSWER: 'VERDICT: do-not-merge\nEVIDENCE: I could not read the repository, so nothing was verified',
    })
    expect(r.status).toBe(3)
    expect(r.stdout).toContain('FALLBACK')
  })
})

describe('the guards around the run', () => {
  it('refuses a --since ref that does not exist instead of silently reviewing one commit', () => {
    provenId()
    const r = run(['--sha', 'HEAD', '--since', 'no-such-branch-here', '--brief', 'judge it'])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/no such commit/)
  })

  it('refuses to review a commit that does not diverge from main without a named range', () => {
    // A record covers every commit it CONTAINS, so showing the reviewer one
    // commit while clearing its ancestors is the hole (third round). Naming the
    // range explicitly is accepted.
    provenId()
    const onMain = spawnSync('git', ['rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim()
    const r = run(['--sha', onMain, '--brief', 'judge it'])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/does not diverge/)
    expect(r.stderr).toMatch(/--since/)
    // A narrowed range is allowed — but it may not be RECORDED, because the
    // record would clear commits this reviewer never saw (fourth round).
    const narrow = run(['--sha', onMain, '--since', `${onMain}~1`, '--brief', 'judge it'])
    expect(narrow.status).toBe(0)
    expect(narrow.stdout).toMatch(/NO RECORD COMMAND IS PRINTED/)
    expect(narrow.stdout).not.toContain('mechanism-review.mjs --record')
  })

  it('refuses an explicit --since that is not a proper ancestor of the sha', () => {
    provenId()
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim()
    // The sha itself, and a descendant of the range start: both would show the
    // reviewer less than the record clears (four-eyes finding, fourth round).
    for (const since of [head, 'HEAD']) {
      const r = run(['--sha', `${head}~1`, '--since', since, '--brief', 'judge it'])
      expect(r.status).not.toBe(0)
      expect(r.stderr).toMatch(/--since/)
    }
  })

  it('refuses a sha that is not a commit', () => {
    provenId()
    const r = run(['--sha', 'deadbeefdeadbeef', '--brief', 'judge it'])
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/not a commit/)
  })

  it('PROVES the model id before attributing a review to it, and remembers the proof', () => {
    rmSync(join(stateDir, 'review-sol-probe.json'), { force: true })
    writeFileSync(join(dir, 'calls.log'), '')
    const r = run(['--sha', 'HEAD', '--brief', 'judge it'])
    expect(r.status).toBe(0)
    // The unknown id was tried first, then the real review ran.
    expect(calls()[0]).not.toBe('gpt-5.6-sol')
    expect(calls()).toContain('gpt-5.6-sol')
    expect(JSON.parse(readFileSync(join(stateDir, 'review-sol-probe.json'), 'utf8'))).toMatchObject({ refused: true })
    // …and the next review does not pay for the probe again.
    writeFileSync(join(dir, 'calls.log'), '')
    expect(run(['--sha', 'HEAD', '--brief', 'judge it']).status).toBe(0)
    expect(calls()).toEqual(['gpt-5.6-sol'])
  })

  it('re-proves it the moment the codex it was proven with changes', () => {
    // A cached proof is tied to the binary, its version and the account: it
    // outlives container rebuilds, and an unbound one would let another model's
    // answer be recorded as Sol's (four-eyes finding, fifth round).
    writeFileSync(join(dir, 'calls.log'), '')
    expect(run(['--sha', 'HEAD', '--brief', 'judge it'], { STUB_VERSION: 'codex-cli 9.9.9' }).status).toBe(0)
    expect(calls()).toHaveLength(2)
    expect(calls()[0]).not.toBe('gpt-5.6-sol')
  })
})

describe('the saved login', () => {
  it('says so when there is no login to save', () => {
    const r = run(['--save-login'], { CODEX_HOME: join(dir, 'empty-home') })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/no login found/)
  })

  it('REFUSES to write the token where git does not ignore it', () => {
    // A real token file is placed, so the run reaches the ignore check rather
    // than stopping one step earlier (four-eyes finding, third round).
    const home = join(dir, 'home-with-token')
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, 'auth.json'), '{"tokens":{"access_token":"secret"}}')
    const r = run(['--save-login'], { CODEX_HOME: home })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/does not ignore/)
    // …and nothing was written to the destination.
    expect(existsSync(join(stateDir, 'codex-auth.json'))).toBe(false)
  })

  it('REFUSES a state directory that is a link out of where it claims to be', () => {
    // The lexical ignore check passes for a symlinked `local/`, and the copy
    // then follows the link (four-eyes finding, third round).
    const elsewhere = join(dir, 'elsewhere')
    const linked = join(dir, 'linked-state')
    mkdirSync(elsewhere, { recursive: true })
    symlinkSync(elsewhere, linked)
    writeFileSync(join(elsewhere, 'codex-auth.json'), '{"tokens":{}}')
    const r = run(['--restore-login'], { REVIEW_SOL_STATE_DIR: linked })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/REFUSING/)
    expect(r.stderr).toMatch(/resolves to/)
  })

  it('says what to do when nothing was ever saved', () => {
    const r = run(['--restore-login'])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/nothing saved/)
    expect(r.stderr).toMatch(/--save-login/)
  })
})
