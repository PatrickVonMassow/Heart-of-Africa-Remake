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
 * The beginning of the LAST assistant message in a session transcript
 * (JSONL). Assistant messages stream as one entry per content block sharing
 * message.id, so the visible reply's start is the FIRST text block of the
 * LAST message id that has any text. Sidechain (subagent) entries are not
 * shown to the user and are skipped. Returns the text, or null when no
 * assistant text exists / the input is empty.
 */
export function extractLastAssistantText(jsonl) {
  if (typeof jsonl !== 'string' || jsonl.trim() === '') return null
  const firstTextById = new Map()
  let lastTextKey = null
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
    if (!entry || entry.type !== 'assistant' || entry.isSidechain) continue
    const message = entry.message
    const content = message && message.content
    if (!Array.isArray(content)) continue
    const textBlock = content.find(
      (b) => b && b.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '',
    )
    if (!textBlock) continue
    const key = (message.id && String(message.id)) || `line-${lineNo}`
    if (!firstTextById.has(key)) firstTextById.set(key, textBlock.text)
    lastTextKey = key
  }
  return lastTextKey === null ? null : firstTextById.get(lastTextKey)
}

/** The exact line the assistant must copy verbatim, embedded in every reason. */
function copyLine(now) {
  return `**${berlinStamp(now)}**`
}

/**
 * Verdict for the last reply text. Returns null (allow) or
 * {decision:'block', reason} with the current stamp ready to copy verbatim.
 * A null/empty lastText blocks too (the wrapper routes the unverifiable-
 * transcript case through its bounded-escape counter before calling this).
 */
export function evaluate({ lastText, now = new Date() }) {
  const expected = copyLine(now)
  const rule =
    'Chat-timestamp rule: EVERY reply to the user begins with the bold Berlin ' +
    'timestamp (**Wochentag, TT.MM.JJJJ, HH:MM**, German weekday, Europe/Berlin).'
  if (typeof lastText !== 'string' || lastText.trim() === '') {
    return {
      decision: 'block',
      reason:
        `${rule} No assistant reply text was found to verify. Write your closing ` +
        `reply to the user now, beginning with exactly this line: ${expected}`,
    }
  }
  const match = TIMESTAMP_RE.exec(lastText.trimStart())
  if (!match) {
    return {
      decision: 'block',
      reason:
        `${rule} Your last reply does NOT begin with it. Write your closing reply ` +
        `again, beginning with exactly this line (copy it verbatim): ${expected}`,
    }
  }
  if (!acceptedStamps(now).has(match[1])) {
    return {
      decision: 'block',
      reason:
        `${rule} Your last reply begins with "**${match[1]}**", which is not the ` +
        `current Berlin time (stale or wrong). Write your closing reply again, ` +
        `beginning with exactly this line (copy it verbatim): ${expected}`,
    }
  }
  return null
}
