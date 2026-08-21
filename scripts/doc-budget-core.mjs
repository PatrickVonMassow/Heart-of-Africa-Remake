// Pure decision core for the document-budget guard (user 26.07.2026).
//
// WHY: the two documents that are read most often had quietly grown until
// reading them was itself a cost. CLAUDE.md — loaded at EVERY session start —
// stood at 17 700 words, four fifths of it evidence chains needed only at a
// closing. The work order had reached 13 000 lines, three quarters of it
// finished points, plus a preamble of ordering notes about points closed weeks
// earlier. Both were cut; neither cut holds by itself, because the growth was
// never a decision — it was the sum of honest single additions.
//
// So the sizes get budgets, in the shape that already worked for the beginner's
// guide: a measured ceiling, a stated reason, and the demand that a budget is
// raised only for content that genuinely belongs, never to make room for a
// longer telling of something already there.
//
// WHAT IS AND IS NOT BUDGETED, because the distinction is the whole design:
//   - Whole file, where every line is prose that accretes: CLAUDE.md, design.md.
//   - PREAMBLE ONLY for the work order: its POINTS are legitimate growth (a
//     queue may be long), while its framing sections are where rules pile up.
//     A line budget on the whole file would punish appending work.
//   - docs/acceptance-criteria-detail.md, which point 555 turned from a two-
//     criterion offcut into the home of all 32. It is read on demand like the
//     evidence chains beside it, so its size costs nothing per turn — but it is
//     now THE FILE THAT GROWS INSTEAD, and an uncapped destination is how a cut
//     comes back: the §7.1 text would simply accrete over there and be dragged
//     into every context that opens a criterion. A budget on it keeps the growth
//     a decision.
//   - Not budgeted: docs/acceptance-evidence.md, docs/design-reference.md and
//     the archive (reference material, read on demand — their size costs
//     nothing per turn), and the retrospective (its job is to hold every
//     problem class; capping it would trade the wrong thing away).
//
// A CEILING ALONE IS NOT A RATCHET (user 20.08.2026, work-order point 768): "etabliere
// einen Mechanismus, der das dauerhaft zusichert, damit das Dokument nicht wieder
// ausufert." A ceiling only ever falls BY HAND, so every cut leaves headroom the next
// writer may quietly spend, and the sum of honest single additions walks the file back
// up to the line the last cut was made at. That is exactly how CLAUDE.md grew back
// between its cuts. So `slackWords` turns the ceiling into a floor as well: a document
// measuring more than its stated slack BELOW its ceiling is refused too, with the
// remedy "lower the ceiling to what you achieved". Headroom cannot be banked, and each
// document can only ever ratchet DOWN.
//
// THE SLACK IS AN ABSOLUTE WORD COUNT PER DOCUMENT, never a fraction of its size. A
// percentage gives the largest documents the largest licence — design.md would carry
// hundreds of free words while the six-line global stub carried none — and it moves
// every time the document does, so ordinary editing would thrash against it. The number
// is written per document beside its ceiling, for that document's editing rhythm.
//
// AND NO PROSE RATIONALE IN CLAUDE.md (same instruction: "z. B. gehören da keine
// Prosa-Begründungen rein"). A reason belongs beside the switch it governs — in the code
// that implements it or in the document under docs/ that holds its mechanics — not in
// the file every session and every subagent pays for before it does anything. The check
// is deliberately in the SAME SHAPE as the budget: one pure judgement, one finding per
// offending line, one Stop-chain refusal.

/**
 * The budgets. `headingRe` limits the measurement to the part of a file BEFORE
 * that heading — used for the work order's preamble.
 *
 * `slackWords` is the ratchet described above: the largest gap between the measured
 * size and the ceiling this document may carry. Declaring it is mandatory — an entry
 * with no usable slack is a finding, for the reason the per-point ceiling learned the
 * hard way below: a check that switches itself off in silence is the failure the guard
 * exists to prevent, one layer up.
 *
 * `noProseRationale` marks a document whose lines must instruct rather than argue.
 */
export const DOC_BUDGETS = [
  {
    path: 'CLAUDE.md',
    // LOWERED to the 21.08.2026 four-eyes cut (work-order point 768): 333 lines /
    // 2095 words became 188 / 1294 by this guard's tokenizer. §7.1 is now number and
    // title only, with the condition and the evidence under the same number in
    // docs/acceptance-criteria-detail.md and docs/acceptance-evidence.md; §3 keeps its
    // binding sentences and leaves the mechanics to docs/render-architecture.md and
    // docs/tts-architecture.md; every rule a PreToolUse guard refuses before the act
    // became a pointer, with that guard's assertion checked one by one.
    // The line margin remains; the word ceiling is exact. Leaving the former ceiling
    // standing would hand the next writer the 801 words this cut just bought — which
    // is what the slack below now refuses.
    maxLines: 189,
    maxWords: 1294,
    // THE RATCHET SLACK, tightest in the project: this file is the per-turn cost of
    // every session and every subagent, so twenty words is the whole licence between
    // one cut and the next. A larger edit than that lowers the ceiling with it.
    slackWords: 20,
    noProseRationale: true,
    why: 'loaded at every session start — the most expensive document in the project',
  },
  {
    path: 'MEMORY.md',
    location: 'project-memory',
    // LOWERED to the 20.08.2026 cut: 100 lines / 2133 words became 46 / 710
    // by this guard's tokenizer, CONFIRMED against the landed file on
    // 20.08.2026 (the 45 / 700 written here was a pre-merge reading),
    // and the longest index entry is 21 words. The whole-file ceiling prevents
    // new duplicate entries; the entry ceiling preserves “the hook only”.
    maxLines: 47,
    maxWords: 710,
    maxEntryWords: 22,
    // Fifteen words: an index of one-hook lines, where a whole new entry is ~20 words —
    // so the slack cannot hide one, and re-wording an existing hook is free.
    slackWords: 15,
    why: 'loaded at every turn; the index is one hook line per surviving topic',
  },
  {
    path: 'global-CLAUDE.md',
    location: 'user-global',
    // LOWERED to the 20.08.2026 cut: 78 lines / 752 words became the six-line,
    // 33-word deletion-pending stub, CONFIRMED against the landed file on
    // 20.08.2026 (the five lines written here was a pre-merge reading).
    // Live rules moved into project CLAUDE.md.
    maxLines: 6,
    maxWords: 36,
    // Five words on a six-line stub pending deletion; anything larger would be licence
    // for the stub to become a document again.
    slackWords: 5,
    why: 'loaded at every turn although this repository is its only reader',
  },
  {
    path: 'docs/acceptance-criteria-detail.md',
    // MEASURED at the size point 555 left it (552 lines / 5459 words, up from
    // 204 / 1973): it now holds 28 of the 32 criteria in full instead of two,
    // every one the §7.1 condition no longer states completely, which is
    // exactly why it gets a ceiling of its own. Cutting CLAUDE.md and leaving
    // the destination uncapped would only move the accretion one file over. The
    // headroom is the same fraction CLAUDE.md carries (0.4 % / 0.3 %), so a
    // criterion that genuinely gains a rule raises this budget by that rule's
    // measured size with the reason written here — and a criterion that only
    // gets a longer telling does not.
    // Four formerly in-place criteria moved here in the 20.08.2026 cut. The
    // destination is now 579 lines / 5599 words by this guard's tokenizer; this measured raise holds the
    // moved rules without giving their always-loaded source room to regrow.
    maxLines: 581,
    maxWords: 5616,
    // Forty words for thirty-two criteria — the destination of the §7.1 cut edits one
    // criterion at a time, and one criterion's rewording is well inside that.
    slackWords: 40,
    why: 'the destination of the §7.1 cut — uncapped, it would simply refill what the cut bought',
  },
  {
    path: 'TASKS.md',
    until: /^## Checklist/,
    maxLines: 70,
    maxWords: 620,
    // Thirty words on the preamble alone: it is framing that changes rarely, and a new
    // framing rule is a sentence, which must be paid for rather than absorbed.
    slackWords: 30,
    why: 'the preamble only; the points below it may grow, its framing may not',
    // A CAP PER POINT, not on the file (point 614). A line limit on the whole
    // work order would punish appending, which is what the order is for — so the
    // file below the preamble stays uncapped and every POINT carries a ceiling of
    // its own. It bites exactly where the cost is: `point-brief.mjs` pays a point's
    // spec IN FULL at every delegation, so the largest points are paid again at
    // every hand-off, while the mean point costs a fraction of them.
    // MEASURED FROM THE RESULT of the 20.08.2026 cut, the same way the CLAUDE.md
    // ceiling was measured from the size point 555 reached — never chosen
    // beforehand. A point that genuinely needs more raises this with its reason in
    // the comment beside it; a longer retelling of what it already says does not.
    // MEASURED 20.08.2026 from the result of the cut, over all 227 points the work
    // order then held: 132,088 words in total, mean 582, median 459, p90 1,026,
    // p95 1,300, and a maximum of 3,458 (the largest of the unbundled audits). The
    // ceiling is that maximum plus a sentence — the same shape the always-loaded
    // file's ceiling has, and the same ratchet: it HOLDS THE LINE the cut reached
    // and comes DOWN whenever a later cut reaches a smaller one. It does not roll
    // today's umbrella points back; that is a separate decision, and the numbers
    // above are what it would be taken against — a cap at p95 would name eleven
    // points, a cap at 2,300 would name four.
    perPoint: {
      maxWords: 3480,
      why: 'point-brief.mjs pays a point spec IN FULL at every delegation',
    },
  },
  {
    path: 'design.md',
    maxLines: 850,
    // RAISED at the merge by 113 measured words: point 341 landed on main while
    // the compression branch was open and added the separated-juvenile decision
    // to §19.8. That is a genuinely new decision, which is exactly what the
    // mechanism below prices in — the four-eyes review of 367 caught that the
    // fresh ceiling would otherwise have blocked the first turn after the merge.
    // LOWERED to the size point 367 actually achieved (839 lines / 27 555
    // words, down from 995 / 30 512). The old 1100/32000 ceiling was set to
    // stop a doubling and left ~14 % of headroom standing right after the
    // compression — which a compression simply refills. The margin left here
    // is the same shape CLAUDE.md carries: enough for a sentence, not for a
    // section. A genuinely new design decision raises it by its measured size
    // with the reason written here; a longer telling of something already in
    // the document does not.
    // RAISED by the 79 measured words of the §2.7 bullet "the startup picture
    // stays alive" (point 337) — a genuinely new design decision of exactly
    // the kind the paragraph above prices in: shader programs compile off the
    // critical path, and the standstill the player may see is a calibratable
    // budget rather than whatever the hardware takes. The tunable-value entry
    // behind it went to docs/design-reference.md §21.2, which is unbudgeted.
    // RAISED by the 176 measured words of the rewritten §21.1 F6 bullet
    // (point 339, user 25.07.2026): the key stops opening a state popup and
    // starts producing a whole bug report, so the bullet must name the
    // archive's four members and their one stem, the reproduction summary
    // at the top of the state, and — the part no reader can infer — that
    // the picture is the 3-D scene ALONE, since every label and the HUD are
    // HTML. Without that last sentence a missing label in the image reads
    // as evidence of a bug that is not there. Not a longer telling of
    // something already here: the old bullet described a different feature.
    // RAISED by 43 measured words for point 369: an orphaned juvenile mourns
    // before it plays again, and the trigger is DEATH rather than distance —
    // a genuinely new §19.8 decision, which is what this mechanism prices in.
    // The margin left over is unchanged, so the next sentence pays its own way.
    // RAISED by the 189 measured words (3 lines) of the two water rules of
    // point 316: §11.2 gains the guarantee that a blocked boundary SLIDES
    // rather than pins, and §11.3 that a river reaches the sea as slack
    // water. Both are genuinely new decisions — the old text said what
    // blocks and how fast the current runs, never what happens when the two
    // meet, and the answer is the difference between a swim and a softlock.
    // The tunable-value entry behind the slack ramp went to
    // docs/design-reference.md §21.2, which is unbudgeted.
    // RAISED by the 215 measured words of the new §19.17 (point 264): animals
    // of one species fight each other, on the researched species only. A whole
    // §19 behaviour the document did not describe in any form — the disposition,
    // the converge/chase paths, the clash and its lethal-vs-ritual resolution —
    // not a longer telling of anything already here; the §19.8 dramas beside it
    // are all predator-, family- or water-driven and say nothing about rivals of
    // one kind. It was compressed twice before this raise (from 245 to 215 words
    // and from 7 lines to 6, so the LINE ceiling is untouched), and the research
    // record it summarises lives in docs/intraspecies-combat-1890.md while its
    // eleven tunable values went to docs/design-reference.md §21.2 — both
    // unbudgeted, so only the design decision itself is priced here. The user
    // APPROVED this raise on 09.08.2026 — the board asked him to confirm it or
    // have 215 words found elsewhere, and he chose to confirm. That yes is what
    // the rule above demands for a raise; it is settled, not open.
    // RAISED by the 102 measured words of the keyboard capture (work-order 601):
    // §17.8's third rule said the browser's Ctrl combinations stay the browser's,
    // and that decision is what closes the player's tab while he walks — Ctrl is
    // the hold key and W walks forward. Its replacement is a genuinely new
    // decision and states three things the document did not carry in any form:
    // what a page may prevent is prevented, the three reserved chords are held by
    // a keyboard lock bound to fullscreen + pointer lock, and where that lock is
    // unavailable the hold key is REBINDABLE. The LINE ceiling is untouched (the
    // rule is one bullet, as before), the §17.5 mention was cut to a
    // parenthesis, and the mechanics went to the code and to
    // docs/acceptance-criteria-detail.md, so only the decision is priced here.
    // NOT yet confirmed by the user: the rule above wants his yes for a raise,
    // and the alternative is 102 words found elsewhere in design.md.
    maxWords: 28488,
    // A hundred words across 28k: design.md is edited section by section and a genuine
    // new decision runs 40–215 measured words, so the slack absorbs the rewording that
    // accompanies one and refuses the disappearance of a whole section without a
    // corresponding lowering.
    slackWords: 100,
    why: 'read on demand, but every point that cites a section pays for the bulk around it',
  },
]

/**
 * The work order's points, each with its word count — the checkbox line plus every
 * line under it until the next checkbox. PURE.
 *
 * TICKED POINTS COUNT TOO while they are still in the file: a point is moved out to
 * the archive at its tick, so anything still here is either open or waiting to be
 * moved, and both are read by whoever loads the file.
 */
export function workOrderPoints(text) {
  const lines = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
  const START = /^- \[[ x~*]\] (\d+)\. /
  // A CHECKBOX INSIDE A FENCE IS NOT A POINT (cross-vendor review, 20.08.2026).
  // Points quote the work order's own shape — a specimen line in a fenced block, a
  // remedy printed as an example. Splitting on those would cut ONE oversized point
  // into several compliant fragments, which is evasion rather than measurement, and
  // the ceiling would report green on the very point it exists for.
  //
  // The CommonMark fence rule those rounds arrived at now lives in fenceTracker()
  // below, shared with the prose-rationale check rather than written twice.
  const fence = fenceTracker()
  const out = []
  let cur = null
  for (const line of lines) {
    const state = fence.next(line)
    if (state.furniture) {
      if (cur) cur.lines.push(line)
      continue
    }
    const m = state.open ? null : START.exec(line)
    if (m) {
      if (cur) out.push(cur)
      cur = { number: Number(m[1]), lines: [line] }
    } else if (cur) cur.lines.push(line)
  }
  if (cur) out.push(cur)
  return out.map((p) => ({
    number: p.number,
    words: p.lines.join(' ').split(/\s+/).filter(Boolean).length,
  }))
}

/**
 * The turns of phrase that ARGUE rather than INSTRUCT.
 *
 * No mechanism here can read prose, and none pretends to. What it can do is notice the
 * handful of constructions that exist only to justify: a causal clause, a claim about
 * what something is for, a narrated past state, an incident date offered as evidence.
 *
 * A MARKER-BEARING INSTRUCTION IS A FINDING TOO, and that is the rule rather than a
 * miss (cross-vendor review, round 1: "Never skip a required test because it is slow"
 * is flagged). It is binding text — and it is binding text carrying its own argument,
 * which is exactly what may not stand in this document. The rewrite is one line:
 * "Never skip a required test; slowness is not a reason." So the check reports it, and
 * the verdict says how to state it as a rule.
 *
 * WHAT IT CANNOT DO is find a rationale that uses none of these words. The same review
 * is right about that, and no list closes it: prose has unbounded ways to explain. This
 * is a NET, not a proof — it catches the forms the cut documents actually grew, and the
 * word ceiling above catches the bulk whatever shape it arrives in.
 *
 * The list stays SHORT and literal. `rather than` is not here: it contrasts two
 * instructions ("use TSL rather than raw GLSL") and is the commonest way this file
 * states a choice. `since` is not here either — it is a date word as often as a causal
 * one. The cost of being narrow is a rationale that slips through; the cost of being
 * broad is a guard that cries wolf on binding text, and a guard nobody believes is
 * worse than no guard.
 */
export const RATIONALE_MARKERS = Object.freeze([
  Object.freeze({ re: /\bbecause\b/i, marker: 'because' }),
  Object.freeze({ re: /\b(?:which|that) is why\b/i, marker: 'which/that is why' }),
  Object.freeze({ re: /\b(?:the|one|another) reason\b/i, marker: 'the reason' }),
  // An adverb between the verb and its purpose is the commonest form of this claim
  // ("exists ONLY to stop…"), and a bare `exists to` missed every one of them.
  Object.freeze({
    re: /\bexists?\s+(?:\w+\s+){0,2}(?:to|because)\b/i,
    marker: 'exists to/because',
  }),
  Object.freeze({ re: /\bso that\b/i, marker: 'so that' }),
  Object.freeze({ re: /\bhistorically\b/i, marker: 'historically' }),
  Object.freeze({ re: /\bwe (?:learned|found|measured|discovered|saw)\b/i, marker: 'we learned/found' }),
  Object.freeze({ re: /\bit turned out\b/i, marker: 'it turned out' }),
  Object.freeze({ re: /\bused to\b/i, marker: 'used to' }),
  Object.freeze({ re: /\bmeasured\b[^.]{0,80}\d{1,2}\.\d{1,2}\.\d{4}/i, marker: 'an incident date as evidence' }),
])

/**
 * A CommonMark fence tracker: `next(line)` returns whether that line is fence FURNITURE
 * (an opener or a closer) and keeps the open/closed state.
 *
 * It is the rule workOrderPoints above already learned across three cross-vendor rounds,
 * lifted out so both readers share one implementation: an opener is three or more
 * backticks or tildes indented by at most three spaces; a closer is the SAME character,
 * AT LEAST AS LONG, followed by nothing but spaces and tabs. Toggling on any triple run
 * closes a four-backtick block at the first inner ``` — the code after it then reads as
 * prose and the prose after the real closer is skipped, which is a false finding and a
 * missed one out of the same shortcut (cross-vendor review, round 1).
 */
export function fenceTracker() {
  const OPEN = /^ {0,3}((`{3,})|(~{3,}))(.*)$/
  const CLOSER_TAIL = /^[ \t]*$/
  let fence = null
  return {
    /** true when `line` is the fence marker itself; `open` then says what follows it. */
    next(line) {
      const m = OPEN.exec(String(line ?? ''))
      if (!m) return { furniture: false, open: fence !== null }
      const run = m[2] ?? m[3]
      const marker = run[0]
      const info = m[4] ?? ''
      if (fence === null) {
        if (!(marker === '`' && info.includes('`'))) fence = { marker, length: run.length }
      } else if (marker === fence.marker && run.length >= fence.length && CLOSER_TAIL.test(info)) {
        fence = null
      }
      return { furniture: true, open: fence !== null }
    },
  }
}

/**
 * `text` with every inline code span blanked. PURE.
 *
 * A span is delimited by a run of backticks and closed by a run of the SAME length, so
 * ``--because`` is code exactly like `--because` is (cross-vendor review, round 1: the
 * single-backtick pattern left the longer form's content exposed and reported it as an
 * argument). Spans do not cross a line, so an unclosed run is left alone rather than
 * swallowing the rest of the document.
 */
export function withoutCodeSpans(text) {
  return String(text ?? '').replace(/(`+)(?:(?!\1)[^\n])*?\1/g, ' ')
}

/**
 * Every line of `text` that argues instead of instructing. PURE.
 *
 * Fenced blocks are skipped and inline code spans are blanked first: a command, a path
 * or an identifier is not prose. One finding per line, at the first marker that matches
 * — naming a second marker on the same line tells the writer nothing the first did not.
 */
export function proseRationaleFindings(text, { path = '', why = '' } = {}) {
  const findings = []
  const lines = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
  const fence = fenceTracker()
  for (const [index, raw] of lines.entries()) {
    const state = fence.next(raw)
    if (state.furniture || state.open) continue
    const line = withoutCodeSpans(raw)
    const hit = RATIONALE_MARKERS.find((m) => m.re.test(line))
    if (!hit) continue
    findings.push({
      path,
      kind: `prose rationale (line ${index + 1}, "${hit.marker}")`,
      actual: raw.trim().slice(0, 90),
      budget: 'a rule, not the argument for it',
      why,
    })
  }
  return findings
}

/** Lines and words of `text`, optionally only up to `until`. */
export function measure(text, until = null) {
  const lines = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
  const end = until ? lines.findIndex((l) => until.test(l)) : -1
  const body = end >= 0 ? lines.slice(0, end) : lines
  return { lines: body.length, words: body.join(' ').split(/\s+/).filter(Boolean).length }
}

/**
 * Judge a set of documents. `docs` is [{ path, text }]; a path with no text
 * (missing file) is skipped rather than failed — the guard must not block a
 * checkout that legitimately lacks a file.
 *
 * Returns { block, findings: [{ path, kind, actual, budget, why }] }.
 */
export function evaluateDocBudgets(docs, budgets = DOC_BUDGETS) {
  const findings = []
  for (const budget of budgets) {
    const doc = (docs ?? []).find((d) => d && d.path === budget.path)
    if (!doc || typeof doc.text !== 'string') continue
    const m = measure(doc.text, budget.until ?? null)
    if (m.lines > budget.maxLines) {
      findings.push({
        path: budget.path,
        kind: 'lines',
        actual: m.lines,
        budget: budget.maxLines,
        why: budget.why,
      })
    }
    if (m.words > budget.maxWords) {
      findings.push({
        path: budget.path,
        kind: 'words',
        actual: m.words,
        budget: budget.maxWords,
        why: budget.why,
      })
    }
    // THE RATCHET. A ceiling only falls by hand, so banked headroom is spendable
    // headroom — the same shape as the per-point ceiling below, and refused the same
    // way: an entry that declares no usable slack is a finding rather than a silently
    // disabled check, because a ratchet that switches itself off is the growth it
    // exists to stop, wearing the guard's own green.
    const slack = budget.slackWords
    if (!(Number.isInteger(slack) && slack >= 0)) {
      findings.push({
        path: budget.path,
        kind: 'ratchet slack is not a whole number of words',
        actual: slack === undefined ? '(no slackWords)' : String(slack),
        budget: 'a non-negative integer, written per document',
        why: 'a ratchet that cannot be read is a ceiling nobody ever lowers again',
      })
    } else if (m.words <= budget.maxWords && budget.maxWords - m.words > slack) {
      findings.push({
        path: budget.path,
        kind: 'headroom',
        actual: `${budget.maxWords - m.words} words below its ceiling of ${budget.maxWords}`,
        budget: `at most ${slack}`,
        why: budget.why,
      })
    }
    // The per-POINT ceiling. Measured over the whole file, not the `until` slice:
    // the preamble budget above governs the framing, this one governs the points
    // below it, and the two never overlap.
    // AN INVALID CEILING IS A REFUSAL, NOT A PASS (cross-vendor review, 20.08.2026).
    // `0` is the ONE sentinel that means "measured later, judging nothing yet"; every
    // other unusable value — a negative, a string, NaN, a typo — used to fail open and
    // disable the ceiling silently, which is the failure this whole guard exists to
    // prevent one layer up.
    // A DECLARED perPoint MUST CARRY A USABLE NUMBER (second cross-vendor round). The
    // first attempt validated only a value that was THERE, so a misspelled field, an
    // empty object or an explicit `undefined` still switched the ceiling off in
    // silence — which is the very failure it was written to stop. Declaring the block
    // at all is now the commitment; `0` is the one value that means "measured later".
    // `null` IS A DECLARATION, and an unusable one (third cross-vendor round): the
    // rule above is that writing the block at all is the commitment, so an explicit
    // null must refuse exactly like a misspelled field rather than pass as absent.
    const perPoint = budget.perPoint
    const declared = perPoint !== undefined
    const cap = perPoint == null ? undefined : perPoint.maxWords
    if (declared && !(Number.isInteger(cap) && cap >= 0)) {
      findings.push({
        path: budget.path,
        kind: 'per-point ceiling is not a whole number of words',
        actual: cap === undefined ? '(no maxWords)' : String(cap),
        budget: 'a non-negative integer (0 = not measured yet)',
        why: 'an unusable ceiling must refuse rather than switch the check off',
      })
    }
    if (Number.isInteger(cap) && cap > 0) {
      for (const point of workOrderPoints(doc.text)) {
        if (point.words <= cap) continue
        findings.push({
          path: budget.path,
          kind: `point ${point.number} words`,
          actual: point.words,
          budget: cap,
          why: budget.perPoint.why,
        })
      }
    }
    if (budget.noProseRationale) {
      findings.push(...proseRationaleFindings(doc.text, { path: budget.path, why: budget.why }))
    }
    if (Number.isFinite(budget.maxEntryWords)) {
      const lines = String(doc.text).replace(/\r\n/g, '\n').split('\n')
      for (const [index, line] of lines.entries()) {
        if (!/^\s*[-*]\s+/.test(line)) continue
        const words = line.trim().split(/\s+/).filter(Boolean).length
        if (words <= budget.maxEntryWords) continue
        findings.push({
          path: budget.path,
          kind: `entry words (line ${index + 1})`,
          actual: words,
          budget: budget.maxEntryWords,
          why: budget.why,
        })
      }
    }
  }
  return { block: findings.length > 0, findings }
}

/** The refusal: what grew, by how much, and the honest ways out of each kind. */
export function formatDocBudgetVerdict(verdict) {
  if (!verdict?.block) return ''
  const findings = verdict.findings ?? []
  const lines = ['doc-budget-guard: a document that is read constantly is outside its budget.', '']
  for (const f of findings) {
    lines.push(`  ${f.path}: ${f.actual} ${f.kind} > ${f.budget}`)
    lines.push(`      ${f.why}`)
  }
  if (findings.some((f) => f.kind === 'lines' || f.kind === 'words' || String(f.kind).startsWith('point '))) {
    lines.push(
      '',
      'OUTGROWN — two ways out, and only two. CUT: move the detail where it belongs —',
      'evidence chains to docs/acceptance-evidence.md, project experience to the',
      'retrospective, finished points to docs/tasks-archive.md — or delete what no longer',
      'holds. Or RAISE the budget in scripts/doc-budget-core.mjs, by the measured size of',
      'genuinely new content and with the reason written into the comment beside it.',
      'Raising it to fit a longer telling of something already there is the failure this',
      'guard exists to prevent.',
    )
  }
  if (findings.some((f) => f.kind === 'headroom')) {
    lines.push(
      '',
      'HEADROOM — LOWER THE CEILING TO WHAT YOU ACHIEVED. A cut that leaves its ceiling',
      'standing hands the next writer the words it just bought, and the file walks back up',
      'to the old line one honest addition at a time. Set maxLines and maxWords in',
      'scripts/doc-budget-core.mjs to the size measured NOW, in the same commit as the cut,',
      'with the reason beside them. The budgets only ratchet down.',
    )
  }
  if (findings.some((f) => String(f.kind).startsWith('prose rationale'))) {
    lines.push(
      '',
      'PROSE RATIONALE — this document instructs; it does not argue. Move the reason to',
      'where its switch lives: the comment above the code that implements it, or the',
      'document under docs/ that holds its mechanics. Then state the rule as a rule. If the',
      'line is genuinely binding and only reads as an argument, rewrite it as the',
      'instruction it is.',
    )
  }
  return lines.join('\n')
}
