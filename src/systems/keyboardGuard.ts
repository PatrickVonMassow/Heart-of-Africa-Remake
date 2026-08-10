// Keeping the game's keys out of the browser's chords (work-order 601).
//
// Holding the label modifier names what acts on screen (design.md §17.8) and W
// walks forward, so the feature's ORDINARY use is Ctrl+W — which closes the tab
// without asking. Point 342's rule that "the browser's own Ctrl combinations
// stay the browser's" is superseded by exactly that case.
//
// Two mechanisms, because neither alone is enough:
//   - `preventDefault` takes away every Ctrl (or Alt) chord the platform lets a
//     page take away — Ctrl+S, Ctrl+P, Ctrl+D, Ctrl+A, Ctrl+F … — but only for
//     the codes the game itself binds, and only while the game surface, not a
//     form control, has the keyboard.
//   - Ctrl+W, Ctrl+T and Ctrl+N are RESERVED: no keydown handler reaches them.
//     The one mechanism that does is the Keyboard Lock API
//     (`navigator.keyboard.lock`), which captures them only while the document
//     is FULLSCREEN, and only on Chromium. The game therefore holds the lock
//     exactly while it is fullscreen AND holds the pointer, and its absence is
//     never an error — a browser without it simply does not get this
//     protection, which is why the label modifier is rebindable as well
//     (design.md §17.5/§17.8).

import { MONTH_KEYS } from './season'

/**
 * The calendar keys of §21.1: the month row and the year steps. The game binds
 * them PLAIN — there is no Ctrl+digit anywhere in it — which is why they are
 * named apart from the rest (see PREVENTED_CHORD_CODES).
 */
const CALENDAR_KEY_CODES: readonly string[] = [
  ...MONTH_KEYS,
  'BracketRight', 'Slash', 'NumpadAdd', 'NumpadSubtract',
]

const CALENDAR_KEY_SET = new Set(CALENDAR_KEY_CODES)

/**
 * Every physical code the game's own controls bind (design.md §17.5/§21.1) —
 * the canonical list, and the reason a chord counts as a collision. Ordered by
 * who binds it, so a new binding is added beside its kin.
 */
export const GAME_KEY_CODES: readonly string[] = [
  // Movement (§17.5): WASD and the arrow keys, in both perspectives.
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  // The use key, the journal and the rest of the playing keys.
  'Space', 'Tab',
  'KeyG', // dig
  'KeyM', // map
  'KeyC', // camp
  'KeyP', // position query
  'KeyH', // health query
  'KeyU', // unstuck
  'KeyT', // journal tab switch — Ctrl+T is the browser's new tab
  'Escape',
  // Debug shortcuts (§21.1). F5 is deliberately absent: it stays the browser's
  // reload, which is why the bug report sits on F6.
  'F1', 'F2', 'F3', 'F4', 'F6', 'F8', 'F9',
  // The month row and the year steps (§21.1).
  ...CALENDAR_KEY_CODES,
]

const GAME_KEY_SET = new Set(GAME_KEY_CODES)

/** Is this physical code one the game itself binds? */
export function isGameKeyCode(code: string): boolean {
  return GAME_KEY_SET.has(code)
}

/**
 * The codes whose modifier chord is taken from the browser. Prevention is for
 * keys the game binds UNDER a modifier; a plain binding does not earn it — the
 * calendar row is bound plain, so swallowing Ctrl+1–9 and the keyboard zoom
 * (Ctrl +/−/0) would protect nothing and cost the player two of the browser's
 * most-used chords. They stay in the LOCK set, which takes whole keys.
 */
export const PREVENTED_CHORD_CODES: readonly string[] = GAME_KEY_CODES.filter(
  (c) => !CALENDAR_KEY_SET.has(c),
)

const PREVENTED_CHORD_SET = new Set(PREVENTED_CHORD_CODES)

/**
 * The codes handed to the keyboard lock: the game's keys WITHOUT Escape.
 * Escape stays the browser's, because a locked Escape turns leaving fullscreen
 * and pointer lock into a hold gesture the player never asked for — and the
 * chords that need capturing are the letter ones (Ctrl+W/T/N), not Escape.
 */
export const KEYBOARD_LOCK_CODES: readonly string[] = GAME_KEY_CODES.filter((c) => c !== 'Escape')

/**
 * Should the keyboard be locked right now? Only with BOTH: the Keyboard Lock
 * API captures nothing outside fullscreen, and outside the first-person view
 * the player is not steering with WASD in a way that could fire a chord by
 * accident — while holding the keys of a player who is not playing would be
 * taking his browser away.
 */
export function shouldLockKeyboard(state: { fullscreen: boolean; pointerLocked: boolean }): boolean {
  return state.fullscreen && state.pointerLocked
}

/**
 * Is this keydown a browser chord the game must swallow? True for a modifier
 * chord on a key of PREVENTED_CHORD_CODES, so an unbound key (Ctrl+R,
 * Ctrl+Shift+I) and the plain-bound calendar row keep their browser meaning.
 * Never inside a form control: the debug fields and the bug-report description
 * keep Ctrl+A/C/V.
 *
 * Meta is left alone — Cmd+W is as reserved as Ctrl+W and the key belongs to
 * the operating system, so nothing a page does reaches it.
 */
export function preventsBrowserChord(
  e: { code: string; ctrlKey: boolean; altKey: boolean },
  ctx: { typing: boolean },
): boolean {
  if (ctx.typing) return false
  if (!e.ctrlKey && !e.altKey) return false
  return PREVENTED_CHORD_SET.has(e.code)
}

/** The slice of the Keyboard Lock API this module uses (not in lib.dom). */
export interface KeyboardLockApi {
  lock(codes?: readonly string[]): Promise<void> | undefined
  unlock(): void
}

/**
 * The lock's state machine, kept in a factory so the tests can drive it with a
 * recording stub. It requests and releases at most once per transition, and it
 * swallows every failure: a browser without the API, or one that refuses the
 * request because fullscreen ended in the same tick, must not raise an error.
 */
export function createKeyboardLockController(getApi: () => KeyboardLockApi | undefined) {
  let held = false
  return {
    held: () => held,
    /** Bring the lock in line with the document's state; returns whether it is held. */
    sync(state: { fullscreen: boolean; pointerLocked: boolean }): boolean {
      const want = shouldLockKeyboard(state)
      if (want === held) return held
      const api = getApi()
      if (!api) return held
      if (want) {
        try {
          const p = api.lock(KEYBOARD_LOCK_CODES)
          held = true
          // A rejected request leaves nothing held, so the next transition retries.
          if (p) void p.catch(() => { held = false })
        } catch {
          held = false
        }
      } else {
        try {
          api.unlock()
        } catch {
          // Releasing can only fail on a browser that never locked.
        }
        held = false
      }
      return held
    },
  }
}

function browserKeyboard(): KeyboardLockApi | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as Navigator & { keyboard?: KeyboardLockApi }).keyboard
}

const controller = createKeyboardLockController(browserKeyboard)

/**
 * Is the document fullscreen? `fullscreenElement` answers only for the
 * fullscreen a PAGE asked for — the player who pressed F11 leaves it null while
 * his window fills the screen, and he is exactly the player whose Ctrl+W the
 * lock has to catch. So a filled viewport counts too. A false positive costs
 * nothing: the request is refused outside fullscreen, which this module treats
 * as "not held" and retries at the next transition.
 */
export function looksFullscreen(v: {
  fullscreenElement: unknown
  innerHeight: number
  screenHeight: number
}): boolean {
  if (v.fullscreenElement != null) return true
  if (!v.innerHeight || !v.screenHeight) return false
  return v.screenHeight - v.innerHeight <= 2
}

function documentLockState(): { fullscreen: boolean; pointerLocked: boolean } {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { fullscreen: false, pointerLocked: false }
  }
  return {
    fullscreen: looksFullscreen({
      fullscreenElement: document.fullscreenElement,
      innerHeight: window.innerHeight,
      screenHeight: window.screen?.height ?? 0,
    }),
    // A hidden tab holds nothing: the release the player never made must not
    // leave his browser captured behind another window.
    pointerLocked: document.pointerLockElement != null && !document.hidden,
  }
}

/**
 * Wire the lock to the document: it follows the pointer lock and fullscreen,
 * and it lets go the moment the tab goes away. Idempotent; returns the
 * uninstall for symmetry with the other input installers.
 *
 * RESIZE is one of the four, and it is the one that carries F11: that
 * fullscreen fires no `fullscreenchange` (it sets no `fullscreenElement`
 * either), so a player who is ALREADY pointer-locked and only then presses F11
 * would never be sampled — in exactly the state the settings call safe.
 */
export function installKeyboardLock(): () => void {
  if (typeof document === 'undefined') return () => {}
  const sync = () => {
    controller.sync(documentLockState())
  }
  document.addEventListener('pointerlockchange', sync)
  document.addEventListener('fullscreenchange', sync)
  document.addEventListener('visibilitychange', sync)
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', sync)
    window.addEventListener('blur', sync)
  }
  sync()
  return () => {
    document.removeEventListener('pointerlockchange', sync)
    document.removeEventListener('fullscreenchange', sync)
    document.removeEventListener('visibilitychange', sync)
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', sync)
      window.removeEventListener('blur', sync)
    }
  }
}
