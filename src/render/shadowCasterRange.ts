// Range-limited sun-shadow casters (point 1524). The sun's cascaded shadow
// boxes reach ~200 world units toward the sun beyond the view (CSM's light
// margin), so every small caster in that beam was drawn into all three
// cascades — on the reference profile the far settlement markers alone were
// ~200 of the ~300 shadow-pass draws, none of them able to shade anything the
// player sees. A registered caster casts only while it is within the radius
// below of the traveller; outside it, its shadow could only fall outside the
// visible ground, so switching it off changes no visible pixel.
import type { Object3D } from 'three'
import { balance } from '../config/balance'

/** The cast radius (world units) at a travel zoom and sun: the farthest
 *  visible ground at that zoom plus the shadow a small caster throws at that
 *  sun elevation (`tanElevation` = tan of the sun's altitude), capped. */
export function shadowCasterRadius(zoom: number, tanElevation: number, cfg = balance.shadowCasterRange): number {
  const shadow = tanElevation > 0 ? Math.min(cfg.maxShadowReach, cfg.casterHeight / tanElevation) : cfg.maxShadowReach
  return cfg.viewReach * Math.max(0, zoom) + shadow
}

/** Whether a caster at horizontal distance `dist` casts, with hysteresis so a
 *  caster on the boundary cannot flip every frame. PURE. */
export function castsAt(dist: number, casting: boolean, radius: number, hysteresis = balance.shadowCasterRange.hysteresis): boolean {
  return casting ? dist <= radius + hysteresis : dist <= radius
}

interface RangedCaster {
  root: Object3D
  /** The descendants that cast when in range (captured at registration). */
  casters: Object3D[]
  x: number
  z: number
  casting: boolean
}

const casters = new Set<RangedCaster>()

/** Register a STATIC caster subtree; its meshes that cast now are the ones
 *  switched. Returns the unregister function (restores their shadows). */
export function registerRangedCaster(root: Object3D): () => void {
  const list: Object3D[] = []
  root.traverse((o) => {
    if ((o as { isMesh?: boolean }).isMesh && o.castShadow) list.push(o)
  })
  root.updateWorldMatrix(true, false)
  const e = root.matrixWorld.elements
  const entry: RangedCaster = { root, casters: list, x: e[12], z: e[14], casting: true }
  casters.add(entry)
  return () => {
    casters.delete(entry)
    for (const o of entry.casters) o.castShadow = true
  }
}

/** One update: switch every registered caster by its distance to (x, z). */
export function updateRangedCasters(x: number, z: number, zoom: number, tanElevation: number): void {
  const radius = shadowCasterRadius(zoom, tanElevation)
  for (const c of casters) {
    const next = castsAt(Math.hypot(c.x - x, c.z - z), c.casting, radius)
    if (next === c.casting) continue
    c.casting = next
    for (const o of c.casters) o.castShadow = next
  }
}

/** Registered casters and how many cast now (tests, dev probes). */
export function rangedCasterStats(): { registered: number; casting: number } {
  let casting = 0
  for (const c of casters) if (c.casting) casting++
  return { registered: casters.size, casting }
}
