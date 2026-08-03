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
// Exit 0 when the WebGL 2 lane can run. The WebGPU lane needs a SYSTEM Chrome/Chromium,
// which only a package manager (and root) can put there; this script reports its absence
// with the command to fix it rather than pretending it can. What it reports PRESENT is
// the exact executable the lane launches (scripts/verify/launch-args-core.mjs) — the
// report and the launch are not allowed to name different browsers.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { systemChromeCandidates } from './verify/launch-args-core.mjs'
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
}

console.log(`\nVerify host bring-up (${process.platform}):`)
for (const line of lines) console.log(`  - ${line}`)
console.log(
  ok
    ? '\nWebGL 2 lane ready:  VERIFY_GL=webgl node scripts/verify/run-all.mjs flow'
    : '\nWebGL 2 lane NOT ready — no browser suite can run on this host.',
)
process.exit(ok ? 0 : 1)
