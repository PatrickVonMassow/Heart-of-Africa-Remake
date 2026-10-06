// The glTF villager body for a settlement (work-order "glTF villager body"):
// loaded on the first visit whose graphics level draws it, once per session,
// and handed to the figures through the settlement's look. Until it arrives —
// or if it cannot load — the figures keep the code-built body.

import { useEffect, useState } from 'react'
import { loadVillagerAsset, villagerAsset, type VillagerAsset } from '../../render/villagerAsset'

export function useVillagerAsset(enabled: boolean): VillagerAsset | null {
  const [asset, setAsset] = useState<VillagerAsset | null>(() => (enabled ? villagerAsset() : null))
  useEffect(() => {
    if (!enabled) return
    let live = true
    loadVillagerAsset().then(
      (a) => live && setAsset(a),
      () => {},
    )
    return () => {
      live = false
    }
  }, [enabled])
  return enabled ? asset : null
}
