import { rollVocabulary } from '../../communication/vocabulary'
// THE HARNESS THE CHILDREN`S REPLAYS ARE JUDGED ON (work-order 648/656/687,
// split out under work-order 1178). Test-only: nothing in the shipped game
// imports it, and the Vitest include glob (`src/**/*.test.{ts,tsx}`) does not
// collect it as a suite of its own.
//
// It steps a WHOLE settlement exactly as `PlaceLife` steps it — the shipped layout,
// its play ground, the chase or the bank round, the adults at their stations, the
// porters and the errand villagers — and records every child`s path frame by
// frame. `tagShuffle.test.ts` and its siblings judge those paths; every one of
// them replays through here, so the replay exists once and the gates read the
// same game.
//
// WHY IT IS A MODULE AND NOT A PREAMBLE: as one file those replays cost 518.8 s
// of a 1659 s unit layer (measured 22.09.2026), and no worker pool can finish a
// run sooner than its slowest single file. Splitting the judgements across files
// lowers that floor; sharing the harness keeps them replaying the same
// settlement.
import { expect } from 'vitest'
import {
  CHILD_MOTION,
  holdsAGame,
  traceLiveness,
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
import { playRockFlank } from './playRockSurface'
import { buildLayout, type PlaceLayout } from './layout'
import { villageAdultStations } from './lifeSpots'
import { climbBoulder } from './looseRocks'
import { absorbSeparation, createTagGame, stepTagGame, type TagChild } from './tagGame'
import {
  bankChildCanSeparate,
  bankChildTouching,
  createBankGame,
  insideStrangerBerth,
  stepBankGame,
  type BankChild,
  type BankConfig,
  type BankStage,
  type BankState,
  type BankWorld,
} from './bankGame'
import { insidePlace } from './boundary'
import { buildPlaceNavGrid, findPlaceRoute, navClearBetween, navRestrict } from './routing'
import { standsOnGroundPlate } from './riverBank'
import { buildWedgeCarve } from './wedgeCarve'
import {
  createAdultWork,
  goalOf,
  stepAdultWork,
  taskOf,
  WORK_ARRIVE_RADIUS,
  type AdultWorkView,
} from './adultWork'

/** The children's round as `PlaceLife` composes it (work-order 687): the bank
 *  game where the settlement stands on a river, the tag round everywhere else. */
export const BANK_CFG: BankConfig = { ...balance.villageLife.tag, ...balance.villageLife.bankGame }

// The two numbers `PlaceLife` holds for the children it draws.
export const KID_SCALE = 0.55
export const NPC_RADIUS = WALKER_RADIUS
export const FIRE: [number, number] = [-3.5, 2.5]

/** How long the bank-round replay may take to show everything it asks for. A
 *  run-phase crossing of the stretch is the sparse event in it; the latest first
 *  crossing measured across the four cases falls at 1711 s. */
export const BANK_ROUND_WINDOW = 2400

/**
 * THE REST OF THE SETTLEMENT (point 656.4). The separation was only ever
 * exercised against the children, and the children are the smallest bodies in
 * the village: the adults at their stations never give way, the porters cross
 * the open ground at a walk and the errand villagers stroll clear across the
 * settlement. That crowd is what made more than one separation sweep necessary
 * in the first place, and all of it shares ONE registry with the children — so a
 * replay that claims only the children proves nothing about the frame the player
 * actually watches.
 *
 * The steppers are the scene's own, kept to what MOVES a body: the vignette
 * adults stand fixed at the stations `childPlayGround` keeps the play ground
 * clear of, the porters ping-pong along their routes as `Porters` walks them,
 * and the errand villagers walk to the layout's own errand points and pause
 * there as `ErrandVillagers` does. Nothing here draws or speaks — only bodies.
 */
export interface Crowd {
  standing: InhabitantBody[]
  porters: InhabitantBody[]
  walkers: InhabitantBody[]
  step: (dt: number, clock: number) => void
}

export function crowd(
  set: InhabitantSet,
  placeId: string,
  layout: PlaceLayout,
  seed: number,
  /** Where the errand villagers stroll, when the case wants them somewhere
   *  particular — the children's own ground, for one. */
  focus?: { x: number; z: number; radius: number },
  /** The children themselves (work-order 688): the adults' work holds a word
   *  rather than say it into a passing child's ear, exactly as `PlaceLife`
   *  wires it. */
  children: readonly InhabitantBody[] = [],
): Crowd {
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

  // The vignette adults: they push the passers-by aside and never give way.
  const stations = villageAdultStations(FIRE, placeId)
  const standing = claimBodies(set, stations.length, { fixed: true })
  stations.forEach(([x, z], i) => {
    standing[i].x = x
    standing[i].z = z
  })

  // The porters, on the routes `Porters` builds from the settlement's buildings.
  const rand = mulberry32((seed + 4711) >>> 0)
  const stops = layout.interactives.map((it) => it.pos)
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

  // The WORKING adults, spawned on the ring `ErrandVillagers` spawns them on and
  // moved by the work module the scene actually runs. They used to stroll a
  // catalogue this branch DELETED — the free errands, and among their targets
  // the water's FOOT, which stands on the children's own stage and which the
  // shipped component pointedly leaves out of its stroll list. The replay was
  // therefore crowding the bank with adult bodies the game never sends there
  // (GPT-5.6 Sol, first cross-vendor round, D10).
  //
  // What is replayed now is the shipped choreography: `stepAdultWork` stages the
  // situations, a man with a task walks to `goalOf` it, and a man without one
  // strolls to the head of the water path or a work site — or, every other
  // stroll, to a free point anywhere in the settlement, which is what takes an
  // ADULT BODY straight across the children's ground.
  const errandCount = balance.villageLife.adultErrands.villagerCount
  const named: Array<[number, number]> = [
    ...(layout.waterPath ? ([[layout.waterPath.head.x, layout.waterPath.head.z]] as Array<[number, number]>) : []),
    ...layout.digSites.map((d): [number, number] => [d.x, d.z]),
  ]
  const walkers = claimBodies(set, errandCount)
  const stroll = (): [number, number] => {
    if (focus) {
      const a = rand() * Math.PI * 2
      const d = rand() * focus.radius
      return nudgeToFree(colliders, focus.x + Math.cos(a) * d, focus.z + Math.sin(a) * d, NPC_RADIUS)
    }
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
  // The work itself, stepped exactly as `ErrandVillagers` steps it.
  const workCfg = balance.villageLife.adultErrands
  const work = createAdultWork(errandCount, workCfg)
  const invitationClear = (x: number, z: number) => {
    const margin = balance.communication.hearingRadius + WORK_ARRIVE_RADIUS
    if (
      layout.playGround &&
      Math.hypot(x - layout.playGround.x, z - layout.playGround.z) - layout.playGround.radius <= margin
    ) return false
    if (layout.waterPath && Math.hypot(x - layout.waterPath.foot.x, z - layout.waterPath.foot.z) <= margin) return false
    if (layout.playRocks) {
      if (Math.hypot(x - layout.playRocks.upstream.x, z - layout.playRocks.upstream.z) <= margin) return false
      if (Math.hypot(x - layout.playRocks.downstream.x, z - layout.playRocks.downstream.z) <= margin) return false
    }
    return true
  }
  const workView: AdultWorkView = {
    vocabulary: rollVocabulary(seed),
    villagers: walkers.map((b) => ({ x: b.x, z: b.z, free: true })),
    geography: {
      waterHead: layout.waterPath ? { x: layout.waterPath.head.x, z: layout.waterPath.head.z } : null,
      waterFoot: layout.waterPath ? { x: layout.waterPath.foot.x, z: layout.waterPath.foot.z } : null,
      waterFill: layout.waterPath ? { x: layout.waterPath.fill.x, z: layout.waterPath.fill.z } : null,
      waterStand: layout.waterStand ? { x: layout.waterStand.x, z: layout.waterStand.z } : null,
      digSites: layout.digSites,
    },
    standable: (x, z) => !world.blocked(x, z),
    invitationClear,
    childrenHear: (x, z) =>
      children.some(
        (c) => c.active && Math.hypot(c.x - x, c.z - z) <= balance.communication.hearingRadius,
      ),
  }

  return {
    standing,
    porters,
    walkers,
    step(dt: number, clock: number) {
      routes.forEach((r, i) => {
        const b = porters[i]
        const u = (Math.sin(clock * r.speed + r.phase) + 1) / 2
        // Point 657, as `Porters` walks it: a body on the route is walked round.
        const want = stepRoundBodies(
          set,
          b,
          b.x,
          b.z,
          r.ax + (r.bx - r.ax) * u,
          r.az + (r.bz - r.az) * u,
          sep,
          world.blocked,
        )
        const [x, z] = resolveMove(colliders, want.x, want.z, NPC_RADIUS, [b.x, b.z])
        b.x = x
        b.z = z
        separateBody(set, b, dt, sep, world)
      })
      // The work module sees the bodies where they now stand, and decides who is
      // free before anybody moves — the order `ErrandVillagers` keeps.
      for (let i = 0; i < walkers.length; i++) {
        const view = workView.villagers[i] as { x: number; z: number; free: boolean }
        view.x = walkers[i].x
        view.z = walkers[i].z
        view.free = !taskOf(work, i)
      }
      stepAdultWork(work, workView, dt, workCfg, rand)
      errands.forEach((e, i) => {
        const b = walkers[i]
        const task = taskOf(work, i)
        if (task && !task.arrived) {
          // A man on a task walks where the task sends him and nowhere else.
          const to = goalOf(task)
          const d = Math.hypot(to.x - b.x, to.z - b.z)
          if (d > 1e-6) {
            const pace = workCfg.pace
            const want = stepRoundBodies(
              set,
              b,
              b.x,
              b.z,
              b.x + ((to.x - b.x) / d) * pace * dt,
              b.z + ((to.z - b.z) / d) * pace * dt,
              sep,
              world.blocked,
            )
            const [x, z] = resolveMove(colliders, want.x, want.z, NPC_RADIUS, [b.x, b.z])
            b.x = x
            b.z = z
          }
          return
        }
        if (task) return
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
        // Point 657, as `ErrandVillagers` walks it: a child on the straight
        // line is walked ROUND, not pressed on until the separation resolves it.
        const want = stepRoundBodies(
          set,
          b,
          b.x,
          b.z,
          b.x + ((e.to[0] - b.x) / d) * pace * dt,
          b.z + ((e.to[1] - b.z) / d) * pace * dt,
          sep,
          world.blocked,
        )
        const [x, z] = resolveMove(colliders, want.x, want.z, NPC_RADIUS, [b.x, b.z])
        // Pressed against a fence on the way: it gives that stroll up and picks
        // another, the way the real one replans rather than leaning there.
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

/** A settlement's children exactly as the scene mounts them, in the body set the
 *  settlement really has. */
export function village(
  placeId: string,
  seed: number,
  count = balance.villageLife.tag.childCount,
  options: {
    /** Send the errand villagers into the children's own ground. */
    adultsAmongTheChildren?: boolean
    /** A hostile pen round one child — see the wedge case at the foot of this
     *  file. `blocked` refuses everything between `r` and `r + 1.5` of it. */
    pen?: { r: number; carry: number }
  } = {},
) {
  const layout = buildLayout(placeId, seed)
  const colliders = layout.colliders
  let hash = 0
  for (const c of placeId) hash = (hash * 31 + c.charCodeAt(0)) | 0
  const localSeed = (seed ^ hash) >>> 0
  // THE LAYOUT'S OWN GROUND (work-order 688): the scene reads `playGround` from
  // the layout now, so the rig reads the same one rather than deriving a second
  // — and it INSISTS on it. The fallback that stood here fabricated a perfect
  // quarter at the origin whenever the layout gave none, which is precisely the
  // regression every case in this file exists to catch: a village whose children
  // have no ground would have played happily on an invented one (GPT-5.6 Sol,
  // first cross-vendor round, D9).
  const ground = layout.playGround
  if (!ground) throw new Error(`${placeId}@${seed}: the layout carries no children's quarter to play in`)
  const rim = Math.max(1, layout.radius - NPC_RADIUS * 2)
  // THE PEN, when the case asks for one: a wall thrown up round one child, with
  // just enough room inside to keep walking and not enough to get anywhere.
  const pen = { x: 0, z: 0, on: false }
  const penned = (x: number, z: number) => {
    if (!options.pen || !pen.on) return false
    const d = Math.hypot(x - pen.x, z - pen.z)
    return d > options.pen.r && d < options.pen.r + 1.5
  }
  // THE ROUND'S OWN REGION, exactly as `PlaceLife` wires it: the bank game walks
  // the whole settlement — its quarter is where the group ROAMS, not a wall it
  // is kept behind — while the tag round keeps its bounded ground. Replaying the
  // bank round inside the tag round's circle pressed the group against a
  // boundary the scene does not have, and clumped four children into half a
  // metre of ground.
  const boulder = climbBoulder(layout.rocks, ground, balance.villageLife.bankGame.climbableRockTop)
  const hasBank = !!(layout.bank && layout.playRocks && boulder)
  const region = hasBank
    ? { x: 0, z: 0, radius: rim }
    : { x: ground.x, z: ground.z, radius: ground.radius }
  // The sub-passage slots between pinching boundaries are not part of the
  // ground, exactly as `PlaceLife` wires it (point 657).
  // Only the TAG round is kept out of the sub-passage wedges, exactly as
  // `PlaceLife` wires it — see the reasoning there.
  const carve = hasBank ? () => false : buildWedgeCarve(colliders, NPC_RADIUS, region)
  // AND THE SHAPE THE ROUND WALKS, exactly as `PlaceLife` wires it: the bank
  // round walks the settlement's OWN boundary — the lobe out to the water
  // included, because the two play rocks stand on it — and is kept off the
  // sloping shore. The tag round keeps its circle. Replaying the bank round
  // inside the plain circle put its whole stage out of reach.
  const bounds = { radius: layout.radius, bank: layout.bank }
  const onGround = hasBank
    ? (x: number, z: number) =>
        insidePlace(bounds, x, z, NPC_RADIUS * 2) && standsOnGroundPlate(layout.bank, x, z, NPC_RADIUS)
    : (x: number, z: number) =>
        Math.hypot(x, z) <= rim && Math.hypot(x - region.x, z - region.z) <= region.radius
  const blocked = (x: number, z: number) =>
    penned(x, z) || !onGround(x, z) || !standingClear(colliders, x, z, NPC_RADIUS) || carve(x, z)
  // And the way ROUND the village for the walk down to the bank, exactly as
  // `PlaceLife` builds it: only a settlement that plays the bank round has one.
  const nav = hasBank ? buildPlaceNavGrid(bounds, colliders, NPC_RADIUS) : null
  // Narrowed by the STEP's own predicate, exactly as `PlaceLife` narrows it.
  if (nav) navRestrict(nav, onGround)
  const world: BankWorld = {
    radius: region.radius,
    centerX: region.x,
    centerZ: region.z,
    childRadius: NPC_RADIUS,
    blocked,
    nudge: (x, z) => {
      // A penned child is CARRIED clear of its wall — the settlement freeing it,
      // and the very position jump that made the symptom invisible.
      if (options.pen && pen.on && Math.hypot(x - pen.x, z - pen.z) <= options.pen.r) {
        const out = nudgeWhere(
          x,
          z,
          (ax, az) => !blocked(ax, az) && Math.hypot(ax - pen.x, az - pen.z) > options.pen!.carry,
          0.6,
          20,
        )
        if (out.found) return { x: out.pos[0], z: out.pos[1], found: true }
      }
      const roomy = nudgeWhere(x, z, (ax, az) => !blocked(ax, az) && spawnPointFree(colliders, ax, az, NPC_RADIUS))
      const r = roomy.found ? roomy : nudgeWhere(x, z, (ax, az) => !blocked(ax, az))
      return { x: r.pos[0], z: r.pos[1], found: r.found }
    },
    lineBlocked: nav ? (ax, az, bx, bz) => !navClearBetween(nav, ax, az, bx, bz) : undefined,
    route: nav ? (from, to) => findPlaceRoute(nav, from, to) : undefined,
  }
  const rand = mulberry32((localSeed + 5171) >>> 0)
  const spots = Array.from({ length: count }, (_, i) => {
    const a = (i / Math.max(1, count)) * Math.PI * 2
    const spot = world.nudge(ground.x + Math.cos(a) * 2.4, ground.z + Math.sin(a) * 2.4)
    return { x: spot.x, z: spot.z }
  })
  // THE ROUND THE SETTLEMENT ACTUALLY PLAYS (work-order 687), built exactly as
  // `PlaceLife` builds it: the bank game where there is a bank, the tag round
  // where there is none. Replaying the tag round in a village that plays the
  // bank one would measure a game nobody watches.
  const stage: BankStage | null =
    hasBank && layout.bank && layout.playRocks
      ? {
          upstream: layout.playRocks.upstream,
          downstream: layout.playRocks.downstream,
          // The stone as the scene draws it, so the replay's tapper reaches for
          // the flank the picture has (work-order 1065).
          flank: playRockFlank(layout.playRocks),
          water: { x: layout.bank.nx * layout.bank.distance, z: layout.bank.nz * layout.bank.distance },
          boulder: boulder!,
          roam: { x: ground.x, z: ground.z, radius: ground.radius },
        }
      : null
  const bank: BankState | null = stage ? createBankGame(spots, rand, BANK_CFG) : null
  const game = bank ? null : createTagGame(spots, rand, balance.villageLife.tag)
  const children: TagChild[] = bank ? bank.children : game!.children
  const bankRand = mulberry32((localSeed + 9931) >>> 0)
  const set = createInhabitantSet()
  const bodies = claimBodies(set, count, { scale: KID_SCALE })
  bodies.forEach((b, i) => {
    b.x = spots[i].x
    b.z = spots[i].z
  })
  const others = crowd(
    set,
    placeId,
    layout,
    localSeed,
    options.adultsAmongTheChildren ? { x: ground.x, z: ground.z, radius: ground.radius } : undefined,
    bodies,
  )
  // The other inhabitants' bodies as ground the chase walks round (point 657),
  // wired exactly as `PlaceLife` wires it: everybody OUTSIDE the game, never a
  // playmate — see the wiring comment there for the measurements behind both.
  const kidBodies = new Set(bodies)
  world.occupied = (_self, _partner, x, z) =>
    groundOccupied(
      set,
      x,
      z,
      balance.villageLife.separation,
      // The child's OWN body radius, so the line is the pair's contact.
      balance.villageLife.separation.bodyRadius * KID_SCALE,
      (b) => kidBodies.has(b),
    )
  return {
    game,
    bank,
    children,
    bankRand,
    stage,
    world: world as BankWorld,
    set,
    bodies,
    others,
    layout,
    ground,
    pen,
    /** The game's own clocks, whichever round is running — the metric reads
     *  these and must not have to know which. */
    clock: () => (bank ? bank.clock : game!.clock),
    playedClock: () => (bank ? bank.playedClock : game!.playedClock),
    playing: () => (bank ? bank.playing : game!.playing),
  }
}

/** One frame of the settlement, in `PlaceLife`'s own order: the game moves the children, the bodies are all written and then
 *  separated as one group — and the rest of the settlement moves through the
 *  same registry after them, as the vignettes mounted below the children do. */
export function frame(v: ReturnType<typeof village>, dt: number): void {
  if (v.bank) {
    stepBankGame(v.bank, dt, BANK_CFG, v.stage!, v.world, v.bankRand)
  } else {
    stepTagGame(v.game!, dt, balance.villageLife.tag, v.world)
  }
  for (let i = 0; i < v.children.length; i++) {
    v.bodies[i].x = v.children[i].x
    v.bodies[i].z = v.children[i].z
  }
  const separable = v.bank
    ? v.bodies.filter((_, i) => bankChildCanSeparate(v.children[i] as BankChild, bankChildTouching(v.bank!, i)))
    : v.bodies
  // The separation resolves in the round's ground PLUS the traveller's berth,
  // exactly as `PlaceLife` wires it: the traveller is not an inhabitant body, so
  // without this the separation pushes a child inside the berth the steering
  // kept.
  separateGroup(v.set, separable, dt, balance.villageLife.separation, {
    blocked: (x: number, z: number) =>
      v.world.blocked(x, z) || insideStrangerBerth(v.world, BANK_CFG, x, z),
    nudge: v.world.nudge,
  })
  for (let i = 0; i < v.children.length; i++) {
    // The resolved position AND the separation's own wedge rescues (point 656
    // follow-up), exactly as `PlaceLife` reads them back.
    absorbSeparation(v.children[i], v.bodies[i])
  }
  v.others.step(dt, v.clock())
}

export interface Track extends ChildMotionSample {
  pace: number
  held: boolean
  playing: boolean
  walkedWhilePlaying: number
  playedClock: number
}

/** One sample of every child, in the shape the shared metric judges. */
export function sample(v: ReturnType<typeof village>, paths: Track[][]): void {
  const clock = v.clock()
  const playedClock = v.playedClock()
  const playing = v.playing()
  v.children.forEach((c, i) => {
    paths[i].push({
      clock,
      x: c.x,
      z: c.z,
      walked: c.walked,
      walkedWhilePlaying: c.walkedWhilePlaying,
      playedClock,
      nudges: c.nudges,
      carried: c.carried,
      pace: c.pace,
      held: c.held,
      // Whether the GROUP was playing (point 656) — the trace has to be able to
      // show that there was a game in it at all.
      playing,
    })
  })
}

/** THE SAME RECORDED TRACE, SEEN BY A SLOWER RENDERER (point 656). Positions,
 *  `walked` and `nudges` are all the game's own state AT that moment, so leaving
 *  samples out is exactly what a machine drawing fewer frames would have
 *  recorded of the same play. Every child gets its own cadence, as it would. */
export function resample(paths: Track[][], step: (rand: () => number) => number, seed: number): Track[][] {
  return paths.map((path, k) => {
    const rand = mulberry32((seed + k * 977) >>> 0)
    const out: Track[] = []
    for (let i = 0; i < path.length; i += Math.max(1, step(rand))) out.push(path[i])
    return out
  })
}

/** 60, 20 and 7.5 frames a second, then two irregular ones. */
export const CADENCES: Array<[string, (rand: () => number) => number]> = [
  ['60 fps', () => 1],
  ['20 fps', () => 3],
  ['7.5 fps', () => 8],
  ['1-8 frames', (rand) => 1 + Math.floor(rand() * 8)],
  ['2-12 frames', (rand) => 2 + Math.floor(rand() * 11)],
]

/** Every child's path through `seconds` of the game, sampled every frame — and
 *  the settlement that walked it, for a case that must also read the ROUND's own
 *  counters off the very replay it judged. */
export function playRound(
  placeId: string,
  seed: number,
  seconds: number,
  dt = 1 / 60,
): { v: ReturnType<typeof village>; paths: Track[][] } {
  const v = village(placeId, seed)
  const paths: Track[][] = v.children.map(() => [])
  for (let t = 0; t < seconds; t += dt) {
    frame(v, dt)
    sample(v, paths)
  }
  return { v, paths }
}

/** Every child's path through `seconds` of the game, sampled every frame. */
export function play(placeId: string, seed: number, seconds: number, dt = 1 / 60): Track[][] {
  return playRound(placeId, seed, seconds, dt).paths
}

/**
 * AND THERE WAS A GAME IN THE TRACE (point 656). Every gate below is a bound on
 * something BAD, so a settlement standing perfectly still passes all of them: an
 * idle group walks nowhere, so no window is bad and the share is 0, and it is
 * never stuck, so nobody is carried. The live browser check asserts that the
 * group is playing before it judges anything; the pure proof of the user's own
 * bug had no such assertion at all, and would have gone green on a trace with no
 * game in it. The bars are measured on the four settlements replayed below —
 * five children, the whole minute played, 92-115 m walked per child-minute with
 * the bank round —
 * and set far below them: they separate a game from NOTHING, not a good game
 * from a poor one — and the walking bar is asked of the QUIETEST child, because
 * a group of five with one statue in it walks four fifths as far as a group
 * of five that all play.
 */
export function expectLively(paths: Track[][]): void {
  const live = traceLiveness(paths)
  expect(live.numbersFinite).toBe(true)
  expect(live.children).toBeGreaterThan(1)
  expect(live.seconds).toBeGreaterThan(30)
  expect(live.walkedPerChildMinute).toBeGreaterThan(20)
  // THE SAME CONDITION THE LIVE GATE USES, from the same place (point 656): the
  // group played a majority of the game CLOCK, and every child walked WHILE it
  // was played — one motionless child among four busy ones is invisible in a
  // sum, and walking counted over the whole trace would take a group's warm-up
  // for a game. Re-measured at five children (work-order 1047): the quietest
  // child of each village walks 91-111 m per minute of play.
  expect(live.quietestWalkedPerPlayedMinute).toBeGreaterThan(CHILD_MOTION.walkFloor)
  expect(holdsAGame(live)).toBe(true)
}

// SEED 42 FIRST, because it is the world the BROWSER section judges this round
// in (`scripts/verify/verify-seed.mjs` pins the verify lane to it). The pure
// layer had covered the bambara village at the child-motion report's seed
// only, and the layout the picture check actually walks — a different one —
// was the one whose route across the village could not be planned.
// AND THE OTHER TWO ARE SEEDS, NOT VILLAGES (work-order 1094). They were the
// nubian and the mandinka layout, on the reasoning that one settlement proves
// nothing about the next — true, and beside the point: the round that TEACHES
// is played in `ROCK_VILLAGE_ID`, and what varies for the player there is the
// world SEED, drawn afresh at every start. The two replacements are chosen by
// measurement over bambara seeds 1-30 (400 replayed seconds each, the guard's
// bound lifted so the layout rather than the bound is read): seed 9 is the
// FASTEST layout of the sweep to its first run (22.0 s) and seed 23 one of the
// slowest that still gets there in the ordinary way (89.3 s), so the pair
// spans the range the player is really dealt instead of two foreign corners.
export const RIVER_VILLAGES: Array<[string, number]> = [
  ['bambara-village', 42],
  ['bambara-village', 2972259115],
  ['bambara-village', 9],
  ['bambara-village', 23],
]
