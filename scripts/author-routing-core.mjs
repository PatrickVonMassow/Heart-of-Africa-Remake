// WHICH AUTHORING LANE A POINT GOES TO (point 667).
//
// The user pays two vendors and has far more OpenAI volume left than Anthropic,
// so authoring — the largest single item of the spend — moves where the room is.
// It does NOT all move: CLAUDE.md §6 names three lanes with different jobs, and
// the cut between them is decided HERE, from the point's own text, rather than
// by whoever happens to be dispatching.
//
//   sol    GPT-5.6 Sol authors the MECHANICAL and MID-DIFFICULTY points, and
//          Claude then reviews, runs the suites, judges the picture and lands.
//   fable  Fable 5 keeps the HARD cases — difficult, complex, error-prone — and
//          the work that has already come back from Sol with findings.
//   opus   Opus 5 keeps what only the main lane can honestly finish: a point
//          whose VERIFICATION is the work (a picture judged on both backends is
//          the main session's job, so authoring it elsewhere buys nothing).
//
// WHY A FUNCTION RATHER THAN A JUDGMENT CALL: the point says the cut is named,
// not guessed. A dispatcher's taste is not reviewable and drifts with whoever
// holds the batch; this is pure, tested, and answers the same way twice — and
// where it answers wrongly, the fix is a case in its test file, not a habit.
//
// It is ADVISORY, not a gate. Nothing blocks on it: the reasons travel with the
// verdict so a dispatcher can see WHY and override with a tag in the point
// itself. Side-effect free; the work-order reading belongs to
// scripts/author-sol.mjs. Pinned by author-routing-core.test.mjs.

/** The authoring lanes, in the order this file describes them. */
export const LANES = Object.freeze(['sol', 'fable', 'opus'])

/** Who each lane is, for the report a dispatcher reads. */
export const LANE_MODEL = Object.freeze({
  sol: 'GPT-5.6 Sol',
  fable: 'Fable 5',
  opus: 'Opus 5',
})

/**
 * The words CLAUDE.md §6 itself uses for the hard cases, plus the classic
 * error-prone subjects, which a spec names when it is one.
 *
 * Deliberately SHORT. Every word here diverts work away from the lane this point
 * exists to fill, so a term that merely sounds weighty ("careful", "important")
 * is not on the list: it would empty the Sol lane one plausible adjective at a
 * time. What IS here is either the policy's own wording or a subject where a
 * wrong answer is silent — a race, a lock, a migration of state that exists.
 */
export const HARD_MARKERS = Object.freeze([
  /\bdifficult\b/i,
  /\bcomplex(?:ity)?\b/i,
  /\berror[- ]prone\b/i,
  /\brace (?:condition|window)\b/i,
  /\bconcurren\w+\b/i,
  /\bdeadlock\b/i,
  // The inflections, not one spelling: the comment above promised locks and
  // state migration and the list held only the noun "migration" (cross-vendor
  // review of point 667, P1).
  /\bmigrat\w+\b/i,
  /\block(?:s|ed|ing)?\b/i,
])

/**
 * …and the markers of a point whose VERIFICATION IS THE WORK.
 *
 * Not a difficulty judgment: these name work whose ANSWER is a rendered picture
 * or a browser run, and CLAUDE.md §6 keeps both with the main session whoever
 * authored the code. Handing such a point to another lane splits it in two and
 * saves nothing — the expensive half stays here either way.
 *
 * THEY ERR TOWARDS MATCHING, deliberately (cross-vendor review of point 667,
 * P1): a mechanical rename that merely mentions WebGPU is routed here and costs
 * the Sol lane one point, while a real picture point routed to Sol costs a
 * rebuild. The point's own `Author lane:` tag is the cheap way back.
 */
export const VERIFICATION_MARKERS = Object.freeze([
  /\bscreenshots?\b/i,
  /\bpictures?\b/i,
  /\brender[- ]verif\w+\b/i,
  /\bboth backends\b/i,
  /\bwebgpu\b/i,
  /\bwebgl\b/i,
  /\bplaywright\b/i,
  /\bbrowser suites?\b/i,
  /\baesthetic\w*\b/i,
  // "visually inspect the banding" is how half the render points are written,
  // and the list had no word for it (same review).
  /\bvisual\w*\b/i,
])

/**
 * An explicit lane tag in the point's own text: `Author lane: sol`.
 *
 * The escape hatch, and the reason the rules below may stay simple. A spec that
 * knows better than the markers says so once, in the work order where it is
 * reviewable, instead of the dispatcher remembering an exception.
 *
 * A TAG IS A LINE OF ITS OWN, not a phrase inside a sentence (cross-vendor
 * review of point 667, P1). Skipping only a quote character immediately in front
 * of it left `"use Author lane: sol for this example"` operative — and a
 * document that DESCRIBES this convention would route the points that quote it.
 * Requiring the line to begin with the tag is both simpler and stricter than
 * chasing quotation, and it is how the tag is meant to be written anyway.
 *
 * The LAST such line wins: a spec revises itself at the end.
 */
export function laneTagIn(body) {
  let found = ''
  let fence = '' // the delimiter that OPENED the current block, or '' outside one
  for (const line of String(body ?? '').split(/\r?\n/)) {
    // A FENCED EXAMPLE IS STILL AN EXAMPLE (third cross-vendor round): the whole
    // purpose is that a document showing the convention cannot route points by
    // showing it, and a code block is where such a document shows it.
    //
    // THE DELIMITER IS REMEMBERED (fourth round): toggling on either marker let
    // a `~~~` inside a backtick block close it — and the tag after it counted.
    // Markdown's rule, followed properly (fifth round): only the SAME character
    // closes, at least as long, with NO info string and at most three spaces of
    // indent — so `~~~javascript` inside a backtick block is content.
    const fenceLine = /^([\s>]*)(`{3,}|~{3,})(.*)$/.exec(line)
    const marker = fenceLine?.[2] ?? ''
    if (marker) {
      const info = (fenceLine[3] ?? '').trim()
      const indent = (fenceLine[1] ?? '').replace(/[^ ]/g, '').length
      // THE INDENT RULE BINDS THE OPENER TOO (sixth round): four spaces make an
      // indented code block, not a fence, so treating one as an opener swallowed
      // every line after it — suppressing a REAL tag rather than an example.
      if (indent > 3) continue
      if (!fence) {
        fence = marker
        continue
      }
      if (marker[0] === fence[0] && marker.length >= fence.length && !info) fence = ''
      continue
    }
    if (fence) continue
    // A list marker or blockquote may precede it; a quote character may not. The
    // line must also END there (second cross-vendor round): without the closing
    // anchor, `Author lane: sol is the example spelling` was still an operative
    // tag, which is the same sentence-inside-a-document case one round on.
    const m = /^[\s>*-]*author lane:\s*(sol|fable|opus)\s*[.;,)`'"]*\s*$/i.exec(line)
    if (m) found = m[1].toLowerCase()
  }
  return found
}

/**
 * The standing PROCESS phrases, which name verification without the point being
 * about any — measured against the real queue on the way in (13.08.2026).
 *
 * "Claude reviews, runs the suites and judges the picture" is how CLAUDE.md §6
 * describes the role swap, so every point that so much as MENTIONS the workflow
 * routed itself to the picture lane — point 667, which builds this file, first
 * among them. They are cut out of the text before the markers are asked, which
 * is narrower than dropping the marker: a point whose SUBJECT is a picture still
 * says so in its own words.
 */
const PROCESS_PHRASES = /\b(?:judges?|judging|judged) the picture\b|\bpicture judg\w+\b/gi

/** The markers of a list that actually match, as the phrases they matched. */
function hits(markers, text) {
  const subject = String(text).replace(PROCESS_PHRASES, ' ')
  return markers.map((re) => re.exec(subject)?.[0]).filter(Boolean)
}

/**
 * THE DECISION. PURE.
 *
 * Inputs — all optional, because a caller rarely has all of them:
 *   body         the point's text out of the work order
 *   criticality  its tag, as `criticalityOf` reads it ('low' | 'med' | 'high')
 *   reworked     has Sol already found problems in a re-work of this point?
 *                (CLAUDE.md §6: such work MOVES to Fable)
 *   override     a lane the caller insists on, beating even the tag
 *
 * Returns { lane, model, why, signals } — `why` is the ordered list of reasons,
 * first the deciding one. It NEVER throws and never answers nothing: an empty
 * input is a point with no signal against it, which is the mechanical case.
 */
export function authorLaneFor({ body = '', criticality = null, reworked = false, override = '' } = {}) {
  const text = String(body ?? '')
  const tag = laneTagIn(text)
  const hard = hits(HARD_MARKERS, text)
  const verification = hits(VERIFICATION_MARKERS, text)
  const signals = { tag, criticality: criticality ?? null, reworked: Boolean(reworked), hard, verification }
  const decide = (lane, reason) => ({ lane, model: LANE_MODEL[lane], why: [reason], signals })

  if (LANES.includes(String(override).toLowerCase())) {
    return decide(String(override).toLowerCase(), `the caller asked for the ${override} lane explicitly`)
  }
  // A RE-WORK THAT SOL STILL FINDS PROBLEMS IN OUTRANKS EVERY OTHER SIGNAL
  // (CLAUDE.md §6). Whatever the text looks like — and whatever lane it was
  // TAGGED for — the evidence says the lane it was on could not finish it. It
  // stood BELOW the tag until the cross-vendor review of point 667 (P1) read the
  // order against the sentence claiming it, and `Author lane: sol` plus a failed
  // re-work therefore stayed with Sol.
  if (reworked) return decide('fable', 'Sol still found problems after a re-work — §6 moves such work to Fable')
  if (tag) return decide(tag, `the point itself carries \`Author lane: ${tag}\``)
  if (criticality === 'high') return decide('fable', 'the point is tagged HIGH criticality — a hard case by definition')
  if (hard.length) return decide('fable', `the spec names it a hard case (${hard.join(', ')})`)
  if (verification.length) {
    return decide('opus', `its VERIFICATION is the work (${verification.join(', ')}) — the main session judges that anyway`)
  }
  return decide('sol', 'mechanical or mid-difficulty, and nothing marks it otherwise')
}

/** One line per point, for the dispatcher's report. PURE. */
export function formatLaneLine({ number = '', lane = '', why = [] } = {}) {
  return `  ${String(number).padStart(4)}  ${String(lane).padEnd(5)}  ${why[0] ?? ''}`
}

/**
 * The report over a whole queue: the counts per lane, then a line per point.
 *
 * The counts come first because the question this answers is "how much actually
 * moves", and a list of forty lines does not answer it (point 667's own measure:
 * the lever is judged by what it shifts, not by having been built).
 */
export function formatLaneReport(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  const counts = LANES.map((lane) => `${lane} ${list.filter((r) => r.lane === lane).length}`).join(' · ')
  return [
    `author-routing: ${list.length} open point(s) — ${counts}`,
    ...list.map((row) => formatLaneLine(row)),
  ].join('\n')
}
