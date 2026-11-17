import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { dropBases } from './rainTouch'
import {
  BASE_FALL_SPEED,
  BASE_LAYER_RADIUS_M,
  cameraVelocity,
  easeVelocity,
  layerOfDrop,
  layeredDropBases,
  layeredPeriods,
  rainLayerSpecs,
  streakEndFade,
  streakVector,
} from './rainLayers'

const D = balance.rainDepth

describe('settlement rain layers (design.md §19.13)', () => {
  it('one layer is exactly the earlier single curtain', () => {
    expect(rainLayerSpecs(1)).toEqual([{ radiusM: BASE_LAYER_RADIUS_M, innerFadeM: 0, fallSpeed: BASE_FALL_SPEED, opacity: 1 }])
    expect(Array.from(layeredDropBases(64, rainLayerSpecs(1)))).toEqual(Array.from(dropBases(64, BASE_LAYER_RADIUS_M)))
    expect(Array.from(layeredPeriods(4, rainLayerSpecs(1)))).toEqual([32, 32, 32, 32])
  })

  it('layers sit at growing distances and fall slower the farther they are', () => {
    for (const n of [2, 3]) {
      const s = rainLayerSpecs(n)
      expect(s).toHaveLength(n)
      for (let i = 1; i < n; i++) {
        expect(s[i].radiusM).toBeGreaterThan(s[i - 1].radiusM)
        expect(s[i].innerFadeM).toBeGreaterThan(s[i - 1].innerFadeM)
        expect(s[i].fallSpeed).toBeLessThan(s[i - 1].fallSpeed)
      }
    }
    expect(rainLayerSpecs(0)).toHaveLength(1)
    expect(rainLayerSpecs(9)).toHaveLength(3)
  })

  it('the layers share the drop count (no extra particles), each within its column', () => {
    const specs = rainLayerSpecs(3)
    const n = 300
    const bases = layeredDropBases(n, specs)
    const periods = layeredPeriods(n, specs)
    expect(bases).toHaveLength(n * 2)
    const per = [0, 0, 0]
    for (let k = 0; k < n; k++) {
      const l = layerOfDrop(k, 3)
      per[l]++
      expect(Math.abs(bases[k * 2])).toBeLessThanOrEqual(specs[l].radiusM)
      expect(Math.abs(bases[k * 2 + 1])).toBeLessThanOrEqual(specs[l].radiusM)
      expect(periods[k]).toBe(specs[l].radiusM * 2)
    }
    expect(per).toEqual([100, 100, 100])
  })

  it('a standing camera sees the plain fall streak, straight up', () => {
    const s = streakVector(BASE_FALL_SPEED, [0, 0, 0], D.exposureS, D.streakMinM, D.streakMaxM)
    expect(s.length).toBeCloseTo(BASE_FALL_SPEED * D.exposureS, 9)
    expect(s.length).toBeCloseTo(0.35, 9) // the earlier fixed streak
    expect(s.dir.map((c) => c + 0)).toEqual([0, 1, 0])
  })

  it('the streak length follows the speed relative to the camera', () => {
    const still = streakVector(20, [0, 0, 0], D.exposureS, 0, 10).length
    const walking = streakVector(20, [3, 0, 0], D.exposureS, 0, 10)
    const rising = streakVector(20, [0, 2, 0], D.exposureS, 0, 10).length
    const sinking = streakVector(20, [0, -2, 0], D.exposureS, 0, 10).length
    expect(walking.length).toBeGreaterThan(still)
    expect(rising).toBeGreaterThan(still)
    expect(sinking).toBeLessThan(still)
    // Walking +x, the trail leans toward +x (the drop sweeps back past the eye).
    expect(walking.dir[0]).toBeGreaterThan(0)
    // Faster layers draw longer streaks.
    expect(streakVector(24, [0, 0, 0], D.exposureS, 0, 10).length).toBeGreaterThan(streakVector(15, [0, 0, 0], D.exposureS, 0, 10).length)
    // Clamped either way.
    expect(streakVector(20, [0, 500, 0], D.exposureS, D.streakMinM, D.streakMaxM).length).toBe(D.streakMaxM)
    expect(streakVector(20, [0, -20, 0], D.exposureS, D.streakMinM, D.streakMaxM).length).toBe(D.streakMinM)
    // Cancelled relative speed: the shortest streak stands upright (the shader's fallback).
    expect(streakVector(20, [0, -20, 0], D.exposureS, D.streakMinM, D.streakMaxM).dir).toEqual([0, 1, 0])
  })

  it('a stalled camera does not stretch a drop', () => {
    const p: [number, number, number] = [1, 1.5, 2]
    const q: [number, number, number] = [4, 1.5, 2]
    // A paused frame (dt 0) or a sub-tick frame moving the camera reads as standing.
    expect(cameraVelocity(p, q, 0, D.maxCameraSpeed)).toEqual([0, 0, 0])
    expect(cameraVelocity(p, q, 1e-6, D.maxCameraSpeed)).toEqual([0, 0, 0])
    expect(cameraVelocity(p, q, Number.NaN, D.maxCameraSpeed)).toEqual([0, 0, 0])
    // Standing still over a real frame: zero.
    expect(cameraVelocity(p, p, 1 / 60, D.maxCameraSpeed)).toEqual([0, 0, 0])
    // A jump (teleport) is clamped to the max camera speed.
    const jump = cameraVelocity(p, [500, 1.5, 2], 1 / 60, D.maxCameraSpeed)
    expect(Math.hypot(...jump)).toBeCloseTo(D.maxCameraSpeed, 9)
    // So a standing streak keeps its plain length, and no frame exceeds the clamp.
    const s = streakVector(BASE_FALL_SPEED, cameraVelocity(p, q, 0, D.maxCameraSpeed), D.exposureS, D.streakMinM, D.streakMaxM)
    expect(s.length).toBeCloseTo(0.35, 9)
    const worst = streakVector(BASE_FALL_SPEED, [0, -D.maxCameraSpeed, 0], D.exposureS, 0, 99).length
    expect(worst).toBeLessThanOrEqual((BASE_FALL_SPEED + D.maxCameraSpeed) * D.exposureS + 1e-12)
  })

  it('the camera velocity eases toward its target', () => {
    const v = easeVelocity([0, 0, 0], [3, 0, 0], 1 / 60, D.cameraVelocityTauS)
    expect(v[0]).toBeGreaterThan(0)
    expect(v[0]).toBeLessThan(3)
    expect(easeVelocity([1, 1, 1], [3, 0, 0], 0, D.cameraVelocityTauS)).toEqual([1, 1, 1])
  })

  it('a streak has soft ends, not a hard rectangle', () => {
    expect(streakEndFade(0, D.headSoft, D.tailSoft)).toBe(0)
    expect(streakEndFade(1, D.headSoft, D.tailSoft)).toBe(0)
    expect(streakEndFade(D.headSoft, D.headSoft, D.tailSoft)).toBe(1)
    expect(streakEndFade(0.3, D.headSoft, D.tailSoft)).toBeGreaterThan(streakEndFade(0.8, D.headSoft, D.tailSoft))
  })
})
