// Shared helpers for the jsdom store-transition tests. The store graph is
// three-free, so its actions run directly in jsdom; terrain classification
// needs the real DEM, loaded once via setupGeodata(). A fixed seed makes the
// terrain at the marker coordinates below deterministic.
import { beforeAll } from 'vitest'
import { balance } from '../config/balance'
import { useGame } from '../state/store'
import { sampleTerrain, type TerrainType } from '../world/terrain'
import { setupGeodata } from './geodata'
import { clearChiefStanding, setChiefStanding } from '../scenes/place/chiefPresence'
import { placePlayerPosition } from '../scenes/place/playerPosition'

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
 * Reset to a clean new game with the deterministic seed and MECHANICS-ACTIVE
 * balance flags. The demo start preset (point 104) relaxes the shipped
 * DEFAULTS — events off, zero hunger/thirst, a full starting kit — but the
 * store tests exercise the survival MECHANICS, so a fresh test game restores
 * the non-zero rates and an empty pack. The start preset itself is pinned in
 * its own newGame test (store.saveload.test.ts). Tests that mutate further
 * `balance` fields must restore them themselves.
 */
export function freshGame(seed = TEST_SEED): void {
  localStorage.clear()
  useGame.getState().newGame()
  useGame.setState({ seed, equipment: {} })
  balance.randomEventsEnabled = true
  balance.foodPerDay = 1
  balance.health.canteenDrainPerDay = 0.9
  balance.health.canteenDesertDrainPerDay = 3.0
  // Scene furniture is module state and outlives a store reset, so a test that
  // stood the traveller before the chief cannot leak that pose into the next.
  leaveTheChief()
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

/**
 * Put the traveller face to face with the chief who has come out of his hut:
 * the pose a quest find is given in (design.md §6). The scene normally writes
 * these two positions every frame; a store test has no scene, so it stands the
 * pair on the same spot and the give reach is met by construction.
 *
 * `distance` steps the traveller away from him, for the refusal case.
 */
export function standBeforeChief(distance = 0): void {
  setChiefStanding(0, 0)
  placePlayerPosition.x = distance
  placePlayerPosition.z = 0
  placePlayerPosition.active = true
}

/** Nobody stands in the open: the chief is in his hut, or the place is left. */
export function leaveTheChief(): void {
  clearChiefStanding()
  placePlayerPosition.active = false
}
