// @vitest-environment node
// The body safety net of the clothing rule (design.md; work-order "covered
// upper body and hip layer", final state 5): the glTF body's bust is stylised
// and its breast morph capped, the pelvis smooth. Measured on the shipped
// villager.glb, which carries no texture, normal or colour map (one flat
// material), so the geometry is the only place such detail could live.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { VILLAGER_ASSET, VILLAGER_GLTF } from '../config/balance'
import { AGE_GROUPS, SEXES } from '../systems/appearance'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import { bakeMorphs, inPeakRegion, morphInfluences, peakSharpness, vertexRings } from './villagerBody'
import { bakePose, gltfPerson, hungHeads } from './villagerFigureBody'

const glb = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
let asset: VillagerAsset

beforeAll(async () => {
  asset = await parseVillager(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength))
})

const people = () => AGE_GROUPS.flatMap((age) => SEXES.map((sex) => ({ sex, age })))
const cap = VILLAGER_GLTF.trunkPeakSharpnessMax

/** The grounded body exactly as gltfPerson builds it, without the safety net. */
function rawBody(sex: (typeof SEXES)[number], age: (typeof AGE_GROUPS)[number]) {
  const person = gltfPerson(asset, sex, age)
  const { rest0, hang, sole, scale } = person.frame
  const w = morphInfluences(sex, age)
  const g = bakePose(bakeMorphs(asset.geometries.body, w), rest0, hungHeads(asset, rest0, hang), hang)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  for (let k = 0; k < pos.count; k++) pos.setXYZ(k, pos.getX(k) * scale, (pos.getY(k) - sole) * scale, pos.getZ(k) * scale)
  g.deleteAttribute('normal')
  g.computeVertexNormals()
  return { raw: g, person }
}

/** The sharpest peak inside the safety net's regions, and where it sits. */
function sharpestPeak(g: THREE.BufferGeometry, child = false) {
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const nor = g.getAttribute('normal') as THREE.BufferAttribute
  const rings = vertexRings(g)
  g.computeBoundingBox()
  const y0 = g.boundingBox!.min.y
  const h = g.boundingBox!.max.y - y0
  const P = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i)
  let best = { s: -Infinity, y: 0 }
  for (let i = 0; i < pos.count; i++) {
    const n = new THREE.Vector3().fromBufferAttribute(nor, i).normalize()
    if (rings[i].size < 3 || !inPeakRegion(P(i), n, y0, h, child)) continue
    const s = peakSharpness(P(i), n, [...rings[i]].map(P))
    if (s > best.s) best = { s, y: (P(i).y - y0) / h }
  }
  return best
}

/** The sharpest peak on the front of the pelvis midline, selected by the
 *  body's own joints rather than by the safety net's region predicate (a test
 *  through that predicate would lose the pelvis with it). */
function sharpestPelvisFront(g: THREE.BufferGeometry, p: { hipY: number; hipX: number; stature: number }) {
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const nor = g.getAttribute('normal') as THREE.BufferAttribute
  const rings = vertexRings(g)
  const H = p.stature
  const P = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i)
  let best = -Infinity
  for (let i = 0; i < pos.count; i++) {
    const v = P(i)
    if (rings[i].size < 3 || v.z <= 0 || Math.abs(v.x) > p.hipX * 0.6 || v.y < p.hipY - 0.1 * H || v.y > p.hipY + 0.03 * H) continue
    best = Math.max(best, peakSharpness(v, new THREE.Vector3().fromBufferAttribute(nor, i).normalize(), [...rings[i]].map(P)))
  }
  return best
}

describe('the body safety net', () => {
  it('ships no texture, normal or colour map that could carry nipple detail', () => {
    const len = glb.readUInt32LE(12)
    const json = JSON.parse(glb.subarray(20, 20 + len).toString('utf8'))
    expect(json.images ?? []).toHaveLength(0)
    expect(json.textures ?? []).toHaveLength(0)
    for (const m of json.materials ?? []) {
      expect(m.normalTexture).toBeUndefined()
      expect(m.pbrMetallicRoughness?.baseColorTexture).toBeUndefined()
    }
  })

  it('caps the breast morph the pipeline builds with', () => {
    for (const age of AGE_GROUPS) expect(VILLAGER_ASSET.breastCup[age]).toBeLessThanOrEqual(VILLAGER_ASSET.breastCupMax)
    expect(VILLAGER_ASSET.breastCupMax).toBeLessThan(1)
    expect(readFileSync(resolve(__dirname, '../../scripts/villager/body.py'), 'utf8')).toContain("min(A['breastCup'][age], A['breastCupMax'])")
  })

  it('the asset itself peaks the women’s breast apex to a point — the reason for the net', () => {
    // Measured 07.10.2026: ≈ 0.40 at the apex of every woman's breast, against
    // ≤ 0.23 anywhere on a man's chest front.
    for (const age of ['youth', 'adult', 'elder'] as const) expect(sharpestPeak(rawBody('female', age).raw).s).toBeGreaterThan(0.35)
  })

  it('leaves no point on any chest front or child pelvis midline sharper than the cap', () => {
    for (const { sex, age } of people()) {
      // the clamp works on fixed normals and the normals are recomputed after,
      // so the measure may land a little above the cap
      expect(sharpestPeak(gltfPerson(asset, sex, age).geometry, age === 'child').s, `${sex} ${age}`).toBeLessThan(cap * 1.2)
    }
  })

  it('blunts a child’s sharp crotch apex below the cap, found by the body’s own joints', () => {
    // Measured 08.10.2026: 0.32-0.35 raw on the children, 0.22-0.23 after.
    for (const sex of SEXES) {
      const { raw, person } = rawBody(sex, 'child')
      const before = sharpestPelvisFront(raw, person.p)
      const after = sharpestPelvisFront(person.geometry, person.p)
      expect(before, `${sex} raw`).toBeGreaterThan(0.3)
      expect(after, sex).toBeLessThan(cap * 1.2)
      expect(before - after, sex).toBeGreaterThan(0.08)
    }
  })

  it('moves the body only inward and by at most a centimetre or so, keeping the bust a bust', () => {
    for (const { sex, age } of people()) {
      const { raw, person } = rawBody(sex, age)
      const a = raw.getAttribute('position') as THREE.BufferAttribute
      const b = person.geometry.getAttribute('position') as THREE.BufferAttribute
      const n = raw.getAttribute('normal') as THREE.BufferAttribute
      const d = new THREE.Vector3()
      const nn = new THREE.Vector3()
      for (let k = 0; k < a.count; k++) {
        d.set(b.getX(k) - a.getX(k), b.getY(k) - a.getY(k), b.getZ(k) - a.getZ(k))
        // at most ≈ 1 % of the stature (a child's crotch apex moves most)
        expect(d.length()).toBeLessThan(0.01 * person.p.stature)
        expect(d.dot(nn.fromBufferAttribute(n, k).normalize())).toBeLessThan(1e-6)
      }
    }
    // the women's chest still stands out over the belly: stylised, not flattened
    const front = (g: THREE.BufferGeometry, y0: number, y1: number, h: number) => {
      const p = g.getAttribute('position') as THREE.BufferAttribute
      let z = -Infinity
      for (let k = 0; k < p.count; k++) if (p.getY(k) > y0 * h && p.getY(k) < y1 * h && Math.abs(p.getX(k)) < 0.12 * h) z = Math.max(z, p.getZ(k))
      return z
    }
    const { geometry, p } = gltfPerson(asset, 'female', 'adult')
    expect(front(geometry, 0.66, 0.8, p.stature) - front(geometry, 0.5, 0.62, p.stature)).toBeGreaterThan(0.025 * p.stature)
  })
})
