// The chief is met OUTSIDE his hut (design.md §12, §13.4): the use key at the
// door brings him out, and from there he gives what he has to give in the open
// — the drummed message and the answer to the find from the boulder. No
// audience overlay stands between the traveller and the drums any more.
import { describe, it, expect, beforeEach } from 'vitest'
import { g, freshGame, withWorld, useGame } from '../../test/store'
import { DRUM_MESSAGE_VILLAGE } from '../../state/store'
import { getStrings } from '../../i18n'
import { nextChiefAction } from './chiefMeeting'
import { chiefStandingSpot, CHIEF_STAND_OFFSET, buildLayout } from './layout'
import { placeById } from '../../world/geo'

withWorld()

beforeEach(() => {
  freshGame()
})

/** A village that is NOT the one whose chief has a message to send. */
const OTHER_VILLAGE = 'maasai-village'

describe('the chief comes out of his hut (design.md §12)', () => {
  it('is not met at all outside a village', () => {
    expect(nextChiefAction(g())).toBe('none')
  })

  it('the first use at his hut brings him out', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    expect(g().chiefOutside[DRUM_MESSAGE_VILLAGE]).toBeFalsy()
    expect(nextChiefAction(g())).toBe('step-out')
    g().callChiefOut()
    expect(g().chiefOutside[DRUM_MESSAGE_VILLAGE]).toBe(true)
    expect(g().toast).toBe(getStrings().toasts.chiefStepsOut)
  })

  it('standing before him orients the traveller in the settlement (§17)', () => {
    g().enterPlace(OTHER_VILLAGE)
    expect(g().orientationGiven[OTHER_VILLAGE]).toBeFalsy()
    g().callChiefOut()
    expect(g().orientationGiven[OTHER_VILLAGE]).toBe(true)
  })

  it('he stays out — a second use is no longer a step-out', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    g().callChiefOut()
    expect(nextChiefAction(g())).not.toBe('step-out')
  })

  it('another people’s chief has no message of his own to send', () => {
    g().enterPlace(OTHER_VILLAGE)
    g().callChiefOut()
    expect(nextChiefAction(g())).toBe('no-message')
  })

  it('the find from the boulder outranks the message', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    g().callChiefOut()
    useGame.setState({ rockArtefact: 'carried' })
    expect(nextChiefAction(g())).toBe('hand-over')
  })

  it('the chief being outside survives a save and its reload', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    g().callChiefOut()
    g().saveCheckpoint()
    g().newGame()
    expect(g().chiefOutside[DRUM_MESSAGE_VILLAGE]).toBeFalsy()
    expect(g().loadCheckpoint()).toBe(true)
    expect(g().chiefOutside[DRUM_MESSAGE_VILLAGE]).toBe(true)
  })
})

describe('where he stands (design.md §12)', () => {
  it('beside his own door, clear of the door point and of the hut', () => {
    const place = placeById(DRUM_MESSAGE_VILLAGE)
    const layout = buildLayout(place.id, 12345)
    const hut = layout.interactives.find((it) => it.type === 'chief')!
    const [x, z] = chiefStandingSpot(hut)
    const door = hut.door!
    // A step to the side of the door the traveller presses the key at …
    expect(Math.hypot(x - door[0], z - door[1])).toBeCloseTo(CHIEF_STAND_OFFSET, 5)
    // … and outside the hut's own body, so he is met face to face.
    expect(Math.hypot(x - hut.pos[0], z - hut.pos[1])).toBeGreaterThan(3.35)
  })
})
