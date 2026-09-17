import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { withoutGitLocalEnvironment } from './repo-paths.mjs'
import { coverageForHead } from './render-verify-guard.mjs'
import { coveringRun, evaluate } from './render-verify-core.mjs'

const SOURCE = resolve(process.cwd(), 'scripts')
const fixtures = []
const cleanEnv = withoutGitLocalEnvironment()

function node(cwd, code, extraEnv = {}) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd, encoding: 'utf8', timeout: 20_000,
    env: { ...cleanEnv, HOA_REPO_ROOT: cwd, ...extraEnv },
  }).trim()
}

function fixture({ runner = false } = {}) {
  const parent = mkdtempSync(join(tmpdir(), 'hoa-render-worktree-'))
  const main = join(parent, 'main')
  const linked = join(main, '.claude', 'worktrees', 'point-fixture')
  mkdirSync(join(main, '.claude'), { recursive: true })
  const git = (...args) => execFileSync('git', ['-C', main, ...args], {
    env: cleanEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'core.hooksPath', join(parent, 'no-hooks'))
  writeFileSync(join(main, '.gitignore'), '.claude/\nlocal/\nverification/\n')
  mkdirSync(join(main, 'src/render'), { recursive: true })
  writeFileSync(join(main, 'src/render/fixture.ts'), 'export const color = 0\n')
  if (runner) {
    cpSync(SOURCE, join(main, 'scripts'), { recursive: true, filter: (path) => !path.endsWith('.test.mjs') })
    // Browser-free fixture: the real logging wrapper and recorder run a tiny
    // sectioned suite. This tests evidence plumbing, never claims picture proof.
    writeFileSync(join(main, 'scripts/verify/run-all.mjs'), `
      import { execFileSync, spawnSync } from 'node:child_process';
      const section = process.argv.find(a => a.startsWith('--section='))?.split('=')[1] || '';
      execFileSync(process.execPath, ['scripts/verify/settings.mjs'], {
        stdio: 'inherit', env: { ...process.env, VERIFY_SECTION: section }
      });
    `)
    writeFileSync(join(main, 'scripts/verify/settings.mjs'), `
      import { armRunRecorder, markBackendAsserted } from '../render-verify-recorder.mjs';
      import { sectionGate } from './sections.mjs';
      const { section } = sectionGate();
      armRunRecorder(process.env.VERIFY_GL || 'webgpu');
      markBackendAsserted('core');
      if (section('evidence')) console.log('PASS  fixture evidence');
      if (section('other')) console.log('PASS  fixture other');
    `)
  }
  git('add', '.')
  git('commit', '-qm', 'seed')
  git('worktree', 'add', '-qb', 'fixture', linked)
  fixtures.push({ parent, main, linked })
  return { parent, main, linked, git }
}

function cleanup(main, linked) {
  return execFileSync(process.execPath, [join(SOURCE, 'worktree-cleanup.mjs'), linked], {
    cwd: main, env: { ...cleanEnv, HOA_REPO_ROOT: main }, encoding: 'utf8', timeout: 20_000,
  })
}

afterEach(() => {
  for (const { parent, main, linked } of fixtures.splice(0)) {
    if (existsSync(linked)) cleanup(main, linked)
    rmSync(parent, { recursive: true, force: true })
  }
})

describe('verification evidence belongs to the repository', () => {
  it('writes worktree state and receipts to the main checkout, preserving checkout identity', () => {
    const { main, linked, git } = fixture()
    const stateModule = pathToFileURL(join(SOURCE, 'render-verify-state.mjs')).href
    const recordModule = pathToFileURL(join(SOURCE, 'verify/run-record.mjs')).href
    const result = JSON.parse(node(linked, `
      import { RENDER_STATE_PATH, recordRun } from ${JSON.stringify(stateModule)};
      import { ROOT, logDir, recordPathFor, writeRecord, gitPosition } from ${JSON.stringify(recordModule)};
      const log = logDir({}) + '/fixture.log';
      const position = gitPosition();
      recordRun({ ...position, backend: 'webgpu', suite: 'settings', exit: 0 });
      writeRecord(recordPathFor(log), { log, ...position });
      console.log(JSON.stringify({ ROOT, state: RENDER_STATE_PATH, log, position,
        relative: logDir({ VERIFY_LOG_DIR: 'local/custom' }),
        absolute: logDir({ VERIFY_LOG_DIR: ${JSON.stringify(join(main, 'absolute'))} }) }));
    `))
    expect(result.ROOT).toBe(linked)
    expect(result.position).toEqual({ head: git('rev-parse', '--short', 'fixture'), branch: 'fixture' })
    expect(result.state).toBe(join(main, '.claude/render-verify-state.json'))
    expect(result.log).toBe(join(main, 'local/verify-logs/fixture.log'))
    expect(result.relative).toBe(join(main, 'local/custom'))
    expect(result.absolute).toBe(join(main, 'absolute'))
    expect(existsSync(join(linked, '.claude/render-verify-state.json'))).toBe(false)
    expect(existsSync(join(linked, 'local/verify-logs'))).toBe(false)
    cleanup(main, linked)
    expect(JSON.parse(readFileSync(result.state, 'utf8')).runs).toHaveLength(1)
    expect(JSON.parse(readFileSync(`${result.log}.run.json`, 'utf8')).log).toBe(result.log)
  })
})

describe('coverage follows the verified commit', () => {
  it('accepts unchanged merged ancestors and rejects foreign, dirty, missing and superseded proof', () => {
    const { main, linked, git } = fixture()
    const renderPath = 'src/render/fixture.ts'
    const baseline = git('rev-parse', 'HEAD')
    writeFileSync(join(linked, renderPath), 'export const color = 1\n')
    git('-C', linked, 'add', renderPath)
    git('-C', linked, 'commit', '-qm', 'render change')
    const verified = git('rev-parse', 'fixture')
    const run = { head: verified, dirty: false, backend: 'webgpu', suite: 'settings', exit: 0, asserted: true, startedAt: 1, at: 2 }
    const judged = (records = [run]) => {
      const head = git('rev-parse', 'HEAD')
      const coverage = coverageForHead(records, head, { cwd: main })
      return coveringRun(coverage.runs, 'webgpu', Date.now(), { matchesTree: coverage.matchesTree })
    }
    expect(judged()).toBeNull() // branch has not landed
    git('merge', '--no-ff', '-qm', 'merge fixture', 'fixture')
    expect(git('rev-parse', 'HEAD')).not.toBe(verified)
    expect(judged()).toEqual(run) // the merge postdates the run
    expect(judged([{ ...run, dirty: true }])).toBeNull()
    expect(judged([{ ...run, head: null }])).toBeNull()
    expect(judged([{ ...run, head: 'f'.repeat(40) }])).toBeNull()
    expect(judged([{ ...run, head: baseline }])).toBeNull()
    expect(judged([{ ...run, partial: true, section: 'evidence' }])).toBeNull()
    writeFileSync(join(main, renderPath), 'export const color = 2\n')
    expect(judged()).toBeNull() // unstaged
    git('add', renderPath)
    expect(judged()).toBeNull() // staged
    git('commit', '-qm', 'later render change')
    expect(judged()).toBeNull() // committed
  })

  it('retains legacy reds but excludes runs from an unmerged sibling branch', () => {
    const { main, linked, git } = fixture()
    git('-C', linked, 'commit', '--allow-empty', '-qm', 'sibling')
    const sibling = { head: git('rev-parse', 'fixture'), exit: 1 }
    const legacy = { exit: 1 }
    const coverage = coverageForHead([legacy, sibling], git('rev-parse', 'HEAD'), { cwd: main })
    expect(coverage.runs).toEqual([legacy])
    expect(coverage.matchesTree(legacy)).toBe(false)
  })

  it('keeps a section, full-run receipts and logs readable after project cleanup', () => {
    const { main, linked, git } = fixture({ runner: true })
    const baseline = git('rev-parse', 'HEAD')
    writeFileSync(join(main, '.claude/render-verify-state.json'), JSON.stringify({ clearedHeads: { main: baseline } }))
    writeFileSync(join(linked, 'src/render/fixture.ts'), 'export const color = 1\n')
    git('-C', linked, 'add', 'src/render/fixture.ts')
    git('-C', linked, 'commit', '-qm', 'render change')
    const verified = git('rev-parse', 'fixture')
    const env = { ...cleanEnv, HOA_REPO_ROOT: linked, VERIFY_NO_WAIT: '1', VERIFY_LOG_DIR: '',
      HOA_ACTIVITY_JOURNAL_PATH: join(main, 'local/activity.jsonl') }
    const run = (backend, args = []) => {
      const result = spawnSync(process.execPath,
      [join(linked, 'scripts/verify/run-logged.mjs'), 'settings', '--again', ...args],
      { cwd: linked, env: { ...env, VERIFY_GL: backend }, encoding: 'utf8', timeout: 20_000 })
      expect(result.status, result.stdout + result.stderr).toBe(0)
    }
    run('webgpu', ['--section=evidence', '--log-file', relative(linked, join(main, 'local/verify-logs/section.log'))])
    for (const backend of ['webgpu', 'webgl']) run(backend)
    const statePath = join(main, '.claude/render-verify-state.json')
    const state = JSON.parse(readFileSync(statePath, 'utf8'))
    expect(state.runs).toHaveLength(3)
    expect(state.runs[0]).toMatchObject({ head: verified, dirty: false, partial: true, section: 'evidence' })
    expect(state.runs.every(r => r.head === verified && r.dirty === false)).toBe(true)
    expect(existsSync(join(linked, 'local/verify-logs'))).toBe(false)
    git('merge', '--no-ff', '-qm', 'merge fixture', 'fixture')
    expect(cleanup(main, linked)).toContain('removed worktree')
    expect(existsSync(linked)).toBe(false)
    const records = readdirSync(join(main, 'local/verify-logs')).filter(name => name.endsWith('.run.json'))
    expect(records).toHaveLength(3)
    for (const name of records) {
      const record = JSON.parse(readFileSync(join(main, 'local/verify-logs', name), 'utf8'))
      expect(record).toMatchObject({ head: verified.slice(0, 7), branch: 'fixture', exitCode: 0, status: 'finished' })
      expect(record.receipt).toBeTruthy()
      expect(record.log.startsWith(join(main, 'local/verify-logs'))).toBe(true)
      expect(readFileSync(record.log, 'utf8')).toContain('PASS  fixture evidence')
      expect(record.cmdline).toContain(record.log)
      const shown = execFileSync(process.execPath, [join(main, 'scripts/verify/run-logged.mjs'), '--show', record.log], {
        cwd: main, env: { ...env, HOA_REPO_ROOT: main }, encoding: 'utf8', timeout: 20_000,
      })
      expect(shown).toContain('PASS  fixture evidence')
    }
    const status = execFileSync(process.execPath, [join(main, 'scripts/render-verify-guard.mjs'), '--status'], {
      cwd: main, env: { ...env, HOA_REPO_ROOT: main }, encoding: 'utf8', timeout: 20_000,
    })
    expect(status.match(/covered by settings/g)).toHaveLength(2)
    const guardModule = pathToFileURL(join(main, 'scripts/render-verify-guard.mjs')).href
    const coreModule = pathToFileURL(join(main, 'scripts/render-verify-core.mjs')).href
    const result = JSON.parse(node(main, `
      import { gatherRenderVerifyInputs } from ${JSON.stringify(guardModule)};
      import { evaluate } from ${JSON.stringify(coreModule)};
      const gathered = gatherRenderVerifyInputs({ deps: { heldByOther: () => false,
        workOrder: () => '', guardDuty: () => null } });
      console.log(JSON.stringify({ applicable: gathered.applicable, verdict: evaluate(gathered.inputs),
        runs: gathered.inputs.runs }));
    `))
    expect(result.applicable).toBe(true)
    expect(result.verdict).toMatchObject({ decision: 'allow', clear: true })
    expect(result.verdict.deferred).not.toBe(true)
    expect(result.runs).toEqual(state.runs)
    // The section survived too, but cannot replace either full covering run.
    const coverage = coverageForHead([state.runs[0]], git('rev-parse', 'HEAD'), { cwd: main })
    expect(evaluate({ head: git('rev-parse', 'HEAD'), clearedHead: baseline,
      changedRenderPaths: ['src/render/fixture.ts'], runs: coverage.runs, matchesTree: coverage.matchesTree,
    }).decision).toBe('block')
  }, 30_000)
})
