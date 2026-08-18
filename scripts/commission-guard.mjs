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
//   { "matcher": "Agent|Task|Bash|PowerShell",
//     "hooks": [{ "type": "command", "command": "node scripts/commission-guard.mjs" }] }
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

/** The PreToolUse line that arms this guard, named wherever its state is reported. */
export const COMMISSION_HOOK_LINE =
  '{ "matcher": "Agent|Task|Bash|PowerShell", "hooks": [{ "type": "command", ' +
  '"command": "node scripts/commission-guard.mjs" }] }'

/**
 * WHAT THIS GUARD IS WORTH RIGHT NOW, from the settings text. PURE.
 *
 * A guard that reports a verdict while nothing runs it reads as enforcement and
 * is none — the failure `guard-health-core.mjs` exists for, and worse from the
 * guard's own mouth. So `--status` says which it is, out of the FACT rather than
 * out of a record of an intention.
 */
export function wiringReport(settingsText) {
  if (settingsText === null || settingsText === undefined) {
    return 'WIRING: UNKNOWN — .claude/settings.json could not be read from here, so whether this guard fires is unproven.'
  }
  return isEnforcerWired(settingsText, 'commission-guard.mjs')
    ? 'WIRING: ARMED — a PreToolUse hook runs this guard, so a commissioning against the queue is really refused.'
    : 'WIRING: DORMANT — no hook in .claude/settings.json names this guard, so it REFUSES NOTHING; only the ' +
        `commands below still work. Arm it with one PreToolUse entry: ${COMMISSION_HOOK_LINE}`
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
  const refs = Array.isArray(inputs.refs) ? inputs.refs : []
  const slots = branchSlotDecision({
    branches: inputs.branches,
    parked: inputs.record?.parked ?? {},
    points: targets,
    refs,
    cap: POOL_CAP,
    readable: inputs.readable,
    now,
  })
  // A point whose branch already stands is being FINISHED, not opened, and the
  // SLOT rule does not apply to it. The test is the BRANCH, not the queue
  // verdict: a branch outside the work order (a cross-cutting fix) is judged the
  // same way, and pushing to it must never be refused for the pool it already
  // sits in. Cutting a NEW branch outside the work order does take a slot — so
  // a call is spared only when EVERY point it opens is already in flight.
  //
  // AND ONLY WHEN EVERY BRANCH IT CUTS ALREADY STANDS (Sol, review of 3078d166).
  // The point alone answered "687 is in flight" to `git branch feat/687-b` while
  // `feat/687-a` was the branch that made it so — a second branch for one point,
  // cut past a full pool, which is precisely the debris this rule counts.
  const inFlight = Array.isArray(inputs.inFlight) ? inputs.inFlight : []
  const standing = new Set((Array.isArray(inputs.branches) ? inputs.branches : []).map((b) => normaliseBranchRef(b?.ref)))
  const finishing =
    targets.length > 0 &&
    targets.every((p) => inFlight.includes(Number(p))) &&
    refs.every((r) => standing.has(normaliseBranchRef(r)))
  const parts = []
  if (!finishing && !slots.allowed) parts.push(branchSlotRefusal(slots))
  for (const v of verdicts) if (v.block) parts.push(commissionRefusal(v.queue))
  return {
    block: parts.length > 0,
    reason: parts.join('\n\n'),
    queue: verdicts[0]?.queue ?? commissionDecision({ point: null, open: inputs.open, gates: inputs.gates }),
    slots,
    verdicts,
  }
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
  console.log(commissionRecordReport(inputs.record))
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

function parkBranch(argv) {
  const ref = flag(argv, '--park')
  const reason = flag(argv, '--reason') ?? ''
  if (!ref || !String(reason).trim()) {
    console.error('usage: node scripts/commission-guard.mjs --park <branch> --reason "<why>"')
    return 1
  }
  // THE TIP IS THE BASELINE the park expires against; the timestamp beside it is
  // only the fallback for a record written before this existed.
  const tip = branchTip(ref)
  writeCommissionRecord(
    recordParkedBranch(readCommissionRecord(), ref, reason, { at: new Date().toISOString(), tip }),
  )
  console.log(
    `parked ${ref} out of the slot count${tip ? ` at ${tip.slice(0, 8)}` : ' (git could not name its tip — the park' +
      ' falls back to the clock)'}. It returns to the count the moment it receives another commit.`,
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
    if (!target.point) process.exit(0) // opens nothing this rule knows about
    // THE SESSION'S cwd, not the script's: the hook is wired anchored so it
    // fires from any working directory (point 438), which means the script's own
    // root can no longer say whether the CALLER is a delegated agent inside its
    // own worktree — and that agent must pass untouched.
    const g = gatherCommissionInputs({
      sessionId: payload.session_id || '',
      points: target.points,
      refs: target.refs,
      cwd: payload.cwd || REPO_ROOT,
    })
    if (!g.applicable) process.exit(0)
    const verdict = commissionVerdict(g.inputs)
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
