// Shared helpers for the jsdom store-transition tests. The store graph is
// three-free, so its actions run directly in jsdom; terrain classification
// needs the real DEM, loaded once via setupGeodata(). A fixed seed makes the
// terrain at the marker coordinates below deterministic.
import { beforeAll } from 'vitest'
import { balance } from '../config/balance'
import { useGame } from '../state/store'
import { sampleTerrain, type TerrainType } from '../world/terrain'
import { setupGeodata } from './geodata'

export { useGame }

/** Current store state (state + actions). */
export const g = () => useGame.getState()

/** Load the real elevation dataset once before a store suite. */
export function withWorld(): void {
  beforeAll(async () => {
    await setupGeodata()
  })
}

/** The fixed run seed the marker coordinates below are validated against. */
export const TEST_SEED = 42

/**
 * Reset to a clean new game with the deterministic seed and default balance
 * flags. Tests that mutate `balance` fields must restore them themselves.
 */
export function freshGame(seed = TEST_SEED): void {
  localStorage.clear()
  useGame.getState().newGame()
  useGame.setState({ seed })
  balance.randomEventsEnabled = true
}

/** Terrain type the store sees at a coordinate under the current seed. */
export function terrainAt(lat: number, lon: number): TerrainType {
  return sampleTerrain(lat, lon, g().seed).type
}

/** Marker coordinates [lat, lon] with a stable terrain type under TEST_SEED. */
export const COORD = {
  savanna: [-2.5, 34.8] as const, // Serengeti
  desert: [24, 15] as const, // central Sahara
  jungle: [0, 22] as const, // Congo basin
  mountain: [-3.05, 37.3] as const, // Kilimanjaro massif
  water: [-1, 33] as const, // Lake Victoria (enclosed, swimmable)
  ocean: [0, -30] as const, // open Atlantic (blocked)
}

/** Put the traveller onto travel mode at a coordinate (leaves any place). */
export function jumpTo(lat: number, lon: number): void {
  if (g().mode === 'place') g().leavePlace()
  g().debugJumpTo(lat, lon)
}
