// Fast host/browser probe for the two picture-verification backends. It launches the
// exact browser and flags the suites use, but it never starts the app: a bare localhost
// canvas separates host GPU loss from a later window.__renderer startup timeout.
import { createServer } from 'node:http'
import { chromium } from 'playwright'
import { webglLaunchOptions, webgpuLaneVerdict, webgpuLaunchOptions } from './launch-args-core.mjs'
import { findSystemChrome, hasHardwareGlChain } from './system-chrome.mjs'

const PROBE_TIMEOUT_MS = 8_000
const ADAPTER_TIMEOUT_MS = 3_000

function firstLine(error) {
  return String(error?.message ?? error).split('\n')[0]
}

function withTimeout(promise, timeout, label) {
  let timer
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeout}ms`)), timeout)
  })
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer))
}

async function startProbeServer() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' })
    response.end('<!doctype html><title>GPU backend probe</title><canvas></canvas>')
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  return { server, url: `http://127.0.0.1:${address.port}/` }
}

async function readBareApis(page) {
  return page.evaluate(async (adapterTimeout) => {
    const webglCanvas = document.createElement('canvas')
    const webgpuCanvas = document.createElement('canvas')
    let adapter = null
    if (navigator.gpu) {
      adapter = await Promise.race([
        navigator.gpu.requestAdapter({ featureLevel: 'compatibility' }).catch(() => null),
        new Promise((resolve) => setTimeout(() => resolve(null), adapterTimeout)),
      ])
    }
    return {
      secureContext: isSecureContext,
      webgl2Context: webglCanvas.getContext('webgl2') !== null,
      webgpuContext: webgpuCanvas.getContext('webgpu') !== null,
      webgpuAdapter: adapter !== null,
    }
  }, ADAPTER_TIMEOUT_MS)
}

async function probeLane(lane, launchOptions, url) {
  let browser
  try {
    browser = await chromium.launch({ ...launchOptions, timeout: PROBE_TIMEOUT_MS })
    const page = await browser.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PROBE_TIMEOUT_MS })
    const [apis, system] = await Promise.all([
      withTimeout(readBareApis(page), PROBE_TIMEOUT_MS, `${lane} API probe`),
      withTimeout(
        browser.newBrowserCDPSession().then((session) => session.send('SystemInfo.getInfo')),
        PROBE_TIMEOUT_MS,
        `${lane} Chrome GPU diagnostic`,
      ),
    ])
    const gpu = system.gpu ?? {}
    const aux = gpu.auxAttributes ?? {}
    return {
      lane,
      available: lane === 'webgpu' ? apis.webgpuContext && apis.webgpuAdapter : apis.webgl2Context,
      apis,
      browser: browser.version(),
      renderer: aux.glRenderer || gpu.devices?.[0]?.deviceString || '',
      implementation: aux.glImplementationParts || '',
      featureStatus: gpu.featureStatus ?? {},
    }
  } catch (error) {
    return { lane, available: false, error: firstLine(error) }
  } finally {
    await browser?.close().catch(() => {})
  }
}

/** Probe both lanes with the same resolution and launch policy as the suites. */
export async function probeGpuBackends() {
  const { server, url } = await startProbeServer()
  const systemChrome = findSystemChrome(process.platform)
  const webgpuVerdict = webgpuLaneVerdict({ platform: process.platform, systemChrome })
  try {
    const results = []
    results.push(
      await probeLane(
        'webgl2',
        webglLaunchOptions(process.platform, process.env.VERIFY_ANGLE, process.env, process.env.VERIFY_GALLIUM),
        url,
      ),
    )
    if (!webgpuVerdict.available) {
      results.push({ lane: 'webgpu', available: false, error: webgpuVerdict.reason })
    } else {
      results.push(
        await probeLane(
          'webgpu',
          webgpuLaunchOptions(
            systemChrome,
            process.platform,
            process.env,
            process.env.VERIFY_GALLIUM,
            hasHardwareGlChain(process.platform),
          ),
          url,
        ),
      )
    }
    return results
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}
