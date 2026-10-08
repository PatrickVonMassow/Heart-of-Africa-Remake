// @vitest-environment node
// The garment penetration report (scripts/villager/penetration.py) counts
// only VISIBLE show-through and names every remaining case; its numbers are
// never worse than main's report measured by the same step before the
// visible-only count (penetration-report-main.json).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VILLAGER_ASSET } from '../config/balance'

type Column = 'cloth' | 'shown' | 'hole' | 'cut' | 'inner' | 'innerHole'
interface Garment {
  checked: number
  clips: Record<string, number>
  cases: Record<string, { value: number; at: string; over: number }>
}
interface Report {
  tolerance: number
  build: Record<string, Garment & Record<Column, { value: number }>>
  garments: Record<string, Garment & Record<Column, { value: number }>>
}

const dir = resolve(__dirname, '../../verification/villager-body')
const now = JSON.parse(readFileSync(resolve(dir, 'penetration-report.json'), 'utf8')) as Report
const main = JSON.parse(readFileSync(resolve(dir, 'penetration-report-main.json'), 'utf8')) as Report
const md = readFileSync(resolve(dir, 'penetration-report.md'), 'utf8')

// mask.py LAYER by slot (src/systems/appearance.ts LayerSlot), innermost first
const LAYER: Record<string, number> = {
  ...Object.fromEntries(['limbRings', 'neckBeads', 'waistBeads'].map((f) => [f, 0])),
  ...Object.fromEntries(
    ['loinFlap', 'girdleTails', 'apron', 'skirtShort', 'skirtKnee', 'wrapLong', 'trousers'].map((f) => [f, 1]),
  ),
  ...Object.fromEntries(['cap', 'hairBag', 'headRing', 'headband', 'topknot', 'turban', 'veil'].map((f) => [f, 1])),
  ...Object.fromEntries(['breastCloth', 'shirt', 'robe', 'toga'].map((f) => [f, 2])),
  ...Object.fromEntries(['cape', 'cloak', 'hood'].map((f) => [f, 3])),
}
const layer = (name: string) => LAYER[name.split('-')[1]]
const limit = (col: string) => (col === 'cut' ? VILLAGER_ASSET.garmentMaskCutTolerance : now.tolerance)

describe('the visible-only penetration report', () => {
  it('measures every garment main measured, per column and clip', () => {
    expect(Object.keys(now.garments).sort()).toEqual(Object.keys(main.garments).sort())
    for (const [n, g] of Object.entries(now.garments)) {
      expect(g.checked, n).toBe(main.garments[n].checked)
      expect(Object.keys(g.clips).length, n).toBeGreaterThan(0)
    }
  })

  it('drops no column and clip main measured, except layerings of the outermost layer', () => {
    // only a garment of an outer layer masks an inner one, so a garment of
    // the outermost layer has no layering left; every other key must remain
    const outermost = Math.max(...Object.values(LAYER))
    const missing: string[] = []
    for (const [n, g] of Object.entries(main.garments)) {
      for (const key of Object.keys(g.clips)) {
        if (key in now.garments[n].clips) continue
        const col = key.split(' ')[0]
        if ((col === 'inner' || col === 'innerHole') && layer(n) === outermost) continue
        missing.push(`${n} ${key}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('names every value over tolerance as a case: column, clip, body part, outer garment', () => {
    for (const [n, g] of [...Object.entries(now.build), ...Object.entries(now.garments)]) {
      for (const [key, v] of Object.entries(g.clips)) {
        if (v <= limit(key.split(' ')[0])) continue
        const named = Object.entries(g.cases).filter(([k]) => k.startsWith(key + ' '))
        expect(named.length, `${n} ${key}`).toBeGreaterThan(0)
        expect(Math.max(...named.map(([, e]) => e.value)), `${n} ${key}`).toBeCloseTo(v, 6)
      }
    }
  })

  it('a layering is counted only under a garment of an outer layer', () => {
    for (const [n, g] of Object.entries(now.garments)) {
      for (const k of Object.keys(g.cases)) {
        const [col, , , outer] = k.split(' ')
        if (col !== 'inner' && col !== 'innerHole') continue
        expect(layer(outer), `${n} under ${outer}`).toBeGreaterThan(layer(n))
      }
    }
  })

  it('no garment, column and clip is worse than on main', () => {
    const worse: string[] = []
    for (const [n, g] of Object.entries(now.garments)) {
      for (const [key, v] of Object.entries(g.clips)) {
        const b = main.garments[n].clips[key] ?? 0
        if (v > limit(key.split(' ')[0]) && v > b + 0.0005) worse.push(`${n} ${key}: ${b} → ${v}`)
      }
    }
    expect(worse).toEqual([])
  })

  it('the report hands every remaining case to point 1332 by name', () => {
    const section = md.split('## Remaining visible cases (handed to work-order point 1332)')[1]
    expect(section).toBeDefined()
    for (const [n, g] of Object.entries(now.garments)) {
      if (Object.keys(g.cases).length || Object.keys(now.build[n].cases).length) expect(section, n).toContain('`' + n + '`')
    }
  })
})
