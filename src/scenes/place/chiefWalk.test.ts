// The chief's round trip to his drummer (design.md §13.4): every phase, every
// transition the player can reach, and the geometry that puts the two men side
// by side. Pure logic — no scene, no store, no clock.
import { describe, expect, it } from 'vitest'
import { HIGH_DRUM, LOW_DRUM } from './drummerPose'
import { VILLAGE_SPOTS } from './lifeSpots'
import {
  chiefBesideDrummerSpot,
  chiefCalled,
  chiefInHut,
  chiefIsOutside,
  chiefStepsOut,
  chiefTick,
  chiefWalkFacing,
  chiefWalkPosition,
  drummerFacing,
  type ChiefWalk,
} from './chiefWalk'

const TIMING = { speed: 2, staySeconds: 60, pathLength: 10 }
/** Seconds the whole path takes at the timing above. */
const CROSSING = TIMING.pathLength / TIMING.speed

/** Him standing beside the drummer at `t`, the way the walk itself gets there. */
function arrived(t = CROSSING): ChiefWalk {
  const out = chiefStepsOut(chiefInHut(), 0)
  const step = chiefTick(out, t, TIMING)
  expect(step.walk.phase).toBe('at-drummer')
  return step.walk
}

describe('the chief comes out of his hut', () => {
  it('starts every visit inside it', () => {
    expect(chiefInHut().phase).toBe('in-hut')
    expect(chiefIsOutside(chiefInHut())).toBe(false)
  })

  it('sets out for the drummer when the hut is used', () => {
    const walk = chiefStepsOut(chiefInHut(), 12)
    expect(walk.phase).toBe('walking-out')
    expect(walk.progress).toBe(0)
    expect(chiefIsOutside(walk)).toBe(true)
  })

  it('leaves the hut key inert while he is outside — in every outside phase', () => {
    const standing = arrived()
    expect(chiefStepsOut(standing, 99)).toBe(standing)
    const walkingOut = chiefStepsOut(chiefInHut(), 0)
    expect(chiefStepsOut(walkingOut, 99)).toBe(walkingOut)
    const home = chiefTick(standing, CROSSING + TIMING.staySeconds, TIMING).walk
    expect(home.phase).toBe('walking-back')
    expect(chiefStepsOut(home, 99)).toBe(home)
  })

  it('crosses at the walking speed and arrives beside the drummer', () => {
    const out = chiefStepsOut(chiefInHut(), 0)
    const half = chiefTick(out, CROSSING / 2, TIMING)
    expect(half.walk.phase).toBe('walking-out')
    expect(half.walk.progress).toBeCloseTo(0.5, 6)
    expect(half.beatDrums).toBe(false)
    const there = chiefTick(half.walk, CROSSING, TIMING)
    expect(there.walk.phase).toBe('at-drummer')
    expect(there.walk.progress).toBe(1)
  })

  it('walks the same distance in many small frames as in one big one', () => {
    let stepwise = chiefStepsOut(chiefInHut(), 0)
    for (let i = 1; i <= 40; i++) stepwise = chiefTick(stepwise, (i * CROSSING) / 60, TIMING).walk
    const single = chiefTick(chiefStepsOut(chiefInHut(), 0), (40 * CROSSING) / 60, TIMING).walk
    expect(stepwise.progress).toBeCloseTo(single.progress, 6)
  })

  it('does not beat the drums by itself on a first arrival', () => {
    const out = chiefStepsOut(chiefInHut(), 0)
    expect(chiefTick(out, CROSSING, TIMING).beatDrums).toBe(false)
  })
})

describe('beside the drummer he speaks, and repeats', () => {
  it('sends the message when he is asked, standing there', () => {
    const step = chiefCalled(arrived(), CROSSING + 3)
    expect(step.beatDrums).toBe(true)
    expect(step.walk.phase).toBe('at-drummer')
  })

  it('repeats it for as often as he is asked', () => {
    let walk = arrived()
    for (const t of [CROSSING + 3, CROSSING + 9, CROSSING + 20]) {
      const step = chiefCalled(walk, t)
      expect(step.beatDrums).toBe(true)
      walk = step.walk
    }
  })

  it('counts his minute afresh from every message, so he never walks off mid-word', () => {
    const asked = chiefCalled(arrived(), CROSSING + TIMING.staySeconds - 1).walk
    // A moment that WOULD have been past the arrival minute, and is not past
    // the minute counted from the message.
    const soon = chiefTick(asked, CROSSING + TIMING.staySeconds + 1, TIMING)
    expect(soon.walk.phase).toBe('at-drummer')
    const later = chiefTick(asked, CROSSING + 2 * TIMING.staySeconds, TIMING)
    expect(later.walk.phase).toBe('walking-back')
  })

  it('turns for home once the minute is up', () => {
    const standing = arrived()
    expect(chiefTick(standing, CROSSING + TIMING.staySeconds - 0.1, TIMING).walk.phase).toBe('at-drummer')
    const home = chiefTick(standing, CROSSING + TIMING.staySeconds, TIMING)
    expect(home.walk.phase).toBe('walking-back')
    expect(home.walk.progress).toBe(1)
    expect(home.beatDrums).toBe(false)
  })
})

describe('called back on his way home', () => {
  /** Him on his way back, half the path from the drummer. */
  function goingHome(): ChiefWalk {
    const turned = chiefTick(arrived(), CROSSING + TIMING.staySeconds, TIMING).walk
    const half = chiefTick(turned, CROSSING + TIMING.staySeconds + CROSSING / 2, TIMING).walk
    expect(half.phase).toBe('walking-back')
    expect(half.progress).toBeCloseTo(0.5, 6)
    return half
  }

  it('turns round where he stands rather than starting over', () => {
    const back = chiefCalled(goingHome(), 100)
    expect(back.walk.phase).toBe('walking-out')
    expect(back.walk.progress).toBeCloseTo(0.5, 6)
    expect(back.beatDrums).toBe(false)
  })

  it('beats the message on arrival with no further press', () => {
    const returning = chiefCalled(goingHome(), 100).walk
    expect(returning.drumOnArrival).toBe(true)
    const midway = chiefTick(returning, 100 + CROSSING / 4, TIMING)
    expect(midway.beatDrums).toBe(false)
    const there = chiefTick(midway.walk, 100 + CROSSING, TIMING)
    expect(there.walk.phase).toBe('at-drummer')
    expect(there.beatDrums).toBe(true)
    // …and having beaten them once, arriving does not keep beating them.
    expect(there.walk.drumOnArrival).toBe(false)
    expect(chiefTick(there.walk, 100 + CROSSING + 1, TIMING).beatDrums).toBe(false)
  })

  it('reaches his hut when nobody calls, and starts the whole thing over', () => {
    const home = chiefTick(goingHome(), 200, TIMING)
    expect(home.walk.phase).toBe('in-hut')
    expect(home.walk.progress).toBe(0)
    expect(chiefIsOutside(home.walk)).toBe(false)
    expect(chiefStepsOut(home.walk, 201).phase).toBe('walking-out')
  })

  it('answers no call while he is on his way OUT — he is already coming', () => {
    const out = chiefStepsOut(chiefInHut(), 0)
    const step = chiefCalled(out, 1)
    expect(step.walk).toBe(out)
    expect(step.beatDrums).toBe(false)
  })

  it('answers no call from inside the hut — that key is the drummer’s word', () => {
    const step = chiefCalled(chiefInHut(), 5)
    expect(step.beatDrums).toBe(false)
    expect(step.walk.phase).toBe('in-hut')
  })
})

describe('where he stands, and which way he looks', () => {
  const door: [number, number] = [8, -4]
  const beside = chiefBesideDrummerSpot(1.5)

  it('walks the straight line between his door and the drummer’s side', () => {
    const out = chiefStepsOut(chiefInHut(), 0)
    expect(chiefWalkPosition(out, door, beside)).toEqual(door)
    const half = chiefWalkPosition({ ...out, progress: 0.5 }, door, beside)
    expect(half[0]).toBeCloseTo((door[0] + beside[0]) / 2, 6)
    expect(half[1]).toBeCloseTo((door[1] + beside[1]) / 2, 6)
    const there = chiefWalkPosition(arrived(), door, beside)
    expect(there[0]).toBeCloseTo(beside[0], 9)
    expect(there[1]).toBeCloseTo(beside[1], 9)
  })

  it('stands abreast of the drummer, facing exactly where the drummer faces', () => {
    const yaw = drummerFacing()
    const [dx, dz] = VILLAGE_SPOTS.drummer
    const away = Math.hypot(beside[0] - dx, beside[1] - dz)
    expect(away).toBeCloseTo(1.5, 6)
    // Abreast: the offset is square to the way the drummer looks, so neither
    // man stands in the other's picture from the front.
    const ahead = Math.sin(yaw) * (beside[0] - dx) + Math.cos(yaw) * (beside[1] - dz)
    expect(Math.abs(ahead)).toBeLessThan(1e-9)
    expect(chiefWalkFacing(arrived(), door, beside, yaw)).toBe(yaw)
  })

  it('keeps clear of both drums', () => {
    const reach = Math.max(
      Math.hypot(LOW_DRUM.x, LOW_DRUM.z) + LOW_DRUM.headRadius,
      Math.hypot(HIGH_DRUM.x, HIGH_DRUM.z) + HIGH_DRUM.headRadius,
    )
    const [dx, dz] = VILLAGE_SPOTS.drummer
    expect(Math.hypot(beside[0] - dx, beside[1] - dz)).toBeGreaterThan(reach)
  })

  it('looks the way he is going while he is on his feet', () => {
    const out = chiefStepsOut(chiefInHut(), 0)
    const outward = Math.atan2(beside[0] - door[0], beside[1] - door[1])
    expect(chiefWalkFacing(out, door, beside, 0)).toBeCloseTo(outward, 6)
    const home: ChiefWalk = { ...out, phase: 'walking-back', progress: 0.5 }
    const back = chiefWalkFacing(home, door, beside, 0)
    expect(Math.abs(Math.atan2(Math.sin(back - outward), Math.cos(back - outward)))).toBeCloseTo(
      Math.PI,
      6,
    )
  })
})
