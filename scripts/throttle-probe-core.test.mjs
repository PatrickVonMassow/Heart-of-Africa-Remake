// The throttle probe's decisions (point 640): what the command line means, what
// throttling a host can really apply, how a run-all log reads, and what a skew
// rate is worth.
//
// Two properties matter more than the parsing. A throttle is applied or ADMITTED
// MISSING — never claimed — because a report that names a rate it never imposed
// answers a different question with the same words. And no outcome closes a red:
// the failure this whole point exists to stop was exactly a green run being read
// as a verdict.
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CPUS,
  DEFAULT_RATE,
  DEFAULT_RUNS,
  classifyRun,
  formatProbeReport,
  parseCpusAllowedList,
  parseProbeArgs,
  runnerSummary,
  suiteOutput,
  summarise,
  throttlePlan,
  verdictOf,
} from './throttle-probe-core.mjs'

describe('parseProbeArgs', () => {
  it('reads the point-600 shape: one suite, one section, eight runs', () => {
    const o = parseProbeArgs(['polish', '--section=goat-stance'])
    expect(o).toMatchObject({
      suite: 'polish',
      section: 'goat-stance',
      runs: DEFAULT_RUNS,
      cpus: DEFAULT_CPUS,
      rate: DEFAULT_RATE,
    })
    expect(o.error).toBeNull()
  })

  it('takes a value attached or detached', () => {
    expect(parseProbeArgs(['polish', '--section', 'goat-stance', '--runs', '4']).runs).toBe(4)
    expect(parseProbeArgs(['polish', '--section=goat-stance', '--runs=4']).runs).toBe(4)
    expect(parseProbeArgs(['polish', '--section=x', '--rate=20']).rate).toBe(20)
  })

  it('REFUSES a whole-suite probe — the instrument measures one named block', () => {
    expect(parseProbeArgs(['polish']).error).toMatch(/--section=<name> is required/)
  })

  it('refuses a nonsense count rather than quietly measuring something else', () => {
    expect(parseProbeArgs(['polish', '--section=x', '--runs=0']).error).toMatch(/--runs/)
    expect(parseProbeArgs(['polish', '--section=x', '--runs=2.5']).error).toMatch(/--runs/)
    expect(parseProbeArgs(['polish', '--section=x', '--runs=9999']).error).toMatch(/--runs/)
    expect(parseProbeArgs(['polish', '--section=x', '--cpus=nope']).error).toMatch(/--cpus/)
    expect(parseProbeArgs(['polish', '--section=x', '--rate=0']).error).toMatch(/--rate/)
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
    expect(() => parseProbeArgs([{ toString() { throw new Error('no') } }])).not.toThrow()
  })
})

describe('parseCpusAllowedList — the REAL mask, not a core count', () => {
  it('reads ranges, singles and a mix', () => {
    expect(parseCpusAllowedList('Name:\tnode\nCpus_allowed_list:\t0-3\n')).toEqual([0, 1, 2, 3])
    expect(parseCpusAllowedList('Cpus_allowed_list:\t2,4-5,9\n')).toEqual([2, 4, 5, 9])
  })

  it('answers nothing when the field is absent or unreadable — never a guess', () => {
    expect(parseCpusAllowedList('Cpus_allowed:\tffff\n')).toEqual([])
    expect(parseCpusAllowedList(null)).toEqual([])
    expect(parseCpusAllowedList('Cpus_allowed_list:\tnonsense\n')).toEqual([])
  })
})

describe('throttlePlan — a throttle is applied or admitted missing, never faked', () => {
  const linux = { platform: 'linux', hasTaskset: true, allowedCpus: [0, 1, 2, 3, 4, 5, 6, 7] }

  it('pins the whole run to one permitted core and squeezes it at the rate', () => {
    const plan = throttlePlan({ ...linux, cpus: 1, rate: 4 })
    expect(plan.available).toBe(true)
    expect(plan.argv).toEqual(['taskset', '-c', '0'])
    expect(plan.spinners).toBe(3)
    expect(plan.how).toMatch(/about 1\/4 of a core/)
  })

  it('pins to the cores the MASK permits, not to 0..n — a cpuset without CPU 0 is real', () => {
    const plan = throttlePlan({ platform: 'linux', hasTaskset: true, allowedCpus: [5, 6, 7], cpus: 2, rate: 1 })
    expect(plan.argv).toEqual(['taskset', '-c', '5,6'])
    expect(plan.spinners).toBe(0)
  })

  it('never asks for more cores than the mask permits', () => {
    expect(throttlePlan({ platform: 'linux', hasTaskset: true, allowedCpus: [3], cpus: 8 }).argv).toEqual([
      'taskset',
      '-c',
      '3',
    ])
  })

  it('says so where the mechanism is missing, and warns that a green then proves nothing', () => {
    const noTool = throttlePlan({ ...linux, hasTaskset: false })
    const noMask = throttlePlan({ platform: 'linux', hasTaskset: true, allowedCpus: [] })
    const win = throttlePlan({ platform: 'win32', hasTaskset: false, allowedCpus: [0, 1] })
    for (const plan of [noTool, noMask, win]) {
      expect(plan.available).toBe(false)
      expect(plan.argv).toEqual([])
    }
    expect(noTool.why).toMatch(/util-linux/)
    expect(noMask.why).toMatch(/mask could not be read/)
    expect(win.why).toMatch(/win32/)
  })

  it('marks the deliberate control run as unthrottled', () => {
    const plan = throttlePlan({ ...linux, throttle: false })
    expect(plan.available).toBe(false)
    expect(plan.how).toMatch(/control/)
  })

  it('is total on garbage', () => {
    expect(() => throttlePlan()).not.toThrow()
    expect(() => throttlePlan(null)).not.toThrow()
    expect(() => throttlePlan({ platform: 'linux', hasTaskset: true, allowedCpus: 'many', cpus: -3, rate: -1 })).not.toThrow()
  })
})

describe('reading a run-all log', () => {
  const log = [
    '# PARTIAL: only section "ctrl-actor-labels" of polish — NOT suite coverage (point 566)',
    'FAIL  polish       7 pass, 1 fail, 0 console-errors (exit 1)',
    "      FAIL  holding Ctrl names the settlement's people and animals (point 342) — 23 labels: Villager",
    '',
    '1 SUITE(S) FAILED',
  ].join('\n')

  it('takes the SUITE\'s own red, not the runner\'s summary line', () => {
    expect(suiteOutput(log).split('\n')).toEqual([
      "FAIL  holding Ctrl names the settlement's people and animals (point 342) — 23 labels: Villager",
    ])
  })

  it('falls back to the whole output when a suite was run directly', () => {
    expect(suiteOutput('FAIL  a check run without the runner — 1\n')).toMatch(/a check run without the runner/)
  })

  it('reads the runner summary, which is the only place the check COUNTS appear', () => {
    expect(runnerSummary(log)).toEqual({ suite: 'polish', pass: 7, fail: 1, consoleErrors: 0, exit: 1 })
    expect(runnerSummary('nothing of the sort')).toBeNull()
  })
})

describe('classifyRun — three of the four outcomes are NOT "the check failed"', () => {
  it('calls exit 0 green', () => {
    expect(classifyRun({ exit: 0 })).toBe('green')
  })

  it('calls a reported failure red', () => {
    expect(classifyRun({ exit: 1, summary: { fail: 1, consoleErrors: 0 } })).toBe('red')
    expect(classifyRun({ exit: 1, summary: { fail: 0, consoleErrors: 2 } })).toBe('red')
    expect(classifyRun({ exit: 1, checks: ['a named red'] })).toBe('red')
  })

  it('calls a killed run KILLED, never a red — it reached no verdict', () => {
    expect(classifyRun({ timedOut: true, exit: null })).toBe('killed')
  })

  it('calls a run whose suite never reported BROKEN — a failed pin is not a defect', () => {
    expect(classifyRun({ exit: 1, summary: null, checks: [] })).toBe('broken')
    expect(classifyRun({ exit: 127 })).toBe('broken')
  })
})

describe('summarise — the rate is taken over the runs that produced a verdict', () => {
  const green = { kind: 'green', checks: [] }
  const red = (...checks) => ({ kind: 'red', checks })

  it('counts the reds and ranks the checks by how often they failed', () => {
    const s = summarise([green, red('the goat stance'), red('the goat stance', 'the eaves column'), green])
    expect(s).toMatchObject({ runs: 4, judged: 4, reds: 2, greens: 2, rate: 0.5 })
    expect(s.byCheck).toEqual([
      { name: 'the goat stance', count: 2 },
      { name: 'the eaves column', count: 1 },
    ])
  })

  it('keeps killed and broken runs OUT of the rate, and counts them separately', () => {
    const s = summarise([green, red('x'), { kind: 'killed', checks: [] }, { kind: 'broken', checks: [] }])
    expect(s).toMatchObject({ runs: 4, judged: 2, reds: 1, killed: 1, broken: 1, rate: 0.5 })
  })

  it('is total on garbage', () => {
    expect(summarise(null)).toMatchObject({ runs: 0, reds: 0, rate: 0 })
    expect(() => summarise([null, 7, { kind: 'red', checks: 'nope' }])).not.toThrow()
  })
})

describe('verdictOf — a measurement, never a closing', () => {
  it('calls 8 of 8 a REPRODUCTION, asks for the control and for the mechanism', () => {
    const v = verdictOf(summarise(Array.from({ length: 8 }, () => ({ kind: 'red', checks: ['the goat stance'] }))))
    expect(v).toMatch(/REPRODUCED — 8\/8/)
    expect(v).toMatch(/--no-throttle/)
    expect(v).toMatch(/MECHANISM/)
  })

  it('calls a partial rate SKEWED and offers a harder squeeze', () => {
    const v = verdictOf({ judged: 8, reds: 3, rate: 3 / 8 })
    expect(v).toMatch(/SKEWED — 3\/8/)
    expect(v).toMatch(/--rate/)
  })

  it('does NOT close the red on 0 of 8 — it names the three ways out instead', () => {
    const v = verdictOf({ judged: 8, reds: 0, rate: 0 })
    expect(v).toMatch(/NOT REPRODUCED — 0\/8/)
    expect(v).toMatch(/do NOT close it/)
    expect(v).toMatch(/name its cause/)
    expect(v).toMatch(/charge it to the open point/)
    expect(v).toMatch(/file it as a point/)
  })

  it('refuses to read an unthrottled control as a load verdict', () => {
    expect(verdictOf({ judged: 8, reds: 0, rate: 0 }, { throttled: false })).toMatch(/says nothing about load/)
  })

  it('never reports eight broken launches as a reproduction', () => {
    const s = summarise(Array.from({ length: 8 }, () => ({ kind: 'broken', checks: [] })))
    const v = verdictOf(s)
    expect(v).toMatch(/NOTHING MEASURED/)
    expect(v).not.toMatch(/REPRODUCED —/)
    expect(v).toMatch(/8 run\(s\) reached NO verdict/)
  })

  it('names the lost runs beside a real rate, so a rate over three of eight is not read as eight', () => {
    const s = summarise([
      { kind: 'red', checks: ['x'] },
      { kind: 'red', checks: ['x'] },
      { kind: 'green', checks: [] },
      { kind: 'killed', checks: [] },
    ])
    expect(verdictOf(s)).toMatch(/2\/3 runs red under the throttle.*1 run\(s\) reached NO verdict/s)
  })
})

describe('formatProbeReport', () => {
  const plan = throttlePlan({ platform: 'linux', hasTaskset: true, allowedCpus: [0, 1], cpus: 1, rate: 4 })

  it('names the throttle, every run, the rate and the verdict', () => {
    const lines = formatProbeReport({
      suite: 'polish',
      section: 'goat-stance',
      backend: 'webgpu',
      plan,
      results: [{ kind: 'red', checks: ['the goat stance'] }, { kind: 'green', checks: [] }],
    })
    const text = lines.join('\n')
    expect(text).toMatch(/polish --section=goat-stance \(webgpu\)/)
    expect(text).toMatch(/taskset -c 0/)
    expect(text).toMatch(/run {2}1 {2}RED {4}— the goat stance/)
    expect(text).toMatch(/run {2}2 {2}GREEN/)
    expect(text).toMatch(/SKEW RATE 1\/2 \(50 %\)/)
    expect(text).toMatch(/SKEWED/)
  })

  it('marks a killed and a broken run as no verdict, not as reds', () => {
    const text = formatProbeReport({
      plan,
      results: [{ kind: 'killed', checks: [] }, { kind: 'broken', checks: [], exit: 127 }],
    }).join('\n')
    expect(text).toMatch(/KILLED — no verdict/)
    expect(text).toMatch(/BROKEN — no verdict: the suite never reported \(exit 127\)/)
    expect(text).toMatch(/SKEW RATE 0\/0/)
  })

  it('says a red named no check rather than printing an empty reason', () => {
    expect(formatProbeReport({ plan, results: [{ kind: 'red', checks: [] }] }).join('\n')).toMatch(/no check named/)
  })

  it('is total on garbage', () => {
    expect(() => formatProbeReport()).not.toThrow()
    expect(() => formatProbeReport({ results: [null, 3] })).not.toThrow()
    expect(() => formatProbeReport({ summary: { runs: 1, reds: 0, rate: 0 } })).not.toThrow()
  })
})
