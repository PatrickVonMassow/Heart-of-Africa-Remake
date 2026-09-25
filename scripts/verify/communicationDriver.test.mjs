import { it, expect } from 'vitest'
import { runInNewContext } from 'node:vm'
import { buildLayout, chiefStandingSpot, interactiveCircleRadius } from '../../src/scenes/place/layout.ts'
import { chiefBesideDrummerSpot } from '../../src/scenes/place/chiefWalk.ts'
import { REGION_PLACE_STYLES } from '../../src/scenes/place/regionStyles.ts'
import { standingClear, PLAYER_RADIUS } from '../../src/scenes/place/collision.ts'
import { buildPlaceNavGrid, findPlaceRoute } from '../../src/scenes/place/routing.ts'
import { balance } from '../../src/config/balance.ts'
import { chiefWalkStand } from './communicationRouteCore.mjs'
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

it.each([42, 12345])('frames the chief route from outside the real hut, seed %s', (seed) => {
  const layout = buildLayout('bambara-village', seed)
  const hut = layout.interactives.find((i) => i.type === 'chief')
  const radius = interactiveCircleRadius('chief', REGION_PLACE_STYLES.west)
  const from = chiefStandingSpot(hut, radius)
  const to = chiefBesideDrummerSpot(balance.communication.chiefBesideDrummer)
  const stand = chiefWalkStand(hut, { from, to }, (p) => standingClear(layout.colliders, p.x, p.z, PLAYER_RADIUS))
  const dx = hut.door[0] - hut.pos[0], dz = hut.door[1] - hut.pos[1]
  const length = Math.hypot(dx, dz)
  expect(((stand.x - hut.door[0]) * dx + (stand.z - hut.door[1]) * dz) / length).toBeCloseTo(3)
  expect(Math.hypot(stand.x - hut.door[0], stand.z - hut.door[1])).toBeCloseTo(Math.hypot(3, 2.5))
  expect(Math.hypot(stand.x - hut.pos[0], stand.z - hut.pos[1])).toBeGreaterThan(radius + PLAYER_RADIUS)
  expect(standingClear(layout.colliders, stand.x, stand.z, PLAYER_RADIUS)).toBe(true)
  const grid = buildPlaceNavGrid(layout, layout.colliders, PLAYER_RADIUS)
  expect(findPlaceRoute(grid, { x: hut.door[0], z: hut.door[1] }, stand)?.length).toBeGreaterThan(0)
  const rx = to[0] - from[0], rz = to[1] - from[1]
  // Stay off the chief's line; when aimed across the route, both ends
  // remain in the camera's forward half-space, with no hut between us and him.
  expect(Math.abs((stand.x - from[0]) * rz - (stand.z - from[1]) * rx) / Math.hypot(rx, rz)).toBeGreaterThan(PLAYER_RADIUS + 0.6)
  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    const live = { x: from[0] + progress * rx, z: from[1] + progress * rz }
    const yaw = Math.atan2(-((from[0] + to[0]) / 2 - stand.x), -((from[1] + to[1]) / 2 - stand.z))
    for (const [x, z] of [from, to]) {
      expect((x - stand.x) * -Math.sin(yaw) + (z - stand.z) * -Math.cos(yaw)).toBeGreaterThan(0)
    }
    for (let i = 0; i <= 20; i++) {
      const t = i / 20
      expect(Math.hypot(stand.x + t * (live.x - stand.x) - hut.pos[0],
        stand.z + t * (live.z - stand.z) - hut.pos[1])).toBeGreaterThan(radius)
    }
  }
})

it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2])('rotates the outside stand with the hut geometry: %s', (angle) => {
  const rotate = ([x, z]) => [10 + x * Math.cos(angle) - z * Math.sin(angle),
    -7 + x * Math.sin(angle) + z * Math.cos(angle)]
  const hut = { pos: [0, 0], door: [0, 4] }, from = [1.6, 4], to = [5, 10]
  const stand = chiefWalkStand(hut, { from, to })
  const rotated = chiefWalkStand({ pos: rotate(hut.pos), door: rotate(hut.door) }, { from: rotate(from), to: rotate(to) })
  const expected = rotate([stand.x, stand.z])
  expect(rotated.x).toBeCloseTo(expected[0])
  expect(rotated.z).toBeCloseTo(expected[1])
})

it('refuses blocked outside spots and missing geometry before calling the chief', () => {
  const hut = { pos: [0, 0], door: [0, 4] }, route = { from: [1.6, 4], to: [5, 10] }
  expect(() => chiefWalkStand(hut, route, () => false)).toThrow('No reachable outside spot')
  expect(() => chiefWalkStand({ pos: [0, 0], door: [0, 0] }, route)).toThrow('outward door normal')
  expect(() => chiefWalkStand(hut, { from: [1, 1], to: [1, 1] })).toThrow('route towards the drummer')
})

function chiefDriver(stand, chief, steps, events) {
  const player = { x: stand.x, z: stand.z, yaw: 0 }
  return {
    walk: async (target) => { events.push(['walk', target]); chief.x = 1 },
    read: async (fn) => runInNewContext(`(${fn.toString()})()`, { window: { __chief: chief, __placePlayer: player } }),
    aim: async (subject) => {
      events.push(['aim', { ...subject }])
      player.yaw = Math.atan2(-(subject.x - player.x), -(subject.z - player.z))
      chief.x += steps.shift() ?? 0
    },
  }
}

it('walks to the planned spot before reading the live chief and refreshes him after aiming', async () => {
  const stand = { x: 4, z: 3 }, chief = { x: 0, z: 0 }, events = []
  expect(await faceWalkingChief(chiefDriver(stand, chief, [1], events), stand)).toEqual({ x: 2, y: 1.2, z: 0 })
  expect(events).toEqual([['walk', stand], ['aim', { x: 1, y: 1.2, z: 0 }]])
})

it('aims again while the walking chief drifts out of the view centre', async () => {
  const stand = { x: 0, z: 3 }, chief = { x: 0, z: 0 }, events = []
  expect(await faceWalkingChief(chiefDriver(stand, chief, [3, 0.1], events), stand)).toEqual({ x: 4.1, y: 1.2, z: 0 })
  expect(events.filter(([k]) => k === 'aim').map(([, s]) => s.x)).toEqual([1, 4])
})

it('refuses to aim or shoot when the outside walk is blocked', async () => {
  const aims = []
  const driver = {
    walk: async () => { throw new Error('blocked outside walk') },
    aim: async (subject) => aims.push(subject),
  }
  await expect(faceWalkingChief(driver, { x: 4, z: 3 })).rejects.toThrow('blocked outside walk')
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
