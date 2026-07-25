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
import { resolve } from 'node:path'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'
import { computeFingerprint, evaluateCurrency } from './retro-core.mjs'
import { collectSources, DOC_PATH, GUIDE_PATH, REPO_ROOT } from './retro-sources.mjs'

const PAUSE = resolve(REPO_ROOT, '.claude', 'batch-paused')

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

  const verdict = evaluateCurrency({
    docText: readFileSync(DOC_PATH, 'utf8'),
    // Guide absent (worktree, other machine) → undefined, which skips its half.
    guideText: existsSync(GUIDE_PATH) ? readFileSync(GUIDE_PATH, 'utf8') : undefined,
    currentFingerprint: computeFingerprint(collectSources()),
  })
  if (verdict) process.stdout.write(JSON.stringify(verdict) + '\n')
  process.exit(0)
} catch (e) {
  console.error(`retro-currency-guard error (allowing stop): ${e && e.message}`)
  process.exit(0)
}
