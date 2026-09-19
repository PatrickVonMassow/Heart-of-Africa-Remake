import { beforeAll, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three/webgpu'
import { buildLayout } from './layout'
import { setupGeodata } from '../../test/geodata'
import { standingClear } from './collision'
import { EYE_HEIGHT } from './roofClearance'
import { digFurnitureFootprints } from './digSiteAppearance'
import { digLocalToWorld, spoilOffset, placeGroundHeight } from './placeGround'
// @ts-expect-error The verification driver is plain JS, also loaded by Node.
import { DIG_PICTURE, digPictureView } from '../../../scripts/verify/digSitePicture.mjs'

beforeAll(setupGeodata)
it('keeps the picture fixture walkable, distinct, and in a standing camera projection', () => {
  const l = buildLayout(DIG_PICTURE.placeId, DIG_PICTURE.seed)
  expect(l.digSites.map((s) => s.kind)).toEqual(['pit', 'patch'])
  const view = digPictureView(l.digSites)
  expect(view).not.toBeNull()
  expect(standingClear(l.colliders, view.x, view.z, 0.4)).toBe(true)
  const camera = new PerspectiveCamera(50, 1440 / 900, 0.1, 2000)
  camera.position.set(view.x, EYE_HEIGHT, view.z)
  camera.rotation.set(view.pitch, view.yaw, 0, 'YXZ')
  camera.updateMatrixWorld(true)
  for (const site of l.digSites) {
    const features = [{ x: 0, z: 0, radius: 1.3 }, ...digFurnitureFootprints(site.kind)]
    for (const f of features) {
      const p = digLocalToWorld(site, f.x, f.z)
      for (let i = 0; i <= 20; i++) {
        const u = i / 20
        expect(standingClear(l.colliders, view.x + (p.x - view.x) * u, view.z + (p.z - view.z) * u, 0.05)).toBe(true)
      }
      for (const dx of [-f.radius, f.radius]) for (const dz of [-f.radius, f.radius]) {
        const pt = digLocalToWorld(site, f.x + dx, f.z + dz)
        const projected = new Vector3(pt.x, 0.05, pt.z).project(camera)
        expect(Math.abs(projected.x)).toBeLessThan(0.94)
        expect(Math.abs(projected.y)).toBeLessThan(0.94)
      }
    }
  }
  const patch = l.digSites[1]
  const ground = { bank: l.bank, sites: l.digSites, progress: l.digSites.map(() => ({ dug: 18, strikes: 12, completed: true })), rocks: l.rocks }
  for (let i = 0; i <= 32; i++) {
    const p = digLocalToWorld(patch, spoilOffset(patch), -1.6 + i / 10)
    expect(standingClear(l.colliders, p.x, p.z, 0.3)).toBe(true)
    const height = placeGroundHeight(ground, p.x, p.z)
    if (i === 0 || i === 32) expect(height).toBe(0)
    if (i === 16) expect(height).toBeCloseTo(0.54)
    if (height > 0.27) {
      for (const y of [height, height + 1.5]) {
        const projected = new Vector3(p.x, y, p.z).project(camera)
        expect(Math.abs(projected.x)).toBeLessThan(0.94)
        expect(Math.abs(projected.y)).toBeLessThan(0.94)
      }
    }
  }
})
