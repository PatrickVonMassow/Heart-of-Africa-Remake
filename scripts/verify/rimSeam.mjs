// Where the river-rim water check reads its bands (work-orders 525, 568).
//
// The drawn river surface runs from the waterline `reach` metres out; past that
// edge the §2.5 panorama carries the same water on. Since the backdrop's rim
// was pushed out to the drawn river's far edge (work-order 1245), that handover
// lies at `distance + reach` along the bank normal — NOT at the plain plate
// radius + 12 the check used to aim at. Measured 31.10.2026 (WebGPU, seed 42):
// the radius lines fell 5.7-7.7 m in front of the player, both inside the drawn
// shallows, and read the bed showing through the 0.94-opaque bank water (step
// 18.7; 8.8 with the drawn water forced opaque) instead of the handover (1.3).
//
// The points lie on the camera's OWN forward line (its position along the
// current), so they project into the picture rather than far off its side.
// Pure and browser-free, so it is unit-tested.

/** Metres the panorama's tucked rim spans before it lies flat at the water
 *  (BACKDROP_DISC_OVERLAP in src/scenes/place/backdrop.ts). */
export const RIM_ZONE_M = 2
/** Metres out from the waterline where the shore froth ends. */
export const FROTH_REACH_M = 3
/** The drawn water's height (−BANK_WATER_DROP). */
export const WATER_Y = -0.25

/**
 * World points of the three band lines, on the camera's forward line.
 * @param river `{ normal, downstream, distance, reach }` from `__placeRiver()`
 * @param camera the camera position `{ x, z }`
 * @returns `{ far, top, bottom, froth }` — far: where the far band stops, as
 *   many metres past the zone as the near band spans, so it stays on the
 *   river short of its far shore; top: the far side of the handover zone;
 *   bottom: the drawn surface's far edge; froth: where the shore froth ends.
 */
export function rimSeamPoints(river, camera) {
  const { normal, downstream, distance, reach } = river
  if (!(reach > 0)) throw new Error('rimSeamPoints: the river reports no drawn reach')
  const along = camera.x * downstream.x + camera.z * downstream.z
  const at = (out, y) => ({ x: normal.x * out + downstream.x * along, y, z: normal.z * out + downstream.z * along })
  const edge = distance + reach
  const span = reach - FROTH_REACH_M
  return {
    far: at(edge + RIM_ZONE_M + span, WATER_Y),
    top: at(edge + RIM_ZONE_M, WATER_Y),
    bottom: at(edge, WATER_Y), froth: at(distance + FROTH_REACH_M, WATER_Y),
  }
}
