// UI store (design.md §10/§16/§21). Pure zustand transitions: the bird's-eye
// zoom clamp/unlock, dialog handling with the bazaar-bid discard, and the
// toggles. No browser needed.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  useUi,
  DEFAULT_TRAVEL_ZOOM,
  effectiveDprCap,
  effectiveSsao,
  effectiveTraa,
  effectiveBloom,
  effectiveShadows,
  effectiveShadowResolution,
  effectiveFireShadows,
  effectiveFireShadowResolution,
  effectiveFireShadowSoft,
  effectiveTerrainRefine,
  effectiveFloraFogFactor,
  effectiveFloraCastShadow,
  effectiveWeatherIntensity,
} from './ui'
import { QUALITY_PRESETS } from '../config/quality'

const u = () => useUi.getState()

beforeEach(() => {
  useUi.setState({
    dialog: null, prompt: null, debugOpen: false, mapOpen: false,
    webglFallback: false, webglWarningDismissed: false, fpsVisible: true,
    wheelZoomEnabled: false, journalDnd: false, travelZoom: DEFAULT_TRAVEL_ZOOM, bazaarBid: null,
    traaEnabled: true, touchActive: false, detailLevel: 'medium', ssaoEnabled: true, shadowMapHalf: false,
    shadowsEnabled: true, fireShadowsEnabled: true, groundDebugFlat: false, seasonCollapseEnabled: true,
    invertLook: true,
  })
})

describe('vertical look inversion (design.md §17.5, point 392)', () => {
  it('ships INVERTED and is toggled from there, not flipped elsewhere', () => {
    expect(useUi.getInitialState().invertLook).toBe(true) // the store's own default
    expect(u().invertLook).toBe(true)
    u().setInvertLook(false)
    expect(u().invertLook).toBe(false)
    u().setInvertLook(true)
    expect(u().invertLook).toBe(true)
  })
})

describe('travel zoom (design.md §21)', () => {
  it('zooms in freely but clamps zoom-out to the default without the unlock', () => {
    u().setTravelZoom(0.3)
    expect(u().travelZoom).toBe(0.3) // zoom-in always allowed
    u().setTravelZoom(3)
    expect(u().travelZoom).toBe(DEFAULT_TRAVEL_ZOOM) // zoom-out beyond default blocked
    u().setTravelZoom(0.2)
    expect(u().travelZoom).toBe(0.2) // zoom-in below the default stays unclamped
    u().setTravelZoom(0.1)
    expect(u().travelZoom).toBe(0.125) // hard minimum (design.md §21.4)
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

describe('touch layer + mobile quality preset (design.md §17.5, point 84)', () => {
  it('activateTouch arms the layer and drops to the mobile preset', () => {
    expect(u().touchActive).toBe(false)
    u().activateTouch()
    expect(u().touchActive).toBe(true)
    expect(u().traaEnabled).toBe(false) // back to render-pass MSAA
    expect(u().ssaoEnabled).toBe(false)
    expect(u().shadowMapHalf).toBe(true)
    expect(u().fireShadowsEnabled).toBe(false) // touch suppresses campfire shadows
  })

  it('is idempotent — a later touch does not clobber a debug re-enable', () => {
    u().activateTouch()
    // The player re-enables SSAO in the debug menu.
    u().setSsaoEnabled(true)
    u().activateTouch() // another touchstart
    expect(u().ssaoEnabled).toBe(true) // not reset by the second activation
    expect(u().touchActive).toBe(true)
  })

  it('each preset flag stays individually settable', () => {
    u().setSsaoEnabled(false)
    expect(u().ssaoEnabled).toBe(false)
    u().setShadowMapHalf(true)
    expect(u().shadowMapHalf).toBe(true)
    expect(u().shadowsEnabled).toBe(true) // default on
    u().setShadowsEnabled(false)
    expect(u().shadowsEnabled).toBe(false)
    expect(u().groundDebugFlat).toBe(false) // default off
    u().setGroundDebugFlat(true)
    expect(u().groundDebugFlat).toBe(true)
    expect(u().seasonCollapseEnabled).toBe(true) // default on (point 175 diagnostic)
    u().setSeasonCollapseEnabled(false)
    expect(u().seasonCollapseEnabled).toBe(false)
    // Campfire-shadow allow-flag (design.md §19.10, point 289): ON by default —
    // medium/high enable campfire shadows through the level preset.
    expect(u().fireShadowsEnabled).toBe(true)
    u().setFireShadowsEnabled(false)
    expect(u().fireShadowsEnabled).toBe(false)
  })
})

describe('graphics quality level (design.md §21, F9 / point 276 part B)', () => {
  it('defaults to medium and reads that preset through every effective selector', () => {
    expect(u().detailLevel).toBe('medium')
    const m = QUALITY_PRESETS.medium
    expect(effectiveDprCap(u())).toBe(m.dprCap) // null → native dpr
    expect(effectiveSsao(u())).toBe(false) // SSAO only in high
    expect(effectiveTraa(u())).toBe(true)
    expect(effectiveBloom(u())).toBe(true)
    expect(effectiveShadows(u())).toBe(true)
    expect(effectiveShadowResolution(u())).toBe(m.sunShadowResolution) // 2048
    expect(effectiveFireShadows(u())).toBe(true) // medium enables campfire shadows
    expect(effectiveFireShadowResolution(u())).toBe(256)
    expect(effectiveFireShadowSoft(u())).toBe(false)
    expect(effectiveTerrainRefine(u())).toBe(true)
    expect(effectiveFloraFogFactor(u())).toBe(1)
    expect(effectiveFloraCastShadow(u())).toBe(true)
    expect(effectiveWeatherIntensity(u())).toBe(1)
  })

  it('low is the frugal floor: dpr 1, all post off, no shadows at all, tight flora', () => {
    u().setDetailLevel('low')
    expect(effectiveDprCap(u())).toBe(1)
    expect(effectiveSsao(u())).toBe(false)
    expect(effectiveTraa(u())).toBe(false)
    expect(effectiveBloom(u())).toBe(false)
    // Point 305 (M1-Pro tuning): no sun shadows on low — the shadow passes were
    // the benchmark's biggest remaining GPU/draw-call lever after dpr + post.
    expect(effectiveShadows(u())).toBe(false)
    expect(effectiveShadowResolution(u())).toBe(1024) // moot while shadows are off
    expect(effectiveFireShadows(u())).toBe(false)
    expect(effectiveTerrainRefine(u())).toBe(false)
    expect(effectiveFloraFogFactor(u())).toBeLessThan(1)
    expect(effectiveFloraCastShadow(u())).toBe(false)
    expect(effectiveWeatherIntensity(u())).toBeLessThan(1)
  })

  it('high is the richest: SSAO on, 4096 shadows, the soft campfire variant', () => {
    u().setDetailLevel('high')
    expect(effectiveSsao(u())).toBe(true)
    expect(effectiveShadowResolution(u())).toBe(4096)
    expect(effectiveFireShadows(u())).toBe(true)
    expect(effectiveFireShadowResolution(u())).toBe(512)
    expect(effectiveFireShadowSoft(u())).toBe(true)
  })

  it('cycleDetailLevel steps DOWN and wraps: medium → low → high → medium', () => {
    expect(u().detailLevel).toBe('medium')
    u().cycleDetailLevel()
    expect(u().detailLevel).toBe('low')
    u().cycleDetailLevel()
    expect(u().detailLevel).toBe('high')
    u().cycleDetailLevel()
    expect(u().detailLevel).toBe('medium')
  })

  it('the allow-flags suppress a feature WITHIN a level without the level clobbering them', () => {
    // At high, SSAO/shadows/fire are on; the player tunes SSAO off for testing.
    u().setDetailLevel('high')
    u().setSsaoEnabled(false)
    expect(effectiveSsao(u())).toBe(false) // suppressed
    expect(u().ssaoEnabled).toBe(false) // the flag holds
    // Switching level does NOT rewrite the flag (unlike activateTouch).
    u().setDetailLevel('medium')
    expect(u().ssaoEnabled).toBe(false) // untouched by the level change
    u().setDetailLevel('high')
    expect(effectiveSsao(u())).toBe(false) // the player's suppression still holds
  })

  it('the half-map override halves the level shadow resolution again (floored)', () => {
    u().setDetailLevel('medium')
    u().setShadowMapHalf(true)
    expect(effectiveShadowResolution(u())).toBe(1024) // 2048 / 2 — the touch look
    u().setDetailLevel('high')
    expect(effectiveShadowResolution(u())).toBe(2048) // 4096 / 2
  })

  it('the touch preset stays a SUBSET of low without switching the level', () => {
    // Touch drops SSAO/TRAA/fire off and shadow maps to half, all at the default
    // medium level — never regressed by the quality-level system.
    u().activateTouch()
    expect(u().detailLevel).toBe('medium') // the level itself is untouched
    expect(effectiveSsao(u())).toBe(false)
    expect(effectiveTraa(u())).toBe(false)
    expect(effectiveFireShadows(u())).toBe(false)
    expect(effectiveShadowResolution(u())).toBe(1024) // half of medium's 2048
    expect(effectiveBloom(u())).toBe(true) // touch keeps bloom, as before
  })
})
