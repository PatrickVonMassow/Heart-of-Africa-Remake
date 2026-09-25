/** Ordered river stations, source-to-mouth in the source data. Navigation uses
 * coordinates; the named route frames are still owed as evidence of the clue. */
export function riverBankRoute(axis, from, to, offset = 0.2) {
  if (axis.length < 2) throw new Error('River axis needs two stations')
  const nearest = (p) => axis.reduce((best, q, i) =>
    Math.hypot(p.lat - q.lat, p.lon - q.lon) < Math.hypot(p.lat - axis[best].lat, p.lon - axis[best].lon) ? i : best, 0)
  const a = nearest(from), b = nearest(to), step = b >= a ? 1 : -1
  const tangent = (i) => {
    const lo = axis[Math.max(0, i - 1)], hi = axis[Math.min(axis.length - 1, i + 1)]
    const dLat = hi.lat - lo.lat, dLon = hi.lon - lo.lon, d = Math.hypot(dLat, dLon)
    if (!d) throw new Error('Degenerate river axis')
    return { lat: -dLon / d, lon: dLat / d }
  }
  const n = tangent(a)
  const side = (from.lat - axis[a].lat) * n.lat + (from.lon - axis[a].lon) * n.lon < 0 ? -1 : 1
  const points = []
  for (let i = a; ; i += step) {
    const n = tangent(i)
    points.push({ lat: axis[i].lat + n.lat * offset * side, lon: axis[i].lon + n.lon * offset * side })
    if (i === b) break
  }
  return points
}

/** Shutter stations are reached by travelled distance, never by elapsed time.
 * Keep each frame separated in world space as well, so circling cannot produce
 * three supposed river-leg views of one spot. */
export function routeFrameProgress(state, position) {
  if (state.previous) state.distance += Math.hypot(position.x - state.previous.x, position.z - state.previous.z)
  state.previous = { ...position }
  if (state.frames >= 3 || state.distance < state.next) return false
  if (state.lastFrame && Math.hypot(position.x - state.lastFrame.x, position.z - state.lastFrame.z) < state.spacing) return false
  state.frames++
  state.lastFrame = { ...position }
  state.next = state.distance + state.spacing
  return true
}


/** A retry needs a changed obstruction, not merely more wall-clock time. */
export function positionsMoved(before, after, minimum = 0.3) {
  return before.length !== after.length || before.some((p, i) => Math.hypot(p.x - after[i].x, p.z - after[i].z) >= minimum)
}

/** Read-only village crowd near a blocked walk, shared by snapshot and wait. */
export function nearbyTeachingCrowd(at) {
  const crowd = [...(window.__placeErrands?.().villagers ?? []), ...(window.__placeTag?.().children ?? [])]
  if (window.__chief) crowd.push(window.__chief)
  return crowd.filter((p) => Math.hypot(p.x - at.x, p.z - at.z) < 5).map(({ x, z }) => ({ x, z }))
}
