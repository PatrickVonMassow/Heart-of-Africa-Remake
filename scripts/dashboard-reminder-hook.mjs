// UserPromptSubmit hook (user mandate 16.07.2026, after repeated dashboard
// staleness): inject the standing dashboard obligation into the context on
// EVERY user prompt, so no turn can end with a stale board. Stdout becomes
// context for the assistant.
//
// Since 22.07.2026 (the now-card still said point 200 while the work had
// pivoted to point 210 after a user question) this hook also ARMS the pivot
// check: it writes .claude/focus-check-pending.json, and the dashboard Stop
// guard BLOCKS the turn from ending until the assistant explicitly confirms or
// re-declares its focus (scripts/focus.mjs) — enforcement, not a reminder.
import fs from 'node:fs'
import path from 'node:path'
import { PENDING_PATH, writeJsonAtomic, mergeState } from './dashboard-state.mjs'

// Arm the pivot check for THIS session (fail-soft: the reminder text below is
// still the payload if any of this goes wrong).
try {
  let sid = ''
  try {
    sid = JSON.parse(fs.readFileSync(0, 'utf8')).session_id || ''
  } catch {
    /* no/!JSON stdin */
  }
  writeJsonAtomic(PENDING_PATH, { sessionId: sid, at: Date.now() })
  // Keep the current session's scratchpad target on record so a plain
  // `node scripts/dashboard-publish.mjs` works even without the env variable.
  if (process.env.CLAUDE_SCRATCHPAD_DIR) {
    mergeState({
      scratchpadPath: path.resolve(process.env.CLAUDE_SCRATCHPAD_DIR, 'hoa-batch-dashboard.html'),
    })
  }
} catch {
  // best effort
}

// Surface the current Europe/Berlin time on EVERY user prompt so the reply can
// lead with an accurate timestamp (the chat-timestamp rule) without a separate
// Node call — the missing-timestamp failure mode was skipping that call under
// flow in long multi-tool turns (user complaint 19.07.2026). This hook script is
// re-executed each turn, so the time is always current in context.
const nowBerlin = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Berlin',
}).format(new Date())
console.log(
  '[timestamp] PFLICHT: Beginne JEDE an den Nutzer gerichtete Antwort mit diesem ' +
  `Zeitstempel — aktuelle Zeit (Europe/Berlin): ${nowBerlin}.`,
)

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
  '»als nächstes«, »diese Nacht fertig«. Die Karte muss IMMER zeigen, was du ' +
  'GERADE tust — auch Wartezeit-Vorarbeit (welche Folge-Punkte du gerade ' +
  'vorbereitest), nie so wirken, als würdest du nur warten/idlen. ' +
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

console.log(
  '[focus-guard] Diese Nutzer-Nachricht hat den Fokus-Abgleich SCHARFGESCHALTET: bevor dieser ' +
  'Zug enden kann, musst du prüfen, ob die »Woran ich gerade arbeite«-Karte noch das nennt, was ' +
  'du WIRKLICH tust — dann `node scripts/focus.mjs confirm` (unverändert) oder `node scripts/' +
  'focus.mjs set <N> "<was>"` + Karte aktualisieren + `node scripts/dashboard-publish.mjs` + ' +
  'Artifact-Republish + `--synced` (geändert). Der Stop-Guard blockiert sonst das Zug-Ende.',
)

// Repeat the timestamp obligation LAST — the final line of hook output sits closest
// to where the reply is generated, so it is the most salient (the top line alone kept
// getting drowned by the long dashboard reminder and skipped, user complaint
// 20.07.2026: "Warum sind die Timestamps schon wieder weg"). Unmissable banner.
console.log(
  '\n============================================================\n' +
  `>>> WICHTIGSTE REGEL — die ERSTE ZEILE deiner Antwort an den Nutzer MUSS dieser\n` +
  `>>> Zeitstempel sein: "${nowBerlin}".  JEDE Antwort, ausnahmslos.\n` +
  `>>> Beginnt deine Antwort nicht damit, ist sie falsch formatiert — hol es sofort nach.\n` +
  '============================================================',
)
