// THE INTERLOCK THAT KEEPS THE DURABLE LANE DARK (point 891, step 1).
//
// The point's rule is that steps 1 to 4 land behind an activation flag and that the
// flag REFUSES to enable while steps 8 and 9 and the step 12 drills are not green —
// because controlling what the board advertises does not control what somebody
// switches on. These cases are that refusal, pinned.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
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
    out[n] = steps.includes(Number(n)) ? { ...step, green: true, evidence: `case for step ${n}` } : { ...step, green: false, evidence: null }
  }
  return out
}

describe('the activation interlock', () => {
  it('ships every proved step but refuses when no boundary mode is presented', () => {
    const verdict = activationDecision()
    expect(verdict.ok).toBe(false)
    expect(verdict.missing).toBeUndefined()
    expect(verdict.reason).toMatch(/checkpointed-handover/)
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

  it('demands checkpointed handover after steps 6 and 7 become green', () => {
    const steps = green(...STEPS_REQUIRED_FOR_ACTIVATION)
    for (const boundaryMode of [null, 'planned-handover', 'drain-before-boundary']) {
      const verdict = activationDecision({ steps, boundaryMode, boundaryMechanism: evidencedBoundary })
      expect(verdict.ok, String(boundaryMode)).toBe(false)
      expect(verdict.reason).toMatch(/checkpointed-handover/)
    }
  })

  it('refuses a named boundary mode without green evidence that its enforcement exists', () => {
    const steps = green(...STEPS_REQUIRED_FOR_ACTIVATION)
    const absent = activationDecision({ steps, boundaryMode: REQUIRED_BOUNDARY_MODE, boundaryMechanism: { ...DURABLE_LANE_BOUNDARY_MECHANISM, green: false, evidence: null } })
    expect(absent).toMatchObject({ ok: false, missingBoundaryMechanism: true })
    expect(absent.reason).toMatch(/boundary mechanism: checkpointed two-phase boundary enforcement/)

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

  it('the shipped manifest records green evidence for every activation step', () => {
    for (const [n, step] of Object.entries(DURABLE_LANE_STEPS)) {
      expect(step.green, `step ${n}`).toBe(true)
      expect(step.evidence, `step ${n}`).toMatch(/\S/)
    }
    expect(DURABLE_LANE_STEPS[12].evidence).toMatch(/real daemon, worker, remote, worktree, marker, restart, and checkpoint-timeout drills/)
  })
})

describe('the door the flag opens', () => {
  it('ships the proved Sol-only mode dark until the representative trial exists', () => {
    const flag = JSON.parse(readFileSync('.claude/durable-lane-flag.json', 'utf8'))
    expect(flag).toMatchObject({ enabled: false, boundaryMode: REQUIRED_BOUNDARY_MODE, adapters: ['sol'] })
  })

  it('refuses an enabled flag that omits the proved boundary mode', () => {
    const verdict = mayStartDaemon({ flag: { enabled: true } })
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toMatch(/checkpointed-handover/)
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
    expect(unsafeBoundary.reason).toMatch(/checkpointed-handover/)
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
