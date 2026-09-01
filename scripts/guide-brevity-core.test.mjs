import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  LIMITS,
  auditGuide,
  measureGuide,
  parseEntries,
  sliceSection,
  strayLines,
  formatViolations,
} from './guide-brevity-core.mjs'
import { gatherGuideBrevityInputs } from './guide-brevity-guard.mjs'

// Vitest rewrites import.meta.url, so resolve from the repo root it runs in.
const GUIDE = resolve(process.cwd(), 'docs/analysis_de/vibe-coding-anleitung.md')
const CORE = resolve(process.cwd(), 'scripts/guide-brevity-core.mjs')

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
const metaRules = `## Drei Meta-Regeln, die alles zusammenhalten

1. **Root-Cause vor Fix.** Eine vermutete Ursache ist ein Kandidat.
   > *Prompt:* „Versuche zuerst, sie unabhängig zu widerlegen.
   > Schreib vorher, welcher Befund sie zur Tatsache macht.
   > Hält sie stand, darf sie wahr sein. Wer den Auftrag vergibt, misst **blind mit**."

2. **Nutzer-Artefakte sind Verträge.** Ändere ihre Struktur nicht ungefragt.

3. **Parallel arbeiten geht nur mit Isolierung.** Trenne die Arbeitskopien.`
const rawDoc = (...entries) =>
  `# Titel\n\n## Die häufigsten Fallstricke\n\n${entries.join('\n\n')}\n\n${metaRules}\n`
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

describe('auditGuide — falsification meta-rule', () => {
  it('fails when the root-cause rule loses its independent falsification attempt', () => {
    const weakened = doc(entry('A', 2)).replace(
      'Versuche zuerst, sie unabhängig zu widerlegen.',
      'Bestätige die Vermutung zuerst.',
    )
    const { ok, violations } = auditGuide(weakened)

    expect(ok).toBe(false)
    expect(violations).toContainEqual(expect.objectContaining({
      kind: 'meta-rule',
      detail: expect.stringContaining('unabhängigen Widerlegungsversuch'),
    }))
  })

  it('fails when a true hypothesis is no longer allowed to survive the attempt', () => {
    const weakened = doc(entry('A', 2)).replace(
      'Hält sie stand, darf sie wahr sein.',
      'Danach muss die Hypothese verworfen werden.',
    )

    expect(auditGuide(weakened).violations).toContainEqual(expect.objectContaining({
      kind: 'meta-rule',
      detail: expect.stringContaining('wahre Hypothese'),
    }))
  })

  it('fails when the assigning party no longer measures blindly alongside', () => {
    const weakened = doc(entry('A', 2)).replace(
      'Wer den Auftrag vergibt, misst **blind mit**.',
      'Wer den Auftrag vergibt, wartet auf das Ergebnis.',
    )

    expect(auditGuide(weakened).violations).toContainEqual(expect.objectContaining({
      kind: 'meta-rule',
      detail: expect.stringContaining('blinde Gegenmessung'),
    }))
  })

  it('fails when a suspicion loses its promotion criterion', () => {
    const weakened = doc(entry('A', 2)).replace(
      'Schreib vorher, welcher Befund sie zur Tatsache macht.',
      'Prüfe die Vermutung später noch einmal.',
    )

    expect(auditGuide(weakened).violations).toContainEqual(expect.objectContaining({
      kind: 'meta-rule',
      detail: expect.stringContaining('Beförderungskriterium'),
    }))
  })

  it('does not accept the required words when they are moved to a neighbouring rule', () => {
    const misplaced = doc(entry('A', 2))
      .replace('Versuche zuerst, sie unabhängig zu widerlegen.', 'Prüfe die Vermutung.')
      .replace(
        '2. **Nutzer-Artefakte sind Verträge.**',
        '2. **Nutzer-Artefakte sind Verträge.** Versuche zuerst, sie unabhängig zu widerlegen.',
      )

    expect(auditGuide(misplaced).violations).toContainEqual(expect.objectContaining({
      kind: 'meta-rule',
      detail: expect.stringContaining('unabhängigen Widerlegungsversuch'),
    }))
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
    const measured = measureGuide(d)
    const tight = { ...LIMITS, maxLines: measured.lines, maxWords: measured.words, minEntries: 1 }
    expect(auditGuide(d, tight).violations.filter((v) => v.kind === 'length')).toHaveLength(0)
    expect(auditGuide(withFp, tight).violations.filter((v) => v.kind === 'length')).toHaveLength(0)
  })

  it('leaves every line and word of a multi-line bookkeeping comment out of both budgets', () => {
    const d = doc(entry('A', 2))
    const withFp = `${d}<!-- GUIDE-FINGERPRINT:\n${'bookkeeping '.repeat(100)}\n\n-->\n`
    expect(measureGuide(withFp)).toEqual(measureGuide(d))
  })

  it('counts every line and word after an unterminated comment opener', () => {
    const malformed = 'line one\nline two <!--\nline three\nline four\n'
    expect(measureGuide(malformed)).toEqual(measureGuide('line one\nline two \nline three\nline four\n'))
    // FOUR lines, not five: the closing newline ends line four rather than
    // opening a fifth. This case pinned the phantom until 31.08.2026.
    expect(measureGuide(malformed)).toEqual({ lines: 4, words: 8 })
  })

  it('reads a closing newline as the end of the last line, not as another one', () => {
    // The ceilings are ratcheted against this count, so a phantom line here
    // silently bought the guide a line of headroom in every raise ever made
    // (four-eyes finding, GPT-5.6 Sol on 4d88250, 31.08.2026).
    expect(measureGuide('a\nb\n').lines).toBe(2)
    expect(measureGuide('a\nb').lines).toBe(2)
    expect(measureGuide('').lines).toBe(0)
  })

  it('keeps the blank lines a guide really wastes, and drops only the terminator', () => {
    // The repair must take off exactly ONE sentinel. Stripping trailing blanks
    // instead would hand back free lines to a file padded with empty ones.
    expect(measureGuide('a\n\n\n').lines).toBe(3)
    expect(measureGuide('a\n\n\n\n').lines).toBe(4)
    expect(measureGuide('\n').lines).toBe(1)
  })

  it('cannot re-form an unterminated opener across its own excision seam', () => {
    const malformed = 'A <!-<!---rest of the guide'
    expect(measureGuide(malformed)).toEqual(measureGuide('A <!- -rest of the guide'))
    expect(measureGuide(malformed)).toEqual({ lines: 1, words: 6 })
  })

  it('keeps word boundaries while neutralising every opener in a malformed tail', () => {
    const malformed = 'word<!--more <!-<!---rest'
    expect(measureGuide(malformed)).toEqual(measureGuide('word more <!- -rest'))
    expect(measureGuide(malformed)).toEqual({ lines: 1, words: 4 })
  })

  it('retains visible words before a comment that opens mid-line', () => {
    const measured = measureGuide('keep these words <!-- hidden\nstill hidden\n-->')
    expect(measured).toEqual({ lines: 1, words: 3 })
  })

  it('retains visible words after a comment that closes mid-line', () => {
    const measured = measureGuide('<!-- hidden\nstill hidden --> keep these words')
    expect(measured).toEqual({ lines: 1, words: 3 })
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
  // DERIVED from the ceiling, never a literal: this fixture exists to be over budget, and a
  // literal that merely happened to clear the ceiling of the day turns into an under-budget
  // document the moment the budget ratchets, which is what happened on 25.08.2026.
  const overBudget = doc(entry('Zu lang', 2)) + `${'zusatz '.repeat(LIMITS.maxWords + 100)}\n`

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
  const guide = readFileSync(GUIDE, 'utf8')

  it('stays a short, project-neutral beginner guide', () => {
    const { ok, violations } = auditGuide(guide)
    expect(ok, `\n${formatViolations(violations)}\n`).toBe(true)
  })

  it('carries both new lessons in actionable house form', () => {
    const entries = parseEntries(sliceSection(guide, /Fallstrick/i))
    const byTitle = Object.fromEntries(
      entries.map((entry) => [entry.title, entry.lines.join(' ').replace(/\s+/g, ' ')]),
    )

    expect(byTitle['Der Prüflauf verändert sein eigenes Projekt.']).toContain(
      '„Etabliere einen Mechanismus, der einen Prüflauf rot färbt, sobald er das Projekt verändert hat, in dem er läuft"',
    )
    expect(byTitle['Die Ausnahme existiert nur in der Verweigerung.']).toContain(
      'Kann der ehrlichste Wortlaut der Ausnahme meine eigene Prüfung bestehen?',
    )
  })

  it('measures the same document identically with and without its closing newline', () => {
    // The count the ceilings are ratcheted against must not depend on file
    // formatting alone — the rendered text is the same either way.
    const withNewline = guide.endsWith('\n') ? guide : `${guide}\n`
    const withoutNewline = withNewline.replace(/\n$/, '')
    expect(measureGuide(withNewline)).toEqual(measureGuide(withoutNewline))
  })

  it('keeps both ceilings on the measurement, with no unearned headroom', () => {
    // The rule this file states: a ceiling is raised only by the measured size
    // of genuinely new tips, exact fit and no slack. A ceiling ABOVE the
    // measurement is headroom the next paragraph would spend unannounced —
    // which is how the guard came to raise its own limit (point 1022).
    const measured = measureGuide(guide)
    expect(measured.lines).toBe(LIMITS.maxLines)
    expect(measured.words).toBe(LIMITS.maxWords)
  })

  it('keeps the priority entry enforceable rather than anecdotal', () => {
    // The entry was WIDENED and, in the same commit, silently stripped of the
    // divergence check and of "Priorisiere das Ziel" — the two halves that make
    // it act. Nothing caught it, because the suite only demanded a prompt
    // marker (four-eyes finding, GPT-5.6 Sol, 31.08.2026).
    const entries = parseEntries(sliceSection(guide, /Fallstrick/i))
    const prose = entries.find((entry) => entry.title.startsWith('Prosa wirkt nicht'))
    const text = prose?.lines.join(' ').replace(/\s+/g, ' ')

    expect(text).toContain('**Feld**, das der Mechanismus liest')
    expect(text).toContain('laufen beide auseinander, schlägt eine Prüfung fehl')
    expect(text).toContain('Priorisiere das **Ziel**')
    expect(text).toContain('**Altbestand**')
  })

  it('carries the whole growing-obligation lesson in the one entry that owns it', () => {
    // Folded from two entries that described the same class. The fold is only
    // honest if every distinct claim of the absorbed entry survived it.
    const section = sliceSection(guide, /Fallstrick/i)
    const entries = parseEntries(section)
    const duty = entries.filter((entry) => entry.title.startsWith('Die Pflicht wächst schneller'))
    expect(duty).toHaveLength(1)
    // The absorbed entry must not come back beside its host: two entries would
    // satisfy every claim below and re-open the duplication the fold closed.
    // NOT `not.toContain(expect.stringContaining(…))` — `toContain` compares
    // elements by identity, so an asymmetric matcher never matches and the
    // negated form can never fail (GPT-5.6 Sol, 31.08.2026).
    // And NOT through `parseEntries` alone: a parser that absorbed the old
    // heading into its host would leave ONE entry, an empty title search and
    // every claim below satisfied — the named regression would pass. The RAW
    // section is what forbids the heading, in its own entry or inside the host
    // text (GPT-5.6 Sol, 01.09.2026).
    const rawSection = section.map(({ text }) => text).join('\n')
    expect(rawSection).not.toContain('Die Sperre wächst beim Abtragen')
    expect(entries.some((entry) => entry.title.includes('Die Sperre wächst beim Abtragen'))).toBe(
      false,
    )
    const text = duty[0].lines.join(' ').replace(/\s+/g, ' ')

    expect(text).toContain('**einzelnen Beitrag**')
    expect(text).toContain('Veto der **Datei** statt dem Befund')
    expect(text).toContain('**gelesen** von bloß berührt')
    expect(text).toContain('Reparaturkette am **Endzustand** als einen Beitrag')
    // The WHOLE clause: "eigenen Ticket" alone survives deleting the half that
    // says which findings it is about.
    expect(text).toContain('mach neue Befunde derselben Datei zum eigenen Ticket')
    expect(text).toContain('nennt ihren **Grund**, nie ihren Bestand')
    expect(text).toContain('**Messgerät**')
  })

  it('lets a true suspected cause survive the required falsification attempt', () => {
    const metaRule = sliceSection(guide, /Drei Meta-Regeln/i)
      .map(({ text }) => text)
      .join(' ')
      .replace(/\s+/g, ' ')

    expect(metaRule).toContain('Versuche zuerst, sie unabhängig zu widerlegen.')
    expect(metaRule).toContain('welcher Befund sie zur Tatsache macht.')
    expect(metaRule).toContain('Hält sie stand, darf sie wahr sein.')
    expect(metaRule).toContain('Wer den Auftrag vergibt, misst **blind mit**.')
  })

  it('keeps the complete window rule while naming omitted review material to its judge', () => {
    const entries = parseEntries(sliceSection(guide, /Fallstrick/i))
    const measuredLess = entries.find((entry) =>
      entry.title.startsWith('Die Messung — und die Gegenprüfung — sah weniger'))
    const text = measuredLess?.lines.join(' ').replace(/\s+/g, ' ')

    expect(text).toContain('Nur die letzten *n* Einträge')
    expect(text).toContain('aus dem **Gegenstand** ab: nach Zeit, nie nach Anzahl.')
    expect(text).toContain('still gekürzter Prüfstoff für das Modell wie ein Mangel')
    expect(text).toContain(
      'Nenne dem **prüfenden Modell selbst** jedes weggelassene Material, nicht nur dem Aufrufer',
    )
  })

  it('puts a permission beside its limit and reviews cases no rule covers', () => {
    const entries = parseEntries(sliceSection(guide, /Fallstrick/i))
    const ruleDrift = entries.find((entry) =>
      entry.title.startsWith('Regeln und Wächter verrotten'))
    const text = ruleDrift?.lines.join(' ').replace(/\s+/g, ' ')

    expect(text).toContain('mehrere richtige Regeln können durch ihre Lücke etwas verbieten')
    expect(text).toContain('Warten sieht dabei wie Sorgfalt aus')
    expect(text).toContain('**Erlaubnis im selben Satz wie ihre Grenze**')
    expect(text).toContain('**Welcher naheliegende Fall wird von keiner Regel erfasst?**')
  })

  it('sets both ceilings to the guard\'s exact measured size', () => {
    const measured = measureGuide(guide)
    expect({ maxLines: LIMITS.maxLines, maxWords: LIMITS.maxWords }).toEqual({
      maxLines: measured.lines,
      maxWords: measured.words,
    })
  })
})

describe('the guide-budget escalation instruction', () => {
  it('finishes a justified raise in the code record and produces no decision card', () => {
    const source = readFileSync(CORE, 'utf8')
    const instruction = source.slice(
      source.indexOf('// The budget caps NARRATIVE growth'),
      source.indexOf('export const PROJECT_MARKERS'),
    )

    expect(instruction).toContain('its final step is the written')
    expect(instruction).toContain('It produces no decision card')
    expect(instruction).not.toContain('Recorded as a decision card')
    expect(instruction).not.toContain('last step of a raise belongs')
  })
})
