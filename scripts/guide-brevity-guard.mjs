// Stop hook: the beginner's guide may not grow back into a project chronicle.
//
// docs/analysis_de/vibe-coding-anleitung.md must stay a SHORT guide — risk in a
// sentence or two, then the prompt. See guide-brevity-core.mjs for the budgets
// and the project-specific markers this rejects.
//
// The decision logic is pure and Vitest-covered; this wrapper only reads the
// file and is fail-OPEN: a missing document, an unreadable path, any throw at
// all allows the stop, because a guard bug must never trap the session. The
// unit-test layer audits the same document, so a violation also fails the
// ordinary regression — the hook is the fast feedback, the test is the gate.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { auditGuide, formatViolations } from './guide-brevity-core.mjs'

const GUIDE = fileURLToPath(new URL('../docs/analysis_de/vibe-coding-anleitung.md', import.meta.url))
const PAUSE = fileURLToPath(new URL('../.claude/batch-paused', import.meta.url))

try {
  const status = process.argv[2] === '--status'
  if (!status && existsSync(PAUSE)) process.exit(0)
  if (!existsSync(GUIDE)) process.exit(0)

  const { ok, violations } = auditGuide(readFileSync(GUIDE, 'utf8'))

  if (status) {
    console.log(ok ? 'guide-brevity: OK' : formatViolations(violations))
    process.exit(0)
  }
  if (!ok) process.stdout.write(JSON.stringify({ decision: 'block', reason: formatViolations(violations) }))
  process.exit(0)
} catch (e) {
  console.error(`guide-brevity-guard error (allowing stop): ${e && e.message}`)
  process.exit(0)
}
