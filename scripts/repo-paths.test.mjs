import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { repositoryRoot } from './repo-paths.mjs'

describe('repositoryRoot', () => {
  it('uses an explicit root before the process working directory', () => {
    expect(repositoryRoot({ explicitRoot: '/fixture/explicit', cwd: '/fixture/cwd' })).toBe(
      resolve('/fixture/explicit'),
    )
  })

  it('uses the process working directory before the script source location', () => {
    expect(
      repositoryRoot({
        explicitRoot: '',
        cwd: '/fixture/repository',
        moduleUrl: pathToFileURL('/live/repository/scripts/repo-paths.mjs').href,
      }),
    ).toBe(resolve('/fixture/repository'))
  })

  it('falls back to the module location only when no root was given', () => {
    expect(
      repositoryRoot({
        explicitRoot: '',
        cwd: '',
        moduleUrl: pathToFileURL('/source/repository/scripts/repo-paths.mjs').href,
      }),
    ).toBe(resolve('/source/repository'))
    expect(repositoryRoot({ explicitRoot: '', cwd: '', moduleUrl: 'vitest://not-a-file' })).toBe('')
  })
})
