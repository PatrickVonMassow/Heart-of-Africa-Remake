import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { BODY_RADIUS, SPECIES, recordDrawnBody, drawnCollisionCircle, type DrawnBodyCarrier } from './animalBodies'

/**
 * Point 378: the traveller's animal collider must be DERIVED from the transform
 * the renderer draws — the user walked straight through the drawn body and was
 * blocked on empty ground beside it, because the circle was built from the
 * behaviour position while the instance is drawn at that position PLUS the
 * render offsets (idle shuffle, drink slide, struggle wobble, ambush placement).
 * These cases pin the identity: circle centre == drawn instance position, radius
 * == body radius × drawn scale, and nothing for a body the pass did not draw.
 */

/** Compose an instance matrix exactly as the herd render loop does. */
function instanceMatrix(x: number, y: number, z: number, yaw: number, pitch: number, scale: number): THREE.Matrix4 {
  const quat = new THREE.Quaternion()
  if (pitch !== 0) quat.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'))
  else quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    quat,
    new THREE.Vector3().setScalar(scale),
  )
}

describe('the animal collider is derived from the drawn transform (point 378)', () => {
  it('reports the DRAWN position, not the behaviour position', () => {
    // The reported case: an idle grazer whose sim spot is a full body away from
    // the shuffled spot the instance is drawn at.
    const a: DrawnBodyCarrier = {}
    const simX = 330.7
    const simZ = -233.3
    const drawnX = simX + 0.8 // the idle shuffle's amplitude in x
    const drawnZ = simZ - 0.79 // …and in z
    recordDrawnBody(a, instanceMatrix(drawnX, 1.2, drawnZ, 1.1, 0, 0.97).elements, 7)
    const circle = drawnCollisionCircle(a, BODY_RADIUS.wildebeest, 7)
    expect(circle).not.toBeNull()
    expect(circle![0]).toBeCloseTo(drawnX, 10)
    expect(circle![1]).toBeCloseTo(drawnZ, 10)
    // and it is genuinely elsewhere than the old sim-position circle
    expect(Math.hypot(circle![0] - simX, circle![1] - simZ)).toBeGreaterThan(BODY_RADIUS.wildebeest)
  })

  it('matches the drawn instance for every species, scale and pose', () => {
    let frame = 0
    for (const sp of SPECIES) {
      for (const scale of [0.53, 0.9, 1, 1.4]) {
        for (const [yaw, pitch] of [
          [0, 0],
          [1.7, 0],
          [-2.9, 0.42], // the drinking head-dip
          [0.3, Math.PI / 2.3], // a thrashing catch, thrown on its side
        ]) {
          frame++
          const a: DrawnBodyCarrier = {}
          const m = instanceMatrix(12.5, 3.25, -8.75, yaw, pitch, scale)
          recordDrawnBody(a, m.elements, frame)
          const circle = drawnCollisionCircle(a, BODY_RADIUS[sp], frame)
          expect(circle).not.toBeNull()
          // centre == the instance's own translation, to floating-point noise
          expect(circle![0]).toBeCloseTo(12.5, 9)
          expect(circle![1]).toBeCloseTo(-8.75, 9)
          // radius scales with the DRAWN body, and a rotation never inflates it
          expect(circle![2]).toBeCloseTo(BODY_RADIUS[sp] * scale, 9)
        }
      }
    }
  })

  it('follows a moving animal frame by frame (no one-frame lag)', () => {
    const a: DrawnBodyCarrier = {}
    let x = 100
    for (let frame = 1; frame <= 30; frame++) {
      x += 0.37 // a fleeing grazer's step
      const wobble = Math.sin(frame * 0.4) * 0.8 // the render offset rides along
      recordDrawnBody(a, instanceMatrix(x + wobble, 0.8, 40, frame * 0.1, 0, 0.9).elements, frame)
      const circle = drawnCollisionCircle(a, BODY_RADIUS.zebra, frame)
      expect(circle).not.toBeNull()
      expect(circle![0]).toBeCloseTo(x + wobble, 9)
      expect(circle![1]).toBeCloseTo(40, 9)
    }
  })

  it('gives no circle for a body this pass did not draw (no phantom collider)', () => {
    const never: DrawnBodyCarrier = {}
    expect(drawnCollisionCircle(never, BODY_RADIUS.antelope, 5)).toBeNull()

    // Drawn earlier, then capped out of the instance budget / streamed away:
    // the stale record must not keep colliding where nothing is rendered.
    const stale: DrawnBodyCarrier = {}
    recordDrawnBody(stale, instanceMatrix(1, 0, 2, 0, 0, 1).elements, 41)
    expect(drawnCollisionCircle(stale, BODY_RADIUS.antelope, 41)).not.toBeNull()
    expect(drawnCollisionCircle(stale, BODY_RADIUS.antelope, 42)).toBeNull()
  })

  it('leaves carcasses passable (design.md §19)', () => {
    const a: DrawnBodyCarrier = { dead: true }
    recordDrawnBody(a, instanceMatrix(3, 0, 4, 0, 0, 1).elements, 9)
    expect(drawnCollisionCircle(a, BODY_RADIUS.wildebeest, 9)).toBeNull()
  })

  it('reuses the record instead of allocating one per animal per frame', () => {
    const a: DrawnBodyCarrier = {}
    recordDrawnBody(a, instanceMatrix(1, 2, 3, 0, 0, 1).elements, 1)
    const first = a.drawn
    recordDrawnBody(a, instanceMatrix(4, 5, 6, 0, 0, 2).elements, 2)
    expect(a.drawn).toBe(first)
    expect(a.drawn!.x).toBe(4)
    expect(a.drawn!.y).toBe(5)
    expect(a.drawn!.z).toBe(6)
    expect(a.drawn!.scale).toBeCloseTo(2, 12)
    expect(a.drawn!.frame).toBe(2)
  })

  it('keeps a body radius for every species the herds render', () => {
    for (const sp of SPECIES) expect(BODY_RADIUS[sp]).toBeGreaterThan(0)
    expect(Object.keys(BODY_RADIUS).sort()).toEqual([...SPECIES].sort())
  })
})
