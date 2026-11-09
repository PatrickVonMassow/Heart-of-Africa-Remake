// The frame-131 fire reading (grassFireReading.mjs): it passes a frame that
// SHOWS a burning front over a sooted scar with smoke, and fails each way a
// frame can lack it — above all the fire switched off (the negative control).

import { describe, it, expect } from 'vitest'
import { boxOf, readFireFrame, regionStats } from './grassFireReading.mjs'

/** A crop of `n` pixels, `share` of them `a` and the rest `b` (RGB). */
function crop(n, a, b = a, share = 1) {
  const out = new Uint8Array(n * 3)
  for (let i = 0; i < n; i++) out.set(i < n * share ? a : b, i * 3)
  return out
}

const GRASS = [176, 150, 96] // cured savanna under the sun
const SCAR = [40, 34, 30] // sooted ground
const FLAME = [255, 196, 90]
const EMBER = [230, 120, 40]
const SMOKE_OVER_SCAR = [96, 92, 88]

const live = () => ({
  front: regionStats(crop(400, FLAME, EMBER, 0.3), 3),
  scar: regionStats(crop(400, SCAR), 3),
  unburnt: regionStats(crop(400, GRASS), 3),
  smoke: regionStats(crop(400, SMOKE_OVER_SCAR, SCAR, 0.4), 3),
})

describe('reading the burning grass in frame 131', () => {
  it('passes a frame that shows the front, the scar and the smoke', () => {
    const v = readFireFrame(live())
    expect(v.failed).toEqual([])
    expect(v.pass).toBe(true)
  })

  it('FAILS with the fire switched off: every crop is plain savanna (negative control)', () => {
    const plain = regionStats(crop(400, GRASS), 3)
    const v = readFireFrame({ front: plain, scar: plain, unburnt: plain, smoke: plain })
    expect(v.pass).toBe(false)
    expect(v.failed).toEqual(expect.arrayContaining(['no flame at the front', 'scar not darker than unburnt savanna', 'no smoke behind the line']))
  })

  it('fails the aftermath: a scar with no front burning on it', () => {
    const v = readFireFrame({ ...live(), front: regionStats(crop(400, SCAR), 3), smoke: regionStats(crop(400, SCAR), 3) })
    expect(v.pass).toBe(false)
    expect(v.failed).toContain('no flame at the front')
  })

  it('fails an orange scar (blocks that do not read as burnt earth)', () => {
    const v = readFireFrame({ ...live(), scar: regionStats(crop(400, [210, 110, 40]), 3) })
    expect(v.pass).toBe(false)
    expect(v.failed).toContain('scar not darker than unburnt savanna')
  })

  it('does not count warm grass as smoke, nor grey as flame', () => {
    const g = regionStats(crop(100, GRASS), 3)
    expect(g.smokeShare).toBe(0)
    expect(g.flameShare).toBe(0)
    const s = regionStats(crop(100, SMOKE_OVER_SCAR), 3)
    expect(s.smokeShare).toBe(1)
    expect(s.flameShare).toBe(0)
  })

  it('boxes projected points inside the viewport and refuses a crop off screen', () => {
    expect(boxOf([{ x: 10, y: 20 }, { x: 60, y: 50 }], 800, 600)).toEqual({ left: 10, top: 20, width: 50, height: 30 })
    expect(boxOf([{ x: -50, y: 20 }, { x: -10, y: 50 }], 800, 600)).toBeNull()
    expect(boxOf([{ x: 790, y: 590 }, { x: 900, y: 700 }], 800, 600)).toEqual({ left: 790, top: 590, width: 10, height: 10 })
  })
})
