import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DepthTexture, DirectionalLight, PerspectiveCamera, RenderPipeline, RenderTarget, Scene, Texture, WebGPURenderer } from 'three/webgpu'
import GodraysNode from 'three/addons/tsl/display/GodraysNode.js'
import { publishGodraysLight } from './godraysLight'
import { velocity } from 'three/tsl'
import { Effects } from './Effects'
import { createScenePass } from './scenePass'
import { useUi } from '../state/ui'
import { useGame } from '../state/store'
import { EyeAdaptationNode } from './eyeAdaptation'

const fiber = vi.hoisted(() => ({ state: {} as Record<string, unknown>, frame: () => {} }))
vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: Record<string, unknown>) => unknown) => selector(fiber.state),
  useFrame: (callback: () => void) => { fiber.frame = callback },
}))
vi.mock('./environment', () => ({ createEnvironmentTexture: () => new Texture() }))

const initialUi = useUi.getState()
const currentPass = () => (window as unknown as { __scenePass: ReturnType<typeof createScenePass> }).__scenePass

const initialMode = useGame.getState().mode
afterEach(() => {
  useUi.setState(initialUi, true)
  useGame.setState({ mode: initialMode })
})

function mountEffects() {
  const gl = new WebGPURenderer({ forceWebGL: true })
  vi.spyOn(gl, 'render').mockImplementation(() => {})
  fiber.state = { gl, scene: new Scene(), camera: new PerspectiveCamera() }
  // All graph construction and disposal is real; jsdom cannot draw a frame.
  const renderPipeline = vi.spyOn(RenderPipeline.prototype, 'render').mockImplementation(() => {})
  const view = render(<Effects />)
  fiber.frame()
  const processing = () => {
    fiber.frame()
    return renderPipeline.mock.instances.at(-1)!
  }
  return { ...view, processing }
}

describe('post chain ownership', () => {
  it.each(['low', 'medium', 'high'] as const)('%s: toggles preserve the scene target and fragment outputs', (detailLevel) => {
    useUi.setState({ detailLevel, traaEnabled: true, ssaoEnabled: true })
    const view = mountEffects()
    const pass = currentPass()
    const target = pass.renderTarget
    const mrt = pass.getMRT()
    const textures = [...target.textures]
    const disposeScene = vi.spyOn(pass, 'dispose')
    for (const traaEnabled of [false, true, false, true, false]) {
      act(() => useUi.getState().setTraaEnabled(traaEnabled))
      expect(currentPass()).toBe(pass)
      expect(currentPass().renderTarget).toBe(target)
      expect(currentPass().getMRT()).toBe(mrt)
      expect(currentPass().renderTarget.textures).toEqual(textures)
      expect(textures.map((texture) => texture.name)).toEqual(['output', 'normal', 'velocity'])
      expect(disposeScene).not.toHaveBeenCalled()
    }
    view.unmount()
    expect(disposeScene).toHaveBeenCalledTimes(1)
    expect(currentPass()).toBeUndefined()
  })

  it('disposes each replaced post chain while preserving the scene through LOW and back', () => {
    useUi.setState({ detailLevel: 'high', traaEnabled: true, ssaoEnabled: true })
    const view = mountEffects()
    const pass = currentPass()
    const disposeScene = vi.spyOn(pass, 'dispose')
    const clearJitter = vi.spyOn(fiber.state.camera as PerspectiveCamera, 'clearViewOffset')
    const clearVelocity = vi.spyOn(velocity, 'setProjectionMatrix')
    const transitions = [
      { traaEnabled: false }, { traaEnabled: true }, { ssaoEnabled: false },
      { detailLevel: 'low' as const },
      { detailLevel: 'medium' as const }, { detailLevel: 'high' as const },
    ]
    for (const state of transitions) {
      const previous = view.processing()
      const disposePost = vi.spyOn(previous, 'dispose')
      act(() => useUi.setState(state))
      const next = view.processing()
      // Medium -> high with AO already off need not rebuild anything.
      expect(disposePost).toHaveBeenCalledTimes(next === previous ? 0 : 1)
      expect(currentPass()).toBe(pass)
      expect(disposeScene).not.toHaveBeenCalled()
    }
    expect(clearJitter).toHaveBeenCalled()
    expect(clearVelocity).toHaveBeenCalledWith(null)
    const finalPost = vi.spyOn(view.processing(), 'dispose')
    view.unmount()
    expect(finalPost).toHaveBeenCalledTimes(1)
    expect(disposeScene).toHaveBeenCalledTimes(1)
  })

  it('draws the scene before post on every frame across effect and graphics transitions', () => {
    const view = mountEffects()
    const gl = fiber.state.gl as WebGPURenderer
    const order: string[] = []
    vi.mocked(gl.render).mockImplementation((object) => {
      expect(object).toBe(fiber.state.scene)
      order.push('scene')
    })
    vi.mocked(RenderPipeline.prototype.render).mockImplementation(function (this: { outputNode: unknown }) {
      order.push('post')
      expect(order).toEqual(['scene', 'post'])
      // The real output ContextNode disables upstream automatic jitter: the
      // frame owner now brackets scene + post, including the first-ever frame.
      const output = this.outputNode as unknown as { getFlowContextData: () => Record<string, unknown> }
      expect(output.getFlowContextData().renderPipeline).toBeNull()
    })
    for (const state of [
      { traaEnabled: false }, { traaEnabled: true }, { detailLevel: 'high' as const },
      { ssaoEnabled: false }, { detailLevel: 'low' as const },
      { detailLevel: 'medium' as const }, { traaEnabled: false },
    ]) {
      act(() => useUi.setState(state))
      order.length = 0
      fiber.frame()
      expect(order).toEqual(['scene', 'post'])
    }
    view.unmount()
  })

  it('counts a committed pipeline rebuild, which is what the browser suite waits on', () => {
    const builds = () => (window as unknown as { __postBuilds?: number }).__postBuilds ?? 0
    const view = mountEffects()
    const afterMount = builds()
    expect(afterMount).toBeGreaterThan(0)
    act(() => useUi.setState({ traaEnabled: false }))
    expect(builds()).toBe(afterMount + 1)
    // A write that leaves the EFFECTIVE value alone rebuilds nothing, which is
    // why the suite only waits when the effective value changed.
    act(() => useUi.setState({ traaEnabled: false }))
    expect(builds()).toBe(afterMount + 1)
    view.unmount()
  })

  it.each(['scene', 'camera'] as const)('releases the scene pass when its %s changes', (field) => {
    const view = mountEffects()
    const previous = currentPass()
    const dispose = vi.spyOn(previous, 'dispose')
    fiber.state[field] = field === 'scene' ? new Scene() : new PerspectiveCamera()
    view.rerender(<Effects />)
    expect(currentPass()).not.toBe(previous)
    expect(dispose).toHaveBeenCalledTimes(1)
    const finalDispose = vi.spyOn(currentPass(), 'dispose')
    view.unmount()
    expect(finalDispose).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  // design.md §2.7: the adapting exposure is first-person only, at high only;
  // the bird's-eye view never builds it, whatever the level.
  const features = () =>
    (window as unknown as { __postFeatures?: { eyeAdaptation: boolean; sunGlare: boolean } }).__postFeatures
  it.each([
    ['place', 'high', true], ['place', 'medium', false], ['place', 'low', false],
    ['travel', 'high', false], ['travel', 'medium', false],
  ] as const)('%s at %s: eye adaptation and glare in the chain = %s', (mode, detailLevel, expected) => {
    useGame.setState({ mode })
    useUi.setState({ detailLevel })
    const view = mountEffects()
    expect(features()?.eyeAdaptation).toBe(expected)
    expect(features()?.sunGlare).toBe(expected)
    view.unmount()
  })

  it('switching to the bird\'s-eye view drops the adaptation node and frees it', () => {
    useGame.setState({ mode: 'place' })
    useUi.setState({ detailLevel: 'high' })
    const dispose = vi.spyOn(EyeAdaptationNode.prototype, 'dispose')
    const view = mountEffects()
    expect(features()?.eyeAdaptation).toBe(true)
    act(() => useGame.setState({ mode: 'travel' }))
    expect(features()?.eyeAdaptation).toBe(false)
    expect(dispose).toHaveBeenCalledTimes(1)
    view.unmount()
    dispose.mockRestore()
  })

  // Point 345: the sun shafts march the settlement sun's shadow map — first
  // person only, high only, and only once that map exists.
  const shadowedSun = () => {
    const light = new DirectionalLight()
    light.castShadow = true
    const map = new RenderTarget(4, 4)
    map.depthTexture = new DepthTexture(4, 4)
    light.shadow.map = map as typeof light.shadow.map
    return light
  }
  const shaftsAfterPoll = () => {
    act(() => fiber.frame())
    return (window as unknown as { __postFeatures?: { godrays: boolean } }).__postFeatures?.godrays
  }
  afterEach(() => publishGodraysLight(null))
  it.each([
    ['place', 'high', true, true], ['place', 'medium', true, false], ['place', 'low', true, false],
    ['travel', 'high', true, false], ['place', 'high', false, false],
  ] as const)('%s at %s (debug toggle %s): sun shafts in the chain = %s', (mode, detailLevel, godraysEnabled, expected) => {
    useGame.setState({ mode })
    useUi.setState({ detailLevel, godraysEnabled })
    publishGodraysLight(shadowedSun())
    const view = mountEffects()
    expect(shaftsAfterPoll()).toBe(expected)
    view.unmount()
  })

  it('builds no shafts before the sun has a shadow map, and frees them on leaving', () => {
    useGame.setState({ mode: 'place' })
    useUi.setState({ detailLevel: 'high' })
    const light = shadowedSun()
    const map = light.shadow.map
    light.shadow.map = null as unknown as typeof map
    publishGodraysLight(light)
    const dispose = vi.spyOn(GodraysNode.prototype, 'dispose')
    const view = mountEffects()
    expect(shaftsAfterPoll()).toBe(false)
    light.shadow.map = map
    expect(shaftsAfterPoll()).toBe(true)
    act(() => useGame.setState({ mode: 'travel' }))
    expect(shaftsAfterPoll()).toBe(false)
    expect(dispose).toHaveBeenCalledTimes(1)
    view.unmount()
    dispose.mockRestore()
  })
})
