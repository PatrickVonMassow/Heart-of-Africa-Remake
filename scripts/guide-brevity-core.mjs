// Pure decision core of the guide-brevity guard.
//
// docs/analysis_de/vibe-coding-anleitung.md is a SHORT beginner's guide: per
// pitfall one or two sentences of risk, then the prompt that solves it. It is
// not a project logbook — the detailed experience belongs in
// retrospektive-zusammenarbeit.md. Left to prose alone the guide drifts back
// into a chronicle, because every new lesson feels worth its own paragraph.
//
// So the brevity is MEASURED, not intended: a total budget, a per-pitfall
// budget, a demand that every pitfall ends in an actionable prompt, and a
// detector for the project-specific markers that signal a war story leaking in
// (dates, point numbers, repo paths, the project's own tech and nouns).
//
// Side-effect free. The wrapper (guide-brevity-guard.mjs) reads the file and is
// fail-open; guide-brevity-core.test.mjs pins this logic AND audits the real
// document on every unit-test run, so the regression itself is the enforcement.

// The budget caps NARRATIVE growth — a pitfall swelling into a case study — not
// the NUMBER of transferable tips: the guide's whole value is how many usable
// prompts it carries. So it is raised only by the measured size of genuinely new
// tips, each still bound by the per-entry budgets below, and never to make room
// for a longer telling of something already there. Raised on 26.07.2026 by the
// two tips on scoping the most expensive check and on splitting the task list
// from its archive (+18 lines, +163 words), and again on 26.07.2026 by the tip on
// budgeting the documents that are read at every start (+10 lines, +92 words).
export const LIMITS = {
  maxLines: 373,
  // Deliberately a little loose (~5 % headroom): a budget with almost no room
  // blocks a clarifying half-sentence, and a guard that fires on legitimate
  // edits teaches people to raise the number instead of to cut. It must bite on
  // a growing case study, not on an honest rewording.
  maxWords: 3105,
  // A pitfall entry = the risk lines plus its prompt. Anything longer is a
  // story, not a tip.
  maxEntryLines: 11,
  // The risk half alone: name it, do not narrate it.
  maxRiskLines: 4,
  // Below this the pitfall section has plainly been renamed or restructured,
  // and the per-entry checks would silently inspect nothing.
  minEntries: 10,
}

// Markers of project-specific content. Each one belongs in the retrospective
// instead — the guide must read for someone who has never seen this repo.
export const PROJECT_MARKERS = [
  { re: /\b\d{1,2}\.\d{1,2}\.\d{4}\b/, hint: 'konkretes Datum' },
  { re: /\b(?:Punkt|point)\s+\d+\b/i, hint: 'Punkt-Nummer aus der Aufgabenliste' },
  {
    // A SECOND segment is required: `src/` and `docs/` alone are universal
    // conventions a tool-neutral guide may name; `scripts/verify/x.mjs` is not.
    re: /(?:^|[\s("'`])(?:src|scripts|docs|verification|public|local|\.claude)\/\w/,
    hint: 'Pfad aus diesem Repository',
  },
  {
    re: /\b(?:WebGPU|WebGL|three\.js|Playwright|Vitest|oxlint|Kokoro|R3F|TSL|jsdom)\b/i,
    hint: 'Technologie dieses Projekts (die Anleitung bleibt werkzeug-neutral)',
  },
  {
    // Compound forms only — bare "Elefant" also lives in the German idiom about
    // the elephant in the room, and a guard must not police figures of speech.
    re: /\b(?:Krokodil|Elefantenherde|Elefantenbulle|Savanne|Kanu|Dorfältest|Karawane|Giraffe|Löwenjagd)\w*/i,
    hint: 'Spielinhalt dieses Projekts',
  },
  { re: /\bin diesem Projekt\b/i, hint: 'Anekdoten-Einleitung' },
  { re: /\ban einem einzigen Tag\b/i, hint: 'Anekdoten-Einleitung' },
]

/**
 * Return the body of a `## <heading>` section, with the line number each line
 * had in the full document (1-based), so a violation can be reported at its
 * real position.
 */
export function sliceSection(text, headingRe) {
  const lines = String(text ?? '').split('\n')
  const start = lines.findIndex((l) => /^##\s+/.test(l) && headingRe.test(l))
  if (start < 0) return []
  const out = []
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) break
    out.push({ line: i + 1, text: lines[i] })
  }
  return out
}

/**
 * Split a section's lines into top-level `- **…**` entries. A new entry starts
 * at a line beginning with `- ` at column 0; everything indented under it (and
 * blank lines inside it) belongs to that entry.
 */
export function parseEntries(sectionLines) {
  const entries = []
  let cur = null
  for (const { line, text } of sectionLines) {
    if (/^-\s+\*\*/.test(text)) {
      const bold = text.match(/\*\*(.+?)\*\*/)
      cur = { line, title: bold ? bold[1] : text.trim(), lines: [text] }
      entries.push(cur)
      continue
    }
    if (!cur) continue
    if (/^\S/.test(text) && text.trim() !== '') {
      // Un-indented prose ends the entry (a section footer, say).
      cur = null
      continue
    }
    if (text.trim() === '' && cur.lines.at(-1)?.trim() === '') continue
    cur.lines.push(text)
  }
  // Trailing blank lines are formatting, not content.
  for (const e of entries) {
    while (e.lines.length && e.lines.at(-1).trim() === '') e.lines.pop()
  }
  return entries
}

/**
 * Content lines inside the pitfall section that belong to no entry — a war
 * story pasted between the bullets, or a bullet written without its bold title.
 * Without this the per-entry budgets are trivially bypassed: parseEntries
 * simply drops such lines, so they would face only the whole-document budget.
 * Blank lines and the `---` section rule are formatting, not content.
 */
export function strayLines(sectionLines) {
  const stray = []
  let inEntry = false
  for (const { line, text } of sectionLines) {
    if (/^-\s+\*\*/.test(text)) {
      inEntry = true
      continue
    }
    if (text.trim() === '' || /^-{3,}$/.test(text.trim())) continue
    if (/^\s/.test(text)) {
      if (!inEntry) stray.push({ line, text })
      continue
    }
    inEntry = false
    stray.push({ line, text })
  }
  return stray
}

const ACTION_RE = /→\s*\*(?:Prompt|Mechanismus)\s*:\*/

/**
 * Audit the guide. Returns { ok, violations: [{ kind, line, detail }] }.
 *
 * `limits` is injectable so a test can prove a budget bites without editing the
 * real document.
 */
export function auditGuide(text, limits = LIMITS) {
  const src = String(text ?? '')
  const violations = []
  const push = (kind, line, detail) => violations.push({ kind, line, detail })

  // CRLF must audit identically to LF, and the fingerprint comment is
  // bookkeeping rather than content — excluded from BOTH budgets, not just one.
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const body = lines.filter((l) => !/^<!--/.test(l.trim()))
  const words = body.join(' ').split(/\s+/).filter(Boolean).length

  if (body.length > limits.maxLines) {
    push('length', body.length, `${body.length} Zeilen > Budget ${limits.maxLines}`)
  }
  if (words > limits.maxWords) {
    push('length', 1, `${words} Wörter > Budget ${limits.maxWords}`)
  }

  // Project markers are checked over the WHOLE document — a war story leaks in
  // just as easily through an intro paragraph as through a pitfall.
  const seen = new Set()
  lines.forEach((l, i) => {
    for (const { re, hint } of PROJECT_MARKERS) {
      const m = l.match(re)
      if (!m) continue
      const key = `${i}:${hint}`
      if (seen.has(key)) continue
      seen.add(key)
      push('project-specific', i + 1, `„${m[0].trim()}" — ${hint}; gehört in die Retrospektive`)
    }
  })

  // Structural sanity FIRST. Renaming the pitfall heading or dropping the
  // `- **Titel**` form would make every per-entry check inspect an empty list
  // and report a clean bill of health — the "guard that never fires" failure
  // this project has hit before. So a missing or gutted section is itself a
  // violation, and prose smuggled between the bullets is reported too.
  const section = sliceSection(src, /Fallstrick/i)
  const entries = parseEntries(section)
  if (!section.length) {
    push('structure', 1, 'Keine Fallstrick-Sektion gefunden — die Eintrags-Prüfungen liefen ins Leere')
  } else if (entries.length < limits.minEntries) {
    push(
      'structure',
      section[0].line,
      `nur ${entries.length} Fallstrick-Einträge erkannt (< ${limits.minEntries}) — Format geändert? ` +
        'Die Eintrags-Budgets prüfen sonst nichts',
    )
  }
  for (const { line, text: l } of strayLines(section)) {
    push('stray-prose', line, `„${l.trim().slice(0, 60)}…" gehört zu keinem Fallstrick-Eintrag`)
  }

  for (const entry of entries) {
    if (entry.lines.length > limits.maxEntryLines) {
      push(
        'entry-too-long',
        entry.line,
        `„${entry.title}" braucht ${entry.lines.length} Zeilen > ${limits.maxEntryLines}`,
      )
    }
    const actionIdx = entry.lines.findIndex((l) => ACTION_RE.test(l))
    if (actionIdx < 0) {
      push('no-prompt', entry.line, `„${entry.title}" nennt kein „→ *Prompt:*" — Risiko ohne Lösung`)
    } else if (actionIdx > limits.maxRiskLines) {
      push(
        'risk-too-long',
        entry.line,
        `„${entry.title}" beschreibt das Risiko in ${actionIdx} Zeilen > ${limits.maxRiskLines}`,
      )
    }
  }

  return { ok: violations.length === 0, violations }
}

/** Render an audit result as the guard's block message. */
export function formatViolations(violations) {
  if (!violations.length) return ''
  const body = violations
    .map((v) => `  · Zeile ${v.line} [${v.kind}]: ${v.detail}`)
    .join('\n')
  return (
    'VIBE-CODING-ANLEITUNG ZU LANG / ZU PROJEKTSPEZIFISCH ' +
    `(${violations.length} Verstoß/Verstöße):\n${body}\n` +
    'Die Anleitung ist eine KURZE Einsteiger-Anleitung: pro Fallstrick ein bis zwei ' +
    'Sätze Risiko, dann der Prompt. Ausführliche Projekterfahrung gehört nach ' +
    'docs/analysis_de/retrospektive-zusammenarbeit.md — kürze dort hinüber, statt das ' +
    'Budget zu erhöhen. Prüfen mit: node scripts/guide-brevity-guard.mjs --status'
  )
}
