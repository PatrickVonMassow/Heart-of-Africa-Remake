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
// WHY IT WRITES ONCE INSTEAD OF CALLING `board-queue.mjs set` 200 TIMES: it
// applies through `setQueueEntry`, the exact pure writer that path uses, and then
// writes the file ONCE, atomically. Two hundred read-modify-write cycles against
// a file the main session also writes is a race; one is not.
//
// THE APPLY RE-READS THE FILE AND CHECKS EACH CARD BEFORE IT WRITES. Atomic
// writing prevents a TORN file, not a LOST UPDATE: the measurement takes a while,
// and a `board-queue.mjs set` in between would be erased by a stale whole-file
// snapshot. So the plan is computed from the file as read, and applied to the
// file as it stands at that moment — card by card, and only where the card still
// says what the plan expected. One that moved under us is REPORTED and left.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { writeTextAtomic } from './atomic-write.mjs'
import { REPO_ROOT } from './repo-paths.mjs'
import { readTasksAll, readTasksOpen } from './tasks-source.mjs'
import { isBackendSensitivePath } from './render-verify-core.mjs'
import { QUEUE_DATA_PATH, normaliseQueueData, openPointsOf, parseQueueDataFile, setQueueEntry } from './board-queue-core.mjs'
import {
  AXES,
  attributeMerges,
  CALIBRATION_PATH,
  calibrationReading,
  estimateForLanding,
  inheritanceDefaults,
  inheritedEstimateForClass,
  ledgerAfterApply,
  MIN_CLASS_SAMPLES,
  parseCriticality,
  parseEstimateHours,
  parseFirstParentChain,
  parseTickEvents,
  rewritePlan,
  SPAN_MEASURED,
  SPAN_NO_BRANCH,
  SPAN_UNKNOWN,
  updateEstimateLedger,
} from './queue-calibration-core.mjs'

const COMMIT_MARK = '@@COMMIT@@'
const HOUR = 3600

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const has = (name) => args.includes(name)

// `--state-dir` exists because `.claude/board-queue.json` is git-ignored and
// therefore lives ONLY in the main working tree: a run from an isolation worktree
// has to be pointed at it, or it would measure against a file that is not there.
const stateDir = resolve(flag('--state-dir', resolve(REPO_ROOT, '.claude')))
const dataFile = resolve(stateDir, 'board-queue.json')
const storeFile = resolve(stateDir, 'queue-calibration.json')

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256e6, windowsHide: true })

/** Seconds back from now for `14d` / `36h` / an ISO date. */
function sinceSeconds(spec) {
  const rel = /^(\d+(?:\.\d+)?)([dh])$/.exec(String(spec ?? ''))
  if (rel) return Math.floor(Date.now() / 1000) - Number(rel[1]) * (rel[2] === 'd' ? 86400 : HOUR)
  const t = Date.parse(String(spec ?? ''))
  return Number.isFinite(t) ? Math.floor(t / 1000) : null
}

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
 * The branch's first commit to the LANDING, in hours, plus what it touched.
 *
 * The end is the TICK, not the merge: gate, picture check and board update all
 * happen after the merge, and they are part of what the estimate promises.
 */
function landingSpan(merge, landedAt) {
  try {
    const stamps = git('log', '--pretty=%ct', `${merge.sha}^1..${merge.sha}^2`).trim().split('\n').filter(Boolean).map(Number)
    const files = git('diff', '--name-only', `${merge.sha}^1`, merge.sha).trim().split('\n').filter(Boolean)
    if (!stamps.length) return { elapsedHours: null, spanBasis: SPAN_UNKNOWN, files }
    const first = Math.min(...stamps)
    // A tick that predates the branch's first commit is not a span but a clock
    // artefact; it is reported as unknown rather than as a negative duration.
    if (!(landedAt >= first)) return { elapsedHours: null, spanBasis: SPAN_UNKNOWN, files }
    return { elapsedHours: (landedAt - first) / HOUR, spanBasis: SPAN_MEASURED, files }
  } catch {
    // A history rewrite can leave a merge whose second parent is gone. It still
    // landed, so it still counts for the cadence — only its span is unknown.
    return { elapsedHours: null, spanBasis: SPAN_UNKNOWN, files: [] }
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

  const since = sinceSeconds(flag('--since', '14d'))
  const limit = Number(flag('--limit', '0')) || 0
  const allTicks = landedPoints()
  let landings = allTicks.filter((l) => (since === null ? true : l.at >= since))
  if (limit > 0) landings = landings.slice(-limit)
  if (!landings.length) throw new Error('no landed points in the window — widen it with --since or --limit')

  const merges = attributeMerges(firstParentChain(), allTicks)
  const rows = landings.map((l) => {
    const found = merges.get(l.point)
    const { elapsedHours, spanBasis, files } = found
      ? landingSpan(found.merge, l.at)
      : // No merge is not a missing measurement but the shape of main-session
        // work: there is no branch, so there is nothing to measure a span from.
        { elapsedHours: null, spanBasis: SPAN_NO_BRANCH, files: null }
    const { estimate, source } = estimateForLanding(ledger, l.point, cards[l.point]?.estimate ?? null)
    return {
      point: l.point,
      landedAt: l.at,
      delegated: !!found,
      attribution: found?.attribution ?? null,
      elapsedHours,
      spanBasis,
      estimateHours: parseEstimateHours(estimate),
      estimateSource: source,
      criticality: criticality.get(l.point) ?? null,
      picture: files === null ? null : files.some(isBackendSensitivePath),
    }
  })
  const cadenceHours = rows.slice(1).map((r, i) => (r.landedAt - rows[i].landedAt) / HOUR)
  const window = { from: rows[0].landedAt, to: rows[rows.length - 1].landedAt, landings: rows.length, since: flag('--since', '14d'), limit }
  const reading = calibrationReading(rows, { cadenceHours, window })

  console.log(`WINDOW  ${iso(window.from)} → ${iso(window.to)} UTC · ${window.landings} landed point(s)` + (limit ? ` (--limit ${limit})` : ` (--since ${window.since})`))
  console.log('')
  console.log('PER POINT — the first commit to the LANDING, against the estimate its card carried')
  console.log('  point  crit      lane  pic  src   estimate  actual   ratio')
  for (const r of rows) {
    console.log(
      `  ${String(r.point).padEnd(6)} ${String(r.criticality ?? 'untagged').padEnd(9)} ` +
        `${r.delegated ? 'brnch' : 'main '} ${r.picture === null ? ' ? ' : r.picture ? ' P ' : ' . '}  ` +
        `${(r.estimateSource === 'snapshot' ? 'snap' : r.estimateSource === 'current' ? 'live' : '—').padEnd(5)} ` +
        `${fmt(r.estimateHours, ' h').padStart(8)}  ${fmt(r.elapsedHours, ' h').padStart(8)}  ` +
        `${r.elapsedHours !== null && r.estimateHours ? fmt(r.elapsedHours / r.estimateHours, '×') : '—'}`,
    )
  }
  const provenance = {
    snapshot: rows.filter((r) => r.estimateSource === 'snapshot').length,
    current: rows.filter((r) => r.estimateSource === 'current').length,
    none: rows.filter((r) => !r.estimateSource).length,
  }
  const spans = {
    measured: rows.filter((r) => r.spanBasis === SPAN_MEASURED).length,
    noBranch: rows.filter((r) => r.spanBasis === SPAN_NO_BRANCH).length,
    unknown: rows.filter((r) => r.spanBasis === SPAN_UNKNOWN).length,
    guessed: rows.filter((r) => r.attribution === 'nearest-merge').length,
  }
  console.log('')
  console.log(
    `ESTIMATE PROVENANCE     ${provenance.snapshot} snapshotted while the point was open · ${provenance.current} read off ` +
      `today's file (no snapshot yet — ${QUEUE_DATA_PATH} is git-ignored, so nothing older is recoverable) · ${provenance.none} unestimated`,
  )
  console.log(
    `SPAN PROVENANCE         ${spans.measured} measured (${spans.guessed} of them via a merge inferred from the landing ` +
      `sequence) · ${spans.noBranch} main-session, no branch to measure · ${spans.unknown} merge found but span unreadable`,
  )
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
        `  ${String(c.name).padEnd(13)} points ${String(c.points).padStart(3)}  measured ${String(c.ratio.n).padStart(3)}  ` +
          `median elapsed ${fmt(c.elapsed.median, ' h').padStart(8)}  median ratio ${fmt(c.ratio.median, '×').padStart(8)}` +
          (c.comparable ? '' : `  (fewer than ${MIN_CLASS_SAMPLES} measured — no comparable)`),
      )
    }
  }
  console.log('')
  console.log(`SINGLE GLOBAL FACTOR: ${reading.decision.reason}`)
  for (const s of reading.decision.spreads) {
    console.log(
      `  ${s.axis.padEnd(12)} comparable classes ${s.classes}  spread ${fmt(s.spread, '×')}` +
        (s.structural.length ? `  (not measurable: ${s.structural.join(', ')})` : ''),
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
  for (const p of kept) reasons.set(p.reason, (reasons.get(p.reason) ?? 0) + 1)
  for (const [reason, n] of reasons) console.log(`  kept ×${n}: ${reason}`)

  const defaults = inheritanceDefaults(reading)
  console.log('')
  console.log(`INHERITED BY A NEW CARD (median hours per class) → ${CALIBRATION_PATH}`)
  for (const [name] of Object.entries(defaults)) console.log(`  ${name.padEnd(13)} ${inheritedEstimateForClass(name, defaults)}`)

  let estimates = ledger
  if (has('--apply')) {
    // RE-READ, then compare-and-set. The measurement above took seconds to
    // minutes, and the main session writes this same file.
    const live = readCards()
    let data = { points: live }
    const written = []
    const skipped = []
    for (const p of changed) {
      const now = live[p.point]?.estimate ?? null
      if (now !== p.from) {
        skipped.push({ ...p, now })
        continue
      }
      data = setQueueEntry(data, p.point, { estimate: p.to })
      written.push(p)
    }
    writeTextAtomic(dataFile, `${JSON.stringify(data, null, 2)}\n`)
    estimates = ledgerAfterApply(ledger, [...written, ...plan.filter((p) => p.factor && !p.changed)])
    console.log('')
    console.log(`APPLIED: ${written.length} estimate(s) written to ${QUEUE_DATA_PATH}. Render them: node scripts/board-queue.mjs`)
    for (const s of skipped) {
      console.log(`  SKIPPED ${s.point}: the card changed while this ran (${s.from} → ${s.now}); it keeps the newer value`)
    }
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
