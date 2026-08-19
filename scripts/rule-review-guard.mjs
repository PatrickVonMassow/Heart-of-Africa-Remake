// Stop hook: the rule corpus gets read through periodically, not when someone
// happens to think of it. See rule-review-core.mjs for the audit that showed
// what an unreviewed corpus accumulates.
//
// The decision logic is pure and Vitest-covered; this wrapper only reads the
// bookkeeping and is fail-OPEN: any throw, an unreadable state file, an
// uncountable corpus — all allow the stop. It stands down while the batch is
// paused and while another live session owns the batch lock.
import { existsSync, readFileSync } from 'node:fs'
import { repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { evaluateRuleReview } from './rule-review-core.mjs'
import { countCorpusEntries, STATE_PATH } from './rule-review-state.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { CAUSE } from './guard-preflight-core.mjs'
import { gatherGuardDutyContext } from './guard-duty.mjs'

const PAUSE = repoPath('.claude/batch-paused')

/**
 * Everything the core needs — shared with the guard preflight, which must never
 * gather its own (a second copy would drift and hand back a false "clean").
 *
 * `ignoreOwnership` is for the --status probe alone: a question must answer even
 * when another session owns the lock, or the silence reads as "nothing owed".
 */
export function gatherRuleReviewInputs({ sessionId = '', ignoreOwnership = false } = {}) {
  if (!ignoreOwnership && heldByOtherLiveOwner(sessionId)) {
    return { applicable: false, why: 'another live session owns the batch lock', cause: CAUSE.notLockOwner }
  }
  let state = {}
  try {
    state = JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  } catch {
    /* never attested yet — evaluateRuleReview decides what that means */
  }
  return {
    applicable: true,
    inputs: {
      now: Date.now(),
      lastReviewedAt: Number(state.lastReviewedAt) || null,
      entryCount: countCorpusEntries(),
      reviewedCount: Number(state.reviewedCount) || null,
      paused: existsSync(PAUSE),
      sessionId,
      fence: gatherGuardDutyContext({ sessionId }),
    },
  }
}

if (isMainModule(import.meta.url)) {
  try {
    const status = process.argv[2] === '--status'
    let sid = ''
    if (!status) {
      try {
        sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
      } catch {
        /* manual run — the rule binds regardless */
      }
    }

    const gathered = gatherRuleReviewInputs({ sessionId: sid, ignoreOwnership: status })
    if (!gathered.applicable) process.exit(0)

    const verdict = evaluateRuleReview(gathered.inputs)

    if (status) {
      console.log(verdict ? verdict.reason : 'rule-review-guard: keine Durchsicht fällig')
      process.exit(0)
    }
    if (verdict?.decision === 'block') process.stdout.write(JSON.stringify(verdict))
    else if (verdict?.deferred) process.stdout.write(JSON.stringify({ systemMessage: verdict.reason }))
    process.exit(0)
  } catch (e) {
    console.error(`rule-review-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
