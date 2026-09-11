// Exercise the actual sampler with scene readings; no browser or renderer runs.
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const source = readFileSync('scripts/verify/polish.mjs', 'utf8')
const start = source.indexOf('    // ARRIVAL CONTACT (work-order 1106).')
const end = source.indexOf('\n  }\n\n  // The world goes back', start)
if (start < 0 || end < 0) throw new Error('Arrival sampler block missing')
const runSampler = new (Object.getPrototypeOf(async function () {}).constructor)(
  'page', 'restoreEarshotStance', 'check', 'frame', 'aimAtTap', 'nextFrames', 'contactBar',
  source.slice(start, end),
)

function hold(clock, heardFrom, gap = 0.001, gesture = 'touch') {
  const opening = { clock, heardFrom, gap }
  return Array.from({ length: 91 }, (_, i) => ({
    tapper: 1, clock: clock + i / 10, opening, arrivalFor: 9 - i / 10,
    gap, gesture, x: 1, y: 0.5, z: 2,
  }))
}

async function sample(readings) {
  let index = 0
  const checks = []
  const frames = []
  const previousBalance = window.__balance
  const previousReader = window.__placeArrivalHand
  window.__balance = { villageLife: { bankGame: { arrivalHoldSeconds: 2 } }, communication: { hearingRadius: 10 } }
  window.__placeArrivalHand = () => readings[Math.min(index, readings.length - 1)] ?? null
  try {
    await runSampler(
      { evaluate: async (fn, arg) => fn(arg) }, async () => {},
      (name, pass, detail) => checks.push({ name, pass, detail }),
      async (name) => frames.push(name), async () => true, async () => { index++ }, 0.005,
    )
  } finally {
    if (previousBalance === undefined) delete window.__balance
    else window.__balance = previousBalance
    if (previousReader === undefined) delete window.__placeArrivalHand
    else window.__placeArrivalHand = previousReader
  }
  return { checks, frames }
}

it('reads the whole first audible hold after an unheard arrival with its arm at rest', async () => {
  const { checks, frames } = await sample([...hold(1, 10.4344, 0.6605, null), ...hold(11, 9)])
  expect(checks).toHaveLength(3)
  expect(checks.every((c) => c.pass)).toBe(true)
  expect(checks[0].detail).toContain('1 unheard openings before acquisition')
  expect(frames).toEqual(['1106-arriving-runner-hand-on-the-far-stone'])
})

it('fails an audible missing arm instead of searching for a later good hold', async () => {
  const { checks, frames } = await sample([...hold(1, 9, 0.6605, null), ...hold(11, 9)])
  expect(checks.map((c) => c.pass)).toEqual([true, false, false])
  expect(frames).toEqual([])
})

it('keeps a bad word frame in the worst reading even if the rest of the hold touches', async () => {
  const readings = hold(1, 9)
  readings[0].opening.gap = 0.06
  const { checks } = await sample(readings)
  expect(checks.map((c) => c.pass)).toEqual([true, false, true])
})

it('fails when no audible arrival offers a hold or a photograph', async () => {
  const { checks, frames } = await sample(hold(1, 10.4344, 0.6605, null))
  expect(checks.map((c) => !!c.pass)).toEqual([false, false, false])
  expect(frames).toEqual([])
})

it('keeps a later bad contact frame in the acquired hold', async () => {
  const readings = hold(1, 9)
  readings[40].gap = 0.06
  const { checks } = await sample(readings)
  expect(checks.map((c) => c.pass)).toEqual([true, false, true])
})
