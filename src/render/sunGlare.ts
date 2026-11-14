// The sun's glare (design.md §2.7, highest quality level, settlement scenes):
// the upstream LensflareNode ghosts over the bloom plus a glare star centred
// on the sun, both multiplied by an OCCLUSION TEST — depth taps at the sun's
// projected screen position. A wall or a roof edge in front of the sun writes
// depth there, so the glare dies in the same frame; without that test the
// flare would survive its occluder and read as a sticker on the lens.
//
// Screen convention: uv origin top-left, v down — the convention three's own
// getScreenPosition() and the post passes sample pass textures with (both
// backends); `screenUV` follows it.

import { Camera, Vector2, Vector3, type TextureNode } from 'three/webgpu'
import { atan, cos, exp, float, Fn, perspectiveDepthToViewZ, pow, screenUV, step, uniform, vec2, vec3 } from 'three/tsl'
import { lensflare } from 'three/addons/tsl/display/LensflareNode.js'

export interface SunScreen {
  /** Screen uv of the sun (top-left origin). */
  u: number
  v: number
  /** 1 well inside the frame, falling to 0 at the border and behind the camera. */
  fade: number
}

/** Fraction of the frame over which the glare fades out toward the border. */
export const EDGE_FADE = 0.06
/** Depth-tap ring radius in uv (roughly the visible disc's radius at 50° fov). */
export const TAP_RADIUS = 0.012
/** A tap sees the sky when its depth lies beyond this share of the far plane:
 *  the sky dome writes no depth, so its pixels keep the cleared far depth. */
export const SKY_DEPTH_SHARE = 0.98

const _p = new Vector3()
const _d = new Vector3()

/** Project a world-space sun DIRECTION onto the camera's screen. */
export function sunScreenPosition(camera: Camera, sunDir: readonly [number, number, number]): SunScreen {
  camera.updateMatrixWorld()
  _d.set(sunDir[0], sunDir[1], sunDir[2]).normalize()
  const inFront = _d.clone().transformDirection(camera.matrixWorldInverse).z < 0
  _p.copy(camera.position).addScaledVector(_d, 1000).project(camera)
  const u = _p.x * 0.5 + 0.5
  const v = 0.5 - _p.y * 0.5
  if (!inFront || !Number.isFinite(u) || !Number.isFinite(v)) return { u, v, fade: 0 }
  const inside = Math.min(u, 1 - u, v, 1 - v)
  return { u, v, fade: Math.min(1, Math.max(0, inside / EDGE_FADE)) }
}

/** Unit-disc tap offsets: the centre and a ring of eight. */
const TAPS: Array<[number, number]> = [[0, 0]]
for (let i = 0; i < 8; i++) TAPS.push([Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)])

type Tex = TextureNode

export function createSunGlare(bloomTexture: Tex, depth: Tex) {
  const u = {
    sunUv: uniform(new Vector2(0.5, 0.5)),
    fade: uniform(0),
    aspect: uniform(16 / 9),
    near: uniform(0.1),
    far: uniform(2000),
    starIntensity: uniform(0.9),
    starLength: uniform(0.22),
    ghostIntensity: uniform(0.6),
  }

  const flare = lensflare(bloomTexture, {
    ghostTint: vec3(1.0, 0.86, 0.68),
    threshold: float(0.35),
    ghostSamples: float(5),
    ghostSpacing: float(0.28),
    ghostAttenuationFactor: float(20),
    downSampleRatio: 4,
  })

  const visibility = Fn(() => {
    const centre = u.sunUv
    const acc = float(0).toVar()
    for (const [ox, oy] of TAPS) {
      const tapUv = centre.add(vec2(ox, oy).mul(vec2(float(TAP_RADIUS).div(u.aspect), TAP_RADIUS)))
      const viewZ = perspectiveDepthToViewZ(depth.sample(tapUv).r, u.near, u.far)
      acc.addAssign(step(u.far.mul(SKY_DEPTH_SHARE), viewZ.negate()))
    }
    return acc.div(TAPS.length)
  })

  const glare = Fn(() => {
    const vis = visibility().mul(u.fade).toVar()
    // Glare star: six rays whose colour and strength come from the bloom AT the
    // sun, so a harmattan-red or an overcast-dimmed disc gives a matching star.
    const dv = screenUV.sub(u.sunUv).mul(vec2(u.aspect, 1))
    const r = dv.length()
    const ang = atan(dv.y, dv.x)
    const rays = pow(cos(ang.mul(3)).abs(), float(28))
    const star = rays.mul(exp(r.negate().div(u.starLength.max(1e-3)))).mul(u.starIntensity)
    const sunGlow = bloomTexture.sample(u.sunUv).rgb
    const ghosts = flare.getTextureNode().rgb.mul(u.ghostIntensity)
    return sunGlow.mul(star).add(ghosts).mul(vis)
  })

  return {
    node: glare(),
    flare,
    sync(camera: Camera, sunDir: readonly [number, number, number], params: { starIntensity: number; starLength: number; ghostIntensity: number }, aspect: number) {
      const s = sunScreenPosition(camera, sunDir)
      u.sunUv.value.set(s.u, s.v)
      u.fade.value = s.fade
      u.aspect.value = aspect > 0 && Number.isFinite(aspect) ? aspect : 1
      const cam = camera as Camera & { near?: number; far?: number }
      u.near.value = cam.near ?? 0.1
      u.far.value = cam.far ?? 2000
      u.starIntensity.value = params.starIntensity
      u.starLength.value = params.starLength
      u.ghostIntensity.value = params.ghostIntensity
      return s
    },
    dispose() {
      flare.dispose()
    },
  }
}
