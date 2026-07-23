// Stop hook (user mandate 23.07.2026): GUARANTEE each batch-dashboard card
// speaks STRICTLY about its OWN topic — the active "272" now-card once reported
// the status of points 246 and 266, and reminders do not hold. The decision
// logic lives in dashboard-card-topic-guard-core.mjs (pure, Vitest-covered);
// this wrapper only reads the dashboard and TASKS.md and is fail-OPEN: any
// internal error → allow, so a guard bug never traps the session.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { evaluate } from './dashboard-card-topic-guard-core.mjs'

const DASHBOARD = fileURLToPath(new URL('../.batch-dashboard.html', import.meta.url))
const TASKS = fileURLToPath(new URL('../TASKS.md', import.meta.url))
const PAUSE = fileURLToPath(new URL('../.claude/batch-paused', import.meta.url))

try {
  try {
    JSON.parse(readFileSync(0, 'utf8')) // hook stdin (session_id) — unused, tolerated missing
  } catch {
    /* no/non-JSON stdin (manual run) — the rule is global truth, not session-local */
  }

  if (existsSync(PAUSE)) process.exit(0) // user-paused: no batch duty in flight
  if (!existsSync(DASHBOARD)) process.exit(0) // no board yet — dashboard-guard owns that case
  if (!existsSync(TASKS)) process.exit(0) // no known-point set to judge against

  const result = evaluate({
    dashboardHtml: readFileSync(DASHBOARD, 'utf8'),
    tasksText: readFileSync(TASKS, 'utf8'),
  })
  if (result.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }))
  process.exit(0)
} catch (e) {
  console.error(`dashboard-card-topic-guard error (allowing stop): ${e && e.message}`)
  process.exit(0)
}
