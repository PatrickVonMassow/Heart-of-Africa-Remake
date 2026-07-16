// The per-position season field (point 151): the travel scene's flora and
// ground sample THIS, never the player's position — the regression these
// tests pin is the "flying plants" bug, where one global uniform followed
// the traveller across wetness gradients and zone borders.
import { describe, expect, it, beforeAll } from 'vitest'
import {
  FIELD_H,
  FIELD_W,
  seasonFieldGreens,
  seasonFieldTintAt,
  seasonFieldUV,
  updateSeasonField,
} from './seasonField'
import { SEASON_SLOTS, seasonSlotAt, slotGreenness, floraGreennessAt } from '../systems/season'
import { elevationAt } from '../world/geodata'
import { setupGeodata } from '../test/geodata'

const START_YEAR = 1890
const AUG = 227 // mid-August day-of-year — deep Sahel rains
const JAN = 15

beforeAll(async () => {
  await setupGeodata()
})

describe('season slots (point 151)', () => {
  it('slot 0 is hyper-arid and wins over the zone at Cairo', () => {
    expect(SEASON_SLOTS[0]).toBe('hyper-arid')
    expect(seasonSlotAt(30.05, 31.55, elevationAt(30.05, 31.55))).toBe(0)
  })

  it('per-slot greenness equals floraGreennessAt at sample points', () => {
    // The field's slot curve must be the SAME curve the per-position helper
    // uses — otherwise field and model drift apart.
    for (const [lat, lon] of [
      [13.4, 31.8], // the user's Gezira spot (Sahel edge)
      [0, 22], // Congo
      [-2.5, 34.8], // Serengeti (east-rift)
      [30.05, 31.55], // Cairo (hyper-arid: 0 year round)
    ] as const) {
      const slot = seasonSlotAt(lat, lon, elevationAt(lat, lon))
      for (const day of [JAN, AUG]) {
        expect(slotGreenness(day, slot, START_YEAR, null)).toBeCloseTo(
          floraGreennessAt(day, lat, lon, START_YEAR, elevationAt(lat, lon)),
          9,
        )
      }
    }
  })

  it('the debug override fills every slot, including hyper-arid', () => {
    for (let slot = 0; slot < SEASON_SLOTS.length; slot++) {
      expect(slotGreenness(AUG, slot, START_YEAR, 1)).toBe(1)
      expect(slotGreenness(AUG, slot, START_YEAR, 0)).toBe(0)
    }
  })
})

describe('the greenness field (point 151)', () => {
  it('has the expected extent and maps positions into it', () => {
    expect(FIELD_W).toBe(150)
    expect(FIELD_H).toBe(148)
    const [u, v] = seasonFieldUV(1, 17.5) // mid-continent
    expect(u).toBeGreaterThan(0.4)
    expect(u).toBeLessThan(0.6)
    expect(v).toBeGreaterThan(0.4)
    expect(v).toBeLessThan(0.6)
  })

  it('a zone border reads as a GRADIENT: the between-texel lies between its sides', () => {
    // blend 1 snaps the lerp so the assertion sees the calendar values.
    updateSeasonField(AUG, START_YEAR, null, 1, 1)
    // Walk south-to-north across the Sahel -> south-Sahara border along 0°E
    // in August: greens fade toward the desert, and no neighbouring sample
    // pair jumps by more than a fraction of the total swing (the user's
    // "nicht schlagartig").
    const samples: number[] = []
    for (let lat = 12; lat <= 22; lat += 0.5) samples.push(seasonFieldTintAt(lat, 0))
    const total = Math.abs(samples[samples.length - 1] - samples[0])
    expect(total).toBeGreaterThan(0.1) // the border genuinely changes the look
    let maxStep = 0
    for (let i = 1; i < samples.length; i++) maxStep = Math.max(maxStep, Math.abs(samples[i] - samples[i - 1]))
    expect(maxStep).toBeLessThan(total * 0.35) // spread over >= ~3 samples, no cliff
  })

  it('the override floods the whole field wet and dry', () => {
    updateSeasonField(AUG, START_YEAR, 1, 1, 1)
    expect(seasonFieldTintAt(13.4, 31.8)).toBeGreaterThan(0.9)
    expect(seasonFieldTintAt(30.05, 31.55)).toBeGreaterThan(0.9)
    updateSeasonField(AUG, START_YEAR, 0, 1, 1)
    expect(seasonFieldTintAt(13.4, 31.8)).toBeLessThan(0.1)
  })

  it('strength 0 pins the whole field to neutral', () => {
    updateSeasonField(AUG, START_YEAR, null, 0, 1)
    expect(seasonFieldTintAt(13.4, 31.8)).toBeCloseTo(0.5, 1)
    expect(seasonFieldTintAt(0, 22)).toBeCloseTo(0.5, 1)
  })

  it('the field is a pure function of the CALENDAR — the greens carry no position', () => {
    // The API itself is the witness: updateSeasonField takes (day, override,
    // strength) and nothing else varies — assert the greens only move when
    // the day does.
    updateSeasonField(AUG, START_YEAR, null, 1, 1)
    const a = seasonFieldGreens()
    updateSeasonField(AUG, START_YEAR, null, 1, 1)
    const b = seasonFieldGreens()
    expect(b).toEqual(a)
    updateSeasonField(JAN, START_YEAR, null, 1, 1)
    const c = seasonFieldGreens()
    expect(c).not.toEqual(a)
  })
})
