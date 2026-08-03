// The host probe both the bring-up report and the lane launch now share (point 475).
// It reads the filesystem, so it is driven through its parameters rather than against
// whatever browsers this machine happens to have: a runner image that ships Chrome must
// not decide what these cases assert.
import { describe, it, expect } from 'vitest'
import { delimiter, join } from 'node:path'
import { findSystemChrome, isExecutable } from './system-chrome.mjs'
import { systemChromeCandidates, webgpuLaunchOptions } from './launch-args-core.mjs'

/** A posed host: only the named paths exist as executables. */
const hostWith = (...present) => (path) => present.includes(path)

describe('findSystemChrome', () => {
  it('finds a bare candidate on PATH and returns the FULL path — what a launch needs', () => {
    const dir = join('/opt', 'browsers')
    const found = findSystemChrome('linux', dir, hostWith(join(dir, 'chromium')))
    expect(found).toBe(join(dir, 'chromium'))
  })

  it('probes an absolute candidate directly, PATH or no PATH', () => {
    expect(findSystemChrome('linux', '', hostWith('/snap/bin/chromium'))).toBe('/snap/bin/chromium')
  })

  it('keeps the candidate ORDER — Google Chrome before a distro chromium', () => {
    const dir = '/usr/bin'
    const found = findSystemChrome('linux', dir, hostWith(join(dir, 'chromium'), join(dir, 'google-chrome')))
    expect(found).toBe(join(dir, 'google-chrome'))
  })

  it('walks every PATH entry and skips the empty ones', () => {
    const dirs = ['', '/nowhere', '/opt/browsers'].join(delimiter)
    expect(findSystemChrome('linux', dirs, hostWith('/opt/browsers/google-chrome'))).toBe('/opt/browsers/google-chrome')
  })

  it('reports null on a probed host that has none — the loud verdict is built on this', () => {
    expect(findSystemChrome('linux', '/usr/bin', () => false)).toBe(null)
  })

  it('probes NOTHING on Windows or macOS, whatever the host holds', () => {
    const anything = () => true
    expect(findSystemChrome('win32', '/usr/bin', anything)).toBe(null)
    expect(findSystemChrome('darwin', '/usr/bin', anything)).toBe(null)
  })

  it('hands the launch a path for whatever it found — report and launch agree', () => {
    const found = findSystemChrome('linux', '/usr/bin', hostWith('/usr/bin/chromium'))
    expect(webgpuLaunchOptions(found).executablePath).toBe(found)
    expect(systemChromeCandidates('linux')).toContain('chromium') // …and chromium is listed
  })
})

describe('isExecutable', () => {
  it('is true for a real executable — node itself', () => {
    expect(isExecutable(process.execPath)).toBe(true)
  })

  it('is false, never a throw, for a path that is not there', () => {
    expect(isExecutable('/nonexistent/hoa-verify-probe/chrome')).toBe(false)
    expect(isExecutable('')).toBe(false)
  })
})
