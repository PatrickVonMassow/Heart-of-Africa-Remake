// Pure layout of the walkable Giza monument site (design.md §4.4, docs/
// giza-1890.md). The three great pyramids stand in their real south-west
// diagonal row — Khufu largest in the NE, Khafre centre (raised on higher
// bedrock so it reads as tall as Khufu and alone keeps its pale Tura-limestone
// casing cap near the apex), Menkaure smallest in the SW with a red Aswan
// granite skirt at its base — and the Great Sphinx crouches east of Khafre,
// facing east, buried to the shoulders in sand as a ~1890 expedition found it
// (nose long gone). Each monument is a giant collidable mass the traveller
// walks around; the site carries a handful of Thomas-Cook-era ambient people
// (robed guides/dragomen, Bedouin cameleers, donkey-boys, tourists, camels and
// donkeys) but no trade, no elder and no hints — a walkable monument space.
//
// The site is distinct from the game's Meroë (Nubian) pyramids by design: Giza
// is a FEW HUGE, shallow ~52° masses (height ≈ 0.64·base·2), Meroë a dense
// cluster of small, steep ~70° cones — the slope ratio here is far flatter than
// MEROE_PYRAMIDS' (~2.6·base) so the two can never be mistaken.

import { balance } from '../../config/balance'
import { openPlainWalkRadius } from './backdrop'
import { boxCollider, nudgeToFree, WALKER_RADIUS, type Collider } from './collision'
import type { PlaceLayout } from './layout'

/**
 * Walkable radius of the Giza site (m); leaving it exits to the bird's-eye
 * view. MEASURED, not guessed (point 390): the plateau's surroundings are an
 * open plain that the picture runs unbroken to the horizon, so the walkable
 * ground has to reach as far as the scene affords — the former 60 put the edge
 * ~27 m past the outermost pyramid, in the middle of flat empty sand.
 *
 * The measurement (recorded in `gizaSite.test.ts`, swept over 720 azimuths at
 * eye height against the real geodata):
 *  - The drawn backdrop ground reads as flat open sand out to the backdrop's
 *    own outer edge (340) over the whole western and southern half; the median
 *    azimuth breaks only at 191.
 *  - The one seed-independent break is the Nile's water band at 76, in the
 *    eastern arc (~340°→95°). The geometry backdrop is the FALLBACK horizon;
 *    on a normal entry the captured §2.5 band carries the Nile.
 *  - The backdrop's relief is no usable target: it is a compressed miniature
 *    anchored to the disc edge, so it begins immediately past the plate at any
 *    radius.
 * The binding limit is therefore the §2.5 panorama band, and the radius is
 * derived from it (`openPlainWalkRadius`) rather than written as a round guess.
 */
export const GIZA_SITE_RADIUS = openPlainWalkRadius(
  // Read at module load, i.e. the SHIPPED ring defaults: a debug-time change to
  // the silhouette ring must not resize the walkable site under the player.
  balance.panoramaWildlife.ringInner + balance.panoramaWildlife.ringSpread,
)

/** Distance south of the centre at which the traveller arrives (design.md §2.3
 *  spawns him just inside the southern edge facing north). Held at its own
 *  value rather than `radius − 10`: the disc grew to give the desert its room,
 *  and the approach view of the pyramid row must not grow with it. */
export const GIZA_SPAWN_Z = 50

/** Giza slope ratio: apex height over the cone circumradius. The shallow
 *  Old-Kingdom profile shared with buildGizaPyramids (0.64·2 ≈ 1.28) — clearly
 *  flatter than Meroë's steep ~70° Nubian cones (height ≈ 2.6·base). */
export const GIZA_SLOPE = 0.64 * 2

/** One great pyramid at site scale. `base` is the cone circumradius at the
 *  ground; `ground` lifts the whole pyramid onto its bedrock plinth. */
export interface GizaPyramid {
  id: 'khufu' | 'khafre' | 'menkaure'
  x: number
  z: number
  base: number
  height: number
  ground: number
  /** Fraction of the built height still standing — Khufu's apex and top
   *  courses are quarried away, leaving a small flat summit platform. */
  standing: number
  /** Khafre ALONE keeps a pale smooth casing cap near its apex (the plateau's
   *  one surviving Tura limestone — the cue that tells Khafre from Khufu). */
  cap: boolean
  /** Menkaure ALONE wears a darker red-granite skirt at its base. */
  skirt: boolean
}

function pyramid(
  id: GizaPyramid['id'],
  x: number,
  z: number,
  base: number,
  ground: number,
  opts: { standing?: number; cap?: boolean; skirt?: boolean } = {},
): GizaPyramid {
  return {
    id,
    x,
    z,
    base,
    height: base * GIZA_SLOPE,
    ground,
    standing: opts.standing ?? 1,
    cap: !!opts.cap,
    skirt: !!opts.skirt,
  }
}

// The real SW-diagonal row, placed north (−z) of the southern spawn point:
// Khufu NE (+x east, −z north), Khafre centre, Menkaure SW (−x, +z). Menkaure's
// base ≈ 0.44·Khufu's, the real size ratio. Spaced so the collidable masses
// leave lanes to walk between and around them.
export const GIZA_PYRAMIDS: readonly GizaPyramid[] = [
  pyramid('khufu', 22, -22, 15, 0, { standing: 0.945 }),
  pyramid('khafre', 0, 0, 13.6, 2.4, { cap: true }),
  pyramid('menkaure', -20, 18, 6.6, 0, { skirt: true }),
]

/** The Great Sphinx east of Khafre, facing east (+x), buried to the shoulders.
 *  `scale` multiplies the unit-scale buildSphinx geometry (which is already
 *  sunk by SPHINX_BURIAL_DEPTH), so the burial and the noseless head come for
 *  free. */
export const GIZA_SPHINX = { x: 20, z: 2, scale: 11 } as const

/** Footprint half-extent of a pyramid's collider box: the base square, after
 *  the 45° rotation that faces its flats to the axes, is axis-aligned with a
 *  half-side of base/√2. */
export function pyramidFootprint(base: number): number {
  return base * Math.SQRT1_2
}

/** Roles for the sparse Thomas-Cook-era ambient life at the plateau. */
export type GizaAmbientRole = 'guide' | 'cameleer' | 'donkeyboy' | 'tourist' | 'camel' | 'donkey'

export interface GizaAmbientAnchor {
  role: GizaAmbientRole
  x: number
  z: number
}

// A handful of figures, no throng (docs/giza-1890.md §4): robed guides and a
// Bedouin cameleer with his camel by the Sphinx and the great pyramids, a
// donkey-boy with his donkey, and a few 1890s tourists between the spawn and
// the monuments so they read in front of the pyramids on approach.
export const GIZA_AMBIENT: readonly GizaAmbientAnchor[] = [
  { role: 'guide', x: 12, z: 8 },
  { role: 'tourist', x: 9, z: 12 },
  { role: 'camel', x: 15, z: 11 },
  { role: 'cameleer', x: 4, z: 24 },
  { role: 'camel', x: 8, z: 26 },
  { role: 'donkeyboy', x: -7, z: 22 },
  { role: 'donkey', x: -4, z: 24 },
  { role: 'tourist', x: -2, z: 30 },
  { role: 'guide', x: 16, z: 17 },
]

/** The collidable monument set: an oriented box under each pyramid's footprint
 *  and a circle around the Sphinx's emerged head and sand drift. Derived from
 *  the same GIZA_PYRAMIDS/GIZA_SPHINX constants the renderer draws, so a
 *  monument can never leave a phantom collider or a gap. */
export function gizaColliders(): Collider[] {
  const colliders: Collider[] = []
  for (const p of GIZA_PYRAMIDS) {
    const h = pyramidFootprint(p.base)
    colliders.push(boxCollider(p.x, p.z, h, h, 0))
  }
  // The buried Sphinx: only the head, nemes and shoulders break the sand, so a
  // modest circle around its centre keeps the traveller from walking through
  // the head without walling off the whole (sand-covered) body.
  colliders.push({ x: GIZA_SPHINX.x, z: GIZA_SPHINX.z, r: GIZA_SPHINX.scale * 0.6 })
  return colliders
}

/**
 * The Giza site as a PlaceLayout (design.md §2.6 collision reused): a wide
 * walkable sand disc, the three pyramids and the Sphinx as the collider set,
 * the ambient anchors as errand points (validated free of the monuments, like
 * every settlement errand — point 155), and NO interactives, dwellings, fences,
 * paths or props. The seed is accepted for signature parity with buildLayout;
 * the monument site is fixed, so it does not vary the placement.
 */
export function buildGizaLayout(_seed: number): PlaceLayout {
  const colliders = gizaColliders()
  const errands = GIZA_AMBIENT.map((a) => nudgeToFree(colliders, a.x, a.z, WALKER_RADIUS))
  return {
    radius: GIZA_SITE_RADIUS,
    spawnZ: GIZA_SPAWN_Z,
    interactives: [],
    dwellings: [],
    fences: [],
    paths: [],
    flora: [],
    rocks: [],
    teachingStone: null, // the PoC teaching stone stands in its village only
    digSites: [], // and the ground work of point 483 is village life, not a monument's
    bank: null, // the plateau stands well clear of the Nile (work-order 482)
    playRocks: null, // and with no bank there is no children's stretch (687)
    pen: null,
    errands,
    colliders,
  }
}
