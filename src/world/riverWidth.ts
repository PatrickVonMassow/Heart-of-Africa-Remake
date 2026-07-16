// The river half-width in degrees — in its own dependency-free module because
// both terrain.ts and hydro.ts need it and terrain→geo→hydro already form an
// init-time chain (geo shifts landmarks via riverDistanceExact at module
// load); hydro importing terrain closed that into a cycle and left hydro's
// segment index uninitialized. 0.17° is the strictly-scaled base; the factor
// widens for playability (point 136, a user decision — canoe navigation on
// true scale was fiddly). Read at build time; a debug edit applies on reload.
import { balance } from '../config/balance'

export const RIVER_WIDTH_DEG = 0.17 * balance.river.widthFactor
