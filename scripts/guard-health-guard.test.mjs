// The wrapper's own gathering, against the LIVE repository.
//
// The core is pure and thoroughly tested; what is NOT pure is the question this
// file asks — does the blob the wrapper hands it really contain everything that
// can invoke an enforcer? It did not on 20.08.2026: the suite-level
// repository-integrity guard is wired as Vitest `globalSetup`, the blob carried
// only hook sources, and the audit reported an enforcer that fires on every unit
// run as one that can never fire at all.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { auditGuardHealth, INTENTIONALLY_DORMANT } from './guard-health-core.mjs'
import { repoPath } from './repo-paths.mjs'
import { gatherGuardHealthInputs } from './guard-health-guard.mjs'

const gathered = gatherGuardHealthInputs({ ignoreOwnership: true })

describe('the wiring blob counts every caller, not only the hooks', () => {
  it('gathers inputs at all in this checkout', () => {
    expect(gathered.applicable).toBe(true)
    expect(gathered.inputs.wiredText.trim()).not.toBe('')
  })

  it('carries the test runner configuration, so a suite-wired enforcer reads as wired', () => {
    // repoPath, not import.meta.url: under the runner this module's URL is not
    // a file: URL, which is the whole reason repo-paths.mjs exists.
    const config = readFileSync(repoPath('vitest.config.ts'), 'utf8')
    expect(gathered.inputs.wiredText).toContain(config)
  })

  it('does not report the suite-wired repository guard as unable to fire', () => {
    const { violations, report } = auditGuardHealth(gathered.inputs)
    const entry = report.find((r) => r.script === 'repository-integrity-guard.mjs')
    expect(entry, 'the enforcer list must contain the suite-wired guard').toBeTruthy()
    expect(entry.wired).toBe(true)
    expect(violations.filter((v) => v.script === 'repository-integrity-guard.mjs')).toEqual([])
  })

  it('keeps the dormant map empty — an entry there must outlive nothing', () => {
    expect(Object.keys(INTENTIONALLY_DORMANT)).toEqual([])
  })
})
