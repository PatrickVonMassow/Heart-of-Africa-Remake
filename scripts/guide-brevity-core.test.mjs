import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LIMITS, auditGuide, parseEntries, sliceSection, formatViolations } from './guide-brevity-core.mjs'

// Vitest rewrites import.meta.url, so resolve from the repo root it runs in.
const GUIDE = resolve(process.cwd(), 'docs/analysis_de/vibe-coding-anleitung.md')

const entry = (title, riskLines, withPrompt = true) =>
  [
    `- **${title}** ${'Risiko. '.repeat(4)}`,
    ...Array.from({ length: riskLines - 1 }, () => '  Weitere Risikozeile.'),
    ...(withPrompt ? ['  → *Prompt:* „Etabliere einen Mechanismus, der das verhindert."'] : []),
  ].join('\n')

const doc = (...entries) => `# Titel\n\n## Die häufigsten Fallstricke\n\n${entries.join('\n\n')}\n`

describe('auditGuide — budgets', () => {
  it('passes a compact entry', () => {
    expect(auditGuide(doc(entry('Kurz', 2))).ok).toBe(true)
  })

  it('flags an entry that narrates instead of naming the risk', () => {
    const { ok, violations } = auditGuide(doc(entry('Lang', LIMITS.maxRiskLines + 2)))
    expect(ok).toBe(false)
    expect(violations.map((v) => v.kind)).toContain('risk-too-long')
  })

  it('flags an entry over the total entry budget', () => {
    const { violations } = auditGuide(doc(entry('Sehr lang', LIMITS.maxEntryLines + 3)))
    expect(violations.map((v) => v.kind)).toContain('entry-too-long')
  })

  it('flags a risk with no prompt — a tip must be actionable', () => {
    const { violations } = auditGuide(doc(entry('Ohne Lösung', 2, false)))
    expect(violations.map((v) => v.kind)).toContain('no-prompt')
  })

  it('accepts *Mechanismus:* as the action line too', () => {
    const d = doc('- **Mit Mechanismus** Risiko.\n  → *Mechanismus:* Ein Check, der anschlägt.')
    expect(auditGuide(d).ok).toBe(true)
  })

  it('enforces the whole-document line and word budgets', () => {
    const tiny = { ...LIMITS, maxLines: 3, maxWords: 5 }
    const { violations } = auditGuide(doc(entry('Kurz', 2)), tiny)
    expect(violations.filter((v) => v.kind === 'length').length).toBe(2)
  })
})

describe('auditGuide — project-specific markers', () => {
  const cases = [
    ['ein Datum', 'Am 24.07.2026 ging etwas schief.'],
    ['eine Punkt-Nummer', 'Siehe Punkt 302 der Aufgabenliste.'],
    ['einen Repo-Pfad', 'Das steht in scripts/verify/flow.mjs.'],
    ['den Technologie-Stack', 'Auf dem WebGPU-Backend war es kaputt.'],
    ['Spielinhalte', 'Das Krokodil riss ein Junges.'],
    ['eine Anekdoten-Einleitung', 'In diesem Projekt passierte Folgendes.'],
  ]
  for (const [what, line] of cases) {
    it(`flags ${what}`, () => {
      const { ok, violations } = auditGuide(doc(`- **Titel** ${line}\n  → *Prompt:* „Tu etwas."`))
      expect(ok).toBe(false)
      expect(violations.some((v) => v.kind === 'project-specific')).toBe(true)
    })
  }

  it('leaves the generic filenames the guide teaches alone', () => {
    const d = doc('- **Titel** Halte `design.md` und `TASKS.md` aktuell.\n  → *Prompt:* „Tu es."')
    expect(auditGuide(d).ok).toBe(true)
  })

  it('reports each marker once per line, not once per match', () => {
    const d = doc('- **Titel** Am 01.01.2020 und am 02.02.2021.\n  → *Prompt:* „Tu es."')
    expect(auditGuide(d).violations.filter((v) => v.kind === 'project-specific').length).toBe(1)
  })
})

describe('parsing helpers', () => {
  it('slices a section and stops at the next heading', () => {
    const s = sliceSection('# T\n\n## Fallstricke\n\na\nb\n\n## Danach\n\nc\n', /Fallstrick/i)
    expect(s.map((l) => l.text)).toEqual(['', 'a', 'b', ''])
    expect(s[1].line).toBe(5) // real position in the document
  })

  it('returns nothing for a missing section', () => {
    expect(sliceSection('# T\n\n## Anderes\n\na\n', /Fallstrick/i)).toEqual([])
  })

  it('groups indented continuation lines into their entry and drops trailing blanks', () => {
    const s = sliceSection(doc('- **A** x\n  y', '- **B** z\n  → *Prompt:* „q"'), /Fallstrick/i)
    const entries = parseEntries(s)
    expect(entries.map((e) => e.title)).toEqual(['A', 'B'])
    expect(entries[0].lines).toEqual(['- **A** x', '  y'])
  })
})

describe('formatViolations', () => {
  it('is empty when nothing is wrong', () => {
    expect(formatViolations([])).toBe('')
  })

  it('points at the retrospective as the place to move text to', () => {
    const msg = formatViolations(auditGuide(doc(entry('Lang', 9))).violations)
    expect(msg).toContain('retrospektive-zusammenarbeit.md')
    expect(msg).toMatch(/Zeile \d+/)
  })
})

// THE ACTUAL GATE: the real document must satisfy its own budget on every unit
// run, so the guide cannot drift back into a chronicle between closings.
describe('the real vibe-coding guide', () => {
  it('stays a short, project-neutral beginner guide', () => {
    const { ok, violations } = auditGuide(readFileSync(GUIDE, 'utf8'))
    expect(ok, `\n${formatViolations(violations)}\n`).toBe(true)
  })
})
