// @vitest-environment node
// The driven loin flap and girdle tails in the shipped file (stage-3 plan
// sections 3.2, 3.3 and 3.12, scripts/villager/driven.py): mesh identity,
// the per-form rest contract (zero tilt reproduces the built panel), row 0
// on the drawn band, and the driver posing the panel at rest unchanged.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { PEOPLE_DRESS, type DressLayer } from '../systems/appearance'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import { anchorPoints, offsetPoint } from './villagerDriven'
import { applyGarmentMask } from './villagerGarmentMask'
import { createGltfSkeleton, drivenFigure, finishDrivenPanel, gltfFigureGeometry, gltfShellParts, gltfLayerGeometry, gltfPerson, isShellLayer } from './villagerFigureBody'
import { carriesColumnWeight, ColumnDriver, columnRig } from './villagerSkirtDriver'

let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

const FORMS = ['loinFlap', 'girdleTails'] as const
const base = PEOPLE_DRESS.hausa.male.adult[0]
const layer = (form: string): DressLayer => ({ ...base, slot: 'hip', form, wear: 'waist' }) as DressLayer
const PEOPLE = [
  ['male', 'adult'],
  ['female', 'child'],
] as const

/** Every panel vertex skinned by the skeleton's current bone matrices. */
function skinned(skeleton: THREE.Skeleton, pos: number[], idx: number[], w: number[]): number[] {
  skeleton.bones[0].updateMatrixWorld(true)
  skeleton.update()
  const m = new THREE.Matrix4()
  const p = new THREE.Vector3()
  const out: number[] = []
  for (let v = 0; v < pos.length / 3; v++) {
    const acc = new THREE.Vector3()
    for (let c = 0; c < 4; c++) {
      const wt = w[v * 4 + c]
      if (!wt) continue
      m.fromArray(skeleton.boneMatrices!, idx[v * 4 + c] * 16)
      acc.addScaledVector(p.set(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]).applyMatrix4(m), wt)
    }
    out.push(acc.x, acc.y, acc.z)
  }
  return out
}

describe('the driven garments in the file', () => {
  it('ships each form as a driven panel mesh and a band shell recipe, never as a legacy garment', () => {
    for (const form of FORMS) {
      const rec = asset.driven[form]
      expect(rec, form).toBeDefined()
      expect(rec.panel).toBe(`g-${form}-waist`)
      expect(rec.band).toBe(`g-${form}-waist.band`)
      expect(asset.parts[rec.panel]).toBe('driven')
      expect(asset.geometries[rec.panel]).toBeDefined()
      expect(asset.shells!.garments[rec.band].rank).toBe(1)
      expect(asset.geometries[rec.band]).toBeUndefined()
      // the layer stays the panel's name: outfits and the lineup are unchanged
      expect(isShellLayer(asset, layer(form))).toBe(false)
      expect(asset.garmentMask).not.toContain(rec.panel)
      expect(rec.anchors).toHaveLength(asset.columns!.count)
      expect(rec.src.length).toBe(asset.geometries[rec.panel].getAttribute('position').count)
    }
    // two driven bands join the four stage-1 shells
    expect(asset.shells!.bits).toHaveLength(6)
  })

  for (const form of FORMS)
    for (const [sex, age] of PEOPLE)
      it(`${form} on a ${sex} ${age}: zero tilt reproduces the built panel, row 0 lies on the drawn band`, () => {
        const person = gltfPerson(asset, sex, age, 0)
        const layers = [layer(form)]
        const dv = drivenFigure(asset, person, layers)
        expect(dv).not.toBeNull()
        const rec = dv!.rec
        const body = { geometry: person.geometry, rest: person.rest, region: person.region, scale: person.frame.scale }
        // the upper heads on the hung anchors, the knee pivots below them
        anchorPoints(rec, body).forEach((a, k) => {
          const u = asset.bones.indexOf(asset.columns!.bones.upper[k])
          const l = asset.bones.indexOf(asset.columns!.bones.lower[k])
          for (let c = 0; c < 3; c++) expect(Math.abs(dv!.rest[u * 3 + c] - a[c])).toBeLessThan(1e-4)
          expect(Math.abs(dv!.rest[l * 3] - a[0])).toBeLessThan(1e-4)
          expect(Math.abs(dv!.rest[l * 3 + 1] - person.rest[l * 3 + 1])).toBeLessThan(1e-6)
        })
        // row 0 on the band as the figure draws it: its full-offset row, from the built shell geometry
        const band = gltfShellParts(asset, person, [], applyGarmentMask(person.geometry.clone(), person.cover, asset.garmentMask, [rec.panel], 0), [rec.panel], [{ l: layers[0], name: rec.band }]).find((x) => x.name === rec.band)
        expect(band, rec.band).toBeDefined()
        const top = Math.max(...band!.built.off)
        const drawnAt = new Map<number, number>()
        band!.built.src.forEach((s, k) => {
          if (Math.abs(band!.built.off[k] - top) < 1e-9) drawnAt.set(s, k)
        })
        const bp = band!.geometry.getAttribute('position')
        let met = 0
        rec.src.forEach((s, k) => {
          const b = s < 0 ? undefined : drawnAt.get(s)
          if (b === undefined) return
          met++
          const d = Math.hypot(bp.getX(b) - dv!.form.panel.pos[k * 3], bp.getY(b) - dv!.form.panel.pos[k * 3 + 1], bp.getZ(b) - dv!.form.panel.pos[k * 3 + 2])
          expect(d, `row-0 vertex ${k}`).toBeLessThan(1e-6)
        })
        expect(met).toBe(rec.src.filter((s) => s >= 0).length)
        // row 0 from the recipe function
        const P = dv!.form.panel.pos
        rec.src.forEach((s, k) => {
          if (s < 0) return
          const o = offsetPoint(rec, body, s)
          for (let c = 0; c < 3; c++) expect(Math.abs(P[k * 3 + c] - o[c])).toBeLessThan(1e-6)
        })
        // every column rotation at identity: the skinned panel is its rest shape
        const { skeleton } = createGltfSkeleton(asset, dv!.rest)
        const rest = skinned(skeleton, P, dv!.form.panel.idx, dv!.form.panel.w)
        let worst = 0
        for (let i = 0; i < P.length; i++) worst = Math.max(worst, Math.abs(rest[i] - P[i]))
        expect(worst).toBeLessThan(1e-4)
        // the figure carries the panel and its band; the driver runs for it
        const geo = gltfFigureGeometry(asset, person, layers, '#5c3317', null, 0)
        expect(carriesColumnWeight(asset, geo)).toBe(true)
        const plain = gltfFigureGeometry(asset, person, [], '#5c3317', null, 0)
        const panelCount = gltfLayerGeometry(asset, person, layers[0])!.getAttribute('position').count
        expect(geo.getAttribute('position').count).toBeGreaterThan(plain.getAttribute('position').count + panelCount)
        // the driver standing at rest: its anchors move no column head off row 0
        const driver = new ColumnDriver(columnRig(asset, { ...person, rest: dv!.rest, columnAnkles: dv!.columnAnkles }, dv!.form))
        driver.stepFrame(skeleton.bones, 1 / 30, 1)
        for (const b of skeleton.bones) expect(b.scale.toArray()).toEqual([1, 1, 1])
        const posed = skinned(skeleton, P, dv!.form.panel.idx, dv!.form.panel.w)
        let moved = 0
        rec.src.forEach((s, k) => {
          if (s >= 0) for (let c = 0; c < 3; c++) moved = Math.max(moved, Math.abs(posed[k * 3 + c] - P[k * 3 + c]))
        })
        // row 0 rides the body alone: untouched by any column
        expect(moved).toBeLessThan(1e-5)
      })

  it('the finished panel carries the normals of its moved surface (row 0 and the clearance move vertices)', () => {
    for (const form of FORMS) {
      for (const [sex, age] of PEOPLE) {
        const person = gltfPerson(asset, sex, age, 0)
        const rec = asset.driven[form]
        const g = finishDrivenPanel(asset, person, rec, gltfLayerGeometry(asset, person, layer(form))!.clone(), [])
        const pos = g.getAttribute('position')
        const nor = g.getAttribute('normal')
        const idx = g.getIndex()!
        // the area-weighted face normals round each vertex, from the finished positions
        const acc = Array.from({ length: pos.count }, () => new THREE.Vector3())
        const a = new THREE.Vector3()
        const b = new THREE.Vector3()
        const c = new THREE.Vector3()
        for (let t = 0; t < idx.count / 3; t++) {
          const ids = [idx.getX(t * 3), idx.getX(t * 3 + 1), idx.getX(t * 3 + 2)]
          a.fromBufferAttribute(pos, ids[0])
          b.fromBufferAttribute(pos, ids[1])
          c.fromBufferAttribute(pos, ids[2])
          const f = c.clone().sub(b).cross(a.clone().sub(b))
          for (const v of ids) acc[v].add(f)
        }
        let worst = 0
        const n = new THREE.Vector3()
        acc.forEach((m, v) => {
          if (m.lengthSq() < 1e-20) return
          n.fromBufferAttribute(nor, v)
          worst = Math.max(worst, n.angleTo(m.normalize()))
        })
        expect(worst, `${form} ${sex} ${age}`).toBeLessThan(1e-3)
      }
    }
  })
})
