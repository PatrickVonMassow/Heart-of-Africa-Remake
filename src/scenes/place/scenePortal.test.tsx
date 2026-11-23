// @vitest-environment node
// Settlement-hop retention (point 1447). @react-three/fiber 9.6.1's
// createPortal subscribes its mirrored store to the root store and never
// unsubscribes, so every portal ever mounted kept its container — a glTF
// villager's hand bone for the shovel, its crown for a head load — and with the
// bone's parent chain the whole figure: rig, skinned meshes, geometry. Owner
// measurement: ~140 MB of heap per village visited. Three villages are mounted
// and left here; the root store's live subscriptions (and with them anything a
// leaked listener retains) must come back to where they started.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from 'react'
import * as THREE from 'three/webgpu'
import { StrictMode } from 'react'
import { createRoot, extend, useStore, useThree } from '@react-three/fiber'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseVillager, type VillagerAsset } from '../../render/villagerAsset'
import type { FigureLook } from './placeFigureContext'
import { SkinnedFigure } from './skinnedFigure'
import { ScenePortal } from './scenePortal'

extend(THREE as unknown as Parameters<typeof extend>[0])
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PALETTE = ['#3a5a8a', '#8a4a2a', '#c2b090']
let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

type Listener = (s: unknown, p: unknown) => void

/** Counts the root store's live subscriptions and holds each listener weakly. */
function SubscriptionProbe({ into }: { into: { live: number; listeners: Set<Listener> } }) {
  const store = useStore() as unknown as { subscribe: (l: Listener) => () => void; __probed?: boolean }
  if (!store.__probed) {
    store.__probed = true
    const subscribe = store.subscribe.bind(store)
    store.subscribe = (l: Listener) => {
      into.live++
      into.listeners.add(l)
      const off = subscribe(l)
      let done = false
      return () => {
        if (done) return
        done = true
        into.live--
        into.listeners.delete(l)
        off()
      }
    }
  }
  return null
}

describe('settlement figures leave nothing subscribed to the root store', () => {
  it('mounting and leaving three villages of glTF figures with hand and head props keeps the subscriptions flat', async () => {
    const probe = { live: 0, listeners: new Set<Listener>() }
    const scene = new THREE.Group()
    const Village = ({ n, tag }: { n: number; tag: string }) => (
      <primitive object={scene}>
        {Array.from({ length: n }, (_, k) => {
          const look: FigureLook = {
            peopleId: 'bambara',
            drivers: { coldness: 0, harmattan: 0, karif: 0 },
            year: 1890,
            palette: PALETTE,
            radial: 16,
            villager: asset,
          }
          return (
            <group key={`${tag}-${k}`}>
              <SkinnedFigure
                look={look}
                cloth={PALETTE[k % 3]}
                scale={1}
                sex={k % 2 ? 'female' : 'male'}
                age="adult"
                identityKey={`${tag}-${k}`}
                handProp={<mesh name="hand-load" />}
                headProp={<mesh name="head-load" />}
              />
            </group>
          )
        })}
      </primitive>
    )
    const root = createRoot({} as HTMLCanvasElement)
    const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
    await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
    await act(async () => root.render(<SubscriptionProbe into={probe} />))
    const baseline = probe.live

    const after: number[] = []
    for (const tag of ['zulu', 'pedi', 'san']) {
      await act(async () =>
        root.render(
          <>
            <SubscriptionProbe into={probe} />
            <Village n={3} tag={tag} />
          </>,
        ),
      )
      // drawn: each figure carries its shovel, hand and head portals
      const loads: THREE.Object3D[] = []
      scene.traverse((o) => (o.name === 'head-load' || o.name === 'hand-load' || o.name === 'digging-tool') && loads.push(o))
      expect(loads.length).toBe(9)
      await act(async () => root.render(<SubscriptionProbe into={probe} />))
      after.push(probe.live - baseline)
    }
    // Nothing left subscribed after any village: before the fix each village
    // left one listener per portal (3 figures × 3 portals), each pinning a bone.
    expect(after).toEqual([0, 0, 0])
    await act(async () => root.unmount())
  })
})

describe('ScenePortal', () => {
  it('mounts into its container and keeps mirroring the root state, under StrictMode too', async () => {
    const container = new THREE.Group()
    const seen: number[] = []
    const Reader = () => {
      seen.push(useThree((s) => s.size.width))
      return <mesh name="in-portal" />
    }
    const root = createRoot({} as HTMLCanvasElement)
    const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
    await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
    await act(async () =>
      root.render(
        <StrictMode>
          <ScenePortal container={container}>
            <Reader />
          </ScenePortal>
        </StrictMode>,
      ),
    )
    expect(container.getObjectByName('in-portal')).toBeTruthy()
    await act(async () => {
      await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 7, height: 1, top: 0, left: 0 } })
    })
    expect(seen.at(-1)).toBe(7)
    await act(async () => root.unmount())
    expect(container.children).toHaveLength(0)
  })
})
