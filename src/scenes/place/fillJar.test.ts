import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { balance } from '../../config/balance'
import { FIGURE_LIMBS } from '../../render/figures'
import { FILL_CARRY_SIDE, fillPose, fillSquat } from '../../render/gesture'
import { JAR_HEIGHT, fillJarPlacement, fillJarPoint, fillJarTiltFromVertical, fillRings } from './fillJar'

const across = (n = 40) => Array.from({ length: n + 1 }, (_, i) => i / n)

describe('the jar tips its mouth into the water through the fill (design.md §13.4)', () => {
  it('its tilt off the vertical GROWS with the dip, rather than shrinking', () => {
    const down = across(20).map((k) => k * 0.2)
    const tilts = down.map(fillJarTiltFromVertical)
    for (let i = 1; i < tilts.length; i++) expect(tilts[i]).toBeGreaterThan(tilts[i - 1])
    // Past level at the hold: the mouth points down into the water.
    expect(fillJarTiltFromVertical(0.5)).toBeGreaterThan(Math.PI / 2)
    // And it rights itself on the way up, back to how it hangs.
    expect(fillJarTiltFromVertical(1)).toBeCloseTo(fillJarTiltFromVertical(0), 6)
  })

  it('at the hold only the MOUTH is under the surface, never the vessel', () => {
    const surface = balance.bankFillDepth
    const mouth = fillJarPoint(0.5, JAR_HEIGHT / 2)
    const centre = fillJarPoint(0.5, 0)
    const base = fillJarPoint(0.5, -JAR_HEIGHT / 2)
    expect(mouth[1]).toBeLessThan(surface)
    expect(centre[1]).toBeGreaterThan(surface)
    expect(base[1]).toBeGreaterThan(surface)
    // In front of him, where the profile camera sees it.
    expect(mouth[2]).toBeGreaterThan(0.25)
  })

  it('hangs exactly as before off the fill', () => {
    expect(fillJarPlacement(null)).toEqual({ position: [0, -0.12, 0.04], rotation: [0, 0, 0.12] })
    const start = fillJarPlacement(0)
    expect(start.rotation[0]).toBeCloseTo(0, 9)
    start.position.forEach((v, k) => expect(v).toBeCloseTo([0, -0.12, 0.04][k], 9))
  })

  it('the pure chain is the one three.js draws', () => {
    expect(FILL_CARRY_SIDE).toBe('left')
    for (const p of [0.1, 0.5, 0.9]) {
      const pose = fillPose(p)
      const root = new THREE.Group()
      root.scale.set(1, fillSquat(p), 1)
      const trunk = new THREE.Group()
      trunk.rotation.set(pose.lean, pose.turn, 0)
      const arm = new THREE.Group()
      arm.position.set(FIGURE_LIMBS.shoulderX, FIGURE_LIMBS.shoulderY, 0)
      arm.rotation.order = 'YXZ'
      arm.rotation.set(pose.left.pitch, pose.left.yaw, pose.left.roll)
      const hand = new THREE.Group()
      hand.position.set(0, -FIGURE_LIMBS.armLength, 0)
      const jar = new THREE.Group()
      const placed = fillJarPlacement(p)
      jar.position.set(...placed.position)
      jar.rotation.set(...placed.rotation)
      const mouth = new THREE.Object3D()
      mouth.position.set(0, JAR_HEIGHT / 2, 0)
      root.add(trunk)
      trunk.add(arm)
      arm.add(hand)
      hand.add(jar)
      jar.add(mouth)
      root.updateMatrixWorld(true)
      const drawn = mouth.getWorldPosition(new THREE.Vector3())
      const pure = fillJarPoint(p, JAR_HEIGHT / 2)
      expect(drawn.x).toBeCloseTo(pure[0], 6)
      expect(drawn.y).toBeCloseTo(pure[1], 6)
      expect(drawn.z).toBeCloseTo(pure[2], 6)
    }
  })
})

describe('the surface answers the dip with a spreading ring', () => {
  it('is alive exactly while the fill phase is', () => {
    expect(fillRings(null)).toBeNull()
    for (const p of across()) expect(fillRings(p)).not.toBeNull()
  })

  it('shows a visible ring through the whole hold', () => {
    for (const p of across(56).map((k) => 0.2 + k * 0.01)) {
      const rings = fillRings(p) ?? []
      expect(Math.max(...rings.map((r) => r.opacity))).toBeGreaterThan(0.1)
    }
  })

  it('spreads: a ring grows and fades as its phase runs', () => {
    const { period } = balance.bankFillRing
    const step = (0.3 * period) / balance.bankFillSeconds
    const a = (fillRings(0.3) ?? [])[0]
    const b = (fillRings(0.3 + step) ?? [])[0]
    expect(b.radius).toBeGreaterThan(a.radius)
    expect(b.opacity).toBeLessThan(a.opacity)
    for (const r of fillRings(0.5) ?? []) {
      expect(r.radius).toBeGreaterThanOrEqual(balance.bankFillRing.startRadius)
      expect(r.radius).toBeLessThanOrEqual(balance.bankFillRing.endRadius)
    }
  })
})
