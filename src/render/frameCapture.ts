// One-shot screenshot of the rendered scene for the F6 bug report
// (design.md §21.1).
//
// WHY THIS IS NOT JUST toDataURL(): the renderer is constructed WITHOUT
// `preserveDrawingBuffer` (App.tsx), so at an arbitrary moment the drawing
// buffer is already gone and the readback yields a BLANK image on both
// backends. Switching the flag on would cost frame time for every player
// forever to serve a key pressed once in a while — so the capture happens
// INSIDE a rendered tick instead: `addAfterEffect` fires in the same
// animation frame as the render, right after it, while the buffer still
// holds the picture.
//
// Note that this is the 3-D scene ALONE. Every floating label and the whole
// HUD are DOM and never enter the canvas; the overlay snapshot
// (report/overlaySnapshot.ts) carries those.

import { addAfterEffect } from '@react-three/fiber'
import { getRenderContext } from './renderContext'

export interface CapturedFrame {
  /** `data:image/png;base64,…` of the drawing buffer. */
  dataUrl: string
  width: number
  height: number
}

/** Frames come at ~16 ms; a few hundred ms of grace covers a hitching tab,
 *  and giving up beats hanging the download button forever. */
const CAPTURE_TIMEOUT_MS = 2000

function canvasOf(): HTMLCanvasElement | null {
  const ctx = getRenderContext()
  const fromRenderer = ctx?.gl.domElement as HTMLCanvasElement | undefined
  if (fromRenderer) return fromRenderer
  return typeof document === 'undefined' ? null : document.querySelector('canvas')
}

/**
 * Resolves with the next rendered frame as a PNG data URL, or null when no
 * canvas is present, no frame arrives in time, or the readback is refused.
 * Never rejects — a missing picture must not cost the rest of the report.
 */
export function captureRenderedFrame(timeoutMs: number = CAPTURE_TIMEOUT_MS): Promise<CapturedFrame | null> {
  const canvas = canvasOf()
  if (!canvas || canvas.width === 0 || canvas.height === 0) return Promise.resolve(null)
  return new Promise<CapturedFrame | null>((resolve) => {
    let done = false
    let off: (() => void) | null = null
    const finish = (frame: CapturedFrame | null) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      off?.()
      resolve(frame)
    }
    const timer = window.setTimeout(() => finish(null), timeoutMs)
    // Fires after the frame's render, in the same tick — the one moment the
    // drawing buffer is still readable without preserveDrawingBuffer.
    off = addAfterEffect(() => {
      if (done) return
      try {
        const dataUrl = canvas.toDataURL('image/png')
        // A refused or empty readback yields a stub URL; report nothing rather
        // than a picture that is not one.
        if (!dataUrl.startsWith('data:image/png;base64,') || dataUrl.length < 128) return finish(null)
        finish({ dataUrl, width: canvas.width, height: canvas.height })
      } catch {
        // A tainted canvas or a lost context — the report goes out without it.
        finish(null)
      }
    })
    // Should the timeout have fired before the subscription came back, drop
    // it right here rather than leaving a listener behind.
    if (done) off()
  })
}
