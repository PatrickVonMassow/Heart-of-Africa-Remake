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
 * THE CEILING, in tokens of context. This is the cost cliff against which an
 * incident overshoot is measured; it is NOT the point at which new work may be
 * admitted, because a handover begun here would finish beyond the ceiling.
 */
export const CONTEXT_CEILING_TOKENS = 150_000

/**
 * THE TRIGGER, in tokens of context. Admission decisions use this lower number
 * so the observed work still paid after a trigger can fit below the ceiling.
 *
 * THE FLOOR RULE: this number may never sit below the measured startup cost of
 * a session that has done no work, plus a margin. A trigger under that floor
 * bounds nothing — it forbids a fresh session its FIRST call, and the batch
 * cannot advance a point at all.
 *
 * That is what the previous 82,000 did. Four autostarted sessions in a row
 * stood above it before any work of their own: 85,225 (19.08., 23:44), 83,079
 * (20.08., 00:17), 86,416 (20.08., 00:31), and one that reached 91,605 on
 * orientation alone — each refused its first delegation and able only to hand
 * over. The floor underneath is measured too: a freshly cleared session's first
 * response already carries 61,372 tokens before a single tool call.
 *
 * 110,000 (user decision 20.08.2026) clears that ~87k startup floor with room
 * to work and stays 40,000 below the ceiling. It is an INTERIM value, not a
 * result: point 744 recomputes it from the clean handover measurement and
 * point 747 recalibrates the ceiling from the recorded series.
 */
export const CONTEXT_TRIGGER_TOKENS = 110_000

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
/**
 * THE STATED MARGIN (point 700): how far past the ceiling a boundary may
 * honestly land. A boundary taken FURTHER past it than this says so in the
 * session's closing report, so the distance between the ceiling and the real
 * handover stays a number somebody reads rather than a claim.
 */
export const CONTEXT_MARGIN_TOKENS = 25_000

/**
 * THE DISTANCE NOTE a boundary commit prints (point 700). PURE, pinned by
 * tests. Null when the recorded reading sits within the margin; a sentence
 * demanding the closing report name it when it does not — and when NO reading
 * rode on the boundary at all, since an unmeasured distance must not read as a
 * small one.
 */
export function contextDistanceNote({ tokens, ceiling, margin = CONTEXT_MARGIN_TOKENS } = {}) {
  if (typeof tokens !== 'number' || !(tokens > 0)) {
    return (
      'NO CONTEXT READING RODE ON THIS BOUNDARY — the distance to the ceiling cannot be judged. ' +
      'Say so in the closing report.'
    )
  }
  const limit = typeof ceiling === 'number' && ceiling > 0 ? ceiling : CONTEXT_CEILING_TOKENS
  const over = tokens - limit
  if (over <= margin) return null
  return (
    `THIS BOUNDARY WAS TAKEN ${over} TOKENS PAST THE ${limit} CEILING (measured ${tokens}, stated margin ` +
    `${margin}) — say so in the closing report, naming what kept the session working past the ceiling.`
  )
}

export function watermarkDecision({ reading, watermark = CONTEXT_TRIGGER_TOKENS } = {}) {
  const mark = Number.isFinite(watermark) && watermark > 0 ? watermark : CONTEXT_TRIGGER_TOKENS
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
