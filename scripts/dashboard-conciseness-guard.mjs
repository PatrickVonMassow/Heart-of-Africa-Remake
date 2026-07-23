// Stop hook (user mandate 23.07.2026): GUARANTEE the batch dashboard's now/
// queue cards stay CONCISE and HIGH-LEVEL — reminders failed repeatedly, and
// the cards kept regressing into changelog walls (commit hashes, file paths,
// code spans, single giant paragraphs). The decision logic lives in
// dashboard-conciseness-guard-core.mjs (pure, Vitest-covered); this wrapper
// only reads the dashboard file and is fail-OPEN: any internal error → allow,
// so a guard bug never traps the session.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { evaluate } from './dashboard-conciseness-guard-core.mjs'

const DASHBOARD = fileURLToPath(new URL('../.batch-dashboard.html', import.meta.url))
const PAUSE = fileURLToPath(new URL('../.claude/batch-paused', import.meta.url))

try {
  try {
    JSON.parse(readFileSync(0, 'utf8')) // hook stdin (session_id) — unused, tolerated missing
  } catch {
    /* no/non-JSON stdin (manual run) — the rule is global truth, not session-local */
  }

  if (existsSync(PAUSE)) process.exit(0) // user-paused: no batch duty in flight
  if (!existsSync(DASHBOARD)) process.exit(0) // no board yet — dashboard-guard owns that case

  const result = evaluate({ dashboardHtml: readFileSync(DASHBOARD, 'utf8') })
  if (result.block) process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }))
  process.exit(0)
} catch (e) {
  console.error(`dashboard-conciseness-guard error (allowing stop): ${e && e.message}`)
  process.exit(0)
}
