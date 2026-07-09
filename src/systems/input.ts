// Global keyboard state: polled by scenes each frame, plus one-shot key events.

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

/** Register a keydown handler for a specific code; returns unsubscribe. */
export function onKeyPress(code: string, cb: () => void): () => void {
  const handler = (e: KeyboardEvent) => {
    if (isTypingTarget(e)) return
    if (e.code === code) cb()
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}

/** WASD/arrow movement axes merged with the gamepad's left stick (§17). */
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
  0: 'KeyE', // A: interact / enter
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
        window.dispatchEvent(new KeyboardEvent('keydown', { code: GAMEPAD_BUTTON_KEYS[i] }))
      }
      gamepadButtonDown[i] = down
    }
  }
  requestAnimationFrame(pollGamepadButtons)
}

if (typeof window !== 'undefined') requestAnimationFrame(pollGamepadButtons)
