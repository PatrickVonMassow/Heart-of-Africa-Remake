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
