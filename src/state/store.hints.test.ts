// Store hints & language/direction system (CLAUDE.md §7.1 pt. 7/10, design.md
// §13). Ports the store-driven asserts of scripts/verify/hints.mjs into fast
// jsdom checks: one knowing village per region, the gift→hint / lesson→decoded
// cascade in either order (retroactive deciphering), the north-latitude /
// east-longitude triangulation matching the actual grave, the unspecific words
// of a non-knowing chief pointing to the knowing people, and the elder's gift
// lore. The single DOM assert (the raw in-world word "koko" in the rendered
// JournalPanel) stays in the Playwright E2E.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { RegionId } from '../world/geo'
import { PLACES, REGION_VALUES } from '../world/geo'
import { UNSPECIFIC_WORDS } from '../world/lore'
import { balance } from '../config/balance'
import { g, freshGame, withWorld } from '../test/store'

withWorld()

beforeEach(() => {
  freshGame()
  balance.randomEventsEnabled = false // deterministic: no hidden per-day rolls
})
afterEach(() => {
  balance.randomEventsEnabled = true
  vi.restoreAllMocks()
})

const REGIONS = ['north', 'west', 'central', 'east', 'south'] as const

// The culturally-correct (revered) gift the chief demands; revered[0] equals
// hints.mjs's fixed REVERED map (north gold, west ivory, central silver, east
// emerald, south copper).
const reveredGift = (region: RegionId) => REGION_VALUES[region].revered[0]

/** Grave/hint layout is seeded per run, so read the knowing village from state. */
const knowingVillage = (region: RegionId) => g().knowingVillages[region]

/** Full chief-then-elder cascade at a region's knowing village. */
function cascadeKnowingVillage(region: RegionId): void {
  g().enterPlace(knowingVillage(region))
  const gift = reveredGift(region)
  g().debugAddGift(gift)
  g().giveGift(gift) // revered gift reaches the goodwill threshold at once → raw hint
  g().talkToVillager() // elder teaches the region's direction system → decoded
  g().leavePlace()
}

const decodedEntry = (region: RegionId) =>
  g().journal.find((e) => e.text.key === 'journal.hintDecoded' && e.text.params?.region === region)

describe('knowing people (design.md §13.3)', () => {
  it('has exactly one knowing village per region, each within its region', () => {
    const knowing = g().knowingVillages
    const regions = Object.keys(knowing)
    expect(regions.sort()).toEqual([...REGIONS].sort())
    for (const region of REGIONS) {
      const place = PLACES.find((p) => p.id === knowing[region])
      expect(place).toBeTruthy()
      expect(place?.region).toBe(region)
    }
  })
})

describe('per-region cascade (design.md §13.1/§13.3)', () => {
  it('a revered gift records the hint and the lesson deciphers it, in every region', () => {
    for (const region of REGIONS) {
      cascadeKnowingVillage(region)
      expect(g().hintsGiven[region]).toBe(true)
      expect(g().languagesLearned[region]).toBe(true)
      expect(g().decodedGiven[region]).toBe(true)
    }
  })

  it('accumulates at least ten hint entries across the regions', () => {
    for (const region of REGIONS) cascadeKnowingVillage(region)
    const hintCount = g().journal.filter((e) => e.kind === 'hint').length
    expect(hintCount).toBeGreaterThanOrEqual(10)
  })
})

describe('triangulation (design.md §13.3)', () => {
  it('the deciphered north latitude and east longitude name the actual grave', () => {
    cascadeKnowingVillage('north')
    cascadeKnowingVillage('east')
    const grave = g().graveLatLon
    expect(decodedEntry('north')?.text.params?.lat).toBe(grave.lat)
    expect(decodedEntry('east')?.text.params?.lon).toBe(grave.lon)
  })
})

describe('retroactive deciphering — either order (design.md §13.1)', () => {
  it('the lesson AFTER the hint deciphers it retroactively', () => {
    const region: RegionId = 'west'
    g().enterPlace(knowingVillage(region))
    const gift = reveredGift(region)
    g().debugAddGift(gift)
    g().giveGift(gift) // raw hint, language not yet learned
    expect(g().hintsGiven[region]).toBe(true)
    expect(g().decodedGiven[region]).toBeFalsy() // no lesson yet → still encoded
    g().talkToVillager() // lesson afterwards must decode retroactively
    expect(g().decodedGiven[region]).toBe(true)
    g().leavePlace()
  })

  it('the hint AFTER the lesson deciphers it immediately', () => {
    const region: RegionId = 'central'
    g().enterPlace(knowingVillage(region))
    g().talkToVillager() // lesson first; no hint yet → nothing to decode
    expect(g().languagesLearned[region]).toBe(true)
    expect(g().decodedGiven[region]).toBeFalsy()
    const gift = reveredGift(region)
    g().debugAddGift(gift)
    g().giveGift(gift) // hint afterwards, with the language already known → decoded
    expect(g().hintsGiven[region]).toBe(true)
    expect(g().decodedGiven[region]).toBe(true)
    g().leavePlace()
  })
})

describe('unspecific knowledge (design.md §13.3)', () => {
  it('a non-knowing chief offers only unspecific words that point to the knowing people', () => {
    const region: RegionId = 'north'
    const knowingId = knowingVillage(region)
    const other = PLACES.find((p) => p.kind === 'village' && p.region === region && p.id !== knowingId)
    expect(other).toBeTruthy()
    g().enterPlace(other!.id)
    const gift = reveredGift(region) // revered here, so goodwill still unlocks a word
    g().debugAddGift(gift)
    g().giveGift(gift)
    const entry = g().journal.filter((e) => e.text.key === 'journal.unspecific').pop()
    expect(entry).toBeTruthy()
    const knowingPeople = PLACES.find((p) => p.id === knowingId)?.peopleId
    expect(entry?.text.params?.people).toBe(knowingPeople)
    expect(UNSPECIFIC_WORDS).toContain(entry?.text.params?.word)
    // The knowing village itself must NOT have leaked its precise hint here.
    expect(g().hintsGiven[region]).toBeFalsy()
    g().leavePlace()
  })
})

describe('gift lore (design.md §8)', () => {
  it('a second elder talk reveals the region’s revered gift', () => {
    const region: RegionId = 'south'
    g().enterPlace(knowingVillage(region))
    g().talkToVillager() // first: language lesson
    g().talkToVillager() // second: gift lore
    const entry = g().journal.filter((e) => e.text.key === 'journal.giftLore').pop()
    expect(entry).toBeTruthy()
    expect(entry?.text.params?.gift).toBe(reveredGift(region)) // 'copper' in the south
    g().leavePlace()
  })
})
