import { describe, expect, it } from 'vitest'
import { judgeDrumWindow } from './drumFrame.mjs'
import { narrowDiagnosis } from './sections.mjs'

const running = { message: 'answer', startedAt: 1000, endsAt: 3000, now: 1500, chiefPhase: 'at-drummer' }

describe('the drum picture window', () => {
  it('accepts a message that is still running beside the chief', () => {
    expect(judgeDrumWindow(running, 'answer').ok).toBe(true)
    expect(judgeDrumWindow({ ...running, message: 'errand' }, 'errand').ok).toBe(true)
  })

  it.each([null, { ...running, now: 3000 }, { ...running, now: 3100 }, { ...running, now: 999 }])('rejects an ended or not-yet-started window: %s', (sample) => {
    const verdict = judgeDrumWindow(sample, 'answer')
    expect(verdict.ok).toBe(false)
    expect(verdict.detail).toContain('drumPerformance')
  })

  it('rejects the wrong message, a replacement performance, and a chief walking away', () => {
    expect(judgeDrumWindow(running, 'errand').ok).toBe(false)
    expect(judgeDrumWindow(running, 'answer', 900).ok).toBe(false)
    expect(judgeDrumWindow({ ...running, chiefPhase: 'walking-back' }, 'answer').ok).toBe(false)
  })
})


it('a declared non-predictive drum window cannot satisfy the narrow ladder', () => {
  const check = 'the drums are still speaking at the shutter'
  const verdict = narrowDiagnosis({
    failures: [{ name: check, detail: '[--section=chief-to-drummer]' }],
    declared: ['chief-to-drummer', 'artefact-give', 'town-plan'],
    nonPredictive: [{ section: 'chief-to-drummer', check, why: 'the message is shorter than the capture window' }],
  })
  expect(verdict.whole).toBe(true)
  expect(verdict.why).toContain('NON-PREDICTIVE')
})
