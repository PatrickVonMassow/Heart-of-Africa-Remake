// A place vignette whose runtime is its drawn figures, in the bug-report dump
// (src/systems/placeDump.ts, placeDumpRead.ts).

import { useRef, type ReactNode } from 'react'
import * as THREE from 'three/webgpu'
import { scanVignette, usePlaceDumpProvider } from './placeDumpRead'

/**
 * Wraps a vignette whose runtime is its drawn figures: every figure and load
 * under it goes into the dump as vignette `id`. The group adds no transform.
 */
export function PlaceDumpGroup({ id, kind, children }: { id: string; kind: string; children: ReactNode }) {
  const root = useRef<THREE.Group>(null)
  usePlaceDumpProvider(id, () => ({
    kind,
    ...(root.current ? scanVignette(root.current, id) : { figures: [], objects: [] }),
  }))
  return (
    <group ref={root} name={`place-dump-${id}`}>
      {children}
    </group>
  )
}
