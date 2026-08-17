// Pure logic of the retrospective-currency toolchain: the sources fingerprint,
// the auto-generated doc section and the stale/fresh decision. Shared by the
// refresh script (retro-refresh.mjs) and the Stop-hook guard
// (retro-currency-guard.mjs) so both sides compute the SAME fingerprint from
// the SAME canonical structure — a drift between them would either trap the
// session (guard stricter) or silently let staleness through (guard laxer).
//
// The retrospective (docs/analysis_de/retrospektive-zusammenarbeit.md, git-ignored,
// German) records the project's recurring problem classes and their hardened
// solutions. Its own lesson #1 is that reminders do not keep documents
// current — only enforcement does — so its currency is enforced by a guard
// keyed on a fingerprint over the DURABLE SOURCES that define the
// problem/solution history:
//   (1) the feedback/project memories in the project memory dir (a new or
//       extended memory = a new/escalated problem class),
//   (2) the guard/hook scripts in scripts/ (each guard = a hardened solution),
//   (3) the revert trail in git log (a revert = a failed solution attempt),
//   (4) the process/meta TASKS points (process work = process history).
// Everything here is side-effect-free and Vitest-covered
// (retro-core.test.mjs); fs/git gathering lives in retro-sources.mjs and the
// two thin wrappers.
import { createHash } from 'node:crypto'

// ---------------------------------------------------------------------------
// Doc markers. The auto-generated section is CLEARLY delimited so the refresh
// can regenerate it without ever touching the human/agent-authored prose.
export const AUTO_START = '<!-- AUTO-GENERATED:START -->'
export const AUTO_END = '<!-- AUTO-GENERATED:END -->'
export const FINGERPRINT_RE = /<!-- RETRO-FINGERPRINT: ([0-9a-f]{64}) -->/

// The BEGINNER GUIDE (vibe-coding-anleitung.md) is derived from the same
// sources but has no auto-generated section — it is prose all the way down, so
// nothing can regenerate it. Until 25.07.2026 the guard only NAMED it in its
// message and checked the retrospective, which let a superseded rule survive
// there for a day after the retrospective had been sharpened (the user found
// it: the guide still taught "what goes wrong twice gets a mechanism" after
// that rule had been replaced by "every rule gets one from the start"). The
// guide now carries its OWN fingerprint stamp, set only by an explicit
// `retro-refresh.mjs --guide-reviewed` — a deliberate human/agent attestation
// that the guide was read against the changed sources, never an automatic
// side effect of the refresh.
export const GUIDE_FINGERPRINT_RE = /<!-- GUIDE-FINGERPRINT: ([0-9a-f]{64}) -->/

// ---------------------------------------------------------------------------
// Source classification (pure helpers over raw file contents / listings).

/** Memory kinds that carry the problem/solution history (the `reference`
 *  type is background material, not a problem class). */
export const MEMORY_TYPES = new Set(['feedback', 'project', 'user'])

/** `type:` value from a memory file's YAML frontmatter, or null. Anchored on
 *  the line start so `node_type: memory` never matches. */
export function parseMemoryType(text) {
  if (typeof text !== 'string') return null
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fm) return null
  const m = fm[1].match(/^\s*type:\s*["']?([\w-]+)/m)
  return m ? m[1] : null
}

/** `description:` value from a memory file's YAML frontmatter, or null. */
export function parseMemoryDescription(text) {
  if (typeof text !== 'string') return null
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fm) return null
  const m = fm[1].match(/^\s*description:\s*(.+)$/m)
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}

/** Guard/hook/infra script basenames — the "each guard = a solution" source.
 *  Cores, tests and race workers are implementation detail, not solutions. */
export const GUARD_NAME_RE = /(guard|hook|singleton|doctor|lock|autostart|reminder)/
export function guardScriptNames(fileNames) {
  if (!Array.isArray(fileNames)) return []
  return fileNames
    .filter(
      (n) =>
        typeof n === 'string' &&
        n.endsWith('.mjs') &&
        !n.endsWith('-core.mjs') &&
        !n.endsWith('.test.mjs') &&
        !n.includes('race-worker') &&
        GUARD_NAME_RE.test(n),
    )
    .sort()
}

/** Revert/reapply commits from `git log --format=%H %s` output: the
 *  failed-attempt / fix-of-fix trail. */
export function revertCommits(gitLogText) {
  if (typeof gitLogText !== 'string') return []
  const out = []
  for (const line of gitLogText.split('\n')) {
    const m = line.match(/^([0-9a-f]{7,40}) (Revert|Reapply)\b(.*)$/)
    if (m) out.push({ hash: m[1], subject: `${m[2]}${m[3]}`.trim() })
  }
  return out
}

/** Keywords marking a TASKS point title as process/meta work (vs. game
 *  content). A heuristic by design — exported so the test pins it. */
export const PROCESS_KEYWORDS =
  /\b(guard|hook|dashboard|workflow|process|singleton|batch|retrospective|delegation|worktree|memory|memories|autonomy|lock|closing|regression|qa)\b/i

/** Process/meta TASKS points as [{num, done, title}] from the raw TASKS.md
 *  text. Only the point's first line (the title line) is inspected. */
export function processTaskPoints(tasksText) {
  if (typeof tasksText !== 'string') return []
  const out = []
  for (const line of tasksText.split('\n')) {
    const m = line.match(/^- \[( |x)\] (\d+)\. (.*)$/)
    if (m && PROCESS_KEYWORDS.test(m[3])) {
      out.push({ num: Number(m[2]), done: m[1] === 'x', title: m[3].trim() })
    }
  }
  return out
}

/** Distinct date mentions in a memory body — the escalation proxy for the
 *  "#attempts" column (German DD.MM.[YYYY] and ISO YYYY-MM-DD forms). */
export function escalationCount(text) {
  if (typeof text !== 'string') return 1
  const found = new Set()
  // No trailing \b on the German form: "20.07." ends on a dot (non-word), so a
  // boundary there would reject the plain day.month form entirely.
  for (const m of text.matchAll(/\b\d{2}\.\d{2}\.(?:\d{4})?|\b\d{4}-\d{2}-\d{2}\b/g)) {
    found.add(m[0])
  }
  return Math.max(1, found.size)
}

// ---------------------------------------------------------------------------
// Fingerprint.

/**
 * SHA-256 over the canonical source structure. Order-independent by
 * construction (every list is sorted before hashing), so two collectors that
 * enumerate in different orders still agree. Contributions:
 *   memories       — [name, contentHash] pairs (an EDITED memory counts too:
 *                    a new escalation appended to an existing memory is new
 *                    history, not noise)
 *   guards         — basenames only (a guard's existence is the solution;
 *                    its internal churn is not a new problem class)
 *   reverts        — commit hashes
 *   processPoints  — "num:done:title" strings (a tick or a new point counts)
 */
export function computeFingerprint({ memories = [], guards = [], reverts = [], processPoints = [] } = {}) {
  const canonical = {
    memories: memories
      .map((m) => [String(m.name), String(m.hash)])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
    guards: [...guards].map(String).sort(),
    reverts: reverts.map((r) => String(r.hash)).sort(),
    processPoints: processPoints
      .map((p) => `${p.num}:${p.done ? 'x' : 'o'}:${p.title}`)
      .sort(),
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

/** The fingerprint recorded inside the doc, or null when none is present. */
export function extractFingerprint(docText) {
  if (typeof docText !== 'string') return null
  const m = FINGERPRINT_RE.exec(docText)
  return m ? m[1] : null
}

// ---------------------------------------------------------------------------
// Auto-generated section.

/** Heuristic severity from the escalation count (labeled as heuristic in the
 *  rendered table — the human prose owns the real judgment). */
export function severityFor(attempts) {
  return attempts >= 4 ? 'hoch' : attempts >= 2 ? 'mittel' : 'niedrig'
}

const TOKEN_STOPWORDS = new Set([
  'always', 'never', 'only', 'with', 'when', 'stay', 'must', 'keep', 'nach',
  'jede', 'jeder', 'first', 'more', 'auf', 'the', 'and', 'for', 'not', 'ohne',
])

/** Guard scripts whose basename shares a meaningful token with the memory
 *  name — the "implemented measure" column. */
export function matchingGuards(memoryName, guardNames) {
  if (typeof memoryName !== 'string' || !Array.isArray(guardNames)) return []
  const tokens = memoryName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !TOKEN_STOPWORDS.has(t))
  return guardNames.filter((g) => tokens.some((t) => g.toLowerCase().includes(t)))
}

/** Table rows for the auto section: one row per relevant memory (the durable
 *  problem-class records), each linked to its matching guard scripts. */
export function buildRows({ memories = [], guards = [] } = {}) {
  return [...memories]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((m) => {
      const attempts = Number(m.escalations) || 1
      const guardHits = matchingGuards(m.name, guards)
      return {
        klass: m.description || m.name,
        name: m.name,
        attempts,
        severity: severityFor(attempts),
        measure: guardHits.length ? guardHits.join(', ') : '— (Regel/Memory)',
        status: guardHits.length ? '✔ Mechanismus' : '◐ Regel',
      }
    })
}

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

/**
 * The complete auto-generated block, markers included. `refreshedStamp` is
 * the human-readable Berlin stamp, `refreshedIso` the machine ISO time —
 * both measured from the OS clock by the refresh wrapper at run time.
 */
export function renderAutoSection({
  rows = [],
  guards = [],
  reverts = [],
  processPoints = [],
  fingerprint,
  refreshedStamp = '',
  refreshedIso = '',
} = {}) {
  const openPoints = processPoints.filter((p) => !p.done).length
  const lines = [
    AUTO_START,
    '<!-- Dieser Abschnitt wird maschinell von scripts/retro-refresh.mjs gepflegt.',
    '     NICHT von Hand editieren — der naechste Refresh ueberschreibt ihn.',
    '     Die Prosa-Analyse ausserhalb der Marker bleibt unberuehrt. -->',
    '',
    '## Anhang A — Maschinell gepflegte Quellen-Übersicht',
    '',
    `Zuletzt aktualisiert: ${refreshedStamp} · Quellen-Fingerprint: \`${String(fingerprint).slice(0, 12)}…\``,
    '',
    'Spalten heuristisch aus den Quellen abgeleitet (Anläufe = distinkte Datumsnennungen im Memory;',
    'Maßnahme = Guard-Skripte mit Namens-Treffer). Die inhaltliche Bewertung gehört der Prosa oben.',
    '',
    '| Problemklasse (Memory) | Anläufe | Schwere (heuristisch) | Maßnahme (Guard-Treffer) | Status |',
    '|---|---|---|---|---|',
    ...rows.map(
      (r) => `| ${esc(r.klass)} | ${r.attempts} | ${r.severity} | ${esc(r.measure)} | ${r.status} |`,
    ),
    '',
    `Erfasste Quellen: ${rows.length} Feedback-/Projekt-Memories · ${guards.length} Guard-/Hook-Skripte · ` +
      `${reverts.length} Revert-/Reapply-Commits · ${processPoints.length} Prozess-/Meta-TASKS-Punkte (davon ${openPoints} offen).`,
    '',
    `<!-- RETRO-FINGERPRINT: ${fingerprint} -->`,
    `<!-- RETRO-LAST-REFRESHED: ${refreshedIso} -->`,
    AUTO_END,
  ]
  return lines.join('\n')
}

/**
 * `docText` with ONLY the marker-delimited region replaced by `section`
 * (which carries its own markers). Everything outside the markers is
 * preserved byte-identical. When the markers are absent the section is
 * appended at the end behind a rule.
 */
export function replaceAutoSection(docText, section) {
  if (typeof docText !== 'string') return `${section}\n`
  const start = docText.indexOf(AUTO_START)
  const endMark = docText.indexOf(AUTO_END)
  if (start >= 0 && endMark > start) {
    return docText.slice(0, start) + section + docText.slice(endMark + AUTO_END.length)
  }
  return `${docText.replace(/\s*$/, '')}\n\n---\n\n${section}\n`
}

/** Minimal German skeleton for an absent doc — markers included so the next
 *  refresh finds its own region. */
export function skeletonDoc(section) {
  return (
    '# Retrospektive der Zusammenarbeit — „The Heart of Africa“\n\n' +
    'Dieses Dokument hält die wiederkehrenden Problemklassen der Zusammenarbeit,\n' +
    'ihre Grundursachen und die erzwungenen Lösungen fest. Der folgende Anhang\n' +
    'wird maschinell gepflegt (scripts/retro-refresh.mjs); die eigentliche\n' +
    'Analyse-Prosa gehört VOR die Marker und wird nie überschrieben.\n' +
    '(Rumpf automatisch angelegt — Prosa-Analyse ergänzen.)\n\n---\n\n' +
    `${section}\n`
  )
}

/**
 * The refreshed doc content: regenerate the auto section from `sources` and
 * splice it into `existingDocText` (or build the skeleton when the doc is
 * absent, i.e. null). Pure — the wrapper reads/writes the file and measures
 * the timestamps from the OS clock.
 */
export function refreshedDoc(existingDocText, sources, { refreshedStamp = '', refreshedIso = '' } = {}) {
  const fingerprint = computeFingerprint(sources)
  const section = renderAutoSection({
    rows: buildRows(sources),
    guards: sources.guards ?? [],
    reverts: sources.reverts ?? [],
    processPoints: sources.processPoints ?? [],
    fingerprint,
    refreshedStamp,
    refreshedIso,
  })
  return existingDocText == null ? skeletonDoc(section) : replaceAutoSection(existingDocText, section)
}

// ---------------------------------------------------------------------------
// Lesson→mechanism ledger (point 370).
//
// A lesson written into the retrospective is not thereby obeyed — §1 of the
// document itself says enforcement beats memory, and a rule that merely states
// "every rule needs a mechanism" is itself just a rule. What makes it real is a
// DECISION recorded per lesson, plus something that notices when the decision is
// missing. That is this ledger: docs/analysis_de/lesson-mechanisms.md holds one
// row per lesson subsection, naming exactly one of three outcomes —
//   (1) an EXISTING enforcer was extended/adjusted to cover it (PREFERRED),
//   (2) a NEW enforcer was built, only where none fitted,
//   (3) DELIBERATELY NONE, with a written reason.
// The ledger lives in its own file rather than as a line under each lesson so
// the two documents keep their roles (§3.26: a document drifts into its
// neighbour's role) — the retrospective ANALYSES, the ledger DECIDES — and so
// "which lessons have no enforcement" is answerable at a glance, which is the
// register's most valuable output. Markdown over JSON because outcome (3) is
// prose, and because the project's machine-checked tables are Markdown already
// (docs/graphics-detail-levels.md ↔ src/config/qualityDoc.test.ts).
//
// WHAT THE CHECK PROVES, and what it does not: it proves a decision EXISTS for
// every lesson and that a claimed enforcer POINTS AT A REAL FILE — the exact
// defect docs/rule-corpus-audit.md A29 records, a rule claiming a guard that was
// never built. It does NOT prove the named enforcer actually covers the lesson;
// no cheap check can, and a token-overlap heuristic would cry wolf (nothing in
// `render-verify-guard` shares a token with "Grüner Test, falsches Bild").
// Coverage stays review-borne, and the ledger's own header says so.

/** A lesson subsection: a heading in the PROSE region whose title starts with a
 *  `N.M` id. Every level from `##` down counts, so a lesson written one level UP
 *  or DOWN cannot silently escape the ledger — the four-eyes review found that a
 *  `####` demotion slipped through the first cut of both patterns. */
export const LESSON_HEADING_RE = /^(#{2,6})\s+(\d+\.\d+)\s+(.*)$/
/** A heading BELOW `##` in the prose region — every one of these must be a
 *  lesson, or it is an unledgerable bypass. */
const SUB_HEADING_RE = /^#{3,6}\s+(.*)$/

/** Repo-relative file references inside a ledger cell. A claim must point at
 *  something real, so every one of these is existence-checked. The extension
 *  alternation is LONGEST-FIRST: with `js` before `json`, `.claude/settings.json`
 *  matched as `.claude/settings.js` and the guard reported a live file as dead
 *  (caught by the against-the-real-documents check below, not by the unit cases). */
export const LEDGER_PATH_RE = /(?:[\w.-]+\/)+[\w.-]+\.(?:jsonl|json|mjs|cjs|jsx|tsx|ts|js|md)/g

/** Marker that a (3) row is an ADMITTED GAP rather than a considered "none" —
 *  the point's instruction that a lesson with no enforcement is REPORTED, never
 *  silently marked (3). */
export const LEDGER_GAP_MARK = 'LÜCKE:'

/** Minimum written reason for outcome (3). A dash is not a decision. */
const MIN_REASON_CHARS = 25

/**
 * The retrospective's lesson subsections as [{id, title}], plus the `###`
 * headings that carry no `N.M` id (`unledgerable` — they would otherwise be a
 * free bypass of the gate). Only the PROSE region is inspected: the
 * marker-delimited appendix is machine-generated and decides nothing.
 */
export function parseLessonSubsections(docText) {
  if (typeof docText !== 'string') return { lessons: [], unledgerable: [] }
  const cut = docText.indexOf(AUTO_START)
  const prose = cut >= 0 ? docText.slice(0, cut) : docText
  const lessons = []
  const unledgerable = []
  for (const raw of prose.split('\n')) {
    const line = raw.trimEnd()
    const m = LESSON_HEADING_RE.exec(line)
    if (m) {
      lessons.push({ id: m[2], title: m[3].trim() })
      continue
    }
    const sub = SUB_HEADING_RE.exec(line)
    if (sub) unledgerable.push(sub[1].trim())
  }
  return { lessons, unledgerable }
}

/**
 * Ledger rows from the Markdown table. A row is any table line whose first cell
 * is a bare `N.M` id — which skips the header and the `|---|` separator without
 * needing to know where the table starts.
 */
export function parseLedger(ledgerText) {
  if (typeof ledgerText !== 'string') return { entries: [] }
  const entries = []
  for (const raw of ledgerText.split('\n')) {
    const line = raw.trim()
    if (!line.startsWith('|')) continue
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
    if (cells.length < 4) continue
    if (!/^\d+\.\d+$/.test(cells[0])) continue
    entries.push({ id: cells[0], title: cells[1], outcome: cells[2], detail: cells[3] })
  }
  return { entries }
}

/** The `LÜCKE:`-marked rows — lessons with no enforcement, admitted as such. */
export function ledgerGaps(entries = []) {
  return entries.filter((e) => String(e.detail).includes(LEDGER_GAP_MARK))
}

/**
 * Ledger verdict: null (allow), {decision:'block', reason} or
 * {decision:'allow', warning} for the soft cases.
 *
 * FAILURE MODEL — deliberately narrower than "malformed fails open", and the
 * reinterpretation is the four-eyes review's (27.07.2026): fail-open must mean
 * "a parse BUG cannot trap the session", not "corrupting the table escapes the
 * gate". So:
 *   - ledger file ABSENT → BLOCK. The precedent is one function down: a doc
 *     without its fingerprint stamp is stale by definition, never exempt.
 *   - a row present but WRONG (bad outcome, empty reason, dead path) → BLOCK.
 *     It is a one-edit fix and can never trap.
 *   - the file exists but NOT ONE row parses → ALLOW with a loud warning. A
 *     parser that reads nothing is far likelier broken than a corpus that is
 *     genuinely empty, and this is the only shape a parse bug can take here.
 *   - no lessons parsed out of the retrospective → ALLOW with a warning, same
 *     argument in the other direction.
 * A thrown exception is the wrapper's fail-open, as for every guard here.
 *
 * `pathExists` is injected so the core stays pure; it defaults to accepting
 * everything, because a guard must never fabricate a failure it cannot check.
 */
export function evaluateLedger({ retroText, ledgerText, pathExists = () => true } = {}) {
  const { lessons, unledgerable } = parseLessonSubsections(retroText)
  if (lessons.length === 0) {
    return {
      decision: 'allow',
      warning:
        'lesson-ledger: no lesson subsections parsed out of the retrospective — treating that as a ' +
        'parse fault rather than an empty corpus, so the ledger check is skipped this turn.',
    }
  }

  if (ledgerText == null) {
    return {
      decision: 'block',
      reason:
        'Lesson-mechanism ledger: docs/analysis_de/lesson-mechanisms.md is MISSING, so no lesson of the ' +
        'retrospective carries a mechanism decision. Every lesson needs one of three outcomes — ' +
        '(1) an existing enforcer extended, (2) a new enforcer, (3) deliberately none with a written ' +
        'reason. Restore the ledger (it is tracked in git) before ending the turn.',
    }
  }

  const { entries } = parseLedger(ledgerText)
  if (entries.length === 0) {
    // A file with table syntax in it but no readable row is a CORRUPTED table,
    // not a parser fault — allowing there would let "gut the table to prose"
    // escape the gate, which the four-eyes review found as the one remaining
    // hole. Fail open only where the file shows no table at all.
    if (/^\s*\|/m.test(ledgerText)) {
      return {
        decision: 'block',
        reason:
          'Lesson-mechanism ledger: docs/analysis_de/lesson-mechanisms.md contains table rows but not one ' +
          'of them parses as a decision. A row is `| N.M | Titel | 1|2|3 | Durchsetzer oder Begründung |`. ' +
          'Repair the table — a corrupted register decides nothing.',
      }
    }
    return {
      decision: 'allow',
      warning:
        'lesson-ledger: the ledger file exists and shows no table at all, so the check is skipped this ' +
        'turn rather than blocking on what may be a parser fault — but VERIFY it by hand: ' +
        'docs/analysis_de/lesson-mechanisms.md.',
    }
  }

  const byId = new Map(entries.map((e) => [e.id, e]))
  const problems = []
  const advisories = []

  // Two rows for one lesson: last-wins would silently pick one of two possibly
  // CONTRADICTORY decisions, and the register would read as if it had decided.
  const seen = new Set()
  for (const entry of entries) {
    if (seen.has(entry.id)) problems.push(`§${entry.id} has more than one ledger row — one lesson, one decision`)
    seen.add(entry.id)
  }

  for (const name of unledgerable) {
    problems.push(
      `the subsection "${name}" carries no N.M id, so it cannot be ledgered — number it (### 3.N …) ` +
        'or the gate has a free bypass',
    )
  }

  for (const lesson of lessons) {
    const entry = byId.get(lesson.id)
    if (!entry) {
      problems.push(
        `§${lesson.id} "${lesson.title}" has NO ledger entry — decide its mechanism now, while the ` +
          'decision is cheap: (1) widen an existing enforcer, (2) build a new one, or (3) none, with a reason',
      )
      continue
    }
    if (!['1', '2', '3'].includes(entry.outcome)) {
      problems.push(`§${lesson.id}: outcome "${entry.outcome}" is not one of 1, 2 or 3`)
      continue
    }
    const claimed = String(entry.detail).match(LEDGER_PATH_RE) ?? []
    const dead = claimed.filter((p) => !pathExists(p))
    if (dead.length) {
      problems.push(
        `§${lesson.id} claims ${dead.map((p) => `\`${p}\``).join(', ')}, which does not exist — a rule ` +
          'that claims an enforcer nobody built is the defect docs/rule-corpus-audit.md A29 records',
      )
      continue
    }
    if (entry.outcome !== '3' && claimed.length === 0) {
      problems.push(
        `§${lesson.id}: outcome ${entry.outcome} names an enforcer but the cell contains no file path — ` +
          'name the enforcing file, or record outcome 3 with a reason',
      )
      continue
    }
    if (entry.outcome === '3' && String(entry.detail).replace(LEDGER_PATH_RE, '').trim().length < MIN_REASON_CHARS) {
      problems.push(`§${lesson.id}: outcome 3 needs a WRITTEN reason, not a blank or a dash`)
      continue
    }
    if (entry.title && lesson.title && entry.title !== lesson.title) {
      advisories.push(`§${lesson.id} was retitled ("${entry.title}" → "${lesson.title}")`)
    }
  }

  const lessonIds = new Set(lessons.map((l) => l.id))
  for (const entry of entries) {
    if (!lessonIds.has(entry.id)) {
      problems.push(
        `ledger row §${entry.id} refers to no lesson in the retrospective — delete the orphan row ` +
          '(a claim without a referent is a claim without teeth)',
      )
    }
  }

  if (problems.length) {
    return {
      decision: 'block',
      reason:
        'Lesson-mechanism ledger (docs/analysis_de/lesson-mechanisms.md): a lesson without a recorded ' +
        'mechanism decision is a rule without a mechanism.\n' +
        problems.map((p) => `  - ${p}`).join('\n') +
        '\nAsk in this order: does an EXISTING enforcer already cover it (widen it — the preferred ' +
        'outcome)? does this lesson make an OLDER rule redundant, so the corpus shrinks? A new guard is ' +
        'the last resort. A lesson with no enforcement at all is marked 3 with ' +
        `"${LEDGER_GAP_MARK} …" and REPORTED, never silently passed off as a considered "none".` +
        (advisories.length ? `\n  (advisory: ${advisories.join('; ')})` : ''),
    }
  }
  return advisories.length ? { decision: 'allow', warning: `lesson-ledger advisory: ${advisories.join('; ')}` } : null
}

// ---------------------------------------------------------------------------
// Guard decision.

/** The guide's review stamp (see GUIDE_FINGERPRINT_RE), or null. */
export function extractGuideFingerprint(text) {
  if (typeof text !== 'string') return null
  const m = text.match(GUIDE_FINGERPRINT_RE)
  return m ? m[1] : null
}

/**
 * Stale/fresh verdict for the Stop-hook: null (allow) when BOTH analysis docs
 * are current for the given sources fingerprint, else {decision:'block',
 * reason}. A doc WITHOUT its stamp is stale by definition (never brought under
 * the mechanism). The retrospective is judged first — the guide's stamp means
 * "I read the guide against these sources", which only means anything once the
 * retrospective actually reflects them. `guideText` undefined (guide absent on
 * this machine) skips the guide half; the doc-absent and paused no-ops are the
 * wrapper's job.
 */
export function evaluateCurrency({ docText, guideText, currentFingerprint } = {}) {
  const recorded = extractFingerprint(docText)
  if (!recorded || recorded !== currentFingerprint) {
    const detail = recorded
      ? 'the durable sources (feedback/project memories, guard scripts, revert trail, process TASKS points) changed since its last refresh'
      : 'it carries no sources fingerprint yet (never refreshed under the currency mechanism)'
    return {
      decision: 'block',
      reason:
        `Retrospective currency: docs/analysis_de/retrospektive-zusammenarbeit.md is STALE — ${detail}. ` +
        'Run `node scripts/retro-refresh.mjs` (regenerates only the marker-delimited auto section), ' +
        'then REVIEW the document: does a NEW problem class need its own row in the summary table ' +
        'plus a prose paragraph (German, in the analysis sections)? The prose is never auto-written — ' +
        'extend it yourself where the new source warrants it.',
    }
  }

  if (typeof guideText === 'string') {
    const guideRecorded = extractGuideFingerprint(guideText)
    if (!guideRecorded || guideRecorded !== currentFingerprint) {
      return {
        decision: 'block',
        reason:
          'Beginner-guide currency: docs/analysis_de/vibe-coding-anleitung.md has NOT been reviewed ' +
          'against the changed sources' +
          (guideRecorded ? '' : ' (it carries no review stamp yet)') +
          '. It is prose only — nothing regenerates it, so it silently keeps superseded advice ' +
          '(observed 25.07.2026: it still taught the old "what goes wrong twice gets a mechanism" ' +
          'rule a day after that rule had been sharpened in the retrospective, and the user found it). ' +
          'READ it against the new lesson: does it need a new pitfall + prompt, and does any existing ' +
          'line now contradict the retrospective? Fix what is stale, then attest: ' +
          'node scripts/retro-refresh.mjs --guide-reviewed.',
      }
    }
  }
  return null
}
