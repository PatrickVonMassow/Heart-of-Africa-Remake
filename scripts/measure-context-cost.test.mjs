// THE IO HALF of the context-cost measurement: which FILES the tool counts.
//
// The decision logic is pure and pinned in `measure-context-cost-core.test.mjs`; what
// is pinned here is the walk that feeds it, because that is where the scope bug lived.
// Until 08.08.2026 the tool read only the project folder's own `*.jsonl` and never the
// DELEGATED-AGENT transcripts under `<session>/subagents/` — on this host the majority
// of them — so it reported a FLOOR as if it were the rate. These tests build a real
// tree of both kinds and check that the two scopes come out distinct, that a tree with
// no delegated agent still reports both, and that a folder holding nothing still FAILS
// LOUD instead of measuring zero.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listTranscripts, readTurns, transcriptDir } from './measure-context-cost.mjs'
import { measureScopes, SCOPE_ORDER } from './measure-context-cost-core.mjs'

const NOW = Date.parse('2026-08-07T12:00:00Z')

/** One assistant turn as the harness writes it, padded past the stub floor so the
 *  walk's size filter keeps the file. */
function turnLine({ at, session, agentId, context = 40_000, id }) {
  const rec = {
    sessionId: session,
    timestamp: new Date(at).toISOString(),
    message: {
      id,
      usage: { input_tokens: 1000, cache_read_input_tokens: context, cache_creation_input_tokens: 0, output_tokens: 200 },
    },
    padding: 'x'.repeat(1200),
  }
  if (agentId) rec.agentId = agentId
  return JSON.stringify(rec)
}

function writeTranscript(path, lines) {
  writeFileSync(path, lines.join('\n') + '\n', 'utf8')
}

let root
let mixed
let flat
let empty

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'hoa-measure-'))
  mixed = join(root, 'mixed')
  flat = join(root, 'flat')
  empty = join(root, 'empty')
  mkdirSync(join(mixed, 'sess-a', 'subagents'), { recursive: true })
  mkdirSync(flat, { recursive: true })
  mkdirSync(empty, { recursive: true })

  writeTranscript(join(mixed, 'sess-a.jsonl'), [
    turnLine({ at: NOW - 20 * 60_000, session: 'sess-a', id: 'msg-a1', context: 400_000 }),
    turnLine({ at: NOW - 19 * 60_000, session: 'sess-a', id: 'msg-a2', context: 400_000 }),
    turnLine({ at: NOW + 60_000, session: 'sess-a', id: 'msg-a3' }),
    turnLine({ at: NOW + 2 * 60_000, session: 'sess-a', id: 'msg-a4' }),
  ])
  // The delegated agent's records carry the PARENT's sessionId — only agentId tells
  // them apart, which is exactly the trap this covers.
  writeTranscript(join(mixed, 'sess-a', 'subagents', 'agent-b.jsonl'), [
    turnLine({ at: NOW + 60_000, session: 'sess-a', agentId: 'b', id: 'msg-b1', context: 120_000 }),
    turnLine({ at: NOW + 2 * 60_000, session: 'sess-a', agentId: 'b', id: 'msg-b2', context: 160_000 }),
  ])
  // A stub file, below the size floor: not a transcript.
  writeFileSync(join(mixed, 'stub.jsonl'), '{}\n', 'utf8')

  writeTranscript(join(flat, 'sess-c.jsonl'), [
    turnLine({ at: NOW - 20 * 60_000, session: 'sess-c', id: 'msg-c1', context: 400_000 }),
    turnLine({ at: NOW + 60_000, session: 'sess-c', id: 'msg-c2' }),
    turnLine({ at: NOW + 2 * 60_000, session: 'sess-c', id: 'msg-c3' }),
  ])
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('listTranscripts — the folder AND the delegated agents beneath it', () => {
  it('finds both kinds and labels each with its scope', () => {
    const found = listTranscripts(mixed)
    expect(found.filter((f) => f.scope === 'top-level').map((f) => f.rel)).toEqual(['sess-a.jsonl'])
    expect(found.filter((f) => f.scope === 'subagent').map((f) => f.rel)).toEqual(['sess-a/subagents/agent-b.jsonl'])
  })

  it('lists the top-level files FIRST, so a duplicate turn keeps the narrower scope', () => {
    expect(listTranscripts(mixed)[0].scope).toBe('top-level')
  })

  it('drops stubs below the size floor and returns nothing for a missing folder', () => {
    expect(listTranscripts(mixed).some((f) => f.rel === 'stub.jsonl')).toBe(false)
    expect(listTranscripts(join(root, 'does-not-exist'))).toEqual([])
    expect(listTranscripts(empty)).toEqual([])
  })
})

describe('readTurns — every turn tagged with the scope it was read from', () => {
  it('reads both kinds and separates the agent from its parent session', async () => {
    const turns = await readTurns(mixed)
    expect(turns).toHaveLength(6)
    expect(turns.filter((t) => t.scope === 'subagent')).toHaveLength(2)
    expect(new Set(turns.map((t) => t.session)).size).toBe(2)
    expect(turns.some((t) => t.session === 'sess-a/agent-b')).toBe(true)
  })
})

describe('the two scopes over a real tree', () => {
  it('reports both, with the full count never below the top-level one', async () => {
    const scopes = measureScopes({ turns: await readTurns(mixed), boundaryAt: NOW })
    expect(Object.keys(scopes)).toEqual(SCOPE_ORDER)
    expect(scopes.topLevel.turnsRead).toBe(4)
    expect(scopes.full.turnsRead).toBe(6)
    expect(scopes.full.turnsRead).toBeGreaterThanOrEqual(scopes.topLevel.turnsRead)
    expect(scopes.full.after.weighted).toBeGreaterThan(scopes.topLevel.after.weighted)
  })

  it('reports both for a tree with NO delegated agent, full equal to top-level', async () => {
    const scopes = measureScopes({ turns: await readTurns(flat), boundaryAt: NOW })
    expect(Object.keys(scopes)).toEqual(SCOPE_ORDER)
    expect(scopes.full.turnsRead).toBe(scopes.topLevel.turnsRead)
    expect(scopes.full.subagentTurns).toBe(0)
    expect(scopes.full.after).toEqual(scopes.topLevel.after)
  })
})

describe('a folder holding no transcript still FAILS LOUD', () => {
  it('throws for an empty directory rather than measuring zero', () => {
    expect(() => transcriptDir({ env: { MEASURE_TRANSCRIPTS_DIR: empty } })).toThrow(/no transcripts found/)
  })

  it('throws when no derived candidate holds one, naming the paths tried', () => {
    expect(() => transcriptDir({ repoRoot: join(root, 'nowhere'), home: root, env: {} })).toThrow(
      /no transcripts found[\s\S]*MEASURE_TRANSCRIPTS_DIR/,
    )
  })

  it('accepts a folder that holds ONLY delegated-agent transcripts', () => {
    const agentsOnly = join(root, 'agents-only')
    mkdirSync(join(agentsOnly, 'sess-d', 'subagents'), { recursive: true })
    writeTranscript(join(agentsOnly, 'sess-d', 'subagents', 'agent-e.jsonl'), [
      turnLine({ at: NOW, session: 'sess-d', agentId: 'e', id: 'msg-e1' }),
    ])
    expect(transcriptDir({ env: { MEASURE_TRANSCRIPTS_DIR: agentsOnly } })).toBe(agentsOnly)
  })
})
