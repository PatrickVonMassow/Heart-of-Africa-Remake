// The skinned, dressed villagers' look of a settlement (work-order "villager
// dress"), shared by PlaceLife and the chief, who stands outside its tree.

import { useMemo } from 'react'
import { effectiveFigureBodySegments, effectiveFigureGltfBody, useUi } from '../../state/ui'
import { useGame } from '../../state/store'
import { placeById } from '../../world/geo'
import { useVillagerAsset } from './useVillagerAsset'
import { placeDressDrivers } from './useColdCloaks'
import type { FigureLook } from './placeFigureContext'

/**
 * This settlement's people, the visit's season and year, its cloth palette.
 * Null on the low preset, which keeps the primitive figure. Read once per
 * visit: time does not advance inside a settlement. The glTF body loads on the
 * first visit whose level draws it; the code-built body stands in until then.
 */
export function useFigureLook(placeId: string | null, palette: readonly string[]): FigureLook | null {
  const bodySegments = useUi(effectiveFigureBodySegments)
  const villager = useVillagerAsset(useUi(effectiveFigureGltfBody) && bodySegments > 0)
  return useMemo<FigureLook | null>(() => {
    const place = placeId ? placeById(placeId) : null
    if (!bodySegments || !place) return null
    const { drivers, year } = placeDressDrivers(place.id, useGame.getState().day)
    return { peopleId: place.peopleId ?? null, drivers, year, palette, radial: bodySegments, villager }
  }, [bodySegments, placeId, palette, villager])
}
