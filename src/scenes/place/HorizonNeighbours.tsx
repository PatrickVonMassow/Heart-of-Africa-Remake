// Neighbours on the first-person horizon (design.md §2.5): every port, village
// or monument site within sight of this place stands on its horizon at its map
// bearing and distance-true apparent size, on the ground the frame draws. The
// rule is ./horizonNeighbours (pure), the look ./horizonNeighbourSilhouettes;
// ./useHorizonNeighbours seats them; this file only draws them.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { balance } from '../../config/balance'
import type { PlaceDef } from '../../world/geo'
import { sampleTerrain } from '../../world/terrain'
import { FieldSphinx } from '../../render/sphinxProbe'
import { BACKDROP_DISC_OVERLAP, panoramaStandY } from './backdrop'
import { neighbourBaseY } from './horizonNeighbours'
import type { PlaceLayout } from './layout'
import { EYE_HEIGHT } from './roofClearance'
import { discEdgeAt, type HorizonNeighbourItem } from './useHorizonNeighbours'

export function HorizonNeighbours({ items, place, seed, layout }: {
  items: readonly HorizonNeighbourItem[]
  place: PlaceDef
  seed: number
  layout: PlaceLayout
}) {
  const centerH = useMemo(() => sampleTerrain(place.lat, place.lon, seed).height, [place, seed])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), [])
  useEffect(() => () => material.dispose(), [material])
  const refs = useRef<Array<THREE.Group | null>>([])
  const baseY = useRef<number[]>([])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    const monument = items.find((it) => it.silhouette.landmarkKind)
    if (monument) w.__placeSkyline = monument.silhouette.landmarkKind
    // The picture check projects each neighbour into the frame (§7.2).
    w.__placeNeighbours = items.map((it, i) => ({
      id: it.sight.point.id,
      kind: it.sight.point.kind,
      bearingDeg: (it.sight.bearing * 180) / Math.PI,
      distanceDeg: it.sight.distanceDeg,
      x: it.seat.x,
      z: it.seat.z,
      get y() {
        return baseY.current[i] ?? 0
      },
      height: it.silhouette.measure.heightM * it.seat.scale,
      footprint: it.seat.footprint,
      depth: it.seat.depth,
      elevationDeg: it.seat.elevationDeg,
      widthDeg: it.seat.widthDeg,
    }))
    return () => {
      if (monument) delete w.__placeSkyline
      delete w.__placeNeighbours
    }
  }, [items])

  useFrame(({ camera }) => {
    const sink = balance.panoramaWildlife.sinkEpsilon
    items.forEach((it, i) => {
      const g = refs.current[i]
      if (!g) return
      // The footing follows the live camera like the wildlife's (point 181):
      // the disc-edge sight line drops as the player walks toward the rim.
      const y = neighbourBaseY(
        it.seat,
        (x, z) => panoramaStandY(x, z, place.lat, place.lon, seed, centerH,
          discEdgeAt(layout, x, z) - BACKDROP_DISC_OVERLAP, camera.position.x, camera.position.z, EYE_HEIGHT),
        sink * it.seat.scale * it.silhouette.metresPerUnit,
      )
      baseY.current[i] = y
      g.position.y = y
    })
  })

  return (
    <>
      {items.map((it, i) => {
        // Place units per geometry unit.
        const s = it.seat.scale * it.silhouette.metresPerUnit
        // Local +z of the outer group is the line of sight, so its scale can
        // flatten the depth alone; the inner group turns the silhouette back
        // to its map orientation (a monument keeps the bird's-eye yaw 0).
        const toSight = Math.PI - it.seat.bearing
        return (
          <group
            key={it.sight.point.id}
            name={`horizon-neighbour-${it.sight.point.id}`}
            ref={(el) => {
              refs.current[i] = el
            }}
            position={[it.seat.x, 0, it.seat.z]}
            rotation={[0, toSight, 0]}
            scale={[s, s, s * it.seat.depth]}
          >
            <group rotation={[0, -toSight, 0]}>
              <mesh geometry={it.silhouette.geometry} material={material} />
              {it.silhouette.landmarkKind === 'giza-pyramids' && (
                <FieldSphinx lod="skyline" material={material} probe="__gizaSkylineSphinx" />
              )}
            </group>
          </group>
        )
      })}
    </>
  )
}
