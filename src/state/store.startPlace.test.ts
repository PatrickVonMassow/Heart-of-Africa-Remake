import { describe, expect, it } from 'vitest'
import { startState } from './store'
import { placeById } from '../world/geo'

describe('startState honours the debug start place', () => {
  it('opens in Cairo by default — design.md fixes the start and nothing may move it silently', () => {
    const s = startState(1)
    expect(s.placeId).toBe('cairo')
    expect(s.region).toBe('north')
  })

  it('opens in the named place, with its own region', () => {
    const s = startState(1, 'bambara-village')
    const village = placeById('bambara-village')
    expect(s.placeId).toBe('bambara-village')
    expect(s.region).toBe(village.region)
    expect(s.visitedRegions).toEqual([village.region])
  })

  it('marks the start place discovered — standing in a settlement whose name is hidden is unreachable by play', () => {
    const s = startState(1, 'bambara-village')
    expect(s.visitedPlaces).toContain('bambara-village')
    // and the ports stay known, as they are from any start
    expect(s.visitedPlaces).toContain('cairo')
  })

  it('does not seed the start place as ARRIVED, so walking in still writes its vignette', () => {
    expect(startState(1, 'bambara-village').enteredPlaces).toEqual([])
  })

  it('explores the map around the start place, not around Cairo', () => {
    const here = startState(1, 'bambara-village').explored
    const cairo = startState(1, 'cairo').explored
    expect(Object.keys(here).length).toBeGreaterThan(0)
    expect(here).not.toEqual(cairo)
  })
})
