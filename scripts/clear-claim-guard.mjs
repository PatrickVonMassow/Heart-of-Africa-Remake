// Stop hook: refuse a turn that invites a `/clear` while this session still
// claims the batch (user mandate 20.08.2026, after he caught exactly that state
// by hand). The decision is pure and lives in clear-claim-guard-core.mjs.
//
// FAIL DIRECTION, opposite to the timestamp guard's: this one allows whenever it
// cannot see the state. It refuses ONE specific combination — a live claim of
// THIS session plus an invitation in the reply — and both halves have to be read
// to know it. A guard that blocked on an unreadable transcript would stop turns
// that have nothing to do with the batch.
//
// It reuses `extractLastAssistantText` rather than copying the transcript rule.
// That helper can return the previous text block when the final reply has not
// been flushed yet (filed 20.08.2026); here the cost of that race is a missed
// block, never a false one, and the claim state — the half that actually
// matters — is read live from disk.
import { existsSync, readFileSync } from 'node:fs'
import { extractLastAssistantText } from './timestamp-guard-core.mjs'
import { claimStands, evaluate, withdrawCommand } from './clear-claim-guard-core.mjs'
import { repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'

// `repoPath` rather than a URL relative to import.meta: the preflight imports
// this module for its gather step, and under the test transform import.meta.url
// is not a file URL — resolving it at import time took the whole preflight down
// (measured 20.08.2026).
const CLAIM_PATH = process.env.BATCH_CLAIM_PATH || repoPath('.claude/batch-claim.json')

function readClaim() {
  try {
    return JSON.parse(readFileSync(CLAIM_PATH, 'utf8'))
  } catch {
    // No claim file is the ordinary state: a withdrawn claim is a deleted file.
    return null
  }
}

/**
 * PREFLIGHT gather. This guard judges the not-yet-written reply, exactly as the
 * timestamp and decision-card guards do, so it reports a CONDITION rather than a
 * verdict: the preflight cannot know whether the reply will invite a `/clear`.
 * What it CAN read is the half that decides whether the condition applies at all
 * — whether a claim of THIS session stands — so the report says which of the two
 * states the turn is in instead of staying silent about a wired Stop hook.
 */
export function gatherClearClaimCondition({ sessionId = '', claim } = {}) {
  const standing = claim === undefined ? readClaim() : claim
  if (!standing || !sessionId) {
    return { applicable: false, why: 'no claim of this session stands, so nothing could be refused' }
  }
  if (!claimStands({ claim: standing, sessionId })) {
    return { applicable: false, why: 'the standing claim belongs to another session' }
  }
  return {
    applicable: true,
    condition: true,
    why:
      'This session still CLAIMS the batch, so the not-yet-written reply may not invite a `/clear`. ' +
      `Action: either compose it without that invitation, or withdraw the claim first — ${withdrawCommand(sessionId)}.`,
  }
}

function main() {
  let payload = {}
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return // nothing readable to judge
  }
  const sessionId = (payload && payload.session_id) || ''
  const claim = readClaim()
  // Cheapest half first: without a standing claim of this session there is
  // nothing to refuse, and the transcript need not be read at all.
  if (!claim || !sessionId) return
  const transcriptPath = payload && payload.transcript_path
  if (!transcriptPath || !existsSync(transcriptPath)) return
  let lastText
  try {
    lastText = extractLastAssistantText(readFileSync(transcriptPath, 'utf8'))
  } catch {
    return
  }
  const verdict = evaluate({ lastText: lastText ?? '', claim, sessionId })
  if (verdict) process.stdout.write(JSON.stringify(verdict) + '\n')
}

// Only as the entry script. `main()` reads stdin, so running it on IMPORT makes
// every importer block on a pipe that will never be written — which is exactly
// what happened when the preflight took this module in for its gather step
// (measured 20.08.2026).
if (isMainModule(import.meta.url)) {
  try {
    main()
  } catch {
    // A guard that cannot run must not stop unrelated work: see the fail
    // direction above. The state it watches is re-read every turn, so a
    // transient failure costs at most one unguarded turn.
  }
}
