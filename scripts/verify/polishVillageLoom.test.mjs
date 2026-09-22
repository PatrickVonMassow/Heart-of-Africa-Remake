import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import sharp from 'sharp'

// The loom's own picture section (work-order 1157), run headless with the
// browser stubbed out: the arithmetic that chooses the stand, measures the
// motion and judges the teaching frame is the part a browser cannot cheaply
// re-test, and it is all here.
const source = readFileSync('scripts/verify/polish.mjs', 'utf8')
const start = source.indexOf("if (section('village-loom')) {")
const end = source.indexOf("\nif (section('adult-errands'))", start)
if (start < 0 || end < 0) throw new Error('Village loom section missing')
const run = new (Object.getPrototypeOf(async function () {}).constructor)(
  'section', 'page', 'check', 'frame', 'nextFrames', 'waitForSceneBuilt', 'sharp',
  source.slice(start, end),
)

const VIEW = { width: 200, height: 120 }

/** A flat image, one with a bright block where the weaver's hands are, and —
 *  unless the river is hidden — a blue block where the water projects to. */
async function png(mark = 0, water = true) {
  const raw = Buffer.alloc(VIEW.width * VIEW.height * 3, 40)
  if (mark) {
    for (let y = 60; y < 80; y++) {
      for (let x = 70; x < 110; x++) {
        raw[(y * VIEW.width + x) * 3] = 220
      }
    }
  }
  if (water) {
    for (let y = 30; y < 50; y++) {
      for (let x = 90; x < 110; x++) {
        raw[(y * VIEW.width + x) * 3 + 2] = 200
      }
    }
  }
  return sharp(raw, { raw: { width: VIEW.width, height: VIEW.height, channels: 3 } }).png().toBuffer()
}

/** The live camera, as far as the section reads it: a vector class whose
 *  `project` puts every point at one fixed screen spot inside the frame. */
class Vec {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z }
  project() { this.x = 0; this.y = 0.33; this.z = 0.5; return this }
}

afterEach(() => vi.unstubAllGlobals())

async function photograph({
  blocked = false, moves = true, arms = true, called = true, parked = false, helperAt = 1.6, water = true, labelOn = true,
} = {}) {
  if (!called) helperAt = 0.2
  if (parked) helperAt = 2.4
  const state = { seed: 42, placeId: 'cairo', leavePlace() { this.placeId = null }, enterPlace(id) { this.placeId = id }, setJournalOpen() {} }
  const shuttle = { at: { x: 0.1, y: 0.33, z: -3 } }
  const object = (get, name = '') => ({ name, updateWorldMatrix() {}, get matrixWorld() {
    const p = get()
    return { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, p.x, p.y, p.z, 1] }
  } })
  // Walking, he faces along the warp (yaw 0); parked at his stand he has
  // turned to the threads (π/2), exactly as the scene sets him.
  const helper = {
    position: { x: 0.45, y: 0, z: helperAt },
    rotation: { y: parked ? Math.PI / 2 : 0 },
    ...object(() => ({ x: 0.45, y: 0, z: -3 + helperAt })),
  }
  // Her two hands, riding the shuttle throw — or frozen beside it.
  const hands = { 'hand-left': { x: -0.3, y: 0.5, z: -3.1 }, 'hand-right': { x: -0.3, y: 0.5, z: -2.9 } }
  const weaverBody = {
    traverse(cb) {
      for (const name of Object.keys(hands)) cb(object(() => hands[name], name))
    },
  }
  // The station's own clock, as the scene publishes it on the loom group.
  const loomGroup = { userData: { loom: { pass: 0.1, passes: 3 } } }
  // What "time passes" means here: half a pass of HER clock, and the shuttle
  // thrown to the other side of the warp with it — her hands going with it
  // unless the arms are the frozen ones. A still loom advances nothing.
  const advance = () => {
    if (!moves) return
    loomGroup.userData.loom = { pass: 0.62, passes: 3 }
    shuttle.at = { x: -0.12, y: 0.34, z: -3 }
    if (arms) {
      hands['hand-left'] = { x: -0.3, y: 0.46, z: -3.22 }
      hands['hand-right'] = { x: -0.3, y: 0.42, z: -2.86 }
    }
  }
  vi.stubGlobal('__game', { getState: () => state, setState: update => Object.assign(state, update) })
  vi.stubGlobal('__placeScene', {
    getObjectByName: name => {
      if (name === 'village-loom-shuttle') return object(() => shuttle.at)
      if (name === 'village-loom') return loomGroup
      if (name === 'village-weaver-body') return weaverBody
      return helper
    },
  })
  vi.stubGlobal('__placeCamera', { position: new Vec() })
  vi.stubGlobal('__placeLayout', {
    interactives: [], dwellings: [],
    // The warp on the z axis, the water to −x, and one hut on the INLAND side
    // that either stands well clear of every candidate stand or covers them
    // all — the close ones at 2.6-3.6 m and the wide ones at 6.5-9.5 m alike.
    colliders: [{ x: blocked ? 5 : 14, z: -3, r: blocked ? 6 : 1 }],
    bank: { nx: -1, nz: 0, fx: 0, fz: 1, distance: 20, bank: { x: -20, z: -3 } },
    loom: {
      seat: { x: 0, z: -3 }, weaver: { x: 0.45, z: -3 },
      upstream: { x: 0, z: -6.2 }, downstream: { x: 0, z: 0.2 },
      tend: { upstream: { x: 0.45, z: -5.4 }, downstream: { x: 0.45, z: -0.6 } },
      fx: 0, fz: 1, ax: -1, az: 0, onRiverAxis: true,
    },
  })
  const player = {}
  vi.stubGlobal('__placePlayer', player)
  vi.stubGlobal('__clearanceTo', (c, x, z) => Math.hypot(x - c.x, z - c.z) - c.r)
  vi.stubGlobal('__speech', {
    labels: () => [{ speakerId: 'village-weaver', atoms: ['x'] }],
    anchorScreen: () => (labelOn ? { x: 100, y: 40 } : { x: -30, y: 40 }),
  })
  const checks = []
  const frames = []
  let shot = 0
  await run(
    () => true,
    {
      evaluate: async (fn, arg) => fn(arg),
      // A real wait returns when its condition holds; here the world is stepped
      // between tries, so a condition that never comes true still ends.
      waitForFunction: async (fn, arg) => {
        for (let tries = 0; tries < 3; tries++) {
          if (fn(arg)) return
          advance()
        }
        throw new Error('never became true')
      },
      viewportSize: () => VIEW,
    },
    (name, pass, detail) => checks.push({ name, pass, detail }),
    async (name, subject) => { frames.push({ name, subject }); return png(shot++ && moves ? 1 : 0, water) },
    async () => {}, async () => {}, sharp,
  )
  return { state, checks, frames, player }
}

it('shoots her motion from close by and the teaching from back, both inland', async () => {
  const { player, checks, frames } = await photograph()
  // The water is to −x, so both stands are to +x of the seat. The last one set
  // is the WIDE one: 7.5 m out and 2.4 m along the warp from her middle.
  expect(player.x).toBeCloseTo(7.5, 6)
  expect(player.z).toBeCloseTo(-3 + 2.4, 6)
  expect(checks[0].pass).toBe(true)
  expect(checks[1].pass).toBe(true)
  expect(frames.map(f => f.name)).toEqual([
    '1157-village-loom-working-a',
    '1157-village-loom-working-b',
    '1157-village-loom-named-tending',
  ])
})

it('passes the motion check only when the picture, the shuttle AND her hands all moved', async () => {
  const moving = await photograph()
  expect(moving.checks.find(c => c.name.startsWith('her cycle advances')).pass).toBe(true)
  expect(moving.checks.find(c => c.name.startsWith('two frames')).pass).toBe(true)
  expect(moving.checks.find(c => c.name.startsWith('the shuttle is at another')).pass).toBe(true)
  expect(moving.checks.find(c => c.name.startsWith('BOTH her hands')).pass).toBe(true)
  // A shuttle flying over frozen arms is the reported defect wearing a tool:
  // the picture and the shuttle both change, and the hands check alone says no.
  const frozen = await photograph({ arms: false })
  expect(frozen.checks.find(c => c.name.startsWith('two frames')).pass).toBe(true)
  expect(frozen.checks.find(c => c.name.startsWith('the shuttle is at another')).pass).toBe(true)
  expect(frozen.checks.find(c => c.name.startsWith('BOTH her hands')).pass).toBe(false)
  // A loom whose cycle never advances is the reported defect itself: it must
  // read as three red checks, not as a timeout thrown out of the wait.
  const still = await photograph({ moves: false })
  expect(still.checks.find(c => c.name.startsWith('her cycle advances')).pass).toBe(false)
  expect(still.checks.find(c => c.name.startsWith('two frames')).pass).toBe(false)
  expect(still.checks.find(c => c.name.startsWith('the shuttle is at another')).pass).toBe(false)
})

it('names the direction the helper actually walked in the frame it writes', async () => {
  const down = await photograph({ helperAt: 1.6 })
  expect(down.frames.at(-1).subject.label).toContain('downstream')
  const up = await photograph({ helperAt: -1.6 })
  expect(up.frames.at(-1).subject.label).toContain('upstream')
})

it('a helper parked at his stand is not part-way along the warp', async () => {
  const { checks, frames } = await photograph({ parked: true })
  expect(checks.find(c => c.name.includes('sends her helper')).pass).toBe(false)
  expect(frames.map(f => f.name)).toEqual([
    '1157-village-loom-working-a',
    '1157-village-loom-working-b',
  ])
})

it('the teaching frame needs her reading on the screen and the river in the picture', async () => {
  const good = await photograph()
  expect(good.checks.find(c => c.name.startsWith('her reading stands')).pass).toBe(true)
  expect(good.checks.find(c => c.name.startsWith('he is part-way')).pass).toBe(true)
  expect(good.checks.find(c => c.name.startsWith('the river is in the captured frame')).pass).toBe(true)
  const offscreen = await photograph({ labelOn: false })
  expect(offscreen.checks.find(c => c.name.startsWith('her reading stands')).pass).toBe(false)
  const hidden = await photograph({ water: false })
  expect(hidden.checks.find(c => c.name.startsWith('the river is in the captured frame')).pass).toBe(false)
})

it('reports a silent loom instead of photographing one that said nothing', async () => {
  const { checks, frames } = await photograph({ called: false })
  expect(checks.find(c => c.name.includes('sends her helper')).pass).toBe(false)
  expect(frames.map(f => f.name)).toEqual([
    '1157-village-loom-working-a',
    '1157-village-loom-working-b',
  ])
})

it('reports rather than photographs when no stand sees her over open ground', async () => {
  const { checks, frames, state } = await photograph({ blocked: true })
  expect(checks[0].pass).toBe(false)
  expect(frames).toEqual([])
  expect(state.seed).toBe(42)
  expect(state.placeId).toBeNull()
})

it('restores the world seed and leaves the settlement afterwards', async () => {
  const { state } = await photograph()
  expect(state.seed).toBe(42)
  expect(state.placeId).toBeNull()
})
