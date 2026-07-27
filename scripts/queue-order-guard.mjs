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
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { isMainModule } from './is-main.mjs'

const TASKS = fileURLToPath(new URL('../TASKS.md', import.meta.url))
const DASHBOARD = fileURLToPath(new URL('../.batch-dashboard.html', import.meta.url))
const PAUSE = fileURLToPath(new URL('../.claude/batch-paused', import.meta.url))

/** The guard's I/O half, shared with the preflight (point 365 D). */
export function gatherQueueOrderInputs({ sessionId = '' } = {}) {
  if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused' }
  if (heldByOtherLiveOwner(sessionId)) return { applicable: false, why: 'another live session owns the batch lock' }
  if (!existsSync(DASHBOARD)) return { applicable: false, why: 'no dashboard yet — dashboard-guard owns that case' }
  return {
    applicable: true,
    inputs: {
      dashboardHtml: readFileSync(DASHBOARD, 'utf8'),
      tasksMd: existsSync(TASKS) ? readFileSync(TASKS, 'utf8') : '',
    },
  }
}

if (isMainModule(import.meta.url)) {
  try {
    let sid = ''
    try {
      sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
    } catch {
      /* no/non-JSON stdin (manual run) — the rules are global truth, not session-local */
    }

    const gathered = gatherQueueOrderInputs({ sessionId: sid })
    if (!gathered.applicable) process.exit(0) // paused / non-owner / no board

    const result = evaluate(gathered.inputs)
    if (result.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }))
    process.exit(0)
  } catch (e) {
    console.error(`queue-order-guard error (allowing stop): ${e && e.message}`)
    process.exit(0)
  }
}
