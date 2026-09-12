// Post-processing pipeline (design.md §2 "Licht- und Post-Processing-
// Pipeline"): scene pass with MRT normals → GTAO (screen-space ambient
// occlusion) → optional TRAA (temporal anti-aliasing) → bloom → color
// grading (warm highlights, gentle saturation) → subtle vignette. Tone
// mapping (ACES) and output color space are applied by THREE.RenderPipeline
// itself. Also installs the procedural IBL environment on the scene.
//
// TRAA is the default since its manual WebGPU check passed (CLAUDE.md §7.1
// pt. 32); the debug toggle (design.md §21.3) disables temporal resolve.
// All modes share a single-sampled half-float scene pass with velocity. Only
// the downstream post chain is rebuilt when an effect is toggled.
//
// Screen-space reflections were integrated (design.md §2.7) but removed again
// after the manual WebGPU check (CLAUDE.md pt. 32): with the bird's-eye camera
// never reaching grazing angles and the first-person scenes having no water or
// gloss, no in-game situation makes SSR read, so it was dead weight.
//
// OPEN: true water refraction (design.md §2) is not in the POC pipeline.

import { useEffect, useLayoutEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { float, max, mix, smoothstep, vec3, velocity, viewportUV } from 'three/tsl'
import { ao } from 'three/addons/tsl/display/GTAONode.js'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { traa } from 'three/addons/tsl/display/TRAANode.js'
import { createEnvironmentTexture } from './environment'
import { createScenePass } from './scenePass'
import { createSceneFrame } from './sceneFrame'
import { useUi, effectiveSsao, effectiveTraa, effectiveBloom } from '../state/ui'

/** Sun direction used for the IBL texture (matches the scene suns closely). */
const IBL_SUN: [number, number, number] = [0.5, 0.65, 0.36]

/** Minimum screen-space AO factor: occlusion darkens a surface to at most this
 *  fraction, so the deepest crevice reads as a dark grey rather than crushing an
 *  already-shadowed ground to flat black (point 106). */
const AO_FLOOR = 0.4

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

  // The effective render levers (design.md §21, F9 / point 276 part B): the
  // graphics level drives SSAO/TRAA/bloom through these selectors — SSAO on only
  // at high, TRAA+bloom off only at low — without touching the player's own debug
  // flags. Post is the single biggest GPU lever on the user's real hardware
  // (~38 %, point 277).
  const traaEnabled = useUi(effectiveTraa)
  const ssaoEnabled = useUi(effectiveSsao)
  const bloomEnabled = useUi(effectiveBloom)

  // Keep the render target and MRT identity across every graphics toggle. A
  // changed fragment-output layout relinks scene/shadow materials as well as
  // the post chain, leaving an empty scene behind a long first-use backlog.
  const scenePass = useMemo(() => createScenePass(scene, camera), [scene, camera])
  const sceneFrame = useMemo(() => createSceneFrame(scenePass, gl), [scenePass, gl])
  useLayoutEffect(() => {
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__scenePass = scenePass
    }
    return () => {
      scenePass.dispose()
      if (import.meta.env.DEV) {
        const hooks = window as unknown as Record<string, unknown>
        if (hooks.__scenePass === scenePass) delete hooks.__scenePass
      }
    }
  }, [scenePass])

  const post = useMemo(() => {
    // RenderPipeline disposes only its quad material. Own every downstream
    // pass here; the shared scene pass has a separate lifetime above.
    const disposables: Array<{ dispose: () => void }> = []

    const color = scenePass.getTextureNode('output')
    const depth = scenePass.getTextureNode('depth')
    const normal = scenePass.getTextureNode('normal')

    // Screen-space ambient occlusion (single-channel target → use .r). Off in
    // the touch quality preset (point 84), where the AO pass is skipped
    // entirely so it costs nothing on mobile GPUs.
    // Typed as the mul result (Node<vec4>) so the AO-off branch (plain color)
    // and the AO-on branch (color × occlusion) share one type.
    let aoComposed: ReturnType<typeof color.mul> = color
    if (ssaoEnabled) {
      const aoPass = ao(depth, normal, camera)
      disposables.push(aoPass)
      // GTAO's dispose() misses its internal noise DataTexture.
      const aoNoise = (aoPass as unknown as { _noiseNode?: { value?: { dispose: () => void } } })
        ._noiseNode?.value
      disposables.push({ dispose: () => aoNoise?.dispose() })
      // Floor the occlusion so it can never multiply an already-shadowed
      // surface down to FLAT BLACK: the GTAO term over-occludes at the base of
      // a large near wall (worse on the WebGPU backend, which the WebGL 2
      // headless verification cannot exercise — user report of a black blob on
      // the settlement ground, same GTAO-blackening family as point 101).
      // Clamped to AO_FLOOR the deepest crevice reads as a dark grey, not void.
      aoComposed = color.mul(max(float(AO_FLOOR), aoPass.getTextureNode().r))
    }

    // Temporal resolve over the AO-composed image, so the accumulation also
    // settles the (jittered) AO term instead of re-aliasing it afterwards.
    // Consumed via its pass texture node (like GTAO/bloom); the casts cover
    // getTextureNode() and the RTT internals missing from the upstream
    // declaration file.
    let composed = aoComposed
    let temporal: ReturnType<typeof sceneFrame.bindTemporal> | null = null
    if (traaEnabled) {
      // TRAA reads its beauty input from a render target and copies it into its
      // history buffer. When SSAO is on, aoComposed is an operator node
      // (color × occlusion), so traa()'s own convertToTexture materialises it
      // in a dedicated RTT. With SSAO OFF (point 276's medium/low) aoComposed
      // is the scene pass's OWN output texture; handed straight in, TRAA read
      // and copied the live scene-pass target and churned/leaked its
      // history+resolve render targets a texture per rebuild on WebGPU. Force
      // the beauty to an operator node so it takes the SAME dedicated-RTT path
      // the SSAO-on branch (and pre-276 main) always did — the `.mul(1)` is a
      // no-op tint whose only purpose is that materialisation; the RTT it
      // yields is disposed as `traaNode.beautyNode.renderTarget` below.
      const beauty = ssaoEnabled ? aoComposed : color.mul(float(1))
      const traaNode = traa(beauty, depth, scenePass.getTextureNode('velocity'), camera)
      temporal = sceneFrame.bindTemporal(traaNode)
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

    // Bloom on bright highlights (sun glints, fire, snow). Off in Low Details
    // (point 276): the pass is skipped entirely so it costs nothing on a weak
    // GPU, and the composite passes the plain image straight through.
    let withBloom = composed
    if (bloomEnabled) {
      const bloomNode = bloom(composed, 0.25, 0.35, 0.88)
      disposables.push(bloomNode)
      withBloom = composed.add(bloomNode)
    }

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
    // The frame owner applies jitter before the eager scene draw and clears it
    // after post. Disable TRAA's lazy RenderPipeline jitter callbacks so neither
    // the first frame nor a rebuild applies a second jitter or advances twice.
    processing.outputNode = graded.mul(vignette).context({ renderPipeline: null })

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
    return { processing, dispose, render: () => sceneFrame.render(processing, temporal) }
  }, [gl, scenePass, sceneFrame, camera, traaEnabled, ssaoEnabled, bloomEnabled])

  // useLayoutEffect (not useEffect): free the SUPERSEDED pipeline synchronously
  // at commit, the instant a rebuild replaces it. A passive effect defers the
  // teardown past the browser paint and, under load, past when a fast TRAA
  // toggle is next observed, so the old pipeline's render targets linger
  // alongside the new one's — a spurious per-toggle spike in the leak gate.
  // Commit-time disposal keeps renderer.info.memory.textures deterministic.
  useLayoutEffect(() => {
    // A committed rebuild is the condition the browser suite waits on instead
    // of a wall-clock pause: it counts up exactly when the new pipeline is live.
    if (import.meta.env.DEV) {
      const hooks = window as unknown as { __postBuilds?: number }
      hooks.__postBuilds = (hooks.__postBuilds ?? 0) + 1
    }
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
