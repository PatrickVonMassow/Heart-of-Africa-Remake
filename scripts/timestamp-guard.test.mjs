// Tests of the timestamp Stop-hook guard: the pure core (stamp formatting,
// tolerance window, transcript extraction, verdicts) plus END-TO-END spawns of
// the real guard process fed crafted transcripts on stdin — proving the four
// mandated outcomes: current stamp allows, missing stamp blocks, stale/wrong
// stamp blocks, unreadable transcript blocks (bounded by the loop escape).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  HEADER_SUFFIX_RE,
  MINUTES_AHEAD,
  MINUTES_BACK,
  TIMESTAMP_RE,
  acceptedStamps,
  berlinStamp,
  evaluate,
  extractLastAssistantText,
  inspectLastAssistantText,
  timestampReplyCondition,
} from './timestamp-guard-core.mjs'

// Vitest runs with cwd = repo root; import.meta.url is an http URL under the
// jsdom environment, so the guard path is resolved from cwd instead.
const GUARD = join(process.cwd(), 'scripts', 'timestamp-guard.mjs')
const RACE_FIXTURE = join(process.cwd(), 'scripts', 'fixtures', 'timestamp-guard-302ms-race.json')

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
  it('returns the first text block of the last assistant message after the last tool result', () => {
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
      line('user', [{ type: 'tool_result' }], { id: '', sidechain: true }),
    ].join('\n')
    expect(extractLastAssistantText(jsonl)).toBe('main reply')
  })
  it('survives corrupt lines and returns null on empty/garbage input', () => {
    expect(extractLastAssistantText('not json\n{"broken')).toBe(null)
    expect(extractLastAssistantText('')).toBe(null)
    expect(extractLastAssistantText(`not json\n${assistantText('ok')}`)).toBe('ok')
  })

  it('does not return intermediate narration while the final reply row is pending', () => {
    const fixture = JSON.parse(readFileSync(RACE_FIXTURE, 'utf8'))
    const pending = fixture.rowsBeforeFinalReply.map(JSON.stringify).join('\n')
    expect(extractLastAssistantText(pending)).toBe(null)
    expect(inspectLastAssistantText(pending)).toEqual({ text: null, hasToolResultBoundary: true })
  })

  it('returns the final stamped reply once the raced row is flushed', () => {
    const fixture = JSON.parse(readFileSync(RACE_FIXTURE, 'utf8'))
    const flushed = [...fixture.rowsBeforeFinalReply, fixture.finalReplyRow].map(JSON.stringify).join('\n')
    expect(extractLastAssistantText(flushed)).toBe(fixture.finalReplyRow.message.content[0].text)
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
    expect(verdict?.reason).toContain('"Alles erledigt, Tests grün."')
  })
  it('blocks a stale stamp (hours off) and a yesterday stamp', () => {
    const staleText = '**Donnerstag, 23.07.2026, 07:00** Report.'
    const stale = evaluate({ lastText: staleText, now })
    expect(stale?.decision).toBe('block')
    expect(stale?.reason).toContain(JSON.stringify(staleText))
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
      windowsHide: true,
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

  it('replays the measured 302 ms race without judging the intermediate narration', () => {
    const fixture = JSON.parse(readFileSync(RACE_FIXTURE, 'utf8'))
    // The 302 ms is READ OFF the two real rows, never off a copy of the figure:
    // the reply row's own timestamp against the Stop feedback row's own.
    expect(
      Date.parse(fixture.stopFeedbackRow.timestamp) - Date.parse(fixture.finalReplyRow.timestamp),
    ).toBe(302)

    // The fixture is a REAL slice, so the rows carry their own ids and flags and
    // the narration that was wrongly judged is genuinely in it — not implied.
    const narration = fixture.rowsBeforeFinalReply[0]
    expect(narration.message.id).toBe('msg_011CeDW3R8CZhKYQ7jp2sAyw')
    expect(narration.isSidechain).toBe(false)
    expect(narration.message.content[0].text).toBe(fixture.narrationText)
    expect(fixture.narrationText).toBe('Jetzt die \u00c4nderung.')

    const p = join(dir, 'measured-race.jsonl')
    writeFileSync(p, fixture.rowsBeforeFinalReply.map(JSON.stringify).join('\n') + '\n')
    expect(runGuard({ transcript_path: p }, { session: fixture.sessionId })).toBe(null)

    const flushed = [...fixture.rowsBeforeFinalReply, fixture.finalReplyRow].map(JSON.stringify).join('\n')
    expect(
      evaluate({
        lastText: extractLastAssistantText(flushed),
        now: new Date(fixture.stopFeedbackRow.timestamp),
      }),
    ).toBe(null)
  })

  it('pins the regression: without the tool-result boundary the narration is what gets judged', () => {
    const fixture = JSON.parse(readFileSync(RACE_FIXTURE, 'utf8'))
    const pending = fixture.rowsBeforeFinalReply.map(JSON.stringify).join('\n')

    // The slice may skip rows, but it may not skip a row that would have CHANGED
    // the answer. The elided middle was measured, not assumed: it holds no
    // assistant text of any kind, so the reduced fixture selects exactly what the
    // full 1,259-row transcript selected.
    expect(fixture.source.elidedRows).toMatchObject({
      from: 712,
      to: 929,
      count: 218,
      assistantTextRows: 0,
      sidechainTextRows: 0,
    })

    // The superseded rule verbatim: the first text block of the last assistant
    // message carrying text, with no boundary at the last tool_result.
    let preFix = null
    for (const row of pending.split('\n')) {
      const entry = JSON.parse(row)
      const content = entry.message && entry.message.content
      if (entry.type !== 'assistant' || entry.isSidechain || !Array.isArray(content)) continue
      const block = content.find((b) => b && b.type === 'text' && b.text.trim() !== '')
      if (block) preFix = block.text
    }
    expect(preFix).toBe(fixture.narrationText)

    // …and judging it blocks. The refusal the user was actually served is kept
    // verbatim in the fixture, and it is the NO-MATCH branch: it asserts the
    // reply did not begin with the stamp and names no line it saw. Word-for-word
    // equality is not available and would be the wrong test — this point CHANGED
    // that wording on purpose — so what is pinned is the branch and the defect:
    // the served text quotes nothing, the regenerated one quotes the narration.
    const served = String(fixture.stopFeedbackRow.message.content)
    expect(served).toContain('Your last reply does NOT begin with it.')
    expect(served).not.toContain('Jetzt die \u00c4nderung.')

    const verdict = evaluate({
      lastText: preFix,
      now: new Date(fixture.stopFeedbackRow.timestamp),
    })
    expect(verdict?.decision).toBe('block')
    expect(verdict?.reason).toContain('does NOT begin with the timestamp')
    expect(verdict?.reason).toContain('"Jetzt die \u00c4nderung."')

    // The landed rule returns no judgement at all on the same rows.
    expect(inspectLastAssistantText(pending)).toEqual({ text: null, hasToolResultBoundary: true })
  })

  it('measures the residual tool-free-turn race the core documents: a false ALLOW', () => {
    // The core's doc comment claims the leftover exposure is under-enforcement,
    // not a fabricated fault. Prove it rather than assert it: a previous turn
    // that ended with a tool result and a stamped reply, then a new tool-free
    // turn whose reply has not been flushed yet.
    const now = new Date('2026-08-20T06:15:18.706Z')
    const recent = berlinStamp(new Date(now.getTime() - 4 * 60000))
    const raced = [
      line('assistant', [{ type: 'tool_use' }], { id: 'prev-a' }),
      line('user', [{ type: 'tool_result' }], { id: 'prev-r' }),
      assistantText(`**${recent}** Vorherige Antwort.`, { id: 'prev-final' }),
    ].join('\n')

    // The previous turn's reply is what gets judged…
    expect(extractLastAssistantText(raced)).toBe(`**${recent}** Vorherige Antwort.`)
    // …and it passes, so the unflushed new reply is never checked at all.
    expect(evaluate({ lastText: extractLastAssistantText(raced), now })).toBe(null)

    // Only once the previous turn falls outside the window does it flip into the
    // false refusal — the far rarer half of the residual.
    const old = berlinStamp(new Date(now.getTime() - (MINUTES_BACK + 5) * 60000))
    const stale = [
      line('assistant', [{ type: 'tool_use' }], { id: 'prev-a' }),
      line('user', [{ type: 'tool_result' }], { id: 'prev-r' }),
      assistantText(`**${old}** Vorherige Antwort.`, { id: 'prev-final' }),
    ].join('\n')
    expect(evaluate({ lastText: extractLastAssistantText(stale), now })?.decision).toBe('block')
  })

  it('still blocks genuinely unstamped and stale final replies after a tool result', () => {
    const fixture = JSON.parse(readFileSync(RACE_FIXTURE, 'utf8'))
    const p = join(dir, 'bad-finals.jsonl')
    const writeFinal = (text) => {
      const final = {
        ...fixture.finalReplyRow,
        message: { ...fixture.finalReplyRow.message, content: [{ type: 'text', text }] },
      }
      writeFileSync(
        p,
        [...fixture.rowsBeforeFinalReply, final].map(JSON.stringify).join('\n') + '\n',
      )
    }

    writeFinal('Fertig — ohne Zeitstempel.')
    const unstamped = runGuard({ transcript_path: p }, { session: 'race-unstamped' })
    expect(unstamped?.decision).toBe('block')
    expect(unstamped?.reason).toContain('"Fertig — ohne Zeitstempel."')

    writeFinal('**Donnerstag, 20.08.2026, 05:14** · Kontext: 186.738 Tokens')
    expect(runGuard({ transcript_path: p }, { session: 'race-stale' })?.decision).toBe('block')
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
      windowsHide: true,
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

// THE SECOND HALF OF THE HEADER (user 20.08.2026, "schon wieder verschwunden").
// The reply header is the stamp AND the context reading. The reading kept
// disappearing for one mechanical reason: a blocked turn is told to begin "with
// exactly this line", and the line handed over carried only the stamp — so
// every guard that fired silently amputated the header it was enforcing.
describe('the context reading in the header', () => {
  const stamp = () => `**${berlinStamp()}**`
  const SUFFIX = ' · Kontext: 115.942 Tokens'

  it('hands over the WHOLE header in the line to copy, not just the stamp', () => {
    const verdict = evaluate({ lastText: 'no stamp at all', headerSuffix: SUFFIX })
    expect(verdict?.decision).toBe('block')
    expect(verdict.reason).toContain(SUFFIX)
  })

  it('hands over the unknown reading rather than nothing when nothing measured', () => {
    const verdict = evaluate({ lastText: 'no stamp at all', headerSuffix: ' · Kontext: -- Tokens' })
    expect(verdict.reason).toContain(' · Kontext: -- Tokens')
  })

  it('blocks a reply that carries the stamp but drops the reading', () => {
    const lastText = `${stamp()} Kurze Bestätigung.`
    const verdict = evaluate({
      lastText,
      headerSuffix: SUFFIX,
      enforceSuffix: true,
    })
    expect(verdict?.decision).toBe('block')
    expect(verdict.reason).toContain('CONTEXT READING')
    expect(verdict.reason).toContain(JSON.stringify(lastText))
  })

  it('allows the complete header', () => {
    expect(
      evaluate({
        lastText: `${stamp()}${SUFFIX}\n\nKurze Bestätigung.`,
        headerSuffix: SUFFIX,
        enforceSuffix: true,
      }),
    ).toBe(null)
  })

  // The guard reads the transcript at turn END, which may already show a newer
  // usage record than the prompt hook handed over. Blocking a reply for copying
  // the number it was given would be absurd, so the SHAPE is judged, not the value.
  it('accepts a reading that differs from the one handed over', () => {
    expect(
      evaluate({
        lastText: `${stamp()} · Kontext: 7.001 Tokens\n\nText.`,
        headerSuffix: SUFFIX,
        enforceSuffix: true,
      }),
    ).toBe(null)
  })

  it('accepts the unknown reading in the reply', () => {
    expect(
      evaluate({
        lastText: `${stamp()} · Kontext: -- Tokens`,
        headerSuffix: SUFFIX,
        enforceSuffix: true,
      }),
    ).toBe(null)
  })

  // Where nothing measured the context, demanding the reading back would insist
  // on a value nobody supplied. The line still carries it; the block does not.
  it('does not demand the reading when no measurement exists', () => {
    expect(evaluate({ lastText: `${stamp()} Text.`, headerSuffix: ' · Kontext: -- Tokens' })).toBe(null)
  })

  it('reads only the FIRST line, so a reading further down does not count', () => {
    const verdict = evaluate({
      lastText: `${stamp()}\n\nIrgendwo später · Kontext: 12.000 Tokens`,
      headerSuffix: SUFFIX,
      enforceSuffix: true,
    })
    expect(verdict?.decision).toBe('block')
  })

  it('the shape accepts both a grouped number and the unknown reading', () => {
    expect(HEADER_SUFFIX_RE.test(' · Kontext: 1.234.567 Tokens')).toBe(true)
    expect(HEADER_SUFFIX_RE.test(' · Kontext: -- Tokens')).toBe(true)
    expect(HEADER_SUFFIX_RE.test(' · Kontext: Tokens')).toBe(false)
  })

  // The preflight names the same line the Stop hook will judge, so the two
  // cannot drift into demanding different headers.
  it('the preflight condition names the whole header too', () => {
    expect(timestampReplyCondition(new Date(), SUFFIX)).toContain(SUFFIX)
  })
})
