// Procedural pelt markings of the ambient wildlife (design.md §19): zebra
// stripes, giraffe patches, cat and hyena spots, the gazelle's flank band and
// pale belly. No texture asset: every fauna part carries a small per-vertex
// `faunaMark` attribute (pattern kind + three parameters) and the shared fauna
// material evaluates the pattern in TSL on the RAW geometry position — never
// positionLocal, which instancing overwrites (see createCrocodileMaterial).
//
// Readable when small: the bands are few and broad, and every edge is
// antialiased by its own screen-space derivative (fwidth), so a far animal
// averages to a calm mid-tone instead of shimmering — silhouette and broad
// bands carry the species at distance, the finer spots only up close.

import * as THREE from 'three/webgpu'
import {
  abs,
  attribute,
  clamp,
  dot,
  float,
  Fn,
  fract,
  fwidth,
  If,
  max,
  mix,
  mx_worley_noise_vec2,
  positionGeometry,
  sin,
  smoothstep,
  vec3,
  vertexColor,
} from 'three/tsl'

/** Name of the per-vertex marking attribute: [kind, a, b, c]. */
export const FAUNA_MARK_ATTRIBUTE = 'faunaMark'

/** Pattern kinds. The parameters (a, b, c) per kind:
 *  - stripes: (a, b, c) = band axis × frequency (cycles per unit, geometry space)
 *  - patches: a = cells per unit, b = pale-line width (squared-distance units)
 *  - spots:   a = cells per unit, b = spot radius, c = rosette hollow (0 solid)
 *  - flank:   a = belly-line height, b = dark band height above it */
export const MARK = { none: 0, stripes: 1, patches: 2, spots: 3, flank: 4 } as const
export type MarkKind = (typeof MARK)[keyof typeof MARK]

/** Pattern tones, as factors on (or targets for) the part's vertex colour. */
export const MARK_TONES = {
  /** Zebra black band: a factor on the light coat. */
  stripeDark: 0.12,
  /** Fraction of a stripe period that is dark (broad, bold bands). */
  stripeDuty: 0.46,
  /** Giraffe patch: the coat darkened to a chestnut. */
  patchDark: 0.5,
  /** Giraffe network lines and the gazelle belly: a pale cream. */
  cream: '#ece3cf',
  /** Cat/hyena spots. */
  spotDark: 0.28,
  /** The gazelle's dark flank band. */
  flankDark: 0.38,
} as const

/** Set every vertex of `geo` to one marking. Returns `geo`. */
export function markGeometry(geo: THREE.BufferGeometry, kind: MarkKind, a = 0, b = 0, c = 0): THREE.BufferGeometry {
  const count = geo.attributes.position.count
  const data = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    data[i * 4] = kind
    data[i * 4 + 1] = a
    data[i * 4 + 2] = b
    data[i * 4 + 3] = c
  }
  geo.setAttribute(FAUNA_MARK_ATTRIBUTE, new THREE.BufferAttribute(data, 4))
  return geo
}

/** Stripes along `axis` (a direction in geometry space) at `perUnit` cycles. */
export function markStripes(geo: THREE.BufferGeometry, axis: [number, number, number], perUnit: number): THREE.BufferGeometry {
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1
  return markGeometry(geo, MARK.stripes, (axis[0] / len) * perUnit, (axis[1] / len) * perUnit, (axis[2] / len) * perUnit)
}

/** The marking a vertex carries (for tests and probes). */
export function markAt(geo: THREE.BufferGeometry, i: number): [number, number, number, number] {
  const m = geo.getAttribute(FAUNA_MARK_ATTRIBUTE)
  return [m.getX(i), m.getY(i), m.getZ(i), m.getW(i)]
}

/** Antialiased 0..1 step: 1 below `edge`, 0 above, blurred over one pixel. */
const aaBelow = (value: THREE.Node<'float'>, edge: THREE.Node<'float'>) => {
  const w = max(fwidth(value), float(1e-4))
  return float(1).sub(smoothstep(edge.sub(w), edge.add(w), value))
}

/**
 * The marking factor on a base coat colour, per fragment: 1 on an unmarked part
 * (kind 0). `bandScale` widens every band and cell (1 = as built; < 1 = fewer,
 * broader bands — the skyline silhouettes use it so a stripe still spans
 * several pixels on a two-degree animal).
 */
function markingFactor(base: THREE.Node<'vec3'>, bandScale: number) {
  const m = attribute<'vec4'>(FAUNA_MARK_ATTRIBUTE, 'vec4')
  const kind = m.x.round()
  const p = positionGeometry
  const k = float(bandScale)
  const creamRgb = new THREE.Color(MARK_TONES.cream)
  const cream = vec3(creamRgb.r, creamRgb.g, creamRgb.b)
  // Factor that turns the base colour into `target`.
  const toward = (target: THREE.Node<'vec3'>, mask: THREE.Node<'float'>) => mix(vec3(1), target.div(base), mask)
  const factor = vec3(1).toVar()

  If(kind.equal(MARK.stripes), () => {
    // Gently wavy bands: the wobble rides height only, so a band stays
    // continuous over the back from one flank to the other.
    const s = dot(p, m.yzw.mul(k)).add(sin(p.y.mul(7)).mul(0.18))
    const d = abs(fract(s).sub(0.5)).mul(2) // 0 mid-band .. 1 between bands
    const dark = aaBelow(d, float(MARK_TONES.stripeDuty))
    factor.assign(mix(vec3(1), vec3(MARK_TONES.stripeDark), dark))
  })
    .ElseIf(kind.equal(MARK.patches), () => {
      // Voronoi cells (squared distances): F2² − F1² grows linearly with the
      // distance to a cell border, so a threshold draws even pale lines.
      const f = mx_worley_noise_vec2(p.mul(m.y.mul(k)), 0.85)
      const edge = f.y.sub(f.x)
      const line = aaBelow(edge, m.z)
      factor.assign(mix(vec3(MARK_TONES.patchDark), toward(cream, float(1)), line))
    })
    .ElseIf(kind.equal(MARK.spots), () => {
      const f = mx_worley_noise_vec2(p.mul(m.y.mul(k)), 0.9)
      const r = f.x.sqrt()
      const spot = aaBelow(r, m.z).mul(float(1).sub(aaBelow(r, m.w)))
      factor.assign(mix(vec3(1), vec3(MARK_TONES.spotDark), spot))
    })
    .ElseIf(kind.equal(MARK.flank), () => {
      const belly = aaBelow(p.y, m.y)
      const band = aaBelow(p.y, m.y.add(m.z)).sub(belly)
      const dark = mix(vec3(1), vec3(MARK_TONES.flankDark), clamp(band, 0, 1))
      factor.assign(mix(dark, toward(cream, float(1)), belly))
    })
  return factor
}

/**
 * The TSL colour node of the shared fauna material: a per-fragment factor on
 * the vertex colour (the material multiplies the vertex colour in itself), so
 * an unmarked part (kind 0) renders exactly as before.
 */
export function faunaMarkingColorNode() {
  return Fn(() => markingFactor(max(vertexColor().rgb, vec3(0.02)), 1))()
}

/** Rec. 709 luminance weights, for the silhouette's marking contrast. */
const LUMA = [0.2126, 0.7152, 0.0722] as const

/**
 * How a skyline silhouette's haze tint is scaled by its pelt marking (CPU
 * mirror of `silhouetteMarkingColorNode`, for tests): the marked coat's
 * luminance relative to the plain coat, eased toward 1 by `contrast` (0 = the
 * flat haze tint, 1 = the full pelt contrast) and clamped so a pale belly
 * lifts the tint without blowing out to the sky.
 */
export function silhouetteMarkScale(markedOverCoat: number, contrast: number, maxLift = 1.8): number {
  const r = Math.min(maxLift, Math.max(0, markedOverCoat))
  return 1 + (r - 1) * Math.max(0, Math.min(1, contrast))
}

/**
 * Colour node of a skyline silhouette (point 102 haze look, work-order 1284
 * species marks): the flat aerial-perspective `tint` scaled per fragment by the
 * pelt marking at a haze-reduced `contrast` — so the zebra still reads striped
 * and the gazelle as dark-banded over a pale belly, while the mean tone stays
 * the hazed one. Bands are widened by `bandScale` to survive the small size.
 */
export function silhouetteMarkingColorNode(tint: THREE.Color, contrast: number, bandScale: number, maxLift = 1.8) {
  return Fn(() => {
    const base = max(vertexColor().rgb, vec3(0.02))
    const factor = markingFactor(base, bandScale)
    const luma = vec3(LUMA[0], LUMA[1], LUMA[2])
    const ratio = clamp(dot(base.mul(factor), luma).div(dot(base, luma)), 0, maxLift)
    const scale = float(1).add(ratio.sub(1).mul(clamp(float(contrast), 0, 1)))
    return vec3(tint.r, tint.g, tint.b).mul(scale)
  })()
}
