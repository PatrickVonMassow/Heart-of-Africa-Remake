// ONE candidate list for the settlement's action keys (work-order points
// 691/1139). A settlement offers several things at once — a functional door,
// the chief, the utterance over a speaker's head — and the player must be able
// to tell WHICH key means WHICH from the picture alone. The rules under test
// are the three of point 691 — the nearest candidate wins, a candidate out of
// its OWN reach never wins, a tie holds the standing pick — and the split of
// point 1139: SPACE uses, E guesses, and the pad's one button keeps both.

import { describe, expect, it } from 'vitest'
import { TARGET_HOLD, labelPresentation } from '../../communication/speechTarget'
import {
  advanceKeyPicks,
  candidatesForKey,
  keyForUseKind,
  pickForKeyPress,
  pickUseCandidate,
  pressKey,
  type UseCandidate,
  type UseKind,
} from './useKeyTarget'
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

// The two keys of point 1139. The user met the collision the split exists to
// remove: SPACE at the chief's hut opened the guess at a word spoken beside it,
// or the hut swallowed the guess — a step's distance decided which. The cases
// below are that exact standing: a hut and a word BOTH in reach at once.
describe('the use key and the guess key no longer compete (point 1139)', () => {
  /** A settlement candidate as the scene builds it: the kind decides the key. */
  type Kinded = UseCandidate<{ kind: UseKind }>
  const hut = (distance: number): Kinded => ({
    key: 'door:chief-hut',
    distance,
    range: DOOR_TRIGGER_RADIUS,
    payload: { kind: 'interactive' },
  })
  const chief = (distance: number): Kinded => ({
    key: 'chief:drummer',
    distance,
    range: balance.communication.chiefTalkReach,
    payload: { kind: 'chief' },
  })
  const word = (distance: number): Kinded => ({
    key: 'speech:villager-1',
    distance,
    range: balance.communication.hearingRadius,
    payload: { kind: 'speech' },
  })

  it('sorts every kind onto the key that acts on it', () => {
    expect(keyForUseKind('interactive')).toBe('use')
    expect(keyForUseKind('chief')).toBe('use')
    expect(keyForUseKind('speech')).toBe('guess')
  })

  it('gives SPACE the chief and never the word, with both in reach', () => {
    // The word is NEARER — under the one list of point 691 it took the key.
    const both = [chief(2), word(0.5)]
    expect(pickForKeyPress(both, 'use')?.payload.kind).toBe('chief')
    expect(candidatesForKey(both, 'use').map((c) => c.key)).toEqual(['chief:drummer'])
  })

  it('gives E the word and never the hut or the chief, with both in reach', () => {
    // And the hut is nearer here, which used to silence the note entirely.
    const both = [hut(0.3), chief(2), word(4)]
    expect(pickForKeyPress(both, 'guess')?.payload.kind).toBe('speech')
    expect(candidatesForKey(both, 'guess').map((c) => c.key)).toEqual(['speech:villager-1'])
  })

  it('arms neither key for what only the other one can reach', () => {
    // A word alone: SPACE does nothing at all rather than opening the guess.
    expect(pickForKeyPress([word(1)], 'use')).toBeNull()
    // A hut alone: E does nothing rather than entering it.
    expect(pickForKeyPress([hut(0.3), chief(2)], 'guess')).toBeNull()
  })

  it('keeps the use key out of reach of a word standing in its own', () => {
    // Out of the hut's reach, in the word's: neither key may act on the hut,
    // and SPACE may not fall back onto the word because nothing else answers.
    const far = [hut(DOOR_TRIGGER_RADIUS + 3), word(2)]
    expect(pickForKeyPress(far, 'use')).toBeNull()
    expect(pickForKeyPress(far, 'guess')?.payload.kind).toBe('speech')
  })

  it("lets the PAD's A button keep both meanings, nearest wins (design.md §17.5)", () => {
    // The pad has no free face button, so there the old arbitration survives.
    expect(pickForKeyPress([chief(2), word(0.5)], 'use', { pad: true })?.payload.kind).toBe('speech')
    expect(pickForKeyPress([chief(0.5), word(2)], 'use', { pad: true })?.payload.kind).toBe('chief')
  })

  it('keeps the two histories apart across presses (review 16.09.2026)', () => {
    // The RULE the scene's one picks object is carried by — that a press writes
    // only its own input's history. This layer cannot see the scene's wiring at
    // all (the pad's whole path is proved in scripts/verify/gamepad.mjs,
    // section guess-key); what it holds is the rule that wiring must obey.
    const hutA: Kinded = { ...hut(1.0), key: 'door:a' }
    const hutB: Kinded = { ...hut(1.0 - TARGET_HOLD + 0.01), key: 'door:b' }
    const all = [hutA, hutB, word(1.0)]
    // A frame carries both picks: the keyboard's over the doors, the pad's over
    // the whole list — and here the word is what the pad sees as nearest.
    const first = advanceKeyPicks(all, { use: 'door:a', pad: 'speech:villager-1' })
    expect(first.picks).toEqual({ use: 'door:a', pad: 'speech:villager-1' })
    expect(first.use?.key).toBe('door:a')
    expect(first.guess?.key).toBe('speech:villager-1')
    // A PAD press moves the pad's history and leaves the keyboard's standing.
    const padPress = pressKey(all, 'use', 'gamepad', first.picks)
    expect(padPress.winner?.key).toBe('speech:villager-1')
    expect(padPress.picks).toEqual({ use: 'door:a', pad: 'speech:villager-1' })
    // With the word gone the pad falls to the nearer door — and STILL may not
    // hand that door to the keyboard, which is holding the other one.
    const withoutWord = [hutA, hutB]
    const padAgain = pressKey(withoutWord, 'use', 'gamepad', padPress.picks)
    expect(padAgain.winner?.key).toBe('door:b')
    expect(padAgain.picks).toEqual({ use: 'door:a', pad: 'door:b' })
    // And the keyboard's own press still acts on the door it was holding.
    const keyPress = pressKey(withoutWord, 'use', 'keyboard', padAgain.picks)
    expect(keyPress.winner?.key).toBe('door:a')
    expect(keyPress.picks).toEqual({ use: 'door:a', pad: 'door:b' })
  })

  it('leaves both histories alone when a key finds nothing, and when E answers', () => {
    const held = { use: 'door:a', pad: 'speech:villager-1' }
    // Out of every reach: a press that does nothing may not forget what is held.
    const nothing = pressKey([hut(DOOR_TRIGGER_RADIUS + 5)], 'use', 'keyboard', held)
    expect(nothing.winner).toBeNull()
    expect(nothing.picks).toEqual(held)
    // The guess key has no history of its own to write.
    const guess = pressKey([hut(0.3), word(2)], 'guess', 'keyboard', held)
    expect(guess.winner?.key).toBe('speech:villager-1')
    expect(guess.picks).toEqual(held)
  })

  it('holds the PAD on a word a door is about to take by a hair (review 16.09.2026)', () => {
    // The pad's standing pick has to be its OWN: the use key's pick never sees a
    // word, so lending it to button A would hand the door a word held a hand's
    // breadth away — the flicker TARGET_HOLD exists to stop, and the whole
    // reason the pad keeps both meanings at all.
    const near = [hut(1.0 - TARGET_HOLD + 0.01), word(1.0)]
    expect(pickForKeyPress(near, 'use', { pad: true, held: 'speech:villager-1' })?.key).toBe('speech:villager-1')
    // A door that really is nearer still takes it, hold or no hold.
    const nearer = [hut(1.0 - TARGET_HOLD - 0.01), word(1.0)]
    expect(pickForKeyPress(nearer, 'use', { pad: true, held: 'speech:villager-1' })?.key).toBe('door:chief-hut')
    // And the held word is ignored by the KEYBOARD's use key, which cannot act
    // on a word at all — it takes the door instead of nothing.
    expect(pickForKeyPress(near, 'use', { held: 'speech:villager-1' })?.key).toBe('door:chief-hut')
  })

  it('still holds the use key on its standing pick, and the guess needs no hold', () => {
    // Two doors a hand's breadth apart: the held one keeps the key (point 691).
    const rival: Kinded = { ...hut(1.0 - TARGET_HOLD + 0.01), key: 'door:market' }
    const held = pickForKeyPress([hut(1.0), rival], 'use', { held: 'door:chief-hut' })
    expect(held?.key).toBe('door:chief-hut')
    // The speech channel offers ONE word at a time, so the guess key has no tie
    // to keep: what it takes is whatever that channel is offering.
    expect(pickForKeyPress([word(3)], 'guess')?.key).toBe('speech:villager-1')
  })

  it('leaves the note inviting while a hut owns the use key (point 1139)', () => {
    // The regression the split had to remove from the PICTURE: the highlight
    // now follows the guess key's own reach, not who won one shared key.
    expect(labelPresentation(null, 'villager-1', true)).toEqual({ targetedId: 'villager-1', hiddenId: null })
    expect(labelPresentation(null, 'villager-1', false)).toEqual({ targetedId: null, hiddenId: null })
  })
})
