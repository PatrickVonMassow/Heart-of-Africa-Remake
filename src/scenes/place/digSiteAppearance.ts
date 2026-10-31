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
  result: 'excavated-pit' | 'set-post' | 'planted-rows' | null
}

/** The same recipe drives the visible props before and after a finished bout. */
export function digSiteFurniture(kind: DigSite['kind'], progress?: DigSiteProgress): DigSiteFurniture {
  switch (kind) {
    case 'pit': return { ground: 'round-mouth', beside: 'grain-baskets-and-cover', result: progress?.completed ? 'excavated-pit' : null }
    case 'postHole': return { ground: 'narrow-mouth', beside: 'stacked-posts', result: progress?.completed ? 'set-post' : null }
    case 'patch': return { ground: 'furrows', beside: 'seedling-tray', result: progress?.completed ? 'planted-rows' : null }
  }
}

/** The grain baskets beside a store pit; `radius` is the drawn outer extent
 *  (the top hoop, 0.338 m). */
export const DIG_BASKETS = [{ x: 0.75, z: -1.65, radius: 0.34 }, { x: 1.4, z: -1.65, radius: 0.34 }] as const
export const DIG_STORE_COVER = { x: 0.95, z: -2.3, radius: 0.65 } as const
/** The seedling tray: `hx`/`hz` are its drawn half extents. */
export const DIG_SEEDLING_TRAY = { x: 0.7, z: -1.55, radius: 0.49, hx: 0.425, hz: 0.225 } as const
/** The three posts laid beside a post hole, along the site's local x. */
export const DIG_POSTS = { x: 0.6, z: -1.6, step: 0.22, count: 3, length: 1.8, radius: 0.1 } as const
const POSTS_X0 = DIG_POSTS.x - DIG_POSTS.length / 2
const POSTS_X1 = DIG_POSTS.x + (DIG_POSTS.count - 1) * DIG_POSTS.step + DIG_POSTS.length / 2
/** The laid posts' drawn extent as one box (site-local centre, half extents). */
export const DIG_POSTS_BOX = { x: (POSTS_X0 + POSTS_X1) / 2, z: DIG_POSTS.z, hx: (POSTS_X1 - POSTS_X0) / 2, hz: DIG_POSTS.radius } as const

/** Full prop extents reserved by placement. The set-down props among them are
 *  also solid (`digFurnitureColliders`); the store cover lies flat and is
 *  walked over. */
export function digFurnitureFootprints(kind: DigSite['kind']): readonly { x: number; z: number; radius: number }[] {
  if (kind === 'pit') return [...DIG_BASKETS, DIG_STORE_COVER]
  if (kind === 'patch') return [DIG_SEEDLING_TRAY]
  return [{ x: DIG_POSTS_BOX.x, z: DIG_POSTS_BOX.z, radius: 1.15 }]
}
