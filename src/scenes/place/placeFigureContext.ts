// The contexts, hooks and shared poses every settlement life vignette uses
// (moved out of PlaceLife.tsx by work-order 1245, unchanged). Kept apart from
// the Figure component itself so the component module exports components only.

import { createContext, useContext, useEffect, useMemo } from 'react'
import { armAim, REST_POSE, type FigurePose } from '../../render/gesture'
import type { SpeechFloor } from '../../communication/speechFloor'
import type { ColdDress } from './useColdCloaks'
import {
  addBodies,
  createBodies,
  createInhabitantSet,
  releaseBodies,
  type InhabitantBody,
  type InhabitantSet,
} from './inhabitantBodies'

/** The settlement's speech floor (who may speak next), shared by every vignette. */
export const SpeechFloorContext = createContext<SpeechFloor | null>(null)

/**
 * The cold-weather cloaks this settlement's people wear today (design.md
 * §19.13), or null for the everyday dress. A context rather than a prop: every
 * life vignette builds its own Figures, and only the Figure itself cares.
 */
export const ColdCloaksContext = createContext<ColdDress | null>(null)

/**
 * Radial segments of the limb primitives at the current graphics level (point
 * 479, `QUALITY_PRESETS.figureLimbSegments`). A context rather than a per-figure
 * store subscription: a settlement mounts a couple of dozen Figures and they all
 * read the same number, so PlaceLife subscribes once and hands it down.
 */
export const LimbDetailContext = createContext<number>(8)

/**
 * The settlement's inhabitant bodies (work-order point 578). A context for the
 * reason the contexts above are: the life vignettes are a dozen separate components,
 * and every one of them has to see EVERY other one's figures — the defect was
 * exactly that none of them did. PlaceLife owns one set per settlement; each
 * component claims its slots, writes them where it moved its figures, and
 * separates them there.
 */
export const InhabitantBodiesContext = createContext<InhabitantSet>(createInhabitantSet())

/** Claims `count` bodies from the settlement's set for the lifetime of the
 *  component. The owner writes each body's position and radius per frame.
 *  The bodies are BUILT while rendering but JOINED to the set in an effect:
 *  React StrictMode mounts an effect, tears it down and mounts it again, and a
 *  set joined during render would have kept only the teardown. */
export function useInhabitantBodies(
  count: number,
  options: { fixed?: boolean; x?: number; z?: number; scale?: number } = {},
): InhabitantBody[] {
  const set = useContext(InhabitantBodiesContext)
  const { fixed, x, z, scale } = options
  const bodies = useMemo(
    () => createBodies(count, { fixed, x, z, scale }),
    [count, fixed, x, z, scale],
  )
  useEffect(() => {
    addBodies(set, bodies)
    return () => releaseBodies(set, bodies)
  }, [set, bodies])
  return bodies
}

/** One body for a vignette figure standing at its station: it pushes the
 *  passers-by aside and never gives way itself. */
export function useStandingBody(x: number, z: number, scale = 1): void {
  useInhabitantBodies(1, { fixed: true, x, z, scale })
}

/** The same for a vignette of SEVERAL standing figures (a conversing pair, the
 *  traders on the plaza). */
export function useStandingBodies(spots: ReadonlyArray<{ x: number; z: number }>, scale = 1): void {
  const bodies = useInhabitantBodies(spots.length, { fixed: true, scale })
  useEffect(() => {
    spots.forEach((s, i) => {
      const b = bodies[i]
      if (!b) return
      b.x = s.x
      b.z = s.z
    })
  }, [bodies, spots])
}

/** The two shoulder pivots in render order: index 0 is the figure's LEFT arm
 *  (local +x), index 1 its RIGHT (local −x, because forward is +z and up is +y). */
export const REST_POSE_ARMS = [REST_POSE.left, REST_POSE.right] as const

/**
 * One hand up steadying a load carried on the head, the other hanging — the
 * period-true carrying posture, and the pose the figures with a basket or a
 * bundle on their heads take now that they have arms (point 479). A shared,
 * never-written constant: every head-carrier holds it identically, so one
 * object serves them all.
 */
export const HEAD_CARRY_POSE: { current: FigurePose } = {
  current: { left: armAim(0.16, 1.3), right: { ...REST_POSE.right }, lean: 0.02, turn: 0 },
}
