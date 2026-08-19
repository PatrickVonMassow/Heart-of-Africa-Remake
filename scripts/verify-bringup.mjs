#!/usr/bin/env node
// Host bring-up for the browser verification (point 475): `npm run verify:bringup`.
//
// The browser suites need a browser, and on 03.08.2026 — the day the project moved to
// a Linux container — this host had NONE: PLAYWRIGHT_BROWSERS_PATH pointed at an empty
// directory and no system Chrome was on PATH, so every suite died at launch and
// render-verify-guard could never be satisfied. Bring-up is therefore an EXPLICIT,
// documented step, run once per machine. No suite installs anything implicitly: a
// regression that quietly downloads ~180 MB is a surprise, not a convenience.
//
//   node scripts/verify-bringup.mjs          install what is missing, then report
//   node scripts/verify-bringup.mjs --check  report only, install nothing
//
// Exit 0 only when BOTH exact browsers expose their backend on a named hardware
// renderer. Browser binaries alone are not readiness: the 19.08.2026 outage had both
// executables and neither API. The bare-canvas probe asks Chrome's SystemInfo CDP domain
// for the Graphics Feature Status, so a disabled GPU process is named before an app suite
// can spend 180 seconds waiting for window.__renderer.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { systemChromeCandidates } from './verify/launch-args-core.mjs'
import { backendProbeDetail, gpuBackendVerdict } from './verify/gpu-backend-probe-core.mjs'
import { probeGpuBackends } from './verify/gpu-backend-probe.mjs'
// The SAME probe the lane launches through (scripts/verify/system-chrome.mjs), not a
// second copy of the walk: a report and a launch that resolve differently is the very
// defect this command exists to rule out.
import { findSystemChrome } from './verify/system-chrome.mjs'

const checkOnly = process.argv.slice(2).includes('--check')

/** Playwright's bundled Chromium — the WebGL 2 lane's browser. */
function bundledChromium() {
  try {
    const path = chromium.executablePath()
    return path && existsSync(path) ? path : null
  } catch {
    return null // no download registered for this platform/version
  }
}

/** The per-platform way to obtain the WebGPU lane's browser. Playwright can install
 *  Chrome itself, but on Linux that shells out to the system package manager and needs
 *  root. On Linux a distro `chromium` serves the lane too — the launcher opens the
 *  probed path directly rather than through the `chrome` channel, which resolves to
 *  /opt/google/chrome/chrome alone. */
function systemChromeHint() {
  if (process.platform === 'linux') {
    return [
      'npx playwright install --with-deps chrome     # needs root: it calls apt/dnf',
      'or install a distro package: google-chrome-stable, or chromium.',
    ].join('\n    ')
  }
  return 'npx playwright install chrome'
}

const lines = []
let ok = true

const before = bundledChromium()
if (before) {
  lines.push(`bundled Chromium (WebGL 2 lane): present — ${before}`)
} else if (checkOnly) {
  lines.push('bundled Chromium (WebGL 2 lane): MISSING — run `npm run verify:bringup`')
  ok = false
} else {
  console.log('Installing Playwright\'s bundled Chromium (WebGL 2 lane)…')
  const res = spawnSync('npx', ['playwright', 'install', 'chromium'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: true,
  })
  const after = bundledChromium()
  if (after) {
    lines.push(`bundled Chromium (WebGL 2 lane): installed — ${after}`)
  } else {
    lines.push(
      `bundled Chromium (WebGL 2 lane): INSTALL FAILED (exit ${res.status ?? 'n/a'}). ` +
        'The download comes from cdn.playwright.dev — check the network/proxy, then re-run.',
    )
    ok = false
  }
}

const chrome = findSystemChrome()
if (systemChromeCandidates(process.platform).length === 0) {
  lines.push('system Chrome (WebGPU lane): not probed on this platform — Playwright resolves the channel')
} else if (chrome) {
  lines.push(`system Chrome/Chromium (WebGPU lane): present — ${chrome} (the lane launches this path)`)
} else {
  lines.push(
    'system Chrome/Chromium (WebGPU lane): MISSING — the WebGPU lane will fail LOUD (it is never ' +
      'downgraded to WebGL 2). Install it with:\n    ' +
      systemChromeHint(),
  )
  ok = false
}

console.log(`\nVerify host bring-up (${process.platform}):`)
for (const line of lines) console.log(`  - ${line}`)
const probe = gpuBackendVerdict(await probeGpuBackends())
console.log(`\n${probe.summary}`)
for (const result of probe.results) {
  console.log(`  - ${result.lane}: ${backendProbeDetail(result)}`)
}
if (ok && probe.ok) {
  console.log('\nBoth lanes ready: run the selected verification suite.')
}
process.exit(ok && probe.ok ? 0 : 1)
