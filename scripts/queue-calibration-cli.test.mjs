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
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { readTasksAll, readTasksOpen } from './tasks-source.mjs'
import { openPointsOf } from './board-queue-core.mjs'
import {
  isComparedSnapshot,
  MIN_CLASS_SAMPLES,
  parseCriticality,
  pictureBearingPoints,
  promiseMedians,
} from './queue-calibration-core.mjs'

const SCRIPT = resolve(process.cwd(), 'scripts', 'queue-calibration.mjs')
// Three different promises, so a class median is a real median and not the one
// value every card happens to carry.
const CORRECTABLE_ESTIMATES = ['~2 h', '~3 h', '~5 h']
// …and a promise far above them for the cards that owe a rendered proof. They
// are seeded ON PURPOSE: if the correction ever stopped excluding them, the
// medians below would move, and the denominator check would see it. With only
// correctable cards in the fixture, dropping the exclusion changed nothing.
const RENDER_ESTIMATE = '~20 h'

/**
 * One class with enough process cards to earn a factor, plus a render card in
 * the SAME class. Selecting from the work order keeps the fixture's classes
 * true while making its git history entirely synthetic.
 */
function calibrationSubjects() {
  const all = readTasksAll()
  const open = openPointsOf(readTasksOpen())
  const criticality = parseCriticality(all)
  const owed = pictureBearingPoints(all)
  const correctable = new Map()
  const held = new Map()
  for (const point of open) {
    const name = criticality.get(point)
    if (!name) continue
    const groups = owed.has(point) ? held : correctable
    groups.set(name, [...(groups.get(name) ?? []), point])
  }
  const count = MIN_CLASS_SAMPLES + 1
  const name = [...correctable.keys()]
    .filter((candidate) => (correctable.get(candidate)?.length ?? 0) >= count && (held.get(candidate)?.length ?? 0) > 0)
    .sort((a, b) => (correctable.get(b)?.length ?? 0) - (correctable.get(a)?.length ?? 0))[0]
  if (!name) throw new Error(`the calibration fixture needs ${count} correctable cards and one render holdout in the same class`)
  return { name, correctable: correctable.get(name).slice(0, count), held: held.get(name) }
}

const gitIn = (repo, args, at = null) => {
  const stamp = at === null ? {} : { GIT_AUTHOR_DATE: `${at} +0000`, GIT_COMMITTER_DATE: `${at} +0000` }
  const result = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=', '-C', repo, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Calibration Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Calibration Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      ...stamp,
    },
  })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`)
  return result.stdout
}

/** A complete first-parent chain whose merge parents never come from this checkout. */
function buildHistoryFixture(points) {
  const repo = mkdtempSync(join(tmpdir(), 'queue-cal-history-'))
  const initialized = spawnSync('git', ['init', '-q', '-b', 'main', repo], { encoding: 'utf8', windowsHide: true })
  if (initialized.status !== 0) throw new Error(`git init failed: ${initialized.stderr || initialized.stdout}`)

  const ticks = new Set()
  const tasks = () => `${points.map((point) => `- [${ticks.has(point) ? 'x' : ' '}] ${point}. Fixture point`).join('\n')}\n`
  writeFileSync(join(repo, 'TASKS.md'), tasks())
  gitIn(repo, ['add', 'TASKS.md'])
  gitIn(repo, ['commit', '-q', '-m', 'Start calibration history'], 1_750_000_000)

  points.forEach((point, i) => {
    const tickAt = 1_750_000_000 + (i + 1) * 86_400
    const branch = `feat/${point}-calibration-fixture`
    gitIn(repo, ['switch', '-q', '-c', branch])
    writeFileSync(join(repo, `point-${point}.txt`), `fixture work for ${point}\n`)
    gitIn(repo, ['add', `point-${point}.txt`])
    gitIn(repo, ['commit', '-q', '-m', `Build fixture point ${point}`], tickAt - 28_800)
    gitIn(repo, ['switch', '-q', 'main'])
    gitIn(repo, ['merge', '-q', '--no-ff', '-m', `Merge branch '${branch}'`, branch], tickAt - 1_800)
    ticks.add(point)
    writeFileSync(join(repo, 'TASKS.md'), tasks())
    gitIn(repo, ['add', 'TASKS.md'])
    gitIn(repo, ['commit', '-q', '-m', `Land fixture point ${point}`], tickAt)
  })
  return repo
}

/**
 * A disposable mutant with the correction's only factor provider disabled.
 * Its dependencies remain the reviewed checkout modules; only this copy is
 * changed, and it lives outside the repository.
 */
function buildNoCorrectionMutant() {
  const root = mkdtempSync(join(tmpdir(), 'queue-cal-mutant-'))
  const scripts = join(root, 'scripts')
  mkdirSync(scripts)
  const declaration = 'export function factorForCard(reading, criticality, { promiseMedian = null } = {}) {'
  const replacement = `${declaration}\n  return { factor: null, basis: null, label: criticality ?? UNTAGGED, reason: 'disabled by the fixture mutant' }\n}\n\nfunction workingFactorForCard(reading, criticality, { promiseMedian = null } = {}) {`
  const core = readFileSync(resolve(REPO_ROOT, 'scripts', 'queue-calibration-core.mjs'), 'utf8')
  const mutated = core.replace(declaration, replacement)
  if (mutated === core) throw new Error('the no-correction mutation no longer matches factorForCard')
  writeFileSync(join(scripts, 'queue-calibration-core.mjs'), mutated)
  writeFileSync(join(scripts, 'queue-calibration.mjs'), readFileSync(SCRIPT))
  for (const name of ['atomic-write.mjs', 'repo-paths.mjs', 'tasks-source.mjs', 'board-queue-core.mjs']) {
    symlinkSync(resolve(REPO_ROOT, 'scripts', name), join(scripts, name))
  }
  return { root, script: join(scripts, 'queue-calibration.mjs') }
}

const SUBJECTS = calibrationSubjects()
let historyRepo = ''
let mutant = null

beforeAll(() => {
  historyRepo = buildHistoryFixture(SUBJECTS.correctable)
  mutant = buildNoCorrectionMutant()
})

afterAll(() => {
  if (historyRepo) rmSync(historyRepo, { recursive: true, force: true })
  if (mutant?.root) rmSync(mutant.root, { recursive: true, force: true })
})

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
function seedQueueData(dir) {
  const { correctable, held } = SUBJECTS
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

const movedCards = (before, after) =>
  [...after.entries()].filter(([point, estimate]) => before.get(point) !== estimate).map(([point]) => point).sort((a, b) => a - b)

const correctionClasses = (store) => {
  const classes = Object.keys(store.applied)
  expect(classes.length, 'the synthesized spans must produce a correction').toBeGreaterThan(0)
  return classes
}

const correctedCards = (before, after) => {
  const moved = movedCards(before, after)
  expect(moved.length, 'the seeded cards must actually move').toBeGreaterThan(0)
  return moved
}

// Git reads ONLY the synthesized merge/tick chain. HOA_REPO_ROOT deliberately
// keeps the command's task parsing and board writer on the reviewed checkout;
// neither its depth nor the existence of a local `main` can affect a result.
// These command-level cases genuinely need the checkout's current TASKS.md,
// archive and queue writer because those are what classify and rewrite an open
// card. Checked-out files are sufficient; no commit or merge history is needed.
const run = (dir, ...args) => {
  const script = typeof args[0] === 'object' ? args.shift().script : SCRIPT
  const before = checkoutState()
  const result = spawnSync(process.execPath, [script, '--state-dir', dir, '--limit', '30', '--since', 'all', ...args], {
    encoding: 'utf8',
    windowsHide: true,
    cwd: historyRepo,
    env: { ...process.env, HOA_REPO_ROOT: REPO_ROOT },
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
    expect(seeded).toEqual(SUBJECTS.correctable)
    expect(store.rows.map((row) => row.point)).toEqual(SUBJECTS.correctable)
    expect(store.rows.every((row) => row.criticality === SUBJECTS.name)).toBe(true)
    expect(store.rows.every((row) => row.attribution === 'named' && row.spanBasis === 'branch-to-landing')).toBe(true)
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
    // An empty `applied` would make every check below vacuous.
    const classes = correctionClasses(store)
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
    const moved = correctedCards(before, after)
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
    const moved = correctedCards(promised, afterFirst)

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
    // …AND THE FIXTURE IS SENSITIVE TO THAT DIFFERENCE. Recomputed from the
    // cards as the first run left them, with no baseline to consult, the medians
    // are other numbers — so the equality above is a result and not a tautology.
    const corrected = JSON.parse(readFileSync(dataFile, 'utf8')).points
    const naive = promiseMedians({
      cards: corrected,
      open: openPointsOf(readTasksOpen()),
      criticality: parseCriticality(readTasksAll()),
      ledger: {},
      exclude: pictureBearingPoints(readTasksAll()),
    })
    expect(Object.fromEntries(naive)).not.toEqual(first.promiseMedians)
  }, 180_000)
})

describe('the fixture rejects a correction that applies to nothing', () => {
  it('trips the denominator, moved-card and second-run non-vacuity checks', () => {
    const reportDir = mkdtempSync(join(tmpdir(), 'queue-cal-broken-report-'))
    seedQueueData(reportDir)
    const report = run(reportDir, { script: mutant.script })
    expect(report.status, report.stderr).toBe(0)
    const store = JSON.parse(readFileSync(join(reportDir, 'queue-calibration.json'), 'utf8'))
    expect(store.applied).toEqual({})
    expect(() => correctionClasses(store)).toThrow()

    const applyDir = mkdtempSync(join(tmpdir(), 'queue-cal-broken-apply-'))
    seedQueueData(applyDir)
    const applyFile = join(applyDir, 'board-queue.json')
    const beforeApply = estimatesOf(applyFile)
    const apply = run(applyDir, { script: mutant.script }, '--apply')
    expect(apply.status, apply.stderr).toBe(0)
    const afterApply = estimatesOf(applyFile)
    expect(movedCards(beforeApply, afterApply)).toEqual([])
    expect(() => correctedCards(beforeApply, afterApply)).toThrow()

    const twiceDir = mkdtempSync(join(tmpdir(), 'queue-cal-broken-twice-'))
    seedQueueData(twiceDir)
    const twiceFile = join(twiceDir, 'board-queue.json')
    const promised = estimatesOf(twiceFile)
    const first = run(twiceDir, { script: mutant.script }, '--apply')
    expect(first.status, first.stderr).toBe(0)
    const afterFirst = estimatesOf(twiceFile)
    expect(movedCards(promised, afterFirst)).toEqual([])
    expect(() => correctedCards(promised, afterFirst)).toThrow()
  }, 180_000)
})
