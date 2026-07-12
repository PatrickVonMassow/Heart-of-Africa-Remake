// UI store (design.md §10/§16/§21). Pure zustand transitions: the bird's-eye
// zoom clamp/unlock, dialog handling with the bazaar-bid discard, and the
// toggles. No browser needed.
import { describe, it, expect, beforeEach } from 'vitest'
import { useUi, DEFAULT_TRAVEL_ZOOM } from './ui'

const u = () => useUi.getState()

beforeEach(() => {
  useUi.setState({
    dialog: null, prompt: null, debugOpen: false, mapOpen: false,
    webglFallback: false, webglWarningDismissed: false, fpsVisible: true,
    wheelZoomEnabled: false, journalDnd: false, travelZoom: DEFAULT_TRAVEL_ZOOM, bazaarBid: null,
  })
})

describe('travel zoom (design.md §21)', () => {
  it('zooms in freely but clamps zoom-out to the default without the unlock', () => {
    u().setTravelZoom(0.3)
    expect(u().travelZoom).toBe(0.3) // zoom-in always allowed
    u().setTravelZoom(3)
    expect(u().travelZoom).toBe(DEFAULT_TRAVEL_ZOOM) // zoom-out beyond default blocked
    u().setTravelZoom(0.1)
    expect(u().travelZoom).toBe(0.25) // hard minimum
  })

  it('the debug unlock allows zoom-out far enough to take in the continent', () => {
    u().setWheelZoomEnabled(true)
    u().setTravelZoom(3)
    expect(u().travelZoom).toBe(3)
    u().setTravelZoom(99)
    expect(u().travelZoom).toBe(16) // hard maximum — whole-continent view
  })

  it('disabling the unlock clamps a wide view back but keeps a zoomed-in one', () => {
    u().setWheelZoomEnabled(true)
    u().setTravelZoom(3)
    u().setWheelZoomEnabled(false)
    expect(u().travelZoom).toBe(DEFAULT_TRAVEL_ZOOM)

    u().setWheelZoomEnabled(true)
    u().setTravelZoom(0.3)
    u().setWheelZoomEnabled(false)
    expect(u().travelZoom).toBe(0.3)
  })
})

describe('dialogs and bazaar bid (design.md §10)', () => {
  it('opening/closing a dialog discards a pending bazaar bid', () => {
    u().setBazaarBid({ treasure: 'gold', amount: 120 })
    expect(u().bazaarBid).not.toBeNull()
    u().setDialog({ kind: 'audience' })
    expect(u().bazaarBid).toBeNull()
    u().setBazaarBid({ treasure: 'silver', amount: 30 })
    u().setDialog(null)
    expect(u().bazaarBid).toBeNull()
  })
})

describe('toggles and flags', () => {
  it('toggles debug, map and dnd', () => {
    u().toggleDebug()
    expect(u().debugOpen).toBe(true)
    u().toggleMap()
    expect(u().mapOpen).toBe(true)
    u().setJournalDnd(true)
    expect(u().journalDnd).toBe(true)
  })

  it('dismisses the WebGL-fallback warning permanently', () => {
    u().setWebglFallback(true)
    u().dismissWebglWarning()
    expect(u().webglFallback).toBe(true)
    expect(u().webglWarningDismissed).toBe(true)
  })
})
