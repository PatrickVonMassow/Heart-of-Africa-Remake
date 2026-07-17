// UserPromptSubmit hook (user mandate 16.07.2026, after repeated dashboard
// staleness): inject the standing dashboard obligation into the context on
// EVERY user prompt, so no turn can end with a stale board. Stdout becomes
// context for the assistant.
import fs from 'node:fs'

let mtimeNote = ''
try {
  const path = process.env.CLAUDE_SCRATCHPAD_DIR
    ? `${process.env.CLAUDE_SCRATCHPAD_DIR}/hoa-batch-dashboard.html`
    : null
  if (path && fs.existsSync(path)) {
    const age = Math.round((Date.now() - fs.statSync(path).mtimeMs) / 60000)
    mtimeNote = ` Letzte Dashboard-Dateiänderung vor ~${age} min.`
  }
} catch {
  // best effort — the reminder itself is the payload
}
console.log(
  '[dashboard-reminder] PFLICHT in diesem Zug, wenn du das Dashboard anfasst: ' +
  'Lies die GESAMTE Datei scratchpad/hoa-batch-dashboard.html mit dem Read-Tool ' +
  'und prüfe JEDE Sektion einzeln gegen den Ist-Zustand — nicht nur die, die du ' +
  'gerade editierst. Checkliste, ALLE müssen stimmen: (1) Now-Block, ' +
  '(2) »Für dich zu klären« — erledigte Rückfragen RAUS, (3) Zeiten & Aufwand, ' +
  '(4) »Zuletzt passiert« nur echt Neuestes, (5) Warteschlange nur offene Punkte ' +
  'in Arbeitsreihenfolge, (6) »Deine gemeldeten Bugs«-Nachlese darf nichts als ' +
  '»alles erledigt« behaupten, wenn offene Meldungen existieren, (7) Erledigt, ' +
  '(8) Footer-Zeit (gemessen) + -Commit + Punktzahl. Häufigster Fehler: eine ' +
  'veraltete Stelle AUSSERHALB der gerade editierten Sektion (z. B. eine längst ' +
  'geklärte Rückfrage). Bei irgendeiner Abweichung: SOFORT korrigieren UND per ' +
  'Artifact republishen, bevor andere Arbeit weitergeht.' +
  mtimeNote,
)
