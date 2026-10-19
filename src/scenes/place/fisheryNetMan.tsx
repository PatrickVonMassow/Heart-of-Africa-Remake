// The river fishery's net man (point 1387): ONE body through the whole round —
// kneeling in the dugout, stepping ashore, squatting at the landing to unload
// and boarding again. Two Figures toggled by `inBoat` were two people: each
// Figure keys its own identity (sex, body, dress) by useId (placeFigure.tsx).
import type { RefObject } from 'react'
import type * as THREE from 'three/webgpu'
import type { FigureLimbs } from '../../render/figurePose'
import type { FigurePose } from '../../render/gesture'
import { Figure } from './placeFigure'
import type { CanoeNetMan } from './villagerCanoe'

/** How far down he goes as he lifts or sets the basket ashore (fraction of his height). */
const SHORE_SQUAT = 0.28

/** Places the net man for this frame: on the seat and kneeling while in the
 *  hull, on the ground and standing (squatting to the basket) ashore. The kneel
 *  itself is the figure's own down-and-up transition. */
export function placeNetMan(
  group: THREE.Object3D,
  nm: CanoeNetMan,
  /** World height of his seat in the hull. */
  seatY: number,
  ground: (x: number, z: number) => number,
  kneels: { current: boolean },
  squat: { current: number },
): void {
  kneels.current = nm.inBoat
  const y = nm.inBoat ? seatY : ground(nm.x, nm.z)
  group.position.set(nm.x, y, nm.z)
  group.rotation.y = nm.yaw
  const squash = nm.inBoat ? 1 : 1 - SHORE_SQUAT * nm.reach
  group.scale.set(1, squash, 1)
  squat.current = squash
}

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
