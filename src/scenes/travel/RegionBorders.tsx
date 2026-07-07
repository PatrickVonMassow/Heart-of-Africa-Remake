// Region borders in the bird's-eye view (design.md §3): the boundaries of the
// five regions rendered as dashed ribbons draped over the terrain, land only.

import { useEffect, useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { useGame } from '../../state/store'
import { REGION_BORDERS, latLonToWorld } from '../../world/geo'
import { sampleTerrain } from '../../world/terrain'

const STEP_DEG = 0.1 // sampling step along a border line (1 world unit)
const DASH_ON = 4 // samples drawn per dash
const DASH_PERIOD = 7 // samples per dash + gap cycle
const HALF_WIDTH = 0.28 // ribbon half width in world units
const LIFT = 0.22 // height above the terrain; hides LOD deviation of far chunks

function buildBorderGeometry(seed: number): THREE.BufferGeometry {
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
        const ha = sampleTerrain(aLat, aLon, seed).height
        const hb = sampleTerrain(bLat, bLon, seed).height
        if (ha <= 0.05 || hb <= 0.05) continue // land only
        const a = latLonToWorld(aLat, aLon)
        const b = latLonToWorld(bLat, bLon)
        // Perpendicular in the ground plane.
        let px = -(b.z - a.z)
        let pz = b.x - a.x
        const inv = HALF_WIDTH / (Math.hypot(px, pz) || 1)
        px *= inv
        pz *= inv
        const vi = positions.length / 3
        positions.push(
          a.x - px, ha + LIFT, a.z - pz,
          a.x + px, ha + LIFT, a.z + pz,
          b.x - px, hb + LIFT, b.z - pz,
          b.x + px, hb + LIFT, b.z + pz,
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

export function RegionBorders() {
  const seed = useGame((s) => s.seed)
  const geometry = useMemo(() => buildBorderGeometry(seed), [seed])
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#33261a',
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide, // ribbon winding varies with border direction
      }),
    [],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  return <mesh geometry={geometry} material={material} renderOrder={1} />
}
