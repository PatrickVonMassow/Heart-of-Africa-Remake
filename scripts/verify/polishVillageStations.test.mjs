import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'

const source = readFileSync('scripts/verify/polish.mjs', 'utf8')
const start = source.indexOf("if (section('village-stations')) {")
const end = source.indexOf("\nif (section('adult-errands'))", start)
if (start < 0 || end < 0) throw new Error('Village station section missing')
const run = new (Object.getPrototypeOf(async function () {}).constructor)(
  'section', 'page', 'check', 'frame', 'nextFrames', 'waitForSceneBuilt', source.slice(start, end),
)

afterEach(() => vi.unstubAllGlobals())

async function photograph({ marketX = -5.21, marketRadius = 2.9, failFrame = false } = {}) {
  const state = { seed: 42, placeId: 'cairo', leavePlace() { this.placeId = null }, enterPlace(id) { this.placeId = id }, setJournalOpen() {} }
  const matrix = (x, z, yaw = 0) => ({
    updateWorldMatrix() {},
    matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, Math.sin(yaw), 0, Math.cos(yaw), 0, x, 0, z, 1] },
  })
  const loom = matrix(0, -3)
  const body = matrix(0, -2.45, Math.PI)
  vi.stubGlobal('__game', { getState: () => state, setState: update => Object.assign(state, update) })
  vi.stubGlobal('__placeScene', { getObjectByName: name => name === 'village-weaver' ? loom : body })
  vi.stubGlobal('__placeLayout', {
    interactives: [{ type: 'market', pos: [marketX, -5.76] }], dwellings: [],
    colliders: [{ x: marketX, z: -5.76, r: marketRadius }],
  })
  const player = {}
  vi.stubGlobal('__placePlayer', player)
  vi.stubGlobal('__clearanceTo', (c, x, z) => Math.hypot(x - c.x, z - c.z) - c.r)
  const checks = []
  const frames = []
  let error
  try {
    await run(
      () => true,
      { evaluate: async (fn, arg) => fn(arg), waitForFunction: async fn => { expect(fn()).toBe(true) } },
      (name, pass) => checks.push({ name, pass }),
      async (name, subject) => {
        frames.push({ name, subject, seed: state.seed, place: state.placeId })
        if (failFrame) throw new Error('shutter failed')
      },
      async () => {}, async () => {},
    )
  } catch (caught) { error = caught }
  return { state, checks, frames, error, player, body: { x: 0, z: -2.45 }, market: { x: marketX, z: -5.76 } }
}

it('photographs the live figure at the reported seed and restores the original world seed', async () => {
  const { state, checks, frames, error } = await photograph()
  expect(error).toBeUndefined()
  expect(checks.map(c => c.pass)).toEqual([true, true, true, true])
  expect(frames).toHaveLength(1)
  expect(frames[0]).toMatchObject({ seed: 1838110026, place: 'bambara-village', subject: { local: { x: 0, y: 0.9, z: -2.45 } } })
  expect(state.seed).toBe(42)
  expect(state.placeId).toBeNull()
})

it('fails the clearance check when a market wall presses into the figure', async () => {
  const { checks } = await photograph({ marketX: 0 })
  expect(checks[0].pass).toBe(false)
})

it('restores the seed even when the shutter fails', async () => {
  const { state, error } = await photograph({ failFrame: true })
  expect(error?.message).toBe('shutter failed')
  expect(state.seed).toBe(42)
  expect(state.placeId).toBeNull()
})

it('stands opposite the trading post, so its wall closes the picture behind her', async () => {
  const { player, body, market, checks } = await photograph()
  // The camera is on the far side of the figure from the hut: seen from there,
  // the hut lies beyond her instead of off-frame beside the lens.
  const toCamera = { x: player.x - body.x, z: player.z - body.z }
  const toMarket = { x: market.x - body.x, z: market.z - body.z }
  expect(toCamera.x * toMarket.x + toCamera.z * toMarket.z).toBeLessThan(0)
  expect(checks[3]).toMatchObject({ pass: true })
})

it('refuses a photograph when every candidate camera stand is blocked', async () => {
  const { checks, frames, state } = await photograph({ marketRadius: 20 })
  expect(checks[2].pass).toBe(false)
  expect(checks[3].pass).toBe(false)
  expect(frames).toEqual([])
  expect(state.seed).toBe(42)
})
