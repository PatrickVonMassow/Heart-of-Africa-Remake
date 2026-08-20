// The commit-msg gate on the AUTHORING-MODEL trailer (points 397 b / 425 a).
//
//   node scripts/model-trailer-gate.mjs --message <file>
//
// WHY IT EXISTS: on 29.07.2026 five commits of one branch carried the bare
// `Co-Authored-By: Claude <noreply@anthropic.com>` — a trailer naming no model —
// and the serving-model tripwire blocked the turn end, correctly: from the
// outside, a trailer that names nothing is indistinguishable from the silent
// degradation the tripwire exists to catch. The commits were clean, and clearing
// it cost a research pass. The Stop guard is the net under history; this is the
// grip that keeps the ambiguous commit out of it in the first place.
//
// Decision logic: model-guard-core.mjs (pure, Vitest-covered). This wrapper only
// reads the message file and prints the refusal. FAIL-OPEN on an internal error,
// like every gate here — a broken gate must never make the tree uncommittable —
// while a real finding fails CLOSED, which is the whole point.
import { readFileSync } from 'node:fs'
import { evaluateCommitTrailers, formatCommitTrailerVerdict } from './model-guard-core.mjs'
import { currentFableState } from './fable-switch.mjs'
import { isMainModule } from './is-main.mjs'

if (isMainModule(import.meta.url)) {
  try {
    const i = process.argv.indexOf('--message')
    const path = i === -1 ? '' : process.argv[i + 1]
    // No path, or an unreadable one, is not a finding: judge nothing rather than
    // block a commit over a file this gate failed to open.
    let message = ''
    try {
      message = path ? readFileSync(path, 'utf8') : ''
    } catch {
      message = ''
    }
    const fableState = currentFableState()
    if (!fableState.ok) {
      process.stderr.write(`model-trailer-gate: refusing because ${fableState.problem}\n`)
      process.exit(1)
    }
    const verdict = evaluateCommitTrailers(message, fableState)
    if (verdict.block) {
      process.stderr.write(`${formatCommitTrailerVerdict(verdict)}\n`)
      process.exit(1)
    }
    process.exit(0)
  } catch (e) {
    console.error(`model-trailer-gate error (allowing the commit): ${e && e.message}`)
    process.exit(0)
  }
}
