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

/**
 * The budgets. `headingRe` limits the measurement to the part of a file BEFORE
 * that heading — used for the work order's preamble.
 */
export const DOC_BUDGETS = [
  {
    path: 'CLAUDE.md',
    // LOWERED after the 20.08.2026 three-document cut: 786 lines / 6585 words
    // became 332 / 2091 by this guard's tokenizer. Guard mechanics, owner operation and why-history now
    // live at their named destinations; §7.1 keeps one condition per criterion.
    // Two lines and seven words are the same sentence-sized margin used by the
    // previous cut. Leaving the former ceiling would invite all 4497 words back.
    maxLines: 334,
    maxWords: 2095,
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
    why: 'the destination of the §7.1 cut — uncapped, it would simply refill what the cut bought',
  },
  {
    path: 'TASKS.md',
    until: /^## Checklist/,
    maxLines: 70,
    maxWords: 620,
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
  // THE FENCE IS TRACKED AS COMMONMARK DEFINES IT, not as it usually looks (second
  // cross-vendor round, which found both shortcuts of the first attempt). An opener
  // is three or more backticks or tildes indented by AT MOST THREE spaces — the
  // work order indents its examples, so a column-zero-only rule left the whole
  // evasion open. A closer is the SAME character, AT LEAST AS LONG as the opener,
  // and followed by nothing but whitespace: a shorter run or a run with text after
  // it does not close, or a four-backtick block would end at the first three-backtick
  // line inside it and everything after would read as work order again.
  const FENCE_OPEN = /^ {0,3}((`{3,})|(~{3,}))(.*)$/
  // CommonMark allows only SPACES AND TABS after a closing run — nothing else, and
  // `trim()` is not that rule (third cross-vendor round): it eats every Unicode
  // space, so a non-breaking space behind a fence would close the block and the next
  // checkbox would split the point that quoted it.
  const CLOSER_TAIL = /^[ \t]*$/
  const out = []
  let cur = null
  let fence = null // { marker, length } while open
  for (const line of lines) {
    const f = FENCE_OPEN.exec(line)
    if (f) {
      const run = f[2] ?? f[3]
      const marker = run[0]
      const info = f[4] ?? ''
      if (fence === null) {
        // A backtick opener may not carry a backtick in its info string.
        if (!(marker === '`' && info.includes('`'))) fence = { marker, length: run.length }
      } else if (marker === fence.marker && run.length >= fence.length && CLOSER_TAIL.test(info)) {
        fence = null
      }
      if (cur) cur.lines.push(line)
      continue
    }
    const m = fence === null ? START.exec(line) : null
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

/** The refusal: what grew, by how much, and the two honest ways out. */
export function formatDocBudgetVerdict(verdict) {
  if (!verdict?.block) return ''
  const lines = ['doc-budget-guard: a document that is read constantly has outgrown its budget.', '']
  for (const f of verdict.findings) {
    lines.push(`  ${f.path}: ${f.actual} ${f.kind} > ${f.budget}`)
    lines.push(`      ${f.why}`)
  }
  lines.push(
    '',
    'Two ways out, and only two. CUT: move the detail where it belongs — evidence chains',
    'to docs/acceptance-evidence.md, project experience to the retrospective, finished',
    'points to docs/tasks-archive.md — or delete what no longer holds. Or RAISE the budget',
    'in scripts/doc-budget-core.mjs, by the measured size of genuinely new content and',
    'with the reason written into the comment beside it. Raising it to fit a longer',
    'telling of something already there is the failure this guard exists to prevent.',
  )
  return lines.join('\n')
}
