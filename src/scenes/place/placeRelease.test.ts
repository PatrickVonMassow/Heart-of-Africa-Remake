import { describe, it, expect } from 'vitest'
import * as THREE from 'three/webgpu'
import { texture } from 'three/tsl'
import { collectSceneResources, newReleaseSet, releaseSceneResources, releasableTexture, PlaceReleaseTracker } from './placeRelease'

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
