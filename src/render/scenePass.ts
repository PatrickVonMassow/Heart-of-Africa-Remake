import { HalfFloatType, RGBAFormat, type Camera, type Scene } from 'three/webgpu'
import { mrt, normalView, output, pass, velocity } from 'three/tsl'

/** Build the scene MRT with its attachment format and sampling policy together.
 * Half-float MSAA is not supported by every adapter on our two backend lanes.
 * Use single sampling conservatively on both: LOW must not buy a replacement
 * AA pass, and TRAA needs single-sampled depth for its history copy anyway.
 */
export function createScenePass(scene: Scene, camera: Camera) {
  const scenePass = pass(scene, camera, {
    format: RGBAFormat,
    type: HalfFloatType,
    // Three uses 0 for no MSAA. Omitting this inherits renderer.samples (4).
    samples: 0,
  })
  // PassNode clones the output texture's format/type for each MRT attachment.
  // Signed normals/velocities and HDR color therefore all stay half-float.
  scenePass.setMRT(mrt({
    output,
    normal: normalView,
    velocity,
  }))
  // MRTNode ignores outputs without a texture. Allocate velocity even when
  // temporal resolve is off, or the fragment layout still changes on toggle.
  scenePass.getTextureNode('normal')
  scenePass.getTextureNode('velocity')
  return scenePass
}
