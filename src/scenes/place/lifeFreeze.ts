// Dev-only life freeze for the headless proof frames (work-order 1108): while
// set, every inhabitant loop skips its frame, so a line read and the picture
// taken after it show the same instant. Its own module so the place's
// inhabitants outside PlaceLife.tsx (the pounding pair, point 1282) obey it too.

let frozen = false
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__placeFreezeLife = (on: boolean) => {
    frozen = on
  }
}

/** Whether the dev life freeze holds every inhabitant this frame. */
export function isLifeFrozen(): boolean {
  return import.meta.env.DEV && frozen
}
