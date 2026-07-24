// Currency check for docs/graphics-detail-levels.md (design.md §21, point 276).
// The human-readable per-level breakdown of QUALITY_PRESETS must never drift
// from the code: this test parses the doc's value table and asserts every
// quality key appears as a row and each level's value matches the registry
// EXACTLY. It FAILS if a preset value changes or a key is added/removed without
// updating the doc — so `npm run test:unit` (hence every regression and closing
// cycle) keeps the doc honest. This is the enforced "sichere Mechanik", not a
// reminder.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QUALITY_PRESETS, QUALITY_KEYS, DETAIL_LEVELS } from './quality'

const DOC_PATH = resolve(process.cwd(), 'docs/graphics-detail-levels.md')

/** Canonical string form of a preset value, shared by the code side and the doc
 *  side so the comparison is formatting-robust: null → "native", booleans →
 *  "on"/"off", numbers → their plain decimal string. */
function canon(v: unknown): string {
  if (v === null) return 'native'
  if (v === true) return 'on'
  if (v === false) return 'off'
  return String(v)
}

/** Normalise a raw markdown table cell to the canonical form: strip backticks,
 *  surrounding whitespace and lower-case the keyword spellings. */
function canonCell(raw: string): string {
  return raw.replace(/`/g, '').trim().toLowerCase()
}

/** Parse the doc's per-level value table into { key -> {low, medium, high} }.
 *  Only the four-column value table (Setting | Low | Medium | High) is read;
 *  the prose bullets below carry no machine-checked values. */
function parseDocTable(md: string): Record<string, Record<string, string>> {
  const rows: Record<string, Record<string, string>> = {}
  for (const line of md.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    // Split the pipe-delimited row and drop the empty leading/trailing cells.
    const cells = trimmed.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length !== 4) continue
    const key = canonCell(cells[0])
    // Skip the header row and the separator row (--- / :---:).
    if (key === 'setting' || /^:?-{2,}:?$/.test(key)) continue
    rows[key] = { low: canonCell(cells[1]), medium: canonCell(cells[2]), high: canonCell(cells[3]) }
  }
  return rows
}

describe('graphics-detail-levels.md stays in sync with QUALITY_PRESETS (point 276 currency gate)', () => {
  const md = readFileSync(DOC_PATH, 'utf8')
  const table = parseDocTable(md)

  it('has exactly one row per quality key — no missing, no extra rows', () => {
    const docKeys = Object.keys(table).sort()
    const codeKeys = QUALITY_KEYS.map((k) => k.toLowerCase()).sort()
    expect(docKeys).toEqual(codeKeys)
  })

  it('every documented value matches the preset value for every level', () => {
    for (const key of QUALITY_KEYS) {
      const row = table[key.toLowerCase()]
      expect(row, `doc row for "${String(key)}" is missing`).toBeDefined()
      for (const level of DETAIL_LEVELS) {
        const expected = canon(QUALITY_PRESETS[level][key])
        expect(
          row[level],
          `docs/graphics-detail-levels.md: ${String(key)} @ ${level} should be "${expected}" but the table says "${row[level]}"`,
        ).toBe(expected)
      }
    }
  })

  it('names the F9 cycle and the medium default so the doc explains the feature', () => {
    expect(md).toMatch(/\bF9\b/)
    expect(md.toLowerCase()).toContain('medium')
    // The declared-but-not-yet-consumed keys are called out honestly.
    expect(md.toLowerCase()).toContain('watercalm')
    expect(md.toLowerCase()).toContain('wildlifedensity')
  })
})
