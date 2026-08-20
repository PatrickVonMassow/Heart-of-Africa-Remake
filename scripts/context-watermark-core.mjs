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
 * THE MEASURED COST OF LEAVING — what a session still pays between deciding to
 * hand over and its last repository action (measured 19.08.2026). The handover
 * threshold is derived from it, so it is a constant here rather than a number
 * repeated in a test.
 */
export const MEASURED_BOUNDARY_COST_TOKENS = 27_336

/**
 * THE HANDOVER THRESHOLD, in tokens of context — the mark at which a session
 * finishes its step and ENDS. It is DERIVED, not chosen: the largest mark at
 * which the ordinary case (the mark fires, the boundary is taken straight
 * away) still lands under the ceiling is 150,000 − 27,336 = 122,664, rounded
 * down to 122,000.
 *
 * IT SITS CLOSE UNDER THE CEILING BY DESIGN (point 758, user 20.08.2026). It
 * used to be 110,000 and served TWO purposes at once — it ended the session AND
 * it was the mark past which the context fence refused new work. Those are
 * different contracts: ending late is cheap (the boundary still fits), while
 * refusing early is expensive (it forbids work a session could still do). They
 * are split now — the refusal side is `CONTEXT_REFUSAL_TOKENS` below — and this
 * side moved up to where the arithmetic actually puts it.
 *
 * THE FLOOR RULE still binds: this number may never sit below the measured
 * startup cost of a session that has done no work, plus a margin. A threshold
 * under that floor bounds nothing — it forbids a fresh session its FIRST call,
 * and the batch cannot advance a point at all. That is what the earlier 82,000
 * did: four autostarted sessions in a row stood above it before any work of
 * their own (85,225 / 83,079 / 86,416, and one that reached 91,605 on
 * orientation alone). A freshly cleared session's first response already carries
 * 61,372 tokens before a single tool call.
 *
 * INTERIM, not a result: point 747 recalibrates it from the recorded series once
 * the consumption-reducing points have landed.
 */
export const CONTEXT_TRIGGER_TOKENS = 122_000

/**
 * THE REFUSAL THRESHOLD, in tokens of context — the mark past which the context
 * fence (`context-fence-guard.mjs`) refuses to START new work, and NOTHING
 * else. Split off from the handover threshold by point 758.
 *
 * It is only ever consulted in ARMED mode (`CONTEXT_FENCE_MODES` below). In the
 * DEFAULT observation mode the fence measures against it and records what it
 * would have refused, but refuses nothing — so this number currently describes
 * an observation, not a refusal.
 *
 * 110,000 is the value the single combined threshold last carried (user
 * 20.08.2026). It is kept unchanged so that re-arming restores exactly the
 * behaviour that was measured, rather than a new untested one; point 747
 * recomputes it from the series before the fence is armed again.
 */
export const CONTEXT_REFUSAL_TOKENS = 110_000

/**
 * THE FENCE MODES — the named, single-valued switch point 758 demands, so that a
 * disabled gate is VISIBLE as disabled rather than disguised as a passing one
 * (a threshold set absurdly high would read as an armed fence that happens never
 * to fire, which is the same lie the user objected to).
 *
 *   'observe' — DEFAULT. The fence measures, records what it WOULD have
 *               refused, and refuses nothing.
 *   'armed'   — the fence refuses exactly as it did before point 758.
 *
 * WHY OBSERVE IS THE DEFAULT (user 20.08.2026): "Introducing the limits now was
 * nonsense. That should have happened right at the end, once the outstanding
 * tickets had reduced the consumption." The fence refuses writes to every
 * authoring target — the work order, the archive, CLAUDE.md, design.md, docs/,
 * memory/ — which is exactly the file set the consumption-reducing points must
 * edit, and three fresh sessions in a row were stopped above the mark before
 * beginning any work at all.
 *
 * RE-ARMING IS NOT AUTOMATIC and is not this point's business: it is a condition
 * inside point 747, once 757/614/742/744/597 have landed and the start floor has
 * been measured anew.
 */
export const CONTEXT_FENCE_MODES = Object.freeze(['observe', 'armed'])

/** The mode in force while nothing overrides it. Flipping this constant to
 *  'armed' is what re-arming the fence means. */
export const CONTEXT_FENCE_MODE_DEFAULT = 'observe'

/**
 * ONE mode name, normalised. PURE. An unrecognised spelling falls back to the
 * default rather than inventing a third behaviour — the same fail direction the
 * rest of the fence takes, and the caller reports the mode it ended up with, so
 * a typo shows up in `--status` instead of silently arming or disarming.
 */
export function normalizeFenceMode(raw, fallback = CONTEXT_FENCE_MODE_DEFAULT) {
  const v = String(raw ?? '').trim().toLowerCase()
  return CONTEXT_FENCE_MODES.includes(v) ? v : fallback
}

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
