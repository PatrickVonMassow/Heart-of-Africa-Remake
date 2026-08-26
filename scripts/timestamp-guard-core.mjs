// Pure decision logic of the timestamp Stop-hook guard (timestamp-guard.mjs):
// every chat reply must BEGIN with the bold Europe/Berlin timestamp in the
// canonical form "**Donnerstag, 23.07.2026, 09:55**" (chat-timestamp rule).
// The soft user-global pair (berlin-timestamp.cjs inject + check-reply-
// timestamp.cjs nudge) proved insufficient — this core backs the HARD guard
// that blocks turn-end until the reply carries a current stamp.
//
// The stamp is computed EXACTLY like the UserPromptSubmit injection hook
// (scripts/hooks/berlin-timestamp.cjs): Node ICU toLocaleString with
// timeZone 'Europe/Berlin' (DST-automatic), long German weekday, DD.MM.YYYY,
// HH:MM — so the guard's expectation and the injected value can never
// disagree. Everything here is pure and Vitest-covered
// (timestamp-guard.test.mjs); the wrapper only gathers stdin/transcript/state.
//
// WHAT A BLOCK ASKS FOR (point 403): the guard runs AFTER the reply is composed,
// so its message decides what gets written next. Until 28.07.2026 it asked for
// the closing reply to be produced a second time — and it was obeyed, which is
// how the user received the identical text at 19:18 and 19:19. The demand is
// unchanged (a closing message, led by the exact stamp handed over); only the
// deliverable is now named honestly, through the shared `shortAckDemand()`.
import { shortAckDemand } from './closing-reply-core.mjs'

const BERLIN = { timeZone: 'Europe/Berlin' }

/** Canonical Berlin stamp for a moment, e.g. "Donnerstag, 23.07.2026, 09:55".
 *  Identical formatting calls to scripts/hooks/berlin-timestamp.cjs. */
export function berlinStamp(date = new Date()) {
  const weekday = date.toLocaleString('de-DE', { ...BERLIN, weekday: 'long' })
  const day = date.toLocaleString('de-DE', {
    ...BERLIN, day: '2-digit', month: '2-digit', year: 'numeric',
  })
  const time = date.toLocaleString('de-DE', {
    ...BERLIN, hour: '2-digit', minute: '2-digit', hour12: false,
  })
  return `${weekday}, ${day}, ${time}`
}

// Tolerance: a reply composed over a long turn keeps its stamp valid for a
// while (minute rollover between composing and the Stop check must never
// false-block), and a small forward skew is tolerated. A stamp outside this
// window is stale — hours-old or yesterday's stamps always block. The window
// is built from per-minute ICU stamps, so midnight and DST rollovers are
// handled by construction (candidate string comparison, no date arithmetic).
export const MINUTES_BACK = 15
export const MINUTES_AHEAD = 3

/** Set of every stamp accepted as "current" around `now`. */
export function acceptedStamps(now = new Date()) {
  const stamps = new Set()
  for (let m = -MINUTES_AHEAD; m <= MINUTES_BACK; m++) {
    stamps.add(berlinStamp(new Date(now.getTime() - m * 60000)))
  }
  return stamps
}

/** The mandated reply opening: bold German-weekday stamp at the very start. */
export const TIMESTAMP_RE = /^\*\*([A-Za-zÄÖÜäöüß]+, \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2})\*\*/

/**
 * Inspect the beginning of the final-answer candidate in a session transcript.
 *
 * A tool-using turn writes assistant narration before its tool call, then a
 * user `tool_result`, and only later the final assistant reply. Stop can race
 * that last transcript write. Text from before the LAST tool result therefore
 * cannot be the final answer and is discarded at that boundary. Without a tool
 * result, an ordinary text-only answer remains judgeable as before.
 *
 * Assistant messages can stream as several entries sharing message.id, so the
 * visible reply's start is the FIRST text block of the LAST message id after
 * the boundary. Sidechain (subagent) entries are not visible to the user and
 * neither their text nor their tool results affect the main transcript.
 *
 * RESIDUAL RACE, KNOWINGLY LEFT OPEN (point 769). A turn that calls NO tool has
 * no tool result of its own, so the boundary falls in the PREVIOUS turn and the
 * text after it is that turn's already-answered reply. Lose the same write race
 * there and the guard judges that older reply instead of the new one — and it
 * mostly PASSES: the previous stamp is usually inside MINUTES_BACK, so the
 * verdict is a false ALLOW that lets an unstamped reply through unchecked. Only
 * once the previous turn is more than MINUTES_BACK old does it flip into a false
 * stale-stamp refusal. The exposure is therefore the opposite of the case this
 * point fixed — under-enforcement, not a fabricated fault — and it needs a
 * tool-less turn, which is the rarer shape here. Closing it means moving the
 * boundary to the last USER-PROMPT row, which is a different rule than the one
 * this point chose; it stays a separate decision. Until then the refusal text
 * quotes the line actually judged, so a raced block is at least recognisable as
 * one rather than reading as "your reply was wrong".
 */
export function inspectLastAssistantText(jsonl) {
  if (typeof jsonl !== 'string' || jsonl.trim() === '') {
    return { text: null, hasToolResultBoundary: false }
  }
  const firstTextById = new Map()
  let lastTextKey = null
  let hasToolResultBoundary = false
  let lineNo = 0
  for (const line of jsonl.split('\n')) {
    lineNo += 1
    if (!line.trim()) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue // a single corrupt line never hides the rest of the transcript
    }
    if (!entry || entry.isSidechain) continue
    const message = entry.message
    const content = message && message.content
    if (!Array.isArray(content)) continue
    if (content.some((block) => block && block.type === 'tool_result')) {
      firstTextById.clear()
      lastTextKey = null
      hasToolResultBoundary = true
    }
    if (entry.type !== 'assistant') continue
    const textBlock = content.find(
      (b) => b && b.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '',
    )
    if (!textBlock) continue
    const key = (message.id && String(message.id)) || `line-${lineNo}`
    if (!firstTextById.has(key)) firstTextById.set(key, textBlock.text)
    lastTextKey = key
  }
  return {
    text: lastTextKey === null ? null : firstTextById.get(lastTextKey),
    hasToolResultBoundary,
  }
}

/** The final-answer text, or null while no judgeable answer follows the last tool result. */
export function extractLastAssistantText(jsonl) {
  return inspectLastAssistantText(jsonl).text
}

/**
 * The header suffix shape, not its value: ` · Kontext: 115.942 Tokens`, or the
 * `--` reading when no measurement was made. The VALUE is deliberately not
 * compared — the guard reads the transcript at turn END, which may already show
 * a newer usage record than the one the prompt hook handed over, and blocking a
 * reply for copying the number it was given would be absurd.
 */
export const HEADER_SUFFIX_RE = / · Kontext: (?:\d{1,3}(?:\.\d{3})*|--) Tokens/

/**
 * The exact line the assistant must copy verbatim, embedded in every reason.
 *
 * IT CARRIES THE SUFFIX (user 20.08.2026, "schon wieder verschwunden"). The
 * header is a stamp AND the context reading, but a blocked turn is told to copy
 * "exactly this line" — so whatever this function omits gets dropped from the
 * reply, every single time a guard fires. Twice in a row that was the reading.
 * The line handed over is therefore the WHOLE header, never half of it.
 */
function copyLine(now, suffix = '') {
  return `**${berlinStamp(now)}**${suffix}`
}

/** A bounded, quoted account of the line the guard actually judged. */
function observedOpening(lastText) {
  const firstLine = lastText.trimStart().split(/\r?\n/, 1)[0].trimEnd()
  const bounded = firstLine.length > 160 ? `${firstLine.slice(0, 159)}…` : firstLine
  return JSON.stringify(bounded)
}

/** What the preflight can decide before the reply exists: the exact opening it
 * will be judged against, and the action that settles the condition this turn. */
export function timestampReplyCondition(now = new Date(), suffix = '') {
  return (
    `The not-yet-written reply must begin with ${copyLine(now, suffix)} in the canonical ` +
    '`**Wochentag, TT.MM.JJJJ, HH:MM**` form (German weekday, Europe/Berlin)' +
    (suffix ? ', followed by the context reading' : '') +
    '. Action: compose the reply with that line first; the Stop hook then judges the actual reply.'
  )
}

/**
 * Verdict for the last reply text. Returns null (allow) or
 * {decision:'block', reason} with the current stamp ready to copy verbatim.
 * A null/empty lastText blocks too (the wrapper routes the unverifiable-
 * transcript case through its bounded-escape counter before calling this).
 */
export function evaluate({ lastText, now = new Date(), headerSuffix = '', enforceSuffix = false }) {
  const expected = copyLine(now, headerSuffix)
  const rule =
    'Chat-timestamp rule: EVERY reply to the user begins with the bold Berlin ' +
    'timestamp (**Wochentag, TT.MM.JJJJ, HH:MM**, German weekday, Europe/Berlin).'
  if (typeof lastText !== 'string' || lastText.trim() === '') {
    return {
      decision: 'block',
      reason: `${rule} No assistant reply text was found to verify. ${shortAckDemand(expected)}`,
    }
  }
  const match = TIMESTAMP_RE.exec(lastText.trimStart())
  if (!match) {
    return {
      decision: 'block',
      reason:
        `${rule} The final-answer line the guard actually saw begins ` +
        `${observedOpening(lastText)} and does NOT begin with the timestamp. ${shortAckDemand(expected)}`,
    }
  }
  if (!acceptedStamps(now).has(match[1])) {
    return {
      decision: 'block',
      reason:
        `${rule} The final-answer line the guard actually saw was ${observedOpening(lastText)}. ` +
        `Its timestamp "**${match[1]}**" is not the current Berlin time (stale or wrong). ` +
        shortAckDemand(expected),
    }
  }
  // THE SECOND HALF OF THE HEADER. The stamp was never the whole rule — the
  // reading belongs directly after it — and it is the half that keeps going
  // missing, because a blocked turn copies the handed-over line and nothing
  // else.
  //
  // ENFORCED ONLY WHERE A REAL READING EXISTS. The handed-over line always
  // carries the suffix, `--` included, because a header with an unknown reading
  // is still a whole header. Demanding it back is a different question: where
  // nothing measured the context, the guard would be insisting on a value
  // nobody supplied — so it asks only when the measurement is real.
  if (enforceSuffix && !HEADER_SUFFIX_RE.test(lastText.trimStart().split('\n')[0])) {
    return {
      decision: 'block',
      reason:
        `${rule} The final-answer line the guard actually saw was ${observedOpening(lastText)}. ` +
        `The stamp is right, but the CONTEXT READING after it is missing — the header is ` +
        `both halves, and the reading is the half that keeps getting dropped. ${shortAckDemand(expected)}`,
    }
  }
  return null
}
