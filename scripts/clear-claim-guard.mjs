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
// That helper can return the PREVIOUS text block when the final reply has not
// been flushed yet (filed 20.08.2026 as its own point). That is usually a missed
// block and therefore cheap — but not always: a reply written BEFORE the claim
// existed, carrying an invitation that was correct at the time, would be judged
// against a claim acquired afterwards and falsely refuse a turn that never asked
// for anything (cross-vendor review, 20.08.2026). So text older than the claim is
// not judged at all.
import { existsSync, readFileSync } from 'node:fs'
import { extractLastAssistantText } from './timestamp-guard-core.mjs'
import { claimStands, evaluate, withdrawCommand } from './clear-claim-guard-core.mjs'
import { repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'

// `repoPath` rather than a URL relative to import.meta: the preflight imports
// this module for its gather step, and under the test transform import.meta.url
// is not a file URL — resolving it at import time took the whole preflight down
// (measured 20.08.2026).
/**
 * Resolved per CALL, not once at import: a module-level constant freezes
 * whatever `BATCH_CLAIM_PATH` happened to hold when the first importer loaded
 * this file, which is the wrong answer for every later reader and untestable
 * besides (cross-vendor review, 20.08.2026).
 */
export function claimPath() {
  return process.env.BATCH_CLAIM_PATH || repoPath('.claude/batch-claim.json')
}

function readClaim() {
  try {
    return JSON.parse(readFileSync(claimPath(), 'utf8'))
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
  // A RELEASED claim is not a standing one — `claimStands` says so, and reporting
  // a released record as "not judged" or as another session's claim told the
  // reader the guard might fire when it cannot (cross-vendor review, 20.08.2026).
  if (!standing || standing.releasedAt) {
    return { applicable: false, why: 'no claim stands, so nothing could be refused' }
  }
  // A claim EXISTS but we do not know who is asking: that is not a clean skip.
  // Reporting it as "not applicable" would tell the reader the guard is out of
  // play when it may well fire, so it is reported as NOT JUDGED instead
  // (cross-vendor review, 20.08.2026).
  if (!sessionId) {
    return {
      applicable: false,
      cause: 'not-judged',
      why:
        'a claim stands but this preflight was given no session id, so it cannot tell whether the ' +
        'claim is this session\'s. Action: pass --session <id> to judge it.',
    }
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

/**
 * Was the text this guard is about to judge written BEFORE the claim was taken?
 *
 * Only the newest assistant row is judged, so its own timestamp answers it. A
 * row without a readable timestamp, or a claim without one, is not evidence of
 * anything — those pass through and are judged, because the guard's fail
 * direction is to allow rather than to invent a reason.
 */
/**
 * Is the newest assistant text the FINAL reply, or an earlier one still waiting
 * for the flush?
 *
 * The timestamp check below only catches text older than the CLAIM. It does not
 * catch the other race: a previous post-claim reply that was refused, whose
 * correction has not been written yet — the extractor returns the old
 * invitation, its timestamp is newer than the claim, and the guard refuses the
 * correction for a fault it no longer contains (cross-vendor review,
 * 20.08.2026). The condition that separates the two is simple: if the transcript
 * does not END with the assistant text row, the final reply is not in it yet.
 */
export function replyNotFlushed(transcript) {
  const rows = String(transcript ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (rows.length === 0) return true
  let last
  try {
    last = JSON.parse(rows[rows.length - 1])
  } catch {
    // An unparseable tail is a partial write: the flush is in progress.
    return true
  }
  const isAssistantText =
    last && last.type === 'assistant' && last.message && Array.isArray(last.message.content)
      ? last.message.content.some((part) => part && part.type === 'text')
      : false
  return !isAssistantText
}

export function textPredatesClaim(transcript, claim) {
  const claimedAt = Number(claim && (claim.at ?? claim.claimedAt))
  if (!Number.isFinite(claimedAt) || claimedAt <= 0) return false
  let newest = null
  for (const line of String(transcript ?? '').split('\n')) {
    if (!line.trim()) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    const isAssistantText =
      row && row.type === 'assistant' && row.message && Array.isArray(row.message.content)
        ? row.message.content.some((part) => part && part.type === 'text')
        : false
    if (!isAssistantText) continue
    const at = Date.parse(row.timestamp ?? '')
    if (Number.isFinite(at)) newest = at
  }
  if (newest === null) return false
  return newest < claimedAt
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
  let transcript
  try {
    transcript = readFileSync(transcriptPath, 'utf8')
  } catch {
    return
  }
  if (replyNotFlushed(transcript)) return
  if (textPredatesClaim(transcript, claim)) return
  let lastText
  try {
    lastText = extractLastAssistantText(transcript)
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
