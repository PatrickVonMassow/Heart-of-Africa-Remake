// Decision-logic sweep of the waiting-time prep guard (prep-guard-core).
import { describe, it, expect } from 'vitest'
import { evaluatePrep } from './prep-guard-core.mjs'

describe('evaluatePrep', () => {
  it('allows with no wait armed', () => {
    expect(evaluatePrep({ marker: null }).block).toBe(false)
  })

  it('BLOCKS while a wait is armed and no prep is recorded', () => {
    const v = evaluatePrep({ marker: { task: 'the LARGE regression', prepped: false } })
    expect(v.block).toBe(true)
    expect(v.reason).toContain('the LARGE regression')
    expect(v.reason).toMatch(/--prepped/)
  })

  it('allows once the prep is recorded', () => {
    expect(evaluatePrep({ marker: { task: 'x', prepped: true } }).block).toBe(false)
  })

  it('names a fallback task when the marker carries none', () => {
    expect(evaluatePrep({ marker: { prepped: false } }).reason).toContain('a background validation')
  })

  it('is total on rubbish (fail-open)', () => {
    expect(evaluatePrep().block).toBe(false)
    expect(evaluatePrep({ marker: 'nonsense' }).block).toBe(false)
    expect(evaluatePrep({ marker: 42 }).block).toBe(false)
  })
})
