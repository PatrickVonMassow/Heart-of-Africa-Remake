// @vitest-environment node
// The pounding pair at the fish rack (work-order 1416, "Die Figuren zittern
// herum"): through a whole visit — taking the fish, eating it — the drawn
// body's hips and hands move continuously, never jumping frame to frame, and
// the hips never bob up and down on the spot.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { advance, createRoot, extend, useFrame } from '@react-three/fiber'
import { beforeAll, describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import type { FigurePose } from '../../render/gesture'
import { parseVillager, type VillagerAsset } from '../../render/villagerAsset'
import { rackPose } from './fisheryPoses'
import type { PoundingDuo } from './mortarPounding'
import type { FigureLook } from './placeFigureContext'
import { SkinnedFigure } from './skinnedFigure'

extend(THREE as unknown as Parameters<typeof extend>[0])
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PALETTE = ['#3a5a8a', '#8a4a2a', '#c2b090']
const FPS = 60
let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

/** The pair's state at second `t` of a visit: standing (arrived), taking,
 *  eating, standing again — what `stepPoundingDuo` hands `Pounder`. */
function visitAt(t: number, cfg = balance.villageLife.fishFire): Pick<PoundingDuo, 'phase' | 'clock' | 'women'> {
  const stand = 0.5
  const woman = (fish: number) => ({ fish }) as PoundingDuo['women'][number]
  if (t < stand) return { phase: 'toRack', clock: t, women: [woman(0), woman(0)] }
  t -= stand
  if (t < cfg.takeSeconds) {
    const fish = t >= cfg.takeSeconds / 2 ? 1 : 0
    return { phase: 'take', clock: t, women: [woman(fish), woman(fish)] }
  }
  t -= cfg.takeSeconds
  if (t < cfg.eatSeconds) {
    const left = Math.max(1e-3, 1 - t / cfg.eatSeconds)
    return { phase: 'eat', clock: t, women: [woman(left), woman(left)] }
  }
  return { phase: 'back', clock: t - cfg.eatSeconds, women: [woman(0), woman(0)] }
}

interface Track {
  /** Largest frame-to-frame move of the hips and of either hand (m). */
  hipStep: number
  handStep: number
  /** Frames where the hips' height turned back on itself by more than 5 mm
   *  both ways — a bob in place. */
  hipBobs: number
  /** Lowest hips height over the visit, against the standing one (m). */
  hipDrop: number
}

async function track(woman: number): Promise<Track> {
  const cfg = balance.villageLife.fishFire
  const seconds = 0.5 + cfg.takeSeconds + cfg.eatSeconds + 0.5
  const look: FigureLook = {
    peopleId: 'bambara',
    drivers: { coldness: 0, harmattan: 0, karif: 0 },
    year: 1890,
    palette: PALETTE,
    radial: 16,
    villager: asset,
  }
  const group = new THREE.Group()
  let frame = 0
  function Stage() {
    const pose = useRef<FigurePose | null>(rackPose(visitAt(0), woman))
    useFrame(() => {
      pose.current = rackPose(visitAt(frame / FPS), woman)
    })
    return (
      <primitive object={group}>
        <SkinnedFigure look={look} cloth={PALETTE[0]} sex="female" age={woman === 0 ? 'adult' : 'youth'} identityKey={`rack-${woman}`} pose={pose} legs />
      </primitive>
    )
  }
  const root = createRoot({} as HTMLCanvasElement)
  const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
  await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
  await act(async () => root.render(<Stage />))
  const mesh = group.getObjectByName('figure-body') as THREE.SkinnedMesh
  const bone = (name: string) => mesh.skeleton.bones[asset.bones.indexOf(name)]
  const at = (name: string) => group.worldToLocal(bone(name).getWorldPosition(new THREE.Vector3()))
  let last: THREE.Vector3[] | null = null
  const hipYs: number[] = []
  const out: Track = { hipStep: 0, handStep: 0, hipBobs: 0, hipDrop: 0 }
  for (frame = 0; frame < seconds * FPS; frame++) {
    act(() => advance((frame + 1) / FPS))
    group.updateMatrixWorld(true)
    const now = [at('hips'), at('hand.L'), at('hand.R')]
    // the first frames settle the clips from the bind pose
    if (last && frame > 10) {
      out.hipStep = Math.max(out.hipStep, now[0].distanceTo(last[0]))
      out.handStep = Math.max(out.handStep, now[1].distanceTo(last[1]), now[2].distanceTo(last[2]))
    }
    if (frame > 10) hipYs.push(now[0].y)
    last = now
  }
  await act(async () => root.unmount())
  const standing = hipYs[0]
  out.hipDrop = standing - Math.min(...hipYs)
  for (let i = 1; i < hipYs.length - 1; i++) {
    const a = hipYs[i] - hipYs[i - 1]
    const b = hipYs[i + 1] - hipYs[i]
    if (Math.abs(a) > 0.005 && Math.abs(b) > 0.005 && Math.sign(a) !== Math.sign(b)) out.hipBobs++
  }
  return out
}

describe('the pounding pair at the fish rack (point 1416)', () => {
  for (const woman of [0, 1]) {
    it(`woman ${woman} takes and eats her fish without a jitter`, async () => {
      const t = await track(woman)
      // 0.05 m in a 60 fps frame is 3 m/s, a walking arm's swing at most;
      // a body standing at its work moves its hips far less.
      expect(t.handStep).toBeLessThan(0.05)
      expect(t.hipStep).toBeLessThan(0.01)
      expect(t.hipBobs).toBe(0)
      // she stands to take from the rack and to eat: no deep crouch
      expect(t.hipDrop).toBeLessThan(0.05)
    }, 120_000)
  }
})
