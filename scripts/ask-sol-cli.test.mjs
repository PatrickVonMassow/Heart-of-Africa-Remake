// THE ASK COMMAND AS IT IS ACTUALLY RUN (point 654) — spawned against a STUB `codex` on
// PATH, so no network is touched and no allowance is spent. The core suite beside this
// proves the decisions; this proves the command around them: the exit codes a caller
// reads, that the material really travels on stdin, and above all that the SWITCH is
// asked BEFORE anything is sent — a switch that only prints would protect no allowance.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI = join(HERE, 'ask-sol.mjs')

/** A `codex` that answers however the case's env asks it to. */
const STUB = `#!/usr/bin/env node
const { readFileSync, writeFileSync, appendFileSync } = require('node:fs')
const argv = process.argv.slice(2)
if (argv[0] === '--version') {
  process.stdout.write('codex-cli 0.147.0\\n')
  process.exit(0)
}
const out = argv[argv.indexOf('-o') + 1]
const model = argv[argv.indexOf('-m') + 1]
let stdin = ''
try { stdin = readFileSync(0, 'utf8') } catch {}
writeFileSync(process.env.STUB_STDIN, stdin)
writeFileSync(process.env.STUB_PROMPT, argv[argv.length - 1])
appendFileSync(process.env.STUB_LOG, model + '\\n')
if (model !== 'gpt-5.6-sol') {
  process.stderr.write('The requested model is not supported when using Codex with a ChatGPT account.\\n')
  process.exit(1)
}
if (process.env.STUB_MODE === 'fail') {
  process.stderr.write('stream error: You are not logged in. Run \`codex login\`.\\n')
  process.exit(1)
}
const answer = process.env.STUB_ANSWER || 'CAUSE: the fixture writes the frame before the shutter\\nEVIDENCE: scripts/verify/place.mjs:212 writes outside frameSubject'
if (out) writeFileSync(out, answer)
process.stdout.write(answer)
process.exit(0)
`

let dir = ''
let stubDir = ''
let stateDir = ''
let shareFile = ''
let materialFile = ''

const run = (args, env = {}) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    // stdin is closed rather than inherited: an inherited terminal would make the
    // command wait for material that never comes.
    input: env.INPUT ?? '',
    env: {
      ...process.env,
      PATH: `${stubDir}${delimiter}${process.env.PATH}`,
      REVIEW_SOL_STATE_DIR: stateDir,
      SOL_SHARE_FILE: shareFile,
      STUB_LOG: join(dir, 'calls.log'),
      STUB_STDIN: join(dir, 'stdin.txt'),
      STUB_PROMPT: join(dir, 'prompt.txt'),
      ...env,
    },
  })

const setting = (value) => writeFileSync(shareFile, JSON.stringify({ setting: value }))
const calls = () => readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean)
const clearCalls = () => writeFileSync(join(dir, 'calls.log'), '')

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'hoa-ask-sol-'))
  stubDir = join(dir, 'bin')
  stateDir = join(dir, 'state')
  mkdirSync(stubDir, { recursive: true })
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(join(stubDir, 'codex'), STUB)
  chmodSync(join(stubDir, 'codex'), 0o755)
  shareFile = join(dir, 'sol-share.json')
  setting('prefer-sol')
  materialFile = join(dir, 'suite.log')
  writeFileSync(materialFile, 'FAIL place: the frame shows the port, not the village\n')
  clearCalls()
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('what it refuses before spending anything', () => {
  it('demands a kind and a question, with usage and exit 2', () => {
    const r = run(['--kind', 'diagnose'])
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/--kind .* and --brief are both required/)
    const bad = run(['--kind', 'author', '--brief', 'x'])
    expect(bad.status).toBe(2)
  })

  it('sends NOTHING while the switch routes this kind to Claude, and says which way out', () => {
    setting('default')
    clearCalls()
    const r = run(['--kind', 'diagnose', '--brief', 'why is it red?', '--file', materialFile])
    expect(r.status).toBe(3)
    expect(r.stderr).toMatch(/share switch is at `default`/)
    expect(r.stderr).toMatch(/sol-share\.mjs --more/)
    expect(calls()).toEqual([])
  })

  // Audit finding, 12.08.2026: a consumer that reads the setting but not the problem
  // presents a fallback as the operator's choice. This is the guarantee, at the consumer.
  it('SAYS SO when the setting it acted on came from a broken file', () => {
    writeFileSync(shareFile, '{ not json at all')
    clearCalls()
    const r = run(['--kind', 'diagnose', '--brief', 'why?', '--file', materialFile])
    expect(r.stderr).toMatch(/share setting is UNUSABLE/)
    // …and it acted on the safe setting, so nothing was sent.
    expect(r.status).toBe(3)
    expect(calls()).toEqual([])
  })

  it('runs anyway on an explicit --anyway, the override being deliberate', () => {
    setting('default')
    clearCalls()
    const r = run(['--kind', 'diagnose', '--brief', 'why is it red?', '--file', materialFile, '--anyway'])
    expect(r.status, r.stderr).toBe(0)
    expect(calls()).toContain('gpt-5.6-sol')
  })

  it('refuses to send an empty request when nothing was given as material', () => {
    setting('prefer-sol')
    clearCalls()
    // Even with NO probe receipt: a request with nothing to send must cost no codex call
    // at all, and the probe is a codex call (cross-vendor review, 12.08.2026).
    rmSync(join(stateDir, 'review-sol-probe.json'), { force: true })
    const r = run(['--kind', 'explain', '--brief', 'what does it do?'])
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/no material at all/)
    expect(calls()).toEqual([])
  })

  // Same review: an unreadable file used to travel as "(could not be read: …)", which is
  // text a model will happily answer ABOUT — a shaped answer about nothing.
  it('refuses a request whose material is ENTIRELY placeholders, naming what failed', () => {
    setting('prefer-sol')
    clearCalls()
    rmSync(join(stateDir, 'review-sol-probe.json'), { force: true })
    const r = run(['--kind', 'diagnose', '--brief', 'why?', '--log', join(dir, 'does-not-exist.log')])
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/material MISSING/)
    expect(r.stderr).toMatch(/NOTHING of the material actually travelled/)
    expect(calls()).toEqual([])
  })

  // Second cross-vendor round: "the read succeeded" is not "something travelled" — a
  // readable but EMPTY file carries nothing, and a shaped answer about it would be an
  // answer about nothing.
  it('refuses a request whose only material is a readable but EMPTY file', () => {
    setting('prefer-sol')
    clearCalls()
    rmSync(join(stateDir, 'review-sol-probe.json'), { force: true })
    const empty = join(dir, 'empty.log')
    writeFileSync(empty, '   \n')
    const r = run(['--kind', 'diagnose', '--brief', 'why?', '--log', empty])
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/EMPTY or DROPPED/)
    expect(calls()).toEqual([])
  })

  it('names a failed read but still runs when the rest of the material is real', () => {
    setting('prefer-sol')
    clearCalls()
    const r = run(['--kind', 'diagnose', '--brief', 'why?', '--file', materialFile, '--log', join(dir, 'does-not-exist.log')])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).toMatch(/material MISSING/)
    expect(calls()).toContain('gpt-5.6-sol')
  })
})

describe('an ask that runs', () => {
  it('proves the model id first, sends the material on stdin and prints the answer', () => {
    setting('prefer-sol')
    clearCalls()
    // With no receipt the id must be PROVEN before a word is attributed to Sol.
    rmSync(join(stateDir, 'review-sol-probe.json'), { force: true })
    const r = run(['--kind', 'diagnose', '--brief', 'why did the place suite go red?', '--file', materialFile], { INPUT: 'piped material too\n' })
    expect(r.status, r.stderr).toBe(0)
    // The unknown id is asked FIRST (the probe), then the real one: that refusal is the
    // whole proof that an answer attributed to Sol really is Sol's.
    expect(calls()[0]).not.toBe('gpt-5.6-sol')
    expect(calls().at(-1)).toBe('gpt-5.6-sol')
    const sent = readFileSync(join(dir, 'stdin.txt'), 'utf8')
    expect(sent).toContain('piped material too')
    expect(sent).toContain('FAIL place: the frame shows the port')
    expect(readFileSync(join(dir, 'prompt.txt'), 'utf8')).toContain('why did the place suite go red?')
    expect(r.stdout).toMatch(/CAUSE:\s+the fixture writes the frame before the shutter/)
  })

  it('answers --json machine-readably, with the parsed answer and the setting it ran under', () => {
    setting('prefer-sol')
    const r = run(['--kind', 'enumerate', '--brief', 'what could go wrong?', '--file', materialFile, '--json'], {
      STUB_ANSWER: 'B1 | scripts/x.mjs | the lease is not renewed while a suite runs\nB2 | scripts/y.mjs | the fence is off after a rebuild',
    })
    expect(r.status, r.stderr).toBe(0)
    const json = JSON.parse(r.stdout)
    expect(json.kind).toBe('enumerate')
    expect(json.model).toBe('GPT-5.6 Sol')
    expect(json.setting).toBe('prefer-sol')
    expect(json.answer.entries.map((e) => e.id)).toEqual(['B1', 'B2'])
  })
})

describe('an ask that does not run', () => {
  it('names the cause in ONE line, hands the work back and exits 3 — never 0', () => {
    setting('prefer-sol')
    const r = run(['--kind', 'audit', '--brief', 'sweep it', '--file', materialFile], { STUB_MODE: 'fail' })
    expect(r.status).toBe(3)
    // ONE line names the cause — the line itself, not a paragraph the reader must mine.
    const said = r.stderr.split('\n').find((l) => l.includes('did NOT answer'))
    expect(said).toMatch(/did NOT answer this audit: .*login/i)
    expect(r.stderr).toMatch(/Do it in the Claude chain/)
  })

  it('treats an answer without its shape as no answer at all, and shows what came back', () => {
    setting('prefer-sol')
    const r = run(['--kind', 'diagnose', '--brief', 'why?', '--file', materialFile], { STUB_ANSWER: 'it is probably a timing thing, hard to say' })
    expect(r.status).toBe(3)
    expect(r.stderr).toMatch(/no usable answer/)
    expect(r.stderr).toMatch(/what came back, unusable as it is/)
  })

  it('treats a model that says it saw nothing as no answer, whatever shape it wrote', () => {
    setting('prefer-sol')
    const r = run(['--kind', 'diagnose', '--brief', 'why?', '--file', materialFile], {
      STUB_ANSWER: 'CAUSE: unknown\nEVIDENCE: none of my commands reached the repository, so I inspected nothing',
    })
    expect(r.status).toBe(3)
  })
})
