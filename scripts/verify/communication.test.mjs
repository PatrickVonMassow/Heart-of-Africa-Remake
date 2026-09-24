// Architectural assertions: the continuous route must never acquire the debug
// shortcuts used by the diagnostic sections it replaces. No browser is opened.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { listSections } from './sections.mjs'
import { DEV_SUITES, laneFor, suitesFor } from './tiers.mjs'
import { UNMEASURED_SUITES, COUNTED_SUITE_FRAMES } from './run-wait-core.mjs'
const source = readFileSync(new URL('./communication.mjs', import.meta.url), 'utf8')
const driver = readFileSync(new URL('./communicationDriver.mjs', import.meta.url), 'utf8')
describe('continuous communication route contract', () => {
  it('is selectable as one indivisible section on either real backend', () => {
    expect(listSections(source)).toEqual(['continuous-route'])
    expect(DEV_SUITES).toContain('communication')
    for (const backend of ['webgl', 'webgpu']) {
      expect(laneFor('communication', backend)).toBe(backend)
      expect(suitesFor({ filter: ['communication'], backend })).toContain('communication')
    }
    expect(source).toMatch(/await assertBackend\(page\)/)
    expect(source.match(/browser\.newPage\(/g)).toHaveLength(1)
    expect(source.match(/page\.goto\(/g)).toHaveLength(1)
    expect(UNMEASURED_SUITES).toContain('communication')
    expect(COUNTED_SUITE_FRAMES.communication).toBeGreaterThanOrEqual(9)
  })
  it('reserves setup writes for the pre-entry seam and never stages an observation', () => {
    const setupStart = source.indexOf('receipt.setup = await d.read')
    const setupEnd = source.indexOf('receipt.seed = receipt.setup.seed')
    expect(setupStart).toBeGreaterThan(0)
    expect(setupEnd).toBeGreaterThan(setupStart)
    const continuous = source.slice(0, setupStart) + source.slice(setupEnd) + driver
    expect(continuous).not.toMatch(/\.(?:setState|debugJumpTo|debugAddEquipment|enterPlace|leavePlace|hearUtterance|setUtteranceHypothesis|requestDrumMessage|handArtefactToChief|useCarriedForm|callChiefOut|dig|buy)\s*\(/)
    expect(continuous).not.toMatch(/__speech\.(?:speak|clear)|__placeCast|__chiefHome|__ambience\.(?:speak|start|refresh)/)
    expect(continuous).not.toMatch(/__placePlayer\.[\w]+\s*=/)
    expect(source).not.toMatch(/page\.reload|newGame\(/)
  })
  it('owes every document step, audio window and both journal renderings', () => {
    for (let i = 1; i <= 9; i++) expect(source).toMatch(new RegExp(`step\\('${i}-`))
    for (const window of ['ambient-baseline', 'adult-talk', 'child-call']) expect(source).toContain(`'${window}'`)
    expect(source).toContain("message('errand'")
    expect(source).toContain("message('answer'")
    expect(source).toContain("['en', 'de']")
    expect(source).toContain('journal-${language}.txt')
    expect(source).toContain("receipt.status = 'failed'")
    expect(source).toContain('process.exitCode = 1')
    expect(source).not.toMatch(/\.screenshot\(/) // every named frame uses the shared shutter
    expect(source).toContain('recordVideo:')
    expect(source).toContain("guess('04-river', 'perhaps a road', receipt.vocabulary.RIVER)")
    expect(source).toContain("assert.equal(selected.join('-'), expectedAtom")
    expect(source).toContain("row.locator('input').fill('perhaps a path')")
    expect(source.indexOf('timing.observer.observe')).toBeLessThan(source.indexOf('await trigger()'))
    expect(source).toContain('firstShown >= startedAt + plan.duration * 1000')
  })
})
