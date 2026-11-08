// @vitest-environment node
// A touch begins AT its pose (GESTURE_NO_FADE_IN): the bank game's tapping
// child and its arriving runner say ROCK with the hand on the stone in the
// frame the word falls. On the glTF body the clips own a hanging arm, and the
// code takes it over `VILLAGER_GLTF.transitionSeconds` — a touch must not
// wait for that hand-over, or its hand swings in from the side for a third
// of a second while the word is already falling (polish-children,
// children-bank-game: 38 cm off the stone in the word frame, 24 cm 0.08 s on).
// The contact's crouch, eased at VILLAGER_MOTION.crouchRate, is the same lag.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { advance, createRoot, extend, useFrame } from '@react-three/fiber'
import { beforeAll, describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { applyFigurePose, type FigureLimbs } from '../../render/figurePose'
import {
  advanceGesture,
  copyPoseExtras,
  gesturePose,
  REST_POSE,
  restGesture,
  startGesture,
  type FigurePose,
  type GestureKind,
  type GestureState,
} from '../../render/gesture'
import { parseVillager, type VillagerAsset } from '../../render/villagerAsset'
import type { FigureLook } from './placeFigureContext'
import { SkinnedFigure } from './skinnedFigure'
import { bankFigurePose } from './tagGame'

extend(THREE as unknown as Parameters<typeof extend>[0])
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PALETTE = ['#3a5a8a', '#8a4a2a', '#c2b090']
let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

const REST_FRAMES = 60
const HOLD_FRAMES = 90
/** The suite's contact bar: a drawn hand within 5 mm of where it rests. */
const CONTACT_BAR = 0.005

/**
 * The drawn hand of the gesturing arm, in the figure's frame, on every frame
 * of a gesture started after `REST_FRAMES` of standing — written the way the
 * bank round writes its children (PlaceLife.tsx): the gesture started inside
 * the owner's frame callback, after the figure's own, its pose carried
 * through `bankFigurePose` and applied in that same frame.
 */
async function handTrace(kind: GestureKind, elevation = -0.45) {
  const look: FigureLook = {
    peopleId: 'swahili',
    drivers: { coldness: 0, harmattan: 0, karif: 0 },
    year: 1890,
    palette: PALETTE,
    radial: 16,
    villager: asset,
  }
  const group = new THREE.Group()
  let frame = 0
  const cfg = balance.villageLife.tag
  function Stage() {
    const pose = useRef<FigurePose | null>({ left: { ...REST_POSE.left }, right: { ...REST_POSE.right }, lean: 0, turn: 0 })
    const limbs = useRef<FigureLimbs | null>(null)
    const gesture = useRef<GestureState>(restGesture())
    useFrame((_, dt) => {
      gesture.current = advanceGesture(gesture.current, dt)
      if (frame === REST_FRAMES) gesture.current = startGesture(kind, { bearing: 0.35, elevation, duration: 4 })
      const drawn = bankFigurePose(false, gesturePose(gesture.current), 0, cfg)
      const p = pose.current!
      p.left = drawn.left
      p.right = drawn.right
      p.turn = drawn.turn
      copyPoseExtras(p, drawn)
      p.lean = drawn.lean
      applyFigurePose(limbs.current, p)
    })
    return (
      <primitive object={group}>
        <SkinnedFigure look={look} cloth={PALETTE[0]} sex="male" age="child" identityKey="touch-probe" pose={pose} limbs={limbs} />
      </primitive>
    )
  }
  const root = createRoot({} as HTMLCanvasElement)
  const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
  await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
  await act(async () => root.render(<Stage />))
  const trace: THREE.Vector3[] = []
  const crouch: number[] = []
  for (frame = 0; frame < REST_FRAMES + HOLD_FRAMES; frame++) {
    act(() => advance((frame + 1) / 60))
    if (frame < REST_FRAMES) continue
    group.updateMatrixWorld(true)
    const anchor = group.getObjectByName('hand-left')!
    trace.push(group.worldToLocal(anchor.getWorldPosition(new THREE.Vector3())))
    crouch.push((group.getObjectByName('inhabitant')!.userData.walk as { crouch: number }).crouch)
  }
  await act(async () => root.unmount())
  return { trace, crouch }
}

describe('a touch on the glTF body', () => {
  it('has its hand where it rests in the very frame it begins, and holds it there', async () => {
    const { trace, crouch } = await handTrace('touch')
    // the hand once the touch has stood a whole second: where it rests
    const settled = trace[trace.length - 1]
    const off = trace.map((h) => h.distanceTo(settled))
    expect(off[0]).toBeLessThan(CONTACT_BAR)
    expect(Math.max(...off)).toBeLessThan(CONTACT_BAR)
    // the child's body crouches for the primitive's hand, and does so at once
    expect(crouch[0]).toBeGreaterThan(0.3)
  }, 60_000)

  it('only a gesture that begins at its pose skips the clips\' hand-over', () => {
    // a point grows out of rest itself, so its arm is still handed over from
    // the clips; only the touch names its arm as arriving
    const at = { bearing: 0.35, elevation: -0.45, duration: 4 }
    const posed = (kind: GestureKind) => gesturePose(advanceGesture(startGesture(kind, at), 1 / 60))
    expect(posed('point').arrive).toBeUndefined()
    expect(posed('touch').arrive).toBeDefined()
  })
})
