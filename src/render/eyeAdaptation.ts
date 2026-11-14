// GPU side of the first-person eye adaptation (design.md §2.7). The mean
// luminance of the HDR scene frame is measured on the GPU — a 128² luminance
// render target whose mip chain averages it down to one texel — and a 1²
// feedback pass steps the adapted exposure toward its target every frame
// (ping-pong, the upstream AfterImageNode pattern). Nothing is read back to the
// CPU. The formulas mirror render/exposureControl.ts, whose unit test is the
// reference; the uniforms follow balance.exposure live (debug menu, §21.2).
//
// The consumer multiplies the pre-tone-mapping image by the node itself = adapted
// exposure / the renderer's fixed toneMappingExposure, so the renderer's own
// exposure (src/App.tsx) is never touched — the bird's-eye view, which never
// builds this node, keeps it unchanged.

import {
  FloatType,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RenderTarget,
  RendererUtils,
  TempNode,
  type NodeBuilder,
  type NodeFrame,
  type WebGPURenderer,
} from 'three/webgpu'
import {
  clamp,
  exp,
  float,
  Fn,
  ivec2,
  log,
  luminance,
  max,
  pow,
  rtt,
  select,
  texture,
  textureLoad,
  uniform,
  vec2,
  vec4,
} from 'three/tsl'
import type { Node } from 'three/webgpu'
import { LUMINANCE_FLOOR, TAU_FLOOR, type ExposureParams } from './exposureControl'

/** Side of the luminance target; its mip chain ends in one texel at LUM_TOP_LEVEL. */
export const LUM_SIZE = 128
export const LUM_TOP_LEVEL = Math.log2(LUM_SIZE)

const _quadMesh = new QuadMesh()
let _rendererState: ReturnType<typeof RendererUtils.resetRendererState> | undefined

type ColorNode = Node & { rgb: Node }

function feedbackTarget() {
  return new RenderTarget(1, 1, {
    type: FloatType, // half-float steps would stall a slow approach near its target
    depthBuffer: false,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    generateMipmaps: false,
  })
}

export class EyeAdaptationNode extends TempNode {
  readonly params = {
    base: uniform(1.05),
    min: uniform(0.62),
    max: uniform(1.45),
    key: uniform(0.55),
    compensation: uniform(0.6),
    ceiling: uniform(12),
    toBright: uniform(0.35),
    toDark: uniform(2.8),
    maxStep: uniform(0.1),
  }
  /** Frame step in seconds, from the R3F clock (honours the F8 pinned clock). */
  readonly dt = uniform(0)
  /** 1 for the first frame: start at `base` instead of an uninitialised texel. */
  readonly reset = uniform(1)
  /** The renderer's fixed toneMappingExposure the factor is relative to. */
  readonly rendererExposure = uniform(1.05)

  private readonly lumRtt
  private readonly targets = [feedbackTarget(), feedbackTarget()]
  private read = 0
  private readonly prevNode
  private readonly outNode
  private readonly material = new NodeMaterial()

  constructor(color: ColorNode) {
    super('float')
    this.updateBeforeType = NodeUpdateType.FRAME
    // Per-texel cap before averaging: a lone disc cannot own the mean.
    const lum = clamp(luminance(color.rgb), float(0), this.params.ceiling)
    this.lumRtt = rtt(vec4(lum, 0, 0, 1), LUM_SIZE, LUM_SIZE, {
      type: HalfFloatType,
      depthBuffer: false,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
    })
    this.prevNode = texture(this.targets[0].texture)
    this.outNode = texture(this.targets[1].texture)
    this.material.name = 'EyeAdaptation'
  }

  /** Pull the live balance values and the frame step into the uniforms. */
  sync(p: ExposureParams, dtSeconds: number, rendererExposure: number) {
    const u = this.params
    u.base.value = p.base
    u.min.value = p.min
    u.max.value = p.max
    u.key.value = p.keyLuminance
    u.compensation.value = p.compensation
    u.ceiling.value = p.sampleCeiling
    u.toBright.value = p.toBrightSeconds
    u.toDark.value = p.toDarkSeconds
    u.maxStep.value = p.maxStepSeconds
    this.dt.value = Number.isFinite(dtSeconds) ? dtSeconds : 0
    this.rendererExposure.value = rendererExposure
  }

  updateBefore(frame: NodeFrame): undefined {
    const renderer = frame.renderer as unknown as WebGPURenderer
    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState as ReturnType<typeof RendererUtils.resetRendererState>)
    const write = 1 - this.read
    this.prevNode.value = this.targets[this.read].texture
    this.outNode.value = this.targets[write].texture
    _quadMesh.material = this.material
    _quadMesh.name = 'EyeAdaptation'
    renderer.setMRT(null)
    renderer.setRenderTarget(this.targets[write])
    _quadMesh.render(renderer)
    RendererUtils.restoreRendererState(renderer, _rendererState)
    this.read = write
    this.reset.value = 0
    return undefined
  }

  setup(builder: NodeBuilder) {
    const u = this.params
    const lumRtt = this.lumRtt
    const prevNode = this.prevNode
    const reset = this.reset
    const dtU = this.dt
    // Mirrors exposureTarget/exposureStep (render/exposureControl.ts).
    const adapt = Fn(() => {
      const floor = float(LUMINANCE_FLOOR)
      const mean = lumRtt.sample(vec2(0.5, 0.5)).level(float(LUM_TOP_LEVEL)).r
      const lum = clamp(mean, floor, max(u.ceiling, floor))
      const target = clamp(u.base.mul(pow(max(u.key, floor).div(lum), u.compensation)), u.min, u.max).toVar()
      const prev = textureLoad(prevNode, ivec2(0, 0)).r
      // NaN fails every comparison, so an uninitialised texel restarts at base.
      const from = select(prev.greaterThan(0), clamp(prev, u.min, u.max), u.base).toVar()
      const tau = max(select(target.lessThan(from), u.toBright, u.toDark), float(TAU_FLOOR))
      const dt = clamp(dtU, float(0), u.maxStep)
      const k = float(1).sub(exp(dt.negate().div(tau)))
      const next = clamp(exp(log(from).add(log(target).sub(log(from)).mul(k))), u.min, u.max)
      const out = select(reset.greaterThan(0.5), clamp(u.base, u.min, u.max), next)
      return vec4(out, 0, 0, 1)
    })
    this.material.fragmentNode = adapt().context((builder as unknown as { getSharedContext: () => Record<string, unknown> }).getSharedContext())
    this.material.needsUpdate = true
    // The node's own value: the multiplier on the pre-tone-mapping image,
    // adapted / renderer exposure. Using the node (not a bare texture read)
    // keeps it in the consumer's graph, so updateBefore runs every frame.
    return textureLoad(this.outNode, ivec2(0, 0)).r.div(max(this.rendererExposure, float(1e-3)))
  }

  dispose() {
    for (const t of this.targets) t.dispose()
    this.material.dispose()
    const r = this.lumRtt as unknown as {
      renderTarget?: { dispose: () => void }
      _quadMesh?: { material: { dispose: () => void } }
    }
    r.renderTarget?.dispose()
    r._quadMesh?.material.dispose()
    super.dispose()
  }
}

export function eyeAdaptation(color: ColorNode) {
  return new EyeAdaptationNode(color)
}
