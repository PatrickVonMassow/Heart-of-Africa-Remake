// THE INTERLOCK THAT KEEPS THE DURABLE LANE DARK (point 891, step 1).
//
// The point's rule is that steps 1 to 4 land behind an activation flag and that the
// flag REFUSES to enable while steps 8 and 9 and the step 12 drills are not green —
// because controlling what the board advertises does not control what somebody
// switches on. These cases are that refusal, pinned.
import { describe, it, expect } from 'vitest'
import {
  DURABLE_LANE_BOUNDARY_MECHANISM,
  DURABLE_LANE_STEPS,
  REQUIRED_BOUNDARY_MODE,
  STEPS_REQUIRED_FOR_ACTIVATION,
  activationDecision,
  flagChange,
  mayStartDaemon,
} from './durable-lane-flag-core.mjs'

const evidencedBoundary = Object.freeze({
  ...DURABLE_LANE_BOUNDARY_MECHANISM,
  green: true,
  evidence: 'close-admission is durably enforced by the daemon control plane',
})

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
    expect(verdict.missing).toEqual([8, 9, 12])
  })

  it('still refuses when the mechanisms are green but the staged failure trials have not proved the real path', () => {
    const verdict = activationDecision({
      steps: green(1, 2, 3, 4, 8, 9),
      boundaryMode: REQUIRED_BOUNDARY_MODE,
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.missing).toEqual([12])
    expect(verdict.reason).toMatch(/staged failure trials/)
  })

  it('does not count a step that claims green without evidence', () => {
    const steps = { ...green(...STEPS_REQUIRED_FOR_ACTIVATION) }
    steps[8] = { ...steps[8], evidence: null }
    expect(activationDecision({ steps }).missing).toEqual([8])
  })

  it('allows it only when every required step is green with evidence', () => {
    expect(
      activationDecision({
        steps: green(...STEPS_REQUIRED_FOR_ACTIVATION),
        boundaryMode: REQUIRED_BOUNDARY_MODE,
        boundaryMechanism: evidencedBoundary,
      }).ok,
    ).toBe(true)
  })

  it('demands drain-before-boundary even after every activation step is green — crash survival is not planned handover', () => {
    const steps = green(...STEPS_REQUIRED_FOR_ACTIVATION)
    for (const boundaryMode of [null, 'planned-handover', 'checkpoint-handover']) {
      const verdict = activationDecision({ steps, boundaryMode, boundaryMechanism: evidencedBoundary })
      expect(verdict.ok, String(boundaryMode)).toBe(false)
      expect(verdict.reason).toMatch(/drain-before-boundary/)
      expect(verdict.reason).toMatch(/steps 6 and 7/)
    }
  })

  it('refuses a named boundary mode without green evidence that its enforcement exists', () => {
    const steps = green(...STEPS_REQUIRED_FOR_ACTIVATION)
    const absent = activationDecision({ steps, boundaryMode: REQUIRED_BOUNDARY_MODE })
    expect(absent).toMatchObject({ ok: false, missingBoundaryMechanism: true })
    expect(absent.reason).toMatch(/boundary mechanism: drain-before-boundary enforcement/)

    for (const boundaryMechanism of [
      { ...DURABLE_LANE_BOUNDARY_MECHANISM, green: 'yes', evidence: 'a claim' },
      { ...DURABLE_LANE_BOUNDARY_MECHANISM, green: true, evidence: '   ' },
    ]) {
      expect(activationDecision({ steps, boundaryMode: REQUIRED_BOUNDARY_MODE, boundaryMechanism }).ok).toBe(false)
    }
  })

  it('counts only an AFFIRMATIVE green with real evidence — a truthy claim in the wrong shape is a claim', () => {
    const truthyGreen = green(...STEPS_REQUIRED_FOR_ACTIVATION)
    truthyGreen[8] = { ...truthyGreen[8], green: 'yes' }
    expect(activationDecision({ steps: truthyGreen }).missing).toEqual([8])
    const blankEvidence = green(...STEPS_REQUIRED_FOR_ACTIVATION)
    blankEvidence[9] = { ...blankEvidence[9], evidence: '   ' }
    expect(activationDecision({ steps: blankEvidence }).missing).toEqual([9])
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
    expect(mayStartDaemon({ flag: { enabled: true }, steps }).ok).toBe(false)
    expect(mayStartDaemon({ flag: { enabled: true, boundaryMode: REQUIRED_BOUNDARY_MODE }, steps, boundaryMechanism: evidencedBoundary }).ok).toBe(true)
  })

  it('a hand-edited flag that is merely truthy reads as off', () => {
    const steps = green(...STEPS_REQUIRED_FOR_ACTIVATION)
    expect(mayStartDaemon({ flag: { enabled: 1, boundaryMode: REQUIRED_BOUNDARY_MODE }, steps, boundaryMechanism: evidencedBoundary }).ok).toBe(false)
    expect(mayStartDaemon({ flag: { enabled: 'true', boundaryMode: REQUIRED_BOUNDARY_MODE }, steps, boundaryMechanism: evidencedBoundary }).ok).toBe(false)
  })
})

describe('setting the flag', () => {
  it('turning it OFF is always allowed and needs no evidence — a drain must never be blocked', () => {
    const out = flagChange({ flag: { enabled: true }, enable: false, at: 1, by: 'operator' })
    expect(out.ok).toBe(true)
    expect(out.flag.enabled).toBe(false)
  })

  it('a change request that is not the affirmative true DISABLES — off is the safe direction', () => {
    const out = flagChange({ flag: { enabled: true }, enable: 'yes', steps: green(...STEPS_REQUIRED_FOR_ACTIVATION) })
    expect(out.ok).toBe(true)
    expect(out.flag.enabled).toBe(false)
  })

  it('turning it ON is refused by the same interlock', () => {
    expect(flagChange({ flag: { enabled: false }, enable: true }).ok).toBe(false)
    const steps = green(...STEPS_REQUIRED_FOR_ACTIVATION)
    const unsafeBoundary = flagChange({
      flag: { enabled: false },
      enable: true,
      steps,
      boundaryMechanism: evidencedBoundary,
      boundaryMode: 'planned-handover',
    })
    expect(unsafeBoundary.ok).toBe(false)
    expect(unsafeBoundary.reason).toMatch(/drain-before-boundary/)
    const out = flagChange({
      flag: { enabled: false },
      enable: true,
      steps,
      boundaryMechanism: evidencedBoundary,
      boundaryMode: REQUIRED_BOUNDARY_MODE,
      at: 2,
      by: 'operator',
    })
    expect(out.ok).toBe(true)
    expect(out.flag).toMatchObject({
      enabled: true,
      boundaryMode: REQUIRED_BOUNDARY_MODE,
      changedAt: 2,
      changedBy: 'operator',
    })
  })
})
