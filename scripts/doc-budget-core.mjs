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
    maxLines: 1080,
    maxWords: 9600,
    why: 'loaded at every session start — the most expensive document in the project',
  },
  {
    path: 'TASKS.md',
    until: /^## Checklist/,
    maxLines: 70,
    maxWords: 620,
    why: 'the preamble only; the points below it may grow, its framing may not',
  },
  {
    path: 'design.md',
    maxLines: 850,
    maxWords: 27743,
    // RAISED by 43 measured words for point 369: an orphaned juvenile mourns
    // before it plays again, and the trigger is DEATH rather than distance —
    // a genuinely new §19.8 decision, which is what this mechanism prices in.
    // The margin left over is unchanged, so the next sentence pays its own way.
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
    why: 'read on demand, but every point that cites a section pays for the bulk around it',
  },
]

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
