// The river fishery's net man (point 1387): ONE body through the whole round —
// kneeling in the dugout, stepping ashore, squatting at the landing to unload
// and boarding again. Two Figures toggled by `inBoat` were two people: each
// Figure keys its own identity (sex, body, dress) by useId (placeFigure.tsx).
// Placed each frame by `placeNetMan` (fisheryPoses.ts).
import type { RefObject } from 'react'
import type * as THREE from 'three/webgpu'
import type { FigureLimbs } from '../../render/figurePose'
import type { FigurePose } from '../../render/gesture'
import { Figure } from './placeFigure'

export function FisheryNetMan({
  group,
  born,
  cloth,
  pose,
  limbs,
  kneels,
  squat,
}: {
  group: RefObject<THREE.Group | null>
  born: [number, number, number]
  cloth: string
  pose: RefObject<FigurePose | null>
  limbs: RefObject<FigureLimbs | null>
  kneels: RefObject<boolean>
  squat: RefObject<number>
}) {
  return (
    <group ref={group} name="village-canoe-netman" position={born}>
      <Figure cloth={cloth} pose={pose} limbs={limbs} kneeling={kneels} squat={squat} />
    </group>
  )
}
