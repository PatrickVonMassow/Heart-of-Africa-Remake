// Stop hook: the rule corpus gets read through periodically, not when someone
// happens to think of it. See rule-review-core.mjs for the audit that showed
// what an unreviewed corpus accumulates.
//
// The decision logic is pure and Vitest-covered; this wrapper only reads the
// bookkeeping and is fail-OPEN: any throw, an unreadable state file, an
// uncountable corpus — all allow the stop. It stands down while the batch is
// paused and while another live session owns the batch lock.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { evaluateRuleReview } from './rule-review-core.mjs'
import { countCorpusEntries, STATE_PATH } from './rule-review-state.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'

const PAUSE = fileURLToPath(new URL('../.claude/batch-paused', import.meta.url))

try {
  // A --status query is a QUESTION, not a turn end: it must answer even when
  // another session owns the lock. Checking ownership first made the manual
  // check silently print nothing, which reads exactly like "nothing owed" —
  // a status probe that cannot report is worse than none.
  const status = process.argv[2] === '--status'
  if (!status) {
    let sid = ''
    try {
      sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
    } catch {
      /* manual run — the rule binds regardless */
    }
    if (heldByOtherLiveOwner(sid)) process.exit(0)
  }

  let state = {}
  try {
    state = JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  } catch {
    /* never attested yet — evaluate decides what that means */
  }

  const verdict = evaluateRuleReview({
    now: Date.now(),
    lastReviewedAt: Number(state.lastReviewedAt) || null,
    entryCount: countCorpusEntries(),
    reviewedCount: Number(state.reviewedCount) || null,
    paused: existsSync(PAUSE),
  })

  if (status) {
    console.log(verdict ? verdict.reason : 'rule-review-guard: keine Durchsicht fällig')
    process.exit(0)
  }
  if (verdict) process.stdout.write(JSON.stringify(verdict))
  process.exit(0)
} catch (e) {
  console.error(`rule-review-guard error (allowing stop): ${e && e.message}`)
  process.exit(0)
}
