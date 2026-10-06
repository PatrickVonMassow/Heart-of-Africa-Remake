// The villagers' digging shovel (work-order "villager glTF body: animation,
// dress and tool"): one shape for every body, from VILLAGER_ASSET.shovel — the
// same numbers the pipeline solved the dig and the carry onto. Its frame: +y
// along the shaft to the handle, the blade at −y with its face toward +z, the
// origin where the carrying hand holds it.

import { VILLAGER_ASSET } from '../../config/balance'

const S = VILLAGER_ASSET.shovel

export function Shovel() {
  const shaft = S.top - S.shaftBottom
  const blade = S.shaftBottom - S.tip
  return (
    <group name="shovel">
      <mesh position={[0, (S.top + S.shaftBottom) / 2, 0]} castShadow>
        <cylinderGeometry args={[S.shaftRadius, S.shaftRadius * 1.15, shaft, 6]} />
        <meshStandardMaterial color="#654522" roughness={0.95} />
      </mesh>
      <mesh position={[0, S.tip + blade / 2, 0]} castShadow>
        <boxGeometry args={[S.bladeWidth, blade, S.bladeThickness]} />
        <meshStandardMaterial color="#5a5249" roughness={0.6} metalness={0.4} />
      </mesh>
    </group>
  )
}
