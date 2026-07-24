// Tests of the timestamp Stop-hook guard: the pure core (stamp formatting,
// tolerance window, transcript extraction, verdicts) plus END-TO-END spawns of
// the real guard process fed crafted transcripts on stdin — proving the four
// mandated outcomes: current stamp allows, missing stamp blocks, stale/wrong
// stamp blocks, unreadable transcript blocks (bounded by the loop escape).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  MINUTES_AHEAD,
  MINUTES_BACK,
  TIMESTAMP_RE,
  acceptedStamps,
  berlinStamp,
  evaluate,
  extractLastAssistantText,
} from './timestamp-guard-core.mjs'

// Vitest runs with cwd = repo root; import.meta.url is an http URL under the
// jsdom environment, so the guard path is resolved from cwd instead.
const GUARD = join(process.cwd(), 'scripts', 'timestamp-guard.mjs')

/** One transcript JSONL line in the real Claude Code shape (assistant
 *  messages stream one entry per content block, sharing message.id). */
function line(type, blocks, { id = 'msg-1', sidechain = false } = {}) {
  return JSON.stringify({ type, isSidechain: sidechain, message: { id, content: blocks } })
}

function assistantText(text, opts) {
  return line('assistant', [{ type: 'text', text }], opts)
}

describe('berlinStamp', () => {
  it('formats a summer (CEST, UTC+2) moment canonically', () => {
    expect(berlinStamp(new Date('2026-07-23T07:55:00Z'))).toBe('Donnerstag, 23.07.2026, 09:55')
  })
  it('formats a winter (CET, UTC+1) moment canonically — DST-aware', () => {
    expect(berlinStamp(new Date('2026-01-15T09:00:00Z'))).toBe('Donnerstag, 15.01.2026, 10:00')
  })
  it('matches the mandated bold shape when wrapped', () => {
    expect(`**${berlinStamp()}** hi`).toMatch(TIMESTAMP_RE)
  })
})

describe('acceptedStamps tolerance window', () => {
  const now = new Date('2026-07-23T08:00:00Z') // 10:00 Berlin
  const stamps = acceptedStamps(now)
  it('accepts now and the full backward tolerance', () => {
    expect(stamps.has('Donnerstag, 23.07.2026, 10:00')).toBe(true)
    expect(stamps.has(berlinStamp(new Date(now.getTime() - MINUTES_BACK * 60000)))).toBe(true)
  })
  it('accepts the small forward skew but nothing beyond', () => {
    expect(stamps.has(berlinStamp(new Date(now.getTime() + MINUTES_AHEAD * 60000)))).toBe(true)
    expect(stamps.has(berlinStamp(new Date(now.getTime() + (MINUTES_AHEAD + 1) * 60000)))).toBe(false)
  })
  it('rejects one minute beyond the backward tolerance', () => {
    expect(stamps.has(berlinStamp(new Date(now.getTime() - (MINUTES_BACK + 1) * 60000)))).toBe(false)
  })
  it('crosses midnight (date rollover) by construction', () => {
    const midnight = new Date('2026-07-22T22:04:00Z') // 00:04 Berlin on the 23rd
    expect(acceptedStamps(midnight).has('Mittwoch, 22.07.2026, 23:59')).toBe(true)
  })
})

describe('extractLastAssistantText', () => {
  it('returns the first text block of the LAST assistant message id', () => {
    const jsonl = [
      assistantText('**old stamp** first reply', { id: 'a' }),
      line('user', [{ type: 'tool_result', content: 'x' }], { id: '' }),
      line('assistant', [{ type: 'thinking', thinking: 'hm' }], { id: 'b' }),
      assistantText('**fresh stamp** final reply', { id: 'b' }),
      line('assistant', [{ type: 'tool_use', name: 'Bash' }], { id: 'b' }),
    ].join('\n')
    expect(extractLastAssistantText(jsonl)).toBe('**fresh stamp** final reply')
  })
  it('ignores sidechain (subagent) entries', () => {
    const jsonl = [
      assistantText('main reply', { id: 'a' }),
      assistantText('subagent chatter', { id: 'sub', sidechain: true }),
    ].join('\n')
    expect(extractLastAssistantText(jsonl)).toBe('main reply')
  })
  it('survives corrupt lines and returns null on empty/garbage input', () => {
    expect(extractLastAssistantText('not json\n{"broken')).toBe(null)
    expect(extractLastAssistantText('')).toBe(null)
    expect(extractLastAssistantText(`not json\n${assistantText('ok')}`)).toBe('ok')
  })
})

describe('evaluate', () => {
  const now = new Date('2026-07-23T08:00:00Z') // Donnerstag, 23.07.2026, 10:00
  it('allows a reply beginning with the current stamp', () => {
    expect(evaluate({ lastText: '**Donnerstag, 23.07.2026, 10:00** Alles erledigt.', now })).toBe(null)
  })
  it('allows a minute-rollover stamp (composed a few minutes before Stop)', () => {
    expect(evaluate({ lastText: '**Donnerstag, 23.07.2026, 09:52** Report.', now })).toBe(null)
  })
  it('blocks a missing stamp and hands the exact copy line', () => {
    const verdict = evaluate({ lastText: 'Alles erledigt, Tests grün.', now })
    expect(verdict?.decision).toBe('block')
    expect(verdict?.reason).toContain('**Donnerstag, 23.07.2026, 10:00**')
  })
  it('blocks a stale stamp (hours off) and a yesterday stamp', () => {
    expect(evaluate({ lastText: '**Donnerstag, 23.07.2026, 07:00** Report.', now })?.decision).toBe('block')
    expect(evaluate({ lastText: '**Mittwoch, 22.07.2026, 10:00** Report.', now })?.decision).toBe('block')
  })
  it('blocks a wrong-format stamp (unbold, prose date)', () => {
    expect(evaluate({ lastText: 'Donnerstag, 23.07.2026, 10:00 — Report.', now })?.decision).toBe('block')
    expect(evaluate({ lastText: '**23. Juli 2026, 10:00** Report.', now })?.decision).toBe('block')
  })
  it('blocks when no reply text exists at all', () => {
    expect(evaluate({ lastText: null, now })?.decision).toBe('block')
  })
})

describe('end-to-end guard process', () => {
  const dir = mkdtempSync(join(tmpdir(), 'timestamp-guard-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  /** Run the real guard with a hook-style stdin payload; state is isolated. */
  function runGuard(payload, { session = 'e2e' } = {}) {
    const out = execFileSync(process.execPath, [GUARD], {
      input: JSON.stringify({ session_id: session, ...payload }),
      encoding: 'utf8',
      env: { ...process.env, TIMESTAMP_GUARD_STATE: join(dir, `state-${session}.json`) },
    })
    const trimmed = out.trim()
    return trimmed ? JSON.parse(trimmed.split('\n').pop()) : null
  }

  function transcript(name, replyText) {
    const p = join(dir, name)
    writeFileSync(p, `${assistantText(replyText, { id: 'final' })}\n`)
    return p
  }

  it('(a) allows a reply with the correct current timestamp', () => {
    const p = transcript('ok.jsonl', `**${berlinStamp()}** Alles erledigt.`)
    expect(runGuard({ transcript_path: p })).toBe(null)
  })

  it('(b) blocks a reply with NO timestamp', () => {
    const p = transcript('missing.jsonl', 'Fertig — Tests grün, gepusht.')
    const verdict = runGuard({ transcript_path: p })
    expect(verdict?.decision).toBe('block')
    expect(verdict?.reason).toContain(`**${berlinStamp()}**`)
  })

  it('(c) blocks a stale (yesterday / hours-off) timestamp', () => {
    const stale = berlinStamp(new Date(Date.now() - 26 * 3600 * 1000))
    const verdict = runGuard({ transcript_path: transcript('stale.jsonl', `**${stale}** Report.`) })
    expect(verdict?.decision).toBe('block')
    const hoursOff = berlinStamp(new Date(Date.now() - 3 * 3600 * 1000))
    const verdict2 = runGuard({ transcript_path: transcript('off.jsonl', `**${hoursOff}** Report.`) })
    expect(verdict2?.decision).toBe('block')
  })

  it('(d) blocks a missing/garbled transcript, bounded by the loop escape', () => {
    const missing = { transcript_path: join(dir, 'nope.jsonl') }
    // First three attempts block…
    for (let i = 0; i < 3; i++) {
      expect(runGuard(missing, { session: 'd' })?.decision).toBe('block')
    }
    // …the fourth releases LOUDLY (systemMessage, no decision) — never an
    // infinite block loop on a transcript the assistant cannot fix.
    const released = runGuard(missing, { session: 'd' })
    expect(released?.decision).toBeUndefined()
    expect(released?.systemMessage).toContain('timestamp-guard')
    // A garbled (unparseable-JSON stdin) invocation also blocks.
    const out = execFileSync(process.execPath, [GUARD], {
      input: 'not json at all',
      encoding: 'utf8',
      env: { ...process.env, TIMESTAMP_GUARD_STATE: join(dir, 'state-garbled.json') },
    })
    expect(JSON.parse(out.trim())?.decision).toBe('block')
  })

  it('a fixed reply after a block passes on the next check', () => {
    const p = transcript('fixed.jsonl', 'no stamp yet')
    expect(runGuard({ transcript_path: p }, { session: 'fix' })?.decision).toBe('block')
    writeFileSync(p, `${assistantText(`**${berlinStamp()}** Nachgereicht.`, { id: 'fix2' })}\n`)
    expect(runGuard({ transcript_path: p }, { session: 'fix' })).toBe(null)
  })
})
