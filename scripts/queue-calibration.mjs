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
  inheritanceDefaults,
  inheritedEstimateForClass,
  MIN_CLASS_SAMPLES,
  parseCriticality,
  parseEstimateHours,
  parseFirstParentChain,
  parseTickEvents,
  rewritePlan,
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

/** The branch's first commit to its merge, in hours, plus what it touched. */
function branchSpan(merge) {
  try {
    const stamps = git('log', '--pretty=%ct', `${merge.sha}^1..${merge.sha}^2`).trim().split('\n').filter(Boolean).map(Number)
    const files = git('diff', '--name-only', `${merge.sha}^1`, merge.sha).trim().split('\n').filter(Boolean)
    if (!stamps.length) return { elapsedHours: null, files }
    return { elapsedHours: (merge.at - Math.min(...stamps)) / HOUR, files }
  } catch {
    // A history rewrite can leave a merge whose second parent is gone. It still
    // landed, so it still counts for the cadence — only its span is unknown.
    return { elapsedHours: null, files: [] }
  }
}

const fmt = (v, unit = '') => (v === null || v === undefined ? '—' : `${Number(v).toFixed(2)}${unit}`)
const five = (s, unit = '') =>
  `n=${s.n}  min ${fmt(s.min, unit)} · p25 ${fmt(s.p25, unit)} · MEDIAN ${fmt(s.median, unit)} · p75 ${fmt(s.p75, unit)} · max ${fmt(s.max, unit)}`
const iso = (sec) => new Date(sec * 1000).toISOString().replace('T', ' ').slice(0, 16)

try {
  const cards = normaliseQueueData(parseQueueDataFile(existsSync(dataFile) ? readFileSync(dataFile, 'utf8') : null, { path: QUEUE_DATA_PATH })).points
  const criticality = parseCriticality(readTasksAll())
  const open = openPointsOf(readTasksOpen())

  const since = sinceSeconds(flag('--since', '14d'))
  const limit = Number(flag('--limit', '0')) || 0
  const allTicks = landedPoints()
  let landings = allTicks.filter((l) => (since === null ? true : l.at >= since))
  if (limit > 0) landings = landings.slice(-limit)
  if (!landings.length) throw new Error('no landed points in the window — widen it with --since or --limit')

  const merges = attributeMerges(firstParentChain(), allTicks)
  const rows = landings.map((l) => {
    const found = merges.get(l.point)
    const { elapsedHours, files } = found ? branchSpan(found.merge) : { elapsedHours: null, files: [] }
    return {
      point: l.point,
      landedAt: l.at,
      delegated: !!found,
      attribution: found?.attribution ?? null,
      elapsedHours,
      estimateHours: parseEstimateHours(cards[l.point]?.estimate),
      criticality: criticality.get(l.point) ?? null,
      picture: files.some(isBackendSensitivePath),
    }
  })
  const cadenceHours = rows.slice(1).map((r, i) => (r.landedAt - rows[i].landedAt) / HOUR)
  const window = { from: rows[0].landedAt, to: rows[rows.length - 1].landedAt, landings: rows.length, since: flag('--since', '14d'), limit }
  const reading = calibrationReading(rows, { cadenceHours, window })

  console.log(`WINDOW  ${iso(window.from)} → ${iso(window.to)} UTC · ${window.landings} landed point(s)` + (limit ? ` (--limit ${limit})` : ` (--since ${window.since})`))
  console.log('')
  console.log('PER POINT — the branch\'s first commit to its merge, against the estimate its card carried')
  console.log('  point  crit      lane  pic  estimate  actual   ratio')
  for (const r of rows) {
    console.log(
      `  ${String(r.point).padEnd(6)} ${String(r.criticality ?? 'untagged').padEnd(9)} ` +
        `${r.delegated ? 'brnch' : 'main '} ${r.picture ? ' P ' : ' . '}  ` +
        `${fmt(r.estimateHours, ' h').padStart(8)}  ${fmt(r.elapsedHours, ' h').padStart(8)}  ` +
        `${r.elapsedHours !== null && r.estimateHours ? fmt(r.elapsedHours / r.estimateHours, '×') : '—'}`,
    )
  }
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
    console.log(`  ${s.axis.padEnd(12)} comparable classes ${s.classes}  spread ${fmt(s.spread, '×')}`)
  }
  console.log('APPLIED FACTORS (criticality — the only axis a queued point already has):')
  for (const [name, f] of Object.entries(reading.factors)) console.log(`  ${name.padEnd(13)} ${fmt(f, '×')}`)

  const plan = rewritePlan(reading, { cards, open, criticality })
  const changed = plan.filter((p) => p.changed)
  const kept = plan.filter((p) => !p.changed)
  console.log('')
  console.log(`REWRITE — ${changed.length} card(s) move, ${kept.length} keep what they have`)
  for (const p of changed) console.log(`  ${String(p.point).padEnd(6)} ${String(p.from).padEnd(16)} → ${String(p.to).padEnd(16)} ${p.reason}`)
  const reasons = new Map()
  for (const p of kept) reasons.set(p.reason, (reasons.get(p.reason) ?? 0) + 1)
  for (const [reason, n] of reasons) console.log(`  kept ×${n}: ${reason}`)

  const defaults = inheritanceDefaults(reading)
  const store = {
    measuredAt: new Date().toISOString(),
    window: { from: iso(window.from), to: iso(window.to), landings: window.landings, since: window.since, limit },
    // What a NEWLY FILED card inherits, in hours, per criticality class.
    defaults,
    factors: reading.factors,
    globalFactor: reading.decision,
    cadence: reading.cadence,
    elapsed: reading.overall.elapsed,
  }
  writeTextAtomic(storeFile, `${JSON.stringify(store, null, 2)}\n`)
  console.log('')
  console.log(`INHERITED BY A NEW CARD (median hours per class) → ${CALIBRATION_PATH}`)
  for (const [name] of Object.entries(defaults)) console.log(`  ${name.padEnd(13)} ${inheritedEstimateForClass(name, defaults)}`)

  if (has('--apply')) {
    let data = { points: cards }
    for (const p of changed) data = setQueueEntry(data, p.point, { estimate: p.to })
    writeTextAtomic(dataFile, `${JSON.stringify(data, null, 2)}\n`)
    console.log('')
    console.log(`APPLIED: ${changed.length} estimate(s) written to ${QUEUE_DATA_PATH}. Render them: node scripts/board-queue.mjs`)
  } else {
    console.log('')
    console.log('Nothing was written to the queue data — re-run with --apply to store the rewrite.')
  }
} catch (e) {
  console.error(`queue-calibration: ${e.message}`)
  process.exitCode = 1
}
