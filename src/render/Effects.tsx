// Post-processing pipeline (design.md §2 "Licht- und Post-Processing-
// Pipeline"): scene pass with MRT normals → GTAO (screen-space ambient
// occlusion) → optional TRAA (temporal anti-aliasing) → bloom → color
// grading (warm highlights, gentle saturation) → subtle vignette. Tone
// mapping (ACES) and output color space are applied by THREE.PostProcessing
// itself. Also installs the procedural IBL environment on the scene.
//
// TRAA sits behind a default-off debug toggle while the manual WebGPU check
// loop runs (CLAUDE.md §7.1 pt. 32); with the toggle off, AA relies on the
// render pass' MSAA samples. TRAA requires MSAA off and a velocity MRT
// target, so the scene pass is built per mode.
//
// OPEN: screen-space reflections/refraction (design.md §2) are not in the
// POC pipeline (three r185's SSRNode emits invalid GLSL on WebGL 2).

import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { mix, mrt, normalView, output, pass, smoothstep, vec3, velocity, viewportUV } from 'three/tsl'
import { ao } from 'three/addons/tsl/display/GTAONode.js'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { traa } from 'three/addons/tsl/display/TRAANode.js'
import { createEnvironmentTexture } from './environment'
import { useUi } from '../state/ui'

/** Sun direction used for the IBL texture (matches the scene suns closely). */
const IBL_SUN: [number, number, number] = [0.5, 0.65, 0.36]

export function Effects() {
  const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  // Image-based lighting: procedural HDR environment.
  useEffect(() => {
    const tex = createEnvironmentTexture(IBL_SUN)
    scene.environment = tex
    scene.environmentIntensity = 0.45
    return () => {
      scene.environment = null
      tex.dispose()
    }
  }, [scene])

  const traaEnabled = useUi((s) => s.traaEnabled)

  const post = useMemo(() => {
    // TRAA jitters the camera and resolves temporally, so MSAA must be off
    // and the pass must write per-pixel velocities.
    const scenePass = traaEnabled ? pass(scene, camera) : pass(scene, camera, { samples: 4 })
    scenePass.setMRT(
      traaEnabled
        ? mrt({ output, normal: normalView, velocity })
        : mrt({ output, normal: normalView }),
    )
    const color = scenePass.getTextureNode('output')
    const depth = scenePass.getTextureNode('depth')
    const normal = scenePass.getTextureNode('normal')

    // Screen-space ambient occlusion (single-channel target → use .r).
    const aoPass = ao(depth, normal, camera)
    const aoComposed = color.mul(aoPass.getTextureNode().r)

    // Temporal resolve over the AO-composed image, so the accumulation also
    // settles the (jittered) AO term instead of re-aliasing it afterwards.
    // Consumed via its pass texture node (like GTAO/bloom); the cast covers
    // getTextureNode() missing from the upstream declaration file.
    const composed = traaEnabled
      ? (
          traa(aoComposed, depth, scenePass.getTextureNode('velocity'), camera) as unknown as {
            getTextureNode: () => typeof aoComposed
          }
        ).getTextureNode()
      : aoComposed

    // Bloom on bright highlights (sun glints, fire, snow).
    const withBloom = composed.add(bloom(composed, 0.25, 0.35, 0.88))

    // Color grading: gentle saturation lift and warm highlights.
    const luma = withBloom.rgb.dot(vec3(0.2126, 0.7152, 0.0722))
    const saturated = mix(vec3(luma, luma, luma), withBloom.rgb, 1.07)
    const graded = saturated.mul(vec3(1.03, 1.0, 0.965))

    // Subtle vignette that keeps the map view readable (design.md §2).
    const d = viewportUV.sub(0.5).length()
    const vignette = smoothstep(0.95, 0.45, d).mul(0.18).add(0.82)

    const processing = new THREE.PostProcessing(gl)
    processing.outputNode = graded.mul(vignette)
    return processing
  }, [gl, scene, camera, traaEnabled])

  useEffect(() => {
    return () => {
      post.dispose()
    }
  }, [post])

  // Priority render: replaces R3F's default render with the post pipeline.
  useFrame(() => {
    post.render()
  }, 1)

  return null
}
