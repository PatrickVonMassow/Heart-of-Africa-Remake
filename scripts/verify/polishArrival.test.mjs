/**
 * @vitest-environment jsdom
 *
 * EXCEPTION to the tooling project's Node environment: this file runs browser-page
 * code here — a function Playwright serializes into the page, or a `polish-*.mjs`
 * sampler block — and that code reads `window`/`document` directly. It needs a DOM,
 * so it keeps jsdom per file instead of dragging the other tooling tests back into one.
 */
// Exercise the actual sampler with scene readings; no browser or renderer runs.
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { KID_HEIGHT, OCCLUDED_RATIO } from './tagFrameReading.mjs'

const source = readFileSync('scripts/verify/polish-children.mjs', 'utf8')
const start = source.indexOf('    // ARRIVAL CONTACT (work-order 1106).')
// The block ends at the first section-level close after it, whatever follows.
const end = source.indexOf('\n  }\n\n  // ', start)
if (start < 0 || end < 0) throw new Error('Arrival sampler block missing')
const runSampler = new (Object.getPrototypeOf(async function () {}).constructor)(
  'page', 'restoreEarshotStance', 'check', 'frame', 'aimAtTap', 'nextFrames', 'contactBar',
  'KID_HEIGHT', 'OCCLUDED_RATIO', 'dropFrame',
  source.slice(start, end),
)

function hold(clock, heardFrom, gap = 0.001, gesture = 'touch') {
  const opening = { clock, heardFrom, gap }
  return Array.from({ length: 91 }, (_, i) => ({
    tapper: 1, clock: clock + i / 10, opening, arrivalFor: 9 - i / 10,
    gap, gesture, x: 1, y: 0.5, z: 2, body: { x: 1.3, z: 2.2 },
  }))
}

const CLEAR = () => ({ hitDistance: 4.1, targetDistance: 4.2, hitName: 'hand-left' })

/**
 * `ray(probe)` answers each `__placeRayHit` call; `probe` counts them. The mock
 * shutter runs `beforeCapture` (a throw vetoes the write) and then advances
 * `shutterReadings` readings, as the real pipeline wait lets the scene run.
 */
async function sample(readings, ray = CLEAR, shutterReadings = 0) {
  let index = 0
  let probe = 0
  const checks = []
  const frames = []
  const stands = []
  const dropped = []
  const previousBalance = window.__balance
  const previousReader = window.__placeArrivalHand
  const previousRay = window.__placeRayHit
  window.__balance = { villageLife: { bankGame: { arrivalHoldSeconds: 2 } }, communication: { hearingRadius: 10 } }
  window.__placeArrivalHand = () => readings[Math.min(index, readings.length - 1)] ?? null
  window.__placeRayHit = () => ray(probe++)
  try {
    await runSampler(
      { evaluate: async (fn, arg) => fn(arg) }, async () => {},
      (name, pass, detail) => checks.push({ name, pass, detail }),
      async (name, _decl, extra) => {
        await extra?.beforeCapture?.()
        frames.push(name)
        index += shutterReadings
        return true
      },
      async (_hand, stand) => (stands.push(stand), true), async () => { index++ }, 0.005,
      KID_HEIGHT, OCCLUDED_RATIO, (name) => dropped.push(name),
    )
  } finally {
    if (previousRay === undefined) delete window.__placeRayHit
    else window.__placeRayHit = previousRay
    if (previousBalance === undefined) delete window.__balance
    else window.__balance = previousBalance
    if (previousReader === undefined) delete window.__placeArrivalHand
    else window.__placeArrivalHand = previousReader
  }
  return { checks, frames, stands, dropped }
}

it('reads the whole first audible hold after an unheard arrival with its arm at rest', async () => {
  const { checks, frames } = await sample([...hold(1, 10.4344, 0.6605, null), ...hold(11, 9)])
  expect(checks).toHaveLength(4)
  expect(checks.every((c) => c.pass)).toBe(true)
  expect(checks[0].detail).toContain('1 unheard openings before acquisition')
  expect(frames).toEqual(['1106-arriving-runner-hand-on-the-far-stone'])
})

it('fails an audible missing arm instead of searching for a later good hold', async () => {
  const { checks, frames } = await sample([...hold(1, 9, 0.6605, null), ...hold(11, 9)])
  expect(checks.map((c) => c.pass)).toEqual([true, false, false, false])
  expect(frames).toEqual([])
})

it('keeps a bad word frame in the worst reading even if the rest of the hold touches', async () => {
  const readings = hold(1, 9)
  readings[0].opening.gap = 0.06
  const { checks } = await sample(readings)
  expect(checks.map((c) => c.pass)).toEqual([true, false, true, true])
})

it('fails when no audible arrival offers a hold or a photograph', async () => {
  const { checks, frames } = await sample(hold(1, 10.4344, 0.6605, null))
  expect(checks.map((c) => !!c.pass)).toEqual([false, false, false, false])
  expect(frames).toEqual([])
})

it('keeps a later bad contact frame in the acquired hold', async () => {
  const readings = hold(1, 9)
  readings[40].gap = 0.06
  const { checks } = await sample(readings)
  expect(checks.map((c) => c.pass)).toEqual([true, false, true, true])
})

it('fails all arrival evidence when an unreachable stand produces no opening', async () => {
  const { checks, frames } = await sample([null])
  expect(checks.map((c) => !!c.pass)).toEqual([false, false, false, false])
  expect(checks[1].detail).toContain('Infinity cm over 0 readings')
  expect(frames).toEqual([])
})

// A passer-by between the camera and the hand (WebGL 2, 08.11.2026): a hit at a
// third of the way to the hand is a foreground occluder by OCCLUDED_RATIO.
const WOMAN = () => ({ hitDistance: 1.4, targetDistance: 4.2, hitName: 'villager-body' })

it('refuses an occluded stand and shoots from the next clear one inside the hold', async () => {
  // Probes 0-2 are the first stand's three lines; the first is blocked.
  const { checks, frames, stands } = await sample(hold(1, 9), (n) => (n === 0 ? WOMAN() : CLEAR()))
  expect(checks.every((c) => c.pass)).toBe(true)
  expect(stands).toEqual([0, 1])
  expect(frames).toEqual(['1106-arriving-runner-hand-on-the-far-stone'])
  expect(checks[3].detail).toContain('1 occluded stand(s) refused: stand 0: hand behind villager-body')
})

it('vetoes the write when an occluder stands in front at the shutter itself', async () => {
  // Clear before the pipeline wait (probes 0-2); the hand line blocked at the shutter (3).
  const { checks, frames, stands, dropped } = await sample(hold(1, 9), (n) => (n === 3 ? WOMAN() : CLEAR()))
  expect(checks.every((c) => c.pass)).toBe(true)
  expect(stands).toEqual([0, 1])
  expect(frames).toEqual(['1106-arriving-runner-hand-on-the-far-stone'])
  expect(dropped).toEqual([])
  expect(checks[3].detail).toContain('stand 0: at the shutter, hand behind villager-body')
})

it('deletes a written frame whose occluder stepped in after the shutter and shoots again', async () => {
  // Clear before (0-2) and at the shutter (3-5), the torso line blocked after it (8).
  const { checks, frames, stands, dropped } = await sample(hold(1, 9), (n) => (n === 8 ? WOMAN() : CLEAR()))
  expect(checks.every((c) => c.pass)).toBe(true)
  expect(stands).toEqual([0, 1])
  expect(frames).toHaveLength(2)
  expect(dropped).toEqual(['1106-arriving-runner-hand-on-the-far-stone'])
  expect(checks[3].detail).toContain('stand 0: after the shutter, torso behind villager-body')
})

it('refuses and deletes a frame whose pipeline wait outlasted the contact hold', async () => {
  // The shutter's wait runs past the last reading of the hold; nothing may pass.
  const { checks, dropped } = await sample(hold(1, 9), CLEAR, 200)
  expect(checks[2].pass).toBe(false)
  expect(checks[3].pass).toBe(false)
  expect(dropped).toEqual(['1106-arriving-runner-hand-on-the-far-stone'])
  expect(checks[3].detail).toContain('after the shutter, the contact hold had ended')
})

it('fails loudly when every stand stays occluded for the whole hold', async () => {
  const { checks, frames, stands } = await sample(hold(1, 9), WOMAN)
  expect(checks.map((c) => c.pass)).toEqual([true, true, false, false])
  expect(frames).toEqual([])
  expect(new Set(stands.map((s) => s % 4)).size).toBe(4)
  expect(checks[3].detail).toContain('no clear stand within the hold')
})
