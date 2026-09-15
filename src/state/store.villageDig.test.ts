import { beforeEach, describe, expect, it } from 'vitest'
import { g, freshGame, withWorld } from '../test/store'

withWorld()
beforeEach(freshGame)

describe('the village keeps its excavations', () => {
  it('retains partial work and finished results across visits and copies the scheduler record', () => {
    g().enterPlace('bambara-village')
    const progress = [{ dug: 7, strikes: 4 }, { dug: 18, strikes: 12, completed: true }]
    g().recordVillageDig('bambara-village', progress)
    progress[0].dug = 99
    g().leavePlace()
    g().enterPlace('bambara-village')
    expect(g().villageDigProgress['bambara-village']).toEqual([
      { dug: 7, strikes: 4 }, { dug: 18, strikes: 12, completed: true },
    ])
    expect(g().villageDigProgress['zulu-village']).toBeUndefined()
  })

  it('does not publish unchanged frame records', () => {
    const progress = [{ dug: 3, strikes: 2 }]
    g().recordVillageDig('bambara-village', progress)
    const before = g()
    g().recordVillageDig('bambara-village', progress.map((p) => ({ ...p })))
    expect(g()).toBe(before)
  })

  it('restores saved work and clears it for a new expedition', () => {
    const progress = [{ dug: 18, strikes: 12, completed: true }]
    g().recordVillageDig('bambara-village', progress)
    g().saveCheckpoint()
    g().newGame()
    expect(g().villageDigProgress).toEqual({})
    expect(g().loadCheckpoint()).toBe(true)
    expect(g().villageDigProgress['bambara-village']).toEqual(progress)
  })

  it('an older snapshot cannot inherit work from the current expedition', () => {
    g().saveCheckpoint()
    const key = 'hoa-checkpoints-v1'
    const snapshots = JSON.parse(localStorage.getItem(key)!)
    delete snapshots[0].villageDigProgress
    localStorage.setItem(key, JSON.stringify(snapshots))
    g().recordVillageDig('bambara-village', [{ dug: 18, strikes: 10, completed: true }])
    expect(g().loadCheckpoint()).toBe(true)
    expect(g().villageDigProgress).toEqual({})
  })
})
