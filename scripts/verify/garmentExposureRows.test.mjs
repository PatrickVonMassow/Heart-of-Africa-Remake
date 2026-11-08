import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

// The garment-acceptance rows of polish-villagers.mjs, built headless: the
// exposure rule (no view opens onto covered skin) needs every covering form
// kneeling and bent over, from above and front three-quarter at 3 m.
const source = readFileSync('scripts/verify/polish-villagers.mjs', 'utf8')
const start = source.indexOf('  const MAN = { sex:', source.indexOf("section('garment-acceptance')"))
const end = source.indexOf('  // GARMENT_ROWS=<prefix,..>', start)
if (start < 0 || end < 0) throw new Error('garment-acceptance rows missing')
const ROWS = new Function(`${source.slice(start, end)}\nreturn ROWS`)()

const COVERING = [
  'breastCloth-chest',
  'wrapLong-chest',
  'wrapLong-waist',
  'skirtKnee-waist',
  'skirtShort-waist',
  'loinFlap-waist',
  'apron-waist',
  'girdleTails-waist',
]

it('frames the kneeling Bambara woman’s breast cloth from above and front three-quarter at 3 m, kneeling and bent over', () => {
  for (const tag of ['kneel', 'dig']) {
    const row = ROWS.find((r) => r.slug === `e0-breastcloth-bambara-woman-${tag}`)
    expect(row, tag).toBeDefined()
    expect(row.fig).toMatchObject({ sex: 'female', age: 'adult', people: 'bambara', clip: tag })
    expect(row.fig.garments).toContain('breastCloth-chest')
    expect(row.views).toEqual(['overhead', 'front34'])
    expect(row.dists).toEqual([3])
  }
})

it('covers every covering form, adults and the children’s hip layer, from above while kneeling and bent over', () => {
  const exposure = ROWS.filter((r) => r.views.includes('overhead') && (r.dists ?? [3, 7]).includes(3))
  for (const form of COVERING)
    for (const clip of ['kneel', 'dig'])
      expect(exposure.some((r) => r.fig.clip === clip && r.fig.age !== 'child' && r.fig.garments.includes(form)), `${form} ${clip}`).toBe(true)
  for (const form of ['skirtShort-waist', 'loinFlap-waist', 'apron-waist'])
    for (const clip of ['kneel', 'dig'])
      expect(exposure.some((r) => r.fig.clip === clip && r.fig.age === 'child' && r.fig.garments.includes(form)), `child ${form} ${clip}`).toBe(true)
})

it('keeps every slug unique and the existing candidate rows as they were', () => {
  expect(new Set(ROWS.map((r) => r.slug)).size).toBe(ROWS.length)
  for (const slug of ['c1-girl-skirtshort-idle', 'c2-loinflap-youngwoman-walk-stride', 'c5-shirt-man-idle-lflank'])
    expect(ROWS.some((r) => r.slug === slug), slug).toBe(true)
})
