// THE QUEUE'S ESTIMATES, MEASURED AGAINST THE BATCH THAT LANDS THEM (point 730).
//
//   node scripts/queue-calibration.mjs                 # measure and report
//   node scripts/queue-calibration.mjs --apply         # …and rewrite the stored estimates
//   node scripts/queue-calibration.mjs --since 5d      # narrow the window
//   node scripts/queue-calibration.mjs --limit 40      # …or cap it by landings
//
// The arithmetic is in `queue-calibration-core.mjs` and covered by Vitest; this
// file is the I/O around it — git, the board's data file, the printing — so a
// rule can be tested without a repository.
//
// RE-RUN IT LATER AND IT ANSWERS THE SAME QUESTION AGAIN: after a rewrite the
// class factors read near 1.0, and the next time the batch changes pace they do
// not. Every run names the window it used, so two readings are comparable.
//
// APPLY USES THE BOARD'S OWN SET COMMAND, one child per changed card. Each child
// takes the cross-process board-edit lock and compares the stored estimate under
// that lock before writing. That is the transaction boundary: a preflight read
// saves needless children, but cannot prevent a lost update by itself.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { writeTextAtomic } from './atomic-write.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { readTasksAll, readTasksOpen } from './tasks-source.mjs'
import { QUEUE_DATA_PATH, normaliseQueueData, openPointsOf, parseQueueDataFile } from './board-queue-core.mjs'
import {
  applicableChanges,
  AXES,
  attributeMerges,
  CALIBRATION_PATH,
  calibrationReading,
  elapsedHoursToTick,
  estimateForLanding,
  inheritanceDefaults,
  inheritedEstimateForClass,
  ledgerAfterApply,
  MIN_CLASS_SAMPLES,
  parseCalibrationArgs,
  parseCriticality,
  parseEstimateHours,
  parseFirstParentChain,
  parseTickEvents,
  pictureVerifiedPoints,
  rewritePlan,
  SPAN_MEASURED,
  SPAN_NO_BRANCH,
  SPAN_UNKNOWN,
  updateEstimateLedger,
} from './queue-calibration-core.mjs'

const COMMIT_MARK = '@@COMMIT@@'
const HOUR = 3600

let options
try {
  options = parseCalibrationArgs(process.argv.slice(2))
} catch (e) {
  console.error(`queue-calibration: ${e.message}`)
  process.exit(1)
}

// `--state-dir` exists because `.claude/board-queue.json` is git-ignored and
// therefore lives ONLY in the main working tree: a run from an isolation worktree
// has to be pointed at it, or it would measure against a file that is not there.
const stateDir = resolve(options.stateDir ?? resolve(REPO_ROOT, '.claude'))
const dataFile = resolve(stateDir, 'board-queue.json')
const storeFile = resolve(stateDir, 'queue-calibration.json')
const renderStateFile = resolve(stateDir, 'render-verify-state.json')
const boardQueueScript = resolve(REPO_ROOT, 'scripts/board-queue.mjs')

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256e6, windowsHide: true })

/** Every point that has ever been ticked on main, with when it was. */
function landedPoints() {
  return parseTickEvents(
    git(
      'log', '--first-parent', '--unified=0', `--pretty=${COMMIT_MARK}%H %ct`, '-p', 'main', '--',
      'TASKS.md', 'docs/tasks-archive.md',
    ),
    { mark: COMMIT_MARK },
  )
}

/** `main`'s first-parent chain — every commit, so a merge can be found by position. */
function firstParentChain() {
  return parseFirstParentChain(git('log', '--first-parent', '--pretty=%H %ct %p\t%s', 'main'))
}

/**
 * The branch's first commit to the TICK, in hours.
 *
 * The end is the TICK, not the merge: gate, picture check and board update all
 * happen after the merge, and they are part of what the estimate promises.
 */
function landingSpan(merge, landedAt) {
  try {
    const stamps = git('log', '--pretty=%ct', `${merge.sha}^1..${merge.sha}^2`).trim().split('\n').filter(Boolean).map(Number)
    if (!stamps.length) return { elapsedHours: null, spanBasis: SPAN_UNKNOWN }
    const elapsedHours = elapsedHoursToTick(Math.min(...stamps), landedAt)
    // A tick that predates the branch's first commit is not a span but a clock
    // artefact; it is reported as unknown rather than as a negative duration.
    if (elapsedHours === null) return { elapsedHours: null, spanBasis: SPAN_UNKNOWN }
    return { elapsedHours, spanBasis: SPAN_MEASURED }
  } catch {
    // A history rewrite can leave a merge whose second parent is gone. It still
    // landed, so it still counts for the cadence — only its span is unknown.
    return { elapsedHours: null, spanBasis: SPAN_UNKNOWN }
  }
}

/** Retained per-branch picture attestations; absent or malformed state means none. */
function verifiedPicturePoints() {
  try {
    const state = JSON.parse(readFileSync(renderStateFile, 'utf8'))
    return pictureVerifiedPoints(state?.clearedHeads)
  } catch {
    return new Set()
  }
}

const fmt = (v, unit = '') => (v === null || v === undefined ? '—' : `${Number(v).toFixed(2)}${unit}`)
const five = (s, unit = '') =>
  `n=${s.n}  min ${fmt(s.min, unit)} · p25 ${fmt(s.p25, unit)} · MEDIAN ${fmt(s.median, unit)} · p75 ${fmt(s.p75, unit)} · max ${fmt(s.max, unit)}`
const iso = (sec) => new Date(sec * 1000).toISOString().replace('T', ' ').slice(0, 16)

/** The queue's cards, as the file says right now. */
const readCards = () =>
  normaliseQueueData(parseQueueDataFile(existsSync(dataFile) ? readFileSync(dataFile, 'utf8') : null, { path: QUEUE_DATA_PATH })).points

/** The stored reading, for its baseline ledger — absent on the first run. */
function readStore() {
  if (!existsSync(storeFile)) return {}
  try {
    const parsed = JSON.parse(readFileSync(storeFile, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (e) {
    throw new Error(`${CALIBRATION_PATH} exists but does not parse (${e.message}) — repair or remove it, then run again`)
  }
}

try {
  const cards = readCards()
  const criticality = parseCriticality(readTasksAll())
  const open = openPointsOf(readTasksOpen())
  const previousStore = readStore()
  // Every OPEN card's promise is snapshotted BEFORE anything is computed, so the
  // next run judges a landing against what stood while the point was still open.
  const ledger = updateEstimateLedger(previousStore.estimates, { cards, open })

  const since = options.sinceSeconds
  const limit = options.limit
  const allTicks = landedPoints()
  let landings = allTicks.filter((l) => (since === null ? true : l.at >= since))
  if (limit > 0) landings = landings.slice(-limit)
  if (!landings.length) throw new Error('no landed points in the window — widen it with --since or --limit')

  const merges = attributeMerges(firstParentChain(), allTicks)
  const picturePoints = verifiedPicturePoints()
  const rows = landings.map((l) => {
    const found = merges.get(l.point)
    const { elapsedHours, spanBasis } = found
      ? landingSpan(found.merge, l.at)
      : { elapsedHours: null, spanBasis: SPAN_UNKNOWN }
    const { estimate, source } = estimateForLanding(ledger, l.point, cards[l.point]?.estimate ?? null)
    const contextEstimateHours = parseEstimateHours(estimate)
    return {
      point: l.point,
      landedAt: l.at,
      lane: found?.attribution === 'named' ? 'delegated' : 'lane-unestablished',
      attribution: found?.attribution ?? 'none',
      elapsedHours,
      spanBasis,
      estimateHours: source === 'snapshot' ? contextEstimateHours : null,
      contextEstimateHours,
      estimateSource: source,
      criticality: criticality.get(l.point) ?? null,
      pictureClass: picturePoints.has(l.point) ? 'picture-verified' : 'picture-unestablished',
    }
  })
  const cadenceHours = rows.slice(1).map((r, i) => (r.landedAt - rows[i].landedAt) / HOUR)
  const window = { from: rows[0].landedAt, to: rows[rows.length - 1].landedAt, landings: rows.length, since: options.since, limit }
  const reading = calibrationReading(rows, { cadenceHours, window })

  console.log(`WINDOW  ${iso(window.from)} → ${iso(window.to)} UTC · ${window.landings} landed point(s)` + (limit ? ` (--limit ${limit})` : ` (--since ${window.since})`))
  console.log('')
  console.log('PER POINT — first branch commit to the TICK; cadence is TICK → TICK for the same reader-visible reason')
  console.log('  point  crit      lane                  picture                  merge     src       context   actual   ratio')
  for (const r of rows) {
    console.log(
      `  ${String(r.point).padEnd(6)} ${String(r.criticality ?? 'untagged').padEnd(9)} ` +
        `${String(r.lane).padEnd(21)} ${String(r.pictureClass).padEnd(24)} ${String(r.attribution).padEnd(9)} ` +
        `${(r.estimateSource === 'snapshot' ? 'snapshot' : r.estimateSource === 'unreconstructable' ? 'context' : '—').padEnd(9)} ` +
        `${fmt(r.contextEstimateHours, ' h').padStart(8)}  ${fmt(r.elapsedHours, ' h').padStart(8)}  ` +
        `${r.elapsedHours !== null && r.estimateHours ? fmt(r.elapsedHours / r.estimateHours, '×') : '—'}`,
    )
  }
  const provenance = {
    snapshot: rows.filter((r) => r.estimateSource === 'snapshot').length,
    unreconstructable: rows.filter((r) => r.estimateSource === 'unreconstructable').length,
    none: rows.filter((r) => !r.estimateSource).length,
  }
  const spans = {
    measured: rows.filter((r) => r.spanBasis === SPAN_MEASURED).length,
    noBranch: rows.filter((r) => r.spanBasis === SPAN_NO_BRANCH).length,
    unknown: rows.filter((r) => r.spanBasis === SPAN_UNKNOWN).length,
    inferred: rows.filter((r) => r.attribution === 'inferred').length,
  }
  console.log('')
  console.log(
    `ESTIMATE PROVENANCE     ${provenance.snapshot} snapshot(s) compared · ${provenance.unreconstructable} live value(s) shown only as context, ` +
      `NOT compared · ${provenance.none} unestimated`,
  )
  console.log(
    `  LIMIT: ${QUEUE_DATA_PATH} and the board HTML are both untracked, so estimates older than this ledger are unrecoverable; ` +
      'the ledger begins with this command’s first run.',
  )
  if (provenance.snapshot === 0) console.log('  NO FACTOR CAN BE MEASURED YET: this window contains zero landing-time snapshots.')
  console.log(
    `SPAN PROVENANCE         ${spans.measured} measured (${spans.inferred} via a merge inferred from the landing sequence) · ` +
      `${spans.noBranch} explicitly no-branch · ${spans.unknown} without a readable attributed span`,
  )
  console.log('CLASSIFICATION LIMIT — LANE: only a merge subject naming the point’s branch establishes delegated; every other row is lane-unestablished.')
  console.log('CLASSIFICATION LIMIT — PICTURE: render-verify-state.json is git-ignored, bounded to 40 runs and clearedHeads is pruned at branch end; only a retained branch entry establishes picture verification.')
  console.log('CONFOUNDER: the small measured window is all process/infrastructure points and has no render point with a picture check; do not carry its factor to render points.')
  console.log('CONFOUNDER: point 713 still stands at 14 do-not-merge rounds, so the review loop is not universally healed.')
  console.log('')
  console.log(`ELAPSED PER POINT (h)   ${five(reading.overall.elapsed, ' h')}`)
  console.log(`ACTUAL ÷ ESTIMATE       ${five(reading.overall.ratio, '×')}`)
  console.log(`CADENCE, landing→landing (h) — NOT the same number, and never averaged with it`)
  console.log(`                        ${five(reading.cadence, ' h')}`)
  console.log('')
  for (const axis of AXES) {
    console.log(`BY ${axis.toUpperCase()}`)
    for (const c of reading.byAxis[axis]) {
      console.log(
        `  ${String(c.name).padEnd(15)} points ${String(c.points).padStart(3)}  measured ${String(c.ratio.n).padStart(3)}  ` +
          `median elapsed ${fmt(c.elapsed.median, ' h').padStart(8)}  median ratio ${fmt(c.ratio.median, '×').padStart(8)}` +
          (c.unknowable
            ? '  (missing-information class — excluded from comparison)'
            : c.comparable
              ? ''
              : `  (PENDING: fewer than ${MIN_CLASS_SAMPLES} measured — no comparable yet)`),
      )
    }
  }
  console.log('')
  console.log(`SINGLE GLOBAL FACTOR: ${reading.decision.reason}`)
  for (const s of reading.decision.spreads) {
    console.log(
      `  ${s.axis.padEnd(12)} comparable classes ${s.classes}  spread ${fmt(s.spread, '×')}` +
        (s.unknowable.length ? `  (missing information: ${s.unknowable.join(', ')})` : '') +
        (s.pending.length ? `  (pending: ${s.pending.join(', ')})` : ''),
    )
  }
  console.log('APPLIED FACTORS (criticality — the only axis a queued point already has):')
  for (const [name, f] of Object.entries(reading.factors)) console.log(`  ${name.padEnd(13)} ${fmt(f, '×')}`)

  const plan = rewritePlan(reading, { cards, open, criticality, ledger })
  const changed = plan.filter((p) => p.changed)
  const kept = plan.filter((p) => !p.changed)
  console.log('')
  console.log(`REWRITE — ${changed.length} card(s) move, ${kept.length} keep what they have`)
  for (const p of changed) console.log(`  ${String(p.point).padEnd(6)} ${String(p.from).padEnd(16)} → ${String(p.to).padEnd(16)} ${p.reason}`)
  const reasons = new Map()
  for (const p of kept) reasons.set(p.reason, [...(reasons.get(p.reason) ?? []), p.point])
  for (const [reason, points] of reasons) console.log(`  kept ${points.join(', ')}: ${reason}`)

  const defaults = inheritanceDefaults(reading)
  console.log('')
  console.log(`INHERITED BY A NEW CARD (median hours per class) → ${CALIBRATION_PATH}`)
  for (const [name] of Object.entries(defaults)) console.log(`  ${name.padEnd(13)} ${inheritedEstimateForClass(name, defaults)}`)

  let estimates = ledger
  if (options.apply) {
    // The fresh read is only a cheap pre-filter. Each child repeats the compare
    // while holding the board-edit lock, then writes inside that transaction.
    const live = readCards()
    const { written: candidates, skipped } = applicableChanges(changed, live)
    const written = []
    const refused = []
    for (const p of candidates) {
      try {
        execFileSync(process.execPath, [boardQueueScript, 'set', String(p.point), '--estimate', p.to, '--if-estimate', p.from], {
          encoding: 'utf8',
          windowsHide: true,
          env: { ...process.env, HOA_QUEUE_DATA_FILE: dataFile },
        })
        written.push(p)
      } catch (e) {
        if (e.status === 3) {
          refused.push({ ...p, detail: String(e.stderr ?? '').trim() })
          continue
        }
        throw new Error(`board-queue set failed for ${p.point}: ${String(e.stderr ?? e.message).trim()}`)
      }
    }
    estimates = ledgerAfterApply(ledger, [...written, ...plan.filter((p) => p.factor && !p.changed)])
    console.log('')
    console.log(`APPLIED: ${written.length} estimate(s) written to ${QUEUE_DATA_PATH}. Render them: node scripts/board-queue.mjs`)
    for (const p of written) console.log(`  ${p.point} ${p.from} → ${p.to}`)
    for (const s of skipped) {
      console.log(`  SKIPPED ${s.point}: the card changed while this ran (${s.from} → ${s.now}); it keeps the newer value`)
    }
    for (const r of refused) console.log(`  REFUSED ${r.point}: ${r.detail || 'compare-and-set found a different estimate'}`)
  } else {
    console.log('')
    console.log('Nothing was written to the queue data — re-run with --apply to store the rewrite.')
  }

  const store = {
    measuredAt: new Date().toISOString(),
    window: { from: iso(window.from), to: iso(window.to), landings: window.landings, since: window.since, limit },
    // What a NEWLY FILED card inherits, in hours, per criticality class.
    defaults,
    factors: reading.factors,
    globalFactor: reading.decision,
    cadence: reading.cadence,
    elapsed: reading.overall.elapsed,
    provenance: { estimates: provenance, spans },
    // The baseline ledger — the promise each card carried before any correction,
    // and what the last apply wrote. Without it a re-run corrects a corrected card.
    estimates,
  }
  writeTextAtomic(storeFile, `${JSON.stringify(store, null, 2)}\n`)
} catch (e) {
  console.error(`queue-calibration: ${e.message}`)
  process.exitCode = 1
}
