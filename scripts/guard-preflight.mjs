// "Would a guard block me right now?" — asked BEFORE the action, not at the
// turn's end (point 365 D, user 26.07.2026).
//
//   node scripts/guard-preflight.mjs                 # the whole Stop chain
//   node scripts/guard-preflight.mjs --for answer    # …before composing the closing reply
//   node scripts/guard-preflight.mjs --for merge     # merge / tick / commit / tag
//   node scripts/guard-preflight.mjs --session <id>  # whose session is asking
//   node scripts/guard-preflight.mjs --json          # machine-readable
//
// WHY: a guard that blocks costs a whole turn at full context; the render-verify
// loop on point 278 cost about thirty of them for one process mistake. One cheap
// process run replaces that.
//
// HOW IT STAYS HONEST: each guard is wired from its WRAPPER's exported gather
// step plus its pure core's decide step. The preflight never gathers inputs
// itself — a second copy of that I/O would drift from the guard it claims to
// predict and hand back a false "clean". A guard whose wrapper exposes no gather
// step is simply not listed (said so in the report), never guessed at.
//
// ADVISORY: the state can change between this report and the action, so the guard
// itself remains the authority. Exit code is always 0 — this is a report, not a
// gate.
import { evaluate as dashboardEvaluate } from './dashboard-guard-core.mjs'
import { evaluate as tasksSpecEvaluate } from './tasks-spec-guard-core.mjs'
import { evaluate as queueOrderEvaluate } from './queue-order-guard-core.mjs'
import {
  evaluateTasksArchive,
  formatTasksArchiveVerdict,
} from './tasks-archive-guard-core.mjs'
import { evaluateDocBudgets, formatDocBudgetVerdict } from './doc-budget-core.mjs'
import { findForbiddenCommits } from './model-guard-core.mjs'
import { evaluate as renderVerifyEvaluate } from './render-verify-core.mjs'
import {
  evaluateMechanismReview,
  formatMechanismReviewVerdict,
} from './mechanism-review-core.mjs'

import { gatherDashboardInputs } from './dashboard-guard.mjs'
import { gatherTasksSpecInputs } from './tasks-spec-guard.mjs'
import { gatherTasksArchiveInputs } from './tasks-archive-guard.mjs'
import { gatherQueueOrderInputs } from './queue-order-guard.mjs'
import { gatherDocBudgetInputs } from './doc-budget-guard.mjs'
import { gatherModelGuardInputs } from './model-guard.mjs'
import { gatherRenderVerifyInputs } from './render-verify-guard.mjs'
import { gatherMechanismReviewInputs } from './mechanism-review-guard.mjs'
import { gatherBranchHygiene } from './branch-hygiene-guard.mjs'
import { assessBranchHygiene, formatBranchHygiene } from './branch-hygiene-core.mjs'

import {
  ACTIONS,
  formatPreflightReport,
  isKnownAction,
  runPreflight,
  selectGuards,
} from './guard-preflight-core.mjs'
import { isMainModule } from './is-main.mjs'
import { readOwnerLock } from './batch-singleton.mjs'

/**
 * Whose session is asking. Four of the guards stand down for a session that does
 * not own the batch lock, and `heldByOtherLiveOwner('')` calls an EMPTY id a
 * stranger — so with no id the report used to read "not-applicable" for the very
 * session that owns the batch: a false all-clear.
 *
 * `--session` first (the caller knows), then the environment, then the lock's own
 * owner — asking the batch lock who holds it is the honest last resort, because a
 * preflight run from inside the owning session is the normal case. When none of
 * the three answers, the session is UNKNOWN and the report says so rather than
 * clearing anything.
 */
export function resolveSessionId(args = [], env = process.env, readLock = readOwnerLock) {
  const i = args.indexOf('--session')
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) {
    return { sessionId: args[i + 1], source: '--session', sessionKnown: true }
  }
  if (env.CLAUDE_SESSION_ID) {
    return { sessionId: env.CLAUDE_SESSION_ID, source: 'CLAUDE_SESSION_ID', sessionKnown: true }
  }
  try {
    const lock = readLock()
    if (lock && lock.sessionId) {
      return { sessionId: lock.sessionId, source: 'batch lock owner', sessionKnown: true }
    }
  } catch {
    /* unreadable lock — the unknown case below is the honest answer */
  }
  return { sessionId: '', source: null, sessionKnown: false }
}

/**
 * The registered guards: id, the WRAPPER's gather step, the CORE's decide step.
 * Only these two functions per guard — anything else here would be a
 * reimplementation of behaviour that already exists.
 */
export const GUARDS = [
  {
    id: 'model-guard',
    // arm:false — a read-only preflight must not arm a baseline the guard has
    // not armed itself, which would hide exactly the commits it looks for.
    gather: ({ sessionId } = {}) => gatherModelGuardInputs({ sessionId, arm: false }),
    decide: ({ log, baselineMs }) => findForbiddenCommits(log, baselineMs),
  },
  {
    id: 'dashboard-guard',
    gather: gatherDashboardInputs,
    decide: dashboardEvaluate,
  },
  {
    id: 'render-verify-guard',
    gather: gatherRenderVerifyInputs,
    decide: renderVerifyEvaluate,
  },
  {
    id: 'mechanism-review-guard',
    gather: gatherMechanismReviewInputs,
    decide: (inputs) => {
      const verdict = evaluateMechanismReview(inputs)
      return { block: verdict.block, reason: formatMechanismReviewVerdict(verdict) }
    },
  },
  {
    id: 'queue-order-guard',
    gather: gatherQueueOrderInputs,
    decide: queueOrderEvaluate,
  },
  {
    id: 'tasks-spec-guard',
    gather: gatherTasksSpecInputs,
    decide: tasksSpecEvaluate,
  },
  {
    id: 'tasks-archive-guard',
    gather: gatherTasksArchiveInputs,
    decide: (inputs) => {
      const verdict = evaluateTasksArchive(inputs)
      return { block: verdict.block, reason: formatTasksArchiveVerdict(verdict) }
    },
  },
  {
    id: 'doc-budget-guard',
    gather: gatherDocBudgetInputs,
    decide: ({ docs }) => {
      const verdict = evaluateDocBudgets(docs)
      return { block: verdict.block, reason: formatDocBudgetVerdict(verdict) }
    },
  },
  {
    id: 'branch-hygiene-guard',
    gather: gatherBranchHygiene,
    decide: (inputs) => {
      const verdict = assessBranchHygiene(inputs)
      return { block: verdict.block, reason: formatBranchHygiene(verdict.findings) }
    },
  },
]

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2)
  const forIdx = args.findIndex((a) => a === '--for')
  const action = forIdx >= 0 ? (args[forIdx + 1] ?? 'turn-end') : 'turn-end'
  const asJson = args.includes('--json')

  const guards = selectGuards(GUARDS, action)
  const { sessionId, source, sessionKnown } = resolveSessionId(args)
  const results = runPreflight(guards, { sessionId, sessionKnown })

  if (asJson) {
    console.log(JSON.stringify({ action, known: isKnownAction(action), session: { known: sessionKnown, source }, results }, null, 2))
  } else {
    console.log(
      sessionKnown
        ? `session id from ${source}.\n`
        : 'session id UNKNOWN (no --session, no CLAUDE_SESSION_ID, no batch lock owner) — the ' +
            'lock-keyed guards below cannot be judged.\n',
    )
    if (!isKnownAction(action)) {
      // Report MORE rather than less on a typo, but say so — a silently widened
      // scope would read like the narrow one the caller asked for.
      console.log(
        `note: "${action}" is not a known action (${Object.keys(ACTIONS).join(', ')}) — ` +
          'reporting every registered guard instead.\n',
      )
    }
    console.log(formatPreflightReport(results, { action }))
  }
  // Always 0, even with a would-block or an error in the report: a report must
  // never be mistaken for the gate itself.
  process.exit(0)
}
