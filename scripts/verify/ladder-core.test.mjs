// The verification ladder as a refusal (point 1086). Every case the point names
// as VERIFIABLE lives here: this is the layer that decides whether an expensive
// browser pass may start, so it is pinned rather than exercised by starting one.
import { describe, it, expect } from 'vitest'
import {
  LADDER_ESCAPE_FLAG,
  LADDER_STATUS,
  classifyLadderRun,
  formatLadderRefusal,
  ladderVerdict,
  suitesCovering,
} from './ladder-core.mjs'
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
    expect(verdict.commands).toEqual(['npm test -- polish --section=town-plan'])
    expect(verdict.threshold).toBe(T0 + HOUR)
    expect(formatLadderRefusal(verdict)).toContain('npm test -- polish --section=town-plan')
  })

  it('names --section=list when the suite has no recorded section run to copy', () => {
    const verdict = ladderVerdict({
      run: fullPolish(),
      map: MAP,
      changes: [edit('src/scenes/place/village.ts', T0 + HOUR)],
      runs: [],
    })
    expect(verdict.commands).toEqual(['npm test -- polish --section=list'])
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

describe('the ladder fails open', () => {
  it('answers FREE rather than refusing when nothing could be gathered', () => {
    expect(ladderVerdict({ run: fullPolish() }).status).toBe(LADDER_STATUS.FREE)
    expect(ladderVerdict().ok).toBe(true)
  })
})
