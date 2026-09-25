import * as THREE from 'three/webgpu'
import { ROCK_RELIEF } from '../../world/rockRelief'

export function buildReliefFace() {
  const shape = new THREE.Shape()
  ROCK_RELIEF.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y))
  shape.closePath()
  return new THREE.ShapeGeometry(shape)
}

export function buildSocketBlock() {
  const geometry = new THREE.BoxGeometry(1.8, 1, 1.7, 2, 1, 2)
  const p = geometry.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i) + 0.6
    p.setXYZ(i, p.getX(i), p.getY(i) > 0 ? 1.03 - (z - 0.7) / Math.sqrt(3) : 0.02, z)
  }
  geometry.computeVertexNormals()
  return geometry
}

