// Execute the actual call sampler with dev-hook readings; no browser runs.
import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'

const source = readFileSync('scripts/verify/polish.mjs', 'utf8')
const start = source.indexOf('      const called = await page')
const end = source.indexOf('\n    }\n\n    // THE TRAVELLER IN THE LANE', start)
if (start < 0 || end < 0) throw new Error('Bank call sampler block missing')
const runSampler = new (Object.getPrototypeOf(async function () {}).constructor)(
  'page', 'check', 'frame', 'stood', source.slice(start, end),
)

afterEach(() => vi.unstubAllGlobals())

async function sample({ held = true, hookPresent = true, gesture = { kind: 'point', t: 0.5, duration: 2 } } = {}) {
  const checks = []
  const frames = []
  const speak = vi.fn(() => held)
  const speech = {
    speak,
    labels: () => [{ speakerId: 'kid-1', atoms: ['direction-word'] }],
    anchorScreen: () => ({ x: 100, y: 100 }),
  }
  vi.stubGlobal('__speech', speech)
  vi.stubGlobal('__placeTag', () => ({
    direction: 'UPSTREAM', announcedWord: 'direction-word',
    children: [null, { x: 1, z: 2, gesture }],
  }))
  const page = {
    waitForFunction: async (fn) => {
      const reading = fn()
      if (!reading) throw new Error('No live call')
      // Model a hook disappearing between the live reading and the shutter.
      if (!hookPresent) vi.stubGlobal('__speech', undefined)
      return { jsonValue: async () => reading }
    },
    evaluate: async (fn, arg) => fn(arg),
  }
  await runSampler(page, (name, pass, detail) => checks.push({ name, pass, detail }),
    async (name, declaration) => frames.push({ name, declaration }), { stretch: 19.7 })
  return { checks, frames, speak }
}

it('holds the observed word on its live child anchor before taking the frame', async () => {
  const { checks, frames, speak } = await sample()
  expect(checks.map((c) => c.pass)).toEqual([true, true, true])
  expect(speak).toHaveBeenCalledWith('kid-1', ['direction-word'], undefined, 120)
  expect(frames).toHaveLength(1)
  expect(frames[0].name).toBe('1073-bank-call-from-the-spectator-stand')
  expect(frames[0].declaration.local).toEqual({ x: 1, y: 1.1, z: 2 })
})

it.each([false, null, 1])('fails the shutter check and takes no frame when speak returns %s', async (held) => {
  const { checks, frames } = await sample({ held })
  expect(checks.map((c) => c.pass)).toEqual([true, true, false])
  expect(checks[2].detail).toContain(`speak returned ${String(held)}`)
  expect(frames).toEqual([])
})

it('fails the shutter check if the speech hook disappears after the live call', async () => {
  const { checks, frames } = await sample({ hookPresent: false })
  expect(checks.map((c) => c.pass)).toEqual([true, true, false])
  expect(checks[2].detail).toContain('speak returned undefined')
  expect(frames).toEqual([])
})

it.each([
  null,
  { kind: 'point', t: 2, duration: 2 },
  { kind: 'beckon', t: 0.5, duration: 2 },
])('keeps the live pointing check red for gesture %j even when the word is held', async (gesture) => {
  const { checks } = await sample({ gesture })
  expect(checks.map((c) => c.pass)).toEqual([true, false, true])
})

it('declares the later frame as a held word, without promising the live pointing pose', async () => {
  const { frames } = await sample()
  expect(frames[0].declaration.label).toBe(
    'the held direction word (UPSTREAM) standing over the child that called it, seen from the ' +
    'bank-game spectator stand a quarter of the 19.7 m stretch back of the upstream rock',
  )
})
