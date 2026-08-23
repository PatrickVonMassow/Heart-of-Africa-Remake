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

// The four ways past this guard that one cross-vendor reading found on
// 23.08.2026. Each case is the EVASION, and each must be refused.
describe('auditGuide — the four evasions', () => {
  it('counts prose that hides behind a comment on its own line', () => {
    const hidden = '<!-- x --> ' + 'Erzählte Prosa. '.repeat(20)
    const before = measureGuide('# Titel\n')
    const after = measureGuide('# Titel\n' + hidden + '\n')
    expect(after.lines).toBeGreaterThan(before.lines)
    expect(after.words).toBeGreaterThan(before.words + 30)
  })

  it('still ignores a line that is nothing but a comment', () => {
    const plain = measureGuide('# Titel\n')
    const stamped = measureGuide('# Titel\n<!-- GUIDE-FINGERPRINT: abc -->\n')
    expect(stamped).toEqual(plain)
  })

  it('audits a second pitfall section instead of stopping at the first', () => {
    const d =
      doc(entry('Kurz', 2)) +
      '\n## Weitere Fallstricke\n\n' +
      entry('Versteckt', LIMITS.maxRiskLines + 2) +
      '\n'
    const { ok, violations } = auditGuide(d)
    expect(ok).toBe(false)
    expect(violations.map((v) => v.kind)).toContain('risk-too-long')
  })

  it('refuses a prompt marker with no instruction behind it', () => {
    const { violations } = auditGuide(doc('- **Leerer Prompt** Ein Risiko.\n  → *Prompt:*'))
    expect(violations.map((v) => v.kind)).toContain('empty-prompt')
  })

  it('refuses narrative that continues after the prompt has closed', () => {
    const d = doc(
      '- **Weitererzählt** Ein Risiko.\n' +
        '  → *Prompt:* „Etabliere einen Mechanismus."\n' +
        '  Und dann geschah an jenem Abend noch Folgendes, was hier gar nicht hingehört.',
    )
    const { ok, violations } = auditGuide(d)
    expect(ok).toBe(false)
    expect(violations.map((v) => v.kind)).toContain('prose-after-prompt')
  })

  it('leaves a cost note after the prompt alone', () => {
    const d = doc('- **Mit Kostenhinweis** Ein Risiko.\n  → *Prompt:* „Etabliere einen Mechanismus." *(≈ 1,3x.)*')
    expect(auditGuide(d).ok).toBe(true)
  })

  it('recognises a repository path written with a leading dot-slash or slash', () => {
    for (const path of ['./scripts/chat-spool.mjs', '/scripts/chat-spool.mjs', '../src/main.ts']) {
      const { violations } = auditGuide(doc(`- **Pfad** Siehe ${path} dort.\n  → *Prompt:* „Etabliere einen Mechanismus."`))
      expect(violations.map((v) => v.kind), path).toContain('project-specific')
    }
  })
})

// The second cross-vendor round found the first repair of the action check
// bypassable in two ways and falsely firing in a third. Each is pinned here.
describe('auditGuide — the action check after its second reading', () => {
  it('refuses a prompt marker followed by unquoted narrative', () => {
    const { ok, violations } = auditGuide(
      doc('- **Ohne Anführung** Ein Risiko.\n  → *Prompt:*\n  Und dann geschah an jenem Abend noch dies und das.'),
    )
    expect(ok).toBe(false)
    expect(violations.map((v) => v.kind)).toContain('unquoted-prompt')
  })

  it('refuses narrative dressed as an italic note', () => {
    const { violations } = auditGuide(
      doc('- **Als Notiz getarnt** Ein Risiko.\n  → *Prompt:* „Tu es." *(Und danach folgt weitere Erzählung.)*'),
    )
    expect(violations.map((v) => v.kind)).toContain('prose-after-prompt')
  })

  it('accepts a cost note and a review question after the prompt', () => {
    const d = doc('- **Mit beiden Notizen** Ein Risiko.\n  → *Prompt:* „Tu es." *(≈ 1,5x.)* *(Sieht das richtig aus?)*')
    expect(auditGuide(d).ok).toBe(true)
  })

  it('leaves a quote INSIDE an unquoted mechanism alone', () => {
    const d = doc('- **Mechanismus mit Zitat** Ein Risiko.\n  → *Mechanismus:* Prüfe den Status "fertig" vor dem Löschen.')
    expect(auditGuide(d).ok).toBe(true)
  })

  it('refuses a mechanism that keeps talking on the next line', () => {
    const { violations } = auditGuide(
      doc('- **Mechanismus mit Nachwort** Ein Risiko.\n  → *Mechanismus:* Ein Check, der anschlägt.\n  Und dann geschah noch dies.'),
    )
    expect(violations.map((v) => v.kind)).toContain('prose-after-prompt')
  })

  it('tolerates the guide own punctuation after a closed prompt', () => {
    const d = doc('- **Punkt danach** Ein Risiko.\n  → *Prompt:* „Tu es".')
    expect(auditGuide(d).ok).toBe(true)
  })
})

// Round three: the quotes must be BOUNDARIES, and the note allowlist must be a
// list rather than a prefix rule. Each counter-example below is Sol's own.
describe('auditGuide — the prompt boundary and the note list', () => {
  it('refuses prose standing before the quoted prompt', () => {
    const { ok, violations } = auditGuide(
      doc('- **Prosa davor** Ein Risiko.\n  → *Prompt:* Und dann Prosa. „Tu es."'),
    )
    expect(ok).toBe(false)
    expect(violations.map((v) => v.kind)).toContain('prose-before-prompt')
  })

  it('refuses a second quoted block after the prompt', () => {
    const { violations } = auditGuide(
      doc('- **Zweiter Block** Ein Risiko.\n  → *Prompt:* „Tu es." Danach „weitere Prosa."'),
    )
    expect(violations.map((v) => v.kind)).toContain('prose-after-prompt')
  })

  it('refuses a note that only BEGINS like a cost note', () => {
    const { violations } = auditGuide(
      doc('- **Kosten-Tarnung** Ein Risiko.\n  → *Prompt:* „Tu es." *(Kosten entstehen, und danach folgt weitere Erzählung.)*'),
    )
    expect(violations.map((v) => v.kind)).toContain('prose-after-prompt')
  })

  it('refuses a note that merely ends in a question mark', () => {
    const { violations } = auditGuide(
      doc('- **Frage-Tarnung** Ein Risiko.\n  → *Prompt:* „Tu es." *(Und danach geschah noch etwas?)*'),
    )
    expect(violations.map((v) => v.kind)).toContain('prose-after-prompt')
  })

  it('accepts the two note forms the guide actually uses', () => {
    for (const note of ['*(≈ 1,5x.)*', '*(Kosten ≈ 2x)*', '*(Sieht das richtig aus?)*']) {
      const d = doc(`- **Erlaubte Notiz** Ein Risiko.\n  → *Prompt:* „Tu es." ${note}`)
      expect(auditGuide(d).ok, note).toBe(true)
    }
  })
})

// Round four: a multiplier sign is not a licence for a second sentence.
describe('auditGuide — the cost note is a note, not a paragraph', () => {
  it('refuses narrative that follows a valid multiplier inside the note', () => {
    const { ok, violations } = auditGuide(
      doc('- **Multiplikator-Tarnung** Ein Risiko.\n  → *Prompt:* „Tu es." *(≈ 1,5x. Und danach geschah noch etwas.)*'),
    )
    expect(ok).toBe(false)
    expect(violations.map((v) => v.kind)).toContain('prose-after-prompt')
  })

  it('accepts the longest cost note the guide actually carries', () => {
    const note = '*(Aufschlag ≈ 10–25 % je zusätzlichem Strang, geschätzt — Nacharbeit + Aufsicht)*'
    const d = doc(`- **Langer Kostenhinweis** Ein Risiko.\n  → *Prompt:* „Tu es." ${note}`)
    expect(auditGuide(d).ok).toBe(true)
  })

  it('refuses a note that runs past the measured length', () => {
    const note = `*(≈ 2x ${'sehr '.repeat(30)}lang)*`
    const { violations } = auditGuide(doc(`- **Zu lange Notiz** Ein Risiko.\n  → *Prompt:* „Tu es." ${note}`))
    expect(violations.map((v) => v.kind)).toContain('prose-after-prompt')
  })
})

// Round five: the ceiling is the measured 77, so 78 is the first refusal.
describe('auditGuide — the note ceiling sits on its measurement', () => {
  const O = '„'
  const withNote = (note) => doc(`- **Notiz an der Grenze** Ein Risiko.\n  → *Prompt:* ${O}Tu es." *(${note})*`)
  const pad = (n) => '≈ 2x ' + 'a'.repeat(n - 5)

  it('accepts a note of exactly the measured length', () => {
    expect(pad(77)).toHaveLength(77)
    expect(auditGuide(withNote(pad(77))).ok).toBe(true)
  })

  it('refuses the very next character', () => {
    expect(pad(78)).toHaveLength(78)
    expect(auditGuide(withNote(pad(78))).violations.map((v) => v.kind)).toContain('prose-after-prompt')
  })
})

// Round six: three bypasses of the note and path rules, each pinned.
describe('auditGuide — notes together, sentences without a space, paths that climb', () => {
  const O = '„'
  const withNotes = (...notes) =>
    doc(`- **Notizenkette** Ein Risiko.\n  → *Prompt:* ${O}Tu es." ${notes.map((n) => `*(${n})*`).join(' ')}`)

  it('refuses a paragraph split across several valid notes', () => {
    const half = '≈ 2x ' + 'a'.repeat(45)
    const { ok, violations } = auditGuide(withNotes(half, half))
    expect(ok).toBe(false)
    expect(violations.map((v) => v.kind)).toContain('prose-after-prompt')
  })

  it('accepts the two notes the guide really chains', () => {
    expect(auditGuide(withNotes('≈ 1,5x.', 'Sieht das richtig aus?')).ok).toBe(true)
  })

  it('refuses a second sentence that skips the space after the period', () => {
    const { violations } = auditGuide(withNotes('≈ 1,5x.Und danach geschah noch etwas.'))
    expect(violations.map((v) => v.kind)).toContain('prose-after-prompt')
  })

  it('recognises a path that climbs more than one level', () => {
    const { violations } = auditGuide(
      doc(`- **Weiter Pfad** Siehe ../../src/main.ts dort.\n  → *Prompt:* ${O}Etabliere einen Mechanismus."`),
    )
    expect(violations.map((v) => v.kind)).toContain('project-specific')
  })
})

// Round seven: the letters must be in the prompt, emphasis hides no sentence,
// and a Markdown delimiter is no shelter for a repository path.
describe('auditGuide — the last three shelters', () => {
  const O = '„'

  it('refuses empty quotes whose letters come from the note', () => {
    const { ok, violations } = auditGuide(
      doc(`- **Leere Anführung** Ein Risiko.\n  → *Prompt:* ${O}" *(Sieht das richtig aus?)*`),
    )
    expect(ok).toBe(false)
    expect(violations.map((v) => v.kind)).toContain('empty-prompt')
  })

  it('refuses a second sentence wearing emphasis', () => {
    const { violations } = auditGuide(
      doc(`- **Fette Fortsetzung** Ein Risiko.\n  → *Prompt:* ${O}Tu es." *(≈ 1,5x. **Und danach noch etwas.**)*`),
    )
    expect(violations.map((v) => v.kind)).toContain('prose-after-prompt')
  })

  it('recognises a path inside a Markdown link', () => {
    const { violations } = auditGuide(
      doc(`- **Pfad im Link** Siehe [../../src/main.ts] dort.\n  → *Prompt:* ${O}Etabliere einen Mechanismus."`),
    )
    expect(violations.map((v) => v.kind)).toContain('project-specific')
  })
})

// Round eight: the rules ask about the RENDERED text, and the path boundary is
// "not a word character" rather than a list of delimiters.
describe('auditGuide — markup is not a hiding place', () => {
  const O = '„'

  it('refuses a prompt whose only letters sit in an HTML comment', () => {
    const { ok, violations } = auditGuide(
      doc(`- **Kommentar-Anweisung** Ein Risiko.\n  → *Prompt:* ${O}<!-- Anweisung -->"`),
    )
    expect(ok).toBe(false)
    expect(violations.map((v) => v.kind)).toContain('empty-prompt')
  })

  it('refuses a second sentence wrapped in an HTML tag', () => {
    const { violations } = auditGuide(
      doc(`- **Tag-Fortsetzung** Ein Risiko.\n  → *Prompt:* ${O}Tu es." *(≈ 1,5x. <strong>Und danach.</strong>)*`),
    )
    expect(violations.map((v) => v.kind)).toContain('prose-after-prompt')
  })

  it('recognises a path wrapped in emphasis', () => {
    for (const wrapped of ['**../../src/main.ts**', '_./scripts/x.mjs_', '`docs/a.md`']) {
      const { violations } = auditGuide(
        doc(`- **Pfad in Auszeichnung** Siehe ${wrapped} dort.\n  → *Prompt:* ${O}Etabliere einen Mechanismus."`),
      )
      expect(violations.map((v) => v.kind), wrapped).toContain('project-specific')
    }
  })

  it('does not read a repository path out of an ordinary word', () => {
    const d = doc(`- **Kein Pfad** Die Meilensteine/Schritte helfen nicht.\n  → *Prompt:* ${O}Etabliere einen Mechanismus."`)
    expect(auditGuide(d).violations.map((v) => v.kind)).not.toContain('project-specific')
  })
})

// Round nine: a link destination, a digit and a German umlaut.
describe('auditGuide — what renders, what ends a sentence, what is a word', () => {
  const O = '„'

  it('refuses a prompt whose letters are only a link destination', () => {
    const { ok, violations } = auditGuide(
      doc(`- **Nur ein Ziel** Ein Risiko.\n  → *Prompt:* ${O}[](https://example.invalid)"`),
    )
    expect(ok).toBe(false)
    expect(violations.map((v) => v.kind)).toContain('empty-prompt')
  })

  it('keeps a link LABEL as the instruction it renders', () => {
    const d = doc(`- **Beschrifteter Link** Ein Risiko.\n  → *Prompt:* ${O}[Etabliere einen Mechanismus](https://example.invalid)"`)
    expect(auditGuide(d).violations.map((v) => v.kind)).not.toContain('empty-prompt')
  })

  it('refuses a second sentence that opens with a digit', () => {
    const { violations } = auditGuide(
      doc(`- **Ziffer danach** Ein Risiko.\n  → *Prompt:* ${O}Tu es." *(≈ 1,5x. 2 Minuten später ging es weiter)*`),
    )
    expect(violations.map((v) => v.kind)).toContain('prose-after-prompt')
  })

  it('does not read a repository path out of a word carrying an umlaut', () => {
    const d = doc(`- **Kein Pfad** Das Menüdocs/a.md ist kein Pfad.\n  → *Prompt:* ${O}Etabliere einen Mechanismus."`)
    expect(auditGuide(d).violations.map((v) => v.kind)).not.toContain('project-specific')
  })
})
