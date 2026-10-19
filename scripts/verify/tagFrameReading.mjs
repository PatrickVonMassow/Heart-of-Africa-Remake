/**
 * What `verification/480-village-tag.png` must SHOW (work-order point 524.3).
 *
 * The picture is the acceptance evidence for the children's game of tag, and it
 * has now failed a human twice while every check stayed green. The first failure
 * was the frame's CONTENT — an empty plain with one child on it — which the
 * "village behind them" rule below fixed. The second was its SCALE and what
 * stood in front of it: the standpoint the sweep picked stood behind the
 * settlement's boulder line, and of the two children only their heads showed
 * over the rocks, some forty pixels of figure in a 1440x900 frame. Both checks
 * passed, because "is the subject in the picture" is all either of them asked.
 *
 * So this module states the rule as a MEASUREMENT, and the suite feeds it a
 * reading taken by projecting the children through the live camera and
 * ray-probing them against the rendered scene (CLAUDE.md §7.2 — never a radius,
 * never an assumed distance). It is pure so the numbers can be pinned in the
 * unit layer against the readings both the rejected and the accepted standpoint
 * actually produced (tagFrameReading.test.mjs).
 */

// --- The child figure, as the renderer draws it ------------------------------
// Mirrors src/scenes/place/PlaceLife.tsx (KID_SCALE, the Figure's body/head) and
// src/render/figures.ts. A child is a grown figure at 0.55: body 1.0 high, the
// head sphere centred 0.18 above it with radius 0.16.
export const KID_SCALE = 0.55
/** A child's full height, feet to crown, in metres. */
export const KID_HEIGHT = KID_SCALE * (1.0 + 0.18 + 0.16)
/** The head sphere's diameter in metres — 23.9 % of that height. */
const KID_HEAD_DIAMETER = KID_SCALE * 2 * 0.16
/** The body cone's width where it is widest, at the hip: `bodyRadius` 0.32
 *  shrunk by the legged figure's trunk factor (1 - `hipY` 0.38). 29.6 % of the
 *  height. */
export const KID_BODY_WIDTH = KID_SCALE * 2 * 0.32 * (1 - 0.38)

/**
 * The smallest head that still reads AS a head.
 *
 * The head is the feature that makes the figure a person rather than a coloured
 * wedge: a sphere drawn at 24x16 segments (TESSELLATION.figureHead). At 16 px
 * across, its facets are ~2 px wide and the lit/shadow sides are several tones
 * apart, so it resolves as a round, shaded head. Below that the facets fall
 * under a pixel, antialiasing flattens the shading, and it is the dot the
 * reviewer saw over the boulders.
 */
const HEAD_READABLE_PX = 16

/**
 * The minimum height, in frame pixels, of a child's projected figure.
 *
 * DERIVED, not chosen: the head is `KID_HEAD_DIAMETER / KID_HEIGHT` of the
 * figure, so a readable head fixes the figure at 67 px. That is deliberately not
 * a round 50 or 100 — 50 px is what the suite's old 14 m distance cap allowed
 * and is a speck; 100 px would reject the 8.5 m standpoint that photographs the
 * pair with the most village behind it. Measured in this village: a standpoint
 * 8.5 m from the pair reads 82-83 px, 5.5 m reads 115-144 px, 4.5 m reads
 * 134-176 px, and the rejected frame's ~40 px sat below all of them.
 */
export const MIN_CHILD_PIXELS = Math.round((HEAD_READABLE_PX * KID_HEIGHT) / KID_HEAD_DIAMETER)

/**
 * Heights up the child's own axis, as fractions of its height, that the suite
 * ray-probes. Spread from shin to the base of the neck (0.75 of the height sits
 * just under the head sphere) so an occluder of ANY height is met: the
 * boulder line hid everything to the shoulders and a single chest probe at 0.68
 * of the height was the one sample it happened to leave clear.
 */
export const AXIS_SAMPLES = [0.15, 0.3, 0.45, 0.6, 0.75]

/** A first surface nearer than this fraction of the child's distance is not the
 *  child — it is something standing in front of it. The pair itself is ~1 m
 *  apart at 5 m, so a child hidden behind its playmate reads ~0.8 and is
 *  correctly counted as occluded. */
export const OCCLUDED_RATIO = 0.85
/** ...and beyond this the ray sailed past the figure and hit the ground behind
 *  it: no proof the child is drawn there, but no occluder either. */
export const CONFIRMED_RATIO = 1.15
/** How many samples must positively HIT the child. Projection alone can frame a
 *  child that is not drawn where the game state says it is; two confirmed hits
 *  say the rendered figure is on that sight line. */
const MIN_CONFIRMED_SAMPLES = 2

/** The share of the frame a child must stay inside. A figure clipped by the
 *  very edge is in the picture by arithmetic, and the shutter's own settle is
 *  several frames of running children after the reading. */
const FRAME_MARGIN = 0.7

/**
 * How far apart the two must stand ACROSS the frame, in their own body widths.
 *
 * "BOTH children at a readable size" is not two entries in a list — the picture
 * has to show two of them. The gap between chaser and quarry breathes down to
 * ~0.2 m after a catch, and at that separation the rear one hides inside the
 * front one's silhouette: the retaken frame showed one child where the reading
 * said two, because nothing measured the distance BETWEEN them on screen.
 *
 * At exactly one body width the two silhouettes touch; at 1.5 a half width of
 * background shows between them, which is what makes them read as two figures
 * rather than one wide one. That is 44 % of a child's own on-screen height, so
 * the rule scales with the standpoint instead of fixing a pixel count.
 */
const SEPARATION_IN_BODIES = 1.5
/** ...expressed against the figure's projected height, which is what a reading
 *  measures. */
const MIN_SEPARATION_FACTOR = (SEPARATION_IN_BODIES * KID_BODY_WIDTH) / KID_HEIGHT

// --- What must stand around them ---------------------------------------------
/** How much village a frame must hold behind the children. Two buildings is what
 *  tells a chase in a settlement from two figures on a plain; asking for more
 *  would fail the scattered forest villages, which have no more to show. */
export const VILLAGE_BEHIND = 2
/** The chase is photographed at a TIGHT moment: the gap breathes by design, and
 *  at full stretch the two do not both survive the shutter's settle. */
const TIGHT_GAP = 6
/** And the camera is not pressed against a wall: a hut two metres in front of
 *  the lens is not "the village behind them", it is a wall. */
const WALL_CLEARANCE = 3.5

/**
 * ONE CHILD, as the frame shows it: whole, inside the frame, unoccluded, drawn
 * where the state says it is, and big enough to read as a person.
 *
 * Extracted from `judgeTagStandpoint` so a picture of ONE child is judged by the
 * very same bar as the pair (work-order 1082: the child standing on the boulder
 * it has just named). `who` names the figure in the reason a red run prints.
 */
export function judgeChildFigure(c, who) {
  if (!c || !c.ndcFeet || !c.ndcHead) return { ok: false, reason: `${who} is behind the camera` }
  for (const p of [c.ndcFeet, c.ndcHead]) {
    if (Math.abs(p[0]) > FRAME_MARGIN || Math.abs(p[1]) > FRAME_MARGIN)
      return { ok: false, reason: `${who} sits outside the inner ${FRAME_MARGIN} of the frame` }
  }
  if (c.occluded > 0)
    return { ok: false, reason: `${who} is occluded at ${c.occluded}/${AXIS_SAMPLES.length} of its height` }
  if (c.confirmed < MIN_CONFIRMED_SAMPLES)
    return { ok: false, reason: `${who} is not drawn on its sight line (${c.confirmed} confirmed samples)` }
  if (!(c.pixels >= MIN_CHILD_PIXELS))
    return { ok: false, reason: `${who} reads ${Math.round(c.pixels)} px, below the ${MIN_CHILD_PIXELS} px floor` }
  return { ok: true, reason: `${who} reads whole and unoccluded at ${Math.round(c.pixels)} px` }
}

/**
 * Judge one standpoint's reading: `{ clear, behind, gap, nearestWall,
 * separation, children }` — a clear sight line, the buildings behind the pair,
 * the pair's gap in metres, the nearest wall to the lens, their on-screen
 * separation in pixels, and `children`, one entry per figure that must be
 * readable (the chaser and its quarry), each:
 *   `{ pixels, occluded, confirmed, ndcFeet: [x, y] | null, ndcHead: [x, y] | null }`
 * where `occluded`/`confirmed` count AXIS_SAMPLES. FEET AND HEAD BOTH: a child
 * whose waist is comfortably inside the frame can still stand with its legs cut
 * off by the bottom edge, and a cropped figure is not a readable one.
 *
 * Returns `{ ok, reason }` — `reason` naming the FIRST rule that failed, so a
 * red run says which one and with what number.
 */
export function judgeTagStandpoint(reading) {
  const { clear, behind, gap, nearestWall, children } = reading
  if (!clear) return { ok: false, reason: 'the sight line to the pair is obstructed' }
  if (!Array.isArray(children) || children.length < 2) return { ok: false, reason: 'the chase has no pair to photograph' }
  for (let i = 0; i < children.length; i++) {
    const verdict = judgeChildFigure(children[i], i === 0 ? 'the chaser' : 'the quarry')
    if (!verdict.ok) return verdict
  }
  // Two figures, not one silhouette holding two children.
  const apart = MIN_SEPARATION_FACTOR * ((children[0].pixels + children[1].pixels) / 2)
  if (!(reading.separation >= apart))
    return {
      ok: false,
      reason: `the two overlap: ${Math.round(reading.separation ?? 0)} px apart, ${Math.round(apart)} px needed`,
    }
  if (!(behind >= VILLAGE_BEHIND)) return { ok: false, reason: `only ${behind} buildings stand behind the chase` }
  if (!(gap <= TIGHT_GAP)) return { ok: false, reason: `the pair is ${gap.toFixed(1)} m apart` }
  if (!(nearestWall >= WALL_CLEARANCE)) return { ok: false, reason: `a wall stands ${nearestWall.toFixed(1)} m from the lens` }
  return { ok: true, reason: 'both children read at full height with the village behind them' }
}

/** One line naming what a reading measured — the detail a check prints. */
export function describeReading(reading) {
  const kid = (c) =>
    c && c.ndcFeet ? `${Math.round(c.pixels)}px/${c.occluded}occl/${c.confirmed}hit` : 'off-camera'
  return (
    `chaser ${kid(reading.children?.[0])} quarry ${kid(reading.children?.[1])} ` +
    `apart=${Math.round(reading.separation ?? 0)}px behind=${reading.behind} ` +
    `gap=${Number(reading.gap ?? 0).toFixed(1)}m wall=${Number(reading.nearestWall ?? 0).toFixed(1)}m`
  )
}

// --- The chaser's arms inside the prepare window ------------------------------
// Each window is a series of frames of one chase, read off the drawn hand
// pivots in the chaser's own frame (+z forward). EVERY observed window judges
// the readied hand (ahead, and held: swept by under half the free hand's
// swing) AND its own free hand. A full swing needs most of a stride, so a
// window of `longSpan` must show one; the smallest such swing is the reference
// every readied hand is held to. A shorter window of `measureSpan` must still
// show the free hand moving by `freeMove`: the least the minimum accepted
// swing (`freeSweep`, peak to peak) covers in 0.3 s of a 0.8 s stride centred
// on its turn, 0.06·(1 − cos(π·0.3/0.8)) ≈ 0.037 m. A window shorter still
// cannot show a swing; it is counted as unmeasured, never as evidence.
/** Body-frame metres and seconds; calibratable (the 0.8 s stride is assumed). */
export const PREPARE_ARMS = { readiedAhead: 0.15, freeSweep: 0.12, longSpan: 0.6, measureSpan: 0.3, freeMove: 0.03 }
const handZ = (r, side) => r.chaser.find((h) => h.hand === (side === 'left' ? 'hand-left' : 'hand-right')).local.z
export const armSweep = (series, side) => {
  const z = series.map((r) => handZ(r, side))
  return Math.max(...z) - Math.min(...z)
}
export const armMinZ = (series, side) => Math.min(...series.map((r) => handZ(r, side)))
const fmtArm = (series, side) => `${side} sweep ${armSweep(series, side).toFixed(3)} min z ${armMinZ(series, side).toFixed(3)}`
const otherSide = (side) => (side === 'left' ? 'right' : 'left')

/** The verdict over every prepare window observed, in order: `{ ok, detail }`. */
export function judgePrepareArms(windows) {
  const seen = windows.filter((w) => w && w.length > 0)
  const span = (w) => w.at(-1).clock - w[0].clock
  const freeOf = (w) => armSweep(w, otherSide(w[0].side))
  const longs = seen.filter((w) => span(w) >= PREPARE_ARMS.longSpan)
  if (!longs.length) return { ok: false, detail: `no chasing stride inside the prepare window (${seen.length} short windows)` }
  const long = longs.reduce((a, b) => (freeOf(b) < freeOf(a) ? b : a))
  const side = long[0].side
  const other = otherSide(side)
  const free = freeOf(long)
  const heldIn = (w) => armMinZ(w, w[0].side) > PREPARE_ARMS.readiedAhead && armSweep(w, w[0].side) < 0.5 * free
  const swingsIn = (w) =>
    span(w) >= PREPARE_ARMS.longSpan ? freeOf(w) > PREPARE_ARMS.freeSweep : freeOf(w) >= PREPARE_ARMS.freeMove
  const bad = seen.find((w) => !heldIn(w))
  const still = seen.find((w) => span(w) >= PREPARE_ARMS.measureSpan && !swingsIn(w))
  const unmeasured = seen.filter((w) => span(w) < PREPARE_ARMS.measureSpan).length
  const detail =
    `readied ${fmtArm(long, side)}; free ${fmtArm(long, other)} from ${long[0].gap.toFixed(2)} m; ` +
    `${seen.length} windows judged` +
    (unmeasured ? `, ${unmeasured} too short to measure the free hand` : '') +
    (bad ? `; NOT HELD in a window from ${bad[0].gap.toFixed(2)} m: ${fmtArm(bad, bad[0].side)}` : '') +
    (still
      ? `; FREE HAND STILL in a ${span(still).toFixed(2)} s window from ${still[0].gap.toFixed(2)} m: ` +
        fmtArm(still, otherSide(still[0].side))
      : '')
  return { ok: !bad && !still, detail }
}
