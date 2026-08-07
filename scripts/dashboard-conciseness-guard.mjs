// Stop hook (user mandate 23.07.2026): GUARANTEE the batch dashboard's now/
// queue cards stay CONCISE and HIGH-LEVEL — reminders failed repeatedly, and
// the cards kept regressing into changelog walls (commit hashes, file paths,
// code spans, single giant paragraphs). The decision logic lives in
// dashboard-conciseness-guard-core.mjs (pure, Vitest-covered); this wrapper
// only reads the dashboard file and is fail-OPEN: any internal error → allow,
// so a guard bug never traps the session.
import { readFileSync, existsSync } from 'node:fs'
import { repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { evaluate } from './dashboard-conciseness-guard-core.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { CAUSE } from './guard-preflight-core.mjs'

const DASHBOARD = repoPath('.batch-dashboard.html')
const PAUSE = repoPath('.claude/batch-paused')

/**
 * Everything the core needs — exported so the guard preflight predicts this gate
 * from the SAME gathering the Stop hook uses rather than a second copy of it,
 * which would drift and hand back a false "clean".
 */
export function gatherDashboardConcisenessInputs({ sessionId = '' } = {}) {
  if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused' }
  if (heldByOtherLiveOwner(sessionId)) {
    return { applicable: false, why: 'another live session owns the batch lock', cause: CAUSE.notLockOwner }
  }
  // No board yet — dashboard-guard owns that case.
  if (!existsSync(DASHBOARD)) return { applicable: false, why: 'no dashboard file in this checkout' }
  return { applicable: true, inputs: { dashboardHtml: readFileSync(DASHBOARD, 'utf8') } }
}

if (isMainModule(import.meta.url)) {
  try {
    let sid = ''
    try {
      sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
    } catch {
      /* no/non-JSON stdin (manual run) — the rule is global truth, not session-local */
    }

    const gathered = gatherDashboardConcisenessInputs({ sessionId: sid })
    if (!gathered.applicable) process.exit(0)

    const result = evaluate(gathered.inputs)
    if (result.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }))
    process.exit(0)
  } catch (e) {
    console.error(`dashboard-conciseness-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
