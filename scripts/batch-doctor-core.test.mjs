// Remediation-planner sweep (scripts/batch-doctor-core.mjs): after a parallel-
// session incident the owner verifies the repo and — when the concurrent writes
// corrupted it — throws the suspect work away RECOVERABLY (rescue branch,
// named stash) instead of leaving a corrupted tree. The planner decides; the
// wrapper executes and logs.
import { describe, it, expect } from 'vitest'
import {
  planRemediation,
  needsRepair,
  isConsistent,
  isEvidenceGrade,
  describeLoad,
  judgeGateRun,
  gateKey,
  gateDemandSatisfied,
  shouldRecordSatisfaction,
  otherSessionsIn,
  alertNamesAnother,
  GATE_COMMANDS,
  INCONCLUSIVE_VERDICT,
  repoRepairDecision,
  resumeRepairMandate,
} from './batch-doctor-core.mjs'

const quiet = { level: 'quiet', reasons: [], agentWorktrees: [] }
const busy = { level: 'busy', reasons: ['CPU 91 % busy over 1 s'], agentWorktrees: [] }

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

// ---------------------------------------------------------------------------
// THE GATE MUST NOT BLAME THE CODE FOR THE LOAD (point 431)
// ---------------------------------------------------------------------------
// Three times in one afternoon the doctor declared the repo CONSISTENT and then
// accused the code of a unit suite that was green minutes later on the same
// commit — it had been competing with a delegated agent's build. A red is only
// evidence on a measured-quiet machine.

describe('isEvidenceGrade — which reading may convict', () => {
  it('a measured-quiet machine with no agent worktree is evidence', () => {
    expect(isEvidenceGrade(quiet)).toBe(true)
  })

  it('a busy or loaded machine is NOT evidence', () => {
    expect(isEvidenceGrade(busy)).toBe(false)
    expect(isEvidenceGrade({ level: 'loaded', agentWorktrees: [] })).toBe(false)
  })

  it('an UNMEASURED machine is not evidence either — an unread machine was believed once already', () => {
    expect(isEvidenceGrade({ level: 'unknown', agentWorktrees: [] })).toBe(false)
    expect(isEvidenceGrade({})).toBe(false)
    expect(isEvidenceGrade()).toBe(false)
  })

  it('a quiet CPU still is not evidence while an agent worktree is live', () => {
    expect(isEvidenceGrade({ level: 'quiet', agentWorktrees: ['.claude/worktrees/agent-a1'] })).toBe(false)
  })
})

describe('describeLoad — the message must name what was running', () => {
  it('names the live agent worktrees, with their count', () => {
    const text = describeLoad({ level: 'quiet', agentWorktrees: ['wt/agent-a1', 'wt/agent-a2'] })
    expect(text).toContain('2 live agent worktree')
    expect(text).toContain('wt/agent-a1')
    expect(text).toContain('wt/agent-a2')
  })

  it('names the measured load reasons', () => {
    expect(describeLoad(busy)).toContain('CPU 91 % busy over 1 s')
  })

  it('falls back to the bare level rather than claiming nothing ran', () => {
    expect(describeLoad({ level: 'unknown' })).toContain('unknown')
    expect(describeLoad()).toContain('unknown')
  })
})

describe('judgeGateRun — load vs defect', () => {
  it('the gate runs the three fast checks, in order', () => {
    expect(GATE_COMMANDS).toEqual(['npm run test:unit', 'npm run build', 'npm run lint'])
  })

  it('all green → neither broken nor inconclusive, and not a word of accusation', () => {
    const v = judgeGateRun(GATE_COMMANDS.map((cmd) => ({ cmd, failed: false, ...quiet })))
    expect(v.broken).toBe(false)
    expect(v.inconclusive).toBe(false)
    expect(v.lines).toEqual([])
  })

  it('RED on a BUSY machine → INCONCLUSIVE, no stop order, the load named', () => {
    const v = judgeGateRun([{ cmd: 'npm run test:unit', failed: true, ...busy }])
    expect(v.broken).toBe(false)
    expect(v.inconclusive).toBe(true)
    expect(v.lines[0]).toContain('INCONCLUSIVE (load)')
    expect(v.lines[0]).toContain('CPU 91 % busy over 1 s')
    expect(v.lines[0]).toContain('do NOT stop the batch')
    expect(v.lines[0]).not.toContain('the concurrent writes')
  })

  it('RED beside a live agent worktree → INCONCLUSIVE even though the CPU read quiet', () => {
    const v = judgeGateRun([
      { cmd: 'npm run test:unit', failed: true, level: 'quiet', reasons: [], agentWorktrees: ['wt/agent-a1'] },
    ])
    expect(v.inconclusive).toBe(true)
    expect(v.broken).toBe(false)
    expect(v.lines[0]).toContain('wt/agent-a1')
  })

  it("RED on a QUIET machine keeps today's wording and today's stop order", () => {
    const v = judgeGateRun([{ cmd: 'npm run test:unit', failed: true, ...quiet }])
    expect(v.broken).toBe(true)
    expect(v.inconclusive).toBe(false)
    expect(v.lines[0]).toBe(
      'gate: npm run test:unit FAILED — the concurrent writes (or the current head) broke it; fix before continuing the batch',
    )
  })

  it('the quiet reading reaches the VERDICT, not only the log line', () => {
    // The bug this guards: a run could print the right line and still exit 0.
    const red = judgeGateRun([{ cmd: 'npm run lint', failed: true, ...quiet }])
    expect(red.broken).toBe(true)
    const noisy = judgeGateRun([{ cmd: 'npm run lint', failed: true, ...busy }])
    expect(noisy.broken).toBe(false)
    expect(noisy.inconclusive).toBe(true)
  })

  it('the machine is judged PER COMMAND — a run that went quiet halfway still convicts', () => {
    const v = judgeGateRun([
      { cmd: 'npm run test:unit', failed: true, ...busy },
      { cmd: 'npm run lint', failed: true, ...quiet },
    ])
    expect(v.broken).toBe(true)
    expect(v.inconclusive).toBe(false)
  })

  it('EVIDENCE FIRST: the quiet red is ordered before the noisy one', () => {
    const v = judgeGateRun([
      { cmd: 'npm run test:unit', failed: true, ...busy },
      { cmd: 'npm run lint', failed: true, ...quiet },
    ])
    expect(v.ordered.map((r) => r.cmd)).toEqual(['npm run lint', 'npm run test:unit'])
    expect(v.lines[0]).toContain('npm run lint FAILED — the concurrent writes')
    expect(v.lines[1]).toContain('INCONCLUSIVE')
  })

  it('a garbage results argument is survived (fail-open), not thrown on', () => {
    expect(judgeGateRun().broken).toBe(false)
    expect(judgeGateRun(null).inconclusive).toBe(false)
    expect(judgeGateRun('nonsense').lines).toEqual([])
  })

  it('the inconclusive verdict asks for a repeat and lets the batch continue', () => {
    expect(INCONCLUSIVE_VERDICT).toContain('consistent')
    expect(INCONCLUSIVE_VERDICT).toContain('once the agent pool is idle')
    expect(INCONCLUSIVE_VERDICT).toContain('The batch continues')
  })
})

// ---------------------------------------------------------------------------
// THE DEMAND IS SATISFIED BY A STATE, NOT BY A TURN (point 431, second half)
// ---------------------------------------------------------------------------

describe('gateKey / gateDemandSatisfied — the state is judged, not the turn', () => {
  it('the same two sessions in either order are the same situation', () => {
    expect(gateKey({ head: 'abc', parallelSids: ['s1', 's2'] })).toBe(
      gateKey({ head: 'abc', parallelSids: ['s2', 's1'] }),
    )
  })

  it('duplicates and blanks do not change the key', () => {
    expect(gateKey({ head: 'abc', parallelSids: ['s1', 's1', '', null] })).toBe(
      gateKey({ head: 'abc', parallelSids: ['s1'] }),
    )
  })

  it('a repeated call with an unchanged (HEAD, parallel set) is already satisfied', () => {
    const state = { satisfiedGate: gateKey({ head: 'abc', parallelSids: ['s2'] }) }
    expect(gateDemandSatisfied({ state, head: 'abc', parallelSids: ['s2'] })).toBe(true)
  })

  it('a MOVED head re-opens the demand', () => {
    const state = { satisfiedGate: gateKey({ head: 'abc', parallelSids: ['s2'] }) }
    expect(gateDemandSatisfied({ state, head: 'def', parallelSids: ['s2'] })).toBe(false)
  })

  it('a NEW parallel session re-opens the demand', () => {
    const state = { satisfiedGate: gateKey({ head: 'abc', parallelSids: ['s2'] }) }
    expect(gateDemandSatisfied({ state, head: 'abc', parallelSids: ['s2', 's3'] })).toBe(false)
  })

  it('an unreadable head can never switch the demand off', () => {
    const state = { satisfiedGate: gateKey({ head: '', parallelSids: [] }) }
    expect(gateDemandSatisfied({ state, head: '', parallelSids: [] })).toBe(false)
    expect(gateDemandSatisfied({ state: {}, head: 'abc' })).toBe(false)
    expect(gateDemandSatisfied()).toBe(false)
  })
})

describe('shouldRecordSatisfaction — only a judgeable green may clear the demand', () => {
  it('a gate run that came out green records it', () => {
    expect(shouldRecordSatisfaction({ gateRan: true })).toBe(true)
  })

  it('a doctor run WITHOUT the gate never records it — no suite ran', () => {
    expect(shouldRecordSatisfaction({ gateRan: false })).toBe(false)
    expect(shouldRecordSatisfaction()).toBe(false)
  })

  it('an INCONCLUSIVE red must not buy a pass — that is this bug mirrored', () => {
    expect(shouldRecordSatisfaction({ gateRan: true, inconclusive: true })).toBe(false)
  })

  it('a real red, or a repair still pending, keeps the demand live', () => {
    expect(shouldRecordSatisfaction({ gateRan: true, broken: true })).toBe(false)
    expect(shouldRecordSatisfaction({ gateRan: true, pendingRepair: true })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// AN ALERT MUST NAME SOMEONE ELSE (point 431, third half)
// ---------------------------------------------------------------------------
// Twice in one evening the hook reported "PARALLEL SESSION DETECTED (10a2d2e0…)"
// — the id of the very session reading it — and ordered a three-minute gate for
// it.

describe('otherSessionsIn — an alert naming only the reader is no evidence', () => {
  const mine = '10a2d2e0-b1c8-4dbd-aec6-56eb221a8eee'
  const stranger = 'aa11bb22-cccc-dddd-eeee-ff0011223344'

  it("an activity record holding ONLY the reader's own id yields NO alert", () => {
    const alert = { parallel: [{ sid: mine }] }
    expect(otherSessionsIn({ alert, readerSid: mine, ownerSid: mine })).toEqual([])
    expect(alertNamesAnother({ alert, readerSid: mine, ownerSid: mine })).toBe(false)
  })

  it("a stranger's id yields an alert and NAMES it", () => {
    const alert = { parallel: [{ sid: stranger }] }
    expect(otherSessionsIn({ alert, readerSid: mine, ownerSid: mine })).toEqual([stranger])
    expect(alertNamesAnother({ alert, readerSid: mine, ownerSid: mine })).toBe(true)
  })

  it('the reader is filtered out of a mixed record, the stranger kept', () => {
    const alert = { parallel: [{ sid: mine }, { sid: stranger }] }
    expect(otherSessionsIn({ alert, readerSid: mine, ownerSid: mine })).toEqual([stranger])
  })

  it('the lock OWNER is excluded too — the owner is not a second writer', () => {
    const owner = 'owner-sid'
    const alert = { parallel: [{ sid: owner }] }
    expect(otherSessionsIn({ alert, readerSid: mine, ownerSid: owner })).toEqual([])
  })

  it('bare-string entries are accepted, and duplicates collapse', () => {
    const alert = { parallel: [stranger, { sid: stranger }] }
    expect(otherSessionsIn({ alert, readerSid: mine })).toEqual([stranger])
  })

  it('a missing, empty or malformed alert names nobody', () => {
    expect(otherSessionsIn({ alert: null, readerSid: mine })).toEqual([])
    expect(otherSessionsIn({ alert: { parallel: [] }, readerSid: mine })).toEqual([])
    expect(otherSessionsIn({ alert: { parallel: [{}, { sid: '' }, null] }, readerSid: mine })).toEqual([])
    expect(otherSessionsIn()).toEqual([])
    expect(alertNamesAnother()).toBe(false)
  })

  it('an unknown reader id still filters the owner, and never invents a stranger', () => {
    const alert = { parallel: [{ sid: 'owner-sid' }] }
    expect(otherSessionsIn({ alert, readerSid: '', ownerSid: 'owner-sid' })).toEqual([])
  })
})

// --- Point 442: the repair runs before the successor -----------------------------

describe('repoRepairDecision — the repo check the launcher runs before spawning', () => {
  it('spawns on a consistent verdict, with nothing to report', () => {
    expect(repoRepairDecision({ ran: true, code: 0 })).toEqual({ spawn: true, reason: 'consistent', alert: null })
  })

  it('REFUSES to spawn while repairs are still pending, and says the tree would be built upon', () => {
    const d = repoRepairDecision({ ran: true, code: 2 })
    expect(d.spawn).toBe(false)
    expect(d.reason).toBe('repairs-pending')
    expect(d.alert).toMatch(/torn tree/i)
    expect(d.alert).toMatch(/next tick/i)
  })

  it('REFUSES to spawn on findings no repair can clear, and says it needs hands', () => {
    const d = repoRepairDecision({ ran: true, code: 1 })
    expect(d.spawn).toBe(false)
    expect(d.reason).toBe('findings-remain')
    expect(d.alert).toMatch(/hands/i)
  })

  it('treats any other non-zero exit as findings rather than as permission to spawn', () => {
    for (const code of [3, 7, 127, 255]) expect(repoRepairDecision({ ran: true, code }).spawn).toBe(false)
  })

  it('FAILS OPEN when the doctor itself cannot run — a broken safeguard costs a diagnosis, never the work', () => {
    const d = repoRepairDecision({ ran: false, code: null })
    expect(d.spawn).toBe(true)
    expect(d.reason).toBe('doctor-unrunnable')
    expect(d.alert).toMatch(/WITHOUT a repo check/)
  })

  it('fails open on a nonsense exit status too, rather than throwing inside a launcher tick', () => {
    expect(repoRepairDecision({ ran: true, code: NaN }).spawn).toBe(false)
    expect(repoRepairDecision()).toEqual({ spawn: true, reason: 'consistent', alert: null })
  })
})

describe('resumeRepairMandate — the same seam, checked from the session side', () => {
  it('says nothing on a clean tree, so a healthy resume gains no noise', () => {
    expect(resumeRepairMandate({ ran: true, code: 0 })).toBeNull()
  })

  it('forbids starting work and names the one command that clears it', () => {
    const m = resumeRepairMandate({ ran: true, code: 2 })
    expect(m).toMatch(/DO NOT START WORKING/)
    expect(m).toMatch(/batch-doctor\.mjs --repair/)
    expect(m).toMatch(/exit 2/)
  })

  it('also fires for findings that need hands, so a mangled work order is never worked around', () => {
    expect(resumeRepairMandate({ ran: true, code: 1 })).toMatch(/DO NOT START WORKING/)
  })

  it('stays SILENT when the doctor could not run — the launcher already alerted, and a session cannot mend it', () => {
    expect(resumeRepairMandate({ ran: false, code: null })).toBeNull()
  })
})
