import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  aggregatePointLedger,
  assignPoints,
  associateBoundaryEvents,
  claudeTokens,
  codexTokens,
  declaredPointFromEvidence,
  leverEffect,
  parseBoundaryLog,
  parseClaudeTranscript,
  parseCodexTranscript,
  pointFromEvidence,
  selectLandedPoints,
} from './measure-point-cost-core.mjs'

// Sanitised cuts from the two real harness formats, retained as JSONL rather than
// rebuilding shaped objects in the test. Schema drift must break the parser test.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'point-cost')
const fixture = (name) => readFileSync(join(FIXTURES, name), 'utf8')

describe('provider token counters', () => {
  it('adds Claude disjoint counters exactly once', () => {
    expect(claudeTokens({ input_tokens: 2, cache_creation_input_tokens: 3, cache_read_input_tokens: 5, output_tokens: 7 })).toBe(17)
  })

  it('does not add the Codex cached-input SUBSET a second time', () => {
    expect(codexTokens({ input_tokens: 1000, cache_read_input_tokens: 900, output_tokens: 50, total_tokens: 1050 })).toBe(1050)
    expect(codexTokens({ input_tokens: 1000, cache_read_input_tokens: 900, output_tokens: 50 })).toBe(1050)
  })
})

describe('recorded Claude fixture', () => {
  it('keeps a real hand-over commission in the author bucket despite its review vocabulary', () => {
    const agent = parseClaudeTranscript(fixture('claude-agent.jsonl'), { file: 's/subagents/agent-a900.jsonl', scope: 'subagent' })
    expect(agent).toHaveLength(1)
    expect(agent[0].usage.output_tokens).toBe(120)
    expect(agent[0].tokens).toBe(920)
    expect(agent[0]).toMatchObject({ role: 'agent', agent: 'claude:a900' })

    const main = parseClaudeTranscript(fixture('claude-main.jsonl'), { file: 'main.jsonl' })
    expect(main).toHaveLength(3)
    expect(main[1].items).toContain('agentReports')
    expect(main[2].items).toContain('pictureReads')
    expect(main[2].signals.boundedVerifyDigest).toBe(true)
  })
})

describe('recorded Codex fixtures', () => {
  it('uses per-response usage, while the cumulative counter is never re-summed', () => {
    const turns = parseCodexTranscript(fixture('codex-author.jsonl'), { file: 'author.jsonl' })
    expect(turns.map((turn) => turn.tokens)).toEqual([1100, 2200])
    expect(turns.reduce((sum, turn) => sum + turn.tokens, 0)).toBe(3300)
    expect(turns[0].usage.cache_read_input_tokens).toBe(400)
    expect(turns[0].usage.input_tokens).toBe(600)
    expect(turns[0]).toMatchObject({ role: 'agent', agent: 'codex:codex-author' })
  })

  it('classifies the real review-sol commission as review cost', () => {
    expect(parseCodexTranscript(fixture('codex-review.jsonl'))[0]).toMatchObject({ role: 'review', tokens: 800 })
  })

  it('keeps the real ask-sol commission as delegated agent work', () => {
    expect(parseCodexTranscript(fixture('codex-ask.jsonl'))[0]).toMatchObject({ role: 'agent', tokens: 450 })
  })
})

describe('point attribution is candidate-bounded and evidence-led', () => {
  it('prefers the branch/worktree over incidental point references in a brief', () => {
    expect(
      pointFromEvidence(
        { branch: 'feat/900-fixture', text: 'Point 901 is mentioned. WORK-ORDER POINT 900.', cwd: '/worktrees/point-900' },
        [900, 901],
      ),
    ).toBe(900)
    expect(pointFromEvidence({ text: 'please finish point 900' }, [900, 901])).toBe(900)
    expect(pointFromEvidence({ text: 'numbers 900 and 901 only' }, [900, 901])).toBeNull()
  })

  it('retains a strong OUTSIDE declaration so current work cannot leak into landed candidates', () => {
    expect(declaredPointFromEvidence({ text: 'WORK-ORDER POINT 727; this fixes point 712' })).toBe(727)
    const assigned = assignPoints(
      [
        { at: 0, session: 'current', scope: 'subagent', prompt: 'AUTHORING WORK-ORDER POINT 727', branch: 'feat/727-new', tools: [] },
        { at: 1, session: 'current', scope: 'subagent', prompt: '', branch: '', tools: [{ name: 'Bash', input: { command: 'inspect point 712' } }] },
      ],
      [712],
    )
    expect(assigned.map((turn) => turn.point)).toEqual([727, 727])
  })

  it('lets repository metadata win over point numbers quoted in review material', () => {
    expect(
      declaredPointFromEvidence({
        branch: 'feat/714-review-material-budget',
        cwd: '/workspace/hoa/.claude/worktrees/agent-a5903341fccc6ef7d',
        text: 'WORK-ORDER POINT 298\nWORK-ORDER POINT 298\nWORK-ORDER POINT 624',
      }),
    ).toBe(714)
  })

  it('fills setup and prose within one agent session, never across an idle episode', () => {
    const turns = [
      { at: 0, session: 'a', scope: 'subagent', branch: '', prompt: '', tools: [] },
      { at: 1000, session: 'a', scope: 'subagent', branch: 'feat/900-x', prompt: '', tools: [] },
      { at: 2000, session: 'a', scope: 'subagent', branch: '', prompt: '', tools: [] },
      { at: 40 * 60_000, session: 'main', scope: 'top-level', branch: '', prompt: '', tools: [] },
    ]
    const assigned = assignPoints(turns, [900])
    expect(assigned.slice(0, 3).map((turn) => turn.point)).toEqual([900, 900, 900])
    expect(assigned[3].point).toBeNull()
  })
})

describe('boundary events and the landed-point ledger', () => {
  const build = () => {
    const raw = [
      ...parseClaudeTranscript(fixture('claude-main.jsonl'), { file: 'main.jsonl' }),
      ...parseClaudeTranscript(fixture('claude-agent.jsonl'), { file: 'main/subagents/agent-a900.jsonl', scope: 'subagent' }),
      ...parseCodexTranscript(fixture('codex-author.jsonl')),
      ...parseCodexTranscript(fixture('codex-ask.jsonl')),
      ...parseCodexTranscript(fixture('codex-review.jsonl')),
    ]
    const turns = assignPoints(raw, [900])
    const events = associateBoundaryEvents(parseBoundaryLog(fixture('boundary.txt')), turns)
    return aggregatePointLedger({ landed: [{ point: 900, sha: 'abc', landedAt: '2026-08-18T10:20:00Z' }], turns, boundaryEvents: events })
  }

  it('associates a watermark session with the point active in that session', () => {
    const turns = assignPoints(parseClaudeTranscript(fixture('claude-main.jsonl'), { file: 'main.jsonl' }), [900])
    const events = associateBoundaryEvents(parseBoundaryLog(fixture('boundary.txt')), turns)
    expect(events.map((event) => [event.kind, event.point])).toEqual([
      ['pointBoundary', 900],
      ['contextWatermark', 900],
    ])
  })

  it('reconciles the origin split to the point total and keeps every agent separate', () => {
    const row = build().ledger[0]
    const originTotal = row.origins.mainSession + row.origins.crossVendorReviews + Object.values(row.origins.agents).reduce((a, b) => a + b, 0)
    expect(originTotal).toBe(row.tokens)
    expect(row.origins.crossVendorReviews).toBe(800)
    expect(Object.keys(row.origins.agents)).toEqual(['codex:codex-author', 'claude:a900', 'codex:codex-ask'])
    expect(row.items.agentReports).toBeGreaterThan(0)
    expect(row.items.pictureReads).toBeGreaterThan(0)
    expect(row.items.reviewRounds).toBe(800)
  })

  it('never puts Anthropic traffic in the cross-vendor review bucket', () => {
    const result = aggregatePointLedger({
      landed: [{ point: 900 }],
      turns: [{ point: 900, tokens: 50, role: 'review', provider: 'anthropic', session: 'claude-review', sessionBase: 'claude-review' }],
    })
    expect(result.ledger[0].origins.crossVendorReviews).toBe(0)
    expect(result.ledger[0].origins.agents).toEqual({ 'anthropic:claude-review': 50 })
  })

  it('records all six built levers and the exact observed event counts', () => {
    const row = build().ledger[0]
    expect(row.levers).toEqual({
      pointBoundary: true,
      contextWatermark: true,
      delegationBrief: true,
      boundedVerifyDigest: true,
      openArchiveSplit: true,
      docBudgets: false,
    })
    expect(row.leverEvents.pointBoundary).toBe(1)
    expect(row.leverEvents.contextWatermark).toBe(1)
  })

  it('charges a consumed item the whole response and permits inclusive overlap', () => {
    const result = aggregatePointLedger({
      landed: [{ point: 900 }],
      turns: [
        {
          point: 900,
          tokens: 100,
          role: 'agent',
          provider: 'openai',
          session: 'one',
          sessionBase: 'one',
          items: ['agentReports', 'rawSuiteLogs'],
        },
      ],
    })
    expect(result.items.agentReports).toEqual({ tokens: 100, share: 1 })
    expect(result.items.rawSuiteLogs).toEqual({ tokens: 100, share: 1 })
  })
})

describe('effectiveness verdicts say when the data cannot support a lever', () => {
  it('reports the measured signed difference and refuses causal language', () => {
    expect(leverEffect([{ tokens: 100, levers: { brief: true } }, { tokens: 300, levers: { brief: false } }], 'brief')).toEqual({
      fired: 1,
      absent: 1,
      firedMean: 100,
      absentMean: 300,
      difference: -200,
      differencePct: -0.6667,
      verdict: 'associated with lower per-point cost; observational, not causal',
    })
  })

  it('names a missing comparison group instead of turning absence into zero savings', () => {
    expect(leverEffect([{ tokens: 100, levers: { brief: true } }], 'brief')).toMatchObject({
      fired: 1,
      absent: 0,
      difference: null,
      verdict: 'cannot be shown to move per-point cost: no comparison group',
    })
  })

  it('suppresses a signed comparison when cost itself triggers the lever', () => {
    expect(
      leverEffect(
        [
          { tokens: 900, levers: { contextWatermark: true } },
          { tokens: 100, levers: { contextWatermark: false } },
        ],
        'contextWatermark',
      ),
    ).toEqual({
      fired: 1,
      absent: 1,
      firedMean: null,
      absentMean: null,
      difference: null,
      differencePct: null,
      verdict: 'UNMEASURABLE from these records: reverse causality; accumulated context cost triggers the watermark',
    })
  })
})

describe('selectLandedPoints', () => {
  it('takes the last N distinct feature merges and ignores non-point merges', () => {
    const rows = selectLandedPoints(
      [
        { sha: 'a', subject: "Merge branch 'feat/901-new'", mergedAt: 'later' },
        { sha: 'b', subject: "Merge branch 'feat/900-old'", mergedAt: 'earlier' },
        { sha: 'c', subject: "Merge branch 'feat/901-rework'", mergedAt: 'oldest' },
        { sha: 'd', subject: 'Merge upstream/main' },
      ],
      2,
    )
    expect(rows.map((row) => row.point)).toEqual([901, 900])
  })
})
