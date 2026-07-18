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
  '[dashboard-reminder] PFLICHT: Das Dashboard IMMER als erstes im Zug aktualisieren, ' +
  'wenn sich der Batch-Zustand geändert hat. Die STRUKTUR ist vom Nutzer verbindlich ' +
  'festgelegt (18.07.2026) und darf NIE ohne ausdrückliche Freigabe geändert werden — ' +
  'keine neuen Sektionen, keine Features entfernen, keine Infos in fremde Sektionen. ' +
  'Genau VIER Sektionen in dieser Reihenfolge, jeder Eintrag eine ein-/ausklappbare ' +
  'Karte (nur die aktuelle-Arbeit-Karte offen): ' +
  '(1) »Woran ich gerade arbeite« — eine Karte, eingeklappt Titel + Startzeit + ' +
  'voraussichtliche Endzeit, ausgeklappt Status/Details; KEIN »gerade fertig«, ' +
  '»als nächstes«, »diese Nacht fertig«. ' +
  '(2) »Von dir zu klären« — Karten, eingeklappt nur Titel. ' +
  '(3) »Warteschlange« in Arbeitsreihenfolge — eingeklappt Titel + rechts im Header ' +
  'die geschätzte Task-Dauer (»~2 h«; das ~ genügt, kein »geschätzt« davor; nach ' +
  'jedem Vorarbeit-Schritt an einem Task dessen Schätzung aktualisieren), ' +
  'KEINE Hinweise wie »neu«/»hochgezogen«. ' +
  '(4) »Erledigt« — eingeklappt Titel + Startzeit + Endzeit. ' +
  'Keine weiteren Sektionen (kein »Zeiten & Aufwand«, »Zuletzt passiert«, »gemeldete ' +
  'Bugs«). Was schon im eingeklappten Header steht, NICHT zusätzlich in den ausgeklappten ' +
  'Details wiederholen (z. B. Start/Endzeit der aktuellen-Arbeit-Karte nur im Header). ' +
  'Mobil-Hochformat muss gut aussehen. Empfiehlst du dringend eine ' +
  'Strukturänderung, schreibe sie als Karte in »Von dir zu klären«. ' +
  'Bei JEDER Änderung: die GANZE Datei lesen, jede Sektion gegen den Ist-Zustand ' +
  'prüfen (topaktuell, konsistent, redundanzfrei), dann per Artifact republishen.' +
  mtimeNote,
)
