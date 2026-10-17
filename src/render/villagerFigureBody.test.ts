// @vitest-environment node
// The glTF villager body under the settlement's pose machinery (work-order
// "glTF villager body", final states 3 and 4): hung into the code-built rest,
// grounded and sized like the code-built body, its proportions measured, its
// skeleton binding the geometry exactly, and the level that draws it.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { DETAIL_LEVELS, QUALITY_PRESETS } from '../config/quality'
import { VILLAGER_MOTION as M } from '../config/balance'
import { AGE_GROUPS, appearanceFor, PEOPLE_DRESS, SEXES, type DressLayer } from '../systems/appearance'
import { bodyProportions, PLAIN_SURFACE, SECOND_COLOUR_ATTRIBUTE, SURFACE_ATTRIBUTE } from './figureBody'
import { kneelLegs } from './figureRig'
import { ankleAt, figureCrownOffset, legDims, legExtent, strideReach, walkPose } from './figureWalk'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import { buildLayerGeometry, INFANT_SKIN } from './figureDress'
import { axisClearance } from '../test/axisClearance'
import { LIVE_MORPHS, restBounds } from './villagerBody'
import {
  bakePose,
  createGltfSkeleton,
  garmentMeshName,
  gltfFigureGeometry,
  gltfGarment,
  gltfPerson,
} from './villagerFigureBody'
import { GARMENT_PUSH_ATTRIBUTE } from './villagerGarmentMask'

let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

const people = () => AGE_GROUPS.flatMap((age) => SEXES.map((sex) => ({ sex, age })))
const head = (rest: Float32Array, i: number) => new THREE.Vector3(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2])

describe('the glTF body hung into the code-built rest', () => {
  it('arms and legs hang straight down: each joint directly below the one above', () => {
    for (const { sex, age } of people()) {
      const { rest } = gltfPerson(asset, sex, age)
      const at = (n: string) => head(rest, asset.bones.indexOf(n))
      for (const s of ['L', 'R']) {
        for (const [a, b] of [
          [`upperArm.${s}`, `forearm.${s}`],
          [`forearm.${s}`, `hand.${s}`],
          [`thigh.${s}`, `shin.${s}`],
          [`shin.${s}`, `foot.${s}`],
        ]) {
          const d = at(b).sub(at(a))
          expect(Math.hypot(d.x, d.z)).toBeLessThan(1e-4)
          expect(d.y).toBeLessThan(0)
        }
      }
    }
  })

  it('stands on y = 0 at the code-built stature of its sex and age, only the hands\' shapes left live on the GPU', () => {
    for (const { sex, age } of people()) {
      const { geometry, p } = gltfPerson(asset, sex, age)
      restBounds(geometry)
      expect(geometry.boundingBox!.min.y).toBeGreaterThan(-0.01)
      expect(geometry.boundingBox!.min.y).toBeLessThan(0.01)
      expect(geometry.boundingBox!.max.y).toBeCloseTo(bodyProportions(sex, age).stature, 4)
      expect(p.stature).toBeCloseTo(bodyProportions(sex, age).stature, 6)
      expect((geometry.morphAttributes.position ?? []).map((m) => m.name)).toEqual([...LIVE_MORPHS])
      expect(geometry.morphTargetsRelative).toBe(true)
      expect(geometry.getAttribute('skinIndex')).toBeInstanceOf(THREE.Uint16BufferAttribute)
      expect(geometry.getAttribute('skinWeight').normalized).toBe(false)
    }
  })

  it('measures joints and girths the pose and the dress can read', () => {
    for (const { sex, age } of people()) {
      const { p } = gltfPerson(asset, sex, age)
      expect(p.crownY).toBeGreaterThan(p.chinY)
      expect(p.chinY).toBeGreaterThan(p.shoulderY)
      expect(p.shoulderY).toBeGreaterThan(p.chestY)
      expect(p.chestY).toBeGreaterThan(p.waistY)
      expect(p.waistY).toBeGreaterThan(p.hipY)
      expect(p.hipY).toBeGreaterThan(p.kneeY)
      expect(p.kneeY).toBeGreaterThan(p.ankleY)
      for (const k of ['chestHalfW', 'chestHalfD', 'waistHalfW', 'pelvisHalfW', 'armR', 'thighR', 'calfR', 'neckR', 'hand', 'footLen'] as const) {
        expect(p[k], `${sex} ${age} ${k}`).toBeGreaterThan(0.01 * p.stature)
        expect(p[k], `${sex} ${age} ${k}`).toBeLessThan(0.2 * p.stature)
      }
    }
  })

  it('the child keeps a child’s head: a larger share of its stature than the adult’s', () => {
    for (const sex of SEXES) {
      const child = gltfPerson(asset, sex, 'child').p
      const adult = gltfPerson(asset, sex, 'adult').p
      expect((child.crownY - child.chinY) / child.stature).toBeGreaterThan((adult.crownY - adult.chinY) / adult.stature * 1.15)
    }
  })

  it('the code-built walk keeps its soles on the ground on this body (point 1295 stays binding)', () => {
    for (const { sex, age } of people()) {
      const { p, rest } = gltfPerson(asset, sex, age)
      const d = legDims(p)
      // standing: the hips bone at the leg's extent puts the ankle at its rest height
      const hips = head(rest, asset.bones.indexOf('hips')).y
      expect(d.ankle + legExtent(d, 0)).toBeCloseTo(hips, 5)
      for (let ph = 0; ph < Math.PI * 2; ph += 0.2) {
        const pose = walkPose(d, ph, strideReach(d, 0.8, age), 1, age)
        pose.legs.forEach((l, i) => {
          const sole = pose.hipHeight + ankleAt(d, l).y - d.ankle
          if (pose.feet[i].stance) expect(Math.abs(sole)).toBeLessThanOrEqual(M.footGroundTolerance)
        })
      }
    }
  })
})

describe('the hands\' shapes (natural-villager-motion step 3)', () => {
  it('a morph delta turns with the bones its vertex hangs on through the hang bake', () => {
    // two bones, one vertex on each half and half; bone 1 turned a quarter about z
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0, 0, 2, 0], 3))
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 1, 0, 0], 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 0.5, 0.5, 0, 0], 4))
    const d = new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0], 3)
    d.name = 'grip.L'
    g.morphAttributes.position = [d]
    g.morphTargetsRelative = true
    const rest = new Float32Array([0, 0, 0, 0, 1, 0])
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
    const out = bakePose(g, rest, rest, [new THREE.Quaternion(), turn])
    const m = out.morphAttributes.position![0]
    expect(m.name).toBe('grip.L')
    expect(out.morphTargetsRelative).toBe(true)
    // on bone 0 alone: unturned
    expect([m.getX(0), m.getY(0), m.getZ(0)]).toEqual([1, 0, 0])
    // half on the quarter-turned bone: (1, 0, 0)/2 + (0, 1, 0)/2
    expect(m.getX(1)).toBeCloseTo(0.5, 6)
    expect(m.getY(1)).toBeCloseTo(0.5, 6)
  })

  it('every person carries the six hand shapes, scaled with the body; a garment carries zero deltas and still merges', () => {
    const person = gltfPerson(asset, 'female', 'adult')
    const names = (person.geometry.morphAttributes.position ?? []).map((m) => m.name)
    expect(names).toEqual([...LIVE_MORPHS])
    // a closed hand moves the hand and nothing far from it
    const grip = person.geometry.morphAttributes.position![names.indexOf('grip.L')]
    let moved = 0
    for (let k = 0; k < grip.count; k++) moved = Math.max(moved, Math.hypot(grip.getX(k), grip.getY(k), grip.getZ(k)))
    expect(moved).toBeGreaterThan(0.005)
    expect(moved).toBeLessThan(0.15)
    const layers = appearanceFor({ peopleId: 'swahili', sex: 'female', age: 'adult', drivers: { coldness: 0, harmattan: 0, karif: 0 }, year: 1890, cloth: '#887766', palette: ['#887766'], pick: 0.3 })
    const worn = layers.map((l) => gltfGarment(asset, person, l)).filter((g): g is THREE.BufferGeometry => !!g)
    expect(worn.length).toBeGreaterThan(0)
    for (const g of worn) {
      expect((g.morphAttributes.position ?? []).map((m) => m.name)).toEqual([...LIVE_MORPHS])
      for (const m of g.morphAttributes.position!) expect(Math.max(...(m.array as Float32Array).map(Math.abs))).toBe(0)
    }
    const fig = gltfFigureGeometry(asset, person, layers, '#5c3317', null, 16)
    expect((fig.morphAttributes.position ?? []).map((m) => m.name)).toEqual([...LIVE_MORPHS])
    expect(fig.morphAttributes.position![0].count).toBe(fig.getAttribute('position').count)
  })

  it('the dressed figure keeps its shapes RELATIVE: with both hands relaxed it still stands upright on the ground', () => {
    // three's mergeGeometries checks morphTargetsRelative but leaves the merged
    // geometry at the default false; the GPU then scales the base by
    // 1 − Σ weights (−1 with both hands relaxed) and draws the body upside
    // down below the ground.
    const person = gltfPerson(asset, 'female', 'adult')
    const layers = appearanceFor({ peopleId: 'zulu', sex: 'female', age: 'adult', drivers: { coldness: 0, harmattan: 0, karif: 0 }, year: 1890, cloth: '#887766', palette: ['#887766'], pick: 0.3 })
    const fig = gltfFigureGeometry(asset, person, layers, '#5c3317', null, 16)
    expect(fig.morphTargetsRelative).toBe(true)
    const { skeleton, bones } = createGltfSkeleton(asset, person.rest)
    const mesh = new THREE.SkinnedMesh(fig, new THREE.MeshBasicMaterial())
    mesh.add(bones.hips)
    mesh.bind(skeleton, new THREE.Matrix4())
    mesh.morphTargetInfluences![mesh.morphTargetDictionary!['relax.L']] = 1
    mesh.morphTargetInfluences![mesh.morphTargetDictionary!['relax.R']] = 1
    mesh.updateMatrixWorld(true)
    const box = new THREE.Box3()
    const v = new THREE.Vector3()
    for (let k = 0; k < fig.getAttribute('position').count; k++) box.expandByPoint(mesh.getVertexPosition(k, v))
    expect(box.min.y).toBeGreaterThan(-0.05)
    expect(box.max.y).toBeGreaterThan(person.p.stature * 0.9)
  })
})

describe('the skeleton the figure binds', () => {
  it('rests at the hung joints, identity rotations, and binds the geometry unmoved', () => {
    const { rest, geometry } = gltfPerson(asset, 'female', 'elder')
    const { skeleton, bones } = createGltfSkeleton(asset, rest)
    expect(skeleton.bones).toHaveLength(asset.bones.length)
    for (const [i, name] of asset.bones.entries()) {
      const b = bones[name]
      expect(b.name).toBe(`bone-${name}`)
      expect(b.quaternion.equals(new THREE.Quaternion())).toBe(true)
      expect(b.getWorldPosition(new THREE.Vector3()).distanceTo(head(rest, i))).toBeLessThan(1e-5)
    }
    // at rest every skinning matrix is the identity: bone world × inverse
    skeleton.update()
    const m = new THREE.Matrix4()
    for (let i = 0; i < skeleton.bones.length; i++) {
      m.multiplyMatrices(skeleton.bones[i].matrixWorld, skeleton.boneInverses[i])
      expect(m.equals(new THREE.Matrix4()) || m.elements.every((e, k) => Math.abs(e - new THREE.Matrix4().elements[k]) < 1e-5)).toBe(true)
    }
    expect(geometry.getAttribute('position').count).toBeGreaterThan(1000)
  })

})

/** A skinned geometry's positions under the skeleton's current pose (CPU). */
function skinned(g: THREE.BufferGeometry, sk: THREE.Skeleton): Float32Array {
  const pos = g.getAttribute('position')
  const si = g.getAttribute('skinIndex')
  const sw = g.getAttribute('skinWeight')
  const out = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  const acc = new THREE.Vector3()
  const t = new THREE.Vector3()
  const m = new THREE.Matrix4()
  for (let k = 0; k < pos.count; k++) {
    v.fromBufferAttribute(pos, k)
    acc.set(0, 0, 0)
    for (let j = 0; j < 4; j++) {
      const w = sw.getComponent(k, j)
      if (!w) continue
      const b = si.getComponent(k, j)
      m.multiplyMatrices(sk.bones[b].matrixWorld, sk.boneInverses[b])
      acc.addScaledVector(t.copy(v).applyMatrix4(m), w)
    }
    acc.toArray(out, k * 3)
  }
  return out
}

/** The drawn head top over the head bone's axis: the highest vertex skinned
 *  wholly to the head (scalp or headwear) within 6 cm of the bone's vertical,
 *  as the head-carrier check in scripts/verify/polish-villagers.mjs reads it. */
function drawnHeadTop(asset: VillagerAsset, g: THREE.BufferGeometry, rest: Float32Array): number {
  const hi = asset.bones.indexOf('head')
  const hx = rest[hi * 3]
  const hz = rest[hi * 3 + 2]
  const pos = g.getAttribute('position')
  const si = g.getAttribute('skinIndex')
  const sw = g.getAttribute('skinWeight')
  // only vertices of drawn triangles: the garment mask drops triangles, not vertices
  const index = g.getIndex()
  const drawn = index ? new Set(Array.from({ length: index.count }, (_, i) => index.getX(i))) : null
  let top = -Infinity
  for (let v = 0; v < pos.count; v++) {
    if (drawn && !drawn.has(v)) continue
    let whole = false
    for (let k = 0; k < 4; k++) if (si.getComponent(v, k) === hi && sw.getComponent(v, k) > 0.99) whole = true
    if (whole && Math.hypot(pos.getX(v) - hx, pos.getZ(v) - hz) <= 0.06) top = Math.max(top, pos.getY(v))
  }
  return top
}

const SEATED_FORMS = new Set(['cap', 'headband', 'hairBag'])

/** The bare body's head surface: its triangles whose corners are all skinned
 *  mostly to the head (scalp, face). The scalp is coarse — edges up to 11 cm —
 *  so the seating checks measure against these triangles, never against the
 *  vertices: a slab of vertices misses the back of the skull, and their
 *  centroid leans into the dense face. */
function headSkin(asset: VillagerAsset, g: THREE.BufferGeometry): THREE.Triangle[] {
  const hi = asset.bones.indexOf('head')
  const pos = g.getAttribute('position')
  const si = g.getAttribute('skinIndex')
  const sw = g.getAttribute('skinWeight')
  const onHead = (v: number) => [0, 1, 2, 3].some((k) => si.getComponent(v, k) === hi && sw.getComponent(v, k) > 0.5)
  const at = (v: number) => new THREE.Vector3().fromBufferAttribute(pos, v)
  const index = g.getIndex()!
  const out: THREE.Triangle[] = []
  for (let t = 0; t < index.count; t += 3) {
    const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)]
    if (onHead(a) && onHead(b) && onHead(c)) out.push(new THREE.Triangle(at(a), at(b), at(c)))
  }
  return out
}
/** The head surface's outline at height y: its section points in (x, z) segments. */
function headSection(skin: THREE.Triangle[], y: number): [THREE.Vector2, THREE.Vector2][] {
  const segs: [THREE.Vector2, THREE.Vector2][] = []
  for (const t of skin) {
    const cut: THREE.Vector2[] = []
    for (const [p, q] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
      if ((p.y - y) * (q.y - y) > 0 || p.y === q.y) continue
      const f = (y - p.y) / (q.y - p.y)
      cut.push(new THREE.Vector2(p.x + (q.x - p.x) * f, p.z + (q.z - p.z) * f))
    }
    if (cut.length >= 2) segs.push([cut[0], cut[1]])
  }
  return segs
}
/** The section's centre: the middle of its extent in x and z. */
function sectionCentre(segs: [THREE.Vector2, THREE.Vector2][]): THREE.Vector2 {
  const b = new THREE.Box2()
  for (const [p, q] of segs) b.expandByPoint(p).expandByPoint(q)
  return b.getCenter(new THREE.Vector2())
}
/** The section's farthest reach from `c` along `dir` (unit): the head's radius there. */
function sectionReach(segs: [THREE.Vector2, THREE.Vector2][], c: THREE.Vector2, dir: THREE.Vector2): number {
  let best = -Infinity
  for (const [p, q] of segs) {
    const e = q.clone().sub(p)
    const den = dir.x * e.y - dir.y * e.x
    if (Math.abs(den) < 1e-12) continue
    const w = p.clone().sub(c)
    const t = (w.x * e.y - w.y * e.x) / den
    const u = (w.x * dir.y - w.y * dir.x) / den
    if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.max(best, t)
  }
  return best
}
/** A head piece's lower edge: its lowest vertex in each of 24 directions round its own axis. */
function brimOf(v: THREE.Vector3[]): THREE.Vector3[] {
  const b = new THREE.Box3().setFromPoints(v)
  const c = b.getCenter(new THREE.Vector3())
  const low = new Map<number, THREE.Vector3>()
  for (const a of v) {
    if (Math.hypot(a.x - c.x, a.z - c.z) < 0.01) continue
    const k = Math.round(((Math.atan2(a.z - c.z, a.x - c.x) + Math.PI) / (2 * Math.PI)) * 24) % 24
    if (!low.has(k) || a.y < low.get(k)!.y) low.set(k, a)
  }
  return [...low.values()]
}
const surfaceGap = (skin: THREE.Triangle[], a: THREE.Vector3) => {
  const q = new THREE.Vector3()
  return Math.min(...skin.map((t) => t.closestPointToPoint(a, q).distanceTo(a)))
}

const HEAD_FORMS = new Set(['cap', 'turban', 'headband', 'headRing', 'topknot', 'hairBag'])
const dressOf = (l: DressLayer): DressLayer => ({ ...l, colour: l.colour === 'cloth' ? '#b08850' : l.colour, colour2: l.colour2 === 'cloth' ? '#b08850' : l.colour2 })

describe('a head load rests on the drawn head', () => {
  it('the crown anchor on the head bone is the drawn head top (within 2 cm) for every build, age and dress', { timeout: 120_000 }, () => {
    for (const { sex, age } of people()) {
      for (const build of [-1, 0, 1]) {
        const person = gltfPerson(asset, sex, age, build)
        const { skeleton, bones } = createGltfSkeleton(asset, person.rest)
        const headAt = bones.head.getWorldPosition(new THREE.Vector3())
        const dresses = [['bare', []] as const, ...Object.entries(PEOPLE_DRESS).map(([id, t]) => [id, t[sex][age].map(dressOf)] as const)]
        for (const [id, layers] of dresses) {
          const g = gltfFigureGeometry(asset, person, layers, '#5c3317', null, 16)
          const crown = headAt.y + figureCrownOffset(person.p, g, skeleton.bones.indexOf(bones.head), headAt)
          const top = drawnHeadTop(asset, g, person.rest)
          expect(Math.abs(crown - top), `${id} ${sex} ${age} build ${build}: crown ${crown.toFixed(3)} over drawn head ${top.toFixed(3)}`).toBeLessThanOrEqual(0.02)
        }
      }
    }
  })

  it('no head piece floats: every one reaches down onto the head of every person who could wear it', () => {
    const worn = new Map<string, DressLayer>()
    for (const t of Object.values(PEOPLE_DRESS))
      for (const sex of SEXES) for (const age of AGE_GROUPS) for (const l of t[sex][age]) if (HEAD_FORMS.has(l.form)) worn.set(garmentMeshName(l), dressOf(l))
    expect(worn.size).toBeGreaterThan(0)
    for (const { sex, age } of people()) {
      const person = gltfPerson(asset, sex, age)
      for (const [name, l] of worn) {
        const g = gltfGarment(asset, person, l)
        expect(g, name).not.toBeNull()
        g!.computeBoundingBox()
        // its lowest edge below the bare head's top: a piece wholly above the
        // scalp is a disc hovering over the head (the user's report of 16.10.)
        expect(g!.boundingBox!.min.y, `${name} on ${sex} ${age} (head top ${person.p.crownY.toFixed(3)})`).toBeLessThan(person.p.crownY)
      }
    }
  })

  it('a cap, a headband and a hair bag sit on the head skin: centred, neither sunk nor lifted', { timeout: 120_000 }, () => {
    const worn = new Map<string, DressLayer>()
    for (const t of Object.values(PEOPLE_DRESS))
      for (const sex of SEXES) for (const age of AGE_GROUPS) for (const l of t[sex][age]) if (SEATED_FORMS.has(l.form)) worn.set(garmentMeshName(l), dressOf(l))
    expect([...worn.values()].map((l) => l.form).sort()).toEqual(['cap', 'hairBag', 'headband'])
    for (const { sex, age } of people()) {
      for (const build of [-1, 0, 1]) {
        const person = gltfPerson(asset, sex, age, build)
        const skin = headSkin(asset, person.geometry)
        const crown = drawnHeadTop(asset, person.geometry, person.rest)
        for (const [name, l] of worn) {
          const g = gltfGarment(asset, person, l)!
          const pos = g.getAttribute('position')
          const v = Array.from({ length: pos.count }, (_, k) => new THREE.Vector3().fromBufferAttribute(pos, k))
          const at = `${name} on ${sex} ${age} build ${build}`
          if (l.form === 'hairBag') {
            // touches the back of the head, its middle outside the skull
            const gap = Math.min(...v.map((a) => surfaceGap(skin, a)))
            expect(gap, `${at}: gap to the head`).toBeLessThanOrEqual(0.01)
            const mid = v.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(v.length)
            const back = Math.min(...headSection(skin, mid.y).flat().map((p) => p.y))
            expect(mid.z, `${at}: middle behind the skull`).toBeLessThan(back)
            continue
          }
          // the lower edge against the head's section at its height
          const brim = brimOf(v)
          expect(brim.length, `${at}: brim`).toBeGreaterThan(16)
          const y0 = brim.reduce((s, a) => s + a.y, 0) / brim.length
          const hc = sectionCentre(headSection(skin, y0))
          const c = new THREE.Box2().setFromPoints(brim.map((a) => new THREE.Vector2(a.x, a.z))).getCenter(new THREE.Vector2())
          expect(c.distanceTo(hc), `${at}: brim off the head's centre`).toBeLessThanOrEqual(0.012)
          // every brim point just outside the skin: not sunk into the skull, not lifted off it
          for (const a of brim) {
            const off = new THREE.Vector2(a.x - hc.x, a.z - hc.y)
            const sr = sectionReach(headSection(skin, a.y), hc, off.clone().normalize())
            expect(sr, `${at}: head skin under the brim`).toBeGreaterThan(0)
            expect(off.length() - sr, `${at}: brim against the skin`).toBeGreaterThanOrEqual(-0.006)
            expect(off.length() - sr, `${at}: brim against the skin`).toBeLessThanOrEqual(0.03)
          }
          if (l.form === 'cap') {
            const top = Math.max(...v.map((a) => a.y))
            expect(top, `${at}: cap over the crown`).toBeGreaterThan(crown)
            expect(top - crown, `${at}: cap over the crown`).toBeLessThanOrEqual(0.02)
          }
        }
      }
    }
  })
})

describe('the dressed figure', () => {
  it('every people’s dress of every sex and age merges with the glTF body into one geometry', () => {
    for (const { sex, age } of people()) {
      const person = gltfPerson(asset, sex, age)
      const bodyCount = person.geometry.getAttribute('position').count
      for (const [id, table] of Object.entries(PEOPLE_DRESS)) {
        // the table's 'cloth' colour is the figure's own cloth (appearanceFor resolves it)
        const cloth = <T extends string | null>(c: T): T | string => (c === 'cloth' ? '#b08850' : c)
        const layers = table[sex][age].map((l) => ({ ...l, colour: cloth(l.colour), colour2: cloth(l.colour2) }))
        const g = gltfFigureGeometry(asset, person, layers, '#5c3317', id === 'maasai' ? '#a0442a' : null, 16)
        expect(g.getAttribute('position').count, `${id} ${sex} ${age}`).toBeGreaterThanOrEqual(bodyCount)
        const si = g.getAttribute('skinIndex')
        expect(Math.max(...(si.array as Uint16Array))).toBeLessThan(asset.bones.length)
      }
    }
  })

  it('on the glTF body the bead collar lies inside the seasonal cloak, open or tied, and an infant in its sling outside the tied one', () => {
    const shoulderLayer = (form: 'cloak' | 'neckBeads' | 'babySling', wear: 'bothShoulders' | 'chest') => ({
      ...PEOPLE_DRESS.zulu.female.youth[0],
      slot: form === 'neckBeads' ? ('ornament' as const) : ('shoulder' as const),
      form,
      material: form === 'neckBeads' ? ('beads' as const) : ('hide' as const),
      wear,
    })
    for (const age of ['youth', 'adult', 'elder'] as const) {
      const { p } = gltfPerson(asset, 'female', age)
      for (const radial of [16, 24]) {
        const collar = buildLayerGeometry(shoulderLayer('neckBeads', 'chest'), p, radial)!
        for (const wear of ['bothShoulders', 'chest'] as const) {
          const cloak = buildLayerGeometry(shoulderLayer('cloak', wear), p, radial)!
          const { min, count } = axisClearance(collar, cloak, 'inside')
          expect(count, `${age} ${radial} ${wear}`).toBeGreaterThan(collar.getAttribute('position').count * 0.75)
          expect(min / p.stature, `${age} ${radial} ${wear}`).toBeGreaterThan(0.004)
        }
        const sling = buildLayerGeometry(shoulderLayer('babySling', 'bothShoulders'), p, radial)!
        const mantle = buildLayerGeometry(shoulderLayer('cloak', 'chest'), p, radial)!
        const { min, count } = axisClearance(sling, mantle, 'outside')
        expect(count, `${age} ${radial} sling`).toBeGreaterThan(0)
        expect(min / p.stature, `${age} ${radial} sling`).toBeGreaterThan(0.008)
      }
    }
  })

  it('in the dressed glTF figure the infant rides the chest bone alone, rigid and clear of the tied mantle when bent, leaning or kneeling', () => {
    const person = gltfPerson(asset, 'female', 'adult')
    const { p } = person
    const H = p.stature
    const base = PEOPLE_DRESS.san.female.adult[0]
    const mantle = { ...base, slot: 'shoulder' as const, form: 'cloak' as const, material: 'hide' as const, wear: 'chest' as const }
    const sling = { ...mantle, form: 'babySling' as const, wear: 'bothShoulders' as const }
    const g = gltfFigureGeometry(asset, person, [mantle, sling], '#5c3317', null, 16)
    // the pipeline's garments, in layer order behind the body
    const n = asset.geometries[garmentMeshName(sling)].getAttribute('position').count
    const m = asset.geometries[garmentMeshName(mantle)].getAttribute('position').count
    const total = g.getAttribute('position').count
    const [s0, m0] = [total - n, total - n - m]
    // all four skin slots of every infant vertex: the chest at 1, the rest 0
    const chest = asset.bones.indexOf('chest')
    const si = g.getAttribute('skinIndex')
    const sw = g.getAttribute('skinWeight')
    for (let k = s0; k < total; k++) {
      let on = 0
      let off = 0
      for (let j = 0; j < 4; j++) {
        if (si.getComponent(k, j) === chest) on += sw.getComponent(k, j)
        else off += sw.getComponent(k, j)
      }
      expect(on, `vertex ${k}`).toBeCloseTo(1, 6)
      expect(off, `vertex ${k}`).toBeCloseTo(0, 6)
    }
    const part = (from: number, to: number, at: Float32Array) => {
      const out = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(at.slice(from * 3, to * 3), 3))
      const idx = asset.geometries[garmentMeshName(from === s0 ? sling : mantle)].getIndex()!
      return out.setIndex(idx.clone())
    }
    const poses: Array<[string, (b: Record<string, THREE.Bone>) => void]> = [
      ['rest', () => {}],
      ['chest bent by the elder’s stoop', (b) => b.chest.rotation.set(0.42, 0, 0)],
      ['trunk leaning into a work pose', (b) => b.spine.rotation.set(0.5, 0, 0)],
      [
        'kneeling',
        (b) => {
          const k = kneelLegs(p.hipY - p.kneeY, p.calfR)
          b.hips.position.y += k.hipY - p.hipY
          for (const sd of ['L', 'R'] as const) {
            b[`thigh.${sd}`].rotation.x = k.thigh
            b[`shin.${sd}`].rotation.x = k.shin
            b[`foot.${sd}`].rotation.x = k.foot
          }
        },
      ],
    ]
    const rest = g.getAttribute('position')
    for (const [name, pose] of poses) {
      const { skeleton, bones } = createGltfSkeleton(asset, person.rest)
      pose(bones as unknown as Record<string, THREE.Bone>)
      let root: THREE.Object3D = bones.hips
      while (root.parent) root = root.parent
      root.updateMatrixWorld(true)
      // back into the chest bone's bind frame
      const back = bones.chest.matrixWorld.clone().multiply(skeleton.boneInverses[skeleton.bones.indexOf(bones.chest)]).invert()
      const at = skinned(g, skeleton)
      const v = new THREE.Vector3()
      for (let k = m0; k < total; k++) {
        v.fromArray(at, k * 3).applyMatrix4(back)
        at[k * 3] = v.x
        at[k * 3 + 1] = v.y
        at[k * 3 + 2] = v.z
        if (k >= s0) expect(v.distanceTo(new THREE.Vector3().fromBufferAttribute(rest, k)), `${name} vertex ${k}`).toBeLessThan(1e-4)
      }
      // measured 0.016-0.023 H over these poses
      const { min, count } = axisClearance(part(s0, total, at), part(m0, s0, at), 'outside')
      expect(count, name).toBe(n)
      expect(min / H, name).toBeGreaterThan(0.01)
    }
  })

  it('paints the scalp in the hair colour and the rest in the skin', () => {
    const person = gltfPerson(asset, 'male', 'elder')
    const g = gltfFigureGeometry(asset, person, [], '#5c3317', null, 16)
    const col = g.getAttribute('color')
    const hair = new THREE.Color(person.p.hair)
    let scalp = 0
    for (let i = 0; i < col.count; i++) if (person.hair[i]) {
      scalp++
      expect(col.getX(i)).toBeCloseTo(hair.r, 5)
    }
    expect(scalp).toBeGreaterThan(50)
    expect(scalp).toBeLessThan(col.count * 0.2)
  })
})

describe('the pipeline garments on the glTF body', () => {
  const PALETTE = ['#3a5a8a', '#8a4a2a', '#c2b090']
  const DRIVERS = [0, 1].flatMap((coldness) => [0, 1].flatMap((harmattan) => [0, 1].map((karif) => ({ coldness, harmattan, karif }))))
  /** Every dress layer the outfit generator puts on a figure, one per form and wear. */
  const generated = () => {
    const out = new Map<string, DressLayer>()
    for (const peopleId of [...Object.keys(PEOPLE_DRESS), null])
      for (const sex of SEXES)
        for (const age of AGE_GROUPS)
          for (const drivers of DRIVERS)
            for (let year = 1890; year <= 1895; year++)
              for (const pick of [0.05, 0.35, 0.65, 0.95])
                for (const l of appearanceFor({ peopleId, sex, age, drivers, year, cloth: PALETTE[0], palette: PALETTE, pick })) out.set(garmentMeshName(l), l)
    // the San infant sling is drawn by a pick share the sweep need not meet
    const mantle = PEOPLE_DRESS.san.female.adult[0]
    out.set('g-babySling-bothShoulders', { ...mantle, slot: 'shoulder', form: 'babySling', wear: 'bothShoulders' })
    return out
  }

  it('the file holds a garment for every form and wear the outfit generator puts on a figure', () => {
    const missing = [...generated().entries()].filter(([n, l]) => l.form !== 'bodyPaint' && asset.parts[n] !== 'garment').map(([n]) => n)
    expect(missing).toEqual([])
    // every garment the file ships is in the cover mask's order
    const shipped = Object.keys(asset.parts).filter((n) => asset.parts[n] === 'garment')
    expect([...shipped].sort()).toEqual([...asset.garmentMask].sort())
  })

  it('no code-built layer reaches the glTF body: the figure is the body and exactly the pipeline garments', () => {
    for (const { sex, age } of people()) {
      const person = gltfPerson(asset, sex, age)
      for (const [id, table] of Object.entries(PEOPLE_DRESS)) {
        const layers = table[sex][age].map((l) => ({ ...l, colour: l.colour === 'cloth' ? '#b08850' : l.colour, colour2: l.colour2 === 'cloth' ? '#b08850' : l.colour2 }))
        const g = gltfFigureGeometry(asset, person, layers, '#5c3317', null, 16)
        const garments = layers.filter((l) => l.form !== 'bodyPaint')
        const want = garments.reduce((t, l) => t + asset.geometries[garmentMeshName(l)].getAttribute('position').count, person.geometry.getAttribute('position').count)
        expect(g.getAttribute('position').count, `${id} ${sex} ${age}`).toBe(want)
      }
    }
  })

  it('a garment follows the body’s morphs, hang, ground and scale: it sits on every person as on the measured body', () => {
    const fails: string[] = []
    for (const { sex, age } of people()) {
      for (const build of [-1, 0, 1]) {
        const person = gltfPerson(asset, sex, age, build)
        const H = person.p.stature
        restBounds(person.geometry)
        for (const n of asset.garmentMask) {
          const [, form, wear] = n.split('-')
          // a mantle's flare and a sling on the back stand further off the body
          const off = ['cloak', 'cape', 'hood', 'babySling'].includes(form) ? 0.2 : 0.12
          const box = person.geometry.boundingBox!.clone().expandByScalar(off * H)
          const g = gltfGarment(asset, person, { ...PEOPLE_DRESS.zulu.male.adult[0], form, wear } as DressLayer)!
          g.computeBoundingBox()
          const gb = g.boundingBox!
          if (!box.containsBox(gb)) fails.push(`${n} ${sex} ${age} ${build}: outside the body's box`)
          // the hung, grounded body under it: a garment never floats below the soles
          if (gb.min.y < -0.02 * H) fails.push(`${n} ${sex} ${age} ${build}: ${(gb.min.y / H).toFixed(3)} H below the ground`)
        }
        // a robe reaches from its collar under the chin to the shins of this very body
        const robe = gltfGarment(asset, person, { ...PEOPLE_DRESS.zulu.male.adult[0], form: 'robe', wear: 'chest' } as DressLayer)!
        robe.computeBoundingBox()
        expect(robe.boundingBox!.max.y, `${sex} ${age} ${build}`).toBeGreaterThan(person.p.shoulderY - 0.08 * H)
        expect(robe.boundingBox!.max.y, `${sex} ${age} ${build}`).toBeLessThan(person.p.chinY + 0.03 * H)
        expect(robe.boundingBox!.min.y, `${sex} ${age} ${build}`).toBeLessThan(person.p.kneeY)
      }
    }
    expect(fails).toEqual([])
  })

  it('an outer garment hides and pushes the inner one it covers; worn alone the inner one is whole', () => {
    const person = gltfPerson(asset, 'male', 'elder')
    const base = PEOPLE_DRESS.hausa.male.elder[0]
    const robe = { ...base, slot: 'torso' as const, form: 'robe' as const, wear: 'chest' as const }
    const cloak = { ...base, slot: 'shoulder' as const, form: 'cloak' as const, wear: 'bothShoulders' as const }
    const bodyCount = person.geometry.getAttribute('position').count
    const robeCount = asset.geometries['g-robe-chest'].getAttribute('position').count
    const pushOnRobe = (g: THREE.BufferGeometry) => (g.getAttribute(GARMENT_PUSH_ATTRIBUTE).array as Float32Array).slice(bodyCount, bodyCount + robeCount).filter((x) => x > 0).length
    const alone = gltfFigureGeometry(asset, person, [robe], '#5c3317', null, 16)
    const under = gltfFigureGeometry(asset, person, [robe, cloak], '#5c3317', null, 16)
    expect(pushOnRobe(alone)).toBe(0)
    expect(pushOnRobe(under)).toBeGreaterThan(0)
    // and the body under the robe loses triangles it hides
    expect(alone.index!.count).toBeLessThan(person.geometry.index!.count + asset.geometries['g-robe-chest'].index!.count)
  })

  it('the infant in a baby sling is painted in its skin, the bundle in the mantle', () => {
    const person = gltfPerson(asset, 'female', 'adult')
    const mantle = PEOPLE_DRESS.san.female.adult[0]
    const g = gltfGarment(asset, person, { ...mantle, slot: 'shoulder', form: 'babySling', wear: 'bothShoulders', colour: '#c09060' })!
    const col = g.getAttribute('color')
    const infant = new THREE.Color(INFANT_SKIN)
    let head = 0
    for (let k = 0; k < col.count; k++) if (Math.abs(col.getX(k) - infant.r) < 1e-4 && Math.abs(col.getY(k) - infant.g) < 1e-4) head++
    expect(head).toBeGreaterThan(10)
    expect(head).toBeLessThan(col.count * 0.5)
    // no garment pattern reaches the skin: second colour and surface are plain
    const col2 = g.getAttribute(SECOND_COLOUR_ATTRIBUTE)
    const surf = g.getAttribute(SURFACE_ATTRIBUTE)
    for (let k = 0; k < col.count; k++) {
      if (Math.abs(col.getX(k) - infant.r) >= 1e-4 || Math.abs(col.getY(k) - infant.g) >= 1e-4) continue
      expect(col2.getX(k)).toBeCloseTo(infant.r, 4)
      expect([surf.getX(k), surf.getY(k), surf.getZ(k), surf.getW(k)]).toEqual(PLAIN_SURFACE.map((v) => expect.closeTo(v, 4)))
    }
  })
})

describe('which level draws the glTF body', () => {
  it('medium and high draw it; low keeps the primitive figure and loads nothing', () => {
    expect(QUALITY_PRESETS.low.figureGltfBody).toBe(false)
    expect(QUALITY_PRESETS.medium.figureGltfBody).toBe(true)
    expect(QUALITY_PRESETS.high.figureGltfBody).toBe(true)
    // never on a level that draws the primitive figure
    for (const l of DETAIL_LEVELS) if (!QUALITY_PRESETS[l].figureBodySegments) expect(QUALITY_PRESETS[l].figureGltfBody).toBe(false)
  })
})
