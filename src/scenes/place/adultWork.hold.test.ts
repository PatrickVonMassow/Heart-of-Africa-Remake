// THE WORD COMES FIRST, THE ACT ANSWERS IT (work-order 1184, user 22.09.2026).
// An order carried out in the frame it is spoken — before its four syllables
// have finished — reads as a man narrating his own act rather than as one man
// sending another, which is the failure the water errand was rebuilt to avoid.
// These cases hold the errand to the other shape: the body does not move while
// the word plays, it starts after the word's own length plus the calibratable
// pause, and a task inside that hold owes nothing.

import { SHIPPED_VOCABULARY } from '../../communication/vocabulary'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { balance } from '../../config/balance'
import { resetDevAsserts } from '../../systems/devAssert'
import { speechLabelSeconds } from '../../communication/speechLabel'
import {
  conceptSeconds, instructionDelay, phrasePlan, phraseSeconds, utteranceSeconds,
} from '../../communication/speaking'
import { CONCEPT_IDS, SEQUENCE_LENGTH, utteranceOf } from '../../communication/lexicon'
import {
  createAdultWork, goalOf, stepAdultWork,
  type AdultWorkView, type AdultWorkConfig,
} from './adultWork'

const cfg: AdultWorkConfig = { ...balance.villageLife.adultErrands, intervalSeconds: 1, intervalSpread: 0 }

/** A sender and a carrier at the stand, with the order about to fall. */
function fixture(config = cfg) {
  const view: AdultWorkView = {
    vocabulary: SHIPPED_VOCABULARY,
    villagers: [{ x: 0, z: 0, free: true }, { x: 1, z: 0, free: true }],
    geography: {
      waterStand: { x: 0, z: 5 }, waterHead: { x: 10, z: 0 },
      waterFoot: { x: 40, z: 0 }, waterFill: { x: 42, z: 0 }, digSites: [],
    },
    standable: () => true, childrenHear: () => false, invitationClear: () => true,
  }
  const state = createAdultWork(2, config)
  const step = (dt = 0.25) => stepAdultWork(state, view, dt, config, () => 0.5)
  step(config.intervalSeconds)
  const sender = state.tasks.findIndex((t) => t?.phase === 'send')
  const carrier = state.tasks[sender]!.partner!
  // Nothing else is staged while the case runs, and both men stand on their
  // spots so the only thing left between them is the word.
  state.next = Infinity
  view.villagers.forEach((v) => { v.free = false })
  for (const i of [sender, carrier]) Object.assign(view.villagers[i], goalOf(state.tasks[i]!))
  return { state, view, sender, carrier, step }
}

/** Runs the station for `seconds` and answers whether the carrier has set off. */
function fetchedWithin(f: ReturnType<typeof fixture>, seconds: number, dt = 1 / 60): boolean {
  for (let t = 0; t < seconds; t += dt) {
    f.step(dt)
    if (f.state.tasks[f.carrier]?.phase === 'fetch') return true
  }
  return false
}

beforeEach(resetDevAsserts)
afterEach(() => {
  vi.restoreAllMocks()
  resetDevAsserts()
  balance.communication.instructionHoldSeconds = 1
})

describe('the word is measured, not guessed', () => {
  it('phraseSeconds IS the plan’s own duration, for one atom and for a phrase', () => {
    const one = [utteranceOf('RIVER', SHIPPED_VOCABULARY)]
    const two = [utteranceOf('DIG', SHIPPED_VOCABULARY), utteranceOf('RIVER', SHIPPED_VOCABULARY)]
    expect(phraseSeconds(one)).toBeCloseTo(phrasePlan(one, 0).duration, 10)
    expect(phraseSeconds(two)).toBeCloseTo(phrasePlan(two, 0).duration, 10)
    // And it answers where the plan falls silent: out of earshot there is no
    // sound to measure, but the villager still says his word and it still takes
    // as long as it takes.
    expect(phrasePlan(one, 1e6).duration).toBe(0)
    expect(phraseSeconds(one)).toBeGreaterThan(0)
  })

  it('follows the pace rather than a hardcoded syllable count', () => {
    const slow = phraseSeconds([utteranceOf('RIVER', SHIPPED_VOCABULARY)], { syllableSeconds: 0.6 })
    expect(slow).toBeCloseTo(phraseSeconds([utteranceOf('RIVER', SHIPPED_VOCABULARY)]) * 2, 10)
  })

  it('reads its pause from balance, and every word is at least its own length', () => {
    for (const concept of CONCEPT_IDS) {
      expect(instructionDelay(concept, SHIPPED_VOCABULARY)).toBeCloseTo(conceptSeconds(concept, SHIPPED_VOCABULARY) + 1, 10)
    }
    balance.communication.instructionHoldSeconds = 2.5
    expect(instructionDelay('RIVER', SHIPPED_VOCABULARY)).toBeCloseTo(conceptSeconds('RIVER', SHIPPED_VOCABULARY) + 2.5, 10)
  })

  it('stays inside the floor’s own consequence window and under the note over the head', () => {
    // At shipped balance the hold fits the floor's ordinary window, so the
    // `actAfter` reservation (speechFloor.test.ts) changes no shipped timing.
    const window = utteranceSeconds(SEQUENCE_LENGTH) + balance.communication.consequenceSeconds
    for (const concept of CONCEPT_IDS) {
      expect(instructionDelay(concept, SHIPPED_VOCABULARY)).toBeLessThanOrEqual(window)
      // And the player's own annotation must still stand when the body answers,
      // or the pairing he is invited to make has nothing left to pair.
      expect(instructionDelay(concept, SHIPPED_VOCABULARY)).toBeLessThanOrEqual(speechLabelSeconds(1))
    }
  })
})

describe('the instructed body waits for the word to end', () => {
  it('does not move in the frame the order is granted', () => {
    const f = fixture()
    const dt = 1 / 60
    let word = null
    for (let t = 0; t < 5 && !word; t += dt) word = f.step(dt)
    expect(word?.concept).toBe('RIVER')
    // The carrier is still standing at the stand with empty hands, and the
    // sender is holding the gap rather than owing a word.
    expect(f.state.tasks[f.carrier]!.phase).toBe('wait')
    expect(f.state.tasks[f.carrier]!.carry).toBe('none')
    expect(f.state.tasks[f.sender]!.owes).toBe(false)
    expect(f.state.tasks[f.sender]!.holdFor).toBeCloseTo(instructionDelay('RIVER', SHIPPED_VOCABULARY), 6)
  })

  it('sets off after the word’s length plus the pause, and not before', () => {
    const f = fixture()
    const dt = 1 / 60
    let word = null
    for (let t = 0; t < 5 && !word; t += dt) word = f.step(dt)
    const hold = instructionDelay('RIVER', SHIPPED_VOCABULARY)
    expect(fetchedWithin(f, hold - 2 * dt, dt)).toBe(false)
    expect(fetchedWithin(f, 4 * dt, dt)).toBe(true)
    expect(f.state.tasks[f.carrier]!.carry).toBe('emptyJar')
  })

  it('takes the pause from balance instead of a constant in the code', () => {
    balance.communication.instructionHoldSeconds = 4
    const f = fixture()
    const dt = 1 / 60
    let word = null
    for (let t = 0; t < 5 && !word; t += dt) word = f.step(dt)
    // The shipped default would have sent him off long ago.
    expect(fetchedWithin(f, conceptSeconds('RIVER', SHIPPED_VOCABULARY) + 1.5, dt)).toBe(false)
    expect(fetchedWithin(f, 3, dt)).toBe(true)
  })

  it('owes nothing while it holds, and reports neither a lost word nor a pair that never met', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = fixture()
    const dt = 1 / 60
    let word = null
    for (let t = 0; t < 5 && !word; t += dt) word = f.step(dt)
    expect(f.state.tasks[f.sender]!.holdFor).toBeGreaterThan(0)
    let ticks = 0
    while (f.state.tasks[f.sender]?.holdFor !== undefined) {
      const sender = f.state.tasks[f.sender]!
      expect(sender.owes).toBe(false)
      expect(sender.withheld).toBeUndefined()
      f.step(dt)
      ticks++
      expect(ticks).toBeLessThan(instructionDelay('RIVER', SHIPPED_VOCABULARY) / dt + 2)
    }
    // The hold ran out and the carrier set off on that very tick.
    expect(f.state.tasks[f.carrier]!.phase).toBe('fetch')
    expect(errors).not.toHaveBeenCalled()
  })

  it('holds INSIDE the errand budget rather than on top of it', () => {
    const f = fixture()
    const dt = 1 / 60
    let word = null
    for (let t = 0; t < 5 && !word; t += dt) word = f.step(dt)
    const ageAtWord = f.state.tasks[f.sender]!.age
    for (let t = 0; t < instructionDelay('RIVER', SHIPPED_VOCABULARY); t += dt) f.step(dt)
    const sender = f.state.tasks[f.sender]
    // The clock that kills an overrunning errand kept running through the hold.
    expect(sender!.age).toBeGreaterThan(ageAtWord + instructionDelay('RIVER', SHIPPED_VOCABULARY) - 2 * dt)
  })
})
