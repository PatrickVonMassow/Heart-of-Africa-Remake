// Bird flight escape and aerial predators (design.md §19.19; research
// docs/fauna-behaviour-1890.md PART B): the pure ground/air machine, the ground
// predator's reach, the region pools and the scripted aerial hunt.
import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { RAPTOR_PLUMAGE, buildRaptor } from '../../render/fauna'
import type { RegionId } from '../../world/geo'
import {
  AERIAL_PREDATORS,
  AERIAL_PREDATOR_POOL,
  aerialCanTake,
  aerialHuntStep,
  birdAirStep,
  birdEscapeMode,
  chickShouldCrouch,
  groundPredatorCanReach,
  isAirborne,
  pickAerialPredator,
  startAerialHunt,
  stoopDiveAllowed,
  type AerialHuntCfg,
  type BirdAirCfg,
  type BirdAirState,
} from './wildlifeBehavior'

const AIR: BirdAirCfg = { takeoffSeconds: 1.4, settleSeconds: 4, climbRate: 1.5, descendRate: 0.8 }
const bf = balance.birdFlight
const HUNT: AerialHuntCfg = {
  highY: bf.stoopHighY,
  lowY: bf.stoopLowY,
  cruiseSpeed: 9,
  diveSpeed: bf.diveSpeed,
  chaseSpeed: bf.chaseSpeed,
  strikeReach: 0.8,
  setupSeconds: 1,
  diveCatchChance: 0.5,
  chaseCatchChance: 0.4,
  deadline: bf.huntDeadline,
  feedSeconds: 4,
  leaveSeconds: 6,
}

function run(s: BirdAirState | undefined, threatened: boolean, seconds: number, dt = 0.05): BirdAirState | undefined {
  for (let t = 0; t < seconds; t += dt) s = birdAirStep(s, threatened, dt, AIR)
  return s
}

describe('bird ground/air state (research B1)', () => {
  it('splits the roster: flamingo runs, plover adult flies, plover chick crouches, mammals and vultures do not', () => {
    expect(birdEscapeMode('flamingo', false)).toBe('running')
    expect(birdEscapeMode('plover', false)).toBe('fly')
    expect(birdEscapeMode('plover', true)).toBe('crouch')
    expect(birdEscapeMode('zebra', false)).toBe('none')
    expect(birdEscapeMode('vulture', false)).toBe('none')
  })

  it('a fleeing bird transitions ground -> take-off -> air', () => {
    let s = birdAirStep(undefined, true, 0.05, AIR)
    expect(s?.phase).toBe('takeoff')
    expect(isAirborne(s)).toBe(false)
    s = run(s, true, AIR.takeoffSeconds + 0.1)
    expect(s?.phase).toBe('air')
    expect(isAirborne(s)).toBe(true)
    s = run(s, true, 2)
    expect(s?.lift).toBe(1)
  })

  it('an unthreatened grounded bird stays grounded', () => {
    expect(birdAirStep(undefined, false, 0.05, AIR)).toBeUndefined()
  })

  it('the take-off is committed and the airborne bird settles and lands once the threat is gone', () => {
    let s = birdAirStep(undefined, true, 0.05, AIR)
    s = run(s, false, AIR.takeoffSeconds + 0.1)
    expect(s?.phase).toBe('air')
    s = run(s, false, AIR.settleSeconds + 1 / AIR.descendRate + 1)
    expect(s).toBeUndefined()
  })

  it('a zero take-off time is an instant burst launch', () => {
    expect(birdAirStep(undefined, true, 0.05, { ...AIR, takeoffSeconds: 0 })?.phase).toBe('air')
  })
})

describe("a ground predator's reach (research B1: only the bird surprised on the ground)", () => {
  const reach = bf.groundCatchReach
  it('excludes an airborne bird whatever the distance', () => {
    const air: BirdAirState = { phase: 'air', t: 0, lift: 0.1 }
    expect(groundPredatorCanReach(air, 0, reach)).toBe(false)
    expect(groundPredatorCanReach(air, reach * 0.5, reach)).toBe(false)
  })
  it('catches a still-grounded or late-starting (take-off) bird inside its reach', () => {
    expect(groundPredatorCanReach(undefined, reach * 0.5, reach)).toBe(true)
    expect(groundPredatorCanReach({ phase: 'takeoff', t: 0.2, lift: 0 }, reach * 0.5, reach)).toBe(true)
    expect(groundPredatorCanReach(undefined, reach * 2, reach)).toBe(false)
  })
  it('the plover chick crouches inside its trigger', () => {
    expect(chickShouldCrouch(bf.crouchTrigger - 1, bf.crouchTrigger)).toBe(true)
    expect(chickShouldCrouch(bf.crouchTrigger + 1, bf.crouchTrigger)).toBe(false)
  })
})

describe('region aerial-predator pools (research B2.1)', () => {
  const regions: RegionId[] = ['north', 'west', 'central', 'east', 'south']
  it('every region has a non-empty pool of known raptors without duplicates', () => {
    for (const r of regions) {
      const ids = AERIAL_PREDATOR_POOL[r].map((e) => e.id)
      expect(ids.length).toBeGreaterThan(0)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) expect(AERIAL_PREDATORS[id]).toBeDefined()
    }
  })
  it('the stoop guild spans all five regions; no hawk-eagle in the North; Barbary only in the North', () => {
    for (const r of regions) expect(AERIAL_PREDATOR_POOL[r].some((e) => AERIAL_PREDATORS[e.id].guild === 'stoop')).toBe(true)
    expect(AERIAL_PREDATOR_POOL.north.some((e) => e.id === 'africanHawkEagle' || e.id === 'ayresHawkEagle')).toBe(false)
    for (const r of regions.filter((x) => x !== 'north')) expect(AERIAL_PREDATOR_POOL[r].some((e) => e.id === 'barbary')).toBe(false)
  })
  it('the fish eagle gives the flamingo an aerial predator wherever flamingo water is south of the Sahara', () => {
    for (const r of ['west', 'central', 'east', 'south'] as const) {
      expect(AERIAL_PREDATOR_POOL[r].some((e) => e.id === 'fishEagle')).toBe(true)
    }
  })
  it('the pick is deterministic, covers the pool and respects the prey size', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(pickAerialPredator('east', i / 200, false, bf.rareRaptorWeight) ?? '')
    expect(seen.size).toBe(AERIAL_PREDATOR_POOL.east.length)
    for (let i = 0; i < 50; i++) {
      const id = pickAerialPredator('central', i / 50, true, bf.rareRaptorWeight)
      expect(id === null || AERIAL_PREDATORS[id].largePrey).toBe(true)
    }
    expect(pickAerialPredator('south', 0.3, false, bf.rareRaptorWeight)).toBe(pickAerialPredator('south', 0.3, false, bf.rareRaptorWeight))
  })
})

describe('the aerial hunt (research B3/B4: scripted descend-and-strike, air-catch chase)', () => {
  const flyingPrey = (x = 0, z = 0) => ({ x, z, y: 2.5, airborne: true })

  it('the chase guild air-catches an airborne bird and only an airborne one', () => {
    expect(aerialCanTake('chase', true)).toBe(true)
    expect(aerialCanTake('chase', false)).toBe(false)
    expect(aerialCanTake('stoop', false)).toBe(false)
    expect(aerialCanTake('low', false)).toBe(true) // the fish eagle's surface snatch
    const h = startAerialHunt('blackSparrowhawk', 10, 0, 2.5, HUNT)
    expect(h.phase).toBe('chase')
    let ev = 'none'
    for (let i = 0; i < 200 && ev === 'none'; i++) ev = aerialHuntStep(h, flyingPrey(), 0.05, HUNT, 0.1)
    expect(ev).toBe('caught')
    expect(h.phase).toBe('feed')
    const g = startAerialHunt('blackSparrowhawk', 10, 0, 0, HUNT)
    expect(aerialHuntStep(g, { x: 0, z: 0, y: 0, airborne: false }, 0.05, HUNT, 0.1)).toBe('lost')
  })

  it('the stoop is height-gated: it plunges only from the high band onto an airborne bird under the low band', () => {
    expect(stoopDiveAllowed(HUNT.highY, 2.5, true, HUNT.highY, HUNT.lowY)).toBe(true)
    expect(stoopDiveAllowed(HUNT.highY - 3, 2.5, true, HUNT.highY, HUNT.lowY)).toBe(false)
    expect(stoopDiveAllowed(HUNT.highY, HUNT.lowY + 1, true, HUNT.highY, HUNT.lowY)).toBe(false)
    expect(stoopDiveAllowed(HUNT.highY, 0, false, HUNT.highY, HUNT.lowY)).toBe(false)
    // A grounded bird never draws the plunge: the stooper holds high until the deadline.
    const held = startAerialHunt('peregrine', 0, 0, 0, HUNT)
    for (let i = 0; i < 40; i++) aerialHuntStep(held, { x: 0, z: 0, y: 0, airborne: false }, 0.05, HUNT, 0.1)
    expect(held.phase).toBe('high')
    expect(held.y).toBe(HUNT.highY)
  })

  it('a stoop enters high, plunges and strikes the flying bird', () => {
    const h = startAerialHunt('peregrine', 12, 0, 2.5, HUNT)
    expect(h.phase).toBe('high')
    expect(h.y).toBe(HUNT.highY)
    const phases = new Set<string>()
    let ev = 'none'
    let minY = Infinity
    for (let i = 0; i < 400 && ev === 'none'; i++) {
      ev = aerialHuntStep(h, flyingPrey(), 0.05, HUNT, 0.1)
      phases.add(h.phase)
      minY = Math.min(minY, h.y)
    }
    expect(phases.has('dive')).toBe(true)
    expect(ev).toBe('caught')
    expect(minY).toBeLessThan(HUNT.lowY)
  })

  it('a stoop already plunging never takes a bird that landed meanwhile', () => {
    const h = startAerialHunt('peregrine', 12, 0, 2.5, HUNT)
    for (let i = 0; i < 400 && h.phase !== 'dive'; i++) aerialHuntStep(h, flyingPrey(), 0.05, HUNT, 0.1)
    expect(h.phase).toBe('dive')
    let ev = 'none'
    for (let i = 0; i < 400 && ev === 'none'; i++) ev = aerialHuntStep(h, { x: 0, z: 0, y: 0, airborne: false }, 0.05, HUNT, 0.1)
    expect(ev).toBe('lost')
    expect(h.outcome).not.toBe('caught')
  })

  it('a failed strike lets the prey escape and the raptor leaves', () => {
    const h = startAerialHunt('lanner', 5, 0, 2.5, HUNT)
    let ev = 'none'
    for (let i = 0; i < 400 && ev === 'none'; i++) ev = aerialHuntStep(h, flyingPrey(), 0.05, HUNT, 0.99)
    expect(ev).toBe('missed')
    expect(h.phase).toBe('leave')
  })

  it('every started hunt resolves to done within its hard deadlines (I4), whatever the prey does', () => {
    const cases: Array<[Parameters<typeof startAerialHunt>[0], (i: number) => ReturnType<typeof flyingPrey> | null]> = [
      ['peregrine', () => ({ x: 0, z: 0, y: 0, airborne: false })], // never flies: no plunge
      ['gabarGoshawk', (i) => flyingPrey(i * 0.5, 0)], // a prey that outruns the chase
      ['fishEagle', () => null], // the prey streamed out
      ['ayresHawkEagle', () => flyingPrey()], // a clean stoop
    ]
    const bound = HUNT.deadline + HUNT.feedSeconds + HUNT.leaveSeconds + 1
    for (const [id, prey] of cases) {
      const h = startAerialHunt(id, 20, 0, 2.5, HUNT)
      let done = false
      let t = 0
      for (let i = 0; t < bound && !done; i++, t += 0.05) done = aerialHuntStep(h, prey(i), 0.05, HUNT, 0.1) === 'done'
      expect(done, id).toBe(true)
    }
  })
})

describe('raptor builds (src/render/fauna.ts)', () => {
  it('every pooled raptor has a plumage and builds a spread-wing body wider than long', () => {
    for (const id of Object.keys(AERIAL_PREDATORS) as Array<keyof typeof AERIAL_PREDATORS>) {
      const geo = buildRaptor(RAPTOR_PLUMAGE[id])
      geo.computeBoundingBox()
      const b = geo.boundingBox!
      expect(geo.getAttribute('position').count, id).toBeGreaterThan(0)
      expect(b.max.x - b.min.x, id).toBeGreaterThan(b.max.z - b.min.z)
    }
  })
})
