import type { DigSite, DigSiteProgress } from './adultWork'

export interface DigSiteAppearance {
  work: number
  wallDepth: number
  bottomRadius: number
}

/**
 * Turns the scheduler's durable work record into restrained scene dimensions.
 * Eighteen worker-seconds is one complete nine-second bout by a pair. Five
 * watched seconds already move it past halfway, without making later rounds
 * grow an implausible crater without limit.
 */
export function digSiteAppearance(progress?: DigSiteProgress): DigSiteAppearance {
  const dug = Number.isFinite(progress?.dug) ? Math.max(0, progress?.dug ?? 0) : 0
  const work = Math.min(1, dug / 18)
  return {
    work,
    wallDepth: 0.1 + work * 0.16,
    bottomRadius: 0.48 - work * 0.1,
  }
}

export interface DigSiteFurniture {
  ground: 'round-mouth' | 'narrow-mouth' | 'furrows'
  beside: 'grain-baskets-and-cover' | 'stacked-posts' | 'seedling-tray'
  result: 'covered-store' | 'set-post' | 'planted-rows' | null
}

/** The same recipe drives the visible props before and after a finished bout. */
export function digSiteFurniture(kind: DigSite['kind'], progress?: DigSiteProgress): DigSiteFurniture {
  switch (kind) {
    case 'pit': return { ground: 'round-mouth', beside: 'grain-baskets-and-cover', result: progress?.completed ? 'covered-store' : null }
    case 'postHole': return { ground: 'narrow-mouth', beside: 'stacked-posts', result: progress?.completed ? 'set-post' : null }
    case 'patch': return { ground: 'furrows', beside: 'seedling-tray', result: progress?.completed ? 'planted-rows' : null }
  }
}

export const DIG_BASKETS = [{ x: 0.75, z: -1.65, radius: 0.32 }, { x: 1.4, z: -1.65, radius: 0.32 }] as const
export const DIG_STORE_COVER = { x: 0.95, z: -2.3, radius: 0.65 } as const
export const DIG_SEEDLING_TRAY = { x: 0.7, z: -1.55, radius: 0.49 } as const

/** Full prop extents reserved by placement, without making them colliders. */
export function digFurnitureFootprints(kind: DigSite['kind']): readonly { x: number; z: number; radius: number }[] {
  if (kind === 'pit') return [...DIG_BASKETS, DIG_STORE_COVER]
  if (kind === 'patch') return [DIG_SEEDLING_TRAY]
  return [{ x: 0.82, z: -1.6, radius: 1.15 }]
}
