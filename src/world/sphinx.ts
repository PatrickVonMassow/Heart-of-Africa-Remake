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
// body UNDER sand: every buried part raises a dome that covers it, and the
// domes' smooth union is the long couchant swell with the shoulders and the
// paws showing through, out of which the back ridge breaks.
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
  // Buried: they only raise the drift.
  { id: 'torso', centre: [-0.05, 0.07, 0], radii: [0.3, 0.08, 0.095], shape: [0.95, 0.95], burial: 'buried' },
  { id: 'shoulders', centre: [0.17, 0.09, 0], radii: [0.11, 0.095, 0.11], burial: 'buried' },
  { id: 'haunch', centre: [-0.34, 0.065, 0], radii: [0.13, 0.085, 0.12], burial: 'buried' },
  { id: 'breast', centre: [0.27, 0.08, 0], radii: [0.05, 0.08, 0.075], burial: 'buried' },
  { id: 'hindLeg', centre: [-0.27, 0.03, 0.115], radii: [0.14, 0.035, 0.035], burial: 'buried', pair: true },
  // The forepaws stretched forward, under the sand in 1890 (the record).
  { id: 'foreleg', centre: [0.34, 0.03, 0.065], radii: [0.16, 0.032, 0.04], burial: 'buried', pair: true },
  // The tail curls round the right haunch.
  { id: 'tail', centre: [-0.36, 0.018, 0.14], radii: [0.11, 0.016, 0.018], burial: 'buried' },
  // Clear: the stone that breaks the surface.
  // The upper chest between the lappets ("a little of the chest clear").
  { id: 'chest', centre: [0.255, 0.125, 0], radii: [0.055, 0.07, 0.085], shape: [0.8, 0.9], burial: 'clear', reach: 'skyline' },
  { id: 'neck', centre: [0.21, 0.18, 0], radii: [0.055, 0.045, 0.05], shape: [0.9, 0.9], pitch: 0.25, burial: 'clear', reach: 'skyline' },
  // The back ridge: a long, squarish strip of the spine breaking the drift,
  // ending before the shoulder swell rises over it and before the haunch.
  { id: 'backRidge', centre: [-0.06, 0.145, 0], radii: [0.2, 0.055, 0.075], shape: [0.9, 0.7], burial: 'clear', reach: 'skyline' },
]

/** Where the head sits on the neck (body units); head parts scale about it. */
export const SPHINX_HEAD_ANCHOR: Vec3 = [0.268, 0.236, 0]

// --- The head (head-local units, scaled by SPHINX_FORM.headScale) ------------
const HEAD: readonly PartSpec[] = [
  // The face: a squarish block, flat in front, chin rounded — and no beard.
  { id: 'face', centre: [0.028, -0.008, 0], radii: [0.024, 0.035, 0.03], shape: [0.6, 0.6], tone: 'face', band: 'none', burial: 'clear', reach: 'skyline' },
  // The broken nose: a short stump with a flat break, nothing more.
  { id: 'noseStump', centre: [0.051, -0.008, 0], radii: [0.007, 0.009, 0.006], shape: [0.5, 0.35], tone: 'face', band: 'none', burial: 'clear', reach: 'site' },
  // The nemes: the headcloth over skull and forehead, set back from the face
  // and widening down to the shoulders — the trapezoid that frames the face.
  { id: 'nemes', centre: [0, -0.008, 0], radii: [0.036, 0.054, 0.047], shape: [0.55, 0.7], taper: 0.35, tone: 'nemes', band: 'nemes', burial: 'clear', reach: 'skyline' },
  // The brow band: the headband across the forehead at the nemes' front edge.
  { id: 'browBand', centre: [0.04, 0.02, 0], radii: [0.012, 0.005, 0.027], shape: [0.5, 0.6], tone: 'band', band: 'none', burial: 'clear', reach: 'landmark' },
  // The lappets falling in front of the shoulders onto the chest.
  { id: 'lappet', centre: [0.024, -0.08, 0.047], radii: [0.008, 0.042, 0.015], shape: [0.45, 0.5], roll: -0.06, pitch: 0.12, tone: 'nemes', band: 'nemes', burial: 'clear', reach: 'skyline', pair: true },
  { id: 'ear', centre: [0.04, 0, 0.033], radii: [0.007, 0.012, 0.009], shape: [1, 1], tone: 'face', band: 'none', burial: 'clear', reach: 'landmark', pair: true },
  // The queue: the nemes gathered behind the head (what the view from behind reads).
  { id: 'nemesQueue', centre: [-0.042, -0.026, 0], radii: [0.01, 0.03, 0.012], shape: [0.7, 0.7], tone: 'nemes', band: 'nemes', burial: 'clear', reach: 'landmark' },
]

/** Painted marks on the face's front (head-local y/z centre and radii): the
 *  eye sockets and the mouth line. Drawn only where the level asks for them. */
export const SPHINX_FACE_MARKS: ReadonlyArray<{ id: string; y: number; z: number; ry: number; rz: number }> = [
  { id: 'eyeR', y: 0.006, z: 0.012, ry: 0.0045, rz: 0.0075 },
  { id: 'eyeL', y: 0.006, z: -0.012, ry: 0.0045, rz: 0.0075 },
  { id: 'mouth', y: -0.027, z: 0, ry: 0.0025, rz: 0.011 },
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

/** The parts a level DRAWS: the clear ones whose reach covers it. Buried parts
 *  are never drawn — the drift stands for them at every level. */
export function sphinxPartsFor(lod: SphinxLod): SphinxPart[] {
  const reach = REACH_ORDER[LOD_REACH[lod]]
  return SPHINX_CLEAR_PARTS.filter((p) => REACH_ORDER[p.reach] <= reach)
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

/** The cover dome over one buried part, at a body-frame (x, z). */
function domeHeight(part: SphinxPart, x: number, z: number): number {
  const d = SPHINX_FORM.drift
  // The part's cover ellipsoid; its dome follows it until it is as steep as
  // the repose slope, then runs straight down to the floor.
  const rx = part.radii[0] + d.margin
  const rz = part.radii[2] + d.margin
  const ry = part.radii[1] + d.cover
  const dx = x - part.centre[0]
  const dz = z - part.centre[2]
  const t = Math.hypot(dx, dz)
  // Along this ray the ellipse's radius R and the profile y = cy + ry·√(1−(t/R)²).
  const R = t > 1e-9 ? 1 / Math.sqrt((dx / t / rx) ** 2 + (dz / t / rz) ** 2) : Math.min(rx, rz)
  const k = d.slope
  // Where the profile is exactly as steep as the repose slope: (ry/R)·u/√(1−u²) = k.
  const q = (k * R) / ry
  const uStar = q / Math.sqrt(1 + q * q)
  const tStar = uStar * R
  const cy = part.centre[1]
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
export function sphinxDriftHeight(x: number, z: number): number {
  const d = SPHINX_FORM.drift
  const floor = -d.sink
  let sum = 1
  for (const part of SPHINX_BURIED_PARTS) {
    const y = domeHeight(part, x, z)
    if (y > floor) sum += Math.exp((y - floor) / d.blend) - 1
  }
  return floor + d.blend * Math.log(sum)
}

/** The drift's surface normal (unit), from central differences. */
export function sphinxDriftNormal(x: number, z: number): [number, number, number] {
  const e = 1e-4
  const gx = (sphinxDriftHeight(x + e, z) - sphinxDriftHeight(x - e, z)) / (2 * e)
  const gz = (sphinxDriftHeight(x, z + e) - sphinxDriftHeight(x, z - e)) / (2 * e)
  const len = Math.hypot(gx, 1, gz)
  return [-gx / len, 1 / len, -gz / len]
}

/** The rectangle outside which the drift is certainly below the ground. */
export function sphinxDriftBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  const d = SPHINX_FORM.drift
  for (const p of SPHINX_BURIED_PARTS) {
    // A dome reaches past its part by its margin plus its whole height run down at the repose slope.
    const reach = d.margin + (p.centre[1] + p.radii[1] + d.cover + d.sink) / d.slope
    minX = Math.min(minX, p.centre[0] - p.radii[0] - reach)
    maxX = Math.max(maxX, p.centre[0] + p.radii[0] + reach)
    minZ = Math.min(minZ, p.centre[2] - p.radii[2] - reach)
    maxZ = Math.max(maxZ, p.centre[2] + p.radii[2] + reach)
  }
  return { minX, maxX, minZ, maxZ }
}

// --- The measures the record and the tests speak in --------------------------

/** The crown: the top of the nemes, the highest point of the monument. */
export function sphinxCrownHeight(): number {
  let top = 0
  for (const part of SPHINX_CLEAR_PARTS) {
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
  const crown = sphinxCrownHeight()
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
 * there (so the notch between the paw lobes stays open), its radius three
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
