// Post-processing pipeline (design.md §2 "Licht- und Post-Processing-
// Pipeline"): scene pass with MRT normals → optional GTAO (screen-space
// ambient occlusion) → optional TRAA (temporal anti-aliasing) → optional bloom
// → color grading (warm tint, gentle saturation) → subtle vignette. Tone
// mapping (ACES) and output color space are applied by THREE.RenderPipeline
// itself. Also installs the procedural IBL environment on the scene.
//
// TRAA is the default since its manual WebGPU check passed (CLAUDE.md §7.1
// pt. 32); the low graphics level and the debug toggle (design.md §21.3)
// disable temporal resolve.
// All modes share a single-sampled half-float scene pass with velocity. Only
// the downstream post chain is rebuilt when an effect is toggled.
//
// Screen-space reflections were integrated (design.md §2.7) but removed again
// after the manual WebGPU check (CLAUDE.md pt. 32): with the bird's-eye camera
// never reaching grazing angles and the first-person scenes then having no
// water or gloss, no in-game situation made SSR read, so it was dead weight.
//
// OPEN: true water refraction (design.md §2) is not in the POC pipeline.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { color as tslColor, float, max, mix, smoothstep, uniform, vec3, vec4, velocity, viewportUV } from 'three/tsl'
import { ao } from 'three/addons/tsl/display/GTAONode.js'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { traa } from 'three/addons/tsl/display/TRAANode.js'
import { godrays } from 'three/addons/tsl/display/GodraysNode.js'
import { createEnvironmentTexture } from './environment'
import { useSceneSun } from './sceneSun'
import { createScenePass } from './scenePass'
import { createSceneFrame } from './sceneFrame'
import { useUi, effectiveSsao, effectiveTraa, effectiveBloom, effectiveEyeAdaptation, effectiveSunGlare, effectiveGodrays } from '../state/ui'
import { useGame } from '../state/store'
import { balance } from '../config/balance'
import { eyeAdaptation, type EyeAdaptationNode } from './eyeAdaptation'
import { createSunGlare } from './sunGlare'
import { godraysShadowTexture, readyGodraysLight } from './godraysLight'


/** Minimum screen-space AO factor: occlusion never darkens a surface below this
 *  fraction, so the deepest crevice reads as a dark grey rather than crushing an
 *  already-shadowed ground to flat black (point 106). */
const AO_FLOOR = 0.4

export function Effects() {
  const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  // Image-based lighting: procedural HDR environment, baked from the one scene
  // sun (design.md §2.7) and re-baked only when that sun is re-derived (date,
  // latitude, balance) — never per frame.
  const iblSun = useSceneSun().disc
  // The glare projects the same sun every frame without rebuilding the chain.
  const sunDirRef = useRef(iblSun)
  sunDirRef.current = iblSun
  useEffect(() => {
    const tex = createEnvironmentTexture(iblSun)
    scene.environment = tex
    scene.environmentIntensity = 0.45
    return () => {
      scene.environment = null
      tex.dispose()
    }
  }, [scene, iblSun])

  // The effective render levers (design.md §21, F9 / point 276 part B): the
  // graphics level drives SSAO/TRAA/bloom through these selectors — SSAO on only
  // at high, TRAA+bloom off only at low — without touching the player's own debug
  // flags. Post is the single biggest GPU lever on the user's real hardware
  // (~38 %, point 277).
  const traaEnabled = useUi(effectiveTraa)
  const ssaoEnabled = useUi(effectiveSsao)
  const bloomEnabled = useUi(effectiveBloom)
  // Eye adaptation (design.md §2.7) is a FIRST-PERSON effect: the bird's-eye
  // travel scene never builds it and keeps the renderer's fixed exposure — a
  // map whose brightness breathes while driving is the readability loss §2.7
  // forbids. A rule, not a cost choice: do not unify the two scenes.
  const firstPerson = useGame((s) => s.mode) === 'place'
  const eyeEnabled = useUi(effectiveEyeAdaptation) && firstPerson
  // Sun glare (design.md §2.7): built on the bloom, first person only.
  const glareEnabled = useUi(effectiveSunGlare) && bloomEnabled && firstPerson
  // Sun shafts (design.md §2.7): first person only — screen-space shafts need
  // the light in the frame, and the bird's-eye camera (~60° down, sun <= ~37°
  // up) never has it there. They march the settlement sun's shadow map, so the
  // pass is built only once that light and its map exist (render/godraysLight.ts);
  // the per-frame poll below rebuilds the chain when either appears or changes.
  const godraysWanted = useUi(effectiveGodrays) && firstPerson
  const [godraysLight, setGodraysLight] = useState<THREE.DirectionalLight | null>(null)
  const [godraysMap, setGodraysMap] = useState<unknown>(null)
  const godraysLive = godraysWanted ? godraysLight : null

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

    // Screen-space ambient occlusion (single-channel target → use .r). On only
    // at the high level (point 276) and off in the touch preset (point 84); when
    // off the AO pass is skipped entirely so it costs nothing.
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

    // Sun shafts: the upstream pass's lit-air term (grey, half resolution) in
    // the sun's tint, added BEFORE TRAA and bloom so the temporal resolve
    // settles its raymarch noise and the shafts bloom with the sun.
    let shafts: ReturnType<typeof godrays> | null = null
    const shaftsIntensity = uniform(balance.godrays.intensity)
    if (godraysLive) {
      shafts = godrays(depth, camera, godraysLive)
      disposables.push(shafts)
      const term = shafts.getTextureNode().r.mul(shaftsIntensity)
      aoComposed = aoComposed.add(vec4(tslColor(godraysLive.color).mul(term), 0))
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
      const beauty = ssaoEnabled || shafts ? aoComposed : color.mul(float(1))
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
    let glare: ReturnType<typeof createSunGlare> | null = null
    if (bloomEnabled) {
      const bloomNode = bloom(composed, 0.25, 0.35, 0.88)
      disposables.push(bloomNode)
      withBloom = composed.add(bloomNode)
      // Glare: lens-flare ghosts over the bloom plus a glare star, gated by a
      // depth occlusion test at the projected sun (render/sunGlare.ts).
      if (glareEnabled) {
        // r185 has getTextureNode() at runtime; its declaration omits it.
        const bloomTexture = (bloomNode as unknown as { getTextureNode: () => typeof depth }).getTextureNode()
        glare = createSunGlare(bloomTexture, depth)
        disposables.push(glare)
        withBloom = withBloom.add(glare.node)
      }
    }

    // Color grading: gentle saturation lift and a warm tint over the whole image.
    const luma = withBloom.rgb.dot(vec3(0.2126, 0.7152, 0.0722))
    const saturated = mix(vec3(luma, luma, luma), withBloom.rgb, 1.07)
    const graded = saturated.mul(vec3(1.03, 1.0, 0.965))

    // Subtle vignette that keeps the map view readable (design.md §2).
    const d = viewportUV.sub(0.5).length()
    const vignette = smoothstep(0.95, 0.45, d).mul(0.18).add(0.82)
    let finalImage = graded.mul(vignette)

    // Eye adaptation: the mean luminance of the raw HDR frame drives a bounded,
    // GPU-side exposure (render/eyeAdaptation.ts), applied as a multiplier
    // before the renderer's own tone mapping.
    let adaptation: EyeAdaptationNode | null = null
    if (eyeEnabled) {
      adaptation = eyeAdaptation(color)
      disposables.push(adaptation)
      finalImage = finalImage.mul(adaptation as unknown as ReturnType<typeof float>)
    }

    // RenderPipeline is r185's name for the former PostProcessing (which now
    // only lives on as a deprecation alias that warns on construction).
    const processing = new THREE.RenderPipeline(gl)
    // The frame owner applies jitter before the eager scene draw and clears it
    // after post. Disable TRAA's lazy RenderPipeline jitter callbacks so neither
    // the first frame nor a rebuild applies a second jitter or advances twice.
    processing.outputNode = finalImage.context({ renderPipeline: null })

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
    const size = new THREE.Vector2()
    const render = (dt: number) => {
      adaptation?.sync(balance.exposure, dt, gl.toneMappingExposure)
      if (shafts) {
        const b = balance.godrays
        shafts.density.value = b.density
        shafts.maxDensity.value = b.maxDensity
        shafts.distanceAttenuation.value = b.distanceAttenuation
        shaftsIntensity.value = b.intensity
      }
      if (glare) {
        gl.getDrawingBufferSize(size)
        const sun = glare.sync(camera, sunDirRef.current, balance.sunGlare, size.x / Math.max(size.y, 1))
        // Where the glare is centred this frame (live check, pixels measured there).
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__sunGlare = sun
      }
      sceneFrame.render(processing, temporal)
    }
    return { processing, dispose, render, features: { eyeAdaptation: eyeEnabled, sunGlare: glareEnabled, godrays: shafts !== null } }
    // godraysMap: a new shadow depth texture means a rebuild (the pass captures it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scenePass, sceneFrame, camera, traaEnabled, ssaoEnabled, bloomEnabled, eyeEnabled, glareEnabled, godraysLive, godraysMap])

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
      const hooks = window as unknown as { __postBuilds?: number; __postFeatures?: unknown }
      hooks.__postBuilds = (hooks.__postBuilds ?? 0) + 1
      // Which optional post effects the live chain carries (live checks).
      hooks.__postFeatures = post.features
    }
    return () => {
      post.dispose()
    }
  }, [post])

  // Priority render: replaces R3F's default render with the post pipeline.
  useFrame((_, delta) => {
    // The shafts' light and shadow map appear after the first shadowed draw.
    const light = godraysWanted ? readyGodraysLight() : null
    const map = godraysShadowTexture(light)
    if (light !== godraysLight) setGodraysLight(light)
    if (map !== godraysMap) setGodraysMap(map)
    post.render(delta)
  }, 1)

  return null
}
