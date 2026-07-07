// Global keyboard state: polled by scenes each frame, plus one-shot key events.

const pressed = new Set<string>()

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    // Ignore keys while typing into inputs (debug menu fields).
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return
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
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return
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
  const pad = activePad()
  if (pad) {
    x += deadzoned(pad.axes[0])
    y -= deadzoned(pad.axes[1]) // stick up (negative) = forward
  }
  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }
}

// --- Gamepad (design.md §17: controls suitable for gamepad too) --------------

const GAMEPAD_DEADZONE = 0.18

function activePad(): Gamepad | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null
  for (const pad of navigator.getGamepads()) {
    if (pad) return pad
  }
  return null
}

function deadzoned(v: number | undefined): number {
  const x = v ?? 0
  return Math.abs(x) < GAMEPAD_DEADZONE ? 0 : x
}

/** Right-stick look axes for the first-person view. */
export function gamepadLook(): { x: number; y: number } {
  const pad = activePad()
  if (!pad) return { x: 0, y: 0 }
  return { x: deadzoned(pad.axes[2]), y: deadzoned(pad.axes[3]) }
}

/** Left-stick movement axes: x = strafe right, y = forward. */
export function gamepadMove(): { x: number; y: number } {
  const pad = activePad()
  if (!pad) return { x: 0, y: 0 }
  return { x: deadzoned(pad.axes[0]), y: -deadzoned(pad.axes[1]) }
}

// Buttons re-enter the keyboard pipeline as synthetic keydown events, so
// every existing key handler serves the gamepad unchanged.
const GAMEPAD_BUTTON_KEYS: Record<number, string> = {
  0: 'KeyE', // A: interact / enter
  1: 'Escape', // B: close dialogs/panels
  2: 'KeyG', // X: dig
  3: 'KeyT', // Y: journal
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
        window.dispatchEvent(new KeyboardEvent('keydown', { code: GAMEPAD_BUTTON_KEYS[i] }))
      }
      gamepadButtonDown[i] = down
    }
  }
  requestAnimationFrame(pollGamepadButtons)
}

if (typeof window !== 'undefined') requestAnimationFrame(pollGamepadButtons)
