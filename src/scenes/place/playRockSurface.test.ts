// THE MEASURED SILHOUETTE (work-order 1065). What the module claims about the
// play rock has to be true of the mesh the scene draws, or the tapping child's
// hand is solved against a stone that is not there.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildPlayRock } from '../../render/flora'
import {
  PLAY_ROCK_SEEDS,
  playRockSurfaceRadius,
  playRockYaw,
} from './playRockSurface'
import { PLAY_ROCK_SCALE, PLAY_ROCK_SPAN } from './layout'

/** Every vertex of the built mesh, in mesh units. */
function vertices(seed: number): Array<[number, number, number]> {
  const g = buildPlayRock(seed)
  const p = g.getAttribute('position') as THREE.BufferAttribute
  return Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)])
}

describe('the play rock`s drawn silhouette (work-order 1065)', () => {
  it('never reports a surface a vertex of the mesh stands outside of', () => {
    for (const seed of PLAY_ROCK_SEEDS) {
      for (const [x, y, z] of vertices(seed)) {
        const bearing = Math.atan2(x, z)
        const reported = playRockSurfaceRadius(seed, 1, 0, bearing, y)
        // Flattened base vertices can lie inside the outer boundary.
        expect(reported).toBeGreaterThanOrEqual(Math.hypot(x, z) - 1e-7)
      }
    }
  })

  it('is widest well above the ground, which is the whole reason for the point', () => {
    for (const seed of PLAY_ROCK_SEEDS) {
      const points = vertices(seed)
      const widest = points.reduce((a, b) => Math.hypot(a[0], a[2]) > Math.hypot(b[0], b[2]) ? a : b)
      const height = widest[1] / Math.max(...points.map((v) => v[1]))
      expect(height).toBeGreaterThan(0.4)
      expect(height).toBeLessThan(0.95)
      // And at a child's hand height the flank stands a good way inside it.
      const hand = playRockSurfaceRadius(seed, PLAY_ROCK_SCALE, 0, 0, 0.45)
      expect(hand).toBeLessThan(PLAY_ROCK_SPAN - 0.08)
    }
  })

  it('turns with the instance yaw, so the flank measured is the flank facing', () => {
    const seed = PLAY_ROCK_SEEDS[0]
    const yaw = 0.9
    for (const bearing of [0, 1.1, -2.3, 3.0]) {
      expect(playRockSurfaceRadius(seed, PLAY_ROCK_SCALE, yaw, bearing + yaw, 0.5)).toBeCloseTo(
        playRockSurfaceRadius(seed, PLAY_ROCK_SCALE, 0, bearing, 0.5),
        9,
      )
    }
  })

  it('scales with the instance scale', () => {
    const seed = PLAY_ROCK_SEEDS[1]
    expect(playRockSurfaceRadius(seed, 2, 0, 0.4, 1.0)).toBeCloseTo(
      2 * playRockSurfaceRadius(seed, 1, 0, 0.4, 0.5),
      9,
    )
  })

  it('matches independent raycasts between vertices, across heights and yaws', () => {
    const raycaster = new THREE.Raycaster()
    for (const seed of PLAY_ROCK_SEEDS) {
      const geometry = buildPlayRock(seed)
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.scale.setScalar(PLAY_ROCK_SCALE)
      mesh.rotation.y = 0.73
      mesh.updateMatrixWorld(true)
      for (const y of [0.2, 0.37, 0.48, 0.61, 0.9, 1.2]) {
        for (let k = 0; k < 73; k++) {
          const bearing = k / 73 * Math.PI * 2
          const direction = new THREE.Vector3(Math.sin(bearing), 0, Math.cos(bearing))
          raycaster.set(direction.clone().multiplyScalar(3).setY(y), direction.clone().negate())
          const hits = raycaster.intersectObject(mesh)
          const expected = hits.length ? 3 - hits[0].distance : 0
          expect(playRockSurfaceRadius(seed, PLAY_ROCK_SCALE, 0.73, bearing, y)).toBeCloseTo(expected, 6)
        }
      }
      geometry.dispose()
      material.dispose()
    }
  })

  it('reports no flank below or above the stone', () => {
    for (const seed of PLAY_ROCK_SEEDS) {
      expect(playRockSurfaceRadius(seed, 1, 0, 0, -0.01)).toBe(0)
      expect(playRockSurfaceRadius(seed, 1, 0, 0, 10)).toBe(0)
    }
  })

  it('gives the two stones different yaws wherever they stand apart', () => {
    expect(playRockYaw({ x: 3, z: -4 })).not.toBeCloseTo(playRockYaw({ x: -3, z: 4 }), 6)
  })
})
