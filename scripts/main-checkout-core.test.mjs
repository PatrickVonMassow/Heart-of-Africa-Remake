import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { mainCheckoutFrom, samePath } from './main-checkout-core.mjs'

describe('the distinct main checkout contract', () => {
  const cases = [
    {
      situation: 'bare repository',
      common: '/srv/hoa.git',
      root: '/srv/worktree',
      expected: null,
    },
    {
      situation: 'already in the main checkout',
      common: '/repo/.git',
      root: '/repo/',
      expected: null,
    },
    {
      situation: 'resolved from a linked worktree',
      common: '/repo/.git',
      root: '/repo/.claude/worktrees/agent-1',
      expected: resolve('/repo'),
    },
  ]

  it.each(cases)('answers the documented value for $situation', ({ common, root, expected }) => {
    expect(mainCheckoutFrom(common, root)).toBe(expected)
  })

  it('is total when git did not return a common directory', () => {
    expect(mainCheckoutFrom(null, '/worktree')).toBe(null)
    expect(mainCheckoutFrom('', '/worktree')).toBe(null)
    expect(mainCheckoutFrom('   ', '/worktree')).toBe(null)
  })

  it('handles Windows paths independent of the host running the test', () => {
    expect(mainCheckoutFrom('C:\\src\\hoa\\.git\\', 'C:\\src\\hoa\\worktrees\\agent')).toBe('C:\\src\\hoa')
    expect(mainCheckoutFrom('C:\\src\\hoa\\.git', 'c:\\SRC\\hoa\\')).toBe(null)
  })

  it('compares paths case-insensitively on Windows only', () => {
    expect(samePath('C:/Repo', 'C:/repo', 'win32')).toBe(true)
    expect(samePath('/Repo', '/repo', 'linux')).toBe(false)
    expect(samePath(null, '/repo')).toBe(false)
  })
})
