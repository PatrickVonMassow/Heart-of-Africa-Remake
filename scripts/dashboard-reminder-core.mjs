// The text the UserPromptSubmit hook injects into EVERY user prompt — the most
// expensive text in this project, so it lives in a pure module the Vitest layer
// can hold to its shape and its size (point 436).
//
// WHY IT SHRANK, from 2153 characters to under 900. It used to restate the
// board's whole structure contract: four sections, their order, the card shape,
// the `open`-attribute ban, the queue card's header meta. Every one of those is
// now REFUSED by a gate before the board can be published — `structureViolations`
// (board-structure-core) on the sections, their order and the wrappers,
// `auto-open` and `queue-meta` in dashboard-guard-core. Reminding of a rule a
// gate already refuses to break is the pattern this project replaced everywhere
// else, and here it was billed on every single prompt.
//
// WHAT STAYS is exactly what no mechanism can check — a judgement about MEANING:
// whether a piece of information sits in the section it belongs to, whether the
// board looks right on a phone in portrait, and that a structure change is
// PROPOSED as a card rather than made. Plus the commands, because a duty with no
// command is a duty that gets postponed. Dropping any of these would be worse
// than the repetition, which is why dashboard-reminder-core.test.mjs pins both
// halves: an enforced claim may not reappear, the rest may not disappear.
import { EDIT_CMD, PUBLISH_CMD } from './board-remedy.mjs'

/** Where the board's binding structure contract is stated, once. */
export const CONTRACT_MEMORY = 'batch-dashboard-artifact'

/**
 * The claims a gate already enforces, with the phrasing each used to be stated
 * in. None of them may return to the injected text — the test reads this list,
 * so a NEW gate means deleting a sentence here rather than adding one.
 *
 * THESE PATTERNS ARE KEYWORD-LEVEL, NOT PARAPHRASE-PROOF (four-eyes review,
 * 30.07.2026, which demonstrated it: "Genau 4 Sektionen in fester Ordnung"
 * dodges all three of the structure patterns). The primary defence against the
 * text growing back is therefore REMINDER_CHAR_BUDGET below, which no rewording
 * escapes; the patterns catch the literal relapse, which is the likely one.
 */
export const ENFORCED_CLAIMS = [
  { id: 'four-sections', by: 'board-structure-core (sections-wrong)', pattern: /vier sektionen/i },
  { id: 'section-order', by: 'board-structure-core (sections-wrong)', pattern: /reihenfolge/i },
  { id: 'card-shape', by: 'board-structure-core (now-card-outside, section-wrappers)', pattern: /eingeklappt/i },
  { id: 'no-open-attribute', by: 'dashboard-guard-core (auto-open)', pattern: /`open`/i },
  { id: 'queue-header-meta', by: 'dashboard-guard-core (queue-meta)', pattern: /warteschlange/i },
  { id: 'erledigt-collapsible', by: 'dashboard-guard-core (section-not-collapsible)', pattern: /erledigt/i },
]

/**
 * The duties NO gate can decide, which is why they are still written out. The
 * test asserts each is present, so a later shortening cannot quietly drop one.
 */
export const UNENFORCEABLE_DUTIES = ['keine Infos in fremde Sektionen', 'Mobil-Hochformat', 'Von dir zu klären']

/** Every command the reminder must hand the reader. */
export const REMINDER_COMMANDS = [`${EDIT_CMD} vdzk-add`, `${EDIT_CMD} <cmd>`, PUBLISH_CMD]

/**
 * A CEILING on the injected size, measured (point 436): the text costs a full
 * prompt's worth of context on every single turn, so it is budgeted like the
 * documents in doc-budget-core. Raising it needs a reason that is not "a longer
 * telling of something already here".
 */
export const REMINDER_CHAR_BUDGET = 950

/**
 * The injected board obligation. `mtimeNote` is appended verbatim (the age of
 * the canonical board file, or '' when it cannot be read).
 */
export function boardReminderText(mtimeNote = '') {
  return (
    '[dashboard-reminder] PFLICHT: Das Dashboard IMMER als erstes im Zug aktualisieren, wenn sich ' +
    'der Batch-Zustand geändert hat. Die verbindliche Board-Struktur steht an EINER Stelle — Memory ' +
    `\`${CONTRACT_MEMORY}\` — und eine verletzte Struktur weist der Publish-Gate von sich aus ` +
    'zurück; dagegen musst du nicht anschreiben. Bei DIR liegt, was keine Maschine prüfen kann: ' +
    'keine Infos in fremde Sektionen; Mobil-Hochformat muss gut aussehen; empfiehlst du dringend ' +
    `eine Strukturänderung, schreibe sie als Karte in »Von dir zu klären« (${EDIT_CMD} vdzk-add ` +
    '"<Titel>" "<Frage>") statt sie selbst zu machen. Bei JEDER Änderung: die GANZE Datei lesen, ' +
    'jede Sektion gegen den Ist-Zustand prüfen (topaktuell, konsistent, redundanzfrei), dann ' +
    `\`${EDIT_CMD} <cmd>\` (Edit und Publish in einem) oder \`${PUBLISH_CMD}\`.` +
    mtimeNote
  )
}
