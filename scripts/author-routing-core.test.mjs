// Pins the authoring-lane decision (point 667).
//
// Every case is a shape the real work order actually holds — the routing was
// measured against all 170 open points before these were written, and the one
// finding that measurement produced (the process phrase, below) is here as a
// regression case rather than as a remembered exception.
import { describe, expect, it } from 'vitest'
import {
  AUTHORING_FRAMINGS,
  authorRoundHistory,
  authorLaneFor,
  FABLE_ESCALATION_ROUNDS,
  formatAuthorRoundHistory,
  formatLaneReport,
  HARD_MARKERS,
  LANE_MODEL,
  LANES,
  laneTagIn,
  nextAuthoringStep,
  SPEC_EXAMINATION_ROUND,
  specExaminerFor,
  unsuccessfulReviewRounds,
  VERIFICATION_MARKERS,
} from './author-routing-core.mjs'

const lane = (body, extra = {}) => authorLaneFor({ body, ...extra }).lane

describe('authorLaneFor — which lane authors a point', () => {
  it('sends the mechanical and mid-difficulty work to Sol, which is the point', () => {
    expect(lane('THE DEPLOY DIES ON A FROZEN TAG’S FLAKY DOWNLOAD. Retry the fetch three times.')).toBe('sol')
    expect(lane('The board card says "stand" for a point nobody is working on. Say what it is.')).toBe('sol')
    // No signal at all is the mechanical case, not a reason to hold the work back.
    expect(lane('')).toBe('sol')
    expect(authorLaneFor()).toMatchObject({ lane: 'sol', model: 'GPT-5.6 Sol' })
  })

  it('sends the hard cases straight to Sol, in CLAUDE.md §6’s own words (user 18.08.2026)', () => {
    for (const body of [
      'This is difficult: the lock is taken twice.',
      'A complex rebuild of the launcher.',
      'The step is error-prone and has failed twice.',
      'There is a race condition between the tick and the claim.',
      'The concurrency of two owners is the whole problem.',
      'A deadlock between the hook and the gate.',
      'A migration of every recorded review row.',
    ]) {
      expect(lane(body), body).toBe('sol')
    }
    expect(authorLaneFor({ body: 'A complex rebuild.' }).why[0]).toMatch(/hard case \(complex\)/)
    // Neither of the two lanes this used to take: not Fable from the start (its
    // weekly pool is the scarcest, 17.08.) and no longer held back for Opus.
    expect(authorLaneFor({ body: 'A complex rebuild.' }).why[0]).toMatch(/straight to Sol/)
    // AND IT OUTRANKS THE VERIFICATION LANE (user 18.08.2026, asked explicitly):
    // a hard picture point is authored by Sol too — the main session judges the
    // picture whoever wrote the code, so only the authoring moves.
    expect(lane('A complex screenshot problem on both backends.')).toBe('sol')
  })

  it('treats a HIGH-criticality tag as a hard case by definition', () => {
    expect(lane('Anything at all.', { criticality: 'high' })).toBe('sol')
    expect(lane('The screenshot must hold.', { criticality: 'high' })).toBe('sol')
    // …and med/low/none leave the decision to the text.
    expect(lane('Anything at all.', { criticality: 'med' })).toBe('sol')
    expect(lane('Anything at all.', { criticality: 'low' })).toBe('sol')
    expect(lane('Anything at all.', { criticality: null })).toBe('sol')
  })

  it('keeps a point whose VERIFICATION is the work with the main session', () => {
    for (const body of [
      'The screenshot must show the chief’s hut.',
      'The picture is wrong: the river shows steps.',
      'It must hold on both backends.',
      'The WebGPU path never reaches the shader.',
      'Run the browser suite for the place scene.',
      'The aesthetic verdict is the user’s.',
    ]) {
      expect(lane(body), body).toBe('opus')
    }
  })

  it('does NOT read the workflow’s own phrase as picture work (measured 13.08.2026)', () => {
    // The finding from routing all 170 open points: CLAUDE.md §6 says Claude
    // "runs the suites, judges the picture and lands", so every point that merely
    // MENTIONS the workflow routed itself away from the Sol lane — point 667,
    // which builds this file, first among them.
    const body =
      'Where Sol authors, Claude reviews, runs the suites, judges the picture and lands. ' +
      'The commit trailer names Sol and the guard learns the reversed direction.'
    expect(lane(body)).toBe('sol')
    expect(lane('The picture judgment stays with the main session.')).toBe('sol')
    // A point whose SUBJECT really is the picture still says so in its own words.
    expect(lane('Claude judges the picture. The picture shows a black horizon on WebGL.')).toBe('opus')
  })

  it('keeps every pre-boundary rework in the lane its other signals demand', () => {
    for (let reworkRounds = 0; reworkRounds < FABLE_ESCALATION_ROUNDS; reworkRounds += 1) {
      expect(lane('Something mechanical.', { reworkRounds }), `ordinary round ${reworkRounds}`).toBe('sol')
      expect(
        lane('A complex screenshot problem.', { criticality: 'high', reworkRounds }),
        `hard/HIGH round ${reworkRounds}`,
      ).toBe('sol')
      expect(lane('A screenshot point.', { reworkRounds }), `verification round ${reworkRounds}`).toBe('opus')
    }
  })

  it('escalates at the exported boundary, above ordinary lane tags but below operator decisions', () => {
    const reworkRounds = FABLE_ESCALATION_ROUNDS
    expect(lane('Something mechanical.', { reworkRounds })).toBe('fable')
    expect(lane('A complex screenshot problem.', { criticality: 'high', reworkRounds })).toBe('fable')
    expect(lane('Something mechanical.\nAuthor lane: sol', { reworkRounds })).toBe('fable')
    expect(lane('A picture point.\nAuthor lane: opus', { reworkRounds })).toBe('fable')
    expect(lane('x', { reworkRounds, override: 'sol' })).toBe('sol')
    expect(lane('x\nAuthor lane: fable', { reworkRounds: 0 })).toBe('fable')
    expect(authorLaneFor({ body: 'x', reworkRounds }).why[0]).toBe(
      `${FABLE_ESCALATION_ROUNDS} unsuccessful review rounds reached the §6 escalation threshold of ${FABLE_ESCALATION_ROUNDS}`,
    )
  })

  it('lets a point name its own lane, and a caller override even that', () => {
    expect(lane('A complex rebuild.\nAuthor lane: sol')).toBe('sol')
    expect(lane('Something mechanical.\nAuthor lane: fable')).toBe('fable')
    expect(lane('Something mechanical.\nAuthor lane: opus')).toBe('opus')
    expect(lane('A complex rebuild.\nAuthor lane: sol', { override: 'opus' })).toBe('opus')
    // An override that is not a lane is no override at all.
    expect(lane('Something mechanical.', { override: 'haiku' })).toBe('sol')
    expect(authorLaneFor({ body: 'x', override: 'FABLE' }).lane).toBe('fable')
  })

  it('reads a tag only as a LINE of its own, never inside a sentence', () => {
    // Checking the character before the tag was not enough (cross-vendor review,
    // P1): a quoted sentence mid-line stayed operative, so any document that
    // DESCRIBES the convention would route the points quoting it.
    expect(laneTagIn('the tag is written `Author lane: sol` in the spec')).toBe('')
    expect(laneTagIn('"use Author lane: sol for this example"')).toBe('')
    expect(laneTagIn('A complex rebuild. Author lane: sol')).toBe('')
    expect(laneTagIn('`Author lane: fable`')).toBe('')
    // …and the real thing, however it is bulleted or quoted as markdown.
    expect(laneTagIn('Author lane: fable')).toBe('fable')
    expect(laneTagIn('  - Author lane: opus')).toBe('opus')
    expect(laneTagIn('> Author lane: sol')).toBe('sol')
    // The LAST tag wins: a spec revises itself at the end.
    expect(laneTagIn('Author lane: sol\n… revised.\nAuthor lane: opus')).toBe('opus')
    // Nor is a tag with prose after it a tag (third cross-vendor round): the
    // anchor had no end, so `Author lane: sol is the example spelling` routed.
    expect(laneTagIn('Author lane: sol is the example spelling')).toBe('')
    expect(laneTagIn('Author lane: sol.')).toBe('sol')
    // …and a FENCED example is an example, which is where a document shows one.
    expect(laneTagIn('The tag looks like this:\n```\nAuthor lane: sol\n```\n')).toBe('')
    expect(laneTagIn('~~~\nAuthor lane: fable\n~~~\nAuthor lane: opus')).toBe('opus')
    // The fence remembers WHICH delimiter opened it (fourth round): a `~~~` in a
    // backtick block used to close it and make the next line an operative tag.
    expect(laneTagIn('```\nsome sample text\n~~~\nAuthor lane: sol\n```\n')).toBe('')
    // …and a longer opener is not closed by a shorter marker.
    expect(laneTagIn('````\n```\nAuthor lane: fable\n````\n')).toBe('')
    // A closer carries no info string and is barely indented (fifth round):
    // `~~~javascript` inside a block is content, not the end of it.
    expect(laneTagIn('~~~\n~~~javascript\nAuthor lane: sol\n~~~\n')).toBe('')
    expect(laneTagIn('```\n     ```\nAuthor lane: opus\n```\n')).toBe('')
    // …and the same indent rule binds the OPENER (sixth round): four spaces are
    // an indented code block, and reading one as a fence swallowed every line
    // after it — suppressing a REAL tag instead of an example.
    expect(laneTagIn('    ```\nAuthor lane: sol')).toBe('sol')
    expect(laneTagIn('   ```\nAuthor lane: sol\n   ```')).toBe('')
    // …and a TAB is four columns, not zero (seventh round).
    expect(laneTagIn('\t```\nAuthor lane: sol')).toBe('sol')
    expect(laneTagIn(' \t```\nAuthor lane: opus')).toBe('opus')
    // A blockquote's markers are not indentation (eighth round): an ordinary
    // quoted example looked over-indented, and its tag became operative.
    expect(laneTagIn('   > ```\n   > Author lane: sol\n   > ```')).toBe('')
    expect(laneTagIn('> ```\n> Author lane: fable\n> ```')).toBe('')
  })

  it('names the subjects its own comments promise (cross-vendor P1)', () => {
    // The list claimed locks and state migration and held only the noun. They
    // are hard subjects, so since 18.08.2026 they answer `sol` — the marker
    // still fires, only the lane it feeds changed.
    expect(lane('The batch lock is taken twice.')).toBe('sol')
    expect(lane('Migrating every recorded review row.')).toBe('sol')
    // …and "visually inspect" is how half the render points are written, which
    // is the verification lane and stays with the main session.
    expect(lane('Visually inspect the horizon banding.')).toBe('opus')
  })

  it('reports every signal it saw, not only the deciding one', () => {
    const d = authorLaneFor({ body: 'A complex screenshot problem.', criticality: 'med' })
    expect(d.signals).toMatchObject({ criticality: 'med', reworkRounds: 0 })
    expect(d.signals.hard).toEqual(['complex'])
    expect(d.signals.verification).toEqual(['screenshot'])
    // The two signals now answer DIFFERENTLY, and the order decides: hard wins,
    // so this point is Sol's while the verification signal is still reported.
    expect(d.lane).toBe('sol')
  })

  it('answers for every lane and cannot be handed something it throws on', () => {
    for (const l of LANES) expect(LANE_MODEL[l]).toBeTruthy()
    for (const body of [null, undefined, 42, {}, []]) {
      expect(LANES).toContain(authorLaneFor({ body }).lane)
    }
    expect(HARD_MARKERS.length).toBeGreaterThan(0)
    expect(VERIFICATION_MARKERS.length).toBeGreaterThan(0)
  })
})

describe('unsuccessfulReviewRounds — completed ledger evidence only', () => {
  it('returns zero without records and counts only non-passing reviews for this point', () => {
    expect(unsuccessfulReviewRounds([], 726)).toBe(0)
    expect(
      unsuccessfulReviewRounds(
        [
          { point: 726, mode: 'review', verdict: 'merge' },
          { point: 726, mode: 'review', verdict: 'merge-with-fixes' },
          { point: 726, mode: 'review', verdict: 'do-not-merge' },
          { point: 725, mode: 'review', verdict: 'do-not-merge' },
          { point: 726, mode: 'blind-parallel', verdict: 'do-not-merge' },
        ],
        726,
      ),
    ).toBe(2)
  })

  it('does not turn aborted or short material into an unsuccessful round', () => {
    expect(
      unsuccessfulReviewRounds(
        [
          { point: 726, mode: 'review', verdict: 'do-not-merge', aborted: true },
          { point: 726, mode: 'review', verdict: 'do-not-merge', shortfall: { missing: ['x'] } },
          { point: 726, mode: 'review', verdict: 'do-not-merge', completed: false },
          { point: 726, mode: 'review', kind: 'shortfall' },
        ],
        726,
      ),
    ).toBe(0)
  })
})

describe('re-authoring rounds — decorrelated before Fable', () => {
  const failed = (extra = {}) => ({
    point: 727,
    mode: 'review',
    verdict: 'do-not-merge',
    evidence: 'the reviewer found a concrete remaining defect',
    ...extra,
  })

  it('commissions a point with no record as round zero, and round one without a framing', () => {
    const initial = nextAuthoringStep({ records: [], point: 727 })
    expect(initial).toMatchObject({ kind: 'commission', round: 0, framing: '' })

    const first = nextAuthoringStep({ records: [failed()], point: 727 })
    expect(first).toMatchObject({ kind: 'commission', round: 1, framing: '' })
  })

  it('decorrelates every ordinary round after the first from the one before it', () => {
    const records = [failed(), failed()]
    let preceding = ''
    for (let round = 2; round <= FABLE_ESCALATION_ROUNDS - 2; round += 1) {
      const step = nextAuthoringStep({ records, point: 727 })
      expect(step).toMatchObject({ kind: 'commission', round })
      expect(AUTHORING_FRAMINGS).toContain(step.framing)
      expect(step.framing).not.toBe(preceding)
      records.push(failed({ authorFraming: step.framing }))
      preceding = step.framing
    }
  })

  it('reports an unframed or repeated later record as a repeat, not a fresh attempt', () => {
    const firstFraming = AUTHORING_FRAMINGS[0]
    const history = authorRoundHistory(
      [
        failed(),
        failed(),
        failed({ authorFraming: firstFraming }),
        failed({ authorFraming: firstFraming }),
      ],
      727,
    )
    expect(history.unsuccessfulRounds).toBe(4)
    expect(history.freshRounds).toBe(3)
    expect(history.rounds.map((round) => round.repeat)).toEqual([
      '',
      '',
      '',
      'the author framing repeats the preceding fresh round',
    ])
  })

  it('counts only the known hostile-tester framings as fresh later attempts', () => {
    const history = authorRoundHistory(
      [failed(), failed(), failed({ authorFraming: 'Take another ordinary look at the same implementation.' })],
      727,
    )
    expect(history.freshRounds).toBe(2)
    expect(history.rounds.at(-1).repeat).toMatch(/no recognized hostile-tester framing/)
  })

  it('returns the examination step immediately before the threshold, once only', () => {
    const records = [failed()]
    let framing = ''
    while (authorRoundHistory(records, 727).freshRounds < SPEC_EXAMINATION_ROUND) {
      const step = nextAuthoringStep({ records, point: 727 })
      framing = step.framing
      records.push(failed({ ...(framing ? { authorFraming: framing } : {}) }))
    }
    const examination = nextAuthoringStep({ records, point: 727 })
    expect(examination).toMatchObject({ kind: 'spec-examination', round: SPEC_EXAMINATION_ROUND })
    expect(examination.reason).toContain(`threshold of ${FABLE_ESCALATION_ROUNDS}`)

    records.push({
      point: 727,
      mode: 'review',
      verdict: 'merge',
      specExamination: 'sound',
      evidence: 'the point and its generated brief are consistent with all findings',
    })
    const after = nextAuthoringStep({ records, point: 727 })
    expect(after).toMatchObject({ kind: 'commission', round: SPEC_EXAMINATION_ROUND })
    expect(after.framing).not.toBe(framing)
  })

  it('moves every boundary when the one escalation constant moves', () => {
    const alternateThreshold = FABLE_ESCALATION_ROUNDS + 3
    const records = [failed()]
    while (authorRoundHistory(records, 727).freshRounds < alternateThreshold - 1) {
      const step = nextAuthoringStep({ records, point: 727, escalationRounds: alternateThreshold })
      expect(step.kind).toBe('commission')
      records.push(failed({ ...(step.framing ? { authorFraming: step.framing } : {}) }))
    }
    expect(nextAuthoringStep({ records, point: 727, escalationRounds: alternateThreshold })).toMatchObject({
      kind: 'spec-examination',
      round: alternateThreshold - 1,
    })
  })

  it('applies a numeric history override to the step boundary without inventing records', () => {
    expect(
      nextAuthoringStep({ records: [], point: 727, reworkRounds: FABLE_ESCALATION_ROUNDS - 1 }),
    ).toMatchObject({ kind: 'spec-examination', round: FABLE_ESCALATION_ROUNDS - 1 })
  })

  it('renders the count, every framing or repeat, and the examination as one reading', () => {
    const history = authorRoundHistory(
      [
        failed(),
        failed(),
        failed({ authorFraming: AUTHORING_FRAMINGS[0] }),
        failed(),
        {
          point: 727,
          mode: 'review',
          verdict: 'merge',
          specExamination: 'sound',
          evidence: 'the difficulty is real',
        },
      ],
      727,
    )
    const report = formatAuthorRoundHistory(history)
    expect(report).toContain('4 unsuccessful round(s); 3 fresh attempt(s)')
    expect(report).toContain(`round 2: framing — ${AUTHORING_FRAMINGS[0]}`)
    expect(report).toContain('ledger review 4: REPEAT — no author framing was recorded')
    expect(report).toContain('spec examination: sound — the difficulty is real')
  })

  it('routes the examination to the vendor that did not author the rounds, never Fable', () => {
    expect(specExaminerFor({ rounds: [{ authoredBy: 'GPT-5.6 Sol <noreply@openai.com>' }] })).toMatchObject({
      vendor: 'claude',
      model: 'Opus 5',
      route: 'claude-read',
    })
    expect(specExaminerFor({ rounds: [{ authoredBy: 'Claude Opus 5 <noreply@anthropic.com>' }] })).toMatchObject({
      vendor: 'sol',
      model: 'GPT-5.6 Sol',
      route: 'ask-sol',
    })
  })

  it('does not accept a malformed, aborted or same-vendor examination as the one reading', () => {
    const solRound = failed({ authoredBy: 'GPT-5.6 Sol <noreply@openai.com>' })
    const examination = (extra = {}) => ({
      point: 727,
      mode: 'review',
      verdict: 'merge',
      model: 'Opus 5',
      specExamination: 'sound',
      evidence: 'the point and brief agree with every finding',
      ...extra,
    })
    expect(authorRoundHistory([solRound, examination({ aborted: true })], 727).examination).toBeNull()
    expect(authorRoundHistory([solRound, examination({ model: 'GPT-5.6 Sol' })], 727).examination).toBeNull()
    expect(authorRoundHistory([solRound, examination()], 727).examination).toMatchObject({ specExamination: 'sound' })
  })
})

describe('formatLaneReport', () => {
  it('answers the question first: how much actually moves', () => {
    const rows = [
      { number: 1, lane: 'sol', why: ['mechanical'] },
      { number: 2, lane: 'sol', why: ['mechanical'] },
      { number: 3, lane: 'opus', why: ['picture'] },
    ]
    const text = formatLaneReport(rows)
    expect(text.split('\n')[0]).toBe('author-routing: 3 open point(s) — sol 2 · fable 0 · opus 1')
    expect(text).toMatch(/ {4}1 {2}sol {4}mechanical/)
    expect(formatLaneReport()).toContain('0 open point(s)')
  })
})
