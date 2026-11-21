import { describe, it, expect } from 'vitest'
import * as THREE from 'three/webgpu'
import { texture } from 'three/tsl'
import { collectSceneResources, newReleaseSet, pruneDeadBindGroups, releaseRenderLists, releaseSceneResources, releasableTexture, PlaceReleaseTracker } from './placeRelease'

/** Counts 'dispose' events — the signal three's render objects release on. */
function track<T extends THREE.EventDispatcher<{ dispose: object }>>(o: T): { o: T; n: () => number } {
  let n = 0
  o.addEventListener('dispose', () => n++)
  return { o, n: () => n }
}

function scene() {
  const shared = track(new THREE.MeshStandardNodeMaterial())
  const own = track(new THREE.MeshBasicNodeMaterial())
  const multiA = track(new THREE.MeshBasicNodeMaterial())
  const multiB = track(new THREE.MeshBasicNodeMaterial())
  const geoShared = track(new THREE.BoxGeometry())
  const geoSkin = track(new THREE.BufferGeometry())
  const root = new THREE.Scene()
  const group = new THREE.Group()
  root.add(group)
  group.add(new THREE.Mesh(geoShared.o, shared.o))
  group.add(new THREE.Mesh(geoShared.o, own.o))
  group.add(new THREE.SkinnedMesh(geoSkin.o, shared.o))
  group.add(new THREE.Mesh(geoShared.o, [multiA.o, multiB.o]))
  group.add(new THREE.Object3D())
  return { root, group, mats: [shared, own, multiA, multiB], geos: [geoShared, geoSkin] }
}

describe('place release set', () => {
  it('collects each drawn material and geometry once, array materials included', () => {
    const s = scene()
    const set = newReleaseSet()
    collectSceneResources(s.root, set)
    collectSceneResources(s.root, set)
    expect(set.materials.size).toBe(4)
    expect(set.geometries.size).toBe(2)
  })

  it('disposes the whole set exactly once and empties it', () => {
    const s = scene()
    const set = newReleaseSet()
    collectSceneResources(s.root, set)
    expect(releaseSceneResources(set)).toEqual({ materials: 4, geometries: 2, textures: 0 })
    for (const t of [...s.mats, ...s.geos]) expect(t.n()).toBe(1)
    expect(releaseSceneResources(set)).toEqual({ materials: 0, geometries: 0, textures: 0 })
    for (const t of [...s.mats, ...s.geos]) expect(t.n()).toBe(1)
  })
})

describe('PlaceReleaseTracker', () => {
  it('releases what an earlier sample saw, even after the object unmounted', () => {
    const s = scene()
    const gone = track(new THREE.MeshBasicNodeMaterial())
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), gone.o)
    s.group.add(mesh)
    const tracker = new PlaceReleaseTracker(() => s.root, 2)
    tracker.frame() // sampled
    s.group.remove(mesh)
    tracker.frame()
    expect(tracker.leave().materials).toBe(5)
    expect(gone.n()).toBe(1)
    for (const t of s.mats) expect(t.n()).toBe(1)
  })

  it('does not traverse on leave: objects attached after the last sample are kept', () => {
    const s = scene()
    const tracker = new PlaceReleaseTracker(() => s.root, 100)
    tracker.frame()
    const next = track(new THREE.MeshBasicNodeMaterial())
    s.root.add(new THREE.Mesh(new THREE.BufferGeometry(), next.o))
    tracker.leave()
    expect(next.n()).toBe(0)
  })

  it('releases nothing on a leave before the first rendered frame (StrictMode remount)', () => {
    const s = scene()
    const tracker = new PlaceReleaseTracker(() => s.root)
    expect(tracker.leave()).toEqual({ materials: 0, geometries: 0, textures: 0 })
    for (const t of [...s.mats, ...s.geos]) expect(t.n()).toBe(0)
    tracker.frame()
    expect(tracker.leave().materials).toBe(4)
  })
})

describe('textures bound by released materials', () => {
  it('disposes map properties and TSL texture nodes once, sharing included', () => {
    const map = track(new THREE.DataTexture(new Uint8Array(4), 1, 1))
    const viaNode = track(new THREE.CanvasTexture(document.createElement('canvas')))
    const a = new THREE.MeshStandardNodeMaterial()
    a.map = map.o
    const b = new THREE.MeshStandardNodeMaterial()
    b.colorNode = texture(viaNode.o).rgb.mul(0.5)
    const c = new THREE.MeshBasicNodeMaterial()
    c.colorNode = texture(viaNode.o)
    const root = new THREE.Group()
    for (const m of [a, b, c]) root.add(new THREE.Mesh(new THREE.BufferGeometry(), m))
    const set = newReleaseSet()
    collectSceneResources(root, set)
    expect(releaseSceneResources(set).textures).toBe(2)
    expect(map.n()).toBe(1)
    expect(viaNode.n()).toBe(1)
  })

  it('leaves render-target and depth textures alone', () => {
    const rt = new THREE.RenderTarget(4, 4)
    expect(releasableTexture(rt.texture)).toBe(false)
    expect(releasableTexture(new THREE.DepthTexture(4, 4))).toBe(false)
    expect(releasableTexture(new THREE.DataTexture(new Uint8Array(4), 1, 1))).toBe(true)
    expect(releasableTexture(null)).toBe(false)
  })
})

describe('render lists on leaving a place', () => {
  type List = { begin(): List; finish(): void; push(...a: unknown[]): void; renderItems: Array<{ object: unknown }> }
  type Lists = { get(scene: unknown, camera: unknown): List; dispose(): void }
  async function renderLists(): Promise<Lists> {
    const listsPath = 'three/src/renderers/common/RenderLists.js'
    const lightingPath = 'three/src/renderers/common/Lighting.js'
    const { default: RenderLists } = (await import(/* @vite-ignore */ listsPath)) as { default: new (l: unknown) => Lists }
    const { default: Lighting } = (await import(/* @vite-ignore */ lightingPath)) as { default: new () => unknown }
    return new RenderLists(new Lighting())
  }
  /** One shadow pass of a village: its sun's shadow camera draws a figure. */
  function shadowPass(lists: Lists, scene: THREE.Scene, camera: THREE.Camera, figure: THREE.Mesh) {
    const list = lists.get(scene, camera).begin()
    list.push(figure, figure.geometry, figure.material, 0, 0, null, null)
    list.finish()
  }
  const pinned = (lists: Lists, scene: THREE.Scene, camera: THREE.Camera, figure: THREE.Mesh) =>
    lists.get(scene, camera).renderItems.some((i) => i.object === figure)

  it('a shadow camera that never renders again pins the figure it last drew, until the lists are released', async () => {
    const lists = await renderLists()
    const scene = new THREE.Scene()
    // the left village's sun: still reachable (three's node caches hold its shadow node)
    const oldShadowCamera = new THREE.OrthographicCamera()
    const oldFigure = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicNodeMaterial())
    shadowPass(lists, scene, oldShadowCamera, oldFigure)
    // the next village renders with its own lights; the old camera is never drawn again
    shadowPass(lists, scene, new THREE.OrthographicCamera(), new THREE.Mesh())
    expect(pinned(lists, scene, oldShadowCamera, oldFigure)).toBe(true) // the retention
    expect(releaseRenderLists({ _renderLists: lists })).toBe(true)
    expect(pinned(lists, scene, oldShadowCamera, oldFigure)).toBe(false)
  })

  it('fails soft on a renderer without render lists', () => {
    expect(releaseRenderLists(null)).toBe(false)
    expect(releaseRenderLists({})).toBe(false)
  })
})

describe('bind groups three never forgets', () => {
  /** three r185's bookkeeping, reduced to what the leak is made of: each
   *  sampled texture's data keeps a Set of the bind groups sampling it, and
   *  destroying a bind group deletes its bindings data but not those entries. */
  function renderer() {
    const textureData = new WeakMap<object, { bindGroups: Set<object> }>()
    const bindingData = new WeakMap<object, object>()
    const memoryMap = new Map<object, number>()
    const map = <V,>(m: WeakMap<object, V>) => ({ has: (o: object) => m.has(o), get: (o: object) => m.get(o) })
    const r = { info: { memoryMap }, _textures: map(textureData), _bindings: map(bindingData) }
    const upload = (t: THREE.Texture) => {
      memoryMap.set(t, 0)
      textureData.set(t, { bindGroups: new Set() })
    }
    const draw = (samples: THREE.Texture[]) => {
      const group = { bindings: samples.map((t) => ({ texture: t })) }
      bindingData.set(group, {})
      for (const t of samples) textureData.get(t)!.bindGroups.add(group)
      return group
    }
    const destroy = (group: object) => bindingData.delete(group) // what _destroyBindings does
    // a disposed texture leaves the renderer (geometry dispose frees a morph texture)
    const release = (t: THREE.Texture) => memoryMap.delete(t)
    return { r, upload, draw, destroy, release, groups: (t: THREE.Texture) => textureData.get(t)!.bindGroups }
  }

  it('a session texture keeps every destroyed figure bind group, and with it the figure morph texture, until pruned', () => {
    const { r, upload, draw, destroy, release, groups } = renderer()
    const dfg = new THREE.DataTexture() // lives for the session, never disposed
    upload(dfg)
    const kept = draw([dfg])
    for (let village = 0; village < 3; village++) {
      const morph = new THREE.DataArrayTexture()
      upload(morph)
      destroy(draw([dfg, morph])) // the village's figure, left again
      release(morph)
    }
    expect(groups(dfg).size).toBe(4) // the leak: three destroyed groups still referenced
    expect(pruneDeadBindGroups(r)).toBe(3)
    expect([...groups(dfg)]).toEqual([kept]) // a live group is never touched
    expect(pruneDeadBindGroups(r)).toBe(0)
  })

  it('fails soft on a renderer without the bookkeeping', () => {
    expect(pruneDeadBindGroups(null)).toBe(0)
    expect(pruneDeadBindGroups({ info: {} })).toBe(0)
  })
})
