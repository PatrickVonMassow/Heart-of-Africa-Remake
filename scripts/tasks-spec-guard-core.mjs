// Pure decision logic of the tasks-spec Stop-hook guard (tasks-spec-guard.mjs
// is the thin fail-open I/O wrapper). Kept side-effect-free so the Vitest layer
// can sweep every rule without fs (scripts/tasks-spec-guard-core.test.mjs).
//
// The invariant it enforces (memory tasks-spec-final-state-only): when a user
// change request alters an existing TASKS.md point, that point's spec is
// REWRITTEN COMPLETELY to state only its final correct target — never patched
// with an iterative "first X was planned, then changed to Y" trail (git history
// carries the change record). The session violated this on point 258 (the
// revised spec still referenced the superseded "buttons" plan beside the new
// dropdown design); a memory note alone did not hold, so it is now ENFORCED at
// turn end: any OPEN point whose text carries retrospective change-history
// framing blocks the Stop until the point is rewritten clean.
//
// Marker calibration: whole-PHRASE markers only, each specific to retrospective
// spec-history framing ("originally planned", "instead of the earlier", "war
// ursprünglich"). Deliberately NO broad single words ("instead", "changed",
// "update") — a false block traps every Stop until TASKS.md is edited, so it is
// better to miss a subtle trail than to false-flag legitimate spec language
// (e.g. "currently the code does X; change it to Y" is a valid baseline
// description, not spec history). Fail-open is the WRAPPER's job; this core
// must never throw on partial input.

/**
 * Iterative-trail / patch-trail phrases (matched case-insensitively on
 * whitespace-normalized text, so a phrase wrapped across TASKS.md's indented
 * continuation lines still matches). English first (TASKS.md is English),
 * German as belt-and-braces.
 */
export const TRAIL_MARKERS = [
  // retrospective "instead of / rather than the old plan" framing
  'instead of the earlier',
  'instead of the original',
  'instead of the previous', // also matches "…the previously-specified"
  'rather than the earlier',
  'rather than the original',
  'rather than the previous',
  // "was/were originally …", "originally/initially/previously planned …"
  'was originally',
  'were originally',
  'originally planned',
  'originally specified',
  'originally called for',
  'originally asked for',
  'initially planned',
  'initially specified',
  'previously planned',
  'previously spec', // "previously specified" and "previously spec'd"
  'first planned',
  'was planned as',
  // explicit revision trail
  'changed from',
  'revised from',
  'revised to',
  'reworked from',
  'used to be',
  'used to say',
  'used to call for',
  'no longer planned',
  'renamed from',
  'renamed to',
  'reverted from',
  // retrospective "the user changed the spec" stamp. LEGIT attribution of who/
  // when uses "user request"/"user decision"/"(user <date>)" — never "user
  // change", which flags a revision folded into the body (the point-224 trap).
  'user change',
  // naming the superseded plan/version/spec
  'the earlier plan',
  'the original plan',
  'the previous plan',
  'the old plan',
  'the earlier version',
  'the previous version',
  'the earlier spec',
  'the previous spec',
  'the original spec',
  // NOT bare 'supersedes': "structurally supersedes the hand-tuned fades"
  // (replacing CODE) is legit spec language; the trail forms are "this
  // supersedes <the earlier framing>" and "superseded by <the new decision>".
  'this supersedes',
  'superseded by',
  'replaces the earlier',
  'replaces the original',
  'replaces the previous',
  // German equivalents
  'früher war',
  'war ursprünglich',
  'waren ursprünglich',
  'ursprünglich geplant',
  'ursprünglich vorgesehen',
  'ursprünglich spezifiziert',
  'zunächst geplant',
  'zuerst geplant',
  'mal geplant',
  'statt der ursprünglichen',
  'statt des ursprünglichen',
  'statt der früheren',
  'statt der vorherigen',
  'nicht mehr geplant',
  'geändert von',
  'geändert zu',
  'überarbeitet von',
  'vorherige fassung',
  'frühere fassung',
  'alte fassung',
  'ursprüngliche planung',
  'hieß ursprünglich',
  'ersetzt die frühere',
  'ersetzt die ursprüngliche',
  'umbenannt von',
  'umbenannt in',
  'umbenannt zu',
  'nutzeränderung',
]

/**
 * TASKS.md checklist blocks: [{point, open, text}]. A block starts at a
 * top-level `- [ ] N.` / `- [x] N.` line and runs until the next such line;
 * indented continuation lines belong to the block. Non-checklist prose between
 * blocks is ignored. Total on malformed input.
 */
export function parsePointBlocks(text) {
  const blocks = []
  if (typeof text !== 'string') return blocks
  let current = null
  for (const line of text.split('\n')) {
    const m = line.match(/^- \[([ xX])\] (\d+)\./)
    if (m) {
      current = { point: Number(m[2]), open: m[1] === ' ', text: line }
      blocks.push(current)
    } else if (/^- \[/.test(line)) {
      current = null // unnumbered checklist line — no point to hold a finding against
    } else if (current) {
      current.text += '\n' + line
    }
  }
  return blocks
}

/** Whitespace-collapsed lowercase form, so wrapped phrases match across lines. */
const normalize = (text) => text.replace(/\s+/g, ' ').toLowerCase()

/** First matching trail marker in a block's text, or null. */
export function findTrailMarker(text) {
  if (typeof text !== 'string') return null
  const haystack = normalize(text)
  for (const phrase of TRAIL_MARKERS) {
    if (haystack.includes(phrase)) return phrase
  }
  return null
}

/**
 * Offending OPEN points: [{point, phrase}]. Ticked points are exempt — only an
 * open spec is a work order someone will read as the target state.
 */
export function specTrailOffenders(tasksMd) {
  const offenders = []
  for (const block of parsePointBlocks(tasksMd)) {
    if (!block.open) continue
    const phrase = findTrailMarker(block.text)
    if (phrase) offenders.push({ point: block.point, phrase })
  }
  return offenders
}

/** Top-level decision on the raw TASKS.md content. Total: any bad input → allow. */
export function evaluate({ tasksMd } = {}) {
  try {
    const offenders = specTrailOffenders(tasksMd)
    if (offenders.length === 0) return { block: false, reason: '' }
    const list = offenders.map((o) => `${o.point} (found: '${o.phrase}')`).join('; ')
    return {
      block: true,
      reason:
        `TASKS SPEC READS AS AN ITERATIVE PATCH TRAIL: point(s) ${list}. A changed point must be ` +
        'REWRITTEN COMPLETELY to state only its final correct target state — no "first X, then ' +
        'changed to Y" history, no reference to the superseded plan (git history carries the change ' +
        'record; memory tasks-spec-final-state-only). Rewrite the point(s) clean in TASKS.md.',
    }
  } catch {
    return { block: false, reason: '' } // total by contract — the wrapper's fail-open must never depend on luck
  }
}
