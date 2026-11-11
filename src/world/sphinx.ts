// The Great Sphinx — ONE definition, three levels of detail (design.md §4.4,
// docs/giza-1890.md §1.3).
//
// Every view of the monument derives from the part list and the drift below:
// the walkable site's full mesh (three site levels, picked per quality preset),
// the bird's-eye landmark and the outline in Cairo's western skyline. None of
// them carries a shape of its own, so the three cannot drift apart the way the
// plateau's two position records once did (point 338).
//
// THE MODEL. A couchant lion carved from the bedrock, facing east (+x), with a
// human head in the nemes headdress: brow band, the flaring wings behind the
// ears, the lappets falling to the chest, the queue at the back, the nose
// broken off and no beard. In ~1890 it lay buried to the shoulders: only the
// head, the neck, a little of the chest and the upper back stood clear. So the
// body parts split into BURIED ones, which are never drawn and only shape the
// sand, and CLEAR ones, which are drawn and break the surface. The drift is a
// body UNDER sand: every buried part raises a dome that covers it, two
// wind-blown sand banks fill the front and the rear (SPHINX_DRIFT_BANKS), and
// the smooth union is the long couchant swell with the shoulders showing
// through, out of which the back ridge breaks.
//
// NO COPLANAR SURFACES BY CONSTRUCTION. Every part is a closed, curved
// superellipsoid; the drift's toe meets the ground at the repose slope, and
// the clear parts leave the drift through their steep flanks. The pure tests
// (sphinx.test.ts) assert the crossing angles, so the model needs no z-offset.
//
// Units: body length (paw tip to tail end) = 1; origin on the ground at the
// middle of that length, on the axis. Pure: no three.js, no store, no strings.

import { SPHINX_FORM } from '../config/balance'

export type Vec3 = readonly [number, number, number]

/** Colour role of a part; the tones live in SPHINX_FORM.tones. */
export type SphinxTone = 'limestone' | 'face' | 'nemes' | 'band'

/** Which banding the site material draws on a part. */
export type SphinxBand = 'course' | 'nemes' | 'none'

/** The levels of detail, finest first. */
export const SPHINX_LODS = ['site-full', 'site-standard', 'site-reduced', 'landmark', 'skyline'] as const
export type SphinxLod = (typeof SPHINX_LODS)[number]

/** The quality-preset choice for the walkable site (`sphinxSiteDetail`). */
export type SphinxSiteDetail = 'full' | 'standard' | 'reduced'
export const SPHINX_SITE_LOD: Record<SphinxSiteDetail, SphinxLod> = {
  full: 'site-full',
  standard: 'site-standard',
  reduced: 'site-reduced',
}

/** The coarsest view that still draws a part. */
export type SphinxReach = 'skyline' | 'landmark' | 'site'

export interface SphinxPart {
  id: string
  /** Body parts are in body units; head parts were scaled about the head anchor. */
  group: 'body' | 'head'
  centre: Vec3
  /** Semi-axes along x (forward), y (up), z (right). */
  radii: Vec3
  /** Superellipsoid exponents [vertical, horizontal]: 1 = ellipsoid, below 1
   *  squarer. Buried parts stay near 1 so their cover dome contains them. */
  shape: readonly [number, number]
  /** Rotation about the x axis (a wing or lappet flaring outward), radians. */
  roll: number
  /** Rotation about the z axis (leaning forward), radians. */
  pitch: number
  /** Lateral taper: the half-width scales by (1 − taper·y/ry) up the part, so
   *  a positive taper is wider at the bottom (the nemes' trapezoid). */
  taper: number
  tone: SphinxTone
  band: SphinxBand
  burial: 'buried' | 'clear'
  reach: SphinxReach
}

interface PartSpec {
  id: string
  centre: Vec3
  radii: Vec3
  shape?: readonly [number, number]
  roll?: number
  pitch?: number
  taper?: number
  tone?: SphinxTone
  band?: SphinxBand
  burial: 'buried' | 'clear'
  reach?: SphinxReach
  /** Mirror onto the left side as `<id>L` / `<id>R` (spec is the right, +z). */
  pair?: boolean
}

// --- The body (body units) ---------------------------------------------------
// Real proportions: ~73 m long, ~20 m to the crown, ~19 m across the haunches
// (docs/giza-1890.md §1.3), i.e. crown ≈ 0.27 and width ≈ 0.26 of the length.
const BODY: readonly PartSpec[] = [
  // Buried: they only raise the drift. The back falls from the shoulders to
  // the rump, so the rear torso and the haunches sit lower than the front.
  { id: 'torso', centre: [0.06, 0.06, 0], radii: [0.17, 0.07, 0.09], shape: [0.95, 0.95], burial: 'buried' },
  { id: 'rearTorso', centre: [-0.18, 0.048, 0], radii: [0.17, 0.058, 0.065], shape: [0.95, 0.95], burial: 'buried' },
  { id: 'shoulder', centre: [0.16, 0.07, 0.055], radii: [0.09, 0.08, 0.07], burial: 'buried', pair: true },
  // The haunches: two swells either side of the spine at the rear.
  { id: 'haunch', centre: [-0.32, 0.048, 0.07], radii: [0.1, 0.066, 0.065], burial: 'buried', pair: true },
  { id: 'breast', centre: [0.262, 0.068, 0], radii: [0.05, 0.07, 0.075], burial: 'buried' },
  { id: 'hindLeg', centre: [-0.27, 0.03, 0.115], radii: [0.14, 0.035, 0.035], burial: 'buried', pair: true },
  // The forepaws stretched forward, under the sand in 1890 (the record).
  { id: 'foreleg', centre: [0.36, 0.036, 0.08], radii: [0.17, 0.038, 0.04], burial: 'buried', pair: true },
  // The tail curls round the right haunch.
  { id: 'tail', centre: [-0.36, 0.018, 0.14], radii: [0.11, 0.016, 0.018], burial: 'buried' },
  // Clear: the stone that breaks the surface.
  // The upper chest between the lappets ("a little of the chest clear").
  // Not on the skyline: from Cairo only head, neck and back ridge stand above
  // the drift (owner verdict 11.11.2026).
  { id: 'chest', centre: [0.255, 0.13, 0], radii: [0.042, 0.065, 0.08], shape: [0.8, 0.9], burial: 'clear', reach: 'landmark' },
  { id: 'neck', centre: [0.232, 0.19, 0], radii: [0.05, 0.07, 0.042], shape: [0.9, 0.9], pitch: 0.2, burial: 'clear', reach: 'skyline' },
  // The spine: a narrow stone ridge, deep in the drift and tilted up toward
  // the neck, whose crest rises out of the sand from the mid-back to the
  // shoulders. A buried core under it banks the sand up against its flanks.
  { id: 'spine', centre: [-0.01, 0.085, 0], radii: [0.27, 0.105, 0.032], shape: [0.7, 0.8], pitch: 0.06, burial: 'clear', reach: 'skyline' },
  // The tops of the shoulders behind the lappets, rising out of the sand up
  // under the nemes wings (the upper back standing clear, the record).
  { id: 'shoulderTop', centre: [0.19, 0.142, 0.064], radii: [0.075, 0.052, 0.045], shape: [0.65, 0.8], burial: 'clear', reach: 'landmark', pair: true },
  { id: 'spineBank', centre: [-0.03, 0.065, 0], radii: [0.22, 0.055, 0.04], shape: [0.95, 0.95], pitch: 0.06, burial: 'buried' },
]

/** Where the head sits on the neck (body units); head parts scale about it. */
export const SPHINX_HEAD_ANCHOR: Vec3 = [0.272, 0.277, 0]

// --- The head (head-local units, scaled by SPHINX_FORM.headScale) ------------
// Seen from the front the head is the nemes' flaring trapezoid: a flat crown
// with the brow band, the cloth widening behind the ears into two broad flat
// wings, and the lappets falling straight down beside the neck to the chest.
// The face sits narrower inside it: brow ridge, eye sockets between brow and
// cheekbones, the flattened stump of the broken nose, lips, a rounded chin.
const HEAD: readonly PartSpec[] = [
  { id: 'face', centre: [0.026, -0.004, 0], radii: [0.026, 0.034, 0.024], shape: [0.55, 0.65], tone: 'face', band: 'none', burial: 'clear', reach: 'skyline' },
  { id: 'browRidge', centre: [0.046, 0.014, 0], radii: [0.008, 0.0055, 0.021], shape: [0.7, 0.7], tone: 'face', band: 'none', burial: 'clear', reach: 'landmark' },
  { id: 'cheek', centre: [0.041, -0.007, 0.0165], radii: [0.012, 0.01, 0.0085], tone: 'face', band: 'none', burial: 'clear', reach: 'site', pair: true },
  // The broken nose: a flattened stump, standing only a little proud.
  { id: 'noseStump', centre: [0.051, -0.004, 0], radii: [0.0065, 0.011, 0.006], shape: [0.5, 0.4], tone: 'face', band: 'none', burial: 'clear', reach: 'site' },
  { id: 'upperLip', centre: [0.048, -0.0205, 0], radii: [0.006, 0.0036, 0.0095], shape: [0.8, 0.8], tone: 'face', band: 'none', burial: 'clear', reach: 'site' },
  { id: 'lowerLip', centre: [0.047, -0.029, 0], radii: [0.0055, 0.0032, 0.0085], shape: [0.8, 0.8], tone: 'face', band: 'none', burial: 'clear', reach: 'site' },
  { id: 'chin', centre: [0.04, -0.034, 0], radii: [0.011, 0.009, 0.011], tone: 'face', band: 'none', burial: 'clear', reach: 'site' },
  // The nemes crown: flat on top, widening a little downward.
  { id: 'nemes', centre: [0, 0.012, 0], radii: [0.042, 0.032, 0.034], shape: [0.45, 0.75], taper: 0.2, tone: 'nemes', band: 'nemes', burial: 'clear', reach: 'skyline' },
  // The brow band across the forehead at the crown's front edge.
  { id: 'browBand', centre: [0.037, 0.027, 0], radii: [0.007, 0.0045, 0.031], shape: [0.4, 0.5], tone: 'band', band: 'none', burial: 'clear', reach: 'landmark' },
  // The wings: broad flat panels flaring outward and down behind the ears.
  { id: 'wing', centre: [-0.004, -0.017, 0.04], radii: [0.032, 0.044, 0.012], shape: [0.3, 0.45], roll: -0.48, tone: 'nemes', band: 'nemes', burial: 'clear', reach: 'skyline', pair: true },
  // The lappets: long flat striped panels falling beside the neck to the chest.
  { id: 'lappet', centre: [0.012, -0.08, 0.036], radii: [0.0065, 0.038, 0.016], shape: [0.25, 0.4], pitch: 0.05, tone: 'nemes', band: 'nemes', burial: 'clear', reach: 'landmark', pair: true },
  // The back of the nemes: the cloth drawn in behind the head to the nape.
  { id: 'nemesBack', centre: [-0.03, -0.024, 0], radii: [0.022, 0.046, 0.036], shape: [0.5, 0.6], taper: 0.35, tone: 'nemes', band: 'nemes', burial: 'clear', reach: 'landmark' },
  // The queue: the nemes gathered behind the head (what the view from behind reads).
  { id: 'nemesQueue', centre: [-0.046, -0.03, 0], radii: [0.01, 0.028, 0.011], shape: [0.7, 0.7], tone: 'nemes', band: 'nemes', burial: 'clear', reach: 'site' },
]

/** Painted marks on the face's front (head-local y/z centre and radii): the
 *  almond eye sockets under the brow ridge and the mouth line between the
 *  lips. Drawn only where the level asks for them. */
export const SPHINX_FACE_MARKS: ReadonlyArray<{ id: string; y: number; z: number; ry: number; rz: number }> = [
  { id: 'eyeR', y: 0.0055, z: 0.0115, ry: 0.0035, rz: 0.0075 },
  { id: 'eyeL', y: 0.0055, z: -0.0115, ry: 0.0035, rz: 0.0075 },
  { id: 'mouth', y: -0.025, z: 0, ry: 0.0018, rz: 0.0085 },
]

function expand(spec: PartSpec, group: 'body' | 'head'): SphinxPart[] {
  const s = group === 'head' ? SPHINX_FORM.headScale : 1
  const a = SPHINX_HEAD_ANCHOR
  const place = (c: Vec3): Vec3 => (group === 'head' ? [a[0] + c[0] * s, a[1] + c[1] * s, a[2] + c[2] * s] : c)
  const base: SphinxPart = {
    id: spec.id,
    group,
    centre: place(spec.centre),
    radii: [spec.radii[0] * s, spec.radii[1] * s, spec.radii[2] * s],
    shape: spec.shape ?? [1, 1],
    roll: spec.roll ?? 0,
    pitch: spec.pitch ?? 0,
    taper: spec.taper ?? 0,
    tone: spec.tone ?? 'limestone',
    band: spec.band ?? (spec.burial === 'clear' ? 'course' : 'none'),
    burial: spec.burial,
    reach: spec.reach ?? 'site',
  }
  if (!spec.pair) return [base]
  const c = base.centre
  return [
    { ...base, id: `${spec.id}R` },
    { ...base, id: `${spec.id}L`, centre: [c[0], c[1], -c[2]], roll: -base.roll },
  ]
}

/** THE part list: every view of the Sphinx is drawn from these. */
export const SPHINX_PARTS: readonly SphinxPart[] = [
  ...BODY.flatMap((p) => expand(p, 'body')),
  ...HEAD.flatMap((p) => expand(p, 'head')),
]

export const SPHINX_BURIED_PARTS = SPHINX_PARTS.filter((p) => p.burial === 'buried')
export const SPHINX_CLEAR_PARTS = SPHINX_PARTS.filter((p) => p.burial === 'clear')

const REACH_ORDER: Record<SphinxReach, number> = { skyline: 0, landmark: 1, site: 2 }
const LOD_REACH: Record<SphinxLod, SphinxReach> = {
  'site-full': 'site',
  'site-standard': 'site',
  'site-reduced': 'site',
  landmark: 'landmark',
  skyline: 'skyline',
}

/** A level's emphasis (SPHINX_FORM.emphasis): the documented factors that
 *  transform the one definition for a distant view. Neutral (all 1, nothing
 *  revealed, no block) for a level that is drawn true, and for no level. */
export interface SphinxEmphasis {
  head: number
  pawLift: number
  pawReach: number
  pawSpread: number
  /** Width factor of the revealed stone forepaws. */
  pawWidth: number
  /** Draw the buried forepaws in stone (transformed by the paw factors)
   *  instead of raising sand over them. */
  revealPaws: boolean
  /** Width factor of the back ridge (the spine's half-width). */
  spineWidth: number
  frontBank: number
  stoneShade: number
  flankShade: number
  /** Draw the nemes, its wings, lappets and back as their derived block
   *  (`sphinxHeadBlock`) — the face-on outline of the distant skyline. */
  headBlock: boolean
}

export function sphinxEmphasis(lod?: SphinxLod): SphinxEmphasis {
  const listed = lod ? (SPHINX_FORM.emphasis as Partial<Record<SphinxLod, Partial<SphinxEmphasis>>>)[lod] : undefined
  return {
    head: 1,
    pawLift: 1,
    pawReach: 1,
    pawSpread: 1,
    pawWidth: 1,
    revealPaws: false,
    spineWidth: 1,
    frontBank: 1,
    stoneShade: 1,
    flankShade: SPHINX_FORM.drift.flankShade,
    headBlock: false,
    ...listed,
  }
}

/** The nemes parts the skyline's head block stands for. */
export const SPHINX_HEAD_BLOCK_SOURCES = ['nemes', 'wingR', 'wingL', 'lappetR', 'lappetL', 'nemesBack'] as const

/**
 * The head-and-nemes block, DERIVED from the nemes parts (SPHINX_HEAD_BLOCK_SOURCES):
 * one tapered, flat-topped superellipsoid spanning their extent — as high as
 * the crown down to the lappets' feet, as deep as crown front to nemes back —
 * whose half-width runs from the crown's at the top to the widest of the wings
 * and lappets at the bottom. Face-on that is the nemes' flat-topped trapezoid
 * widening down to the shoulders, the lappets joined to it (the skyline level,
 * where the separate wings read as two hanging lobes; owner verdict 11.11.2026).
 */
export function sphinxHeadBlock(): SphinxPart {
  const src = SPHINX_CLEAR_PARTS.filter((p) => (SPHINX_HEAD_BLOCK_SOURCES as readonly string[]).includes(p.id))
  const samples = src.flatMap((p) => sampleSurface(p, 32, 24))
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let bottomHalf = 0
  for (const { p } of samples) {
    minX = Math.min(minX, p[0])
    maxX = Math.max(maxX, p[0])
    minY = Math.min(minY, p[1])
    maxY = Math.max(maxY, p[1])
    bottomHalf = Math.max(bottomHalf, Math.abs(p[2]))
  }
  // The crown's half-width: the widest sample in the top tenth of the block.
  const band = maxY - (maxY - minY) * 0.1
  let topHalf = 0
  for (const { p } of samples) if (p[1] >= band) topHalf = Math.max(topHalf, Math.abs(p[2]))
  return {
    id: 'headBlock',
    group: 'head',
    centre: [(minX + maxX) / 2, (minY + maxY) / 2, 0],
    radii: [(maxX - minX) / 2, (maxY - minY) / 2, (topHalf + bottomHalf) / 2],
    shape: [0.3, 0.5],
    roll: 0,
    pitch: 0,
    taper: (bottomHalf - topHalf) / (bottomHalf + topHalf),
    tone: 'nemes',
    band: 'none',
    burial: 'clear',
    reach: 'skyline',
  }
}

let headBlockCache: SphinxPart | null = null

/** A forepaw at a level: the buried part lengthened (rear end fixed), lifted,
 *  spread from the axis and widened by the level's emphasis. */
function pawAt(part: SphinxPart, e: SphinxEmphasis, margin = 0): { c: Vec3; r: Vec3 } {
  const [cx, cy, cz] = part.centre
  const rx = part.radii[0] + margin
  return {
    c: [cx + rx * (e.pawReach - 1), cy, cz * e.pawSpread],
    r: [rx * e.pawReach, part.radii[1] * e.pawLift, part.radii[2] * e.pawWidth],
  }
}

/** The parts a level DRAWS: the clear ones whose reach covers it, the head
 *  block scaled about the head anchor by the level's emphasis. Buried parts
 *  are never drawn — the drift stands for them — except where a level's
 *  emphasis reveals the forepaws in stone. */
export function sphinxPartsFor(lod: SphinxLod): SphinxPart[] {
  const reach = REACH_ORDER[LOD_REACH[lod]]
  const e = sphinxEmphasis(lod)
  const k = e.head
  const a = SPHINX_HEAD_ANCHOR
  let parts = SPHINX_CLEAR_PARTS.filter((p) => REACH_ORDER[p.reach] <= reach)
  if (e.headBlock) {
    headBlockCache ??= sphinxHeadBlock()
    const sources = SPHINX_HEAD_BLOCK_SOURCES as readonly string[]
    parts = [...parts.filter((p) => !sources.includes(p.id)), headBlockCache]
  }
  if (e.spineWidth !== 1) {
    parts = parts.map((p) => (p.id === 'spine' ? { ...p, radii: [p.radii[0], p.radii[1], p.radii[2] * e.spineWidth] as Vec3 } : p))
  }
  if (e.revealPaws) {
    for (const p of SPHINX_BURIED_PARTS.filter((q) => q.id.startsWith('foreleg'))) {
      const paw = pawAt(p, e)
      // Lifted from the floor up: the stone's foot no deeper than the drift's.
      const cy = Math.max(paw.c[1], paw.r[1] - SPHINX_FORM.drift.sink)
      parts.push({ ...p, centre: [paw.c[0], cy, paw.c[2]], radii: paw.r, reach: 'landmark' })
    }
  }
  return parts.map((p) =>
    p.group !== 'head' || k === 1
      ? p
      : {
          ...p,
          centre: [a[0] + (p.centre[0] - a[0]) * k, a[1] + (p.centre[1] - a[1]) * k, a[2] + (p.centre[2] - a[2]) * k] as Vec3,
          radii: [p.radii[0] * k, p.radii[1] * k, p.radii[2] * k] as Vec3,
        },
  )
}

export function sphinxLodSpec(lod: SphinxLod) {
  return SPHINX_FORM.lods[lod]
}

// --- Superellipsoid geometry -------------------------------------------------

const spow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e)

/** Rotate a part-local vector into the body frame (roll about x, then pitch about z). */
function rotate(part: SphinxPart, x: number, y: number, z: number): [number, number, number] {
  const cr = Math.cos(part.roll)
  const sr = Math.sin(part.roll)
  const y1 = y * cr - z * sr
  const z1 = y * sr + z * cr
  const cp = Math.cos(part.pitch)
  const sp = Math.sin(part.pitch)
  return [x * cp - y1 * sp, x * sp + y1 * cp, z1]
}

/** The inverse of `rotate`. */
function unrotate(part: SphinxPart, x: number, y: number, z: number): [number, number, number] {
  const cp = Math.cos(part.pitch)
  const sp = Math.sin(part.pitch)
  const x1 = x * cp + y * sp
  const y1 = -x * sp + y * cp
  const cr = Math.cos(part.roll)
  const sr = Math.sin(part.roll)
  return [x1, y1 * cr + z * sr, -y1 * sr + z * cr]
}

export interface SurfaceSample {
  p: [number, number, number]
  n: [number, number, number]
}

/**
 * A point of a part's surface and its outward normal, body frame. `eta` is the
 * latitude (−π/2 bottom … π/2 top), `omega` the longitude (0 = forward, +x).
 */
export function partSurface(part: SphinxPart, eta: number, omega: number): SurfaceSample {
  const [e1, e2] = part.shape
  const [a, b, c] = part.radii
  const ce = Math.cos(eta)
  const se = Math.sin(eta)
  const cw = Math.cos(omega)
  const sw = Math.sin(omega)
  const lx = a * spow(ce, e1) * spow(cw, e2)
  const ly = b * spow(se, e1)
  const z0 = c * spow(ce, e1) * spow(sw, e2)
  let nx = spow(ce, 2 - e1) * spow(cw, 2 - e2) / a
  let ny = spow(se, 2 - e1) / b
  let nz = spow(ce, 2 - e1) * spow(sw, 2 - e2) / c
  // The taper scales z by t(y); the gradient of G(x, y, z/t(y)) gives the normal.
  const t = 1 - (part.taper * ly) / b
  const lz = z0 * t
  ny -= (nz * z0 * (-part.taper / b)) / t
  nz /= t
  const len = Math.hypot(nx, ny, nz) || 1
  nx /= len
  ny /= len
  nz /= len
  const [px, py, pz] = rotate(part, lx, ly, lz)
  const n = rotate(part, nx, ny, nz)
  return { p: [px + part.centre[0], py + part.centre[1], pz + part.centre[2]], n }
}

/** Sample a part's surface on a rings × rows grid (poles included once each row). */
export function sampleSurface(part: SphinxPart, rings: number, rows: number): SurfaceSample[] {
  const out: SurfaceSample[] = []
  for (let j = 0; j <= rows; j++) {
    const eta = -Math.PI / 2 + (Math.PI * j) / rows
    for (let i = 0; i < rings; i++) out.push(partSurface(part, eta, -Math.PI + (2 * Math.PI * i) / rings))
  }
  return out
}

/**
 * The radial "level" of a body-frame point against a part: 1 on the surface,
 * below 1 inside, and homogeneous of degree one along rays from the centre, so
 * `|p − c| · (1 − 1/level)` is the radial distance to the surface.
 */
export function partLevel(part: SphinxPart, x: number, y: number, z: number): number {
  const [lx, ly, lz] = unrotate(part, x - part.centre[0], y - part.centre[1], z - part.centre[2])
  const [e1, e2] = part.shape
  const [a, b, c] = part.radii
  // The untapered superellipsoid's level, homogeneous of degree one.
  const level0 = (px: number, py: number, pz: number) => {
    const h = Math.pow(Math.abs(px / a), 2 / e2) + Math.pow(Math.abs(pz / c), 2 / e2)
    return Math.pow(Math.pow(h, e2 / e1) + Math.pow(Math.abs(py / b), 2 / e1), e1 / 2)
  }
  if (part.taper === 0) return level0(lx, ly, lz)
  // The taper scales z by t(y) = 1 − taper·y/b at the SURFACE height, so the
  // level is the s at which p/s lies on the tapered surface:
  // level0(lx, ly, lz / t(ly/s)) = s. g(s) = level0(…) − s is ≥ 0 at the
  // smallest s that keeps |ly/s| ≤ b and falls without bound, so bisect.
  const g = (s: number) => level0(lx, ly, lz / Math.max(1e-6, 1 - (part.taper * ly) / (b * s))) - s
  let lo = Math.abs(ly) / b
  if (lo === 0) return level0(lx, 0, lz)
  let hi = Math.max(lo * 2, level0(lx, ly, lz) * 4, 1e-9)
  while (g(hi) > 0) hi *= 2
  if (g(lo) <= 0) return lo
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2
    if (g(mid) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

// --- The drift ---------------------------------------------------------------

/**
 * The wind-blown sand banks: drift-only masses, not body parts. Without them
 * the union of the part domes reads as two round lobes over the forepaws and
 * two cheeks over the haunches, each pair with a sharp crease between (owner
 * verdict 11.11.2026). The FRONT bank is one sand bank piled against the chest
 * that fills the gap between the paws, so only a broad, shallow hint of them
 * shows; the REAR bank is one long swell over the haunches, tapering to the
 * tail. Both lie a little to the south (+z), the lee of the prevailing
 * north wind. Each dome is the bank's ellipsoid cap run down at the repose slope.
 */
export const SPHINX_DRIFT_BANKS: ReadonlyArray<{ id: string; centre: Vec3; radii: Vec3 }> = [
  { id: 'frontBank', centre: [0.4, 0.0, 0.012], radii: [0.21, 0.082, 0.12] },
  { id: 'rearBank', centre: [-0.27, 0.035, 0.012], radii: [0.24, 0.09, 0.13] },
]

/** One dome of the drift: an ellipsoid cap (centre, semi-axes) run down at the repose slope. */
interface DriftCap {
  c: Vec3
  rx: number
  ry: number
  rz: number
}

const capCache = new Map<string, DriftCap[]>()

/**
 * The drift's domes at a level: each buried part's cover ellipsoid (its radii
 * plus the margin and the sand cover), then the wind-blown banks. A level's
 * emphasis lifts, lengthens (rear end fixed) and spreads the domes over the
 * forepaws — or drops them where it reveals the paws in stone — and scales the
 * front bank; with no level the drift is the site's, drawn true.
 */
function driftCaps(lod?: SphinxLod): DriftCap[] {
  const key = lod ?? ''
  const hit = capCache.get(key)
  if (hit) return hit
  const d = SPHINX_FORM.drift
  const e = sphinxEmphasis(lod)
  const caps: DriftCap[] = []
  for (const part of SPHINX_BURIED_PARTS) {
    const [cx, cy, cz] = part.centre
    if (part.id.startsWith('foreleg')) {
      // Revealed in stone at this level: no sand over them.
      if (e.revealPaws) continue
      const paw = pawAt(part, { ...e, pawWidth: 1 }, d.margin)
      caps.push({ c: paw.c, rx: paw.r[0], ry: (part.radii[1] + d.cover) * e.pawLift, rz: part.radii[2] + d.margin })
      continue
    }
    caps.push({ c: [cx, cy, cz], rx: part.radii[0] + d.margin, ry: part.radii[1] + d.cover, rz: part.radii[2] + d.margin })
  }
  for (const bank of SPHINX_DRIFT_BANKS) {
    const f = bank.id === 'frontBank' ? e.frontBank : 1
    if (f <= 0) continue
    caps.push({ c: bank.centre, rx: bank.radii[0], ry: bank.radii[1] * f, rz: bank.radii[2] })
  }
  capCache.set(key, caps)
  return caps
}

/** An ellipsoid cap over a centre, run down at the repose slope where it gets steeper. */
function capHeight(c: Vec3, rx: number, ry: number, rz: number, x: number, z: number): number {
  const d = SPHINX_FORM.drift
  const dx = x - c[0]
  const dz = z - c[2]
  const t = Math.hypot(dx, dz)
  // Along this ray the ellipse's radius R and the profile y = cy + ry·√(1−(t/R)²).
  const R = t > 1e-9 ? 1 / Math.sqrt((dx / t / rx) ** 2 + (dz / t / rz) ** 2) : Math.min(rx, rz)
  const k = d.slope
  // Where the profile is exactly as steep as the repose slope: (ry/R)·u/√(1−u²) = k.
  const q = (k * R) / ry
  const uStar = q / Math.sqrt(1 + q * q)
  const tStar = uStar * R
  const cy = c[1]
  if (t <= tStar) return cy + ry * Math.sqrt(1 - (t / R) ** 2)
  return cy + ry * Math.sqrt(1 - uStar * uStar) - k * (t - tStar)
}

/**
 * The drift's surface height at a body-frame (x, z): the smooth union of every
 * buried part's dome over a floor below the ground (where it is never drawn).
 * It is above every buried part, and it is what the clear parts break through.
 * Each dome adds `e^((y−floor)/blend) − 1`, so a dome at the floor adds
 * nothing and the union stays continuous where a dome's reach ends.
 */
export function sphinxDriftHeight(x: number, z: number, lod?: SphinxLod): number {
  const d = SPHINX_FORM.drift
  const floor = -d.sink
  let sum = 1
  for (const cap of driftCaps(lod)) {
    const y = capHeight(cap.c, cap.rx, cap.ry, cap.rz, x, z)
    if (y > floor) sum += Math.exp((y - floor) / d.blend) - 1
  }
  return floor + d.blend * Math.log(sum)
}

/** The drift's surface normal (unit), from central differences. */
export function sphinxDriftNormal(x: number, z: number, lod?: SphinxLod): [number, number, number] {
  const e = 1e-4
  const gx = (sphinxDriftHeight(x + e, z, lod) - sphinxDriftHeight(x - e, z, lod)) / (2 * e)
  const gz = (sphinxDriftHeight(x, z + e, lod) - sphinxDriftHeight(x, z - e, lod)) / (2 * e)
  const len = Math.hypot(gx, 1, gz)
  return [-gx / len, 1 / len, -gz / len]
}

/** The rectangle outside which the drift is certainly below the ground. */
export function sphinxDriftBounds(lod?: SphinxLod): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  const d = SPHINX_FORM.drift
  for (const k of driftCaps(lod)) {
    // A dome reaches past its cap by its whole height run down at the repose slope.
    const reach = (k.c[1] + k.ry + d.sink) / d.slope
    minX = Math.min(minX, k.c[0] - k.rx - reach)
    maxX = Math.max(maxX, k.c[0] + k.rx + reach)
    minZ = Math.min(minZ, k.c[2] - k.rz - reach)
    maxZ = Math.max(maxZ, k.c[2] + k.rz + reach)
  }
  return { minX, maxX, minZ, maxZ }
}

// --- The measures the record and the tests speak in --------------------------

/** The crown: the top of the nemes, the highest point of the monument (at a
 *  level, with that level's emphasis; with none, the definition drawn true). */
export function sphinxCrownHeight(lod?: SphinxLod): number {
  let top = 0
  for (const part of lod ? sphinxPartsFor(lod) : SPHINX_CLEAR_PARTS) {
    for (const s of sampleSurface(part, 16, 16)) top = Math.max(top, s.p[1])
  }
  return top
}

/** The front of the chest, on the axis: where the burial line is read. */
export function sphinxChestFront(): number {
  const chest = SPHINX_PARTS.find((p) => p.id === 'chest')!
  return chest.centre[0] + chest.radii[0]
}

/** The drawn burial line: the drift's height at the chest front. */
export function sphinxBurialLine(): number {
  return sphinxDriftHeight(sphinxChestFront(), 0)
}

/** The documented ~1890 burial line (docs/giza-1890.md §1.3) as a height. */
export function sphinxBurialTarget(): { line: number; tolerance: number } {
  // Measured against the REAL crown (body proportion), not the drawn one: the
  // head is drawn enlarged, and the sand lies against the body, not the head.
  const crown = SPHINX_FORM.realCrown
  return { line: SPHINX_FORM.burialLineFraction * crown, tolerance: SPHINX_FORM.burialLineTolerance * crown }
}

/** Is the body-frame (x, z) on the drawn ground footprint — the drift standing
 *  above the ground there? */
export function onSphinxFootprint(x: number, z: number): boolean {
  return sphinxDriftHeight(x, z) > 0
}

/**
 * The collidable mass (body units) as capsules ACROSS the body: per station
 * along it, one capsule for each contiguous run of the drawn footprint's slice
 * there (so a notch in the footprint stays open), its radius three
 * quarters of the station step so neighbours overlap into an even rim. The
 * union covers the drawn footprint and overshoots it by at most about a
 * station step (point 378: the collider is the drawn body, nothing more).
 */
export function sphinxColliderSegments(): Array<{ x1: number; z1: number; x2: number; z2: number; r: number }> {
  const step = SPHINX_FORM.colliderStep
  const b = sphinxDriftBounds()
  const dz = 0.002
  const nz = Math.ceil((b.maxZ - b.minZ) / dz)
  const out: Array<{ x1: number; z1: number; x2: number; z2: number; r: number }> = []
  for (let x0 = b.minX + step / 2; x0 < b.maxX; x0 += step) {
    const hit = new Uint8Array(nz + 1)
    for (let k = 0; k <= 4; k++) {
      const x = x0 - step / 2 + (step * k) / 4
      for (let j = 0; j <= nz; j++) if (onSphinxFootprint(x, b.minZ + j * dz)) hit[j] = 1
    }
    for (let j = 0; j <= nz; j++) {
      if (!hit[j]) continue
      let k = j
      while (k + 1 <= nz && hit[k + 1]) k++
      out.push({ x1: x0, z1: b.minZ + (j - 1) * dz, x2: x0, z2: b.minZ + (k + 1) * dz, r: step * 0.75 })
      j = k
    }
  }
  return out
}
