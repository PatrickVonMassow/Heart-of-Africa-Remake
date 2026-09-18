// The shipped jar assertion, executed through its REAL output and counting path
// without booting a browser (work-order 1136, formerly polishNonPredictive).
//
// WHAT CHANGED. The check used to DECLARE that its narrow reading could not
// predict the suite's (point 1086), because the water errand was cast by the
// village's fair queue and a fixed window could miss it. The errand is created
// on purpose now, so the honest statement is no longer a standing declaration
// but a MEASUREMENT: how many errands this window actually saw. Below the named
// minimum the verdict is NOT-COVERING — neither a red the ledger may charge nor
// a green anybody may quote.
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { allChecks, failedChecks } from './baseline-classify-core.mjs'
import { chargeReds } from '../render-verify-core.mjs'
import { makeSectionGate } from './sections.mjs'

const source = readFileSync('scripts/verify/polish.mjs', 'utf8')
const checkBody = source.slice(source.indexOf('let failures = 0'), source.indexOf('\n/**', source.indexOf('let failures = 0')))
const jarStart = source.indexOf('    // HOW MANY WATER ERRANDS THE WINDOW REALLY SAW')
const jarBody = source.slice(jarStart, source.indexOf('    // BOTH WORDS', jarStart))
const JAR = 'and the jar goes down EMPTY and comes back FULL'
const DIG = 'a villager is seen digging (work-order 688)'
const CAST = 'the deliberate casting really sends carriers to the water (work-order 1136)'

// `cast` is how many water errands the window saw start; `trips` how many of
// them turned for home — the subject count the block reads out of the game's
// own staging tally, which is what the round-trip assertion actually needs.
function observe({ partial = false, cast = 4, trips = 3, dug = 1, carriedEmpty = 1, carriedFull = 1, otherRed = false } = {}) {
  const sections = makeSectionGate({ sections: ['adult-errands'], requested: partial ? 'adult-errands' : null })
  sections.section('adult-errands')
  const lines = []
  const failures = runInNewContext(`${checkBody}\n${jarBody}\n${otherRed ? "check('another check', false)" : ''}\nfailures`, {
    sections, staged: { 'water-out': cast, 'water-back': trips }, dug, carriedEmpty, carriedFull,
    console: { log: (line) => lines.push(line) },
  })
  return { failures, out: lines.join('\n'), notCovering: sections.notCovering() }
}

describe('the jar assertion once its subject is created rather than hoped for', () => {
  it.each([true, false])('decides normally with enough round trips, and prints what it saw (partial %s)', (partial) => {
    const { failures, out } = observe({ partial })
    expect(failures).toBe(0)
    expect(allChecks(out).map((c) => c.status)).toEqual(['PASS', 'PASS', 'PASS'])
    expect(out).toContain('[covering: 3 completed water round trips seen, 1 needed]')
    expect(out).toContain('4 water errand(s) cast over 240 samples, 3 of them turned for home')
  })

  it.each([{ carriedFull: 0 }, { carriedEmpty: 0 }])('is a REAL red once it has seen enough to answer: %j', (samples) => {
    const { failures, out } = observe(samples)
    expect(failures).toBe(1)
    expect(failedChecks(out).map((c) => c.name)).toEqual([JAR])
    // And the red is chargeable, unlike the declared reading it replaces.
    expect(chargeReds(failedChecks(out), { suite: 'polish', backend: 'webgl' }).length).toBe(1)
  })

  it('reds a broken DIGGING animation whatever the water errands did', () => {
    // Digging used to ride inside the jar assertion and inherited its water
    // coverage, so a window with too few round trips turned a real animation
    // regression into NOT-COVERING — and the DIG utterance beside it cannot see
    // an animation at all (GPT-6 Astra, cross-vendor round).
    const { failures, out } = observe({ dug: 0, trips: 0 })
    expect(failures).toBe(1)
    expect(failedChecks(out).map((c) => c.name)).toEqual([DIG])
  })

  it('answers NOT COVERING without a completed round trip — neither charged nor credited', () => {
    // Zero full-jar samples was the measured blockade: with no round trip that
    // is a non-measurement, not a defect.
    const { failures, out, notCovering } = observe({ trips: 0, carriedFull: 0 })
    expect(out).toMatch(/^NOT-COVERING {2}/m)
    expect(out).toContain('0 of a needed 1 completed water round trips seen')
    expect(allChecks(out).map((c) => c.name)).not.toContain(JAR)
    const reds = failedChecks(out).map((c) => c.name)
    expect(reds).not.toContain(JAR)
    expect(chargeReds(failedChecks(out), { suite: 'polish', backend: 'webgl' }).map((r) => r.check ?? r.name))
      .not.toContain(JAR)
    expect(notCovering.map((n) => n.check)).toEqual([JAR])
    // The window saying nothing about the jar is not itself a green run: the
    // casting check beside it is the one that goes red when nothing was cast.
    expect(failures).toBe(0)
  })

  it('withholds a POSITIVE reading below the minimum too', () => {
    // The below-minimum case above carries a failing reading, so a regression
    // that only suppressed REDS while still emitting a green for a positive
    // reading under the minimum would have passed it (GPT-6 Astra, cross-vendor
    // round). An undercovered pass is the more dangerous half: it is the twelve
    // green climbs of 09.09.2026 in miniature.
    const { out, notCovering } = observe({ trips: 0, dug: 9, carriedEmpty: 9, carriedFull: 9 })
    expect(allChecks(out).map((c) => c.name)).not.toContain(JAR)
    expect(out).toMatch(/^NOT-COVERING {2}/m)
    expect(notCovering.map((n) => n.check)).toEqual([JAR])
  })

  it('fails loudly when the deliberate casting sent nobody at all', () => {
    const { out } = observe({ cast: 0, trips: 0, carriedEmpty: 0, carriedFull: 0 })
    expect(failedChecks(out).map((c) => c.name)).toEqual([CAST])
  })

  it('still fails the suite for any other red check', () => {
    const { failures, out } = observe({ otherRed: true })
    expect(failures).toBe(1)
    expect(failedChecks(out).map((c) => c.name)).toEqual(['another check'])
  })
})
