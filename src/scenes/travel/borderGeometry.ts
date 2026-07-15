// Region-border ribbon geometry (design.md §3.1): the boundaries of the five
// regions as dashed ground markings draped over the terrain, land only. Kept in
// its own module (three-free of React) so the pure test and the RegionBorders
// component share the builder and the ink tone.

import * as THREE from 'three/webgpu'
import { REGION_BORDERS, latLonToWorld, worldToLatLon } from '../../world/geo'
import { sampleTerrain } from '../../world/terrain'

const STEP_DEG = 0.1 // sampling step along a border line (1 world unit)
const DASH_ON = 4 // samples drawn per dash
const DASH_PERIOD = 7 // samples per dash + gap cycle
const HALF_WIDTH = 0.28 // ribbon half width in world units
export const BORDER_LIFT = 0.22 // height above the terrain; hides LOD deviation of far chunks
/** Warm sepia ink of the dashed ground marking (design.md §3.1). A mid-tone,
 *  never near-black — the old dark ink turned into a flat black slab through
 *  the screen-space AO near rivers (point 101). */
export const BORDER_INK = '#9c7c4c'

export function buildBorderGeometry(seed: number): THREE.BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []

  for (const line of REGION_BORDERS) {
    let dash = 0
    for (let s = 0; s < line.length - 1; s++) {
      const [lon0, lat0] = line[s]
      const [lon1, lat1] = line[s + 1]
      const steps = Math.max(1, Math.round(Math.hypot(lon1 - lon0, lat1 - lat0) / STEP_DEG))
      for (let i = 0; i < steps; i++, dash++) {
        if (dash % DASH_PERIOD >= DASH_ON) continue
        const ta = i / steps
        const tb = (i + 1) / steps
        const aLat = lat0 + (lat1 - lat0) * ta
        const aLon = lon0 + (lon1 - lon0) * ta
        const bLat = lat0 + (lat1 - lat0) * tb
        const bLon = lon0 + (lon1 - lon0) * tb
        const a = latLonToWorld(aLat, aLon)
        const b = latLonToWorld(bLat, bLon)
        // Perpendicular in the ground plane.
        let px = -(b.z - a.z)
        let pz = b.x - a.x
        const inv = HALF_WIDTH / (Math.hypot(px, pz) || 1)
        px *= inv
        pz *= inv
        // Sample EACH corner's own terrain height so the ribbon lies flush on
        // the ground. Using only the two centreline heights let an offset
        // corner float above a lower riverbank; the screen-space AO then read
        // that floating gap as full occlusion and blackened the ribbon into a
        // "black bar near the river" (point 101). Flush corners remove the gap.
        const corners: Array<[number, number]> = [
          [a.x - px, a.z - pz],
          [a.x + px, a.z + pz],
          [b.x - px, b.z - pz],
          [b.x + px, b.z + pz],
        ]
        const ch = corners.map(([cx, cz]) => {
          const ll = worldToLatLon(cx, cz)
          return sampleTerrain(ll.lat, ll.lon, seed).height
        })
        if (ch.some((h) => h <= 0.05)) continue // whole ribbon on land, off water
        const vi = positions.length / 3
        positions.push(
          corners[0][0], ch[0] + BORDER_LIFT, corners[0][1],
          corners[1][0], ch[1] + BORDER_LIFT, corners[1][1],
          corners[2][0], ch[2] + BORDER_LIFT, corners[2][1],
          corners[3][0], ch[3] + BORDER_LIFT, corners[3][1],
        )
        indices.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3)
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geo.setIndex(indices)
  return geo
}
