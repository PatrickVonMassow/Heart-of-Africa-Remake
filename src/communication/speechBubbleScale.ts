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

/** The power-law exponent that carries `nearScale` at `nearDistance` to
 *  `farScale` at `farDistance`: ln(nearScale/farScale) / ln(far/near). */
export function speechBubbleExponent(config: BubbleScale = balance.communication.speechBubble): number {
  const { nearDistance, farDistance, nearScale, farScale } = config
  if (!(farDistance > nearDistance) || !(nearDistance > 0) || !(nearScale > 0) || !(farScale > 0)) return 0
  return Math.log(nearScale / farScale) / Math.log(farDistance / nearDistance)
}

/**
 * The note's CSS scale at `distance` (settlement units) from the camera:
 * `baseScale` · nearScale · (nearDistance / d)^k, k from
 * speechBubbleExponent — `nearScale` at `nearDistance`, `farScale` at
 * `farDistance` and held there beyond it; closer than `nearDistance` it keeps
 * growing up to `maxScale` and holds. Monotonically non-increasing in distance.
 * Given the note's `fit`, never wider or taller on screen than the configured
 * share of the viewport; the cap wins over the readable minimum, since a note
 * that covers the scene is the worse failure.
 */
export function speechBubbleScale(
  distance: number,
  config: BubbleScale = balance.communication.speechBubble,
  fit?: BubbleFit,
): number {
  const { baseScale, nearDistance, farDistance, nearScale, farScale, maxScale } = config
  const k = speechBubbleExponent(config)
  const d = Number.isFinite(distance) ? Math.max(1e-3, distance) : Infinity
  const factor =
    d >= farDistance ? farScale : Math.min(maxScale, Math.max(farScale, nearScale * Math.pow(nearDistance / d, k)))
  let scale = baseScale * factor
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
