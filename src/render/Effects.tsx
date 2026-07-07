// Post-processing pipeline (design.md §2 "Lighting and post-processing
// pipeline"): scene pass with MRT (color, normals, metalness, velocity) →
// GTAO (screen-space ambient occlusion) → SSR (screen-space reflections,
// masked to metallic surfaces — the ocean water raises its metalness for
// this) → TRAA (temporal anti-aliasing from the velocity buffer) → bloom →
// color grading (warm highlights, gentle saturation) → subtle vignette.
// Tone mapping (ACES) and output color space are applied by
// THREE.PostProcessing itself. Also installs the procedural IBL environment.

import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { convertToTexture, metalness, mix, mrt, normalView, output, pass, roughness, smoothstep, vec3, velocity, viewportUV } from 'three/tsl'
import { ao } from 'three/addons/tsl/display/GTAONode.js'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { ssr } from 'three/addons/tsl/display/SSRNode.js'
import { traa } from 'three/addons/tsl/display/TRAANode.js'
import { createEnvironmentTexture } from './environment'

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

  const post = useMemo(() => {
    // TRAA and SSR run on the WebGPU backend (the design target, §3): TRAA
    // replaces the render-pass MSAA there. The WebGL 2 escape hatch keeps
    // MSAA + GTAO + bloom + the water refraction — three r185's SSRNode
    // emits invalid GLSL on that backend (OPEN, upstream), and TRAA's cost
    // is out of proportion on fallback-grade hardware.
    const backend = (gl as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend
    const isWebGPU = backend?.isWebGPUBackend === true

    const scenePass = pass(scene, camera, { samples: isWebGPU ? 1 : 4 })
    const targets: Record<string, unknown> = { output, normal: normalView, metal: metalness, rough: roughness }
    if (isWebGPU) targets.velocity = velocity
    scenePass.setMRT(mrt(targets as Parameters<typeof mrt>[0]))
    const color = scenePass.getTextureNode('output')
    const depth = scenePass.getTextureNode('depth')
    const normal = scenePass.getTextureNode('normal')
    const metal = scenePass.getTextureNode('metal')
    const rough = scenePass.getTextureNode('rough')

    // Screen-space ambient occlusion (single-channel target → use .r).
    const aoPass = ao(depth, normal, camera)
    // SSRNode samples its color and normal inputs itself, so both must be
    // texture nodes (the published typing asks for vec3, hence the cast).
    const composed = isWebGPU
      ? convertToTexture(color.mul(aoPass.getTextureNode().r))
      : color.mul(aoPass.getTextureNode().r)

    // Screen-space reflections (design.md §2), masked via metalness: the
    // ocean surface raises its metalness so shores mirror sky and terrain.
    const withSsr = isWebGPU
      ? (() => {
          const ssrPass = ssr(composed, depth, normal as unknown as never, {
            metalnessNode: metal.r,
            roughnessNode: rough.r,
            camera,
          })
          return composed.add(ssrPass.rgb.mul(ssrPass.a).mul(0.6))
        })()
      : composed

    // Temporal anti-aliasing from the velocity buffer (design.md §2).
    const taaPass = isWebGPU
      ? traa(withSsr, depth, scenePass.getTextureNode('velocity'), camera)
      : withSsr

    // Bloom on bright highlights (sun glints, fire, snow).
    const withBloom = taaPass.add(bloom(taaPass, 0.25, 0.35, 0.88))

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
  }, [gl, scene, camera])

  useEffect(() => {
    // Dev hook for the headless verification (CLAUDE.md §7.2).
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    const backend = (gl as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend
    const isWebGPU = backend?.isWebGPUBackend === true
    w.__postFx = { gtao: true, ssr: isWebGPU, traa: isWebGPU, msaa: !isWebGPU, bloom: true }
    return () => {
      delete w.__postFx
    }
  }, [post, gl])

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
