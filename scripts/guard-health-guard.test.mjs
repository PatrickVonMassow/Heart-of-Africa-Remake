// The wrapper's own gathering, against the LIVE repository.
//
// The core is pure and thoroughly tested; what is NOT pure is the question this
// file asks — does the blob the wrapper hands it really contain everything that
// can invoke an enforcer, and NOTHING that cannot? It contained too little on
// 20.08.2026 (the suite-wired repository-integrity guard read as `cannot-fire`
// while it fired on every unit run) and the first answer contained too much (the
// whole config text, where a name in a comment would have read as an invocation).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { auditGuardHealth, runnerWiredScripts } from './guard-health-core.mjs'
import { gatherGuardHealthInputs } from './guard-health-guard.mjs'
import { repoPath } from './repo-paths.mjs'

const gathered = gatherGuardHealthInputs({ ignoreOwnership: true })

describe('the wiring blob counts every caller, and only real ones', () => {
  it('gathers inputs at all in this checkout', () => {
    expect(gathered.applicable).toBe(true)
    expect(gathered.inputs.wiredText.trim()).not.toBe('')
  })

  it('the runner really does invoke the repository guard through globalSetup', () => {
    // The PROPERTY, read from the runner's own configuration rather than from the
    // guard: if this ever stops being true, the entry below must stop reading wired.
    // repoPath, not import.meta.url — under the runner this module's URL is not a
    // file: URL, which is the whole reason repo-paths.mjs exists.
    const config = readFileSync(repoPath('vitest.config.ts'), 'utf8')
    expect(runnerWiredScripts(config)).toContain('./scripts/repository-integrity-guard.mjs')
  })

  it('does not report that suite-wired guard as unable to fire', () => {
    const { violations, report } = auditGuardHealth(gathered.inputs)
    const entry = report.find((r) => r.script === 'repository-integrity-guard.mjs')
    expect(entry, 'the enforcer list must contain the suite-wired guard').toBeTruthy()
    expect(entry.wired).toBe(true)
    expect(violations.filter((v) => v.script === 'repository-integrity-guard.mjs')).toEqual([])
  })

  it('carries no config prose — only what the runner invokes', () => {
    // The first attempt pasted the whole config into the blob, so any name in any
    // comment would have counted. The blob must not contain the config's prose.
    const config = readFileSync(repoPath('vitest.config.ts'), 'utf8')
    const proseLine = config.split('\n').find((l) => l.trim().startsWith('//') && l.trim().length > 30)
    expect(proseLine, 'the config is expected to carry comments').toBeTruthy()
    expect(gathered.inputs.wiredText).not.toContain(proseLine.trim())
  })
})
