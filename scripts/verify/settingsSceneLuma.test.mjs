import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  SETTINGS_VIEWPORT, SETTINGS_SCENE_CROP, SETTINGS_SCENE_LUMA_MIN, settingsSceneLuma,
} from './settingsSceneLuma.mjs'

const { width, height } = SETTINGS_VIEWPORT
const crop = SETTINGS_SCENE_CROP
const intersects = (a, b) => a.left < b.left + b.width && a.left + a.width > b.left &&
  a.top < b.top + b.height && a.top + a.height > b.top

async function frame(scene, outside = 255, channels = 3) {
  const pixels = Buffer.alloc(width * height * channels, outside)
  for (let y = crop.top; y < crop.top + crop.height; y++) {
    for (let x = crop.left; x < crop.left + crop.width; x++) {
      const offset = (y * width + x) * channels
      for (let c = 0; c < 3; c++) pixels[offset + c] = scene[c]
      if (channels === 4) pixels[offset + 3] = 255
    }
  }
  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer()
}

describe('settings scene brightness', () => {
  it('pins the crop outside the measured interface geometry at 1440x900', () => {
    expect(SETTINGS_VIEWPORT).toEqual({ width: 1440, height: 900 })
    expect(crop).toEqual({ left: 144, top: 180, width: 864, height: 540 })
    const interfaceRects = [
      { left: 0, top: 0, width: 1440, height: 35 }, // HUD
      { left: 12, top: 46, width: 53, height: 22 }, // FPS
      { left: 396, top: 56, width: 648, height: 45 }, // compatibility notice
      { left: 12, top: 95, width: 161, height: 38 }, // lake label
      { left: 1126, top: 557, width: 314, height: 64 }, // landmark label
      { left: 984, top: 777, width: 394, height: 72 }, // landmark label
      { left: 0, top: 858, width: 1440, height: 42 }, // bottom controls
    ]
    for (const rect of interfaceRects) expect(intersects(crop, rect)).toBe(false)
    expect(crop.left + crop.width).toBeLessThanOrEqual(width)
    expect(crop.top + crop.height).toBeLessThanOrEqual(height)
  })

  it('rejects the measured dark scene even with every pixel outside the crop white', async () => {
    const png = await frame([13, 11, 8])
    const fullStats = await sharp(png).stats()
    expect(fullStats.channels[0].mean).toBeGreaterThan(100)
    const mean = await settingsSceneLuma(png)
    expect(mean).toBeCloseTo(10.6667, 4)
    expect(mean).toBeLessThan(SETTINGS_SCENE_LUMA_MIN)
  })

  it('accepts a drawn scene independently of interface brightness or PNG alpha', async () => {
    for (const channels of [3, 4]) {
      for (const outside of [0, 255]) {
        const mean = await settingsSceneLuma(await frame([129, 129, 129], outside, channels))
        expect(mean).toBe(129)
        expect(mean).toBeGreaterThan(SETTINGS_SCENE_LUMA_MIN)
      }
    }
    expect(SETTINGS_SCENE_LUMA_MIN).toBe(40)
  })

  it('refuses an unmeasured viewport instead of silently including interface pixels', async () => {
    const png = await sharp({ create: {
      width: 1280, height: 720, channels: 3, background: 'white',
    } }).png().toBuffer()
    await expect(settingsSceneLuma(png)).rejects.toThrow('requires 1440x900 pixels; got 1280x720')
  })
})
