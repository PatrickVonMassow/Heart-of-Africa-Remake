// The settlement's cold-weather dress for this visit (design.md §19.13).
// Shared by the ambient life (PlaceLife) and the scene's own figures
// (PlaceScene's elder), so the whole village dresses for one season — an elder
// in summer dress among cloaked villagers reads as a bug.

import { useEffect, useMemo } from 'react'
import { START_YEAR } from '../../config/balance'
import { useGame } from '../../state/store'
import { coldCloaksFor } from '../../systems/dress'
import { coldnessAt } from '../../systems/season'
import { placeById } from '../../world/geo'
import { elevationAt } from '../../world/geodata'

export interface ColdDress {
  /** The people's cold-weather cloaks (see systems/dress.ts). */
  cloaks: readonly string[]
  /** The settlement's everyday cloth palette, which keys the cloak choice. */
  palette: readonly string[]
}

/**
 * The cloaks this settlement's inhabitants wear today, or null for the everyday
 * dress — which is the answer for every people but the Zulu (the evidence is in
 * systems/dress.ts).
 *
 * Derived from the PLACE's own coordinates, like the settlement's weather and
 * for the same reason: nothing carries the bird's-eye climate in here. The date
 * is read once per visit rather than subscribed to — time only advances while
 * travelling, so it cannot change while the player stands in a settlement.
 */
export function useColdCloaks(
  placeId: string | null,
  palette: readonly string[],
): ColdDress | null {
  const cloaks = useMemo(() => {
    // Called before the scene's own early return, so no place is a real state.
    if (!placeId) return null
    const place = placeById(placeId)
    if (!place.peopleId) return null
    const coldness = coldnessAt(
      useGame.getState().day,
      place.lat,
      place.lon,
      START_YEAR,
      elevationAt(place.lat, place.lon),
    )
    return coldCloaksFor(place.peopleId, coldness)
  }, [placeId])

  const dress = useMemo(() => (cloaks ? { cloaks, palette } : null), [cloaks, palette])

  // Dev hook for the headless verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__placeDress = { cloaks }
    return () => {
      delete w.__placeDress
    }
  }, [cloaks])

  return dress
}
