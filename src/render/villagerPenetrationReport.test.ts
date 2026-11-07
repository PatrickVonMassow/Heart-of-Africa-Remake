// @vitest-environment node
// The garment penetration report (scripts/villager/penetration.py) counts
// only VISIBLE show-through and names every remaining case; in the build pose
// its numbers are never worse than main's report measured by the same step
// before the visible-only count (penetration-report-main.json; the motion
// comparison is pending, below).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { VILLAGER_ASSET } from '../config/balance'
import { parseVillager } from './villagerAsset'
import type { ShellSet } from './villagerShell'

type Column = 'cloth' | 'shown' | 'hole' | 'cut' | 'inner' | 'innerHole'
interface Garment {
  checked: number
  /** the frames measured per clip (pose × corner) */
  checkedClips: Record<string, number>
  clips: Record<string, number>
  cases: Record<string, { value: number; at: string; over: number }>
}
/** penetration.py shell_rows: one shell's three rows */
interface ShellRow {
  checked: number
  own: { min: number; max: number; under: number; at: string | null; off: number }
  other: { frames: number; cases: [number, string, string, string][] }
  legacy: Record<string, { value: number; at: string | null; frames: number }>
}
interface Report {
  tolerance: number
  build: Record<string, Garment & Record<Column, { value: number }>>
  garments: Record<string, Garment & Record<Column, { value: number }>>
  /** the shell garments' own rows (render/villagerShell.ts) */
  shells?: Record<string, ShellRow>
}

const dir = resolve(__dirname, '../../verification/villager-body')
const now = JSON.parse(readFileSync(resolve(dir, 'penetration-report.json'), 'utf8')) as Report
const main = JSON.parse(readFileSync(resolve(dir, 'penetration-report-main.json'), 'utf8')) as Report
const md = readFileSync(resolve(dir, 'penetration-report.md'), 'utf8')
// the garments migrated to shells: measured in their own rows, main's legacy
// rows of them not compared (penetration.py compare)
const MIGRATED = ['g-neckBeads-chest', 'g-neckBeads-neck', 'g-trousers-waist', 'g-waistBeads-waist']
const legacyOf = <T,>(r: Record<string, T>) => Object.keys(r).filter((n) => !MIGRATED.includes(n)).sort()
// the 1890 Western garments (point 1379), which main never measured: legacy
// garments and shells
const NEW_LEGACY = ['g-coat-chest', 'g-gown-chest', 'g-tarboosh-crown']
const NEW_SHELLS = ['g-boots-feet', 'g-shoes-feet', 'g-trousersLong-waist']
const SHELLS = [...MIGRATED, ...NEW_SHELLS].sort()

// the build-pose layering residuals named in docs/backlog.md (point 1346):
// garment → the outer garments it may show through in the build pose
const BUILD_RESIDUALS: Record<string, string[]> = {
  'g-wrapLong-chest': ['g-breastCloth-chest'],
  'g-veil-face': ['g-shirt-chest', 'g-robe-chest', 'g-cape-leftShoulder', 'g-cloak-chest', 'g-cape-chest', 'g-cloak-bothShoulders'],
}
// build-pose residuals at a body corner no CAST_DRESS cell dresses in that
// garment (docs/backlog.md, point 1379): garment → the one case key it may
// carry, the corners its worst frame may stand at, and a ceiling
interface Unworn { key: string; corner: RegExp; max: number }
const UNWORN_BUILD_RESIDUALS: Record<string, Unworn> = {
  // the coat is worn by male figures only; upperArm.L at the female corners
  'g-coat-chest': { key: 'shown build upperArm.L None', corner: /\(female (adult|elder) build/, max: 0.004 },
}
type BuildEntry = Pick<Garment, 'cases'> & Record<Column, { value: number }>
/** The build column `col` of garment `n` is the named unworn residual: its
 *  value stays under the ceiling and every case of that column is the named
 *  key at a named corner. A case at another part or corner, or a worse value,
 *  is not covered. */
function unworn(n: string, g: BuildEntry, col: string): boolean {
  const u = UNWORN_BUILD_RESIDUALS[n]
  if (!u || u.key.split(' ')[0] !== col || !(g[col as Column]?.value <= u.max)) return false
  const cases = Object.entries(g.cases).filter(([k]) => k.split(' ')[0] === col)
  return cases.length > 0 && cases.every(([k, e]) => k === u.key && u.corner.test(e.at) && e.value <= u.max)
}

// penetration.py DERIVED: a clip main never measured → the clips it is made from
const DERIVED: Record<string, string[]> = { jog: ['walk', 'sprint'], shoulders: ['idle'] }

// mask.py LAYER by slot (src/systems/appearance.ts LayerSlot), innermost first
const LAYER: Record<string, number> = {
  ...Object.fromEntries(['limbRings', 'neckBeads', 'waistBeads'].map((f) => [f, 0])),
  ...Object.fromEntries(
    ['loinFlap', 'girdleTails', 'apron', 'skirtShort', 'skirtKnee', 'wrapLong', 'trousers', 'trousersLong'].map((f) => [f, 1]),
  ),
  ...Object.fromEntries(['shoes', 'boots'].map((f) => [f, 0])),
  ...Object.fromEntries(['cap', 'hairBag', 'headRing', 'headband', 'topknot', 'turban', 'veil', 'tarboosh'].map((f) => [f, 1])),
  ...Object.fromEntries(['breastCloth', 'shirt', 'robe', 'toga', 'coat', 'gown'].map((f) => [f, 2])),
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
        if (part === r.build && unworn(n, g, key.split(' ')[0])) continue
        if (v > limit(key.split(' ')[0]) && v > was + 0.0005) out.push(`${n} ${key}: ${was} → ${v}`)
      }
    }
  }
  return out
}

describe('the visible-only penetration report', () => {
  let exported: string[] = []
  let shellSet: ShellSet | null = null
  beforeAll(async () => {
    const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
    const asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    exported = Object.keys(asset.clips)
    shellSet = asset.shells
  })

  it('measures every clip the asset exports that main never measured, with the columns of the clips it derives from', () => {
    const derived = exported.filter((c) => c in DERIVED)
    // the jog is exported; a derived clip the asset drops is no coverage gap
    expect(derived).toContain('jog')
    const cols = (g: Garment, clip: string) => Object.keys(g.clips).filter((k) => k.split(' ')[1] === clip).map((k) => k.split(' ')[0])
    for (const [n, g] of Object.entries(now.garments)) {
      for (const c of derived) {
        expect(g.checkedClips[c] ?? 0, `${n} ${c}`).toBeGreaterThan(0)
        const want = new Set(DERIVED[c].flatMap((src) => cols(g, src)))
        expect([...want].filter((col) => !cols(g, c).includes(col)), `${n} ${c}`).toEqual([])
        expect(want.size, `${n} ${c}`).toBeGreaterThan(0)
      }
    }
  })

  it('names the migrated garments as migrated and measures them in their own shell rows', () => {
    expect(Object.keys(now.shells ?? {}).sort()).toEqual(SHELLS)
    for (const n of MIGRATED) {
      expect(now.garments[n], n).toBeUndefined()
      expect(now.build[n], n).toBeUndefined()
      // a report compared against main (--baseline) names them, never as unchecked
      const against = md.split('## Against main')[1]
      if (against && (n in main.garments || n in main.build)) expect(against, n).toContain(`\`${n}\` migrated`)
    }
  })

  // coverage, finite values and sanity bounds only: no penetration threshold
  // is a gate (point 1339); the shell rows are information
  it('measures every migrated shell over every exported pose at every corner, finite and within sanity bounds', () => {
    expect(shellSet, 'the asset carries its shell set').not.toBeNull()
    const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x)
    // shell_rows walks the exported clips at every corner, the legacy rows add the shoulders clip
    const anyLegacy = Object.values(now.garments)[0]
    const poses = anyLegacy.checked - (anyLegacy.checkedClips.shoulders ?? 0)
    expect(poses).toBeGreaterThan(0)
    for (const n of SHELLS) {
      const r = now.shells?.[n]
      expect(r, n).toBeDefined()
      const { own, other, legacy } = r!
      expect(r!.checked, n).toBe(poses)
      // the offset the recipe gives, unscaled ((base + rank × step), shells.py offset)
      const g = shellSet!.garments[n]
      expect(own.off, n).toBeCloseTo(g.base + g.rank * shellSet!.step, 9)
      for (const x of [own.min, own.max, own.off, own.under]) expect(finite(x), `${n} row one ${x}`).toBe(true)
      expect(own.min, n).toBeGreaterThanOrEqual(0)
      expect(own.min, n).toBeLessThanOrEqual(own.max)
      // a shell stands at its offset from its own source's triangles
      expect(own.max, n).toBeLessThanOrEqual(own.off + shellSet!.step)
      expect(own.under, n).toBeLessThanOrEqual(r!.checked)
      expect(own.at, n).toMatch(/frame \d+/)
      expect(other.frames, n).toBeLessThanOrEqual(r!.checked)
      expect(other.cases.length, n).toBeLessThanOrEqual(Math.max(other.frames, 0))
      for (const [d, from, hit, at] of other.cases) {
        // row two searches within one offset
        expect(finite(d) && d >= 0 && d <= own.off + 1e-9, `${n} row two ${d}`).toBe(true)
        expect([from, hit, at].every((x) => typeof x === 'string' && x.length > 0), `${n} row two names`).toBe(true)
      }
      for (const [o, e] of Object.entries(legacy)) {
        expect(now.garments[o], `${n} under ${o}`).toBeDefined()
        expect(layer(o), `${n} under ${o}`).toBeGreaterThan(layer(n))
        expect(finite(e.value) && e.value >= 0, `${n} under ${o}: ${e.value}`).toBe(true)
        expect(e.frames, `${n} under ${o}`).toBeLessThanOrEqual(r!.checked)
        if (e.value > 0) expect(e.at, `${n} under ${o}`).toMatch(/frame \d+/)
      }
    }
  })

  it('measures every garment main measured, per column and clip', () => {
    expect(Object.keys(now.garments).sort()).toEqual([...legacyOf(main.garments), ...NEW_LEGACY].sort())
    for (const [n, g] of Object.entries(now.garments)) {
      if (NEW_LEGACY.includes(n)) {
        // main never measured it: its clips are the asset's own
        expect(Object.values(g.checkedClips).reduce((t, c) => t + c, 0), n).toBe(g.checked)
        expect(Object.keys(g.clips).length, n).toBeGreaterThan(0)
        continue
      }
      // main counts its frames over its own clips only; a clip main never
      // measured is one penetration.py compares with the clips it derives
      // from (DERIVED), and its frames come on top of main's, never instead
      const sum = (clips: string[]) => clips.reduce((t, c) => t + g.checkedClips[c], 0)
      const ofMain = new Set(Object.keys(main.garments[n].clips).map((k) => k.split(' ')[1]))
      const clips = Object.keys(g.checkedClips)
      expect(sum(clips), n).toBe(g.checked)
      expect(sum(clips.filter((c) => ofMain.has(c))), n).toBe(main.garments[n].checked)
      expect([...ofMain].filter((c) => !g.checkedClips[c]), n).toEqual([])
      expect(clips.filter((c) => !ofMain.has(c) && !(c in DERIVED)), n).toEqual([])
      expect(Object.keys(g.clips).length, n).toBeGreaterThan(0)
    }
  })

  it('drops no column and clip main measured, except layerings of the outermost layer', () => {
    // only a garment of an outer layer masks an inner one, so a garment of
    // the outermost layer has no layering left; every other key must remain
    const outermost = Math.max(...Object.values(LAYER))
    const missing: string[] = []
    for (const [n, g] of Object.entries(main.garments)) {
      if (MIGRATED.includes(n)) continue
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

  it('the unworn coat residual covers only its named case: a male corner, another part or a worse value is a regression', () => {
    const n = 'g-coat-chest'
    const u = UNWORN_BUILD_RESIDUALS[n]
    expect(unworn(n, now.build[n], 'shown'), 'the measured residual is the named one').toBe(true)
    const at = (patch: (g: BuildEntry) => void) => {
      const g = structuredClone(now.build[n])
      patch(g)
      return unworn(n, g, 'shown')
    }
    expect(at((g) => { g.cases[u.key].at = 'build frame 0 (male adult build +0)' })).toBe(false)
    expect(at((g) => { g.cases['shown build forearm.R None'] = { value: 0.0035, at: 'build frame 0 (female elder build +0)', over: 1 } })).toBe(false)
    expect(at((g) => { g.shown.value = g.cases[u.key].value = u.max + 0.001 })).toBe(false)
    expect(unworn(n, now.build[n], 'cut'), 'another column is not covered').toBe(false)
  })

  it('measures the build pose of every garment at every body corner, per column', () => {
    // an empty or partial build entry would pass the tolerance check below
    const outermost = Math.max(...Object.values(LAYER))
    expect(Object.keys(now.build).sort()).toEqual(Object.keys(now.garments).sort())
    expect(Object.keys(now.build).sort()).toEqual([...legacyOf(main.build), ...NEW_LEGACY].sort())
    // every garment's build pose is measured at the same corners
    const corners = main.build['g-robe-chest'].checked
    for (const [n, g] of Object.entries(now.build)) {
      expect(g.checked, n).toBeGreaterThan(0)
      expect(g.checked, n).toBe(NEW_LEGACY.includes(n) ? corners : main.build[n].checked)
      expect(Object.keys(g.clips).length, n).toBeGreaterThan(0)
      // every column main measured in the build pose (every column for a
      // garment main never measured), except layerings of the outermost layer
      // (as for the motion keys above)
      const want = NEW_LEGACY.includes(n) ? Object.keys(NAMES).map((c) => `${c} build`) : Object.keys(main.build[n].clips)
      for (const key of want) {
        const col = key.split(' ')[0]
        if ((col === 'inner' || col === 'innerHole') && layer(n) === outermost) continue
        expect(Object.keys(g.clips), n).toContain(key)
      }
    }
  })

  it('every garment fits its own build pose within tolerance at every body corner and layering', () => {
    // garmentPenetrationTolerance (0.003) for every column, cut too:
    // garmentMaskCutTolerance is the motion allowance, never the build pose's;
    // the report's own tolerance must be that value, not set the bar
    const tol = VILLAGER_ASSET.garmentPenetrationTolerance
    expect(now.tolerance).toBe(tol)
    expect(tol).toBeLessThanOrEqual(0.003)
    const over: string[] = []
    for (const [n, g] of Object.entries(now.build)) {
      // a named residual (docs/backlog.md 2026-10-12, with its missing
      // information) keeps exactly its inner layering cases, nothing else
      const allowed = BUILD_RESIDUALS[n] ?? []
      for (const col of Object.keys(NAMES) as Column[]) {
        if (g[col].value > tol && !(col === 'inner' && allowed.length) && !unworn(n, g, col)) over.push(`${n} ${col} ${g[col].value}`)
      }
      for (const [key, v] of Object.entries(g.clips)) {
        if (v > tol && !(key === 'inner build' && allowed.length) && !unworn(n, g, key.split(' ')[0])) over.push(`${n} ${key} ${v}`)
      }
      for (const key of Object.keys(g.cases)) {
        const [col, , , outer] = key.split(' ')
        expect((col === 'inner' && allowed.includes(outer)) || unworn(n, g, col), `${n}: ${key}`).toBe(true)
      }
    }
    expect(over).toEqual([])
    const total = Object.keys(now.build).length
    const residuals = [...Object.keys(BUILD_RESIDUALS), ...Object.keys(UNWORN_BUILD_RESIDUALS)].filter((n) => Object.keys(now.build[n]?.cases ?? {}).length).length
    expect(md).toContain(`**${total - residuals} of ${total} garments within tolerance in the build pose`)
    const backlog = readFileSync(resolve(__dirname, '../../docs/backlog.md'), 'utf8')
    for (const n of [...Object.keys(BUILD_RESIDUALS), ...Object.keys(UNWORN_BUILD_RESIDUALS)]) expect(backlog, n).toContain(`\`${n}\``)
  })

  // the markdown names each garment's MD_CASES (penetration.py) worst cases and
  // counts the rest; the json keeps every case
  it('the report hands each garment\'s worst cases to point 1347 by name and counts the rest', () => {
    const shown = 3
    const section = md.split('## Remaining visible cases (handed to work-order point 1347)')[1]?.split('\n## ')[0]
    expect(section).toBeDefined()
    const lines = section!.split('\n')
    let checked = 0
    for (const [n, g] of Object.entries(now.garments)) {
      const cases = Object.entries({ ...now.build[n].cases, ...g.cases }).sort((a, b) => b[1].value - a[1].value)
      if (!cases.length) continue
      const line = lines.find((l) => l.startsWith('- `' + n + '`: '))
      expect(line, n).toBeDefined()
      cases.forEach(([key, e], i) => {
        // the case's garment, column, clip, body part and outer garment, together
        const [col, clip, part, outer] = key.split(' ')
        const under = outer && outer !== 'None' ? ` under \`${outer}\`` : ''
        const text = `${NAMES[col as Column]} — ${part} — ${clip}${under} — ${e.value.toFixed(4)} (${e.at}), ${e.over} frames`
        // a case tied in value with the last one shown may stand either side of the cut
        if (i < shown || e.value === cases[shown - 1][1].value) {
          if (i < shown) expect(line!.includes(text), `${n} ${key}: ${text}`).toBe(true)
        } else expect(line!.includes(text), `${n} ${key} is past the cut`).toBe(false)
        checked++
      })
      const more = cases.length - shown
      expect(line!.endsWith(`; … and ${more} more (penetration-report.json)`), n).toBe(more > 0)
    }
    expect(checked).toBeGreaterThan(0)
  })
})
