// The keyboard capture of work-order 601: which chords the game swallows, and
// when it asks for the Keyboard Lock. Everything here is decided without a
// browser — the lock's state machine takes its API as an argument — so the
// Playwright side only has to prove the wiring (scripts/verify/settings.mjs).
import { describe, it, expect, vi } from 'vitest'
import {
  GAME_KEY_CODES,
  KEYBOARD_LOCK_CODES,
  createKeyboardLockController,
  isGameKeyCode,
  preventsBrowserChord,
  shouldLockKeyboard,
} from './keyboardGuard'
import { MONTH_KEYS } from './season'

const chord = (code: string, mods: { ctrlKey?: boolean; altKey?: boolean } = { ctrlKey: true }) => ({
  code,
  ctrlKey: mods.ctrlKey ?? false,
  altKey: mods.altKey ?? false,
})

describe('the bound-key set (design.md §17.5/§21.1)', () => {
  it('holds the movement, action and debug keys the game really binds', () => {
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'Space', 'Tab', 'KeyT', 'KeyU', 'F6']) {
      expect(isGameKeyCode(code)).toBe(true)
    }
    for (const code of MONTH_KEYS) expect(isGameKeyCode(code)).toBe(true)
  })

  it('leaves the keys the game does not bind to the browser', () => {
    // F5 (reload) and the devtools/reload letters are deliberately unbound.
    for (const code of ['KeyR', 'KeyI', 'KeyJ', 'KeyN', 'F5', 'F12']) {
      expect(isGameKeyCode(code)).toBe(false)
    }
  })

  it('locks every bound key except Escape, so leaving fullscreen stays one press', () => {
    expect(KEYBOARD_LOCK_CODES).not.toContain('Escape')
    expect(KEYBOARD_LOCK_CODES).toContain('KeyW')
    expect(new Set(KEYBOARD_LOCK_CODES).size).toBe(GAME_KEY_CODES.length - 1)
  })
})

describe('preventsBrowserChord (work-order 601)', () => {
  it('prevents a Ctrl chord on a bound game key', () => {
    // The user's own case: Ctrl held for the labels, W walking forward.
    expect(preventsBrowserChord(chord('KeyW'), { typing: false })).toBe(true)
    // The other collisions the browser really acts on: save, print, bookmark,
    // select-all, and the journal's tab-switch key.
    for (const code of ['KeyS', 'KeyP', 'KeyD', 'KeyA', 'KeyT']) {
      expect(preventsBrowserChord(chord(code), { typing: false })).toBe(true)
    }
  })

  it('leaves an unbound key its browser meaning', () => {
    for (const code of ['KeyR', 'KeyI', 'KeyN', 'F5']) {
      expect(preventsBrowserChord(chord(code), { typing: false })).toBe(false)
    }
  })

  it('prevents an Alt chord too, since the label modifier is rebindable', () => {
    expect(preventsBrowserChord(chord('ArrowLeft', { altKey: true }), { typing: false })).toBe(true)
  })

  it('never touches a plain keypress', () => {
    expect(preventsBrowserChord(chord('KeyW', {}), { typing: false })).toBe(false)
    expect(preventsBrowserChord(chord('Space', {}), { typing: false })).toBe(false)
  })

  it('keeps Ctrl+A/C/V inside a form control', () => {
    expect(preventsBrowserChord(chord('KeyA'), { typing: true })).toBe(false)
    expect(preventsBrowserChord(chord('KeyW'), { typing: true })).toBe(false)
  })
})

describe('shouldLockKeyboard', () => {
  it('is true only with fullscreen AND the pointer', () => {
    expect(shouldLockKeyboard({ fullscreen: true, pointerLocked: true })).toBe(true)
    expect(shouldLockKeyboard({ fullscreen: true, pointerLocked: false })).toBe(false)
    expect(shouldLockKeyboard({ fullscreen: false, pointerLocked: true })).toBe(false)
    expect(shouldLockKeyboard({ fullscreen: false, pointerLocked: false })).toBe(false)
  })
})

describe('the lock controller', () => {
  const stub = () => ({ lock: vi.fn(() => Promise.resolve()), unlock: vi.fn() })

  it('requests the lock once when both conditions arrive, with the bound codes', () => {
    const api = stub()
    const c = createKeyboardLockController(() => api)
    expect(c.sync({ fullscreen: false, pointerLocked: true })).toBe(false)
    expect(api.lock).not.toHaveBeenCalled()
    expect(c.sync({ fullscreen: true, pointerLocked: true })).toBe(true)
    expect(api.lock).toHaveBeenCalledTimes(1)
    expect(api.lock).toHaveBeenCalledWith(KEYBOARD_LOCK_CODES)
    // A repeated sync in the same state must not ask again.
    c.sync({ fullscreen: true, pointerLocked: true })
    expect(api.lock).toHaveBeenCalledTimes(1)
  })

  it('releases when the pointer lock goes, and when fullscreen goes', () => {
    for (const gone of [{ fullscreen: true, pointerLocked: false }, { fullscreen: false, pointerLocked: true }]) {
      const api = stub()
      const c = createKeyboardLockController(() => api)
      c.sync({ fullscreen: true, pointerLocked: true })
      expect(c.sync(gone)).toBe(false)
      expect(api.unlock).toHaveBeenCalledTimes(1)
    }
  })

  it('is a no-op without the API — its absence is never an error', () => {
    const c = createKeyboardLockController(() => undefined)
    expect(() => c.sync({ fullscreen: true, pointerLocked: true })).not.toThrow()
    expect(c.held()).toBe(false)
  })

  it('survives a refused request and retries at the next transition', async () => {
    const api = { lock: vi.fn(() => Promise.reject(new Error('not fullscreen'))), unlock: vi.fn() }
    const c = createKeyboardLockController(() => api)
    c.sync({ fullscreen: true, pointerLocked: true })
    await Promise.resolve()
    await Promise.resolve()
    expect(c.held()).toBe(false)
    c.sync({ fullscreen: true, pointerLocked: true })
    expect(api.lock).toHaveBeenCalledTimes(2)
  })

  it('survives a throwing lock and an unlock on a browser that never locked', () => {
    const api = {
      lock: vi.fn(() => {
        throw new Error('refused')
      }),
      unlock: vi.fn(() => {
        throw new Error('never locked')
      }),
    }
    const c = createKeyboardLockController(() => api)
    expect(() => c.sync({ fullscreen: true, pointerLocked: true })).not.toThrow()
    expect(c.held()).toBe(false)
  })
})
