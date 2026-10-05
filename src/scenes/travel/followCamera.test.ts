import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { followAt, followPose, stepFollow, type FollowState } from './followCamera'

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
