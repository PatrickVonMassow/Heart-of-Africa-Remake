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
// Textures: a material's dispose does not free them, so the textures those
// materials bind — as map properties or as TSL texture nodes — are disposed
// too and re-upload from their source on the next draw. Render-target and depth
// textures (shadow maps, the panorama capture), GPU-written storage and
// framebuffer textures, and ImageBitmap sources (which a loader may already
// have closed) are left alone. A material or geometry the next scene shares is
// disposed too and rebuilt on its next draw: a recompile, no state loss — the
// uniforms and node graph live on the CPU object.
//
// RENDER LISTS. three keeps one render list per (scene, camera) and keeps the
// items of its LAST render until that pair renders again. A settlement's
// lights stay reachable after it is left (three's node-builder caches hold
// their shadow nodes), so the lists of their shadow cameras — never rendered
// again — pinned every figure the last shadow pass drew, and with each figure
// its rig and geometry: measured, ~23 skinned figures and ~50-100 MB of heap
// per village hop (heap-snapshot retainer path Scene -> render-list WeakMap ->
// [shadow camera] -> RenderList.opaque -> item.object -> SkinnedMesh). Leaving
// the place drops every list; the next frame rebuilds the ones still drawn.
//
// BIND GROUPS. three r185 records, per sampled texture, every bind group that
// samples it (Textures data `bindGroups`, used to invalidate them when the
// texture is destroyed) and never removes a bind group when it is destroyed
// (Bindings._destroyBindings). A texture that lives for the session — the PBR
// DFG lookup, the environment, the post chain's targets — so kept every
// figure's bind group ever drawn, and through its texture nodes the figure's
// morph DataArrayTexture with its CPU data (~2 MB each): measured, live
// morph textures 15 -> 31 -> 49 over three hops while the GPU held 14-18.
// Leaving the place prunes, from every texture the renderer still holds, the
// bind groups the renderer has already destroyed.

import * as THREE from 'three/webgpu'

/** Frames between two samples of the scene graph (the first rendered frame is
 *  sampled at once) where the tracker cannot record the renderer's draws: an
 *  object that mounts and unmounts between two samples is then missed. */
export const PLACE_RELEASE_SAMPLE_FRAMES = 30

export interface ReleaseSet {
  materials: Set<THREE.Material>
  geometries: Set<THREE.BufferGeometry>
  textures: Set<THREE.Texture>
}

export interface ReleaseCounts {
  materials: number
  geometries: number
  textures: number
}

export function newReleaseSet(): ReleaseSet {
  return { materials: new Set(), geometries: new Set(), textures: new Set() }
}

type TextureLike = THREE.Texture & {
  isRenderTargetTexture?: boolean
  isDepthTexture?: boolean
  isStorageTexture?: boolean
  isFramebufferTexture?: boolean
}

/** A texture this sweep may dispose: it re-uploads from data it still holds.
 *  GPU-written ones (storage, framebuffer copies) hold none and are kept. */
export function releasableTexture(t: unknown): t is THREE.Texture {
  const tex = t as TextureLike | null
  if (!tex?.isTexture || tex.isRenderTargetTexture || tex.isDepthTexture) return false
  if (tex.isStorageTexture || tex.isFramebufferTexture) return false
  const image = tex.image as unknown
  return !(typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)
}

type NodeLike = { isNode?: boolean; isTextureNode?: boolean; value?: unknown; traverse?: (cb: (n: NodeLike) => void) => void }

/** The textures a material binds: texture properties and TSL texture nodes. */
function collectMaterialTextures(m: THREE.Material, into: Set<THREE.Texture>): void {
  for (const v of Object.values(m) as unknown[]) {
    if (releasableTexture(v)) into.add(v)
    const node = v as NodeLike | null
    if (node?.isNode && typeof node.traverse === 'function') {
      node.traverse((n) => {
        if (n.isTextureNode && releasableTexture(n.value)) into.add(n.value)
      })
    }
  }
}

type Drawable = THREE.Object3D & {
  material?: THREE.Material | THREE.Material[] | null
  geometry?: THREE.BufferGeometry | null
}

function addMaterial(m: THREE.Material, into: ReleaseSet): void {
  if (into.materials.has(m)) return
  into.materials.add(m)
  collectMaterialTextures(m, into.textures)
}

function addDrawable(d: Drawable, into: ReleaseSet): void {
  const m = d.material
  if (Array.isArray(m)) {
    for (const one of m) if (one?.isMaterial) addMaterial(one, into)
  } else if (m?.isMaterial) {
    addMaterial(m, into)
  }
  if (d.geometry?.isBufferGeometry) into.geometries.add(d.geometry)
}

/** Add every material, geometry and bound texture drawn under `root` to `into`. */
export function collectSceneResources(root: THREE.Object3D, into: ReleaseSet): void {
  root.traverse((o) => addDrawable(o as Drawable, into))
}

type RenderObjectsLike = { get?: (...args: unknown[]) => unknown }
type GeometryDataLike = { delete?: (o: object) => unknown }

/** Dispose everything in `set` and empty it. Returns what was disposed.
 *  `geometryData` is the renderer's geometry DataMap (`_geometries`, three
 *  internals): r185's geometry dispose frees the GPU buffers but leaves the
 *  geometry marked initialized, so its next draw adds no dispose listener and
 *  a second leave would free nothing — dropping the entry re-arms it. */
export function releaseSceneResources(set: ReleaseSet, geometryData?: GeometryDataLike | null): ReleaseCounts {
  const counts = { materials: set.materials.size, geometries: set.geometries.size, textures: set.textures.size }
  for (const m of set.materials) m.dispose()
  for (const g of set.geometries) {
    g.dispose()
    if (typeof geometryData?.delete === 'function') geometryData.delete(g)
  }
  for (const t of set.textures) t.dispose()
  set.materials.clear()
  set.geometries.clear()
  set.textures.clear()
  return counts
}

/**
 * The scene-side lifecycle as a small state holder, so it is testable without
 * a renderer: `attach(renderer)` on mount, `frame()` on every rendered frame,
 * `leave()` on unmount.
 * Attached, it records every object the renderer requests a render object for
 * in this scene — three's RenderObjects.get(object, material, scene, ...), the
 * one call every draw (shadow passes included) makes — so a mesh drawn and
 * removed between two samples is released too, at a Set lookup per draw. Where
 * that internal is missing it falls back to sampling the scene graph.
 * A leave before any rendered frame releases nothing — React StrictMode's
 * simulated unmount right after the first mount must not dispose the scene it
 * is about to keep.
 */
export class PlaceReleaseTracker {
  private readonly set = newReleaseSet()
  private frames = 0
  private attached = false
  private geometryData: GeometryDataLike | null = null

  private readonly root: () => THREE.Object3D | null
  private readonly every: number

  constructor(root: () => THREE.Object3D | null, every: number = PLACE_RELEASE_SAMPLE_FRAMES) {
    this.root = root
    this.every = every
  }

  /** Record this scene's draws on `renderer` (three internals, read
   *  defensively). Returns the detach, which restores the renderer. */
  attach(renderer: unknown): () => void {
    const r = renderer as { _objects?: RenderObjectsLike | null; _geometries?: GeometryDataLike | null } | null | undefined
    this.geometryData = r?._geometries ?? null
    const objects = r?._objects
    const original = objects?.get
    if (!objects || typeof original !== 'function') return () => {}
    const set = this.set
    const root = this.root
    const wrapped = function (this: unknown, ...args: unknown[]): unknown {
      const [object, material, scene] = args as [Drawable | undefined, THREE.Material | undefined, unknown]
      if (scene && scene === root()) {
        if (material?.isMaterial) addMaterial(material, set)
        if (object?.geometry?.isBufferGeometry) set.geometries.add(object.geometry)
      }
      return original.apply(this, args)
    }
    objects.get = wrapped
    this.attached = true
    return () => {
      if (objects.get === wrapped) objects.get = original
      this.attached = false
    }
  }

  frame(): void {
    if (this.frames++ % this.every !== 0) return
    // A texture assigned to a recorded material after its first draw (a map
    // swapped in, and maybe out again before leave) is picked up here.
    if (this.attached) {
      for (const m of this.set.materials) collectMaterialTextures(m, this.set.textures)
      return
    }
    const r = this.root()
    if (r) collectSceneResources(r, this.set)
  }

  leave(): ReleaseCounts {
    // No traverse here: the unmount commit may already have attached the next
    // scene's objects, which are not this visit's to release.
    if (this.frames === 0) return { materials: 0, geometries: 0, textures: 0 }
    this.frames = 0
    // A material is scanned for textures on its first draw; one assigned to it
    // later (a swapped map or texture node) is picked up here.
    for (const m of this.set.materials) collectMaterialTextures(m, this.set.textures)
    return releaseSceneResources(this.set, this.geometryData)
  }
}

type RendererLike = { _renderLists?: { dispose?: () => void } } | null | undefined

/** Drop the renderer's render lists (three internals, read defensively): the
 *  ones of cameras that no longer render stop pinning what they last drew.
 *  Returns whether there was anything to drop. */
export function releaseRenderLists(renderer: unknown): boolean {
  const lists = (renderer as RendererLike)?._renderLists
  if (!lists || typeof lists.dispose !== 'function') return false
  lists.dispose()
  return true
}

type DataMapLike<V> = { has?: (o: object) => boolean; get?: (o: object) => V }
type PruneRenderer = {
  info?: { memoryMap?: Map<object, unknown> }
  _textures?: DataMapLike<{ bindGroups?: Set<object> }>
  _bindings?: DataMapLike<unknown>
} | null | undefined

/** Remove destroyed bind groups from the bind-group sets of every texture the
 *  renderer still holds (three internals, read defensively; a renderer without
 *  them prunes nothing). A bind group counts as destroyed once the renderer's
 *  bindings no longer hold data for it. Returns the entries removed. */
export function pruneDeadBindGroups(renderer: unknown): number {
  const r = renderer as PruneRenderer
  const live = r?.info?.memoryMap
  const textures = r?._textures
  const bindings = r?._bindings
  if (!live || typeof textures?.has !== 'function' || typeof textures.get !== 'function' || typeof bindings?.has !== 'function') return 0
  let removed = 0
  for (const t of live.keys()) {
    if (!(t as { isTexture?: boolean }).isTexture || !textures.has(t)) continue
    const groups = textures.get(t)?.bindGroups
    if (!groups) continue
    for (const g of groups) {
      if (bindings.has(g)) continue
      groups.delete(g)
      removed++
    }
  }
  return removed
}
