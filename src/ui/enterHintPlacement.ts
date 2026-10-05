// Where the settlement enter hint stands (design.md §2.3, point 317): a little
// below the traveller's figure, whom the south-reach camera lifts above the
// picture centre (design.md §2.1).
import { balance } from '../config/balance'
import { CAMERA_OFFSET, TRAVEL_CAMERA_FOV_DEG, followPointFromTop, southReachShift } from '../scenes/travel/followCamera'

/** How far below the traveller's figure the enter hint's centre sits, as a
 *  fraction of the viewport height (point 317's 60 % with a centred traveller). */
export const ENTER_HINT_BELOW_TRAVELLER = 0.1

/** The enter hint's top (fraction of the viewport height): a little below the
 *  traveller, whom the south-reach camera lifts above the centre (design.md §2.1). */
export function enterHintTopFraction(compensation = balance.travelCameraFollow.southReachCompensation): number {
  const shift = southReachShift(CAMERA_OFFSET, TRAVEL_CAMERA_FOV_DEG, compensation)
  return followPointFromTop(CAMERA_OFFSET, TRAVEL_CAMERA_FOV_DEG, shift) + ENTER_HINT_BELOW_TRAVELLER
}
