// The contexts, hooks and shared poses every settlement life vignette uses
// (moved out of PlaceLife.tsx by work-order 1245, unchanged). Kept apart from
// the Figure component itself so the component module exports components only.

import { createContext, useContext, useEffect, useMemo } from 'react'
import type * as THREE from 'three/webgpu'
import { REST_POSE, type FigurePose } from '../../render/gesture'
import type { SpeechFloor } from '../../communication/speechFloor'
import type { ColdDress } from './useColdCloaks'
import type { DressDrivers } from '../../systems/dress'
import type { VillagerAsset } from '../../render/villagerAsset'
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
 * What the skinned villagers of this settlement need to dress (work-order
 * "villager dress"): its people, this visit's seasonal drivers and year, the
 * cloth palette that keys rank, and the ring resolution of the body. Null on
 * the LOW preset, and outside a settlement — the primitive figure is drawn then.
 */
export interface FigureLook {
  peopleId: string | null
  drivers: DressDrivers
  year: number
  palette: readonly string[]
  /** Ring resolution of trunk and head (`QUALITY_PRESETS.figureBodySegments`). */
  radial: number
  /** The glTF villager body once loaded, where the level draws it
   *  (`QUALITY_PRESETS.figureGltfBody`); null keeps the code-built body. */
  villager: VillagerAsset | null
}
export const FigureLookContext = createContext<FigureLook | null>(null)

/** What a villager's hands are at, for the glTF body's clips (work-order
 *  "villager glTF body: animation, dress and tool"): digging plays the dig, a
 *  carried shovel the carry. Written by the caller each frame; the primitive
 *  and the code-built bodies pose the same work through `pose`. */
export interface FigureWork {
  dig: boolean
  tool: boolean
}

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
 * The pose of a figure with a load on its head: both arms left free, the trunk
 * upright. The load rests on the figure's crown (`headProp`), and where a hand
 * steadies it the body places that hand on the rim itself (`headSteady`) — the
 * primitive's raised arm pointed into the air beside a load floating over the
 * head (work-order "walking villagers"). A shared, never-written constant.
 */
export const HEAD_CARRY_POSE: { current: FigurePose } = {
  current: { left: { ...REST_POSE.left }, right: { ...REST_POSE.right }, lean: 0.02, turn: 0 },
}

/**
 * Where the crown of the figure under `group` is, in the coordinates of
 * `frame` (a load's parent), with this frame's pose and transform — for a
 * head load that cannot be mounted on the figure itself (the fishers' basket,
 * which moves between people). False when the figure has no crown yet.
 */
export function crownIn(group: THREE.Object3D, frame: THREE.Object3D | null, out: THREE.Vector3): boolean {
  group.updateMatrixWorld(true)
  const crown = group.getObjectByName('figure-crown')
  if (!crown) return false
  crown.getWorldPosition(out)
  if (frame) frame.worldToLocal(out)
  return true
}
