// Loads the real DEM (public/geodata/dem.png) into the geodata module for the
// jsdom test layer, so terrain classification (land/ocean/biome) matches the
// browser. Rather than duplicate the samplers, it polyfills only the browser
// primitives loadGeodata() needs (fetch + createImageBitmap + a 2D canvas whose
// getImageData returns the decoded pixels) and then runs the real loadGeodata().
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadGeodata } from '../world/geodata'

let ready: Promise<void> | null = null

/** Load the real elevation dataset once per test module (memoized). */
export function setupGeodata(): Promise<void> {
  if (ready) return ready
  ready = load()
  return ready
}

async function load(): Promise<void> {
  const root = process.cwd()
  const pngBuf = readFileSync(resolve(root, 'public/geodata/dem.png'))
  const metaJson = readFileSync(resolve(root, 'public/geodata/dem.json'), 'utf8')
  const { data, info } = await sharp(pngBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)

  const g = globalThis as unknown as {
    fetch: typeof fetch
    createImageBitmap: typeof createImageBitmap
  }
  const origFetch = g.fetch
  const origBitmap = g.createImageBitmap
  const origGetContext = HTMLCanvasElement.prototype.getContext

  // fetch: serve the local dem.json; the dem.png body is unused (the bitmap
  // carries the pixels through the canvas polyfill below).
  g.fetch = (async (url: unknown) => {
    const u = String(url)
    if (u.endsWith('dem.json')) return { ok: true, json: async () => JSON.parse(metaJson) }
    if (u.endsWith('dem.png')) return { ok: true, blob: async () => ({}) }
    throw new Error(`unexpected fetch ${u}`)
  }) as unknown as typeof fetch
  g.createImageBitmap = (async () => ({ width: info.width, height: info.height, close() {} })) as unknown as typeof createImageBitmap
  HTMLCanvasElement.prototype.getContext = function () {
    return { drawImage() {}, getImageData: () => ({ data: pixels }) } as unknown as ReturnType<HTMLCanvasElement['getContext']>
  } as HTMLCanvasElement['getContext']

  try {
    await loadGeodata()
  } finally {
    g.fetch = origFetch
    g.createImageBitmap = origBitmap
    HTMLCanvasElement.prototype.getContext = origGetContext
  }
}
