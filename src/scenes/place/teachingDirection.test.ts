import { beforeAll, expect, it } from 'vitest'
import { Object3D, Vector3 } from 'three/webgpu'
import { setupGeodata } from '../../test/geodata'
import { buildLayout } from './layout'
import { wordToward } from './bankGame'
import { warpSign } from './loomWork'
import { HELPER_SIDE_OFFSET } from './loom'

beforeAll(setupGeodata)
it.each([1, 42, 99])('aligns bank runs and the drawn loom helper with the river current (seed %i)', (seed) => {
  const { bank, playRocks, loom } = buildLayout('bambara-village', seed)
  expect(bank && playRocks && loom).toBeTruthy()
  const b = bank!, l = loom!, rocks = playRocks!
  const downstream = (x: number, z: number) => x * b.fx + z * b.fz
  const drawn = new Object3D()
  drawn.position.set(l.seat.x, 0, l.seat.z)
  drawn.rotation.y = Math.atan2(l.fx, l.fz)
  drawn.updateMatrixWorld()
  const waterSide = l.ax * l.fz - l.az * l.fx >= 0 ? 1 : -1
  for (const end of ['upstream', 'downstream'] as const) {
    const sign = warpSign(wordToward(end) as 'UPSTREAM' | 'DOWNSTREAM')
    const other = end === 'upstream' ? 'downstream' : 'upstream'
    expect(downstream(rocks[end].x - rocks[other].x, rocks[end].z - rocks[other].z) * sign).toBeGreaterThan(0)
    expect(downstream(l.tend[end].x - l.helperHome.x, l.tend[end].z - l.helperHome.z) * sign).toBeGreaterThan(0)
    const actual = drawn.localToWorld(new Vector3(waterSide * HELPER_SIDE_OFFSET, 0, sign * 2))
    expect(downstream(actual.x - l.helperHome.x, actual.z - l.helperHome.z)).toBeCloseTo(sign * 2)
  }
})
