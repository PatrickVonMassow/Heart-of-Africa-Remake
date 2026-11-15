// Merged settlement-marker glyphs for the travel map (point 1524). A village
// glyph was six meshes (three huts, wall + roof each) and a monument glyph
// three, each with its own material — six draws per marker in the main pass
// and in every sun-shadow cascade. The same shapes are merged here into one
// mesh per material, shared by every marker: identical geometry, colours and
// roughness, so the picture is unchanged while the draws drop to two and one.
import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** Hut placement in the village glyph: [x, z, radius]. */
export const VILLAGE_HUTS: ReadonlyArray<readonly [number, number, number]> = [
  [0, -0.2, 0.72],
  [-0.95, 0.5, 0.5],
  [0.95, 0.55, 0.52],
]

/** Pyramid placement in the monument glyph: [x, z, base radius]. */
export const MONUMENT_PYRAMIDS: ReadonlyArray<readonly [number, number, number]> = [
  [0.7, -0.7, 0.95], // Khufu, largest, NE
  [0, 0, 0.85], // Khafre, centre
  [-0.7, 0.7, 0.55], // Menkaure, smallest, SW
]

export interface GlyphPart {
  geometry: THREE.BufferGeometry
  material: THREE.Material
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)
  for (const p of parts) p.dispose()
  if (!g) throw new Error('placeMarkerGlyphs: geometries did not merge')
  return g
}

let village: GlyphPart[] | null = null
/** The village glyph: walls and roofs of the three huts, one mesh each. */
export function villageGlyph(): GlyphPart[] {
  if (village) return village
  const walls = VILLAGE_HUTS.map(([x, z, r]) => new THREE.CylinderGeometry(r, r * 1.06, r, 9).translate(x, r * 0.5, z))
  const roofs = VILLAGE_HUTS.map(([x, z, r]) => new THREE.ConeGeometry(r * 1.4, r * 1.05, 9).translate(x, r + r * 0.42, z))
  village = [
    { geometry: merged(walls), material: new THREE.MeshStandardMaterial({ color: '#b0803f', roughness: 0.95 }) },
    { geometry: merged(roofs), material: new THREE.MeshStandardMaterial({ color: '#8f7340', roughness: 1 }) },
  ]
  return village
}

let monument: GlyphPart[] | null = null
/** The monument glyph: three pyramids in one mesh. */
export function monumentGlyph(): GlyphPart[] {
  if (monument) return monument
  const pyramids = MONUMENT_PYRAMIDS.map(([x, z, r]) =>
    new THREE.ConeGeometry(r, r * 1.28, 4).rotateY(Math.PI / 4).translate(x, r * 0.5, z),
  )
  monument = [{ geometry: merged(pyramids), material: new THREE.MeshStandardMaterial({ color: '#cdb079', roughness: 0.95 }) }]
  return monument
}
