// THE CHILDREN DO NOT SHUFFLE ON THE SPOT (work-order 648, the user's "Kind
// zittert auf der Stelle herum").
//
// The pure modules are pinned one by one beside this file; what this one pins is
// the WHOLE of what the player watches, in the settlements he watches it in: the
// shipped layout, its play ground, the chase, what the children say to one
// another and the body separation, stepped exactly as `PlaceLife` steps them.
// Every one of the three causes behind the report only showed as an interaction
// — a chase heading against a hut, a role running round a knot, a body pushed
// into a slot — so a test of any one module alone would have caught none of it.
//
// THE MEASURE IS THE COMPLAINT ITSELF, not a proxy: over a window of two
// seconds, does a child WALK a real distance without LEAVING a small circle?
// A chase is full of legitimate turns — a runner doubling back at the rim, a
// chaser cutting a corner — so counting direction changes measures the game, not
// the bug (measured: the bare reversal rate also depends on the frame rate, 1.4 %
// at 60 fps against 3.2 % at 14, which is why it could never gate anything). Ground
// covered against ground walked is frame-rate free and says what the user said.
//
// MEASURED at the settlement/seed pairs below, 120 s each: 11383 bad windows of
// 567360 before the fix, worst village 33.5 %, against 40 after, worst 0.06 %.
// The gate is one in a hundred — two hundred times what the fix leaves and a
// fiftieth of what the defect produced.
import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { mulberry32 } from '../../world/noise'
import { nudgeWhere, spawnPointFree, standingClear, WALKER_RADIUS } from './collision'
import { childSteer, createChildSpeech, stepChildSpeech, type SituationView } from './childSituations'
import { claimBodies, createInhabitantSet, separateGroup } from './inhabitantBodies'
import { buildLayout, builtFabric } from './layout'
import { childPlayGround, villageAdultStations } from './lifeSpots'
import { createTagGame, stepTagGame, type TagWorld } from './tagGame'

// The two numbers `PlaceLife` holds for the children it draws.
const KID_SCALE = 0.55
const NPC_RADIUS = WALKER_RADIUS
const FIRE: [number, number] = [-3.5, 2.5]

/** A settlement's children exactly as the scene mounts them. */
function village(placeId: string, seed: number, count = balance.villageLife.tag.childCount) {
  const layout = buildLayout(placeId, seed)
  const colliders = layout.colliders
  let hash = 0
  for (const c of placeId) hash = (hash * 31 + c.charCodeAt(0)) | 0
  const localSeed = (seed ^ hash) >>> 0
  const ground = childPlayGround(
    villageAdultStations(FIRE),
    Math.max(1, layout.radius - NPC_RADIUS * 2),
    balance.villageLife.tag.playRadius,
    balance.communication.hearingRadius,
    { free: (x, z) => standingClear(colliders, x, z, NPC_RADIUS), fabric: builtFabric(layout) },
  )
  const rim = Math.max(1, layout.radius - NPC_RADIUS * 2)
  const blocked = (x: number, z: number) =>
    Math.hypot(x, z) > rim ||
    Math.hypot(x - ground.x, z - ground.z) > ground.radius ||
    !standingClear(colliders, x, z, NPC_RADIUS)
  const world: TagWorld = {
    radius: ground.radius,
    centerX: ground.x,
    centerZ: ground.z,
    childRadius: NPC_RADIUS,
    blocked,
    nudge: (x, z) => {
      const roomy = nudgeWhere(x, z, (ax, az) => !blocked(ax, az) && spawnPointFree(colliders, ax, az, NPC_RADIUS))
      const r = roomy.found ? roomy : nudgeWhere(x, z, (ax, az) => !blocked(ax, az))
      return { x: r.pos[0], z: r.pos[1], found: r.found }
    },
  }
  const rand = mulberry32((localSeed + 5171) >>> 0)
  const spots = Array.from({ length: count }, (_, i) => {
    const a = (i / Math.max(1, count)) * Math.PI * 2
    const spot = world.nudge(ground.x + Math.cos(a) * 2.4, ground.z + Math.sin(a) * 2.4)
    return { x: spot.x, z: spot.z }
  })
  const game = createTagGame(spots, rand, balance.villageLife.tag)
  const speech = createChildSpeech(count, balance.villageLife.childSpeech)
  const speechRand = mulberry32((localSeed + 7717) >>> 0)
  const set = createInhabitantSet()
  const bodies = claimBodies(set, count, { scale: KID_SCALE })
  const view: SituationView = {
    playing: false,
    chaser: -1,
    target: -1,
    immune: -1,
    children: game.children,
    ground: { x: ground.x, z: ground.z, radius: ground.radius },
  }
  return { game, speech, speechRand, world, set, bodies, view }
}

/** One frame of the settlement, in `PlaceLife`'s own order: what was said steers
 *  the chase, the chase moves the children, the bodies are all written and then
 *  separated as one group. */
function frame(v: ReturnType<typeof village>, dt: number): void {
  const cfg = balance.villageLife.childSpeech
  v.view.playing = v.game.playing
  v.view.chaser = v.game.chaser
  v.view.target = v.game.target
  v.view.immune = v.game.immuneFor > 0 ? v.game.immune : -1
  stepTagGame(v.game, dt, balance.villageLife.tag, v.world, (i) => childSteer(v.speech, v.view, i, cfg))
  for (let i = 0; i < v.game.children.length; i++) {
    v.bodies[i].x = v.game.children[i].x
    v.bodies[i].z = v.game.children[i].z
  }
  separateGroup(v.set, v.bodies, dt, balance.villageLife.separation, v.world)
  for (let i = 0; i < v.game.children.length; i++) {
    v.game.children[i].x = v.bodies[i].x
    v.game.children[i].z = v.bodies[i].z
  }
  stepChildSpeech(v.speech, v.view, dt, cfg, v.speechRand)
}

interface Track {
  x: number
  z: number
  walked: number
  pace: number
  held: boolean
  clock: number
}

/** Every child's path through `seconds` of the game, sampled every frame. */
function play(placeId: string, seed: number, seconds: number, dt = 1 / 60): Track[][] {
  const v = village(placeId, seed)
  const paths: Track[][] = v.game.children.map(() => [])
  for (let t = 0; t < seconds; t += dt) {
    frame(v, dt)
    v.game.children.forEach((c, i) => {
      paths[i].push({ x: c.x, z: c.z, walked: c.walked, pace: c.pace, held: c.held, clock: v.game.clock })
    })
  }
  return paths
}

/** The share of two-second windows in which a child walks more than `minPath`
 *  without ever leaving a circle of `radius` — walking, and getting nowhere. */
function shuffleShare(paths: Track[][], span = 2, minPath = 2, radius = 0.5) {
  let windows = 0
  let bad = 0
  let worst = { path: 0, radius: 0 }
  for (const path of paths) {
    for (let i = 0; i < path.length; i++) {
      let j = i
      let walked = 0
      let out = 0
      while (j < path.length - 1 && path[j + 1].clock - path[i].clock < span) {
        walked += Math.hypot(path[j + 1].x - path[j].x, path[j + 1].z - path[j].z)
        j++
        out = Math.max(out, Math.hypot(path[j].x - path[i].x, path[j].z - path[i].z))
      }
      if (path[j].clock - path[i].clock < span * 0.9) break
      windows++
      if (walked > minPath && out < radius) {
        bad++
        if (walked / Math.max(0.01, out) > worst.path / Math.max(0.01, worst.radius)) {
          worst = { path: walked, radius: out }
        }
      }
    }
  }
  return { share: windows > 0 ? bad / windows : 0, bad, windows, worst }
}

// The reported village and seed first; the others are there because the causes
// were general and one settlement's layout proves nothing about the next.
const PLACES: Array<[string, number]> = [
  ['bambara-village', 2972259115],
  ['maasai-village', 42],
  ['swahili-village', 99],
]

describe('the children never shuffle on the spot (point 648)', () => {
  for (const [placeId, seed] of PLACES) {
    it(`${placeId} at seed ${seed} keeps every child covering ground`, () => {
      const paths = play(placeId, seed, 60)
      const r = shuffleShare(paths)
      expect(r.windows).toBeGreaterThan(5000) // a real stretch of the game
      expect(r.share).toBeLessThan(0.01)
    })
  }

  it('holds at a low and uneven frame rate too', () => {
    // The headless machine draws at anything from 60 down to ten-odd frames a
    // second, and every rule behind this is a per-frame decision — so the
    // measurement is repeated where each frame carries five times the movement.
    const rand = mulberry32(4242)
    const v = village('bambara-village', 2972259115)
    const paths: Track[][] = v.game.children.map(() => [])
    for (let t = 0; t < 60; ) {
      const dt = 0.05 + rand() * 0.05
      t += dt
      frame(v, dt)
      v.game.children.forEach((c, i) => {
        paths[i].push({ x: c.x, z: c.z, walked: c.walked, pace: c.pace, held: c.held, clock: v.game.clock })
      })
    }
    expect(shuffleShare(paths).share).toBeLessThan(0.01)
  })

  it('and none of them is ever held motionless or left inside another', () => {
    // The other two symptoms of the same report, on the same run: a child
    // commanded to move that covers no ground, and two bodies in one place.
    const v = village('bambara-village', 2972259115)
    const n = v.game.children.length
    const contact = balance.villageLife.separation.bodyRadius * KID_SCALE * 2 - balance.villageLife.separation.slop
    let longestStall = 0
    let stall = new Array<number>(n).fill(0)
    let overlaps = 0
    let last = v.game.children.map((c) => c.walked)
    for (let t = 0; t < 60; t += 1 / 60) {
      frame(v, 1 / 60)
      v.game.children.forEach((c, i) => {
        if (c.pace > 1e-6 && !c.held && c.walked - last[i] < 1e-4) {
          stall[i] += 1 / 60
          longestStall = Math.max(longestStall, stall[i])
        } else stall[i] = 0
        last[i] = c.walked
      })
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = v.game.children[i]
          const b = v.game.children[j]
          if (Math.hypot(a.x - b.x, a.z - b.z) < contact - 1e-6) overlaps++
        }
      }
    }
    expect(longestStall).toBeLessThan(0.25)
    expect(overlaps).toBe(0)
  })
})
