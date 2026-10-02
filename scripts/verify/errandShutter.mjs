// The fill shot's line test, pure so the fast layer can pin it
// (scripts/verify/errandShutter.test.mjs) and the suite can ask it twice: once
// to choose a bearing, and again AT THE SHUTTER against fresh positions, since
// the neighbours keep walking their errands in between.

/** The cone around the view axis a neighbour may not stand in, in radians, and
 *  the span in front of the lens it is judged over, in metres. */
export const LINE_CONE = 0.3
const LINE_NEAR = 0.3
const LINE_FAR = 9

/**
 * The neighbour that overlaps `subject` in a picture taken `dist` m off him on
 * `bearing`, or null for a clear line. Angular, measured from the lens: within
 * LINE_CONE of the view axis between LINE_NEAR and LINE_FAR m in front of it.
 * The worst offender wins, with `margin` the radians it stands inside the cone.
 * @param {{ x: number, z: number }} subject
 * @param {number} bearing
 * @param {{ who: number, x: number, z: number }[]} others
 */
export function lineOverlap(subject, bearing, others, dist = 3) {
  const cx = subject.x + Math.sin(bearing) * dist
  const cz = subject.z + Math.cos(bearing) * dist
  const dx = (subject.x - cx) / dist
  const dz = (subject.z - cz) / dist
  let worst = null
  for (const o of others) {
    const along = (o.x - cx) * dx + (o.z - cz) * dz
    if (along <= LINE_NEAR || along > LINE_FAR) continue
    const angle = Math.atan2(Math.hypot(o.x - (cx + dx * along), o.z - (cz + dz * along)), along)
    if (angle < LINE_CONE && (!worst || angle < worst.angle)) {
      worst = { who: o.who, angle, along, margin: LINE_CONE - angle }
    }
  }
  return worst
}

/** One line naming the neighbour that spoiled the line and by how much. */
export function describeOverlap(o) {
  return `villager ${o.who} ${o.angle.toFixed(2)} rad off the view axis at ${o.along.toFixed(1)} m, ` +
    `${o.margin.toFixed(2)} rad inside the ${LINE_CONE.toFixed(2)} rad cone`
}
