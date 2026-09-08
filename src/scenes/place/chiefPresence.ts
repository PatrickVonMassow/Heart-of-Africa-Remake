// The chief's own object in the settlement scene (design.md §13.4).
//
// He is met OUTSIDE now, so what he says is spoken over his head like any
// other villager's word — and that needs the object he is drawn as. The figure
// is drawn deep in the PlaceScene tree, so what it must tell the rest of the
// game meets here rather than through a prop chain.
//
// It also carries where he STANDS, because the find from the boulder is given
// by USING the inventory item before him: the give reach is measured on the
// figure the picture draws, and the store asks this module for it.
//
// A module-level ref like the player's own position (playerPosition.ts): scene
// furniture, never game state, never saved.

import type { Object3D } from 'three/webgpu'
import { balance } from '../../config/balance'
import { chiefInHut, type ChiefWalk } from './chiefWalk'
import { placePlayerPosition } from './playerPosition'

/** The speaker id the chief's labels ride under — one chief per settlement. */
export const CHIEF_SPEAKER_ID = 'chief'

/** The speaker id the drummer's own word rides under. */
export const DRUMMER_SPEAKER_ID = 'drummer'

/**
 * WHERE THE CHIEF IS IN HIS ROUND TRIP, live (design.md §13.4). Scene furniture
 * like the anchor above: it is written every frame by the figure that walks, it
 * is never saved, and it starts over in his hut whenever a settlement is
 * entered — which is exactly the rule that leaving the village and coming back
 * always finds him indoors.
 */
let walk: ChiefWalk = chiefInHut()

/** His walk as it stands right now. */
export function chiefWalkState(): ChiefWalk {
  return walk
}

/** The walking figure writes each advance back here. */
export function setChiefWalkState(next: ChiefWalk): void {
  walk = next
}

/** Back in his hut: what a settlement entered (or left) resets him to. */
export function resetChiefWalk(): void {
  walk = chiefInHut()
}

let anchor: Object3D | null = null

/** The figure registers itself while it stands, and clears on unmount. */
export function setChiefAnchor(object: Object3D | null): void {
  anchor = object
}

/** The object the chief is drawn as, or null while he is in his hut. */
export function chiefAnchor(): Object3D | null {
  return anchor
}

/**
 * Where the chief STANDS in place-local units while he is out in the open, as
 * the picture draws him. The give reach for a quest find (design.md §6) is
 * measured against this, so the item is used on the man on screen rather than
 * on a spot recomputed from the layout. `active` is true only while he stands.
 */
export const chiefStandingPosition = { x: 0, z: 0, active: false }

/** The figure registers its own ground spot while it stands. */
export function setChiefStanding(x: number, z: number): void {
  chiefStandingPosition.x = x
  chiefStandingPosition.z = z
  chiefStandingPosition.active = true
}

/** He is back in his hut, or the settlement is left: nobody stands there. */
export function clearChiefStanding(): void {
  chiefStandingPosition.active = false
}

/**
 * Is the traveller standing close enough to the chief for a quest find to be
 * laid in his hands (design.md §6)? Measured on the two live positions the
 * picture writes — the man on screen and the traveller's own feet — never on a
 * spot recomputed from the layout, and never while one of them is absent.
 *
 * Both positions are injectable so the rule can be exercised without a scene.
 */
export function withinGiveReach(
  player: { x: number; z: number; active: boolean } = placePlayerPosition,
  chief: { x: number; z: number; active: boolean } = chiefStandingPosition,
): boolean {
  if (!player.active || !chief.active) return false
  return Math.hypot(player.x - chief.x, player.z - chief.z) <= balance.communication.giveReach
}
