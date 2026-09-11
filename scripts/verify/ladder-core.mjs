// THE VERIFICATION LADDER, AS A REFUSAL RATHER THAN A REMINDER (point 1086).
//
// USER ORDER 09.09.2026, given twice in one evening: "Warum führst du nicht
// immer erstmal nur die Tests des neuen Features aus und erst wenn die
// erfolgreich sind die restlichen Regressionstests?" — and, when the answer was
// that the rule had been written into memory, "'Als dauerhafte Regel abgelegt'
// garantiert aber nicht, dass die nächste Session sich daran hält, oder?" It
// does not. Point 595 wrote the ladder down; a written ladder is climbed by
// whoever remembers it.
//
// MEASURED THE SAME EVENING on point 1065: a `polish --section=` run costs about
// two minutes and the full pass 31 to 63, and the session used the FULL pass as
// its debugging loop — four full runs, roughly 2.5 machine-hours, for a defect
// two section runs then found in four minutes. Nothing refused any of it.
//
// SO THE REFUSAL SITS WHERE RUNS ARE STARTED (scripts/verify/run-logged.mjs),
// which every run already passes through. This file is its whole decision, kept
// pure so the Vitest layer can pin it (scripts/verify/ladder-core.test.mjs): the
// I/O — git, mtimes, the run ledger, the suite sources — is gathered by
// scripts/verify/ladder.mjs and handed in.
//
// THE RULE, in one sentence: a FULL browser suite run is refused while the files
// that suite covers carry edits newer than the newest GREEN narrower run of the
// same material.
//
// AND TWO THINGS THE MEASUREMENT OF 10.09.2026 ADDED, the night after the order,
// because a ladder whose rung lies buys false confidence instead of time:
//
//   · THE RUNG MUST BE NEWER THAN THE LAST MERGE, not only than the last edit.
//     On 09.09. the `adult-errands` rung was green twelve times, two merges from
//     main landed at ~23:35 after the last of them, the rung was never
//     re-climbed, and the LARGE run at 01:13 then failed on exactly that
//     section's material. A merge brings in other material the suite covers, so
//     it ages the rung exactly as an edit does.
//
//   · A RUNG WHOSE SUBJECT IS CAST RARELY MUST MEASURE WHAT THE SUITE MEASURES.
//     Alone, `adult-errands` always saw enough errands; inside the full suite it
//     saw ONE, with the fetch phase at 33 of about 2000 phase ticks. Either the
//     section sizes its observation window so both runs measure the same thing,
//     or it declares itself NON-PREDICTIVE for that check
//     (`nonPredictive(...)` in scripts/verify/sections.mjs) — and then that
//     check NEVER satisfies the ladder. It does not refuse the full run either:
//     enforcing a rung that lies is the failure this half exists to prevent, so
//     the ladder STEPS ASIDE and the waiver is recorded with the run.
//
// FAIL OPEN, ALWAYS. Every verdict this file can reach is `ok: true` except the
// one case it is sure about, and the caller treats a gathering error the same
// way: a ladder that cannot read the tree must never be the reason a regression
// did not run.
import { DEV_SUITES, SERVERLESS_SUITES, parseArgs, selectBackend, suitesFor } from './tiers.mjs'
import { plannedCheck } from '../point-brief-core.mjs'

/** The deliberate escape, for the case the narrow rung cannot exist. It takes a
 *  REASON — a bare flag would be a habit within a week. */
export const LADDER_ESCAPE_FLAG = '--no-ladder'

/** Verdict statuses, in the order this file can reach them. */
export const LADDER_STATUS = Object.freeze({
  RUNG: 'rung', // this run IS the cheap rung — never refused
  NOT_APPLICABLE: 'not-applicable', // no browser suite in it at all
  FREE: 'free', // nothing the run covers carries an edit
  CLIMBED: 'climbed', // every covered suite has a green narrow run since
  REFUSED: 'refused', // the one blocking answer
  WAIVED_ESCAPE: 'waived-escape', // --no-ladder "<why>"
  WAIVED_NON_PREDICTIVE: 'waived-non-predictive', // the only rung declared itself a liar
  UNREADABLE: 'unreadable', // the inputs could not be gathered — fail open
})

/**
 * What SHAPE of run this command line is.
 *
 *   section — `--section=<name>`: the cheap rung itself. Never refused; that is
 *             the whole mechanism. A malformed `--section` (empty value) counts
 *             here too, so run-all keeps the job of naming the right form.
 *   none    — no browser suite: the serverless checks (`docs`, `board-layout`),
 *             a filter naming nothing known, or a build/lint/unit selection.
 *   full    — a whole browser suite, a tier, or the bare default. The ladder
 *             applies to exactly these.
 *
 * Total: never throws.
 */
export function classifyLadderRun({ argv = [], verifyGl } = {}) {
  const { tier, filter, section } = parseArgs(Array.isArray(argv) ? argv : [])
  const suites = suitesFor({ tier, filter, backend: selectBackend(verifyGl) })
  const browser = suites.filter((s) => !SERVERLESS_SUITES.includes(s))
  if (section !== null) return { kind: 'section', tier, suites, browser, section }
  if (browser.length === 0) return { kind: 'none', tier, suites, browser, section: null }
  return { kind: 'full', tier, suites, browser, section: null }
}

/**
 * The suites the work order's own diff→suite mapping names for one path — and,
 * for `scripts/verify/X.mjs`, the suite that IS the file. Nothing is copied
 * here: the paragraph in TASKS.md stays the single source (parsed by
 * `parseDiffSuiteMap`), so the ladder covers whatever the work order says today.
 *
 * A path no rule covers yields [] — and an uncovered edit leaves the full run
 * FREE rather than refused, because a suite that does not read a file cannot be
 * pre-checked for it.
 */
export function suitesCovering(path, map) {
  const { byRule } = plannedCheck([path], map)
  const named = byRule.flatMap((r) => r.suites)
  // A rule may name the Vitest layer ("Vitest only") rather than a browser
  // suite; those are not suites this ladder can gate on.
  return named.filter((s) => DEV_SUITES.includes(s))
}

/** The newest timestamp in a list, or 0. */
function newest(values) {
  let out = 0
  for (const v of values) {
    const n = Number(v)
    if (Number.isFinite(n) && n > out) out = n
  }
  return out
}

/** Does this section of this suite declare a NON-PREDICTIVE check? */
function declaresNonPredictive(declarations, section) {
  return (declarations ?? []).filter((d) => d && d.section === section)
}

/**
 * THE LADDER'S ANSWER for one run.
 *
 * Inputs (all gathered by scripts/verify/ladder.mjs, all optional so a missing
 * half degrades to "free" rather than to a refusal):
 *   run          — `classifyLadderRun` output.
 *   changes      — [{ path, editedAt }] the branch's edited files with their
 *                  newest edit time (mtime or commit time, whichever is later).
 *   merges       — [{ at }] the merge commits on this branch: a merge ages a
 *                  rung exactly as an edit does.
 *   runs         — the render-verify ledger's run records: { suite, exit,
 *                  startedAt, partial, section }.
 *   map          — the work order's diff→suite mapping (`parseDiffSuiteMap`).
 *   nonPredictive — { [suite]: [{ section, check, why }] } read from each
 *                  suite's own source.
 *   escape       — { why } from `--no-ladder "<why>"`, or null.
 *
 * Returns { ok, status, reason, commands, suites, threshold, record }. `record`
 * is what the run record carries, so a waiver is never only a printed line.
 * Total: never throws.
 */
export function ladderVerdict({
  run = { kind: 'none', browser: [] },
  changes = [],
  merges = [],
  runs = [],
  map = [],
  nonPredictive = {},
  escape = null,
  now = Date.now(),
} = {}) {
  const answer = (status, reason, extra = {}) => ({
    ok: status !== LADDER_STATUS.REFUSED,
    status,
    reason,
    commands: [],
    suites: [],
    threshold: null,
    ...extra,
    record: { status, reason, at: now, ...(extra.record ?? {}) },
  })

  if (run.kind === 'section') {
    return answer(LADDER_STATUS.RUNG, `this IS the cheap rung (--section=${run.section}) — the ladder never refuses one`)
  }
  if (run.kind !== 'full') {
    return answer(LADDER_STATUS.NOT_APPLICABLE, 'no browser suite in this run — the ladder gates browser passes only')
  }

  const covered = []
  for (const change of changes ?? []) {
    const path = String(change?.path ?? '')
    if (!path) continue
    const suites = suitesCovering(path, map).filter((s) => run.browser.includes(s))
    if (suites.length === 0) continue
    covered.push({ path, editedAt: Number(change.editedAt) || 0, suites })
  }

  if (covered.length === 0) {
    return answer(
      LADDER_STATUS.FREE,
      'nothing this run covers carries an edit — the full pass is the cheapest rung there is',
    )
  }

  const lastEdit = newest(covered.map((c) => c.editedAt))
  const lastMerge = newest((merges ?? []).map((m) => Number(m?.at)))
  const threshold = Math.max(lastEdit, lastMerge)
  const agedBy = lastMerge > lastEdit ? 'the branch’s last merge' : 'the last edit'

  // The escape is read AFTER the material is known, so its record names what it
  // waived rather than only that it was used.
  const needing = [...new Set(covered.flatMap((c) => c.suites))].sort()
  if (escape && String(escape.why ?? '').trim() !== '') {
    return answer(
      LADDER_STATUS.WAIVED_ESCAPE,
      `${LADDER_ESCAPE_FLAG}: ${String(escape.why).trim()}`,
      {
        suites: needing,
        threshold,
        record: { why: String(escape.why).trim(), suites: needing, threshold },
      },
    )
  }

  const unclimbed = []
  const lying = []
  const green = []
  for (const suite of needing) {
    const since = (runs ?? []).filter(
      (r) => r && r.suite === suite && Number(r.exit) === 0 && Number(r.startedAt) >= threshold,
    )
    const liars = []
    let honest = false
    for (const r of since) {
      const declared = r.partial === true ? declaresNonPredictive(nonPredictive[suite], r.section) : []
      if (declared.length > 0) liars.push({ suite, section: r.section, checks: declared.map((d) => d.check) })
      else honest = true
    }
    if (honest) green.push(suite)
    else if (liars.length > 0) lying.push(...liars)
    else unclimbed.push(suite)
  }

  if (unclimbed.length > 0) {
    // THE COMMANDS, LABELLED. Which section covers a given edit cannot be
    // derived from the diff, so the ladder never pretends it was: it offers the
    // section this suite LAST ran — in a repair loop that is almost always the
    // one being repaired — and, beside it, the call that prints the real names
    // in a tenth of a second and without booting a browser.
    const commands = []
    for (const suite of unclimbed) {
      const last = [...(runs ?? [])]
        .filter((r) => r && r.suite === suite && r.partial === true && typeof r.section === 'string')
        .sort((a, b) => Number(a.startedAt) - Number(b.startedAt))
        .pop()
      if (last) commands.push(`npm test -- ${suite} --section=${last.section}   # the section ${suite} last ran`)
      commands.push(`npm test -- ${suite} --section=list   # every section ${suite} declares`)
    }
    const files = covered
      .filter((c) => c.suites.some((s) => unclimbed.includes(s)))
      .map((c) => c.path)
    return answer(
      LADDER_STATUS.REFUSED,
      `the cheap rung is unclimbed for ${unclimbed.join(', ')}: ${files.length} covered file(s) carry edits, and no GREEN ` +
        `narrower run of ${unclimbed.length === 1 ? 'that suite' : 'those suites'} is recorded since ${agedBy}. ` +
        'Climb it first — the section run costs about two minutes against the pass\'s thirty; ' +
        `\`--section=list\` prints a suite's real names in a tenth of a second and without a browser. ` +
        `If the narrow rung genuinely cannot exist, say so: ${LADDER_ESCAPE_FLAG} "<why>".`,
      { commands, suites: unclimbed, threshold, record: { suites: unclimbed, threshold, files: files.slice(0, 12), commands } },
    )
  }

  if (lying.length > 0) {
    const named = lying
      .map((l) => `${l.suite} --section=${l.section} (${l.checks.join('; ')})`)
      .join(', ')
    return answer(
      LADDER_STATUS.WAIVED_NON_PREDICTIVE,
      `the only green rung declares itself NON-PREDICTIVE — ${named}. A rung that does not measure what the ` +
        'suite measures is not credited as climbed, and enforcing it would buy false confidence instead of time, ' +
        'so the ladder steps aside here and says so.',
      { suites: lying.map((l) => l.suite), threshold, record: { lying, threshold } },
    )
  }

  return answer(
    LADDER_STATUS.CLIMBED,
    `the cheap rung is green since ${agedBy} for ${green.join(', ')} — the ladder is climbed, not waived`,
    { suites: green, threshold, record: { suites: green, threshold } },
  )
}

/** The block run-logged prints on a refusal: the reason, then the exact commands. */
export function formatLadderRefusal(verdict) {
  const lines = [`REFUSED BY THE VERIFICATION LADDER (point 1086) — ${verdict.reason}`]
  if ((verdict.commands ?? []).length > 0) lines.push('RUN THIS INSTEAD:')
  for (const cmd of verdict.commands ?? []) lines.push(`  ${cmd}`)
  return lines.join('\n')
}
