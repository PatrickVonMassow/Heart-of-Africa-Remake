import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { repositoryCommonRoot, repositoryRoot } from './repo-paths.mjs'

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
