// The WebGPU lane's ORDERING, exercised for real (point 475). launchVerifyBrowser
// throws the unavailable verdict BEFORE arming the run recorder, and that order is
// load-bearing: armed first, a host without a system browser would leave a run record
// behind, and render-verify-guard reads run records as backend coverage. Reading the
// function is not proof — the ordering is one line away from silently inverting — so
// this drives the real module in a CHILD process, where VERIFY_GL is fixed at import
// time and the recorder is the real one.
//
// Arming is observed through the process 'exit' listener armRunRecorder installs: it is
// the recorder's only footprint before exit, and it moves the moment the arming happens,
// whether or not a record is later written. The state file is checked too — nothing may
// appear in it — so the claim holds at both ends.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { WEBGPU_UNAVAILABLE } from './launch-args-core.mjs'
import { RENDER_STATE_PATH } from '../render-verify-state.mjs'
import { repoPath } from '../repo-paths.mjs'

// repoPath, not import.meta.url: under Vitest's module runner the latter is not a
// file: URL and fileURLToPath throws (see scripts/repo-paths.mjs).
const BROWSER_MODULE = pathToFileURL(repoPath('scripts/verify/_browser.mjs')).href

/** The child's exit code on a completed scenario. Non-zero on purpose: should the
 *  ordering ever invert, the record such a run would leave carries this code, and
 *  coveringRun credits only exit 0 — a failing test can never fabricate coverage. */
const SCENARIO_EXIT = 7

/** Run one scenario in a fresh node process and report what it observed.
 *
 *  `keepRecorder: false` strips the exit listeners again before the child ends, so a
 *  scenario that DOES arm the recorder (the control below) writes nothing into the
 *  shared evidence file — the 40-run window is real evidence, not a test's scratchpad.
 *  The unavailable case keeps them, because there the whole claim is that nothing was
 *  armed and therefore nothing can be written. */
function runScenario(name, call, { keepRecorder = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-launch-order-'))
  const script = join(dir, `${name}.mjs`) // the recorder names the run after argv[1]
  writeFileSync(
    script,
    [
      `const { launchVerifyBrowser } = await import(${JSON.stringify(BROWSER_MODULE)})`,
      "const before = process.listenerCount('exit')",
      'let message = null',
      `try { await launchVerifyBrowser(${call}); } catch (e) { message = String(e && e.message) }`,
      "const after = process.listenerCount('exit')",
      'process.stdout.write(JSON.stringify({ message, before, after }))',
      keepRecorder ? '' : "process.removeAllListeners('exit')",
      `process.exit(${SCENARIO_EXIT})`,
    ].join('\n'),
  )
  let res
  try {
    res = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      windowsHide: true, // no console window at a turn end (point 401)
      // The reviewer's scenario verbatim: a PATH on which no browser can be found. The
      // host is posed through the call as well, so a CI image that ships Chrome at
      // /opt/google/chrome/chrome cannot turn this into a real browser launch.
      env: { ...process.env, VERIFY_GL: 'webgpu', PATH: '' },
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  expect(res.status, `child stderr: ${res.stderr}`).toBe(SCENARIO_EXIT)
  return JSON.parse(res.stdout)
}

/** Run records currently in the shared evidence file, for `suite`. */
function recordsFor(suite) {
  let state = null
  try {
    state = JSON.parse(readFileSync(RENDER_STATE_PATH, 'utf8'))
  } catch {
    return [] // no state file yet — then nothing was recorded either
  }
  return (Array.isArray(state?.runs) ? state.runs : []).filter((r) => r?.suite === suite)
}

describe('the WebGPU lane throws before it arms the run recorder', () => {
  it('leaves NO run record when the host has no system browser', () => {
    const before = recordsFor('lane-unavailable')
    const observed = runScenario('lane-unavailable', "{ platform: 'linux', systemChrome: null }")

    // It refused, with the lane's own headline — not Playwright's generic channel error.
    expect(observed.message).toContain(WEBGPU_UNAVAILABLE)
    // And it refused BEFORE arming: no exit listener was installed.
    expect(observed.after).toBe(observed.before)
    // The recorder therefore had nothing to write, at the file too.
    expect(recordsFor('lane-unavailable')).toEqual(before)
  })

  it('DOES arm once the lane is available — so the assertion above is not vacuous', () => {
    // Same call, one step further: a posed host that HAS a browser, at a path that does
    // not exist. The verdict passes, the recorder is armed, and Playwright is the one
    // that fails — the control that proves an armed recorder is visible to this test.
    const observed = runScenario(
      'lane-armed',
      "{ platform: 'linux', systemChrome: '/nonexistent/hoa-verify-probe/chrome' }",
      { keepRecorder: false },
    )

    expect(observed.after).toBeGreaterThan(observed.before)
    expect(observed.message).not.toContain(WEBGPU_UNAVAILABLE)
    // Playwright names the executable it was handed — the probed path really launches.
    expect(observed.message).toContain('/nonexistent/hoa-verify-probe/chrome')
  })
})
