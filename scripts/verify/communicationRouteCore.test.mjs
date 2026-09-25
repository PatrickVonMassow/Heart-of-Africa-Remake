import { it, expect } from 'vitest'
import { riverBankRoute } from './communicationRouteCore.mjs'
it('follows either direction along the same bank instead of cutting a bend', () => {
  const axis = [{ lat: 0, lon: 0 }, { lat: 1, lon: 0 }, { lat: 1, lon: 1 }]
  const down = riverBankRoute(axis, { lat: 0, lon: 0.2 }, { lat: 1, lon: 1.2 })
  expect(down).toHaveLength(3)
  expect(down[0]).toEqual({ lat: 0, lon: 0.2 })
  expect(down[1].lat).toBeLessThan(1)
  const up = riverBankRoute(axis, { lat: 0.8, lon: 1 }, { lat: 0, lon: 0.2 })
  expect(up).toEqual(down.toReversed())
  expect(riverBankRoute(axis, { lat: 0, lon: -0.2 }, { lat: 1, lon: 1 })[0].lon).toBe(-0.2)
  expect(() => riverBankRoute([], {}, {})).toThrow()
  expect(() => riverBankRoute([{ lat: 0, lon: 0 }, { lat: 0, lon: 0 }], { lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toThrow()
})

it('takes route frames at separated places reached along the leg', async () => {
  const { routeFrameProgress } = await import('./communicationRouteCore.mjs')
  const s = { distance: 0, next: 1, spacing: 5, frames: 0 }
  expect(routeFrameProgress(s, { x: 0, z: 0 })).toBe(false)
  for (let i = 0; i < 10; i++) expect(routeFrameProgress(s, { x: 0, z: 0 })).toBe(false)
  const shots = []
  for (let x = 1; x <= 20; x++) if (routeFrameProgress(s, { x, z: 0 })) shots.push(x)
  expect(shots).toEqual([1, 6, 11])
})

it('retries only when an obstruction moves or leaves, ignoring small idle motion', async () => {
  const { positionsMoved } = await import('./communicationRouteCore.mjs')
  const before = [{ x: 1, z: 2 }]
  expect(positionsMoved(before, before)).toBe(false)
  expect(positionsMoved(before, [{ x: 1.02, z: 2 }])).toBe(false)
  expect(positionsMoved(before, [{ x: 1.4, z: 2 }])).toBe(true)
  expect(positionsMoved(before, [])).toBe(true)
  expect(positionsMoved([], [])).toBe(false)
})
