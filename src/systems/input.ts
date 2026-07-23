// Global keyboard state: polled by scenes each frame, plus one-shot key events.

import { createEngageLatch } from './touchInput'

const pressed = new Set<string>()

/**
 * True while the event targets a form control (debug menu fields), so game keys
 * don't fire and Tab still navigates between fields — matching the journal
 * toggle guard in the HUD (design.md §17/§21).
 */
function isTypingTarget(e: Event): boolean {
  const tag = (e.target as HTMLElement | null)?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e)) return
    pressed.add(e.code)
  })
  window.addEventListener('keyup', (e) => pressed.delete(e.code))
  window.addEventListener('blur', () => pressed.clear())
}

export function isKeyDown(code: string): boolean {
  return pressed.has(code)
}

/**
 * Re-enter the keyboard pipeline with a synthetic keydown, so every existing
 * key handler serves alternative inputs (gamepad buttons, a tapped touch
 * prompt) unchanged — one input path, not two (design.md §17.5).
 */
export function dispatchSyntheticKey(code: string): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new KeyboardEvent('keydown', { code }))
}

/** Register a keydown handler for a specific code; returns unsubscribe. */
export function onKeyPress(code: string, cb: () => void): () => void {
  const handler = (e: KeyboardEvent) => {
    if (isTypingTarget(e)) return
    if (e.code === code) cb()
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}

/** WASD/arrow movement axes merged with the gamepad's left stick (§17) and,
 *  on touch devices, the virtual stick (design.md §17.5, point 84). */
export function moveAxes(): { x: number; y: number } {
  let x = 0
  let y = 0
  if (isKeyDown('KeyW') || isKeyDown('ArrowUp')) y += 1
  if (isKeyDown('KeyS') || isKeyDown('ArrowDown')) y -= 1
  if (isKeyDown('KeyA') || isKeyDown('ArrowLeft')) x -= 1
  if (isKeyDown('KeyD') || isKeyDown('ArrowRight')) x += 1
  const pad = engagedPad()
  if (pad) {
    x += deadzoned(pad.axes[0])
    y -= deadzoned(pad.axes[1]) // stick up (negative) = forward
  }
  x += touchState.stickX
  y += touchState.stickY
  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }
}

// --- Gamepad (design.md §17: controls suitable for gamepad too) --------------

const GAMEPAD_DEADZONE = 0.22
/** Deliberate input threshold that arms the gamepad for steering. */
const GAMEPAD_ENGAGE = 0.6

// A connected pad steers only after a deliberate input (button press or a
// full stick push). Idle axis drift of wheels, flight sticks or worn pads
// must never move the game on its own.
let gamepadEngaged = false

function activePad(): Gamepad | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null
  for (const pad of navigator.getGamepads()) {
    // Only standard-mapped pads: other HID devices report arbitrary axes.
    if (pad && pad.mapping === 'standard') return pad
  }
  return null
}

function engagedPad(): Gamepad | null {
  const pad = activePad()
  if (!pad) return null
  if (!gamepadEngaged) {
    const pressed = pad.buttons.some((b) => b.pressed)
    const pushed = pad.axes.some((a) => Math.abs(a) > GAMEPAD_ENGAGE)
    if (!pressed && !pushed) return null
    gamepadEngaged = true
  }
  return pad
}

function deadzoned(v: number | undefined): number {
  const x = v ?? 0
  return Math.abs(x) < GAMEPAD_DEADZONE ? 0 : x
}

/** Right-stick look axes for the first-person view. */
export function gamepadLook(): { x: number; y: number } {
  const pad = engagedPad()
  if (!pad) return { x: 0, y: 0 }
  return { x: deadzoned(pad.axes[2]), y: deadzoned(pad.axes[3]) }
}

/** Left-stick movement axes: x = strafe right, y = forward. */
export function gamepadMove(): { x: number; y: number } {
  const pad = engagedPad()
  if (!pad) return { x: 0, y: 0 }
  return { x: deadzoned(pad.axes[0]), y: -deadzoned(pad.axes[1]) }
}

// Buttons re-enter the keyboard pipeline as synthetic keydown events, so
// every existing key handler serves the gamepad unchanged.
const GAMEPAD_BUTTON_KEYS: Record<number, string> = {
  0: 'Space', // A: interact / enter (the use key, design.md §17.5)
  1: 'Escape', // B: close dialogs/panels
  2: 'KeyG', // X: dig
  3: 'Tab', // Y: journal
  4: 'KeyM', // LB: map
  5: 'KeyC', // RB: camp
  8: 'KeyP', // Select: position query
  9: 'F1', // Start: debug menu
}
const gamepadButtonDown: Record<number, boolean> = {}

function pollGamepadButtons(): void {
  const pad = activePad()
  if (pad) {
    for (const key of Object.keys(GAMEPAD_BUTTON_KEYS)) {
      const i = Number(key)
      const down = pad.buttons[i]?.pressed ?? false
      if (down && !gamepadButtonDown[i]) {
        gamepadEngaged = true // a button press is always deliberate
        dispatchSyntheticKey(GAMEPAD_BUTTON_KEYS[i])
      }
      gamepadButtonDown[i] = down
    }
  }
  requestAnimationFrame(pollGamepadButtons)
}

if (typeof window !== 'undefined') requestAnimationFrame(pollGamepadButtons)

// --- Touch (design.md §17.5, point 84): a third input source ------------------

// Written only by the TouchControls overlay, consumed at the same merge points
// as the gamepad: stick axes in moveAxes(), look-drag in the first-person yaw,
// pinch in the bird's-eye zoom. Values are in the overlay's already-normalised
// units (axes [-1..1], look px, accumulated pinch ratio).
const touchState = { stickX: 0, stickY: 0, lookDX: 0, lookDY: 0, pinch: 1 }

// Deliberate-input guard: the layer arms only on the first real touchstart —
// desktops (even touch-screen laptops that are never touched) stay identical.
const touchLatch = createEngageLatch()
const touchEngageCbs = new Set<() => void>()

/** Register a callback fired once the touch layer arms (immediately if already
 *  armed). Returns an unsubscribe. Used by the HUD to set ui.touchActive. */
export function onTouchEngage(cb: () => void): () => void {
  if (touchLatch.engaged()) {
    cb()
    return () => {}
  }
  touchEngageCbs.add(cb)
  return () => touchEngageCbs.delete(cb)
}

export function isTouchEngaged(): boolean {
  return touchLatch.engaged()
}

/** Overlay writes the normalised virtual-stick axes (x = strafe, y = forward). */
export function setTouchStick(x: number, y: number): void {
  touchState.stickX = x
  touchState.stickY = y
}

/** Virtual-stick axes (x = strafe right, y = forward) for the first-person
 *  scene, which merges them like the gamepad's left stick. */
export function touchMove(): { x: number; y: number } {
  return { x: touchState.stickX, y: touchState.stickY }
}

/** Overlay accumulates raw look-drag deltas (px); the scene consumes them. */
export function addTouchLook(dx: number, dy: number): void {
  touchState.lookDX += dx
  touchState.lookDY += dy
}

/** Consume the accumulated look-drag deltas (px), zeroing them. */
export function consumeTouchLook(): { dx: number; dy: number } {
  const r = { dx: touchState.lookDX, dy: touchState.lookDY }
  touchState.lookDX = 0
  touchState.lookDY = 0
  return r
}

/** Overlay folds a pinch step into the pending zoom ratio (multiplicative). */
export function addTouchPinch(ratio: number): void {
  touchState.pinch *= ratio
}

/** Consume the pending pinch ratio, resetting it to the identity (1). */
export function consumeTouchPinch(): number {
  const r = touchState.pinch
  touchState.pinch = 1
  return r
}

if (typeof window !== 'undefined') {
  window.addEventListener(
    'touchstart',
    () => {
      if (touchLatch.engage()) {
        touchEngageCbs.forEach((cb) => cb())
        touchEngageCbs.clear()
      }
    },
    { passive: true },
  )
}
