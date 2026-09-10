import { afterEach, beforeEach, describe, expect, inject, it, vi } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
  let log

  beforeEach(() => {
    log = vi.spyOn(console, 'info').mockImplementation(() => {})
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

  it('logs added, removed, and moved foreign refs with their old and new object ids', () => {
    runGit('branch', 'removed-fixture-branch')
    runGit('branch', 'moved-fixture-branch')
    const verify = protectRepository(repo)
    const oldObject = runGit('rev-parse', 'main')
    const newObject = runGit('commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'foreign ref move')
    runGit('branch', '-D', 'removed-fixture-branch')
    runGit('update-ref', 'refs/heads/moved-fixture-branch', newObject, oldObject)
    runGit('branch', 'added-fixture-branch', newObject)

    expect(verify).not.toThrow()
    for (const detail of [
      `refs/heads/added-fixture-branch <absent> -> ${newObject}`,
      `refs/heads/moved-fixture-branch ${oldObject} -> ${newObject}`,
      `refs/heads/removed-fixture-branch ${oldObject} -> <absent>`,
    ]) {
      expect(log).toHaveBeenCalledWith(expect.stringContaining(`foreign ref changed: ${detail}`))
    }
  })

  it('ignores remote-tracking updates made by the external branch pusher', () => {
    const verify = protectRepository(repo)
    runGit('update-ref', 'refs/remotes/origin/main', 'HEAD')
    expect(verify).not.toThrow()
    expect(log).not.toHaveBeenCalled()
  })

  it.each(['main', 'linked'])('enforces only the %s checkout ownership', (runner) => {
    const linked = addLinkedWorktree()
    const root = runner === 'main' ? repo : linked
    const foreignRoot = runner === 'main' ? linked : repo
    const foreignPaths = repositoryStatePaths(foreignRoot)
    const foreignRef = runner === 'main' ? 'integrity-linked' : 'main'
    const verify = protectRepository(root)
    runGit('update-ref', `refs/heads/${foreignRef}`,
      runGit('commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'concurrent commit'))
    writeFileSync(foreignPaths.headPath, 'ref: refs/heads/foreign-switched\n')
    writeFileSync(foreignPaths.indexPath, 'foreign index\n')

    expect(verify).not.toThrow()
    expect(log).toHaveBeenCalledWith(expect.stringContaining(`foreign ref changed: refs/heads/${foreignRef}`))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('foreign worktree HEADs changed'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('foreign worktree indexes changed'))
  })

  it.each(['HEAD', 'index'])('logs an isolated foreign %s change without failing', (name) => {
    const linked = addLinkedWorktree()
    const paths = repositoryStatePaths(linked)
    const verify = protectRepository(repo)
    writeFileSync(name === 'HEAD' ? paths.headPath : paths.indexPath,
      name === 'HEAD' ? 'ref: refs/heads/foreign-switched\n' : 'foreign index\n')
    expect(verify).not.toThrow()
    expect(log).toHaveBeenCalledWith(expect.stringContaining(
      name === 'HEAD' ? 'foreign worktree HEADs changed' : 'foreign worktree indexes changed',
    ))
  })

  it.each(['add', 'remove'])('logs worktree registration %s without failing', (operation) => {
    const linked = addLinkedWorktree()
    const verify = protectRepository(repo)
    if (operation === 'add') addLinkedWorktree('another-linked')
    else runGit('worktree', 'remove', linked)
    expect(verify).not.toThrow()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('worktree registrations changed'))
  })

  describe.each(['main', 'linked'])('running %s checkout', (runner) => {
    let root
    beforeEach(() => {
      root = runner === 'main' ? repo : addLinkedWorktree()
    })

    it('fails when the shared config changes', () => {
      const paths = repositoryStatePaths(root)
      const verify = protectRepository(root)
      appendFileSync(paths.configPath, '\n[core]\n\tbare = true\n')
      expect(verify).toThrow(/config changed \(keys: core\.bare\)/)
    })

    it('fails when its HEAD changes', () => {
      const paths = repositoryStatePaths(root)
      const verify = protectRepository(root)
      writeFileSync(paths.headPath, 'ref: refs/heads/escaped\n')
      expect(verify).toThrow(/head changed: .* -> "ref: refs\/heads\/escaped"/)
    })

    it.each(['move', 'delete'])('fails on its own branch ref %s even with unchanged HEAD bytes', (operation) => {
      const verify = protectRepository(root)
      const ref = `refs/heads/${runner === 'main' ? 'main' : 'integrity-linked'}`
      const oldObject = runGit('rev-parse', ref)
      const newObject = runGit('commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'own ref move')
      if (operation === 'move') runGit('update-ref', ref, newObject, oldObject)
      else runGit('update-ref', '-d', ref)
      expect(verify).toThrow(`own branch ref changed: ${ref} ${oldObject} -> ${operation === 'move' ? newObject : '<absent>'}`)
    })

    it.each(['modify', 'delete', 'create'])('fails on its own index %s', (operation) => {
      const paths = repositoryStatePaths(root)
      if (operation === 'create') unlinkSync(paths.indexPath)
      const verify = protectRepository(root)
      if (operation === 'delete') unlinkSync(paths.indexPath)
      else writeFileSync(paths.indexPath, 'escaped fixture index\n')
      expect(verify).toThrow(/own index changed/)
    })

    it('still fails on owned damage while reporting foreign changes', () => {
      const paths = repositoryStatePaths(root)
      const verify = protectRepository(root)
      runGit('branch', 'foreign-added')
      writeFileSync(paths.indexPath, 'escaped fixture index\n')
      expect(verify).toThrow(/LIVE REPOSITORY CHANGED WHILE UNIT SUITE RAN: own index changed/)
      expect(log).toHaveBeenCalledWith(expect.stringContaining('foreign ref changed: refs/heads/foreign-added'))
    })
  })

  it('protects detached HEAD bytes without owning the previously checked-out branch', () => {
    runGit('checkout', '--detach', '-q')
    const verify = protectRepository(repo)
    const newObject = runGit('commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'foreign branch move')
    runGit('update-ref', 'refs/heads/main', newObject)
    expect(verify).not.toThrow()
    writeFileSync(repositoryStatePaths(repo).headPath, `${newObject}\n`)
    expect(verify).toThrow(/head changed/)
  })

  it('protects an unborn branch ref and accepts a persistently absent index', () => {
    runGit('checkout', '--orphan', 'unborn', '-q')
    const paths = repositoryStatePaths(repo)
    unlinkSync(paths.indexPath)
    const verify = protectRepository(repo)
    expect(verify).not.toThrow()
    runGit('update-ref', 'refs/heads/unborn', 'main')
    expect(verify).toThrow(/own branch ref changed: refs\/heads\/unborn <absent> ->/)
  })

  it.each(['own', 'foreign'])('returns the correct Vitest exit status for a %s branch mutation', (owner) => {
    const linked = addLinkedWorktree('integrity-runner')
    const detectorUrl = pathToFileURL(resolve('scripts/repository-integrity.mjs')).href
    const vitestPackage = dirname(createRequire(import.meta.url).resolve('vitest'))
    const vitestUrl = pathToFileURL(join(vitestPackage, 'dist', 'index.js')).href
    const cli = join(vitestPackage, 'vitest.mjs')
    const ref = owner === 'own' ? 'refs/heads/integrity-runner' : 'refs/heads/main'
    writeFileSync(
      join(linked, 'vitest.config.mjs'),
      `export default { test: { environment: 'node', globalSetup: [${JSON.stringify(detectorUrl)}], include: ['escape.test.mjs'] } }\n`,
    )
    writeFileSync(
      join(linked, 'escape.test.mjs'),
      `import { execFileSync } from 'node:child_process'\n` +
        `import { it } from ${JSON.stringify(vitestUrl)}\n` +
        `it('writes through the shared ref store', () => {\n` +
        `  execFileSync('git', ['-C', ${JSON.stringify(linked)}, 'update-ref', '-d', ${JSON.stringify(ref)}])\n` +
        `})\n`,
    )
    const result = spawnSync(process.execPath, [cli, 'run', '--config', 'vitest.config.mjs'], {
      cwd: linked,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
      windowsHide: true,
    })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    expect(result.status, output).toBe(owner === 'own' ? 1 : 0)
    expect(output).toContain(owner === 'own'
      ? 'LIVE REPOSITORY CHANGED WHILE UNIT SUITE RAN'
      : 'REPOSITORY INTEGRITY (informational)')
    expect(output).toContain(ref)
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

  it('keeps both a shared clone and its live source unchanged with clone-local GIT_DIR', () => {
    const livePaths = repositoryStatePaths(resolve('.'))
    const liveRoot = dirname(livePaths.commonDir)
    const parent = mkdtempSync(join(tmpdir(), 'hoa-repository-integrity-shared-clone-'))
    temporaryDirectories.push(parent)
    const clone = join(parent, 'clone')
    const linked = join(parent, 'linked')
    execFileSync('git', ['clone', '-q', '--shared', liveRoot, clone], { windowsHide: true })
    execFileSync('git', ['-C', clone, '-c', 'core.hooksPath=', 'worktree', 'add', '-qb', 'integrity-clone-linked', linked], {
      windowsHide: true,
    })

    // Reproduce the review probe's first lead exactly: package resolution
    // crosses a node_modules symlink into the live checkout. Vitest follows
    // that link for its own package, but it must not turn the test module's cwd
    // or repository identity into the symlink target.
    const dependencyTarget = realpathSync(resolve('node_modules'))
    symlinkSync(dependencyTarget, join(linked, 'node_modules'), 'dir')
    const detectorUrl = pathToFileURL(resolve('scripts/repository-integrity.mjs')).href
    const pathsUrl = pathToFileURL(resolve('scripts/repo-paths.mjs')).href
    const sourceRoot = dirname(dirname(fileURLToPath(pathsUrl)))
    const vitestPackage = dirname(createRequire(import.meta.url).resolve('vitest'))
    const vitestUrl = pathToFileURL(join(vitestPackage, 'dist', 'index.js')).href
    const cli = join(vitestPackage, 'vitest.mjs')
    const fixture = join(parent, 'fixture')
    const fixtureWorktree = join(parent, 'fixture-worktree')
    writeFileSync(
      join(linked, 'vitest.config.mjs'),
      `export default { test: { environment: 'node', globalSetup: [${JSON.stringify(detectorUrl)}], include: ['shared-clone.test.mjs'] } }\n`,
    )
    writeFileSync(
      join(linked, 'shared-clone.test.mjs'),
      `import { execFileSync } from 'node:child_process'\n` +
        `import { mkdirSync, realpathSync } from 'node:fs'\n` +
        `import { resolve } from 'node:path'\n` +
        `import { fileURLToPath } from 'node:url'\n` +
        `import { expect, it } from ${JSON.stringify(vitestUrl)}\n` +
        `import { repositoryRoot } from ${JSON.stringify(pathsUrl)}\n` +
        `it('keeps the feat/x fixture branch in its temporary repository', () => {\n` +
        `  const linked = ${JSON.stringify(linked)}\n` +
        `  const fixture = ${JSON.stringify(fixture)}\n` +
        `  const fixtureWorktree = ${JSON.stringify(fixtureWorktree)}\n` +
        `  expect(process.env.GIT_DIR).toBeUndefined()\n` +
        `  expect(realpathSync(resolve(linked, 'node_modules'))).toBe(${JSON.stringify(dependencyTarget)})\n` +
        `  expect(resolve(fileURLToPath(import.meta.url))).toBe(resolve(linked, 'shared-clone.test.mjs'))\n` +
        // Falsify the module-URL lead independently: a non-repository cwd
        // does take the live source fallback, but the actual runner cwd is a
        // valid clone worktree and wins. The escaping feat/x call site below
        // invokes Git directly; it never consumes that fallback.
        `  expect(repositoryRoot({ explicitRoot: '', cwd: linked })).toBe(resolve(linked))\n` +
        `  mkdirSync(fixture)\n` +
        `  expect(repositoryRoot({ explicitRoot: '', cwd: fixture })).toBe(${JSON.stringify(sourceRoot)})\n` +
        `  execFileSync('git', ['-C', fixture, 'init', '-q', '-b', 'main'])\n` +
        `  execFileSync('git', ['-C', fixture, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'seed'])\n` +
        `  execFileSync('git', ['-C', fixture, 'worktree', 'add', '-qb', 'feat/x', fixtureWorktree])\n` +
        `})\n`,
    )

    const clonePaths = repositoryStatePaths(clone)
    const liveBefore = repositoryState(livePaths)
    const cloneBefore = repositoryState(clonePaths)
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
    expect(() => assertRepositoryUnchanged(liveBefore, repositoryState(livePaths))).not.toThrow()
    expect(() => assertRepositoryUnchanged(cloneBefore, repositoryState(clonePaths))).not.toThrow()
    expect(
      execFileSync('git', ['--git-dir', join(fixture, '.git'), 'show-ref', '--verify', 'refs/heads/feat/x'], {
        encoding: 'utf8',
        windowsHide: true,
      }),
    ).toContain('refs/heads/feat/x')
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
