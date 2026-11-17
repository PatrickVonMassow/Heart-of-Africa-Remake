// The bird's-eye herds' walk (work-order 414, design.md §19.5): the settlement
// gait carried onto the travel herds. The maths is NOT restated here — every
// pose comes from the shared derivation in `src/render/fauna.ts` (point 300) —
// and the rigged bodies come from the SAME part builders the settlement and
// panorama animals use, so the two views cannot drift apart. This module owns
// only what is specific to the herds: the per-animal distance accumulator fed
// by the animal's own drawn ground track, and the distance bands that price the
// articulation at herd scale.
import * as THREE from 'three/webgpu'
import { HERD_GAIT } from '../../config/balance'
import { buildElephantParts, buildGiraffeParts, gaitBodyLift, gaitPhase, gaitRig, legSwingAngle, restingPhase } from '../../render/fauna'
import { buildAntelopeParts, buildZebraParts, DEFAULT_FAUNA_BODY_SEGMENTS } from '../../render/faunaUngulates'
import type { GoatLeg } from '../../render/faunaGeometry'

/** The herd species that have a body-and-pivoted-legs description. The others
 *  (wildebeest, warthog, the predators, the birds, the crocodile) have none in
 *  the codebase and stay drawn as one merged body. */
export const RIGGED_HERD_SPECIES = ['elephant', 'giraffe', 'zebra', 'antelope'] as const
export type RiggedHerdSpecies = (typeof RIGGED_HERD_SPECIES)[number]

export function isRiggedHerdSpecies(sp: string): sp is RiggedHerdSpecies {
  return (RIGGED_HERD_SPECIES as readonly string[]).includes(sp)
}

/** The split body of a rigged herd species — the settlement/panorama builder
 *  itself, never a copy. `segments` follows the detail level for the swept
 *  ungulates (`faunaBodySegments`). */
export function buildHerdParts(
  sp: RiggedHerdSpecies,
  segments = DEFAULT_FAUNA_BODY_SEGMENTS,
): { body: THREE.BufferGeometry; legs: GoatLeg[] } {
  switch (sp) {
    case 'elephant':
      return buildElephantParts()
    case 'giraffe':
      return buildGiraffeParts()
    case 'zebra':
      return buildZebraParts(segments)
    case 'antelope':
      return buildAntelopeParts(segments)
  }
}

/** The gait constants of a rigged species, read off its own legs. */
export function herdRig(sp: RiggedHerdSpecies) {
  return gaitRig(buildHerdParts(sp).legs)
}

/** The per-animal gait state the herd loop carries on each animal. */
export interface HerdGaitCarrier {
  /** Distance walked in the body's own rig frame (world ÷ scale). */
  gaitDist?: number
  /** The drawn ground spot of the previous frame. */
  gaitX?: number
  gaitZ?: number
}

type GaitTuning = Pick<typeof HERD_GAIT, 'standSpeed' | 'maxStep'>

/**
 * Advance one animal's stride by the ground it actually covered this frame and
 * return the phase to draw. A pure function of DISTANCE: the phase moves with
 * the drawn ground track (÷ scale, the rig frame — the panorama rule of point
 * 286), never with the clock, so a faster animal steps faster and a standing
 * one stands. Below `standSpeed`, or while `canStep` is false (a thrash, a
 * dying stagger, water), the legs settle to the nearest neutral phase
 * (`restingPhase`, work-order 1065) instead of freezing mid-stride. A step
 * longer than `maxStep` is a teleport and moves no leg.
 */
export function advanceHerdGait(
  c: HerdGaitCarrier,
  x: number,
  z: number,
  scale: number,
  cadence: number,
  dt: number,
  canStep: boolean,
  tune: GaitTuning = HERD_GAIT,
): number {
  const s = scale > 0 ? scale : 1
  const prevX = c.gaitX
  const prevZ = c.gaitZ
  c.gaitX = x
  c.gaitZ = z
  let dist = c.gaitDist ?? 0
  const step = prevX === undefined || prevZ === undefined ? 0 : Math.hypot(x - prevX, z - prevZ)
  const walking = canStep && step <= tune.maxStep && dt > 0 && step / dt >= tune.standSpeed
  if (walking) {
    dist += step / s
  } else if (cadence > 0) {
    dist = restingPhase(gaitPhase(dist, cadence), Math.max(0, dt)) / cadence
  }
  c.gaitDist = dist
  return gaitPhase(dist, cadence)
}

export type HerdGaitBand = 'articulated' | 'lift' | 'none'

/** Which walk cue an animal at `distance` from the traveller gets: the level
 *  decides first (`herdGait` off → none), the distance band refines inside it. */
export function herdGaitBand(
  distance: number,
  on: boolean,
  tune: Pick<typeof HERD_GAIT, 'articulatedRadius' | 'liftRadius'> = HERD_GAIT,
): HerdGaitBand {
  if (!on) return 'none'
  if (distance <= tune.articulatedRadius) return 'articulated'
  if (distance <= tune.liftRadius) return 'lift'
  return 'none'
}

/** The body's vertical dip onto its planted leg (rig units × scale). */
export function herdBodyLift(phase: number, legLength: number, scale: number): number {
  return gaitBodyLift(phase, legLength) * scale
}

const legLocal = new THREE.Matrix4()
const legRot = new THREE.Matrix4()

/** One leg's instance matrix: the body's matrix, then the hip pivot, then the
 *  swing about the body's local x (`legSwingAngle`). */
export function composeLegMatrix(out: THREE.Matrix4, body: THREE.Matrix4, leg: GoatLeg, phase: number): THREE.Matrix4 {
  legLocal.makeTranslation(leg.hip[0], leg.hip[1], leg.hip[2])
  legRot.makeRotationX(legSwingAngle(phase, leg.phaseOffset))
  legLocal.multiply(legRot)
  return out.multiplyMatrices(body, legLocal)
}
