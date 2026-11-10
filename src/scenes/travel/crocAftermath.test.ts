import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import {
  carcassShrinkUnfed,
  crocVictimState,
  isSinkingBody,
  lungeHolds,
  releaseCrocVictim,
  releaseOrphanedCrocVictims,
  sinkKill,
  sinkOffset,
} from './crocAftermath'
import { crocodileGripExpired, crocodileHoldsCatch } from './wildlifeBehavior'
import { markKilled, stepCaught } from './youngKill'

// The croc exit paths of design.md §19.16 (work-order point 319), composed from
// the same pure pieces Wildlife's frame runs: seize, the caught countdown, the
// kill, the grip deadline, the view-ring cull. Every path must end with the
// victim SINKING (kill) or ALIVE (release) — never detached, never shrinking
// with no actor.

interface Victim {
  caught?: number
  caughtBy?: 'crocodile'
  dead?: boolean
  gone?: boolean
  inWater?: number
  dissolve?: number
  lionFed?: boolean
}
interface Lunge {
  victim: Victim | null
  alongside?: Victim
  retreat?: boolean
  gripped: boolean
  timer: number
}
interface Croc {
  dead?: boolean
  lunge?: Lunge
}

const CAUGHT = 5
const DISSOLVE = 9
const DT = 1 / 30
const bc = balance.crocodile

const seize = (): { croc: Croc; victim: Victim } => {
  const victim: Victim = { caught: CAUGHT, caughtBy: 'crocodile' }
  return { croc: { lunge: { victim, gripped: true, timer: 0 } }, victim }
}

/** One frame of the herd pre-pass for a caught victim (Wildlife: stepCaught
 *  then takeAnimal with `sink` for a crocodile catch). */
const herdStep = (v: Victim) => {
  if (!v.dead && stepCaught(v, DT) && v.caughtBy === 'crocodile') sinkKill(v, DISSOLVE, 'crocodile')
  // The water-death pass: a sinking body runs its own dissolve.
  if (v.dead && v.inWater !== undefined && v.dissolve !== undefined && v.dissolve > 0) v.dissolve -= DT
}

/** One frame of the gripping crocodile (Wildlife feeding branch + retreat). */
const crocStep = (c: Croc) => {
  const l = c.lunge
  if (!l || !l.victim) return
  if (l.retreat || !crocodileHoldsCatch(true, l.victim.caught, l.victim.dead === true, l.victim.dissolve)) {
    c.lunge = undefined // slinks home
    return
  }
  if (l.victim.caught !== undefined) {
    l.timer += DT
    if (crocodileGripExpired(l.timer, bc.gripSeconds)) {
      l.retreat = true
      releaseCrocVictim(l.victim)
    }
  }
}

describe('crocodile exit paths (point 319)', () => {
  it('kill: the countdown ends in a SINK held by the crocodile, then the croc lets go', () => {
    const { croc, victim } = seize()
    const held: string[] = []
    for (let t = 0; t < CAUGHT + DISSOLVE + 2; t += DT) {
      herdStep(victim)
      crocStep(croc)
      held.push(crocVictimState(victim, lungeHolds(croc.lunge, victim)))
      if (croc.lunge === undefined) break
    }
    expect(victim.dead).toBe(true)
    expect(isSinkingBody(victim)).toBe(true)
    expect(victim.lionFed).toBe(true) // no ground scavenger over the river
    expect(held).not.toContain('detached')
    expect(held).toContain('struggling')
    expect(held).toContain('sinking')
    // The crocodile held the body until it was gone.
    expect(victim.dissolve!).toBeLessThanOrEqual(0)
    expect(croc.lunge).toBeUndefined()
  })

  it('grip deadline: a victim whose countdown froze is freed ALIVE, never killed later', () => {
    const { croc, victim } = seize()
    // Frozen countdown: the herd pass no longer reaches it (point 186).
    for (let t = 0; t < bc.gripSeconds + 1; t += DT) crocStep(croc)
    expect(croc.lunge === undefined || croc.lunge.retreat === true).toBe(true)
    expect(victim.caught).toBeUndefined()
    expect(victim.caughtBy).toBeUndefined()
    // The victim resumes: nothing ever kills it afterwards.
    for (let t = 0; t < CAUGHT + 1; t += DT) herdStep(victim)
    expect(victim.dead).toBeUndefined()
    expect(crocVictimState(victim, false)).toBe('alive')
  })

  it('the deadline lies past the struggle window, so a normal kill is never cut short', () => {
    expect(bc.gripSeconds).toBeGreaterThan(CAUGHT)
  })

  it('ring despawn mid-struggle: the crocodile gone, the victim is freed ALIVE the same frame', () => {
    const { croc, victim } = seize()
    for (let t = 0; t < 1; t += DT) {
      herdStep(victim)
      crocStep(croc)
    }
    const crocs: Croc[] = [] // the view ring culled the crocodile
    expect(crocVictimState(victim, false)).toBe('detached') // the reported state, before the fix runs
    const freed = releaseOrphanedCrocVictims([victim], crocs)
    expect(freed).toEqual([victim])
    expect(crocVictimState(victim, false)).toBe('alive')
    for (let t = 0; t < CAUGHT + 1; t += DT) herdStep(victim)
    expect(victim.dead).toBeUndefined() // no sink with no crocodile there
  })

  it('ring despawn mid-sink: the body keeps SINKING (the river keeps it), never re-animated', () => {
    const victim: Victim = { caughtBy: 'crocodile' }
    sinkKill(victim, DISSOLVE, 'crocodile')
    releaseOrphanedCrocVictims([victim], [])
    expect(victim.dead).toBe(true)
    expect(crocVictimState(victim, false)).toBe('sinking')
  })

  it('a still-holding crocodile keeps its victim; a retreating one does not', () => {
    const { croc, victim } = seize()
    expect(releaseOrphanedCrocVictims([victim], [croc])).toEqual([])
    expect(victim.caught).toBe(CAUGHT)
    croc.lunge!.retreat = true
    expect(releaseOrphanedCrocVictims([victim], [croc])).toEqual([victim])
  })

  it('a dead crocodile holds nothing', () => {
    const { croc, victim } = seize()
    croc.dead = true
    expect(releaseOrphanedCrocVictims([victim], [croc])).toEqual([victim])
  })

  it('the too-late parent taken alongside is held by the crocodile until it has sunk', () => {
    const { croc, victim } = seize()
    const parent: Victim = {}
    victim.caught = undefined
    sinkKill(victim, DISSOLVE, 'crocodile')
    sinkKill(parent, DISSOLVE, 'crocodile')
    croc.lunge!.alongside = parent
    expect(lungeHolds(croc.lunge, parent)).toBe(true)
    expect(crocVictimState(parent, true)).toBe('sinking')
    expect(crocodileHoldsCatch(true, undefined, true, parent.dissolve)).toBe(true)
  })

  it('a dead crocodile victim off the sink path is detached (a bank carcass with no actor)', () => {
    const v: Victim = { caughtBy: 'crocodile' }
    markKilled(v, DISSOLVE, 'crocodile')
    expect(crocVictimState(v, true)).toBe('detached')
  })
})

describe('carcassShrinkUnfed — the "shrinking carcass has no feeder" rule (point 319)', () => {
  it('flags a land carcass whose dissolve dropped with no feeder', () => {
    expect(carcassShrinkUnfed(9, 8.9, false, false)).toBe(true)
  })
  it('passes a fed shrink, a sinking body, a still timer and a first sighting', () => {
    expect(carcassShrinkUnfed(9, 8.9, false, true)).toBe(false)
    expect(carcassShrinkUnfed(9, 8.9, true, false)).toBe(false)
    expect(carcassShrinkUnfed(9, 9, false, false)).toBe(false)
    expect(carcassShrinkUnfed(undefined, 8.9, false, false)).toBe(false)
    expect(carcassShrinkUnfed(8.9, undefined, false, false)).toBe(false)
  })
  it('a crocodile kill run through its whole sink never counts as an unfed shrink', () => {
    const v: Victim = {}
    sinkKill(v, DISSOLVE, 'crocodile')
    let prev: number | undefined
    let flagged = false
    while (v.dissolve! > 0) {
      herdStep(v)
      if (carcassShrinkUnfed(prev, v.dissolve, isSinkingBody(v), false)) flagged = true
      prev = v.dissolve
    }
    expect(flagged).toBe(false)
  })
})

describe('sinkOffset — the visible sink (point 319)', () => {
  it('starts at the surface and reaches the full depth as the window runs out', () => {
    expect(sinkOffset(9, 9, 1.6)).toBe(0)
    expect(sinkOffset(4.5, 9, 1.6)).toBeCloseTo(0.8)
    expect(sinkOffset(0, 9, 1.6)).toBeCloseTo(1.6)
    expect(sinkOffset(-1, 9, 1.6)).toBeCloseTo(1.6)
  })
  it('is zero for an undefined timer or a degenerate window', () => {
    expect(sinkOffset(undefined, 9, 1.6)).toBe(0)
    expect(sinkOffset(3, 0, 1.6)).toBe(0)
  })
  it('the calibrated depth exceeds a lying adult body', () => {
    expect(bc.sinkDepth).toBeGreaterThan(1)
  })
})
