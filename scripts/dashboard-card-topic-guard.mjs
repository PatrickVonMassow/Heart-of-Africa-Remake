// Stop hook (user mandate 23.07.2026): GUARANTEE each batch-dashboard card
// speaks STRICTLY about its OWN topic — the active "272" now-card once reported
// the status of points 246 and 266, and reminders do not hold. The decision
// logic lives in dashboard-card-topic-guard-core.mjs (pure, Vitest-covered);
// this wrapper only reads the dashboard and TASKS.md and is fail-OPEN: any
// internal error → allow, so a guard bug never traps the session.
import { readFileSync, existsSync } from 'node:fs'
import { repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { evaluate } from './dashboard-card-topic-guard-core.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { readTasksAll } from './tasks-source.mjs'
import { CAUSE } from './guard-preflight-core.mjs'

const DASHBOARD = repoPath('.batch-dashboard.html')
const TASKS = repoPath('TASKS.md')
const PAUSE = repoPath('.claude/batch-paused')

/** Everything the core needs — shared with the guard preflight (see the note in
 *  dashboard-conciseness-guard.mjs: the preflight never gathers its own). */
export function gatherDashboardCardTopicInputs({ sessionId = '' } = {}) {
  if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused' }
  if (heldByOtherLiveOwner(sessionId)) {
    return { applicable: false, why: 'another live session owns the batch lock', cause: CAUSE.notLockOwner }
  }
  // No board yet — dashboard-guard owns that case.
  if (!existsSync(DASHBOARD)) return { applicable: false, why: 'no dashboard file in this checkout' }
  if (!existsSync(TASKS)) return { applicable: false, why: 'no work order to judge the cards against' }
  return {
    applicable: true,
    inputs: {
      dashboardHtml: readFileSync(DASHBOARD, 'utf8'),
      tasksText: readTasksAll(TASKS),
    },
  }
}

if (isMainModule(import.meta.url)) {
  try {
    let sid = ''
    try {
      sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
    } catch {
      /* no/non-JSON stdin (manual run) — the rule is global truth, not session-local */
    }

    const gathered = gatherDashboardCardTopicInputs({ sessionId: sid })
    if (!gathered.applicable) process.exit(0)

    const result = evaluate(gathered.inputs)
    if (result.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }))
    process.exit(0)
  } catch (e) {
    console.error(`dashboard-card-topic-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
