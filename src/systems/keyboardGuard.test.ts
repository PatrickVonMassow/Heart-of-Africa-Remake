// The keyboard capture of work-order 601: which chords the game swallows, and
// when it asks for the Keyboard Lock. Everything here is decided without a
// browser — the lock's state machine takes its API as an argument — so the
// Playwright side only has to prove the wiring (scripts/verify/settings.mjs).
import { describe, it, expect, vi } from 'vitest'
import {
  GAME_KEY_CODES,
  KEYBOARD_LOCK_CODES,
  createKeyboardLockController,
  installKeyboardLock,
  isGameKeyCode,
  looksFullscreen,
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

  // The distinction that must not silently regress: prevention is for keys the
  // game binds UNDER a modifier. The calendar row is bound PLAIN, so its chords
  // stay the browser's — Ctrl+1–9 switch tabs, Ctrl +/−/0 zoom, and the game
  // wants none of them.
  it('lets the browser keep the chords on the plain-bound calendar row', () => {
    for (const code of [...MONTH_KEYS, 'BracketRight', 'Slash', 'NumpadAdd', 'NumpadSubtract']) {
      expect(isGameKeyCode(code)).toBe(true) // the game DOES bind it — plain
      expect(preventsBrowserChord(chord(code), { typing: false })).toBe(false)
      expect(preventsBrowserChord(chord(code, { altKey: true }), { typing: false })).toBe(false)
    }
    // Named explicitly, because these are the chords the player would miss.
    for (const code of ['Digit1', 'Digit9', 'Minus', 'Equal', 'Digit0']) {
      expect(preventsBrowserChord(chord(code), { typing: false })).toBe(false)
    }
    // …while the load-bearing ones are untouched by the exception.
    for (const code of ['KeyW', 'KeyU', 'KeyG', 'KeyP', 'ArrowLeft']) {
      expect(preventsBrowserChord(chord(code), { typing: false })).toBe(true)
    }
    // The lock still takes the calendar keys: it captures whole keys, not chords.
    for (const code of MONTH_KEYS) expect(KEYBOARD_LOCK_CODES).toContain(code)
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

describe('looksFullscreen', () => {
  it('takes the page-requested fullscreen', () => {
    expect(looksFullscreen({ fullscreenElement: {}, innerHeight: 400, screenHeight: 1080 })).toBe(true)
  })

  it('takes the F11 fullscreen too, which sets no fullscreenElement', () => {
    // The player who pressed F11 is exactly the one whose Ctrl+W must be caught.
    expect(looksFullscreen({ fullscreenElement: null, innerHeight: 1080, screenHeight: 1080 })).toBe(true)
  })

  it('is false for an ordinary window, however large', () => {
    expect(looksFullscreen({ fullscreenElement: null, innerHeight: 980, screenHeight: 1080 })).toBe(false)
    // A headless page with no screen reading must not count as fullscreen.
    expect(looksFullscreen({ fullscreenElement: null, innerHeight: 0, screenHeight: 0 })).toBe(false)
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

  // THE ORDER THAT ALMOST GOT AWAY: pointer lock FIRST, F11 second. F11 fires
  // neither fullscreenchange nor pointerlockchange and sets no
  // fullscreenElement — the viewport simply grows, which is a `resize`. Without
  // that listener the lock would never engage in the very state the settings
  // call safe.
  it('locks when the viewport fills the screen AFTER the pointer lock (F11 fires only resize)', () => {
    const lock = vi.fn(() => Promise.resolve())
    const unlock = vi.fn()
    const owned: Array<[object, string]> = []
    const fake = (obj: object, name: string, get: () => unknown) => {
      Object.defineProperty(obj, name, { configurable: true, get })
      owned.push([obj, name])
    }
    Object.defineProperty(navigator, 'keyboard', { configurable: true, value: { lock, unlock } })
    owned.push([navigator, 'keyboard'])
    let pointerLocked = false
    let innerHeight = 800
    fake(document, 'pointerLockElement', () => (pointerLocked ? document.body : null))
    fake(document, 'fullscreenElement', () => null) // F11 never sets it
    fake(window, 'innerHeight', () => innerHeight)
    fake(window.screen, 'height', () => 1200)

    const off = installKeyboardLock()
    expect(lock).not.toHaveBeenCalled()

    // The player enters the first-person view: pointer locked, still a window.
    pointerLocked = true
    document.dispatchEvent(new Event('pointerlockchange'))
    expect(lock).not.toHaveBeenCalled()

    // Now F11. The ONLY event is the resize.
    innerHeight = 1200
    window.dispatchEvent(new Event('resize'))
    expect(lock).toHaveBeenCalledTimes(1)

    // Leave it as it was found: release the lock, uninstall, drop the stubs.
    pointerLocked = false
    document.dispatchEvent(new Event('pointerlockchange'))
    expect(unlock).toHaveBeenCalledTimes(1)
    off()
    // And the uninstall really unhooks the resize.
    pointerLocked = true
    innerHeight = 1200
    window.dispatchEvent(new Event('resize'))
    expect(lock).toHaveBeenCalledTimes(1)
    for (const [obj, name] of owned) delete (obj as Record<string, unknown>)[name]
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
