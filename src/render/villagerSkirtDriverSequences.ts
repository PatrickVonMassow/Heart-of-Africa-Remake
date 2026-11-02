// Fixed-dt pose sequences for the column driver's tests and its round trip
// (docs/garment-stage3-plan-1398.md sections 3.4 and 3.14): the game's clip
// layers posing a hung person frame by frame, the driver run after them.
// Test support only; the game never imports it.
import type * as THREE from 'three/webgpu'
import { applyClipLayers, clipLayers, stepClipLayers } from '../scenes/place/gltfClipLayers'
import type { AgeGroup, Sex } from '../systems/appearance'
import type { VillagerAsset } from './villagerAsset'
import { createGltfSkeleton, gltfPerson, type GltfPerson } from './villagerFigureBody'
import { ColumnDriver, columnRig } from './villagerSkirtDriver'

/** One leg of a sequence: frames at a speed, with work and kneel weight, at a step dt. */
export interface SequenceLeg {
  frames: number
  speed: number
  work?: { dig: boolean; tool: boolean } | null
  kneel?: number
  /** The step of this leg's first frame (a gap above resetDt re-enters from the gravity solution). */
  firstDt?: number
}

export interface DriverSequence {
  id: string
  sex: Sex
  age: AgeGroup
  build: number
  dt: number
  legs: SequenceLeg[]
}

/** The round trip's sequences: walk, run, dig, carry, a start and a stop, a gap. */
export const ROUND_TRIP_SEQUENCES: DriverSequence[] = [
  {
    id: 'woman-walk-run',
    sex: 'female',
    age: 'adult',
    build: 0,
    dt: 1 / 60,
    legs: [
      { frames: 10, speed: 0 },
      { frames: 40, speed: 1.1 },
      { frames: 30, speed: 3.5 },
      { frames: 10, speed: 0 },
    ],
  },
  {
    id: 'girl-dig-gap-walk',
    sex: 'female',
    age: 'child',
    build: 1,
    dt: 1 / 30,
    legs: [
      { frames: 30, speed: 0, work: { dig: true, tool: true } },
      { frames: 20, speed: 1.0, firstDt: 0.5 },
    ],
  },
  {
    id: 'man-carry',
    sex: 'male',
    age: 'adult',
    build: -1,
    dt: 1 / 60,
    legs: [
      { frames: 20, speed: 0, work: { dig: false, tool: true } },
      { frames: 30, speed: 1.1, work: { dig: false, tool: true } },
    ],
  },
]

export interface SequenceFrame {
  dt: number
  bones: THREE.Bone[]
  driver: ColumnDriver
  person: GltfPerson
}

/** Run a sequence; `each` sees every frame after the driver has written the columns. */
export function runSequence(asset: VillagerAsset, s: DriverSequence, each: (f: SequenceFrame) => void, driver?: ColumnDriver): ColumnDriver {
  const person = gltfPerson(asset, s.sex, s.age, s.build)
  const { skeleton, bones } = createGltfSkeleton(asset, person.rest)
  const d = driver ?? new ColumnDriver(columnRig(asset, person))
  const c = clipLayers(asset)
  let z = 0
  for (const leg of s.legs) {
    for (let k = 0; k < leg.frames; k++) {
      const dt = k === 0 && leg.firstDt !== undefined ? leg.firstDt : s.dt
      stepClipLayers(asset, person, c, leg.speed * dt, leg.speed, { x: 0, z: (z += leg.speed * dt), yaw: 0, unit: 1 }, leg.work ?? null, dt)
      applyClipLayers(asset, person, bones, c, { speed: leg.speed, weight: leg.speed > 0 ? 1 : 0, kneel: leg.kneel ?? 0 }, [true, true])
      d.step(skeleton.bones, dt)
      each({ dt, bones: skeleton.bones, driver: d, person })
    }
  }
  return d
}
