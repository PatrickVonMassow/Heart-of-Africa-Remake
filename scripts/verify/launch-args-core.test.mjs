// Vitest sweep of the verify browsers' launch policy (point 475). Pure: no browser,
// no filesystem — exactly why the policy lives in launch-args-core.mjs and not inline
// in _browser.mjs, whose every line needs a real Chromium to reach.
import { describe, it, expect } from 'vitest'
import {
  WEBGPU_UNAVAILABLE,
  angleBackend,
  systemChromeCandidates,
  verifyLaunchOptions,
  webglLaunchOptions,
  webgpuLaneVerdict,
  webgpuLaunchOptions,
} from './launch-args-core.mjs'
import { coveringRun } from '../render-verify-core.mjs'

/** The exact WebGL 2 argument list Windows launched with before point 475. Frozen
 *  here, not derived: the point's condition 4 is that the Windows host keeps its
 *  behaviour BYTE FOR BYTE, and a derived expectation would move with the code. */
const WINDOWS_WEBGL_ARGS = ['--enable-unsafe-webgpu', '--use-angle=d3d11', '--enable-gpu']

/** Likewise for the WebGPU lane, which condition 4 leaves untouched on every host. */
const WEBGPU_LAUNCH = {
  channel: 'chrome',
  args: ['--headless=new', '--enable-unsafe-webgpu', '--enable-gpu'],
}

describe('angleBackend', () => {
  it('keeps Direct3D 11 on Windows — the historical value', () => {
    expect(angleBackend('win32')).toBe('d3d11')
  })

  it('never asks Linux for Direct3D (the flag names a Windows-only backend)', () => {
    expect(angleBackend('linux')).not.toBe('d3d11')
    expect(angleBackend('linux')).toBe('swiftshader')
  })

  it('gives macOS its only backend', () => {
    expect(angleBackend('darwin')).toBe('metal')
  })

  it('falls back to the software backend on an unknown platform', () => {
    expect(angleBackend('aix')).toBe('swiftshader')
  })

  it('honours an explicit VERIFY_ANGLE override, trimmed and lower-cased', () => {
    expect(angleBackend('linux', 'gl')).toBe('gl')
    expect(angleBackend('linux', '  Vulkan \n')).toBe('vulkan')
    expect(angleBackend('win32', 'gl')).toBe('gl')
  })

  it('treats an empty or absent override as "decide by platform"', () => {
    expect(angleBackend('win32', '')).toBe('d3d11')
    expect(angleBackend('win32', '   ')).toBe('d3d11')
    expect(angleBackend('win32', undefined)).toBe('d3d11')
  })
})

describe('webglLaunchOptions', () => {
  it('reproduces the Windows launch byte for byte', () => {
    expect(webglLaunchOptions('win32')).toEqual({ args: WINDOWS_WEBGL_ARGS })
  })

  it('swaps only the ANGLE backend on Linux and adds the container sandbox flag', () => {
    expect(webglLaunchOptions('linux')).toEqual({
      args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-gpu', '--no-sandbox'],
    })
  })

  it('adds --no-sandbox on Linux only', () => {
    expect(webglLaunchOptions('win32').args).not.toContain('--no-sandbox')
    expect(webglLaunchOptions('darwin').args).not.toContain('--no-sandbox')
    expect(webglLaunchOptions('linux').args).toContain('--no-sandbox')
  })
})

describe('webgpuLaunchOptions', () => {
  it('is the point-184 system-Chrome launch when nothing was probed', () => {
    expect(webgpuLaunchOptions()).toEqual(WEBGPU_LAUNCH)
    expect(webgpuLaunchOptions(null)).toEqual(WEBGPU_LAUNCH)
  })

  it('launches the PROBED path, so the bring-up report cannot name another browser', () => {
    // The defect this pins: the `chrome` channel resolves only to /opt/google/chrome/
    // chrome (+ beta/dev/canary) inside playwright-core's registry, while the probe
    // also finds a distro chromium. Reporting one and launching the other was a false
    // ready-signal; the resolved path is now what launches.
    expect(webgpuLaunchOptions('/usr/bin/chromium')).toEqual({
      executablePath: '/usr/bin/chromium',
      args: WEBGPU_LAUNCH.args,
    })
  })

  it('drops the channel once a path is given — Playwright would ignore it anyway', () => {
    expect(webgpuLaunchOptions('/snap/bin/chromium').channel).toBeUndefined()
  })

  it('keeps the flag list identical either way — only the browser choice moved', () => {
    expect(webgpuLaunchOptions('/opt/google/chrome/chrome').args).toEqual(WEBGPU_LAUNCH.args)
  })

  it('treats a blank or non-string probe result as "nothing found"', () => {
    expect(webgpuLaunchOptions('')).toEqual(WEBGPU_LAUNCH)
    expect(webgpuLaunchOptions('   ')).toEqual(WEBGPU_LAUNCH)
    expect(webgpuLaunchOptions(0)).toEqual(WEBGPU_LAUNCH)
  })
})

describe('verifyLaunchOptions', () => {
  it('routes the webgpu lane to the unchanged system-Chrome launch on BOTH platforms', () => {
    expect(verifyLaunchOptions('webgpu', 'win32')).toEqual(WEBGPU_LAUNCH)
    expect(verifyLaunchOptions('webgpu', 'linux')).toEqual(WEBGPU_LAUNCH)
  })

  it('is not diverted by an ANGLE override — that lane carries no ANGLE flag', () => {
    expect(verifyLaunchOptions('webgpu', 'linux', 'gl')).toEqual(WEBGPU_LAUNCH)
  })

  it('carries the probed browser through to the webgpu lane', () => {
    expect(verifyLaunchOptions('webgpu', 'linux', undefined, '/usr/bin/chromium')).toEqual({
      executablePath: '/usr/bin/chromium',
      args: WEBGPU_LAUNCH.args,
    })
  })

  it('never lets a probed browser into the WebGL 2 lane — that one is the bundled Chromium', () => {
    expect(verifyLaunchOptions('webgl', 'linux', undefined, '/usr/bin/chromium')).toEqual({
      args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-gpu', '--no-sandbox'],
    })
  })

  it('leaves Windows byte for byte where nothing is probed', () => {
    expect(verifyLaunchOptions('webgpu', 'win32', undefined, null)).toEqual(WEBGPU_LAUNCH)
    expect(verifyLaunchOptions('webgl', 'win32', undefined, null)).toEqual({ args: WINDOWS_WEBGL_ARGS })
  })

  it('routes anything else to the platform WebGL 2 lane', () => {
    expect(verifyLaunchOptions('webgl', 'win32')).toEqual({ args: WINDOWS_WEBGL_ARGS })
    expect(verifyLaunchOptions('webgl', 'linux').args).toContain('--use-angle=swiftshader')
  })
})

describe('systemChromeCandidates', () => {
  it('probes on Linux, where the point measured the absence', () => {
    expect(systemChromeCandidates('linux')).toContain('google-chrome')
  })

  it('lists a distro chromium too, and EVERY entry reaches the launch as a path', () => {
    // The list may only name things the lane can actually open. Since the probe's
    // result is handed over as executablePath, that is checkable: each candidate must
    // produce a path launch, never fall back to the channel a chromium would fail on.
    const candidates = systemChromeCandidates('linux')
    expect(candidates).toContain('chromium')
    for (const candidate of candidates) {
      expect(webgpuLaunchOptions(candidate)).toEqual({ executablePath: candidate, args: WEBGPU_LAUNCH.args })
    }
  })

  it('probes NOTHING on Windows or macOS — Playwright resolves the channel there', () => {
    expect(systemChromeCandidates('win32')).toEqual([])
    expect(systemChromeCandidates('darwin')).toEqual([])
  })
})

describe('webgpuLaneVerdict', () => {
  it('runs the lane when a system Chrome was found', () => {
    const v = webgpuLaneVerdict({ platform: 'linux', systemChrome: '/usr/bin/google-chrome' })
    expect(v.available).toBe(true)
    expect(v.systemChrome).toBe('/usr/bin/google-chrome')
  })

  it('leaves Windows exactly as it was: no probe, no new failure mode', () => {
    const v = webgpuLaneVerdict({ platform: 'win32', systemChrome: null })
    expect(v.available).toBe(true)
    expect(v.probed).toBe(false)
  })

  it('fails LOUD on a Linux host with no system Chrome', () => {
    const v = webgpuLaneVerdict({ platform: 'linux', systemChrome: null })
    expect(v.available).toBe(false)
    expect(v.reason.startsWith(WEBGPU_UNAVAILABLE)).toBe(true)
  })

  it('never proposes WebGL 2 as a substitute', () => {
    const v = webgpuLaneVerdict({ platform: 'linux', systemChrome: null })
    expect(v.reason).toMatch(/NOT silently downgraded to WebGL 2/)
  })

  it('survives a call with no argument at all (a caller mid-refactor)', () => {
    expect(() => webgpuLaneVerdict()).not.toThrow()
    expect(webgpuLaneVerdict().available).toBe(true) // undefined platform is unprobed
  })
})

describe('an unavailable lane is not backend coverage', () => {
  // The point's condition 3, checked against the REAL judge: render-verify-guard
  // reads coverage through coveringRun, and the unavailable lane must leave nothing
  // it can credit. Two ways that could go wrong, both pinned here.
  const since = 1000
  const passingWebgl = { backend: 'webgl', suite: 'flow', at: 2000, exit: 0, asserted: true }

  it('credits nothing when the lane never launched (no record at all)', () => {
    // launchVerifyBrowser throws BEFORE arming the recorder, so the runs list holds
    // only the other lane's run.
    expect(coveringRun([passingWebgl], 'webgpu', since)).toBe(null)
  })

  it('credits nothing even if a crashed attempt did leave a record', () => {
    const attempt = { backend: 'webgpu', suite: 'flow', at: 2100, exit: 1, asserted: false }
    expect(coveringRun([passingWebgl, attempt], 'webgpu', since)).toBe(null)
  })

  it('still credits a genuine passing WebGPU run — the gate is not simply broken', () => {
    const real = { backend: 'webgpu', suite: 'flow', at: 2200, exit: 0, asserted: true }
    expect(coveringRun([passingWebgl, real], 'webgpu', since)).toEqual(real)
  })
})
