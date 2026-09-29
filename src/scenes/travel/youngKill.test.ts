import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { findAdopter } from './wildlifeBehavior'
import {
  feedRemnant,
  handVigilToRemains,
  killFlockLands,
  killFlockRemnant,
  markKilled,
  releaseBereavedParent,
  stepCaught,
} from './youngKill'

// The body the herd lists hold, reduced to what the kill, the vigil, the
// adoption and the kill flock read.
interface Body {
  id: string
  x: number
  z: number
  young?: boolean
  dead?: boolean
  gone?: boolean
  remnant?: boolean
  lionFed?: boolean
  dissolve?: number
  caught?: number
  parent?: Body
  child?: Body
  vigil?: { x: number; z: number; carcass: Body; time: number }
  bereaved?: number
}

const DT = 0.1
const CARCASS_SECONDS = 10 // the predator's feed on the dead young (Wildlife CARCASS_DISSOLVE_SECONDS)
const TOO_LATE = 3.2 // PARENT_TOO_LATE_DIST
const VIGIL_HOLD = 1 // the keeper holds this close to the remains

/**
 * Drive the end of a hunt on a young animal frame by frame, in the order the
 * wildlife frame runs it: the struggle window, the kill, the parent's release
 * and vigil, the predator's feed and the remnant it leaves, the orphan
 * adoption pass, and the kill flock that lands on the remnant once no keeper
 * stands over it. Returns what a player would have seen.
 */
function driveYoungKill() {
  const parent: Body = { id: 'parent', x: -40, z: 0 }
  const young: Body = { id: 'young', x: 0, z: 0, young: true, parent }
  parent.child = young
  // A parentless young of the same herd grazing near the kill: the one the
  // report saw "alive again" once it was handed to the mourning parent.
  const orphan: Body = { id: 'orphan', x: 12, z: 0, young: true }
  const herd: Body[] = [parent, young, orphan]
  young.caught = 5 // seized: the hunt's catch

  let killedAt: { x: number; z: number } | null = null
  let remnant: Body | null = null
  let owner: Body | null = null
  let youngAliveAfterKill = false
  let parentChildAtKill: Body | null = null
  let feeding = true
  let t = 0
  for (; t < 240; t += DT) {
    // The struggle and the kill.
    if (stepCaught(young, DT)) {
      markKilled(young, CARCASS_SECONDS)
      killedAt = { x: young.x, z: young.z }
      const fate = releaseBereavedParent(young, {
        tooLateDist: TOO_LATE,
        bereavedSeconds: balance.family.bereavedSeconds,
        vigilAt: killedAt,
      })
      expect(fate).toBe('vigil')
    }
    // The predator feeds on the dead young, then leaves a remnant.
    if (feeding && young.dead) {
      young.dissolve! -= DT
      if (young.dissolve! <= 0) {
        feeding = false
        remnant = { id: 'remnant', x: young.x, z: young.z, dead: true, remnant: true }
        herd.push(remnant)
        handVigilToRemains([herd], young, remnant)
      }
    }
    // Consumed bodies leave the lists.
    for (let i = herd.length - 1; i >= 0; i--) {
      const a = herd[i]
      if (a.dead && a.dissolve !== undefined && a.dissolve <= 0) {
        a.gone = true
        herd.splice(i, 1)
      }
    }
    // The vigil: walk to the remains, hold, resolve.
    if (parent.vigil) {
      const v = parent.vigil
      v.time += DT
      const gone = v.carcass.gone === true || (v.carcass.dissolve !== undefined && v.carcass.dissolve <= 0)
      if (v.time > balance.vigil.seconds || gone) parent.vigil = undefined
      else {
        const d = Math.hypot(v.x - parent.x, v.z - parent.z)
        if (d > VIGIL_HOLD) {
          parent.x += ((v.x - parent.x) / d) * Math.min(d, 6.5 * DT)
          parent.z += ((v.z - parent.z) / d) * Math.min(d, 6.5 * DT)
        }
      }
    }
    // The orphan adoption pass.
    for (const a of herd) {
      if (a.bereaved !== undefined) a.bereaved = a.bereaved - DT > 0 ? a.bereaved - DT : undefined
    }
    if (!orphan.parent) {
      const adopter = findAdopter(orphan, herd, balance.family.adoptionRadius)
      if (adopter) {
        orphan.parent = adopter
        adopter.child = orphan
      }
    }
    // The kill flock: circles over the remnant, lands once no keeper stands by.
    const served = killFlockRemnant([herd])
    if (served) {
      const keeperDist = parent.vigil ? Math.hypot(parent.x - served.x, parent.z - served.z) : Infinity
      const landed = killFlockLands('leave', 500, 500, served, keeperDist)
      if (landed) owner = served
      feedRemnant(served, DT, landed, CARCASS_SECONDS)
    }
    // What the player sees at the kill site.
    if (killedAt) {
      // By identity, not object: a re-created body with the young's id counts too.
      if (young.dead !== true || herd.some((a) => a.id === young.id && !a.dead)) youngAliveAfterKill = true
      const c = parent.child
      if (c && !c.dead && Math.hypot(c.x - killedAt.x, c.z - killedAt.z) < balance.family.adoptionRadius)
        parentChildAtKill = c
    }
    if (remnant && remnant.gone && !parent.vigil) break
  }
  return { parent, young, orphan, herd, killedAt, remnant, owner, youngAliveAfterKill, parentChildAtKill, t }
}

describe('a young animal killed by a predator stays dead (point 1213)', () => {
  it('leaves a carcass the kill flock owns, and the young never lives again', () => {
    const r = driveYoungKill()
    expect(r.killedAt).not.toBeNull()
    // The carcass: the dead young, then the remnant the predator left at the kill.
    expect(r.young.dead).toBe(true)
    expect(r.remnant).not.toBeNull()
    expect(Math.hypot(r.remnant!.x - r.killedAt!.x, r.remnant!.z - r.killedAt!.z)).toBeLessThan(0.01)
    // The vultures: the kill flock landed on exactly that remnant and finished it.
    expect(r.owner).toBe(r.remnant)
    expect(r.remnant!.gone).toBe(true)
    // No living young with the killed one's identity, ever again.
    expect(r.youngAliveAfterKill).toBe(false)
    expect(r.herd.some((a) => a.id === r.young.id)).toBe(false)
    expect(r.young.parent).toBeUndefined()
  })

  it('releases the parent: no childAt to the carcass or to another young at the kill', () => {
    const r = driveYoungKill()
    expect(r.parentChildAtKill).toBeNull()
    expect(r.parent.child === r.young).toBe(false)
    expect(r.orphan.parent === r.parent).toBe(false)
  })

  it('the kill flock does not land while the keeper stands at the remains', () => {
    const rem = { x: 0, z: 0 }
    expect(killFlockLands('idle', 500, 500, rem, 1)).toBe(false)
    expect(killFlockLands('idle', 500, 500, rem, Infinity)).toBe(true)
    expect(killFlockLands('feed', 0, 0, rem, Infinity)).toBe(false)
  })
})

describe('bereaved parents do not adopt (point 1213)', () => {
  const orphan = { x: 0, z: 0, young: true }
  it('skips a parent standing vigil or still bereaved, takes an ordinary adult', () => {
    const keeper = { x: 2, z: 0, vigil: { x: 0, z: 0 } }
    const bereaved = { x: 3, z: 0, bereaved: 40 }
    const herdMate = { x: 9, z: 0 }
    expect(findAdopter(orphan, [keeper, bereaved, herdMate], 20)).toBe(herdMate)
    expect(findAdopter(orphan, [keeper, bereaved], 20)).toBeNull()
    // Once the window has run out it is an ordinary adult again.
    expect(findAdopter(orphan, [{ x: 3, z: 0, bereaved: undefined }], 20)).not.toBeNull()
  })

  it('a parent close enough is taken with the young, not left bereaved', () => {
    const parent: Body = { id: 'p', x: 1, z: 0 }
    const young: Body = { id: 'y', x: 0, z: 0, young: true, parent }
    parent.child = young
    expect(releaseBereavedParent(young, { tooLateDist: TOO_LATE, bereavedSeconds: 90, vigilAt: young })).toBe('taken')
    expect(parent.child).toBeUndefined()
    expect(parent.bereaved).toBeUndefined()
  })

  it('the struggle window counts down and completes exactly once', () => {
    const a: { caught?: number } = { caught: 0.25 }
    expect(stepCaught(a, 0.1)).toBe(false)
    expect(stepCaught(a, 0.1)).toBe(false)
    expect(stepCaught(a, 0.1)).toBe(true)
    expect(a.caught).toBeUndefined()
    expect(stepCaught(a, 0.1)).toBe(false)
  })
})

describe('the kill flock only eats once landed (point 1213)', () => {
  it('circling birds leave the remnant whole; landed birds dissolve it', () => {
    const rem: { dissolve?: number } = {}
    feedRemnant(rem, 1, false, 10)
    expect(rem.dissolve).toBeUndefined()
    feedRemnant(rem, 1, true, 10)
    expect(rem.dissolve).toBe(9)
  })

  it('hands only a living keeper vigil from the victim to the remains', () => {
    const victim = { id: 'v' }
    const remains = { id: 'r' }
    const keeper = { vigil: { carcass: victim } }
    const deadKeeper = { dead: true, vigil: { carcass: victim } }
    handVigilToRemains([[keeper, deadKeeper]], victim, remains)
    expect(keeper.vigil.carcass).toBe(remains)
    expect(deadKeeper.vigil.carcass).toBe(victim)
  })
})
