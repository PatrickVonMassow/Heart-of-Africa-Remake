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

/** Dev counters: lock requests, releases, and browser refusals. */
export const pointerLockProbe = { grabs: 0, releases: 0, refusals: 0 }

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
export function requestPlacePointerLock(
  el: Element,
  onRefusal: () => void = () => { pointerLockProbe.refusals++ },
): void {
  if (typeof document === 'undefined') return
  if (document.querySelector('.overlay')) return
  if (useUi.getState().dialog) return
  pointerLockProbe.grabs++
  if (navigator.webdriver) return
  if (document.pointerLockElement === el) return
  try {
    const r = (el as HTMLElement).requestPointerLock() as unknown as Promise<void> | undefined
    if (r && typeof r.catch === 'function') void r.catch(onRefusal)
  } catch {
    onRefusal()
  }
}

// Recover for a bounded period after a deliberate request, even if the browser
// neither grants nor reports a refusal. Only pointerLockElement proves success.
// The earlier timer probe used exitPointerLock(), which does not establish what
// the browser permits after a native Escape (work-order point 1158).
const RETRY_STEP_MS = 250
const RECOVERY_WINDOW_MS = 3000
const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'])

/** Own refusal recovery for one mounted place scene; dispose before leaving it. */
export function createPlacePointerLock(el: Element): { request: () => void; dispose: () => void } {
  let disposed = false
  let retry: ReturnType<typeof setTimeout> | undefined
  let pendingRefusal: (() => void) | undefined
  let wantsLock = false
  // An overlay may come and go after the timer budget expires. Its appearance
  // must still retire the intent before a later gameplay key can use it.
  const overlays = new MutationObserver(() => {
    if (document.querySelector('.overlay')) cancel()
  })

  const clearAttempt = () => {
    if (retry !== undefined) clearTimeout(retry)
    retry = undefined
    pendingRefusal = undefined
  }
  const cancel = () => {
    clearAttempt()
    wantsLock = false
    overlays.disconnect()
  }
  const canRetry = () => !disposed && !navigator.webdriver && !document.pointerLockElement
    && !document.querySelector('.overlay') && !useUi.getState().dialog

  // `until` is the timestamp the sequence gives up at; a deliberate request
  // opens a fresh window, so an impatient second click extends the recovery
  // instead of replacing the one attempt that was still to come.
  const attempt = (until: number) => {
    if (disposed) return
    clearAttempt()
    let refused = false
    const onRefusal = () => {
      // Promise-capable browsers can also fire pointerlockerror for this request.
      if (refused) return
      refused = true
      pointerLockProbe.refusals++
      if (pendingRefusal === onRefusal && !canRetry()) cancel()
    }
    // Arm before the native call: a synchronous grant must cancel this timer.
    // Refusal signals are diagnostic only; a silent request must not strand it.
    if (canRetry()) {
      pendingRefusal = onRefusal
    }
    if (canRetry() && Date.now() + RETRY_STEP_MS <= until) {
      retry = setTimeout(() => {
        retry = undefined
        // The deadline is checked again HERE, not only where the ask was
        // scheduled: a suspended tab or a blocked event loop can deliver this
        // callback long after the window, and an ask that late would take the
        // cursor out of nowhere.
        if (!canRetry()) cancel()
        else if (Date.now() <= until) attempt(until)
        else clearAttempt()
      }, RETRY_STEP_MS)
    }
    // Automation records the decision without a native request or error handler.
    requestPlacePointerLock(el, onRefusal)
  }
  const request = () => {
    wantsLock = canRetry()
    if (wantsLock) overlays.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    else overlays.disconnect()
    attempt(Date.now() + RECOVERY_WINDOW_MS)
  }
  const onError = () => pendingRefusal?.()
  // A grant completes the intent; a subsequent native Escape must not re-arm it.
  const onChange = () => cancel()
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'Escape') { cancel(); return }
    if (!wantsLock) return
    if (!canRetry()) { cancel(); return }
    if (!event.isTrusted || event.repeat || event.defaultPrevented
      || event.ctrlKey || event.altKey || event.metaKey || !MOVEMENT_KEYS.has(event.code)) return
    // Typing or operating a HUD control must never spend this return intent.
    const target = event.target
    if (target && target !== window && target !== document && target !== document.body
      && target !== document.documentElement && target !== el) return
    // Native Escape may require fresh activation even after the cooldown. Keep
    // the intent beyond the timer window, but ask only inside a real gameplay
    // keydown, not mousemove or synthetic gamepad/touch keyboard events.
    request()
  }
  const onPointerDown = (event: PointerEvent) => {
    if (event.target !== el) cancel()
  }
  const onVisibilityChange = () => {
    if (document.hidden) cancel()
  }
  const offUi = useUi.subscribe((state) => {
    if (state.dialog) cancel()
  })
  document.addEventListener('pointerlockerror', onError)
  document.addEventListener('pointerlockchange', onChange)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('blur', cancel)

  return {
    request,
    dispose: () => {
      disposed = true
      cancel()
      offUi()
      document.removeEventListener('pointerlockerror', onError)
      document.removeEventListener('pointerlockchange', onChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('blur', cancel)
    },
  }
}

/** Restore mouse-look on any dialog's closing activation; return scene cleanup. */
export function restorePointerLockAfterDialogs(
  el: Element,
  request: () => void = () => requestPlacePointerLock(el),
): () => void {
  return useUi.subscribe((state, previous) => {
    if (previous.dialog !== null && state.dialog === null) request()
  })
}

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__placeLock = pointerLockProbe
}

/**
 * Whether a mouse movement turns the first-person view. A locked pointer
 * always does; under automation the lock is skipped, and the stand-in turns
 * only while no journal, map or debug menu holds the cursor, as a player's
 * released pointer on those panels turns nothing.
 */
export function mouseLookApplies(locked: boolean, automated: boolean, overlayOpen: boolean): boolean {
  return locked || (automated && !overlayOpen)
}
