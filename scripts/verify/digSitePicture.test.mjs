import { afterEach, expect, it, vi } from 'vitest'
import { BoxGeometry, Group, Mesh, PerspectiveCamera } from 'three/webgpu'
import { captureSpoilWalk, readDigPicture, readSpoilWalker } from './digSitePicture.mjs'

const route = { who: 0, start: { x: 0, z: 0 }, end: { x: 0, z: 3.2 } }
afterEach(() => vi.unstubAllGlobals())

function sceneFixture() {
  const scene = new Group()
  const camera = new PerspectiveCamera(50, 1.6, 0.1, 100)
  camera.position.set(0, 1.65, 0)
  camera.rotation.x = -0.17
  camera.updateMatrixWorld(true)
  for (const [x, kind, cue, earth] of [
    [-3.2, 'pit', 'grain-baskets-and-cover', 'dig-mouth'],
    [3.2, 'patch', 'seedling-tray', 'dig-furrows'],
  ]) {
    const site = new Group()
    site.name = 'dig-site'
    site.position.set(x, 0, -8)
    site.userData = { kind, dug: 18, completed: true }
    for (const [name, width, z] of [[cue, 0.85, -1.55], [earth, 2, 0]]) {
      const group = new Group()
      group.name = name
      const mesh = new Mesh(new BoxGeometry(width, 0.2, 0.5))
      mesh.position.z = z
      group.add(mesh)
      site.add(group)
    }
    scene.add(site)
  }
  vi.stubGlobal('__placeScene', scene)
  vi.stubGlobal('__placeCamera', camera)
  vi.stubGlobal('innerWidth', 1440)
  return { scene, camera }
}

function walkerFixture(overrides = {}) {
  let held = false
  const reading = {
    x: 0, z: 1.3, mode: 'walk', pause: 0, groundHeight: 0.4,
    drawn: { x: 0, y: 0.43, z: 1.3, visible: true }, ...overrides,
  }
  const hold = vi.fn((who) => { held = who !== null })
  vi.stubGlobal('__placeWalkers', { states: [{}], sample: () => ({ ...reading, held }), hold })
  return { reading, hold }
}

async function capture({ overrides, afterHold = () => {}, noHold = false } = {}) {
  sceneFixture()
  const { reading, hold } = walkerFixture(overrides)
  if (noHold) hold.mockImplementation(() => {})
  const checks = []
  const frame = vi.fn()
  const page = {
    evaluate: async (fn, arg) => fn(arg),
    waitForFunction: async (fn, arg) => {
      const value = fn(arg)
      if (!value) throw new Error('Hold timed out')
      return { jsonValue: async () => value }
    },
  }
  await captureSpoilWalk(page, (name, ok) => checks.push({ name, ok }), frame,
    async () => afterHold(reading), route)
  return { checks, frame, hold }
}

it('captures both purposes with a raised walker held through the shutter', async () => {
  const { checks, frame, hold } = await capture()
  expect(checks.map((c) => c.ok)).toEqual([true, true])
  expect(frame).toHaveBeenCalledExactlyOnceWith('1056-two-excavations-walkable-spoil', {
    local: { x: 0, y: 1.08, z: 1.3 }, label: 'the two excavations with a villager walking over the spoil',
  })
  expect(hold.mock.calls).toEqual([[0], [null]])
})

it.each([
  { groundHeight: 0.12 }, { groundHeight: 0.27 }, { pause: 1 }, { mode: 'inside' },
  { x: 0, z: 0.1 },
  { drawn: { x: 0, y: 0, z: 1.3, visible: true } },
  { drawn: { x: 0, y: 0.7, z: 1.3, visible: true } },
  { drawn: { x: 0, y: 0.43, z: 0, visible: true } },
  { drawn: { x: 0, y: 0.43, z: 1.3, visible: false } },
])('writes no picture when the live crossing fails: %j', async (overrides) => {
  const { checks, frame, hold } = await capture({ overrides })
  expect(checks.map((c) => c.ok)).toEqual([false])
  expect(frame).not.toHaveBeenCalled()
  expect(hold).toHaveBeenCalledExactlyOnceWith(null)
})

it('writes no picture when the hold does not take', async () => {
  const { checks, frame } = await capture({ noHold: true })
  expect(checks.map((c) => c.ok)).toEqual([true, false])
  expect(frame).not.toHaveBeenCalled()
})

it('writes no aftermath if the figure moves during the shutter wait', async () => {
  const { checks, frame } = await capture({ afterHold: (v) => { v.z += 0.1 } })
  expect(checks.map((c) => c.ok)).toEqual([true, false])
  expect(frame).not.toHaveBeenCalled()
})

it('refuses missing actor instrumentation', () => {
  vi.stubGlobal('__placeWalkers', undefined)
  expect(readSpoilWalker(route)).toBeNull()
})

it('reads both distinct full-grown purpose meshes through the camera', () => {
  sceneFixture()
  expect(readDigPicture()?.map((r) => r.kind)).toEqual(['pit', 'patch'])
})

it.each(['missing-site', 'hidden-site', 'same-kind', 'initial-spoil', 'unfinished', 'missing-cue', 'hidden-cue', 'offscreen', 'too-small', 'overlap'])(
  'refuses a misleading excavation composition: %s', (failure) => {
    const { scene, camera } = sceneFixture()
    const [first, second] = scene.children
    if (failure === 'missing-site') scene.remove(second)
    if (failure === 'hidden-site') first.visible = false
    if (failure === 'same-kind') second.userData.kind = 'pit'
    if (failure === 'initial-spoil') first.userData.dug = 0
    if (failure === 'unfinished') first.userData.completed = false
    if (failure === 'missing-cue') first.remove(first.children[0])
    if (failure === 'hidden-cue') first.children[0].visible = false
    if (failure === 'offscreen') second.position.x = 100
    if (failure === 'too-small') camera.position.z = 60
    if (failure === 'overlap') second.position.x = first.position.x
    camera.updateMatrixWorld(true)
    expect(readDigPicture()).toBeNull()
  },
)

it('does not write a frame if either purpose is lost before the shutter', async () => {
  const { checks, frame } = await capture({ afterHold: () => {
    window.__placeScene.remove(window.__placeScene.children[1])
  } })
  expect(checks.map((c) => c.ok)).toEqual([true, false])
  expect(frame).not.toHaveBeenCalled()
})
