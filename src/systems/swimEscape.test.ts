// The pure swim-escapability sweep (design.md §11.2/§11.3, point 316), tested
// on hand-drawn water fields so the rule itself is pinned independently of the
// real world: a pocket whose current outruns the swimmer is reported, the same
// pocket in slack water is not, and no exit is ever routed through impassable
// ocean.
import { describe, it, expect } from 'vitest'
import { findSwimTraps, ESCAPE_HEADWAY, type SwimCell } from './swimEscape'

const STEP = 0.1
const SWIM = 1.0

/**
 * Build a sampler from an ASCII field: '#' impassable ocean, '.' land, 'W'
 * water with a strong seaward (northward) current, 'w' water with slack
 * current, '~' still water. The FIRST row is the northernmost, as in a map.
 */
function field(rows: string[]): {
  sample: (lat: number, lon: number) => SwimCell
  radiusDeg: number
} {
  const h = rows.length
  const w = rows[0].length
  const drift: Record<string, [number, number]> = {
    W: [1.5, 0], // north, half again the swim speed
    w: [0.2, 0],
    '~': [0, 0],
  }
  return {
    radiusDeg: (STEP * (w - 1)) / 2,
    sample: (lat: number, lon: number): SwimCell => {
      const r = Math.round(lat / STEP) + (h - 1) / 2
      const c = Math.round(lon / STEP) + (w - 1) / 2
      const ch = rows[h - 1 - r]?.[c] ?? '#'
      const d = drift[ch] ?? [0, 0]
      return { blocked: ch === '#', water: ch in drift, driftLat: d[0], driftLon: d[1] }
    },
  }
}

const sweep = (rows: string[]) => {
  const f = field(rows)
  return findSwimTraps({ lat: 0, lon: 0 }, f.sample, {
    stepDeg: STEP,
    radiusDeg: f.radiusDeg,
    swimSpeedDeg: SWIM,
  })
}

describe('findSwimTraps', () => {
  // A blind channel poking into impassable sea — the shape of the reported
  // Nile mouth: the only way out leads back against the current.
  const funnel = [
    '#######',
    '###W###',
    '###W###',
    '###W###',
    '#.WWW.#',
    '#.....#',
    '#######',
  ]

  it('reports the pocket a too-strong current pushes into', () => {
    const out = sweep(funnel)
    expect(out.trapped.length).toBe(3)
    // All three sit in the blind channel: its own column, north of the reach.
    for (const c of out.trapped) {
      expect(c.lon).toBeCloseTo(0, 9)
      expect(c.lat).toBeGreaterThanOrEqual(0)
    }
  })

  it('clears the very same pocket once the current slackens', () => {
    const slack = funnel.map((row) => row.replace(/W/g, 'w'))
    const out = sweep(slack)
    expect(out.trapped).toEqual([])
    expect(out.swimCells).toBe(6)
  })

  it('leaves an open reach alone however hard it runs', () => {
    // Banks on both sides: the current carries him downstream, and he lands.
    const out = sweep([
      '.......',
      '..WWW..',
      '..WWW..',
      '..WWW..',
      '..WWW..',
      '..WWW..',
      '.......',
    ])
    expect(out.trapped).toEqual([])
    expect(out.swimCells).toBe(15)
  })

  it('never routes an exit through impassable ocean', () => {
    // Land lies one cell beyond the blocked ring — unreachable through it.
    const out = sweep([
      '.......',
      '.#####.',
      '.#~~~#.',
      '.#~~~#.',
      '.#~~~#.',
      '.#####.',
      '.......',
    ])
    expect(out.trapped.length).toBe(9)
  })

  it('counts the WORSE endpoint of a step, so no half-step buys an exit', () => {
    // The land is due south, but the cell in front of it runs hard north: a
    // swimmer entering it loses more than the headway allows.
    const out = sweep([
      '#####',
      '#~~~#',
      '#WWW#',
      '#...#',
      '#####',
    ])
    expect(out.trapped.length).toBe(6)
  })

  it('treats the window rim as open water left behind', () => {
    // The channel runs out of the swept window: reaching the rim IS the exit.
    const out = sweep([
      '##W##',
      '##W##',
      '##W##',
      '##W##',
      '##W##',
    ])
    expect(out.trapped).toEqual([])
  })

  it('finds nothing to report on dry land', () => {
    const out = sweep(['.....', '.....', '.....', '.....', '.....'])
    expect(out.swimCells).toBe(0)
    expect(out.trapped).toEqual([])
  })

  it('honours an explicit headway demand', () => {
    // At the default headway the slack channel is escapable; demanding nearly
    // the full swim speed as net progress condemns it.
    const slack = funnel.map((row) => row.replace(/W/g, 'w'))
    const f = field(slack)
    const strict = findSwimTraps({ lat: 0, lon: 0 }, f.sample, {
      stepDeg: STEP,
      radiusDeg: f.radiusDeg,
      swimSpeedDeg: SWIM,
      minNetSpeedDeg: 0.95 * SWIM,
    })
    expect(strict.trapped.length).toBeGreaterThan(0)
    expect(ESCAPE_HEADWAY).toBeLessThan(0.95)
  })
})
