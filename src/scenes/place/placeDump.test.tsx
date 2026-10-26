// @vitest-environment node
// The bug-report dump carries the place scene's live runtime (bug report
// "KopfInKorb", 21.10.2026): every vignette registered in a mounted test place
// appears in the dump's `place` section with its figures' id, role, world
// position, yaw, phase/action, pose values and crown, and the fishery's entry
// lists both baskets with their holders.
import { act } from 'react'
import * as THREE from 'three/webgpu'
import { advance, createRoot, extend } from '@react-three/fiber'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { setupGeodata } from '../../test/geodata'
import { PLACES } from '../../world/geo'
import { useGame } from '../../state/store'
import { dumpGameState } from '../../state/stateDump'
import { placeDumpProviderIds, placeSection, type PlaceDump } from '../../systems/placeDump'
import { PLACE_RADIUS } from './layout'
import { buildRiverBank, type PlaceRiverBank } from './riverBank'
import { canoeCycleSeconds } from './villagerCanoe'

// A drawn figure as the dump reads it: the outer `inhabitant` group with its
// kneel and lean, a crown 1.6 m up carrying the head load, and the hand load.
vi.mock('./placeFigure', () => ({
  Figure({ kneel, headProp, handProp }: { kneel?: boolean; headProp?: React.ReactNode; handProp?: React.ReactNode }) {
    return (
      <group name="inhabitant" userData={{ dumpKneel: kneel ? 1 : 0 }}>
        <group name="figure-trunk" rotation={[0.1, 0, 0]} />
        <group name="figure-crown" position={[0, 1.6, 0]}>
          {headProp}
        </group>
        <group position={[0.3, 0.8, 0]}>{handProp}</group>
      </group>
    )
  },
}))
vi.mock('../../systems/ambience', async (orig) => ({
  ...(await orig<typeof import('../../systems/ambience')>()),
  playSpeech: () => {},
  playPoundThud: () => {},
}))

const { RiverFishery } = await import('./RiverFishery')
const { Pounder } = await import('./Pounder')
const { PlaceDumpGroup } = await import('./PlaceDumpGroup')
const { Figure } = await import('./placeFigure')
extend(THREE as unknown as Parameters<typeof extend>[0])
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const CLOTH = ['#2a3a6a', '#8a4a2a', '#c2b090', '#5a6a3a', '#7a2a4a']

/** A test place: the riverside fishery, a village pounding pair and a scanned
 *  group of two walkers, one with a basket on her head. */
function TestPlace({ bank }: { bank: PlaceRiverBank }) {
  return (
    <>
      <RiverFishery bank={bank} cloth={CLOTH} seed={7} />
      <Pounder x={6} z={-4} cloth={CLOTH} />
      <PlaceDumpGroup id="test-walkers" kind="walkers">
        <group position={[2, 0, 3]} rotation={[0, 0.5, 0]}>
          <Figure cloth={CLOTH[0]} headProp={<mesh name="head-basket" position={[0, 0.1, 0]} />} />
        </group>
        <group position={[-2, 0, 1]} scale={[1, 0.8, 1]}>
          <Figure cloth={CLOTH[1]} kneel />
        </group>
      </PlaceDumpGroup>
    </>
  )
}

let bank: PlaceRiverBank
let root: ReturnType<typeof createRoot>

beforeAll(async () => {
  // The real bank needs the DEM, whose loader draws into a 2D canvas: the node
  // environment is given just enough of one, for the load only.
  const g = globalThis as unknown as { HTMLCanvasElement?: unknown; document?: unknown }
  class Canvas {
    width = 0
    height = 0
    getContext(): unknown {
      return null
    }
  }
  g.HTMLCanvasElement = Canvas
  g.document = { createElement: () => new Canvas() }
  try {
    await setupGeodata()
  } finally {
    delete g.HTMLCanvasElement
    delete g.document
  }
  // The scenes' dev hooks write onto `window`; node has none.
  vi.stubGlobal('window', {})
  bank = buildRiverBank(PLACES.find((p) => p.id === 'bambara-village')!, PLACE_RADIUS)!
  root = createRoot({} as HTMLCanvasElement)
  const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
  await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
  await act(async () => root.render(<TestPlace bank={bank} />))
  // A few seconds of the place's life, so every frame loop has run.
  for (let i = 1; i <= 90; i++) act(() => advance(i / 30))
})

afterAll(() => {
  act(() => root.unmount())
  vi.unstubAllGlobals()
})

function placeOf(json: string): PlaceDump {
  return (JSON.parse(json) as { place: PlaceDump }).place
}

describe('the place section of the state dump', () => {
  it('lists every registered vignette of the mounted place with its figures fully described', () => {
    const place = placeOf(dumpGameState(useGame.getState(), { generatedAt: '2026-10-26T00:00:00.000Z' }))
    const ids = placeDumpProviderIds()
    expect(ids).toEqual(expect.arrayContaining(['fishery', 'fishery-pounders', 'pounder', 'test-walkers']))
    expect(place.active).toBe(true)
    expect(place.vignettes.map((v) => v.id)).toEqual(ids)
    for (const v of place.vignettes) {
      expect(v.error, v.id).toBeUndefined()
      expect(v.figures.length, v.id).toBeGreaterThan(0)
      for (const f of v.figures) {
        expect(f.id.startsWith(`${v.id}/`), f.id).toBe(true)
        expect(typeof f.role).toBe('string')
        for (const k of ['x', 'y', 'z'] as const) expect(Number.isFinite(f.pos[k]), `${f.id} pos.${k}`).toBe(true)
        expect(Number.isFinite(f.yaw)).toBe(true)
        expect(f).toHaveProperty('phase')
        expect(f).toHaveProperty('action')
        expect(Object.keys(f.pose).sort()).toEqual(['kneel', 'lean', 'squat'])
        expect(f.pose.squat, `${f.id} squat`).not.toBeNull()
        expect(f.pose.kneel, `${f.id} kneel`).not.toBeNull()
        expect(f.head, `${f.id} head`).not.toBeNull()
        // The crown stands over the feet (no figure here lies down).
        expect(f.head!.y, `${f.id} crown over feet`).toBeGreaterThan(f.pos.y)
      }
      for (const o of v.objects) {
        expect(typeof o.holder).toBe('string')
        for (const k of ['x', 'y', 'z'] as const) expect(Number.isFinite(o.pos[k]), `${o.id} pos.${k}`).toBe(true)
      }
    }
  })

  it('names the fishery figures with their phases and both baskets with their holders', () => {
    const fishery = placeOf(dumpGameState(useGame.getState())).vignettes.find((v) => v.id === 'fishery')!
    expect(fishery.figures.map((f) => f.id).sort()).toEqual(['fishery/carrier', 'fishery/griller', 'fishery/netman', 'fishery/paddler'])
    const netman = fishery.figures.find((f) => f.id === 'fishery/netman')!
    expect(netman.phase).toBeTruthy()
    expect(netman.extra).toMatchObject({ inBoat: expect.any(Boolean), reach: expect.any(Number) })
    const carrier = fishery.figures.find((f) => f.id === 'fishery/carrier')!
    expect(carrier.extra).toHaveProperty('clock')
    expect(fishery.state).toHaveProperty('canoe.phase')
    expect(fishery.state).toHaveProperty('canoe.clock')

    const baskets = fishery.objects.filter((o) => o.kind === 'fish-basket')
    expect(baskets.map((b) => b.id).sort()).toEqual(['fishery/basket/0', 'fishery/basket/1'])
  })

  it('names each basket\'s holder exactly as the ring places it, through a whole round of the boat', () => {
    // The holder each ring place must be reported as, and where it must stand.
    const holderOf: Record<string, string> = { netman: 'fishery/netman', carrier: 'fishery/carrier', bank: 'bank', fire: 'fire' }
    const seen = new Set<string>()
    let t = 3
    const limit = t + 2 * canoeCycleSeconds()
    let samples = 0
    while (t < limit && !(seen.has('netman') && seen.has('carrier') && seen.has('bank') && seen.has('fire'))) {
      // 0.1 s frames, the step the scenes clamp to; a dump every second.
      for (let k = 0; k < 10; k++) {
        t += 0.1
        act(() => advance(t))
      }
      const fishery = placeSection(null).vignettes.find((v) => v.id === 'fishery')!
      const sites = (fishery.state as { sites: Record<string, { x: number; z: number }> }).sites
      const baskets = fishery.objects.filter((o) => o.kind === 'fish-basket')
      expect(baskets).toHaveLength(2)
      for (const b of baskets) {
        const at = (b.extra as { at: string }).at
        seen.add(at)
        expect(b.holder, `${b.id} at ${at}`).toBe(holderOf[at])
        const stand = at === 'bank' ? sites.basketSpot : at === 'fire' ? sites.fireBasket : fishery.figures.find((f) => f.id === b.holder)!.pos
        // On the bank two stand side by side for the moment of a swap.
        expect(Math.hypot(b.pos.x - stand.x, b.pos.z - stand.z), `${b.id} at ${at}`).toBeLessThan(at === 'bank' ? 0.5 : 1)
        if (at === 'carrier') expect(b.pos.y - fishery.figures.find((f) => f.id === b.holder)!.pos.y).toBeGreaterThan(1)
      }
      samples++
    }
    expect([...seen].sort()).toEqual(['bank', 'carrier', 'fire', 'netman'])
    expect(samples).toBeGreaterThan(5)
  })

  it('names a scanned figure\'s head load with its holder and the drawn pose values', () => {
    const walkers = placeOf(dumpGameState(useGame.getState())).vignettes.find((v) => v.id === 'test-walkers')!
    expect(walkers.figures.map((f) => f.id)).toEqual(['test-walkers/0', 'test-walkers/1'])
    const [upright, kneeling] = walkers.figures
    expect(upright.yaw).toBeCloseTo(0.5, 3)
    expect(upright.pose).toEqual({ lean: 0.1, squat: 1, kneel: 0 })
    expect(upright.head).toEqual({ x: 2, y: 1.6, z: 3 })
    expect(kneeling.pose.squat).toBeCloseTo(0.8, 3)
    expect(kneeling.pose.kneel).toBe(1)
    expect(walkers.objects).toEqual([
      { id: 'test-walkers/head-basket/0', kind: 'head-basket', holder: 'test-walkers/0', pos: { x: 2, y: 1.7, z: 3 } },
    ])
  })

  it('is deterministic for one runtime state and states what its bounds cut off', () => {
    const at = { generatedAt: '2026-10-26T00:00:00.000Z' }
    expect(dumpGameState(useGame.getState(), at)).toBe(dumpGameState(useGame.getState(), at))
    const cut = placeSection({ x: 2, z: 3 }, { radius: 1, cap: 40 })
    const walkers = cut.vignettes.find((v) => v.id === 'test-walkers')!
    expect(walkers.figures.map((f) => f.id)).toEqual(['test-walkers/0'])
    expect(walkers.counts).toMatchObject({ figures: 2, figuresInRadius: 1, figuresOmitted: 1 })
    expect(cut.bounds).toMatchObject({ radius: 1, capPerList: 40, origin: { x: 2, z: 3 } })
    const capped = placeSection(null, { cap: 1 }).vignettes.find((v) => v.id === 'fishery')!
    expect(capped.figures).toHaveLength(1)
    expect(capped.counts.figuresOmitted).toBe(3)
  })
})

describe('the registry', () => {
  it('drops a vignette from the dump when it unmounts', async () => {
    const r = createRoot({} as HTMLCanvasElement)
    const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
    await r.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
    await act(async () => r.render(<PlaceDumpGroup id="transient" kind="walkers"><Figure cloth="#000" /></PlaceDumpGroup>))
    expect(placeDumpProviderIds()).toContain('transient')
    act(() => r.unmount())
    expect(placeDumpProviderIds()).not.toContain('transient')
  })
})
