// The benchmark's entry points (point 280). A single function key was the sole
// way in, and on the user's machine that key never reached the page at all —
// so the paths that cannot be intercepted are pinned here.
import { describe, it, expect } from 'vitest'
import { benchmarkFromUrl } from './startBenchmark'

describe('benchmark URL entry point', () => {
  it('does not start when the parameter is absent', () => {
    expect(benchmarkFromUrl('')).toEqual({ start: false, short: false })
    expect(benchmarkFromUrl('?lang=de')).toEqual({ start: false, short: false })
  })

  it('starts on the plain parameter, however it is written', () => {
    expect(benchmarkFromUrl('?bench=1').start).toBe(true)
    expect(benchmarkFromUrl('?bench=').start).toBe(true) // a bare ?bench= still means "run it"
    expect(benchmarkFromUrl('?lang=de&bench=1').start).toBe(true)
  })

  it('takes the short sampling only when asked for it', () => {
    expect(benchmarkFromUrl('?bench=short')).toEqual({ start: true, short: true })
    expect(benchmarkFromUrl('?bench=1').short).toBe(false)
  })

  it('an explicit off value does not start it', () => {
    // So a link can carry the parameter without firing — the automated check
    // and a shared URL both need to be able to say "no".
    expect(benchmarkFromUrl('?bench=0').start).toBe(false)
    expect(benchmarkFromUrl('?bench=false').start).toBe(false)
  })
})
