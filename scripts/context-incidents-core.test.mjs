// THE OVERSHOOT SERIES' DECISION HALF (point 742).
//
// The boundary measured 311,039 tokens against the 150,000 ceiling on
// 19.08.2026, printed the distance and forgot it, so the question "does this
// still happen now that the fence is armed?" had no answer at all. These cases
// pin what a record must hold for that question to be answerable later:
//   - an overshoot INSIDE the stated margin is no incident (the boundary's own
//     note stays silent there too — one condition, not two);
//   - one BEYOND it is;
//   - the largest growth step is reported WHEREVER IT BEGAN. That is Sol's audit
//     finding: a call that starts below the mark and whose response crosses it
//     appears in no "calls past the mark" list, and reads the fence deliberately
//     allows are a normal way for context to grow;
//   - the growth is attributed per KIND of call with its input size, since point
//     745 needs a cost per kind and a per-turn average cannot yield one.
import { describe, it, expect } from 'vitest'
import {
  CALL_KINDS,
  INCIDENT_KINDS,
  MAX_KIND_SAMPLES,
  TOP_STEPS,
  buildIncident,
  byKindSummary,
  callInputChars,
  callKind,
  dominantKind,
  extractCalls,
  filterSeries,
  formatSeriesReport,
  growthSteps,
  maxGrowthStep,
  parseIncidents,
  quantileOf,
  shellKind,
  shouldRecordIncident,
  startupReading,
  strideSample,
  summarizeSeries,
  usableIncident,
} from './context-incidents-core.mjs'

const CEILING = 150_000
const MARGIN = 25_000
const TRIGGER = 82_000

/** One transcript line, the shape the harness writes. */
const line = ({ id, at, tokens, tools = [], sidechain = false, text = false }) =>
  JSON.stringify({
    type: 'assistant',
    requestId: id,
    isSidechain: sidechain,
    timestamp: at,
    message: {
      usage: { input_tokens: 5, cache_read_input_tokens: tokens - 5 },
      content: [
        ...(text ? [{ type: 'text', text: 'x' }] : []),
        ...tools.map((t) => ({ type: 'tool_use', name: t.name, input: t.input })),
      ],
    },
  })

describe('callKind / shellKind — the growth is charged to a KIND, read off the call', () => {
  it('names the expensive kinds', () => {
    expect(callKind({ name: 'Agent', input: { prompt: 'go' } })).toBe(CALL_KINDS.AGENT)
    expect(callKind({ name: 'Task', input: {} })).toBe(CALL_KINDS.AGENT)
    expect(callKind({ name: 'Read', input: { file_path: 'a' } })).toBe(CALL_KINDS.READ)
    expect(callKind({ name: 'Grep', input: { pattern: 'x' } })).toBe(CALL_KINDS.SEARCH)
    expect(callKind({ name: 'Edit', input: {} })).toBe(CALL_KINDS.WRITE)
    expect(callKind({ name: 'WebFetch', input: {} })).toBe(CALL_KINDS.WEB)
    expect(callKind({ name: '', input: null })).toBe(CALL_KINDS.TURN)
    expect(callKind({ name: 'SomeMcpTool', input: {} })).toBe(CALL_KINDS.OTHER)
  })

  it('reads a shell line by the segments it really runs', () => {
    expect(shellKind('npm test')).toBe(CALL_KINDS.BROWSER_SUITE)
    expect(shellKind('npm run test:large')).toBe(CALL_KINDS.BROWSER_SUITE)
    expect(shellKind('node scripts/verify/world.mjs')).toBe(CALL_KINDS.BROWSER_SUITE)
    expect(shellKind('node scripts/verify/run-all.mjs --tier small')).toBe(CALL_KINDS.BROWSER_SUITE)
    expect(shellKind('npm run test:unit')).toBe(CALL_KINDS.FAST_GATE)
    expect(shellKind('npm run build && npm run lint')).toBe(CALL_KINDS.FAST_GATE)
    expect(shellKind('cat material | node scripts/ask-sol.mjs --kind diagnose')).toBe(CALL_KINDS.DELEGATED_ASK)
    expect(shellKind('git status --short')).toBe(CALL_KINDS.BASH)
    expect(shellKind('')).toBe(CALL_KINDS.BASH)
  })

  it('a line that only MENTIONS a suite is not a suite run', () => {
    // The same mistake the context fence had to fix: `rg "npm test" docs` is a
    // read, and classifying it as a browser run would put a 200-token grep into
    // the distribution the suite cost is read from.
    expect(shellKind('rg "npm test" docs')).toBe(CALL_KINDS.BASH)
    expect(shellKind('grep -n "scripts/verify/world.mjs" scripts/verify/tiers.mjs')).toBe(CALL_KINDS.BASH)
  })

  it('sees through a wrapper, so a suite cannot hide behind bash -c', () => {
    expect(shellKind('bash -c "npm run test:small"')).toBe(CALL_KINDS.BROWSER_SUITE)
  })

  it('charges a BUNDLED turn to its most expensive kind and names them all', () => {
    expect(dominantKind([CALL_KINDS.READ, CALL_KINDS.AGENT, CALL_KINDS.BASH])).toBe(CALL_KINDS.AGENT)
    expect(dominantKind([CALL_KINDS.WRITE, CALL_KINDS.BASH])).toBe(CALL_KINDS.WRITE)
    expect(dominantKind([])).toBe(CALL_KINDS.TURN)
  })
})

describe('callInputChars — the material handed in, not the envelope', () => {
  it('counts the strings a call carries, at any depth', () => {
    expect(callInputChars({ command: 'abcde' })).toBe(5)
    expect(callInputChars({ prompt: 'ab', extra: { note: 'cde' } })).toBe(5)
    expect(callInputChars({ items: ['ab', 'cd'] })).toBe(4)
    expect(callInputChars(null)).toBe(0)
  })
})

describe('extractCalls — one entry per API call, off the real transcript shape', () => {
  const text = [
    line({ id: 'r1', at: '2026-08-19T10:00:00.000Z', tokens: 20_000, tools: [{ name: 'Read', input: { file_path: 'a' } }] }),
    // The SAME call, streamed across a second line: one usage record, and both
    // lines' tool_use blocks belong to it.
    line({ id: 'r1', at: '2026-08-19T10:00:01.000Z', tokens: 20_000, tools: [{ name: 'Grep', input: { pattern: 'x' } }] }),
    'not json at all',
    line({ id: 'sub', at: '2026-08-19T10:00:30.000Z', tokens: 300_000, sidechain: true }),
    line({ id: 'r2', at: '2026-08-19T10:01:00.000Z', tokens: 61_000, tools: [{ name: 'Bash', input: { command: 'npm test' } }] }),
  ].join('\n')

  it('counts one call per request, skips sidechains and torn lines', () => {
    const calls = extractCalls(text)
    expect(calls.map((c) => c.id)).toEqual(['r1', 'r2'])
    expect(calls[0].tokens).toBe(20_000)
    expect(calls[0].tools.map((t) => t.kind)).toEqual([CALL_KINDS.READ, CALL_KINDS.SEARCH])
    expect(calls[1].tools[0].kind).toBe(CALL_KINDS.BROWSER_SUITE)
  })

  it('the startup cost is the FIRST complete usage event, never an estimate', () => {
    expect(startupReading(extractCalls(text))).toMatchObject({ tokens: 20_000 })
    // No usage record at all → null. Right after SessionStart there is none, and
    // a reading taken there would be silently absent rather than wrong.
    expect(startupReading(extractCalls('{"type":"user"}'))).toBeNull()
  })
})

describe('growthSteps — the step is charged to what the PREVIOUS call started', () => {
  const calls = [
    { id: 'a', at: 1, tokens: 30_000, tools: [{ name: 'Read', kind: CALL_KINDS.READ, chars: 40 }] },
    { id: 'b', at: 2, tokens: 78_000, tools: [{ name: 'Bash', kind: CALL_KINDS.BROWSER_SUITE, chars: 20 }] },
    { id: 'c', at: 3, tokens: 130_000, tools: [] },
  ]

  it('records where each step BEGAN, not only where it ended', () => {
    const steps = growthSteps(calls)
    expect(steps).toHaveLength(2)
    expect(steps[0]).toMatchObject({ fromTokens: 30_000, toTokens: 78_000, delta: 48_000, kind: CALL_KINDS.READ })
    expect(steps[1]).toMatchObject({ fromTokens: 78_000, delta: 52_000, kind: CALL_KINDS.BROWSER_SUITE })
    expect(maxGrowthStep(steps)).toMatchObject({ delta: 52_000 })
  })

  it('keeps a NEGATIVE step as measured — a compaction is real', () => {
    const steps = growthSteps([
      { tokens: 100_000, tools: [] },
      { tokens: 40_000, tools: [] },
    ])
    expect(steps[0].delta).toBe(-60_000)
  })

  it('a turn with no tool call is charged to no kind but still counted', () => {
    const steps = growthSteps([
      { tokens: 10_000, tools: [] },
      { tokens: 12_000, tools: [] },
    ])
    expect(steps[0]).toMatchObject({ kind: CALL_KINDS.TURN, kinds: [CALL_KINDS.TURN], inputChars: 0 })
  })
})

describe('quantileOf / strideSample — an UPPER quantile, not a mean', () => {
  it('interpolates and survives an empty list', () => {
    expect(quantileOf([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(quantileOf([10, 20], 0.9)).toBe(19)
    expect(quantileOf([], 0.9)).toBeNull()
  })

  it('caps samples by an even STRIDE, which keeps the shape', () => {
    const list = Array.from({ length: 1000 }, (_, i) => [i, i])
    const { samples, sampled } = strideSample(list, 10)
    expect(sampled).toBe(true)
    expect(samples).toHaveLength(10)
    expect(samples[0][0]).toBe(0)
    expect(samples[9][0]).toBeGreaterThan(800)
    expect(strideSample(list.slice(0, 5), 10)).toMatchObject({ sampled: false })
    expect(MAX_KIND_SAMPLES).toBeGreaterThan(100)
  })
})

describe('byKindSummary — a cost per KIND with its input size', () => {
  it('groups the steps and reports the upper quantile per kind', () => {
    const steps = [
      { delta: 40_000, kind: CALL_KINDS.BROWSER_SUITE, inputChars: 30 },
      { delta: 36_000, kind: CALL_KINDS.BROWSER_SUITE, inputChars: 20 },
      { delta: 900, kind: CALL_KINDS.BASH, inputChars: 12 },
      { delta: 1_100, kind: CALL_KINDS.BASH, inputChars: 40 },
    ]
    const summary = byKindSummary(steps, { quantile: 0.9 })
    expect(summary[0]).toMatchObject({ kind: CALL_KINDS.BROWSER_SUITE, calls: 2, max: 40_000 })
    expect(summary[0].p).toBeGreaterThan(summary[1].p)
    expect(summary[1]).toMatchObject({ kind: CALL_KINDS.BASH, maxInputChars: 40 })
    // The RAW samples ride along, so a series-level quantile can be recomputed
    // across incidents — an aggregate alone cannot be merged.
    expect(summary[0].samples).toEqual([
      [40_000, 30],
      [36_000, 20],
    ])
  })
})

describe('shouldRecordIncident — one condition, the same one the note prints', () => {
  it('INSIDE the stated margin: no record', () => {
    expect(shouldRecordIncident({ tokens: CEILING + MARGIN, ceiling: CEILING, margin: MARGIN })).toBe(false)
    expect(shouldRecordIncident({ tokens: 160_000, ceiling: CEILING, margin: MARGIN })).toBe(false)
  })

  it('BEYOND it: a record', () => {
    expect(shouldRecordIncident({ tokens: CEILING + MARGIN + 1, ceiling: CEILING, margin: MARGIN })).toBe(true)
    // The measured incident that started this point.
    expect(shouldRecordIncident({ tokens: 311_039, ceiling: CEILING, margin: MARGIN })).toBe(true)
  })

  it('NO reading: no record — an incident is a measurement', () => {
    expect(shouldRecordIncident({ tokens: null, ceiling: CEILING, margin: MARGIN })).toBe(false)
    expect(shouldRecordIncident({ tokens: 0, ceiling: CEILING, margin: MARGIN })).toBe(false)
  })
})

describe('buildIncident — what one record holds', () => {
  const calls = [
    { id: 'a', at: 10, tokens: 60_000, tools: [{ name: 'Agent', kind: CALL_KINDS.AGENT, chars: 4_000 }] },
    { id: 'b', at: 20, tokens: 140_000, tools: [{ name: 'Bash', kind: CALL_KINDS.BASH, chars: 30 }] },
    { id: 'c', at: 30, tokens: 180_000, tools: [] },
  ]
  const record = buildIncident({
    at: Date.parse('2026-08-19T22:00:00.000Z'),
    sessionId: 'sid-1',
    point: 742,
    cause: 'point',
    head: 'abc1234',
    tokens: 180_000,
    watermark: CEILING,
    margin: MARGIN,
    trigger: TRIGGER,
    calls,
  })

  it('carries the measurement, the session, the point and the head', () => {
    expect(record).toMatchObject({
      v: 1,
      kind: INCIDENT_KINDS.OVERSHOOT,
      at: '2026-08-19T22:00:00.000Z',
      sessionId: 'sid-1',
      point: 742,
      cause: 'point',
      head: 'abc1234',
      tokens: 180_000,
      watermark: CEILING,
      margin: MARGIN,
      overshoot: 30_000,
      calls: 3,
    })
  })

  it('MEASURES the startup cost as the first complete usage event', () => {
    expect(record.startupTokens).toBe(60_000)
  })

  it('reports the largest growth step even though it BEGAN BELOW the watermark', () => {
    // Sol's audit finding, and the case that must not be lost: the agent spawn
    // started at 60,000 tokens — below the 82,000 trigger — and its response
    // crossed it. No "calls past the mark" list would ever show it.
    expect(record.growth.max).toMatchObject({
      delta: 80_000,
      kind: CALL_KINDS.AGENT,
      fromTokens: 60_000,
      beganBelowTrigger: true,
      inputChars: 4_000,
    })
    expect(record.growth.top.length).toBeLessThanOrEqual(TOP_STEPS)
    expect(record.growth.top[0].delta).toBe(80_000)
  })

  it('names the residual WITH ITS DIRECTION on every record', () => {
    expect(record.residual).toMatch(/under-counts/)
  })

  it('attributes the growth per kind', () => {
    expect(record.byKind.map((k) => k.kind)).toContain(CALL_KINDS.AGENT)
    expect(record.byKind.find((k) => k.kind === CALL_KINDS.AGENT)).toMatchObject({ max: 80_000, maxInputChars: 4_000 })
  })

  it('a record without a transcript still stands — the measurement is the point', () => {
    const bare = buildIncident({ tokens: 200_000, watermark: CEILING, margin: MARGIN, trigger: TRIGGER, calls: [] })
    expect(bare).toMatchObject({ overshoot: 50_000, startupTokens: null, calls: 0 })
    expect(bare.growth).toMatchObject({ steps: 0, max: null, top: [] })
  })
})

describe('the series: parse, filter, summarize, print', () => {
  const incident = (over, at, extra = {}) =>
    buildIncident({
      at: Date.parse(at),
      sessionId: `s-${over}`,
      tokens: CEILING + over,
      watermark: CEILING,
      margin: MARGIN,
      trigger: TRIGGER,
      calls: [
        { tokens: 50_000, tools: [{ name: 'Bash', kind: CALL_KINDS.BROWSER_SUITE, chars: 25 }] },
        { tokens: 100_000, tools: [] },
      ],
      ...extra,
    })

  const series = [
    incident(30_000, '2026-08-18T10:00:00.000Z', { point: 700 }),
    incident(60_000, '2026-08-19T10:00:00.000Z', { point: 731 }),
    incident(161_039, '2026-08-20T10:00:00.000Z', { point: 742 }),
  ]
  const text = `${series.map((r) => JSON.stringify(r)).join('\n')}\nnot json\n{"v":1}\n`

  it('a corrupt line is COUNTED, never fatal', () => {
    const parsed = parseIncidents(text)
    expect(parsed.records).toHaveLength(3)
    expect(parsed.malformed).toBe(2)
    expect(usableIncident({ atMs: 1, tokens: 2 })).toBe(true)
    expect(usableIncident({ tokens: 2 })).toBe(false)
  })

  it('counts the overshoots SINCE a cut-off', () => {
    const since = Date.parse('2026-08-19T00:00:00.000Z')
    expect(filterSeries(parseIncidents(text).records, { sinceMs: since })).toHaveLength(2)
  })

  it('summarizes the size distribution and the per-incident context', () => {
    const summary = summarizeSeries(parseIncidents(text).records, { quantile: 0.9 })
    expect(summary.count).toBe(3)
    expect(summary.overshoot).toMatchObject({ min: 30_000, max: 161_039, median: 60_000 })
    expect(summary.incidents.map((i) => i.point)).toEqual([700, 731, 742])
    expect(summary.incidents[0].maxStep).toMatchObject({ kind: CALL_KINDS.BROWSER_SUITE })
    // The per-kind reading is merged from the records' RAW samples.
    expect(summary.byKind[0]).toMatchObject({ kind: CALL_KINDS.BROWSER_SUITE, calls: 3 })
  })

  it('prints the count, the distribution and the per-incident context', () => {
    const out = formatSeriesReport(summarizeSeries(parseIncidents(text).records, { quantile: 0.9 }), {
      malformed: 2,
      sources: ['.claude/context-incidents.jsonl'],
    })
    expect(out).toMatch(/3 record\(s\)/)
    expect(out).toMatch(/min 30000/)
    expect(out).toMatch(/max 161039/)
    expect(out).toMatch(/point 742/)
    expect(out).toMatch(/GROWTH PER KIND OF CALL/)
    expect(out).toMatch(/browser-suite/)
    expect(out).toMatch(/2 unreadable line\(s\)/)
    expect(out).toMatch(/UNDER-counts/)
  })

  it('says so plainly when the series is EMPTY — and why that is not proof', () => {
    const out = formatSeriesReport(summarizeSeries([], {}))
    expect(out).toMatch(/NO RECORDS/)
    expect(out).toMatch(/died without/)
  })
})
