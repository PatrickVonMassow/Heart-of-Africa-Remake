import { afterEach, describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { PLACES } from '../../world/geo'
import { DRUM_MESSAGE_VILLAGE } from '../../state/store'
import { chiefMovementColliders, chiefStandingPosition, clearChiefStanding, resetChiefWalk, setChiefStanding, withinGiveReach } from './chiefPresence'
import { CHIEF_BODY_RADIUS, PLAYER_RADIUS, resolveMove, standingClear, hasEscapeDirection, type Collider } from './collision'
import { buildLayout, chiefStandingSpot, interactiveCircleRadius } from './layout'
import { REGION_PLACE_STYLES } from './regionStyles'
import { chiefBesideDrummerSpot, chiefWalkPosition, type ChiefWalk } from './chiefWalk'
import { nextChiefAction } from './chiefMeeting'
import { pickUseCandidate } from './useKeyTarget'

afterEach(() => clearChiefStanding())

const villagers = PLACES.filter((p) => p.kind === 'village')

describe('the chief’s live body', () => {
  it('follows every position of his outward and homeward walk, including its endpoints', () => {
    const door: [number, number] = [-3, -9]
    const beside = chiefBesideDrummerSpot(balance.communication.chiefBesideDrummer)
    for (const phase of ['walking-out', 'at-drummer', 'walking-back'] as const) {
      for (let i = 0; i <= 20; i++) {
        const walk: ChiefWalk = { phase, progress: phase === 'at-drummer' ? 1 : i / 20, at: 0, drumOnArrival: false }
        const [x, z] = chiefWalkPosition(walk, door, beside)
        setChiefStanding(x, z)
        const colliders = chiefMovementColliders([])
        expect(colliders).toEqual([{ x, z, r: CHIEF_BODY_RADIUS, active: true }])
        expect(colliders[0]).toBe(chiefStandingPosition)
        const [px, pz] = resolveMove(colliders, x, z - 2, PLAYER_RADIUS, [x, z + 2])
        expect(px).toBeCloseTo(x)
        expect(pz).toBeCloseTo(z + CHIEF_BODY_RADIUS + PLAYER_RADIUS)
      }
    }
  })

  it('pushes a stationary traveller clear when the chief walks into him', () => {
    setChiefStanding(0, 1)
    const colliders = chiefMovementColliders([])
    expect(resolveMove(colliders, 0, 0, PLAYER_RADIUS, [0, 0])).toEqual([0, 0])
    setChiefStanding(0, 0.2)
    const [x, z] = resolveMove(colliders, 0, 0, PLAYER_RADIUS, [0, 0])
    expect(x).toBe(0)
    expect(z).toBeCloseTo(0.2 - CHIEF_BODY_RADIUS - PLAYER_RADIUS)
  })

  it('leaves no ghost body on unmount or a settlement reset and never mutates the layout', () => {
    const walls: Collider[] = [{ x: 20, z: 20, r: 3 }]
    setChiefStanding(1, 2)
    expect(chiefMovementColliders(walls)).toHaveLength(2)
    expect(walls).toHaveLength(1)
    clearChiefStanding()
    expect(chiefMovementColliders(walls)).toBe(walls)
    setChiefStanding(1, 2)
    resetChiefWalk()
    expect(chiefMovementColliders(walls)).toBe(walls)
  })
})

describe('the passage at his hut', () => {
  it.each(villagers)('$id: the hut/body passage fits the player and opens onto usable ground', (village) => {
    const layout = buildLayout(village.id, 12345)
    const hut = layout.interactives.find((it) => it.type === 'chief')!
    const radius = interactiveCircleRadius('chief', REGION_PLACE_STYLES[village.region])
    const [cx, cz] = chiefStandingSpot(hut, radius)
    setChiefStanding(cx, cz)
    const colliders = chiefMovementColliders([{ x: hut.pos[0], z: hut.pos[1], r: radius }])
    const settlement = chiefMovementColliders(layout.colliders)
    const dx = cx - hut.pos[0]
    const dz = cz - hut.pos[1]
    const distance = Math.hypot(dx, dz)
    expect(distance - radius - CHIEF_BODY_RADIUS).toBeGreaterThan(2 * PLAYER_RADIUS)
    const nx = dx / distance
    const nz = dz / distance
    // Traverse the passage between these two bodies. The full settlement is
    // checked at the narrowest point and for an escape from it below; unrelated
    // neighbouring huts can require a turn beyond the ends of this passage.
    const middle = radius + (distance - radius - CHIEF_BODY_RADIUS) / 2
    const pointOnPassage = (t: number): [number, number] => {
      const a = t / middle
      return [
        hut.pos[0] + (nx * Math.cos(a) + nz * Math.sin(a)) * middle,
        hut.pos[1] + (nz * Math.cos(a) - nx * Math.sin(a)) * middle,
      ]
    }
    let previous = pointOnPassage(-1)
    for (let i = 0; i <= 40; i++) {
      const t = -1 + i / 20
      const target = pointOnPassage(t)
      expect(standingClear(colliders, ...target, PLAYER_RADIUS)).toBe(true)
      const next = resolveMove(colliders, ...target, PLAYER_RADIUS, previous)
      expect(next[0]).toBeCloseTo(target[0])
      expect(next[1]).toBeCloseTo(target[1])
      previous = next
    }
    const [mx, mz] = pointOnPassage(0)
    expect(standingClear(settlement, mx, mz, PLAYER_RADIUS)).toBe(true)
    expect(hasEscapeDirection(settlement, mx, mz, PLAYER_RADIUS, PLAYER_RADIUS * 2)).toBe(true)
    expect(standingClear(settlement, ...hut.door!, PLAYER_RADIUS)).toBe(true)
    expect(nextChiefAction('hut', { mode: 'place', placeId: village.id }, 'in-hut')).toBe('step-out')
  })

  // The passage cases above prove nobody is WEDGED by him. This one proves the
  // opposite direction is reachable at all: that open ground exists from which
  // a traveller can walk straight at his body and be stopped by it. The browser
  // collision frame stands on exactly this, and its first red was a stand-off
  // dropped inside a scattered prop rather than any fault of the body.
  it.each(villagers)('$id: open ground exists to walk at his body from', (village) => {
    const radius = interactiveCircleRadius('chief', REGION_PLACE_STYLES[village.region])
    for (const seed of [12345, 7]) {
      const layout = buildLayout(village.id, seed)
      const hut = layout.interactives.find((it) => it.type === 'chief')!
      const [cx, cz] = chiefStandingSpot(hut, radius)
      const base = Math.atan2(cx - hut.pos[0], cz - hut.pos[1])
      const standOff = 2
      // He is stopped at his own hem plus the player's radius, so only the
      // stretch BEFORE that has to be walkable — never the contact itself.
      const walked = (standOff - CHIEF_BODY_RADIUS - PLAYER_RADIUS) / standOff
      const free = (x: number, z: number) => standingClear(layout.colliders, x, z, PLAYER_RADIUS)
      let found = false
      for (let step = 0; step <= 18 && !found; step++) {
        for (const sign of step === 0 ? [1] : [1, -1]) {
          const a = base + (sign * step * Math.PI) / 18
          const x = cx + Math.sin(a) * standOff
          const z = cz + Math.cos(a) * standOff
          if (!free(x, z)) continue
          let lane = true
          for (let t = 0.1; t <= walked + 1e-9 && lane; t += 0.1) {
            lane = free(x + (cx - x) * t, z + (cz - z) * t)
          }
          if (lane) { found = true; break }
        }
      }
      expect(found, `${village.id} seed ${seed}`).toBe(true)
    }
  })

  it('contact distance still permits giving, asking for drums and calling him back', () => {
    const beside = chiefBesideDrummerSpot(balance.communication.chiefBesideDrummer)
    const state = { mode: 'place', placeId: DRUM_MESSAGE_VILLAGE } as const
    const layout = buildLayout(DRUM_MESSAGE_VILLAGE, 12345)
    const hut = layout.interactives.find((it) => it.type === 'chief')!
    const door = chiefStandingSpot(hut)
    for (const phase of ['walking-out', 'at-drummer', 'walking-back'] as const) {
      const [x, z] = chiefWalkPosition({ phase, progress: phase === 'at-drummer' ? 1 : 0.5, at: 0, drumOnArrival: false }, door, beside)
      setChiefStanding(x, z)
      const [px, pz] = resolveMove(chiefMovementColliders(layout.colliders), x, z + 0.1, PLAYER_RADIUS)
      const player = { x: px, z: pz, active: true }
      expect(withinGiveReach(player)).toBe(true)
      const action = nextChiefAction('chief', state, phase)
      expect(action).toBe(phase === 'at-drummer' ? 'send-message' : phase === 'walking-back' ? 'call-back' : 'none')
      if (action !== 'none') {
        const candidate = { key: 'chief:chief', distance: Math.hypot(px - x, pz - z), range: balance.communication.chiefTalkReach, payload: action }
        expect(pickUseCandidate([candidate], null)?.payload).toBe(action)
      }
    }
  })
})
