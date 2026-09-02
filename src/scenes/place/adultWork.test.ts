// The adults teach by doing their own work (work-order 688). What is pinned here
// is exactly what the point's spec forbids a player from learning wrongly: where
// each word falls, that it is ONE atom, that the digging word sits on the STROKE
// and that no word is ever aimed at another person.

import { describe, expect, it } from 'vitest'
import {
  ADULT_CONCEPTS,
  ADULT_SITUATIONS,
  carryOf,
  clearTask,
  createAdultWork,
  digStrikeCrossed,
  isDigging,
  stepAdultWork,
  taskOf,
  WATER_FOOT_REACH,
  WORK_ARRIVE_RADIUS,
  type AdultWorkConfig,
  type AdultWorkView,
  type SpokenWord,
} from './adultWork'
import { CONCEPT_IDS } from '../../communication/lexicon'
import { DIG_CYCLE_SECONDS, digPose, poseDistanceFromRest } from '../../render/gesture'

const CFG: AdultWorkConfig = {
  intervalSeconds: 1,
  intervalSpread: 0,
  dwellSeconds: 2,
  digSeconds: 6,
  errandSeconds: 90,
  stallSeconds: 20,
  pace: 1.25,
}

const HEAD = { x: 12, z: 0 }
const FOOT = { x: 34, z: -6 }

/** A village of `n` adults, all free, all standing at the middle. */
function view(n: number, at?: Array<{ x: number; z: number }>): AdultWorkView {
  return {
    villagers: Array.from({ length: n }, (_, i) => ({
      x: at?.[i]?.x ?? 0,
      z: at?.[i]?.z ?? i * 0.5,
      free: true,
    })),
    geography: {
      waterHead: { ...HEAD },
      waterFoot: { ...FOOT },
      digSites: [
        { x: -11, z: 2, kind: 'pit' },
        { x: -16, z: -1, kind: 'postHole' },
        { x: -4, z: -19, kind: 'patch' },
      ],
    },
  }
}

/**
 * Runs the village until `stop` says to, walking every villager toward the goal
 * its task names at the configured pace — which is what `PlaceLife` does with
 * what comes back. Every atom spoken is collected WITH the place it was spoken
 * at, because that is the whole of what this module has to get right.
 */
function run(
  v: AdultWorkView,
  seconds: number,
  cfg = CFG,
  rand: () => number = () => 0.5,
): Array<SpokenWord & { at: { x: number; z: number } }> {
  const state = createAdultWork(v.villagers.length, cfg)
  const said: Array<SpokenWord & { at: { x: number; z: number } }> = []
  const dt = 1 / 60
  for (let t = 0; t < seconds; t += dt) {
    for (let i = 0; i < v.villagers.length; i++) {
      const me = v.villagers[i]
      const task = taskOf(state, i)
      me.free = !task
      if (!task || task.arrived) continue
      const d = Math.hypot(task.x - me.x, task.z - me.z)
      if (d <= 1e-6) continue
      const step = Math.min(d, cfg.pace * dt)
      me.x += ((task.x - me.x) / d) * step
      me.z += ((task.z - me.z) / d) * step
    }
    const word = stepAdultWork(state, v, dt, cfg, rand)
    if (word) said.push({ ...word, at: { x: v.villagers[word.speaker].x, z: v.villagers[word.speaker].z } })
  }
  return said
}

describe('the adults keep to the two words that are theirs', () => {
  it('names only RIVER and DIG, and both are in the lexicon', () => {
    expect([...ADULT_CONCEPTS].sort()).toEqual(['DIG', 'RIVER'])
    for (const concept of ADULT_CONCEPTS) expect(CONCEPT_IDS).toContain(concept)
  })

  it('carries four situations — two for each word', () => {
    expect(ADULT_SITUATIONS).toHaveLength(4)
    expect(ADULT_SITUATIONS.filter((id) => id.startsWith('water-'))).toHaveLength(2)
    expect(ADULT_SITUATIONS.filter((id) => id.startsWith('dig-'))).toHaveLength(2)
  })

  it('leaves the direction words and ROCK to the children', () => {
    for (const concept of ADULT_CONCEPTS) {
      expect(['UPSTREAM', 'DOWNSTREAM', 'ROCK']).not.toContain(concept)
    }
  })
})

describe('the water is taught at the head of the path, never at the bank', () => {
  it('speaks RIVER twice over a long run, once setting out and once arriving', () => {
    const v = view(6)
    const said = run(v, 240)
    const river = said.filter((s) => s.concept === 'RIVER')
    expect(river.length).toBeGreaterThan(1)
    expect(new Set(river.map((s) => s.id))).toEqual(new Set(['water-out', 'water-back']))
  })

  it('drops every RIVER at the head, and none within reach of the water', () => {
    const v = view(6)
    for (const s of run(v, 240).filter((w) => w.concept === 'RIVER')) {
      // In the village, at the head of the path …
      expect(Math.hypot(s.at.x - HEAD.x, s.at.z - HEAD.z), `${s.id} spoke at ${s.at.x},${s.at.z}`).toBeLessThanOrEqual(
        WORK_ARRIVE_RADIUS,
      )
      // … and therefore nowhere near the bank, where the children play.
      expect(Math.hypot(s.at.x - FOOT.x, s.at.z - FOOT.z)).toBeGreaterThan(WATER_FOOT_REACH)
    }
  })

  it('aims the word at the water, both times', () => {
    for (const s of run(view(6), 240).filter((w) => w.concept === 'RIVER')) {
      expect({ x: s.aim.x, z: s.aim.z }).toEqual(FOOT)
    }
  })

  it('sends the outbound carrier down with an EMPTY jar and brings one back FULL', () => {
    const v = view(4)
    const state = createAdultWork(v.villagers.length, CFG)
    const dt = 1 / 60
    const carried = new Set<string>()
    for (let t = 0; t < 240; t += dt) {
      for (let i = 0; i < v.villagers.length; i++) {
        const me = v.villagers[i]
        const task = taskOf(state, i)
        me.free = !task
        if (task) carried.add(`${task.situation}:${carryOf(state, i)}`)
        if (!task || task.arrived) continue
        const d = Math.hypot(task.x - me.x, task.z - me.z)
        if (d <= 1e-6) continue
        const step = Math.min(d, CFG.pace * dt)
        me.x += ((task.x - me.x) / d) * step
        me.z += ((task.z - me.z) / d) * step
      }
      stepAdultWork(state, v, dt, CFG, () => 0.5)
    }
    expect(carried).toContain('water-out:emptyJar')
    expect(carried).toContain('water-back:fullJar')
  })

  it('casts the carrier coming BACK from someone already at the water', () => {
    // Nobody is down there, so there is nobody to arrive from the river: the
    // situation is skipped rather than teleporting a man to the bank.
    const v = view(3)
    const state = createAdultWork(3, CFG)
    for (let t = 0; t < 10; t += 1 / 60) stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
    expect(state.staged['water-back'] ?? 0).toBe(0)
  })

  it('teaches only digging where the settlement has no river', () => {
    const v = view(4)
    v.geography.waterHead = null
    v.geography.waterFoot = null
    const said = run(v, 180)
    expect(said.length).toBeGreaterThan(0)
    for (const s of said) expect(s.concept).toBe('DIG')
  })
})

describe('the digging word sits on the stroke', () => {
  it('crosses a strike exactly once per dig cycle', () => {
    let strikes = 0
    const dt = 1 / 60
    for (let t = 0; t < 10 * DIG_CYCLE_SECONDS; t += dt) {
      if (digStrikeCrossed(t, t + dt)) strikes++
    }
    expect(strikes).toBe(10)
  })

  it('says DIG only once the digger has arrived and struck, never on the way', () => {
    const v = view(6)
    for (const s of run(v, 240).filter((w) => w.concept === 'DIG')) {
      const site = v.geography.digSites.find(
        (d) => Math.hypot(s.at.x - d.x, s.at.z - d.z) <= WORK_ARRIVE_RADIUS,
      )
      expect(site, `DIG spoke at ${s.at.x.toFixed(1)},${s.at.z.toFixed(1)}, off every site`).toBeTruthy()
      // And aimed at the ground under him, not at anybody.
      expect({ x: s.aim.x, z: s.aim.z }).toEqual({ x: site!.x, z: site!.z })
      expect(s.aim.y).toBe(0)
    }
  })

  it('holds the digging pose while it speaks — the word lands mid-stroke', () => {
    const v = view(6)
    const state = createAdultWork(6, CFG)
    const dt = 1 / 60
    let spokeWhileDigging = 0
    let spokeOtherwise = 0
    for (let t = 0; t < 240; t += dt) {
      for (let i = 0; i < v.villagers.length; i++) {
        const me = v.villagers[i]
        const task = taskOf(state, i)
        me.free = !task
        if (!task || task.arrived) continue
        const d = Math.hypot(task.x - me.x, task.z - me.z)
        if (d <= 1e-6) continue
        const step = Math.min(d, CFG.pace * dt)
        me.x += ((task.x - me.x) / d) * step
        me.z += ((task.z - me.z) / d) * step
      }
      const word = stepAdultWork(state, v, dt, CFG, () => 0.5)
      if (word?.concept === 'DIG') {
        if (isDigging(state, word.speaker)) spokeWhileDigging++
        else spokeOtherwise++
      }
    }
    expect(spokeWhileDigging).toBeGreaterThan(0)
    expect(spokeOtherwise).toBe(0)
    // And the pose that goes with it is a visible stroke, not a figure at rest.
    expect(poseDistanceFromRest(digPose(DIG_CYCLE_SECONDS * 0.99))).toBeGreaterThan(1)
  })

  it('digs at two different sites, so DIG is not the name of one hole', () => {
    const v = view(6)
    const sites = new Set(
      run(v, 360)
        .filter((s) => s.concept === 'DIG')
        .map((s) => `${s.aim.x},${s.aim.z}`),
    )
    expect(sites.size).toBeGreaterThan(1)
  })

  it('never aims a word at another villager — nobody is called over', () => {
    const v = view(6)
    for (const s of run(v, 360)) {
      for (let i = 0; i < v.villagers.length; i++) {
        if (i === s.speaker) continue
        // The aim is a place — the water or the worked ground — and a villager
        // who happens to stand there is a coincidence, so this is checked at the
        // moment of speech against the catalogue's own targets instead.
        expect([...v.geography.digSites.map((d) => `${d.x},${d.z}`), `${FOOT.x},${FOOT.z}`]).toContain(
          `${s.aim.x},${s.aim.z}`,
        )
      }
    }
  })

  it('lets a neighbour join the second digger without a word of his own', () => {
    const v = view(6)
    const state = createAdultWork(6, CFG)
    const dt = 1 / 60
    let sawAPair = false
    for (let t = 0; t < 240; t += dt) {
      for (let i = 0; i < v.villagers.length; i++) {
        const me = v.villagers[i]
        const task = taskOf(state, i)
        me.free = !task
        if (!task || task.arrived) continue
        const d = Math.hypot(task.x - me.x, task.z - me.z)
        if (d <= 1e-6) continue
        const step = Math.min(d, CFG.pace * dt)
        me.x += ((task.x - me.x) / d) * step
        me.z += ((task.z - me.z) / d) * step
      }
      stepAdultWork(state, v, dt, CFG, () => 0.5)
      const joiners = state.tasks.filter((t2) => t2?.situation === 'dig-joined')
      if (joiners.length < 2) continue
      // Every pair works ONE piece of ground: the joiner stands a stand-off away
      // from the digger, not at some other site.
      for (const site of v.geography.digSites) {
        const here = joiners.filter((j) => Math.hypot(j!.x - site.x, j!.z - site.z) < 3)
        if (here.length < 2) continue
        sawAPair = true
        // AND ONLY ONE OF THEM OWES A WORD. The second man joins of his own
        // accord and says nothing: a word spoken to summon somebody teaches
        // "come" at least as well as it teaches "dig".
        expect(here.filter((j) => j!.owes).length).toBeLessThanOrEqual(1)
      }
    }
    expect(sawAPair).toBe(true)
  })
})

describe('every utterance is a single atom', () => {
  it('returns one concept per spoken word, never a phrase', () => {
    for (const s of run(view(6), 360)) {
      expect(typeof s.concept).toBe('string')
      expect(ADULT_CONCEPTS).toContain(s.concept)
    }
  })

  it('speaks at most one word a frame', () => {
    // `stepAdultWork` returns a single word or null, so a frame can never carry
    // two voices — the check is that the state agrees: the last word recorded is
    // the one just returned.
    const v = view(6)
    const state = createAdultWork(6, CFG)
    for (let t = 0; t < 120; t += 1 / 60) {
      const word = stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
      if (word) expect(state.last).toMatchObject({ id: word.id, concept: word.concept, speaker: word.speaker })
    }
  })
})

describe('the module survives the village it is stepped in', () => {
  it('hands out an empty state and never digs before anything is staged', () => {
    const state = createAdultWork(3, CFG)
    expect(state.tasks).toHaveLength(3)
    for (let i = 0; i < 3; i++) {
      expect(taskOf(state, i)).toBeNull()
      expect(isDigging(state, i)).toBe(false)
      expect(carryOf(state, i)).toBe('none')
    }
  })

  it('clears an index that holds nothing, and one that does not exist', () => {
    const state = createAdultWork(2, CFG)
    expect(() => clearTask(state, 0)).not.toThrow()
    expect(() => clearTask(state, 9)).not.toThrow()
    expect(() => clearTask(state, -1)).not.toThrow()
    expect(state.tasks).toHaveLength(2)
  })

  it('stages nothing in a settlement with neither water nor work', () => {
    const v = view(3)
    v.geography.waterHead = null
    v.geography.waterFoot = null
    v.geography.digSites = []
    const state = createAdultWork(3, CFG)
    for (let t = 0; t < 120; t += 1 / 60) {
      expect(stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)).toBeNull()
    }
    expect(state.last).toBeNull()
  })

  it('lets a task go rather than pin a villager who cannot get there', () => {
    // Nobody walks: every goal stays out of reach, and the backstop releases the
    // man instead of holding him for the rest of the visit.
    const v = view(3)
    const state = createAdultWork(3, CFG)
    let everBusy = false
    for (let t = 0; t < CFG.errandSeconds + 30; t += 1 / 60) {
      stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
      if (state.tasks.some(Boolean)) everBusy = true
    }
    expect(everBusy).toBe(true)
    for (const task of state.tasks) {
      expect(task === null || task.age <= CFG.errandSeconds).toBe(true)
    }
  })
})
