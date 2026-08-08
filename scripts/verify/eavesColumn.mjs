// The point-349 head-clearance verdict, as a PURE judgment over a recorded
// series of frames (point 549).
//
// WHAT IT DECIDES. Standing at a building's eaves, two things must hold: the
// first surface UNDER the eye is the ground he stands on (the near plane has not
// got inside the roof), and whatever hangs OVER him clears his head. Both are
// properties of the BUILDING FABRIC, which does not move.
//
// WHY A SERIES AND NOT ONE FRAME. `cairo trade house: nothing hangs under the
// eye at the eaves` failed runs 1 and 4 of four consecutive WebGL 2 runs and
// passed runs 2 and 3, from standpoints identical to within seven centimetres.
// The downward probe answered either `1.51 m down to ground-disc` or `0.26 m
// down to BoxGeometry`. Measured at the standpoint's own coordinates
// ({x -16.23, z -0.90}) over 2842 consecutive frames: 2655 read the ground at
// 1.50 m, 115 read a box 0.26 m under the eye and 72 read a cone. The box is the
// CRATE A PORTER CARRIES (`Porters` in src/scenes/place/PlaceLife.tsx — a
// 0.45 × 0.35 × 0.35 box at local y 1.05, world top ~1.27 m) and the cone is the
// porter's own robe; the porters ping-pong across the plaza and one of their
// routes runs through the standpoint. So the check was not reading the eaves at
// all in those frames — it was reading a passer-by, and whether a porter
// happened to be in the column when the single probe fired decided the verdict.
//
// THE RULE. A frame SATISFIES the criterion when its own reading does; the
// criterion is judged on whether ANY frame of the window satisfies it. That is
// not a bar being lowered — it is the same bar, read off the standing scene:
// the player stands still, so static geometry gives an IDENTICAL reading in
// every frame, and the only thing that varies is traffic. Traffic can only ever
// put a surface BETWEEN the eye and what the building draws, i.e. it can only
// shorten a drop or lower a roof — never lengthen or raise one. So it can only
// turn a satisfying reading into an unsatisfying one, never the reverse, and
// "some frame was clear" is exactly "the standing scene is clear".
//
// WHAT IT REPORTS. The standing reading BY NAME and BY HEIGHT, plus every
// surface that merely crossed the column, with how many frames it held it. A
// rotation is then diagnosable from the log alone: a red naming a roof is the
// product defect the check exists to catch, a red naming a body that held the
// column for the whole window says so in as many words.

/** Does one recorded frame satisfy "nothing hangs under the eye"? */
const belowOk = (f, slack) =>
  f.below !== 'hut-roof' && typeof f.drop === 'number' && f.drop >= f.camY - slack

/** Does one recorded frame satisfy "the roof over him clears the head"? */
const roofOk = (f, headroom) => f.roofY == null || f.roofY >= headroom

/** `1.50 m down to ground-disc` / `nothing down to nothing`. */
const sayBelow = (f) =>
  `${typeof f.drop === 'number' ? f.drop.toFixed(2) + ' m' : 'nothing'} down to ${f.below ?? 'nothing'}`

/** Group the frames that did NOT satisfy a half by the surface they named, so a
 *  crossing body is reported once with its span rather than once per frame. */
const crossings = (frames, ok, name, depth) => {
  const by = new Map()
  for (const f of frames) {
    if (ok(f)) continue
    const key = name(f) ?? 'nothing'
    const d = depth(f)
    const e = by.get(key) ?? { n: 0, min: Infinity, max: -Infinity }
    e.n++
    if (typeof d === 'number') {
      e.min = Math.min(e.min, d)
      e.max = Math.max(e.max, d)
    }
    by.set(key, e)
  }
  return [...by.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([k, v]) => ({
      name: k,
      frames: v.n,
      min: Number.isFinite(v.min) ? v.min : null,
      max: Number.isFinite(v.max) ? v.max : null,
    }))
}

const spanOf = (c) =>
  c.min == null
    ? ''
    : c.min.toFixed(2) === c.max.toFixed(2)
      ? ` at ${c.min.toFixed(2)} m`
      : ` at ${c.min.toFixed(2)}–${c.max.toFixed(2)} m`

/**
 * Judge a recorded column series.
 *
 * @param frames   in order; each `{ camY, drop, below, roofY, roofName }`, as
 *                 `probeOverhead` reads them — `drop`/`roofY` null when the ray
 *                 found nothing, `below`/`roofName` the surface it did find
 * @param slack    how far under the eye the first surface may sit before it
 *                 counts as hanging there (the unchanged 0.5 m of point 349)
 * @param headroom the roof clearance a hanging surface must keep (ROOF_HEADROOM)
 */
export function judgeEavesColumn(frames, { slack = 0.5, headroom = 1.85 } = {}) {
  const list = (frames ?? []).filter((f) => f && typeof f.camY === 'number')
  if (!list.length) {
    return {
      frames: 0,
      measured: false,
      belowClear: false,
      roofClears: false,
      belowDetail: 'MEASURED NOTHING — no frame recorded under the eye',
      roofDetail: 'MEASURED NOTHING — no frame recorded over the eye',
      belowCrossings: [],
      roofCrossings: [],
      spread: 'no frames',
    }
  }

  const standingBelow = list.find((f) => belowOk(f, slack)) ?? null
  const standingRoof = list.find((f) => roofOk(f, headroom)) ?? null
  const belowCrossings = crossings(
    list,
    (f) => belowOk(f, slack),
    (f) => f.below,
    (f) => (typeof f.drop === 'number' ? f.drop : null),
  )
  const roofCrossings = crossings(
    list,
    (f) => roofOk(f, headroom),
    (f) => f.roofName,
    (f) => (typeof f.roofY === 'number' ? f.roofY : null),
  )
  const camY = list[0].camY
  const at = `from an eye at ${camY.toFixed(2)} m over ${list.length} frames`
  const alsoBelow = belowCrossings.length
    ? `; crossed by [${belowCrossings.map((c) => `${c.name}×${c.frames}${spanOf(c)}`).join(', ')}]`
    : ''
  const alsoRoof = roofCrossings.length
    ? `; crossed by [${roofCrossings.map((c) => `${c.name}×${c.frames}${spanOf(c)}`).join(', ')}]`
    : ''

  // The drop the STANDING scene gives is the farthest one recorded: traffic can
  // only put something nearer. Reported even when the criterion fails, because
  // it is the number a reader needs to tell a roof from a passer-by.
  const drops = list.map((f) => f.drop).filter((d) => typeof d === 'number')
  const farthest = drops.length ? Math.max(...drops) : null

  return {
    frames: list.length,
    measured: true,
    camY,
    belowClear: !!standingBelow,
    roofClears: !!standingRoof,
    farthestDrop: farthest,
    belowCrossings,
    roofCrossings,
    belowDetail: standingBelow
      ? `${sayBelow(standingBelow)} ${at}${alsoBelow}`
      : `NOTHING CLEAR in any frame — nearest standing reading ${sayBelow(list[0])} ${at}${alsoBelow}`,
    roofDetail: standingRoof
      ? `${standingRoof.roofY == null ? 'open sky' : standingRoof.roofY.toFixed(2) + ' m of ' + standingRoof.roofName} ${at}${alsoRoof}`
      : `NOTHING CLEAR in any frame — ${list[0].roofY == null ? 'open sky' : list[0].roofY.toFixed(2) + ' m of ' + list[0].roofName} ${at}${alsoRoof}`,
    spread:
      farthest == null
        ? `${list.length} frames, no surface found below`
        : `${list.length} frames, standing drop ${farthest.toFixed(2)} m${
            belowCrossings.length ? `, ${belowCrossings.reduce((n, c) => n + c.frames, 0)} crossed` : ', none crossed'
          }`,
  }
}

/**
 * The cook-shelter half asks the opposite question: a roof one may stand under
 * must BE a surface from below. Traffic can only intercept that reading, so the
 * same "some frame satisfied it" rule applies.
 */
export function judgeShelterRoof(frames, { headroom = 1.85, surface = 'hut-roof' } = {}) {
  const list = (frames ?? []).filter((f) => f && typeof f.camY === 'number')
  if (!list.length) return { frames: 0, ok: false, detail: 'MEASURED NOTHING — no frame recorded over the fire' }
  const ok = (f) => f.roofName === surface && typeof f.roofY === 'number' && f.roofY >= headroom
  const good = list.find(ok)
  const other = crossings(
    list,
    ok,
    (f) => f.roofName,
    (f) => (typeof f.roofY === 'number' ? f.roofY : null),
  )
  const also = other.length ? `; also read [${other.map((c) => `${c.name}×${c.frames}${spanOf(c)}`).join(', ')}]` : ''
  return {
    frames: list.length,
    ok: !!good,
    detail: good
      ? `${good.roofY.toFixed(2)} m of ${good.roofName} over the fire in ${list.length - other.reduce((n, c) => n + c.frames, 0)} of ${list.length} frames${also}`
      : `no ${surface} at ${headroom} m in any of ${list.length} frames${also}`,
  }
}
