// Low-poly, vertex-colored geometry for the built cultural landmarks of
// design.md §4.4 (Meroë, Giza incl. the Sphinx, Great Zimbabwe, Lalibela,
// Kilwa, Aksum, Gondar, Bandiagara) plus the natural-site and skyline builders
// (Table Mountain). Same pattern as flora.ts: each builder merges its parts
// into one BufferGeometry with a base color and slight per-vertex jitter for a
// hand-made look; the origin sits at the ground and the footprint stays small
// enough that the silhouette reads from the travel camera (Meroë/Giza are
// deliberately larger, see their pins in landmarks.test.ts).

import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../world/noise'
import { buildPapyrus } from './flora'

/** Paint a geometry with a base color plus deterministic per-vertex jitter. */
function tint(geo: THREE.BufferGeometry, hex: string, jitter = 0.08, seed = 1): THREE.BufferGeometry {
  const base = new THREE.Color(hex)
  const rand = mulberry32(seed)
  const count = geo.attributes.position.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const f = 1 + (rand() - 0.5) * 2 * jitter
    colors[i * 3] = Math.min(1, base.r * f)
    colors[i * 3 + 1] = Math.min(1, base.g * f)
    colors[i * 3 + 2] = Math.min(1, base.b * f)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Some landmark builds mix flora parts (papyrus, with the point-144 foliage
  // attribute) into plain parts — mergeGeometries demands the attribute on all
  // or none, so fill the plain ones with 0 (= never collapses; the landmark
  // material carries no positionNode anyway).
  for (const part of parts) {
    if (!part.attributes.foliage) {
      const count = part.attributes.position.count
      part.setAttribute('foliage', new THREE.BufferAttribute(new Float32Array(count), 1))
    }
  }
  const merged = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return merged
}

/** A single steep square pyramid (four-sided cone), base on the ground. */
function pyramid(x: number, z: number, base: number, height: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(base, height, 4)
  g.rotateY(Math.PI / 4) // faces flat toward the camera axes
  g.translate(x, height / 2, z)
  return tint(g, '#c9a76a', 0.09, seed)
}

/**
 * A Nubian pyramid whose top was taken off by the treasure hunters: the same
 * steep cone cut at `standing` of its height and left with a ragged crown of
 * loosened masonry, plus the rubble the demolition spilled at its foot. The
 * frustum keeps the pyramid's own slope, so the flanks still read as a steep
 * Nubian tomb rather than as a tower.
 */
function brokenPyramid(
  x: number,
  z: number,
  base: number,
  height: number,
  standing: number,
  seed: number,
): THREE.BufferGeometry[] {
  const rand = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  const stump = height * standing
  const topR = base * (1 - standing) // the cone's own radius at the break
  const frustum = new THREE.CylinderGeometry(topR, base, stump, 4)
  frustum.rotateY(Math.PI / 4)
  frustum.translate(x, stump / 2, z)
  parts.push(tint(frustum, '#c9a76a', 0.09, seed))
  // One corner of the courses above the break is still standing: the lopsided
  // silhouette is what makes the top read as torn open rather than sawn flat.
  const wa = rand() * Math.PI * 2
  const remnant = new THREE.BoxGeometry(topR * 0.95, topR * 1.2, topR * 0.6)
  remnant.rotateY(wa)
  remnant.translate(x + Math.cos(wa) * topR * 0.34, stump + topR * 0.35, z + Math.sin(wa) * topR * 0.34)
  parts.push(tint(remnant, '#c4a165', 0.1, seed + 30))
  // Loosened blocks left along the break, half-sunk into it, at uneven
  // heights — the ragged rim.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand() * 0.8
    const rr = topR * (0.35 + rand() * 0.6)
    const w = topR * (0.32 + rand() * 0.28)
    const bh = topR * (0.3 + rand() * 0.65)
    const block = new THREE.BoxGeometry(w, bh, w)
    block.rotateY(rand() * Math.PI)
    block.rotateZ((rand() - 0.5) * 0.4) // tipped, half-loose
    block.translate(x + Math.cos(a) * rr, stump - topR * 0.2 + bh / 2, z + Math.sin(a) * rr)
    parts.push(tint(block, '#bf9a60', 0.13, seed + 40 + i))
  }
  // Debris thrown down the flanks and heaped at the base.
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2
    const rr = base * (0.85 + rand() * 0.45)
    const s = 0.13 + rand() * 0.2
    const heap = new THREE.CylinderGeometry(s * 0.4, s, s * 0.85, 5)
    heap.translate(x + Math.cos(a) * rr, s * 0.4, z + Math.sin(a) * rr)
    parts.push(tint(heap, '#b8935c', 0.12, seed + 60 + i))
  }
  return parts
}

/**
 * The Meroë field as a ~1890 expedition found it. `standing` is the fraction
 * of the original height still up: 1 means untouched, anything less means the
 * top was taken off. In 1834 Giuseppe Ferlini dismantled Kandake
 * Amanishakheto's pyramid from the top down for its treasure and set off a
 * wave of imitation — Lepsius recorded in 1844 that the discovery "has brought
 * many a pyramid to ruin", and ~40 Nubian pyramids lost their tops. The
 * pointed apexes a modern visitor photographs are 20th-century reconstruction.
 * So MOST of the field is broken-topped and two are left whole for contrast,
 * and none is cut so low that the steep Nubian silhouette stops reading.
 */
export const MEROE_PYRAMIDS: ReadonlyArray<{
  x: number
  z: number
  base: number
  height: number
  standing: number
}> = (() => {
  const rand = mulberry32(4201)
  const spots: Array<[number, number]> = [
    [0, 0],
    [2.85, 1.05],
    [-2.55, 1.5],
    [1.2, -2.7],
    [-1.5, -2.4],
    [4.5, -1.2],
  ]
  // Four of six broken, the deepest cut on the largest tomb (Ferlini worked
  // the richest one); the two left whole keep the field legible.
  const standing = [0.66, 1, 0.72, 0.63, 1, 0.55]
  return spots.map(([x, z], i) => {
    const base = 1.0 + rand() * 0.4
    const height = base * (2.6 + rand() * 0.6) // steep: height well over twice the base
    return {
      x: x + (rand() - 0.5) * 0.6,
      z: z + (rand() - 0.5) * 0.6,
      base,
      height,
      standing: standing[i],
    }
  })
})()

/** Meroë: a cluster of steep-sided Nubian pyramids (steeper than Giza),
 *  sandstone-toned, with slight size/position jitter — most of them
 *  broken-topped as the treasure hunters left them (see MEROE_PYRAMIDS).
 *  Rendered well above tree height (acacia ~2, baobab ~2.6) so the field is
 *  unmistakable at travel zoom (user request: much larger). */
export function buildMeroePyramids(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  MEROE_PYRAMIDS.forEach((p, i) => {
    if (p.standing >= 1) parts.push(pyramid(p.x, p.z, p.base, p.height, 4210 + i))
    else parts.push(...brokenPyramid(p.x, p.z, p.base, p.height, p.standing, 4210 + i))
  })
  return merge(parts)
}

/** How much of Khufu still stands: built to ~146.5 m, its apex and top
 *  courses are long quarried away, leaving ~138.5 m and a small flat summit
 *  platform where the point should be (docs/giza-1890.md §1.1). */
export const KHUFU_STANDING = 0.945

/** Giza: the three great pyramids in their real southwest-diagonal row —
 *  Khufu NE (largest), Khafre centre, Menkaure SW, flatter-sided than the
 *  steep Nubian tombs (Old-Kingdom ~52° slope, height ≈ 0.64 · base) — with
 *  the Sphinx crouching east of Khafre, readable at a glance (design.md
 *  §4.4), and each core carrying its ~1890 casing cue (docs/giza-1890.md
 *  §1.1-§1.2/§3): Khufu ends in a blunt flat platform, not a point; Khafre
 *  alone keeps a paler cap of original smooth Tura casing near its apex —
 *  the plateau's one distinguishing mark; Menkaure wears the darker band of
 *  its red Aswan granite lower casing. All three cues are cosmetic; the
 *  footprint is unchanged. */
export function buildGizaPyramids(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const core = '#c9a76a'
  // [x, z, base half-extent] per pyramid: the diagonal row, Khufu largest in
  // the NE. Kept compact: the field stands only ~4 world units west of Cairo
  // (the real 13 km), so the symbol must not swallow the port marker or the
  // Nile.
  {
    // Khufu: the cone cut at KHUFU_STANDING of its height and closed FLAT —
    // the small summit platform 19th-century visitors climbed to.
    const [x, z, b] = [1.3, -1.3, 1.6]
    const h = b * 0.64 * 2
    const stand = h * KHUFU_STANDING
    const frustum = new THREE.CylinderGeometry(b * (1 - KHUFU_STANDING), b, stand, 4)
    frustum.rotateY(Math.PI / 4)
    frustum.translate(x, stand / 2, z)
    parts.push(tint(frustum, core, 0.09, 8200))
  }
  {
    // Khafre: tawny stepped core, and near the apex the pale smooth cap of
    // surviving Tura-limestone casing — the only casing left on the plateau
    // and the cue that tells Khafre from Khufu at a glance.
    const [x, z, b] = [0, 0, 1.5]
    const h = b * 0.64 * 2
    const capStart = 0.8 // fraction of the height where the casing survives
    const coreH = h * capStart
    const coreG = new THREE.CylinderGeometry(b * (1 - capStart), b, coreH, 4)
    coreG.rotateY(Math.PI / 4)
    coreG.translate(x, coreH / 2, z)
    parts.push(tint(coreG, core, 0.09, 8201))
    const cap = new THREE.ConeGeometry(b * (1 - capStart) * 1.06, h - coreH, 4)
    cap.rotateY(Math.PI / 4)
    cap.translate(x, coreH + (h - coreH) / 2, z)
    // Low jitter: the casing reads smooth against the weathered core.
    parts.push(tint(cap, '#e8dcc2', 0.03, 8203))
  }
  {
    // Menkaure: the smallest, its point intact, but the lower courses cased
    // in red Aswan granite — a darker band ringing the base, a hair proud of
    // the core face so the two never z-fight.
    const [x, z, b] = [-1.2, 1.2, 0.8]
    const h = b * 0.64 * 2
    parts.push(pyramid(x, z, b, h, 8202))
    const skirtTop = 0.22 // fraction of the height the granite casing reaches
    const skirt = new THREE.CylinderGeometry(b * (1 - skirtTop) * 1.02, b * 1.02, h * skirtTop, 4, 1, true)
    skirt.rotateY(Math.PI / 4)
    skirt.translate(x, (h * skirtTop) / 2, z)
    parts.push(tint(skirt, '#96604b', 0.06, 8204))
  }
  // Sphinx east of Khafre, facing east like the real one.
  const sphinx = buildSphinx()
  sphinx.translate(2.1, 0, 0.3)
  parts.push(sphinx)
  return merge(parts)
}

/**
 * How deep the couchant body sits below the sand. In 1890 the Sphinx was NOT
 * the freestanding lion of the modern postcard: it lay buried to the neck and
 * shoulders for the whole 19th century. Caviglia cleared the chest in 1817 and
 * the sand took it back; Mariette cleared it again in 1853 with the same
 * result; only Baraize's 1925-36 excavation freed the body for good. A ~1890
 * expedition therefore sees a head and its nemes rising out of a drift, with
 * the shoulders barely breaking the surface — nothing of the paws, torso,
 * haunches or tail. The depth is chosen so the chest just grazes the sand while
 * head, nemes and crown stand wholly proud.
 */
export const SPHINX_BURIAL_DEPTH = 0.4

/** The Great Sphinx as a couchant lion under the nemes (design.md §4.4,
 *  user request: clearly more than a box stand-in): a lying torso with
 *  raised haunches and folded hind legs, both fore paws stretched forward,
 *  the tail around the right haunch, an upright chest and the head under
 *  the trapezoid nemes silhouette (widening down toward the shoulders,
 *  flat crown). Faces +x (east); origin on the ground at the body centre.
 *  Proportions are readability-exaggerated for the travel camera; the same
 *  geometry scales up in Cairo's western skyline.
 *
 *  The whole lion is BUILT and then sunk by SPHINX_BURIAL_DEPTH, rather than
 *  the buried parts being left out: the body below the sand costs nothing the
 *  player can see, and keeping it means the couchant proportions stay the
 *  honest thing this builder describes. A low sand drift closes the seam so
 *  the sand meets the neck as drift rather than as a clean cut. */
export function buildSphinx(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const sand = '#c29c66'
  const put = (g: THREE.BufferGeometry, hex: string, seed: number) => parts.push(tint(g, hex, 0.07, seed))
  // Lying torso between haunches and shoulders.
  const torso = new THREE.BoxGeometry(0.78, 0.22, 0.34)
  torso.translate(-0.05, 0.17, 0)
  put(torso, sand, 8210)
  // Raised haunches over the folded hind legs — wider than the torso (hips).
  const haunch = new THREE.BoxGeometry(0.36, 0.30, 0.40)
  haunch.translate(-0.36, 0.15, 0)
  put(haunch, sand, 8211)
  for (const side of [-1, 1]) {
    // Folded hind leg along each flank.
    const hind = new THREE.BoxGeometry(0.42, 0.1, 0.09)
    hind.translate(-0.3, 0.05, side * 0.21)
    put(hind, sand, side < 0 ? 8212 : 8213)
    // Fore paw stretched forward from below the chest.
    const paw = new THREE.BoxGeometry(0.6, 0.1, 0.1)
    paw.translate(0.52, 0.05, side * 0.12)
    put(paw, sand, side < 0 ? 8214 : 8215)
  }
  // Tail curling around the right haunch.
  const tail = new THREE.BoxGeometry(0.06, 0.06, 0.26)
  tail.translate(-0.52, 0.06, 0.26)
  put(tail, sand, 8216)
  // Upright chest between the shoulders.
  const chest = new THREE.BoxGeometry(0.26, 0.3, 0.3)
  chest.translate(0.26, 0.33, 0)
  put(chest, sand, 8217)
  // Nemes: the headdress silhouette, a truncated four-sided pyramid
  // widening down toward the shoulders.
  const nemes = new THREE.CylinderGeometry(0.1, 0.19, 0.22, 4, 1)
  nemes.rotateY(Math.PI / 4)
  nemes.translate(0.24, 0.55, 0)
  put(nemes, sand, 8218)
  // Face block proud of the nemes front.
  const head = new THREE.BoxGeometry(0.14, 0.16, 0.15)
  head.translate(0.3, 0.55, 0)
  put(head, '#b8905c', 8219)
  // Flat nemes crown.
  const crown = new THREE.BoxGeometry(0.14, 0.05, 0.14)
  crown.translate(0.24, 0.68, 0)
  put(crown, sand, 8220)
  // Sink the lion: what remains above the sand is the head under its nemes,
  // with the shoulders just breaking the surface (see SPHINX_BURIAL_DEPTH).
  const buried = merge(parts)
  buried.translate(0, -SPHINX_BURIAL_DEPTH, 0)
  // The drift the body lies in — a low tapered dune, banked ALONG the lion
  // (squashed across it) so the sand line reads as blown sand rather than as
  // the lion cut off flat, while the silhouette stays longer than it is wide.
  // Kept low enough that the shoulders still break its surface.
  const drift = new THREE.CylinderGeometry(0.38, 0.62, 0.11, 12, 1)
  drift.scale(1, 1, 0.45)
  drift.translate(0.05, 0.005, 0)
  return merge([buried, tint(drift, '#c9a670', 0.05, 8221)])
}

/** Great Zimbabwe: a curved mortarless dry-stone wall (segmented boxes) and a
 *  solid conical tower, weathered granite-grey. */
export function buildStoneCity(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const R = 2.0
  const seg = 12
  for (let i = 0; i < seg; i++) {
    // A ~200° arc of wall (leaves an opening), thick and tapering upward.
    const a = -Math.PI * 0.15 + (i / (seg - 1)) * Math.PI * 1.15
    const w = new THREE.BoxGeometry(0.55, 1.0, 0.3)
    w.rotateY(-a)
    w.translate(Math.cos(a) * R, 0.5, Math.sin(a) * R)
    parts.push(tint(w, '#8c847a', 0.1, 4300 + i))
  }
  // The conical tower inside the enclosure.
  const tower = new THREE.CylinderGeometry(0.28, 0.42, 1.5, 10)
  tower.translate(0.3, 0.75, 0.2)
  parts.push(tint(tower, '#948b80', 0.08, 4330))
  return merge(parts)
}

/** Lalibela: a cross-plan church hewn downward out of the living rock —
 *  a cruciform prism sunk into a flat rock slab, reddish tuff. */
export function buildRockChurches(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  // The rock slab the church is cut from.
  const slab = new THREE.BoxGeometry(3.0, 0.5, 3.0)
  slab.translate(0, 0.25, 0)
  parts.push(tint(slab, '#9a5238', 0.06, 4400))
  // A recessed trench (darker) framing the cross so it reads as cut-in.
  const trench = new THREE.BoxGeometry(1.9, 0.42, 0.62)
  trench.translate(0, 0.3, 0)
  parts.push(tint(trench, '#5f3323', 0.06, 4401))
  const trench2 = new THREE.BoxGeometry(0.62, 0.42, 1.9)
  trench2.translate(0, 0.3, 0)
  parts.push(tint(trench2, '#5f3323', 0.06, 4402))
  // The cross-shaped church body, flush with the slab top.
  const arm1 = new THREE.BoxGeometry(1.4, 0.55, 0.42)
  arm1.translate(0, 0.42, 0)
  parts.push(tint(arm1, '#a86048', 0.07, 4403))
  const arm2 = new THREE.BoxGeometry(0.42, 0.55, 1.4)
  arm2.translate(0, 0.42, 0)
  parts.push(tint(arm2, '#a86048', 0.07, 4404))
  return merge(parts)
}

/** Kilwa: broken arches and standing columns of differing heights on a low
 *  platform, pale coral-stone. */
export function buildCoastalRuins(): THREE.BufferGeometry {
  const rand = mulberry32(4500)
  const parts: THREE.BufferGeometry[] = []
  const plat = new THREE.BoxGeometry(3.2, 0.3, 2.0)
  plat.translate(0, 0.15, 0)
  parts.push(tint(plat, '#c9bf9e', 0.05, 4500))
  // Standing columns of varied height.
  const cols: Array<[number, number]> = [
    [-1.1, -0.6],
    [-0.4, 0.5],
    [0.5, -0.5],
    [1.2, 0.4],
  ]
  cols.forEach(([x, z], i) => {
    const h = 0.7 + rand() * 0.8
    const c = new THREE.CylinderGeometry(0.12, 0.14, h, 7)
    c.translate(x, 0.3 + h / 2, z)
    parts.push(tint(c, '#d3c9a8', 0.07, 4510 + i))
  })
  // A broken arch: two pillars bridged by a lintel, one side fallen away.
  for (const sx of [-0.5, 0.5]) {
    const p = new THREE.BoxGeometry(0.22, 1.1, 0.22)
    p.translate(sx, 0.3 + 0.55, -1.0)
    parts.push(tint(p, '#cabf9e', 0.06, 4520 + (sx > 0 ? 1 : 0)))
  }
  const lintel = new THREE.BoxGeometry(1.0, 0.24, 0.24)
  lintel.rotateZ(0.12) // sagging, broken
  lintel.translate(-0.1, 0.3 + 1.15, -1.0)
  parts.push(tint(lintel, '#cabf9e', 0.06, 4522))
  return merge(parts)
}

/**
 * The Aksum field as a ~1890 traveller found it — the opposite of the modern
 * postcard. Of the three great royal stelae only King Ezana's (~21 m) still
 * stood: it is "the only one of the three major royal obelisks that was never
 * broken". The 33 m Great Stele collapsed in antiquity (coins beneath it date
 * the fall to the late 4th century) and lay broken across the field — the
 * biggest object there — and the 24 m obelisk the Italians took to Rome in
 * 1937 (re-erected in Aksum only in 2008) lay fallen beside it. Around them a
 * scatter of smaller, rough, undecorated stelae.
 */
export const AKSUM_EZANA_HEIGHT = 2.6
/** The small rough stelae still upright: low and plain, none rivalling Ezana's. */
export const AKSUM_MINOR_HEIGHTS: readonly number[] = [0.8, 0.55, 0.65]
/** End-to-end span of the fallen Great Stele's broken pieces — the biggest
 *  object in the field, longer than the lone standing giant is tall. */
export const AKSUM_FALLEN_LENGTH = 3.4

/** Aksum: ONE lone giant standing — King Ezana's stele, tall, slender, still
 *  crowned — among FALLEN giants: the broken Great Stele lying clear across
 *  the field and a second fallen royal shaft, with a scatter of low rough
 *  stelae between and the broken stump at the fall's foot. Weathered granite
 *  grey (see AKSUM_* above for the record). */
export function buildStelae(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  // King Ezana's stele: clearly the tallest thing in the field and more
  // slender than anything else standing.
  const eh = AKSUM_EZANA_HEIGHT
  const ezana = new THREE.CylinderGeometry(0.055, 0.11, eh, 6)
  ezana.translate(0, eh / 2, 0)
  parts.push(tint(ezana, '#8f8a80', 0.08, 4600))
  const cap = new THREE.SphereGeometry(0.08, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2)
  cap.translate(0, eh, 0)
  parts.push(tint(cap, '#8f8a80', 0.08, 4601))
  // The scatter of small rough stelae: squat five-sided shafts, uncrowned.
  const minorSpots: Array<[number, number]> = [
    [0.85, 0.5],
    [-0.75, 0.6],
    [0.35, 1.05],
  ]
  AKSUM_MINOR_HEIGHTS.forEach((mh, i) => {
    const [x, z] = minorSpots[i]
    const shaft = new THREE.CylinderGeometry(0.05, 0.13, mh, 5)
    shaft.translate(x, mh / 2, z)
    parts.push(tint(shaft, '#8a857c', 0.1, 4610 + i))
  })
  // The fallen Great Stele: two broken pieces lying almost in line, thicker
  // than the standing giant and spanning AKSUM_FALLEN_LENGTH end to end.
  const dir = 0.5 // lie of the fall, radians about y
  const dx = Math.cos(dir)
  const dz = -Math.sin(dir)
  const cx = 0.1
  const cz = -0.9
  const pieces: Array<[number, number]> = [
    // [piece length, axial centre offset from the fall's midpoint]
    [1.9, -(AKSUM_FALLEN_LENGTH / 2 - 1.9 / 2)],
    [1.4, AKSUM_FALLEN_LENGTH / 2 - 1.4 / 2],
  ]
  pieces.forEach(([len, off], i) => {
    const r = 0.2
    const piece = new THREE.CylinderGeometry(r * 0.85, r, len, 6)
    piece.rotateZ(Math.PI / 2)
    piece.rotateY(dir)
    piece.translate(cx + dx * off, r, cz + dz * off)
    parts.push(tint(piece, '#87827a', 0.08, 4620 + i))
  })
  // The second fallen giant — the shaft Italy later carried to Rome.
  const r2 = 0.15
  const second = new THREE.CylinderGeometry(r2 * 0.85, r2, 2.2, 6)
  second.rotateZ(Math.PI / 2)
  second.rotateY(-0.9)
  second.translate(-1.05, r2, -0.15)
  parts.push(tint(second, '#87827a', 0.08, 4623))
  // The broken stump the Great Stele left standing at its base.
  const stump = new THREE.CylinderGeometry(0.16, 0.18, 0.35, 6)
  stump.translate(-1.55, 0.17, -0.2)
  parts.push(tint(stump, '#87827a', 0.08, 4624))
  return merge(parts)
}

/**
 * What is left of the keep's parapet, slot by slot along each long wall: the
 * merlon height, or 0 where the merlon is gone. Mahdist forces stormed and
 * burned Gondar in JANUARY 1888 — two years before the expedition sets out —
 * torching most of its churches; Fasil Ghebbi itself "fell into ruins" as the
 * city declined, and the unbroken parapets and conical tower caps a visitor
 * photographs today are mid-20th-century Italian and Haile Selassie
 * restoration plus a 1999-2002 UNESCO campaign. So the parapet stands gapped
 * and uneven, never as a complete row.
 */
export const GONDAR_PARAPET: readonly number[] = [0.18, 0, 0.11, 0.16, 0, 0.15]

/** Tower heights: neither carries a roof. Gondarine tower caps were largely
 *  gone by the period, and the sack left the shells open to the sky — one
 *  tower stands lower than the other, its upper courses collapsed. */
export const GONDAR_TOWER_HEIGHTS: readonly number[] = [1.35, 1.0]

/** Gondar (Fasil Ghebbi) as a ~1890 expedition found it, two years after the
 *  Mahdist sack: a burnt-out keep — walls standing around a dark, roofless
 *  interior, one long wall collapsed to half height — a gapped parapet, two
 *  roofless tower shells with broken rims, and rubble at the foot of the
 *  breach. Grey stone, sooted where the fire ran. */
export function buildCastles(): THREE.BufferGeometry {
  const rand = mulberry32(4700)
  const parts: THREE.BufferGeometry[] = []
  const stone = '#8d857b' // fire-darkened, not the restored parapet grey
  const sooted = '#6d645b'
  const W = 1.5
  const D = 1.0
  const T = 0.16
  const H = 1.1
  // The burnt-out interior: the roof is gone, so from above the keep reads as
  // an open, blackened shell rather than a solid block.
  const floor = new THREE.BoxGeometry(W - T * 2, 0.12, D - T * 2)
  floor.translate(0, 0.06, 0)
  parts.push(tint(floor, '#463f39', 0.07, 4701))
  // Four walls at uneven heights; the south wall is breached to half.
  const walls: Array<[number, number, number, number, number, string]> = [
    [0, -(D / 2 - T / 2), W, T, H, stone],
    [0, D / 2 - T / 2, W, T, H * 0.46, sooted], // the breach
    [-(W / 2 - T / 2), 0, T, D - T * 2, H * 0.86, sooted],
    [W / 2 - T / 2, 0, T, D - T * 2, H, stone],
  ]
  walls.forEach(([cx, cz, w, d, h, hex], i) => {
    const wall = new THREE.BoxGeometry(w, h, d)
    wall.translate(cx, h / 2, cz)
    parts.push(tint(wall, hex, 0.09, 4702 + i))
  })
  // Gapped parapet on the two walls still standing high enough to carry one.
  GONDAR_PARAPET.forEach((mh, i) => {
    if (mh <= 0) return
    const merlon = new THREE.BoxGeometry(0.18, mh, T)
    merlon.translate(-0.6 + i * 0.24, H + mh / 2, -(D / 2 - T / 2))
    parts.push(tint(merlon, stone, 0.08, 4710 + i))
  })
  for (const [dz, mh] of [[-0.24, 0.15], [0.2, 0.1]] as const) {
    const merlon = new THREE.BoxGeometry(T, mh, 0.2)
    merlon.translate(W / 2 - T / 2, H + mh / 2, dz)
    parts.push(tint(merlon, stone, 0.08, 4716 + (dz > 0 ? 1 : 0)))
  }
  // Two roofless tower shells, their rims broken.
  const towers: Array<[number, number]> = [
    [0.95, 0.55],
    [-0.95, -0.55],
  ]
  towers.forEach(([tx, tz], si) => {
    const h = GONDAR_TOWER_HEIGHTS[si]
    const tower = new THREE.CylinderGeometry(0.28, 0.32, h, 9)
    tower.translate(tx, h / 2, tz)
    parts.push(tint(tower, si ? sooted : '#968e84', 0.08, 4720 + si))
    // Open, blackened top: the cap burnt off, the shell hollow.
    const hollow = new THREE.CylinderGeometry(0.21, 0.21, 0.06, 9)
    hollow.translate(tx, h - 0.03, tz)
    parts.push(tint(hollow, '#443d38', 0.06, 4724 + si))
    // Broken rim: uneven wall stubs where the parapet stood.
    for (let i = 0; i < 5; i++) {
      if (rand() < 0.3) continue // a gap in the rim
      const a = (i / 5) * Math.PI * 2 + rand() * 0.5
      const sh = 0.05 + rand() * 0.12
      const stub = new THREE.BoxGeometry(0.11, sh, 0.07)
      stub.rotateY(-a)
      stub.translate(tx + Math.cos(a) * 0.235, h + sh / 2 - 0.02, tz + Math.sin(a) * 0.235)
      parts.push(tint(stub, sooted, 0.1, 4726 + si * 8 + i))
    }
  })
  // Rubble spilled from the breach and burnt beams thrown down beside it.
  for (let i = 0; i < 8; i++) {
    const s = 0.08 + rand() * 0.11
    const block = new THREE.BoxGeometry(s * (1 + rand()), s * 0.4, s * (0.6 + rand() * 0.5))
    block.rotateY(rand() * Math.PI)
    block.rotateZ((rand() - 0.5) * 0.5) // fallen, not stacked
    block.translate(-0.45 + rand() * 0.95, s * 0.2, D / 2 + 0.1 + rand() * 0.3)
    parts.push(tint(block, i % 3 === 0 ? '#4f463f' : '#877d72', 0.12, 4750 + i))
  }
  return merge(parts)
}

/** Bandiagara: an angled cliff slab with small box dwellings on ledges at
 *  two heights — ochre mud tone. */
export function buildCliffDwellings(): THREE.BufferGeometry {
  const rand = mulberry32(4800)
  const parts: THREE.BufferGeometry[] = []
  // The escarpment: a tall slab leaning slightly back.
  const cliff = new THREE.BoxGeometry(3.4, 2.2, 0.6)
  cliff.rotateX(-0.16)
  cliff.translate(0, 1.1, -0.5)
  parts.push(tint(cliff, '#a9805a', 0.08, 4800))
  // Dwellings on two ledge heights, small boxes with flat roofs.
  const ledges: Array<[number, number]> = [
    [-1.2, 0.55],
    [-0.4, 0.55],
    [0.45, 0.55],
    [1.15, 0.55],
    [-0.75, 1.25],
    [0.15, 1.25],
    [0.95, 1.25],
  ]
  ledges.forEach(([x, y], i) => {
    const w = 0.3 + rand() * 0.14
    const h = 0.26 + rand() * 0.1
    const hut = new THREE.BoxGeometry(w, h, 0.3)
    hut.translate(x, y + h / 2, -0.05 + (y > 1 ? -0.14 : 0))
    parts.push(tint(hut, '#c49a6b', 0.09, 4810 + i))
  })
  return merge(parts)
}

/** Ngorongoro: a low broad circular rim of tilted rock segments (open bowl
 *  silhouette) — dry-grass/rock tone. */
export function buildCrater(): THREE.BufferGeometry {
  const rand = mulberry32(4900)
  const parts: THREE.BufferGeometry[] = []
  const R = 1.9
  const seg = 14
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2
    const h = 0.5 + rand() * 0.3
    const block = new THREE.BoxGeometry(0.9, h, 0.42)
    block.rotateX(-0.28) // tilted outward: an open bowl silhouette
    block.rotateY(-a)
    block.translate(Math.cos(a) * R, h / 2, Math.sin(a) * R)
    parts.push(tint(block, i % 2 ? '#a89a6c' : '#958861', 0.09, 4900 + i))
  }
  return merge(parts)
}

/** Ol Doinyo Lengai: a steep dark basalt cone with a flattened top plus a
 *  subtle translucent smoke hint (no particle system). */
export function buildVolcano(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const cone = new THREE.CylinderGeometry(0.28, 1.5, 2.4, 12)
  cone.translate(0, 1.2, 0)
  parts.push(tint(cone, '#4c4642', 0.08, 5000))
  const crater = new THREE.CylinderGeometry(0.34, 0.3, 0.14, 12)
  crater.translate(0, 2.45, 0)
  parts.push(tint(crater, '#3a3531', 0.06, 5001))
  // Smoke hint: two stacked soft grey cones above the summit. Rendered with
  // the shared vertex-color material (opaque), so the hint stays subtle by
  // tone rather than by alpha — no separate transparent material needed.
  const smoke1 = new THREE.ConeGeometry(0.3, 0.5, 8)
  smoke1.rotateX(Math.PI) // opening upward
  smoke1.translate(0.06, 2.85, 0)
  parts.push(tint(smoke1, '#b9b6b2', 0.05, 5002))
  const smoke2 = new THREE.ConeGeometry(0.42, 0.55, 8)
  smoke2.rotateX(Math.PI)
  smoke2.translate(0.16, 3.3, 0.06)
  parts.push(tint(smoke2, '#c7c4c0', 0.05, 5003))
  return merge(parts)
}

/** Okavango: low braided water ribbons (thin flat blue strips splitting
 *  outward) interspersed with papyrus tufts. */
export function buildDelta(): THREE.BufferGeometry {
  // Papyrus tufts between the channels. The WATER fan is a separate build
  // (buildDeltaWater) so the Okavango inversion can scale it with the flood —
  // object-level, whole-mesh, which is safe where vertex-mask displacement is
  // not (the bare-branches shards, point 144).
  const parts: THREE.BufferGeometry[] = []
  const tufts: Array<[number, number]> = [
    [-0.8, 0.3],
    [0.7, 0.1],
    [0.1, -0.5],
    [-1.3, 1.0],
    [1.4, 0.9],
  ]
  tufts.forEach(([x, z], i) => {
    const t = buildPapyrus()
    t.scale(0.55, 0.5 + (i % 3) * 0.12, 0.55)
    t.translate(x, 0, z)
    parts.push(t)
  })
  return merge(parts)
}

/**
 * The delta's braided water fan, separate so it can swell and shrink with the
 * flood (point 139): the Okavango peaks in the LOCAL dry season, June-August.
 */
export function buildDeltaWater(): THREE.BufferGeometry {
  const rand = mulberry32(5100)
  const parts: THREE.BufferGeometry[] = []
  // Braided ribbons fanning outward from an apex.
  for (let i = 0; i < 5; i++) {
    const a = -0.7 + i * 0.35
    const len = 2.2 + rand() * 0.8
    const ribbon = new THREE.BoxGeometry(0.28, 0.04, len)
    ribbon.rotateY(a)
    ribbon.translate(Math.sin(a) * (len / 2), 0.05, Math.cos(a) * (len / 2) - 1.2)
    parts.push(tint(ribbon, '#4a7d97', 0.06, 5100 + i))
  }
  return merge(parts)
}

/** Sudd (point 189): a broad, LOBED marsh reaching toward the river (+z is the
 *  riverward axis — the scene orients it at the White Nile), not the detached
 *  circular pond the first build read as. Overlapping irregular shallow sheets
 *  form the swamp water; dense papyrus belts crowd the lobe edges so the flat
 *  reads as reed marsh, distinct from the Okavango's braiding. */
export function buildWetland(): THREE.BufferGeometry {
  const rand = mulberry32(5200)
  const parts: THREE.BufferGeometry[] = []
  // Water lobes: jittered ellipses marching along the riverward axis, so the
  // marsh visually joins the channel instead of floating beside it.
  // Scaled to stay inside the shared travel-marker footprint (< 6 units, the
  // landmark family cap) while still the broadest site of the family.
  const F = 0.82
  const lobes: Array<[number, number, number, number]> = [
    // [x, z, radius, squash]
    [0, -1.6 * F, 1.7 * F, 0.8],
    [-1.1 * F, -0.2 * F, 1.5 * F, 0.7],
    [1.2 * F, -0.4 * F, 1.4 * F, 0.75],
    [-0.5 * F, 1.2 * F, 1.6 * F, 0.7],
    [0.9 * F, 1.8 * F, 1.5 * F, 0.65],
    [0.1 * F, 3.0 * F, 1.35 * F, 0.6], // the riverward tongue — its reeds hug the bank
  ]
  lobes.forEach(([x, z, r, squash], i) => {
    const sheet = new THREE.CylinderGeometry(r, r, 0.05, 14)
    sheet.scale(1, 1, squash)
    sheet.rotateY(rand() * Math.PI)
    sheet.translate(x, 0.025 + (i % 3) * 0.006, z)
    parts.push(tint(sheet, i % 2 ? '#54808f' : '#4f7f86', 0.05, 5200 + i))
  })
  // Dense papyrus belts at the lobe edges (the §19.9 reed rule): clumped, not
  // an even scatter — the clumps are what read as reed marsh from the air.
  for (let i = 0; i < 26; i++) {
    const lobe = lobes[i % lobes.length]
    const a = rand() * Math.PI * 2
    const edge = lobe[2] * (0.75 + rand() * 0.35)
    const t = buildPapyrus()
    const sc = 0.4 + rand() * 0.2
    t.scale(sc, sc, sc)
    t.translate(lobe[0] + Math.cos(a) * edge, 0.02, lobe[1] + Math.sin(a) * edge * lobe[3])
    parts.push(t)
  }
  return merge(parts)
}

/**
 * Table Mountain skyline massif for Cape Town's first-person backdrop
 * (design.md §4.4 Part C): a broad flat-topped plateau flanked by two lesser
 * peaks (Devil's Peak, Lion's Head), sized for the settlement panorama
 * (~140 units wide) rather than the travel map. Placed and scaled by the
 * scene; origin at the ground, the plateau top around y≈26.
 */
export function buildTableMountain(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  // The main table: a wide truncated prism with a flat top.
  const table = new THREE.CylinderGeometry(52, 68, 26, 26, 1)
  table.scale(1.35, 1, 0.42)
  table.translate(0, 13, 0)
  parts.push(tint(table, '#7d7468', 0.07, 5300))
  // A slightly lighter plateau cap reads as the sunlit table top.
  const cap = new THREE.CylinderGeometry(52.5, 53, 1.6, 26, 1)
  cap.scale(1.35, 1, 0.42)
  cap.translate(0, 26.2, 0)
  parts.push(tint(cap, '#948a7a', 0.05, 5301))
  // Devil's Peak (east) and Lion's Head (west): steeper flanking cones.
  const devils = new THREE.ConeGeometry(26, 30, 16)
  devils.translate(96, 15, 6)
  parts.push(tint(devils, '#776e62', 0.08, 5302))
  const lions = new THREE.ConeGeometry(14, 22, 14)
  lions.translate(-92, 11, -4)
  parts.push(tint(lions, '#7d7468', 0.08, 5303))
  return merge(parts)
}
