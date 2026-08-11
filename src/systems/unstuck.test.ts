import { describe, it, expect } from 'vitest'
import { escapeOutcome, findFreeSpot, newStallState, updateStall } from './unstuck'
import { standingClear, PLAYER_RADIUS, type Collider } from '../scenes/place/collision'

const cfg = { stallDistance: 0.5, stallSeconds: 3 }

/** Feed `seconds` of frames at 60 Hz to the detector, position unchanged. */
function hold(x: number, z: number, seconds: number, moving: boolean, from = newStallState(x, z)) {
  let s = from
  for (let t = 0; t < seconds * 60; t++) s = updateStall(s, x, z, moving, 1 / 60, cfg)
  return s
}

describe('stall detection (work-order 604)', () => {
  it('fires when a movement key is held and the position does not advance', () => {
    const s = hold(3, 4, 4, true)
    expect(s.stuck).toBe(true)
  })

  it('stays silent below the stall window', () => {
    expect(hold(3, 4, 2.5, true).stuck).toBe(false)
  })

  it('never fires on a player who is simply standing still', () => {
    expect(hold(3, 4, 30, false).stuck).toBe(false)
  })

  it('never fires while he creeps forward past the threshold', () => {
    let s = newStallState(0, 0)
    for (let t = 0; t < 60 * 10; t++) s = updateStall(s, t * 0.02, 0, true, 1 / 60, cfg)
    expect(s.stuck).toBe(false)
  })

  it('clears as soon as he moves again, and the anchor follows him', () => {
    const stuck = hold(3, 4, 4, true)
    expect(stuck.stuck).toBe(true)
    const freed = updateStall(stuck, 3, 5.2, true, 1 / 60, cfg)
    expect(freed.stuck).toBe(false)
    expect(freed.heldSeconds).toBe(0)
    expect([freed.anchorX, freed.anchorZ]).toEqual([3, 5.2])
  })

  it('keeps the hint up while he merely lets go of the key', () => {
    const stuck = hold(3, 4, 4, true)
    const released = hold(3, 4, 5, false, stuck)
    expect(released.stuck).toBe(true)
    expect(released.heldSeconds).toBe(0)
  })

  it('holding again after a release does not need a second full window', () => {
    // The clock restarts, but the raised hint is still standing — he is stuck.
    const s = hold(3, 4, 0.5, true, hold(3, 4, 4, true))
    expect(s.stuck).toBe(true)
  })
})

describe('free-spot search (work-order 604)', () => {
  const wedge: Collider[] = [
    // Two walls 0.4 m apart running along x — narrower than the player fits
    // through, the shape that trapped the reported traveller.
    { kind: 'segment', x1: -10, z1: 0.2, x2: 10, z2: 0.2, r: 0.2 },
    { kind: 'segment', x1: -10, z1: -0.2, x2: 10, z2: -0.2, r: 0.2 },
  ]
  const accept = (cols: Collider[]) => (x: number, z: number) => standingClear(cols, x, z, PLAYER_RADIUS)
  const blocked = (cols: Collider[]) => (x: number, z: number) => !standingClear(cols, x, z, 0)

  it('returns a spot no collider contains', () => {
    const r = findFreeSpot(0, 0, {
      step: 0.25,
      maxRadius: 8,
      accept: accept(wedge),
      fallback: [0, 20],
    })
    expect(r.found).toBe(true)
    expect(standingClear(wedge, r.pos[0], r.pos[1], PLAYER_RADIUS)).toBe(true)
  })

  it('prefers the nearest free ground', () => {
    const hut: Collider[] = [{ x: 0, z: 0, r: 2 }]
    const r = findFreeSpot(0, 0, { step: 0.25, maxRadius: 12, accept: accept(hut), fallback: [0, 20] })
    // Just outside the hut's inflated body, not somewhere across the village.
    expect(Math.hypot(r.pos[0], r.pos[1])).toBeLessThan(2 + PLAYER_RADIUS + 0.5)
    expect(standingClear(hut, r.pos[0], r.pos[1], PLAYER_RADIUS)).toBe(true)
  })

  it('is deterministic — the same wedge frees him to the same spot', () => {
    const opts = { step: 0.25, maxRadius: 8, accept: accept(wedge), fallback: [0, 20] as const }
    expect(findFreeSpot(0, 0, opts).pos).toEqual(findFreeSpot(0, 0, opts).pos)
  })

  it('refuses a spot behind a wall', () => {
    // A long wall with free ground on both sides: he stands south of it, and the
    // nearest free ground by pure distance lies NORTH — through the wall.
    const wall: Collider[] = [{ kind: 'segment', x1: -20, z1: 0, x2: 20, z2: 0, r: 0.3 }]
    const here: [number, number] = [0, 0.5] // inside the wall's inflated band
    const guarded = findFreeSpot(here[0], here[1], {
      step: 0.25,
      maxRadius: 8,
      accept: accept(wall),
      blocked: blocked(wall),
      fallback: [0, 20],
    })
    expect(guarded.found).toBe(true)
    expect(guarded.pos[1]).toBeGreaterThan(0) // stayed on his own side of the wall
    const unguarded = findFreeSpot(here[0], here[1], {
      step: 0.25,
      maxRadius: 8,
      accept: () => true,
      fallback: [0, 20],
    })
    expect(unguarded.pos).toEqual([here[0], here[1]]) // already acceptable without the rule
  })

  it('searches on when he is pressed INSIDE a collider, where no line is clear', () => {
    const hut: Collider[] = [{ x: 0, z: 0, r: 2 }]
    const r = findFreeSpot(0, 0, {
      step: 0.25,
      maxRadius: 12,
      accept: accept(hut),
      blocked: blocked(hut),
      fallback: [0, 40],
    })
    expect(r.found).toBe(true)
    expect(r.pos).not.toEqual([0, 40])
  })

  it('falls back to the entry point when the radius holds nothing', () => {
    const r = findFreeSpot(0, 0, {
      step: 0.5,
      maxRadius: 6,
      accept: () => false,
      fallback: [0, 18],
    })
    expect(r.found).toBe(false)
    expect(r.pos).toEqual([0, 18])
  })
})

describe('the escape reports only what happened (work-order 610)', () => {
  it('a search that carried him somewhere else freed him', () => {
    expect(escapeOutcome(0, 0, { pos: [1.5, 0], found: true })).toBe('freed')
  })

  it('a failed search whose fallback still moves him (the settlement entry point) freed him', () => {
    expect(escapeOutcome(0, 0, { pos: [0, 18], found: false })).toBe('freed')
  })

  it('a failed search that puts him back where he stood freed NOBODY', () => {
    // The bird's-eye fallback IS his own position, so this is the case the game
    // used to announce as a rescue.
    expect(escapeOutcome(-4.25, 9.5, { pos: [-4.25, 9.5], found: false })).toBe('noRoom')
  })

  it('a press on open ground reports no rescue either', () => {
    expect(escapeOutcome(2, 3, { pos: [2, 3], found: true })).toBe('alreadyFree')
  })

  it('a hair of floating-point drift is not a rescue', () => {
    expect(escapeOutcome(2, 3, { pos: [2 + 1e-12, 3], found: false })).toBe('noRoom')
  })

  it('the whole travel case end to end: nothing free within reach, nothing claimed', () => {
    const r = findFreeSpot(7, -3, {
      step: 0.34,
      maxRadius: 6.72,
      accept: () => false, // every ring blocked, as in a closed stand of trees
      fallback: [7, -3], // the bird's-eye fallback: where he already stands
    })
    expect(escapeOutcome(7, -3, r)).toBe('noRoom')
  })
})
