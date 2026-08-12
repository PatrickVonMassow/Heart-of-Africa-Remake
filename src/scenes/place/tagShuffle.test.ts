// THE CHILDREN DO NOT SHUFFLE ON THE SPOT (work-order 648, the user's "Kind
// zittert auf der Stelle herum"; the gate itself repaired under 656).
//
// The pure modules are pinned one by one beside this file; what this one pins is
// the WHOLE of what the player watches, in the settlements he watches it in: the
// shipped layout, its play ground, the chase, what the children say to one
// another and the body separation, stepped exactly as `PlaceLife` steps them —
// and against the WHOLE settlement's bodies, not the children's alone. Every one
// of the three causes behind the report only showed as an interaction — a chase
// heading against a hut, a role running round a knot, a body pushed into a slot
// — so a test of any one module alone would have caught none of it.
//
// THE MEASURE IS THE COMPLAINT ITSELF, not a proxy: does a child WALK a real
// distance without LEAVING a small circle? A chase is full of legitimate turns —
// a runner doubling back at the rim, a chaser cutting a corner — so counting
// direction changes measures the game, not the bug (measured: the bare reversal
// rate also depends on the frame rate, 1.4 % at 60 fps against 3.2 % at 14,
// which is why it could never gate anything). Ground covered against ground
// walked is frame-rate free and says what the user said.
//
// THE MEASURE LIVES IN ONE PLACE (point 656): `scripts/verify/childMotionMetric.mjs`,
// which the LIVE browser check judges by too. Both used to carry their own copy,
// and both copies summed frame-to-frame POSITIONS as the path walked — so the
// rescue teleport that ENDS a snag was counted as the child walking out of its
// own pocket, and the window was longer than the rescue that tidied the symptom
// away. The metric now takes the walked distance from the game itself, BREAKS
// the trace where the settlement carried a child rather than guessing what its
// legs did across the carry, and gates the rescues on their own account.
// AND ITS WINDOWS WEIGH EQUALLY IN GAME TIME rather than one per sample, so the
// frame cadence cannot move the share — shown here on a recorded trace read at
// five cadences, not merely claimed.
import { describe, expect, it } from 'vitest'
import {
  CHILD_MOTION,
  groundPath,
  holdsAGame,
  judgedEnough,
  rescueRate,
  shuffleWindows,
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

// The two numbers `PlaceLife` holds for the children it draws.
const KID_SCALE = 0.55
const NPC_RADIUS = WALKER_RADIUS
const FIRE: [number, number] = [-3.5, 2.5]

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
interface Crowd {
  standing: InhabitantBody[]
  porters: InhabitantBody[]
  walkers: InhabitantBody[]
  step: (dt: number, clock: number) => void
}

function crowd(
  set: InhabitantSet,
  layout: PlaceLayout,
  seed: number,
  /** Where the errand villagers stroll, when the case wants them somewhere
   *  particular — the children's own ground, for one. */
  focus?: { x: number; z: number; radius: number },
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
  const stations = villageAdultStations(FIRE)
  const standing = claimBodies(set, stations.length, { fixed: true })
  stations.forEach(([x, z], i) => {
    standing[i].x = x
    standing[i].z = z
  })

  // The porters, on the routes `Porters` builds from the settlement's buildings.
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

  // The errand villagers, spawned on the ring `ErrandVillagers` spawns them on
  // and strolling as it strolls: to one of the settlement's own named places, or
  // — every other stroll — to a free point anywhere in it, which is what takes
  // an ADULT BODY straight across the children's ground.
  const errandCount = balance.villageLife.adultErrands.villagerCount
  const named: Array<[number, number]> = [
    ...layout.errands,
    ...layout.digSites.map((d): [number, number] => [d.x, d.z]),
    ...(layout.teachingStone ? [[layout.teachingStone.x, layout.teachingStone.z] as [number, number]] : []),
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
function village(
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
  const ground = childPlayGround(
    villageAdultStations(FIRE),
    Math.max(1, layout.radius - NPC_RADIUS * 2),
    balance.villageLife.tag.playRadius,
    balance.communication.hearingRadius,
    { free: (x, z) => standingClear(colliders, x, z, NPC_RADIUS), fabric: builtFabric(layout) },
  )
  const rim = Math.max(1, layout.radius - NPC_RADIUS * 2)
  // THE PEN, when the case asks for one: a wall thrown up round one child, with
  // just enough room inside to keep walking and not enough to get anywhere.
  const pen = { x: 0, z: 0, on: false }
  const penned = (x: number, z: number) => {
    if (!options.pen || !pen.on) return false
    const d = Math.hypot(x - pen.x, z - pen.z)
    return d > options.pen.r && d < options.pen.r + 1.5
  }
  const blocked = (x: number, z: number) =>
    penned(x, z) ||
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
  const others = crowd(
    set,
    layout,
    localSeed,
    options.adultsAmongTheChildren ? { x: ground.x, z: ground.z, radius: ground.radius } : undefined,
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
  const view: SituationView = {
    playing: false,
    chaser: -1,
    target: -1,
    immune: -1,
    children: game.children,
    ground: { x: ground.x, z: ground.z, radius: ground.radius },
    // What THERE points at, exactly as `PlaceLife` sets it: the settlement's own
    // middle, well outside the play ground. It was missing here, so the one
    // situation that reads it could never have been replayed.
    farMark: { x: 0, z: 0 },
  }
  return { game, speech, speechRand, world, set, bodies, view, others, layout, ground, pen }
}

/** One frame of the settlement, in `PlaceLife`'s own order: what was said steers
 *  the chase, the chase moves the children, the bodies are all written and then
 *  separated as one group — and the rest of the settlement moves through the
 *  same registry after them, as the vignettes mounted below the children do. */
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
    // The resolved position AND the separation's own wedge rescues (point 656
    // follow-up), exactly as `PlaceLife` reads them back.
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

/** One sample of every child, in the shape the shared metric judges. */
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
      // Whether the GROUP was playing (point 656) — the trace has to be able to
      // show that there was a game in it at all.
      playing: v.game.playing,
    })
  })
}

/** THE SAME RECORDED TRACE, SEEN BY A SLOWER RENDERER (point 656). Positions,
 *  `walked` and `nudges` are all the game's own state AT that moment, so leaving
 *  samples out is exactly what a machine drawing fewer frames would have
 *  recorded of the same play. Every child gets its own cadence, as it would. */
function resample(paths: Track[][], step: (rand: () => number) => number, seed: number): Track[][] {
  return paths.map((path, k) => {
    const rand = mulberry32((seed + k * 977) >>> 0)
    const out: Track[] = []
    for (let i = 0; i < path.length; i += Math.max(1, step(rand))) out.push(path[i])
    return out
  })
}

/** 60, 20 and 7.5 frames a second, then two irregular ones. */
const CADENCES: Array<[string, (rand: () => number) => number]> = [
  ['60 fps', () => 1],
  ['20 fps', () => 3],
  ['7.5 fps', () => 8],
  ['1-8 frames', (rand) => 1 + Math.floor(rand() * 8)],
  ['2-12 frames', (rand) => 2 + Math.floor(rand() * 11)],
]

/** Every child's path through `seconds` of the game, sampled every frame. */
function play(placeId: string, seed: number, seconds: number, dt = 1 / 60): Track[][] {
  const v = village(placeId, seed)
  const paths: Track[][] = v.game.children.map(() => [])
  for (let t = 0; t < seconds; t += dt) {
    frame(v, dt)
    sample(v, paths)
  }
  return paths
}

/**
 * AND THERE WAS A GAME IN THE TRACE (point 656). Every gate below is a bound on
 * something BAD, so a settlement standing perfectly still passes all of them: an
 * idle group walks nowhere, so no window is bad and the share is 0, and it is
 * never stuck, so nobody is carried. The live browser check asserts that the
 * group is playing before it judges anything; the pure proof of the user's own
 * bug had no such assertion at all, and would have gone green on a trace with no
 * game in it. The bars are measured on the four settlements replayed below —
 * four children, the whole minute played, 107-115 m walked per child-minute —
 * and set far below them: they separate a game from NOTHING, not a good game
 * from a poor one — and the walking bar is asked of the QUIETEST child, because
 * a group of four with one statue in it walks three quarters as far as a group
 * of four that all play.
 */
function expectLively(paths: Track[][]): void {
  const live = traceLiveness(paths)
  expect(live.numbersFinite).toBe(true)
  expect(live.children).toBeGreaterThan(1)
  expect(live.seconds).toBeGreaterThan(30)
  expect(live.walkedPerChildMinute).toBeGreaterThan(20)
  // THE SAME CONDITION THE LIVE GATE USES, from the same place (point 656): the
  // group played a majority of the game CLOCK, and every child walked WHILE it
  // was played — one motionless child among three busy ones is invisible in a
  // sum, and walking counted over the whole trace would take a group's warm-up
  // for a game. Measured here: the quietest child of each village walks 102-113 m
  // per minute of play.
  expect(live.quietestWalkedPerPlayedMinute).toBeGreaterThan(CHILD_MOTION.walkFloor)
  expect(holdsAGame(live)).toBe(true)
}

// The reported village and seed first; the others are there because the causes
// were general and one settlement's layout proves nothing about the next.
const PLACES: Array<[string, number]> = [
  ['bambara-village', 2972259115],
  ['maasai-village', 42],
  ['swahili-village', 99],
]

describe('the children never shuffle on the spot (points 648/656)', () => {
  for (const [placeId, seed] of PLACES) {
    it(`${placeId} at seed ${seed} keeps every child covering ground`, () => {
      const paths = play(placeId, seed, 60)
      expectLively(paths)
      const r = shuffleWindows(paths)
      expect(r.seconds).toBeGreaterThan(200) // a real stretch of the game, in child-seconds
      // AND THE VERDICT RESTS ON THE TRACE, CHILD BY CHILD. A silence longer
      // than the window is judged by nobody and reported as unjudged, so a share
      // is only worth what `judgedShare` says it covers — and both are read off
      // the WORST child, because one snagging child among three healthy ones is
      // divided by four in every group average. Measured here: the least
      // judgeable child 0.88-0.90 (the missing part being the tail no window can
      // reach into and the second before each of that child's few rescues), the
      // worst child's share 0.00-0.03 %.
      expect(r.leastJudged).toBeGreaterThan(CHILD_MOTION.judgedGate)
      expect(r.worstShare).toBeLessThan(CHILD_MOTION.shareGate)
      // AND THE SHORT BURST the one-second window cannot see (point 656): a
      // child that paces on the spot for six tenths of a second between spells
      // of walking never collects the metre a one-second window asks for.
      // Measured here, worst child: 0.000 / 0.028 / 0.028 %.
      const burst = shuffleWindows(paths, CHILD_MOTION.short)
      expect(burst.worstShare).toBeLessThan(CHILD_MOTION.shareGate)
      // AND THE BURST MEASURE MUST HAVE JUDGED SOMETHING: its share is 0 both
      // when nothing was bad and when nothing was looked at. Measured here:
      // 230-234 judged child-seconds, least judgeable child 0.941-0.949.
      expect(judgedEnough(burst)).toBe(true)
      expect(judgedEnough(r)).toBe(true)
      // AND NOBODY IS BEING CARRIED (point 656): the rescue teleport is what
      // ENDS a snag, so a village that keeps its share down only by picking its
      // children up out of the pockets they walk into fails here instead. The
      // distance is the GAME's, not a watcher's guess at it — and a trace that
      // does not publish it fails rather than counting as carry-free.
      const rescues = rescueRate(paths)
      expect(rescues.carriedPublished).toBe(true)
      expect(rescues.nudgesPublished).toBe(true)
      expect(rescues.carriedMetresPerChildMinute).toBeLessThan(CHILD_MOTION.carryGate)
      expect(rescues.perChildMinute).toBeLessThan(CHILD_MOTION.rescueGate)
      // The worst child on its own clock: 5-6 rescues in its minute here, and
      // 0.00-2.40 m carried.
      expect(rescues.worstPerChildMinute).toBeLessThan(CHILD_MOTION.worstChildRescueGate)
      expect(rescues.worstCarriedMetresPerChildMinute).toBeLessThan(CHILD_MOTION.worstChildCarryGate)
    })
  }

  it('holds at a low and uneven frame rate too', () => {
    // The headless machine draws at anything from 60 down to ten-odd frames a
    // second, and every rule behind this is a per-frame decision — so the
    // measurement is repeated where each frame carries five times the movement.
    const rand = mulberry32(4242)
    const v = village('bambara-village', 2972259115)
    const paths: Track[][] = v.game.children.map(() => [])
    for (let t = 0; t < 150; ) {
      const dt = 0.07 + rand() * 0.03
      t += dt
      frame(v, dt)
      sample(v, paths)
    }
    expectLively(paths)
    expect(shuffleWindows(paths).share).toBeLessThan(CHILD_MOTION.shareGate)
    expect(rescueRate(paths).carriedMetresPerChildMinute).toBeLessThan(CHILD_MOTION.carryGate)
    expect(rescueRate(paths).perChildMinute).toBeLessThan(CHILD_MOTION.rescueGate)
  })

  it('and none of them is ever held motionless or left inside ANY inhabitant', () => {
    // The other two symptoms of the same report, on the same run: a child
    // commanded to move that covers no ground, and two bodies in one place —
    // and the second is judged against every body in the settlement's registry
    // (point 656.4), not the children's alone. An adult is drawn at full scale,
    // so a child owes it a wider berth than it owes another child.
    const v = village('bambara-village', 2972259115)
    const n = v.game.children.length
    const sep = balance.villageLife.separation
    const kidPair = sep.bodyRadius * KID_SCALE * 2 - sep.slop
    const adultPair = sep.bodyRadius * KID_SCALE + sep.bodyRadius - sep.slop
    const adults = [...v.others.standing, ...v.others.porters, ...v.others.walkers]
    let longestStall = 0
    const stall = new Array<number>(n).fill(0)
    let overlaps = 0
    let nearestAdult = Infinity
    const last = v.game.children.map((c) => c.walked)
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
        const a = v.game.children[i]
        for (let j = i + 1; j < n; j++) {
          const b = v.game.children[j]
          if (Math.hypot(a.x - b.x, a.z - b.z) < kidPair - 1e-6) overlaps++
        }
        for (const b of adults) {
          const d = Math.hypot(a.x - b.x, a.z - b.z)
          nearestAdult = Math.min(nearestAdult, d)
          if (d < adultPair - 1e-6) overlaps++
        }
      }
    }
    expect(longestStall).toBeLessThan(0.25)
    expect(overlaps).toBe(0)
    // AND THE REST OF THE SETTLEMENT WAS REALLY THERE. Measured: the nearest an
    // adult comes to a child in this village is 0.64 m — the play ground is a
    // corner of the settlement and the adults keep to their own work — so the
    // bar here is the settlement's own scale, and the case below is what puts an
    // adult body INSIDE the ground.
    expect(adults.length).toBeGreaterThan(10)
    expect(nearestAdult).toBeLessThan(3)
  })

  it('and holds when the adults walk through the children’s own ground', () => {
    // THE CROWDING ITSELF (point 656.4). The shipped play ground is a corner of
    // the settlement, so the adults' errands rarely reach it — and a separation
    // judged only where nobody meets proves nothing about the frame the player
    // watches. Here every errand villager strolls INSIDE the ground: adult
    // bodies at full scale, crossing and standing among the children, which is
    // the crowding that made the multi-pass sweep necessary.
    const v = village('bambara-village', 2972259115, undefined, { adultsAmongTheChildren: true })
    const paths: Track[][] = v.game.children.map(() => [])
    const sep = balance.villageLife.separation
    const adultPair = sep.bodyRadius * KID_SCALE + sep.bodyRadius - sep.slop
    const adults = [...v.others.standing, ...v.others.porters, ...v.others.walkers]
    let overlaps = 0
    let touching = 0
    let worstDepth = 0
    for (let t = 0; t < 60; t += 1 / 60) {
      frame(v, 1 / 60)
      sample(v, paths)
      for (const c of v.game.children) {
        for (const b of adults) {
          const d = Math.hypot(c.x - b.x, c.z - b.z)
          if (d < adultPair - 1e-6) {
            overlaps++
            worstDepth = Math.max(worstDepth, adultPair - d)
          }
          if (d < adultPair + 0.2) touching++
        }
      }
    }
    expect(touching).toBeGreaterThan(100) // they really did meet, and often
    // NOBODY IS EVER VISIBLY INSIDE ANYBODY. Measured over this minute: 6
    // pair-frames of contact at all, the deepest 0.9 cm of a 37 cm contact —
    // a walker that could not step out of a child because a fence was behind
    // it, resolved the frame after. The bars are set an order of magnitude
    // above that, so a real merge (the point-648 defect was 21 cm) fails here.
    expect(worstDepth).toBeLessThan(0.02)
    expect(overlaps).toBeLessThan(60)
    // AND NOBODY IS CARRIED. The children still play their own game among them.
    expectLively(paths)
    expect(rescueRate(paths).carriedMetresPerChildMinute).toBeLessThan(CHILD_MOTION.carryGate)
    // THE CAUSE OF POINT 657, REPLAYED AT ITS OWN GATES. This case is what
    // named it: the chase probed a `blocked` of geometry only, so a child whose
    // heading crossed an adult standing in its ground read the way as OPEN,
    // walked into the body, and the separation pushed it back out — measured
    // here before the fix, 1.14 % of one-second windows (the group), the worst
    // child 3.5 % of its half-second bursts, against 0.00-0.03 % where the
    // adults keep to their own work; a held bar of 2 % stood here in place of a
    // gate. Now the chase steers round the other inhabitants' bodies
    // (`TagWorld.occupied`) and the walkers steer round the children
    // (`stepRoundBodies`), and this crowded minute must read INSIDE the same
    // gates as a quiet one — measured after the fix: not one bad window at
    // either scale. The bars are the shipped gates, so the old code fails here.
    const crowded = shuffleWindows(paths)
    const crowdedBurst = shuffleWindows(paths, CHILD_MOTION.short)
    expect(judgedEnough(crowded)).toBe(true)
    expect(judgedEnough(crowdedBurst)).toBe(true)
    expect(crowded.leastJudged).toBeGreaterThan(CHILD_MOTION.judgedGate)
    expect(crowded.worstShare).toBeLessThan(CHILD_MOTION.shareGate)
    expect(crowdedBurst.worstShare).toBeLessThan(CHILD_MOTION.shareGate)

    // AND THAT SAME RECORDED MINUTE READS THE SAME AT ANY FRAME CADENCE (point
    // 656): resampled as a slower or unevener renderer would have seen the very
    // same play, evenly at 60, 20 and 7.5 frames a second and irregularly at
    // cadences swinging by a factor of eight and of eleven. What is pinned here
    // since point 657 is the VERDICT — clean at every cadence — because the
    // share this block used to be numerically invariant about (0.46 %) was the
    // defect, and it is gone; a 20 % band around nothing is noise. The
    // penned-child block below keeps the numeric invariance demonstration on a
    // trace that still has a real share to be invariant about.
    for (const [, step] of CADENCES) {
      expect(shuffleWindows(resample(paths, step, 4242)).worstShare).toBeLessThan(
        CHILD_MOTION.shareGate,
      )
    }
  })
})

/**
 * The pen, measured. A yard of 0.8 m leaves the child room to keep WALKING —
 * the deflection needs a couple of body radii of clear ground ahead before it
 * will take a step at all — and no room to get anywhere, and the settlement
 * carries it 3 m clear whenever its stall watch runs out. Measured over 40 s at
 * these numbers (re-measured after the point-657 cornered evade, which changes
 * how the penned child paces its yard but not that it is trapped): 28.5
 * rescues per child-minute, every one of them carrying the child, and 7.4 % of
 * the judged game time walked without getting anywhere — thirty times the
 * gate. Half of that trace is not judged at all,
 * because a window that spans a carry is refused rather than guessed at; the
 * carries are what the rescue gate answers for. THE MEASURE THIS ONE REPLACED
 * sees 0.35 % of the same trace and would have passed it at its own 1 % gate,
 * because every one of its two-second windows holds a 3 m carry: it counted the
 * teleport as the child walking, and as ground the child covered.
 */
const PEN_RADIUS = 0.8
const PEN_CARRY = 3

describe('and the gate SEES a child that is wedged (point 656)', () => {
  /** The reported settlement with one child penned: a wall thrown up round it
   *  with room to keep walking and none to get anywhere, and a settlement that
   *  carries it clear of the wall when its stall watch runs out. The pen follows
   *  the child, so the trace holds episode after episode rather than one. */
  function wedged(seconds = 40, r = PEN_RADIUS, carry = PEN_CARRY) {
    const v = village('bambara-village', 2972259115, undefined, { pen: { r, carry } })
    const paths: Track[][] = v.game.children.map(() => [])
    for (let t = 0; t < seconds; t += 1 / 60) {
      frame(v, 1 / 60)
      const c = v.game.children[0]
      // Penned once the game is running, and re-penned wherever it is carried.
      // Never over ANOTHER child, though: the wall is ground nobody may stand
      // on, and building it round a passer-by would leave that child inside a
      // collider — a broken settlement rather than a wedged child.
      const clear = v.game.children.every(
        (o, i) => i === 0 || Math.hypot(o.x - c.x, o.z - c.z) > r + 1.6,
      )
      if (clear && v.game.clock > 3 && (!v.pen.on || Math.hypot(c.x - v.pen.x, c.z - v.pen.z) > r)) {
        v.pen.x = c.x
        v.pen.z = c.z
        v.pen.on = true
      }
      sample(v, paths)
    }
    return paths
  }

  it('goes RED on it — and the measure it replaced would have passed', () => {
    const paths = wedged()
    const penned = [paths[0]]
    const r = shuffleWindows(penned)
    const rescues = rescueRate(penned)

    // The gate bites: the penned child walks and gets nowhere, over and over,
    // and is carried out of its yard some thirty times a minute. Read on the
    // WHOLE village, the same trace fails on the per-child gates and would have
    // been diluted by three healthy siblings without them.
    const village = shuffleWindows(paths)
    expect(village.worstShare).toBeGreaterThan(CHILD_MOTION.shareGate)
    expect(village.leastJudged).toBeLessThan(CHILD_MOTION.judgedGate)
    expect(rescueRate(paths).worstPerChildMinute).toBeGreaterThan(CHILD_MOTION.worstChildRescueGate)
    expect(r.share).toBeGreaterThan(CHILD_MOTION.shareGate * 4)
    expect(rescues.perChildMinute).toBeGreaterThan(CHILD_MOTION.rescueGate * 2)
    expect(rescues.carriedMetresPerChildMinute).toBeGreaterThan(CHILD_MOTION.carryGate * 4)

    // AND THE OLD MEASURE WOULD HAVE PASSED THE SAME TRACE. A window of two
    // seconds, the path summed from frame-to-frame POSITIONS and the ground
    // covered read off the raw ones — so the carry out of the pen counted both
    // as walking and as ground covered, and the episode it ended was over
    // before the window could close on it. This is the blindness the point was
    // opened for, and it is measured here rather than argued.
    // AND THE WALKING FLOOR CANNOT SEE THIS AT ALL, which is why the share
    // exists. The penned child's legs move exactly as much as a healthy child's
    // — measured 109.6 m per played minute, inside the shipped villages' own
    // 102-113 band — so no floor could separate the two without failing
    // ordinary play. The floor answers "did it move?"; the share answers "did
    // it get anywhere?", and only the second one is the reported bug.
    const legs = traceLiveness(penned)
    expect(legs.perChild[0].walkedPerPlayedMinute).toBeGreaterThan(CHILD_MOTION.walkFloor * 3)
    expect(holdsAGame(traceLiveness(paths))).toBe(true)
    const asItWas = oldMeasure(penned, 2, 2, 0.5)
    expect(asItWas.windows).toBeGreaterThan(1000) // it really did look
    expect(asItWas.share).toBeLessThan(0.01) // and it would have passed its gate
    expect(r.share).toBeGreaterThan(asItWas.share * 5)
  })

  it('and says the same thing about that ONE recorded trace at any frame cadence', () => {
    // THE VERDICT MUST NOT MOVE WITH THE FRAME RATE — the whole reason the
    // reversal count was thrown out (1.4 % of steps at 60 fps against 3.2 % at
    // 14). ONE recorded trace of the penned child, resampled as a slower or
    // unevener renderer would have seen the very same play; nothing about the
    // settlement changes, only how often it was looked at.
    //
    // WHAT IS PINNED HERE IS THE VERDICT, NOT THE NUMBER, and the difference is
    // deliberate. This child is CARRIED every two seconds, and a
    // window that spans a carry is refused rather than guessed at — so only
    // half of the trace can be judged at all (measured judgedShare
    // 0.478-0.507 across the cadences, re-measured after the point-657
    // cornered evade), and what survives is a scatter of short
    // continuous stretches whose share swings with which of them a cadence
    // happens to sample: 7.40 / 8.10 / 10.34 / 10.37 / 10.03 %. The one thing
    // that does NOT swing is the answer the gate reads — every cadence is RED
    // by a factor of at least twenty-nine — and the rescue rate below, which
    // counts the very carries that made the trace unjudgeable, is red by a
    // factor of four at all of them. This is the worst case the
    // metric has, and it is stated rather than smoothed over.
    const penned = [wedged()[0]]
    const read = CADENCES.map(([, step]) => shuffleWindows(resample(penned, step, 31337)))
    for (const r of read) {
      expect(r.share).toBeGreaterThan(CHILD_MOTION.shareGate * 6)
      expect(r.judgedShare).toBeGreaterThan(0.4)
    }
    for (const [, step] of CADENCES) {
      expect(rescueRate(resample(penned, step, 31337)).perChildMinute).toBeGreaterThan(
        CHILD_MOTION.rescueGate * 3,
      )
    }
  })

  it('and it is the PENNED child the report names', () => {
    // A gate that went red for the whole village whenever anything at all
    // happened would name nothing. The worst window belongs to the penned child,
    // and the rescues are its own.
    const paths = wedged()
    const all = shuffleWindows(paths)
    expect(all.worst.child).toBe(0)
    const rescues = rescueRate(paths)
    expect(rescues.worstChild).toBe(0)
  })

  it('and a rescue by the SEPARATION is a rescue the trace can see', () => {
    // THE THIRD RESCUE PATH (point 656 follow-up). `escapeNudge` counts the
    // chase's two stall watches where they fire — but the separation has an
    // escape of its own: a body pressed between a collider and another body
    // past `wedgeSeconds` is teleported to free ground by `separateGroup`
    // itself. Uncounted, that jump stood in the trace as the child walking out
    // of its pocket — the exact hole this whole point closed, open again one
    // layer down, and reachable in a real session (a child chased against a
    // hut with an adult body pressing on it). Here the wedge fires through the
    // PRODUCTION separation, the write-back is the settlement's own
    // (`absorbSeparation`, the same call `PlaceLife` makes), and the child's
    // published counters must carry the rescue so the shared metric breaks the
    // path at it instead of crediting the carry as ground covered.
    const game = createTagGame([{ x: 0, z: 0 }], mulberry32(9), balance.villageLife.tag)
    const child = game.children[0]
    const sep = balance.villageLife.separation
    const set = createInhabitantSet()
    claimBodies(set, 1, { x: -0.1, z: 0, fixed: true })
    const [body] = claimBodies(set, 1, { x: 0, z: 0, scale: KID_SCALE })
    const world = {
      blocked: (x: number, z: number) => x > 1e-4 || Math.abs(z) > 1e-4,
      nudge: () => ({ x: 5, z: 5, found: true }),
    }
    const dt = 1 / 60
    let clock = 0
    const at = (): ChildMotionSample => ({
      clock,
      x: child.x,
      z: child.z,
      walked: child.walked,
      nudges: child.nudges,
      carried: child.carried,
    })
    const track: ChildMotionSample[] = [at()]
    for (let i = 0; i < Math.ceil((sep.wedgeSeconds + 0.5) / dt); i++) {
      clock += dt
      body.x = child.x
      body.z = child.z
      separateGroup(set, [body], dt, sep, world)
      absorbSeparation(child, body)
      track.push(at())
    }
    // The settlement really did pick the child up and set it down on free
    // ground — and the write-back re-took the anchor there, like the chase's
    // own rescue does, so the progress watch cannot charge a second rescue for
    // the same episode.
    expect(child.x).toBe(5)
    expect(child.z).toBe(5)
    expect(child.anchorX).toBe(5)
    expect(child.anchorZ).toBe(5)
    // The rescue reached the child's own counters through the write-back …
    expect(child.nudges).toBe(1)
    expect(child.carried).toBeCloseTo(Math.hypot(5, 5), 6)
    // … so the shared metric sees a rescue, not a child that got somewhere:
    // the rate reports it, and the walked path BREAKS at the jump instead of
    // carrying seven metres of teleport as ground the child covered.
    const rescues = rescueRate([track])
    expect(rescues.nudgesPublished).toBe(true)
    expect(rescues.carriedPublished).toBe(true)
    expect(rescues.rescues).toBe(1)
    const path = groundPath(track)
    expect(path.broken.some(Boolean)).toBe(true)
    expect(Math.max(...path.x.map(Math.abs), ...path.z.map(Math.abs))).toBeLessThan(1)
  })
})

describe('and the replay refuses a trace with no game in it (point 656)', () => {
  // THE VACUOUS PASS, DEMONSTRATED. Every gate above bounds something BAD, so
  // the emptier the trace the better it scores. These two are what the pure
  // proof used to accept in silence.

  /** Four children standing where they were put, for a minute. */
  function standingStill(playing: boolean): Track[][] {
    return Array.from({ length: 4 }, (_, k) =>
      Array.from({ length: 3600 }, (_, i) => ({
        clock: i / 60,
        x: k * 2,
        z: 0,
        walked: 0,
        // The settlement's own counters: it says it is playing (or not), and
        // says its legs did nothing either way.
        walkedWhilePlaying: 0,
        playedClock: playing ? i / 60 : 0,
        nudges: 0,
        carried: 0,
        pace: 0,
        held: false,
        playing,
      })),
    )
  }

  it('a group that stands still passes every other gate — and fails this one', () => {
    const still = standingStill(true)
    expect(shuffleWindows(still).share).toBe(0)
    expect(rescueRate(still).perChildMinute).toBe(0)
    expect(rescueRate(still).carriedMetresPerChildMinute).toBe(0)
    expect(() => expectLively(still)).toThrow()
    expect(holdsAGame(traceLiveness(still))).toBe(false)
  })

  it('and so does a settlement in which no round ever plays', () => {
    // The children really walked here — it is the reported village's own minute
    // — but the group never played a round, which in the real settlement is a
    // game that never started. The browser check waits for `playing` and asserts
    // it; this is the same assertion on the pure side.
    const idle = play('bambara-village', 2972259115, 60).map((path) =>
      // No round ever ran: the game's own play counters stand at nothing,
      // whatever the children's legs did.
      path.map((f) => ({ ...f, playing: false, playedClock: 0, walkedWhilePlaying: 0 })),
    )
    expect(shuffleWindows(idle).share).toBeLessThan(CHILD_MOTION.shareGate)
    expect(() => expectLively(idle)).toThrow()
  })
})

/** The measure as point 648 left it, kept for exactly one purpose: to show on a
 *  real trace what it could not see. Summed position deltas as the path walked,
 *  raw positions as the ground covered, a two-second window. */
function oldMeasure(paths: Track[][], span: number, minPath: number, circle: number) {
  let windows = 0
  let bad = 0
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
      if (walked > minPath && out < circle) bad++
    }
  }
  return { windows, bad, share: windows > 0 ? bad / windows : 0 }
}
