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
import {
  findForbiddenCommits,
  findUnidentifiedCommits,
  formatForbiddenReason,
  formatUnidentifiedReason,
} from './model-guard-core.mjs'
import { evaluate as renderVerifyEvaluate } from './render-verify-core.mjs'
import {
  evaluateMechanismReview,
  formatMechanismReviewVerdict,
} from './mechanism-review-core.mjs'
import {
  evaluateCriticalityReview,
  formatCriticalityReviewVerdict,
} from './criticality-review-guard-core.mjs'

import { gatherDashboardInputs } from './dashboard-guard.mjs'
import { gatherTasksSpecInputs } from './tasks-spec-guard.mjs'
import { gatherTasksArchiveInputs } from './tasks-archive-guard.mjs'
import { gatherQueueOrderInputs } from './queue-order-guard.mjs'
import { gatherDocBudgetInputs } from './doc-budget-guard.mjs'
import { gatherModelGuardInputs } from './model-guard.mjs'
import { gatherRenderVerifyInputs } from './render-verify-guard.mjs'
import { gatherMechanismReviewInputs } from './mechanism-review-guard.mjs'
import { gatherCriticalityReviewInputs } from './criticality-review-guard.mjs'
import { gatherBranchHygiene } from './branch-hygiene-guard.mjs'
import { gatherContainerAskInputs } from './container-ask-guard.mjs'
import { evaluate as containerAskEvaluate } from './container-ask-guard-core.mjs'
import { assessBranchHygiene, formatBranchHygiene } from './branch-hygiene-core.mjs'

import { gatherPushArrivalInputs } from './push-arrival-guard.mjs'
import { evaluatePushArrival } from './push-arrival-core.mjs'
import { gatherPrepInputs } from './prep-guard.mjs'
import { evaluatePrep } from './prep-guard-core.mjs'
import { gatherDashboardConcisenessInputs } from './dashboard-conciseness-guard.mjs'
import { evaluate as concisenessEvaluate } from './dashboard-conciseness-guard-core.mjs'
import { gatherDashboardCardTopicInputs } from './dashboard-card-topic-guard.mjs'
import { evaluate as cardTopicEvaluate } from './dashboard-card-topic-guard-core.mjs'
import { gatherDashboardIntegrityInputs } from './dashboard-integrity-guard.mjs'
import { evaluate as integrityEvaluate } from './dashboard-integrity-guard-core.mjs'
import { gatherRetroCurrencyInputs, decideRetroCurrency } from './retro-currency-guard.mjs'
import { gatherGuideBrevityInputs } from './guide-brevity-guard.mjs'
import { auditGuide, formatViolations as formatGuideViolations } from './guide-brevity-core.mjs'
import { gatherRuleReviewInputs } from './rule-review-guard.mjs'
import { evaluateRuleReview } from './rule-review-core.mjs'
import { gatherFindingsInputs } from './findings-guard.mjs'
import { auditFindings, formatFindings } from './findings-core.mjs'
import { gatherGuardHealthInputs } from './guard-health-guard.mjs'
import { auditGuardHealth, formatGuardHealth } from './guard-health-core.mjs'
import { gatherDashboardSyncInputs } from './dashboard-sync.mjs'
import { evaluate as dashboardSyncEvaluate } from './dashboard-sync-core.mjs'

import { readFileSync } from 'node:fs'
import {
  ACTIONS,
  CAUSE,
  formatPreflightReport,
  isKnownAction,
  runPreflight,
  selectGuards,
  unregisteredStopHooks,
  wiredStopHookIds,
} from './guard-preflight-core.mjs'
import { isMainModule } from './is-main.mjs'
import { readOwnerLock } from './batch-singleton.mjs'
import { repoPath } from './repo-paths.mjs'

/**
 * A guard that IS wired and that this read-only report cannot judge, registered
 * so it is named rather than silently absent (point 437 E).
 *
 * The gather is a constant on purpose: there is nothing to gather, and importing
 * the wrapper to say so would run its hook body. The report renders these as
 * `not-judged`, never as clean, and the summary refuses to call the chain clear
 * while one of them is in it.
 */
const notJudged = (id, why) => ({
  id,
  gather: () => ({ applicable: false, cause: CAUSE.notJudged, why }),
  decide: () => ({ block: false }),
})

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
    // Both halves of the split (point 397), so the preflight predicts which of
    // the two blocks the session would meet — they have different remedies.
    decide: ({ log, baselineMs, backupRefs }) => {
      const forbidden = findForbiddenCommits(log, baselineMs)
      const unidentified = findUnidentifiedCommits(log, baselineMs)
      if (forbidden.length) {
        return {
          block: true,
          reason: formatForbiddenReason(forbidden, { backupRefs, alsoUnidentified: unidentified }),
        }
      }
      if (unidentified.length) {
        return { block: true, reason: formatUnidentifiedReason(unidentified, { backupRefs }) }
      }
      return { block: false }
    },
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
    id: 'criticality-review-guard',
    gather: gatherCriticalityReviewInputs,
    decide: (inputs) => {
      const verdict = evaluateCriticalityReview(inputs)
      return { block: verdict.block, reason: formatCriticalityReviewVerdict(verdict) }
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
    // Registered so the Stop chain stays fully spawn-tested (guard-hooks.test
    // reads the chain from settings.json and demands a registration for every
    // hook gated on isMainModule). It always reports NOT-APPLICABLE here: the
    // answer it judges does not exist yet when a preflight runs, and its `why`
    // says exactly that instead of pretending to a clean bill.
    id: 'container-ask-guard',
    gather: gatherContainerAskInputs,
    decide: containerAskEvaluate,
  },
  {
    id: 'branch-hygiene-guard',
    gather: gatherBranchHygiene,
    decide: (inputs) => {
      const verdict = assessBranchHygiene(inputs)
      return { block: verdict.block, reason: formatBranchHygiene(verdict.findings) }
    },
  },

  // ── The rest of the wired Stop chain (point 437 E) ────────────────────────
  // Until 07.08.2026 the registry held only the guards someone had remembered to
  // add, and fourteen wired Stop hooks were outside it — reporting nothing while
  // they would block. Since CLAUDE.md §7.2 tells the session to preflight and
  // answer LAST, a false clean reproduced exactly the answer-twice loop this tool
  // exists to prevent. The registry now covers the whole chain, and the drift is
  // checked rather than remembered (guard-preflight-core.test.mjs).
  {
    id: 'push-arrival-guard',
    gather: gatherPushArrivalInputs,
    decide: (inputs) => {
      const verdict = evaluatePushArrival(inputs)
      return { block: Boolean(verdict), reason: verdict ? verdict.reason : '' }
    },
  },
  {
    id: 'prep-guard',
    gather: gatherPrepInputs,
    decide: evaluatePrep,
  },
  {
    id: 'dashboard-conciseness-guard',
    gather: gatherDashboardConcisenessInputs,
    decide: concisenessEvaluate,
  },
  {
    id: 'dashboard-card-topic-guard',
    gather: gatherDashboardCardTopicInputs,
    decide: cardTopicEvaluate,
  },
  {
    id: 'dashboard-integrity-guard',
    gather: gatherDashboardIntegrityInputs,
    decide: integrityEvaluate,
  },
  {
    id: 'retro-currency-guard',
    gather: gatherRetroCurrencyInputs,
    // Both halves, exactly as the hook joins them — a preflight that predicted
    // only the currency check would clear a turn the ledger check blocks.
    decide: (inputs) => decideRetroCurrency(inputs),
  },
  {
    id: 'guide-brevity-guard',
    gather: gatherGuideBrevityInputs,
    decide: ({ guideText }) => {
      const { ok, violations } = auditGuide(guideText)
      return { block: !ok, reason: ok ? '' : formatGuideViolations(violations) }
    },
  },
  {
    id: 'rule-review-guard',
    gather: gatherRuleReviewInputs,
    decide: (inputs) => {
      const verdict = evaluateRuleReview(inputs)
      return { block: Boolean(verdict), reason: verdict ? verdict.reason : '' }
    },
  },
  {
    id: 'findings-guard',
    gather: gatherFindingsInputs,
    decide: (inputs) => {
      const verdict = auditFindings(inputs)
      return { block: !verdict.ok, reason: verdict.ok ? '' : formatFindings(verdict.violations) }
    },
  },
  {
    id: 'guard-health-guard',
    gather: gatherGuardHealthInputs,
    decide: (inputs) => {
      const { ok, violations } = auditGuardHealth(inputs)
      return { block: !ok, reason: ok ? '' : formatGuardHealth(violations) }
    },
  },
  {
    id: 'dashboard-sync',
    gather: gatherDashboardSyncInputs,
    decide: dashboardSyncEvaluate,
  },

  // ── Wired, and honestly NOT judged here ───────────────────────────────────
  notJudged(
    'ci-status-guard',
    'its verdict comes from the GitHub API — a network round trip this read-only report does not make. ' +
      'Ask it directly if a push just landed.',
  ),
  notJudged(
    'timestamp-guard',
    'it judges the reply being composed, which does not exist while a preflight runs. Begin the reply ' +
      'with the current bold Berlin timestamp and it passes.',
  ),
  notJudged(
    'decision-card-guard',
    'it judges the reply being composed against the board — and at preflight time the transcript still ' +
      'holds the PREVIOUS turn, so any verdict here would be about the wrong text.',
  ),
  notJudged(
    'batch-progress-guard',
    'evaluating it ACQUIRES and can hand over the batch lock, which a read-only report must not do. ' +
      'Drive it with node scripts/batch-boundary.mjs --status.',
  ),
]

/**
 * Wired Stop hooks with no registry entry — the drift, read from the
 * authoritative chain rather than remembered. An unreadable settings file
 * reports NO drift: this is a report about the guards, not about itself.
 */
export function unregisteredHooks(guards = GUARDS, settingsPath = repoPath('.claude/settings.json')) {
  try {
    return unregisteredStopHooks(wiredStopHookIds(JSON.parse(readFileSync(settingsPath, 'utf8'))), guards)
  } catch {
    return []
  }
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2)
  const forIdx = args.findIndex((a) => a === '--for')
  const action = forIdx >= 0 ? (args[forIdx + 1] ?? 'turn-end') : 'turn-end'
  const asJson = args.includes('--json')

  const guards = selectGuards(GUARDS, action)
  const { sessionId, source, sessionKnown } = resolveSessionId(args)
  const results = runPreflight(guards, { sessionId, sessionKnown })
  // Only the WHOLE-CHAIN actions can report drift: a narrowed `--for merge` was
  // never claiming to cover the chain, so listing the rest there would be noise.
  const unregistered = ACTIONS[action] ? [] : unregisteredHooks(GUARDS)

  if (asJson) {
    console.log(
      JSON.stringify(
        { action, known: isKnownAction(action), session: { known: sessionKnown, source }, results, unregistered },
        null,
        2,
      ),
    )
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
    console.log(formatPreflightReport(results, { action, unregistered }))
  }
  // Always 0, even with a would-block or an error in the report: a report must
  // never be mistaken for the gate itself.
  process.exit(0)
}
