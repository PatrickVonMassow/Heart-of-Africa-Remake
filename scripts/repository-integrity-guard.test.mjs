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

  it('names added, removed, and moved refs with their old and new object ids', () => {
    runGit('branch', 'removed-fixture-branch')
    const verify = protectRepository(repo)
    const oldObject = runGit('rev-parse', 'main')
    const newObject = runGit('commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'fixture ref move')
    runGit('branch', '-D', 'removed-fixture-branch')
    runGit('update-ref', 'refs/heads/main', newObject, oldObject)
    runGit('branch', 'added-fixture-branch', newObject)

    expect(verify).toThrow(
      new RegExp(
        `refs changed: refs/heads/added-fixture-branch <absent> -> ${newObject}, ` +
          `refs/heads/main ${oldObject} -> ${newObject}, ` +
          `refs/heads/removed-fixture-branch ${oldObject} -> <absent>`,
      ),
    )
  })

  it('ignores remote-tracking updates made by the external branch pusher', () => {
    const verify = protectRepository(repo)
    runGit('update-ref', 'refs/remotes/origin/main', 'HEAD')
    expect(verify).not.toThrow()
  })

  it('does not blame the suite for a ref change that could come from another worktree', () => {
    const verify = protectRepository(repo)
    const oldObject = runGit('rev-parse', 'main')
    const newObject = runGit('commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'concurrent commit')
    runGit('update-ref', 'refs/heads/main', newObject, oldObject)

    let failure
    try {
      verify()
    } catch (error) {
      failure = error
    }
    expect(failure?.message).toContain('LIVE REPOSITORY CHANGED WHILE UNIT SUITE RAN')
    expect(failure?.message).toContain(
      'a legitimate commit or branch operation in another worktree during the run produces the same result',
    )
    expect(failure?.message).not.toContain('UNIT SUITE MUTATED')
  })

  it('fails when the shared repository config changes', () => {
    const paths = repositoryStatePaths(repo)
    const verify = protectRepository(repo)
    appendFileSync(paths.configPath, '\n[core]\n\tbare = true\n')
    expect(verify).toThrow(/config changed \(keys: core\.bare\)/)
  })

  it('fails when the checkout HEAD changes', () => {
    const paths = repositoryStatePaths(repo)
    const verify = protectRepository(repo)
    writeFileSync(paths.headPath, 'ref: refs/heads/escaped\n')
    expect(verify).toThrow(
      /head changed: "ref: refs\/heads\/main" -> "ref: refs\/heads\/escaped"/,
    )
  })
})
