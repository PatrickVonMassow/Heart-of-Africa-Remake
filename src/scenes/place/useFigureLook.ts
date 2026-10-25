// The skinned, dressed villagers' look of a settlement (work-order "villager
// dress"), shared by PlaceLife, the chief, who stands outside its tree, the
// Giza plateau's cast and the bird's-eye traveller.

import { useMemo } from 'react'
import { effectiveFigureBodySegments, effectiveFigureGltfBody, useUi } from '../../state/ui'
import { useGame } from '../../state/store'
import { placeById } from '../../world/geo'
import { START_YEAR } from '../../config/balance'
import { useVillagerAsset } from './useVillagerAsset'
import { placeDressDrivers } from './useColdCloaks'
import type { CastId } from '../../systems/appearance'
import type { FigureLook } from './placeFigureContext'

/**
 * This settlement's people, the visit's season and year, its cloth palette.
 * Null on the low preset, which keeps the primitive figure. Read once per
 * visit: time does not advance inside a settlement. The glTF body loads on the
 * first visit whose level draws it; the code-built body stands in until then.
 *
 * `cast` dresses the figures in a non-villager cast's table instead of the
 * place's people (`CAST_DRESS`); with a cast and no place (the travel view) the
 * look has no season, which no cast's dress follows anyway.
 */
export function useFigureLook(placeId: string | null, palette: readonly string[], cast?: CastId): FigureLook | null {
  const bodySegments = useUi(effectiveFigureBodySegments)
  const villager = useVillagerAsset(useUi(effectiveFigureGltfBody) && bodySegments > 0)
  return useMemo<FigureLook | null>(() => {
    const place = placeId ? placeById(placeId) : null
    if (!bodySegments || (!place && !cast)) return null
    const day = useGame.getState().day
    const { drivers, year } = place
      ? placeDressDrivers(place.id, day)
      : { drivers: { coldness: 0, harmattan: 0, karif: 0 }, year: START_YEAR + Math.floor(day / 365) }
    return { peopleId: cast ?? place?.peopleId ?? null, drivers, year, palette, radial: bodySegments, villager }
  }, [bodySegments, placeId, palette, villager, cast])
}
