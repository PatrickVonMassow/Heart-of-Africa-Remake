// THE MEASURED SILHOUETTE (work-order 1065). What the module claims about the
// play rock has to be true of the mesh the scene draws, or the tapping child's
// hand is solved against a stone that is not there.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildPlayRock } from '../../render/flora'
import {
  PLAY_ROCK_SEEDS,
  PROFILE_BINS,
  playRockProfile,
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
        // One bin is 11.25°; a vertex may sit up to half a bin off the bearing
        // the ring reports, so it is compared with a small tolerance rather
        // than exactly. What must never happen is the surface being reported
        // WELL INSIDE the stone, which is what would let a hand pass through.
        expect(reported).toBeGreaterThan(Math.hypot(x, z) - 0.12)
      }
    }
  })

  it('is widest well above the ground, which is the whole reason for the point', () => {
    for (const seed of PLAY_ROCK_SEEDS) {
      const profile = playRockProfile(seed)
      const widest = profile.rings.map((ring) => Math.max(...ring))
      const top = widest.indexOf(Math.max(...widest))
      const height = top / (profile.rings.length - 1)
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

  it('fills every bearing of every ring, so no lookup falls into a hole', () => {
    for (const seed of PLAY_ROCK_SEEDS) {
      for (const ring of playRockProfile(seed).rings.slice(1, -1)) {
        expect(ring).toHaveLength(PROFILE_BINS)
        for (const r of ring) expect(r).toBeGreaterThan(0)
      }
    }
  })

  it('gives the two stones different yaws wherever they stand apart', () => {
    expect(playRockYaw({ x: 3, z: -4 })).not.toBeCloseTo(playRockYaw({ x: -3, z: 4 }), 6)
  })
})
