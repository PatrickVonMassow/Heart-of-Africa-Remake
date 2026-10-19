// @vitest-environment node
// The net man is ONE person in the hull and ashore (point 1387): one Figure,
// one identity, kneeling and standing as states of that body.
import { act, useEffect, useId, useRef } from 'react'
import { advance, createRoot, extend, useFrame } from '@react-three/fiber'
import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import * as THREE from 'three/webgpu'
import type { CanoeNetMan } from './villagerCanoe'

const seen = vi.hoisted(() => ({ mounts: [] as string[], kneeling: [] as boolean[] }))
vi.mock('./placeFigure', () => ({
  // Stands in for the real Figure, which keys its identity by useId the same way.
  Figure({ kneeling }: { kneeling?: { current: boolean } }) {
    const id = useId()
    useEffect(() => {
      seen.mounts.push(id)
    }, [id])
    useFrame(() => {
      seen.kneeling.push(!!kneeling?.current)
    })
    return null
  },
}))

const { FisheryNetMan, placeNetMan } = await import('./fisheryNetMan')
extend(THREE as unknown as Parameters<typeof extend>[0])

const SEAT_Y = -0.3
const ground = () => 0.4

function NetManHarness({ nm, groups }: { nm: CanoeNetMan; groups: THREE.Object3D[] }) {
  const group = useRef<THREE.Group>(null)
  const pose = useRef(null)
  const limbs = useRef(null)
  const kneels = useRef(true)
  const squat = useRef(1)
  useFrame(() => {
    if (!group.current) return
    placeNetMan(group.current, nm, SEAT_Y, ground, kneels, squat)
    groups.push(group.current)
  }, -1)
  return <FisheryNetMan group={group} born={[0, SEAT_Y, 0]} cloth="#aa8855" pose={pose} limbs={limbs} kneels={kneels} squat={squat} />
}

it('stays one figure identity from the hull to the landing and back', async () => {
  const nm: CanoeNetMan = { x: 1, z: 2, yaw: 0.5, inBoat: true, reach: 0, action: 'sit' }
  const groups: THREE.Object3D[] = []
  const root = createRoot({} as HTMLCanvasElement)
  const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
  await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
  await act(async () => root.render(<NetManHarness nm={nm} groups={groups} />))

  act(() => advance(1))
  expect(groups.at(-1)!.position.y).toBe(SEAT_Y)
  // Ashore, squatting to the basket: same group, now on the ground and standing.
  Object.assign(nm, { inBoat: false, action: 'ashore', reach: 1 })
  act(() => advance(2))
  expect(groups.at(-1)!.position.y).toBe(0.4)
  expect(groups.at(-1)!.scale.y).toBeCloseTo(0.72)
  // And back into the hull.
  Object.assign(nm, { inBoat: true, action: 'sit', reach: 0 })
  act(() => advance(3))
  act(() => root.unmount())

  expect(new Set(groups).size).toBe(1)
  expect(seen.mounts).toHaveLength(1)
  expect(seen.kneeling).toEqual([true, false, true])
})

it('the fishery draws the net man through that one figure, never a shore double', () => {
  const source = readFileSync('src/scenes/place/RiverFishery.tsx', 'utf8')
  expect(source.match(/<FisheryNetMan\b/g)).toHaveLength(1)
  expect(source).not.toContain('village-canoe-netman-ashore')
})
