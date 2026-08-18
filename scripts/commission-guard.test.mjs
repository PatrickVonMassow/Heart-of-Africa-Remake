// The commissioning guard (point 712): the two refusals as the wrapper combines
// them, and the stand-downs that keep them off a subagent and a paused batch.
//
// The decisions themselves — the queue front, the branch slots and the call
// classifier — are swept in board-queue-core.test.mjs and
// batch-in-flight-core.test.mjs; what is under test here is the wiring: which
// facts reach which decision, and when the guard says nothing at all.
import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  COMMISSION_HOOK_LINE,
  gatherCommissionInputs,
  commissionVerdict,
  parkBranch,
  wiringReport,
} from './commission-guard.mjs'
import { POOL_CAP } from './batch-in-flight-core.mjs'
import { readCommissionRecord } from './batch-in-flight.mjs'

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

  // A SECOND BRANCH FOR A POINT IN FLIGHT IS AN OPENING (Sol, review of
  // 3078d166). The point-wide exemption meant `git branch feat/687-b` past a
  // standing `feat/687-a` was excused by its own point and cut a fourth branch
  // through a full pool — the exact debris this rule counts. 687 really did have
  // two branches on 17.08.2026, so this is not a hypothetical shape.
  it('refuses a SECOND branch for a point already in flight, and still allows the first back', () => {
    const cut = (refs) => commissionVerdict(gather(687, { branches: NINE, refs }).inputs, { now: AUG17 })
    // Cutting a branch that does NOT stand yet takes a slot, in-flight or not.
    const fresh = cut(['feat/687-b'])
    expect(fresh.block).toBe(true)
    expect(fresh.reason).toContain('A SLOT IS NOT FREE')
    // …and the point's OTHER branches are not excused away either: all nine count.
    expect(fresh.slots.count).toBe(NINE.length)
    // Re-cutting or pushing the branch that already stands is finishing.
    expect(cut(['feat/687-bank-game']).block).toBe(false)
    // The remote spelling of that same branch is the same branch.
    expect(cut(['origin/feat/687-bank-game']).block).toBe(false)
    // A call naming NO ref at all — a spawn, a prose target — keeps the
    // point-wide exemption, because the branch cannot be identified.
    expect(cut([]).block).toBe(false)
  })

  it('refuses a two-branch call the moment ONE of the branches is new', () => {
    const v = commissionVerdict(
      gather(687, { branches: NINE, points: [687, 700], refs: ['feat/687-bank-game', 'feat/700-second'] }).inputs,
      { now: AUG17 },
    )
    expect(v.block).toBe(true)
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

  // …AND ON THE QUEUE HALF TOO (Sol, review of 3078d166). The branch half failed
  // open on its own input while the QUEUE half was fed the same git answer: an
  // unreadable list left the in-flight set empty, so a point already being worked
  // read as behind the front and was refused for a git fault, not for a queue jump.
  it('FAILS OPEN on the QUEUE half as well when git could not be questioned', () => {
    const v = commissionVerdict(gather(697, { branchProbe: () => ({ readable: false, branches: [] }) }).inputs, {
      now: AUG17,
    })
    expect(v.block).toBe(false)
    expect(v.unread).toBe('branches-unreadable')
    expect(v.queue.why).toBe('branches-unreadable')
    expect(v.reason).toBe('')
  })

  // The override lives in the record and nowhere else, so a record nobody can
  // read turns a recorded exemption back into a refusal.
  it('FAILS OPEN on a TORN record, where the overrides live', () => {
    const v = commissionVerdict(gather(697, { branches: NINE, record: { overrides: {}, parked: {}, torn: true } })
      .inputs, { now: AUG17 })
    expect(v.block).toBe(false)
    expect(v.unread).toBe('record-unreadable')
  })

  it('an UNREADABLE record file is torn, not empty — a missing one is empty', () => {
    // A directory in the file's place is the readable stand-in for EACCES here:
    // it EXISTS and cannot be read, which is exactly the state that was silently
    // reported as "nothing recorded yet".
    const dir = mkdtempSync(join(tmpdir(), 'hoa-commission-record-'))
    try {
      expect(readCommissionRecord(dir).torn).toBe(true)
      expect(readCommissionRecord(join(dir, 'absent.json'))).toMatchObject({ torn: false, overrides: {} })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // A PARK WITHOUT A BASELINE COULD NEVER EXPIRE (Sol, review of 3078d166): the
  // clock fallback carries the very second-coarse and rebase defects the tip was
  // introduced to remove, so a park taken on it could outlive the work it excused.
  it('REFUSES to park a branch whose tip git cannot name, and says why', () => {
    const said = []
    const out = { log: (m) => said.push(m), error: (m) => said.push(m) }
    let written = null
    const args = ['--park', 'feat/336-croc-staging', '--reason', 'superseded']
    expect(
      parkBranch(args, { tipProbe: () => '', write: (r) => (written = r), read: () => ({ overrides: {}, parked: {} }), out }),
    ).toBe(1)
    expect(written).toBeNull()
    expect(said.join('\n')).toContain('git cannot name its tip')
    // …and a tip that IS readable parks, with the sha as the baseline.
    said.length = 0
    expect(
      parkBranch(args, {
        tipProbe: () => 'abc1234def',
        write: (r) => (written = r),
        read: () => ({ overrides: {}, parked: {} }),
        out,
        at: '2026-08-17T19:00:00.000Z',
      }),
    ).toBe(0)
    expect(written.parked['feat/336-croc-staging']).toMatchObject({ reason: 'superseded', tip: 'abc1234def' })
  })

  // A GUARD NOBODY RUNS REFUSES NOTHING, and the first cut of this one was
  // exactly that: the registration stood in a comment while the hook list did
  // not name it (Sol, review of 91d88f9a). It is armed now, and both halves of
  // that are held: the guard says which state it is in, and this repository's
  // own settings are asserted to be the armed one.
  it('says whether it is ARMED or DORMANT, out of the settings text', () => {
    const hooked = (command, { event = 'PreToolUse', matcher = 'Agent|Task|Bash|PowerShell' } = {}) =>
      JSON.stringify({ hooks: { [event]: [{ matcher, hooks: [{ type: 'command', command }] }] } })

    expect(wiringReport(hooked('node "$CLAUDE_PROJECT_DIR/scripts/commission-guard.mjs"'))).toContain('ARMED')
    expect(wiringReport(hooked('node scripts/other-guard.mjs'))).toContain('DORMANT')
    expect(wiringReport(hooked('node scripts/other-guard.mjs'))).toContain(COMMISSION_HOOK_LINE)
    // A near miss is not a hit, and an unreadable file is never reported armed.
    expect(wiringReport(hooked('node scripts/commission-guard-core.mjs'))).toContain('DORMANT')
    expect(wiringReport('node scripts/commission-guard.mjs')).toContain('DORMANT')
    // The EVENT and the MATCHER are the wiring, not decoration: a hook that never
    // sees the call which opens work refuses nothing, and neither does one blind
    // to a tool that can open it.
    expect(wiringReport(hooked('node scripts/commission-guard.mjs', { event: 'Stop' }))).toContain('DORMANT')
    expect(wiringReport(hooked('node scripts/commission-guard.mjs', { matcher: 'Agent|Task|Bash' }))).toContain(
      'DORMANT',
    )
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
