import { it, expect } from 'vitest'
import { runInNewContext } from 'node:vm'
import { turnDelta, travelKeys, communicationDriver, faceWalkingChief, followInvitation, inviteOutcome } from './communicationDriver.mjs'
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

it('shoots the departing chief once he walks clear and into the view', async () => {
  const chief = { x: 0, z: -0.5, phase: 'walking-out' }, player = { x: 0, z: 0, yaw: 0 }, seen = []
  const context = () => ({ window: { __chief: chief, __placePlayer: player }, Math })
  const driver = {
    read: async (fn) => runInNewContext(`(${fn.toString()})()`, context()),
    wait: async (fn) => {
      for (const at of [{ x: 0, z: -0.5 }, { x: 3, z: -1 }, { x: 0.5, z: -2 }]) {
        Object.assign(chief, at)
        seen.push(runInNewContext(`(${fn.toString()})()`, context()))
      }
    },
  }
  expect(await faceWalkingChief(driver)).toEqual({ x: 0.5, y: 1.2, z: -2 })
  expect(seen).toEqual([false, false, true])
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
it('keeps a dig initiator\'s own invitation label as seen after another word became last', async () => {
  const task = { phase: 'invite', owes: true, siteIndex: 1 }, label = { id: 'villager-2', siteIndex: 1 }
  const samples = [
    { nowS: 0, initiator: 2, task, last: null, labelled: null, initiatorLabel: null },
    { nowS: 1, initiator: 2, task: { ...task, owes: false }, last: { purpose: 'site', speaker: 5, age: 0 }, labelled: null, initiatorLabel: label },
  ]
  let t = 0, i = 0
  const outcome = await followInvitation({ budgetMs: 1000, labelSeconds: 4, now: () => t, pause: async (ms) => { t += ms }, sample: async () => samples[Math.min(i++, samples.length - 1)] })
  expect(outcome).toEqual({ seen: label })
})
it('records a lapse only after the label window when the initiator leaves the invite unseen', () => {
  const watch = {}, base = { initiator: 2, labelled: null, initiatorLabel: null, last: null }
  expect(inviteOutcome({ ...base, nowS: 0, task: { phase: 'invite', owes: true }, villager: { x: 1 } }, watch, 4)).toBeNull()
  expect(inviteOutcome({ ...base, nowS: 1, task: null }, watch, 4)).toBeNull()
  expect(inviteOutcome({ ...base, nowS: 6, task: null }, watch, 4)).toEqual({ lapsed: true, spokeUnseen: false, atSpeak: null, last: { x: 1 }, now: null })
})
it('keeps the label channel as it stood when the initiator was first seen speaking', () => {
  const watch = {}, base = { initiator: 2, labelled: null, initiatorLabel: null }
  const speech = { channel: null, dom: [], distance: 2.9 }
  inviteOutcome({ ...base, nowS: 0, last: { purpose: 'invitation', speaker: 2, age: 0 }, speech, task: { phase: 'invite', owes: true }, villager: { x: 1 } }, watch, 4)
  inviteOutcome({ ...base, nowS: 1, last: { purpose: 'invitation', speaker: 2, age: 1 }, speech: { channel: 'later' }, task: null }, watch, 4)
  expect(inviteOutcome({ ...base, nowS: 6, last: null, task: null }, watch, 4)).toMatchObject({ lapsed: true, spokeUnseen: true, atSpeak: speech })
})
