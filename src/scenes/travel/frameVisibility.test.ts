// The one projection rule (point 172): "is it in the picture" is decided by the
// live camera's frustum, never by an assumed radius. Both users go through
// pointOnScreen — the seeders' ground test and the §17.8 label layer — so it is
// pinned here, including the case a radius check can never see: a point BEHIND
// the camera, whose clip w is negative and which folds back into the frame if
// the sign is ignored.
import { describe, it, expect } from 'vitest'
import { pointOnScreen, projectPoint, isOnScreen, setFrameVisibilityTest, FRAME_EDGE_MARGIN } from './frameVisibility'

/** A camera at the origin looking down −z, with a 90° vertical field of view
 *  and a square aspect: at z = −d the frame spans ±d in x and y. */
function camera(): { projectionMatrix: { elements: number[] }; matrixWorldInverse: { elements: number[] } } {
  const near = 0.1
  const far = 100
  const f = 1 // cot(45°)
  // Column-major perspective matrix, as three composes it.
  return {
    projectionMatrix: {
      elements: [
        f, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) / (near - far), -1,
        0, 0, (2 * far * near) / (near - far), 0,
      ],
    },
    matrixWorldInverse: {
      elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    },
  }
}

describe('pointOnScreen', () => {
  const cam = camera()

  it('sees a point in front of the camera', () => {
    expect(pointOnScreen(cam, 0, 0, -10)).toBe(true)
    expect(pointOnScreen(cam, 9, 0, -10)).toBe(true)
  })

  it('rejects a point outside the frame', () => {
    expect(pointOnScreen(cam, 30, 0, -10)).toBe(false)
    expect(pointOnScreen(cam, 0, -30, -10)).toBe(false)
  })

  it('rejects a point BEHIND the camera instead of folding it back in', () => {
    expect(pointOnScreen(cam, 0, 0, 10)).toBe(false)
    expect(pointOnScreen(cam, 5, 5, 10)).toBe(false)
  })

  it('rejects a point beyond the far plane', () => {
    expect(pointOnScreen(cam, 0, 0, -1000)).toBe(false)
  })

  it('the edge margin widens the frame, and only the caller who asks for it', () => {
    // Just outside the right edge at z = −10.
    expect(pointOnScreen(cam, 10.9, 0, -10)).toBe(false)
    expect(pointOnScreen(cam, 10.9, 0, -10, FRAME_EDGE_MARGIN)).toBe(true)
  })
})

describe('projectPoint (the coordinates the label layout needs)', () => {
  const cam = camera()

  it('puts the centre of the frame at the origin of NDC', () => {
    const p = projectPoint(cam, 0, 0, -10)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(0)
    expect(p.onScreen).toBe(true)
  })

  it('reads left of centre as negative x and above it as positive y', () => {
    const left = projectPoint(cam, -5, 0, -10)
    const up = projectPoint(cam, 0, 5, -10)
    expect(left.x).toBeCloseTo(-0.5)
    expect(up.y).toBeCloseTo(0.5)
  })

  it('reports a point behind the camera as nowhere, not as folded back in', () => {
    const p = projectPoint(cam, 5, 5, 10)
    expect(p.onScreen).toBe(false)
    expect([p.x, p.y]).toEqual([0, 0])
  })

  it('fills the caller\'s object, so a per-frame sweep allocates nothing', () => {
    const out = { x: 0, y: 0, onScreen: false }
    expect(projectPoint(cam, 5, 0, -10, 0, out)).toBe(out)
    expect(out.x).toBeCloseTo(0.5)
  })

  it('agrees with pointOnScreen wherever the point stands', () => {
    for (const [x, y, z] of [[0, 0, -10], [30, 0, -10], [0, 0, 10], [0, 0, -1000], [10.9, 0, -10]]) {
      expect(projectPoint(cam, x, y, z).onScreen, `${x},${y},${z}`).toBe(pointOnScreen(cam, x, y, z))
    }
  })
})

describe('isOnScreen (the installed ground test)', () => {
  it('defaults to everything off-screen with no camera mounted', () => {
    expect(isOnScreen(0, 0)).toBe(false)
  })

  it('answers from the installed test and forgets it again on clear', () => {
    setFrameVisibilityTest((x) => x > 0)
    expect(isOnScreen(1, 0)).toBe(true)
    expect(isOnScreen(-1, 0)).toBe(false)
    setFrameVisibilityTest(null)
    expect(isOnScreen(1, 0)).toBe(false)
  })
})
