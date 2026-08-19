// Point 436 — the injected reminder may not restate what a gate enforces, and
// may not drop what no gate can.
//
// This text is injected into EVERY user prompt, so it is the most expensive text
// in the project. Most of it repeated rules that `board-structure-core` and
// `dashboard-guard-core` already REFUSE to let past a publish. Both directions
// need pinning: a shortening that dropped the remaining duty would be worse than
// the repetition it removed.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CONTRACT_MEMORY,
  CONTEXT_LEVEL_CHAR_BUDGET,
  ENFORCED_CLAIMS,
  PROMPT_CHAR_BUDGET,
  PROMPT_ENFORCED_CLAIMS,
  REMINDER_CHAR_BUDGET,
  REMINDER_COMMANDS,
  STAND_DOWN_TEXT,
  UNENFORCEABLE_DUTIES,
  boardReminderText,
  contextLevelSuffix,
  hookInjectionText,
  promptInjectionText,
} from './dashboard-reminder-core.mjs'
import { parseContextTokens } from './context-watermark-core.mjs'
import { REQUIRED_SECTIONS, structureViolations } from './board-structure-core.mjs'
import { auditDashboard, evaluate as dashboardEvaluate } from './dashboard-guard-core.mjs'
import { berlinStamp, evaluate as timestampEvaluate } from './timestamp-guard-core.mjs'
import { green } from './dashboard-guard-fixtures.mjs'

const SCRIPTS = dirname(fileURLToPath(import.meta.url))

describe('the injected board reminder (point 436)', () => {
  it('restates no rule a gate already enforces', () => {
    const text = boardReminderText()
    for (const claim of ENFORCED_CLAIMS) {
      expect(claim.pattern.test(text), `${claim.id} is enforced by ${claim.by} — do not restate it`).toBe(false)
    }
  })

  it('the gates it defers to really do enforce those rules', () => {
    // The deletion is only safe while the gate exists; if one is ever removed,
    // this case fails and the sentence has to come back.
    expect(REQUIRED_SECTIONS).toHaveLength(4)
    const codes = structureViolations('<main><h2>Nur eine</h2></main>').map((v) => v.code)
    expect(codes).toContain('sections-wrong')

    const openCard =
      '<main><h1>B</h1>\n<h2>Woran ich gerade arbeite</h2>\n<details open><summary>' +
      '<span class="t">7 — Sieben</span></summary><div class="body">Status (Stand 10:00): x.</div>' +
      '</details>\n<h2>Von dir zu klären</h2>\n<h2>Warteschlange</h2>\n<h2>Erledigt</h2>\n</main>'
    const audit = auditDashboard(openCard, { open: [7], done: [] }).map((v) => v.code)
    expect(audit).toContain('auto-open')
  })

  it('still carries every duty no mechanism can check', () => {
    const text = boardReminderText()
    for (const duty of UNENFORCEABLE_DUTIES) expect(text, duty).toContain(duty)
  })

  it('still hands over every command', () => {
    const text = boardReminderText()
    for (const cmd of REMINDER_COMMANDS) expect(text, cmd).toContain(cmd)
  })

  it('points at the ONE binding statement of the structure instead of repeating it', () => {
    expect(boardReminderText()).toContain(CONTRACT_MEMORY)
  })

  it('appends the board-age note verbatim and stays inside its measured budget', () => {
    expect(boardReminderText(' Letzte Dashboard-Dateiänderung vor ~4 min.')).toContain('vor ~4 min.')
    // The measurement IS the point of this change: 2153 characters before.
    expect(boardReminderText().length).toBeLessThanOrEqual(REMINDER_CHAR_BUDGET)
    expect(REMINDER_CHAR_BUDGET).toBeLessThan(2153)
  })

  it('is what the hook actually injects — no second copy of the prose', () => {
    const hook = readFileSync(join(SCRIPTS, 'dashboard-reminder-hook.mjs'), 'utf8')
    expect(hook).toContain('process.stdout.write(hookInjectionText({ mtimeNote, contextTokens }))')
    expect(hook).not.toContain('[dashboard-reminder] PFLICHT')
  })
})

describe('the WHOLE per-prompt injection (point 440)', () => {
  it('restates no rule a gate already enforces', () => {
    const text = promptInjectionText()
    for (const claim of PROMPT_ENFORCED_CLAIMS) {
      expect(claim.pattern.test(text), `${claim.id} is enforced by ${claim.by} — do not restate it`).toBe(false)
    }
  })

  it('the timestamp gate really blocks, and hands the exact line', () => {
    // The two timestamp blocks were deleted on the strength of THIS behaviour:
    // if the guard ever stopped blocking, or stopped handing the line over, the
    // prompt would have to say it again.
    const now = new Date('2026-08-06T19:00:00Z')
    const verdict = timestampEvaluate({ lastText: 'Hier ist das Ergebnis.', now })
    expect(verdict.decision).toBe('block')
    expect(verdict.reason).toContain(`**${berlinStamp(now)}**`)
    // …and it is the LONG form, the one the deleted blocks got wrong.
    expect(berlinStamp(now)).toMatch(/^[A-Za-zÄÖÜäöüß]+, \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/)
  })

  it('the focus gate really blocks, and its own text carries the remedy', () => {
    const verdict = dashboardEvaluate(green({ pending: { sessionId: 'sess-a', at: 1500 } }))
    expect(verdict.decision).toBe('block')
    expect(verdict.reason).toMatch(/RECONCILE REQUIRED/)
    for (const cmd of ['node scripts/focus.mjs confirm', 'node scripts/focus.mjs set', '--synced']) {
      expect(verdict.reason, cmd).toContain(cmd)
    }
  })

  it('holds the whole injection to its measured budget', () => {
    // MEASURED before the cut: 1771 characters per prompt (139 timestamp line +
    // 843 board obligation + 427 focus block + 358 banner + newlines).
    const text = hookInjectionText({ contextTokens: Number.MAX_SAFE_INTEGER })
    expect(text.length).toBeLessThanOrEqual(PROMPT_CHAR_BUDGET)
    expect(hookInjectionText({ mtimeNote: ' Letzte Dashboard-Dateiänderung vor ~4 min.' })).toContain('vor ~4 min.')
    expect(CONTEXT_LEVEL_CHAR_BUDGET).toBeLessThanOrEqual(80)
    expect(PROMPT_CHAR_BUDGET).toBeLessThan(1771)
  })

  it('still carries the board obligation — the cut removed restatement, not duty', () => {
    for (const duty of UNENFORCEABLE_DUTIES) expect(promptInjectionText(), duty).toContain(duty)
    for (const cmd of REMINDER_COMMANDS) expect(promptInjectionText(), cmd).toContain(cmd)
  })

  it('the hook no longer builds a timestamp of its own', () => {
    const hook = readFileSync(join(SCRIPTS, 'dashboard-reminder-hook.mjs'), 'utf8')
    // A short-form stamp is the exact thing TIMESTAMP_RE rejects.
    expect(hook).not.toContain('dateStyle')
    expect(hook).not.toContain('[timestamp] PFLICHT')
    expect(hook).not.toContain('[focus-guard]')
  })
})

describe('the context level in the answer header', () => {
  const readableTranscript = [
    JSON.stringify({
      type: 'assistant',
      isSidechain: false,
      timestamp: '2026-08-19T18:35:00.000Z',
      message: {
        usage: {
          input_tokens: 120000,
          cache_read_input_tokens: 3456,
          cache_creation_input_tokens: 78,
        },
      },
    }),
    JSON.stringify({
      type: 'assistant',
      isSidechain: true,
      timestamp: '2026-08-19T18:36:00.000Z',
      message: { usage: { input_tokens: 999999 } },
    }),
  ].join('\n')

  const transcriptTokens = (text) => parseContextTokens(text)?.tokens ?? null

  it.each([
    ['owner', false],
    ['stand-down', true],
  ])('puts a readable transcript measurement in the %s hook text', (_name, standDown) => {
    const text = hookInjectionText({ standDown, contextTokens: transcriptTokens(readableTranscript) })
    expect(text).toContain('[context-level] Kopfzeilen-Suffix: · Kontext: 123534 Tokens')
    expect(text).toContain(standDown ? STAND_DOWN_TEXT : '[dashboard-reminder]')
  })

  it.each([
    ['owner', false],
    ['stand-down', true],
  ])('reports an unreadable transcript honestly in the %s hook text', (_name, standDown) => {
    const text = hookInjectionText({ standDown, contextTokens: transcriptTokens('{not json') })
    expect(text).toContain('[context-level] Kopfzeilen-Suffix: · Kontext: -- Tokens')
    expect(text).not.toContain('Kontext: 0 Tokens')
  })

  it('keeps the produced header acceptable to the timestamp guard', () => {
    const now = new Date('2026-08-19T16:36:00.000Z')
    const header = `**${berlinStamp(now)}**${contextLevelSuffix(transcriptTokens(readableTranscript))}`
    expect(timestampEvaluate({ lastText: header, now })).toBe(null)
  })

  it('has the live hook read through the shared context parser and output the pure branch text', () => {
    const hook = readFileSync(join(SCRIPTS, 'dashboard-reminder-hook.mjs'), 'utf8')
    expect(hook).toContain("import { parseContextTokens } from './context-watermark-core.mjs'")
    expect(hook).toContain('process.stdout.write(hookInjectionText({ standDown: true, contextTokens }))')
    expect(hook).toContain('process.stdout.write(hookInjectionText({ mtimeNote, contextTokens }))')
  })
})
