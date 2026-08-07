// Travel-scene panorama capture (design.md §2.5, point 81): the moment the
// traveller enters a settlement, the still-mounted travel scene renders a
// 360° horizon band from the settlement's position into a texture. The
// first-person view then shows the REAL surroundings — the mountains, water
// courses and dressing that lie there in the bird's-eye view, direction-true
// — instead of a genericized relief. The capture survives the scene switch
// (the render target lives on the renderer); entering without a live travel
// scene (loading a snapshot, a ferry passage) leaves no capture and the
// place scene falls back to the geometry backdrop.

import * as THREE from 'three/webgpu'
import {
  CAPTURE_SECTORS,
  SECTOR_H_FOV_DEG,
  BAND_V_FOV_DEG,
  bandWidth,
  sectorRect,
  sectorYaw,
} from './panoramaMath'
import { withSynchronousPipelineCompile, type PipelineBackend } from '../../render/asyncPipelines'

export interface PanoramaCapture {
  placeId: string
  seed: number
  texture: THREE.Texture
  target: THREE.RenderTarget
  /** DEV: per-sector fraction of water-ish pixels (verification hook). */
  waterFractions?: number[]
}

const SECTOR_PX = 768
let current: PanoramaCapture | null = null

/** The two targets the capture works with, allocated ONCE per session.
 *
 *  They used to be a fresh band target per capture, which cost twice: the
 *  render-target count grew with every settlement visit (the point-295 leak
 *  invariant saw +4 per maasai visit), and a fresh target is a fresh RENDER
 *  CONTEXT, so every shot needed a fresh set of pipelines that could never be
 *  warm — see withSynchronousPipelineCompile. Kept for the session, the second
 *  capture and every later one draw from the warm set. */
let targets: { band: THREE.RenderTarget; sector: THREE.RenderTarget; width: number } | null = null

function captureTargets(renderer: THREE.WebGPURenderer): NonNullable<typeof targets> {
  if (targets) return targets
  const width = bandWidth(SECTOR_PX)
  // The band is only ever copied INTO (never rendered into), so it needs no
  // depth buffer; it is sampled as a plain color texture on the horizon
  // cylinder. One clearing pass allocates it, so the first copy has a texture.
  const band = new THREE.RenderTarget(width, SECTOR_PX, {
    depthBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  })
  const prevTarget = renderer.getRenderTarget()
  const prevClearAlpha = renderer.getClearAlpha()
  renderer.setClearAlpha(0)
  renderer.setRenderTarget(band)
  renderer.clear()
  renderer.setRenderTarget(prevTarget)
  renderer.setClearAlpha(prevClearAlpha)
  // The square shot each sector is rendered into before it is copied across.
  const sector = new THREE.RenderTarget(SECTOR_PX, SECTOR_PX, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  })
  targets = { band, sector, width }
  return targets
}

/** Whether the capture's targets are resident — a lever of the render-leak
 *  signature (src/render/renderLeak.ts), since they are taken once and kept. */
export function panoramaCaptureTargetsAllocated(): boolean {
  return targets !== null
}

export function getPanoramaCapture(placeId: string, seed: number): PanoramaCapture | null {
  return current && current.placeId === placeId && current.seed === seed ? current : null
}

export function hasPanoramaCapture(placeId: string, seed: number): boolean {
  return getPanoramaCapture(placeId, seed) !== null
}

/** Water-pixel heuristic for the DEV fraction: darker saturated blue (the
 *  river ink ~rgb(44,98,133), mean ~92) — the bright sky blue near the
 *  horizon (mean 150+) must NOT count, or every capture reads as water. */
function isWaterPixel(r: number, g: number, b: number): boolean {
  const mean = (r + g + b) / 3
  return b > 60 && b > r * 1.15 && b >= g && g > r * 0.8 && mean < 140
}

/**
 * Render the 360° horizon band around `pos` (travel-world units) into the
 * capture target. Called from the travel scene's frame loop while the scene
 * is still mounted; synchronous apart from the DEV pixel readback.
 */
export function capturePanorama(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  pos: { x: number; y: number; z: number },
  placeId: string,
  seed: number,
  hideNames: string[] = [],
  /** Far plane (point 335): must not reach past the streamed terrain window,
   *  or the unbounded water sheets bake a floating grey horizon strip. The
   *  caller derives it with `panoramaCaptureFar`. */
  far = 900,
): void {
  // The traveller figure and the entered place's own marker stand AT the
  // capture point — hide them for the shot, restore afterwards.
  const hidden: THREE.Object3D[] = []
  scene.traverse((o) => {
    if (hideNames.includes(o.name) && o.visible) {
      o.visible = false
      hidden.push(o)
    }
  })
  current = null
  const { band: target, sector, width } = captureTargets(renderer)
  // Near plane 3: close terrain belongs to the settlement's own scene, but
  // nearby landmarks must stay in (Giza stands ~4 units west of Cairo); the
  // oversized symbolic dressing is hidden anyway. The FAR plane is bounded by
  // the streamed terrain window (point 335, panoramaCaptureFar): past it only
  // the unbounded water sheets would draw, floating with no ground behind them.
  const cam = new THREE.PerspectiveCamera(BAND_V_FOV_DEG, Math.tan((SECTOR_H_FOV_DEG / 2) * (Math.PI / 180)) / Math.tan((BAND_V_FOV_DEG / 2) * (Math.PI / 180)), 3, far)
  cam.position.set(pos.x, pos.y, pos.z)

  const prevTarget = renderer.getRenderTarget()
  // Sky and weather stay out of the band (alpha-0 clear): the place scene's
  // own sky dome shows through above the captured terrain.
  const prevBackground = scene.background
  scene.background = null
  const prevClearAlpha = renderer.getClearAlpha()
  renderer.setClearAlpha(0)
  // The shot compiles its pipelines SYNCHRONOUSLY (point 545): a capture has no
  // next frame in which a not-yet-ready object could appear, and the renderer
  // silently skips such objects — asynchronously it drew nothing at all.
  withSynchronousPipelineCompile(
    (renderer as unknown as { backend?: PipelineBackend }).backend,
    () => {
      for (let k = 0; k < CAPTURE_SECTORS; k++) {
        cam.rotation.set(0, sectorYaw(k), 0)
        cam.updateMatrixWorld()
        // One square shot per sector, then copied into its band column: the
        // per-sector renderer viewport this used to use is ignored when the
        // renderer draws into a target (sectorRect).
        renderer.setRenderTarget(sector)
        renderer.render(scene, cam)
        const rect = sectorRect(k, SECTOR_PX)
        renderer.copyTextureToTexture(
          sector.texture,
          target.texture,
          new THREE.Box2(new THREE.Vector2(0, 0), new THREE.Vector2(rect.width, rect.height)),
          new THREE.Vector2(rect.x, rect.y),
        )
      }
    },
  )
  renderer.setRenderTarget(prevTarget)
  scene.background = prevBackground
  renderer.setClearAlpha(prevClearAlpha)
  for (const o of hidden) o.visible = true

  current = { placeId, seed, texture: target.texture, target }

  if (import.meta.env.DEV) {
    // Dump hook: returns the whole band as a data URL (debugging/verification).
    ;(window as unknown as Record<string, unknown>).__panoCaptureForDump = async () => {
      const buf = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, SECTOR_PX)) as Uint8Array
      const cnv = document.createElement('canvas')
      cnv.width = width
      cnv.height = SECTOR_PX
      const ctx = cnv.getContext('2d')
      if (!ctx) return 'no-ctx'
      const img = ctx.createImageData(width, SECTOR_PX)
      // Readback row order is BACKEND-dependent (point 227): the WebGL2 path
      // returns rows bottom-up (GL convention, flip for the image), the WebGPU
      // path top-down (origin top-left, copy as is). Only this DEV readback
      // differs — the rendered band samples the texture identically on both.
      const topDown = (renderer.backend as { isWebGPUBackend?: boolean } | undefined)?.isWebGPUBackend === true
      for (let y = 0; y < SECTOR_PX; y++) {
        const src = (topDown ? y : SECTOR_PX - 1 - y) * width * 4
        img.data.set(buf.subarray(src, src + width * 4), y * width * 4)
      }
      ctx.putImageData(img, 0, 0)
      return cnv.toDataURL('image/png')
    }
    // Per-sector water fraction for the headless verification (async readback).
    void (async () => {
      try {
        const fractions: number[] = []
        for (let k = 0; k < CAPTURE_SECTORS; k++) {
          const buf = (await renderer.readRenderTargetPixelsAsync(
            target,
            k * SECTOR_PX,
            0,
            SECTOR_PX,
            SECTOR_PX,
          )) as Uint8Array
          let water = 0
          const total = SECTOR_PX * SECTOR_PX
          for (let i = 0; i < total; i++) {
            if (isWaterPixel(buf[i * 4], buf[i * 4 + 1], buf[i * 4 + 2])) water++
          }
          fractions.push(water / total)
        }
        if (current && current.placeId === placeId) {
          current.waterFractions = fractions
          const w = window as unknown as Record<string, unknown>
          // Slice k holds compass [N, W, S, E][k] (panoramaMath, point 90).
          w.__placePanorama = {
            placeId,
            waterFractions: fractions,
            compass: { n: fractions[0], w: fractions[1], s: fractions[2], e: fractions[3] },
          }
        }
      } catch {
        // Readback is a verification aid only; the capture itself stands.
      }
    })()
  }
}
