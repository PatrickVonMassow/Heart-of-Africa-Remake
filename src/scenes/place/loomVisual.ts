import { Color } from 'three/webgpu'
import { balance } from '../../config/balance'
import type { LoomPicture } from './loomWork'

export const LOOM_BUILD = {
  /** Height of the stretched threads. LOW, because it is a ground loom and a
   *  SEATED weaver works it: her shoulder is at 0.256 and her arm is 0.242, so
   *  this is where her hands actually land (`loomWork`'s WARP_REACH). */
  warpY: 0.22,
  stakeHeight: 0.34,
  /** Woven width — "seldom wider than four inches" (docs/peoples-1890.md §8.1). */
  stripWidth: 0.12,
  clothThickness: 0.022,
  threadThickness: 0.01,
  /** The small frame of heddles she sits under, which the long warp keeps. */
  heddleX: 0.2,
  heddleY: 0.46,
  heddleRadius: 0.03,
  shuttle: [0.22, 0.065, 0.09] as [number, number, number],
}

// A folded strip stays narrow, beside (not on) the stretched warp.
export const FOLDED_STRIP = { length: 0.65, thickness: 0.055, across: 0.14, along: -0.85 }

/** Deepen the village band dye, retaining the hue of its inhabitants' cloth. */
export function loomWeaveColor(weave: string): Color {
  return new Color(weave).offsetHSL(0, balance.villageLife.loom.weaveSaturation, 0)
}

export function loomStackPosition(index: number, waterSide: number): [number, number, number] {
  return [-waterSide * FOLDED_STRIP.across, (index + 0.5) * FOLDED_STRIP.thickness, FOLDED_STRIP.along]
}

/** First gather the strip, then lay it onto the pile. No one-frame disappearance. */
export function loomClothTransform(picture: LoomPicture, stack: number, waterSide: number) {
  const length = Math.min(picture.cloth, balance.villageLife.loom.warpHalf)
  const folding = picture.fold ?? 0
  const gather = Math.min(1, folding / 0.6)
  const lay = Math.max(0, (folding - 0.6) / 0.4)
  const shownLength = length + (FOLDED_STRIP.length - length) * gather
  const target = loomStackPosition(stack, waterSide)
  const fromY = LOOM_BUILD.warpY + 0.006
  return {
    position: [target[0] * lay, fromY + (target[1] - fromY) * lay, shownLength / 2 * (1 - lay) + target[2] * lay] as [number, number, number],
    scale: [1, 1 + (FOLDED_STRIP.thickness / LOOM_BUILD.clothThickness - 1) * gather, Math.max(1e-3, shownLength)] as [number, number, number],
    visible: picture.cloth > 0.02,
  }
}
