// Pins the authoring-lane decision (point 667).
//
// Every case is a shape the real work order actually holds — the routing was
// measured against all 170 open points before these were written, and the one
// finding that measurement produced (the process phrase, below) is here as a
// regression case rather than as a remembered exception.
import { describe, expect, it } from 'vitest'
import {
  authorLaneFor,
  formatLaneReport,
  HARD_MARKERS,
  LANE_MODEL,
  LANES,
  laneTagIn,
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

  it('keeps the hard cases with Fable, in CLAUDE.md §6’s own words', () => {
    for (const body of [
      'This is difficult: the lock is taken twice.',
      'A complex rebuild of the launcher.',
      'The step is error-prone and has failed twice.',
      'There is a race condition between the tick and the claim.',
      'The concurrency of two owners is the whole problem.',
      'A deadlock between the hook and the gate.',
      'A migration of every recorded review row.',
    ]) {
      expect(lane(body), body).toBe('fable')
    }
    expect(authorLaneFor({ body: 'A complex rebuild.' }).why[0]).toMatch(/hard case \(complex\)/)
  })

  it('treats a HIGH-criticality tag as a hard case by definition', () => {
    expect(lane('Anything at all.', { criticality: 'high' })).toBe('fable')
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

  it('moves work that came back from Sol with findings to Fable, above every other signal', () => {
    expect(lane('A screenshot point.', { reworked: true })).toBe('fable')
    expect(lane('Something mechanical.', { reworked: true })).toBe('fable')
    expect(authorLaneFor({ body: 'x', reworked: true }).why[0]).toMatch(/after a re-work/)
    // ABOVE THE TAG TOO (cross-vendor review of point 667, P1): the order used to
    // return the tag first, so `Author lane: sol` plus a failed re-work stayed
    // with Sol while the comment claimed rework outranked everything.
    expect(lane('Something mechanical.\nAuthor lane: sol', { reworked: true })).toBe('fable')
    expect(lane('A picture point.\nAuthor lane: opus', { reworked: true })).toBe('fable')
    // The caller's explicit override is the ONE thing above it: a human saying
    // "this one, in that lane" is not a signal to be outvoted.
    expect(lane('x', { reworked: true, override: 'sol' })).toBe('sol')
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
  })

  it('names the subjects its own comments promise (cross-vendor P1)', () => {
    // The list claimed locks and state migration and held only the noun.
    expect(lane('The batch lock is taken twice.')).toBe('fable')
    expect(lane('Migrating every recorded review row.')).toBe('fable')
    // …and "visually inspect" is how half the render points are written.
    expect(lane('Visually inspect the horizon banding.')).toBe('opus')
  })

  it('reports every signal it saw, not only the deciding one', () => {
    const d = authorLaneFor({ body: 'A complex screenshot problem.', criticality: 'med' })
    expect(d.signals).toMatchObject({ criticality: 'med', reworked: false })
    expect(d.signals.hard).toEqual(['complex'])
    expect(d.signals.verification).toEqual(['screenshot'])
    // Hard beats verification: the hard-case lane authors it, and the main
    // session judges the picture for every point regardless.
    expect(d.lane).toBe('fable')
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
