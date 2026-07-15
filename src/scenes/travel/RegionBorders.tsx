// Region borders in the bird's-eye view (design.md §3): the boundaries of the
// five regions rendered as dashed ribbons draped over the terrain, land only,
// with the region's name shown on its side of the line.

import { useEffect, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three/webgpu'
import { useGame } from '../../state/store'
import { latLonToWorld, regionBorderLabelAnchors } from '../../world/geo'
import { sampleTerrain } from '../../world/terrain'
import { useStrings } from '../../i18n'
import { buildBorderGeometry, BORDER_INK } from './borderGeometry'

// Module singletons (point 96): material and geometry are reused across
// travel remounts — the material keeps its program in the renderer cache, the
// seed-keyed geometry skips the border sweep's terrain sampling on re-entry
// (a fresh run disposes and rebuilds).
let borderMaterialCache: THREE.MeshStandardNodeMaterial | null = null
let borderGeometryCache: { seed: number; geometry: THREE.BufferGeometry } | null = null
function getBorderGeometry(seed: number): THREE.BufferGeometry {
  if (borderGeometryCache && borderGeometryCache.seed === seed) return borderGeometryCache.geometry
  borderGeometryCache?.geometry.dispose()
  borderGeometryCache = { seed, geometry: buildBorderGeometry(seed) }
  return borderGeometryCache.geometry
}

const LABEL_SPACING_DEG = 4
const LABEL_OFFSET_DEG = 0.9
const LABEL_VIEW_RADIUS = 55 // world units around the player

interface BorderLabel {
  x: number
  y: number
  z: number
  region: 'north' | 'west' | 'central' | 'east' | 'south'
  key: string
}

/** Region names on both sides of the borders, only near the player. */
function BorderLabels({ seed }: { seed: number }) {
  const t = useStrings()
  const anchors = useMemo<BorderLabel[]>(
    () =>
      regionBorderLabelAnchors(LABEL_SPACING_DEG, LABEL_OFFSET_DEG)
        .map((a, i) => {
          const s = sampleTerrain(a.lat, a.lon, seed)
          if (s.height <= 0.05) return null // land only, like the border ribbons
          const w = latLonToWorld(a.lat, a.lon)
          return { x: w.x, y: s.height + 1.2, z: w.z, region: a.region, key: `${i}` }
        })
        .filter((a): a is BorderLabel => a !== null),
    [seed],
  )
  const [visible, setVisible] = useState<BorderLabel[]>([])
  useFrame(() => {
    const pos = useGame.getState().pos
    const near = anchors.filter((a) => Math.hypot(a.x - pos.x, a.z - pos.z) < LABEL_VIEW_RADIUS)
    if (near.length !== visible.length || near.some((a, i) => a.key !== visible[i]?.key)) {
      setVisible(near)
    }
  })
  return (
    <>
      {visible.map((a) => (
        <Html key={a.key} center position={[a.x, a.y, a.z]} distanceFactor={30} zIndexRange={[3, 0]}>
          <div className="region-label">{t.regions[a.region]}</div>
        </Html>
      ))}
    </>
  )
}

export function RegionBorders() {
  const seed = useGame((s) => s.seed)
  const geometry = useMemo(() => getBorderGeometry(seed), [seed])
  const material = useMemo(() => {
    if (borderMaterialCache) return borderMaterialCache
    // A STANDARD node material like the terrain itself — opaque, and it writes
    // both depth AND a ground-facing normal into the MRT scene pass. The old
    // transparent basic material wrote no valid normal, so the screen-space AO
    // read full occlusion on the ribbon pixels and multiplied them to flat
    // BLACK — the "black bars near rivers" (point 101). With a real surface
    // normal the AO treats the dashed marking (design.md §3.1) exactly like the
    // ground beneath it, keeping it a subtle warm sepia line lit with the land.
    const m = new THREE.MeshStandardNodeMaterial()
    m.color = new THREE.Color(BORDER_INK)
    m.roughness = 0.95
    m.metalness = 0
    m.side = THREE.DoubleSide // ribbon winding varies with border direction
    borderMaterialCache = m
    return m
  }, [])

  // Dev hook for the headless verification (CLAUDE.md §7.2, point 101): report
  // the ink tone and material type, and project a near-player border vertex to
  // screen pixels so the suite can sample the ribbon exactly where it renders.
  const { camera, gl } = useThree()
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__regionBorder = {
      ink: BORDER_INK,
      matType: material.type,
      opaque: material.transparent === false,
      screenProbe: () => {
        const pos = useGame.getState().pos
        const p = geometry.attributes.position
        let best = -1
        let bd = Infinity
        for (let i = 0; i < p.count; i++) {
          const dx = p.getX(i) - pos.x
          const dz = p.getZ(i) - pos.z
          const d = dx * dx + dz * dz
          if (d < bd) {
            bd = d
            best = i
          }
        }
        if (best < 0) return null
        const v = new THREE.Vector3(p.getX(best), p.getY(best), p.getZ(best)).project(camera)
        const el = gl.domElement as HTMLCanvasElement
        return { sx: (v.x * 0.5 + 0.5) * el.clientWidth, sy: (-v.y * 0.5 + 0.5) * el.clientHeight, dist: Math.sqrt(bd) }
      },
    }
    return () => {
      delete w.__regionBorder
    }
  }, [camera, gl, geometry, material])

  return (
    <>
      <mesh geometry={geometry} material={material} renderOrder={1} dispose={null} />
      <BorderLabels seed={seed} />
    </>
  )
}
