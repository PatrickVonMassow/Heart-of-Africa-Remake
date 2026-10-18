// The brimmed hats of the non-villager cast (docs/giza-1890.md §4.1): the sun
// helmet of the Western men and the expedition leader, and the women tourists'
// hat. The garment set holds no brimmed hat, so they ride the figure's crown as
// a head prop (`Figure headProp`) on either body. Authored for the skinned
// head, scaled up to the larger primitive head on the low preset.

import { useContext, type ReactNode } from 'react'
import { FIGURE_STATURE } from '../../render/figureBody'
import { PRIMITIVE_HEAD_RADIUS } from '../../render/figureWalk'
import { FigureLookContext } from './placeFigureContext'

/** The skinned adult head's half width (render/figureBody.ts `headHalfW`). */
const SKINNED_HEAD_HALF_W = FIGURE_STATURE * 0.055

/** The scale a hat authored for the skinned head takes on the drawn body. */
function useHeadScale(): number {
  return useContext(FigureLookContext) ? 1 : PRIMITIVE_HEAD_RADIUS / SKINNED_HEAD_HALF_W
}

/** The pith helmet: a high dome over the head and a wide sloping brim. The
 *  crown frame's origin is the top of the head. `children` ride the helmet
 *  (the traveller's wound strap). */
export function SunHelmet({ colour, children }: { colour: string; children?: ReactNode }) {
  const s = useHeadScale()
  return (
    <group scale={s} name="sun-helmet">
      <mesh position={[0, -0.05, 0]} scale={[1, 0.9, 1.08]} castShadow>
        <sphereGeometry args={[0.092, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={colour} roughness={0.85} />
      </mesh>
      <mesh position={[0, -0.056, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.15, 0.014, 16]} />
        <meshStandardMaterial color={colour} roughness={0.85} />
      </mesh>
      {children}
    </group>
  )
}

/** The woman tourist's hat: a low crown with a band on a flat brim. */
export function LadyHat({ colour, band }: { colour: string; band: string }) {
  const s = useHeadScale()
  return (
    <group scale={s} name="lady-hat">
      <mesh position={[0, -0.012, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.078, 0.06, 14]} />
        <meshStandardMaterial color={colour} roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.03, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.02, 14]} />
        <meshStandardMaterial color={band} roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.042, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.14, 0.01, 18]} />
        <meshStandardMaterial color={colour} roughness={0.9} />
      </mesh>
    </group>
  )
}
