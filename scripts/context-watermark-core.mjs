// THE CONTEXT WATERMARK (point 675, defeat 3) — the decision half, pure.
//
// WHY: the boundary fires on a closed point and on nothing else, so a session
// that answers questions and files points for hours never reaches one — measured
// THREE TIMES in one day under the user's direct observation (13.08.2026). Past
// the watermark the session finishes the step it is in, hands over, and says so;
// the board card says why (`boundaryCardText`, cause 'context').
//
// THE READING IS A MEASUREMENT, NEVER AN ASSUMPTION. It is parsed from the
// session's own transcript (the newest API usage record the harness wrote), and
// when no reading is obtainable the verdict says so LOUDLY ('unreadable', with
// `alert: true`) instead of silently never firing.

/**
 * THE WATERMARK, in tokens of context. One named place, calibratable via
 * HOA_CONTEXT_WATERMARK_TOKENS (read by the IO wrapper so this stays pure).
 *
 * WHY 150 000: it is the measured cost cliff the whole boundary rule exists for
 * — 87–94 % of the batch's token spend sat ABOVE 150k context, one session
 * carrying point after point (CLAUDE.md §6, users 27./28.07.2026). A session at
 * the mark has already consumed the cheap region; everything further multiplies
 * every subsequent turn's cost, so the handover pays for itself immediately.
 */
export const CONTEXT_WATERMARK_TOKENS = 150_000

/**
 * The CURRENT CONTEXT SIZE from a transcript tail. PURE.
 *
 * `text` is the tail of the harness's session transcript (JSONL, one API event
 * per line). The context a NEXT call will carry is what the LAST call reported:
 * input_tokens + cache_read_input_tokens + cache_creation_input_tokens of the
 * newest usage record. Scanned from the END, so a truncated first line (the
 * caller reads a bounded tail) costs nothing.
 *
 * Sidechain records are SKIPPED: a subagent's usage describes the subagent's
 * context, not this session's, and counting it would fire the watermark off a
 * delegated worker's reading.
 *
 * Returns { tokens, at } or null when no usage record can be read.
 */
export function parseContextTokens(text) {
  const lines = String(text ?? '').split('\n')
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim()
    if (!line) continue
    let obj
    try {
      obj = JSON.parse(line)
    } catch {
      continue // a torn or non-JSON line proves nothing; keep looking
    }
    if (!obj || typeof obj !== 'object') continue
    if (obj.isSidechain === true) continue
    const usage = obj.message?.usage ?? obj.usage
    if (!usage || typeof usage !== 'object') continue
    const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
    const input = n(usage.input_tokens) + n(usage.cache_read_input_tokens) + n(usage.cache_creation_input_tokens)
    if (input <= 0) continue
    const at = typeof obj.timestamp === 'string' ? Date.parse(obj.timestamp) : NaN
    return { tokens: input, at: Number.isFinite(at) ? at : null }
  }
  return null
}

/**
 * PAST, BELOW, OR UNREADABLE? PURE.
 *
 * Returns { state, tokens, watermark, alert }:
 *   'past'       — the reading is real and at/over the mark: hand over.
 *   'below'      — the reading is real and under it: keep working.
 *   'unreadable' — NO real reading. `alert` is true: this must surface loudly
 *                  (a watermark that silently never fires is defeat 3 intact).
 */
export function watermarkDecision({ reading, watermark = CONTEXT_WATERMARK_TOKENS } = {}) {
  const mark = Number.isFinite(watermark) && watermark > 0 ? watermark : CONTEXT_WATERMARK_TOKENS
  if (!reading || typeof reading.tokens !== 'number' || !(reading.tokens > 0)) {
    return { state: 'unreadable', tokens: null, watermark: mark, alert: true }
  }
  return {
    state: reading.tokens >= mark ? 'past' : 'below',
    tokens: reading.tokens,
    watermark: mark,
    alert: false,
  }
}
