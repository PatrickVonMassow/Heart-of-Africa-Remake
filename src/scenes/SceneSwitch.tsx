// The world scene the canvas draws: the bird's-eye view or the settlement.
//
// The settlement is KEYED by its id (point 1447): a place-to-place change in
// one tick (leavePlace + enterPlace, or a save loaded inside a place) never
// shows mode 'travel' to React, so without the key one PlaceScene outlived
// every village visited — none of its leave cleanups ran and nothing it drew
// was released (src/scenes/place/placeRelease.ts).

import { useGame } from '../state/store'
import { TravelScene } from './travel/TravelScene'
import { PlaceScene } from './place/PlaceScene'

export function SceneSwitch() {
  const mode = useGame((s) => s.mode)
  const placeId = useGame((s) => s.placeId)
  return mode === 'travel' ? <TravelScene /> : <PlaceScene key={placeId ?? 'place'} />
}
