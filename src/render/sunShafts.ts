// Sun shafts (design.md §2.7, quality key `godrays`, highest level, settlement
// scenes): the classic screen-space light scattering. A MASK keeps only the
// open sky around the sun's screen position (the sky dome writes no depth, so
// its pixels keep the cleared far depth); a palm crown, a roof edge or a
// minaret in front of the sun cut dark gaps into it. The upstream radialBlur
// smears that mask toward the sun, so every gap becomes a dark wedge and every
// open patch a bright beam converging on the sun — added onto the frame.
//
// Chosen over the upstream GodraysNode (point 345, three picture-checked rounds
// 14.11.2026): its raymarch of the sun's shadow map resolved a palm frond only
// at one or two shadow texels and drew either a uniform veil or silhouette
// seams, never a shaft. Screen uv convention as in sunGlare.ts.

import { Vector2, type Camera, type TextureNode } from 'three/webgpu'
import { convertToTexture, exp, float, Fn, int, min, perspectiveDepthToViewZ, screenUV, step, uniform, vec2, vec3, vec4, type ShaderNodeObject } from 'three/tsl'
import { radialBlur } from 'three/addons/tsl/display/radialBlur.js'
import { SKY_DEPTH_SHARE, sunScreenPosition, type SunScreen } from './sunGlare'

export interface SunShaftParams {
  intensity: number
  maskRadius: number
  brightnessCap: number
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

export function createSunShafts(color: ShaderNodeObject<TextureNode>, depth: TextureNode) {
  const u = {
    sunUv: uniform(new Vector2(0.5, 0.5)),
    fade: uniform(0),
    aspect: uniform(16 / 9),
    near: uniform(0.1),
    far: uniform(2000),
    intensity: uniform(1),
    maskRadius: uniform(0.25),
    brightnessCap: uniform(4),
    decay: uniform(0.96),
  }

  const mask = Fn(() => {
    const viewZ = perspectiveDepthToViewZ(depth.sample(screenUV).r, u.near, u.far)
    const sky = step(u.far.mul(SKY_DEPTH_SHARE), viewZ.negate())
    const d = screenUV.sub(u.sunUv).mul(vec2(u.aspect, 1))
    const r = u.maskRadius.max(1e-4)
    const lobe = exp(d.dot(d).div(r.mul(r)).negate())
    return vec4(min(color.rgb, vec3(u.brightnessCap)).mul(sky.mul(lobe)), 1)
  })
  const maskTex = convertToTexture(mask())

  // radialBlur returns 0.5 * blur + the mask itself; only the blur is wanted.
  const blurred = radialBlur(maskTex, {
    center: u.sunUv,
    weight: float(1),
    decay: u.decay,
    count: int(SHAFT_SAMPLES),
    exposure: u.intensity.mul(2),
  })
  const node = blurred.rgb.sub(maskTex.rgb).max(0).mul(u.fade)

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
      u.brightnessCap.value = params.brightnessCap
      u.decay.value = Math.min(0.999, Math.max(0.5, params.decay))
      return s
    },
    dispose() {
      ;(maskTex as unknown as { dispose?: () => void }).dispose?.()
    },
  }
}
