import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertRepositoryUnchanged,
  protectRepository,
  repositoryState,
  repositoryStatePaths,
} from './repository-integrity-guard.mjs'

describe('unit-suite repository integrity guard', () => {
  let repo
  let runGit

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'hoa-repository-integrity-'))
    runGit = (...args) =>
      execFileSync('git', ['-C', repo, '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=', ...args], {
        encoding: 'utf8',
        windowsHide: true,
      }).trim()
    runGit('init', '-q', '-b', 'main')
    runGit('config', 'user.name', 'repository integrity test')
    runGit('config', 'user.email', 'integrity@test.invalid')
    writeFileSync(join(repo, 'seed.txt'), 'seed\n')
    runGit('add', 'seed.txt')
    runGit('commit', '-q', '-m', 'seed fixture')
  })

  afterEach(() => rmSync(repo, { recursive: true, force: true }))

  it('accepts a byte-identical repository', () => {
    const paths = repositoryStatePaths(repo)
    expect(() => assertRepositoryUnchanged(repositoryState(paths), repositoryState(paths))).not.toThrow()
  })

  it('fails when any ref changes', () => {
    const verify = protectRepository(repo)
    runGit('branch', 'escaped-fixture-branch')
    expect(verify).toThrow(/refs changed/)
  })

  it('ignores remote-tracking updates made by the external branch pusher', () => {
    const verify = protectRepository(repo)
    runGit('update-ref', 'refs/remotes/origin/main', 'HEAD')
    expect(verify).not.toThrow()
  })

  it('fails when the shared repository config changes', () => {
    const paths = repositoryStatePaths(repo)
    const verify = protectRepository(repo)
    appendFileSync(paths.configPath, '\n[core]\n\tbare = true\n')
    expect(verify).toThrow(/config changed/)
  })

  it('fails when the checkout HEAD changes', () => {
    const paths = repositoryStatePaths(repo)
    const verify = protectRepository(repo)
    writeFileSync(paths.headPath, 'ref: refs/heads/escaped\n')
    expect(verify).toThrow(/head changed/)
  })
})
