// Material of the settlement's scattered boulders (point 1164).
//
// The colorNode already reads the baked vertex colour. A NodeMaterial with
// `vertexColors = true` multiplies that colour onto the colorNode a second time
// (three NodeMaterial.setupDiffuse), so the grey #8a8178 rendered at its square
// and the small boulders read as near-black ellipses on the sand — taken for
// shadows without a caster. `vertexColors` therefore stays false here.

import * as THREE from 'three/webgpu'
import { vertexColor } from 'three/tsl'
import { seasonFoliagePosition, seasonTintNode } from './seasonTint'

export function createScatterRockMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial()
  m.vertexColors = false // the colorNode reads vertexColor() once already
  m.roughness = 0.95
  m.colorNode = seasonTintNode(vertexColor().rgb)
  m.positionNode = seasonFoliagePosition() // rocks carry the zero foliage class
  return m
}
