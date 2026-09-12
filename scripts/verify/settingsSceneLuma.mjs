import sharp from 'sharp'

export const SETTINGS_VIEWPORT = Object.freeze({ width: 1440, height: 900 })

// Measured on 1105-graphics-level-low.png and 69-traa-on.png: the HUD ends
// at y=35, the notice at y=100, the lake label at y=133, and the bottom
// controls start at y=858. The landmark labels start at x=1126/y=557 and
// x=984/y=777. This patch includes terrain and the traveller, outside them all.
export const SETTINGS_SCENE_CROP = Object.freeze({ left: 144, top: 180, width: 864, height: 540 })

// RGB channel mean, on the crop above in the tracked reference frames:
// black scene 10.67; drawn scene 128.73. A bar of 40 leaves ample lighting
// headroom while rejecting the dark clear colour even with a bright interface.
export const SETTINGS_SCENE_LUMA_MIN = 40

export async function settingsSceneLuma(png) {
  const input = sharp(png)
  const { width, height } = await input.metadata()
  if (width !== SETTINGS_VIEWPORT.width || height !== SETTINGS_VIEWPORT.height) {
    throw new Error(`Settings scene crop requires 1440x900 pixels; got ${width}x${height}`)
  }
  // sharp.stats() reads the INPUT, ignoring a preceding extract(). Materialise
  // the crop first, so this cannot silently become a whole-frame check again.
  const pixels = await input.extract(SETTINGS_SCENE_CROP).removeAlpha().raw().toBuffer()
  return pixels.reduce((sum, channel) => sum + channel, 0) / pixels.length
}
