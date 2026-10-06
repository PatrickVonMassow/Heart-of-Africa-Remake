// How the shovel (shovel.tsx) is held by the bodies that pose it by hand
// pivots — the primitive figure and the code-built body; the glTF body holds it
// by its clips' grip (gltfClipLayers.ts).

import { VILLAGER_ASSET } from '../../config/balance'

const S = VILLAGER_ASSET.shovel

/** How the primitive figure's hand carries the shovel (rad about the hand's x):
 *  nearly level, the blade forward. Its hanging hand is only ~0.18 of its
 *  height off the ground (FIGURE_LIMBS), so a shovel hanging from it would
 *  stand in the earth — the old hoe did; the primitive arm cannot shoulder it.
 *  While it digs the shaft runs along the arm (tilt 0) and the stroke drives
 *  the blade into the pit in front. */
export const PRIMITIVE_CARRY_TILT = -1.5

/** The lowest the blade tip reaches below a hanging hand (figure units) at a
 *  tilt about the hand's x axis. */
export const tipDrop = (tilt: number) => -S.tip * Math.cos(tilt)

