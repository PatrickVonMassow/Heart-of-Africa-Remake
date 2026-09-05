// The chief's own object in the settlement scene (design.md §13.4).
//
// He is met OUTSIDE now, so what he says is spoken over his head like any
// other villager's word — and that needs the object he is drawn as. The key
// handler that hands him the find lives in PlaceScene and the figure is drawn
// deeper in its tree, so the two meet here rather than through a prop chain.
//
// A module-level ref like the player's own position (playerPosition.ts): scene
// furniture, never game state, never saved.

import type { Object3D } from 'three/webgpu'

/** The speaker id the chief's labels ride under — one chief per settlement. */
export const CHIEF_SPEAKER_ID = 'chief'

let anchor: Object3D | null = null

/** The figure registers itself while it stands, and clears on unmount. */
export function setChiefAnchor(object: Object3D | null): void {
  anchor = object
}

/** The object the chief is drawn as, or null while he is in his hut. */
export function chiefAnchor(): Object3D | null {
  return anchor
}
