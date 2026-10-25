import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VILLAGER_DRESS } from '../config/balance'
import { PLACES } from '../world/geo'
import {
  AGE_GROUPS,
  appearanceFor,
  isOpenOuter,
  isRevealableTop,
  LAYER_SLOTS,
  PEOPLE_DRESS,
  SEXES,
  withOpenOuterRule,
  zuluBlanketShare,
  type AppearanceQuery,
  type DressLayer,
} from './appearance'
import { seasonalDressFor } from './dress'

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

describe('the covered upper body (docs/peoples-1890.md §8.6)', () => {
  it('the San woman’s mantle stays tied over the breast in the cold, re-worn rather than doubled', () => {
    const q = { peopleId: 'san', sex: 'female', age: 'adult' } as const
    for (const drivers of [WARM, COLD]) {
      const mantles = appearanceFor(query({ ...q, drivers })).filter((l) => l.form === 'cloak')
      expect(mantles.map((l) => l.wear)).toEqual(['chest'])
    }
  })

  it('a share of San mothers carries an infant in the mantle; nobody else does', () => {
    const picks = Array.from({ length: 200 }, (_, i) => (i + 0.5) / 200)
    const share = (over: Partial<AppearanceQuery>) =>
      picks.filter((pick) => appearanceFor(query({ ...over, pick })).some((l) => l.form === 'babySling')).length / picks.length
    const san = share({ peopleId: 'san', sex: 'female', age: 'adult' })
    expect(san).toBeGreaterThan(VILLAGER_DRESS.babySlingShare - 0.05)
    expect(san).toBeLessThan(VILLAGER_DRESS.babySlingShare + 0.05)
    expect(share({ peopleId: 'san', sex: 'female', age: 'youth' })).toBe(0)
    expect(share({ peopleId: 'san', sex: 'male', age: 'adult' })).toBe(0)
    expect(share({ peopleId: 'zulu', sex: 'female', age: 'adult' })).toBe(0)
  })

  it('the covers differ by people — no village gets the same garment as every other', () => {
    const cover = (p: string) =>
      PEOPLE_DRESS[p].female.adult
        .filter((l) => l.slot !== 'hip' || l.wear === 'chest')
        .map((l) => `${l.form}/${l.material}`)
        .join('+')
    const kinds = new Set(['zulu', 'pedi', 'san', 'wayeyi', 'bemba', 'fang', 'mongo', 'mbuti', 'lunda', 'banda'].map(cover))
    expect(kinds.size).toBeGreaterThanOrEqual(8)
  })
})

describe('the open outer garment rule (design.md §19.15)', () => {
  const PALETTE = ['#3a5a8a', '#8a4a2a', '#c2b090']
  const DRIVERS = [0, 1].flatMap((coldness) => [0, 1].flatMap((harmattan) => [0, 1].map((karif) => ({ coldness, harmattan, karif }))))

  it('no everyday outfit puts a revealable inner top under an open outer garment; every such pairing is the seasonal wrap', () => {
    const fails: string[] = []
    const pairs = new Set<string>()
    let checked = 0
    for (const peopleId of [...Object.keys(PEOPLE_DRESS), null])
      for (const sex of SEXES)
        for (const age of AGE_GROUPS)
          for (const drivers of DRIVERS)
            for (let year = 1890; year <= 1895; year++)
              for (const cloth of PALETTE)
                for (const pick of [0.05, 0.35, 0.65, 0.95]) {
                  const ls = appearanceFor({ peopleId, sex, age, drivers, year, cloth, palette: PALETTE, pick })
                  checked++
                  const outer = ls.filter(isOpenOuter)
                  if (!outer.length || !ls.some(isRevealableTop)) continue
                  const who = `${peopleId} ${sex} ${age}`
                  pairs.add(who)
                  // Only the seasonal wrap may sit over a top: a two-shoulder cloak, and only in its season.
                  const seasonal = peopleId ? seasonalDressFor(peopleId, drivers) : null
                  if (!seasonal || outer.some((l) => l.form !== 'cloak' || l.wear !== 'bothShoulders')) fails.push(`${who} ${JSON.stringify(drivers)}`)
                }
    expect(checked).toBeGreaterThan(30_000)
    expect(fails).toEqual([])
    // The recorded exemption, exactly: the seasonal two-shoulder wrap over its period inner garment.
    expect([...pairs].sort()).toEqual(
      [
        'hausa female youth', 'hausa female adult', 'hausa female elder',
        'hausa male youth', 'hausa male adult', 'hausa male elder',
        'tuareg female youth', 'tuareg female adult', 'tuareg female elder',
        'tuareg male youth', 'tuareg male adult', 'tuareg male elder',
        'zulu female adult', 'zulu female elder',
      ].sort(),
    )
  })

  it('leaves a revealable top off under an everyday open cape, and keeps it under a cape tied over the breast', () => {
    const l = (slot: DressLayer['slot'], form: DressLayer['form'], wear: DressLayer['wear']): DressLayer =>
      ({ slot, form, material: 'hide', colour: '#000000', colour2: null, pattern: 'plain', wear, source: { guess: 'test' } })
    const hip = l('hip', 'skirtKnee', 'waist')
    const top = l('torso', 'breastCloth', 'chest')
    const wrap = l('hip', 'wrapLong', 'chest')
    expect(withOpenOuterRule([hip, top, wrap, l('shoulder', 'cape', 'leftShoulder')]).map((x) => x.form)).toEqual(['skirtKnee', 'cape'])
    expect(withOpenOuterRule([hip, top, l('shoulder', 'cloak', 'bothShoulders')]).map((x) => x.form)).toEqual(['skirtKnee', 'cloak'])
    expect(withOpenOuterRule([hip, top, l('shoulder', 'cape', 'chest')]).map((x) => x.form)).toEqual(['skirtKnee', 'breastCloth', 'cape'])
    expect(withOpenOuterRule([hip, top]).map((x) => x.form)).toEqual(['skirtKnee', 'breastCloth'])
  })
})

describe("the chief's dress of office", () => {
  const chief = (peopleId: string) => appearanceFor(query({ peopleId, age: 'elder', cloth: SOUTH[0], office: 'chief' }))

  it('dresses the Bambara chief in a white boubou over the everyday trousers and cap', () => {
    const layers = chief('bambara')
    const torso = layers.filter((l) => l.slot === 'torso')
    expect(torso).toHaveLength(1)
    expect(torso[0]).toMatchObject({ form: 'robe', material: 'cotton', colour: '#f3f0e8' })
    expect(layers.map((l) => l.form)).toEqual(expect.arrayContaining(['trousers', 'cap']))
    // An ordinary Bambara man keeps his indigo shirt.
    const everyday = appearanceFor(query({ peopleId: 'bambara', age: 'elder', cloth: SOUTH[0] }))
    expect(everyday.find((l) => l.slot === 'torso')?.form).toBe('shirt')
  })

  it('leaves a people without a recorded dress of office in its own dress', () => {
    const zulu = query({ peopleId: 'zulu', age: 'elder', cloth: SOUTH[0] })
    expect(appearanceFor({ ...zulu, office: 'chief' })).toEqual(appearanceFor(zulu))
  })

  it('wears no turban or metal decoration', () => {
    expect(chief('bambara').some((l) => l.form === 'turban' || l.material === 'metal')).toBe(false)
  })
})
