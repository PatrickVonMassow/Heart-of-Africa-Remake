// What a horizon neighbour (design.md §2.5, ./horizonNeighbours) LOOKS like —
// derived from builders the game already has, never a new invented model:
//  - a MONUMENT SITE shows the silhouette the bird's-eye view draws for it (its
//    cultural landmark builder), sized in metres by the walkable site's own
//    geometry — the Giza field at its skyline level, Abu Simbel's rock temples;
//  - a PORT or VILLAGE shows its own building fabric: one solid per dwelling of
//    the neighbour's layout, at that dwelling's footprint and wall height, so a
//    town reads as the low block band it is when entered.

import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { buildGizaPyramids, buildGizaSiteMonuments } from '../../render/landmarks'
import { buildAbuSimbelSite, buildRockTemples } from '../../render/abuSimbel'
import { CULTURAL_LANDMARKS, type CulturalLandmarkDef } from '../../world/data/landmarks'
import { placeById } from '../../world/geo'
import type { DwellingDef } from './layout'
import type { SilhouetteMeasure } from './horizonNeighbours'

export interface NeighbourSilhouette {
  /** Geometry in its own units; the base stands at y = 0. */
  geometry: THREE.BufferGeometry
  /** Metres of the silhouette per geometry unit. */
  metresPerUnit: number
  measure: SilhouetteMeasure
  /** The cultural landmark kind a monument silhouette draws (the DEV probe
   *  `__placeSkyline`); null for a settlement. */
  landmarkKind: CulturalLandmarkDef['kind'] | null
}

/** Height and footprint radius of a geometry, in its own units (with an extra
 *  box, e.g. a part drawn as its own mesh, folded in). */
function measureUnits(g: THREE.BufferGeometry, extra?: THREE.Box3): { height: number; footprint: number } {
  g.computeBoundingBox()
  const bb = (g.boundingBox ?? new THREE.Box3()).clone()
  if (extra) bb.union(extra)
  const fx = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x))
  const fz = Math.max(Math.abs(bb.min.z), Math.abs(bb.max.z))
  return { height: Math.max(0, bb.max.y), footprint: Math.hypot(fx, fz) }
}

/** Monument silhouettes by landmark kind: the distant (bird's-eye) build, and
 *  the walkable site build whose height gives it metres. */
const MONUMENT_SILHOUETTES: Partial<Record<CulturalLandmarkDef['kind'], {
  distant: () => THREE.BufferGeometry
  /** Same build with every part drawn separately folded in (measure only). */
  distantWhole: () => THREE.BufferGeometry
  site: () => THREE.BufferGeometry
}>> = {
  // The Sphinx is drawn as its own mesh (FieldSphinx, the picture probe).
  'giza-pyramids': {
    distant: () => buildGizaPyramids('skyline', false),
    distantWhole: () => buildGizaPyramids('skyline', true),
    site: buildGizaSiteMonuments,
  },
  'rock-temples': { distant: buildRockTemples, distantWhole: buildRockTemples, site: buildAbuSimbelSite },
}

const metresCache = new Map<string, number>()

function monumentSilhouette(id: string): NeighbourSilhouette | null {
  const kind = CULTURAL_LANDMARKS.find((c) => c.id === id)?.kind
  const def = kind ? MONUMENT_SILHOUETTES[kind] : undefined
  if (!kind || !def) {
    // OPEN: a monument site without a cultural landmark build has no distant
    // silhouette; none exists today (Giza and Abu Simbel both have one).
    return null
  }
  const geometry = def.distant()
  const whole = def.distantWhole()
  const units = measureUnits(whole)
  whole.dispose()
  let metresPerUnit = metresCache.get(kind)
  if (metresPerUnit === undefined) {
    const site = def.site()
    const siteH = measureUnits(site).height
    site.dispose()
    metresPerUnit = units.height > 0 ? siteH / units.height : 1
    metresCache.set(kind, metresPerUnit)
  }
  return {
    geometry,
    metresPerUnit,
    measure: { heightM: units.height * metresPerUnit, footprintM: units.footprint * metresPerUnit },
    landmarkKind: kind,
  }
}

// The plaster tone of the settlement houses (PlaceScene's plasterDark base).
const SETTLEMENT_TONE = new THREE.Color('#d3c294')
const ROUND_KINDS: ReadonlySet<DwellingDef['kind']> = new Set(['hut', 'granary', 'tent'])

/** A settlement's building fabric as one solid per dwelling (metres). Round
 *  dwellings are cones over their footprint, every other kind a box of the
 *  house body's proportions (BoxHouse: 2r wide, 1.75r deep). */
export function buildSettlementSilhouette(dwellings: readonly DwellingDef[]): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = []
  for (const d of dwellings) {
    const g = ROUND_KINDS.has(d.kind)
      ? new THREE.ConeGeometry(d.r, d.h, 6)
      : new THREE.BoxGeometry(d.r * 2, d.h, d.r * 1.75)
    g.rotateY(d.rot)
    g.translate(d.x, d.h / 2, d.z)
    // One attribute set for every part, so the merge never drops a part.
    const ni = g.toNonIndexed()
    g.dispose()
    ni.deleteAttribute('uv')
    const n = ni.getAttribute('position').count
    const colors = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) SETTLEMENT_TONE.toArray(colors, i * 3)
    ni.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    parts.push(ni)
  }
  if (parts.length === 0) return null
  const merged = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  return merged
}

/**
 * The silhouette of neighbour `id`. `dwellingsOf` supplies a settlement's
 * dwellings (the layout build), injected so callers can cache it — it is the
 * expensive half (a port's full layout).
 */
export function neighbourSilhouette(
  id: string,
  dwellingsOf: (id: string) => readonly DwellingDef[],
): NeighbourSilhouette | null {
  const place = placeById(id)
  if (place.kind === 'monument') return monumentSilhouette(id)
  const geometry = buildSettlementSilhouette(dwellingsOf(id))
  if (!geometry) return null
  const units = measureUnits(geometry)
  return { geometry, metresPerUnit: 1, measure: { heightM: units.height, footprintM: units.footprint }, landmarkKind: null }
}
