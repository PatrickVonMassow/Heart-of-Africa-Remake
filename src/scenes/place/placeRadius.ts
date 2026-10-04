// The village's walkable radius, in its own module so the life spots can ask
// for the village's bank without importing the whole layout (point 1282).

import { balance } from '../../config/balance'

/** The walkable radius the place scene was first built at, and the unit
 *  `balance.settlementRoom` multiplies. It is a historical base, not a knob:
 *  the calibratable handle is the factor in `balance.ts` (point 1173). */
export const PLACE_RADIUS_BASE = 28
/** Walkable radius of a village in meters; leaving it exits the place. Every
 *  consumer reads THIS (or the layout's own `radius`; a port sets its own from
 *  its size) — no caller keeps a radius of its own. The factor scales this
 *  radius; distances the plans write as literals do not scale with it. */
export const PLACE_RADIUS = PLACE_RADIUS_BASE * balance.settlementRoom
