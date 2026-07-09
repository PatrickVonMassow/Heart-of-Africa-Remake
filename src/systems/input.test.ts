// Keyboard half of the input layer (design.md §17): the one-shot onKeyPress
// subscription and the pure WASD/arrow movement axes. The gamepad path
// (engagement, sticks, the RAF button poll) reads a live navigator.getGamepads()
// and requestAnimationFrame, so it stays in the Playwright suite
// (scripts/verify/gamepad.mjs) rather than being simulated here.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { onKeyPress, moveAxes } from './input'

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
