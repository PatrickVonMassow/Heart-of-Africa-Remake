// THE OVERSHOOT SERIES' IO HALF AND ITS ONE READING COMMAND (point 742).
//
// THE CARE THIS NEEDS is that the boundary must NOT fail when the record cannot
// be written: the handover is what keeps the batch alive, the bookkeeping is
// evidence, and a session that could not end because a JSONL append failed would
// be a far worse defect than a missing record. So every failure path is proven
// to degrade to a returned reason, and the recorder is proven never to throw.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { buildIncident, CALL_KINDS, INCIDENT_KINDS } from './context-incidents-core.mjs'
import {
  appendIncident,
  commitTimeMs,
  headSha,
  incidentOutcomeLine,
  noteBoundaryIncident,
  parseReadArgs,
  readSeries,
  readTranscript,
  recordBoundaryIncident,
  resolveSince,
} from './context-incidents.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI = join(HERE, 'context-incidents.mjs')
const CEILING = 150_000
const MARGIN = 25_000

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hoa-incidents-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** A transcript with one cheap call and one that crosses the trigger. */
const transcriptText = () =>
  [
    JSON.stringify({
      type: 'assistant',
      requestId: 'r1',
      timestamp: '2026-08-19T20:00:00.000Z',
      message: {
        usage: { input_tokens: 5, cache_read_input_tokens: 59_995 },
        content: [{ type: 'tool_use', name: 'Agent', input: { prompt: 'x'.repeat(1_000) } }],
      },
    }),
    JSON.stringify({
      type: 'assistant',
      requestId: 'r2',
      timestamp: '2026-08-19T20:10:00.000Z',
      message: { usage: { input_tokens: 5, cache_read_input_tokens: 199_995 }, content: [{ type: 'text' }] },
    }),
  ].join('\n')

const stubs = (overrides = {}) => ({
  sha: () => 'deadbee',
  locate: () => '/nowhere/transcript.jsonl',
  readText: () => ({ text: transcriptText(), truncated: false, bytes: 100 }),
  ...overrides,
})

describe('recordBoundaryIncident — the condition', () => {
  it('an overshoot INSIDE the stated margin writes NOTHING', () => {
    const written = []
    const out = recordBoundaryIncident({
      tokens: CEILING + MARGIN,
      ceiling: CEILING,
      margin: MARGIN,
      append: (rec) => written.push(rec),
      ...stubs(),
    })
    expect(out).toMatchObject({ written: false, reason: 'below-margin' })
    expect(written).toHaveLength(0)
  })

  it('an overshoot BEYOND it writes one record, with the growth that crossed the mark', () => {
    const written = []
    const out = recordBoundaryIncident({
      tokens: 311_039,
      sessionId: 'sid-9',
      point: 742,
      cause: 'point',
      ceiling: CEILING,
      margin: MARGIN,
      trigger: 82_000,
      now: Date.parse('2026-08-19T20:15:00.000Z'),
      append: (rec) => written.push(rec),
      ...stubs(),
    })
    expect(out.written).toBe(true)
    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({
      kind: INCIDENT_KINDS.OVERSHOOT,
      sessionId: 'sid-9',
      point: 742,
      cause: 'point',
      head: 'deadbee',
      tokens: 311_039,
      overshoot: 161_039,
      startupTokens: 60_000,
    })
    // The largest step began at 60,000 tokens — below the 82,000 trigger — and
    // is reported anyway (Sol's audit finding).
    expect(written[0].growth.max).toMatchObject({
      delta: 140_000,
      kind: CALL_KINDS.AGENT,
      fromTokens: 60_000,
      beganBelowTrigger: true,
    })
  })

  it('NO reading: nothing recorded, and the reason says so', () => {
    const out = recordBoundaryIncident({ tokens: null, ceiling: CEILING, margin: MARGIN, ...stubs() })
    expect(out).toMatchObject({ written: false, reason: 'no-reading' })
  })

  it('an unreadable transcript still records the MEASUREMENT, and names the gap', () => {
    const written = []
    const out = recordBoundaryIncident({
      tokens: 200_000,
      ceiling: CEILING,
      margin: MARGIN,
      append: (rec) => written.push(rec),
      ...stubs({ readText: () => ({ text: null, truncated: false, bytes: 0 }) }),
    })
    expect(out.written).toBe(true)
    expect(written[0]).toMatchObject({ overshoot: 50_000, calls: 0, startupTokens: null })
    expect(written[0].note).toMatch(/no transcript/)
  })

  it('a TRUNCATED transcript claims no startup reading it never saw', () => {
    const written = []
    recordBoundaryIncident({
      tokens: 200_000,
      ceiling: CEILING,
      margin: MARGIN,
      append: (rec) => written.push(rec),
      ...stubs({ readText: () => ({ text: transcriptText(), truncated: true, bytes: 99_000_000 }) }),
    })
    expect(written[0].note).toMatch(/tail only/)
  })
})

describe('THE CARE: the boundary must never fail because the record cannot be written', () => {
  it('a throwing append degrades to a reason, and does NOT throw', () => {
    const out = recordBoundaryIncident({
      tokens: 311_039,
      ceiling: CEILING,
      margin: MARGIN,
      append: () => {
        throw new Error('EROFS: read-only file system')
      },
      ...stubs(),
    })
    expect(out).toMatchObject({ written: false, reason: 'write-failed' })
    expect(String(out.error?.message)).toMatch(/EROFS/)
  })

  it('a throwing transcript read, sha probe or locator does not throw either', () => {
    for (const broken of [
      { readText: () => { throw new Error('boom-read') } },
      { sha: () => { throw new Error('boom-git') } },
      { locate: () => { throw new Error('boom-locate') } },
    ]) {
      const out = recordBoundaryIncident({
        tokens: 311_039,
        ceiling: CEILING,
        margin: MARGIN,
        append: () => {},
        ...stubs(broken),
      })
      expect(out.written).toBe(false)
      expect(out.reason).toBe('write-failed')
    }
  })

  it('noteBoundaryIncident swallows EVERYTHING and warns instead', () => {
    const said = []
    const log = console.log
    console.log = (msg) => said.push(String(msg))
    try {
      const out = noteBoundaryIncident({
        tokens: 311_039,
        ceiling: CEILING,
        margin: MARGIN,
        append: () => {
          throw new Error('EACCES')
        },
        ...stubs(),
      })
      expect(out.written).toBe(false)
    } finally {
      console.log = log
    }
    expect(said.join('\n')).toMatch(/WARNING/)
    expect(said.join('\n')).toMatch(/the boundary itself stands/)
  })

  it('the success line names the file, the overshoot and the largest step', () => {
    const record = buildIncident({
      tokens: 200_000,
      watermark: CEILING,
      margin: MARGIN,
      trigger: 82_000,
      calls: [
        { tokens: 60_000, tools: [{ name: 'Bash', kind: CALL_KINDS.BROWSER_SUITE, chars: 20 }] },
        { tokens: 90_000, tools: [] },
      ],
    })
    const line = incidentOutcomeLine({ written: true, record }, { path: '/x/series.jsonl' })
    expect(line).toMatch(/\/x\/series\.jsonl/)
    expect(line).toMatch(/50000 past the 150000 ceiling/)
    expect(line).toMatch(/browser-suite/)
    expect(incidentOutcomeLine({ written: false, reason: 'below-margin' })).toBeNull()
  })
})

describe('the files: appended, never rewritten', () => {
  it('appends one line per incident and reads them back oldest first', () => {
    const path = join(dir, 'series.jsonl')
    const rec = (at, tokens) =>
      buildIncident({ at: Date.parse(at), tokens, watermark: CEILING, margin: MARGIN, trigger: 82_000, calls: [] })
    appendIncident(rec('2026-08-19T10:00:00.000Z', 200_000), path)
    appendIncident(rec('2026-08-18T10:00:00.000Z', 300_000), path)
    expect(readFileSync(path, 'utf8').trim().split('\n')).toHaveLength(2)
    const series = readSeries([path])
    expect(series.records.map((r) => r.tokens)).toEqual([300_000, 200_000])
    expect(series.sources).toEqual([path])
    expect(series.malformed).toBe(0)
  })

  it('a missing file is not an error, and a corrupt line is counted', () => {
    const path = join(dir, 'series.jsonl')
    writeFileSync(path, 'garbage\n')
    const series = readSeries([join(dir, 'absent.jsonl'), path])
    expect(series.records).toHaveLength(0)
    expect(series.malformed).toBe(1)
    expect(series.sources).toEqual([path])
  })

  it('readTranscript reports what it actually read', () => {
    const path = join(dir, 't.jsonl')
    writeFileSync(path, 'abcdef')
    expect(readTranscript(path)).toMatchObject({ text: 'abcdef', truncated: false, bytes: 6 })
    expect(readTranscript(path, { maxBytes: 3 })).toMatchObject({ text: 'def', truncated: true })
    expect(readTranscript(join(dir, 'absent.jsonl'))).toMatchObject({ text: null })
    expect(readTranscript('')).toMatchObject({ text: null, bytes: 0 })
  })

  it('headSha and commitTimeMs answer null rather than throwing', () => {
    expect(headSha({ exec: () => { throw new Error('no git') } })).toBeNull()
    expect(headSha({ exec: () => ' abc123 \n' })).toBe('abc123')
    expect(commitTimeMs('HEAD', { exec: () => '2026-08-19T10:00:00+02:00' })).toBe(
      Date.parse('2026-08-19T10:00:00+02:00'),
    )
    expect(commitTimeMs('HEAD', { exec: () => 'not a date' })).toBeNull()
    // A revision that is not a revision never reaches git — and no shell ever
    // sees it (an argument vector, not a command line).
    let called = false
    expect(commitTimeMs('HEAD"; rm -rf /; echo "', { exec: () => { called = true; return '' } })).toBeNull()
    expect(called).toBe(false)
  })
})

describe('the reading command', () => {
  it('reads its arguments, and falls back on a nonsense quantile', () => {
    expect(parseReadArgs(['--since', '2026-08-19', '--json', '--file', 'a', '--file', 'b'])).toMatchObject({
      since: '2026-08-19',
      json: true,
      files: ['a', 'b'],
    })
    expect(parseReadArgs(['--quantile', '0.95']).quantile).toBe(0.95)
    expect(parseReadArgs(['--quantile', '7']).quantile).toBe(0.9)
    expect(parseReadArgs(['--nope']).unknown).toEqual(['--nope'])
  })

  it('resolves a cut-off from a date OR a commit, and refuses a bad one', () => {
    expect(resolveSince({ since: '2026-08-19' }).sinceMs).toBe(Date.parse('2026-08-19'))
    expect(resolveSince({ since: 'yesterday-ish' }).error).toMatch(/cannot read date/)
    expect(resolveSince({ sinceCommit: 'abc1234', commitTime: () => 1_787_000_000_000 })).toMatchObject({
      sinceMs: 1_787_000_000_000,
    })
    expect(resolveSince({ sinceCommit: 'abc1234', commitTime: () => null }).error).toMatch(/cannot resolve commit/)
  })

  it('END TO END over a fixture series: count, distribution, per-incident context', () => {
    const path = join(dir, 'fixture.jsonl')
    const rec = (at, tokens, point) =>
      buildIncident({
        at: Date.parse(at),
        sessionId: `s-${point}`,
        point,
        cause: 'point',
        tokens,
        watermark: CEILING,
        margin: MARGIN,
        trigger: 82_000,
        calls: [
          { tokens: 60_000, tools: [{ name: 'Bash', kind: CALL_KINDS.BROWSER_SUITE, chars: 20 }] },
          { tokens: 130_000, tools: [] },
        ],
      })
    writeFileSync(
      path,
      `${[
        JSON.stringify(rec('2026-08-17T10:00:00.000Z', 180_000, 700)),
        JSON.stringify(rec('2026-08-19T10:00:00.000Z', 311_039, 742)),
      ].join('\n')}\n`,
    )
    const run = (args) => spawnSync(process.execPath, [CLI, '--file', path, ...args], { encoding: 'utf8' })

    const all = run([])
    expect(all.status).toBe(0)
    expect(all.stdout).toMatch(/2 record\(s\)/)
    expect(all.stdout).toMatch(/min 30000/)
    expect(all.stdout).toMatch(/max 161039/)
    expect(all.stdout).toMatch(/point 742/)
    expect(all.stdout).toMatch(/BEGAN BELOW THE TRIGGER/)
    expect(all.stdout).toMatch(/GROWTH PER KIND OF CALL/)
    expect(all.stdout).toMatch(/UNDER-counts/)

    // SINCE a date — the reading the deferred decision needs: does it still
    // happen at all since the fence was armed?
    const since = run(['--since', '2026-08-18'])
    expect(since.stdout).toMatch(/1 record\(s\) since/)
    expect(since.stdout).not.toMatch(/point 700/)

    const json = run(['--json'])
    expect(JSON.parse(json.stdout)).toMatchObject({ count: 2 })

    const bad = run(['--since', 'whenever'])
    expect(bad.status).toBe(2)
    expect(bad.stderr).toMatch(/cannot read date/)
  })

  it('reads the SEED beside the live series by default, and the shipped seed is readable', () => {
    const series = readSeries([join(HERE, '..', '.claude', 'context-incidents-seed.jsonl')])
    expect(series.malformed).toBe(0)
    // The two third-party startup readings this point's own evidence rests on:
    // 85,225 and 83,079 tokens against the 82,000 trigger, both from sessions
    // that had done NO work (19./20.08.2026).
    expect(series.records.map((r) => r.tokens)).toEqual([85_225, 83_079])
    for (const r of series.records) {
      expect(r.kind).toBe(INCIDENT_KINDS.STARTUP)
      expect(r.watermark).toBe(82_000)
      // MEASURED at the first complete api usage event, not estimated.
      expect(r.startupTokens).toBe(r.tokens)
      expect(r.note).toMatch(/THIRD-PARTY READING/)
    }
  })
})
