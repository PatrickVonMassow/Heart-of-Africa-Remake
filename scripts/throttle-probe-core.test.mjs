// The throttle probe's decisions (point 640): what the command line means, what
// throttling a host can really apply, and what a skew rate is worth.
//
// The property that matters most is the LAST one: no outcome of this probe
// closes a red. A reproduction names where to hunt, a non-reproduction rules out
// one explanation — and the wording must keep saying so, because the failure
// this whole point exists to stop was exactly a green run being read as a
// verdict.
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CPUS,
  DEFAULT_RUNS,
  formatProbeReport,
  parseProbeArgs,
  summarise,
  throttlePlan,
  verdictOf,
} from './throttle-probe-core.mjs'

describe('parseProbeArgs', () => {
  it('reads the point-600 shape: one suite, one section, eight runs', () => {
    const o = parseProbeArgs(['polish', '--section=goat-stance'])
    expect(o).toMatchObject({ suite: 'polish', section: 'goat-stance', runs: DEFAULT_RUNS, cpus: DEFAULT_CPUS })
    expect(o.error).toBeNull()
  })

  it('takes a value attached or detached', () => {
    expect(parseProbeArgs(['polish', '--section', 'goat-stance', '--runs', '4']).runs).toBe(4)
    expect(parseProbeArgs(['polish', '--section=goat-stance', '--runs=4']).runs).toBe(4)
  })

  it('REFUSES a whole-suite probe — the instrument measures one named block', () => {
    const o = parseProbeArgs(['polish'])
    expect(o.error).toMatch(/--section=<name> is required/)
  })

  it('refuses a nonsense count rather than quietly measuring something else', () => {
    expect(parseProbeArgs(['polish', '--section=x', '--runs=0']).error).toMatch(/--runs/)
    expect(parseProbeArgs(['polish', '--section=x', '--runs=2.5']).error).toMatch(/--runs/)
    expect(parseProbeArgs(['polish', '--section=x', '--runs=9999']).error).toMatch(/--runs/)
    expect(parseProbeArgs(['polish', '--section=x', '--cpus=nope']).error).toMatch(/--cpus/)
  })

  it('refuses two suites, an unknown flag and an unknown backend, naming each', () => {
    expect(parseProbeArgs(['polish', 'enrichments', '--section=x']).error).toMatch(/only ONE suite/)
    expect(parseProbeArgs(['polish', '--section=x', '--fast']).error).toMatch(/unknown flag "--fast"/)
    expect(parseProbeArgs(['polish', '--section=x', '--backend=vulkan']).error).toMatch(/--backend/)
  })

  it('takes both backends and the unthrottled control', () => {
    expect(parseProbeArgs(['polish', '--section=x', '--backend=webgl']).backend).toBe('webgl')
    expect(parseProbeArgs(['polish', '--section=x', '--backend=webgpu']).backend).toBe('webgpu')
    expect(parseProbeArgs(['polish', '--section=x', '--no-throttle']).throttle).toBe(false)
  })

  it('asks for nothing when it is asked for help', () => {
    expect(parseProbeArgs(['--help'])).toMatchObject({ help: true, error: null })
  })

  it('is total on garbage', () => {
    expect(() => parseProbeArgs(null)).not.toThrow()
    expect(() => parseProbeArgs([undefined, 7, {}])).not.toThrow()
  })
})

describe('throttlePlan — a throttle is applied or admitted missing, never faked', () => {
  it('pins the whole run to one core on linux with taskset', () => {
    const plan = throttlePlan({ platform: 'linux', cpuCount: 16, cpus: 1, hasTaskset: true })
    expect(plan.available).toBe(true)
    expect(plan.argv).toEqual(['taskset', '-c', '0'])
    expect(plan.how).toMatch(/1 of 16/)
  })

  it('takes a wider pin as a range', () => {
    expect(throttlePlan({ platform: 'linux', cpuCount: 16, cpus: 4, hasTaskset: true }).argv).toEqual([
      'taskset',
      '-c',
      '0-3',
    ])
  })

  it('never asks for more cores than the machine has', () => {
    expect(throttlePlan({ platform: 'linux', cpuCount: 2, cpus: 8, hasTaskset: true }).argv).toEqual([
      'taskset',
      '-c',
      '0-1',
    ])
  })

  it('says so where the mechanism is missing, and warns that a green then proves nothing', () => {
    const noTool = throttlePlan({ platform: 'linux', cpuCount: 8, hasTaskset: false })
    expect(noTool.available).toBe(false)
    expect(noTool.why).toMatch(/util-linux/)
    const win = throttlePlan({ platform: 'win32', cpuCount: 8, hasTaskset: false })
    expect(win.available).toBe(false)
    expect(win.why).toMatch(/win32/)
    for (const plan of [noTool, win]) expect(plan.why).toMatch(/proves nothing about load/)
  })

  it('marks the deliberate control run as unthrottled', () => {
    const plan = throttlePlan({ platform: 'linux', cpuCount: 8, hasTaskset: true, throttle: false })
    expect(plan.available).toBe(false)
    expect(plan.how).toMatch(/control/)
  })

  it('is total on garbage', () => {
    expect(() => throttlePlan()).not.toThrow()
    expect(() => throttlePlan({ cpuCount: 'many', cpus: -3, hasTaskset: true, platform: 'linux' })).not.toThrow()
  })
})

describe('summarise — the skew rate and what reddened', () => {
  const green = { ok: true, checks: [] }
  const red = (...checks) => ({ ok: false, checks })

  it('counts the reds and ranks the checks by how often they failed', () => {
    const s = summarise([green, red('the goat stance'), red('the goat stance', 'the eaves column'), green])
    expect(s).toMatchObject({ runs: 4, reds: 2, rate: 0.5, timeouts: 0 })
    expect(s.byCheck).toEqual([
      { name: 'the goat stance', count: 2 },
      { name: 'the eaves column', count: 1 },
    ])
  })

  it('counts a killed run as red, and says how many were killed', () => {
    const s = summarise([green, { ok: false, checks: [], timedOut: true }])
    expect(s).toMatchObject({ reds: 1, timeouts: 1 })
  })

  it('is total on garbage', () => {
    expect(summarise(null)).toMatchObject({ runs: 0, reds: 0, rate: 0 })
    expect(() => summarise([null, 7, { ok: false, checks: 'nope' }])).not.toThrow()
  })
})

describe('verdictOf — a measurement, never a closing', () => {
  it('calls 8 of 8 a REPRODUCTION and asks for the mechanism (the point-600 standard)', () => {
    const v = verdictOf(summarise(Array.from({ length: 8 }, () => ({ ok: false, checks: ['the goat stance'] }))))
    expect(v).toMatch(/REPRODUCED — 8\/8/)
    expect(v).toMatch(/MECHANISM/)
  })

  it('calls a partial rate SKEWED and still sends the reader after the mechanism', () => {
    const v = verdictOf({ runs: 8, reds: 3, rate: 3 / 8 })
    expect(v).toMatch(/SKEWED — 3\/8/)
    expect(v).toMatch(/mechanism/)
  })

  it('does NOT close the red on 0 of 8 — it names the three ways out instead', () => {
    const v = verdictOf({ runs: 8, reds: 0, rate: 0 })
    expect(v).toMatch(/NOT REPRODUCED — 0\/8/)
    expect(v).toMatch(/do NOT close it/)
    expect(v).toMatch(/name its cause/)
    expect(v).toMatch(/charge it to the open point/)
    expect(v).toMatch(/file it as a point/)
  })

  it('refuses to read an unthrottled control as a load verdict', () => {
    expect(verdictOf({ runs: 8, reds: 0, rate: 0 }, { throttled: false })).toMatch(/measures nothing about load/)
  })

  it('says nothing was measured when nothing ran', () => {
    expect(verdictOf({ runs: 0, reds: 0, rate: 0 })).toMatch(/NOTHING MEASURED/)
  })
})

describe('formatProbeReport', () => {
  const plan = throttlePlan({ platform: 'linux', cpuCount: 16, cpus: 1, hasTaskset: true })

  it('names the throttle, every run, the rate and the verdict', () => {
    const lines = formatProbeReport({
      suite: 'polish',
      section: 'goat-stance',
      backend: 'webgpu',
      plan,
      results: [{ ok: false, checks: ['the goat stance'] }, { ok: true, checks: [] }],
    })
    const text = lines.join('\n')
    expect(text).toMatch(/polish --section=goat-stance \(webgpu\)/)
    expect(text).toMatch(/taskset -c 0/)
    expect(text).toMatch(/run {2}1 {2}RED {3}— the goat stance/)
    expect(text).toMatch(/run {2}2 {2}GREEN/)
    expect(text).toMatch(/SKEW RATE 1\/2 \(50 %\)/)
    expect(text).toMatch(/SKEWED/)
  })

  it('says a red named no check rather than printing an empty reason', () => {
    const text = formatProbeReport({ plan, results: [{ ok: false, checks: [] }] }).join('\n')
    expect(text).toMatch(/no check named/)
  })

  it('is total on garbage', () => {
    expect(() => formatProbeReport()).not.toThrow()
    expect(() => formatProbeReport({ results: [null, 3] })).not.toThrow()
  })
})
