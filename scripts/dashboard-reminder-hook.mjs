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
  '[dashboard-reminder] PFLICHT in diesem Zug: Prüfe, ob das Batch-Dashboard ' +
  '(scratchpad/hoa-batch-dashboard.html) den JETZT-Zustand zeigt (Now-Block, ' +
  'Warteschlange nur offene Punkte in Arbeitsreihenfolge, Erledigt, Zuletzt ' +
  'passiert, Footer-Zeit/-Commit). Wenn irgendetwas veraltet ist: SOFORT ' +
  'aktualisieren UND per Artifact republishen, bevor andere Arbeit weitergeht.' +
  mtimeNote,
)
