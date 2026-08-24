import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { repositoryCheckoutRoot, repositoryRoot } from './repo-paths.mjs'

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

  it('resolves a linked worktree through the common repository to the main checkout', () => {
    const repository = temporaryDirectory()
    const worktree = temporaryDirectory()
    execFileSync('git', ['-C', repository, 'init', '-q', '-b', 'main'], { windowsHide: true })
    execFileSync('git', ['-C', repository, 'config', 'user.email', 'test@example.invalid'], { windowsHide: true })
    execFileSync('git', ['-C', repository, 'config', 'user.name', 'test'], { windowsHide: true })
    execFileSync('git', ['-C', repository, 'commit', '--allow-empty', '-qm', 'initial'], { windowsHide: true })
    mkdirSync(join(repository, '.claude'))
    rmSync(worktree, { recursive: true, force: true })
    execFileSync('git', ['-C', repository, 'worktree', 'add', '-q', '-b', 'feat/test', worktree], { windowsHide: true })

    expect(repositoryRoot({ explicitRoot: '', cwd: worktree })).toBe(resolve(repository))
    expect(repositoryCheckoutRoot({ cwd: worktree })).toBe(resolve(worktree))
  })

  it('gives linked processes one real singleton lock in the main checkout', () => {
    const repository = temporaryDirectory()
    const worktree = temporaryDirectory()
    execFileSync('git', ['-C', repository, 'init', '-q', '-b', 'main'], { windowsHide: true })
    execFileSync('git', ['-C', repository, 'config', 'user.email', 'test@example.invalid'], { windowsHide: true })
    execFileSync('git', ['-C', repository, 'config', 'user.name', 'test'], { windowsHide: true })
    execFileSync('git', ['-C', repository, 'commit', '--allow-empty', '-qm', 'initial'], { windowsHide: true })
    mkdirSync(join(repository, '.claude'))
    rmSync(worktree, { recursive: true, force: true })
    execFileSync('git', ['-C', repository, 'worktree', 'add', '-q', '-b', 'feat/lock-test', worktree], { windowsHide: true })

    const singletonUrl = pathToFileURL(resolve('scripts/batch-singleton.mjs')).href
    const run = (cwd, expression) =>
      execFileSync(process.execPath, ['--input-type=module', '--eval', `const m = await import(${JSON.stringify(singletonUrl)}); ${expression}`], {
        cwd,
        encoding: 'utf8',
        windowsHide: true,
      }).trim()

    expect(run(worktree, "console.log(m.acquire('fixture-session', { pid: process.pid, pidStartedAt: Date.now() }))")).toBe('acquired')
    expect(existsSync(join(repository, '.claude', 'batch-lock.json'))).toBe(true)
    expect(existsSync(join(worktree, '.claude', 'batch-lock.json'))).toBe(false)
    expect(run(repository, 'console.log(m.readOwnerLock()?.sessionId ?? \'missing\')')).toBe('fixture-session')
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
