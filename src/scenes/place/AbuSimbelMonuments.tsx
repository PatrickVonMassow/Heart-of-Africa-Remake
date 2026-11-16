// The walkable Abu Simbel site's visible masses (design.md §4.4, point 379):
// the cliff with both cut facades, the four seated colossi and the 1890 sand
// drift as one vertex-coloured mesh. The collision comes from abuSimbelSite.ts,
// derived from the same constants. PlaceScene only mounts this.

import { useEffect, useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { ABU_SIMBEL_SITE } from '../../config/balance'
import { buildAbuSimbelSite } from '../../render/abuSimbel'
import { GREAT_COLOSSI, cliffToSite } from './abuSimbelSite'

export function AbuSimbelMonuments() {
  const geometry = useMemo(() => buildAbuSimbelSite(), [])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    if (!import.meta.env.DEV) return
    // Probe for the live checks (scripts/verify/polish-settlement.mjs
    // 'abu-simbel-site'): where each colossus and the small temple stand.
    const w = window as unknown as Record<string, unknown>
    geometry.computeBoundingBox()
    w.__abuSimbelSite = {
      colossi: GREAT_COLOSSI.map((c) => ({ ...cliffToSite(c.u, 0), height: c.height, fallen: c.fallen })),
      smallTemple: cliffToSite(ABU_SIMBEL_SITE.small.u * ABU_SIMBEL_SITE.scale, 0),
      maxY: geometry.boundingBox?.max.y ?? 0,
    }
    return () => {
      delete w.__abuSimbelSite
    }
  }, [geometry])
  return <mesh geometry={geometry} material={material} castShadow receiveShadow />
}
