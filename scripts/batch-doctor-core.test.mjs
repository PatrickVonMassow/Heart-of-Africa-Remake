// Remediation-planner sweep (scripts/batch-doctor-core.mjs): after a parallel-
// session incident the owner verifies the repo and — when the concurrent writes
// corrupted it — throws the suspect work away RECOVERABLY (rescue branch,
// named stash) instead of leaving a corrupted tree. The planner decides; the
// wrapper executes and logs.
import { describe, it, expect } from 'vitest'
import { planRemediation, needsRepair, isConsistent } from './batch-doctor-core.mjs'

const clean = {
  branch: 'main',
  mergeInProgress: false,
  dirtyFiles: [],
  conflictMarkers: false,
  divergence: { ahead: 0, behind: 0 },
  tasksParses: true,
  parallelDetected: false,
}

describe('planRemediation', () => {
  it('a consistent repo plans nothing → the batch continues', () => {
    const plan = planRemediation(clean)
    expect(isConsistent(plan)).toBe(true)
    expect(needsRepair(plan)).toBe(false)
  })

  it('ahead-only (unpushed owner commits) is the NORMAL state — no action', () => {
    const plan = planRemediation({ ...clean, divergence: { ahead: 3, behind: 0 } })
    expect(plan).toEqual([])
  })

  it('behind-only → auto fast-forward', () => {
    const plan = planRemediation({ ...clean, divergence: { ahead: 0, behind: 2 } })
    expect(plan.map((a) => a.action)).toEqual(['fast-forward'])
    expect(plan[0].level).toBe('auto')
  })

  it('DIVERGED main (the two-session signature) → rescue branch + hard reset, repair-gated', () => {
    const plan = planRemediation({ ...clean, divergence: { ahead: 2, behind: 3 }, parallelDetected: true })
    expect(plan.map((a) => a.action)).toContain('rescue-and-reset')
    expect(plan.find((a) => a.action === 'rescue-and-reset').level).toBe('repair')
    expect(needsRepair(plan)).toBe(true)
  })

  it('a half-done merge → abort-merge (repair-gated, restores the pre-merge state)', () => {
    const plan = planRemediation({ ...clean, mergeInProgress: true })
    expect(plan.map((a) => a.action)).toEqual(['abort-merge'])
    expect(needsRepair(plan)).toBe(true)
  })

  it('uncommitted edits DURING a parallel window → quarantine-stash (recoverable discard)', () => {
    const plan = planRemediation({ ...clean, dirtyFiles: ['src/x.ts'], parallelDetected: true })
    expect(plan.map((a) => a.action)).toEqual(['quarantine-stash'])
    expect(plan[0].level).toBe('repair')
  })

  it("uncommitted edits WITHOUT a parallel window are the owner's own WIP — no quarantine", () => {
    const plan = planRemediation({ ...clean, dirtyFiles: ['src/x.ts'] })
    expect(plan).toEqual([])
  })

  it('conflict markers in tracked files → quarantine (if dirty) and an alert', () => {
    const plan = planRemediation({ ...clean, dirtyFiles: ['src/x.ts'], conflictMarkers: true })
    expect(plan.map((a) => a.action)).toContain('quarantine-stash')
    expect(plan.map((a) => a.action)).toContain('alert-conflict-markers')
  })

  it('a mangled TASKS.md → alert only (fix by hand, never auto-rewrite the work order)', () => {
    const plan = planRemediation({ ...clean, tasksParses: false })
    expect(plan.map((a) => a.action)).toEqual(['alert-tasks-format'])
    expect(plan[0].level).toBe('alert')
    expect(needsRepair(plan)).toBe(false)
  })

  it('the full incident state plans everything, ordered: abort, quarantine, rescue', () => {
    const plan = planRemediation({
      ...clean,
      mergeInProgress: true,
      dirtyFiles: ['a', 'b'],
      divergence: { ahead: 1, behind: 4 },
      parallelDetected: true,
    })
    expect(plan.map((a) => a.action)).toEqual(['abort-merge', 'quarantine-stash', 'rescue-and-reset'])
    expect(needsRepair(plan)).toBe(true)
  })
})
