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
import { ledgerAtUsable, MODE_REQUIRED_SINCE, MODES, VERDICTS, sameModel } from './mechanism-review-core.mjs'

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
 * ANCESTRY FOR A WHOLE SET OF SHAS, OUT OF ONE GIT CALL (18.08.2026).
 *
 * The wrapper used to ask git `merge-base --is-ancestor` once per PAIR of ledger
 * rows for the same point. Point 714 alone accumulated 109 rows across its
 * review rounds, so the pair loop spawned ~6 000 processes — MEASURED 43 s for a
 * single gather, past the 30 s the preflight suite allows it, which turned the
 * unit layer red and with it BLOCKED EVERY PUSH (the pre-push gate runs it). The
 * cost grows with the square of a point's review rounds, so raising the budget
 * only moves the wall.
 *
 * `git rev-list --topo-order --parents <head>` lists every commit reachable from
 * head, a child always before its parents, so ONE walk from the far end
 * accumulates for each commit which of the WANTED shas are its ancestors. The
 * input is the raw rev-list text, so this stays pure and testable without a repo.
 *
 * Returns { reachable, wanted, ancestorsOf }:
 *   reachable    Set of every sha in the graph — reachable from head, head itself
 *                included.
 *   wanted       the set the answer is ABOUT, so a caller can tell "not an
 *                ancestor" from "never asked about" (see `strictAncestorProbe`).
 *   ancestorsOf  (sha) => Set of the WANTED shas that are its STRICT ancestors,
 *                or null when the graph does not hold that commit at all. Null is
 *                "cannot say", never "no": the caller falls back to asking git,
 *                so a truncated graph (a shallow clone) can never silently
 *                under-report ancestry — which would clear a gate that should
 *                block.
 */
export function ancestorIndex(revListParents = '', wanted = []) {
  const want = new Set([...wanted].filter(Boolean).map(String))
  const rows = String(revListParents)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\s+/))
  const reachable = new Set(rows.map((r) => r[0]))
  // BACKWARDS over a topological listing = parents before children, which is what
  // lets each commit inherit its parents' finished sets in a single pass.
  const anc = new Map()
  for (let i = rows.length - 1; i >= 0; i--) {
    const [sha, ...parents] = rows[i]
    const set = new Set()
    for (const p of parents) {
      const inherited = anc.get(p)
      if (inherited) for (const s of inherited) set.add(s)
      if (want.has(p)) set.add(p)
    }
    anc.set(sha, set)
  }
  return { reachable, wanted: want, ancestorsOf: (sha) => anc.get(String(sha)) ?? null }
}

/**
 * The strict-ancestor question, answered from an index where the index can and by
 * `fallback` where it cannot.
 *
 * THE CONDITION IS WANTEDNESS, NOT REACHABILITY (found by the cross-vendor review
 * of the change above, 18.08.2026). The index holds only the wanted shas, so for a
 * commit that IS in the graph but was never asked about, the set is silently empty
 * and "not in it" would read as "not an ancestor" — a false NO, which on this gate
 * clears what should block. Every call site today passes exactly the ledger shas as
 * wanted, so nothing was mis-answered; the contract was wrong all the same, and a
 * contract is what the next caller reads.
 */
export function strictAncestorProbe(index, fallback) {
  return (a, b) => {
    if (!a || !b || a === b) return false
    const ancestors = index?.ancestorsOf?.(b)
    if (!ancestors || !index.wanted?.has(String(a))) return fallback(a, b)
    return ancestors.has(String(a))
  }
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
    // A record is only a review if it says who reviewed and how it ended —
    // and WHEN: the answered-refusal ordering below compares Number(at), and a
    // NaN timestamp loses every comparison, so a hand-made row without one
    // could out-stand a later, finite-dated refusal (round-3 pass 1, applied
    // to the same ledger this gate reads).
    // The MODE is held to the recorder's standard from the day it began
    // demanding one (landing-round pass 1, mirroring the mechanism gate): a
    // modern row naming no usable mode can only have arrived by hand.
    const modeUsable = (r) => {
      const m = String(r?.mode ?? '').trim()
      if (m) return MODES.includes(m)
      const at = Number(r?.at)
      return Number.isFinite(at) && at > 0 && at < MODE_REQUIRED_SINCE
    }
    const rowWellFormed = (r) =>
      VERDICTS.includes(String(r.verdict)) &&
      // PRIMITIVE STRINGS, not coercions (landing-round pass 2): `model: {}`
      // coerces to '[object Object]' and walked the emptiness test.
      typeof r.model === 'string' &&
      r.model.trim() &&
      // The AUTHORSHIP KEY is required as a string (landing-round pass 1):
      // the recorder always writes it, reading the commit's own trailers — a
      // row without it can only have arrived by hand. It may be EMPTY, and
      // that residual is named: a commit without a model trailer (a merge,
      // the user's own edit) records authoredBy '' legitimately, and the
      // gate cannot tell that apart from a hand-edit that typed ''.
      typeof r.authoredBy === 'string' &&
      // Typed AND in the millisecond domain (rounds 4/5, pass 1): Number(null)
      // is 0, and a seconds-scale or `at: 1` row loses every "later than"
      // comparison, letting an earlier merge read a later refusal as answered.
      ledgerAtUsable(r?.at) &&
      modeUsable(r) &&
      // A CARRIED ROW STANDS ONLY VERIFIED here too (delta rounds,
      // 18.08.2026): the wrapper re-measures the blob identity and stamps it;
      // unstamped, the row is no reading of its sha's content.
      (r.carried === undefined || r.carriedVerified === true)
    const wellFormed = reachable.filter(rowWellFormed)
    // A MALFORMED REFUSAL POISONS, IT DOES NOT VANISH (final-round pass 1):
    // silently dropping a reachable refusal whose timestamp fails the domain
    // let a valid OLDER merge stand alone and clear the point — the exact
    // suppression the answered-refusal ordering exists to prevent. The
    // recorder never writes such a row, so it can only have arrived by hand,
    // and a hand-edited ledger earns a refusal, never a clearance; the way
    // out is fixing or removing the row, on the record. EVERY well-formedness
    // criterion poisons, not only the timestamp (landing-round pass 1): a
    // refusal with a valid `at` but a missing `model` fell out of wellFormed
    // AND out of this net, and vanished the same way.
    // …and the refusal is recognised NORMALISED (landing-round pass 2): a
    // hand-edited `"do-not-merge "` fails the strict verdict test above AND
    // an exact-match poison net, and vanished between the two.
    const refusalShaped = (r) => {
      const v = typeof r?.verdict === 'string' ? r.verdict.trim().toLowerCase() : ''
      return VERDICTS.includes(v) && v !== CLEARING_VERDICT
    }
    const malformedRefusals = reachable.filter((r) => refusalShaped(r) && !rowWellFormed(r))
    if (malformedRefusals.length) {
      findings.push({ kind: 'malformed-record', tick, records: malformedRefusals })
      continue
    }
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

    // A PASS ROW ALONE CLEARS NOTHING (third landing round, pass 2 — a live,
    // pre-existing unearned-clearance path): a record carrying `pass` covers
    // the files that pass read and no more, yet it entered `clean` like a
    // whole-range review, so ONE merge pass row could clear a HIGH point
    // whose other passes were never recorded. A pass-split review clears
    // only as a COMPLETE COMPOSITION — every index 1..total present at one
    // sha among the valid rows — speaking with the WORST of its passes,
    // exactly as at the mechanism gate. A pass REFUSAL keeps its individual
    // standing in `unresolved` (fail-closed in both directions).
    const passShape = (r) => {
      const total = Number(r?.pass?.total)
      const index = Number(r?.pass?.index)
      return (
        Number.isInteger(total) && total >= 2 && total <= 256 && Number.isInteger(index) && index >= 1 && index <= total
      )
    }
    const compositions = []
    {
      const groups = new Map()
      for (const r of valid) {
        if (!passShape(r)) continue
        const key = `${String(r.sha)}|${Number(r.pass.total)}`
        if (!groups.has(key)) groups.set(key, new Map())
        const byIndex = groups.get(key)
        const i = Number(r.pass.index)
        const prior = byIndex.get(i)
        if (!prior || Number(r.at ?? 0) >= Number(prior.at ?? 0)) byIndex.set(i, r)
      }
      for (const [key, byIndex] of groups) {
        const total = Number(key.split('|').at(-1))
        let complete = true
        for (let i = 1; i <= total; i++) if (!byIndex.has(i)) complete = false
        if (!complete) continue
        const rows = [...byIndex.values()]
        const worstRank = ['merge', 'merge-with-fixes', 'do-not-merge']
        const worst = rows.reduce(
          (w, r) => (worstRank.indexOf(String(r.verdict)) > worstRank.indexOf(w) ? String(r.verdict) : w),
          'merge',
        )
        const latest = rows.reduce((a, b) => (Number(b.at ?? 0) >= Number(a.at ?? 0) ? b : a))
        compositions.push({ ...latest, verdict: worst, at: Math.max(...rows.map((r) => Number(r.at ?? 0))) })
      }
    }
    const clean = [
      ...valid.filter((r) => r.pass === undefined && String(r.verdict) === CLEARING_VERDICT),
      ...compositions.filter((g) => String(g.verdict) === CLEARING_VERDICT),
    ]
    const unresolved = valid.filter((r) => String(r.verdict) !== CLEARING_VERDICT)
    if (!clean.length) {
      // Merge pass rows of an INCOMPLETE split leave `unresolved` empty while
      // nothing may clear — the finding then names those rows instead.
      const pool = unresolved.length ? unresolved : valid
      const latest = pool.reduce((a, b) => (Number(b.at ?? 0) >= Number(a.at ?? 0) ? b : a))
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
    } else if (f.kind === 'malformed-record') {
      lines.push(
        head,
        `      a recorded ${r.verdict} on ${short(r.sha)} is malformed — a timestamp outside the ` +
          "ledger's millisecond domain (it then cannot be ORDERED against the reviews around it)",
        '      or a missing model. The recorder never writes such a row, so it can only have',
        '      arrived by hand. It refuses rather than vanishes: fix or remove the row, on the record.',
      )
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
    `      --verdict <${VERDICTS.join('|')}> --evidence "<one line>" --mode <${MODES.join('|')}>`,
    '',
    'Inspect the gate with: node scripts/criticality-review-guard.mjs --status',
    'If the tag is wrong, correct the point rather than the ledger — the tag is the spec.',
  )
  return lines.join('\n')
}
