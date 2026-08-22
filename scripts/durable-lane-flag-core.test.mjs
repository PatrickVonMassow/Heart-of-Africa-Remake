// THE INTERLOCK THAT KEEPS THE DURABLE LANE DARK (point 834, step 1).
//
// The point's rule is that steps 1 to 4 land behind an activation flag and that the
// flag REFUSES to enable while steps 8 and 9 are not green — because controlling
// what the board advertises does not control what somebody switches on. These cases
// are that refusal, pinned.
import { describe, it, expect } from 'vitest'
import {
  DURABLE_LANE_STEPS,
  STEPS_REQUIRED_FOR_ACTIVATION,
  activationDecision,
  flagChange,
  mayStartDaemon,
} from './durable-lane-flag-core.mjs'

const green = (...steps) => {
  const out = {}
  for (const [n, step] of Object.entries(DURABLE_LANE_STEPS)) {
    out[n] = steps.includes(Number(n)) ? { ...step, green: true, evidence: `case for step ${n}` } : { ...step }
  }
  return out
}

describe('the activation interlock', () => {
  it('refuses today, and names every step it is waiting for', () => {
    const verdict = activationDecision()
    expect(verdict.ok).toBe(false)
    expect(verdict.missing).toEqual([...STEPS_REQUIRED_FOR_ACTIVATION])
    expect(verdict.reason).toMatch(/successor startup and reconciliation/)
    expect(verdict.reason).toMatch(/crash-recoverable serial landing/)
  })

  it('still refuses when steps 1 to 4 are green but 8 and 9 are not — durable execution is not transferable supervision', () => {
    const verdict = activationDecision({ steps: green(1, 2, 3, 4) })
    expect(verdict.ok).toBe(false)
    expect(verdict.missing).toEqual([8, 9])
  })

  it('does not count a step that claims green without evidence', () => {
    const steps = { ...green(1, 2, 3, 4, 8, 9) }
    steps[8] = { ...steps[8], evidence: null }
    expect(activationDecision({ steps }).missing).toEqual([8])
  })

  it('allows it only when every required step is green with evidence', () => {
    expect(activationDecision({ steps: green(...STEPS_REQUIRED_FOR_ACTIVATION) }).ok).toBe(true)
  })

  it('the shipped manifest has nothing green — the lane is dark as it stands', () => {
    for (const [n, step] of Object.entries(DURABLE_LANE_STEPS)) {
      expect(step.green, `step ${n}`).toBe(false)
    }
  })
})

describe('the door the flag opens', () => {
  it('refuses to start a daemon even when a hand-edited flag says enabled', () => {
    const verdict = mayStartDaemon({ flag: { enabled: true } })
    expect(verdict.ok).toBe(false)
    expect(verdict.missing).toEqual([...STEPS_REQUIRED_FOR_ACTIVATION])
  })

  it('refuses with the flag off even once every step is green', () => {
    const steps = green(...STEPS_REQUIRED_FOR_ACTIVATION)
    expect(mayStartDaemon({ flag: { enabled: false }, steps }).reason).toMatch(/off/)
    expect(mayStartDaemon({ flag: null, steps }).ok).toBe(false)
    expect(mayStartDaemon({ flag: { enabled: true }, steps }).ok).toBe(true)
  })
})

describe('setting the flag', () => {
  it('turning it OFF is always allowed and needs no evidence — a drain must never be blocked', () => {
    const out = flagChange({ flag: { enabled: true }, enable: false, at: 1, by: 'operator' })
    expect(out.ok).toBe(true)
    expect(out.flag.enabled).toBe(false)
  })

  it('turning it ON is refused by the same interlock', () => {
    expect(flagChange({ flag: { enabled: false }, enable: true }).ok).toBe(false)
    const out = flagChange({
      flag: { enabled: false },
      enable: true,
      steps: green(...STEPS_REQUIRED_FOR_ACTIVATION),
      at: 2,
      by: 'operator',
    })
    expect(out.ok).toBe(true)
    expect(out.flag).toMatchObject({ enabled: true, changedAt: 2, changedBy: 'operator' })
  })
})
