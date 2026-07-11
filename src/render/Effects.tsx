// Post-processing pipeline (design.md §2 "Licht- und Post-Processing-
// Pipeline"): scene pass with MRT normals → GTAO (screen-space ambient
// occlusion) → optional TRAA (temporal anti-aliasing) → bloom → color
// grading (warm highlights, gentle saturation) → subtle vignette. Tone
// mapping (ACES) and output color space are applied by THREE.RenderPipeline
// itself. Also installs the procedural IBL environment on the scene.
//
// TRAA is the default since its manual WebGPU check passed (CLAUDE.md §7.1
// pt. 32); the debug toggle (design.md §21.3) can switch back to the render
// pass' MSAA samples. TRAA requires MSAA off and a velocity MRT target, so
// the scene pass is built per mode.
//
// Screen-space reflections (design.md §2.7) sit behind a default-off debug
// toggle and run on the WebGPU backend only — three r185's SSRNode emits
// invalid GLSL on WebGL 2 (upstream), so on the fallback the toggle is inert
// and reflections stay with the IBL environment.
//
// OPEN: true water refraction (design.md §2) is not in the POC pipeline.

import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { metalness, mix, mrt, normalView, output, pass, roughness, smoothstep, vec2, vec3, vec4, velocity, viewportUV } from 'three/tsl'
import { ao } from 'three/addons/tsl/display/GTAONode.js'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { traa } from 'three/addons/tsl/display/TRAANode.js'
import { ssr } from 'three/addons/tsl/display/SSRNode.js'
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
  const ssrEnabled = useUi((s) => s.ssrEnabled)
  const webglFallback = useUi((s) => s.webglFallback)
  // Hard backend gate: SSRNode compiles to invalid GLSL on WebGL 2 (upstream,
  // three r185), so the toggle is inert on the fallback.
  const ssrActive = ssrEnabled && !webglFallback

  const post = useMemo(() => {
    // The toggle rebuilds the whole pipeline, and three's RenderPipeline
    // disposes only its own quad material — every pass created here must be
    // collected and disposed with it, or each rebuild leaks its render
    // targets until the GPU device is lost (black screen after a few
    // toggles on real hardware).
    const disposables: Array<{ dispose: () => void }> = []

    // TRAA jitters the camera and resolves temporally, so MSAA must be off
    // and the pass must write per-pixel velocities. SSR additionally needs
    // per-pixel metalness/roughness targets. The samples MUST be set
    // explicitly: an omitted option inherits renderer.samples (4, from
    // antialias: true), and a multisampled depth breaks TRAA's history copy
    // with per-frame WebGPU validation errors.
    const scenePass = pass(scene, camera, { samples: traaEnabled ? 0 : 4 })
    disposables.push(scenePass)
    // Dev hook for the headless verification (CLAUDE.md §7.2).
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__scenePass = scenePass
    }
    scenePass.setMRT(
      mrt({
        output,
        normal: normalView,
        ...(traaEnabled ? { velocity } : {}),
        // Combined attachment as in the upstream SSR example.
        ...(ssrActive ? { metalrough: vec2(metalness, roughness) } : {}),
      }),
    )
    const color = scenePass.getTextureNode('output')
    const depth = scenePass.getTextureNode('depth')
    const normal = scenePass.getTextureNode('normal')

    // Screen-space ambient occlusion (single-channel target → use .r).
    const aoPass = ao(depth, normal, camera)
    disposables.push(aoPass)
    // GTAO's dispose() misses its internal noise DataTexture.
    const aoNoise = (aoPass as unknown as { _noiseNode?: { value?: { dispose: () => void } } })
      ._noiseNode?.value
    disposables.push({ dispose: () => aoNoise?.dispose() })
    let aoComposed = color.mul(aoPass.getTextureNode().r)

    // Screen-space reflections (WebGPU only, design.md §2.7): mirror trace
    // with roughness-driven blur, dielectrics included so the water (a
    // non-metal) picks up shore and terrain reflections on top of its IBL
    // sky. Added before the temporal resolve so TRAA settles the SSR noise.
    if (ssrActive) {
      const metalRough = scenePass.getTextureNode('metalrough')
      // The upstream declaration types the inputs as plain value nodes, but
      // the implementation samples them at arbitrary UVs — the pass texture
      // nodes are exactly what it needs (as in the upstream example).
      const ssrNode = ssr(
        color,
        depth as unknown as THREE.Node<'float'>,
        normal as unknown as THREE.Node<'vec3'>,
        {
          metalnessNode: metalRough.r,
          roughnessNode: metalRough.g,
          reflectNonMetals: true,
          camera,
        },
      )
      disposables.push(ssrNode)
      // Placeholder tuning for the game's world scale (10 units/degree,
      // bird's-eye camera ~40 units up); calibrated in the manual check loop.
      ssrNode.maxDistance.value = 40
      ssrNode.thickness.value = 0.5
      ssrNode.resolutionScale = 0.5
      // Additive reflection contribution (alpha untouched); the SSR alpha
      // channel carries the ray distance, not opacity.
      aoComposed = aoComposed.add(vec4(ssrNode.rgb, 0))
    }

    // Temporal resolve over the AO-composed image, so the accumulation also
    // settles the (jittered) AO term instead of re-aliasing it afterwards.
    // Consumed via its pass texture node (like GTAO/bloom); the casts cover
    // getTextureNode() and the RTT internals missing from the upstream
    // declaration file.
    let composed = aoComposed
    if (traaEnabled) {
      const traaNode = traa(aoComposed, depth, scenePass.getTextureNode('velocity'), camera)
      disposables.push(traaNode)
      // traa() wraps the composed input in an RTT node, which owns a
      // full-resolution render target of its own and has no dispose().
      const rtt = traaNode.beautyNode as unknown as {
        renderTarget?: { dispose: () => void }
        _quadMesh?: { material: { dispose: () => void } }
      }
      disposables.push({
        dispose: () => {
          rtt.renderTarget?.dispose()
          rtt._quadMesh?.material.dispose()
        },
      })
      // TRAA's dispose() misses its previous-depth texture; the initial
      // placeholder is swapped out after the first frame, so free both.
      const prevDepthNode = (
        traaNode as unknown as { _previousDepthNode?: { value?: { dispose: () => void } } }
      )._previousDepthNode
      const initialPrevDepth = prevDepthNode?.value
      disposables.push({
        dispose: () => {
          initialPrevDepth?.dispose()
          if (prevDepthNode?.value !== initialPrevDepth) prevDepthNode?.value?.dispose()
        },
      })
      composed = (
        traaNode as unknown as { getTextureNode: () => typeof aoComposed }
      ).getTextureNode()
    }

    // Bloom on bright highlights (sun glints, fire, snow).
    const bloomNode = bloom(composed, 0.25, 0.35, 0.88)
    disposables.push(bloomNode)
    const withBloom = composed.add(bloomNode)

    // Color grading: gentle saturation lift and warm highlights.
    const luma = withBloom.rgb.dot(vec3(0.2126, 0.7152, 0.0722))
    const saturated = mix(vec3(luma, luma, luma), withBloom.rgb, 1.07)
    const graded = saturated.mul(vec3(1.03, 1.0, 0.965))

    // Subtle vignette that keeps the map view readable (design.md §2).
    const d = viewportUV.sub(0.5).length()
    const vignette = smoothstep(0.95, 0.45, d).mul(0.18).add(0.82)

    // RenderPipeline is r185's name for the former PostProcessing (which now
    // only lives on as a deprecation alias that warns on construction).
    const processing = new THREE.RenderPipeline(gl)
    processing.outputNode = graded.mul(vignette)

    const dispose = () => {
      processing.dispose()
      for (const d of disposables) d.dispose()
      // A teardown can land between the TRAA jitter set and its per-frame
      // clear: never leave the shared camera or the module-level velocity
      // node with a stale jitter/projection.
      if (traaEnabled) {
        ;(camera as THREE.PerspectiveCamera).clearViewOffset()
        velocity.setProjectionMatrix(null)
      }
    }
    return { processing, dispose }
  }, [gl, scene, camera, traaEnabled, ssrActive])

  useEffect(() => {
    return () => {
      post.dispose()
    }
  }, [post])

  // Priority render: replaces R3F's default render with the post pipeline.
  useFrame(() => {
    post.processing.render()
  }, 1)

  return null
}
