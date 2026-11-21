// The world scene the canvas draws: the bird's-eye view or the settlement.
//
// The settlement is KEYED per visit (point 1447): a place-to-place change in
// one tick (leavePlace + enterPlace, or a save loaded inside a place) never
// shows mode 'travel' to React, so without the key one PlaceScene outlived
// every village visited — none of its leave cleanups ran and nothing it drew
// was released (src/scenes/place/placeRelease.ts). The key counts entries as
// the store makes them, so a leave and re-entry of the SAME place in one tick
// remounts too, although React sees the same mode and place id before and after.

import { useSyncExternalStore } from 'react'
import { useGame } from '../state/store'
import { TravelScene } from './travel/TravelScene'
import { PlaceScene } from './place/PlaceScene'

let visit = 0
const listeners = new Set<() => void>()
useGame.subscribe((s, prev) => {
  if (s.mode !== 'place' || (prev.mode === 'place' && prev.placeId === s.placeId)) return
  visit++
  for (const l of listeners) l()
})
const subscribeVisit = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}
const currentVisit = () => visit

export function SceneSwitch() {
  const mode = useGame((s) => s.mode)
  const placeId = useGame((s) => s.placeId)
  const visitKey = useSyncExternalStore(subscribeVisit, currentVisit)
  return mode === 'travel' ? <TravelScene /> : <PlaceScene key={`${placeId ?? 'place'}#${visitKey}`} />
}
