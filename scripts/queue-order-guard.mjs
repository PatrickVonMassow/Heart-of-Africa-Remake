// Stop hook (user mandate 22.07.2026): GUARANTEE two batch rules the assistant
// repeatedly broke despite reminders — (1) the dashboard Warteschlange works
// known-bug FIXES before the finder/QA tickets (memory
// queue-order-fixes-before-finders), and (2) no dashboard card claims a point
// is done ("behoben"/"erledigt"/…) while it is still open in TASKS.md. The
// decision logic lives in queue-order-guard-core.mjs (pure, Vitest-covered);
// this wrapper only reads the two files and is fail-OPEN: any internal error →
// allow, so a guard bug never traps the session.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { evaluate } from './queue-order-guard-core.mjs'

const TASKS = fileURLToPath(new URL('../TASKS.md', import.meta.url))
const DASHBOARD = fileURLToPath(new URL('../.batch-dashboard.html', import.meta.url))
const PAUSE = fileURLToPath(new URL('../.claude/batch-paused', import.meta.url))

try {
  try {
    JSON.parse(readFileSync(0, 'utf8')) // hook stdin (session_id) — unused, tolerated missing
  } catch {
    /* no/non-JSON stdin (manual run) — the rules are global truth, not session-local */
  }

  if (existsSync(PAUSE)) process.exit(0) // user-paused: no batch duty in flight
  if (!existsSync(DASHBOARD)) process.exit(0) // no board yet — dashboard-guard owns that case

  const result = evaluate({
    dashboardHtml: readFileSync(DASHBOARD, 'utf8'),
    tasksMd: readFileSync(TASKS, 'utf8'),
  })
  if (result.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }))
  process.exit(0)
} catch (e) {
  console.error(`queue-order-guard error (allowing stop): ${e && e.message}`)
  process.exit(0)
}
