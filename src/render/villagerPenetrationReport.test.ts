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

// penetration.py NAMES: how the report's md names each column
const NAMES: Record<Column, string> = {
  cloth: 'cloth in the body',
  shown: 'skin through the cloth',
  hole: 'hidden skin out by an opening',
  cut: 'hidden skin past the cloth',
  inner: 'inner garment through the cloth',
  innerHole: 'hidden inner garment out by an opening',
}

/** Every garment, column and clip of `r` over tolerance and more than 0.0005
 *  above `base` (penetration.py report): the build pose against main's build
 *  pose, every other pose against main's. */
function worseThanMain(r: Report, base: Report, buildOnly = false): string[] {
  const out: string[] = []
  for (const [part, b] of [
    [r.build, base.build],
    ...(buildOnly ? [] : [[r.garments, base.garments] as const]),
  ] as const) {
    for (const [n, g] of Object.entries(part)) {
      for (const [key, v] of Object.entries(g.clips)) {
        const was = b[n]?.clips[key] ?? 0
        if (v > limit(key.split(' ')[0]) && v > was + 0.0005) out.push(`${n} ${key}: ${was} → ${v}`)
      }
    }
  }
  return out
}

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

  // Owner decision 10.10.2026 (TASKS.md point 1332): point 1332 is gated
  // against main in the build pose only; the motion comparison below is the
  // merge gate of point 1334, which un-skips it.
  it('no garment, column and clip is worse than on main in the build pose', () => {
    expect(main.build, 'main measured the build pose').toBeDefined()
    expect(worseThanMain(now, main, true)).toEqual([])
  })

  // PENDING (point 1334 restores it): the motion comparison against main.
  it.skip('no garment, column and clip is worse than on main, in the build pose or any other', () => {
    expect(main.build, 'main measured the build pose').toBeDefined()
    expect(worseThanMain(now, main)).toEqual([])
    const against = md.split('## Against main')[1]
    expect(against).toContain('No garment, column and clip is worse than on main, in the build pose or any other.')
  })

  it('a build-pose regression is worse than main though every other pose is unchanged', () => {
    const g = 'g-robe-chest'
    const raised = structuredClone(now)
    raised.garments = structuredClone(main.garments)
    raised.build[g].clips['cloth build'] = (main.build[g].clips['cloth build'] ?? 0) + now.tolerance + 0.01
    expect(worseThanMain(raised, main)).toEqual([expect.stringContaining(`${g} cloth build`)])
  })

  it('every garment fits its own build pose within tolerance at every body corner and layering', () => {
    const over: string[] = []
    for (const [n, g] of Object.entries(now.build)) {
      for (const col of Object.keys(NAMES) as Column[]) {
        if (g[col].value > limit(col)) over.push(`${n} ${col} ${g[col].value}`)
      }
      expect(Object.keys(g.cases), n).toEqual([])
    }
    expect(over).toEqual([])
    expect(md).toContain(`**${Object.keys(now.build).length} of ${Object.keys(now.build).length} garments within tolerance in the build pose`)
  })

  it('the report hands every remaining case to point 1334 by name', () => {
    const section = md.split('## Remaining visible cases (handed to work-order point 1334)')[1]?.split('\n## ')[0]
    expect(section).toBeDefined()
    const lines = section!.split('\n')
    let checked = 0
    for (const [n, g] of Object.entries(now.garments)) {
      const line = lines.find((l) => l.startsWith('- `' + n + '`: '))
      for (const [key, e] of [...Object.entries(now.build[n].cases), ...Object.entries(g.cases)]) {
        // the case's garment, column, clip, body part and outer garment, together
        const [col, clip, part, outer] = key.split(' ')
        const under = outer && outer !== 'None' ? ` under \`${outer}\`` : ''
        const text = `${NAMES[col as Column]} — ${part} — ${clip}${under} — ${e.value.toFixed(4)} (${e.at}), ${e.over} frames`
        expect(line, `${n} ${key}`).toBeDefined()
        expect(line!.includes(text), `${n} ${key}: ${text}`).toBe(true)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})
