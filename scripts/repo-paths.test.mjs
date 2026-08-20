import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { repositoryRoot } from './repo-paths.mjs'

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
    execFileSync('git', ['-C', repository, 'init', '-q'])
    mkdirSync(nestedDirectory)

    expect(
      repositoryRoot({
        explicitRoot: '',
        cwd: nestedDirectory,
        moduleUrl: pathToFileURL('/live/repository/scripts/repo-paths.mjs').href,
      }),
    ).toBe(resolve(repository))
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
