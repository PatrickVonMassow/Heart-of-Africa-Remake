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
// Exit 0 when the WebGL 2 lane can run. The WebGPU lane needs a SYSTEM Chrome, which
// only a package manager (and root) can put there; this script reports its absence
// with the command to fix it rather than pretending it can.
import { spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'
import { chromium } from 'playwright'
import { systemChromeCandidates } from './verify/launch-args-core.mjs'

const checkOnly = process.argv.slice(2).includes('--check')

function isExecutable(path) {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** The first system Chrome on this host, or null (see launch-args-core.mjs for why
 *  Windows and macOS are deliberately not probed). */
function findSystemChrome() {
  for (const candidate of systemChromeCandidates(process.platform)) {
    if (isAbsolute(candidate)) {
      if (isExecutable(candidate)) return candidate
      continue
    }
    for (const dir of String(process.env.PATH ?? '').split(delimiter)) {
      if (dir && isExecutable(join(dir, candidate))) return join(dir, candidate)
    }
  }
  return null
}

/** Playwright's bundled Chromium — the WebGL 2 lane's browser. */
function bundledChromium() {
  try {
    const path = chromium.executablePath()
    return path && existsSync(path) ? path : null
  } catch {
    return null // no download registered for this platform/version
  }
}

/** The per-platform way to obtain SYSTEM Chrome, which the WebGPU lane launches as
 *  `channel:'chrome'`. Playwright can install it itself, but on Linux that shells out
 *  to the system package manager and needs root. */
function systemChromeHint() {
  if (process.platform === 'linux') {
    return [
      'npx playwright install --with-deps chrome     # needs root: it calls apt/dnf',
      'or install Google Chrome from the distro package (google-chrome-stable).',
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
  lines.push('system Chrome (WebGPU lane): not probed on this platform — Playwright resolves it')
} else if (chrome) {
  lines.push(`system Chrome (WebGPU lane): present — ${chrome}`)
} else {
  lines.push(
    'system Chrome (WebGPU lane): MISSING — the WebGPU lane will fail LOUD (it is never ' +
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
