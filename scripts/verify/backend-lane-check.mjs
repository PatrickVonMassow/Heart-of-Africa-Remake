#!/usr/bin/env node
// Does this host really have both picture lanes — and is either of them on the GPU?
//
// Judged at the PICTURE, never at a version string (point 493). On 03.08.2026 the software
// lane offered a WebGPU interface and then died at the first buffer; on 04.08.2026 the
// WebGPU lane reported `isWebGPUBackend`, returned an adapter, advanced its frame counter
// — and left the canvas BLACK behind a live HUD for the whole run. A check that had asked
// "is navigator.gpu defined" would have called that host ready twice.
//
// So this boots the REAL GAME on each lane and reads the RENDERED PIXELS back out of the
// canvas. A lane passes only when the backend that initialised is the one asked for, the
// frame counter advances, the page threw nothing, and the picture has content. It also
// NAMES the device it drew with, so a software rasteriser can never be reported as if it
// were the GPU.
//
//   node scripts/verify/backend-lane-check.mjs
import { chromium } from 'playwright'
import { laneRenderers, softwareRendererVerdict } from './backend-lane-core.mjs'
import { featureLevelOf } from '../render-verify-core.mjs'
import { launchServer, killTree } from './_server.mjs'
import { findSystemChrome, hasHardwareGlChain } from './system-chrome.mjs'

const SOFTWARE_HINTS = ['swiftshader', 'llvmpipe', 'softpipe', 'lavapipe']

/** A lane is READY when the game boots on the requested backend and PAINTS. `colours` is
 *  the count of distinct RGB values in a 64×64 downscale of the live canvas: a lane that
 *  never draws leaves one flat colour, and the 04.08.2026 black-canvas failure sat there
 *  while every interface answered. A real frame of this game runs into the hundreds; the
 *  floor is set far below that, so it fails on "nothing drew", never on "drew something
 *  dark". */
const MIN_COLOURS = 24

/** Read the lane's state out of a page with the game running: which backend really
 *  initialised, on what device, and — the part no interface can fake — what the canvas
 *  actually painted. The pixels are taken by drawing the live canvas into a 2D context
 *  inside a rAF callback, the one moment a WebGL drawing buffer is readable without
 *  preserveDrawingBuffer. */
function readLane() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      const renderer = window.__renderer
      const device = renderer?.backend?.device
      const out = {
        isWebGPU: renderer?.backend?.isWebGPUBackend === true,
        // The FEATURE LEVEL the lane came up at (point 505) — the third signal beside
        // backend and pixel, since a compat adapter draws a real picture and reports
        // hardware-like strings while running a code path the player never enters.
        compatibilityMode: renderer?.backend?.compatibilityMode === true,
        coreFeatures: device?.features ? device.features.has('core-features-and-limits') : null,
        calls: renderer?.info?.render?.calls ?? 0,
        renderTargets: renderer?.info?.memory?.renderTargets ?? 0,
        colours: 0,
        renderer: null,
      }
      try {
        const probe = document.createElement('canvas')
        const gl = probe.getContext('webgl2')
        const dbg = gl?.getExtension('WEBGL_debug_renderer_info')
        out.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (gl?.getParameter(gl.RENDERER) ?? null)
      } catch {
        // The renderer string is diagnostic. Its absence names no verdict; the pixels do.
      }
      try {
        const shot = document.createElement('canvas')
        shot.width = 64
        shot.height = 64
        const ctx = shot.getContext('2d')
        ctx.drawImage(document.querySelector('canvas'), 0, 0, shot.width, shot.height)
        const { data } = ctx.getImageData(0, 0, shot.width, shot.height)
        const seen = new Set()
        for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
        out.colours = seen.size
      } catch (e) {
        out.pixelError = String(e).slice(0, 160)
      }
      resolve(out)
    })
  })
}

/** The adapter behind a WebGPU lane, by name, so the report can say WHICH device drew.
 *  The fields are read one by one on purpose: GPUAdapterInfo carries them on its
 *  PROTOTYPE, so a spread yields `{}` and a report that names nothing. */
function readAdapter() {
  if (!navigator.gpu) return Promise.resolve(null)
  return navigator.gpu.requestAdapter().then((a) =>
    a
      ? {
          vendor: a.info?.vendor ?? '',
          architecture: a.info?.architecture ?? '',
          device: a.info?.device ?? '',
          description: a.info?.description ?? '',
        }
      : null,
  )
}

/** Renderer calls beyond the first reading that prove the loop is still ALIVE — a lane
 *  can paint one good frame and then stall, and the 04.08.2026 failure did exactly that. */
const PROGRESS_CALLS = 30

/** Resolve once the renderer has issued at least `target` calls. */
function waitForCalls(page, target, timeout) {
  return page.waitForFunction((want) => (window.__renderer?.info?.render?.calls ?? 0) >= want, target, { timeout })
}

/** Resolve once the canvas is actually PAINTING — the condition this check is about, so
 *  it is waited on directly rather than approximated by a sleep. A lane that never paints
 *  runs the timeout out and is then read and reported as the failure it is; the caller
 *  never treats the timeout itself as the verdict. */
async function waitForPicture(page, floor, timeout) {
  await page
    .waitForFunction(
      (want) => {
        const canvas = document.querySelector('canvas')
        if (!canvas) return false
        const shot = document.createElement('canvas')
        shot.width = 64
        shot.height = 64
        const ctx = shot.getContext('2d')
        ctx.drawImage(canvas, 0, 0, shot.width, shot.height)
        const { data } = ctx.getImageData(0, 0, shot.width, shot.height)
        const seen = new Set()
        for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
        return seen.size >= want
      },
      floor,
      { timeout },
    )
    .catch(() => {})
}

async function probeLane(lane, base) {
  let browser = null
  try {
    browser = await chromium.launch(lane.launchOptions)
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForFunction(() => window.__game && window.__renderer, null, { timeout: 180000 })
    const adapter = await page.evaluate(readAdapter)
    // Waited on CONDITIONS, never the wall clock: a software lane needs many times the
    // seconds a hardware one does for the same picture, and a fixed sleep would either
    // flake there or throw the difference away here.
    await waitForPicture(page, MIN_COLOURS, 180000)
    const first = await page.evaluate(readLane)
    await waitForCalls(page, first.calls + PROGRESS_CALLS, 60000).catch(() => {})
    const second = await page.evaluate(readLane)
    return { ...second, adapter, advanced: second.calls > first.calls, errors }
  } catch (e) {
    return { error: e.message.split('\n')[0] }
  } finally {
    await browser?.close().catch(() => {})
  }
}

/** Everything wrong with what this lane produced, in the order it matters. Empty = ready. */
function laneFaults(got, wantWebGPU) {
  const faults = []
  if (got.isWebGPU !== wantWebGPU) {
    faults.push(`the renderer initialised on ${got.isWebGPU ? 'WebGPU' : 'WebGL 2'} — not this lane's backend`)
  }
  if (wantWebGPU && !got.adapter) faults.push('navigator.gpu returned no adapter')
  if (!got.advanced) faults.push('the frame counter did not advance — the render loop is stalled')
  if (got.colours < MIN_COLOURS) {
    faults.push(`the canvas painted ${got.colours} distinct colour(s) — NO PICTURE (${MIN_COLOURS} is the floor)`)
  }
  if (got.errors.length > 0) faults.push(`the page threw: ${got.errors[0]}`)
  return faults
}

const systemChrome = findSystemChrome(process.platform)
const lanes = laneRenderers(
  systemChrome,
  process.platform,
  process.env,
  process.env.VERIFY_GALLIUM,
  hasHardwareGlChain(process.platform),
)
const { child, base } = await launchServer('npm run dev', 'dev', process.cwd())
let failed = false

try {
  for (const lane of lanes) {
    if (!lane.launchOptions) {
      console.log(`FAIL  ${lane.name.padEnd(6)} ${lane.reason}`)
      failed = true
      continue
    }
    const got = await probeLane(lane, base)
    if (got.error) {
      console.log(`FAIL  ${lane.name.padEnd(6)} the browser did not come up: ${got.error}`)
      failed = true
      continue
    }
    const wantWebGPU = lane.name === 'webgpu'
    const faults = laneFaults(got, wantWebGPU)
    const verdict = softwareRendererVerdict(
      wantWebGPU ? JSON.stringify(got.adapter) : got.renderer,
      SOFTWARE_HINTS,
    )
    const device = wantWebGPU ? `adapter=${JSON.stringify(got.adapter)}` : `renderer="${got.renderer ?? 'none'}"`
    // Named, never inferred: a compat lane is REAL WebGPU on real hardware and still no
    // proof about the player's core path (point 505).
    const level = wantWebGPU ? featureLevelOf(got) : null
    console.log(
      `${faults.length === 0 ? 'PASS' : 'FAIL'}  ${lane.name.padEnd(6)} ${device}` +
        `  colours=${got.colours}` +
        `${wantWebGPU ? `  level=${level ?? 'unreadable'}` : ''}` +
        `${verdict.software ? '  [SOFTWARE RASTERISER — the picture is right, the clock is not]' : ''}`,
    )
    if (level === 'compatibility') {
      console.log('        · WebGPU COMPATIBILITY, not core: three.js runs its compat branches and drops MSAA here,')
      console.log('          which the player never does. Real coverage of the WebGPU lane, not of the core path.')
    }
    for (const fault of faults) console.log(`        · ${fault}`)
    if (faults.length > 0) failed = true
  }
} finally {
  killTree(child)
}

if (failed) {
  console.log('')
  console.log('The host is NOT ready for both-backend picture proof.')
  console.log('What is missing: bash scripts/verify-host-setup.sh --check')
  process.exit(1)
}
console.log('')
console.log('Both lanes draw the game.')
