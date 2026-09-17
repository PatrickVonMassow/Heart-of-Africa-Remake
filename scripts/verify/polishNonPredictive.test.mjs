import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { allChecks, failedChecks } from './baseline-classify-core.mjs'
import { chargeReds } from '../render-verify-core.mjs'
import { listNonPredictive, makeSectionGate } from './sections.mjs'

const source = readFileSync('scripts/verify/polish.mjs', 'utf8')
const checkBody = source.slice(source.indexOf('let failures = 0'), source.indexOf('\n/**', source.indexOf('let failures = 0')))
const jarStart = source.indexOf('    nonPredictive(')
const jarBody = source.slice(jarStart, source.indexOf('    // BOTH WORDS', jarStart))
const jarName = listNonPredictive(source)[0].check

// Execute the shipped assertion and its actual output/counting path, without
// booting a browser. Zero full-jar samples is the measured blockade.
function observe({ partial = false, dug = 1, carriedEmpty = 1, carriedFull = 0, otherRed = false } = {}) {
  const sections = makeSectionGate({ sections: ['adult-errands'], requested: partial ? 'adult-errands' : null })
  sections.section('adult-errands')
  const lines = []
  const failures = runInNewContext(`${checkBody}\n${jarBody}\n${otherRed ? "check('another check', false)" : ''}\nfailures`, {
    sections, nonPredictive: sections.nonPredictive, dug, carriedEmpty, carriedFull,
    console: { log: (line) => lines.push(line) },
  })
  return { failures, out: lines.join('\n') }
}

describe('the declared jar assertion through polish output and red consumers', () => {
  it.each([0, 50])('does not count or promote a full-suite reading of %i full-jar samples', (carriedFull) => {
    const { failures, out } = observe({ carriedFull })
    expect(failures).toBe(0)
    expect(out).toMatch(/^NON-PREDICTIVE {2}/)
    expect(out).toContain('[NON-PREDICTIVE in full suite:')
    expect(out).toContain(`${carriedFull} with the full one`)
    expect(allChecks(out)).toEqual([])
    expect(failedChecks(out)).toEqual([])
    expect(chargeReds(failedChecks(out), { suite: 'polish', backend: 'webgl' })).toEqual([])
  })

  it.each([
    { carriedFull: 0 }, { dug: 0, carriedFull: 50 }, { carriedEmpty: 0, carriedFull: 50 },
  ])('retains each standalone requirement: %j', (samples) => {
    const { failures, out } = observe({ ...samples, partial: true })
    expect(failures).toBe(1)
    expect(failedChecks(out).map((c) => c.name)).toEqual([jarName])
  })

  it('passes standalone with full-jar observations and retains the ladder warning', () => {
    const { failures, out } = observe({ partial: true, carriedFull: 50 })
    expect(failures).toBe(0)
    expect(allChecks(out)[0]).toMatchObject({ status: 'PASS', name: jarName })
    expect(out).toContain('[NON-PREDICTIVE narrowly:')
  })

  it('still fails the full suite for any other red check', () => {
    const { failures, out } = observe({ otherRed: true })
    expect(failures).toBe(1)
    expect(failedChecks(out).map((c) => c.name)).toEqual(['another check'])
  })
})
