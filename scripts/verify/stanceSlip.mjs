// The point-300 no-skate measurement, as a PURE judgment over a recorded series
// (point 549).
//
// WHAT IT MEASURES. A planted foot holds its WORLD spot while the body walks
// and turns over it. So over an interval in which the tracked leg never leaves
// the ground, the foot's world position must not move. Its travel is reported as
// a fraction of the body's own travel.
//
// WHY IT IS A SERIES AND NOT A PAIR OF READS. Both of the old sampler's halves
// were frame-rate dependent, and that is what made the check unable to give the
// same answer twice on this host (measured 08.08.2026: 0.278, 0.603, 0.727,
// 0.972 and 1.549 for ONE unchanged scene, against a bar of 0.25):
//
//   1. THE WINDOW HAD NO CEILING. It stepped the scene until some animal had
//      covered 5 % of its stride, one `page.evaluate` per frame — but the scene
//      keeps drawing during the round trip, so the interval was however far the
//      animal got between two reads. Under a slow frame the leg lifted, swung
//      and was PLANTED AGAIN a whole cycle on, and the sampler — which only
//      asked whether the leg was down at each END — read that replanting as one
//      enormous slip. The 0.4-stride guard was a proxy for the wrap, and a
//      leaky one: a stance carries the body half a stride, so an interval
//      starting mid-stance wraps well before it.
//      FIX: the series is recorded frame by frame INSIDE the page, and an
//      interval counts only if the leg was down in EVERY frame of it. Then a
//      wrap is not filtered out — it cannot occur.
//
// The old judgment compensated for yaw because the rigid, X-pivot-only leg
// necessarily followed a turning body. The renderer now plants the contact in
// world space and re-aims the leg to it, so retaining that compensation would
// manufacture travel for a foot whose world coordinates are identical. Direct
// world travel is both the named criterion and the falsifiable render result.
//
// NO BAR MOVES. The criterion stays "worst foot travel under 0.25 of the body's"
// over at least 3 intervals, and a series that measured nothing still fails.

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a))

const usable = (p) => !!p && p.stance === true && !!p.foot && typeof p.foot.x === 'number' && p.stride > 0

/**
 * Judge a recorded per-frame series.
 *
 * @param samples  frames in order; each is `{ [id]: { x, z, yaw, stride, stance, foot } }`
 * @param floor    an interval must carry the body this far, in strides — above any
 *                 measurement floor, far below the half-stride a stance lasts
 * @param cap      an interval carrying the body FURTHER than this in one frame step
 *                 is dropped: the run drew too coarsely to resolve a stance at all
 * @param minIntervals how many intervals a verdict needs to mean anything
 */
export function judgeStanceSlip(samples, { floor = 0.05, cap = 0.4, minIntervals = 3 } = {}) {
  const ids = new Set()
  for (const s of samples ?? []) for (const id of Object.keys(s ?? {})) ids.add(id)

  const slips = []
  let turnMax = 0
  let coarse = 0
  let longestRun = 0

  for (const id of ids) {
    // Maximal runs of consecutive frames in which THIS leg never left the ground.
    let start = null
    for (let k = 0; k <= samples.length; k++) {
      const ok = k < samples.length && usable(samples[k]?.[id])
      if (ok && start === null) start = k
      if (ok) continue
      if (start === null) continue
      const from = start
      const to = k - 1
      start = null
      if (to - from < 1) continue
      longestRun = Math.max(longestRun, to - from + 1)
      let i = from
      while (i < to) {
        const p0 = samples[i][id]
        let j = i + 1
        let body = 0
        while (j <= to) {
          body = Math.hypot(samples[j][id].x - p0.x, samples[j][id].z - p0.z)
          if (body >= floor * p0.stride) break
          j++
        }
        if (j > to) break // the leg lifted before the body had moved far enough
        if (body > cap * p0.stride) {
          // One frame already carried it further than a stance can: this run is
          // too coarse to resolve. Counted and reported, never silently dropped.
          coarse++
          i = j
          continue
        }
        const p1 = samples[j][id]
        const y0 = p0.yaw ?? 0
        const y1 = p1.yaw ?? 0
        const turn = wrapAngle(y1 - y0)
        const foot = Math.hypot(p1.foot.x - p0.foot.x, p1.foot.z - p0.foot.z)
        slips.push({ id, slip: foot / body, turn: Math.abs(turn), frames: j - i })
        turnMax = Math.max(turnMax, Math.abs(turn))
        i = j
      }
    }
  }

  const worst = slips.length ? Math.max(...slips.map((s) => s.slip)) : null
  return {
    intervals: slips.length,
    enough: slips.length >= minIntervals,
    worst,
    turnMax,
    coarse,
    longestRun,
    slips,
    detail: slips.length
      ? `${slips.length} stance intervals, worst foot/body travel ${worst.toFixed(3)}, turn up to ${turnMax.toFixed(3)} rad, longest unbroken stance ${longestRun} frames${coarse ? `, ${coarse} interval(s) dropped as too coarse to resolve` : ''}`
      : `MEASURED NOTHING — 0 usable stance intervals (needs ${minIntervals}): longest unbroken stance ${longestRun} frames over ${samples?.length ?? 0} recorded frames${coarse ? `, ${coarse} dropped as too coarse` : ''}`,
  }
}
