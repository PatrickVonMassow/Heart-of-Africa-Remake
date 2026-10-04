// ONE MORTAR IN A RIVERSIDE VILLAGE (point 1282): the fish eater's mortar is
// gone, the two pounding women of point 1274 work where it stood, and every
// few minutes they walk TOGETHER to the fishers' smoking rack, each take a
// fish, eat it there and walk back to take up their alternating pounding.

import { beforeAll, describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { setupGeodata } from '../../test/geodata'
import { PLACES } from '../../world/geo'
import { mulberry32 } from '../../world/noise'
import { standingClear, WALKER_RADIUS } from './collision'
import { buildLayout, fenceColliders, PLACE_RADIUS, VILLAGE_FIRE } from './layout'
import {
  VILLAGE_SPOTS,
  villageAdultStations,
  villageKeepClearSpots,
  villageLifeFootprints,
  villageLifeProps,
  villagePoundsAtCentre,
} from './lifeSpots'
import { buildRiverBank } from './riverBank'
import { sceneGrounds } from './sceneGrounds'
import { createFishFire, createFisheryRing, duoOccupation, fisherySites, stepFishFire, stepPoundingDuo, type FisherySites } from './fishFire'
import { advancePounding, createPoundingDuo, pounderStands, womanStrokePhase, type DuoPhase } from './mortarPounding'
import { canoeCycleSeconds, canoeLane, createCanoe, stepCanoe } from './villagerCanoe'

beforeAll(setupGeodata)

const fireCfg = balance.villageLife.fishFire
const mortarCfg = balance.villageLife.mortar
const RIVER_VILLAGES = PLACES.filter((p) => p.kind === 'village' && buildRiverBank(p, PLACE_RADIUS)).map((p) => p.id)
const BANKLESS_VILLAGE = PLACES.find((p) => p.kind === 'village' && !buildRiverBank(p, PLACE_RADIUS))!.id

const canoeCfg = balance.villageLife.canoe
const OBEY = 2.2

function sitesOf(id: string): FisherySites {
  const bank = buildRiverBank(PLACES.find((p) => p.id === id)!, PLACE_RADIUS)!
  return fisherySites(bank, canoeLane(bank))
}

const atCentre = (p: { x: number; z: number }) => Math.hypot(p.x - VILLAGE_SPOTS.pounder[0], p.z - VILLAGE_SPOTS.pounder[1]) < 1e-9
const pairAtCentre = (p: readonly [number, number]) => atCentre({ x: p[0], z: p[1] })

describe('a riverside village has only one mortar (point 1282)', () => {
  it('the river villages are the ones the fishery is drawn in', () => {
    expect(RIVER_VILLAGES).toContain('bambara-village')
    for (const id of RIVER_VILLAGES) expect(villagePoundsAtCentre(id)).toBe(false)
    expect(villagePoundsAtCentre(BANKLESS_VILLAGE)).toBe(true)
  })

  it.each(RIVER_VILLAGES)('%s: no mortar, pounder body or vignette ground is left at the old village-centre spot', (id) => {
    expect(villageLifeProps(VILLAGE_FIRE, id).some(atCentre)).toBe(false)
    expect(villageKeepClearSpots(id).some(pairAtCentre)).toBe(false)
    expect(villageAdultStations(VILLAGE_FIRE, id).some(pairAtCentre)).toBe(false)
    // Nor the women's bodies either side of it.
    const near = (p: { x: number; z: number }) =>
      Math.hypot(p.x - VILLAGE_SPOTS.pounder[0], p.z - VILLAGE_SPOTS.pounder[1]) <= mortarCfg.standOff + 1e-9
    expect(villageLifeFootprints(VILLAGE_FIRE, id).some(near)).toBe(false)
    const layout = buildLayout(id, 1282)
    expect(layout.colliders.some((c) => 'r' in c && 'x' in c && atCentre(c) && Math.abs(c.r - 0.55) < 1e-9)).toBe(false)
    const grounds = sceneGrounds({
      playGround: null, playRocks: null, digSites: [], waterPath: null, waterStand: null, loom: null,
      chief: null, market: null, fishery: sitesOf(id), fire: VILLAGE_FIRE, hasWell: false,
    })
    expect(grounds.some(atCentre)).toBe(false)
  })

  it('a bankless village keeps its pair at the centre mortar', () => {
    expect(villageLifeProps(VILLAGE_FIRE, BANKLESS_VILLAGE)).toContainEqual({ x: VILLAGE_SPOTS.pounder[0], z: VILLAGE_SPOTS.pounder[1], r: 0.55 })
    expect(villageAdultStations(VILLAGE_FIRE, BANKLESS_VILLAGE)).toContainEqual(VILLAGE_SPOTS.pounder)
  })

  it.each(RIVER_VILLAGES)('%s: the pair\'s mortar stands exactly where the fish eater\'s mortar stood', (id) => {
    const s = sitesOf(id)
    // The eater's mortar of work-order 1251, recomputed from its own rule: his
    // home `duoHomeBack` m back from the rack toward the middle, the mortar
    // `duoMortarOffset` m to his side of that bearing.
    const r = Math.hypot(s.rack.x, s.rack.z)
    const k = Math.max(0, (r - fireCfg.duoHomeBack) / r)
    const home = { x: s.rack.x * k, z: s.rack.z * k }
    const d = Math.hypot(s.rack.x - home.x, s.rack.z - home.z)
    const former = {
      x: home.x + ((s.rack.z - home.z) / d) * fireCfg.duoMortarOffset,
      z: home.z - ((s.rack.x - home.x) / d) * fireCfg.duoMortarOffset,
    }
    expect(s.duoMortar.x).toBeCloseTo(former.x, 9)
    expect(s.duoMortar.z).toBeCloseTo(former.z, 9)
    // Its stands are the ones `Pounder` draws the two women at.
    expect(s.duoStands).toEqual(pounderStands(s.duoMortar.x, s.duoMortar.z, s.duoYaw, mortarCfg))
    expect(s.duoStands).toHaveLength(2)
    expect(s.duoAtRack).toHaveLength(2)
  })
})

describe('the pair walks to the fish fire together, eats, and returns to pounding (point 1282)', () => {
  // The boat keeps the rack filled, as in the village.
  function run(id: string, seconds: number, seed: number) {
    const bank = buildRiverBank(PLACES.find((p) => p.id === id)!, PLACE_RADIUS)!
    const lane = canoeLane(bank)
    const s = fisherySites(bank, lane)
    const rand = mulberry32(seed)
    const ring = createFisheryRing()
    const canoe = createCanoe(lane)
    const round = canoeCycleSeconds(canoeCfg, undefined, OBEY)
    const fire = createFishFire(s, ring, 60, fireCfg, rand)
    const dt = 0.05
    const phases: DuoPhase[] = [fire.duo.phase]
    const trace: Array<{ t: number; phase: DuoPhase; women: Array<{ x: number; z: number; fish: number; arrived: boolean; stroke: number | null }> }> = []
    for (let t = 0; t < seconds; t += dt) {
      stepCanoe(canoe, lane, ring, { say: () => 'said', obeyDelay: () => OBEY }, dt, canoeCfg, rand)
      stepFishFire(fire, s, ring, dt, round, fireCfg)
      stepPoundingDuo(fire, s, dt, fireCfg, rand)
      if (fire.duo.phase !== phases[phases.length - 1]) phases.push(fire.duo.phase)
      trace.push({
        t,
        phase: fire.duo.phase,
        women: fire.duo.women.map((w, i) => ({ x: w.x, z: w.z, fish: w.fish, arrived: w.arrived, stroke: womanStrokePhase(fire.duo, i, mortarCfg) })),
      })
    }
    return { s, fire, phases, trace }
  }

  it('runs the shared cycle pound, settle, walk, take, eat, walk back, pound — in that order, again and again', () => {
    const { phases, fire } = run('bambara-village', 2400, 1282)
    const cycle: DuoPhase[] = ['pound', 'settle', 'toRack', 'take', 'eat', 'back']
    for (let i = 1; i < phases.length; i++) {
      expect(phases[i], `step ${i}: ${phases[i - 1]} -> ${phases[i]}`).toBe(cycle[(cycle.indexOf(phases[i - 1]) + 1) % cycle.length])
    }
    expect(fire.duo.visits).toBeGreaterThanOrEqual(5)
    expect(fire.eaten).toBe(2 * fire.duo.visits)
  })

  it('both women take a fish and eat it at the rack, side by side, and nobody stands idle for long', () => {
    const { trace, s } = run('bambara-village', 1800, 7)
    let wait = 0
    let pound = 0
    for (const f of trace) {
      if (f.phase === 'eat') {
        f.women.forEach((w, i) => {
          expect(w.fish).toBeGreaterThan(0)
          expect(Math.hypot(w.x - s.duoAtRack[i].x, w.z - s.duoAtRack[i].z)).toBeLessThan(1e-6)
        })
      }
      if (f.phase === 'pound') {
        pound++
        f.women.forEach((w, i) => {
          expect(Math.hypot(w.x - s.duoStands[i].x, w.z - s.duoStands[i].z)).toBeLessThan(1e-6)
          expect(w.fish).toBe(0)
        })
      }
      if ((f.phase === 'toRack' || f.phase === 'back') && f.women.some((w) => w.arrived)) wait++
    }
    // Pounding is most of their day; the one who arrives first waits only
    // moments for the other (their walks are near the same length).
    expect(pound / trace.length).toBeGreaterThan(0.6)
    expect(wait / trace.length).toBeLessThan(0.01)
  })

  it('walks both ways together: they set off in the same frame and arrive within a second of each other', () => {
    const { trace } = run('bambara-village', 1800, 11)
    let walks = 0
    for (let k = 1; k < trace.length; k++) {
      const [a, b] = [trace[k - 1], trace[k]]
      if ((b.phase === 'toRack' || b.phase === 'back') && a.phase !== b.phase) {
        // Both on the move from the walk's first frame.
        expect(b.women.every((w) => !w.arrived)).toBe(true)
        const at = [-1, -1]
        let j = k
        for (; j < trace.length && trace[j].phase === b.phase; j++) {
          trace[j].women.forEach((w, i) => {
            if (w.arrived && at[i] < 0) at[i] = trace[j].t
          })
        }
        if (j === trace.length) continue // walk cut off by the end of the trace
        // A woman never seen arrived arrived in the frame that ended the walk.
        const [t0, t1] = at.map((v) => (v < 0 ? trace[j].t : v))
        expect(Math.abs(t1 - t0)).toBeLessThan(1)
        walks++
      }
    }
    expect(walks).toBeGreaterThanOrEqual(4)
  })

  it('back at the mortar they take up the alternating stroke again, half a stroke apart', () => {
    const { trace } = run('bambara-village', 1800, 3)
    let resumed = 0
    for (let k = 1; k < trace.length; k++) {
      if (trace[k].phase === 'pound' && trace[k - 1].phase === 'back') resumed++
      const f = trace[k]
      const [p0, p1] = f.women.map((w) => w.stroke)
      if (f.phase !== 'pound') continue
      // Away from the mortar no stroke; at it, once both have started, half a stroke apart.
      expect(p0).not.toBeNull()
      expect(p1).not.toBeNull()
      if (p1! > 0 && trace[k - 1].phase === 'pound' && trace[k - 1].women[1].stroke! > 0) {
        const gap = (p1! - p0! + 1) % 1
        expect(Math.min(gap, 1 - gap)).toBeGreaterThan(0.5 - 0.02)
      }
    }
    expect(resumed).toBeGreaterThanOrEqual(3)
    for (const f of trace) if (f.phase === 'toRack' || f.phase === 'take' || f.phase === 'eat' || f.phase === 'back') {
      expect(f.women.every((w) => w.stroke === null)).toBe(true)
    }
  })

  it('every woman is visibly doing something: pounding, walking, taking, eating, or briefly waiting', () => {
    const s = sitesOf('bambara-village')
    const rand = mulberry32(5)
    const ring = createFisheryRing()
    const fire = createFishFire(s, ring, 60, fireCfg, rand)
    const seen = new Set<string>()
    for (let t = 0; t < 1200; t += 0.05) {
      stepFishFire(fire, s, ring, 0.05, 120, fireCfg)
      stepPoundingDuo(fire, s, 0.05, fireCfg, rand)
      for (let i = 0; i < 2; i++) seen.add(duoOccupation(fire.duo, i))
    }
    expect([...seen].sort()).toEqual(expect.arrayContaining(['eat', 'pound', 'take', 'walk']))
  })
})

describe('the pair\'s stations and walks stay clear (point 1282)', () => {
  const sep = balance.villageLife.separation
  it.each(RIVER_VILLAGES)('%s: the two walks run beside each other, apart, and clear of the mortar', (id) => {
    const s = sitesOf(id)
    for (let k = 0; k <= 40; k++) {
      const u = k / 40
      const at = s.duoStands.map((a, i) => ({ x: a.x + (s.duoAtRack[i].x - a.x) * u, z: a.z + (s.duoAtRack[i].z - a.z) * u }))
      expect(Math.hypot(at[0].x - at[1].x, at[0].z - at[1].z), `apart ${k}`).toBeGreaterThanOrEqual(2 * sep.bodyRadius)
      for (const p of at) {
        expect(Math.hypot(p.x - s.duoMortar.x, p.z - s.duoMortar.z), `mortar ${k}`).toBeGreaterThanOrEqual(mortarCfg.footRadius + sep.bodyRadius)
      }
    }
  })

  it.each(RIVER_VILLAGES)('%s: seeds 1-60 — every stand of the pair keeps a walker-wide gap to buildings and fences, and every walk is clear', (id) => {
    const failed: string[] = []
    for (let seed = 1; seed <= 60; seed++) {
      const layout = buildLayout(id, seed)
      const s = fisherySites(layout.bank!, canoeLane(layout.bank!))
      const buildings = layout.colliders.slice(0, layout.interactives.length + layout.dwellings.length)
      const obstacles = [...buildings, ...layout.fences.flatMap(fenceColliders)]
      for (const p of [...s.duoStands, ...s.duoAtRack]) {
        if (!standingClear(obstacles, p.x, p.z, WALKER_RADIUS + 2 * WALKER_RADIUS)) failed.push(`${seed}: stand (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`)
      }
      s.duoStands.forEach((a, i) => {
        const b = s.duoAtRack[i]
        for (let k = 0; k <= 40; k++) {
          const x = a.x + (b.x - a.x) * (k / 40)
          const z = a.z + (b.z - a.z) * (k / 40)
          if (!standingClear(layout.colliders, x, z, WALKER_RADIUS)) failed.push(`${seed}: walk ${i} at ${k}`)
        }
      })
    }
    expect(failed.slice(0, 20), `${failed.length} violations`).toEqual([])
  }, 120_000)
})

describe('settling stops each woman at her first impact', () => {
  it('counts one strike and dates it to the first crossed impact, even over a step of several strokes', () => {
    const T = mortarCfg.strokeSeconds
    const duo = createPoundingDuo(pounderStands(0, 0, 0), Infinity)
    advancePounding(duo, 0.9 * T)
    const before = duo.women.map((w) => w.impacts)
    duo.phase = 'settle'
    advancePounding(duo, 2.2 * T)
    // Woman 0 strikes at T, woman 1 (half a stroke later) at 1.5 T; neither strikes again.
    expect(duo.women.map((w, i) => w.impacts - before[i])).toEqual([1, 1])
    expect(duo.women[0].lastImpact).toBeCloseTo(T, 9)
    expect(duo.women[1].lastImpact).toBeCloseTo(1.5 * T, 9)
    expect(duo.women.every((w) => w.resting)).toBe(true)
  })
})
