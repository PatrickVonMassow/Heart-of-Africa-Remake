import { describe, expect, it } from 'vitest'
import {
  attributeMerges,
  axisSpread,
  calibrationReading,
  classesOf,
  classSummaries,
  estimateForLanding,
  estimateTail,
  ESTIMATE_FLOOR_HOURS,
  factorForCard,
  formatEstimate,
  globalFactorDecision,
  inheritanceDefaults,
  inheritedEstimate,
  inheritedEstimateForClass,
  ledgerAfterApply,
  mergedBranchPoint,
  MIN_CLASS_SAMPLES,
  parseCriticality,
  parseEstimateHours,
  parseFirstParentChain,
  parseTickEvents,
  rewritePlan,
  roundHours,
  SPAN_NO_BRANCH,
  summarise,
  UNTAGGED,
  updateEstimateLedger,
} from './queue-calibration-core.mjs'

/** A landing, spelled the way the reading consumes it. */
const landing = (over = {}) => ({
  point: 1,
  landedAt: 0,
  delegated: true,
  elapsedHours: 1,
  estimateHours: 2,
  criticality: 'medium',
  picture: false,
  ...over,
})

/**
 * Main-session landings AS THE COMMAND CAN ACTUALLY PRODUCE THEM: no branch, so
 * no span, no file list and therefore no picture either. Fixtures that gave this
 * lane a duration proved a path the tool could never reach.
 */
const mainSessionLandings = (n, over = {}) =>
  Array.from({ length: n }, (_, i) =>
    landing({ point: 800 + i, delegated: false, elapsedHours: null, spanBasis: SPAN_NO_BRANCH, picture: null, ...over }),
  )

/** `n` landings of one class whose ratio is exactly `ratio`. */
const classOf = (n, ratio, over = {}) =>
  Array.from({ length: n }, (_, i) => landing({ point: 100 + i, elapsedHours: ratio * 2, estimateHours: 2, ...over }))

describe('estimate strings', () => {
  it('reads the German decimal comma and ignores the note', () => {
    expect(parseEstimateHours('~3 h')).toBe(3)
    expect(parseEstimateHours('~1,5 h')).toBe(1.5)
    expect(parseEstimateHours('~3.5 h · vor 203 · Feature')).toBe(3.5)
    expect(parseEstimateHours('Schätzung offen')).toBeNull()
    expect(parseEstimateHours(null)).toBeNull()
  })

  it('keeps every kind of note, not only the middot clause', () => {
    expect(estimateTail('~4 h · Feature')).toBe(' · Feature')
    // A tail rule that only knew the middot deleted this one silently.
    expect(estimateTail('~4 h (mehrere Sitzungen)')).toBe(' (mehrere Sitzungen)')
    expect(estimateTail('~4 h')).toBe('')
  })

  it('writes half-hour steps, never below the floor, note intact', () => {
    expect(formatEstimate(1.2, '~4 h')).toBe('~1 h')
    expect(formatEstimate(1.3, '~4 h')).toBe('~1,5 h')
    expect(formatEstimate(0.05, '~2 h · Feature')).toBe(`~${ESTIMATE_FLOOR_HOURS} h · Feature`.replace('.', ','))
    expect(roundHours(0.01)).toBe(ESTIMATE_FLOOR_HOURS)
    expect(roundHours(null)).toBeNull()
  })
})

describe('reading the work order', () => {
  it('takes the criticality level even when the line says it was raised', () => {
    const crit = parseCriticality(
      [
        '- [ ] 10. A point.',
        '  Criticality: medium — because.',
        '- [x] 11. Another.',
        '  Criticality: raised to HIGH — no longer latent.',
        '- [ ] 12. A third.',
        '  Criticality: MAXIMUM — invented level.',
        '- [ ] 13. No tag at all.',
        '  Bundle: Chat & Tafel.',
      ].join('\n'),
    )
    expect(crit.get(10)).toBe('medium')
    expect(crit.get(11)).toBe('high')
    // An invented level stays its own class rather than being folded into high.
    expect(crit.get(12)).toBe('maximum')
    expect(crit.has(13)).toBe(false)
  })

  it('takes a point\'s FIRST tick, not a later re-tick', () => {
    // `git log` is newest-first, so the later tick comes first in the text.
    const events = parseTickEvents(
      ['@@COMMIT@@bbb 2000', '+- [x] 7. Landed again.', '@@COMMIT@@aaa 1000', '+- [x] 7. Landed.', '+- [x] 8. Also landed.'].join('\n'),
    )
    expect(events).toEqual([
      { point: 7, sha: 'aaa', at: 1000 },
      { point: 8, sha: 'aaa', at: 1000 },
    ])
  })
})

describe('attributing a merge to a point', () => {
  const chain = parseFirstParentChain(
    [
      'tick2 500 merge2\tTick the point',
      'merge2 490 prev2 side2\tGive the traveller a way out of a wedge',
      'prev2 400 merge1\tSome bookkeeping',
      'tick1 300 merge1x\tTick the other point',
      "merge1x 290 base side1\tMerge branch 'feat/42-named-branch'",
      'base 100\tRoot',
    ].join('\n'),
  )

  it('trusts a merge that names its own branch', () => {
    const out = attributeMerges(chain, [{ point: 42, sha: 'tick1', at: 300 }])
    expect(out.get(42)).toMatchObject({ attribution: 'branch-name' })
    expect(out.get(42).merge.sha).toBe('merge1x')
  })

  it('recovers the merge of a written-subject landing from the landing sequence', () => {
    const out = attributeMerges(chain, [{ point: 99, sha: 'tick2', at: 500 }])
    expect(out.get(99)).toMatchObject({ attribution: 'nearest-merge' })
    expect(out.get(99).merge.sha).toBe('merge2')
  })

  it('never lets two points claim one merge', () => {
    const out = attributeMerges(chain, [
      { point: 98, sha: 'tick2', at: 500 },
      { point: 99, sha: 'tick2', at: 501 },
    ])
    expect(out.get(98).merge.sha).toBe('merge2')
    expect(out.has(99)).toBe(false)
  })

  it('leaves a landing with no merge in reach unattributed', () => {
    const out = attributeMerges(chain, [{ point: 97, sha: 'base', at: 100 }])
    expect(out.has(97)).toBe(false)
  })

  // THE COUNTER-CASE THE HEURISTIC EXISTS TO SURVIVE: a point done in the MAIN
  // SESSION, ticked right after somebody else's merge. It has no branch and must
  // not inherit one, or its lane and its duration are both a fiction.
  it('never gives a main-session tick a merge that names another point', () => {
    const out = attributeMerges(chain, [{ point: 96, sha: 'tick1', at: 300 }])
    expect(out.has(96)).toBe(false)
  })

  it('claims a named merge even when the other point\'s tick comes later', () => {
    const out = attributeMerges(chain, [
      // The main-session tick is processed FIRST and sits right behind 42's merge.
      { point: 96, sha: 'tick1', at: 300 },
      { point: 42, sha: 'tick2', at: 500 },
    ])
    expect(out.has(96)).toBe(false)
    expect(out.get(42)).toMatchObject({ attribution: 'branch-name' })
    expect(out.get(42).merge.sha).toBe('merge1x')
  })

  it('refuses a merge that sits further back in TIME than a landing ever is', () => {
    const stale = parseFirstParentChain(
      [
        'tickX 100000 mergeX\tTick a point nobody merged',
        'mergeX 10000 base sideX\tSome merge from days earlier',
        'base 100\tRoot',
      ].join('\n'),
    )
    expect(attributeMerges(stale, [{ point: 95, sha: 'tickX', at: 100000 }]).has(95)).toBe(false)
    // …and takes it when it sits within the measured merge-to-tick lag.
    const fresh = parseFirstParentChain(
      ['tickY 10600 mergeY\tTick a point', 'mergeY 10000 base sideY\tA written merge subject', 'base 100\tRoot'].join('\n'),
    )
    expect(attributeMerges(fresh, [{ point: 94, sha: 'tickY', at: 10600 }]).get(94)).toMatchObject({
      attribution: 'nearest-merge',
    })
  })

  it('reads a branch name off a merge subject, and nothing else', () => {
    expect(mergedBranchPoint("Merge branch 'feat/701-cost-per-point'")).toBe(701)
    expect(mergedBranchPoint("Merge branch 'origin/feat/12-x'")).toBe(12)
    expect(mergedBranchPoint('Give the drummer his own drums')).toBeNull()
  })
})

describe('distributions', () => {
  it('reports five numbers and no average', () => {
    expect(summarise([4, 1, 3, 2])).toEqual({ n: 4, min: 1, p25: 2, median: 2.5, p75: 4, max: 4 })
    expect(summarise([])).toEqual({ n: 0, min: null, p25: null, median: null, p75: null, max: null })
    // A single heavy tail must not move the median — the reason a mean is refused.
    expect(summarise([1, 1, 1, 1, 900]).median).toBe(1)
  })

  it('classifies a landing on all three axes', () => {
    expect(classesOf(landing({ criticality: null, delegated: false, picture: true }))).toEqual({
      criticality: UNTAGGED,
      lane: 'main-session',
      picture: 'picture',
    })
    // No merge means no file list, so whether a picture check happened is UNKNOWN.
    expect(classesOf(landing({ picture: null })).picture).toBe('picture-unknown')
  })

  it('counts a class that has no measurable span but still exists', () => {
    const rows = [...classOf(6, 0.3), ...mainSessionLandings(1)]
    const lanes = classSummaries(rows, 'lane')
    const main = lanes.find((c) => c.name === 'main-session')
    expect(main.points).toBe(1)
    expect(main.ratio.n).toBe(0)
    expect(main.comparable).toBe(false)
    // …and says WHY: no branch, so no further landing will ever measure it.
    expect(main.structural).toBe(true)
  })

  it('separates a class that CANNOT be measured from one that merely is not yet', () => {
    const thin = [...classOf(6, 0.3), landing({ point: 9, delegated: false, elapsedHours: 0.4 })]
    const main = classSummaries(thin, 'lane').find((c) => c.name === 'main-session')
    // This one has a span, so the class is thin, not unknowable.
    expect(main.structural).toBe(false)
  })
})

describe('is one global factor honest?', () => {
  const axesFrom = (rows) => ({
    criticality: classSummaries(rows, 'criticality'),
    lane: classSummaries(rows, 'lane'),
    picture: classSummaries(rows, 'picture'),
  })

  it('adopts one factor when every axis that CAN be compared stays together', () => {
    // Exactly the shape the command produces: two measurable classes per usable
    // axis, plus main-session landings that carry no span at all. The lane axis
    // is therefore not decidable — which is a stated residual, not a vote.
    const rows = [
      ...classOf(6, 0.3, { criticality: 'medium', picture: false, delegated: true }),
      ...classOf(6, 0.32, { criticality: 'high', picture: true, delegated: true }),
      ...mainSessionLandings(4, { criticality: 'low' }),
    ].map((r, i) => ({ ...r, point: 200 + i }))
    const decision = globalFactorDecision(axesFrom(rows))
    expect(decision.adopted).toBe(true)
    expect(decision.reason).toMatch(/adopted — criticality, picture compared/)
    expect(decision.undecidable).toEqual(['lane not decidable — main-session can carry no measured span'])
  })

  it('REFUSES it while a measurable class is merely thin', () => {
    // The same rows, except the main-session landings DO carry spans — so the
    // lane axis is not unknowable, only under-sampled, and more landings settle
    // it. Silence that can still be broken is not a residual.
    const rows = [
      ...classOf(6, 0.3, { criticality: 'medium', picture: false, delegated: true }),
      ...classOf(6, 0.32, { criticality: 'high', picture: true, delegated: true }),
      ...classOf(2, 0.31, { criticality: 'low', picture: false, delegated: false }),
    ].map((r, i) => ({ ...r, point: 200 + i }))
    const decision = globalFactorDecision(axesFrom(rows))
    expect(decision.adopted).toBe(false)
    expect(decision.reason).toMatch(/lane has 1 comparable class\(es\), too few to compare/)
  })

  it('REFUSES it when the classes differ, and names the axis that refused', () => {
    const rows = [
      ...classOf(6, 0.25, { criticality: 'medium', picture: false, delegated: true }),
      ...classOf(6, 0.25, { criticality: 'high', picture: false, delegated: true }),
      // The picture class takes four times as long as its estimate promised.
      ...classOf(6, 1.2, { criticality: 'low', picture: true, delegated: true }),
    ].map((r, i) => ({ ...r, point: 300 + i }))
    const decision = globalFactorDecision(axesFrom(rows))
    expect(decision.adopted).toBe(false)
    expect(decision.reason).toMatch(/picture classes differ by/)
    expect(decision.factor).toBeNull()
  })

  it('REFUSES it when an axis is too thin to have been compared at all', () => {
    // Every landing looks the same, so nothing DIFFERS — but the picture axis has
    // one class only, which shows nothing either way. Silence is not agreement.
    const rows = classOf(8, 0.3).map((r, i) => ({ ...r, point: 400 + i }))
    const decision = globalFactorDecision(axesFrom(rows))
    expect(decision.adopted).toBe(false)
    expect(decision.reason).toMatch(/too few to compare/)
  })

  it('measures the spread only across classes that have comparables', () => {
    const summaries = [
      { name: 'a', comparable: true, points: 5, ratio: { median: 0.3 } },
      { name: 'b', comparable: true, points: 5, ratio: { median: 0.6 } },
      { name: 'c', comparable: false, points: 1, ratio: { median: 99 } },
    ]
    expect(axisSpread(summaries)).toEqual({ classes: 2, spread: 2, structural: [], pending: 1 })
    expect(axisSpread([summaries[0]])).toEqual({ classes: 1, spread: null, structural: [], pending: 0 })
    // A structural class is named, and does NOT count as one that could grow.
    expect(axisSpread([summaries[0], { name: 'main-session', comparable: false, structural: true, points: 3, ratio: {} }])).toEqual({
      classes: 1,
      spread: null,
      structural: ['main-session'],
      pending: 0,
    })
  })
})

describe('the rewrite plan', () => {
  /** Landings that make medium and high comparable and separate them. */
  const rows = [
    ...classOf(6, 0.25, { criticality: 'medium', picture: false, delegated: true }),
    ...classOf(6, 1.2, { criticality: 'high', picture: true, delegated: true, elapsedHours: 2.4 }),
  ].map((r, i) => ({ ...r, point: 500 + i }))
  const reading = calibrationReading(rows, { cadenceHours: [1, 2, 3] })

  it('reports the cadence apart from the elapsed times', () => {
    expect(reading.cadence).toMatchObject({ n: 3, median: 2 })
    expect(reading.overall.elapsed.n).toBe(12)
    // The two never meet in one figure.
    expect(reading.cadence.median).not.toBe(reading.overall.elapsed.median)
  })

  it('scales a card by its own class factor and keeps the note', () => {
    const plan = rewritePlan(reading, {
      cards: { 10: { estimate: '~4 h · Feature' }, 11: { estimate: '~4 h' } },
      open: [10, 11],
      criticality: new Map([[10, 'medium'], [11, 'high']]),
    })
    expect(plan[0]).toMatchObject({ point: 10, to: '~1 h · Feature', changed: true, basis: 'criticality:medium' })
    expect(plan[1]).toMatchObject({ point: 11, to: '~5 h', changed: true, basis: 'criticality:high' })
  })

  it('KEEPS a card whose class has no landed comparable, and names the reason', () => {
    const plan = rewritePlan(reading, {
      cards: { 12: { estimate: '~6 h' } },
      open: [12],
      criticality: new Map([[12, 'maximum']]),
    })
    expect(plan[0]).toMatchObject({ point: 12, from: '~6 h', to: '~6 h', changed: false })
    expect(plan[0].reason).toMatch(/class "maximum" has no landed comparable/)
    expect(plan[0].reason).toMatch(String(MIN_CLASS_SAMPLES))
  })

  it('leaves an unestimated card alone rather than inventing a first estimate', () => {
    const plan = rewritePlan(reading, { cards: {}, open: [13], criticality: new Map([[13, 'medium']]) })
    expect(plan[0]).toMatchObject({ point: 13, to: null, changed: false })
    expect(plan[0].reason).toMatch(/no stored estimate/)
  })

  it('says so when a factor leaves a card where it already is', () => {
    const plan = rewritePlan(reading, {
      cards: { 14: { estimate: '~0,5 h' } },
      open: [14],
      criticality: new Map([[14, 'medium']]),
    })
    expect(plan[0].changed).toBe(false)
    expect(plan[0].reason).toMatch(/leaves it where it is/)
  })

  it('uses the global factor for every card once one was adopted', () => {
    const flat = [
      ...classOf(6, 0.5, { criticality: 'high', picture: true, delegated: true }),
      ...classOf(6, 0.52, { criticality: 'low', picture: false, delegated: true }),
      ...mainSessionLandings(3),
    ].map((r, i) => ({ ...r, point: 600 + i }))
    const uniform = calibrationReading(flat)
    // ASSERTED, not conditional: a test that only checks the global factor when
    // one was adopted asserts nothing the day adoption breaks.
    expect(uniform.decision.adopted).toBe(true)
    expect(factorForCard(uniform, 'anything-at-all').basis).toBe('global')
    expect(factorForCard(uniform, 'anything-at-all').factor).toBe(uniform.overall.ratio.median)
    // The reading above REFUSES it, so the per-class fallback is what holds there.
    expect(reading.decision.adopted).toBe(false)
    expect(factorForCard(reading, 'maximum').factor).toBeNull()
    expect(factorForCard(reading, 'medium').basis).toBe('criticality:medium')
  })
})

describe('the baseline ledger', () => {
  const rows = classOf(6, 0.25, { criticality: 'medium', picture: false, delegated: true }).map((r, i) => ({ ...r, point: 500 + i }))
  const reading = calibrationReading(rows)
  const open = [10]
  const criticality = new Map([[10, 'medium']])

  it('APPLIES TWICE WITHOUT CORRECTING TWICE', () => {
    const cards = { 10: { estimate: '~4 h · Feature' } }
    let ledger = updateEstimateLedger({}, { cards, open, now: 1 })
    const first = rewritePlan(reading, { cards, open, criticality, ledger })
    expect(first[0]).toMatchObject({ from: '~4 h · Feature', to: '~1 h · Feature', changed: true })

    // …the apply: the card takes the new value, the ledger keeps the old one.
    const applied = { 10: { estimate: first[0].to } }
    ledger = updateEstimateLedger(ledgerAfterApply(ledger, first, { now: 2 }), { cards: applied, open, now: 3 })
    const second = rewritePlan(reading, { cards: applied, open, criticality, ledger })
    expect(second[0]).toMatchObject({ from: '~1 h · Feature', to: '~1 h · Feature', changed: false })
    expect(second[0].reason).toMatch(/already carries this correction/)

    // …and a third run is the same again, so the loop cannot creep downwards.
    const third = rewritePlan(reading, { cards: applied, open, criticality, ledger })
    expect(third[0].changed).toBe(false)
  })

  it('re-corrects from the baseline when the reading moves, never from the corrected value', () => {
    const slower = calibrationReading(
      classOf(6, 0.5, { criticality: 'medium', picture: false, delegated: true }).map((r, i) => ({ ...r, point: 500 + i })),
    )
    const ledger = { 10: { baseline: '~4 h', applied: { estimate: '~1 h', factor: 0.25 } } }
    const plan = rewritePlan(slower, { cards: { 10: { estimate: '~1 h' } }, open, criticality, ledger })
    // 4 h × 0.5, NOT 1 h × 0.5 — the corrections never stack.
    expect(plan[0]).toMatchObject({ to: '~2 h', changed: true })
  })

  it('takes a hand-written estimate as a new baseline and freezes a landed one', () => {
    const before = { 10: { baseline: '~4 h', applied: { estimate: '~1 h', factor: 0.25 } } }
    // The user rewrote the card: that number is a fresh promise, not a correction.
    const edited = updateEstimateLedger(before, { cards: { 10: { estimate: '~3 h' } }, open, now: 9 })
    expect(edited[10]).toEqual({ baseline: '~3 h', baselineAt: 9 })
    // A point that has LANDED is no longer open, so nothing can rewrite what it
    // promised — that is the whole provenance the ratio is measured against.
    const landed = updateEstimateLedger(before, { cards: { 10: { estimate: '~3 h' } }, open: [], now: 9 })
    expect(landed[10]).toEqual(before[10])
  })

  it('names where a landing\'s estimate came from', () => {
    expect(estimateForLanding({ 10: { baseline: '~4 h' } }, 10, '~1 h')).toEqual({ estimate: '~4 h', source: 'snapshot' })
    expect(estimateForLanding({}, 10, '~1 h')).toEqual({ estimate: '~1 h', source: 'current' })
    expect(estimateForLanding({}, 10, null)).toEqual({ estimate: null, source: null })
  })
})

describe('what a newly filed card inherits', () => {
  const rows = [
    ...classOf(6, 0.25, { criticality: 'medium', elapsedHours: 0.9 }),
    ...classOf(2, 0.25, { criticality: 'low', elapsedHours: 0.4 }),
  ].map((r, i) => ({ ...r, point: 700 + i }))
  const reading = calibrationReading(rows)

  it('offers the measured median of a class that has comparables', () => {
    const defaults = inheritanceDefaults(reading)
    expect(defaults.medium).toBe(1)
    // `low` had two landings — too few, so it offers nothing at all.
    expect(defaults.low).toBeUndefined()
    expect(inheritedEstimateForClass('medium', defaults)).toBe('~1 h · Klassenmedian')
    expect(inheritedEstimateForClass('low', defaults)).toBeNull()
  })

  it('falls back to nothing when the point\'s class was never measured', () => {
    const defaults = inheritanceDefaults(reading)
    expect(inheritedEstimate(5, { defaults, criticality: new Map([[5, 'medium']]) })).toBe('~1 h · Klassenmedian')
    // No tag, and the untagged class was not measured here — the board's own
    // "no estimate yet" marker stays, which is exactly the intended fallback.
    expect(inheritedEstimate(6, { defaults, criticality: new Map() })).toBeNull()
  })
})
