import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FABLE_ESCALATION_ROUNDS } from './author-routing-core.mjs'
import { writeState } from './fable-switch-core.mjs'

const root = resolve(process.cwd())
const solScript = resolve(root, 'scripts', 'author-sol.mjs')
const fableScript = resolve(root, 'scripts', 'author-fable.mjs')
const dirs = []

function fixture(state = 'on') {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-author-fable-cli-'))
  dirs.push(dir)
  const records = join(dir, 'reviews.jsonl')
  const fableSwitch = join(dir, 'fable-switch.json')
  const findings = join(dir, 'findings.md')
  writeFileSync(records, '')
  writeFileSync(fableSwitch, JSON.stringify(writeState(state, { why: 'test decision', by: 'test', now: 1 })))
  writeFileSync(findings, 'F1 | scripts/a.mjs | retain the invariant\n')
  return { records, fableSwitch, findings }
}

function run(script, args, state = 'on') {
  const files = fixture(state)
  return spawnSync(process.execPath, [script, ...args.map((arg) => arg === '<findings>' ? files.findings : arg)], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      AUTHOR_REVIEW_RECORDS_FILE: files.records,
      FABLE_SWITCH_FILE: files.fableSwitch,
    },
  })
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true })
})

describe('Fable authoring CLI', () => {
  it('names the serving command in the shared routing report', () => {
    const result = run(solScript, ['--routing', '--point', '834', '--rounds', String(FABLE_ESCALATION_ROUNDS)])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('point 834 → fable (Fable 5)')
    expect(result.stdout).toContain('commission: node scripts/author-fable.mjs --point 834')
  })

  it('redirects a Sol dry-run to the command that serves the Fable lane instead of refusing it', () => {
    const result = run(solScript, ['--point', '834', '--rounds', String(FABLE_ESCALATION_ROUNDS), '--dry-run'])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr).toContain('node scripts/author-fable.mjs --point 834')
    expect(result.stderr).not.toContain('not to GPT-5.6 Sol')
  })

  it('prints a no-fallback Fable commission with the correct prompt and reviewer', () => {
    const result = run(fableScript, [
      '--point',
      '999991',
      '--rounds',
      String(FABLE_ESCALATION_ROUNDS),
      '--findings',
      '<findings>',
      '--dry-run',
    ])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('claude -p <the prompt> --model claude-fable-5 --output-format json')
    expect(result.stdout).not.toContain('--fallback-model')
    expect(result.stdout).toContain('as Fable 5')
    expect(result.stdout).toContain('Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>')
    expect(result.stdout).toContain('A GPT-5.6 Sol session then REVIEWS')
    expect(result.stdout).toContain('Do NOT push, do NOT merge')
  })

  it('does not let --anyway bypass the shared Fable switch', () => {
    const result = run(fableScript, [
      '--point',
      '999991',
      '--rounds',
      String(FABLE_ESCALATION_ROUNDS),
      '--findings',
      '<findings>',
      '--anyway',
      '--dry-run',
    ], 'off')
    expect(result.status).toBe(3)
    expect(result.stderr).toContain('Fable 5 is switched off')
  })
})
