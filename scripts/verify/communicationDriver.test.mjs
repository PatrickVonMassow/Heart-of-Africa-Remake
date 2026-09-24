import { it, expect } from 'vitest'
import { turnDelta, travelKeys, communicationDriver } from './communicationDriver.mjs'
it('turns through the shortest angle and maps world axes to ordinary travel keys', () => {
  expect(turnDelta(0, { x: 0, z: 0 }, { x: 0, z: -1 })).toBeCloseTo(0)
  expect(turnDelta(Math.PI - 0.01, { x: 0, z: 0 }, { x: 0, z: 1 })).toBeCloseTo(0.01)
  expect(travelKeys({ x: 0, z: 0 }, { x: 1, z: -1 })).toEqual(['KeyD', 'KeyW'])
  expect(travelKeys({ x: 1, z: 1 }, { x: 0, z: 2 })).toEqual(['KeyA', 'KeyS'])
  expect(travelKeys({ x: 0, z: 0 }, { x: 0.05, z: 0 })).toEqual([])
})
it('releases every held movement key when a route fails', async () => {
  const events = []
  const driver = communicationDriver({ keyboard: {
    down: async (k) => events.push(['down', k]), up: async (k) => events.push(['up', k]),
  } })
  await expect(driver.held(['KeyW', 'KeyD'], async () => { throw new Error('blocked') })).rejects.toThrow('blocked')
  expect(events).toEqual([['down', 'KeyW'], ['down', 'KeyD'], ['up', 'KeyW'], ['up', 'KeyD']])
})
