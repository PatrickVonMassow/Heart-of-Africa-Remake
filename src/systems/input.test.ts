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
    const cb = vi.fn()
    const off = onKeyPress('KeyE', cb)
    dispatchSyntheticKey('KeyE')
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
