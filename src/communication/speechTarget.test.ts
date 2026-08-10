// Which speaker a click would take (design.md §13.4, work-order point 588):
// the nearest one in reach, and a tie that keeps the standing pick rather than
// flickering between two figures walking abreast.
import { describe, it, expect } from 'vitest'
import { TARGET_HOLD, labelPresentation, pickSpeechTarget } from './speechTarget'

const REACH = 10

describe('picking the speaker a click takes (design.md §13.4)', () => {
  it('takes the nearest speaker', () => {
    const target = pickSpeechTarget(
      [
        { speakerId: 'villager-1', distance: 6 },
        { speakerId: 'kid-2', distance: 2.5 },
        { speakerId: 'villager-3', distance: 9 },
      ],
      null,
      REACH,
    )
    expect(target).toBe('kid-2')
  })

  it('moves to another speaker once he is clearly nearer', () => {
    const first = pickSpeechTarget(
      [
        { speakerId: 'kid-1', distance: 3 },
        { speakerId: 'kid-2', distance: 5 },
      ],
      null,
      REACH,
    )
    expect(first).toBe('kid-1')
    // kid-2 walks past the player: the highlight follows him.
    expect(
      pickSpeechTarget(
        [
          { speakerId: 'kid-1', distance: 3 },
          { speakerId: 'kid-2', distance: 1 },
        ],
        first,
        REACH,
      ),
    ).toBe('kid-2')
  })

  it('keeps the standing pick on a tie instead of flickering', () => {
    const candidates = [
      { speakerId: 'kid-1', distance: 4 },
      { speakerId: 'kid-2', distance: 4 },
    ]
    expect(pickSpeechTarget(candidates, 'kid-2', REACH)).toBe('kid-2')
    // And a hair's difference is still a tie — two figures side by side are
    // never equal to the last decimal.
    expect(
      pickSpeechTarget(
        [
          { speakerId: 'kid-1', distance: 4 - TARGET_HOLD / 2 },
          { speakerId: 'kid-2', distance: 4 },
        ],
        'kid-2',
        REACH,
      ),
    ).toBe('kid-2')
  })

  it('decides a first pick by the world, not by the order the labels arrive in', () => {
    const a = pickSpeechTarget(
      [
        { speakerId: 'kid-2', distance: 4 },
        { speakerId: 'kid-1', distance: 4 },
      ],
      null,
      REACH,
    )
    const b = pickSpeechTarget(
      [
        { speakerId: 'kid-1', distance: 4 },
        { speakerId: 'kid-2', distance: 4 },
      ],
      null,
      REACH,
    )
    expect(a).toBe(b)
  })

  it('takes nobody out of reach, and drops a held target that walked away', () => {
    expect(pickSpeechTarget([{ speakerId: 'kid-1', distance: REACH + 0.1 }], null, REACH)).toBeNull()
    expect(
      pickSpeechTarget(
        [
          { speakerId: 'kid-1', distance: REACH + 5 },
          { speakerId: 'kid-2', distance: 3 },
        ],
        'kid-1',
        REACH,
      ),
    ).toBe('kid-2')
    expect(pickSpeechTarget([], 'kid-1', REACH)).toBeNull()
  })

  it('ignores a distance that is not a number at all', () => {
    expect(pickSpeechTarget([{ speakerId: 'kid-1', distance: Number.NaN }], null, REACH)).toBeNull()
  })
})

describe('what the notes show while a dialog stands open (point 588)', () => {
  it('highlights the picked speaker while nothing is open', () => {
    expect(labelPresentation(null, 'kid-2')).toEqual({ targetedId: 'kid-2', hiddenId: null })
    expect(labelPresentation(undefined, null)).toEqual({ targetedId: null, hiddenId: null })
  })

  it('invites no click while any dialog is open, since none would be taken', () => {
    expect(labelPresentation({ kind: 'trade' }, 'kid-2')).toEqual({
      targetedId: null,
      hiddenId: null,
    })
  })

  it('hides the note the open guess was opened from, and only that one', () => {
    expect(labelPresentation({ kind: 'speechGuess', speakerId: 'kid-2' }, 'kid-2')).toEqual({
      targetedId: null,
      hiddenId: 'kid-2',
    })
    // The player walked on: the guess still stands for the speaker it was
    // opened for, so it is HIS note that stays hidden, not the nearest one's.
    expect(labelPresentation({ kind: 'speechGuess', speakerId: 'kid-2' }, 'villager-1')).toEqual({
      targetedId: null,
      hiddenId: 'kid-2',
    })
  })
})
