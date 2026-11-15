// The kraal herd across the rinderpest years (work-order 359): every people is
// decided, the herd agrees with the vignette's phase, and it falls and slowly
// regrows for a cattle people while a cattle-less one never shows a beast.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { START_YEAR, VILLAGE_CATTLE } from '../config/balance'
import { PLACES } from '../world/geo'
import { cattleArrangement, kraalHerdSize, kraalHerdSizeAtDay, kraalPhaseAtDay, PEOPLE_CATTLE } from './cattle'
import { rinderpestPhaseAtDay } from './rinderpest'

const DOC = readFileSync(resolve(__dirname, '../../docs/peoples-1890.md'), 'utf8')
const PEOPLES = [...new Set(PLACES.map((p) => p.peopleId).filter((p): p is string => !!p))]

describe('every people resolves to a decided cattle arrangement (the dress sweep rule)', () => {
  it('covers the whole roster and nothing else', () => {
    expect(PEOPLES.length).toBe(22)
    expect(Object.keys(PEOPLE_CATTLE).sort()).toEqual([...PEOPLES].sort())
  })

  it('refuses an undecided people instead of defaulting', () => {
    expect(() => cattleArrangement('nobody')).toThrow(/no decided arrangement/)
  })

  it('names a section or a guess with its reason on every entry, and every cited section exists', () => {
    const headings = new Set(
      DOC.split('\n')
        .map((l) => /^#{2,4}\s+(\d+(?:\.\d+)*[a-z]?)/.exec(l)?.[1])
        .filter((s): s is string => !!s),
    )
    for (const p of PEOPLES) {
      const s = PEOPLE_CATTLE[p].source
      if ('guess' in s) {
        expect(s.guess.length, p).toBeGreaterThan(8)
        continue
      }
      for (const m of s.section.matchAll(/§(\d+(?:\.\d+)*[a-z]?)/g)) expect(headings.has(m[1]), `${p} §${m[1]}`).toBe(true)
    }
  })

  it('records the decision in docs/peoples-1890.md §8.8 with every people named', () => {
    const s88 = DOC.slice(DOC.indexOf('### 8.8'))
    expect(DOC.indexOf('### 8.8')).toBeGreaterThan(0)
    for (const p of PEOPLES) expect(s88.toLowerCase(), p).toContain(p)
  })

  it('keeps the settled ones: the Bemba none, the camel peoples camels, the Zulu a kraal', () => {
    expect(cattleArrangement('bemba')).toBe('none')
    expect(cattleArrangement('somali')).toBe('camels')
    expect(cattleArrangement('tuareg')).toBe('camels')
    for (const p of ['zulu', 'pedi', 'maasai']) expect(cattleArrangement(p)).toBe('kraal')
  })
})

describe('kraalHerdSize — the herd follows the rinderpest phase', () => {
  const full = VILLAGE_CATTLE.fullHerd

  it('falls across the phases for the Maasai, boundary-tested at the phase dates', () => {
    const pre = kraalHerdSize('maasai', 1890, 12)
    const struck = kraalHerdSize('maasai', 1891, 1)
    expect(kraalHerdSize('maasai', 1890, 1)).toBe(pre)
    expect(pre).toBeGreaterThan(0)
    expect(pre).toBeLessThan(full) // thinned by the lung-sickness
    expect(struck).toBe(0) // the emptied ground of the struck vignette
    expect(kraalHerdSize('maasai', 1892, 12)).toBe(0)
    const after = kraalHerdSize('maasai', 1893, 1)
    expect(after).toBeGreaterThan(0) // the slow regrowth begins
    expect(after).toBeLessThan(pre)
    expect(kraalHerdSize('maasai', 1895, 12)).toBeGreaterThanOrEqual(after)
    expect(kraalHerdSize('maasai', 1895, 12)).toBeLessThan(full)
  })

  it('stays full for the Zulu and Pedi through the whole window — clean until March 1896', () => {
    for (const p of ['zulu', 'pedi']) {
      for (const y of [1890, 1893, 1895]) expect(kraalHerdSize(p, y, 6), `${p} ${y}`).toBe(full)
      expect(kraalHerdSize(p, 1896, 2)).toBe(full)
      expect(kraalHerdSize(p, 1896, 3)).toBe(0) // the Zambezi crossing, should the window grow
    }
  })

  it('is zero in every year for every people without a kraal herd', () => {
    for (const p of PEOPLES.filter((q) => cattleArrangement(q) !== 'kraal'))
      for (let y = 1890; y <= 1895; y++) for (const m of [1, 6, 12]) expect(kraalHerdSize(p, y, m), `${p} ${y}-${m}`).toBe(0)
  })

  it('reads its phase from the visit date exactly as the first-visit vignette does', () => {
    for (const p of PEOPLES)
      for (let day = 0; day < 6 * 366; day += 7) expect(kraalPhaseAtDay(p, day, START_YEAR), `${p} ${day}`).toBe(rinderpestPhaseAtDay(p, day, START_YEAR))
    // And the day glue lands on the same boundary: the last day of 1890 and the first of 1891.
    const dec31 = Date.UTC(1890, 11, 31) / 86400000 - Date.UTC(1890, 0, 1) / 86400000
    expect(kraalHerdSizeAtDay('maasai', dec31, 1890)).toBe(kraalHerdSize('maasai', 1890, 12))
    expect(kraalHerdSizeAtDay('maasai', dec31 + 1, 1890)).toBe(0)
  })
})
