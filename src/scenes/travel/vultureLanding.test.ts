// A vulture's visible landing and take-off (design.md §19.6): the pure landing
// profile, the take-off profile and the per-bird transition machine shared by
// the kill flock and the ground scavenger.
import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import {
  birdLandStep,
  flockLandProgress,
  landingProfile,
  makeBirdLandState,
  takeoffProfile,
  type Vec3,
} from './vultureLanding'

const cfg = balance.vultureLanding
const STEPS = 240

describe('landingProfile', () => {
  const samples = Array.from({ length: STEPS + 1 }, (_, i) => landingProfile((i / STEPS) * cfg.landSeconds, cfg))

  it('lasts long enough to read at bird’s-eye distance', () => {
    expect(cfg.landSeconds).toBeGreaterThanOrEqual(2)
  })

  it('height decreases strictly to the landed height across the window', () => {
    expect(samples[0].height).toBeCloseTo(1, 9)
    for (let i = 1; i < samples.length; i++) expect(samples[i].height).toBeLessThan(samples[i - 1].height)
    expect(samples[samples.length - 1].height).toBe(0)
  })

  it('the bird closes in along its heading with decreasing forward speed', () => {
    expect(samples[0].rem).toBeCloseTo(1, 9)
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].rem).toBeLessThan(samples[i - 1].rem)
      expect(samples[i].speed).toBeLessThan(samples[i - 1].speed)
      // The covered distance per step shrinks too (the speed is what is drawn).
      if (i > 1) expect(samples[i - 1].rem - samples[i].rem).toBeLessThan(samples[i - 2].rem - samples[i - 1].rem + 1e-12)
    }
    expect(samples[samples.length - 1].rem).toBe(0)
    expect(samples[samples.length - 1].speed).toBeCloseTo(cfg.touchdownSpeedRatio, 9)
  })

  it('the flare fires only in the last phase and is full at touchdown', () => {
    const flareStart = (1 - cfg.flareFraction) * cfg.landSeconds
    for (let i = 0; i <= STEPS; i++) {
      const t = (i / STEPS) * cfg.landSeconds
      const s = samples[i]
      if (t <= flareStart) {
        expect(s.flare).toBe(0)
        expect(s.phase).toBe('glide')
      }
    }
    expect(landingProfile(flareStart + cfg.landSeconds * 0.01, cfg).phase).toBe('flare')
    expect(landingProfile(cfg.landSeconds * 0.999, cfg).flare).toBeGreaterThan(0.95)
    expect(landingProfile(cfg.landSeconds, cfg).phase).toBe('landed')
  })
})

describe('takeoffProfile', () => {
  it('runs on the ground first, then climbs with rising speed and beating wings', () => {
    const run = cfg.takeoffRunFraction * cfg.takeoffSeconds
    let prev = takeoffProfile(0, cfg)
    expect(prev.along).toBe(0)
    let up = 0
    let down = 0
    for (let i = 1; i <= STEPS; i++) {
      const t = (i / STEPS) * cfg.takeoffSeconds
      const s = takeoffProfile(t, cfg)
      if (t < run) {
        expect(s.height).toBe(0)
        expect(s.phase).toBe('run')
      }
      expect(s.along).toBeGreaterThan(prev.along)
      expect(s.speed).toBeGreaterThan(prev.speed)
      expect(s.height).toBeGreaterThanOrEqual(prev.height)
      if (s.phase !== 'air') (s.wingsUp ? up++ : down++)
      prev = s
    }
    expect(prev.phase).toBe('air')
    expect(prev.along).toBe(1)
    expect(prev.height).toBe(1)
    expect(up).toBeGreaterThan(0)
    expect(down).toBeGreaterThan(0)
  })
})

describe('birdLandStep', () => {
  const air: Vec3 = { x: -20, y: 9, z: 0 }
  const ground: Vec3 = { x: 0, y: 0.3, z: 0 }
  const dt = 1 / 60

  it('lands from its last flight pose without a single-frame snap and ends standing', () => {
    const s = makeBirdLandState()
    birdLandStep(s, false, air, ground, dt, cfg)
    let last = { x: air.x, y: air.y }
    let maxJump = 0
    let distinctHeights = 0
    let sawFlare = false
    for (let i = 0; i < (cfg.landSeconds / dt) + 5; i++) {
      const p = birdLandStep(s, true, air, ground, dt, cfg)
      maxJump = Math.max(maxJump, Math.hypot(p.x - last.x, p.y - last.y))
      if (Math.abs(p.y - last.y) > 1e-6 && p.y > ground.y && p.y < air.y) distinctHeights++
      if (p.flare > 0 && p.phase === 'landing') sawFlare = true
      last = p
    }
    expect(s.phase).toBe('ground')
    expect(last.y).toBe(ground.y)
    expect(distinctHeights).toBeGreaterThan(30)
    expect(maxJump).toBeLessThan(0.5)
    expect(sawFlare).toBe(true)
  })

  it('takes off by a committed run into the climb and joins its flight', () => {
    const s = makeBirdLandState()
    s.phase = 'ground'
    birdLandStep(s, true, air, ground, dt, cfg)
    const first = birdLandStep(s, false, air, ground, dt, cfg)
    expect(first.phase).toBe('takeoff')
    expect(first.y).toBe(ground.y)
    // A renewed wish to land does not break off the take-off.
    let p = first
    for (let i = 0; i < (cfg.takeoffSeconds / dt) * 0.5; i++) p = birdLandStep(s, true, air, ground, dt, cfg)
    expect(p.phase).toBe('takeoff')
    for (let i = 0; i < cfg.takeoffSeconds / dt + 5; i++) p = birdLandStep(s, false, air, ground, dt, cfg)
    expect(p.phase).toBe('air')
    expect(p.y).toBe(air.y)
  })

  it('a broken-off landing climbs away from where it was, not from the start', () => {
    const s = makeBirdLandState()
    birdLandStep(s, false, air, ground, dt, cfg)
    let p = birdLandStep(s, true, air, ground, dt, cfg)
    for (let i = 0; i < (cfg.landSeconds / dt) * 0.5; i++) p = birdLandStep(s, true, air, ground, dt, cfg)
    const q = birdLandStep(s, false, air, ground, dt, cfg)
    expect(q.phase).toBe('takeoff')
    expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThan(1e-9)
  })

  it('flock progress runs 0 → 1 across a landing', () => {
    const states = [makeBirdLandState(), makeBirdLandState()]
    expect(flockLandProgress(states, cfg)).toBe(0)
    for (const s of states) birdLandStep(s, true, air, ground, dt, cfg)
    for (let i = 0; i < cfg.landSeconds / dt / 2; i++) for (const s of states) birdLandStep(s, true, air, ground, dt, cfg)
    const mid = flockLandProgress(states, cfg)
    expect(mid).toBeGreaterThan(0.3)
    expect(mid).toBeLessThan(0.7)
    for (let i = 0; i < cfg.landSeconds / dt; i++) for (const s of states) birdLandStep(s, true, air, ground, dt, cfg)
    expect(flockLandProgress(states, cfg)).toBe(1)
  })
})
