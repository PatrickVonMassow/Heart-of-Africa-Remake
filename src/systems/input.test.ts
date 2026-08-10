// Keyboard half of the input layer (design.md §17): the one-shot onKeyPress
// subscription and the pure WASD/arrow movement axes. The gamepad path
// (engagement, sticks, the RAF button poll) reads a live navigator.getGamepads()
// and requestAnimationFrame, so it stays in the Playwright suite
// (scripts/verify/gamepad.mjs) rather than being simulated here.
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  onKeyPress,
  moveAxes,
  setTouchStick,
  touchMove,
  addTouchLook,
  consumeTouchLook,
  addTouchPinch,
  consumeTouchPinch,
  onTouchEngage,
  isTouchEngaged,
  dispatchSyntheticKey,
  wheelTargetsScene,
} from './input'

const press = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code }))
const release = (code: string) => window.dispatchEvent(new KeyboardEvent('keyup', { code }))

afterEach(() => {
  // input.ts clears its pressed-key set on window blur; reset between tests.
  window.dispatchEvent(new Event('blur'))
})

describe('onKeyPress (design.md §17)', () => {
  it('fires only for the registered code and stops after unsubscribe', () => {
    const cb = vi.fn()
    const off = onKeyPress('KeyG', cb)
    press('KeyG')
    expect(cb).toHaveBeenCalledTimes(1)
    press('KeyH') // a different code does nothing
    expect(cb).toHaveBeenCalledTimes(1)
    press('KeyG')
    expect(cb).toHaveBeenCalledTimes(2)
    off()
    press('KeyG') // unsubscribed: no further calls
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('ignores keydowns originating from a text input (debug-field guard)', () => {
    // input.ts guards only INPUT targets (the debug-menu fields); TEXTAREA and
    // SELECT are not handled by the source, so only INPUT is asserted here.
    const cb = vi.fn()
    const off = onKeyPress('KeyG', cb)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG', bubbles: true }))
    expect(cb).not.toHaveBeenCalled()
    // A window-level keydown of the same code still fires.
    press('KeyG')
    expect(cb).toHaveBeenCalledTimes(1)
    off()
    input.remove()
  })
})

describe('moveAxes (design.md §17)', () => {
  it('maps WASD/arrows to clamped movement axes with no gamepad present', () => {
    press('KeyW')
    expect(moveAxes()).toEqual({ x: 0, y: 1 })
    release('KeyW')

    press('KeyD')
    expect(moveAxes()).toEqual({ x: 1, y: 0 })
    release('KeyD')

    // Diagonal forward-left: each axis stays within [-1, 1].
    press('KeyW')
    press('KeyA')
    expect(moveAxes()).toEqual({ x: -1, y: 1 })
    release('KeyW')
    release('KeyA')

    // Opposing keys cancel out (a diagonal is never faster than straight).
    press('ArrowUp')
    press('ArrowDown')
    expect(moveAxes()).toEqual({ x: 0, y: 0 })
    release('ArrowUp')
    release('ArrowDown')
  })
})

// The browser's chords, taken away where the platform allows it (work-order
// 601). The decision itself is pinned in keyboardGuard.test.ts; what is asserted
// here is that the global keydown listener really applies it.
describe('modifier chords on the game keys', () => {
  const chordDown = (code: string, ctrlKey: boolean) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { code, ctrlKey, cancelable: true }))

  it('prevents Ctrl+W (close tab) and still registers the forward key', () => {
    expect(chordDown('KeyW', true)).toBe(false) // defaultPrevented
    expect(moveAxes()).toEqual({ x: 0, y: 1 }) // holding the modifier steers on
    release('KeyW')
  })

  it('leaves a chord on an unbound key alone', () => {
    expect(chordDown('KeyR', true)).toBe(true) // Ctrl+R stays the browser's reload
    release('KeyR')
  })

  it('leaves the keyboard zoom and the tab jumps alone, and the plain key still reaches the game', () => {
    // The month row is bound PLAIN (design.md §21.1), so Ctrl+1 and Ctrl+0 stay
    // the browser's tab jump and zoom reset — preventing them would protect
    // nothing.
    expect(chordDown('Digit1', true)).toBe(true)
    expect(chordDown('Minus', true)).toBe(true)
    release('Digit1')
    release('Minus')
    // …while the plain key still drives the game handler it is bound to.
    const cb = vi.fn()
    const off = onKeyPress('Digit1', cb)
    expect(chordDown('Digit1', false)).toBe(true)
    expect(cb).toHaveBeenCalledTimes(1)
    off()
    release('Digit1')
  })

  it('leaves a plain keypress alone', () => {
    expect(chordDown('KeyW', false)).toBe(true)
    release('KeyW')
  })

  it('keeps the chord inside a form control (Ctrl+A in a debug field)', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const ok = input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', ctrlKey: true, bubbles: true, cancelable: true }))
    expect(ok).toBe(true)
    input.remove()
  })
})

// Touch state (design.md §17.5, point 84): the overlay writes it, the scenes
// consume it — plain module state, no DOM/RAF involved, so it is jsdom-safe.
describe('touch stick and look/pinch accumulators (design.md §17.5)', () => {
  it('setTouchStick/touchMove round-trip the virtual-stick axes', () => {
    expect(touchMove()).toEqual({ x: 0, y: 0 })
    setTouchStick(0.5, -0.3)
    expect(touchMove()).toEqual({ x: 0.5, y: -0.3 })
    setTouchStick(0, 0) // leave it neutral for later tests
  })

  it('addTouchLook accumulates deltas; consumeTouchLook reads them and resets to zero', () => {
    addTouchLook(3, -2)
    addTouchLook(1, 1)
    expect(consumeTouchLook()).toEqual({ dx: 4, dy: -1 })
    expect(consumeTouchLook()).toEqual({ dx: 0, dy: 0 }) // already consumed
  })

  it('addTouchPinch folds multiplicatively; consumeTouchPinch reads it and resets to the identity', () => {
    addTouchPinch(0.5)
    addTouchPinch(2)
    expect(consumeTouchPinch()).toBeCloseTo(1, 9) // 0.5 * 2
    expect(consumeTouchPinch()).toBe(1) // reset to the identity ratio
  })
})

describe('dispatchSyntheticKey (design.md §17.5: gamepad/touch share the keyboard pipeline)', () => {
  it('re-enters the pipeline as an ordinary keydown, reaching onKeyPress handlers', () => {
    // Space is the use key (design.md §17.5): the gamepad A button and the
    // tappable touch prompt both dispatch it through this one path.
    const cb = vi.fn()
    const off = onKeyPress('Space', cb)
    dispatchSyntheticKey('Space')
    expect(cb).toHaveBeenCalledTimes(1)
    off()
  })
})

// The engagement latch never disarms (by design), so these cases must run in
// this order within the file: "not yet engaged" has to be observed before any
// touchstart is dispatched anywhere below.
describe('touch engagement latch (design.md §17.5, point 84 — deliberate-input guard)', () => {
  it('starts unengaged and defers a registered callback', () => {
    expect(isTouchEngaged()).toBe(false)
    const cb = vi.fn()
    onTouchEngage(cb)
    expect(cb).not.toHaveBeenCalled()
  })

  it('arms on the first touchstart, firing every pending callback exactly once', () => {
    const cb = vi.fn()
    const unsub = onTouchEngage(cb)
    window.dispatchEvent(new Event('touchstart'))
    expect(isTouchEngaged()).toBe(true)
    expect(cb).toHaveBeenCalledTimes(1)
    unsub() // already fired; unsubscribe is a no-op past engagement
  })

  it('fires a callback registered after engagement immediately, and a later touch changes nothing', () => {
    const cb = vi.fn()
    onTouchEngage(cb)
    expect(cb).toHaveBeenCalledTimes(1) // already armed -> fires synchronously
    window.dispatchEvent(new Event('touchstart')) // a second touch is not the arming one
    expect(isTouchEngaged()).toBe(true)
  })
})

// Point 325: the bird's-eye zoom listens on `window`, so without this gate a
// wheel over the long debug panel scrolled the panel AND zoomed the view.
describe('wheelTargetsScene — a scrollable overlay keeps the wheel to itself', () => {
  const mount = (html: string) => {
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    return host
  }
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('lets a wheel over the canvas drive the scene', () => {
    const host = mount('<canvas id="scene"></canvas>')
    expect(wheelTargetsScene(host.querySelector('#scene'))).toBe(true)
  })

  it('keeps a wheel over the debug panel — and any child of it — out of the zoom', () => {
    const host = mount('<div class="debug-menu"><span id="hd">Debug</span></div>')
    expect(wheelTargetsScene(host.querySelector('.debug-menu'))).toBe(false)
    expect(wheelTargetsScene(host.querySelector('#hd'))).toBe(false)
  })

  it('covers a deeply nested control inside the debug panel', () => {
    const host = mount(
      '<div class="debug-menu"><section><label><span>Zoom</span><input id="f" /></label></section></div>',
    )
    expect(wheelTargetsScene(host.querySelector('#f'))).toBe(false)
  })

  it('covers the journal panel and the load table the same way', () => {
    const host = mount(
      '<div class="journal"><p id="entry">Entry</p></div>' +
        '<table class="load-menu"><tbody><tr><td id="cell">Cairo</td></tr></tbody></table>',
    )
    expect(wheelTargetsScene(host.querySelector('.journal'))).toBe(false)
    expect(wheelTargetsScene(host.querySelector('#entry'))).toBe(false)
    expect(wheelTargetsScene(host.querySelector('.load-menu'))).toBe(false)
    expect(wheelTargetsScene(host.querySelector('#cell'))).toBe(false)
  })

  it('is false-positive-free: bare HUD chrome beside a panel still zooms', () => {
    const host = mount(
      '<div class="debug-menu"><span>Debug</span></div>' +
        '<div class="status-bar"><span id="stat">1890</span></div>' +
        '<div class="inventory-bar"><button id="item">Canoe</button></div>',
    )
    expect(wheelTargetsScene(host.querySelector('.status-bar'))).toBe(true)
    expect(wheelTargetsScene(host.querySelector('#stat'))).toBe(true)
    expect(wheelTargetsScene(host.querySelector('#item'))).toBe(true)
    expect(wheelTargetsScene(document.body)).toBe(true)
  })

  it('treats a non-element target (window, document, null) as the scene', () => {
    expect(wheelTargetsScene(null)).toBe(true)
    expect(wheelTargetsScene(window)).toBe(true)
    expect(wheelTargetsScene(document)).toBe(true)
  })
})
