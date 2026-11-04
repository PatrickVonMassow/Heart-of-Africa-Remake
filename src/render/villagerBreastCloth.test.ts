// @vitest-environment node
// The breast cloth covers the bust down to the waist (work-order point 1477):
// measured on the shipped villager.glb, a woman's breast cloth reaches from
// above the bust to the girdle where a skirt begins, and from the front the
// cloth — not the skin under the worn cover mask and push — is what a ray
// meets over that whole span, the upper bust above the peak included. Cause of the narrow band: the builder hemmed it
// at the chest bone's head (scripts/villager/garments.py breast_cloth_span).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { VILLAGER_ASSET } from '../config/balance'
import type { DressLayer } from '../systems/appearance'
import { tidy } from './figureBody'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import { garmentMeshName, gltfGarment, gltfPerson } from './villagerFigureBody'
import { applyGarmentMask, GARMENT_PUSH_ATTRIBUTE } from './villagerGarmentMask'

let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

const layer = (form: string, wear: string, slot: string) => ({ form, wear, slot, colour: '#ffffff', material: 'cotton' }) as unknown as DressLayer
const CLOTH = layer('breastCloth', 'chest', 'torso')
const SKIRT = layer('skirtKnee', 'waist', 'hip')

/** The body under the worn garments' cover mask, its push applied as the vertex shader applies it. */
function maskedBody(person: ReturnType<typeof gltfPerson>, worn: string[]): THREE.BufferGeometry {
  const depth = VILLAGER_ASSET.garmentMaskPush * person.frame.scale
  const g = applyGarmentMask(tidy(person.geometry.clone()), person.cover, asset.garmentMask, worn, depth)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const nor = g.getAttribute('normal') as THREE.BufferAttribute
  const push = g.getAttribute(GARMENT_PUSH_ATTRIBUTE) as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const d = push.getX(i)
    pos.setXYZ(i, pos.getX(i) - nor.getX(i) * d, pos.getY(i) - nor.getY(i) * d, pos.getZ(i) - nor.getZ(i) * d)
  }
  return g
}

describe('the breast cloth on a woman', () => {
  for (const build of [-0.6, 0, 0.6]) {
    it(`covers the bust down to the waist (build ${build})`, () => {
      const person = gltfPerson(asset, 'female', 'adult', build)
      const H = person.p.stature
      const y = (b: string) => person.rest[asset.bones.indexOf(b) * 3 + 1]
      const girdle = y('hips') + 0.06 * H
      const cloth = gltfGarment(asset, person, CLOTH)!
      expect(cloth).not.toBeNull()
      cloth.computeBoundingBox()
      // the hem reaches the girdle (garments.breast_cloth_span: girdle − 0.01 H)
      expect(cloth.boundingBox!.min.y).toBeLessThan(girdle)
      const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
      const body = new THREE.Mesh(maskedBody(person, [CLOTH, SKIRT].map(garmentMeshName)), mat)
      const cm = new THREE.Mesh(cloth, mat)
      const front = (x: number, h: number, m: THREE.Mesh) => {
        const hit = new THREE.Raycaster(new THREE.Vector3(x, h, 2), new THREE.Vector3(0, 0, -1)).intersectObject(m, false)[0]
        return hit ? 2 - hit.distance : -Infinity
      }
      // the bust's peak: the body's most forward height over a breast, chest to shoulder
      let peak = girdle
      for (let h = girdle; h < y('upperArm.L'); h += 0.0025 * H) if (front(0.05, h, body) > front(0.05, peak, body)) peak = h
      const bare: string[] = []
      // up to 0.02 H over the peak: the upper bust, which the hung rest's
      // forward-tilted chest bared under a top at chestTop
      for (let h = girdle + 0.005 * H; h <= peak + 0.02 * H; h += 0.005 * H) {
        for (const x of [-0.05, 0, 0.05]) if (!(front(x, h, cm) > front(x, h, body))) bare.push(`${(h / H).toFixed(3)} H, x ${x}`)
      }
      expect(bare).toEqual([])
    })
  }
})
