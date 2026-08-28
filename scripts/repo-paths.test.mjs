import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  repositoryCommonRoot,
  repositoryRoot,
  requireMainCheckoutRoot,
  withoutGitLocalEnvironment,
} from './repo-paths.mjs'

describe('repositoryRoot', () => {
  const temporaryDirectories = []

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  const temporaryDirectory = () => {
    const directory = mkdtempSync(join(tmpdir(), 'hoa-repo-paths-'))
    temporaryDirectories.push(directory)
    return directory
  }

  it('uses an explicit root before the process working directory', () => {
    expect(repositoryRoot({ explicitRoot: '/fixture/explicit', cwd: '/fixture/cwd' })).toBe(
      resolve('/fixture/explicit'),
    )
  })

  it('uses the repository containing the process working directory', () => {
    const repository = temporaryDirectory()
    const nestedDirectory = join(repository, 'docs')
    execFileSync('git', ['-C', repository, 'init', '-q'], { windowsHide: true })
    mkdirSync(nestedDirectory)

    expect(
      repositoryRoot({
        explicitRoot: '',
        cwd: nestedDirectory,
        moduleUrl: pathToFileURL('/live/repository/scripts/repo-paths.mjs').href,
      }),
    ).toBe(resolve(repository))
  })

  it('resolves singleton state to the main checkout from every linked worktree', () => {
    const parent = temporaryDirectory()
    const repository = join(parent, 'main')
    const linked = join(parent, 'linked')
    mkdirSync(repository)
    execFileSync('git', ['-C', repository, 'init', '-q'], { windowsHide: true })
    execFileSync(
      'git',
      ['-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'init'],
      { windowsHide: true },
    )
    execFileSync('git', ['-C', repository, 'worktree', 'add', '-qb', 'fixture-linked', linked], { windowsHide: true })
    const nested = join(linked, 'scripts')
    mkdirSync(nested)

    expect(repositoryRoot({ explicitRoot: '', cwd: nested })).toBe(resolve(linked))
    expect(repositoryCommonRoot({ explicitRoot: '', cwd: nested })).toBe(resolve(repository))
    expect(repositoryCommonRoot({ explicitRoot: '', cwd: repository })).toBe(resolve(repository))
  })

  it('does not let a linked-worktree hook environment redirect a fixture helper into the common checkout', () => {
    const parent = temporaryDirectory()
    const repository = join(parent, 'main')
    const linked = join(parent, 'linked')
    const fixture = join(parent, 'fixture')
    mkdirSync(repository)
    mkdirSync(fixture)
    execFileSync('git', ['-C', repository, 'init', '-q', '-b', 'main'], { windowsHide: true })
    writeFileSync(join(repository, 'seed.txt'), 'live repository\n')
    execFileSync('git', ['-C', repository, 'add', 'seed.txt'], { windowsHide: true })
    execFileSync(
      'git',
      ['-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'seed'],
      { windowsHide: true },
    )
    execFileSync('git', ['-C', repository, 'worktree', 'add', '-qb', 'fixture-linked', linked], { windowsHide: true })

    const snapshot = () => ({
      refs: execFileSync(
        'git',
        ['--git-dir', join(repository, '.git'), 'for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/heads'],
        { windowsHide: true },
      ),
      config: readFileSync(join(repository, '.git', 'config')),
      worktrees: execFileSync('git', ['--git-dir', join(repository, '.git'), 'worktree', 'list', '--porcelain'], {
        windowsHide: true,
      }),
    })
    const before = snapshot()
    const hookEnvironment = {
      ...process.env,
      GIT_DIR: execFileSync('git', ['-C', linked, 'rev-parse', '--absolute-git-dir'], {
        encoding: 'utf8',
        windowsHide: true,
      }).trim(),
      GIT_PREFIX: '',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.bare',
      GIT_CONFIG_VALUE_0: 'true',
    }
    const cleanEnvironment = withoutGitLocalEnvironment(hookEnvironment)

    // This is the measured escaping shape: the process starts in the linked
    // worktree while a helper points Git at a temporary repository with -C.
    // The helper must do real work in its fixture without changing the common
    // checkout's refs, config or registrations by one byte.
    execFileSync(
      'git',
      ['-C', fixture, 'init', '-q', '-b', 'main'],
      { cwd: linked, env: cleanEnvironment, windowsHide: true },
    )
    execFileSync(
      'git',
      ['-C', fixture, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture seed'],
      { cwd: linked, env: cleanEnvironment, windowsHide: true },
    )
    execFileSync('git', ['-C', fixture, 'branch', 'fixture-only'], {
      cwd: linked,
      env: cleanEnvironment,
      windowsHide: true,
    })

    expect(snapshot()).toEqual(before)
    expect(
      execFileSync('git', ['-C', fixture, 'branch', '--format=%(refname:short)'], {
        cwd: linked,
        env: cleanEnvironment,
        encoding: 'utf8',
        windowsHide: true,
      }),
    ).toContain('fixture-only')
  })

  it('starts a batch owner in the main checkout when the launcher runs from a linked worktree', () => {
    const parent = temporaryDirectory()
    const repository = join(parent, 'main')
    const linked = join(parent, 'linked')
    mkdirSync(repository)
    execFileSync('git', ['-C', repository, 'init', '-q'], { windowsHide: true })
    execFileSync(
      'git',
      ['-C', repository, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'init'],
      { windowsHide: true },
    )
    execFileSync('git', ['-C', repository, 'worktree', 'add', '-qb', 'fixture-owner', linked], { windowsHide: true })
    mkdirSync(join(repository, '.claude'))

    const pathsUrl = pathToFileURL(resolve('scripts/repo-paths.mjs')).href
    const dashboardUrl = pathToFileURL(resolve('scripts/dashboard-state.mjs')).href
    const session = `
      import { mergeState, REPO_ROOT } from ${JSON.stringify(dashboardUrl)}
      mergeState({ writtenByOwnerAt: process.cwd() })
      process.stdout.write(JSON.stringify({ cwd: process.cwd(), repoRoot: REPO_ROOT }))
    `
    const launcher = `
      import { spawnSync } from 'node:child_process'
      import { requireMainCheckoutRoot } from ${JSON.stringify(pathsUrl)}
      const root = requireMainCheckoutRoot()
      const child = spawnSync(process.execPath, ['--input-type=module', '--eval', ${JSON.stringify(session)}], {
        cwd: root,
        env: process.env,
        encoding: 'utf8',
        windowsHide: true,
      })
      if (child.status !== 0) throw new Error(child.stderr || 'owner session failed')
      process.stdout.write(child.stdout)
    `
    const env = { ...process.env }
    delete env.HOA_REPO_ROOT
    const owner = JSON.parse(
      execFileSync(process.execPath, ['--input-type=module', '--eval', launcher], {
        cwd: linked,
        env,
        encoding: 'utf8',
        windowsHide: true,
      }),
    )

    expect(owner).toEqual({ cwd: resolve(repository), repoRoot: resolve(repository) })
    const reader = `
      import { readJson, STATE_PATH } from ${JSON.stringify(dashboardUrl)}
      process.stdout.write(JSON.stringify(readJson(STATE_PATH)))
    `
    const state = JSON.parse(
      execFileSync(process.execPath, ['--input-type=module', '--eval', reader], {
        cwd: repository,
        env,
        encoding: 'utf8',
        windowsHide: true,
      }),
    )
    expect(state.writtenByOwnerAt).toBe(resolve(repository))
    expect(existsSync(join(linked, '.claude', 'dashboard-state.json'))).toBe(false)
  })

  it('refuses when the common checkout is not a verifiable working tree', () => {
    const checkout = temporaryDirectory()
    const gitDirectory = temporaryDirectory()
    execFileSync('git', ['init', '-q', '--separate-git-dir', gitDirectory, checkout], { windowsHide: true })

    expect(() => requireMainCheckoutRoot({ explicitRoot: '', cwd: checkout })).toThrow(
      /main checkout could not be verified.*refusing to start a batch owner/,
    )
  })

  it('defers and memoizes common-checkout discovery while reusing the resolved repository root', () => {
    const moduleUrl = pathToFileURL(resolve('scripts/repo-paths.mjs')).href
    const probe = `
      import childProcess from 'node:child_process'
      import { syncBuiltinESMExports } from 'node:module'

      const calls = []
      childProcess.execFileSync = (_file, args) => {
        calls.push(args)
        return args.includes('--git-common-dir') ? '/fixture/main/.git\\n' : '/fixture/linked\\n'
      }
      syncBuiltinESMExports()

      const paths = await import(${JSON.stringify(moduleUrl)})
      const afterImport = calls.slice()
      paths.commonRepoPath('.claude', 'batch-lock.json')
      paths.commonRepoPath('.claude', 'batch-fence.json')
      process.stdout.write(JSON.stringify({ afterImport, calls }))
    `

    const result = JSON.parse(
      execFileSync(process.execPath, ['--input-type=module', '--eval', probe], {
        encoding: 'utf8',
        windowsHide: true,
      }),
    )

    expect(result.afterImport).toEqual([['-C', process.cwd(), 'rev-parse', '--show-toplevel']])
    expect(result.calls).toEqual([
      ['-C', process.cwd(), 'rev-parse', '--show-toplevel'],
      ['-C', resolve('/fixture/linked'), 'rev-parse', '--git-common-dir'],
    ])
  })

  it('falls back to the module location when cwd is not in a repository', () => {
    const arbitraryDirectory = temporaryDirectory()

    expect(
      repositoryRoot({
        explicitRoot: '',
        cwd: arbitraryDirectory,
        moduleUrl: pathToFileURL('/source/repository/scripts/repo-paths.mjs').href,
      }),
    ).toBe(resolve('/source/repository'))
  })

  it('returns an empty root when neither cwd nor the module URL identifies a repository', () => {
    expect(repositoryRoot({ explicitRoot: '', cwd: '', moduleUrl: 'vitest://not-a-file' })).toBe('')
  })
})
