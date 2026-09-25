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

it('follows ROCK before the child call using a live configured cycle and saves the hearing order', () => {
  expect(source).toContain('bankCycleSeconds(timing.bank, timing.communication, timing.childCount)')
  expect(source).toContain("speech('child-call', children, '02-child-call', budgetMs)")
  expect(source).toContain("event('bank-rock-heard'")
  expect(source).toContain("event('bank-rock-before-river', receipt.bankTeaching)")
  expect(source).toContain("receipt.bankTeaching.rockBeforeCall && (receipt.order === 'message-first' || receipt.bankTeaching.rockBeforeRiver)")
})

it('watches calls from the bank stand and saves refused candidates instead of chasing their notes', () => {
  const observer = source.slice(source.indexOf('async function bankCall('), source.indexOf('// `point` may be a function:'))
  expect(observer).toContain('d.walk(await d.read(() => window.__bankStageView()))')
  expect(observer).toContain('await d.aim(centre)')
  expect(observer).toContain("event('child-call-rejected', data)")
  expect(observer).not.toContain('faceNote(')
  expect(source).toContain("kind === 'child-call' ? await bankCall(budgetMs) : null")
})

it('aims before the drum trigger and rejects missed action frames', () => {
  const message = source.slice(source.indexOf('async function message('), source.indexOf('async function errand('))
  expect(message.indexOf('await d.aim(bodies)')).toBeLessThan(message.indexOf('await trigger()'))
  expect(message).toContain('Drum frame completed after the performance')
  expect(source).toContain('Rock contact frame was late')
  expect(source).toContain('Boulder climb frame was late')
  expect(source).toContain('Loom frame caught the return instead of the named direction')
  expect(source).toContain("h.userData.errand.phase === 'walk'")
})

it('frames the departing chief after walking-out begins and checks the phase before and at the shutter', () => {
  const chief = source.slice(source.indexOf('async function chief('), source.indexOf('async function message('))
  const stand = chief.indexOf('await d.aim({ ...drum, y: 1.2 })')
  const ready = chief.indexOf("await waitForSceneReady(page, { mode: 'drawn' })")
  const space = chief.indexOf("await page.keyboard.press('Space')")
  const start = chief.indexOf("await d.wait(() => window.__chief?.phase === 'walking-out')")
  const face = chief.indexOf('await faceWalkingChief(d)')
  const before = chief.indexOf("assert(await d.read(() => window.__chief.phase === 'walking-out'), `Chief walk framing was late:")
  const frame = chief.indexOf('await localFrame(`${prefix}-chief-walks-out`, walkingChief,')
  const after = chief.indexOf("assert(await d.read(() => window.__chief.phase === 'walking-out'), `Chief walk frame was late:")
  expect(stand).toBeGreaterThanOrEqual(0)
  expect(ready).toBeGreaterThan(stand)
  expect(space).toBeGreaterThan(ready)
  expect(start).toBeGreaterThan(space)
  expect(face).toBeGreaterThan(start)
  expect(before).toBeGreaterThan(face)
  expect(frame).toBeGreaterThan(before)
  expect(after).toBeGreaterThan(frame)
  expect(chief.slice(frame, after)).toContain('async () =>')
  expect(chief.slice(after, after + 200)).toContain('{ sceneReady: false }')
})

it('checks the socket and cliff at their terrain-raised rendered heights', () => {
  expect(source).toContain('baseY: Math.max(0.2, sampleTerrain(')
  expect(source).toContain('onScreen(x, z - 0.5, baseY + 2.2)')
  expect(source).toContain('onScreen(x, z + 0.7, baseY + 1.05)')
})
