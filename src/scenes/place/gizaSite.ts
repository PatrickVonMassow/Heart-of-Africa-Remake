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
// The monuments stand at a MONUMENTAL first-person scale: one fraction of real
// size (GIZA_SITE_SCALE) on the real ~52° face profile, so from the foot of a
// pyramid its apex sits far above the frame top.
//
// The site is distinct from the game's Meroë (Nubian) pyramids by design: Giza
// is a FEW HUGE, shallow masses (faces at ~52°), Meroë a dense cluster of
// small, steep ~70° cones — the slope ratio here is far flatter than
// MEROE_PYRAMIDS' (~2.6·base) so the two can never be mistaken.

import { balance, GIZA_CAST, GIZA_SITE_SCALE, SPHINX_FORM } from '../../config/balance'
import { sphinxColliderSegments } from '../../world/sphinx'
import type { AgeGroup, CastId, Sex } from '../../systems/appearance'
import { openPlainWalkRadius } from './backdrop'
import { boxCollider, nudgeToFree, WALKER_RADIUS, type Collider, type SegmentCollider } from './collision'
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
  // The open-plain spread, not the full one: the ring compresses to the band
  // here rather than shrinking the desert (work-order 1285).
  balance.panoramaWildlife.ringInner + balance.panoramaWildlife.openPlainRingSpread,
)

/** Distance south of the centre at which the traveller arrives (design.md §2.3
 *  spawns him in the south, facing north): clear of Menkaure's south face and
 *  20 m inside the rim. Held at its own value rather than `radius − 10`, so the
 *  approach view does not drift with the disc. */
export const GIZA_SPAWN_Z = 76

/** East offset of the arrival point: west of the centre line, so all three
 *  apexes stand inside the north-facing frame (Menkaure's otherwise falls
 *  off its west edge). */
export const GIZA_SPAWN_X = -10

/** The one fraction of real size every site monument is drawn at (balance). */
export const GIZA_SCALE = GIZA_SITE_SCALE.fraction

/** Khafre's drawn bedrock plinth (design.md §4.4): its top and foot radii as
 *  multiples of the pyramid's base circumradius. */
export const GIZA_PLINTH = { top: 1.05, foot: 1.14 } as const

/** Menkaure's drawn red-granite skirt: its outward flare over the core face and
 *  its height as a fraction of the pyramid's. */
export const GIZA_SKIRT = { flare: 1.02, top: 0.22 } as const

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

/** A pyramid at GIZA_SCALE of its real side and height, i.e. on its real
 *  ~52° profile (docs/giza-1890.md §1.1). */
function pyramid(
  id: GizaPyramid['id'],
  x: number,
  z: number,
  real: { side: number; height: number },
  ground: number,
  opts: { standing?: number; cap?: boolean; skirt?: boolean } = {},
): GizaPyramid {
  return {
    id,
    x,
    z,
    base: (real.side * GIZA_SCALE) * Math.SQRT1_2,
    height: real.height * GIZA_SCALE,
    ground,
    standing: opts.standing ?? 1,
    cap: !!opts.cap,
    skirt: !!opts.skirt,
  }
}

const REAL = GIZA_SITE_SCALE.real

// The real row, placed north (−z) of the southern spawn point: Khufu NE (+x
// east, −z north) of Khafre near the true 45° diagonal, Menkaure south-south-
// west of Khafre (the real offset bends further west; pulled in so the whole
// row fits one frame from the spawn). Positions are a compression (the real
// centres stand ~475 m apart): the drawn masses, plinth and skirt included,
// keep ~4 m lanes between them and ≥20 m of open sand to the 98 m rim.
export const GIZA_PYRAMIDS: readonly GizaPyramid[] = [
  pyramid('khufu', 32, -30, REAL.khufu, 0, { standing: 0.945 }),
  pyramid('khafre', -20, 16, REAL.khafre, REAL.khafre.bedrock * GIZA_SCALE, { cap: true }),
  pyramid('menkaure', -24, 55, REAL.menkaure, 0, { skirt: true }),
]

/** The Great Sphinx east of Khafre, facing east (+x), buried to the shoulders
 *  in its drift (the ONE definition, src/world/sphinx.ts). `length` is the
 *  body length in metres (paw tip to tail) the unit definition is scaled to;
 *  the drawn mesh (buildGizaSiteSphinx) and the collider below both use it. */
export const GIZA_SPHINX: { readonly x: number; readonly z: number; readonly length: number } = SPHINX_FORM.site

/** The Sphinx's collidable mass in site metres: the definition's footprint
 *  capsules, scaled and placed like the drawn mesh (point 378: the collider is
 *  the drawn body — the drift and the stone breaking it — and nothing else). */
export function gizaSphinxColliders(): SegmentCollider[] {
  const L = GIZA_SPHINX.length
  const { x, z } = GIZA_SPHINX
  return sphinxColliderSegments().map((c) => ({
    kind: 'segment',
    x1: x + c.x1 * L,
    z1: z + c.z1 * L,
    x2: x + c.x2 * L,
    z2: z + c.z2 * L,
    r: c.r * L,
  }))
}

/** Footprint half-extent of a pyramid's collider box: the base square, after
 *  the 45° rotation that faces its flats to the axes, is axis-aligned with a
 *  half-side of base/√2. */
export function pyramidFootprint(base: number): number {
  return base * Math.SQRT1_2
}

/** Half-extent of a pyramid's whole DRAWN mass on the ground (point 378's
 *  rule: the collider is what the renderer draws): the cone's footprint, or
 *  Khafre's wider plinth foot, or Menkaure's flared granite skirt. */
export function pyramidMassFootprint(p: GizaPyramid): number {
  let reach = 1
  if (p.ground > 0) reach = Math.max(reach, GIZA_PLINTH.foot)
  if (p.skirt) reach = Math.max(reach, GIZA_SKIRT.flare)
  return pyramidFootprint(p.base * reach)
}

/** Roles for the sparse Thomas-Cook-era ambient life at the plateau. */
export type GizaAmbientRole = 'guide' | 'cameleer' | 'donkeyboy' | 'tourist' | 'camel' | 'donkey'

export interface GizaAmbientAnchor {
  role: GizaAmbientRole
  x: number
  z: number
  /** A person's sex where the role has both (the tourists); male otherwise. */
  sex?: Sex
  /** A guide who is the tourists' dragoman: he wears the tarboosh. */
  dragoman?: boolean
}

/** The plateau's people: every role but the mounts. */
export type GizaPersonRole = Exclude<GizaAmbientRole, 'camel' | 'donkey'>

/** How a person of the plateau is drawn on the villagers' figure body. */
export interface GizaFigureSpec {
  /** The dress table they wear (`CAST_DRESS`, docs/giza-1890.md §4.1). */
  cast: CastId
  sex: Sex
  age: AgeGroup
  /** The figure's own cloth: the gown's or the suit's colour. */
  cloth: string
  skin: string
  /** The brimmed hat worn as a prop on the head (scenes/place/castHats.tsx). */
  hat: 'sunHelmet' | 'ladyHat' | null
}

export function isGizaPerson(role: GizaAmbientRole): role is GizaPersonRole {
  return role !== 'camel' && role !== 'donkey'
}

/**
 * Who stands at an anchor (docs/giza-1890.md §4.1): guides in the galabiya and
 * turban (the dragoman in the tarboosh), the Bedouin cameleer under his head
 * cloth, the donkey-boy a youth in a skullcap, the tourists in 1890s Western
 * dress. No scale: all of them stand at villager stature, the donkey-boy by
 * his age group. Colours calibratable (`GIZA_CAST`).
 */
export function gizaFigure(role: GizaPersonRole, sex: Sex = 'male', dragoman = false): GizaFigureSpec {
  const c = GIZA_CAST
  switch (role) {
    case 'guide':
      return { cast: dragoman ? 'dragoman' : 'egyptian', sex: 'male', age: 'adult', cloth: c.guideGown, skin: c.localSkin, hat: null }
    case 'cameleer':
      return { cast: 'bedouin', sex: 'male', age: 'adult', cloth: c.cameleerGown, skin: c.bedouinSkin, hat: null }
    case 'donkeyboy':
      return { cast: 'egyptian', sex: 'male', age: 'youth', cloth: c.donkeyboyGown, skin: c.localSkin, hat: null }
    case 'tourist':
      return sex === 'female'
        ? { cast: 'european', sex, age: 'adult', cloth: c.touristGown, skin: c.touristSkin, hat: 'ladyHat' }
        : { cast: 'european', sex, age: 'adult', cloth: c.touristSuit, skin: c.touristSkin, hat: 'sunHelmet' }
  }
}

// A handful of figures, no throng (docs/giza-1890.md §4): robed guides and a
// Bedouin cameleer with his camel on the approach, a lone camel by the Sphinx,
// a donkey-boy with his donkey, and a few 1890s tourists — a man and a woman —
// between the spawn and the monuments so they read in front of the pyramids on
// approach.
export const GIZA_AMBIENT: readonly GizaAmbientAnchor[] = [
  { role: 'guide', x: 12, z: 50 },
  { role: 'tourist', x: 9, z: 54 },
  { role: 'camel', x: 15, z: 53 },
  { role: 'cameleer', x: 4, z: 64 },
  { role: 'camel', x: 8, z: 66 },
  { role: 'donkeyboy', x: -10, z: 60 },
  { role: 'donkey', x: -7, z: 62 },
  { role: 'tourist', x: -2, z: 70, sex: 'female' },
  { role: 'guide', x: 16, z: 58, dragoman: true },
]

/** The collidable monument set: an oriented box under each pyramid's footprint
 *  and the Sphinx's drift footprint as a row of capsules. Derived from the
 *  same GIZA_PYRAMIDS constants and Sphinx definition the renderer draws, so a
 *  monument can never leave a phantom collider or a gap. */
export function gizaColliders(): Collider[] {
  const colliders: Collider[] = []
  for (const p of GIZA_PYRAMIDS) {
    const h = pyramidMassFootprint(p)
    colliders.push(boxCollider(p.x, p.z, h, h, 0))
  }
  // The buried Sphinx: its drift is a solid mound on the flat site ground, so
  // the whole drawn footprint collides, the stone that breaks it included
  // (capsules across the body, the shape the existing segment collider has).
  colliders.push(...gizaSphinxColliders())
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
    observed: [],
    spawnZ: GIZA_SPAWN_Z,
    spawnX: GIZA_SPAWN_X,
    interactives: [],
    dwellings: [],
    fences: [],
    paths: [],
    flora: [],
    rocks: [],
    // No children's quarter here, so no stone for one to climb.
    climbRock: null,
    digSites: [], // and the ground work of point 483 is village life, not a monument's
    bank: null, // the plateau stands well clear of the Nile (work-order 482)
    playRocks: null, // and with no bank there is no children's stretch (687)
    waterPath: null,
    waterStand: null, // nor a water path to it (688)
    playGround: null, // only ambient visitors here, no children to roam it
    loom: null, // and no village life to weave (1157)
    gaveWayToLoom: { households: 0, dwellings: 0, rebuilt: 0 },
    wayOut: null, // the bare plateau has no dressing to keep off a crossing (688)
    pen: null,
    errands,
    colliders,
  }
}
