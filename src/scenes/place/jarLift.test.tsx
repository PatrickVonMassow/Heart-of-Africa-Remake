// @vitest-environment node
// The filled jar is LIFTED from the hand onto the head (jarLift.ts): the
// moving capture of 22.10.2026 showed the carrier's jar go from hanging low at
// his hip to beside his shoulder within ~6 frames while he walked on. Here the
// jar's drawn path is traced through that change of carry on a walking body,
// owned the way PlaceLife owns it (pose applied in the owner's frame, the jar
// placed after it), and its per-frame displacement and turn are bounded — on
// the glTF body, with the jar's arm busy at the lift, without the lift input,
// and on the primitive body.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, useRef, type ReactNode } from 'react'
import * as THREE from 'three/webgpu'
import { advance, createRoot, extend, useFrame } from '@react-three/fiber'
import { beforeAll, describe, expect, it } from 'vitest'
import { balance, VILLAGER_GLTF } from '../../config/balance'
import { liftReachable, solveTwoBone } from '../../render/figureRig'
import { applyFigurePose, type FigureLimbs } from '../../render/figurePose'
import { REST_POSE, type FigurePose } from '../../render/gesture'
import { parseVillager, type VillagerAsset } from '../../render/villagerAsset'
import type { AdultCarry } from './adultWork'
import { steadiedLoad } from './headLoads'
import { LIFT_SETTLE, jarLiftShare, placeLiftedJar, stepJarLift, type JarRest } from './jarLift'
import { Figure } from './placeFigure'
import { FigureLookContext, type FigureLook } from './placeFigureContext'

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
/** The jar's (and the lifting hand's) turn in one frame: 0.15 rad is ~9 rad/s,
 *  far below the half turn a flipped hand swings the jar through. */
const TURN_BAR = 0.15
const JAR_H = 0.32
const REST: JarRest = {
  position: new THREE.Vector3(0, JAR_H / 2, 0),
  quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.16, 0, 0.1)),
}
/** The jar arm raised forward at the lift — a gesture the lift must win over. */
const BUSY_LEFT = { pitch: -1.1, yaw: 0.3, roll: 0 }

let asset: VillagerAsset
beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

interface Trace {
  /** The shown jar (the empty one before FULL_AT, the full one after), in the body's frame. */
  jar: THREE.Vector3[]
  jarTurn: THREE.Quaternion[]
  /** The jar hand's mount and (glTF) its wrist bone, in the body's frame. */
  mount: THREE.Vector3[]
  wrist: THREE.Vector3[]
  /** The jar hand's wrist bone's turn, in the body's frame (glTF). */
  wristTurn: THREE.Quaternion[]
  /** The steadying hand as the skinned body reports it (dev userData). */
  steady: Array<{ arm: string | null; weight: number } | null>
  crown: THREE.Vector3
}

async function trace(opts: { body: 'gltf' | 'primitive'; leftBusy?: boolean; busyFrom?: number; lift?: boolean }): Promise<Trace> {
  const { body, leftBusy = false, busyFrom = FULL_AT - 20, lift = true } = opts
  const look: FigureLook | null =
    body === 'gltf' ? { peopleId: 'bambara', drivers: { coldness: 0, harmattan: 0, karif: 0 }, year: 1890, palette: PALETTE, radial: 16, villager: asset } : null
  const group = new THREE.Group()
  let frame = 0
  const jars: { head: THREE.Object3D | null; hand: THREE.Object3D | null } = { head: null, hand: null }
  const share = { current: 1 }
  const clock = { seconds: null as number | null, carry: 'emptyJar' as AdultCarry }
  function Stage() {
    const pose = useRef<FigurePose | null>({ left: { ...REST_POSE.left }, right: { ...REST_POSE.right }, lean: 0.02, turn: 0 })
    const limbs = useRef<FigureLimbs | null>(null)
    // the owner's frame, after the figure's own: as PlaceLife's errand loop —
    // the clock, the props shown, the pose applied, then the jar placed
    useFrame((_, dt) => {
      group.position.z += 1.1 * dt
      const carry: AdultCarry = frame >= FULL_AT ? 'fullJar' : 'emptyJar'
      clock.seconds = stepJarLift(clock.seconds, carry, clock.carry, dt)
      clock.carry = carry
      share.current = jarLiftShare(clock.seconds)
      if (jars.head) jars.head.visible = carry === 'fullJar'
      if (jars.hand) jars.hand.visible = carry === 'emptyJar'
      const p = pose.current!
      p.left = leftBusy && frame >= busyFrom ? { ...BUSY_LEFT } : { ...REST_POSE.left }
      applyFigurePose(limbs.current, p)
      if (jars.head && jars.hand) placeLiftedJar(jars.head, jars.hand, share.current, REST, body === 'gltf' ? LIFT_SETTLE : 0)
    })
    const figure: ReactNode = (
      <Figure cloth={PALETTE[0]} sex="male" age="adult" pose={pose} limbs={limbs} legs
        headSteady={steadiedLoad('jar', { bottom: 0.16, top: 0.155, height: JAR_H })}
        headLift={lift ? share : undefined}
        headProp={<group ref={(el) => { jars.head = el }} visible={false} position={REST.position} quaternion={REST.quaternion}><mesh><cylinderGeometry args={[0.155, 0.16, JAR_H, 8]} /></mesh></group>}
        handProp={<group ref={(el) => { jars.hand = el }} visible={false} position={[0, -0.12, 0.04]} rotation={[0, 0, 0.12]}><mesh><cylinderGeometry args={[0.155, 0.16, JAR_H, 8]} /></mesh></group>} />
    )
    return (
      <primitive object={group}>
        <FigureLookContext.Provider value={look}>{figure}</FigureLookContext.Provider>
      </primitive>
    )
  }
  const root = createRoot({} as HTMLCanvasElement)
  const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
  await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
  await act(async () => root.render(<Stage />))
  const out: Trace = { jar: [], jarTurn: [], mount: [], wrist: [], wristTurn: [], steady: [], crown: new THREE.Vector3() }
  const bodyTurn = new THREE.Quaternion()
  const local = (o: THREE.Object3D) => group.worldToLocal(o.getWorldPosition(new THREE.Vector3()))
  for (frame = 0; frame < FRAMES; frame++) {
    act(() => advance((frame + 1) / FPS))
    group.updateMatrixWorld(true)
    const shown = frame >= FULL_AT ? jars.head! : jars.hand!
    out.jar.push(local(shown))
    group.getWorldQuaternion(bodyTurn).invert()
    out.jarTurn.push(shown.getWorldQuaternion(new THREE.Quaternion()).premultiply(bodyTurn))
    out.mount.push(local(jars.hand!.parent!))
    const mesh = group.getObjectByName('figure-body') as THREE.SkinnedMesh | undefined
    if (mesh?.skeleton) {
      const bone = mesh.skeleton.bones[asset.bones.indexOf('hand.L')]
      out.wrist.push(local(bone))
      out.wristTurn.push(bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(bodyTurn))
    }
    const st = group.getObjectByName('inhabitant')?.userData.steady as { arm: string | null; weight: number } | undefined
    out.steady.push(st ? { arm: st.arm, weight: st.weight } : null)
  }
  out.crown = local(jars.head!.parent!)
  await act(async () => root.unmount())
  return out
}

const steps = (path: THREE.Vector3[], from = 30) => path.slice(from).map((p, k) => p.distanceTo(path[from + k - 1]))
const turns = (path: THREE.Quaternion[], from = 30) => path.slice(from).map((q, k) => q.angleTo(path[from + k - 1]))
/** Frames the jar takes for the middle 80 % of its rise from hip to head. */
function riseFrames(path: THREE.Vector3[]): number {
  const hip = path[FULL_AT - 1]
  const end = path[path.length - 1]
  const at = (f: number) => path.findIndex((p, k) => k >= FULL_AT && p.y >= hip.y + (end.y - hip.y) * f)
  return at(0.9) - at(0.1)
}

describe('the lift clock', () => {
  it('starts in the frame the jar turns full, ends on the head, and starts again for the next jar', () => {
    const dt = 1 / FPS
    expect(stepJarLift(null, 'emptyJar', 'emptyJar', dt)).toBeNull()
    expect(stepJarLift(null, 'fullJar', 'emptyJar', dt)).toBe(0)
    expect(jarLiftShare(0)).toBe(0)
    const run = () => {
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
    }
    run()
    // a jar set down ends any lift; the next errand's jar is lifted afresh
    expect(stepJarLift(0.2, 'none', 'fullJar', dt)).toBeNull()
    expect(stepJarLift(null, 'emptyJar', 'none', dt)).toBeNull()
    expect(stepJarLift(null, 'fullJar', 'emptyJar', dt)).toBe(0)
    run()
  })
})

describe('the lifting wrist is always within the arm\'s reach (review findings 2 and r2-3)', () => {
  it('brings every target onto a point the two-bone solve takes, the shoulder itself included, so the lift needs no fallback', () => {
    const s = new THREE.Vector3(0.2, 1.3, 0)
    const pole = new THREE.Vector3(1, -0.3, 0.2)
    for (const [a, b] of [[0.28, 0.24], [0.26, 0.26], [0.2, 0.3]]) {
      const targets = [
        new THREE.Vector3(0.2, 0.2, 0), // beyond the straight arm
        new THREE.Vector3(0.22, 1.31, 0.01), // inside the folded arm's limit
        new THREE.Vector3(0.4, 1.0, 0.2), // plainly reachable: left alone
        s.clone(), // on the shoulder itself: no direction of its own
        s.clone().add(new THREE.Vector3(1e-8, 0, 0)),
      ]
      // and a sweep from the shoulder out past the arm in every direction
      for (let k = 0; k < 200; k++) {
        const dir = new THREE.Vector3(Math.sin(k * 1.7), Math.cos(k * 0.9), Math.sin(k * 2.3)).normalize()
        targets.push(s.clone().addScaledVector(dir, (k / 200) * (a + b) * 1.5))
      }
      for (const t of targets) {
        const before = t.clone()
        liftReachable(t, s, a, b, pole)
        expect(solveTwoBone(s, t, a, b, pole).reached).toBe(true)
        const d = before.distanceTo(s)
        if (d > 1e-6 && d < (a + b) * 0.999 && d > Math.abs(a - b) * 1.001) expect(t.distanceTo(before)).toBe(0)
      }
      // the shoulder's own target is set out toward the elbow's side, not anywhere
      const onShoulder = liftReachable(s.clone(), s, a, b, pole)
      if (a !== b) expect(onShoulder.clone().sub(s).normalize().dot(pole.clone().normalize())).toBeCloseTo(1, 6)
    }
  })
})

describe('the carried jar through the change of carry, owned as PlaceLife owns it', () => {
  it('glTF body: rises from the hand to the head as a lift, the hand and the jar never jumping or flipping', async () => {
    const t = await trace({ body: 'gltf' })
    expect(Math.max(...steps(t.jar))).toBeLessThan(STEP_BAR)
    expect(Math.max(...steps(t.wrist))).toBeLessThan(STEP_BAR)
    expect(Math.max(...steps(t.mount))).toBeLessThan(STEP_BAR)
    expect(Math.max(...turns(t.jarTurn))).toBeLessThan(TURN_BAR)
    // the wrist's own turn, not only the jar's: past its first 30 % the jar
    // stands upright whatever the wrist does, so a flipping wrist would hide
    expect(Math.max(...turns(t.wristTurn))).toBeLessThan(TURN_BAR)
    // it was at the hip, and it ends on the head
    expect(t.jar[FULL_AT - 1].y).toBeLessThan(1)
    expect(t.jar[t.jar.length - 1].y).toBeGreaterThan(t.crown.y)
    // the rise from hip to head takes a natural while: its middle 80 % spans
    // at least 0.4 s, four times the ~6 frames of the pop
    expect(riseFrames(t.jar)).toBeGreaterThanOrEqual(24)
    // the left hand — the one the jar hangs in — lifts it, from the first frame
    const lifting = t.steady.slice(FULL_AT + 1, FULL_AT + 50)
    expect(lifting.every((s) => s?.arm === 'left')).toBe(true)
  }, 120_000)

  it('glTF body, the jar arm raised in a gesture at the lift: that hand still lifts the jar, never the other (review finding 3)', async () => {
    const t = await trace({ body: 'gltf', leftBusy: true })
    const lifting = t.steady.slice(FULL_AT + 1, FULL_AT + 50)
    expect(lifting.every((s) => s?.arm === 'left')).toBe(true)
    expect(Math.max(...steps(t.jar, FULL_AT))).toBeLessThan(STEP_BAR)
    expect(Math.max(...turns(t.jarTurn, FULL_AT))).toBeLessThan(TURN_BAR)
    // and in the lift's last frame that hand is at the jar it carried up (its
    // rim grip, not across the head); after the lift the busy arm goes back to
    // its gesture and the free right hand steadies the jar, as for any load
    const last = FULL_AT + Math.floor(balance.waterJarLiftSeconds * FPS) - 1
    expect(t.mount[last].distanceTo(t.jar[last])).toBeLessThan(0.3)
    expect(t.jar[last].y).toBeGreaterThan(t.crown.y - 0.05)
  }, 120_000)

  it('glTF body without the lift input: the steadying hand comes in over the clips\' hand-over as before', async () => {
    const t = await trace({ body: 'gltf', lift: false })
    const k = t.steady.findIndex((s, i) => i > FULL_AT && (s?.weight ?? 0) >= 1)
    // the steadying hand does arrive (findIndex's -1 would pass the bound below)
    expect(k).toBeGreaterThan(FULL_AT)
    expect(k - FULL_AT).toBeLessThanOrEqual(Math.ceil(VILLAGER_GLTF.transitionSeconds * FPS) + 2)
  }, 120_000)

  it('primitive body: the jar rises from the hand onto the head over the same eased lift (review finding 1)', async () => {
    const t = await trace({ body: 'primitive' })
    expect(Math.max(...steps(t.jar))).toBeLessThan(STEP_BAR)
    expect(Math.max(...turns(t.jarTurn))).toBeLessThan(TURN_BAR)
    expect(t.jar[t.jar.length - 1].y).toBeGreaterThan(t.crown.y)
    expect(riseFrames(t.jar)).toBeGreaterThanOrEqual(24)
  }, 120_000)
})
