#!/usr/bin/env node
// Does this host really have both picture lanes — and is either of them on a GPU?
//
// Judged at the PICTURE, never at a version string (point 493). On 03.08.2026 the software
// lane offered a WebGPU interface and then died at the first buffer, and a check that had
// asked "is navigator.gpu defined" would have called that host ready.
//
// Reports, per lane: whether a browser opens, what renderer it actually got, whether that
// renderer is SOFTWARE, and whether a frame was drawn. Exit 0 only when both lanes draw.
import { chromium } from 'playwright'
import { laneRenderers, softwareRendererVerdict } from './backend-lane-core.mjs'
import { findSystemChrome } from './system-chrome.mjs'

const SOFTWARE_HINTS = ['swiftshader', 'llvmpipe', 'softpipe', 'lavapipe']

/** What a lane reports from inside the page: the renderer it got and whether it painted. */
async function probeLane(launchOptions) {
  let browser = null
  try {
    browser = await chromium.launch(launchOptions)
    const page = await browser.newPage()
    await page.setContent('<canvas id="c" width="64" height="64"></canvas>')
    return await page.evaluate(async () => {
      const canvas = document.getElementById('c')
      const out = { webgpu: false, adapter: null, renderer: null, painted: false, error: null }
      try {
        const gl = canvas.getContext('webgl2')
        if (gl) {
          const dbg = gl.getExtension('WEBGL_debug_renderer_info')
          out.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
          gl.clearColor(0, 1, 0, 1)
          gl.clear(gl.COLOR_BUFFER_BIT)
          const px = new Uint8Array(4)
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
          out.painted = px[1] > 200
        }
        if (typeof navigator.gpu !== 'undefined') {
          out.webgpu = true
          const adapter = await navigator.gpu.requestAdapter()
          out.adapter = adapter ? { ...(adapter.info || {}) } : null
        }
      } catch (e) {
        out.error = e.message
      }
      return out
    })
  } catch (e) {
    return { error: e.message.split('\n')[0] }
  } finally {
    await browser?.close().catch(() => {})
  }
}

const systemChrome = findSystemChrome(process.platform)
const lanes = laneRenderers(systemChrome)
let failed = false

for (const lane of lanes) {
  if (!lane.launchOptions) {
    console.log(`FAIL  ${lane.name.padEnd(8)} ${lane.reason}`)
    failed = true
    continue
  }
  const got = await probeLane(lane.launchOptions)
  if (got.error) {
    console.log(`FAIL  ${lane.name.padEnd(8)} ${got.error}`)
    failed = true
    continue
  }
  const verdict = softwareRendererVerdict(got.renderer, SOFTWARE_HINTS)
  const drew = lane.name === 'webgpu' ? got.webgpu && got.adapter !== null : got.painted
  console.log(
    `${drew ? 'PASS' : 'FAIL'}  ${lane.name.padEnd(8)} renderer="${got.renderer ?? 'none'}"` +
      `${verdict.software ? '  [SOFTWARE — the picture is right but every suite crawls]' : ''}` +
      `${lane.name === 'webgpu' ? `  adapter=${JSON.stringify(got.adapter)}` : ''}`,
  )
  if (!drew) failed = true
}

if (failed) {
  console.log('')
  console.log('The host is NOT ready for both-backend picture proof.')
  console.log('What is missing: bash scripts/verify-host-setup.sh --check')
  process.exit(1)
}
console.log('')
console.log('Both lanes draw.')
