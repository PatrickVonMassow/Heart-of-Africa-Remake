// The verification ladder as a refusal (point 1086). Every case the point names
// as VERIFIABLE lives here: this is the layer that decides whether an expensive
// browser pass may start, so it is pinned rather than exercised by starting one.
import { describe, it, expect } from 'vitest'
import {
  LADDER_ESCAPE_FLAG,
  LADDER_STATUS,
  classifyLadderRun,
  editTimeFor,
  formatLadderRefusal,
  ladderVerdict,
  suitesCovering,
} from './ladder-core.mjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDiffSuiteMap } from '../point-brief-core.mjs'

// The work order's own paragraph, in the shape `parseDiffSuiteMap` reads. Kept
// verbatim-shaped rather than mocked: the ladder must move with the real
// mapping, and a fixture that drifted from it would prove the wrong thing.
const MAP = parseDiffSuiteMap(
  [
    'preamble',
    '',
    'Diff → browser-suite mapping: `src/i18n/` → i18n · store/systems logic → Vitest',
    'only (flow if the core loop is touched) · `src/scenes/place/` → collision,',
    'polish, settings · `src/render/` → settings, enrichments, polish ·',
    '`scripts/verify/X.mjs` → X itself · `*.md` → docs. When unsure,',
    'include the suite.',
    '',
    'rest',
  ].join('\n'),
)

const HOUR = 3_600_000
const T0 = 1_800_000_000_000

/** A full `npm test -- polish` on the everyday lane. */
const fullPolish = () => classifyLadderRun({ argv: ['polish'] })

const edit = (path, at) => ({ path, editedAt: at })
const ledgerRun = (over) => ({ suite: 'polish', exit: 0, startedAt: T0, ...over })

describe('what shape of run the ladder is looking at', () => {
  it('never refuses the cheap rung itself', () => {
    const run = classifyLadderRun({ argv: ['polish', '--section=adult-errands'] })
    expect(run.kind).toBe('section')
    const verdict = ladderVerdict({
      run,
      map: MAP,
      changes: [edit('src/scenes/place/village.ts', T0 + HOUR)],
      runs: [],
    })
    expect(verdict.ok).toBe(true)
    expect(verdict.status).toBe(LADDER_STATUS.RUNG)
  })

  it('leaves a run with no browser suite alone', () => {
    const run = classifyLadderRun({ argv: ['docs'] })
    expect(run.kind).toBe('none')
    expect(ladderVerdict({ run, map: MAP, changes: [edit('CLAUDE.md', T0 + HOUR)] }).status).toBe(
      LADDER_STATUS.NOT_APPLICABLE,
    )
  })

  it('reads a tier and the bare default as full runs', () => {
    expect(classifyLadderRun({ argv: ['large'] }).kind).toBe('full')
    expect(classifyLadderRun({ argv: [] }).kind).toBe('full')
    expect(fullPolish().browser).toEqual(['polish'])
  })
})

describe('the refusal, and what lifts it', () => {
  it('refuses a full run after an edit with no narrow green, and names the command', () => {
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      changes: [edit('src/scenes/place/village.ts', T0 + HOUR)],
      runs: [ledgerRun({ startedAt: T0 - HOUR, partial: true, section: 'town-plan' })],
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.status).toBe(LADDER_STATUS.REFUSED)
    expect(verdict.suites).toEqual(['polish'])
    expect(verdict.commands).toEqual([
      'npm test -- polish --section=town-plan   # the section polish last ran',
      'npm test -- polish --section=list   # every section polish declares',
    ])
    expect(verdict.threshold).toBe(T0 + HOUR)
    expect(formatLadderRefusal(verdict)).toContain('RUN THIS INSTEAD:')
    expect(formatLadderRefusal(verdict)).toContain('npm test -- polish --section=town-plan')
  })

  it('offers only the name list when no section run is recorded to copy', () => {
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      changes: [edit('src/scenes/place/village.ts', T0 + HOUR)],
      runs: [],
    })
    expect(verdict.commands).toEqual(['npm test -- polish --section=list   # every section polish declares'])
    expect(verdict.reason).toContain(LADDER_ESCAPE_FLAG)
  })

  it('admits the same run once the narrow rung is green at or after the edit', () => {
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      changes: [edit('src/scenes/place/village.ts', T0 + HOUR)],
      runs: [ledgerRun({ startedAt: T0 + HOUR, partial: true, section: 'adult-errands' })],
    })
    expect(verdict.ok).toBe(true)
    expect(verdict.status).toBe(LADDER_STATUS.CLIMBED)
    expect(verdict.suites).toEqual(['polish'])
  })

  it('refuses on the suite whose rung is missing while another suite is green', () => {
    const verdict = ladderVerdict({
      run: classifyLadderRun({ argv: ['large'] }),
      map: MAP,
      changes: [edit('src/scenes/place/village.ts', T0 + HOUR)],
      runs: [
        ledgerRun({ suite: 'polish', startedAt: T0 + HOUR, partial: true, section: 'adult-errands' }),
        ledgerRun({ suite: 'collision', startedAt: T0 - HOUR, partial: true, section: 'huts' }),
      ],
    })
    expect(verdict.status).toBe(LADDER_STATUS.REFUSED)
    expect(verdict.suites).toEqual(['collision', 'settings'])
  })

  it('does not credit a RED narrow run', () => {
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      changes: [edit('src/scenes/place/village.ts', T0 + HOUR)],
      runs: [ledgerRun({ exit: 1, startedAt: T0 + 2 * HOUR, partial: true, section: 'adult-errands' })],
    })
    expect(verdict.status).toBe(LADDER_STATUS.REFUSED)
  })
})

describe('an edit the suite does not cover', () => {
  it('leaves the full run free', () => {
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      // i18n's own material: the mapping sends it to the `i18n` suite, which
      // this run does not include.
      changes: [edit('src/i18n/de.ts', T0 + HOUR)],
      runs: [],
    })
    expect(verdict.ok).toBe(true)
    expect(verdict.status).toBe(LADDER_STATUS.FREE)
  })

  it('and so does an edit no mapping rule covers at all', () => {
    expect(suitesCovering('local/notes/scratch.txt', MAP)).toEqual([])
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      changes: [edit('local/notes/scratch.txt', T0 + HOUR)],
      runs: [],
    })
    expect(verdict.status).toBe(LADDER_STATUS.FREE)
  })

  it('keeps a DELETED covered file in the material rather than answering free', () => {
    // A file that is gone has no mtime, so `editedFiles` gives it the time 0 it
    // can prove. Dropping it instead made the whole run FREE: delete one tracked
    // file under a covered directory, change nothing else, and the expensive
    // pass was waved through. Removing code breaks its covering suite exactly as
    // editing it does.
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      changes: [edit('src/scenes/place/gone.ts', 0)],
      runs: [],
    })
    expect(verdict.status).toBe(LADDER_STATUS.REFUSED)
    expect(verdict.ok).toBe(false)
  })

  it('sends a suite file to the suite that IS the file', () => {
    expect(suitesCovering('scripts/verify/polish.mjs', MAP)).toEqual(['polish'])
    // "store/systems logic → Vitest only" names no browser suite, so nothing
    // the ladder can gate on comes back for it.
    expect(suitesCovering('scripts/verify/ladder-core.mjs', MAP)).toEqual([])
  })
})

describe('a merge ages the rung exactly as an edit does (measured 10.09.2026)', () => {
  it('counts a rung older than the branch’s last merge as unclimbed', () => {
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      changes: [edit('src/scenes/place/village.ts', T0)],
      // Green AFTER the last edit — and the merge landed after it, as the two
      // merges of 09.09.2026 landed at ~23:35 after the last green rung.
      runs: [ledgerRun({ startedAt: T0 + HOUR, partial: true, section: 'adult-errands' })],
      merges: [{ at: T0 + 2 * HOUR }],
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.status).toBe(LADDER_STATUS.REFUSED)
    expect(verdict.threshold).toBe(T0 + 2 * HOUR)
    expect(verdict.reason).toContain('last merge')
  })

  it('ages the rung when the MERGE is the only thing that changed', () => {
    // `git merge main` moves the merge base to main's tip, so everything the
    // merge imported leaves the branch delta: `changes` is empty. The run then
    // answered FREE with a rung older than the merge — the exact case measured
    // on 09.09.2026, when two merges landed after the last green rung and the
    // LARGE run failed on that section's material.
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      changes: [],
      merges: [{ at: T0 + HOUR }],
      runs: [ledgerRun({ startedAt: T0, partial: true, section: 'town-plan' })],
    })
    expect(verdict.status).toBe(LADDER_STATUS.REFUSED)
    expect(verdict.ok).toBe(false)
  })

  it('and admits it once the rung is re-climbed after the merge', () => {
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      changes: [edit('src/scenes/place/village.ts', T0)],
      runs: [ledgerRun({ startedAt: T0 + 3 * HOUR, partial: true, section: 'adult-errands' })],
      merges: [{ at: T0 + 2 * HOUR }],
    })
    expect(verdict.status).toBe(LADDER_STATUS.CLIMBED)
  })
})

describe('one suite’s threshold is its own', () => {
  it('leaves a green rung standing when ANOTHER suite is the one that was edited', () => {
    // One threshold across every covered suite let an unrelated edit invalidate
    // a rung that was green for its own material — a FALSE refusal, which is
    // the costly direction: it blocks an author who DID climb the ladder.
    const run = { kind: 'full', browser: ['collision', 'polish'], suites: ['collision', 'polish'], section: null }
    const verdict = ladderVerdict({
      run,
      map: MAP,
      changes: [
        edit('scripts/verify/polish.mjs', T0),
        edit('scripts/verify/collision.mjs', T0 + 2 * HOUR),
      ],
      runs: [
        { suite: 'polish', exit: 0, startedAt: T0 + HOUR, partial: true, section: 'town-plan' },
        { suite: 'collision', exit: 0, startedAt: T0 + 3 * HOUR, partial: true, section: 'huts' },
      ],
    })
    expect(verdict.status).toBe(LADDER_STATUS.CLIMBED)
    expect(verdict.ok).toBe(true)
  })
})

describe('a check that declares itself non-predictive', () => {
  const nonPredictive = {
    polish: [
      {
        section: 'adult-errands',
        check: 'a villager is seen digging, and the jar goes down EMPTY and comes back FULL',
        why: 'the full suite cast ONE errand where the section alone casts many',
      },
    ],
  }

  it('never satisfies the ladder', () => {
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      nonPredictive,
      changes: [edit('src/scenes/place/village.ts', T0)],
      runs: [ledgerRun({ startedAt: T0 + HOUR, partial: true, section: 'adult-errands' })],
    })
    expect(verdict.status).not.toBe(LADDER_STATUS.CLIMBED)
    expect(verdict.status).toBe(LADDER_STATUS.WAIVED_NON_PREDICTIVE)
    // …and it does not refuse either: enforcing a rung that lies buys false
    // confidence instead of time.
    expect(verdict.ok).toBe(true)
    expect(verdict.reason).toContain('NON-PREDICTIVE')
    expect(verdict.record.lying[0].checks).toEqual([nonPredictive.polish[0].check])
  })

  it('leaves an honest rung of the same suite counting', () => {
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      nonPredictive,
      changes: [edit('src/scenes/place/village.ts', T0)],
      runs: [
        ledgerRun({ startedAt: T0 + HOUR, partial: true, section: 'adult-errands' }),
        ledgerRun({ startedAt: T0 + HOUR, partial: true, section: 'town-plan' }),
      ],
    })
    expect(verdict.status).toBe(LADDER_STATUS.CLIMBED)
  })

  it('does not touch a WHOLE-suite green, which measures what the suite measures', () => {
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      nonPredictive,
      changes: [edit('src/scenes/place/village.ts', T0)],
      runs: [ledgerRun({ startedAt: T0 + HOUR })],
    })
    expect(verdict.status).toBe(LADDER_STATUS.CLIMBED)
  })
})

describe('a narrow run answers only for the material it RAN', () => {
  // Where the link IS derivable — an edit to the suite's own source, where a
  // section is a block and a changed line sits in one — a run of a different
  // section cannot stand in for it. Edit the `adult-errands` block, run only
  // `town-plan`, and the full pass used to count as climbed although the edited
  // material was never checked once (four-eyes review, GPT-6 Astra).
  const editedBlock = { path: 'scripts/verify/polish.mjs', editedAt: T0, sections: ['adult-errands'] }

  it('does not credit a green run of a DIFFERENT section', () => {
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      changes: [editedBlock],
      runs: [ledgerRun({ startedAt: T0 + HOUR, partial: true, section: 'town-plan' })],
    })
    expect(verdict.status).toBe(LADDER_STATUS.REFUSED)
    expect(verdict.ok).toBe(false)
  })

  it('credits the section that actually ran, and NAMES it', () => {
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      changes: [editedBlock],
      runs: [ledgerRun({ startedAt: T0 + HOUR, partial: true, section: 'adult-errands' })],
    })
    expect(verdict.status).toBe(LADDER_STATUS.CLIMBED)
    expect(verdict.reason).toContain('--section=adult-errands')
    expect(verdict.record.credited).toEqual([{ suite: 'polish', section: 'adult-errands' }])
  })

  it('still credits any narrow green where the link cannot be read', () => {
    // `src/scenes/place/` reaches three suites and no section in particular, so
    // the ladder keeps its approximation — and puts it on the record by naming
    // the section it credited, instead of hiding it inside the verdict.
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      changes: [edit('src/scenes/place/layout.ts', T0)],
      runs: [ledgerRun({ startedAt: T0 + HOUR, partial: true, section: 'town-plan' })],
    })
    expect(verdict.status).toBe(LADDER_STATUS.CLIMBED)
    expect(verdict.record.credited).toEqual([{ suite: 'polish', section: 'town-plan' }])
  })
})

describe('the deliberate escape', () => {
  it('lets the run through and RECORDS what it waived', () => {
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      changes: [edit('src/scenes/place/village.ts', T0 + HOUR)],
      runs: [],
      escape: { why: 'the defect only appears with every section staged together' },
      now: T0 + 2 * HOUR,
    })
    expect(verdict.ok).toBe(true)
    expect(verdict.status).toBe(LADDER_STATUS.WAIVED_ESCAPE)
    expect(verdict.record).toMatchObject({
      status: LADDER_STATUS.WAIVED_ESCAPE,
      why: 'the defect only appears with every section staged together',
      suites: ['polish'],
      at: T0 + 2 * HOUR,
    })
  })

  it('is not a bare flag: without a reason the refusal stands', () => {
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      changes: [edit('src/scenes/place/village.ts', T0 + HOUR)],
      runs: [],
      escape: { why: '   ' },
    })
    expect(verdict.status).toBe(LADDER_STATUS.REFUSED)
  })
})

describe('when a file was really last edited', () => {
  it('dates a CLEAN file by the commit it carries, not by its mtime', () => {
    // Measured the first time the ladder was used in anger: switching to `main`
    // and back rewrote polish.mjs, moved its mtime past every green rung, and
    // refused the covering run of the point that built the ladder — without one
    // byte of the file changing. An mtime is not an edit.
    expect(editTimeFor({ dirty: false, mtime: T0 + HOUR, committedAt: T0 })).toBe(T0)
  })

  it('takes the later of the two for a DIRTY file, where the bytes really may differ', () => {
    expect(editTimeFor({ dirty: true, mtime: T0 + HOUR, committedAt: T0 })).toBe(T0 + HOUR)
    expect(editTimeFor({ dirty: true, mtime: 0, committedAt: T0 })).toBe(T0)
  })

  it('is total on nothing at all', () => {
    expect(editTimeFor()).toBe(0)
    expect(editTimeFor({ dirty: true })).toBe(0)
  })
})

describe('the ladder fails open', () => {
  it('answers FREE rather than refusing when nothing could be gathered', () => {
    expect(ladderVerdict({ run: fullPolish() }).status).toBe(LADDER_STATUS.FREE)
    expect(ladderVerdict().ok).toBe(true)
  })
})

describe('every entrypoint answers to the ladder', () => {
  // THE CLAIM THIS PINS. The README says every run passes through the refusal.
  // It did not: `run-logged.mjs` asked, and `run-all.mjs` — documented in the
  // same README as an ordinary command, and the way the LARGE run of 11.09.2026
  // was actually started — asked nothing at all. A mechanism absent from the
  // command the house uses is a mechanism that does not exist (four-eyes
  // review, GPT-6 Astra).
  const source = (file) => readFileSync(join(import.meta.dirname, file), 'utf8')

  it('run-all.mjs asks it before it spawns a suite', () => {
    expect(source('run-all.mjs')).toContain('ladderCheck(')
  })

  it('run-logged.mjs asks it too, and says so to the child', () => {
    const text = source('run-logged.mjs')
    expect(text).toContain('ladderCheck(')
    expect(text).toContain('RVA_LADDER_ASKED')
  })
})
