// The chief is met OUTSIDE his hut, at his drummer's side (design.md §12,
// §13.4): the use key at the door sends him out and across, and out there the
// key at either man sends his drummed message, repeats it and calls him back.
// The hut answers nothing while he is out of it, the drummer names him while he
// is in it, and the key hands nothing over — the find from the boulder is given
// by using the inventory item before him (design.md §6), which
// store.rockArtefact.test.ts pins.
import { describe, it, expect, beforeEach } from 'vitest'
import { g, freshGame, withWorld, useGame } from '../../test/store'
import { DRUM_MESSAGE_VILLAGE } from '../../state/store'
import { getStrings } from '../../i18n'
import { nextChiefAction } from './chiefMeeting'
import { chiefWalkState } from './chiefPresence'
import { chiefStandingSpot, CHIEF_STAND_OFFSET, buildLayout } from './layout'
import { chiefBesideDrummerSpot } from './chiefWalk'
import { PLAYER_RADIUS, standingClear } from './collision'
import { VILLAGE_SPOTS } from './lifeSpots'
import { balance } from '../../config/balance'
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
    expect(nextChiefAction('hut', g(), 'in-hut')).toBe('none')
    expect(nextChiefAction('drummer', g(), 'in-hut')).toBe('none')
  })

  it('the use at his hut sends him out to his drummer', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    expect(g().chiefOutside[DRUM_MESSAGE_VILLAGE]).toBeFalsy()
    expect(nextChiefAction('hut', g(), 'in-hut')).toBe('step-out')
    g().callChiefOut()
    expect(g().chiefOutside[DRUM_MESSAGE_VILLAGE]).toBe(true)
    expect(chiefWalkState().phase).toBe('walking-out')
    expect(g().toast).toBe(getStrings().toasts.chiefStepsOut)
  })

  it('standing before him orients the traveller in the settlement (§17)', () => {
    g().enterPlace(OTHER_VILLAGE)
    expect(g().orientationGiven[OTHER_VILLAGE]).toBeFalsy()
    g().callChiefOut()
    expect(g().orientationGiven[OTHER_VILLAGE]).toBe(true)
  })

  it('leaves the hut inert in every phase but the one he is inside for', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    for (const phase of ['walking-out', 'at-drummer', 'walking-back'] as const) {
      expect(nextChiefAction('hut', g(), phase), phase).toBe('none')
    }
    expect(nextChiefAction('hut', g(), 'in-hut')).toBe('step-out')
  })

  it('answers nothing at either man while he is still on his way out', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    expect(nextChiefAction('chief', g(), 'walking-out')).toBe('none')
    expect(nextChiefAction('drummer', g(), 'walking-out')).toBe('none')
  })
})

describe('the drums, once he stands there (design.md §13.4)', () => {
  it('sends the message from either man', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    expect(nextChiefAction('chief', g(), 'at-drummer')).toBe('send-message')
    expect(nextChiefAction('drummer', g(), 'at-drummer')).toBe('send-message')
  })

  it('calls him back from either man while he walks home', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    expect(nextChiefAction('chief', g(), 'walking-back')).toBe('call-back')
    expect(nextChiefAction('drummer', g(), 'walking-back')).toBe('call-back')
  })

  it('another people’s chief has no message of his own to send', () => {
    g().enterPlace(OTHER_VILLAGE)
    expect(nextChiefAction('chief', g(), 'at-drummer')).toBe('no-message')
  })

  it('the key hands NOTHING over — carrying the find changes nothing about it', () => {
    // The find is an inventory item and is given by USING it before him
    // (design.md §6). The key and the give no longer share one press, so the
    // message goes out whether the find is carried or not.
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    useGame.setState({ rockArtefact: 'carried' })
    expect(nextChiefAction('chief', g(), 'at-drummer')).toBe('send-message')
    useGame.setState({ rockArtefact: 'given' })
    expect(nextChiefAction('chief', g(), 'at-drummer')).toBe('send-message')
  })

  it('sends his message on the first visit — no gift, no standing, no trust', () => {
    // The only thing between the traveller and the message is that he does not
    // know the words. Every gate that once stood here was a placeholder of an
    // early version; this pins its absence, from a state that has given nothing
    // away and earned nothing.
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    // Stripped of the starting outfit's trade goods, so nothing he owns can be
    // mistaken for the price of the message.
    useGame.setState({ gifts: NO_GIFTS, honoredFriend: {}, money: 0 })
    expect(Object.values(g().gifts).reduce((a, b) => a + b, 0)).toBe(0)
    expect(g().drumMessageHeard).toBe(false)
    expect(nextChiefAction('drummer', g(), 'at-drummer')).toBe('send-message')
  })
})

describe('the drummer’s own word (design.md §13.4)', () => {
  it('names the chief while the chief is in his hut', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    expect(nextChiefAction('drummer', g(), 'in-hut')).toBe('name-chief')
    // …and the chief himself is not there to be spoken to.
    expect(nextChiefAction('chief', g(), 'in-hut')).toBe('none')
  })

  it('says it in any village, not only the one with a message', () => {
    g().enterPlace(OTHER_VILLAGE)
    expect(nextChiefAction('drummer', g(), 'in-hut')).toBe('name-chief')
  })

  it('says nothing of the kind in a port', () => {
    g().enterPlace('cairo')
    expect(nextChiefAction('drummer', g(), 'in-hut')).toBe('none')
  })
})

describe('a settlement entered has its chief indoors (design.md §13.4)', () => {
  it('leaving the village and coming back finds him in his hut', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    g().callChiefOut()
    expect(g().chiefOutside[DRUM_MESSAGE_VILLAGE]).toBe(true)
    g().leavePlace()
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    expect(g().chiefOutside[DRUM_MESSAGE_VILLAGE]).toBeFalsy()
    expect(chiefWalkState().phase).toBe('in-hut')
    expect(nextChiefAction('hut', g(), chiefWalkState().phase)).toBe('step-out')
  })

  it('a resumed run finds him in his hut too — the walk is never saved', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    g().callChiefOut()
    g().saveCheckpoint()
    g().newGame()
    // He is OUT again when the load comes, so what follows is really the LOAD
    // putting him back indoors and cannot pass by accident.
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    g().callChiefOut()
    expect(chiefWalkState().phase).not.toBe('in-hut')
    expect(g().loadCheckpoint()).toBe(true)
    expect(g().chiefOutside[DRUM_MESSAGE_VILLAGE]).toBeFalsy()
    // …and the WALK starts over with the flag. Clearing the coarse half alone
    // would strand him beside the drummer, and a stranded walk answers the hut
    // key with nothing for the rest of the session.
    expect(chiefWalkState().phase).toBe('in-hut')
    expect(nextChiefAction('hut', g(), chiefWalkState().phase)).toBe('step-out')
  })

  it('a load that FAILS leaves both halves of him exactly as they were', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    g().callChiefOut()
    // A checkpoint the load cannot read: visitedPlaces is spread as an array,
    // so building the replacement state throws before anything is set. Resetting
    // one half before that point would leave the flag up and the walk indoors —
    // the same standoff the other way round, and the hut key dead with it.
    localStorage.setItem('hoa-checkpoints-v1', JSON.stringify([{ visitedPlaces: {} }]))
    expect(g().loadCheckpoint()).toBe(false)
    expect(g().chiefOutside[DRUM_MESSAGE_VILLAGE]).toBe(true)
    expect(chiefWalkState().phase).not.toBe('in-hut')
  })

  it('a new game finds him in his hut too — both halves are cleared together', () => {
    g().enterPlace(DRUM_MESSAGE_VILLAGE)
    g().callChiefOut()
    expect(chiefWalkState().phase).not.toBe('in-hut')
    g().newGame()
    expect(g().chiefOutside[DRUM_MESSAGE_VILLAGE]).toBeFalsy()
    expect(chiefWalkState().phase).toBe('in-hut')
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

  it('walks a line to the drummer that is clear of the settlement', () => {
    // He has no collider of his own and does not resolve one, so the path he is
    // interpolated along has to BE clear. Measured in the village the whole
    // mechanic plays in, by the game's OWN standing rule and with a grown
    // figure's footprint — the two ends are excepted by construction: he steps
    // out of his own hut and up beside the drummer's own body.
    const layout = buildLayout(DRUM_MESSAGE_VILLAGE, 12345)
    const hut = layout.interactives.find((it) => it.type === 'chief')!
    const from = chiefStandingSpot(hut)
    const to = chiefBesideDrummerSpot(balance.communication.chiefBesideDrummer)
    const clear = layout.colliders.filter((c) => {
      const at = c.kind === 'segment' ? [c.x1, c.z1] : [c.x, c.z]
      return (
        Math.hypot(at[0] - hut.pos[0], at[1] - hut.pos[1]) > 0.01 &&
        Math.hypot(at[0] - VILLAGE_SPOTS.drummer[0], at[1] - VILLAGE_SPOTS.drummer[1]) > 0.01
      )
    })
    const blocked: string[] = []
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      const x = from[0] + (to[0] - from[0]) * t
      const z = from[1] + (to[1] - from[1]) * t
      if (!standingClear(clear, x, z, PLAYER_RADIUS)) blocked.push(t.toFixed(2))
    }
    expect(blocked).toEqual([])
  })
})
