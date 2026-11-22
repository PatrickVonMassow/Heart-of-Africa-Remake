// The settlement visit counter (point 1447): one count per entry into a place
// as the store makes it, so a leave and re-entry of the SAME place in one tick
// counts as a new visit although mode and place id read the same before and
// after. SceneSwitch keys the settlement scene by it; the dev leak watch
// (render/renderLeak.ts) tells a new visit from a settings re-settle by it.

import { useGame } from './store'

let visit = 0
const listeners = new Set<() => void>()
useGame.subscribe((s, prev) => {
  if (s.mode !== 'place' || (prev.mode === 'place' && prev.placeId === s.placeId)) return
  visit++
  for (const l of listeners) l()
})

export function subscribePlaceVisit(l: () => void): () => void {
  listeners.add(l)
  return () => void listeners.delete(l)
}

export const currentPlaceVisit = (): number => visit
