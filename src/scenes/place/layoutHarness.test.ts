// THE SHARED LAYOUT FIXTURE (work-order 1180).
//
// The saving this fixture buys is real only while three things hold: it hands
// back the SAME layout for the same (place, seed), that layout is what
// `buildLayout` would have built, and nobody can write to it. The third is what
// makes the first two safe — a reader that mutated a shared layout would change
// what every later case in the file sees, and the run would go wrong quietly.
// Each of the three is asserted here rather than trusted.
import { describe, expect, it } from 'vitest'
import { buildLayout } from './layout'
import { sharedLayout, sharedLayoutCount, SEEDS, VILLAGES } from './layoutHarness'

describe('the shared layout fixture (work-order 1180)', () => {
  it('builds a given (place, seed) once and hands the same one back', () => {
    const first = sharedLayout('bambara-village', SEEDS[0])
    const again = sharedLayout('bambara-village', SEEDS[0])
    // Identity, not equality: an equal COPY would mean it built twice.
    expect(again).toBe(first)
  })

  it('keeps the two arguments apart, and counts only what it really built', () => {
    const before = sharedLayoutCount()
    const a = sharedLayout('zulu-village', SEEDS[0])
    const b = sharedLayout('zulu-village', SEEDS[1])
    const c = sharedLayout('maasai-village', SEEDS[0])
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
    // Three new worlds, three builds — and asking again adds none.
    expect(sharedLayoutCount()).toBe(before + 3)
    sharedLayout('zulu-village', SEEDS[0])
    sharedLayout('maasai-village', SEEDS[0])
    expect(sharedLayoutCount()).toBe(before + 3)
  })

  it('hands back exactly what buildLayout would have built', () => {
    for (const place of VILLAGES.slice(0, 3)) {
      for (const seed of SEEDS) {
        expect(sharedLayout(place.id, seed)).toEqual(buildLayout(place.id, seed))
      }
    }
  })

  it('refuses a write instead of letting one reader spoil the next', () => {
    const layout = sharedLayout('hausa-village', SEEDS[0])
    // The top level, a nested array and an object inside that array: a freeze
    // that stopped at the first level would leave the last two writable, which
    // is precisely where a case would reach.
    expect(() => {
      ;(layout as { radius: number }).radius = 1
    }).toThrow(TypeError)
    expect(() => layout.colliders.push({ x: 0, z: 0, r: 1 })).toThrow(TypeError)
    expect(() => {
      ;(layout.dwellings[0] as { x: number }).x = 999
    }).toThrow(TypeError)
  })

  it('leaves the shipped buildLayout uncached, so the game pays for no fixture', () => {
    // A cache inside `buildLayout` itself would hold every settlement a player
    // walked through for the life of the session. It must keep building.
    expect(buildLayout('san-village', SEEDS[0])).not.toBe(buildLayout('san-village', SEEDS[0]))
    expect(Object.isFrozen(buildLayout('san-village', SEEDS[0]))).toBe(false)
  })
})
