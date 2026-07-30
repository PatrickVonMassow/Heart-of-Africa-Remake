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
  ENFORCED_CLAIMS,
  REMINDER_CHAR_BUDGET,
  REMINDER_COMMANDS,
  UNENFORCEABLE_DUTIES,
  boardReminderText,
} from './dashboard-reminder-core.mjs'
import { REQUIRED_SECTIONS, structureViolations } from './board-structure-core.mjs'
import { auditDashboard } from './dashboard-guard-core.mjs'

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
    expect(hook).toContain('console.log(boardReminderText(mtimeNote))')
    expect(hook).not.toContain('[dashboard-reminder] PFLICHT')
  })
})
