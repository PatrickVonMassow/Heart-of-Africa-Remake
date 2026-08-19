// Pure decision core of the rule-corpus review guard.
//
// The rule corpus — memories, CLAUDE.md, the guard scripts, the texts injected
// into every session and every prompt — grows only by accretion. Nothing ever
// forces a READ of the whole thing, so it rots silently: a stale rule does not
// fail a build the way a stale function does, it just keeps being obeyed. The
// 25.07.2026 audit found the predictable result — contradictions (worst of all
// INSIDE a single file, because one writes the addition without re-reading the
// body), duplications, rules asserting an enforcement that was never built, and
// wrong content in the highest-FREQUENCY channel of all: the reminder replayed
// on every prompt was teaching two withdrawn rules.
//
// That audit only happened because a human asked for it. This module makes it
// periodic instead: a review is owed when enough time has passed OR when the
// corpus has grown by enough entries since the last one, and the block message
// carries the six axes and the frequency ordering so the review is not
// improvised each time.
//
// Side-effect free. The wrapper (rule-review-guard.mjs) gathers the corpus and
// is fail-open.
import { scopeMandatoryDuty } from './guard-duty-core.mjs'

/** A review is owed at the latest this many days after the previous one. */
export const REVIEW_INTERVAL_DAYS = 14
/**
 * ...or as soon as this many corpus entries appeared since it. Accretion, not
 * time, is what actually creates the drift, so growth triggers independently.
 */
export const GROWTH_BUDGET = 10

/** The six axes every rule is judged on (audit scope, user 25.07.2026). */
export const AXES = [
  'SAUBER — steht die Regel genau einmal, am richtigen Ort, eindeutig?',
  'AKTUELL — beschreibt sie noch, wie das Projekt wirklich arbeitet?',
  'REDUNDANT — steht dieselbe Regel anderswo? Auf EINE verbindliche Fassung zusammenführen, der Rest verweist.',
  'WIDERSPRÜCHLICH — widerspricht sie einer anderen Regel oder dem Code?',
  'WIRKUNGSLOS — feuert ihr Mechanismus überhaupt? Ein Wächter, der nie auslösen KANN, zählt als wirkungslos.',
  'VERALTET — überholt? Dann als ZURÜCKGEZOGEN markieren (mit der überlebenden Einsicht), nicht still löschen.',
]

/**
 * Review order. The cost of a wrong rule scales with how often its text is put
 * in front of the model, so the loudest channels are read first — the audit
 * found its worst errors exactly there.
 */
export const HIGH_FREQUENCY_FIRST = [
  'scripts/dashboard-reminder-hook.mjs (bei JEDEM Prompt eingeblendet)',
  'scripts/batch-resume-hook.mjs (bei jedem Sitzungsstart)',
  'die Meldungstexte der Stop-Wächter (bei jedem Zug-Ende, sobald sie greifen)',
  'MEMORY.md samt der referenzierten Memories (jede Sitzung)',
  'CLAUDE.md §2/§4/§6/§7/§9 (jede Sitzung)',
]

const DAY_MS = 86_400_000

/**
 * Decide whether a rule-corpus review is owed.
 *
 * All inputs optional; anything missing or unparseable errs toward ALLOW, since
 * the wrapper's fail-open contract must not turn a bookkeeping hiccup into a
 * trapped session.
 *   now              epoch ms
 *   lastReviewedAt   epoch ms of the last attested review (null: never)
 *   entryCount       corpus entries now
 *   reviewedCount    corpus entries at the last review
 *   paused           .claude/batch-paused exists
 */
export function evaluateRuleReview(input) {
  const {
    now = null,
    lastReviewedAt = null,
    entryCount = null,
    reviewedCount = null,
    paused = false,
    fence = null,
    sessionId = '',
  } = input ?? {}
  if (paused) return null
  if (!Number.isFinite(now)) return null

  let why = null
  if (!Number.isFinite(lastReviewedAt)) why = 'Für den Regelbestand ist noch NIE eine Durchsicht verzeichnet worden.'

  const days = Number.isFinite(lastReviewedAt) ? Math.floor((now - lastReviewedAt) / DAY_MS) : 0
  if (!why && days >= REVIEW_INTERVAL_DAYS) {
    why = `Die letzte Durchsicht des Regelbestands liegt ${days} Tage zurück (Intervall: ${REVIEW_INTERVAL_DAYS}).`
  }

  if (!why && Number.isFinite(entryCount) && Number.isFinite(reviewedCount)) {
    const grown = entryCount - reviewedCount
    if (grown >= GROWTH_BUDGET) {
      why =
        `Der Regelbestand ist seit der letzten Durchsicht um ${grown} Einträge gewachsen ` +
        `(Budget: ${GROWTH_BUDGET}) — von ${reviewedCount} auf ${entryCount}.`
    }
  }

  if (!why) return null
  const scoped = scopeMandatoryDuty({
    owed: true,
    fence,
    guardId: 'rule-review-guard',
    sessionId,
    duty: 'the due rule-corpus review',
  })
  return scoped.deferred
    ? { decision: 'defer', deferred: true, reason: scoped.message }
    : owed(`${why} Diese Pflicht schuldet Sitzung ${sessionId || '<unknown owner>'}.`)
}

function owed(why) {
  return { decision: 'block', reason: formatReviewDemand(why) }
}

/** The block message: why it is owed, how to run it, how to attest it. */
export function formatReviewDemand(why) {
  return [
    `REGELBESTAND-DURCHSICHT FÄLLIG: ${why}`,
    '',
    'Der Bestand altert wie Code, aber ohne Compiler — eine veraltete Regel schweigt und',
    'wird trotzdem befolgt. Sieh ihn GANZ durch, nicht nur auf Lücken. Jede Regel auf sechs Achsen:',
    ...AXES.map((a) => `  · ${a}`),
    '',
    'REIHENFOLGE — zuerst die Texte, die am häufigsten eingeblendet werden:',
    ...HIGH_FREQUENCY_FIRST.map((c, i) => `  ${i + 1}. ${c}`),
    '',
    'METHODE: Prüfe jede Regel gegen den CODE, nicht gegen die Nachbarregel — ein Abgleich',
    'von Prosa mit Prosa schreibt die Drift fest, statt sie zu finden. Achte besonders auf',
    'Widersprüche INNERHALB einer Datei; die entstehen, weil man den Anbau schreibt, ohne',
    'den Bestand zu lesen, und niemand denselben Text zweimal prüft.',
    '',
    'Wenn die Durchsicht erledigt ist, mit Beleg quittieren:',
    '  node scripts/rule-review.mjs --reviewed --evidence "<was geprüft, was gefunden, was geändert>"',
  ].join('\n')
}

/**
 * Is an attestation's evidence substantial enough to be one? A review whose
 * proof is "ok" is not a review; the guard would otherwise be satisfiable by
 * typing anything, which is the "guard that cannot fail" defect it exists to
 * find in others.
 */
export function isSubstantialEvidence(text) {
  const t = String(text ?? '').trim()
  return t.length >= 40 && t.split(/\s+/).filter(Boolean).length >= 8
}
