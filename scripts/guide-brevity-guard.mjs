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
import { repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { auditGuide, formatViolations } from './guide-brevity-core.mjs'

const GUIDE = repoPath('docs/analysis_de/vibe-coding-anleitung.md')
const PAUSE = repoPath('.claude/batch-paused')

/** Everything the core needs — shared with the guard preflight, which must never
 *  gather its own (a second copy would drift and hand back a false "clean"). */
export function gatherGuideBrevityInputs() {
  if (existsSync(PAUSE)) return { applicable: false, why: 'the batch is paused' }
  if (!existsSync(GUIDE)) return { applicable: false, why: 'the guide is not in this checkout' }
  return { applicable: true, inputs: { guideText: readFileSync(GUIDE, 'utf8') } }
}

if (isMainModule(import.meta.url)) {
  try {
    const status = process.argv[2] === '--status'
    const gathered = status
      ? existsSync(GUIDE)
        ? { applicable: true, inputs: { guideText: readFileSync(GUIDE, 'utf8') } }
        : { applicable: false, why: 'the guide is not in this checkout' }
      : gatherGuideBrevityInputs()
    if (!gathered.applicable) {
      if (status) console.log(`guide-brevity stands down: ${gathered.why}`)
      process.exit(0)
    }

    const { ok, violations } = auditGuide(gathered.inputs.guideText)

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
}
