// How large a speech note is drawn on screen: larger for a near speaker,
// smaller for a far one, following the speaker's own projected size part-way
// (point 1278), between a readable minimum and caps that keep a close-up note
// from covering the scene. Pure, so the size can be judged without a browser;
// the scene layer feeds it the camera-to-note distance and the note's size.
import { balance } from '../config/balance'

type BubbleScale = typeof balance.communication.speechBubble

/** The note's unscaled layout size and the viewport, both in CSS pixels. */
export interface BubbleFit {
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
}

/**
 * The note's CSS scale at `distance` (settlement units) from the camera:
 * `baseScale` · (refDistance / d)^exponent with d held to
 * [nearDistance, farDistance] — monotonically non-increasing in distance and
 * flat beyond both ends. Given the note's `fit`, never wider or taller on
 * screen than the configured share of the viewport; the cap wins over the
 * readable minimum, since a note that covers the scene is the worse failure.
 */
export function speechBubbleScale(
  distance: number,
  config: BubbleScale = balance.communication.speechBubble,
  fit?: BubbleFit,
): number {
  const { baseScale, refDistance, exponent, nearDistance, farDistance } = config
  const near = Math.max(1e-3, nearDistance)
  const far = Math.max(near, farDistance)
  const d = Number.isFinite(distance) ? Math.min(far, Math.max(near, distance)) : far
  let scale = baseScale * Math.pow(refDistance / d, exponent)
  if (fit) {
    if (fit.width > 0 && fit.viewportWidth > 0) {
      scale = Math.min(scale, (config.maxViewportWidth * fit.viewportWidth) / fit.width)
    }
    if (fit.height > 0 && fit.viewportHeight > 0) {
      scale = Math.min(scale, (config.maxViewportHeight * fit.viewportHeight) / fit.height)
    }
  }
  return scale
}
