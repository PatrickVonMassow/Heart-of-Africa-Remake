// The river half-width in degrees — in its own module (importing only balance)
// because terrain.ts, hydro.ts and many other modules need it and
// terrain→geo→hydro already form an init-time chain (geo shifts places via
// riverDistanceExact at module load); hydro importing terrain closed that into a cycle and left hydro's
// segment index uninitialized. 0.17° is the strictly-scaled base; the factor
// widens for playability (point 136, a user decision — canoe navigation on
// true scale was fiddly). Read at build time; a debug edit applies on reload.
import { balance } from '../config/balance'

export const RIVER_WIDTH_DEG = 0.17 * balance.river.widthFactor
