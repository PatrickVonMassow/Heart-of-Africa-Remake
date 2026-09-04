import type { DigSiteProgress } from './adultWork'

export interface DigSiteAppearance {
  work: number
  wallDepth: number
  bottomRadius: number
  spoilScale: number
  spoilHeight: number
}

/**
 * Turns the scheduler's durable work record into restrained scene dimensions.
 * Eighteen worker-seconds is roughly five watched seconds with a pair plus the
 * opening strokes: enough movement to notice, without making later rounds grow
 * an implausible crater without limit.
 */
export function digSiteAppearance(progress?: DigSiteProgress): DigSiteAppearance {
  const dug = Number.isFinite(progress?.dug) ? Math.max(0, progress?.dug ?? 0) : 0
  const work = Math.min(1, dug / 18)
  return {
    work,
    wallDepth: 0.1 + work * 0.16,
    bottomRadius: 0.48 - work * 0.1,
    spoilScale: 0.62 + work * 0.68,
    spoilHeight: 0.09 + work * 0.12,
  }
}
