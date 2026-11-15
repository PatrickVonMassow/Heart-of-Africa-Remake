// Walking-hitch regression (docs/perf-1523-findings.md): over a simulated walk
// the scene sun re-derives at every 0.25° latitude step and every day; the
// environment map must be re-baked IN PLACE on the one texture object. A new
// texture per step changed the environment node and rebuilt every lit
// material's program — the ~0.5 s stall per step. Fixed dt 1/60, the benchmark's
// seed and day, savanna start, walking due south and north at travel speed.
import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataTexture, PerspectiveCamera, RenderPipeline, Scene, WebGPURenderer } from 'three/webgpu'
import { Effects } from './Effects'
import { createEnvironmentTexture, updateEnvironmentTexture } from './environment'
import { useGame } from '../state/store'
import { balance } from '../config/balance'
import { latLonToWorld } from '../world/geo'
import { BENCH_DAY, BENCH_DT, BENCH_SEED, BENCH_TRAVEL_SPEED } from '../systems/benchmark'

const fiber = vi.hoisted(() => ({ state: {} as Record<string, unknown>, frame: () => {} }))
vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: Record<string, unknown>) => unknown) => selector(fiber.state),
  useFrame: (callback: () => void) => { fiber.frame = callback },
}))

const initial = useGame.getState()
afterEach(() => useGame.setState(initial, true))

describe('environment map over a simulated walk', () => {
  it('keeps one texture object and re-bakes it in place at every sun step', () => {
    const start = latLonToWorld(-2.5, 34.0)
    useGame.setState({ mode: 'travel', placeId: null, seed: BENCH_SEED, day: BENCH_DAY, pos: { ...useGame.getState().pos, x: start.x, z: start.z } })
    const gl = new WebGPURenderer({ forceWebGL: true })
    vi.spyOn(gl, 'render').mockImplementation(() => {})
    vi.spyOn(RenderPipeline.prototype, 'render').mockImplementation(() => {})
    const scene = new Scene()
    fiber.state = { gl, scene, camera: new PerspectiveCamera() }
    const view = render(<Effects />)
    const tex = scene.environment as DataTexture
    expect(tex).toBeInstanceOf(DataTexture)
    const pmrem0 = tex.pmremVersion
    let sunSteps = 0
    let lastSun = (window as unknown as { __sceneSun?: unknown }).__sceneSun
    const step = BENCH_TRAVEL_SPEED * BENCH_DT
    // 20 s south then 20 s north (2 x 1200 frames, ~224 wu): many latitude
    // steps and, through the day advance, day steps too.
    for (let f = 0; f < 2400; f++) {
      const dir = f < 1200 ? 1 : -1
      act(() => {
        const s = useGame.getState()
        useGame.setState({ pos: { ...s.pos, z: s.pos.z + dir * step }, day: s.day + BENCH_DT / 20 })
      })
      const sun = (window as unknown as { __sceneSun?: unknown }).__sceneSun
      if (sun !== lastSun) {
        sunSteps++
        lastSun = sun
      }
      expect(scene.environment).toBe(tex)
    }
    expect(sunSteps).toBeGreaterThan(40)
    expect(tex.pmremVersion - pmrem0).toBe(sunSteps)
    view.unmount()
    expect(scene.environment).toBeNull()
  })

  it('one in-place re-bake stays within its frame budget', () => {
    const tex = createEnvironmentTexture([0, 1, 0])
    const times: number[] = []
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI
      const t0 = performance.now()
      updateEnvironmentTexture(tex, [Math.cos(a), Math.sin(a), 0.2])
      times.push(performance.now() - t0)
    }
    times.sort((x, y) => x - y)
    expect(times[Math.floor(times.length / 2)]).toBeLessThanOrEqual(balance.travelFrame.envRebakeBudgetMs)
    tex.dispose()
  })
})
