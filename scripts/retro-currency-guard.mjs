// Stop hook: GUARANTEE the retrospective document
// (docs/analysis_de/retrospektive-zusammenarbeit.md) stays current — enforcement, not a
// reminder (the document's own lesson #1: only blocking mechanisms hold).
//
// It recomputes the fingerprint over the durable problem/solution-history
// sources (retro-sources.mjs) and BLOCKS turn-end while the doc's recorded
// fingerprint differs — a new/edited feedback memory, a new guard script, a
// fresh revert or a process TASKS change then forces
// `node scripts/retro-refresh.mjs` plus a review for a new problem class
// before the turn can end. The decision logic lives in retro-core.mjs (pure,
// Vitest-covered in retro-core.test.mjs).
//
// No-ops (exit 0, never block): the doc is absent (nothing to keep current —
// e.g. a worktree or another machine), the batch is paused, or this session
// does not own the live batch lock (ownership-aware like every guard since
// the hard singleton). Fail-OPEN: any internal error — unreadable stdin, a
// git failure, a broken memory dir — allows the stop; this guard must never
// trap the session.
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { computeFingerprint, evaluateCurrency, evaluateLedger } from './retro-core.mjs'
import { collectSources, DOC_PATH, GUIDE_PATH, LEDGER_PATH, REPO_ROOT } from './retro-sources.mjs'

const PAUSE = resolve(REPO_ROOT, '.claude', 'batch-paused')

/** A ledger cell's file reference, resolved against the repo root. Absolute or
 *  escaping paths are refused rather than probed. */
const pathExists = (rel) =>
  !isAbsolute(rel) && !rel.split('/').includes('..') && existsSync(resolve(REPO_ROOT, rel))

try {
  let sessionId = ''
  try {
    sessionId = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
  } catch {
    // manual run / non-JSON stdin — the currency check binds regardless
  }

  if (existsSync(PAUSE)) process.exit(0)
  if (!existsSync(DOC_PATH)) process.exit(0)
  if (heldByOtherLiveOwner(sessionId)) process.exit(0)

  const docText = readFileSync(DOC_PATH, 'utf8')
  const reasons = []

  // LEDGER FIRST, and in its OWN try. `collectSources()` below THROWS in every
  // git worktree (the memory dir is keyed on the checkout path), which the outer
  // catch turns into exit 0 — so a ledger check wired behind the fingerprint
  // would be permanently blind exactly where the delegated agents work. The
  // ledger needs only the two documents and a file probe, none of which throws
  // there. (Found by the four-eyes design review, 27.07.2026.)
  try {
    const ledger = evaluateLedger({
      retroText: docText,
      ledgerText: existsSync(LEDGER_PATH) ? readFileSync(LEDGER_PATH, 'utf8') : null,
      pathExists,
    })
    if (ledger?.decision === 'block') reasons.push(ledger.reason)
    else if (ledger?.warning) console.error(ledger.warning)
  } catch (e) {
    console.error(`retro-currency-guard ledger check errored (allowing): ${e && e.message}`)
  }

  // Currency second, likewise isolated: a worktree's throw must not swallow a
  // ledger verdict that was already decided.
  try {
    const verdict = evaluateCurrency({
      docText,
      // Guide absent (worktree, other machine) → undefined, which skips its half.
      guideText: existsSync(GUIDE_PATH) ? readFileSync(GUIDE_PATH, 'utf8') : undefined,
      currentFingerprint: computeFingerprint(collectSources()),
    })
    if (verdict) reasons.push(verdict.reason)
  } catch (e) {
    console.error(`retro-currency-guard currency check errored (allowing): ${e && e.message}`)
  }

  // BOTH verdicts in ONE message. Reporting them serially would make the second
  // defect cost a whole extra turn — §3.32's "an enforcer that grips too late".
  if (reasons.length) {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: reasons.join('\n\n') }) + '\n')
  }
  process.exit(0)
} catch (e) {
  console.error(`retro-currency-guard error (allowing stop): ${e && e.message}`)
  process.exit(0)
}
