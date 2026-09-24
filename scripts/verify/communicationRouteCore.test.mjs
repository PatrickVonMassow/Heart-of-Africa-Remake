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
