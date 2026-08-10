// Pointer lock in the settlement (design.md §2.3/§17.5, work-order point 588).
//
// The first-person view holds the pointer, so a modal dialog must give it back:
// without that the click never reaches the dialog and no key reaches its field.
// Both directions live here rather than at each call site, so "who owns the
// cursor" is one rule with one set of exceptions.
//
// The PROBE counts the DECISIONS, not the OS lock. Pointer lock is deliberately
// never engaged under browser automation (system-Chrome headless grabs the real
// OS cursor and drags the user's mouse into a corner), so a headless check can
// only observe what the game DECIDED — that it asked for the lock back, and that
// it gave it up. Dev-only, like every other verification hook.

import { useUi } from '../../state/ui'

/** Dev counters: how often the game asked for the lock, and gave it up. */
export const pointerLockProbe = { grabs: 0, releases: 0 }

/** Gives the cursor back — a modal is taking over. */
export function releasePointerLock(): void {
  pointerLockProbe.releases++
  if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock()
}

/**
 * Takes the cursor for mouse-look, unless something on screen needs it: a
 * full-screen overlay (the checkpoint choice, defeat, victory) or an open modal
 * dialog. Under browser automation the decision is recorded and the real lock
 * skipped, for the reason in the file header.
 */
export function requestPlacePointerLock(el: Element): void {
  if (typeof document === 'undefined') return
  if (document.querySelector('.overlay')) return
  if (useUi.getState().dialog) return
  pointerLockProbe.grabs++
  if (navigator.webdriver) return
  if (document.pointerLockElement === el) return
  try {
    const r = (el as HTMLElement).requestPointerLock() as unknown as Promise<void> | undefined
    if (r && typeof r.catch === 'function') r.catch(() => {})
  } catch {
    /* pointer lock unavailable — the game stays playable via keyboard */
  }
}

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__placeLock = pointerLockProbe
}
