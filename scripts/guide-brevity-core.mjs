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
// budgeting the documents that are read at every start (+10 lines, +92 words),
// and again on 26.07.2026 by the tip on the QUOTA being the real limit — deliver
// each helper's brief instead of letting it search, and start a fresh context per
// task (+10 lines, +101 words). Raised again on 27.07.2026 by three tips: isolation is a
// property of the environment rather than of an instruction (in the concurrency meta-rule,
// whose prompt gains the clause), the pitfall of asserting an intended state in the
// present tense (+13 lines, +146 words for those two together), and the four-eyes
// counter-check on a MECHANISM needing its own enforcement — what the record has to name,
// and that the author's own "looks fine" is not one (+5 lines, +46 words).
// Raised again on 30.07.2026 by ONE genuinely new tip — what reaches the reader is not what
// was meant: a fallback substituted in silence, and an internal shorthand spoken to him — plus
// one clause on the existing "read at every start" tip, that the dearest text is the one
// carried in EVERY request, especially where it repeats what a gate already refuses
// (+9 lines, +105 words, measured as the audit counts them — the raise is +8, because the
// document stood one line under the old ceiling and that slack was absorbed). Two further
// lessons of that morning were deliberately NOT added here: they are the long-form half and
// live in the retrospective.
// Raised again on 06.08.2026 by ONE genuinely new tip — an alarm keyed on an EVENT is blind
// exactly when the event's own source fails, so what is watched is the STATE (does the served
// thing still match the source?), plus the same lesson's second half, that a sync writing from
// a source may only ADD and never overwrite what is richer downstream. The tip costs +7 lines
// and +67 words gross; ONE neighbouring entry (the versioned-move one, risk half and prompt)
// was tightened by −1 line / −20 words to pay part of it, leaving +6 lines and +47 words net.
// The LINE ceiling is nevertheless LOWERED to the measured fit: the document had drifted 7
// lines under the old 409 and rides that slack, so 408 is the exact count and 417 would have
// been room for a whole future entry — the four-eyes review caught precisely that.
export const LIMITS = {
  maxLines: 415,
  // EXACT FIT, not headroom — corrected 30.07.2026 after the four-eyes review
  // pointed out that this comment had long stopped describing the numbers. The
  // rule above ("raised only by the measured size of genuinely new tips")
  // converges on zero slack by construction, and granting slack would itself be
  // the unearned loosening the rule forbids. So any net growth blocks, and the
  // block message names the honest way out: cut the long telling over into the
  // retrospective, which is where it belongs anyway.
  //
  // Raised 07.08.2026 by the measured NET size of one genuinely new tip (§3.91,
  // the repair that quiets the check it was meant to sharpen). The INVARIANTS,
  // re-measured with this counter by the four-eyes review: the tip cost 129
  // words as first written, 96 were PAID BACK, 33 is the net raise, and THAT raise
  // moved the word ceiling alone — the line ceiling was met without one. The largest single payer was trimming
  // the TIP ITSELF; the rest came from six neighbouring entries, of which only
  // prose was cut — the one tightening that had dropped a claim ("schreib zu
  // jeder Regel, was sie misst") was restored and repaid inside its own entry.
  // NO per-entry split is recorded here ON PURPOSE: two review rounds each
  // invalidated the previous breakdown, because every internal repayment moves
  // it while the totals stay put. The split lives in the review ledger, which is
  // dated and never rewritten. Recorded as a decision card besides, because the
  // standing rule is shorten-before-raise and the last step of a raise belongs
  // to the user.
  //
  // RAISED to 3677 on 11.08.2026 by the 97 measured words of two genuinely new
  // decisions, and NOT escalated to the user — he withdrew that requirement
  // generally on 10.08.2026 ("Frage mich in Zukunft allgemein nicht mehr bzgl.
  // Anhebungen"), so a raise is ours to take and to justify in writing. What was
  // added: (1) the MERGE of two blind-parallel lists goes to the model that wrote
  // neither, and every input entry stays findable in the union — the merge is the
  // one stage where a finding disappears silently, and the guide taught the
  // blind-parallel half without it; (2) "a lesson counts as served once its
  // enforcer is NAMED" — measured here at 29 of 107 lessons naming an
  // unenforced remainder. Both are DECISIONS a reader must copy, not experience
  // to read about, so neither belongs in the retrospective instead. Shortened
  // first, twice: the four-eyes entry was rewritten tighter than before the
  // addition (it also fell back inside the LINE budget, which is untouched), and
  // the new entry was cut from 8 lines to 5. What remains is the two decisions
  // themselves. EXACT FIT, no headroom: 3580 + 97 = 3677. The LINE ceiling moves too, by the 7 lines those two entries
  // occupy after that tightening — the per-entry ceiling (11) is untouched, so
  // the guide's shape as a list of short tips is unchanged.
  maxWords: 3677,
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
