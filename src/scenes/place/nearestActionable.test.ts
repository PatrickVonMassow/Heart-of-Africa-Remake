// The Space use-key selection (design.md §2.3, point 244) must be a pure
// function of the layout and the LIVE player position, so a synchronous keydown
// after a teleport/fast step acts on where the traveller IS NOW — never on the
// last rendered frame's candidate (the one-frame stale-`nearRef` race).

import { describe, expect, it } from 'vitest'
import {
  nearestActionable,
  INTERACT_RADIUS,
  DOOR_TRIGGER_RADIUS,
  type Interactive,
  type PlaceLayout,
} from './layout'

// The helper only reads `layout.interactives`; a partial layout suffices.
const layoutOf = (interactives: Interactive[]): PlaceLayout =>
  ({ interactives } as PlaceLayout)

const bazaarA: Interactive = { type: 'bazaar', pos: [10, 12], door: [10, 0] }
const agencyB: Interactive = { type: 'agency', pos: [-10, 12], door: [-10, 0] }
const elder: Interactive = { type: 'villager', pos: [0, 0] }

describe('nearestActionable', () => {
  it('returns null for a null layout', () => {
    expect(nearestActionable(null, 0, 0)).toBeNull()
  })

  it('returns the building at whose door the traveller stands', () => {
    const layout = layoutOf([bazaarA, agencyB])
    // Exactly on door A.
    expect(nearestActionable(layout, 10, 0)).toBe(bazaarA)
  })

  it('arms only within the tight door-trigger radius', () => {
    const layout = layoutOf([bazaarA])
    // Just inside the door radius arms it; just outside does not.
    expect(nearestActionable(layout, 10, DOOR_TRIGGER_RADIUS - 0.01)).toBe(bazaarA)
    expect(nearestActionable(layout, 10, DOOR_TRIGGER_RADIUS + 0.01)).toBeNull()
  })

  it('addresses the elder within the interact radius, not beyond it', () => {
    const layout = layoutOf([elder])
    expect(nearestActionable(layout, INTERACT_RADIUS - 0.1, 0)).toBe(elder)
    expect(nearestActionable(layout, INTERACT_RADIUS + 0.1, 0)).toBeNull()
  })

  it('picks the actually-nearest of two doors', () => {
    const layout = layoutOf([bazaarA, agencyB])
    // Between the two doors but closer to B's door at (-10, 0).
    expect(nearestActionable(layout, -9.5, 0)).toBe(agencyB)
    expect(nearestActionable(layout, 9.5, 0)).toBe(bazaarA)
  })

  it('returns null when the traveller is far from every interactive', () => {
    const layout = layoutOf([bazaarA, agencyB, elder])
    expect(nearestActionable(layout, 50, 50)).toBeNull()
  })

  it('acts on the live position after a jump from door A to door B (the race case)', () => {
    // The one-frame race: the last rendered frame armed door A while the
    // traveller has already stepped/teleported onto door B. Selecting against
    // the live position must return B, never the frame-lagged A.
    const layout = layoutOf([bazaarA, agencyB])
    const armedAtA = nearestActionable(layout, 10, 0)
    expect(armedAtA).toBe(bazaarA)
    // Now the player is at door B; the press must resolve to B.
    expect(nearestActionable(layout, -10, 0)).toBe(agencyB)
  })
})
