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

/** WASD/arrow movement axes: x = right, y = forward (screen up). */
export function moveAxes(): { x: number; y: number } {
  let x = 0
  let y = 0
  if (isKeyDown('KeyW') || isKeyDown('ArrowUp')) y += 1
  if (isKeyDown('KeyS') || isKeyDown('ArrowDown')) y -= 1
  if (isKeyDown('KeyA') || isKeyDown('ArrowLeft')) x -= 1
  if (isKeyDown('KeyD') || isKeyDown('ArrowRight')) x += 1
  return { x, y }
}
