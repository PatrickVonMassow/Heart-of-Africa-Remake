import { afterEach, beforeEach, expect, it } from 'vitest'
import { standOrderMoment } from './standOrder.mjs'

const stand = { x: 0, z: 0 }
const sender = (situation) => ({ x: 1, z: 0, work: situation ? { situation, partner: 1 } : null, carry: null })
const carrier = (situation, carry) => ({ x: 3, z: 0, work: situation ? { situation, partner: 0 } : null, carry })

let frame
beforeEach(() => {
  globalThis.window = { __errandWatch: { seen: {} }, __placeErrands: () => frame }
})
afterEach(() => {
  delete globalThis.window
})

const poll = (villagers, last) => {
  frame = { villagers, last, geography: { waterStand: stand } }
  return standOrderMoment()
}

it('finds the order once the partner carries the empty jar, with the word older than 2.5 s', () => {
  const word = (age) => ({ id: 'water-out', speaker: 0, age })
  expect(poll([sender('water-out'), carrier('water-out', null)], word(0))).toBeNull()
  const m = poll([sender('water-out'), carrier('water-out', 'emptyJar')], word(3.4))
  expect(m).toMatchObject({ carrier: { who: 1 }, sender: { who: 0 }, gap: 3 })
})

it('a word retained from an earlier errand never answers for a silent later one', () => {
  const word = (age) => ({ id: 'water-out', speaker: 0, age })
  // first errand: spoken, then both go home
  poll([sender('water-out'), carrier('water-out', null)], word(0))
  poll([sender('water-back'), carrier('water-back', 'fullJar')], word(20))
  poll([sender(null), carrier(null, null)], word(30))
  // second errand: no new word, yet the partner walks off with the empty jar
  expect(poll([sender('water-out'), carrier('water-out', null)], word(40))).toBeNull()
  expect(poll([sender('water-out'), carrier('water-out', 'emptyJar')], word(43))).toBeNull()
  // the word spoken anew on this errand binds it
  expect(poll([sender('water-out'), carrier('water-out', 'emptyJar')], word(0.5))).toMatchObject({ sender: { who: 0 } })
})

it('the carrier must be the speaker\'s own partner', () => {
  const stranger = { x: 3, z: 0, work: { situation: 'water-out', partner: 7 }, carry: 'emptyJar' }
  poll([sender('water-out'), stranger], { id: 'water-out', speaker: 0, age: 0 })
  expect(poll([sender('water-out'), stranger], { id: 'water-out', speaker: 0, age: 3 })).toBeNull()
})
