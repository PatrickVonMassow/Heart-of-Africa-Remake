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

/** Own refusal recovery for one mounted place scene; dispose before leaving it. */
export function createPlacePointerLock(el: Element): { request: () => void; dispose: () => void } {
  let disposed = false
  let retry: ReturnType<typeof setTimeout> | undefined
  let pendingRefusal: (() => void) | undefined

  const cancel = () => {
    if (retry !== undefined) clearTimeout(retry)
    retry = undefined
    pendingRefusal = undefined
  }
  const canRetry = () => !disposed && !navigator.webdriver && !document.pointerLockElement
    && !document.querySelector('.overlay') && !useUi.getState().dialog

  // `until` is the timestamp the sequence gives up at; a deliberate request
  // opens a fresh window, so an impatient second click extends the recovery
  // instead of replacing the one attempt that was still to come.
  const attempt = (until: number) => {
    if (disposed) return
    cancel()
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
        if (canRetry() && Date.now() <= until) attempt(until)
        else cancel()
      }, RETRY_STEP_MS)
    }
    // Automation records the decision without a native request or error handler.
    requestPlacePointerLock(el, onRefusal)
  }
  const request = () => attempt(Date.now() + RECOVERY_WINDOW_MS)
  const onError = () => pendingRefusal?.()
  const onChange = () => {
    if (document.pointerLockElement) cancel()
  }
  const offUi = useUi.subscribe((state) => {
    if (state.dialog) cancel()
  })
  document.addEventListener('pointerlockerror', onError)
  document.addEventListener('pointerlockchange', onChange)

  return {
    request,
    dispose: () => {
      disposed = true
      cancel()
      offUi()
      document.removeEventListener('pointerlockerror', onError)
      document.removeEventListener('pointerlockchange', onChange)
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
