// The commissioning guard (point 712): the two refusals as the wrapper combines
// them, and the stand-downs that keep them off a subagent and a paused batch.
//
// The decisions themselves — the queue front, the branch slots and the call
// classifier — are swept in board-queue-core.test.mjs and
// batch-in-flight-core.test.mjs; what is under test here is the wiring: which
// facts reach which decision, and when the guard says nothing at all.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { COMMISSION_HOOK_LINE, gatherCommissionInputs, commissionVerdict, wiringReport } from './commission-guard.mjs'
import { POOL_CAP } from './batch-in-flight-core.mjs'

const AUG17 = Date.parse('2026-08-17T19:41:00.000Z')
const days = (n) => n * 86400000
const hours = (n) => n * 3600000

/** The work order's open head on 17.08.2026, in its own sequence. */
const TASKS = [700, 701, 707, 708, 711, 697].map((n) => `- [ ] ${n}. Something to do.`).join('\n')

const NINE = [
  { ref: 'feat/336-croc-staging', tipAt: AUG17 - days(13), behind: 1679 },
  { ref: 'feat/686-five-word-lexicon', tipAt: AUG17 - days(4), behind: 81 },
  { ref: 'feat/687-bank-game', tipAt: AUG17 - days(3), behind: 81 },
  { ref: 'feat/687-roam-bound-fixes', tipAt: AUG17 - hours(9), behind: 12 },
  { ref: 'feat/581-settlement-boundary-contrast', tipAt: AUG17 - hours(10), behind: 14 },
  { ref: 'feat/595-598-verification-ladder-brief', tipAt: AUG17 - hours(8), behind: 9 },
  { ref: 'feat/703-board-write-report', tipAt: AUG17 - hours(4), behind: 5 },
  { ref: 'feat/700-context-fence', tipAt: AUG17 - hours(2), behind: 2 },
  { ref: 'feat/711-queue-rank', tipAt: AUG17 - hours(1), behind: 1 },
]

const gather = (point, { branches = [], record, ...rest } = {}) =>
  gatherCommissionInputs({
    point,
    cwd: '/repo',
    paused: false,
    otherOwner: false,
    tasksText: TASKS,
    branchProbe: () => ({ readable: true, branches }),
    record: record ?? { overrides: {}, parked: {}, torn: false },
    ...rest,
  })


describe('the wrapper — both refusals, and the stand-downs', () => {
  it('refuses the real 17.08.2026 pick on BOTH counts and names each', () => {
    const g = gather(697, { branches: NINE })
    expect(g.applicable).toBe(true)
    const v = commissionVerdict(g.inputs, { now: AUG17 })
    expect(v.block).toBe(true)
    // 700 and 711 are skipped as candidates here BECAUSE their branches stand
    // open in this fixture — the front names what could actually be started.
    expect(v.reason).toContain('701, 707, 708')
    expect(v.reason).toContain('feat/336-croc-staging')
    expect(v.queue.why).toBe('behind-front')
    expect(v.slots.why).toBe('branches-open')
  })

  it('lets a front candidate through while two branches stand open', () => {
    const v = commissionVerdict(gather(700, { branches: NINE.slice(0, 2) }).inputs, { now: AUG17 })
    expect(v.block).toBe(false)
    expect(v.queue.why).toBe('at-front')
    expect(v.slots.why).toBe('slots-free')
  })

  it('still refuses a front candidate while the branches are full', () => {
    const v = commissionVerdict(gather(701, { branches: NINE }).inputs, { now: AUG17 })
    expect(v.block).toBe(true)
    expect(v.queue.allowed).toBe(true)
    expect(v.reason).toContain('A SLOT IS NOT FREE')
    expect(v.reason).not.toContain('ANSWERS TO NOTHING')
  })

  it('accepts a recorded override for the queue, and reports the reason back', () => {
    const record = {
      overrides: { 697: { reason: 'red on main masks other suites', at: '2026-08-17T19:41:00.000Z' } },
      parked: {},
      torn: false,
    }
    const g = gather(697, { branches: NINE.slice(0, 2), record })
    expect(g.inputs.override).toBe('red on main masks other suites')
    const v = commissionVerdict(g.inputs, { now: AUG17 })
    expect(v.block).toBe(false)
    expect(v.queue).toMatchObject({ why: 'override', override: 'red on main masks other suites' })
  })

  it('an override does NOT buy a slot — the branches still have to go', () => {
    const record = { overrides: { 697: { reason: 'urgent', at: '' } }, parked: {}, torn: false }
    const v = commissionVerdict(gather(697, { branches: NINE, record }).inputs, { now: AUG17 })
    expect(v.block).toBe(true)
    expect(v.reason).toContain('A SLOT IS NOT FREE')
  })

  it('a parked branch frees its slot', () => {
    const record = {
      overrides: {},
      parked: { 'feat/336-croc-staging': { reason: 'superseded', at: '2026-08-17T19:00:00.000Z' } },
      torn: false,
    }
    const v = commissionVerdict(gather(700, { branches: NINE.slice(0, 3), record }).inputs, { now: AUG17 })
    expect(v.block).toBe(false)
    expect(v.slots.count).toBe(2)
  })

  it('treats the point whose branch already stands as work being FINISHED', () => {
    const v = commissionVerdict(gather(700, { branches: NINE }).inputs, { now: AUG17 })
    expect(v.block).toBe(false)
    expect(v.queue.why).toBe('already-in-flight')
  })

  it('lets a branch OUTSIDE the work order be finished, but not a new one be cut', () => {
    // 703 is not in this fixture's work order; its branch stands, so pushing to
    // it is finishing.
    expect(commissionVerdict(gather(703, { branches: NINE }).inputs, { now: AUG17 }).block).toBe(false)
    // A branch nobody has cut yet still consumes a slot.
    const v = commissionVerdict(gather(999, { branches: NINE }).inputs, { now: AUG17 })
    expect(v.block).toBe(true)
    expect(v.queue.why).toBe('not-in-work-order')
    expect(v.reason).toContain('A SLOT IS NOT FREE')
  })

  it('derives the in-flight set from the branches, so the front skips them', () => {
    const g = gather(708, { branches: [{ ref: 'feat/700-a', tipAt: AUG17 }, { ref: 'origin/feat/701-b', tipAt: AUG17 }] })
    expect(g.inputs.inFlight).toEqual([700, 701])
    const v = commissionVerdict(g.inputs, { now: AUG17 })
    expect(v.queue.candidates).toEqual([707, 708, 711])
    expect(v.block).toBe(false)
  })

  // ONE CALL, TWO POINTS (Sol's review of 91d88f9a): a shell line that cuts two
  // branches opens two points, and judging only the first judged neither.
  it('judges EVERY point the call opens, and refuses when ANY of them is behind the front', () => {
    const g = gatherCommissionInputs({
      points: [700, 697],
      cwd: '/repo',
      paused: false,
      otherOwner: false,
      tasksText: TASKS,
      branchProbe: () => ({ readable: true, branches: [] }),
      record: { overrides: {}, parked: {}, torn: false },
    })
    expect(g.inputs.points).toEqual([700, 697])
    const v = commissionVerdict(g.inputs, { now: AUG17 })
    // 700 is at the front and passes; 697 is not, and the call carries both.
    expect(v.verdicts.map((x) => [x.point, x.block])).toEqual([
      [700, false],
      [697, true],
    ])
    expect(v.block).toBe(true)
    expect(v.reason).toContain('POINT 697')
    expect(v.reason).toContain('700, 701, 707')
  })

  it('allows a two-point call when BOTH are at the front, and reads each own override', () => {
    const record = { overrides: { 697: { reason: 'red on main masks other suites', at: '' } }, parked: {}, torn: false }
    const both = gatherCommissionInputs({
      points: [700, 701],
      cwd: '/repo',
      paused: false,
      otherOwner: false,
      tasksText: TASKS,
      branchProbe: () => ({ readable: true, branches: [] }),
      record,
    })
    expect(commissionVerdict(both.inputs, { now: AUG17 }).block).toBe(false)
    // The SECOND point's own recorded override is the one that clears it — not
    // the first point's, and not none at all.
    const jumped = gatherCommissionInputs({
      points: [700, 697],
      cwd: '/repo',
      paused: false,
      otherOwner: false,
      tasksText: TASKS,
      branchProbe: () => ({ readable: true, branches: [] }),
      record,
    })
    const v = commissionVerdict(jumped.inputs, { now: AUG17 })
    expect(v.block).toBe(false)
    expect(v.verdicts[1].queue.why).toBe('override')
  })

  it('prints the branch refusal ONCE for a call that opens two points', () => {
    const g = gatherCommissionInputs({
      points: [708, 705],
      cwd: '/repo',
      paused: false,
      otherOwner: false,
      tasksText: TASKS,
      branchProbe: () => ({ readable: true, branches: NINE.slice(0, 3) }),
      record: { overrides: {}, parked: {}, torn: false },
    })
    const v = commissionVerdict(g.inputs, { now: AUG17 })
    expect(v.block).toBe(true)
    expect(v.reason.match(/A SLOT IS NOT FREE/g)).toHaveLength(1)
  })

  it('STANDS DOWN for a session that does not own the batch lock', () => {
    expect(gatherCommissionInputs({ point: 697, cwd: '/repo', paused: false, otherOwner: true })).toMatchObject({
      applicable: false,
      cause: 'not-lock-owner',
    })
  })

  it('STANDS DOWN for a paused batch', () => {
    expect(gatherCommissionInputs({ point: 697, cwd: '/repo', paused: true, otherOwner: false }).applicable).toBe(false)
  })

  it("STANDS DOWN inside a delegated agent's own worktree, which cuts its own branch by design", () => {
    expect(
      gatherCommissionInputs({
        point: 697,
        cwd: '/repo/.claude/worktrees/agent-a1',
        paused: false,
        otherOwner: false,
      }).applicable,
    ).toBe(false)
  })

  it('STANDS DOWN where the checkout has no work order', () => {
    expect(
      gatherCommissionInputs({ point: 697, cwd: '/repo', paused: false, otherOwner: false, tasksPath: '/nope/T.md' })
        .applicable,
    ).toBe(false)
  })

  it('FAILS OPEN on the branch half when git could not be questioned', () => {
    const g = gather(700, { branchProbe: () => ({ readable: false, branches: [] }) })
    const v = commissionVerdict(g.inputs, { now: AUG17 })
    expect(v.slots.why).toBe('branches-unreadable')
    expect(v.block).toBe(false)
  })

  // A GUARD NOBODY RUNS REFUSES NOTHING, and the first cut of this one was
  // exactly that: the registration stood in a comment while the hook list did
  // not name it (Sol, review of 91d88f9a). It is armed now, and both halves of
  // that are held: the guard says which state it is in, and this repository's
  // own settings are asserted to be the armed one.
  it('says whether it is ARMED or DORMANT, out of the settings text', () => {
    expect(wiringReport('node scripts/commission-guard.mjs')).toContain('ARMED')
    expect(wiringReport('node scripts/other-guard.mjs')).toContain('DORMANT')
    expect(wiringReport('node scripts/other-guard.mjs')).toContain(COMMISSION_HOOK_LINE)
    // A near miss is not a hit, and an unreadable file is never reported armed.
    expect(wiringReport('node scripts/commission-guard-core.mjs')).toContain('DORMANT')
    expect(wiringReport(null)).toContain('UNKNOWN')
  })

  it('IS wired in this repository — the PreToolUse entry, not a comment about one', () => {
    const settings = readFileSync(resolve(import.meta.dirname, '..', '.claude', 'settings.json'), 'utf8')
    expect(wiringReport(settings)).toContain('ARMED')
    const entry = JSON.parse(settings).hooks.PreToolUse.find((e) =>
      (e.hooks ?? []).some((h) => String(h.command).includes('commission-guard.mjs')),
    )
    // The matcher has to carry every act that OPENS a point: the spawn tools and
    // the shell that cuts the branch or runs the authoring lane.
    for (const tool of ['Agent', 'Task', 'Bash', 'PowerShell']) expect(entry.matcher).toContain(tool)
  })

  it('reads the pool cap from one place', () => {
    expect(commissionVerdict(gather(700, { branches: NINE.slice(0, POOL_CAP) }).inputs, { now: AUG17 }).block).toBe(true)
    expect(
      commissionVerdict(gather(700, { branches: NINE.slice(0, POOL_CAP - 1) }).inputs, { now: AUG17 }).block,
    ).toBe(false)
  })
})
