import { describe, it, expect } from 'vitest'
import * as THREE from 'three/webgpu'
import { advanceHerdGait, buildHerdParts, composeLegMatrix, herdGaitBand, herdRig, RIGGED_HERD_SPECIES, type HerdGaitCarrier } from './herdGait'
import { legSwingAngle } from '../../render/fauna'

const TUNE = { standSpeed: 0.05, maxStep: 3 }
const DT = 1 / 60

/** Walk an animal along +x at `speed` for `frames` frames; returns the phases. */
function walk(c: HerdGaitCarrier, speed: number, frames: number, cadence: number, scale = 1, x0 = 0): number[] {
  const out: number[] = []
  for (let i = 0; i <= frames; i++) out.push(advanceHerdGait(c, x0 + speed * DT * i, 0, scale, cadence, DT, true, TUNE))
  return out
}

describe('herd gait — the stride follows distance, not time (work-order 414)', () => {
  const cadence = herdRig('zebra').cadence

  it('a standing animal does not walk on the spot: speed 0 leaves the phase and the legs still', () => {
    const c: HerdGaitCarrier = {}
    const phases = walk(c, 0, 600, cadence)
    for (const p of phases) expect(p).toBe(0)
    expect(legSwingAngle(phases[phases.length - 1], 0)).toBeCloseTo(0, 12)
  })

  it('the phase advances by distance × cadence, in the rig frame (÷ scale)', () => {
    const c: HerdGaitCarrier = {}
    const phases = walk(c, 2, 60, cadence)
    expect(phases[60]).toBeCloseTo(2 * cadence, 9) // one second at 2 u/s → 2 units walked
    const big: HerdGaitCarrier = {}
    const bigPhases = walk(big, 2, 60, cadence, 2)
    expect(bigPhases[60]).toBeCloseTo(cadence, 9) // a twice-scaled body takes half the steps
  })

  it('the same distance yields the same phase however long it took', () => {
    const fast: HerdGaitCarrier = {}
    const slow: HerdGaitCarrier = {}
    const pf = walk(fast, 3, 60, cadence) // 3 units in 1 s
    const ps = walk(slow, 1, 180, cadence) // 3 units in 3 s
    expect(pf[60]).toBeCloseTo(ps[180], 9)
  })

  it('a teleport (respawn, re-seat) moves no leg', () => {
    const c: HerdGaitCarrier = {}
    advanceHerdGait(c, 0, 0, 1, cadence, DT, true, TUNE)
    const p = advanceHerdGait(c, 50, 0, 1, cadence, DT, true, TUNE)
    expect(p).toBe(0)
  })

  it('a stopped animal settles to the neutral stance and then stays there', () => {
    const c: HerdGaitCarrier = {}
    walk(c, 2, 20, cadence) // stopped mid-stride
    const x = 2 * DT * 20
    let last = NaN
    for (let i = 0; i < 120; i++) last = advanceHerdGait(c, x, 0, 1, cadence, DT, true, TUNE)
    expect(Math.abs(last / (2 * Math.PI) - Math.round(last / (2 * Math.PI)))).toBeLessThan(1e-12)
    const again = advanceHerdGait(c, x, 0, 1, cadence, DT, true, TUNE)
    expect(again).toBe(last)
  })

  it('canStep=false (a thrash, a stagger) never advances the stride', () => {
    const c: HerdGaitCarrier = {}
    for (let i = 0; i < 60; i++) advanceHerdGait(c, i * 0.05, 0, 1, cadence, DT, false, TUNE)
    expect(c.gaitDist).toBe(0)
  })
})

describe('herd gait — one rig definition per species', () => {
  it('cadence differs with leg length: the elephant steps slower per unit than the antelope', () => {
    const elephant = herdRig('elephant')
    const giraffe = herdRig('giraffe')
    const antelope = herdRig('antelope')
    expect(elephant.legLength).toBeGreaterThan(antelope.legLength)
    expect(elephant.cadence).toBeLessThan(antelope.cadence)
    expect(giraffe.cadence).toBeLessThan(antelope.cadence)
  })

  it('every rigged species builds four pivoted legs from the settlement part builders', () => {
    for (const sp of RIGGED_HERD_SPECIES) {
      const parts = buildHerdParts(sp)
      expect(parts.legs).toHaveLength(4)
      expect(herdRig(sp).cadence).toBeGreaterThan(0)
    }
  })

  it('a leg matrix is the body matrix carried to the hip and swung about local x', () => {
    const leg = buildHerdParts('zebra').legs[0]
    const body = new THREE.Matrix4().compose(new THREE.Vector3(5, 1, -3), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7), new THREE.Vector3(1.3, 1.3, 1.3))
    const m = composeLegMatrix(new THREE.Matrix4(), body, leg, 0)
    const hipWorld = new THREE.Vector3(...leg.hip).applyMatrix4(body)
    expect(new THREE.Vector3().setFromMatrixPosition(m).distanceTo(hipWorld)).toBeLessThan(1e-9)
  })
})

describe('herd gait — the distance bands sit inside the quality level', () => {
  const tune = { articulatedRadius: 60, liftRadius: 140 }
  it('off at the level means no cue at any distance', () => {
    for (const d of [0, 30, 100, 500]) expect(herdGaitBand(d, false, tune)).toBe('none')
  })
  it('on: articulated near, body lift in the middle, nothing at the horizon', () => {
    expect(herdGaitBand(10, true, tune)).toBe('articulated')
    expect(herdGaitBand(100, true, tune)).toBe('lift')
    expect(herdGaitBand(300, true, tune)).toBe('none')
  })
})
