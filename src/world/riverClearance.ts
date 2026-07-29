// Shifting a site off the rendered river band (design.md §4.2/§4.4). A field
// or footprint that reaches into the water band would render structures out of
// a channel, so an anchor is nudged along the distance gradient until its whole
// footprint clears the (calibratable) band. Deterministic (pure river geometry)
// and bounded; an anchor already clear returns unchanged after one query.
//
// Its own dependency-free module because three callers need it and the import
// chain forbids sharing it through any of them: data/landmarks.ts → terrain.ts
// → geo.ts is an init-time chain, so geo.ts cannot import from landmarks.ts.

import { riverDistanceExact } from './hydro'

export function clearedOfRiversBy(
  lat: number,
  lon: number,
  clearanceDeg: number,
): { lat: number; lon: number } {
  let a = lat
  let o = lon
  for (let i = 0; i < 40; i++) {
    const d = riverDistanceExact(a, o, 1)
    if (d >= clearanceDeg) break
    const e = 0.02
    const gLat = riverDistanceExact(a + e, o, 1) - riverDistanceExact(a - e, o, 1)
    const gLon = riverDistanceExact(a, o + e, 1) - riverDistanceExact(a, o - e, 1)
    const gl = Math.hypot(gLat, gLon)
    if (gl < 1e-6) {
      o += e // dead centre of a channel: fixed eastward nudge, re-aim
      continue
    }
    const step = Math.min(0.08, clearanceDeg - d + 0.01)
    a += (gLat / gl) * step
    o += (gLon / gl) * step
  }
  return { lat: a, lon: o }
}
