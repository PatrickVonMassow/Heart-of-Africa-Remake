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
import { CAPTURE_SECTORS, SECTOR_H_FOV_DEG, BAND_V_FOV_DEG, sectorYaw } from './panoramaMath'

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
  if (current) {
    current.target.dispose()
    current = null
  }
  const width = SECTOR_PX * CAPTURE_SECTORS
  const target = new THREE.RenderTarget(width, SECTOR_PX, {
    // The band is sampled as a plain color texture on the horizon cylinder.
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  })
  // Near plane 3: close terrain belongs to the settlement's own scene, but
  // nearby landmarks must stay in (Giza stands ~4 units west of Cairo); the
  // oversized symbolic dressing is hidden anyway.
  const cam = new THREE.PerspectiveCamera(BAND_V_FOV_DEG, Math.tan((SECTOR_H_FOV_DEG / 2) * (Math.PI / 180)) / Math.tan((BAND_V_FOV_DEG / 2) * (Math.PI / 180)), 3, 900)
  cam.position.set(pos.x, pos.y, pos.z)

  const prevTarget = renderer.getRenderTarget()
  // Sky and weather stay out of the band (alpha-0 clear): the place scene's
  // own sky dome shows through above the captured terrain.
  const prevBackground = scene.background
  scene.background = null
  const prevClearAlpha = renderer.getClearAlpha()
  renderer.setClearAlpha(0)
  // Viewport/scissor are renderer state, not target state: capture leaves
  // them on the last sector unless restored, blacking out the main frame.
  const prevViewport = new THREE.Vector4()
  const prevScissor = new THREE.Vector4()
  renderer.getViewport(prevViewport)
  renderer.getScissor(prevScissor)
  const prevScissorTest = renderer.getScissorTest()
  for (let k = 0; k < CAPTURE_SECTORS; k++) {
    cam.rotation.set(0, sectorYaw(k), 0)
    cam.updateMatrixWorld()
    renderer.setRenderTarget(target)
    renderer.setViewport(k * SECTOR_PX, 0, SECTOR_PX, SECTOR_PX)
    renderer.setScissor(k * SECTOR_PX, 0, SECTOR_PX, SECTOR_PX)
    renderer.setScissorTest(true)
    renderer.render(scene, cam)
  }
  renderer.setRenderTarget(prevTarget)
  scene.background = prevBackground
  renderer.setClearAlpha(prevClearAlpha)
  renderer.setViewport(prevViewport)
  renderer.setScissor(prevScissor)
  renderer.setScissorTest(prevScissorTest)
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
      // Flip vertically (readback is bottom-up).
      for (let y = 0; y < SECTOR_PX; y++) {
        const src = (SECTOR_PX - 1 - y) * width * 4
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
