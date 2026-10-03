// How large a speech note is drawn on screen: larger for a near speaker,
// smaller for a far one, between a readable minimum and a maximum that keeps a
// close-up note from covering the scene. Pure, so the size can be judged
// without a browser; the scene layer feeds it the camera-to-note distance.
import { balance } from '../config/balance'

type BubbleScale = typeof balance.communication.speechBubble

/** The note's CSS scale at `distance` (settlement units) from the camera:
 *  monotonically non-increasing in distance and clamped at both ends. */
export function speechBubbleScale(
  distance: number,
  config: BubbleScale = balance.communication.speechBubble,
): number {
  const { baseScale, nearDistance, farDistance, nearScale, farScale } = config
  const d = Number.isFinite(distance) ? distance : farDistance
  const span = farDistance - nearDistance
  const t = span > 0 ? Math.min(1, Math.max(0, (d - nearDistance) / span)) : d <= nearDistance ? 0 : 1
  return baseScale * (nearScale + (farScale - nearScale) * t)
}
