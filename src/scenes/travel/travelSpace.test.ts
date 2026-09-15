import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { useUi } from '../../state/ui'
import { freshGame, g, jumpTo, useGame, withWorld } from '../../test/store'
import { FORM_SOCKETS, resolveFormUse, socketPosition } from '../../world/forms'
import { latLonToWorld, PLACES, placeById } from '../../world/geo'
import { settlementEnterCandidate } from './settlementEntry'
import { bindTravelSpace } from './travelSpace'

withWorld()

const places = PLACES.map((p) => ({ id: p.id, ...latLonToWorld(p.lat, p.lon) }))
const talus = socketPosition(FORM_SOCKETS.find((s) => s.id === 'bandiagara-talus')!)
const pressSpace = () => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))
}
let off: () => void

beforeEach(() => {
  freshGame()
  useUi.setState({ dialog: null, enterPlaceId: null })
  useGame.setState({ carriedForms: ['rock-relief'] })
  off = bindTravelSpace(places)
})

afterEach(() => {
  off()
  useUi.setState({ dialog: null, enterPlaceId: null })
})

describe('travel Space only enters settlements', () => {
  it.each([0, 4])('leaves the form, socket, journal and toast untouched %i reaches from the talus', (reach) => {
    const lat = talus.lat + reach * balance.digRadius / 10
    jumpTo(lat, talus.lon)
    expect(g().mode).toBe('travel')
    expect(settlementEnterCandidate(g().pos.x, g().pos.z, places, balance.placeEnterRadius, false)).toBeNull()
    // Both the solvable socket and a wrong place must be silent under Space.
    expect(resolveFormUse({
      lat, lon: talus.lon, radiusDeg: balance.digRadius / 10,
      carriedForms: g().carriedForms, spentSockets: g().spentSockets,
    }).kind).toBe(reach === 0 ? 'fits' : 'no-fit')
    g().setToast(null)
    useUi.setState({ enterPlaceId: 'cairo' }) // stale hint must not trigger entry
    const before = g()

    pressSpace()

    expect(g().spentSockets).toEqual(before.spentSockets)
    expect(g().journal).toEqual(before.journal)
    expect(g().carriedForms).toEqual(['rock-relief'])
    expect(g().toast).toBeNull()
    expect(g().mode).toBe('travel')
    expect(g().journalOpen).toBe(before.journalOpen)
  })

  it('enters a settlement at the live position with a form still in the pack', () => {
    const cairo = placeById('cairo')
    jumpTo(cairo.lat, cairo.lon)
    expect(useUi.getState().enterPlaceId).toBeNull()

    pressSpace()

    expect(g().mode).toBe('place')
    expect(g().placeId).toBe('cairo')
    expect(g().spentSockets).toEqual([])
    expect(g().carriedForms).toEqual(['rock-relief'])
  })

  it('keeps settlement entry blocked by an open dialog', () => {
    const cairo = placeById('cairo')
    jumpTo(cairo.lat, cairo.lon)
    useUi.setState({ dialog: { kind: 'agency' } })
    const before = g()

    pressSpace()

    expect(g()).toBe(before)
  })

  it('unregisters the key when the travel scene leaves', () => {
    const cairo = placeById('cairo')
    jumpTo(cairo.lat, cairo.lon)
    off()

    pressSpace()

    expect(g().mode).toBe('travel')
  })
})
