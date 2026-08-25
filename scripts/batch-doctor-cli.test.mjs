// THE DOCTOR'S CLI ENTRY MUST ACTUALLY LOAD.
//
// `batch-doctor-core.mjs` is covered thoroughly, but nothing loaded
// `batch-doctor.mjs` itself — so when `repo-paths.mjs` dropped its
// `CHECKOUT_ROOT` export, the CLI died at import with a SyntaxError while every
// suite stayed green, and each SessionStart reported a torn tree no repair
// could clear. A drill that recreates an action's aftermath stays green over a
// broken action: these cases RUN the command.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { repoPath } from './repo-paths.mjs'

const CLI = repoPath('scripts', 'batch-doctor.mjs')

let sandbox

beforeAll(() => {
  // Point the CLI at a throwaway root so its diagnosis and its log never touch
  // the live batch state.
  sandbox = mkdtempSync(join(tmpdir(), 'doctor-cli-'))
  mkdirSync(join(sandbox, '.claude'), { recursive: true })
  execFileSync('git', ['init', '-q', '-b', 'main', sandbox], { stdio: 'ignore' })
  const git = (...args) => execFileSync('git', ['-C', sandbox, ...args], { stdio: 'ignore' })
  git('config', 'user.email', 'doctor@test')
  git('config', 'user.name', 'doctor')
  writeFileSync(join(sandbox, 'TASKS.md'), '# Work order\n')
  git('add', '-A')
  // The doctor inspects HEAD, so the sandbox needs a commit to diagnose at all.
  git('commit', '-qm', 'seed')
})

afterAll(() => rmSync(sandbox, { recursive: true, force: true }))

// --gate is the read-only lane: it diagnoses and never remediates.
const runGate = () => {
  try {
    return execFileSync('node', [CLI, '--gate'], {
      encoding: 'utf8',
      cwd: sandbox,
      env: { ...process.env, HOA_REPO_ROOT: sandbox },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
}

describe('batch-doctor CLI entry', () => {
  it('imports every symbol it names, so the module evaluates', () => {
    const out = runGate()
    expect(out).not.toMatch(/SyntaxError|does not provide an export|Cannot find module/)
    expect(out).toMatch(/doctor run starting/)
  })

  it('gets past module evaluation all the way to a verdict', () => {
    expect(runGate()).toMatch(/VERDICT:/)
  })
})
