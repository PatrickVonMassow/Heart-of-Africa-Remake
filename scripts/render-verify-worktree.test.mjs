import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { withoutGitLocalEnvironment } from './repo-paths.mjs'

const SOURCE = resolve(process.cwd(), 'scripts')
const fixtures = []
const cleanEnv = withoutGitLocalEnvironment()

function node(cwd, code, extraEnv = {}) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd, encoding: 'utf8', timeout: 20_000,
    env: { ...cleanEnv, HOA_REPO_ROOT: cwd, ...extraEnv },
  }).trim()
}

function fixture() {
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
  git('commit', '--allow-empty', '-qm', 'seed')
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
