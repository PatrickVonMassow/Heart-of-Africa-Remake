// SCRATCH (point 657) — never committed. Scans for deterministic wedge reds.
// Harness copied from tagShuffle.test.ts (crowd/village/frame, no pen).
import { describe, it } from 'vitest'
import {
  CHILD_MOTION,
  rescueRate,
  shuffleWindows,
  type ChildMotionSample,
} from '../../../scripts/verify/childMotionMetric.mjs'
import { balance } from '../../config/balance'
import { mulberry32 } from '../../world/noise'
import {
  nudgeToFree,
  nudgeWhere,
  resolveMove,
  spawnPointFree,
  standingClear,
  WALKER_RADIUS,
} from './collision'
import { childSteer, createChildSpeech, stepChildSpeech, type SituationView } from './childSituations'
import {
  claimBodies,
  groundOccupied,
  separateBody,
  separateGroup,
  stepRoundBodies,
  createInhabitantSet,
  type InhabitantBody,
  type InhabitantSet,
} from './inhabitantBodies'
import { buildLayout, builtFabric, type PlaceLayout } from './layout'
import { childPlayGround, villageAdultStations } from './lifeSpots'
import { absorbSeparation, createTagGame, stepTagGame, type TagWorld } from './tagGame'
import { buildWedgeCarve } from './wedgeCarve'

const KID_SCALE = 0.55
const NPC_RADIUS = WALKER_RADIUS
const FIRE: [number, number] = [-3.5, 2.5]

interface Crowd {
  standing: InhabitantBody[]
  porters: InhabitantBody[]
  walkers: InhabitantBody[]
  step: (dt: number, clock: number) => void
}

function crowd(set: InhabitantSet, layout: PlaceLayout, seed: number): Crowd {
  const colliders = layout.colliders
  const rim = Math.max(1, layout.radius - NPC_RADIUS * 2)
  const world = {
    blocked: (x: number, z: number) =>
      Math.hypot(x, z) > rim || !standingClear(colliders, x, z, NPC_RADIUS),
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
    return {
      ax: a[0] * (1 - 3.2 / toCenter),
      az: a[1] * (1 - 3.2 / toCenter),
      bx: px,
      bz: pz,
      phase: rand() * Math.PI * 2,
      speed: 0.55 + rand() * 0.2,
    }
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
  const staticBlocked = (x: number, z: number) =>
    Math.hypot(x, z) > rim ||
    Math.hypot(x - ground.x, z - ground.z) > ground.radius ||
    !standingClear(colliders, x, z, NPC_RADIUS)
  const carve = process.env.WEDGE_CARVE === '1' ? buildWedgeCarve(colliders, NPC_RADIUS, ground) : null
  const blocked = carve ? (x: number, z: number) => staticBlocked(x, z) || carve(x, z) : staticBlocked
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
  return { game, speech, speechRand, world, set, bodies, view, others, layout, ground }
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

interface Track extends ChildMotionSample {
  pace: number
  held: boolean
  playing: boolean
  walkedWhilePlaying: number
  playedClock: number
}

function sample(v: ReturnType<typeof village>, paths: Track[][]): void {
  v.game.children.forEach((c, i) => {
    paths[i].push({
      clock: v.game.clock,
      x: c.x,
      z: c.z,
      walked: c.walked,
      walkedWhilePlaying: c.walkedWhilePlaying,
      playedClock: v.game.playedClock,
      nudges: c.nudges,
      carried: c.carried,
      pace: c.pace,
      held: c.held,
      playing: v.game.playing,
    })
  })
}

describe('probe the red windows', () => {
  const CASES: Array<{ place?: string; seed?: number; dtSeed: number; from: number; to: number }> = [
    { place: 'swahili-village', seed: 99, dtSeed: 0, from: 0, to: 0 },
  ]
  it('logs the whole group through each red window', () => {
    for (const c of CASES) {
      const place = c.place ?? 'bambara-village'
      const seed = c.seed ?? 2972259115
      // First pass: find the worst window.
      {
        const rand = mulberry32(c.dtSeed || 1)
        const v = village(place, seed)
        const paths: Track[][] = v.game.children.map(() => [])
        for (let t = 0; t < 150; ) {
          const dt = c.dtSeed === 0 ? 1 / 60 : CADENCE(rand)
          t += dt
          frame(v, dt)
          sample(v, paths)
        }
        for (let k = 0; k < paths.length; k++) {
          for (const w of badWindows(paths, k)) {
            console.log(`found bad window child ${k} t=${w.t.toFixed(1)} at (${w.x.toFixed(2)},${w.z.toFixed(2)}) nearKid ${w.nearKid.toFixed(2)}`)
            if (c.to === 0) {
              c.from = w.t - 1.2
              c.to = w.t + 2.2
            }
          }
        }
      }
      const rand = mulberry32(c.dtSeed || 1)
      const v = village(place, seed)
      console.log(`=== ${place} dtSeed ${c.dtSeed} window ${c.from.toFixed(1)}-${c.to.toFixed(1)}`)
      let logged = 0
      for (let t = 0; t < c.to + 0.1; ) {
        const dt = c.dtSeed === 0 ? 1 / 60 : CADENCE(rand)
        t += dt
        frame(v, dt)
        if (v.game.clock >= c.from && v.game.clock <= c.to && logged++ % 3 === 0) {
          const roles = v.game.children
            .map((k, i) => {
              const role = i === v.game.chaser ? 'C' : i === v.game.target ? 'T' : ' '
              return `${i}${role}(${k.x.toFixed(2)},${k.z.toFixed(2)}) p${k.pace.toFixed(2)} h${k.heading.toFixed(1)} ${k.held ? 'HELD' : k.evading ? 'ev' : '--'} a${k.anchorFor.toFixed(1)}`
            })
            .join(' | ')
          console.log(`t=${v.game.clock.toFixed(2)} imm ${v.game.immuneFor.toFixed(2)} ${roles}`)
        }
      }
    }
  }, 300000)
})

/** Enumerate the bad one-second windows of one child, with where they sat and
 *  how near the nearest playmate stood — the mechanism classifier. */
function badWindows(paths: Track[][], k: number): Array<{ t: number; x: number; z: number; nearKid: number }> {
  const path = paths[k]
  const out: Array<{ t: number; x: number; z: number; nearKid: number }> = []
  let last = -Infinity
  for (let i = 0; i < path.length; i++) {
    let j = i
    while (j < path.length - 1 && path[j + 1].clock - path[i].clock <= 1) j++
    if (path[j].clock - path[i].clock < 0.9) break
    if (path[j].nudges !== path[i].nudges) continue
    const walked = path[j].walked - path[i].walked
    let outR = 0
    for (let m = i; m <= j; m++) outR = Math.max(outR, Math.hypot(path[m].x - path[i].x, path[m].z - path[i].z))
    if (walked > 1 && outR < 0.35 && path[i].clock > last + 1) {
      last = path[i].clock
      const mid = Math.floor((i + j) / 2)
      let nearKid = Infinity
      for (const [o, op] of paths.entries()) {
        if (o === k) continue
        const q = op[Math.min(mid, op.length - 1)]
        nearKid = Math.min(nearKid, Math.hypot(q.x - path[mid].x, q.z - path[mid].z))
      }
      out.push({ t: path[i].clock, x: path[mid].x, z: path[mid].z, nearKid })
    }
  }
  return out
}

const CADENCE_KINDS: Record<string, (rand: () => number) => number> = {
  wild: (rand) => 0.012 + rand() * 0.055, // 15-83 fps jitter
  live: (rand) => 0.014 + rand() * 0.012, // 38-71 fps — a healthy headless run
  slow: (rand) => 0.028 + rand() * 0.03, // 17-36 fps — a loaded headless run
}
const CADENCE_BASE = CADENCE_KINDS[process.env.WEDGE_CADENCE ?? 'wild']
const CADENCE = (rand: () => number) => CADENCE_BASE(rand)

describe('sweep line', () => {
  it('prints one compact line for this config', () => {
    const out: string[] = []
    for (const [placeId, seed] of [
      ['bambara-village', 2972259115],
      ['maasai-village', 42],
      ['swahili-village', 99],
    ] as Array<[string, number]>) {
      // fixed-60, 60 s — the shipped suite's own regime
      const v = village(placeId, seed)
      const paths: Track[][] = v.game.children.map(() => [])
      for (let t = 0; t < 60; t += 1 / 60) {
        frame(v, 1 / 60)
        sample(v, paths)
      }
      const fixed = Math.max(shuffleWindows(paths).worstShare, shuffleWindows(paths, CHILD_MOTION.short).worstShare)
      // count corridor escapes in that fixed minute
      {
        const v2 = village(placeId, seed)
        let entries = 0
        const was = v2.game.children.map(() => false)
        for (let t = 0; t < 60; t += 1 / 60) {
          frame(v2, 1 / 60)
          v2.game.children.forEach((_c, i) => {
            const now = false
            if (now && !was[i]) entries++
            was[i] = now
          })
        }
        out.push(`${placeId.split('-')[0]} escapes/min ${entries}`)
      }
      // live cadence, 8 seeds, 150 s
      let reds = 0
      let worst = 0
      for (let dtSeed = 1; dtSeed <= 8; dtSeed++) {
        const rand = mulberry32(dtSeed)
        const lv = village(placeId, seed)
        const lpaths: Track[][] = lv.game.children.map(() => [])
        for (let t = 0; t < 150; ) {
          const dt = 0.014 + rand() * 0.012
          t += dt
          frame(lv, dt)
          sample(lv, lpaths)
        }
        const share = Math.max(shuffleWindows(lpaths).worstShare, shuffleWindows(lpaths, CHILD_MOTION.short).worstShare)
        worst = Math.max(worst, share)
        if (share >= CHILD_MOTION.shareGate) reds++
      }
      out.push(`${placeId.split('-')[0]} fixed ${(fixed * 100).toFixed(2)}% live ${reds}/8 worst ${(worst * 100).toFixed(2)}%`)
    }
    console.log(`SWEEP cf=${process.env.TAG_CF ?? '?'} fw=${process.env.TAG_FW ?? '?'} peel=${process.env.TAG_PEEL ?? '?'} | ` + out.join(' | '))
  }, 600000)
})

describe('scan for wedge reds', () => {
  const PANEL: Array<[string, number, number[]]> = [
    ['bambara-village', 2972259115, Array.from({ length: 24 }, (_, i) => i + 1)],
    ['maasai-village', 42, Array.from({ length: 8 }, (_, i) => i + 1)],
    ['swahili-village', 99, Array.from({ length: 8 }, (_, i) => i + 1)],
  ]
  it('scans dt-jitter seeds', () => {
    console.log(`cadence ${process.env.WEDGE_CADENCE ?? 'wild'}`)
    for (const [placeId, seed, dtSeeds] of PANEL) {
      let reds = 0
      for (const dtSeed of dtSeeds) {
        const rand = mulberry32(dtSeed)
        const v = village(placeId, seed)
        const paths: Track[][] = v.game.children.map(() => [])
        for (let t = 0; t < 150; ) {
          const dt = CADENCE(rand)
          t += dt
          frame(v, dt)
          sample(v, paths)
        }
        const r = shuffleWindows(paths)
        const burst = shuffleWindows(paths, CHILD_MOTION.short)
        const rr = rescueRate(paths)
        const red = r.worstShare >= CHILD_MOTION.shareGate || burst.worstShare >= CHILD_MOTION.shareGate
        if (red) reds++
        console.log(
          `${placeId} dtSeed ${dtSeed}: worstShare ${(r.worstShare * 100).toFixed(2)}% burst ${(burst.worstShare * 100).toFixed(2)}% ` +
            `rescues/min ${rr.worstPerChildMinute.toFixed(1)} carried ${rr.worstCarriedMetresPerChildMinute.toFixed(2)}${red ? ' RED' : ''}`,
        )
        for (let k = 0; k < paths.length; k++) {
          for (const w of badWindows(paths, k)) {
            console.log(
              `  bad window child ${k} t=${w.t.toFixed(1)} at (${w.x.toFixed(2)},${w.z.toFixed(2)}) nearKid ${w.nearKid.toFixed(2)}`,
            )
          }
        }
      }
      console.log(`${placeId}: ${reds}/${dtSeeds.length} red`)
    }
  }, 900000)
})
