// "A blocked turn is ACKNOWLEDGED, not repeated" — the pure half of the
// doubled-message fix (user 28.07.2026, verbatim example: the 19:18 and 19:19
// replies were the same text).
//
// THE MECHANISM that produced it: the closing reply is composed FIRST, the Stop
// chain runs AFTERWARDS. A guard blocks, the demanded action is performed, and
// the turn has to end with a message once more — so the user reads the same
// answer twice. Three cases in one afternoon, and `timestamp-guard`'s own
// wording was the worst offender: it asked in so many words for the closing
// reply to be written a second time, which guarantees the duplicate rather than
// merely risking it.
//
// TWO THINGS FOLLOW, and neither of them weakens a guard:
//  - the ORDER: the routine turn-end duties are done BEFORE the closing reply
//    is composed (CLAUDE.md §7.2, `guard-preflight.mjs --for answer`);
//  - the WORDING: a guard that blocks anyway demands the SAME thing it always
//    demanded, but names the deliverable for what it is — one short line, not a
//    re-run of the answer. `shortAckDemand()` is that sentence, shared by every
//    guard that has to ask for a closing line, so there is one wording to keep
//    right instead of one per guard.
//
// `findRepeatDemands()` is the ratchet: it reads a guard's SOURCE (comments
// stripped, so the history above may be told in prose) and reports any surviving
// instruction to write the answer over again. A future guard that reintroduces
// the phrasing fails the pure test rather than the user's inbox.

/**
 * The demand a blocking guard makes of the next message. Ends open, so the
 * caller appends the exact line it wants copied (a timestamp, a marker, …).
 *
 * It still demands everything it demanded before — a closing message, led by
 * the exact line handed over. What it no longer asks for is the ANSWER again.
 */
export const SHORT_ACK_DEMAND =
  'Close the turn with a SHORT acknowledgement — one or two sentences naming what you ' +
  'just fixed, never a second copy of the answer the user has already read — beginning ' +
  'with exactly this line (copy it verbatim): '

/** The demand with the line to copy appended, e.g. a bold Berlin timestamp. */
export function shortAckDemand(expectedLine) {
  return `${SHORT_ACK_DEMAND}${expectedLine ?? ''}`
}

/**
 * Phrasings that tell the model to produce the previous answer a second time.
 * Deliberately narrow: each one is an AFFIRMATIVE instruction, so a guard may
 * still say "never a second copy of the answer" without tripping its own gate.
 */
export const REPEAT_DEMAND_PATTERNS = [
  { id: 'reply-again', re: /\b(reply|answer|message|antwort)\s+again\b/i },
  { id: 'again-reply', re: /\bagain\b[^.]{0,40}\b(your |the )(reply|answer|message)\b/i },
  {
    id: 'repeat-the-reply',
    re: /\b(repeat|restate|resend|re-?send|re-?write|rewrite|reproduce)\s+(?:your|the)\s+(?:previous\s+|last\s+|same\s+|earlier\s+|closing\s+)?(reply|answer|message)\b/i,
  },
  {
    id: 'write-it-once-more',
    re: /\b(write|compose|send|post)\b[^.]{0,60}\b(reply|answer|message)\b[^.]{0,40}\b(once more|a second time|anew)\b/i,
  },
]

/**
 * Source text with `//` line comments and `/* *\/` blocks removed, so the
 * ratchet judges what a guard SAYS to the model, not what its comments explain
 * about the bug. String literals are left intact — that is the whole point.
 *
 * Not a JS parser: a `//` inside a string literal would be stripped too. That
 * direction is harmless here (it can only hide a match inside a URL-ish string,
 * never invent one), and it keeps this module dependency-free and pure.
 */
export function stripComments(source) {
  return String(source ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|\n)\s*\/\/[^\n]*/g, '$1')
}

/**
 * Every repeat-the-answer instruction left in `source`, as
 * `[{ id, line, text }]` — empty when the source is clean.
 */
export function findRepeatDemands(source) {
  const findings = []
  const lines = stripComments(source).replace(/\r\n/g, '\n').split('\n')
  lines.forEach((line, i) => {
    for (const { id, re } of REPEAT_DEMAND_PATTERNS) {
      if (re.test(line)) findings.push({ id, line: i + 1, text: line.trim() })
    }
  })
  return findings
}

/**
 * The `node scripts/<name>.mjs` scripts a hook settings object runs on `event`.
 * Used by the ratchet to read the Stop chain out of `.claude/settings.json`
 * rather than from a hand-kept list that would drift away from it.
 */
export function hookScripts(settings, event = 'Stop') {
  const groups = settings?.hooks?.[event]
  if (!Array.isArray(groups)) return []
  const names = []
  for (const group of groups) {
    for (const hook of group?.hooks ?? []) {
      const m = /scripts[/\\]([a-zA-Z0-9._-]+\.mjs)/.exec(String(hook?.command ?? ''))
      if (m && !names.includes(m[1])) names.push(m[1])
    }
  }
  return names
}
