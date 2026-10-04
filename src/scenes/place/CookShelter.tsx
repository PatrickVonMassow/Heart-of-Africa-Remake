import type * as THREE from 'three/webgpu'
import { COOK_SHELTER } from './roofClearance'

/**
 * Open-sided thatched cook-shelter over a fire (design.md §19.10, point 256):
 * four corner posts carrying a low pyramidal thatch roof, well clear of the
 * flame. Cheap geometry in the settlement's own thatch/wood material style — it
 * lets the fire read as sheltered from the rain rather than blazing in the open.
 * The village fire pit and the fishers' fire (point 1275) share this one model;
 * `postR` widens the post square for the fishers' grill and griller.
 */
export function CookShelter({ thatchMat, postR = COOK_SHELTER.postR }: { thatchMat: THREE.Material; postR?: number }) {
  // Corner posts a comfortable margin around the stone ring, and an eave
  // height clear of a standing figure and the flame — the same numbers the
  // head-clearance sweep reads (work-order 349).
  const { postH } = COOK_SHELTER
  const posts: Array<[number, number]> = [
    [postR, postR],
    [postR, -postR],
    [-postR, postR],
    [-postR, -postR],
  ]
  return (
    <group name="cook-shelter">
      {posts.map(([px, pz], i) => (
        <mesh key={i} position={[px, postH / 2, pz]} castShadow>
          <cylinderGeometry args={[0.08, 0.1, postH, 6]} />
          <meshStandardMaterial color="#5a4526" roughness={1} />
        </mesh>
      ))}
      {/* Low pyramidal thatch roof, eaves overhanging the posts a little. */}
      <mesh name="hut-roof" position={[0, postH + COOK_SHELTER.capCentre, 0]} rotation={[0, Math.PI / 4, 0]} castShadow material={thatchMat}>
        <coneGeometry args={[postR * COOK_SHELTER.capSpread, COOK_SHELTER.capHeight, 4]} />
      </mesh>
    </group>
  )
}
