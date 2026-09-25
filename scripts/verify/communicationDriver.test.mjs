import { it, expect } from 'vitest'
import { runInNewContext } from 'node:vm'
import { turnDelta, travelKeys, communicationDriver, faceWalkingChief } from './communicationDriver.mjs'
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
    evaluate: async (fn) => String(fn).includes('journalOpen') ? false : ({ x: 0, z: 0, yaw }),
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
    evaluate: async (fn) => String(fn).includes('journalOpen') ? false : String(fn).includes('__driverCursor') ? cursor : { x: 0, z: 0, yaw },
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

it.each([false, true])('aims at a declared subject height with invertLook=%s before the shutter', async (invertLook) => {
  let pitch = 0, cursor = { x: 720, y: 450 }
  const d = communicationDriver({
    evaluate: async (fn) => String(fn).includes('journalOpen') ? false : String(fn).includes('__driverCursor') ? cursor : { x: 0, z: 0, yaw: 0, pitch, eyeY: 1.7, invertLook },
    mouse: { move: async (x, y) => { pitch += (invertLook ? 1 : -1) * (y - cursor.y) * 0.0011; cursor = { x, y } } },
  })
  await d.aim({ x: 0, y: 0.8, z: -3 })
  expect(pitch).toBeCloseTo(Math.atan2(-0.9, 3), 2)
})

function pitchPage({ invertLook = false, cursorY = 450, sensitivity = 0.0011, frozen = false } = {}) {
  const player = { x: 0, z: 0, yaw: 0.031, pitch: 0 }
  const state = { journalOpen: false }
  const window = {
    __placePlayer: player, __placeCamera: { position: { y: 1.7 } },
    __game: { getState: () => state }, __ui: { getState: () => ({ invertLook }) },
    __balance: { mouseSensitivity: sensitivity }, __driverCursor: { x: 720, y: cursorY },
  }
  const moves = [], keys = []
  const evaluate = async (fn, arg) => runInNewContext(`(${fn.toString()})(arg)`, { window, arg })
  const page = {
    evaluate,
    waitForFunction: async (fn, arg) => expect(await evaluate(fn, arg)).toBe(true),
    keyboard: { press: async (key) => {
      keys.push(key)
      if (key === 'Tab') state.journalOpen = !state.journalOpen
      else if (key === 'Escape') state.journalOpen = false
      else throw new Error(`Unexpected aim key: ${key}`)
    } },
    mouse: { move: async (x, y, { steps = 1 } = {}) => {
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThan(900)
      moves.push({ x, y, journalOpen: state.journalOpen })
      const start = window.__driverCursor
      for (let step = 1; step <= steps; step++) {
        const next = { x: start.x + (x - start.x) * step / steps, y: start.y + (y - start.y) * step / steps }
        if (!state.journalOpen && !frozen) {
          player.yaw -= (next.x - window.__driverCursor.x) * sensitivity
          player.pitch += (invertLook ? 1 : -1) * (next.y - window.__driverCursor.y) * sensitivity
        }
        window.__driverCursor = next
      }
    } },
  }
  return { page, player, state, moves, keys, window }
}

it('backs away from the door and aims at the chief who moved during the retreat', async () => {
  const fake = pitchPage()
  const door = [0, -0.2]
  const chief = fake.window.__chief = { x: door[0], z: door[1] }
  const held = new Set(), movement = []
  fake.page.keyboard.down = async (key) => { held.add(key); movement.push(['down', key]) }
  fake.page.keyboard.up = async (key) => { held.delete(key); movement.push(['up', key]) }
  fake.page.waitForFunction = async (fn, arg) => {
    for (let tick = 0; tick < 100; tick++) {
      if (await fake.page.evaluate(fn, arg)) return
      expect([...held]).toEqual(['KeyS'])
      fake.player.x += Math.sin(fake.player.yaw) * 0.1
      fake.player.z += Math.cos(fake.player.yaw) * 0.1
      chief.x += 0.025
    }
    throw new Error('Retreat never reached its framing distance')
  }
  const subject = await faceWalkingChief(communicationDriver(fake.page), door)
  const distance = Math.hypot(fake.player.x - door[0], fake.player.z - door[1])
  expect(distance).toBeGreaterThanOrEqual(3.5)
  expect(distance).toBeLessThan(3.7)
  expect(chief.x).toBeGreaterThan(0.8)
  expect(subject).toEqual({ x: chief.x, y: 1.2, z: chief.z })
  expect(Math.abs(turnDelta(fake.player.yaw, fake.player, chief))).toBeLessThan(0.065)
  expect(Math.abs(turnDelta(fake.player.yaw, fake.player, { x: door[0], z: door[1] }))).toBeGreaterThan(0.15)
  expect(fake.player.pitch).toBeCloseTo(Math.atan2(1.2 - 1.7,
    Math.hypot(chief.x - fake.player.x, chief.z - fake.player.z)), 2)
  expect(movement).toEqual([['down', 'KeyS'], ['up', 'KeyS']])
  expect(held.size).toBe(0)
})

it('releases the backward key and refuses to aim when the door retreat is blocked', async () => {
  const keys = [], aims = []
  const driver = communicationDriver({
    keyboard: { down: async (key) => keys.push(['down', key]), up: async (key) => keys.push(['up', key]) },
    waitForFunction: async () => { throw new Error('blocked retreat') },
  })
  driver.aim = async (subject) => aims.push(subject)
  await expect(faceWalkingChief(driver, [0, 0])).rejects.toThrow('blocked retreat')
  expect(keys).toEqual([['down', 'KeyS'], ['up', 'KeyS']])
  expect(aims).toEqual([])
})

it.each([false, true].flatMap((invertLook) => [10, 450, 890].flatMap((cursorY) =>
  [0.0011, 0.0004].map((sensitivity) => ({ invertLook, cursorY, sensitivity })),
)))('converges on the tapped bank rock from pitch zero: %j', async (options) => {
  const fake = pitchPage(options)
  await communicationDriver(fake.page).aim({ x: 0, y: 0.9, z: -3.57 })
  expect(Math.abs(fake.player.pitch - Math.atan2(-0.8, 3.57))).toBeLessThan(0.025)
  expect(fake.player.yaw).toBeCloseTo(0.031)
  expect(fake.moves.length).toBeLessThan(8)
  expect(fake.state.journalOpen).toBe(false)
  if ((options.invertLook && options.cursorY === 10) || (!options.invertLook && options.cursorY === 890)) {
    expect(fake.moves.some((move) => move.journalOpen)).toBe(true)
    expect(fake.keys).toContain('Tab')
  }
})

it('names the pitch error when mouse-look cannot reach the bank rock', async () => {
  const fake = pitchPage({ frozen: true })
  await expect(communicationDriver(fake.page).aim({ x: 0, y: 0.9, z: -3.57 }))
    .rejects.toThrow(/yaw -0\.031 rad, pitch -0\.220 rad off at 3\.57 m/)
  expect(fake.moves.length).toBeLessThanOrEqual(160)
  expect(fake.state.journalOpen).toBe(false)
})
