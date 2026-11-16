import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

// The encounter section's log readings (work-order 360), lifted out of the
// browser: which parting belongs to a pair's latest meeting, and which meeting
// outlasted its window — including an open one whose countdown stalled.
const source = readFileSync('scripts/verify/polish-villagers.mjs', 'utf8')
const start = source.indexOf('// encounter-readings:start')
const end = source.indexOf('// encounter-readings:end', start)
if (start < 0 || end < 0) throw new Error('Encounter readings block missing')
const readings = new Function(`${source.slice(start, end)}\nreturn encounterReadings`)()

const meet = (a, b, sim) => ({ kind: 'meet', a, b, sim, t: sim })
const part = (a, b, sim) => ({ kind: 'part', a, b, sim, t: sim })

it('pairs the latest meeting with the parting that follows it, not an earlier one', () => {
  const log = [meet(1, 2, 10), part(1, 2, 14), meet(2, 1, 40)]
  expect(readings.latestParting(log, 1, 2)).toBeNull()
  const r = readings.latestParting([...log, part(1, 2, 44)], 1, 2)
  expect(r.part.sim - r.meet.sim).toBe(4)
})

it('passes meetings that parted and stay open inside their window', () => {
  const e = { log: [meet(1, 2, 10), part(1, 2, 14), meet(3, 4, 20)], meetings: [{ a: 3, b: 4, remaining: 2, total: 4 }], lifeClock: 22 }
  expect(readings.late(e, 4.25)).toEqual([])
})

it('flags a parted meeting past its window', () => {
  const e = { log: [meet(1, 2, 10), part(1, 2, 16)], meetings: [], lifeClock: 30 }
  expect(readings.late(e, 4.25)).toEqual(['1/2 6.00 s'])
})

it('flags an open meeting whose countdown stalled while life ran on', () => {
  // `remaining` sits inside its bounds forever; only the life clock shows it.
  const e = { log: [meet(3, 4, 20)], meetings: [{ a: 3, b: 4, remaining: 2, total: 4 }], lifeClock: 60 }
  expect(readings.late(e, 4.25)).toEqual(['open 3/4 for 40.00 s'])
})

it('flags an open meeting with no logged start', () => {
  const e = { log: [], meetings: [{ a: 3, b: 4, remaining: 2, total: 4 }], lifeClock: 5 }
  expect(readings.late(e, 4.25)).toEqual(['open 3/4 without a logged start'])
})

it('serialises into a page object whose methods keep their `this`', () => {
  const src = `{ ${Object.entries(readings).map(([k, f]) => (k === 'samePair' ? `samePair: ${f}` : `${f}`)).join(',\n')} }`
  const paged = new Function('return (' + src + ')')()
  expect(paged.latestParting([meet(1, 2, 0), part(2, 1, 4)], 2, 1).part.sim).toBe(4)
})
