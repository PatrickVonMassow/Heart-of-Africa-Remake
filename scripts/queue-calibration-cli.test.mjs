// THE CALIBRATION COMMAND'S OWN SURFACE (point 730).
//
// The arithmetic is in `queue-calibration-core.mjs` and tested there. What this
// file covers is what only the assembled command can be wrong about: the report
// saying one thing while the store says another, a store keeping a number nobody
// can re-derive, and an apply that moves cards it does not account for. All three
// were review findings on 22.08.2026.
//
// EVERY ASSERTION HERE IS DERIVED, NEVER RESTATED. A claim the command prints is
// checked against the rows it kept, and a card it says it wrote is checked
// against the queue data on disk — an earlier version of this suite read both
// halves out of the same stdout, so an implementation that reported one card and
// moved five would have passed it.
//
// AND THE CHECKOUT IS PROVEN UNTOUCHED. `--state-dir` points the command at a
// throwaway directory; these tests assert that the repository's own state files
// are byte-identical afterwards rather than trusting that routing to hold.
import { describe, it, expect, beforeAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { readTasksAll, readTasksOpen } from './tasks-source.mjs'
import { openPointsOf } from './board-queue-core.mjs'
import { isComparedSnapshot, parseCriticality, pictureBearingPoints, promiseMedians } from './queue-calibration-core.mjs'

const SCRIPT = resolve(process.cwd(), 'scripts', 'queue-calibration.mjs')
// Three different promises, so a class median is a real median and not the one
// value every card happens to carry.
const CORRECTABLE_ESTIMATES = ['~2 h', '~3 h', '~5 h']
// …and a promise far above them for the cards that owe a rendered proof. They
// are seeded ON PURPOSE: if the correction ever stopped excluding them, the
// medians below would move, and the denominator check would see it. With only
// correctable cards in the fixture, dropping the exclusion changed nothing.
const RENDER_ESTIMATE = '~20 h'

/** Existence and content of the state files this command would write by default. */
const checkoutState = () =>
  ['board-queue.json', 'queue-calibration.json'].map((name) => {
    const path = resolve(REPO_ROOT, '.claude', name)
    return existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : 'absent'
  })

/**
 * A queue data file with both kinds of open card: ones that CAN be corrected,
 * carrying three different promises, and ones owing a rendered proof, carrying a
 * much larger one. The second kind never moves — that is the holdout — but it
 * has to be present, or the fixture cannot tell a correction that excludes it
 * from one that does not.
 */
function seedQueueData(dir, count = 12) {
  const owed = pictureBearingPoints(readTasksAll())
  const open = openPointsOf(readTasksOpen())
  const correctable = open.filter((p) => !owed.has(p)).slice(0, count)
  const held = open.filter((p) => owed.has(p)).slice(0, count)
  const points = {}
  correctable.forEach((point, i) => {
    points[String(point)] = { title: `Point ${point}`, body: [], estimate: CORRECTABLE_ESTIMATES[i % CORRECTABLE_ESTIMATES.length] }
  })
  for (const point of held) points[String(point)] = { title: `Point ${point}`, body: [], estimate: RENDER_ESTIMATE }
  writeFileSync(join(dir, 'board-queue.json'), `${JSON.stringify({ points }, null, 2)}\n`)
  return { correctable, held }
}

const estimatesOf = (path) => {
  const points = JSON.parse(readFileSync(path, 'utf8')).points ?? {}
  return new Map(Object.entries(points).map(([k, v]) => [Number(k), v.estimate ?? null]))
}

const run = (dir, ...args) => {
  const before = checkoutState()
  const result = spawnSync(process.execPath, [SCRIPT, '--state-dir', dir, '--limit', '30', ...args], {
    encoding: 'utf8',
    windowsHide: true,
    cwd: process.cwd(),
    input: '',
  })
  // THE CHECKOUT IS NOT THE COMMAND'S WORKSPACE. Asserted per run, because a
  // routing regression would otherwise rewrite the real queue silently.
  expect(checkoutState(), 'the repository state files must be untouched').toEqual(before)
  return result
}

describe('the report and the store are one reading', () => {
  let out = ''
  let store = null
  let seeded = []
  let stateDir = ''

  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'queue-cal-'))
    stateDir = dir
    seeded = seedQueueData(dir).correctable
    const result = run(dir)
    expect(result.status, result.stderr).toBe(0)
    out = result.stdout
    store = JSON.parse(readFileSync(join(dir, 'queue-calibration.json'), 'utf8'))
  }, 120_000)

  it('has a fixture with something to measure and something to correct', () => {
    // Guards every assertion below against degenerating as the work order moves.
    expect(seeded.length).toBeGreaterThan(0)
    expect(store.rows.length).toBeGreaterThan(0)
  })

  it('prints for each landing what actually holds it out, not how it was verified', () => {
    // The picture column is the RETAINED VERIFICATION class; `owed` is the fact
    // the exclusion is made on. Both are compared against the stored rows, so
    // printing one constant for every landing cannot pass.
    expect(out).toMatch(/point\s+crit\s+lane\s+picture\s+owed\s+merge/)
    const printed = new Map(
      [...out.matchAll(/^ {2}(\d+)\s+\S+\s+\S+\s+(picture-\S+)\s+(yes|no)\s/gm)].map((m) => [
        Number(m[1]),
        { pictureClass: m[2], owed: m[3] === 'yes' },
      ]),
    )
    expect(printed.size).toBe(store.rows.length)
    for (const r of store.rows) {
      expect(printed.get(r.point), `point ${r.point} must appear in the table`).toEqual({
        pictureClass: r.pictureClass,
        owed: r.owesPicture,
      })
    }
  })

  it('claims exactly the comparisons its own rows can show', () => {
    // Counting stored-but-uncomparable snapshots as comparisons is what let the
    // report promise ratios that ACTUAL ÷ ESTIMATE did not have.
    const comparable = store.rows.filter((r) => isComparedSnapshot(r)).length
    const stored = store.rows.filter((r) => r.estimateSource === 'snapshot').length
    expect(store.provenance.estimates.snapshot).toBe(comparable)
    expect(store.provenance.estimates.snapshotUncomparable).toBe(stored - comparable)
    expect(out).toContain(`${comparable} snapshot(s) compared`)
    expect(out).toContain(`${stored - comparable} snapshot(s) carrying no ratio`)
  })

  it('holds out exactly the open cards that owe a proof, and names them', () => {
    // READ OFF THE WORK ORDER, not off the command's own marker set: taking
    // membership from `store.pictureBearing` would let a run that reports and
    // holds out the same wrong set agree with itself.
    const owed = pictureBearingPoints(readTasksAll())
    const expected = openPointsOf(readTasksOpen())
      .filter((p) => owed.has(p))
      .sort((a, b) => a - b)
    expect(expected.length).toBeGreaterThan(0)
    expect(store.heldOut).toEqual(expected)
    expect(store.pictureBearing).toEqual([...owed].sort((a, b) => a - b))
    expect(out).toContain(`held out: ${expected.join(', ')}`)
  })

  it('keeps the rows the aggregates were taken from', () => {
    // Without them a recorded factor cannot be re-derived and an audit could
    // only take the summary's word for it.
    expect(store.rows.length).toBe(store.window.landings)
    for (const r of store.rows) {
      expect(Object.keys(r).sort()).toEqual(
        [
          'attribution', 'contextEstimateHours', 'criticality', 'elapsedHours', 'estimateHours',
          'estimateSource', 'landedAt', 'landedAtIso', 'lane', 'owesPicture', 'pictureClass', 'point', 'spanBasis',
        ].sort(),
      )
    }
    // The printed window is minute-truncated; the seconds it was actually taken
    // from are kept beside it, so the calculation reconstructs exactly.
    expect(store.window.fromAt).toBe(store.rows[0].landedAt)
    expect(store.window.toAt).toBe(store.rows[store.rows.length - 1].landedAt)
  })

  it('keeps the denominator and the factor beside the numbers they produced', () => {
    const classes = Object.keys(store.applied)
    // An empty `applied` would make every check below vacuous.
    expect(classes.length).toBeGreaterThan(0)
    for (const name of classes) {
      const { factor, basis } = store.applied[name]
      expect(factor).toBeGreaterThan(0)
      expect(typeof basis).toBe('string')
      // Every factor the store records is one the report printed…
      expect(out).toMatch(new RegExp(`^\\s+${name}\\s+\\S+\\s+\\(${basis.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'm'))
    }
    // THE DENOMINATOR, RE-DERIVED FROM THE SEEDED QUEUE. An arbitrary number
    // satisfied the old check; this one has to be the median promise of the open
    // cards of that class, with the render cards excluded exactly as the
    // correction excludes them.
    const cards = JSON.parse(readFileSync(join(stateDir, 'board-queue.json'), 'utf8')).points
    const open = openPointsOf(readTasksOpen())
    const criticality = parseCriticality(readTasksAll())
    const owed = pictureBearingPoints(readTasksAll())
    const expected = promiseMedians({ cards, open, criticality, ledger: {}, exclude: owed })
    expect(store.promiseMedians).toEqual(Object.fromEntries(expected))
    for (const name of classes) expect(store.promiseMedians[name]).toBeGreaterThan(0)
    // AND THE FIXTURE CAN TELL THE DIFFERENCE: with the render cards left in,
    // the medians are other numbers. Without this the assertion above would hold
    // for a command that had dropped the exclusion altogether.
    const withRenderCards = promiseMedians({ cards, open, criticality, ledger: {}, exclude: new Set() })
    expect(Object.fromEntries(withRenderCards)).not.toEqual(store.promiseMedians)
  })
})

describe('an apply accounts for every card it moves', () => {
  it('moves exactly the cards it reports, and remembers what each promised', () => {
    const dir = mkdtempSync(join(tmpdir(), 'queue-cal-apply-'))
    const { correctable, held } = seedQueueData(dir)
    const dataFile = join(dir, 'board-queue.json')
    const before = estimatesOf(dataFile)
    const result = run(dir, '--apply')
    expect(result.status, result.stderr).toBe(0)
    const after = estimatesOf(dataFile)

    // WHAT ACTUALLY CHANGED, read off the queue data — never off the report.
    const moved = [...after.entries()].filter(([p, v]) => before.get(p) !== v).map(([p]) => p).sort((a, b) => a - b)
    expect(moved.length, 'the seeded cards must actually move').toBeGreaterThan(0)
    expect(after.size, 'no card may be added or dropped').toBe(before.size)

    // …and what the command SAID it changed. A run that moved five cards while
    // reporting one fails here, which the old stdout-only reading could not see.
    const reported = [...result.stdout.matchAll(/^ {2}(\d+) \S.* → \S/gm)].map((m) => Number(m[1])).sort((a, b) => a - b)
    const count = /APPLIED: (\d+) estimate\(s\) written/.exec(result.stdout)
    expect(reported).toEqual(moved)
    expect(Number(count?.[1])).toBe(moved.length)

    // EVERY MOVED CARD IS ON THE LEDGER, with the promise it came from — not
    // merely with something truthy. Each queue write commits on its own, so a
    // ledger written only at the end would leave a corrected card whose promise
    // nothing remembers, and the next run would measure its own correction.
    const store = JSON.parse(readFileSync(join(dir, 'queue-calibration.json'), 'utf8'))
    for (const point of moved) {
      const entry = store.estimates[String(point)]
      expect(entry, `point ${point} must be on the ledger`).toBeTruthy()
      expect(entry.baseline, `point ${point} must remember what it promised`).toBe(before.get(point))
      expect(entry.applied?.estimate).toBe(after.get(point))
      expect(entry.intent, 'a completed write leaves no announcement standing').toBeUndefined()
    }
    expect(moved.every((p) => correctable.includes(p))).toBe(true)
    // NOT ONE RENDER CARD MOVED, and the fixture had some to move.
    expect(held.length).toBeGreaterThan(0)
    for (const point of held) expect(after.get(point)).toBe(RENDER_ESTIMATE)
  }, 120_000)

  it('still divides by the promise that was actually made, on the second run', () => {
    // A STABLE QUEUE PROVES NOTHING HERE: the correction moves a class onto its
    // measured median, so a second run over corrected values would land on a
    // factor of one and leave the cards alone either way. What distinguishes the
    // two is the BASELINE — the promise the card was measured against. If the
    // second run snapshotted the corrected estimate as a fresh promise, the
    // ledger would say so, and every later reading would divide by the tool's
    // own writing.
    const dir = mkdtempSync(join(tmpdir(), 'queue-cal-twice-'))
    seedQueueData(dir)
    const dataFile = join(dir, 'board-queue.json')
    const storeFile = join(dir, 'queue-calibration.json')
    const promised = estimatesOf(dataFile)
    expect(run(dir, '--apply').status).toBe(0)
    const afterFirst = estimatesOf(dataFile)
    const first = JSON.parse(readFileSync(storeFile, 'utf8'))
    const moved = [...afterFirst.entries()].filter(([p, v]) => promised.get(p) !== v).map(([p]) => p)
    expect(moved.length).toBeGreaterThan(0)

    expect(run(dir, '--apply').status).toBe(0)
    const afterSecond = estimatesOf(dataFile)
    const second = JSON.parse(readFileSync(storeFile, 'utf8'))
    expect([...afterSecond.entries()]).toEqual([...afterFirst.entries()])
    for (const point of moved) {
      expect(second.estimates[String(point)].baseline, `point ${point} keeps its original promise`).toBe(promised.get(point))
    }
    // THE DENOMINATOR DID NOT MOVE, although every corrected card did. Keeping
    // the baseline while dividing by the corrected estimates would show smaller
    // medians here — and would leave the queue just as stable, which is why the
    // queue alone cannot tell the two apart.
    expect(second.promiseMedians).toEqual(first.promiseMedians)
  }, 180_000)
})
