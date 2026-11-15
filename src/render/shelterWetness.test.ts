import { describe, expect, it } from 'vitest'
import { balance } from '../config/balance'
import {
  clampShelterStrength,
  clearShelterMask,
  MAX_SHELTER_STRENGTH,
  setShelterLook,
  setShelterMask,
  SHELTER_MASK_SIZE,
  shelteredWetNode,
  shelteredGroundWetnessAt,
  shelteredWetness,
  shelterWetState,
} from './shelterWetness'
import { setGroundWetness } from './seasonTint'

const S = balance.rain.shelterStrength
const D = balance.rain.dripBoost

describe('shelteredWetness — less wet, not dry', () => {
  it('the configured shelter strength lies strictly between 0 and 1', () => {
    expect(S).toBeGreaterThan(0)
    expect(S).toBeLessThan(1)
    expect(MAX_SHELTER_STRENGTH).toBeLessThan(1)
  })

  it('full shelter is strictly between zero and the open-ground value', () => {
    for (const open of [0.05, 0.4, 1]) {
      for (const s of [S, MAX_SHELTER_STRENGTH, 1, 5]) {
        const w = shelteredWetness(open, 1, 0, s, D)
        expect(w).toBeGreaterThan(0)
        expect(w).toBeLessThan(open)
      }
    }
  })

  it('equals the open value everywhere when the shelter strength is zero', () => {
    for (const open of [0, 0.3, 1]) {
      for (const cover of [0, 0.5, 1]) expect(shelteredWetness(open, cover, 0, 0, D)).toBe(open)
    }
  })

  it('with no rain the mask makes no difference anywhere: 0 times anything is 0', () => {
    for (const cover of [0, 0.5, 1]) {
      for (const drip of [0, 0.5, 1]) {
        expect(shelteredWetness(0, cover, drip, S, D)).toBe(0)
        expect(shelteredWetness(0, cover, drip, 1, 10)).toBe(0)
      }
    }
  })

  it('the drip band reads wetter than the open ground', () => {
    expect(shelteredWetness(0.6, 0, 1, S, D)).toBeGreaterThan(0.6)
  })

  it('clamps strength into [0, MAX_SHELTER_STRENGTH]', () => {
    expect(clampShelterStrength(-1)).toBe(0)
    expect(clampShelterStrength(1)).toBe(MAX_SHELTER_STRENGTH)
    expect(clampShelterStrength(Number.NaN)).toBe(0)
  })
})

describe('shelter mask upload and look', () => {
  it('encodes cover in R and drip in G', () => {
    const n = SHELTER_MASK_SIZE * SHELTER_MASK_SIZE
    const cover = new Float32Array(n)
    const drip = new Float32Array(n)
    cover[5] = 1
    drip[7] = 0.5
    setShelterMask({ size: SHELTER_MASK_SIZE, extent: 42, cover, drip })
    const st = shelterWetState()
    expect(st.extent).toBe(42)
    expect(st.data[5 * 4]).toBe(255)
    expect(st.data[7 * 4 + 1]).toBe(128)
    clearShelterMask()
    expect(shelterWetState().data[5 * 4]).toBe(0)
  })

  it('drives the clamped look and builds the ground node', () => {
    setShelterLook({ shelterStrength: 3, dripBoost: -1 })
    expect(shelterWetState().strength).toBe(MAX_SHELTER_STRENGTH)
    expect(shelterWetState().dripBoost).toBe(0)
    setShelterLook(balance.rain)
    expect(shelterWetState().strength).toBe(S)
    expect(shelteredWetNode()).toBeTruthy()
  })
})

describe('shelteredGroundWetnessAt — the wetness a walker\'s foot reads (design.md §19.10)', () => {
  it('reads open ground in full, covered ground less wet, and dry ground dry', () => {
    const n = SHELTER_MASK_SIZE
    const cover = new Float32Array(n * n)
    const drip = new Float32Array(n * n)
    // Cover the cell at the origin of a 10 m mask.
    const c = Math.round(0.5 * n - 0.5)
    cover[c * n + c] = 1
    setShelterMask({ size: n, extent: 10, cover, drip })
    setShelterLook({ shelterStrength: 0.8, dripBoost: 0 })
    setGroundWetness(0.6)
    expect(shelteredGroundWetnessAt(5, 5)).toBeCloseTo(0.6, 6)
    expect(shelteredGroundWetnessAt(50, 50)).toBeCloseTo(0.6, 6)
    expect(shelteredGroundWetnessAt(0, 0)).toBeCloseTo(0.6 * (1 - 0.8 * 0.25), 6)
    // The covered cell's own centre reads it in full.
    const centre = ((c + 0.5) / n) * 20 - 10
    expect(shelteredGroundWetnessAt(centre, centre)).toBeCloseTo(0.6 * (1 - 0.8), 6)
    setGroundWetness(0)
    expect(shelteredGroundWetnessAt(5, 5)).toBe(0)
    clearShelterMask()
    setShelterLook(balance.rain)
  })

  it('blends the four nearest cells like the linear-filtered texture, clamped at the edge', () => {
    const n = SHELTER_MASK_SIZE
    const cover = new Float32Array(n * n)
    const drip = new Float32Array(n * n)
    // A covered 2x2 block left of a cell boundary, and the mask's last column covered.
    const c = Math.round(0.5 * n - 0.5)
    for (const [i, j] of [[c, c], [c, c + 1], [c - 1, c], [c - 1, c + 1]]) cover[j * n + i] = 1
    for (let j = 0; j < n; j++) cover[j * n + n - 1] = 1
    setShelterMask({ size: n, extent: 10, cover, drip })
    setShelterLook({ shelterStrength: 0.8, dripBoost: 0 })
    setGroundWetness(0.6)
    const cell = 20 / n
    const centreX = ((c + 0.5) / n) * 20 - 10
    const centreZ = ((c + 1) / n) * 20 - 10
    // Halfway from the covered column c to the open column c + 1: half the cover.
    expect(shelteredGroundWetnessAt(centreX + cell / 2, centreZ)).toBeCloseTo(0.6 * (1 - 0.8 * 0.5), 2)
    // A quarter of the way: three quarters of the cover.
    expect(shelteredGroundWetnessAt(centreX + cell / 4, centreZ)).toBeCloseTo(0.6 * (1 - 0.8 * 0.75), 2)
    // Past the mask's edge the edge cells hold, as ClampToEdge does on the GPU.
    expect(shelteredGroundWetnessAt(50, 0)).toBeCloseTo(0.6 * (1 - 0.8), 6)
    setGroundWetness(0)
    clearShelterMask()
    setShelterLook(balance.rain)
  })
})
