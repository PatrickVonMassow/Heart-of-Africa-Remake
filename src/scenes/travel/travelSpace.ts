import { balance } from '../../config/balance'
import { useGame } from '../../state/store'
import { useUi } from '../../state/ui'
import { onKeyPress } from '../../systems/input'
import { worldToLatLon } from '../../world/geo'
import { sampleTerrain } from '../../world/terrain'
import { settlementToEnter, type EnterablePlace } from './settlementEntry'

/** Bind settlement entry while the travel scene is mounted; return cleanup. */
export function bindTravelSpace(places: readonly EnterablePlace[]): () => void {
  return onKeyPress('Space', () => {
    const ui = useUi.getState()
    const g = useGame.getState()
    const blocked = !!ui.dialog || !!g.defeat || g.victory
    // Re-derive from the live position: a teleport may precede the next frame's
    // enter hint. Water and finished runs keep the same entry guards as before.
    const ll = worldToLatLon(g.pos.x, g.pos.z)
    const onWater = sampleTerrain(ll.lat, ll.lon, g.seed).type === 'water'
    const id = settlementToEnter(
      g.pos.x,
      g.pos.z,
      places,
      balance.placeEnterRadius,
      onWater,
      blocked,
    )
    if (id !== null) g.enterPlace(id)
    // No settlement means no action. Forms are used from the inventory bar.
  })
}
