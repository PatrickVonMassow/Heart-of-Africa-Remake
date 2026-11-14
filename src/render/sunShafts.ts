// Sun shafts (design.md §2.7, quality key `godrays`, highest level, settlement
// scenes): the classic screen-space light scattering. A MASK keeps only the
// open sky around the sun's screen position (the sky dome writes no depth, so
// its pixels keep the cleared far depth); a palm crown, a roof edge or a
// minaret in front of the sun cut dark gaps into it. The upstream radialBlur
// smears that mask toward the sun. Every ray ends at the sun, so on its own the
// blur averages the bright sky there into a milky veil over the whole frame;
// the same blur of an UNOBSTRUCTED lobe (pure arithmetic, no texture taps) is
// therefore subtracted, keeping `beamShare` of it as lift. What remains is what
// an occluder cuts: dark wedges, with the open gaps between them as beams.
//
// Chosen over the upstream GodraysNode (point 345, three picture-checked rounds
// 14.11.2026): its raymarch of the sun's shadow map resolved a palm frond only
// at one or two shadow texels and drew either a uniform veil or silhouette
// seams, never a shaft. Screen uv convention as in sunGlare.ts.

import { Vector2, Vector3, type Camera, type Node, type TextureNode } from 'three/webgpu'
import { convertToTexture, exp, float, Fn, int, interleavedGradientNoise, Loop, perspectiveDepthToViewZ, screenCoordinate, screenUV, step, uniform, vec2, vec3, vec4 } from 'three/tsl'
import { radialBlur } from 'three/addons/tsl/display/radialBlur.js'
import { SKY_DEPTH_SHARE, sunScreenPosition, type SunScreen } from './sunGlare'

export interface SunShaftParams {
  intensity: number
  maskRadius: number
  beamShare: number
  tint: readonly [number, number, number]
  decay: number
}

/** Radial-blur samples per pixel: the cost knob, fixed at build time. */
export const SHAFT_SAMPLES = 48

/** Weight of a mask pixel by its distance (uv, aspect-corrected) from the sun:
 *  a Gaussian lobe of `radius` (CPU mirror of the TSL below). */
export function shaftMaskWeight(distance: number, radius: number): number {
  const r = Math.max(radius, 1e-4)
  return Math.exp(-(distance * distance) / (r * r))
}

export function createSunShafts(depth: TextureNode) {
  const u = {
    sunUv: uniform(new Vector2(0.5, 0.5)),
    fade: uniform(0),
    aspect: uniform(16 / 9),
    near: uniform(0.1),
    far: uniform(2000),
    intensity: uniform(1),
    maskRadius: uniform(0.25),
    beamShare: uniform(0.15),
    tint: uniform(new Vector3(1, 1, 1)),
    decay: uniform(0.96),
  }

  const lobeAt = (uv: Node<'vec2'>) => {
    const d = uv.sub(u.sunUv).mul(vec2(u.aspect, 1))
    const r = u.maskRadius.max(1e-4)
    return exp(d.dot(d).div(r.mul(r)).negate())
  }

  // Scalar mask: open sky times the lobe (r channel).
  const mask = Fn(() => {
    const viewZ = perspectiveDepthToViewZ(depth.sample(screenUV).r, u.near, u.far)
    const sky = step(u.far.mul(SKY_DEPTH_SHARE), viewZ.negate())
    return vec4(sky.mul(lobeAt(screenUV)), 0, 0, 1)
  })
  const maskTex = convertToTexture(mask())

  // radialBlur returns 0.5 * blur + the mask itself; only the blur is wanted.
  const exposure = float(2)
  const blurred = radialBlur(maskTex, {
    center: u.sunUv,
    weight: float(1),
    decay: u.decay,
    count: int(SHAFT_SAMPLES),
    exposure,
  })
  const skyBlur = (blurred as unknown as ReturnType<typeof vec4>).r.sub(maskTex.r)

  // The same blur over an unobstructed lobe, sample for sample (radialBlur's
  // offsets, noise jitter and weights), so an uncut ray cancels exactly.
  const openBlur = Fn(() => {
    const offset = u.sunUv.sub(screenUV).div(SHAFT_SAMPLES).toConst()
    const uv = screenUV.add(offset.mul(interleavedGradientNoise(screenCoordinate))).toVar()
    const w = float(1).toVar()
    const sum = float(0).toVar()
    Loop({ start: int(0), end: int(SHAFT_SAMPLES), type: 'int', condition: '<' }, () => {
      uv.addAssign(offset)
      sum.addAssign(lobeAt(uv).mul(w))
      w.mulAssign(u.decay)
    })
    return sum.div(SHAFT_SAMPLES).mul(exposure).mul(0.5)
  })()

  const shaft = skyBlur.sub(openBlur.mul(float(1).sub(u.beamShare)))
  const node = vec3(u.tint).mul(shaft).mul(u.intensity).mul(u.fade)

  return {
    node,
    sync(camera: Camera, sunDir: readonly [number, number, number], params: SunShaftParams, aspect: number): SunScreen {
      const s = sunScreenPosition(camera, sunDir)
      u.sunUv.value.set(s.u, s.v)
      u.fade.value = s.fade
      u.aspect.value = aspect > 0 && Number.isFinite(aspect) ? aspect : 1
      const cam = camera as Camera & { near?: number; far?: number }
      u.near.value = cam.near ?? 0.1
      u.far.value = cam.far ?? 2000
      u.intensity.value = params.intensity
      u.maskRadius.value = params.maskRadius
      u.beamShare.value = Math.min(1, Math.max(0, params.beamShare))
      u.tint.value.set(params.tint[0], params.tint[1], params.tint[2])
      u.decay.value = Math.min(0.999, Math.max(0.5, params.decay))
      return s
    },
    dispose() {
      ;(maskTex as unknown as { dispose?: () => void }).dispose?.()
    },
  }
}
