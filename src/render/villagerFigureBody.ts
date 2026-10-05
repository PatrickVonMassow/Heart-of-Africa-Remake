// The glTF villager body for the settlement's existing pose machinery
// (work-order "glTF villager body", final states 3 and 4; scenes/place/
// skinnedFigure.tsx). The file's skeleton rests in an A-pose (arms out and
// forward, legs apart), while every pose the settlement writes (walk, kneel,
// gestures, contacts, head loads) assumes the code-built body's rest: arms and
// legs hanging straight, identity rotations. So the person's body is re-posed
// ONCE into that hanging rest here — the A-pose skinned onto the hanging
// skeleton and baked into the geometry — and the result is a body the same
// poses drive, which is also what lets the comparison with point 1293 separate
// what the body changes from what the clips would change (final state 5).
//
// Pure: plain geometry and arrays, no scene graph; the tests read it directly.

import * as THREE from 'three/webgpu'
import { VILLAGER_GLTF } from '../config/balance'
import type { AgeGroup, Sex } from '../systems/appearance'
import { bodyProportions, BONE_NAMES, mixHex, paint as paintSurface, tidy, type BodyProportions, type BoneName } from './figureBody'
import { buildLayerGeometry } from './figureDress'
import type { DressLayer } from '../systems/appearance'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { VillagerAsset } from './villagerAsset'
import { bakeMorphs, morphInfluences, restHeads } from './villagerBody'
import { topoOrder } from './villagerAsset'

const DOWN = new THREE.Vector3(0, -1, 0)

/**
 * The world rotation each bone takes to hang from the file's rest: upper arm,
 * forearm (and the hand with it), thigh and shin turned to point straight
 * down; the feet and toes kept level; everything else unturned.
 */
export function hangRotations(asset: VillagerAsset, rest: Float32Array): THREE.Quaternion[] {
  const at = (n: string) => asset.bones.indexOf(n)
  const head = (i: number) => new THREE.Vector3(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2])
  const q = asset.bones.map(() => new THREE.Quaternion())
  const down = (bone: string, next: string) => {
    const d = head(at(next)).sub(head(at(bone))).normalize()
    return new THREE.Quaternion().setFromUnitVectors(d, DOWN)
  }
  for (const s of ['L', 'R']) {
    q[at(`upperArm.${s}`)] = down(`upperArm.${s}`, `forearm.${s}`)
    const fore = down(`forearm.${s}`, `hand.${s}`)
    q[at(`forearm.${s}`)] = fore
    q[at(`hand.${s}`)] = fore.clone()
    q[at(`thigh.${s}`)] = down(`thigh.${s}`, `shin.${s}`)
    q[at(`shin.${s}`)] = down(`shin.${s}`, `foot.${s}`)
  }
  return q
}

/** The joints after the hang: each child placed by its parent's turn. */
export function hungHeads(asset: VillagerAsset, rest: Float32Array, world: THREE.Quaternion[]): Float32Array {
  const out = new Float32Array(rest.length)
  const off = new THREE.Vector3()
  for (const i of topoOrder(asset.parents)) {
    const p = asset.parents[i]
    if (p < 0) {
      out.set(rest.subarray(i * 3, i * 3 + 3), i * 3)
      continue
    }
    off.set(rest[i * 3] - rest[p * 3], rest[i * 3 + 1] - rest[p * 3 + 1], rest[i * 3 + 2] - rest[p * 3 + 2]).applyQuaternion(world[p])
    out[i * 3] = out[p * 3] + off.x
    out[i * 3 + 1] = out[p * 3 + 1] + off.y
    out[i * 3 + 2] = out[p * 3 + 2] + off.z
  }
  return out
}

/** Skin a geometry from `rest` onto the same skeleton turned by `world` with
 *  joints at `heads`, and bake it (linear blend skinning). Normals recomputed. */
export function bakePose(geo: THREE.BufferGeometry, rest: Float32Array, heads: Float32Array, world: THREE.Quaternion[]): THREE.BufferGeometry {
  const g = geo.clone()
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const si = g.getAttribute('skinIndex') as THREE.BufferAttribute
  const sw = g.getAttribute('skinWeight') as THREE.BufferAttribute
  const out = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  const t = new THREE.Vector3()
  const acc = new THREE.Vector3()
  for (let k = 0; k < pos.count; k++) {
    v.fromBufferAttribute(pos, k)
    acc.set(0, 0, 0)
    let total = 0
    for (let c = 0; c < 4; c++) {
      const w = sw.getComponent(k, c)
      if (w <= 0) continue
      const b = si.getComponent(k, c)
      t.set(v.x - rest[b * 3], v.y - rest[b * 3 + 1], v.z - rest[b * 3 + 2]).applyQuaternion(world[b])
      acc.x += w * (t.x + heads[b * 3])
      acc.y += w * (t.y + heads[b * 3 + 1])
      acc.z += w * (t.z + heads[b * 3 + 2])
      total += w
    }
    if (total > 0) acc.multiplyScalar(1 / total)
    else acc.copy(v)
    out.set([acc.x, acc.y, acc.z], k * 3)
  }
  g.setAttribute('position', new THREE.BufferAttribute(out, 3))
  // Plain skin attributes (the file may store them normalized or narrow), so
  // the body merges with the dress layers into one geometry.
  const idx = new Uint16Array(si.count * 4)
  const wts = new Float32Array(si.count * 4)
  for (let k = 0; k < si.count; k++) {
    for (let c = 0; c < 4; c++) {
      idx[k * 4 + c] = si.getComponent(k, c)
      wts[k * 4 + c] = sw.getComponent(k, c)
    }
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4))
  g.morphAttributes = {}
  g.morphTargetsRelative = false
  g.deleteAttribute('normal')
  g.computeVertexNormals()
  return g
}

/** The bone each vertex hangs on most (its largest skin weight). */
export function dominantBones(g: THREE.BufferGeometry): Uint16Array {
  const si = g.getAttribute('skinIndex') as THREE.BufferAttribute
  const sw = g.getAttribute('skinWeight') as THREE.BufferAttribute
  const out = new Uint16Array(si.count)
  for (let k = 0; k < si.count; k++) {
    let best = 0
    let bw = -1
    for (let c = 0; c < 4; c++) {
      const w = sw.getComponent(k, c)
      if (w > bw) {
        bw = w
        best = si.getComponent(k, c)
      }
    }
    out[k] = best
  }
  return out
}

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

/** One person on the glTF body, hung, grounded and sized like the code-built body. */
export interface GltfPerson {
  /** Skinned to the asset's bone order, no morphs, normals of its own. */
  geometry: THREE.BufferGeometry
  /** Rest heads of the hanging skeleton (bones × 3), identity rotations. */
  rest: Float32Array
  /** The code-built body's proportions with every joint and girth measured on
   *  this body — what the poses, the anchors and the dress layers read. */
  p: BodyProportions
  /** Per vertex: on the scalp (the hair painted there). */
  hair: Uint8Array
}

/**
 * The glTF body of a person: the morphs from the appearance table baked in,
 * hung into the code-built rest, its soles put on y = 0 and scaled to the
 * code-built body's stature for that sex and age (callers size, label and
 * collide a figure by that stature; a child is drawn small by its caller's
 * scale exactly as before), and its proportions measured.
 */
export function gltfPerson(asset: VillagerAsset, sex: Sex, age: AgeGroup, build = 0): GltfPerson {
  const w = morphInfluences(sex, age, build)
  const rest0 = restHeads(asset, w)
  const world = hangRotations(asset, rest0)
  const heads = hungHeads(asset, rest0, world)
  const g = bakePose(bakeMorphs(asset.geometries.body, w), rest0, heads, world)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const dom = dominantBones(g)
  const bi = (n: string) => asset.bones.indexOf(n)
  const feet = new Set([bi('foot.L'), bi('foot.R'), bi('toe.L'), bi('toe.R')])
  let sole = Infinity
  let crown = -Infinity
  for (let k = 0; k < pos.count; k++) {
    if (feet.has(dom[k])) sole = Math.min(sole, pos.getY(k))
    crown = Math.max(crown, pos.getY(k))
  }
  const p0 = bodyProportions(sex, age, build)
  const s = p0.stature / (crown - sole)
  const arr = pos.array as Float32Array
  for (let k = 0; k < pos.count; k++) {
    arr[k * 3] *= s
    arr[k * 3 + 1] = (arr[k * 3 + 1] - sole) * s
    arr[k * 3 + 2] *= s
  }
  pos.needsUpdate = true
  const rest = new Float32Array(heads.length)
  for (let i = 0; i < heads.length / 3; i++) {
    rest[i * 3] = heads[i * 3] * s
    rest[i * 3 + 1] = (heads[i * 3 + 1] - sole) * s
    rest[i * 3 + 2] = heads[i * 3 + 2] * s
  }
  g.computeBoundingBox()
  g.computeBoundingSphere()
  const p = measureProportions(asset, g, dom, rest, p0)
  return { geometry: g, rest, p, hair: hairMask(asset, g, dom, p) }
}

/** Per-bone vertex samples of a hung body. */
function bySegment(asset: VillagerAsset, g: THREE.BufferGeometry, dom: Uint16Array, rest: Float32Array, bone: string, next: string, q: number) {
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const i = asset.bones.indexOf(bone)
  const a = new THREE.Vector3(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2])
  const j = asset.bones.indexOf(next)
  const b = new THREE.Vector3(rest[j * 3], rest[j * 3 + 1], rest[j * 3 + 2])
  const line = new THREE.Line3(a, b)
  const v = new THREE.Vector3()
  const c = new THREE.Vector3()
  const d: number[] = []
  for (let k = 0; k < pos.count; k++) {
    if (dom[k] !== i) continue
    v.fromBufferAttribute(pos, k)
    line.closestPointToPoint(v, true, c)
    d.push(c.distanceTo(v))
  }
  return quantile(d, q)
}

/** The code-built proportions, with the joints and girths of the hung body. */
export function measureProportions(asset: VillagerAsset, g: THREE.BufferGeometry, dom: Uint16Array, rest: Float32Array, p0: BodyProportions): BodyProportions {
  const at = (n: string) => asset.bones.indexOf(n)
  const y = (n: string) => rest[at(n) * 3 + 1]
  const x = (n: string) => Math.abs(rest[at(n) * 3])
  const len = (a: string, b: string) =>
    Math.hypot(rest[at(b) * 3] - rest[at(a) * 3], rest[at(b) * 3 + 1] - rest[at(a) * 3 + 1], rest[at(b) * 3 + 2] - rest[at(a) * 3 + 2])
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const H = p0.stature
  const arms = new Set(['L', 'R'].flatMap((s) => [`upperArm.${s}`, `forearm.${s}`, `hand.${s}`].map(at)))
  // The trunk's half-width and half-depth at a height: the mesh's cross-section
  // there (every edge crossing it), the arms' edges left out (they hang beside
  // it) — so at the pelvis the tops of the thighs count; the dress has to pass
  // over them too. A low-poly body has too few vertices in any thin band.
  const index = g.getIndex()
  const crossing = (yy: number, each: (x: number, z: number) => void) => {
    const n = index ? index.count : pos.count
    const vi = (t: number) => (index ? index.getX(t) : t)
    for (let t = 0; t < n; t += 3) {
      for (let e = 0; e < 3; e++) {
        const i0 = vi(t + e)
        const i1 = vi(t + ((e + 1) % 3))
        if (arms.has(dom[i0]) || arms.has(dom[i1])) continue
        const y0 = pos.getY(i0)
        const y1 = pos.getY(i1)
        if ((y0 - yy) * (y1 - yy) > 0 || y0 === y1) continue
        const f = (yy - y0) / (y1 - y0)
        each(pos.getX(i0) + (pos.getX(i1) - pos.getX(i0)) * f, pos.getZ(i0) + (pos.getZ(i1) - pos.getZ(i0)) * f)
      }
    }
  }
  const trunk = (yy: number): [number, number] => {
    let wx = 0
    let wz = 0
    crossing(yy, (cx, cz) => {
      wx = Math.max(wx, Math.abs(cx))
      wz = Math.max(wz, Math.abs(cz))
    })
    return [wx, wz]
  }
  // The section as the dress draws it: an ellipse round the axis. The widest
  // and deepest points alone do not bound it — a bust or a belly off the
  // front line, a square flank, pokes through the ellipse through those two —
  // so the ellipse of the section's own aspect grows until every point is in.
  const section = (yy: number): [number, number, number] | null => {
    const [wx, wz] = trunk(yy)
    if (!wx || !wz) return null
    let k = 1
    crossing(yy, (cx, cz) => {
      k = Math.max(k, Math.hypot(cx / wx, cz / wz))
    })
    return [yy, wx * k, wz * k]
  }
  const headI = at('head')
  let chin = Infinity
  let headW = 0
  let handLow = Infinity
  const hands = new Set([at('hand.L'), at('hand.R')])
  let heel = Infinity
  let tip = -Infinity
  const feet = new Set([at('foot.L'), at('toe.L')])
  for (let k = 0; k < pos.count; k++) {
    const b = dom[k]
    if (b === headI) {
      chin = Math.min(chin, pos.getY(k))
      headW = Math.max(headW, Math.abs(pos.getX(k)))
    } else if (hands.has(b)) handLow = Math.min(handLow, pos.getY(k))
    else if (feet.has(b)) {
      heel = Math.min(heel, pos.getZ(k))
      tip = Math.max(tip, pos.getZ(k))
    }
  }
  const crown = g.boundingBox?.max.y ?? H
  // The walk puts the HIPS bone at the leg's extent above the ankle; here the
  // hip joints sit a little below the hips bone, so the leg's joints are read
  // that much higher (lengths unchanged) and the soles land on the ground.
  const lift = y('hips') - y('thigh.L')
  const hipY = y('thigh.L') + lift
  const chestLine = hipY + (p0.chestY - p0.hipY) * ((y('upperArm.L') - hipY) / (p0.shoulderY - p0.hipY))
  const waistY = hipY + (p0.waistY - p0.hipY) * ((y('upperArm.L') - hipY) / (p0.shoulderY - p0.hipY))
  const [pelvisW] = trunk(hipY + 0.01 * H)
  const [waistW] = trunk(waistY)
  // The dress's chest station sits at the trunk's deepest section between the
  // waist and the shoulders — the women's bust, the men's chest — so a garment
  // passes over the breasts instead of being pierced below its chest line.
  let chestY = chestLine
  let chestD = trunk(chestLine)[1]
  for (let yy = waistY + 0.02 * H; yy < y('upperArm.L') - 0.04 * H; yy += 0.005 * H) {
    const d = trunk(yy)[1]
    if (d > chestD) {
      chestD = d
      chestY = yy
    }
  }
  const [chestW] = trunk(chestY)
  // Crotch to neck base, every centimetre or so (the dress interpolates).
  const trunkSections: Array<[number, number, number]> = []
  for (let yy = hipY - 0.07 * H; yy < y('neck') + 0.014 * H; yy += 0.01 * H) {
    const s = section(yy)
    if (s) trunkSections.push(s)
  }
  return {
    ...p0,
    crownY: crown,
    chinY: chin,
    headHalfH: (crown - chin) / 2,
    headHalfW: headW,
    neckY: y('neck'),
    neckR: bySegment(asset, g, dom, rest, 'neck', 'head', 0.5),
    shoulderY: y('upperArm.L'),
    shoulderX: x('upperArm.L'),
    chestY,
    chestHalfW: chestW || p0.chestHalfW,
    chestHalfD: chestD || p0.chestHalfD,
    waistY,
    waistHalfW: waistW || p0.waistHalfW,
    pelvisHalfW: pelvisW || p0.pelvisHalfW,
    hipY,
    hipX: x('thigh.L'),
    kneeY: y('shin.L') + lift,
    ankleY: y('foot.L') + lift,
    upperArm: len('upperArm.L', 'forearm.L'),
    forearm: len('forearm.L', 'hand.L'),
    hand: (y('hand.L') - handLow) / 2,
    armR: bySegment(asset, g, dom, rest, 'upperArm.L', 'forearm.L', 0.5),
    thighR: bySegment(asset, g, dom, rest, 'thigh.L', 'shin.L', 0.5),
    calfR: bySegment(asset, g, dom, rest, 'shin.L', 'foot.L', 0.5),
    footLen: tip - heel,
    trunkSections,
  }
}

/** The scalp: head vertices above the brow, and behind the ears down to the
 *  nape (calibratable shares in VILLAGER_GLTF.hair). */
function hairMask(asset: VillagerAsset, g: THREE.BufferGeometry, dom: Uint16Array, p: BodyProportions): Uint8Array {
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const headI = asset.bones.indexOf('head')
  const out = new Uint8Array(pos.count)
  const span = p.crownY - p.chinY
  let zMin = Infinity
  let zMax = -Infinity
  for (let k = 0; k < pos.count; k++) {
    if (dom[k] !== headI) continue
    zMin = Math.min(zMin, pos.getZ(k))
    zMax = Math.max(zMax, pos.getZ(k))
  }
  const brow = p.chinY + span * VILLAGER_GLTF.hair.brow
  const nape = p.chinY + span * VILLAGER_GLTF.hair.nape
  const back = zMin + (zMax - zMin) * VILLAGER_GLTF.hair.back
  for (let k = 0; k < pos.count; k++) {
    if (dom[k] !== headI) continue
    const yy = pos.getY(k)
    if (yy > brow || (yy > nape && pos.getZ(k) < back)) out[k] = 1
  }
  return out
}

/** The 17 code-built bone names onto the asset's bone indices (the dress
 *  layers are skinned by BONE_NAMES order). */
export function codeBoneMap(asset: VillagerAsset): Uint16Array {
  return Uint16Array.from(BONE_NAMES, (n: BoneName) => {
    const i = asset.bones.indexOf(n)
    if (i < 0) throw new Error(`villager.glb: no bone ${n}`)
    return i
  })
}

/** Re-index a geometry skinned by BONE_NAMES onto the asset's bones (in place). */
export function remapSkin(g: THREE.BufferGeometry, map: Uint16Array): THREE.BufferGeometry {
  const si = g.getAttribute('skinIndex') as THREE.BufferAttribute
  const out = new Uint16Array(si.count * 4)
  for (let k = 0; k < si.count; k++) for (let c = 0; c < 4; c++) out[k * 4 + c] = map[si.getComponent(k, c)]
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out, 4))
  return g
}

/**
 * The hanging skeleton of a person, root (hips) unparented and at rest, its
 * inverses taken here. Bones in the asset's order (the skin indices); named
 * `bone-<name>` like the code-built ones.
 */
export function createGltfSkeleton(asset: VillagerAsset, rest: Float32Array): { skeleton: THREE.Skeleton; bones: Record<string, THREE.Bone> } {
  const list = asset.bones.map((name) => {
    const b = new THREE.Bone()
    b.name = `bone-${name}`
    return b
  })
  const bones: Record<string, THREE.Bone> = {}
  asset.bones.forEach((name, i) => {
    const p = asset.parents[i]
    list[i].position.set(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2])
    if (p >= 0) {
      list[i].position.sub(new THREE.Vector3(rest[p * 3], rest[p * 3 + 1], rest[p * 3 + 2]))
      list[p].add(list[i])
    }
    bones[name] = list[i]
  })
  const root = list[asset.parents.indexOf(-1)]
  root.updateMatrixWorld(true)
  return { skeleton: new THREE.Skeleton(list), bones }
}

/**
 * A person's whole figure as ONE geometry skinned to the asset's bones: the
 * glTF body painted (skin, or skin under body paint; the scalp in the hair
 * colour) and every dress layer. The layers are point 1293's code-built ones,
 * fitted to this body's measured proportions.
 * OPEN: point 1311 replaces them with the pipeline's skinned garments.
 * `layerOf` lets the caller cache the layer builds.
 */
export function gltfFigureGeometry(
  asset: VillagerAsset,
  person: GltfPerson,
  layers: readonly DressLayer[],
  skin: string,
  paint: string | null,
  radial: number,
  layerOf: (l: DressLayer) => THREE.BufferGeometry | null = (l) => buildLayerGeometry(l, person.p, radial),
): THREE.BufferGeometry {
  const body = paintSurface(person.geometry.clone(), paint ? mixHex(skin, paint, 0.55) : skin)
  const col = body.getAttribute('color') as THREE.BufferAttribute
  const hair = new THREE.Color(person.p.hair)
  person.hair.forEach((h, i) => {
    if (h) col.setXYZ(i, hair.r, hair.g, hair.b)
  })
  const parts = [tidy(body)]
  const map = codeBoneMap(asset)
  for (const l of layers) {
    const lg = layerOf(l)
    if (lg) parts.push(remapSkin(lg.clone(), map))
  }
  const g = parts.length === 1 ? parts[0] : mergeGeometries(parts, false)
  if (!g) throw new Error('glTF villager: body and dress layers do not merge')
  g.computeBoundingSphere()
  return g
}
