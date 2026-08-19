import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  LIMITS,
  auditGuide,
  parseEntries,
  sliceSection,
  strayLines,
  formatViolations,
} from './guide-brevity-core.mjs'
import { gatherGuideBrevityInputs } from './guide-brevity-guard.mjs'

// Vitest rewrites import.meta.url, so resolve from the repo root it runs in.
const GUIDE = resolve(process.cwd(), 'docs/analysis_de/vibe-coding-anleitung.md')

const entry = (title, riskLines, withPrompt = true) =>
  [
    `- **${title}** ${'Risiko. '.repeat(4)}`,
    ...Array.from({ length: riskLines - 1 }, () => '  Weitere Risikozeile.'),
    ...(withPrompt ? ['  → *Prompt:* „Etabliere einen Mechanismus, der das verhindert."'] : []),
  ].join('\n')

// A test document is padded with compliant filler entries so it clears the
// minEntries sanity check — otherwise every fixture would trip the structural
// guard and drown the property under test. Tests that target that check pass
// their own lax limits instead.
const filler = Array.from({ length: LIMITS.minEntries }, (_, i) =>
  `- **Füller ${i}** Ein Risiko.\n  → *Prompt:* „Etabliere einen Mechanismus."`,
)
const rawDoc = (...entries) => `# Titel\n\n## Die häufigsten Fallstricke\n\n${entries.join('\n\n')}\n`
const doc = (...entries) => rawDoc(...entries, ...filler)

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

  it('allows a bare directory convention but flags a real repository path', () => {
    const generic = doc('- **Titel** Leg Notizen unter docs/ ab und halte src/ sauber.\n  → *Prompt:* „Tu es."')
    expect(auditGuide(generic).violations.filter((v) => v.kind === 'project-specific')).toHaveLength(0)
    const real = doc('- **Titel** Das steht in scripts/verify/flow.mjs.\n  → *Prompt:* „Tu es."')
    expect(auditGuide(real).violations.some((v) => v.kind === 'project-specific')).toBe(true)
  })

  it('does not police the German idiom about the elephant in the room', () => {
    const d = doc('- **Titel** Sprich den Elefanten im Raum an.\n  → *Prompt:* „Tu es."')
    expect(auditGuide(d).violations.filter((v) => v.kind === 'project-specific')).toHaveLength(0)
  })

  it('reports each marker once per line, not once per match', () => {
    const d = doc('- **Titel** Am 01.01.2020 und am 02.02.2021.\n  → *Prompt:* „Tu es."')
    expect(auditGuide(d).violations.filter((v) => v.kind === 'project-specific').length).toBe(1)
  })
})

// The failure mode this guard exists to avoid is being silently toothless: if
// the section is renamed or the entry format changes, every per-entry check
// would inspect an empty list and report success.
describe('auditGuide — structural sanity', () => {
  const lax = { ...LIMITS, minEntries: 2 }

  it('flags a renamed pitfall section instead of passing vacuously', () => {
    const gutted = doc(entry('A', 2, false), entry('B', 2, false)).replace(
      '## Die häufigsten Fallstricke',
      '## Themen',
    )
    const { ok, violations } = auditGuide(gutted, lax)
    expect(ok).toBe(false)
    expect(violations.map((v) => v.kind)).toContain('structure')
  })

  it('flags a section with too few recognised entries', () => {
    const { violations } = auditGuide(rawDoc(entry('Nur einer', 2)), lax)
    expect(violations.map((v) => v.kind)).toContain('structure')
  })

  it('flags prose smuggled between the bullets', () => {
    const d = doc(entry('A', 2), 'Eine lange Geschichte ohne Bullet.', entry('B', 2))
    const { violations } = auditGuide(d, lax)
    expect(violations.map((v) => v.kind)).toContain('stray-prose')
  })

  it('flags a bullet written without its bold title (it would escape every check)', () => {
    const { violations } = auditGuide(doc(entry('A', 2), '- Ohne Fettdruck, also kein Eintrag.', entry('B', 2)), lax)
    expect(violations.map((v) => v.kind)).toContain('stray-prose')
  })

  it('treats blank lines and the section rule as formatting, not stray prose', () => {
    expect(strayLines(sliceSection(`# T\n\n## Fallstricke\n\n- **A** x\n  → *Prompt:* „y"\n\n---\n`, /Fallstrick/i))).toEqual([])
  })

  it('audits CRLF exactly like LF', () => {
    const d = doc(entry('A', 2), entry('B', 2))
    expect(auditGuide(d.replace(/\n/g, '\r\n'), lax)).toEqual(auditGuide(d, lax))
  })

  it('does not throw on an empty or nullish document', () => {
    expect(auditGuide('').ok).toBe(false) // no section → structure violation
    expect(() => auditGuide(null)).not.toThrow()
  })
})

describe('auditGuide — budget boundaries', () => {
  it('allows a risk exactly at the limit and rejects one line more', () => {
    expect(auditGuide(doc(entry('Grenze', LIMITS.maxRiskLines))).violations
      .filter((v) => v.kind === 'risk-too-long')).toHaveLength(0)
    expect(auditGuide(doc(entry('Drüber', LIMITS.maxRiskLines + 1))).violations
      .filter((v) => v.kind === 'risk-too-long')).toHaveLength(1)
  })

  it('leaves the fingerprint comment out of BOTH budgets', () => {
    const d = doc(entry('A', 2))
    const withFp = `${d}<!-- GUIDE-FINGERPRINT: ${'a'.repeat(64)} -->\n`
    const tight = { ...LIMITS, maxLines: d.split('\n').length, minEntries: 1 }
    expect(auditGuide(d, tight).violations.filter((v) => v.kind === 'length')).toHaveLength(0)
    expect(auditGuide(withFp, tight).violations.filter((v) => v.kind === 'length')).toHaveLength(0)
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
    const s = sliceSection(rawDoc('- **A** x\n  y', '- **B** z\n  → *Prompt:* „q"'), /Fallstrick/i)
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

describe('guide-brevity ownership', () => {
  const overBudget = doc(entry('Zu lang', 2)) + `${'zusatz '.repeat(4000)}\n`

  it('stands down when another live session owns the batch', () => {
    const gathered = gatherGuideBrevityInputs({
      sessionId: 'non-owner',
      paused: false,
      otherOwner: true,
      guideExists: true,
      guideText: overBudget,
    })
    expect(gathered).toMatchObject({
      applicable: false,
      why: 'another live session owns the batch lock',
      cause: 'not-lock-owner',
    })
  })

  it('still gives the owner the unchanged budget verdict', () => {
    const gathered = gatherGuideBrevityInputs({
      sessionId: 'owner',
      paused: false,
      otherOwner: false,
      guideExists: true,
      guideText: overBudget,
    })
    expect(gathered.applicable).toBe(true)
    const verdict = auditGuide(gathered.inputs.guideText)
    expect(verdict.ok).toBe(false)
    expect(verdict.violations.map((v) => v.kind)).toContain('length')
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
