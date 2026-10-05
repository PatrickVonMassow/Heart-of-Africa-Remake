import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import * as THREE from 'three'
import {
  CAMERA_OFFSET,
  followAt,
  followPointFromTop,
  followPose,
  groundReach,
  southReachShift,
  stepFollow,
  type FollowState,
} from './followCamera'

const OFFSET = { y: 42, z: 24 }
const CFG = balance.travelCameraFollow
const SPEED = balance.travelSpeed

/** Unit vector from camera to aim point. */
function viewDir(s: FollowState): [number, number, number] {
  const { position: p, target: t } = followPose(s, OFFSET)
  const d = [t[0] - p[0], t[1] - p[1], t[2] - p[2]]
  const n = Math.hypot(d[0], d[1], d[2])
  return [d[0] / n, d[1] / n, d[2] / n]
}

/** Walks (dx, dz) at travel speed for `seconds` at `fps`, then stands for `rest` seconds; returns every frame's state. */
function walk(dx: number, dz: number, seconds: number, fps: number, rest = 0): FollowState[] {
  const dt = 1 / fps
  let x = 0
  let z = 0
  let s = followAt(0, 0, 1)
  const out: FollowState[] = []
  for (let i = 0; i < Math.round((seconds + rest) * fps); i++) {
    if (i * dt < seconds) {
      x += dx * SPEED * dt
      z += dz * SPEED * dt
    }
    s = stepFollow(s, x, z, 1, dt, CFG)
    out.push(s)
  }
  return out
}

describe('bird\'s-eye follow camera (point 1286)', () => {
  const rest = viewDir(followAt(0, 0, 1))

  it('keeps the viewing angle constant in every walking direction and on a stop', () => {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, -1], [0, 1], [Math.SQRT1_2, Math.SQRT1_2]]) {
      for (const s of walk(dx, dz, 2, 60, 1)) {
        const d = viewDir(s)
        expect(d[0]).toBeCloseTo(rest[0], 9)
        expect(d[1]).toBeCloseTo(rest[1], 9)
        expect(d[2]).toBeCloseTo(rest[2], 9)
      }
    }
  })

  it('lags the same distance at 30 and at 60 fps', () => {
    const lag = (fps: number) => {
      const last = walk(1, 0, 2, fps).at(-1)!
      return 2 * SPEED - last.x
    }
    expect(lag(60)).toBeGreaterThan(0.3)
    // The former per-frame lerp roughly doubled its lag at 30 fps; what is left
    // here is only the sampling of a moving target once per frame (~7 %).
    expect(Math.abs(lag(30) - lag(60))).toBeLessThan(0.1 * lag(60))
  })

  it('matches the former 0.12-per-frame feel at 60 fps', () => {
    const s = stepFollow(followAt(0, 0, 1), 10, 0, 1, 1 / 60, CFG)
    expect(s.x).toBeCloseTo(1.2, 2)
  })

  it('settles a stationary target in the same wall-clock time at 5 and at 60 fps', () => {
    const settle = (fps: number) => {
      let s = followAt(0, 0, 1)
      for (let i = 0; i < fps * 0.4; i++) s = stepFollow(s, 10, 0, 2, 1 / fps, CFG)
      return s
    }
    expect(settle(5).x).toBeCloseTo(settle(60).x, 9)
    expect(settle(5).zoom).toBeCloseTo(settle(60).zoom, 9)
  })

  it('comes to rest on the traveller after a stop', () => {
    const last = walk(0, -1, 1, 60, 2).at(-1)!
    expect(last.z).toBeCloseTo(-SPEED, 3)
    expect(last.x).toBeCloseTo(0, 6)
  })

  it('snaps on a jump instead of sliding across the map', () => {
    const s = stepFollow(followAt(0, 0, 1), 500, -300, 1.5, 1 / 60, CFG)
    expect(s).toEqual({ x: 500, z: -300, zoom: 1.5 })
  })
})

/** A 16:9 fov-50 camera placed by followPose. */
function poseCamera(s: FollowState, shift: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 2000)
  const { position, target } = followPose(s, CAMERA_OFFSET, shift)
  cam.position.set(...position)
  cam.lookAt(...target)
  cam.updateMatrixWorld()
  return cam
}

/** Flat-ground reach of the rendered centre column, north (-z) and south (+z) of z. */
function renderedReach(cam: THREE.PerspectiveCamera, z: number): { north: number; south: number } {
  const hit = (ndcY: number) => {
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(0, ndcY), cam)
    const t = -ray.ray.origin.y / ray.ray.direction.y
    return ray.ray.origin.z + ray.ray.direction.z * t
  }
  return { north: z - hit(1), south: hit(-1) - z }
}

describe('bird\'s-eye south reach (design.md §2.1)', () => {
  const full = southReachShift(CAMERA_OFFSET, 50, 1)

  it('needs about 7.5 units of shift for full compensation at fov 50', () => {
    expect(full).toBeGreaterThan(7)
    expect(full).toBeLessThan(8)
    const r = groundReach(CAMERA_OFFSET, 50)
    expect(r.north / r.south).toBeGreaterThan(1.6) // the uncompensated 1.7 : 1
  })

  it('reaches equally far north and south of the traveller on flat ground at full compensation', () => {
    const r = renderedReach(poseCamera(followAt(3, -5, 1), full), -5)
    expect(r.north).toBeCloseTo(r.south, 6)
    expect(r.north).toBeGreaterThan(27)
    expect(r.north).toBeLessThan(29)
  })

  it('halves the asymmetry at compensation 0.5', () => {
    const r0 = renderedReach(poseCamera(followAt(0, 0, 1), 0), 0)
    const r = renderedReach(poseCamera(followAt(0, 0, 1), southReachShift(CAMERA_OFFSET, 50, 0.5)), 0)
    expect(r.north - r.south).toBeCloseTo((r0.north - r0.south) / 2, 6)
  })

  it('keeps the tilt unchanged', () => {
    const d0 = poseCamera(followAt(0, 0, 1), 0).getWorldDirection(new THREE.Vector3())
    const d1 = poseCamera(followAt(0, 0, 1), full).getWorldDirection(new THREE.Vector3())
    expect(d1.x).toBeCloseTo(d0.x, 9)
    expect(d1.y).toBeCloseTo(d0.y, 9)
    expect(d1.z).toBeCloseTo(d0.z, 9)
  })

  it('puts the traveller above the picture centre, about 37 % from the top', () => {
    const p = new THREE.Vector3(0, 0, 0).project(poseCamera(followAt(0, 0, 1), full))
    expect(p.x).toBeCloseTo(0, 9)
    const fromTop = (1 - p.y) / 2
    expect(fromTop).toBeGreaterThan(0.35)
    expect(fromTop).toBeLessThan(0.39)
  })

  it('scales the shift with the zoom like the offset, keeping the traveller at the same picture height', () => {
    for (const zoom of [0.5, 1, 2.5]) {
      const s = followAt(10, 20, zoom)
      const { position, target } = followPose(s, CAMERA_OFFSET, full)
      expect(target[2] - s.z).toBeCloseTo(full * zoom, 9)
      expect(position[2] - target[2]).toBeCloseTo(CAMERA_OFFSET.z * zoom, 9)
      expect(position[1]).toBeCloseTo(CAMERA_OFFSET.y * zoom, 9)
      const r = renderedReach(poseCamera(s, full), 20)
      expect(r.north).toBeCloseTo(r.south, 6)
      const p = new THREE.Vector3(10, 0, 20).project(poseCamera(s, full))
      const ref = new THREE.Vector3(0, 0, 0).project(poseCamera(followAt(0, 0, 1), full))
      expect(p.y).toBeCloseTo(ref.y, 6)
    }
  })

  it('predicts the traveller\'s picture row in closed form (the enter hint anchors on it)', () => {
    for (const c of [0, 0.5, 1]) {
      const shift = southReachShift(CAMERA_OFFSET, 50, c)
      const p = new THREE.Vector3(0, 0, 0).project(poseCamera(followAt(0, 0, 1), shift))
      expect(followPointFromTop(CAMERA_OFFSET, 50, shift)).toBeCloseTo((1 - p.y) / 2, 9)
    }
    expect(followPointFromTop(CAMERA_OFFSET, 50, 0)).toBeCloseTo(0.5, 12)
  })

  // The evidence for every traveller-centred consumer (seeders' rings, streaming
  // windows, despawn rings, the nearest-first hunt pick): the picture is the
  // old one translated south, so the frame's FARTHEST ground point from the
  // traveller only comes closer and its NEAREST edge only moves away. A ring
  // that cleared the old frame still clears it; "near the traveller" is in the
  // picture in more directions than before.
  it('shrinks the frame\'s farthest ground reach from the traveller and widens its nearest edge', () => {
    const footprint = (aspect: number, zoom: number, c: number) => {
      const cam = poseCamera(followAt(0, 0, zoom), southReachShift(CAMERA_OFFSET, 50, c))
      cam.aspect = aspect
      cam.updateProjectionMatrix()
      const ray = new THREE.Raycaster()
      let far = 0
      let near = Infinity
      for (let i = 0; i <= 40; i++) {
        const u = -1 + i / 20
        for (const [nx, ny] of [[u, 1], [u, -1], [1, u], [-1, u]]) {
          ray.setFromCamera(new THREE.Vector2(nx, ny), cam)
          const t = -ray.ray.origin.y / ray.ray.direction.y
          const d = Math.hypot(ray.ray.origin.x + ray.ray.direction.x * t, ray.ray.origin.z + ray.ray.direction.z * t)
          far = Math.max(far, d)
          near = Math.min(near, d)
        }
      }
      return { far, near }
    }
    for (const aspect of [9 / 16, 4 / 3, 16 / 9, 21 / 9]) {
      for (const zoom of [0.125, 0.5, 1, 2.5]) {
        const old = footprint(aspect, zoom, 0)
        for (const c of [0.5, 1]) {
          const now = footprint(aspect, zoom, c)
          expect(now.far).toBeLessThanOrEqual(old.far + 1e-9)
          expect(now.near).toBeGreaterThanOrEqual(old.near - 1e-9)
        }
      }
    }
    // At zoom 1 on 16:9: the old 20.5-unit south edge becomes 28.
    expect(footprint(16 / 9, 1, 0).near).toBeCloseTo(20.5, 0)
    expect(footprint(16 / 9, 1, 1).near).toBeCloseTo(28, 0)
  })

  it('leaves the pose centred without a shift', () => {
    const { target } = followPose(followAt(4, 6, 1.5), CAMERA_OFFSET)
    expect(target).toEqual([4, 0, 6])
  })
})
