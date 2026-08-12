// SCRATCH (point 657) — never committed. Re-measures the pen demonstration
// numbers after the cornered-evade, to recalibrate tagShuffle's commentary.
import { describe, it } from 'vitest'
import { CHILD_MOTION, rescueRate, shuffleWindows } from '../../../scripts/verify/childMotionMetric.mjs'
import { mulberry32 } from '../../world/noise'

// Reuse tagShuffle's own harness by duplicating the tiny pieces it needs is
// heavy; instead re-run its wedged() by importing the test file is impossible.
// So: print through the shuffle metric on the same construction, copied from
// tagShuffle.test.ts verbatim where needed.
import { balance } from '../../config/balance'
import { nudgeToFree, nudgeWhere, resolveMove, spawnPointFree, standingClear, WALKER_RADIUS } from './collision'
import { childSteer, createChildSpeech, stepChildSpeech, type SituationView } from './childSituations'
import { claimBodies, groundOccupied, separateBody, separateGroup, stepRoundBodies, createInhabitantSet, type InhabitantSet } from './inhabitantBodies'
import { buildLayout, builtFabric, type PlaceLayout } from './layout'
import { childPlayGround, villageAdultStations } from './lifeSpots'
import { absorbSeparation, createTagGame, stepTagGame, type TagWorld } from './tagGame'
import { buildWedgeCarve } from './wedgeCarve'

const KID_SCALE = 0.55
const NPC_RADIUS = WALKER_RADIUS
const FIRE: [number, number] = [-3.5, 2.5]

function crowd(set: InhabitantSet, layout: PlaceLayout, seed: number) {
  const colliders = layout.colliders
  const rim = Math.max(1, layout.radius - NPC_RADIUS * 2)
  const world = {
    blocked: (x: number, z: number) => Math.hypot(x, z) > rim || !standingClear(colliders, x, z, NPC_RADIUS),
    nudge: (x: number, z: number) => {
      const free = nudgeToFree(colliders, x, z, NPC_RADIUS)
      return { x: free[0], z: free[1], found: true }
    },
  }
  const sep = balance.villageLife.separation
  const stations = villageAdultStations(FIRE)
  const standing = claimBodies(set, stations.length, { fixed: true })
  stations.forEach(([x, z], i) => {
    standing[i].x = x
    standing[i].z = z
  })
  const rand = mulberry32((seed + 4711) >>> 0)
  const stops = layout.interactives.filter((it) => it.type !== 'villager').map((it) => it.pos)
  const routes = Array.from({ length: Math.min(3, Math.max(1, stops.length)) }, (_, i) => {
    const a = stops[i % stops.length]
    const px = (rand() - 0.5) * 7
    const pz = (rand() - 0.5) * 7
    const toCenter = Math.hypot(a[0], a[1]) || 1
    return { ax: a[0] * (1 - 3.2 / toCenter), az: a[1] * (1 - 3.2 / toCenter), bx: px, bz: pz, phase: rand() * Math.PI * 2, speed: 0.55 + rand() * 0.2 }
  })
  const porters = claimBodies(set, routes.length)
  routes.forEach((r, i) => {
    porters[i].x = r.ax
    porters[i].z = r.az
  })
  const errandCount = balance.villageLife.adultErrands.villagerCount
  const named: Array<[number, number]> = [
    ...layout.errands,
    ...layout.digSites.map((d): [number, number] => [d.x, d.z]),
    ...(layout.teachingStone ? [[layout.teachingStone.x, layout.teachingStone.z] as [number, number]] : []),
  ]
  const walkers = claimBodies(set, errandCount)
  const stroll = (): [number, number] => {
    if (rand() < 0.55 && named.length > 0) return named[Math.floor(rand() * named.length) % named.length]
    const a = rand() * Math.PI * 2
    const d = 4 + rand() * Math.max(1, rim - 6)
    return nudgeToFree(colliders, Math.cos(a) * d, Math.sin(a) * d, NPC_RADIUS)
  }
  const errands = Array.from({ length: errandCount }, (_, i) => {
    const a = (i / Math.max(1, errandCount)) * Math.PI * 2
    const [x, z] = nudgeToFree(colliders, Math.cos(a) * 7, Math.sin(a) * 7, NPC_RADIUS)
    walkers[i].x = x
    walkers[i].z = z
    return { to: stroll(), pause: 1 + i * 0.7, stuck: 0 }
  })
  return {
    standing,
    porters,
    walkers,
    step(dt: number, clock: number) {
      routes.forEach((r, i) => {
        const b = porters[i]
        const u = (Math.sin(clock * r.speed + r.phase) + 1) / 2
        const want = stepRoundBodies(set, b, b.x, b.z, r.ax + (r.bx - r.ax) * u, r.az + (r.bz - r.az) * u, sep, world.blocked)
        const [x, z] = resolveMove(colliders, want.x, want.z, NPC_RADIUS, [b.x, b.z])
        b.x = x
        b.z = z
        separateBody(set, b, dt, sep, world)
      })
      errands.forEach((e, i) => {
        const b = walkers[i]
        if (e.pause > 0) {
          e.pause -= dt
          return
        }
        const d = Math.hypot(e.to[0] - b.x, e.to[1] - b.z)
        if (d <= 0.9) {
          e.to = stroll()
          e.pause = 3
          return
        }
        const pace = balance.villageLife.adultErrands.pace
        const want = stepRoundBodies(set, b, b.x, b.z, b.x + ((e.to[0] - b.x) / d) * pace * dt, b.z + ((e.to[1] - b.z) / d) * pace * dt, sep, world.blocked)
        const [x, z] = resolveMove(colliders, want.x, want.z, NPC_RADIUS, [b.x, b.z])
        e.stuck = Math.hypot(x - b.x, z - b.z) < pace * dt * 0.25 ? e.stuck + dt : 0
        if (e.stuck > 1.5) {
          e.to = stroll()
          e.stuck = 0
        }
        b.x = x
        b.z = z
      })
      separateGroup(set, walkers, dt, sep, world)
    },
  }
}

function village(placeId: string, seed: number, count = balance.villageLife.tag.childCount, options: { pen?: { r: number; carry: number } } = {}) {
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
  const pen = { x: 0, z: 0, on: false }
  const penned = (x: number, z: number) => {
    if (!options.pen || !pen.on) return false
    const d = Math.hypot(x - pen.x, z - pen.z)
    return d > options.pen.r && d < options.pen.r + 1.5
  }
  const carve = buildWedgeCarve(colliders, NPC_RADIUS, { x: ground.x, z: ground.z, radius: ground.radius })
  const blocked = (x: number, z: number) =>
    penned(x, z) ||
    Math.hypot(x, z) > rim ||
    Math.hypot(x - ground.x, z - ground.z) > ground.radius ||
    !standingClear(colliders, x, z, NPC_RADIUS) ||
    carve(x, z)
  const world: TagWorld = {
    radius: ground.radius,
    centerX: ground.x,
    centerZ: ground.z,
    childRadius: NPC_RADIUS,
    blocked,
    nudge: (x, z) => {
      if (options.pen && pen.on && Math.hypot(x - pen.x, z - pen.z) <= options.pen.r) {
        const out = nudgeWhere(x, z, (ax, az) => !blocked(ax, az) && Math.hypot(ax - pen.x, az - pen.z) > options.pen!.carry, 0.6, 20)
        if (out.found) return { x: out.pos[0], z: out.pos[1], found: true }
      }
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
  bodies.forEach((b, i) => {
    b.x = spots[i].x
    b.z = spots[i].z
  })
  const others = crowd(set, layout, localSeed)
  const kidBodies = new Set(bodies)
  world.occupied = (_self, _partner, x, z) =>
    groundOccupied(set, x, z, balance.villageLife.separation, balance.villageLife.separation.bodyRadius * KID_SCALE, (b) => kidBodies.has(b))
  const view: SituationView = {
    playing: false,
    chaser: -1,
    target: -1,
    immune: -1,
    children: game.children,
    ground: { x: ground.x, z: ground.z, radius: ground.radius },
    farMark: { x: 0, z: 0 },
  }
  return { game, speech, speechRand, world, set, bodies, view, others, layout, ground, pen }
}

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
    absorbSeparation(v.game.children[i], v.bodies[i])
  }
  v.others.step(dt, v.game.clock)
  stepChildSpeech(v.speech, v.view, dt, cfg, v.speechRand)
}

interface Track {
  clock: number
  x: number
  z: number
  walked: number
  walkedWhilePlaying: number
  playedClock: number
  nudges: number
  carried: number
  pace: number
  held: boolean
  playing: boolean
}

function wedged(seconds = 40, r = 0.65, carry = 3): Track[][] {
  const v = village('bambara-village', 2972259115, undefined, { pen: { r, carry } })
  const paths: Track[][] = v.game.children.map(() => [])
  for (let t = 0; t < seconds; t += 1 / 60) {
    frame(v, 1 / 60)
    const c = v.game.children[0]
    const clear = v.game.children.every((o, i) => i === 0 || Math.hypot(o.x - c.x, o.z - c.z) > r + 1.6)
    if (clear && v.game.clock > 3 && (!v.pen.on || Math.hypot(c.x - v.pen.x, c.z - v.pen.z) > r)) {
      v.pen.x = c.x
      v.pen.z = c.z
      v.pen.on = true
    }
    v.game.children.forEach((c2, i) => {
      paths[i].push({
        clock: v.game.clock,
        x: c2.x,
        z: c2.z,
        walked: c2.walked,
        walkedWhilePlaying: c2.walkedWhilePlaying,
        playedClock: v.game.playedClock,
        nudges: c2.nudges,
        carried: c2.carried,
        pace: c2.pace,
        held: c2.held,
        playing: v.game.playing,
      })
    })
  }
  return paths
}

function resample(paths: Track[][], step: (rand: () => number) => number, seed: number): Track[][] {
  return paths.map((path, k) => {
    const rand = mulberry32((seed + k * 977) >>> 0)
    const out: Track[] = []
    for (let i = 0; i < path.length; i += Math.max(1, step(rand))) out.push(path[i])
    return out
  })
}

const CADENCES: Array<[string, (rand: () => number) => number]> = [
  ['60 fps', () => 1],
  ['20 fps', () => 3],
  ['7.5 fps', () => 8],
  ['1-8 frames', (rand) => 1 + Math.floor(rand() * 8)],
  ['2-12 frames', (rand) => 2 + Math.floor(rand() * 11)],
]

describe('pen numbers after the cornered evade', () => {
  it('sweeps pen radii', () => {
    for (const r of [0.55, 0.6, 0.65, 0.7, 0.75, 0.8]) {
      const paths = wedged(40, r)
      const penned = [paths[0]]
      const sw = shuffleWindows(penned)
      const rr = rescueRate(penned)
      const walked = penned[0][penned[0].length - 1].walked / (penned[0][penned[0].length - 1].clock / 60)
      console.log(`r ${r}: share ${(sw.share * 100).toFixed(2)}% judged ${sw.judgedShare.toFixed(3)} rescues/min ${rr.perChildMinute.toFixed(1)} carried/min ${rr.carriedMetresPerChildMinute.toFixed(1)} walked/min ${walked.toFixed(0)}`)
    }
  }, 240000)
  it('prints the pen judged shares and rates', () => {
    const paths = wedged()
    const penned = [paths[0]]
    const base = shuffleWindows(penned)
    const rr = rescueRate(penned)
    console.log(`pen full-rate: share ${(base.share * 100).toFixed(2)}% judged ${base.judgedShare.toFixed(3)} rescues/min ${rr.perChildMinute.toFixed(1)} carried ${rr.carriedMetresPerChildMinute.toFixed(1)}`)
    for (const [name, step] of CADENCES) {
      const r = shuffleWindows(resample(penned, step, 31337))
      const rrc = rescueRate(resample(penned, step, 31337))
      console.log(`pen ${name}: share ${(r.share * 100).toFixed(2)}% (gate x${(r.share / CHILD_MOTION.shareGate).toFixed(1)}) judged ${r.judgedShare.toFixed(3)} rescues/min ${rrc.perChildMinute.toFixed(1)} (gate x${(rrc.perChildMinute / CHILD_MOTION.rescueGate).toFixed(1)})`)
    }
  }, 120000)
})
