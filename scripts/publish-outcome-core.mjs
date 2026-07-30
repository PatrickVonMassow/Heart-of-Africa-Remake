// Point 399 — did the publish actually SUCCEED?
// LEGACY (claude.ai artifact, retired 29.07.2026): this reads the MIRROR's tool
// response. The live transport is scripts/board-publish.mjs, which reports its
// own failures directly.
//
// The PostToolUse hook used to record `publishedHash` on the mere OCCURRENCE of
// an Artifact call, never looking at what came back. A refused, conflicted or
// failed publish therefore left dashboard-state.json claiming the board was
// live: invariant 9 in dashboard-guard-core.mjs went green while the phone
// showed the previous board. Found by the four-eyes review of 28.07.2026 —
// the one failure mode NO current check could see.
//
// The classification is deliberately ASYMMETRIC, because the two mistakes cost
// very different things:
//   - Calling a failed publish "published" is the bug above: silent staleness.
//   - Calling a good publish "failed" would block the Stop chain on a board that
//     is in fact live — a block loop, which CLAUDE.md §7.2 treats as the worse
//     outcome (a blocked turn produces nothing).
// So only an AFFIRMATIVE failure signal counts as failure, an affirmative
// success marker counts as success, and an unrecognised shape stays 'unknown':
// the hash is still recorded (today's behaviour, no new block loop) but flagged
// unverified, so the watchdog can say "this publish was never confirmed"
// instead of a guard silently trusting it.

/** Success marker of the Artifact tool: "Published <path> at <artifact url>". */
const SUCCESS_RE = /\bpublished\b[\s\S]*\/artifact\//i

/** Affirmative failure wording, incl. the 409 conflict path and refusals. */
const FAILURE_RE = /\b(error|failed|failure|refused|denied|rejected|conflict|409|not permitted|unable to)\b/i

/** Flatten the many shapes a tool_response arrives in into searchable text. */
export function responseText(toolResponse) {
  if (toolResponse == null) return ''
  if (typeof toolResponse === 'string') return toolResponse
  if (Array.isArray(toolResponse)) return toolResponse.map(responseText).join('\n')
  if (typeof toolResponse === 'object') {
    const parts = []
    for (const key of ['text', 'content', 'message', 'error', 'result', 'stdout']) {
      if (key in toolResponse) parts.push(responseText(toolResponse[key]))
    }
    return parts.join('\n')
  }
  return ''
}

/**
 * 'success' | 'failure' | 'unknown' for one Artifact tool_response.
 *
 * `isError` is the harness' own flag (tool_response.is_error / isError) and
 * outranks the text: a harness-reported error is never a success, whatever the
 * body says.
 */
export function classifyPublishResponse(toolResponse) {
  const flagged =
    toolResponse != null &&
    typeof toolResponse === 'object' &&
    (toolResponse.is_error === true || toolResponse.isError === true)
  if (flagged) return 'failure'

  const text = responseText(toolResponse)
  if (!text.trim()) return 'unknown'
  if (SUCCESS_RE.test(text)) return 'success'
  if (FAILURE_RE.test(text)) return 'failure'
  return 'unknown'
}

/**
 * The dashboard-state patch for one publish attempt, or null when nothing
 * should be written. `hash` is the sha256 of the file that was handed to the
 * Artifact tool; pass null when it could not be read.
 *
 * success  → today's record, plus publishFailed/publishUnverified cleared.
 * failure  → NO publishedHash (the board is not live), publishFailed set so the
 *            guards and the watchdog can see and name it.
 * unknown  → the hash IS recorded (unchanged behaviour, no new block loop) but
 *            publishUnverified marks it as un-confirmed evidence.
 */
export function publishStatePatch(outcome, { hash, path, at }) {
  if (outcome === 'failure') {
    return { publishFailed: { at, path, reason: 'the Artifact call did not report a successful publish' } }
  }
  if (!hash) return null
  const base = { publishedHash: hash, publishedAt: at, publishedPath: path, publishedBy: 'hook' }
  if (outcome === 'success') {
    return { ...base, publishDeferred: undefined, publishFailed: undefined, publishUnverified: undefined }
  }
  return { ...base, publishDeferred: undefined, publishFailed: undefined, publishUnverified: true }
}
