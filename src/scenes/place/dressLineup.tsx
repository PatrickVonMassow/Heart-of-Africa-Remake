// DEV-ONLY staging for the picture evidence of the villager dress (work-order
// "villager dress"), like the small herd staged beside the player for the
// animal models (1284): `window.__dressLineup({x, z, yaw})` stands one villager
// of every sex and age group in a row at that spot, drawn through the real
// `Figure` with this settlement's look; `only` (e.g. ['male-youth', 'male-elder'])
// stands just those; `window.__dressLineup(null)` clears it.
// Nothing renders in a production build.

import { useEffect, useState } from 'react'
import { CHILD_FIGURE_SCALE } from '../../render/figures'
import type { AgeGroup, Sex } from '../../systems/appearance'
import { usePlaceGround } from './PlaceGroundContext'
import { Figure } from './placeFigure'

/** Left to right: children, the young, the married, the old — women first. */
const LINEUP: ReadonlyArray<{ sex: Sex; age: AgeGroup }> = [
  { sex: 'female', age: 'child' },
  { sex: 'male', age: 'child' },
  { sex: 'female', age: 'youth' },
  { sex: 'male', age: 'youth' },
  { sex: 'female', age: 'adult' },
  { sex: 'male', age: 'adult' },
  { sex: 'female', age: 'elder' },
  { sex: 'male', age: 'elder' },
]
const SPACING = 0.9

export function DressLineup({ cloth }: { cloth: readonly string[] }) {
  const [at, setAt] = useState<{ x: number; z: number; yaw: number; only?: string[] } | null>(null)
  const groundHeight = usePlaceGround()
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__dressLineup = (spot: { x: number; z: number; yaw: number; only?: string[] } | null) => setAt(spot)
    return () => {
      delete w.__dressLineup
    }
  }, [])
  if (!import.meta.env.DEV || !at) return null
  const right = [Math.cos(at.yaw), -Math.sin(at.yaw)]
  return (
    <group name="dress-lineup">
      {LINEUP.filter((c) => !at.only || at.only.includes(`${c.sex}-${c.age}`)).map((c, i, row) => {
        const off = (i - (row.length - 1) / 2) * SPACING
        const x = at.x + right[0] * off
        const z = at.z + right[1] * off
        return (
          <group key={i} name={`dress-lineup-${c.sex}-${c.age}`} position={[x, groundHeight(x, z), z]} rotation={[0, at.yaw, 0]}>
            <Figure cloth={cloth[i % cloth.length]} sex={c.sex} age={c.age} scale={c.age === 'child' ? CHILD_FIGURE_SCALE : 1} legs />
          </group>
        )
      })}
    </group>
  )
}
