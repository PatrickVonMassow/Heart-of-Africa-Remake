import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VILLAGER_DRESS } from '../config/balance'
import { PLACES } from '../world/geo'
import {
  AGE_GROUPS,
  appearanceFor,
  LAYER_SLOTS,
  PEOPLE_DRESS,
  SEXES,
  zuluBlanketShare,
  type AppearanceQuery,
} from './appearance'

const DOC = readFileSync(resolve(process.cwd(), 'docs/peoples-1890.md'), 'utf8')
const SOUTH = ['#3a5a8a', '#8a4a2a', '#c2b090']
const WARM = { coldness: 0, harmattan: 0, karif: 0 }
const COLD = { coldness: 1, harmattan: 1, karif: 1 }

const query = (over: Partial<AppearanceQuery>): AppearanceQuery => ({
  peopleId: 'zulu',
  sex: 'male',
  age: 'adult',
  drivers: WARM,
  year: 1890,
  cloth: SOUTH[1],
  palette: SOUTH,
  pick: 0.9,
  ...over,
})

const PEOPLES = [...new Set(PLACES.map((p) => p.peopleId).filter((p): p is string => !!p))]

describe('the appearance table covers the whole roster', () => {
  it('has an entry for every people of the world model, and nothing else', () => {
    expect(PEOPLES.length).toBe(22)
    expect(Object.keys(PEOPLE_DRESS).sort()).toEqual([...PEOPLES].sort())
  })

  it('no people / sex / age group is without at least one layer', () => {
    for (const p of PEOPLES)
      for (const sex of SEXES)
        for (const age of AGE_GROUPS) {
          expect(PEOPLE_DRESS[p][sex][age].length, `${p} ${sex} ${age}`).toBeGreaterThan(0)
        }
  })
})

describe('every entry names its source or is marked a guess', () => {
  const headings = new Set(
    DOC.split('\n')
      .map((l) => /^#{2,4}\s+(\d+(?:\.\d+)*[a-z]?)/.exec(l)?.[1])
      .filter((s): s is string => !!s),
  )

  it('carries a section or a guess with its reason on every layer', () => {
    for (const p of PEOPLES)
      for (const sex of SEXES)
        for (const age of AGE_GROUPS)
          for (const l of PEOPLE_DRESS[p][sex][age]) {
            const ok = 'section' in l.source ? l.source.section.length > 1 : l.source.guess.length > 8
            expect(ok, `${p} ${sex} ${age} ${l.form}`).toBe(true)
          }
  })

  it('every cited section exists in docs/peoples-1890.md', () => {
    for (const p of PEOPLES)
      for (const sex of SEXES)
        for (const age of AGE_GROUPS)
          for (const l of PEOPLE_DRESS[p][sex][age]) {
            if (!('section' in l.source)) continue
            const n = /^§(\d+(?:\.\d+)*[a-z]?)/.exec(l.source.section)?.[1]
            expect(n && headings.has(n), `${p} ${l.source.section}`).toBe(true)
          }
  })

  it('records the research of the gaps in §8.3, with the Zulu cells named', () => {
    expect(headings.has('8.3')).toBe(true)
    const s83 = DOC.slice(DOC.indexOf('### 8.3'))
    for (const word of ['isicoco', 'umutsha', 'isidwaba', 'Astra', 'guess']) expect(s83).toContain(word)
  })
})

describe('appearanceFor — ordered layers per query', () => {
  it('returns the layers in hip → torso → shoulder → head → ornament order', () => {
    for (const p of PEOPLES)
      for (const age of AGE_GROUPS) {
        const ls = appearanceFor(query({ peopleId: p, age, sex: 'female', drivers: COLD }))
        const order = ls.map((l) => LAYER_SLOTS.indexOf(l.slot))
        expect(order).toEqual([...order].sort((a, b) => a - b))
      }
  })

  it('resolves the village-cloth token to the figure’s own cloth', () => {
    const ls = appearanceFor(query({ peopleId: 'bambara', sex: 'female', cloth: '#123456', palette: ['#123456'] }))
    expect(ls.some((l) => l.colour === '#123456')).toBe(true)
    expect(ls.every((l) => l.colour !== 'cloth')).toBe(true)
  })

  it('sex and age change the dress: the married Zulu man wears the head-ring, the young man does not', () => {
    const man = appearanceFor(query({ age: 'adult' })).map((l) => l.form)
    const young = appearanceFor(query({ age: 'youth' })).map((l) => l.form)
    const wife = appearanceFor(query({ sex: 'female', age: 'adult' })).map((l) => l.form)
    const girl = appearanceFor(query({ sex: 'female', age: 'youth' })).map((l) => l.form)
    expect(man).toContain('headRing')
    expect(young).not.toContain('headRing')
    expect(wife).toContain('skirtKnee')
    expect(girl).toContain('skirtShort')
    expect(girl).not.toContain('breastCloth')
  })

  it('a port without a people still dresses its figures', () => {
    expect(appearanceFor(query({ peopleId: null })).length).toBeGreaterThan(0)
  })
})

describe('the season switches the layers (folded from systems/dress.ts)', () => {
  it('a Zulu adult takes a cloak in the cold and sheds it in the warm', () => {
    expect(appearanceFor(query({ drivers: WARM })).some((l) => l.slot === 'shoulder')).toBe(false)
    expect(appearanceFor(query({ drivers: COLD })).some((l) => l.form === 'cloak')).toBe(true)
  })

  it('the San cloak is RE-WORN over both shoulders, not doubled', () => {
    const warm = appearanceFor(query({ peopleId: 'san', drivers: WARM })).filter((l) => l.slot === 'shoulder')
    const cold = appearanceFor(query({ peopleId: 'san', drivers: COLD })).filter((l) => l.slot === 'shoulder')
    expect(warm.map((l) => l.wear)).toEqual(['rightShoulder'])
    expect(cold.map((l) => l.wear)).toEqual(['bothShoulders'])
    // the same skin, worn differently — not a new one
    expect(cold[0].colour).toBe(warm[0].colour)
    expect(cold[0].material).toBe(warm[0].material)
  })

  it('the Somali tobe goes over the head in the karif', () => {
    expect(appearanceFor(query({ peopleId: 'somali', drivers: COLD })).some((l) => l.form === 'hood')).toBe(true)
  })

  it('the rank-gated wraps stay rank-gated, and small children are never cloaked', () => {
    const notable = appearanceFor(query({ peopleId: 'hausa', drivers: COLD, cloth: SOUTH[0] }))
    const commoner = appearanceFor(query({ peopleId: 'hausa', drivers: COLD, cloth: SOUTH[1] }))
    expect(notable.some((l) => l.slot === 'shoulder')).toBe(true)
    expect(commoner.some((l) => l.slot === 'shoulder')).toBe(false)
    expect(appearanceFor(query({ age: 'child', drivers: COLD })).some((l) => l.slot === 'shoulder')).toBe(false)
  })

  it('the Somali tobe pulled over the head in the karif keeps the tobe’s own colour', () => {
    let tobes = 0
    for (const cloth of SOUTH) {
      const ls = appearanceFor(query({ peopleId: 'somali', drivers: COLD, cloth }))
      const hood = ls.find((l) => l.form === 'hood')
      const tobe = ls.find((l) => l.form === 'toga' || l.form === 'robe')
      expect(hood).toBeDefined()
      if (tobe) {
        tobes++
        expect(hood!.colour).toBe(tobe.colour)
      }
    }
    expect(tobes).toBeGreaterThan(0)
  })

  it('a seasonal cloak keeps an everyday head cloth: the Tuareg woman of rank stays hooded in the cold', () => {
    const q = { peopleId: 'tuareg', sex: 'female', cloth: SOUTH[0] } as const
    const warm = appearanceFor(query({ ...q, drivers: WARM }))
    const cold = appearanceFor(query({ ...q, drivers: COLD }))
    expect(warm.some((l) => l.form === 'hood')).toBe(true)
    expect(cold.some((l) => l.form === 'hood')).toBe(true)
    expect(cold.some((l) => l.form === 'cloak')).toBe(true)
  })

  it('a people without a seasonal record wears the same in the cold', () => {
    expect(appearanceFor(query({ peopleId: 'baganda', drivers: COLD }))).toEqual(
      appearanceFor(query({ peopleId: 'baganda', drivers: WARM })),
    )
  })
})

describe('the year switches the layers (VILLAGER_DRESS, calibratable)', () => {
  it('the Zulu blanket share rises across the game’s years', () => {
    expect(zuluBlanketShare(1890)).toBeCloseTo(VILLAGER_DRESS.zuluBlanketShare.share)
    expect(zuluBlanketShare(1895)).toBeCloseTo(VILLAGER_DRESS.zuluBlanketShare.shareTo)
    expect(zuluBlanketShare(1892)).toBeGreaterThan(zuluBlanketShare(1890))
    const pick = (zuluBlanketShare(1890) + zuluBlanketShare(1895)) / 2
    const early = appearanceFor(query({ drivers: COLD, year: 1890, pick })).find((l) => l.slot === 'shoulder')!
    const late = appearanceFor(query({ drivers: COLD, year: 1895, pick })).find((l) => l.slot === 'shoulder')!
    expect(early.material).toBe('hide')
    expect(late.material).toBe('blanket')
  })

  it('a Baganda man of rank changes from bark cloth to the cotton kanzu', () => {
    const at = (year: number) =>
      appearanceFor(query({ peopleId: 'baganda', year, cloth: SOUTH[0] })).find((l) => l.slot === 'torso')!
    expect(at(VILLAGER_DRESS.bagandaCottonFrom - 1).material).toBe('barkCloth')
    expect(at(VILLAGER_DRESS.bagandaCottonFrom).material).toBe('cotton')
    // A commoner keeps the bark cloth.
    expect(
      appearanceFor(query({ peopleId: 'baganda', year: 1895, cloth: SOUTH[1] })).find((l) => l.slot === 'torso')!.material,
    ).toBe('barkCloth')
  })
})
