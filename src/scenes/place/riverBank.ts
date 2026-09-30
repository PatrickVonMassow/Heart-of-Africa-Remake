// The walkable river bank of a settlement that stands on a river (work-order
// 482): where the water lies, which way it runs, and how far along it the
// player may walk.
//
// EVERYTHING HERE IS DERIVED FROM THE WORLD MODEL, never hand-placed. The
// settlement scene is a compressed miniature of its own surroundings — the
// §2.5 panorama samples the real terrain at `BACKDROP_SCALE` degrees per place
// unit — so the river the player walks up to inside the village is the SAME
// river the bird's-eye view draws, seen at that scale: its bearing from the
// centre is the bearing of the real course, its distance is the real gap
// between the village and the water's edge, and the current runs the way the
// real course runs (source → mouth). Nothing is painted into the backdrop and
// nothing is invented; a change to the course or to the calibratable river
// width moves the bank in the settlement with it.
//
// A bank exists only where the geography actually carries one: a VILLAGE whose
// water's edge lies clear of its built ground but within a short walk of it.
// Ports sit AT their river by design (the §4.2 exemption) and their much wider
// walkable disc would swallow the waterline, so they never grow one.

import { balance } from '../../config/balance'
import { RIVERS, type PlaceDef } from '../../world/geo'
import { densifyRiverAxis } from '../../world/riverProfile'
import { RIVER_WIDTH_DEG } from '../../world/riverWidth'
import { BACKDROP_SCALE } from './backdrop'

/** The waterline must lie at least this far outside the built disc, so the
 *  centre and every hut stay dry (spec item 1). Raised from 4 by point 1173:
 *  at 4 the last huts of a grown disc stood a stride from the shore, and the
 *  village's own margin off the water (`VILLAGE_RIVER_CLEARANCE_DEG`) grew
 *  with it so the larger gap is ground, not a lost bank. */
export const BANK_MIN_GAP = 8
/** ... and at most this far, or the walk out to it is no longer a bank of the
 *  settlement but a journey. */
export const BANK_MAX_GAP = 18

/**
 * How far short of the waterline the settlement's flat plate ends
 * (`walkEdge = distance − BANK_SHORE_HALF`): the ground slopes from there down
 * to the waterline, and the shallows and the bed (below) run on past it, where
 * the player may wade (work-order 584).
 */
export const BANK_SHORE_HALF = 1.2

/** How far the water surface drops below the settlement's ground plane. */
export const BANK_WATER_DROP = 0.25

// --- The shore profile, and what the player may do with it (work-order 584) ---
//
// THE WATER IS NOT A WALL. Work-order 482 had fenced the waterline with an
// invisible collider so the last step at the water could not carry the traveller
// out of the settlement; the play session of 09.08.2026 hit that fence and read
// it for what it is — running into the river as into a wall, a metre short of a
// bank the village exists to let him stand at. Two rules were in conflict: the
// bird's-eye view lets him walk INTO the Niger and be carried downstream
// (criterion 21, "without ever HOLDING him"), while the settlement made the same
// river solid. One river may not behave as two.
//
// So the settlement's walkable region now reaches THROUGH the waterline and out
// across the shallows to the depth a man wades to (`balance.bankWadeDepth`).
// Past that he is out of his depth, which is where the river is SWUM — and
// swimming is what the bird's-eye view does, so the boundary simply ends there
// and the ordinary leave check hands him back to it. Nothing invisible stops
// him anywhere; the last thing he walks over is drawn ground sloping under
// drawn water.
//
// The profile below is the ONE description of that ground: the shore mesh is
// built from it (`render/placeRiver.ts`), the camera's footing is read from it,
// and the wade limit is solved on it. A second, drifting definition is exactly
// what points 129/378 forbid.

/** How far out from the waterline the shallows run before the bed falls away. */
export const BANK_SHALLOWS_SPAN = 4
/** How deep the water is at the end of the shallows. */
export const BANK_SHALLOWS_DEPTH = 0.9
/** How far out the drawn bed reaches, and how deep it lies there. Beyond the
 *  shallows the channel deepens to this — the water the traveller would have to
 *  swim, which the bird's-eye view is where he does. */
export const BANK_BED_REACH = 10
export const BANK_BED_DEPTH = 1.6

/** The tallest vertical step the shore profile may ever contain. The bank is
 *  ground the player walks down, so it is a slope with a waterline, never a
 *  face: `bankShoreRows` is pinned against this. */
export const BANK_MAX_STEP = 0.05

/**
 * Angular half-width of the bank lobe's plateau: inside it the walkable region
 * reaches all the way to the water.
 *
 * THE BANK IS SYMMETRIC (work-order 1245, user 30.09.2026). Work-order 1237 had
 * widened only the DOWNSTREAM side (to 0.85, for the dugout's landing) and left
 * the upstream side at 0.384 (±16.2 m), so the walkable frontage was about
 * 45 m downstream of the settlement's bank normal against 16 m upstream. Both
 * sides now carry the same plateau: on the shipped river villages (walk edge
 * 40.0-40.9 m) the top of the bank is walkable to about s = ±45 m, and the
 * children's stretch sits in the upstream half (`bankStretch`), the dugout's
 * lane in the downstream half. Calibratable.
 */
export const BANK_PLATEAU_ANGLE = 0.85
/** ... and where the lobe has faded back to the plain walkable radius. The
 *  region between the two tapers, so walking along the bank draws the player
 *  gently back inland instead of dropping him out of the settlement at a
 *  corner. The margin (0.209 rad) is the one the bank has always faded over. */
export const BANK_FADE_ANGLE = BANK_PLATEAU_ANGLE + 0.209
/** Across this bearing off the bank normal the drawn ground disc eases into
 *  its bank-side shift (`groundDiscShift`), so the rim does not jump at the
 *  normal. It is the former upstream plateau angle, where the shift used to
 *  start. */
export const BANK_DISC_SHIFT_EASE_ANGLE = 0.384

/** How far inside the walkable edge the three named bank points sit, so a
 *  villager sent to one stands clear of the edge, on the flat plate. */
export const BANK_STAND_INSET = 1.5
/** The least distance the stretch's ends keep inside the plateau's reach along
 *  the stand line (`bankStretch` pulls the span in where it would pass it), so
 *  they can never fall outside the walkable region however the calibratable
 *  river width moves the waterline. */
export const BANK_STRETCH_PLATEAU_MARGIN = 2

/**
 * THE LONGEST the stretch may be, and the shortest it may be (point 1173 item
 * 4), measured between the two bank points the play rocks are set from. The
 * SPAN is the named quantity: a bank too tight to give the minimum reports a
 * stretch below it and fails a test with its settlement named — it never
 * silently borrows ground the plateau does not have.
 */
export const BANK_STRETCH_MAX_SPAN = 21
/** ... and below this the run is a scuffle rather than a run (point 687 §6). */
export const BANK_STRETCH_MIN_SPAN = 14

/**
 * The children's stretch on a bank (work-order 1245): its centre `centre` metres
 * DOWNSTREAM of the bank normal (negative: upstream; `balance.villageLife.
 * bankGame.stretchCentre`), on the stand line `BANK_STAND_INSET` inland of the
 * top of the bank, and its half-span — `BANK_STRETCH_MAX_SPAN / 2`, pulled in
 * where the far end would pass the plateau's reach less
 * `BANK_STRETCH_PLATEAU_MARGIN`.
 */
export function bankStretch(walkEdge: number, centre = balance.villageLife.bankGame.stretchCentre): {
  centre: number
  half: number
  out: number
} {
  const out = walkEdge - BANK_STAND_INSET
  const reach = out * Math.tan(BANK_PLATEAU_ANGLE) - BANK_STRETCH_PLATEAU_MARGIN
  const half = Math.max(0, Math.min(BANK_STRETCH_MAX_SPAN / 2, reach - Math.abs(centre)))
  return { centre, half, out }
}

/** The smallest stand-off any object keeps from the top of the bank, whatever
 *  its own footprint — a tuft of grass has no radius worth the name and must
 *  still not sprout on the slope. */
export const BANK_DRESSING_CLEARANCE = 0.9

// --- The children's play stage on the bank (work-order 687) ---------------
//
// THE STAGE IN NUMBERS, AND THE MEASUREMENT THAT PRODUCED THEM (spec item 6).
// The children's game runs BETWEEN TWO ROCKS on the bank, one upstream and one
// downstream, and the picture has to hold two things at once: a runner at the
// start line must SEE the rock he is running to, and the lane between them must
// be wide enough that a child can pass an adult — or the traveller — without
// being shoved into the water or into a wall.
//
// The stretch is the settlement's own: the two rocks stand at `upstream`/
// `downstream`, drawn `BANK_PLAY_ROCK_INSET` straight inland of those points
// so the adults' bank stops stay free ground (a villager is SENT to them, point
// 155). Measured on the three river villages that carry a bank — nubian,
// bambara and mandinka — before point 1173 moved the waterline, the rocks stood
// 19.7 m apart (the bank points 21.2 m); the bank-point span is now capped at
// `BANK_STRETCH_MAX_SPAN`, and `riverBank.test.ts` pins the pair. Since
// work-order 1245 the stretch lies about 29 m upstream of the bank normal.
//
// BOTH ROCKS IN ONE FRAME. At the reference viewport of the verification
// (1440x900) and the default field of view (50 deg vertical, App.tsx), a
// spectator at the start line sees the near rock beside him and the far one
// down the bank: the far rock is 2.4 m across and its detailed, lying
// silhouette remains large enough to identify. The horizontal frame is
// 2*atan(tan(25 deg)*1.6) = 73.4 deg, so the whole stretch fits with either rock
// a good 20 deg inside the edge for a spectator standing back from the line.
// `riverBank.test.ts` computes both angles rather than restating them.
//
// THE LANE IS FIVE WALKER DIAMETERS (THE SPEC'S FLOOR IS THREE). `BANK_PLAY_LANE_HALF` is kept clear of
// every scattered boulder, tuft and tree, which leaves 3.0 m of running ground
// — five walker diameters (0.6 m each), and the spec's floor is three. The
// margin is deliberate: the lane's own edges are the bank's shore on one side
// and whatever the plan built on the other, and a child that meets an adult
// halfway needs room for BOTH of them plus the swerve.

/** How far inland of the bank's own stretch points the two play rocks stand.
 *  It must exceed the rock's radius plus a walker's, so the adults' bank stops
 *  stay ground a villager can be sent to. */
export const BANK_PLAY_ROCK_INSET = 2.6

/** Half-width of the running lane between the two play rocks that the loose
 *  dressing is kept out of. */
export const BANK_PLAY_LANE_HALF = 1.5

// --- Where the village fetches its water (work-order 688) -----------------
//
// THE WATER PATH LANDS OUTSIDE THE CHILDREN'S STRETCH. The adults teach RIVER by
// fetching water: one carrier walks down to the river with an empty jar, another
// comes back up with a full one. Their lane may not cross the stage the children
// run on — a carrier walking through the middle of a run would be read as part
// of the game, and the two teachings have to stay separable.
//
// It lands UPSTREAM of the stretch, not downstream, and that is not a coin toss:
// a settlement draws its drinking water above the water it plays, washes and
// wades in. The landing therefore sits `balance.villageLife.adultErrands.
// waterFootBeyond` metres beyond the upstream end of the stretch, and moves with
// the stretch wherever it is put (work-order 1245) — still inside the plateau,
// where the walkable ground reaches the water (`riverBank.test.ts` measures it).

/** The water path's BEARING off the bank normal: toward the point on the
 *  stand line `waterFootBeyond` metres upstream of the stretch's upstream end.
 *  The landing itself lies on that bearing, inset radially from the top of the
 *  bank as it always has (work-order 688), so its along-bank distance past the
 *  stretch is about 1.2 m short of `waterFootBeyond` (~7.3 m at 8.5); the fill
 *  spot shares the bearing, which keeps the carrier's walk one straight line. */
function waterPathAngle(walkEdge: number): number {
  const stretch = bankStretch(walkEdge)
  const along = stretch.centre - stretch.half - balance.villageLife.adultErrands.waterFootBeyond
  return Math.atan2(along, stretch.out)
}

/**
 * Where the village's water path meets the bank: on the UPSTREAM side, beyond
 * the children's stretch, drawn `BANK_STAND_INSET` inland of the plate edge so a
 * carrier arriving there stands on flat ground rather than on the shore.
 */
export function bankWaterFoot(
  bank: Pick<PlaceRiverBank, 'nx' | 'nz' | 'fx' | 'fz' | 'walkEdge'>,
): BankPoint {
  const a = waterPathAngle(bank.walkEdge)
  return alongBank(bank, a, bank.walkEdge / Math.cos(a) - BANK_STAND_INSET)
}

/**
 * WHERE THE WATER CARRIER FILLS HIS JAR — on the water path's own bearing, out
 * where the river stands `balance.bankFillDepth` deep (work-order 1087).
 *
 * It is deliberately NOT `bankWaterFoot`. That point is the path's landing, set
 * `BANK_STAND_INSET` INLAND of the walkable edge, so a carrier who stopped there
 * halted `BANK_STAND_INSET + BANK_SHORE_HALF` — about 2.7 m — short of the water
 * and nothing about his errand read as fetching from the river (user 06.09.2026).
 * The errand's words fall at the village water stand, not here.
 *
 * The spot is SOLVED on the shore profile rather than pinned to a distance, so
 * it follows the waterline wherever the calibratable river width puts it, and
 * it can never name ground the drawn shore does not have.
 */
export function bankFillSpot(
  bank: Pick<PlaceRiverBank, 'nx' | 'nz' | 'fx' | 'fz' | 'distance' | 'walkEdge'>,
): BankPoint {
  const a = waterPathAngle(bank.walkEdge)
  return alongBank(bank, a, outAtDepth(bank, balance.bankFillDepth) / Math.cos(a))
}

/** The two play rocks of a bank: the ends of the children's stretch, upstream
 *  and downstream, each drawn `BANK_PLAY_ROCK_INSET` straight inland along the
 *  bank normal — so the pair keeps the stretch's own along-bank span wherever
 *  the stretch lies (work-order 1245 moved it off the normal). */
export function bankPlayRocks(
  bank: Pick<PlaceRiverBank, 'nx' | 'nz' | 'upstream' | 'downstream'>,
): { upstream: BankPoint; downstream: BankPoint } {
  return { upstream: inland(bank, bank.upstream, BANK_PLAY_ROCK_INSET), downstream: inland(bank, bank.downstream, BANK_PLAY_ROCK_INSET) }
}

/** `p` drawn `by` metres straight inland, against the bank normal. */
function inland(bank: Pick<PlaceRiverBank, 'nx' | 'nz'>, p: BankPoint, by: number): BankPoint {
  return { x: p.x - bank.nx * by, z: p.z - bank.nz * by }
}

/** The stand-off of the stage's photographing stand, as a fraction of the
 *  stretch's length: at 0.8 each rock lies 32° off the line of sight, inside
 *  the 36.7° half-frame of the verification viewport. */
export const BANK_VIEW_STANDOFF = 0.8

/**
 * WHERE TO STAND TO SEE BOTH PLAY ROCKS AT ONCE, and which way to look.
 *
 * A spectator on the stretch's own AXIS sees the near rock and the far one on
 * one line: the near one hides the far one, and a picture taken from there shows
 * a rock, singular, however honestly it is labelled. The stage is photographed —
 * and judged — from a stand off the axis instead: out from the middle by
 * `BANK_VIEW_STANDOFF` of the stretch's own length, perpendicular to it on the
 * settlement's side, looking at the middle. (A whole length, as before work-
 * order 1245, put the stand outside the settlement once the stretch moved
 * upstream, past the bank lobe's fade.)
 *
 * It lives here, beside the rocks themselves, because the browser suite that
 * takes that picture and the unit case that proves both rocks fall inside the
 * frame must use ONE description of it (points 129/378). The axis stand is what
 * the collision suite used, and its shutter then gated the upstream rock alone
 * (GPT-5.6 Sol, first cross-vendor round, D3/D7).
 */
export function bankPlayRocksView(rocks: { upstream: BankPoint; downstream: BankPoint }): {
  x: number
  z: number
  yaw: number
  look: BankPoint
} {
  const mx = (rocks.upstream.x + rocks.downstream.x) / 2
  const mz = (rocks.upstream.z + rocks.downstream.z) / 2
  const dx = rocks.downstream.x - rocks.upstream.x
  const dz = rocks.downstream.z - rocks.upstream.z
  const len = Math.hypot(dx, dz) || 1
  // The stretch's own direction, and the perpendicular that carries the stand
  // off its line. The perpendicular is taken TOWARD the settlement's middle, so
  // the picture looks from the village at the water rather than the other way.
  const ax = dx / len
  const az = dz / len
  let px = -az
  let pz = ax
  if (px * mx + pz * mz > 0) {
    px = -px
    pz = -pz
  }
  const x = mx + px * len * BANK_VIEW_STANDOFF
  const z = mz + pz * len * BANK_VIEW_STANDOFF
  return { x, z, yaw: Math.atan2(-(mx - x), -(mz - z)), look: { x: mx, z: mz } }
}

/**
 * Whether a body of radius `r` would stand in the children's running lane —
 * the corridor between the two rocks, plus the rocks' own ends. Everything the
 * layout scatters loose asks this, so the lane the picture shows is the lane
 * the state machine runs in (points 129/378: one description, not two).
 */
export function inBankPlayLane(
  rocks: { upstream: BankPoint; downstream: BankPoint } | null,
  x: number,
  z: number,
  r = 0,
): boolean {
  if (!rocks) return false
  const ax = rocks.upstream.x
  const az = rocks.upstream.z
  const bx = rocks.downstream.x
  const bz = rocks.downstream.z
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0
  const px = ax + dx * t
  const pz = az + dz * t
  return Math.hypot(x - px, z - pz) < BANK_PLAY_LANE_HALF + r
}

/**
 * Does a body of radius `r` stand on the settlement's FLAT ground plate, clear
 * of the shore?
 *
 * NOTHING STANDS ON THE SHORE (work-order 584/585). Past the top of the bank the
 * ground slopes away under the water, while the dressing is placed and drawn on
 * the plate at height zero — so anything that lands there hovers over a shore it
 * does not follow, out over the river. Seed 1425108822 dropped a boulder 1.8 m
 * past the Bambara waterline, which is how it was found, and grass tufts stood
 * out in the same water because they were scattered by a rule of their own.
 * There is one rule now, and every scatter reads it.
 */
export function standsOnGroundPlate(
  bank: Pick<PlaceRiverBank, 'nx' | 'nz' | 'walkEdge'> | null | undefined,
  x: number,
  z: number,
  r = 0,
): boolean {
  if (!bank) return true
  return x * bank.nx + z * bank.nz + Math.max(r, BANK_DRESSING_CLEARANCE) <= bank.walkEdge
}

/** A point on the settlement ground. */
export interface BankPoint {
  x: number
  z: number
}

/** The bank of the river a settlement stands on. */
export interface PlaceRiverBank {
  /** The river this is a bank of. */
  riverId: string
  /** Unit vector from the place centre toward the water (place x/z). */
  nx: number
  nz: number
  /** Unit vector along the bank pointing DOWNSTREAM (place x/z). */
  fx: number
  fz: number
  /** Distance from the centre to the waterline, in place units (metres). */
  distance: number
  /** Distance to the top of the bank, where the flat ground plate ends and the
   *  shore begins to slope. The player walks ON past it, down the shore. */
  walkEdge: number
  /** Distance out at which the water has reached wading depth — the far edge of
   *  the settlement's walkable region on this bearing. One step further is out
   *  of his depth, and there the boundary hands him back to the bird's-eye view,
   *  where the river is swum (work-order 584). */
  wadeEdge: number
  /** Distance from the centre to the nearest river axis, in degrees — the
   *  world figure the rest is derived from. */
  axisDeg: number
  /** Where a villager stands at the water: the middle of the children's
   *  stretch, on its stand line (work-order 1245 moved it with the stretch). */
  bank: BankPoint
  /** The far end of the walkable stretch AGAINST the current. */
  upstream: BankPoint
  /** The far end of the walkable stretch WITH the current. */
  downstream: BankPoint
}

/**
 * The shore's profile, as (distance out along the bank normal, ground height).
 * Read outward: the top of the bank at village level, the waterline where the
 * ground has dropped to the water surface, the far edge of the shallows, and
 * the bed. Every consumer — the drawn mesh, the camera's footing, the wade
 * limit — reads THIS, so the ground the player walks down is the ground the
 * scene draws.
 */
export function bankShoreRows(bank: Pick<PlaceRiverBank, 'distance' | 'walkEdge'>): Array<[number, number]> {
  return [
    [bank.walkEdge, 0],
    [bank.distance, -BANK_WATER_DROP],
    [bank.distance + BANK_SHALLOWS_SPAN, -BANK_WATER_DROP - BANK_SHALLOWS_DEPTH],
    [bank.distance + BANK_BED_REACH, -BANK_WATER_DROP - BANK_BED_DEPTH],
  ]
}

/** The ground height at `out` metres from the centre along the bank normal:
 *  flat village ground up to the top of the bank, then the profile above. */
export function bankShoreHeight(bank: Pick<PlaceRiverBank, 'distance' | 'walkEdge'>, out: number): number {
  const rows = bankShoreRows(bank)
  if (out <= rows[0][0]) return 0
  for (let i = 0; i + 1 < rows.length; i++) {
    const [x0, y0] = rows[i]
    const [x1, y1] = rows[i + 1]
    if (out <= x1) return y0 + ((out - x0) / (x1 - x0)) * (y1 - y0)
  }
  return rows[rows.length - 1][1]
}

/** How deep the water stands over the shore at `out` — negative on dry ground. */
export function bankWaterDepth(bank: Pick<PlaceRiverBank, 'distance' | 'walkEdge'>, out: number): number {
  return -BANK_WATER_DROP - bankShoreHeight(bank, out)
}

/** The ground the player stands on at (x, z): the shore where he has walked out
 *  onto it, the settlement's flat plate everywhere else. */
export function bankGroundHeight(bank: PlaceRiverBank | null | undefined, x: number, z: number): number {
  if (!bank) return 0
  return bankShoreHeight(bank, x * bank.nx + z * bank.nz)
}

/** Where the water reaches `depth` — solved on the profile above, so it can
 *  never name a spot the drawn shore does not have. */
function outAtDepth(bank: Pick<PlaceRiverBank, 'distance' | 'walkEdge'>, depth: number): number {
  const rows = bankShoreRows(bank)
  const want = -BANK_WATER_DROP - depth
  for (let i = 0; i + 1 < rows.length; i++) {
    const [x0, y0] = rows[i]
    const [x1, y1] = rows[i + 1]
    if (want >= y1 && y0 > y1) return x0 + ((y0 - want) / (y0 - y1)) * (x1 - x0)
  }
  return rows[rows.length - 1][0]
}

/** A point at bearing `a` off the bank normal, `r` from the centre. */
function alongBank(bank: Pick<PlaceRiverBank, 'nx' | 'nz' | 'fx' | 'fz'>, a: number, r: number): BankPoint {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: r * (c * bank.nx + s * bank.fx), z: r * (c * bank.nz + s * bank.fz) }
}

/**
 * The bank of the settlement `place`, or null where the geography carries none.
 *
 * `radius` is the settlement's plain walkable radius; the gate above is
 * measured against it, so a bigger settlement needs the water further out
 * before it counts as a bank rather than as a flooded market square.
 */
export function buildRiverBank(place: PlaceDef, radius: number): PlaceRiverBank | null {
  if (place.kind !== 'village') return null

  // The nearest point of any river course, and the course's own direction
  // there. The densified axis is the same one the bird's-eye ribbon and the
  // landmark boulder read, so all three agree about where the water is.
  let bestD = Infinity
  let riverId = ''
  let aLat = 0
  let aLon = 0
  let dLat = 0
  let dLon = 0
  for (const river of RIVERS) {
    const axis = densifyRiverAxis(river.points)
    for (let i = 0; i < axis.length; i++) {
      const d = Math.hypot(axis[i].lat - place.lat, axis[i].lon - place.lon)
      if (d >= bestD) continue
      bestD = d
      riverId = river.id
      aLat = axis[i].lat
      aLon = axis[i].lon
      // The axis runs SOURCE → MOUTH, so the step toward the next sample is
      // the DOWNSTREAM direction (the convention communicationRock.ts reads).
      const a = axis[Math.max(0, Math.min(axis.length - 2, i))]
      const b = axis[Math.max(1, Math.min(axis.length - 1, i + 1))]
      dLat = b.lat - a.lat
      dLon = b.lon - a.lon
    }
  }
  if (!riverId || bestD <= 0) return null

  // The water's edge, not the axis: the drawn band reaches RIVER_WIDTH_DEG out
  // to each side (world/terrain.ts), and the panorama's own scale turns those
  // degrees into the place units the player walks.
  const distance = (bestD - RIVER_WIDTH_DEG) / BACKDROP_SCALE
  if (!(distance >= radius + BANK_MIN_GAP) || distance > radius + BANK_MAX_GAP) return null

  // Place coordinates: +x is east (+lon) and +z is south (−lat), the mapping
  // the surroundings panorama samples the terrain with, so the water lies on
  // the same side of the village in both views.
  let nx = (aLon - place.lon) / bestD
  let nz = -(aLat - place.lat) / bestD
  const nLen = Math.hypot(nx, nz) || 1
  nx /= nLen
  nz /= nLen

  let fx = dLon
  let fz = -dLat
  // Square the flow against the normal: the two are perpendicular wherever the
  // village was nudged straight off its course, but a bend leaves a small
  // component that would tilt the bank strip against its own waterline.
  const proj = fx * nx + fz * nz
  fx -= proj * nx
  fz -= proj * nz
  const fLen = Math.hypot(fx, fz)
  if (fLen < 1e-6) return null
  fx /= fLen
  fz /= fLen

  const walkEdge = distance - BANK_SHORE_HALF
  // The wade limit is solved on the profile, so a recalibrated depth moves it
  // and the drawn shore together; clamped so it can never fall behind the top
  // of the bank however the depth is set.
  const wadeEdge = Math.max(walkEdge, outAtDepth({ distance, walkEdge }, balance.bankWadeDepth))
  const frame = { nx, nz, fx, fz }
  // The children's stretch (work-order 1245): off the normal, in the upstream
  // half of the symmetric bank, its three points on one stand line.
  const stretch = bankStretch(walkEdge)
  const onStand = (along: number): BankPoint => ({ x: nx * stretch.out + fx * along, z: nz * stretch.out + fz * along })
  return {
    riverId,
    ...frame,
    distance,
    walkEdge,
    wadeEdge,
    axisDeg: bestD,
    bank: onStand(stretch.centre),
    upstream: onStand(stretch.centre - stretch.half),
    downstream: onStand(stretch.centre + stretch.half),
  }
}

/** How far inland the three bank points may be drawn to find ground a villager
 *  actually fits on, and in what steps. Three metres is the whole budget: a
 *  point pulled further than that is no longer at the water. */
const BANK_SETTLE_STEP = 0.3
const BANK_SETTLE_MAX = 3

/**
 * Pulls the three named bank points onto ground a mover of the settlement's
 * own footprint can STAND on (point 155's rule, which the errand targets and
 * the dig sites already obey — these three were missed, and a rock dropped at
 * the water's edge by one seed left the downstream stretch inside a collider,
 * a place no villager sent there could ever reach).
 *
 * They are drawn straight INLAND along the bank normal, so each keeps its own
 * place along the bank, and the two stretches move TOGETHER by the same
 * amount — the mirror between them is what the UPSTREAM/DOWNSTREAM teaching
 * rests on, and a stretch nudged on its own would break it. `free` decides what
 * is standable; the layout passes its full collider set.
 */
export function settleBankPoints(
  bank: PlaceRiverBank,
  free: (x: number, z: number) => boolean,
): void {
  const pull = (p: BankPoint, by: number): BankPoint => inland(bank, p, by)
  const steps = Math.round(BANK_SETTLE_MAX / BANK_SETTLE_STEP)
  for (let s = 0; s <= steps; s++) {
    const p = pull(bank.bank, s * BANK_SETTLE_STEP)
    if (free(p.x, p.z)) {
      bank.bank = p
      break
    }
  }
  for (let s = 0; s <= steps; s++) {
    const up = pull(bank.upstream, s * BANK_SETTLE_STEP)
    const down = pull(bank.downstream, s * BANK_SETTLE_STEP)
    if (free(up.x, up.z) && free(down.x, down.z)) {
      bank.upstream = up
      bank.downstream = down
      break
    }
  }
}
