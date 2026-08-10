// The label modifier, held (design.md §17.8/§17.5): while it is down, the scene
// names what acts on it. Nothing else about the key changes — the world runs on
// and the character neither stops nor steers — but the chords it forms are no
// longer the browser's: src/systems/keyboardGuard.ts takes away what a page may
// take and locks the reserved three in fullscreen (work-order 601). WHICH key
// it is, the player decides (Ctrl by default, `useUi.labelModifier`), because
// outside fullscreen nothing can stop Ctrl+W from closing the tab.
//
// The state is a module singleton with its own listeners rather than game state:
// it changes at key speed, it is never saved, and a store write would re-render
// the whole HUD for a key that only the label layer cares about.

import { useSyncExternalStore } from 'react'
import { useUi, type LabelModifier } from '../state/ui'

let held = false
const listeners = new Set<() => void>()

/** Is the chosen modifier down in this event? Read off the event's OWN flags. */
export function modifierHeld(
  e: { ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  modifier: LabelModifier,
): boolean {
  if (modifier === 'shift') return e.shiftKey
  if (modifier === 'alt') return e.altKey
  return e.ctrlKey
}

function publish(next: boolean): void {
  if (next === held) return
  held = next
  for (const listener of listeners) listener()
}

/**
 * Re-sync from an input event's OWN modifier flag instead of counting downs and
 * ups. A release missed while the player alt-tabbed would otherwise leave the
 * labels standing for ever — this way the very next key press, click or pointer
 * event tells the truth again, and the release that DID arrive is just as much
 * an input event (`ctrlKey` is already false in a Control keyup).
 */
function syncFromEvent(e: KeyboardEvent | MouseEvent | PointerEvent): void {
  publish(modifierHeld(e, useUi.getState().labelModifier))
}

/** Losing the window (or the tab) clears it: no label may be left standing. */
function clear(): void {
  publish(false)
}

// Rebinding while the old key is down would strand the labels on a key nobody
// is holding any more, so the change itself clears them.
let lastModifier: LabelModifier = useUi.getState().labelModifier
function onStoreChange(state: { labelModifier: LabelModifier }): void {
  if (state.labelModifier === lastModifier) return
  lastModifier = state.labelModifier
  clear()
}

let unsubscribeStore: (() => void) | null = null

function install(): void {
  lastModifier = useUi.getState().labelModifier
  unsubscribeStore = useUi.subscribe(onStoreChange)
  window.addEventListener('keydown', syncFromEvent)
  window.addEventListener('keyup', syncFromEvent)
  window.addEventListener('mousedown', syncFromEvent)
  window.addEventListener('pointerdown', syncFromEvent)
  window.addEventListener('blur', clear)
  document.addEventListener('visibilitychange', clear)
}

function uninstall(): void {
  unsubscribeStore?.()
  unsubscribeStore = null
  window.removeEventListener('keydown', syncFromEvent)
  window.removeEventListener('keyup', syncFromEvent)
  window.removeEventListener('mousedown', syncFromEvent)
  window.removeEventListener('pointerdown', syncFromEvent)
  window.removeEventListener('blur', clear)
  document.removeEventListener('visibilitychange', clear)
  clear()
}

/** Subscribe to hold changes (useSyncExternalStore); returns the unsubscribe.
 *  The window listeners live exactly as long as somebody is watching. */
export function subscribeCtrlHold(listener: () => void): () => void {
  if (listeners.size === 0) install()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) uninstall()
  }
}

/** Is the label modifier (Ctrl by default) down right now? */
export function ctrlHeld(): boolean {
  return held
}

/** Reactive form for components — the label layer mounts on its `true`. */
export function useCtrlHeld(): boolean {
  return useSyncExternalStore(subscribeCtrlHold, ctrlHeld, () => false)
}
