// The chief is met OUTSIDE his hut (design.md §12, §13.4): the use key at the
// door brings him out, and from there it sends his drummed message. No audience
// overlay stands between the traveller and the drums any more — and the key
// hands nothing over: the find from the boulder is given by using the inventory
// item before him (design.md §6), which store.rockArtefact.test.ts pins.
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

/** An empty pack of trade goods — every material at zero, none missing. */
const NO_GIFTS = { gold: 0, silver: 0, emerald: 0, copper: 0, ivory: 0 }

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

  it('the key hands NOTHING over — carrying the find changes nothing about it', () => {
    // The find is an inventory item and is given by USING it before him
    // (design.md §6). The key and the give no longer share one press, so the
    // message goes out whether the find is carried or not.
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    g().callChiefOut()
    useGame.setState({ rockArtefact: 'carried' })
    expect(nextChiefAction(g())).toBe('send-message')
    useGame.setState({ rockArtefact: 'given' })
    expect(nextChiefAction(g())).toBe('send-message')
  })

  it('sends his message on the first visit — no gift, no standing, no trust', () => {
    // The only thing between the traveller and the message is that he does not
    // know the words. Every gate that once stood here was a placeholder of an
    // early version; this pins its absence, from a state that has given nothing
    // away and earned nothing.
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    // Stripped of the starting outfit's trade goods, so nothing he owns can be
    // mistaken for the price of the message.
    useGame.setState({ gifts: NO_GIFTS })
    expect(Object.values(g().gifts).reduce((a, b) => a + b, 0)).toBe(0)
    expect(g().honoredFriend).toEqual({})
    expect(g().drumMessageHeard).toBe(false)
    g().callChiefOut()
    expect(nextChiefAction(g())).toBe('send-message')
  })

  it('keeps sending it however poor and however unknown the traveller is', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    g().callChiefOut()
    useGame.setState({ gifts: NO_GIFTS, honoredFriend: {}, money: 0 })
    expect(nextChiefAction(g())).toBe('send-message')
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
