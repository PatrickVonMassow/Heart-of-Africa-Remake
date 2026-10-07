// The villager's dress as its own meshes on the skinned body (work-order
// "villager dress", layer 3): each layer of the appearance table
// (systems/appearance.ts) becomes one geometry, shaped round the body's
// bind-pose envelope and skinned to the same 17 bones, so wrap, cloak, head
// covering and ornament move with the person. The patterns are TSL on the
// garment's own bind-pose position — no texture, identical on WebGPU and
// WebGL 2 — and one material serves every figure in a settlement.

import * as THREE from 'three/webgpu'
import {
  abs,
  atan,
  attribute,
  clamp,
  float,
  Fn,
  fract,
  fwidth,
  If,
  max,
  mix,
  mx_noise_float,
  positionGeometry,
  smoothstep,
  vertexColor,
} from 'three/tsl'
import type { DressLayer, DressPattern } from '../systems/appearance'
import { merge, sweepTube, type SweepStation } from './faunaGeometry'
import {
  boneIndex,
  boneSegments,
  cutTriangles,
  mixHex,
  paint,
  SECOND_COLOUR_ATTRIBUTE,
  skinGeometry,
  SURFACE_ATTRIBUTE,
  tidy,
  trunkProfile,
  vertexWeights,
  type BodyProportions,
  type BoneName,
} from './figureBody'

/** Pattern kinds of the `figureSurface` attribute's x. */
export const PATTERN_KIND: Record<DressPattern, number> = {
  plain: 0,
  bands: 1,
  stripes: 2,
  checks: 3,
  mottle: 4,
  beadwork: 5,
  border: 6,
}

/** Roughness by material: greased hide and beads shine, bark and wool do not. */
const ROUGHNESS: Record<DressLayer['material'], number> = {
  hide: 0.7,
  fur: 0.95,
  barkCloth: 0.95,
  cotton: 0.9,
  wool: 0.95,
  blanket: 0.95,
  raffia: 0.9,
  leaves: 0.75,
  beads: 0.4,
  metal: 0.35,
  hair: 0.95,
  pigment: 0.85,
}

/** The surface a layer is drawn with: [kind, a, b, roughness]. */
export function surfaceOf(l: DressLayer, p: BodyProportions, bottomY: number): [number, number, number, number] {
  const r = ROUGHNESS[l.material]
  const H = p.stature
  switch (l.pattern) {
    case 'bands':
      return [PATTERN_KIND.bands, 18 / H, 0.5, r]
    case 'stripes':
      return [PATTERN_KIND.stripes, 22, 0.45, r]
    case 'checks':
      return [PATTERN_KIND.checks, 14 / H, 0, r]
    case 'mottle':
      return [PATTERN_KIND.mottle, (l.material === 'fur' ? 70 : 34) / H, l.material === 'fur' ? 0.75 : 0.45, r]
    case 'beadwork':
      return [PATTERN_KIND.beadwork, 120 / H, 0, r]
    case 'border':
      return [PATTERN_KIND.border, bottomY, 0.035 * H, r]
    default:
      // A plain hide still reads as hide: a faint mottle in its own darker tone.
      return l.material === 'hide' || l.material === 'barkCloth' ? [PATTERN_KIND.mottle, 30 / H, 0.25, r] : [0, 0, 0, r]
  }
}

// ---- the body envelope the garments are shaped round ----------------------

/** Half-width and half-depth of the trunk at height y (bind pose). */
export function trunkAt(p: BodyProportions, y: number): [number, number] {
  // A measured body: its own sections, bust and belly included. The
  // code-built one: its profile, the dress going over the bust (the chest
  // station), not through it.
  const st = p.trunkSections ?? trunkProfile(p).map(([y, x, z], i) => [y, x, i === 3 ? z + p.bust * 0.75 : z] as [number, number, number])
  if (y <= st[0][0]) {
    // Below the crotch: both legs side by side.
    const legW = p.hipX + p.thighR * 1.15
    return [Math.max(legW, st[0][1]), Math.max(p.thighR, st[0][2])]
  }
  // From the crotch up to the hip joint the tops of the thighs still bulge
  // past the pelvis (their sweep starts at the hip, 1.1 × thighR wide).
  if (y <= p.hipY + 0.02 * p.stature) {
    const [x, z] = trunkInterp(st, y)
    return [Math.max(x, p.hipX + p.thighR * 1.15), Math.max(z, p.thighR * 1.5)]
  }
  return trunkInterp(st, y)
}

function trunkInterp(st: Array<[number, number, number]>, y: number): [number, number] {
  for (let i = 0; i < st.length - 1; i++) {
    const [y0, x0, z0] = st[i]
    const [y1, x1, z1] = st[i + 1]
    if (y <= y1) {
      const t = (y - y0) / (y1 - y0)
      return [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]
    }
  }
  return [st[st.length - 1][1], st[st.length - 1][2]]
}

const st = (y: number, rx: number, rz: number, z = 0): SweepStation => ({ p: [0, y, z], rx, ry: rz })

/**
 * Open a vertical sweep's front below `belowY`: drop the `cols` tube columns
 * either side of the front vertex line (u = ¼ — sweepTube's ring starts at +x
 * and turns toward +z). Chosen by the columns' u, not by a polar angle, so the
 * edges follow the mesh lines exactly: on an elliptic ring a polar angle cuts
 * across the columns and left a sawtooth down the opening.
 */
function openFront(geo: THREE.BufferGeometry, cols: number, belowY: number): void {
  const index = geo.getIndex()
  const uv = geo.getAttribute('uv')
  const pos = geo.getAttribute('position')
  if (!index || !uv) return
  const radial = Math.round(1 / Math.max(1e-6, uv.getX(1) - uv.getX(0)))
  const keep: number[] = []
  for (let i = 0; i < index.count; i += 3) {
    const t = [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
    const u = t.reduce((sum, k) => sum + uv.getX(k), 0) / 3
    const y = t.reduce((sum, k) => sum + pos.getY(k), 0) / 3
    const inFront = Math.abs(u - 0.25) < cols / radial
    if (!(inFront && y < belowY)) keep.push(...t)
  }
  geo.setIndex(keep)
}

/** A tube round the trunk from `top` down to `bottom`, `ease` off the body
 *  and flaring by `flare` (fraction of stature) at the hem. */
function wrapTube(p: BodyProportions, top: number, bottom: number, ease: number, flare: number, radial: number, rings = 10): THREE.BufferGeometry {
  // Stations evenly down the garment, each moved onto the bulge of the trunk
  // (bust, belly, buttocks, hips) nearest it when one lies within half a
  // step: a station on the bulge's crest carries the cloth over it, where
  // two either side of it would cut the chord through it. Not the shoulders'
  // crest: a station there spreads the cloth into a shelf over the arms.
  const step = (top - bottom) / (rings - 1)
  const crests: number[] = []
  const probe = 0.005 * p.stature
  for (let y = Math.min(top, p.shoulderY - 0.06 * p.stature) - probe; y > bottom + probe; y -= probe) {
    const [x0, z0] = trunkAt(p, y + probe)
    const [x1, z1] = trunkAt(p, y)
    const [x2, z2] = trunkAt(p, y - probe)
    if ((z1 > z0 && z1 >= z2) || (x1 > x0 && x1 >= x2)) crests.push(y)
  }
  const ys = Array.from({ length: rings }, (_, i) => top - step * i)
  for (const c of crests) {
    let best = -1
    for (let i = 1; i < rings - 1; i++) if (Math.abs(ys[i] - c) < step / 2 && (best < 0 || Math.abs(ys[i] - c) < Math.abs(ys[best] - c))) best = i
    if (best > 0) ys[best] = c
  }
  const r = ys.map((y) => trunkAt(p, y))
  // Between two stations the cloth's girth blends from one to the other
  // (sweepTube's smoothstep), so what still bulges between them would poke
  // through the chord: both stations rise by the largest shortfall.
  for (let i = 0; i < rings - 1; i++) {
    for (const a of [0, 1]) {
      let short = 0
      for (let k = 1; k < 12; k++) {
        const f = k / 12
        const e = f * f * (3 - 2 * f)
        const need = trunkAt(p, ys[i] + (ys[i + 1] - ys[i]) * f)[a]
        short = Math.max(short, need - (r[i][a] + (r[i + 1][a] - r[i][a]) * e))
      }
      r[i][a] += short
      r[i + 1][a] += short
    }
  }
  const stations = ys.map((y, i) => {
    const t = i / (rings - 1)
    const out = ease + flare * p.stature * t * t
    // The hem flares mostly sideways: a deep front-back flare is what a
    // kneeling figure's shins turn into depth below the ground.
    return st(y, r[i][0] + out, r[i][1] + ease * 0.8 + (out - ease) * 0.3)
  })
  return sweepTube(stations, { radial, rings: rings * 2 })
}

/** The infant's skin in a baby sling (a placeholder tone, calibratable). */
const INFANT_SKIN = '#5a3a26'

/**
 * The stations of a draped cape or cloak: from a collar round the neck down
 * the slope of the shoulders (the trunk's own profile, eased off it), over the
 * shoulder point and falling with a slight flare. A flat shelf from the neck
 * straight out to shoulder width and walls straight down read as a cardboard
 * box. `closed`: tied over the breast, so the stations run dense below the
 * shoulders and each clears the trunk (bust included) by an ease.
 */
function capeRows(p: BodyProportions, bottom: number, closed: boolean): SweepStation[] {
  const H = p.stature
  const rows: SweepStation[] = [
    st(p.neckY + 0.012 * H, p.neckR * 1.5, p.neckR * 1.45),
    st(p.shoulderY + 0.006 * H, p.shoulderX * 0.78, p.chestHalfD * 1.08),
    st(p.shoulderY - 0.03 * H, p.shoulderX + p.armR * 1.45, p.chestHalfD * 1.22),
    st(p.chestY - 0.02 * H, p.shoulderX + p.armR * 1.75, p.chestHalfD * 1.3),
  ]
  const step = (closed ? 0.025 : 0.08) * H
  for (let y = p.chestY - (closed ? 0.045 : 0.1) * H; y > bottom + 0.02 * H; y -= step) {
    const t = (p.chestY - y) / (p.chestY - bottom)
    rows.push(st(y, p.shoulderX + p.armR * (1.8 + 0.5 * t), p.chestHalfD * (1.32 + 0.15 * t)))
  }
  rows.push(st(bottom, p.shoulderX + p.armR * 2.4, p.chestHalfD * 1.5))
  if (closed) {
    const ease = 0.014 * H
    for (const r of rows) {
      if (r.p[1] > p.shoulderY - 0.03 * H + 1e-6) continue
      const [x, z] = trunkAt(p, r.p[1])
      r.rx = Math.max(r.rx, x + ease)
      r.ry = Math.max(r.ry, z + ease)
    }
  }
  return rows
}

const LOWER: readonly BoneName[] = ['hips', 'spine', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R']
const UPPER: readonly BoneName[] = ['hips', 'spine', 'chest', 'neck', 'upperArm.L', 'upperArm.R', 'thigh.L', 'thigh.R']
/** A garment from the chest past the knee: its lower part follows the shins,
 *  so a kneeling figure's robe folds back with the legs, not into the ground. */
const LONG: readonly BoneName[] = [...UPPER, 'shin.L', 'shin.R']

/** Shape one layer, or null for a layer drawn on the skin (body paint). */
export function buildLayerGeometry(l: DressLayer, p: BodyProportions, radial = 16): THREE.BufferGeometry | null {
  const H = p.stature
  const segs = boneSegments(p)
  // The upper arms move only the cloth at the shoulder: below it a raised
  // arm would drag the garment's waist up with it.
  const armFree = (bones: readonly BoneName[]) => bones.filter((b) => b !== 'upperArm.L' && b !== 'upperArm.R')
  const near = (bones: readonly BoneName[]) => (v: THREE.Vector3) =>
    vertexWeights(v, segs, v.y < p.shoulderY - 0.06 * H ? armFree(bones) : bones)
  const rigid = (bone: BoneName) => () => [[boneIndex(bone), 1]] as Array<[number, number]>
  const hc = p.chinY + p.headHalfH
  const girdleY = p.hipY + 0.06 * H
  const chestTop = p.chestY + 0.035 * H
  const parts: Array<{ geo: THREE.BufferGeometry; weigh: (v: THREE.Vector3) => Array<[number, number]>; colour?: string }> = []
  let bottom = 0

  const girdle = (y: number, thick = 0.008 * H) => {
    const [rx, rz] = trunkAt(p, y)
    const g = new THREE.TorusGeometry(1, thick, 5, radial).rotateX(Math.PI / 2).scale(rx + 0.006 * H, 1, rz + 0.006 * H)
    g.translate(0, y, 0)
    parts.push({ geo: g, weigh: near(['hips', 'spine']) })
  }
  const sector = (geo: THREE.BufferGeometry, keep: (c: THREE.Vector3) => boolean) => cutTriangles(geo, (c) => !keep(c), { quads: true })

  switch (l.form) {
    case 'loinFlap':
    case 'apron':
    case 'girdleTails': {
      const long = l.form === 'apron' ? p.kneeY + 0.02 * H : p.hipY - (l.form === 'girdleTails' ? 0.14 : 0.1) * H
      const half = (l.form === 'apron' ? 0.075 : 0.05) * H
      girdle(girdleY)
      const front = sector(wrapTube(p, girdleY, long, 0.008 * H, 0.03, radial), (c) => c.z > 0 && Math.abs(c.x) < half)
      parts.push({ geo: front, weigh: near(LOWER) })
      const backLong = l.form === 'girdleTails' ? p.kneeY + 0.05 * H : long
      const back = sector(wrapTube(p, girdleY, backLong, 0.008 * H, 0.03, radial), (c) => c.z < 0 && Math.abs(c.x) < half * 1.4)
      parts.push({ geo: back, weigh: near(LOWER) })
      bottom = long
      break
    }
    case 'skirtShort':
    case 'skirtKnee':
    case 'wrapLong': {
      const top = l.wear === 'chest' ? chestTop : girdleY
      bottom =
        l.form === 'skirtShort' ? (p.hipY + p.kneeY) / 2 : l.form === 'skirtKnee' ? p.kneeY - 0.015 * H : p.kneeY - 0.6 * (p.kneeY - p.ankleY)
      parts.push({ geo: wrapTube(p, top, bottom, 0.01 * H, l.form === 'wrapLong' ? 0.035 : 0.025, radial, 12), weigh: near(top > p.waistY ? LONG : LOWER) })
      break
    }
    case 'trousers': {
      bottom = p.kneeY - 0.5 * (p.kneeY - p.ankleY)
      parts.push({ geo: wrapTube(p, girdleY, p.hipY - 0.07 * H, 0.012 * H, 0, radial, 5), weigh: near(LOWER) })
      for (const s of ['L', 'R'] as const) {
        const x = (s === 'L' ? 1 : -1) * p.hipX
        const leg = sweepTube(
          [
            { p: [x, p.hipY, 0], rx: p.thighR * 1.35, ry: p.thighR * 1.35 },
            { p: [x, p.kneeY, 0], rx: p.calfR * 1.6, ry: p.calfR * 1.6 },
            { p: [x, bottom, 0], rx: p.calfR * 1.5, ry: p.calfR * 1.5 },
          ],
          { radial: Math.max(8, radial - 4), rings: 8 },
        )
        parts.push({ geo: leg, weigh: near(['hips', `thigh.${s}`, `shin.${s}`]) })
      }
      break
    }
    case 'breastCloth': {
      bottom = p.waistY - 0.01 * H
      parts.push({ geo: wrapTube(p, chestTop, bottom, 0.01 * H, 0.01, radial, 6), weigh: near(['spine', 'chest']) })
      break
    }
    case 'shirt':
    case 'robe':
    case 'toga': {
      // The body of the garment from the shoulders down; short sleeves on the
      // upper arms so a hanging arm reads OUT of the cloth, not inside it.
      bottom = l.form === 'shirt' ? p.kneeY + 0.02 * H : p.ankleY + 0.03 * H
      const top = p.neckY + 0.005 * H
      const body = wrapTube(p, top, bottom, 0.012 * H, l.form === 'shirt' ? 0.03 : 0.05, radial, 14)
      if (l.form === 'toga') {
        // Thrown over ONE shoulder: the other shoulder and its side stay bare
        // above the armpit (the figure's left is +x).
        const bare = l.wear === 'rightShoulder' ? 1 : -1
        sector(body, (c) => !(c.x * bare > -0.02 * H && c.y > chestTop - c.x * bare * 0.6))
      }
      parts.push({ geo: body, weigh: near(l.form === 'shirt' ? UPPER : LONG) })
      if (l.form !== 'toga') {
        for (const s of ['L', 'R'] as const) {
          const x = (s === 'L' ? 1 : -1) * p.shoulderX
          const sleeve = sweepTube(
            [
              { p: [x, p.shoulderY - p.armR * 0.2, 0], rx: p.armR * 1.5, ry: p.armR * 1.5 },
              { p: [x, p.shoulderY - p.upperArm * 0.75, 0], rx: p.armR * 1.9, ry: p.armR * 1.9 },
            ],
            { radial: Math.max(8, radial - 4), rings: 4 },
          )
          // a sleeve follows its arm all the way down
          parts.push({ geo: sleeve, weigh: (v) => vertexWeights(v, segs, ['chest', `upperArm.${s}`]) })
        }
      }
      break
    }
    case 'cloak':
    case 'cape': {
      bottom = l.form === 'cloak' ? p.kneeY + 0.03 * H : p.waistY - 0.02 * H
      // Worn 'chest': tied closed over the breast (docs/peoples-1890.md §8.6);
      // a knee-long one opens only below the waist.
      const closed = l.wear === 'chest'
      const rows = capeRows(p, bottom, closed)
      const geo = sweepTube(rows, { radial, rings: rows.length * 3 })
      const cols = Math.max(1, Math.round(radial / 16))
      if (closed) {
        if (l.form === 'cloak') openFront(geo, cols, p.waistY)
      } else {
        // Over both shoulders it hangs OPEN in front below the shoulders, so the
        // body and the hip dress show through as on a worn skin. The opening is
        // whole columns of the tube either side of the front (+z, a vertex line
        // at a quarter turn): a slanted cut through the triangles left a sawtooth.
        // A knee-long cloak hangs open too, whichever shoulder it is knotted on
        // (closed, a one-shoulder kaross read as a barrel).
        if (l.wear === 'bothShoulders' || l.form === 'cloak') openFront(geo, cols, p.shoulderY - 0.03 * H)
        // Knotted over one shoulder: the other shoulder is bare above the chest.
        if (l.wear === 'rightShoulder') sector(geo, (c) => !(c.x > 0.01 * H && c.y > p.chestY))
        if (l.wear === 'leftShoulder') sector(geo, (c) => !(c.x < -0.01 * H && c.y > p.chestY))
      }
      parts.push({ geo, weigh: near(UPPER) })
      break
    }
    case 'babySling': {
      // An infant carried on the back in the mantle (Passarge, §7.3 San): a
      // hide bundle outside the mantle's back, the small head above it.
      const r = 0.07 * H
      const y = p.chestY - 0.06 * H
      const z = -(Math.max(p.chestHalfD * 1.5, trunkAt(p, y)[1] + 0.03 * H) + r * 0.6)
      const bundle = new THREE.SphereGeometry(r, radial, 8).scale(1, 1.2, 0.7)
      bundle.translate(0, y, z)
      parts.push({ geo: bundle, weigh: rigid('chest') })
      const head = new THREE.SphereGeometry(0.036 * H, radial, 8)
      head.translate(0, y + r * 1.2 + 0.02 * H, z + 0.01 * H)
      parts.push({ geo: head, weigh: rigid('chest'), colour: INFANT_SKIN })
      bottom = y - r * 1.2
      break
    }
    case 'hood': {
      bottom = p.chestY - 0.03 * H
      const geo = sweepTube(
        [
          st(bottom, p.shoulderX + p.armR * 1.6, p.chestHalfD * 1.3),
          st(p.shoulderY + p.armR, p.shoulderX + p.armR * 1.4, p.chestHalfD * 1.15),
          st(p.neckY + 0.01 * H, p.neckR * 2.3, p.neckR * 2.2),
          st(hc, p.headHalfW * 1.3, p.headHalfW * 1.45, -0.004 * H),
          st(p.crownY + 0.015 * H, p.headHalfW * 0.25, p.headHalfW * 0.3, -0.008 * H),
        ],
        { radial, rings: 16, capEnd: true },
      )
      // The face stays open.
      sector(geo, (c) => !(c.z > 0 && c.y > p.chinY - 0.012 * H && c.y < hc + p.headHalfH * 0.55 && Math.abs(c.x) < p.headHalfW * 0.95))
      parts.push({ geo, weigh: (v) => (v.y > p.neckY + 0.02 * H ? [[boneIndex('head'), 1]] : near(['chest', 'neck', 'upperArm.L', 'upperArm.R'])(v)) })
      break
    }
    case 'turban':
    case 'cap':
    case 'headband': {
      const from = l.form === 'headband' ? hc + p.headHalfH * 0.15 : hc + p.headHalfH * (l.form === 'turban' ? 0.1 : 0.3)
      const to = l.form === 'headband' ? from + 0.025 * H : p.crownY + (l.form === 'turban' ? 0.045 : 0.008) * H
      const w = l.form === 'turban' ? 1.28 : 1.07
      const geo = sweepTube(
        l.form === 'headband'
          ? [st(from, p.headHalfW * w, p.headHalfW * w * 1.14), st(to, p.headHalfW * w * 0.97, p.headHalfW * w * 1.1)]
          : [
              st(from, p.headHalfW * w, p.headHalfW * w * 1.14, -0.004 * H),
              st((from + to) / 2 + 0.01 * H, p.headHalfW * w * 1.02, p.headHalfW * w * 1.12, -0.006 * H),
              st(to, p.headHalfW * 0.35, p.headHalfW * 0.4, -0.008 * H),
            ],
        { radial, rings: 8, capEnd: l.form !== 'headband' },
      )
      parts.push({ geo, weigh: rigid('head') })
      bottom = from
      break
    }
    case 'veil': {
      bottom = p.neckY
      const geo = sweepTube(
        [st(p.neckY, p.neckR * 1.6, p.neckR * 1.6), st(p.chinY, p.headHalfW * 1.05, p.headHalfW * 1.2, 0.004 * H), st(p.chinY + p.headHalfH * 0.95, p.headHalfW * 1.1, p.headHalfW * 1.22)],
        { radial, rings: 8 },
      )
      parts.push({ geo, weigh: (v) => (v.y > p.chinY ? [[boneIndex('head'), 1]] : vertexWeights(v, segs, ['neck', 'head'])) })
      break
    }
    case 'headRing': {
      const g = new THREE.TorusGeometry(p.headHalfW * 0.62, 0.011 * H, 6, radial).rotateX(Math.PI / 2)
      g.translate(0, p.crownY - 0.012 * H, -0.01 * H)
      parts.push({ geo: g, weigh: rigid('head') })
      bottom = p.crownY - 0.02 * H
      break
    }
    case 'topknot': {
      // a domed knot of dressed hair, not a cylinder (that read as a fez)
      const g = new THREE.SphereGeometry(p.headHalfW * 0.58, radial, 8).scale(1, 0.82, 0.95)
      g.translate(0, p.crownY + 0.008 * H, -0.014 * H)
      parts.push({ geo: g, weigh: rigid('head') })
      bottom = p.crownY
      break
    }
    case 'hairBag': {
      const g = new THREE.SphereGeometry(p.headHalfW * 0.62, radial, 8).scale(1, 0.8, 0.9)
      g.translate(0, hc + p.headHalfH * 0.05, -p.headHalfW * 1.05)
      parts.push({ geo: g, weigh: rigid('head') })
      bottom = hc
      break
    }
    case 'neckBeads': {
      if (l.wear === 'chest') {
        // Layered strings built into a wide, deep collar that lies over the
        // breast (Grenfell 1890 via §7.4 Mongo; the rule of §8.6).
        bottom = p.chestY - 0.09 * H
        const rows = capeRows(p, bottom, true)
        parts.push({ geo: sweepTube(rows, { radial, rings: rows.length * 3 }), weigh: near(UPPER) })
        break
      }
      const g = new THREE.TorusGeometry(p.neckR * 1.9, 0.012 * H, 6, radial).rotateX(Math.PI / 2 - 0.25)
      g.translate(0, p.neckY - 0.005 * H, 0.01 * H)
      parts.push({ geo: g, weigh: near(['chest', 'neck']) })
      bottom = p.neckY
      break
    }
    case 'waistBeads': {
      girdle(p.hipY + 0.05 * H, 0.011 * H)
      bottom = p.hipY
      break
    }
    case 'limbRings': {
      for (const s of ['L', 'R'] as const) {
        const ax = (s === 'L' ? 1 : -1) * p.shoulderX
        const lx = (s === 'L' ? 1 : -1) * p.hipX
        for (let k = 0; k < 4; k++) {
          const wrist = new THREE.TorusGeometry(p.armR * 0.9, 0.004 * H, 4, 10).rotateX(Math.PI / 2)
          wrist.translate(ax, p.shoulderY - p.upperArm - p.forearm * (0.55 + k * 0.1), 0)
          parts.push({ geo: wrist, weigh: rigid(`forearm.${s}`) })
          const ankle = new THREE.TorusGeometry(p.calfR * 0.85, 0.004 * H, 4, 10).rotateX(Math.PI / 2)
          ankle.translate(lx, p.ankleY + 0.02 * H + k * 0.012 * H, 0)
          parts.push({ geo: ankle, weigh: rigid(`shin.${s}`) })
        }
      }
      bottom = p.ankleY
      break
    }
    case 'bodyPaint':
      return null
  }

  const second = l.colour2 ?? mixHex(l.colour, '#000000', 0.35)
  const surface = surfaceOf(l, p, bottom)
  const built = parts.map(({ geo, weigh, colour }) =>
    tidy(skinGeometry(colour ? paint(geo, colour) : paint(geo, l.colour, surface, second), weigh)),
  )
  const geo = built.length === 1 ? built[0] : merge(built)
  geo.computeBoundingSphere()
  return geo
}

// ---- the material -------------------------------------------------------------

/** Antialiased 0..1 step: 1 below `edge`, 0 above, blurred over one pixel. */
const aaBelow = (value: THREE.Node<'float'>, edge: THREE.Node<'float'>) => {
  const w = max(fwidth(value), float(1e-4))
  return float(1).sub(smoothstep(edge.sub(w), edge.add(w), value))
}

/** How far toward the second colour this fragment is (0..1), per pattern. */
function patternMix() {
  const s = attribute<'vec4'>(SURFACE_ATTRIBUTE, 'vec4')
  const kind = s.x.round()
  const p = positionGeometry
  const t = float(0).toVar()
  const around = atan(p.x, p.z).div(Math.PI * 2).add(0.5)
  If(kind.equal(PATTERN_KIND.bands), () => {
    t.assign(aaBelow(abs(fract(p.y.mul(s.y)).sub(0.5)).mul(2), s.z))
  })
    .ElseIf(kind.equal(PATTERN_KIND.stripes), () => {
      t.assign(aaBelow(abs(fract(around.mul(s.y)).sub(0.5)).mul(2), s.z))
    })
    .ElseIf(kind.equal(PATTERN_KIND.checks), () => {
      const a = aaBelow(abs(fract(p.y.mul(s.y)).sub(0.5)).mul(2), float(0.5))
      const b = aaBelow(abs(fract(around.mul(s.y).mul(2.2)).sub(0.5)).mul(2), float(0.5))
      t.assign(abs(a.sub(b)))
    })
    .ElseIf(kind.equal(PATTERN_KIND.mottle), () => {
      t.assign(clamp(mx_noise_float(p.mul(s.y)).mul(0.5).add(0.5), 0, 1).mul(s.z))
    })
    .ElseIf(kind.equal(PATTERN_KIND.beadwork), () => {
      // Rows of beads in alternating colour: a dot grid on (height, round).
      const row = fract(p.y.mul(s.y))
      const col = fract(around.mul(s.y).mul(0.35).add(p.y.mul(s.y).floor().mul(0.5)))
      const dot = aaBelow(abs(col.sub(0.5)).mul(2), float(0.5))
      const band = aaBelow(abs(row.sub(0.5)).mul(2), float(0.75))
      t.assign(dot.mul(band))
    })
    .ElseIf(kind.equal(PATTERN_KIND.border), () => {
      t.assign(aaBelow(p.y, s.y.add(s.z)))
    })
  return t
}

/**
 * The colour node: the vertex colour mixed DIRECTLY toward the layer's second
 * colour by the pattern — the vertex colour itself on a plain surface, so the
 * body renders exactly its tone. The material does not multiply the vertex
 * colour in a second time (`vertexColors: false`): a factor on it could not
 * reach a light second colour from a near-black cloth (white bands on black).
 */
function figureColorNode() {
  return Fn(() => {
    const second = attribute<'vec3'>(SECOND_COLOUR_ATTRIBUTE, 'vec3')
    return mix(vertexColor().rgb, second, patternMix())
  })()
}

let figureMat: THREE.MeshStandardNodeMaterial | null = null

/**
 * The ONE material every skinned villager is drawn with — body and dress
 * merged into a single mesh per figure, so a villager is one draw (and one per
 * shadow pass), not one per layer. Double-sided: a hem or a cloak's edge is
 * seen from below and inside; the closed body never shows its back faces.
 */
export function figureMaterial(): THREE.MeshStandardNodeMaterial {
  if (!figureMat) {
    figureMat = new THREE.MeshStandardNodeMaterial({ vertexColors: false, side: THREE.DoubleSide })
    figureMat.colorNode = figureColorNode()
    figureMat.roughnessNode = attribute<'vec4'>(SURFACE_ATTRIBUTE, 'vec4').w
    figureMat.name = 'figure'
  }
  return figureMat
}
