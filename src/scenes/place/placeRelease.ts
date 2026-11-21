// Leaving a settlement releases what it drew (point 1447).
//
// WHY. In three.js r185 a render object — and with it its pipeline's use count,
// its bindings, its node state and a strong reference to the mesh — is freed
// only when its MATERIAL is disposed (RenderObject listens for the material's
// 'dispose'; a geometry 'dispose' merely clears its cached attributes). R3F
// disposes only JSX-declared objects, so every material handed in through a
// `material=` prop or a `<primitive>` and never disposed — module-level shared
// ones such as the villager body material (render/figureDress.ts) — kept the
// render objects of every mesh it ever drew: ~40 pipelines and the meshes'
// heap per village visited, for the whole session.
//
// WHAT. While the place scene runs, every material and geometry reachable from
// the scene graph is sampled into a set; on leave the whole set is disposed.
// Disposing a shared (cached) material or geometry is safe: three rebuilds the
// GPU side on the next draw that uses it, so a later visit re-compiles and
// re-uploads instead of the first visit's set staying resident for ever.
// Textures are not touched: a material's dispose does not free them, and the
// shared ones have no owner here.

import * as THREE from 'three/webgpu'

/** Frames between two samples of the scene graph (the first rendered frame is
 *  sampled at once). An object that mounts and unmounts between two samples is
 *  missed only if no sampled object shares its material. */
export const PLACE_RELEASE_SAMPLE_FRAMES = 30

export interface ReleaseSet {
  materials: Set<THREE.Material>
  geometries: Set<THREE.BufferGeometry>
}

export function newReleaseSet(): ReleaseSet {
  return { materials: new Set(), geometries: new Set() }
}

type Drawable = THREE.Object3D & {
  material?: THREE.Material | THREE.Material[] | null
  geometry?: THREE.BufferGeometry | null
}

/** Add every material and geometry drawn under `root` to `into`. */
export function collectSceneResources(root: THREE.Object3D, into: ReleaseSet): void {
  root.traverse((o) => {
    const d = o as Drawable
    const m = d.material
    if (Array.isArray(m)) {
      for (const one of m) if (one?.isMaterial) into.materials.add(one)
    } else if (m?.isMaterial) {
      into.materials.add(m)
    }
    if (d.geometry?.isBufferGeometry) into.geometries.add(d.geometry)
  })
}

/** Dispose everything in `set` and empty it. Returns what was disposed. */
export function releaseSceneResources(set: ReleaseSet): { materials: number; geometries: number } {
  const counts = { materials: set.materials.size, geometries: set.geometries.size }
  for (const m of set.materials) m.dispose()
  for (const g of set.geometries) g.dispose()
  set.materials.clear()
  set.geometries.clear()
  return counts
}

/**
 * The scene-side lifecycle as a small state holder, so it is testable without
 * a renderer: `frame()` on every rendered frame, `leave()` on unmount.
 * A leave before any rendered frame releases nothing — React StrictMode's
 * simulated unmount right after the first mount must not dispose the scene it
 * is about to keep.
 */
export class PlaceReleaseTracker {
  private readonly set = newReleaseSet()
  private frames = 0

  private readonly root: () => THREE.Object3D | null
  private readonly every: number

  constructor(root: () => THREE.Object3D | null, every: number = PLACE_RELEASE_SAMPLE_FRAMES) {
    this.root = root
    this.every = every
  }

  frame(): void {
    if (this.frames++ % this.every !== 0) return
    const r = this.root()
    if (r) collectSceneResources(r, this.set)
  }

  leave(): { materials: number; geometries: number } {
    // No traverse here: the unmount commit may already have attached the next
    // scene's objects, which are not this visit's to release.
    if (this.frames === 0) return { materials: 0, geometries: 0 }
    this.frames = 0
    return releaseSceneResources(this.set)
  }
}
