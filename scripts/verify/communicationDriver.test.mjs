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
it('closes the journal through its button even when a text input owns focus', async () => {
  const clicks = []
  let readIndex = 0
  const driver = communicationDriver({
    evaluate: async () => [null, true][readIndex++],
    locator: (selector) => ({ click: async () => clicks.push(selector) }),
  })
  await driver.close()
  expect(clicks).toEqual(['.journal header button'])
})
it('keeps an unexpected gameplay interruption as a failed continuous run', async () => {
  const driver = communicationDriver({ evaluate: async () => 'defeat' })
  await expect(driver.close()).rejects.toThrow('Unexpected modal: defeat')
})
it('halves the turn press after swinging past the subject', async () => {
  const holds = []
  let yaw = 0.5
  const driver = communicationDriver({
    evaluate: async () => ({ x: 0, z: 0, yaw }),
    keyboard: { down: async () => {}, up: async () => {} },
    // Each press turns 2.5x the ideal amount, as a slow frame would; unhalved it diverges.
    waitForTimeout: async (ms) => { holds.push(ms); yaw += (yaw > 0 ? -1 : 1) * 2.5 * ms / 700 * 2.2 },
  })
  await driver.aim({ x: 0, z: -1 })
  expect(holds.length).toBeLessThan(20)
  expect(holds.at(-1)).toBeLessThan(holds[0])
})
it('finishes the aim with mouse-look when a turn key overshoots by a whole frame', async () => {
  let yaw = 0.3, pitch = 0, presses = 0, cursor = { x: 30, y: 200 }
  const driver = communicationDriver({
    evaluate: async (fn) => String(fn).includes('__driverCursor') ? cursor : { x: 0, z: 0, yaw },
    keyboard: { down: async () => {}, up: async () => {} },
    // Every key press turns one whole 0.146 rad frame however short it is held.
    waitForTimeout: async () => { presses++; yaw += yaw > 0 ? -0.146 : 0.146 },
    mouse: { move: async (x, y) => { yaw -= (x - cursor.x) * 0.0011; pitch -= (y - cursor.y) * 0.0011; cursor = { x, y } } },
  })
  await driver.aim({ x: 0, z: -1 })
  expect(Math.abs(yaw)).toBeLessThan(0.065)
  expect(pitch).toBe(0)
  expect(presses).toBe(0)
})
