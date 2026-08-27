import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  assertRepositoryUnchanged,
  protectRepository,
  repositoryState,
  repositoryStatePaths,
  WIRED_KEY,
} from './repository-integrity.mjs'


describe('unit-suite repository integrity guard', () => {
  let repo
  let runGit
  let temporaryDirectories

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'hoa-repository-integrity-'))
    temporaryDirectories = [repo]
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

  afterEach(() => {
    for (const directory of temporaryDirectories.reverse()) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  const addLinkedWorktree = (branch = 'integrity-linked') => {
    const parent = mkdtempSync(join(tmpdir(), 'hoa-repository-integrity-linked-'))
    temporaryDirectories.push(parent)
    const linked = join(parent, 'linked')
    runGit('worktree', 'add', '-qb', branch, linked)
    return linked
  }

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

  it('fails when the worktree registry changes', () => {
    const verify = protectRepository(repo)
    addLinkedWorktree()
    expect(verify).toThrow(/worktree registrations changed/)
  })

  it('fails when any registered worktree HEAD or index changes', () => {
    const linked = addLinkedWorktree()
    const verify = protectRepository(repo)
    const gitPath = (name) =>
      execFileSync('git', ['-C', linked, 'rev-parse', '--path-format=absolute', '--git-path', name], {
        encoding: 'utf8',
        windowsHide: true,
      }).trim()
    writeFileSync(gitPath('HEAD'), 'ref: refs/heads/escaped-linked-head\n')
    writeFileSync(gitPath('index'), 'escaped fixture index\n')
    expect(verify).toThrow(/one or more worktree HEADs changed; one or more worktree indexes changed/)
  })

  it('makes the Vitest run red when a fixture writes into the common checkout', () => {
    const linked = addLinkedWorktree('integrity-runner')
    const detectorUrl = pathToFileURL(resolve('scripts/repository-integrity.mjs')).href
    const vitestPackage = dirname(createRequire(import.meta.url).resolve('vitest'))
    const vitestUrl = pathToFileURL(join(vitestPackage, 'dist', 'index.js')).href
    const cli = join(vitestPackage, 'vitest.mjs')
    writeFileSync(
      join(linked, 'vitest.config.mjs'),
      `export default { test: { environment: 'node', globalSetup: [${JSON.stringify(detectorUrl)}], include: ['escape.test.mjs'] } }\n`,
    )
    writeFileSync(
      join(linked, 'escape.test.mjs'),
      `import { execFileSync } from 'node:child_process'\n` +
        `import { it } from ${JSON.stringify(vitestUrl)}\n` +
        `it('writes through the shared ref store', () => {\n` +
        `  execFileSync('git', ['-C', ${JSON.stringify(repo)}, 'branch', 'escaped-by-fixture'])\n` +
        `})\n`,
    )
    const result = spawnSync(process.execPath, [cli, 'run', '--config', 'vitest.config.mjs'], {
      cwd: linked,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
      windowsHide: true,
    })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    expect(result.status).not.toBe(0)
    expect(output).toContain('LIVE REPOSITORY CHANGED WHILE UNIT SUITE RAN')
    expect(output).toContain('refs/heads/escaped-by-fixture')
  }, 20_000)

  it('scrubs a linked-worktree GIT_DIR before fixture workers can inherit it', () => {
    const linked = addLinkedWorktree('integrity-polluted-runner')
    const fixture = mkdtempSync(join(tmpdir(), 'hoa-repository-integrity-fixture-'))
    temporaryDirectories.push(fixture)
    const detectorUrl = pathToFileURL(resolve('scripts/repository-integrity.mjs')).href
    const vitestPackage = dirname(createRequire(import.meta.url).resolve('vitest'))
    const vitestUrl = pathToFileURL(join(vitestPackage, 'dist', 'index.js')).href
    const cli = join(vitestPackage, 'vitest.mjs')
    writeFileSync(
      join(linked, 'vitest.config.mjs'),
      `export default { test: { environment: 'node', globalSetup: [${JSON.stringify(detectorUrl)}], include: ['polluted.test.mjs'] } }\n`,
    )
    writeFileSync(
      join(linked, 'polluted.test.mjs'),
      `import { execFileSync } from 'node:child_process'\n` +
        `import { it } from ${JSON.stringify(vitestUrl)}\n` +
        `it('keeps Git fixture work inside the fixture', () => {\n` +
        `  const fixture = ${JSON.stringify(fixture)}\n` +
        `  execFileSync('git', ['-C', fixture, 'init', '-q', '-b', 'main'])\n` +
        `  execFileSync('git', ['-C', fixture, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'seed'])\n` +
        `  execFileSync('git', ['-C', fixture, 'branch', 'fixture-only'])\n` +
        `})\n`,
    )
    const paths = repositoryStatePaths(repo)
    const before = repositoryState(paths)
    const pollutedEnvironment = {
      ...process.env,
      GIT_DIR: execFileSync('git', ['-C', linked, 'rev-parse', '--absolute-git-dir'], {
        encoding: 'utf8',
        windowsHide: true,
      }).trim(),
      GIT_PREFIX: '',
    }
    const result = spawnSync(process.execPath, [cli, 'run', '--config', 'vitest.config.mjs'], {
      cwd: linked,
      encoding: 'utf8',
      env: pollutedEnvironment,
      windowsHide: true,
    })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`

    expect(result.status, output).toBe(0)
    expect(() => assertRepositoryUnchanged(before, repositoryState(paths))).not.toThrow()
    expect(runGit('--git-dir', join(fixture, '.git'), 'show-ref', '--verify', 'refs/heads/fixture-only')).toContain(
      'refs/heads/fixture-only',
    )
  }, 20_000)
})

// THE WIRING IS PART OF THE MECHANISM, so it is asserted here rather than left to
// a registry that only knows hooks. This module is NOT a hook enforcer — it is the
// unit run's own boundary, invoked by Vitest — and it was named `-guard` at first,
// which put it in `guard-health`'s enforcer set and had that audit report an
// enforcer firing on every suite as one that can never fire (20./21.08.2026). The
// name states what it is; this case states that the runner really invokes it.
describe('the runner invokes this module', () => {
  it('really ran as globalSetup in THIS run — not merely named in a config file', () => {
    // The proof comes from the setup itself: only a real invocation can have
    // written this value, where a text search would also be satisfied by a
    // commented-out line. Reading it back is what makes the wiring a measurement.
    expect(inject(WIRED_KEY)).toBe(true)
  })
})
