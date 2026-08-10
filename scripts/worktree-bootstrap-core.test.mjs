// The bootstrap's decision table, and the real link on disk.
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  ACTIONS,
  REASONS,
  lockDigest,
  mainCheckoutFrom,
  planBootstrap,
  samePath,
  formatPlan,
} from './worktree-bootstrap-core.mjs'
import { inspect, linkDependencies } from './worktree-bootstrap.mjs'
import { REPO_ROOT } from './repo-paths.mjs'

describe('the lockfile digest', () => {
  it('is equal for identical bytes and different for one changed character', () => {
    expect(lockDigest('{"a":1}')).toBe(lockDigest('{"a":1}'))
    expect(lockDigest('{"a":1}')).not.toBe(lockDigest('{"a":2}'))
  })

  it('is null for absent content, so two MISSING lockfiles never count as equal', () => {
    // The dangerous shape: `null === null` would read as "the trees match" and
    // link a worktree against dependencies nothing proved fit.
    expect(lockDigest(null)).toBe(null)
    expect(lockDigest('')).toBe(null)
    expect(lockDigest(undefined)).toBe(null)
    const plan = planBootstrap({ mainCheckout: '/main', mainHasDeps: true, ownLock: null, mainLock: null })
    expect(plan.action).toBe(ACTIONS.install)
    expect(plan.reason).toBe(REASONS.lockDiffers)
  })
})

describe('deriving the main checkout from the git common directory', () => {
  it('answers the parent of the shared .git — the tree a worktree may borrow from', () => {
    expect(mainCheckoutFrom('/repo/.git', '/repo/.claude/worktrees/agent-1')).toBe(resolve('/repo'))
  })

  it('answers null for the main checkout itself, which has nothing to borrow', () => {
    expect(mainCheckoutFrom('/repo/.git', '/repo')).toBe(null)
    expect(mainCheckoutFrom('/repo/.git', '/repo/')).toBe(null)
  })

  it('answers null for a BARE repository — no working tree, no node_modules', () => {
    expect(mainCheckoutFrom('/srv/hoa.git', '/wt')).toBe(null)
  })

  it('is total on junk rather than throwing inside a gate', () => {
    expect(mainCheckoutFrom(null, '/wt')).toBe(null)
    expect(mainCheckoutFrom('', '/wt')).toBe(null)
    expect(mainCheckoutFrom('   ', '/wt')).toBe(null)
  })

  it('compares paths case-insensitively on Windows only', () => {
    expect(samePath('C:/Repo', 'C:/repo', 'win32')).toBe(true)
    expect(samePath('/Repo', '/repo', 'linux')).toBe(false)
    expect(samePath(null, '/repo')).toBe(false)
  })
})

describe('what a checkout needs', () => {
  const LOCK = '{"lockfileVersion":3}'

  it('does nothing when the dependencies are already there', () => {
    const plan = planBootstrap({ hasOwnDeps: true, mainCheckout: '/main', mainHasDeps: true })
    expect(plan.action).toBe(ACTIONS.none)
    expect(plan.reason).toBe(REASONS.present)
  })

  it('LINKS when the main checkout has dependencies and the same lockfile', () => {
    const plan = planBootstrap({ mainCheckout: '/main', mainHasDeps: true, ownLock: LOCK, mainLock: LOCK })
    expect(plan.action).toBe(ACTIONS.link)
    expect(plan.from).toBe('/main')
  })

  it('INSTALLS rather than link when the lockfiles differ — the branch changed the tree', () => {
    // The failure this prevents is silent: a branch that bumped a dependency,
    // verified green against the dependencies of a different commit.
    const plan = planBootstrap({ mainCheckout: '/main', mainHasDeps: true, ownLock: LOCK, mainLock: '{"lockfileVersion":4}' })
    expect(plan.action).toBe(ACTIONS.install)
    expect(plan.reason).toBe(REASONS.lockDiffers)
  })

  it('INSTALLS when the main checkout has no dependencies to lend', () => {
    const plan = planBootstrap({ mainCheckout: '/main', mainHasDeps: false, ownLock: LOCK, mainLock: LOCK })
    expect(plan.action).toBe(ACTIONS.install)
    expect(plan.reason).toBe(REASONS.noDonor)
  })

  it('INSTALLS in a checkout with no derivable main tree, rather than reporting "nothing to do"', () => {
    const plan = planBootstrap({ hasOwnDeps: false, mainCheckout: null })
    expect(plan.action).toBe(ACTIONS.install)
    expect(plan.reason).toBe(REASONS.noMainCheckout)
  })

  it('is total on no argument at all', () => {
    expect(planBootstrap().action).toBe(ACTIONS.install)
  })

  it('names the donor and the checkout in its one-line verdict', () => {
    const text = formatPlan(planBootstrap({ mainCheckout: '/main', mainHasDeps: true, ownLock: 'x', mainLock: 'x' }), '/wt')
    expect(text).toContain('LINK')
    expect(text).toContain('/main')
    expect(text).toContain('/wt')
  })
})

describe('the link on a real disk', () => {
  it('makes the donor\'s binaries resolvable from the borrowing checkout', () => {
    const base = mkdtempSync(join(tmpdir(), 'hoa-bootstrap-'))
    try {
      const donor = join(base, 'main')
      const borrower = join(base, 'wt')
      mkdirSync(join(donor, 'node_modules', '.bin'), { recursive: true })
      mkdirSync(borrower, { recursive: true })
      writeFileSync(join(donor, 'node_modules', '.bin', 'oxlint'), '#!/bin/sh\n')
      linkDependencies(borrower, donor)
      expect(existsSync(join(borrower, 'node_modules', '.bin', 'oxlint'))).toBe(true)
      expect(readFileSync(join(borrower, 'node_modules', '.bin', 'oxlint'), 'utf8')).toBe('#!/bin/sh\n')
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('reports NONE for the checkout this suite is running in — it has its dependencies', () => {
    // Whether that came from an install or from this script's own link, the
    // bootstrap must be idempotent: running it twice may never act twice.
    expect(inspect(REPO_ROOT).action).toBe(ACTIONS.none)
  })
})
