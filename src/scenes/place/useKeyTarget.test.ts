// ONE candidate list for the use key (work-order point 691). SPACE means
// several things in a settlement — a functional door, the utterance over a
// speaker's head, and the rest of the rebuild as it lands — and the player must
// be able to tell WHICH from the picture alone. The rules under test are the
// three the spec names: the nearest candidate wins, a candidate out of its OWN
// reach never wins, and a tie holds the standing pick.

import { describe, expect, it } from 'vitest'
import { TARGET_HOLD, labelPresentation } from '../../communication/speechTarget'
import { pickUseCandidate, type UseCandidate } from './useKeyTarget'
import { DOOR_TRIGGER_RADIUS, doorCandidates, type Interactive, type PlaceLayout } from './layout'
import { balance } from '../../config/balance'

/** A door and an utterance, the two kinds that exist today. */
const door = (distance: number, key = 'door:bazaar'): UseCandidate<string> => ({
  key,
  distance,
  range: DOOR_TRIGGER_RADIUS,
  payload: 'door',
})
const speech = (distance: number, key = 'speech:kid-1'): UseCandidate<string> => ({
  key,
  distance,
  range: balance.communication.hearingRadius,
  payload: 'speech',
})

describe('what the use key means where the player stands (point 691)', () => {
  it('takes nothing when nothing is in reach', () => {
    expect(pickUseCandidate([], null)).toBeNull()
  })

  it('lets the nearer DOOR win over a speaker further off', () => {
    // Standing in the doorway with a child calling from across the square.
    const winner = pickUseCandidate([speech(6), door(0.4)], null)
    expect(winner?.payload).toBe('door')
  })

  it('lets the nearer SPEAKER win over a door further off', () => {
    // A step away from the door, the speaker right beside him: the door is out
    // of its own reach, so the voice is what SPACE means.
    const winner = pickUseCandidate([speech(1.5), door(3)], null)
    expect(winner?.payload).toBe('speech')
  })

  it('never takes a candidate out of its OWN reach, however near it is', () => {
    // The door is by far the nearest thing in the settlement — and still out of
    // reach, because its reach is the doorway and not the square.
    const winner = pickUseCandidate([speech(9), door(DOOR_TRIGGER_RADIUS + 0.01)], null)
    expect(winner?.payload).toBe('speech')
    expect(pickUseCandidate([door(DOOR_TRIGGER_RADIUS + 0.01)], null)).toBeNull()
    // A distance that is no number at all is not a candidate either.
    expect(pickUseCandidate([{ ...door(Number.NaN) }], null)).toBeNull()
  })

  it('holds the standing pick through a tie, so the choice cannot flicker', () => {
    const held = 'speech:kid-1'
    // The door creeps ahead by less than the hold: the pick stays where it was.
    const kept = pickUseCandidate([speech(1.0), door(1.0 - TARGET_HOLD + 0.01)], held)
    expect(kept?.key).toBe(held)
    // Past the hold it moves, and the player sees the door's own hint.
    const moved = pickUseCandidate([speech(1.0), door(1.0 - TARGET_HOLD - 0.01)], held)
    expect(moved?.payload).toBe('door')
  })

  it('drops a held pick that has left its own reach', () => {
    const winner = pickUseCandidate([speech(9), door(DOOR_TRIGGER_RADIUS + 2)], 'door:bazaar')
    expect(winner?.payload).toBe('speech')
  })

  it('decides a first pick by the world, not by the order the candidates arrive in', () => {
    const forwards = pickUseCandidate([speech(2, 'speech:a'), speech(1, 'speech:b')], null)
    const backwards = pickUseCandidate([speech(1, 'speech:b'), speech(2, 'speech:a')], null)
    expect(forwards?.key).toBe('speech:b')
    expect(backwards?.key).toBe('speech:b')
  })

  it('names the hint of the WINNER, never of the loser (point 691)', () => {
    // The whole pure chain in one case: the arbitration decides, and the two
    // hint slots — the bottom prompt and the note over the speaker's head — are
    // both filled from that ONE verdict. A prompt that offers something SPACE
    // will not do is a bug, not a detail.
    const doorWins = pickUseCandidate([speech(6), door(0.4)], null)
    expect(doorWins?.payload).toBe('door')
    expect(labelPresentation(null, 'kid-1', doorWins?.payload === 'speech')).toEqual({
      targetedId: null,
      hiddenId: null,
    })
    const speechWins = pickUseCandidate([speech(1.5), door(3)], null)
    expect(speechWins?.payload).toBe('speech')
    expect(labelPresentation(null, 'kid-1', speechWins?.payload === 'speech')).toEqual({
      targetedId: 'kid-1',
      hiddenId: null,
    })
  })

  it('breaks an exact tie by key, so two doors never swap between frames', () => {
    const a = pickUseCandidate([door(0.5, 'door:a'), door(0.5, 'door:b')], null)
    const b = pickUseCandidate([door(0.5, 'door:b'), door(0.5, 'door:a')], null)
    expect(a?.key).toBe('door:a')
    expect(b?.key).toBe('door:a')
  })
})

describe('the doors as use-key candidates (point 691)', () => {
  const bazaar: Interactive = { type: 'bazaar', pos: [10, 12], door: [10, 0] }
  const agency: Interactive = { type: 'agency', pos: [-10, 12], door: [-10, 0] }
  const layoutOf = (interactives: Interactive[]): PlaceLayout => ({ interactives }) as PlaceLayout

  it('offers every door with its distance and its own reach', () => {
    const out = doorCandidates(layoutOf([bazaar, agency]), 10, 0.5)
    expect(out).toHaveLength(2)
    expect(out.every((c) => c.range === DOOR_TRIGGER_RADIUS)).toBe(true)
    const near = out.find((c) => c.payload === bazaar)
    expect(near?.distance).toBeCloseTo(0.5, 6)
    // The reach filter is NOT applied here — the arbitration compares the far
    // door with everything else and would have nothing to compare without it.
    expect(out.find((c) => c.payload === agency)?.distance).toBeCloseTo(Math.hypot(20, 0.5), 6)
  })

  it('gives two doors of the same kind distinct keys, so the hold cannot confuse them', () => {
    const twin: Interactive = { type: 'bazaar', pos: [-4, 2], door: [-4, 0] }
    const keys = doorCandidates(layoutOf([bazaar, twin]), 0, 0).map((c) => c.key)
    expect(new Set(keys).size).toBe(2)
  })

  it('skips an interactive with no door at all, and an absent layout', () => {
    expect(doorCandidates(layoutOf([{ type: 'chief', pos: [0, 0] }]), 0, 0)).toEqual([])
    expect(doorCandidates(null, 0, 0)).toEqual([])
  })
})
