import { describe, it, expect } from 'vitest'
import { auditGuardHealth, formatGuardHealth, ENFORCER_RE } from './guard-health-core.mjs'

// A minimal healthy world: one wired enforcer with a tested core.
const healthy = {
  files: ['a-guard.mjs', 'a-guard-core.mjs', 'a-guard-core.test.mjs'],
  sources: { 'a-guard.mjs': "import { x } from './a-guard-core.mjs'" },
  wiredText: 'node scripts/a-guard.mjs',
  knownUntested: new Set(),
}

describe('ENFORCER_RE', () => {
  it('matches guards, gates and hooks but never their cores or tests', () => {
    for (const f of ['a-guard.mjs', 'pre-push-gate.mjs', 'prep-arm-hook.mjs']) {
      expect(ENFORCER_RE.test(f)).toBe(true)
    }
    for (const f of ['a-guard-core.mjs', 'a-guard-core.test.mjs', 'helper.mjs', 'a-guard.test.mjs']) {
      expect(ENFORCER_RE.test(f)).toBe(false)
    }
  })
})

describe('auditGuardHealth — can it fire at all', () => {
  it('passes a wired, tested enforcer', () => {
    expect(auditGuardHealth(healthy).ok).toBe(true)
  })

  // The defect this exists for: a script in the tree that nothing invokes, so
  // the rule counts as enforced while nothing enforces it.
  it('flags an enforcer that nothing invokes', () => {
    const { ok, violations } = auditGuardHealth({ ...healthy, wiredText: 'node scripts/other-guard.mjs' })
    expect(ok).toBe(false)
    expect(violations.map((v) => v.kind)).toContain('cannot-fire')
  })

  it('counts an active git hook as wiring, not only the settings', () => {
    const r = auditGuardHealth({ ...healthy, wiredText: '#!/bin/sh\nnode scripts/a-guard.mjs' })
    expect(r.ok).toBe(true)
  })

  it('is not satisfied by a mention of the CORE instead of the enforcer', () => {
    const r = auditGuardHealth({ ...healthy, wiredText: 'import a-guard-core.mjs' })
    expect(r.violations.map((v) => v.kind)).toContain('cannot-fire')
  })

  it('accepts a dormant enforcer WITH a reason and rejects one without', () => {
    const unwired = { ...healthy, wiredText: '' }
    expect(auditGuardHealth({ ...unwired, dormant: { 'a-guard.mjs': 'wartet auf Punkt 302' } }).ok).toBe(true)
    const blank = auditGuardHealth({ ...unwired, dormant: { 'a-guard.mjs': '  ' } })
    expect(blank.violations.map((v) => v.kind)).toContain('dormant-without-reason')
  })
})

describe('auditGuardHealth — is its decision tested', () => {
  it('reads the core from the IMPORTS, not from the file name', () => {
    // retro-currency-guard imports retro-core: a name-based rule called this
    // untested and accused a well-tested guard.
    const r = auditGuardHealth({
      files: ['x-currency-guard.mjs', 'retro-core.mjs', 'retro-core.test.mjs'],
      sources: { 'x-currency-guard.mjs': "import { e } from './retro-core.mjs'" },
      wiredText: 'node scripts/x-currency-guard.mjs',
      knownUntested: new Set(),
    })
    expect(r.ok).toBe(true)
  })

  it('accepts a test named after the wrapper itself', () => {
    const r = auditGuardHealth({
      files: ['t-guard.mjs', 't-guard-core.mjs', 't-guard.test.mjs'],
      sources: { 't-guard.mjs': "import { e } from './t-guard-core.mjs'" },
      wiredText: 'node scripts/t-guard.mjs',
      knownUntested: new Set(),
    })
    expect(r.ok).toBe(true)
  })

  it('separates "core exists but is untested" from "there is no core at all"', () => {
    const untested = auditGuardHealth({
      files: ['a-guard.mjs', 'a-guard-core.mjs'],
      sources: { 'a-guard.mjs': "import { x } from './a-guard-core.mjs'" },
      wiredText: 'node scripts/a-guard.mjs',
      knownUntested: new Set(),
    })
    expect(untested.violations.map((v) => v.kind)).toContain('untested-core')

    const noCore = auditGuardHealth({
      files: ['a-guard.mjs'],
      sources: { 'a-guard.mjs': "import { readFileSync } from 'node:fs'" },
      wiredText: 'node scripts/a-guard.mjs',
      knownUntested: new Set(),
    })
    expect(noCore.violations.map((v) => v.kind)).toContain('no-core')
  })

  it('does not judge testedness when the source could not be read', () => {
    const r = auditGuardHealth({ files: ['a-guard.mjs'], sources: {}, wiredText: 'node scripts/a-guard.mjs' })
    expect(r.ok).toBe(true) // the reader's blind spot is not the guard's defect
  })

  // The ratchet: recorded debt is silent, but new debt is not — otherwise a
  // guard firing every single turn would train the reader to skip it.
  it('stays silent on recorded debt and still fires on a NEW untested enforcer', () => {
    const world = {
      files: ['old-guard.mjs', 'new-guard.mjs', 'shared.mjs'],
      sources: {
        'old-guard.mjs': "import { a } from './shared.mjs'",
        'new-guard.mjs': "import { a } from './shared.mjs'",
      },
      wiredText: 'node scripts/old-guard.mjs node scripts/new-guard.mjs',
      knownUntested: new Set(['old-guard.mjs']),
    }
    const kinds = auditGuardHealth(world).violations.map((v) => `${v.script}:${v.kind}`)
    expect(kinds).toEqual(['new-guard.mjs:untested-core'])
  })
})

describe('robustness and message', () => {
  it('is total on missing or malformed input', () => {
    expect(auditGuardHealth().ok).toBe(true)
    expect(auditGuardHealth({ files: null, wiredText: null }).ok).toBe(true)
    expect(() => auditGuardHealth({ files: ['a-guard.mjs'], sources: { 'a-guard.mjs': null } })).not.toThrow()
  })

  it('reports every enforcer, passing or not', () => {
    expect(auditGuardHealth(healthy).report).toEqual([
      { script: 'a-guard.mjs', wired: true, core: true, tested: true, imports: ['a-guard-core.mjs'], dormant: false },
    ])
  })

  it('formats nothing when healthy and names the probe command otherwise', () => {
    expect(formatGuardHealth([])).toBe('')
    const msg = formatGuardHealth(auditGuardHealth({ ...healthy, wiredText: '' }).violations)
    expect(msg).toContain('node scripts/guard-health-guard.mjs --status')
    expect(msg).toContain('nie auslösen kann')
  })
})
