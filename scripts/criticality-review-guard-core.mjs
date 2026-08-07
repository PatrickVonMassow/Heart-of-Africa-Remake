// Pure decision core of the CRITICALITY four-eyes gate (work-order point 298).
//
// WHY IT EXISTS: the standing rule is that a change is triaged by difficulty ×
// CRITICALITY before it is built, and that a HIGH item — a guard, the batch
// singleton, save/load, anything load-bearing or hard to reverse — gets a
// model-diverse review of the plan and of the result. Carried by intention, that
// rule was applied where somebody happened to remember it. Worse (measured
// 30.07.2026): THE REVIEW CAN OUTLIVE ITS AUTHOR. A delegated agent spawned its
// Fable-5 reviewer in the background and then stopped; the review landed in the
// parent session minutes later with verdict `do-not-merge` and two blockers, one
// of which would have reddened main's unit gate the moment the branch merged.
// The branch LOOKED reviewed and was not.
//
// So the gate is not "was a review recorded" but "were its FINDINGS acted on":
//   - a HIGH-criticality point that gets TICKED needs a recorded review by a
//     DIFFERENT model, against a commit that is genuinely in this history;
//   - a `do-not-merge` or `merge-with-fixes` verdict does NOT satisfy it. Only a
//     later `merge` record, for a LATER commit (a descendant of the refused one),
//     says the findings were answered. That is deliberately stricter than the
//     MECHANISM gate beside it (mechanism-review-core.mjs), where
//     `merge-with-fixes` clears: there the fixes are in the diff a human still
//     reads, here the point is being declared finished.
//
// The two gates SHARE one ledger (.claude/mechanism-reviews.jsonl) and one
// record command (scripts/mechanism-review.mjs), so a guard change that closes a
// high point is recorded once, with `--point <N>` naming the point it settles.
//
// Side-effect free — the git work, the state file and the block belong to
// scripts/criticality-review-guard.mjs (fail-open). Pinned by
// criticality-review-guard-core.test.mjs.
import { VERDICTS, sameModel } from './mechanism-review-core.mjs'

/** The ONE verdict that lets a high-criticality point be declared finished. */
export const CLEARING_VERDICT = 'merge'

/** The criticality levels the tag convention accepts, normalised. */
export const LEVELS = Object.freeze(['low', 'med', 'high'])

/** The level that arms this gate. */
export const GATED_LEVEL = 'high'

const short = (sha) => String(sha ?? '').slice(0, 7)

/**
 * Split a work-order text into its point blocks: [{ n, done, body }].
 *
 * A block runs from its `- [ ] N.` / `- [x] N.` line to the next such line or to
 * the next `## ` heading, which is how both TASKS.md and docs/tasks-archive.md
 * are written. Anything before the first point is ignored (the framing sections).
 */
export function parsePointBlocks(text) {
  const blocks = []
  let current = null
  for (const line of String(text ?? '').split('\n')) {
    const m = /^- \[( |x)\] (\d+)\./.exec(line)
    if (m) {
      current = { n: Number(m[2]), done: m[1] === 'x', body: line }
      blocks.push(current)
      continue
    }
    if (/^##\s/.test(line)) {
      current = null
      continue
    }
    if (current) current.body += `\n${line}`
  }
  return blocks
}

/**
 * The criticality tag of one point block, per the point-298 convention:
 * `Criticality: low|med|high` plus a one-line rationale.
 *
 * Three deliberate readings, each learned from the real corpus:
 *   - the tag may sit MID-LINE ("…in the same commit as in point 535.
 *     Criticality: medium."), so it is not anchored to the line start;
 *   - `medium` is accepted and normalised to `med` — both spellings are in use;
 *   - a QUOTED occurrence is skipped. Point 298's own spec quotes the convention
 *     it defines ("Criticality: low|med|high"), and reading that as a tag would
 *     have the gate judge points by a sentence ABOUT the tag.
 * The LAST surviving match wins: the tag is written at the end of a spec, while
 * an earlier mention is prose.
 *
 * Anything else — no tag, an unknown word — answers `{ level: null }`, which
 * leaves the point ungated. That is the fail-open direction on purpose: a
 * malformed tag must not block a turn, and the points that predate the
 * convention (the overwhelming majority) carry none at all.
 */
export function criticalityOf(body) {
  const text = String(body ?? '')
  let found = null
  for (const m of text.matchAll(/criticality:\s*(low|med(?:ium)?|high)\b([^\n]*)/gi)) {
    const before = m.index > 0 ? text[m.index - 1] : ''
    if (before === '"' || before === "'" || before === '`') continue
    found = m
  }
  if (!found) return { level: null, rationale: '' }
  const level = found[1].toLowerCase() === 'medium' ? 'med' : found[1].toLowerCase()
  return { level, rationale: String(found[2] ?? '').replace(/^[\s,.;:—-]+/, '').trim() }
}

/** The point numbers a work-order text marks done. */
export function tickedNumbers(text) {
  return new Set(parsePointBlocks(text).filter((p) => p.done).map((p) => p.n))
}

/**
 * Points that are ticked NOW and were not ticked at the baseline.
 *
 * Both files are read on both sides: the tick moves a point from TASKS.md into
 * docs/tasks-archive.md, and reading only one of them would either miss the tick
 * (archive-only, if the mover left it behind) or report every archived point as
 * new (tasks-only). `tasks-archive-guard` owns the split's hygiene; this only
 * needs to know that the point went from open to done.
 */
export function newlyTicked({ baseTasks = '', baseArchive = '', headTasks = '', headArchive = '' } = {}) {
  const before = new Set([...tickedNumbers(baseTasks), ...tickedNumbers(baseArchive)])
  const now = new Set([...tickedNumbers(headTasks), ...tickedNumbers(headArchive)])
  return [...now].filter((n) => !before.has(n)).sort((a, b) => a - b)
}

/**
 * The newly ticked points that the tag marks HIGH — the ones this gate judges.
 * Returns [{ number, level, rationale }].
 */
export function highTicks({ baseTasks = '', baseArchive = '', headTasks = '', headArchive = '' } = {}) {
  const numbers = new Set(newlyTicked({ baseTasks, baseArchive, headTasks, headArchive }))
  if (!numbers.size) return []
  const out = []
  const seen = new Set()
  for (const block of [...parsePointBlocks(headArchive), ...parsePointBlocks(headTasks)]) {
    if (!numbers.has(block.n) || seen.has(block.n)) continue
    const { level, rationale } = criticalityOf(block.body)
    seen.add(block.n)
    if (level === GATED_LEVEL) out.push({ number: block.n, level, rationale })
  }
  return out.sort((a, b) => a.number - b.number)
}

/**
 * The gate itself.
 *
 * Inputs (plain data — the wrapper does the git work):
 *   baseline   sha this tree has already confirmed, or null. With no baseline
 *              nothing is owed: the gate audits from now on, never history.
 *   head       current HEAD, for the message only
 *   ticks      [{ number, rationale }] — the HIGH points newly ticked since the
 *              baseline
 *   records    [{ point, sha, model, verdict, evidence, at, authoredBy,
 *                reachable, descendsFrom }]
 *              `reachable` false means the record judged a commit that is not in
 *              this history (an abandoned branch) — it does not count.
 *              `descendsFrom` are the shas of OTHER records for the same point
 *              that are strict ancestors of this one's commit, which is how
 *              "a later record for a LATER commit" is decided without git here.
 *
 * Returns { block, clear, bootstrap, findings }.
 */
export function evaluateCriticalityReview({ baseline = null, head = '', ticks = [], records = [] } = {}) {
  if (!baseline) return { block: false, clear: true, bootstrap: true, findings: [], head }

  const findings = []
  for (const tick of ticks ?? []) {
    const all = (records ?? []).filter((r) => Number(r?.point) === Number(tick?.number))
    const reachable = all.filter((r) => r.reachable !== false)
    // A record is only a review if it says who reviewed and how it ended.
    const wellFormed = reachable.filter(
      (r) => VERDICTS.includes(String(r.verdict)) && String(r.model ?? '').trim(),
    )
    // A self-review in the ledger is worse than none: the gate would read green.
    // Refused at the record command too, but re-checked here — the ledger is a
    // file anyone can hand-edit.
    const valid = wellFormed.filter((r) => !sameModel(r.model, r.authoredBy))

    if (!valid.length) {
      let kind = 'no-review'
      if (wellFormed.length) kind = 'self-review'
      else if (all.length && !reachable.length) kind = 'not-in-history'
      findings.push({ kind, tick, records: wellFormed.length ? wellFormed : all })
      continue
    }

    const clean = valid.filter((r) => String(r.verdict) === CLEARING_VERDICT)
    const unresolved = valid.filter((r) => String(r.verdict) !== CLEARING_VERDICT)
    if (!clean.length) {
      const latest = unresolved.reduce((a, b) => (Number(b.at ?? 0) >= Number(a.at ?? 0) ? b : a))
      findings.push({ kind: 'unresolved', tick, records: [latest] })
      continue
    }
    // Every refusal must have been ANSWERED: a `merge` recorded later in time
    // AND against a later commit. Same-commit re-records do not count — nothing
    // changed between them, so nothing was fixed.
    const open = unresolved.filter(
      (u) =>
        !clean.some(
          (c) => Number(c.at ?? 0) > Number(u.at ?? 0) && (c.descendsFrom ?? []).includes(u.sha),
        ),
    )
    if (open.length) {
      const latest = open.reduce((a, b) => (Number(b.at ?? 0) >= Number(a.at ?? 0) ? b : a))
      findings.push({ kind: 'unanswered', tick, records: [latest] })
    }
  }

  return { block: findings.length > 0, clear: findings.length === 0, bootstrap: false, findings, head }
}

/** Render the verdict as the guard's refusal — every offender, and the way out. */
export function formatCriticalityReviewVerdict(verdict) {
  if (!verdict?.block) return ''
  const lines = [
    'CRITICALITY GATE: a point tagged HIGH-criticality is being ticked, and no second ' +
      'model has cleared it.',
    '',
  ]
  for (const f of verdict.findings) {
    const t = f.tick ?? {}
    const head = `  ✗ point ${t.number}${t.rationale ? ` — Criticality: high (${t.rationale})` : ''}`
    const r = f.records?.[0] ?? {}
    if (f.kind === 'no-review') {
      lines.push(head, '      no review recorded for this point')
    } else if (f.kind === 'not-in-history') {
      lines.push(
        head,
        `      the only record judges ${short(r.sha)}, which is not in this history — a review of an ` +
          'abandoned state is not a review of what is being shipped',
      )
    } else if (f.kind === 'self-review') {
      lines.push(
        head,
        `      the only review on record is by ${String(r.model ?? '').trim() || 'the same model'}, which ` +
          `authored the work — a self-review is not a review`,
      )
    } else if (f.kind === 'unresolved') {
      lines.push(
        head,
        `      ${String(r.model ?? '').trim()} recorded ${r.verdict} on ${short(r.sha)}: ${r.evidence ?? ''}`,
        '      A refusal is not advisory. Fix what it found, commit the fix, then record the re-review.',
      )
    } else {
      lines.push(
        head,
        `      ${String(r.model ?? '').trim()} recorded ${r.verdict} on ${short(r.sha)}: ${r.evidence ?? ''}`,
        '      A later `merge` exists, but not for a LATER commit — so nothing was fixed between them.',
        '      Commit the fixes, then record the re-review against that commit.',
      )
    }
  }
  lines.push(
    '',
    'A HIGH-criticality point is one that must always work — a guard, the batch singleton,',
    'save/load, anything load-bearing or hard to reverse. The value of the second model is its',
    'DIFFERENT blind spots, and it is only realised when its findings are answered:',
    '',
    '  node scripts/mechanism-review.mjs --record <sha> --point <N> --model <name> \\',
    `      --verdict <${VERDICTS.join('|')}> --evidence "<one line>"`,
    '',
    'Inspect the gate with: node scripts/criticality-review-guard.mjs --status',
    'If the tag is wrong, correct the point rather than the ledger — the tag is the spec.',
  )
  return lines.join('\n')
}
