// Merged settlement-marker glyphs (point 1524): fewer meshes, same shapes.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { MONUMENT_PYRAMIDS, VILLAGE_HUTS, monumentGlyph, villageGlyph } from './placeMarkerGlyphs'

function box(meshes: THREE.Mesh[]): THREE.Box3 {
  const b = new THREE.Box3()
  for (const m of meshes) {
    m.updateMatrixWorld(true)
    b.expandByObject(m, true)
  }
  return b
}

describe('place marker glyphs', () => {
  it('draws a village as two meshes covering the six original hut parts exactly', () => {
    const parts = villageGlyph()
    expect(parts).toHaveLength(2)
    const original: THREE.Mesh[] = []
    for (const [x, z, r] of VILLAGE_HUTS) {
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.06, r, 9))
      wall.position.set(x, r * 0.5, z)
      const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.4, r * 1.05, 9))
      roof.position.set(x, r + r * 0.42, z)
      original.push(wall, roof)
    }
    const mergedBox = box(parts.map((p) => new THREE.Mesh(p.geometry)))
    const ref = box(original)
    expect(mergedBox.min.distanceTo(ref.min)).toBeLessThan(1e-6)
    expect(mergedBox.max.distanceTo(ref.max)).toBeLessThan(1e-6)
    const verts = parts.reduce((n, p) => n + p.geometry.getAttribute('position').count, 0)
    expect(verts).toBe(original.reduce((n, m) => n + m.geometry.getAttribute('position').count, 0))
    expect((parts[0].material as THREE.MeshStandardMaterial).roughness).toBe(0.95)
    expect((parts[1].material as THREE.MeshStandardMaterial).roughness).toBe(1)
  })

  it('draws a monument as one mesh of three pyramids, shared by every marker', () => {
    const parts = monumentGlyph()
    expect(parts).toHaveLength(1)
    expect(monumentGlyph()).toBe(parts)
    const original = MONUMENT_PYRAMIDS.map(([x, z, r]) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.28, 4))
      m.position.set(x, r * 0.5, z)
      m.rotation.set(0, Math.PI / 4, 0)
      return m
    })
    const mergedBox = box([new THREE.Mesh(parts[0].geometry)])
    const ref = box(original)
    expect(mergedBox.min.distanceTo(ref.min)).toBeLessThan(1e-6)
    expect(mergedBox.max.distanceTo(ref.max)).toBeLessThan(1e-6)
  })
})
