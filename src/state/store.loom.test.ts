import { beforeEach, describe, expect, it } from 'vitest'
import { balance } from '../config/balance'
import { g, freshGame, withWorld } from '../test/store'
import { initialLoomCloth } from '../systems/loomCloth'

withWorld()
beforeEach(freshGame)
const village = 'bambara-village'

describe('finished loom cloth is persistent scenery', () => {
  it('starts with seeded village history and retains new cloth on re-entry', () => {
    g().enterPlace(village)
    const initial = g().placeLoomCloth[village]
    expect(initial).toBe(initialLoomCloth(g().seed, village))
    expect(initial).toBeGreaterThan(0)
    const gifts = { ...g().gifts }
    const equipment = { ...g().equipment }
    g().recordLoomCloth(village, 1)
    g().leavePlace()
    g().enterPlace('maasai-village')
    expect(g().placeLoomCloth['maasai-village']).toBe(initialLoomCloth(g().seed, 'maasai-village'))
    g().leavePlace()
    g().enterPlace(village)
    expect(g().placeLoomCloth[village]).toBe(initial + 1)
    expect(g().gifts).toEqual(gifts)
    expect(g().equipment).toEqual(equipment)
  })

  it('caps the stack, carries a batch away and grows again', () => {
    g().enterPlace(village)
    const cfg = balance.villageLife.loom
    g().recordLoomCloth(village, cfg.stackCap - g().placeLoomCloth[village])
    expect(g().placeLoomCloth[village]).toBe(cfg.stackCap)
    g().recordLoomCloth(village, 1)
    expect(g().placeLoomCloth[village]).toBe(cfg.stackFallback)
    g().recordLoomCloth(village, 1)
    expect(g().placeLoomCloth[village]).toBe(cfg.stackFallback + 1)
  })

  it('round-trips through checkpoints and resets on a new game', () => {
    g().enterPlace(village)
    g().recordLoomCloth(village, 2)
    const count = g().placeLoomCloth[village]
    g().leavePlace()
    g().enterPlace('cairo')
    g().enterPlace(village)
    g().recordLoomCloth(village, 1)
    expect(g().loadCheckpoint(0)).toBe(true)
    g().enterPlace(village)
    expect(g().placeLoomCloth[village]).toBe(count)
    g().newGame()
    expect(g().placeLoomCloth).toEqual({})
  })

  it('loads old snapshots without cloth and seeds their first resumed loom', () => {
    g().enterPlace('cairo')
    const key = 'hoa-checkpoints-v1'
    const snapshots = JSON.parse(localStorage.getItem(key)!)
    delete snapshots[0].placeLoomCloth
    localStorage.setItem(key, JSON.stringify(snapshots))
    expect(g().loadCheckpoint(0)).toBe(true)
    expect(g().placeLoomCloth).toEqual({})
    g().enterPlace(village)
    expect(g().placeLoomCloth[village]).toBeGreaterThan(0)
  })
})
