// @vitest-environment node
// THE glTF VILLAGER'S KNEEL STAYS ON THE GROUND: SkinnedFigure mounted through
// react-three-fiber's reconciler (as villagerRuntimePose.test.tsx does) walks,
// stops and kneels (`kneeling`, the task walker's way, PlaceLife.tsx), holds,
// gets up and walks off. Every few frames the skinned body is drawn on the CPU
// (morphs and skinning) and its lowest vertices are read against the ground
// the figure stands on: in the held kneel the shins lie on it, and through
// both transitions some part of the body touches it — the figure never hangs
// in the air. (Measured 16.10.2026, identical on main cff9fdb53 and the branch:
// held kneel lowest shin −0.021 … −0.007, transitions lowest −0.11 … +0.03.)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from 'react'
import * as THREE from 'three/webgpu'
import { advance, createRoot, extend, useFrame } from '@react-three/fiber'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AgeGroup, Sex } from '../systems/appearance'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import type { FigureLook } from '../scenes/place/placeFigureContext'
import { SkinnedFigure } from '../scenes/place/skinnedFigure'

extend(THREE as unknown as Parameters<typeof extend>[0])
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const DT = 1 / 60
/** Figure units: shins this close to the ground (above or sunk) rest on it. */
const SHIN_REST = 0.03
/** Figure units: the village-walk probe's sole tolerance (FOOT_TOL): a body
 *  whose lowest point is no higher touches the ground. */
const TOUCH = 0.04

let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

interface Sample {
  t: number
  kneel: number
  /** Lowest vertex of the whole body, and of the shins, over the ground. */
  lowest: number
  shin: number
}

/** Walk 2 s at the task walker's 1.2 u/s, kneel 3 s, stand 1.5 s; sample every third frame. */
async function kneelRun(sex: Sex, age: AgeGroup): Promise<Sample[]> {
  const look: FigureLook = { peopleId: 'zulu', drivers: { coldness: 0, harmattan: 0, karif: 0 }, year: 1890, palette: ['#3a5a8a', '#8a4a2a', '#c2b090'], radial: 16, villager: asset }
  const root = new THREE.Group()
  const kneeling = { current: false }
  let t = 0
  function Stage() {
    useFrame((_, dt) => {
      t += dt
      if (t < 2) root.position.z += 1.2 * dt
      kneeling.current = t >= 2 && t < 5
    }, -1)
    return (
      <primitive object={root}>
        <SkinnedFigure look={look} cloth="#3a5a8a" scale={1} sex={sex} age={age} identityKey={`kneel-${sex}-${age}`} kneeling={kneeling} />
      </primitive>
    )
  }
  const r = createRoot({} as HTMLCanvasElement)
  const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
  await r.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
  await act(async () => r.render(<Stage />))
  const mesh = root.getObjectByName('figure-body') as THREE.SkinnedMesh
  const bones = mesh.skeleton.bones
  const shins = new Set(['bone-shin.L', 'bone-shin.R'].map((n) => bones.findIndex((b) => b.name === n)))
  const pos = mesh.geometry.getAttribute('position')
  const si = mesh.geometry.getAttribute('skinIndex')
  const sw = mesh.geometry.getAttribute('skinWeight')
  // each vertex's dominant bone
  const dom = Array.from({ length: pos.count }, (_, i) => {
    let best = 0
    for (let j = 1; j < 4; j++) if (sw.getComponent(i, j) > sw.getComponent(i, best)) best = j
    return si.getComponent(i, best)
  })
  const v = new THREE.Vector3()
  const out: Sample[] = []
  for (let k = 1; k <= 6.5 / DT; k++) {
    act(() => advance(k * DT))
    if (k % 3 || t < 1.9) continue
    let walk: { kneel: number } | null = null
    root.traverse((o) => {
      if (o.userData.walk) walk = o.userData.walk
    })
    root.updateMatrixWorld(true)
    let lowest = Infinity
    let shin = Infinity
    for (let i = 0; i < pos.count; i++) {
      const y = mesh.localToWorld(mesh.getVertexPosition(i, v)).y - root.position.y
      lowest = Math.min(lowest, y)
      if (shins.has(dom[i])) shin = Math.min(shin, y)
    }
    out.push({ t, kneel: (walk as { kneel: number } | null)?.kneel ?? NaN, lowest, shin })
  }
  await act(async () => r.unmount())
  return out
}

describe('the glTF villager kneels on the ground', () => {
  for (const [sex, age] of [
    ['female', 'adult'],
    ['female', 'youth'],
    ['male', 'elder'],
  ] as const) {
    it(`${sex} ${age}: the shins rest on the ground while knelt, and no frame of the kneel hangs in the air`, async () => {
      const s = await kneelRun(sex, age)
      const held = s.filter((r) => r.kneel === 1)
      const moving = s.filter((r) => r.kneel > 0 && r.kneel < 1)
      // the kneel was really observed both ways
      expect(held.length).toBeGreaterThan(20)
      expect(moving.length).toBeGreaterThan(6)
      for (const r of held) expect(Math.abs(r.shin), JSON.stringify(r)).toBeLessThanOrEqual(SHIN_REST)
      for (const r of [...held, ...moving]) expect(r.lowest, JSON.stringify(r)).toBeLessThanOrEqual(TOUCH)
    }, 60_000)
  }
})
