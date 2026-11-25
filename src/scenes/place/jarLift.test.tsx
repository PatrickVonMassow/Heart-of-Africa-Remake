// @vitest-environment node
// The filled jar is LIFTED from the hand onto the head (jarLift.ts): the
// moving capture of 22.10.2026 showed the carrier's jar go from hanging low at
// his hip to beside his shoulder within ~6 frames while he walked on. Here the
// jar's drawn path is traced on the glTF body through that change of carry,
// and its per-frame displacement is bounded.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { advance, createRoot, extend, useFrame } from '@react-three/fiber'
import { beforeAll, describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { REST_POSE, type FigurePose } from '../../render/gesture'
import { parseVillager, type VillagerAsset } from '../../render/villagerAsset'
import type { AdultCarry } from './adultWork'
import { steadiedLoad } from './headLoads'
import { jarLiftShare, placeLiftedJar, stepJarLift, type JarRest } from './jarLift'
import type { FigureLook } from './placeFigureContext'
import { SkinnedFigure } from './skinnedFigure'

extend(THREE as unknown as Parameters<typeof extend>[0])
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const FPS = 60
const PALETTE = ['#3a5a8a', '#8a4a2a', '#c2b090']
/** The frame the fill ends and the jar turns full, the carrier walking on. */
const FULL_AT = 90
const FRAMES = 240
/** 0.05 m in a 60 fps frame is 3 m/s, a walking arm's swing at most (as in
 *  rackWorkerSteady). Before the lift the jar crossed ~0.9 m from the hand to
 *  the crown in one frame, the steadying hand following at ~6 cm a frame. */
const STEP_BAR = 0.05
const JAR_H = 0.32
const REST: JarRest = {
  position: new THREE.Vector3(0, JAR_H / 2, 0),
  quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.16, 0, 0.1)),
}

let asset: VillagerAsset
beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

describe('the lift clock', () => {
  it('starts in the frame the jar turns full and ends on the head', () => {
    const dt = 1 / FPS
    expect(stepJarLift(null, 'emptyJar', 'emptyJar', dt)).toBeNull()
    expect(stepJarLift(null, 'fullJar', 'emptyJar', dt)).toBe(0)
    expect(jarLiftShare(0)).toBe(0)
    let t: number | null = 0
    let frames = 0
    let last = 0
    while (t !== null) {
      t = stepJarLift(t, 'fullJar', 'fullJar', dt)
      const share = jarLiftShare(t)
      expect(share).toBeGreaterThanOrEqual(last)
      last = share
      frames++
    }
    expect(last).toBe(1)
    expect(frames / FPS).toBeCloseTo(balance.waterJarLiftSeconds, 1)
    // a jar set down ends any lift
    expect(stepJarLift(0.2, 'none', 'fullJar', dt)).toBeNull()
  })
})

describe('the carried jar through the change of carry (glTF body, walking)', () => {
  it('rises from the hand to the head as a lift, never a pop', async () => {
    const look: FigureLook = { peopleId: 'bambara', drivers: { coldness: 0, harmattan: 0, karif: 0 }, year: 1890, palette: PALETTE, radial: 16, villager: asset }
    const group = new THREE.Group()
    let frame = 0
    const jars: { head: THREE.Object3D | null; hand: THREE.Object3D | null } = { head: null, hand: null }
    const share = { current: 1 }
    const clock = { seconds: null as number | null, carry: 'emptyJar' as AdultCarry }
    function Stage() {
      const pose = useRef<FigurePose | null>({ left: { ...REST_POSE.left }, right: { ...REST_POSE.right }, lean: 0.02, turn: 0 })
      // the owner's frame, after the figure's own: as PlaceLife's errand loop
      useFrame((_, dt) => {
        group.position.z += 1.1 * dt
        const carry: AdultCarry = frame >= FULL_AT ? 'fullJar' : 'emptyJar'
        clock.seconds = stepJarLift(clock.seconds, carry, clock.carry, dt)
        clock.carry = carry
        share.current = jarLiftShare(clock.seconds)
        if (jars.head) jars.head.visible = carry === 'fullJar'
        if (jars.hand) jars.hand.visible = carry === 'emptyJar'
        if (jars.head && jars.hand) placeLiftedJar(jars.head, jars.hand, share.current, REST)
      })
      return (
        <primitive object={group}>
          <SkinnedFigure look={look} cloth={PALETTE[0]} sex="male" age="adult" identityKey="jar-lift" pose={pose} legs
            headSteady={steadiedLoad('jar', { bottom: 0.16, top: 0.155, height: JAR_H })}
            headLift={share}
            headProp={<group ref={(el) => { jars.head = el }} visible={false} position={REST.position} quaternion={REST.quaternion} />}
            handProp={<group ref={(el) => { jars.hand = el }} visible={false} position={[0, -0.12, 0.04]} rotation={[0, 0, 0.12]} />} />
        </primitive>
      )
    }
    const root = createRoot({} as HTMLCanvasElement)
    const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
    await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
    await act(async () => root.render(<Stage />))
    const path: THREE.Vector3[] = []
    for (frame = 0; frame < FRAMES; frame++) {
      act(() => advance((frame + 1) / FPS))
      group.updateMatrixWorld(true)
      const shown = frame >= FULL_AT ? jars.head! : jars.hand!
      path.push(group.worldToLocal(shown.getWorldPosition(new THREE.Vector3())))
    }
    const crown = group.worldToLocal(group.getObjectByName('figure-crown')!.getWorldPosition(new THREE.Vector3()))
    await act(async () => root.unmount())
    // the walk is under way before the jar turns full
    const steps = path.slice(30).map((p, k) => p.distanceTo(path[30 + k - 1] ?? p))
    expect(Math.max(...steps)).toBeLessThan(STEP_BAR)
    // it was at the hip, and it ends on the head
    const hip = path[FULL_AT - 1]
    const end = path[path.length - 1]
    expect(hip.y).toBeLessThan(1)
    expect(end.y).toBeGreaterThan(crown.y)
    // and the rise from hip to head takes a natural while: its middle 80 %
    // spans at least 0.4 s, four times the ~6 frames of the pop
    const at = (f: number) => path.findIndex((p, k) => k >= FULL_AT && p.y >= hip.y + (end.y - hip.y) * f)
    expect(at(0.9) - at(0.1)).toBeGreaterThanOrEqual(24)
  }, 120_000)
})
