// The settlement's seasonal dress for this visit (design.md §19.13).
// Shared by the ambient life (PlaceLife) and the scene's own figures
// (PlaceScene's elder), so the whole village dresses for one season — an elder
// in summer dress among cloaked villagers reads as a bug.

import { useEffect, useMemo } from 'react'
import { START_YEAR } from '../../config/balance'
import { useGame } from '../../state/store'
import { seasonalDressFor, type SeasonalDress } from '../../systems/dress'
import { coldnessAt, harmattanAt, karifAt } from '../../systems/season'
import { placeById } from '../../world/geo'
import { elevationAt } from '../../world/geodata'

export interface ColdDress extends SeasonalDress {
  /** The settlement's everyday cloth palette, which keys the wrap's colour. */
  palette: readonly string[]
}

/**
 * The seasonal dress this settlement's inhabitants wear today, or null for the
 * everyday dress — which is the answer for fifteen of the game's twenty-two
 * peoples, on the evidence (see systems/dress.ts).
 *
 * All three drivers are read, because the six dressed peoples do not share one:
 * the Zulu answer the cold, the Hausa the harmattan, the Somali the karif. Each
 * is derived from the PLACE's own coordinates, like the settlement's weather and
 * for the same reason — nothing carries the bird's-eye climate in here. The date
 * is read once per visit rather than subscribed to: time only advances while
 * travelling, so it cannot change while the player stands in a settlement.
 */
export function useColdCloaks(
  placeId: string | null,
  palette: readonly string[],
): ColdDress | null {
  const worn = useMemo(() => {
    // Called before the scene's own early return, so no place is a real state.
    if (!placeId) return null
    const place = placeById(placeId)
    if (!place.peopleId) return null
    const day = useGame.getState().day
    const el = elevationAt(place.lat, place.lon)
    return seasonalDressFor(place.peopleId, {
      coldness: coldnessAt(day, place.lat, place.lon, START_YEAR, el),
      harmattan: harmattanAt(day, place.lat, place.lon, START_YEAR),
      karif: karifAt(day, place.lat, place.lon, START_YEAR, el),
    })
  }, [placeId])

  const dress = useMemo(() => (worn ? { ...worn, palette } : null), [worn, palette])

  // Dev hook for the headless verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__placeDress = worn ? { cloaks: worn.cloaks, rankOnly: worn.rankOnly, wear: worn.wear } : { cloaks: null }
    return () => {
      delete w.__placeDress
    }
  }, [worn])

  return dress
}
