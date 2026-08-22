// THE CALIBRATION COMMAND'S OWN SURFACE (point 730).
//
// The arithmetic is in `queue-calibration-core.mjs` and tested there. What this
// file covers is what only the assembled command can be wrong about: the report
// says one thing while the store says another, or the store keeps a number
// nobody can re-derive. Both were review findings on 22.08.2026.
//
// EVERY RUN HERE IS READ-ONLY TOWARDS THE CHECKOUT. `--state-dir` points the
// command at a throwaway directory, so the queue data, the calibration store and
// any write land there; the repository is only ever read, through git.
import { describe, it, expect, beforeAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { readTasksAll, readTasksOpen } from './tasks-source.mjs'
import { isComparedSnapshot, pictureBearingPoints } from './queue-calibration-core.mjs'

const SCRIPT = resolve(process.cwd(), 'scripts', 'queue-calibration.mjs')

/**
 * A queue data file holding open points that CAN be corrected, with an estimate
 * each. Points owing a rendered proof are left out on purpose: they are held out
 * of every correction, so seeding them would leave the apply case asserting
 * nothing at all.
 */
function seedQueueData(dir, count = 12) {
  const held = pictureBearingPoints(readTasksAll())
  const open = [...String(readTasksOpen() ?? '').matchAll(/^- \[ \] (\d+)\./gm)]
    .map((m) => Number(m[1]))
    .filter((p) => !held.has(p))
  const points = {}
  for (const point of open.slice(0, count)) {
    points[String(point)] = { title: `Point ${point}`, body: [], estimate: '~3 h' }
  }
  writeFileSync(join(dir, 'board-queue.json'), `${JSON.stringify({ points }, null, 2)}\n`)
  return Object.keys(points).map(Number)
}

describe('the report and the store are one reading', () => {
  let out = ''
  let store = null
  let seeded = []

  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'queue-cal-'))
    seeded = seedQueueData(dir)
    const run = spawnSync(process.execPath, [SCRIPT, '--state-dir', dir, '--limit', '30'], {
      encoding: 'utf8',
      windowsHide: true,
      cwd: process.cwd(),
      input: '',
    })
    expect(run.status, run.stderr).toBe(0)
    out = run.stdout
    store = JSON.parse(readFileSync(join(dir, 'queue-calibration.json'), 'utf8'))
  }, 120_000)

  it('seeds enough cards for the run to have something to say', () => {
    expect(seeded.length).toBeGreaterThan(0)
  })

  it('prints what actually holds a landing out, not only how it was verified', () => {
    // The picture column is the RETAINED VERIFICATION class; `owed` is the fact
    // the exclusion is made on, and it used to be invisible per landing.
    expect(out).toMatch(/point\s+crit\s+lane\s+picture\s+owed\s+merge/)
    const rows = out.split('\n').filter((l) => /^ {2}\d+\s+\S+\s+\S+\s+picture-\S+\s+(yes|no)\s/.test(l))
    expect(rows.length).toBe(store.window.landings)
  })

  it('claims exactly the comparisons its own rows can show', () => {
    // The printed claim and the rows behind it, checked against each other —
    // counting stored-but-uncomparable snapshots as comparisons is what let the
    // report promise ratios that ACTUAL ÷ ESTIMATE did not have.
    expect(store.provenance.estimates.snapshot).toBe(store.rows.filter((r) => isComparedSnapshot(r)).length)
    expect(out).toContain(`${store.provenance.estimates.snapshot} snapshot(s) compared`)
    expect(out).toContain(`${store.provenance.estimates.snapshotUncomparable} snapshot(s) carrying no ratio`)
  })

  it('names every card the holdout reached, not just how many', () => {
    expect(store.heldOut.every((p) => store.pictureBearing.includes(p))).toBe(true)
    if (store.heldOut.length) expect(out).toContain(`held out: ${store.heldOut.join(', ')}`)
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
    expect(typeof store.promiseMedians).toBe('object')
    for (const [name, applied] of Object.entries(store.applied)) {
      expect(applied.factor).toBeGreaterThan(0)
      expect(typeof applied.basis).toBe('string')
      // A factor the store records is a factor the report printed.
      expect(out).toMatch(new RegExp(`^\\s+${name}\\s+\\S+\\s+\\(${applied.basis.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'm'))
    }
  })
})

describe('an apply leaves the ledger standing for every card it moved', () => {
  it('writes a baseline and an applied entry per written card', () => {
    const dir = mkdtempSync(join(tmpdir(), 'queue-cal-apply-'))
    seedQueueData(dir)
    const run = spawnSync(process.execPath, [SCRIPT, '--state-dir', dir, '--limit', '30', '--apply'], {
      encoding: 'utf8',
      windowsHide: true,
      cwd: process.cwd(),
      input: '',
    })
    expect(run.status, run.stderr).toBe(0)
    const store = JSON.parse(readFileSync(join(dir, 'queue-calibration.json'), 'utf8'))
    const written = [...run.stdout.matchAll(/^ {2}(\d+) \S.* → \S/gm)].map((m) => Number(m[1]))
    const applied = [...run.stdout.matchAll(/APPLIED: (\d+) estimate\(s\) written/g)]
    expect(applied.length).toBe(1)
    // Without this the loop below could pass by asserting nothing.
    expect(written.length, 'the seeded cards must actually move').toBeGreaterThan(0)
    // EVERY CARD THAT MOVED IS ON THE LEDGER. The queue write commits on its
    // own, so a ledger written only at the very end would leave a corrected card
    // whose promise nothing remembers — and the next run would measure its own
    // correction as if it were the batch getting slower.
    const cards = JSON.parse(readFileSync(join(dir, 'board-queue.json'), 'utf8')).points
    for (const point of written.filter((p) => cards[String(p)])) {
      const entry = store.estimates[String(point)]
      expect(entry, `point ${point} must be on the ledger`).toBeTruthy()
      expect(entry.baseline).toBeTruthy()
      expect(entry.applied?.estimate).toBe(cards[String(point)].estimate)
    }
  }, 120_000)
})
