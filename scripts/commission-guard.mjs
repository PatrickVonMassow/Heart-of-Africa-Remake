#!/usr/bin/env node
// THE COMMISSIONING GUARD (point 712) — thin fail-OPEN I/O around two pure
// decisions that live with the facts they read:
//   · `commissionDecision` (board-queue-core.mjs), beside the `queueOrder` it
//     asks — may work be OPENED on this point, or is it behind the front?
//   · `branchSlotDecision` (batch-in-flight-core.mjs), beside the free-slot
//     judgment — is a slot free at all, counting OPEN BRANCHES rather than
//     running agents?
// Nothing is decided here. This file reads the work order, git and the record,
// and prints or denies.
//
// REGISTRATION (.claude/settings.json is a protected path — the main session
// wires it): one entry under `PreToolUse`, beside the context fence's. The
// matcher carries the spawn tools and the shell, because a point is opened by
// spawning its agent, by cutting its branch or by creating its worktree:
//
//   { "matcher": "Agent|Task|Bash|PowerShell", "hooks": [{ "type": "command",
//     "command": "node \\"$CLAUDE_PROJECT_DIR/scripts/commission-guard.mjs\\"" }] }
//
// WHO IT BINDS: the batch owner. A session that does not hold the lock, a
// worktree-isolated agent (which cuts its OWN branch by design) and a paused
// batch all pass untouched — a guard that omits those fires on the very workers
// the pool exists to run. Any internal error → ALLOW.
//
// THE OVERRIDE IS NEVER SILENT, and the two refusals have different escapes,
// deliberately: the queue's order may be departed from for a reason, so a
// RECORDED one-line reason lets a point through and `--status` prints it
// afterwards; a full pool cannot be talked out of, so its escapes — LAND, PARK
// — change the real state instead, and a park is recorded exactly as an
// override is.
import { readFileSync, existsSync } from 'node:fs'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { isWorktreeCheckout } from './board-first-core.mjs'
import { isEnforcerWired } from './guard-health-core.mjs'
import { isMainModule } from './is-main.mjs'
import { readTasksOpen, TASKS_PATH } from './tasks-source.mjs'
import { parseUserGates } from './user-gate-core.mjs'
import {
  COMMISSION_STATUS_CMD,
  commissionDecision,
  commissionRefusal,
  frontCandidates,
  openPointsOf,
} from './board-queue-core.mjs'
import {
  POOL_CAP,
  branchSlotDecision,
  branchSlotRefusal,
  clearParkedBranch,
  commissionOverrideFor,
  commissionRecordReport,
  commissionTarget,
  describeBranchAge,
  normaliseBranchRef,
  pointOfBranch,
  recordCommissionOverride,
  recordParkedBranch,
} from './batch-in-flight-core.mjs'
import { branchTip, openFeatBranches, readCommissionRecord, writeCommissionRecord } from './batch-in-flight.mjs'

const PAUSE = repoPath('.claude', 'batch-paused')
const SETTINGS = repoPath('.claude', 'settings.json')

/** The tools whose calls can OPEN a point. A hook that does not see them refuses
 *  nothing, so the wiring check demands every one of them in the matcher. */
export const COMMISSION_TOOLS = ['Agent', 'Task', 'Bash', 'PowerShell']

/** The PreToolUse line that arms this guard, named wherever its state is
 *  reported — ANCHORED on $CLAUDE_PROJECT_DIR, exactly as the real entry is. The
 *  remedy printed the bare relative form, which resolves against the cwd, i.e.
 *  against luck (Sol, review of dd7fd78c): a reader following it from anywhere
 *  but the repo root installs a hook that cannot find the guard. */
export const COMMISSION_HOOK_LINE =
  '{ "matcher": "Agent|Task|Bash|PowerShell", "hooks": [{ "type": "command", ' +
  '"command": "node \\"$CLAUDE_PROJECT_DIR/scripts/commission-guard.mjs\\"" }] }'

/**
 * WHAT THIS GUARD IS WORTH RIGHT NOW, from the settings text. PURE.
 *
 * A guard that reports a verdict while nothing runs it reads as enforcement and
 * is none — the failure `guard-health-core.mjs` exists for, and worse from the
 * guard's own mouth. So `--status` says which it is, out of the FACT rather than
 * out of a record of an intention: the settings are PARSED, the entry must sit
 * under PreToolUse, and its matcher must name every tool that can open a point.
 * Anything less is reported DORMANT, never armed.
 */
export function wiringReport(settingsText) {
  if (settingsText === null || settingsText === undefined) {
    return 'WIRING: UNKNOWN — .claude/settings.json could not be read from here, so whether this guard fires is unproven.'
  }
  return isEnforcerWired(settingsText, 'commission-guard.mjs', { event: 'PreToolUse', tools: COMMISSION_TOOLS })
    ? 'WIRING: ARMED — a PreToolUse hook runs this guard on every tool that can open a point, so a commissioning ' +
        'against the queue is really refused.'
    : 'WIRING: DORMANT — no PreToolUse entry in .claude/settings.json runs this guard on all of ' +
        `${COMMISSION_TOOLS.join('/')}, so it REFUSES NOTHING; only the commands below still work. Arm it with ` +
        `one PreToolUse entry: ${COMMISSION_HOOK_LINE}`
}

/**
 * The guard's I/O half, shared with the read-only preflight (point 707 carries
 * both refusals into its report; it does not decide them).
 *
 * `applicable: false` is a STAND-DOWN, never a verdict: paused, not the lock
 * owner, inside an agent's own worktree, or no work order in this checkout.
 */
export function gatherCommissionInputs({
  sessionId = '',
  point = null,
  // EVERY point the call opens, not only the first: one shell call can cut two
  // branches, and judging one of them is judging none.
  points = null,
  // The branch names the call CREATES, where a flag names them: a second branch
  // for a point already in flight is an OPENING, not a finishing.
  refs = null,
  // …and whether those names were CREATED by a flag or merely SPOKEN in a prompt.
  refsLoose = false,
  cwd = REPO_ROOT,
  behind = true,
  // The probes are injectable so the stand-downs are provable in the pure
  // layer; the defaults are the real I/O and are what the hook runs.
  paused,
  otherOwner,
  tasksPath = TASKS_PATH,
  tasksText,
  branchProbe = openFeatBranches,
  record,
} = {}) {
  if ((paused ?? existsSync(PAUSE)) === true) return { applicable: false, why: 'the batch is paused' }
  if (isWorktreeCheckout(cwd)) return { applicable: false, why: "this is a delegated agent's own worktree" }
  if ((otherOwner ?? heldByOtherLiveOwner(sessionId)) === true) {
    return { applicable: false, why: 'another live session owns the batch lock', cause: 'not-lock-owner' }
  }
  if (tasksText === undefined && !existsSync(tasksPath)) {
    return { applicable: false, why: 'no TASKS.md in this checkout' }
  }
  const tasks = tasksText ?? readTasksOpen(tasksPath)
  const { readable, branches } = branchProbe({ cwd, behind })
  const rec = record ?? readCommissionRecord()
  const targets = (Array.isArray(points) && points.length ? points : [point])
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
  return {
    applicable: true,
    inputs: {
      point: targets[0] ?? null,
      points: targets,
      refs: (Array.isArray(refs) ? refs : refs ? [refs] : []).map(normaliseBranchRef).filter(Boolean),
      refsLoose: refsLoose === true,
      open: openPointsOf(tasks),
      gates: parseUserGates(tasks),
      // THE OPEN BRANCH IS THE IN-FLIGHT SIGNAL now that it is what holds a
      // slot. One fact, one home: the same list answers both questions.
      inFlight: [...new Set(branches.map((b) => pointOfBranch(b.ref)).filter((n) => n !== null))],
      branches,
      readable,
      record: rec,
      override: commissionOverrideFor(rec, targets[0] ?? point),
    },
  }
}

/**
 * Both decisions for EVERY point the call opens, and the deny text when any of
 * them refuses. Pure given inputs.
 *
 * THE QUEUE IS JUDGED PER POINT, THE SLOTS PER CALL. Which point may be started
 * is a question about that point; whether the pool has room at all is a question
 * about the call, and asking it once keeps the branch listing from being printed
 * twice — the second point's queue refusal would be buried under the repeat.
 *
 * `queue` and `slots` carry the FIRST point's verdicts, which is what the
 * single-target callers (`--status`, the preflight) read; `verdicts` carries one
 * queue verdict per point. A call opening two points is refused when EITHER is
 * refused — a line that cuts a front-most branch beside a queue-jumping one is
 * still a queue jump.
 */
export function commissionVerdict(inputs, { now = Date.now() } = {}) {
  const targets =
    Array.isArray(inputs?.points) && inputs.points.length ? inputs.points : inputs?.point != null ? [inputs.point] : []
  const verdicts = targets.map((point) => ({
    point,
    queue: commissionDecision({
      point,
      open: inputs.open,
      gates: inputs.gates,
      inFlight: inputs.inFlight,
      cap: POOL_CAP,
      // Each point's OWN recorded override, never the first one's.
      override: commissionOverrideFor(inputs.record, point) || (point === inputs.point ? inputs.override : ''),
    }),
  }))
  for (const v of verdicts) v.block = !v.queue.allowed
  // WHAT THE CALL WOULD LEAVE STANDING is the pure core's question, not this
  // file's. `branchSlotDecision` counts the branches the call ADDS — a named ref
  // no standing branch answers to, or a target point it names no ref for and has
  // no branch — and answers `nothing-opened` where it adds none, which is what
  // "this point is being FINISHED, not started" means in branches. The judgment
  // lived here as a `finishing` flag and knew only the current count, so a line
  // cutting TWO branches into one free slot passed (Sol, review of dd7fd78c).
  const slots = branchSlotDecision({
    branches: inputs.branches,
    parked: inputs.record?.parked ?? {},
    points: targets,
    refs: Array.isArray(inputs.refs) ? inputs.refs : [],
    looseRefs: inputs.refsLoose === true,
    cap: POOL_CAP,
    readable: inputs.readable,
    now,
  })
  // A FACT NOBODY COULD READ REFUSES NOTHING (Sol, review of 3078d166). Both
  // halves already failed open on their own inputs, but the QUEUE half was fed
  // git's answer too: an unreadable branch list left the in-flight set EMPTY, so
  // a point actually in flight read as behind the front and was refused for a
  // git fault. The same for a torn record, which is where an override lives —
  // losing it turns a recorded exemption back into a refusal. Both are named, so
  // `--status` says which fact was missing rather than reporting a clean allow.
  const unread =
    inputs?.readable !== true ? 'branches-unreadable' : inputs?.record?.torn === true ? 'record-unreadable' : ''
  if (unread) {
    const open = (q) => ({ ...(q ?? {}), allowed: true, why: unread })
    return {
      block: false,
      reason: '',
      queue: open(verdicts[0]?.queue),
      slots: { ...slots, allowed: true, why: unread },
      verdicts: verdicts.map((v) => ({ ...v, block: false, queue: open(v.queue) })),
      unread,
    }
  }
  const parts = []
  if (!slots.allowed) parts.push(branchSlotRefusal(slots))
  for (const v of verdicts) if (v.block) parts.push(commissionRefusal(v.queue))
  return {
    block: parts.length > 0,
    reason: parts.join('\n\n'),
    queue: verdicts[0]?.queue ?? commissionDecision({ point: null, open: inputs.open, gates: inputs.gates }),
    slots,
    verdicts,
    unread: '',
  }
}

/**
 * THE FAIL-OPEN PASS IS NEVER SILENT (fourth review, finding 1 — kept fail-open
 * on the spec's rule, made VISIBLE here). An allow over an unreadable branch
 * census or record is an allow WITHOUT judgment: it can commission past the cap
 * and past a recorded park, and until now nothing told the caller. The hook
 * prints this to stderr on such an allow, and `--status` prints it beside the
 * verdict, so the state the guard could not see is named where the pass happens.
 */
export function unreadNotice(unread) {
  if (!unread) return ''
  const what =
    unread === 'record-unreadable'
      ? 'the commission record (overrides and parks) is TORN and could not be read'
      : 'the open-branch census could not be read from git'
  return (
    `commission-guard: ALLOWING WITHOUT JUDGMENT — ${what}, so neither the queue-front nor the branch-slot ` +
    `refusal could be decided (fail-open by design: a guard fault must never trap the session). This pass can ` +
    `exceed the pool cap. Check the state it could not see: ${COMMISSION_STATUS_CMD}`
  )
}

/** A free-prose call the classifier cannot bind is allowed, but never silently.
 * The notice names every signal it found so the caller can restate one explicit
 * assignment or use the decidable branch/worktree form. */
export function ambiguityNotice(ambiguous) {
  if (!ambiguous || typeof ambiguous !== 'object') return ''
  const points = Array.isArray(ambiguous.points) ? ambiguous.points.filter((n) => Number.isInteger(n) && n > 0) : []
  const refs = Array.isArray(ambiguous.refs) ? ambiguous.refs.filter(Boolean) : []
  const reasons = Array.isArray(ambiguous.reasons) ? ambiguous.reasons.filter(Boolean) : []
  return (
    `commission-guard: ALLOWING WITHOUT A PROSE DECISION — the call is ambiguous (${reasons.join('; ') ||
      'scope could not be determined'}). Saw point(s): ${points.join(', ') || 'none'}; branch name(s): ${
      refs.join(', ') || 'none'
    }. Restate exactly one point to assign, or create its feat/<N> branch/worktree explicitly; no queue or slot ` +
    'refusal was inferred from this prose.'
  )
}

/**
 * A PARKED BRANCH IS UNPARKED WHEN WORK IS ASSIGNED, not at its first commit
 * (fourth review, finding 6): between the assignment and the commit the branch
 * would otherwise hold no slot while an agent already works it, and at a full
 * pool that is occupancy past the cap. Called by the hook the moment an
 * allowed call reopens one; returns the refs it cleared. A TORN record is left
 * alone — rewriting what nobody could read would erase every other entry.
 */
export function unparkReopened(slots, { read = readCommissionRecord, write = writeCommissionRecord } = {}) {
  const reopens = Array.isArray(slots?.reopens) ? slots.reopens : []
  if (reopens.length === 0) return []
  let record = read()
  if (record?.torn === true) return []
  for (const ref of reopens) record = clearParkedBranch(record, ref)
  write(record)
  return reopens
}

// ---- CLI ------------------------------------------------------------------

const flag = (argv, name) => {
  const i = argv.indexOf(name)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null
}

function printStatus(argv) {
  const point = Number(flag(argv, '--point')) || null
  let settings = null
  try {
    settings = readFileSync(SETTINGS, 'utf8')
  } catch {
    /* unreadable → reported as unknown, never as armed */
  }
  console.log(wiringReport(settings))
  const g = gatherCommissionInputs({ point, behind: true })
  if (!g.applicable) {
    console.log(`commission-guard STANDS DOWN: ${g.why}. Nothing is refused.`)
    console.log(commissionRecordReport(readCommissionRecord()))
    return
  }
  const { inputs } = g
  const front = frontCandidates({ open: inputs.open, gates: inputs.gates, inFlight: inputs.inFlight, count: POOL_CAP })
  const verdict = commissionVerdict(inputs)
  console.log(`front of the queue (workable, cap ${POOL_CAP}): ${front.join(', ') || 'none'}`)
  console.log(`open feat/* branches: ${verdict.slots.count} of ${POOL_CAP} slots taken${
    inputs.readable ? '' : ' (GIT UNREADABLE — the branch rule stands down)'
  }`)
  for (const b of verdict.slots.open) {
    const behind = Number.isFinite(b.behind) ? `${b.behind} behind main` : 'behind-count unknown'
    console.log(`  · ${b.ref} — ${describeBranchAge(b.ageMs)}, ${behind}`)
  }
  // A park held on a baseline nobody could re-check is a blindness worth
  // naming (finding 5): the branch STAYS parked, and the reader is told why
  // that verdict is unverified rather than shown a clean count.
  for (const b of verdict.slots.parkedOut ?? []) {
    if (b.tipUnverified) {
      console.log(
        `  · ${b.ref} — PARKED, but its CURRENT tip could not be read, so movement since the park is ` +
          'UNVERIFIED (fail-open: it stays out of the count).',
      )
    }
  }
  console.log(commissionRecordReport(inputs.record))
  if (verdict.unread) console.log(unreadNotice(verdict.unread))
  if (point) {
    console.log(`\nverdict for opening point ${point}: ${verdict.block ? 'DENY' : 'allow'} (queue: ${
      verdict.queue.why
    }, slots: ${verdict.slots.why})`)
    if (verdict.block) console.log(verdict.reason)
  }
}

function recordOverride(argv) {
  const point = Number(flag(argv, '--override'))
  const reason = flag(argv, '--reason') ?? ''
  if (!Number.isInteger(point) || point <= 0 || !String(reason).trim()) {
    console.error('usage: node scripts/commission-guard.mjs --override <N> --reason "<why>"')
    return 1
  }
  const record = recordCommissionOverride(readCommissionRecord(), point, reason, { at: new Date().toISOString() })
  writeCommissionRecord(record)
  console.log(`recorded: point ${point} may be opened out of turn — ${commissionOverrideFor(record, point)}`)
  console.log(`It is printed by \`${COMMISSION_STATUS_CMD}\` from now on.`)
  return 0
}

/** Exported for the unit layer: the probes are injectable so the refusal to park
 *  a branch without a baseline is provable without a repository. */
export function parkBranch(
  argv,
  { tipProbe = branchTip, read = readCommissionRecord, write = writeCommissionRecord, out = console, at = null } = {},
) {
  const ref = flag(argv, '--park')
  const reason = flag(argv, '--reason') ?? ''
  if (!ref || !String(reason).trim()) {
    out.error('usage: node scripts/commission-guard.mjs --park <branch> --reason "<why>"')
    return 1
  }
  // THE TIP IS THE BASELINE the park expires against, and WITHOUT ONE THE PARK IS
  // REFUSED (Sol, review of 3078d166). The clock fallback carries the very defects
  // the tip was introduced to remove — git's committer date is a whole second
  // coarse, and a rebase or a `--date` preserves one the branch has long moved
  // past — so a park taken on it could outlive the work it excused. The fallback
  // stays only for records written BEFORE the tip was recorded; a park taken from
  // here always has a sha. An unresolvable name is usually a typo anyway.
  const tip = tipProbe(ref)
  if (!tip) {
    out.error(
      `refusing to park ${ref}: git cannot name its tip, and the tip is the baseline a park expires against. ` +
        'Without it the park could never be undone by a commit landing on the branch. Check the branch name ' +
        '(`git branch --list "feat/*"`), fetch it if it is only on the remote, and park it again.',
    )
    return 1
  }
  write(recordParkedBranch(read(), ref, reason, { at: at ?? new Date().toISOString(), tip }))
  out.log(
    `parked ${ref} out of the slot count at ${tip.slice(0, 8)}. It returns to the count the moment it receives ` +
      'another commit.',
  )
  return 0
}

function unparkBranch(argv) {
  const ref = flag(argv, '--unpark')
  if (!ref) {
    console.error('usage: node scripts/commission-guard.mjs --unpark <branch>')
    return 1
  }
  writeCommissionRecord(clearParkedBranch(readCommissionRecord(), ref))
  console.log(`${ref} counts as an open slot again.`)
  return 0
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2)
  try {
    if (argv.includes('--status')) {
      printStatus(argv)
      process.exit(0)
    }
    if (argv.includes('--override')) process.exit(recordOverride(argv))
    if (argv.includes('--park')) process.exit(parkBranch(argv))
    if (argv.includes('--unpark')) process.exit(unparkBranch(argv))

    // ---- PreToolUse hook mode ----------------------------------------------
    let payload = null
    try {
      payload = JSON.parse(readFileSync(0, 'utf8'))
    } catch {
      process.exit(0) // no/non-JSON stdin (manual run) → nothing to guard
    }
    if (!payload) process.exit(0)
    const input = payload.tool_input ?? {}
    const target = commissionTarget({
      toolName: payload.tool_name,
      command: input.command,
      prompt: input.prompt,
      description: input.description,
    })
    if (target.ambiguous) {
      console.error(ambiguityNotice(target.ambiguous))
      process.exit(0)
    }
    if (!target.point) process.exit(0) // opens nothing this rule knows about
    // THE SESSION'S cwd, not the script's: the hook is wired anchored so it
    // fires from any working directory (point 438), which means the script's own
    // root can no longer say whether the CALLER is a delegated agent inside its
    // own worktree — and that agent must pass untouched.
    const g = gatherCommissionInputs({
      sessionId: payload.session_id || '',
      points: target.points,
      refs: target.refs,
      refsLoose: target.refsLoose,
      cwd: payload.cwd || REPO_ROOT,
    })
    if (!g.applicable) process.exit(0)
    const verdict = commissionVerdict(g.inputs)
    // The fail-open pass says so OUT LOUD (finding 1): stderr, because a
    // PreToolUse allow must not fabricate a permission decision just to speak.
    if (verdict.unread) console.error(unreadNotice(verdict.unread))
    if (!verdict.block && !verdict.unread && verdict.slots?.reopens?.length) {
      for (const ref of unparkReopened(verdict.slots)) {
        console.error(
          `commission-guard: unparked ${ref} — work was assigned back onto it, so it occupies its slot again.`,
        )
      }
    }
    if (verdict.block) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: verdict.reason,
          },
        }),
      )
    }
    process.exit(0)
  } catch (e) {
    console.error(`commission-guard error (allowing): ${e && e.message}`)
    process.exit(0) // fail-open: a guard bug must never trap the session
  }
}
