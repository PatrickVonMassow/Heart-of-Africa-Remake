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
import { PENDING_PATH, STATE_PATH, readJson, writeJsonAtomic, mergeState } from './dashboard-state.mjs'
import { heldByOtherLiveOwner, withdrawHandover } from './batch-singleton.mjs'

// Hard singleton (24.07.2026): a session that does not own the live batch lock
// has NO dashboard/focus duty — arming the pivot check or issuing the board
// obligations would conscript it into batch work. It keeps only the timestamp
// rule (a universal chat rule, not a batch duty).
let standDown = false
let sid = ''
try {
  sid = JSON.parse(fs.readFileSync(0, 'utf8')).session_id || ''
} catch {
  /* no/!JSON stdin */
}
try {
  standDown = heldByOtherLiveOwner(sid)
} catch {
  standDown = false
}
// A user prompt is the earliest possible proof that a session which took a point
// boundary is alive and about to work again — earlier than any tool call, and it
// arrives even for a turn that never calls one (point 388, four-eyes finding 4).
// Withdrawing the handover here keeps the launcher from spawning a successor
// beside it. Owner-guarded, so it is a no-op once the successor holds the lock.
try {
  withdrawHandover(sid)
} catch {
  /* best effort */
}

// Arm the pivot check for THIS session (fail-soft: the reminder text below is
// still the payload if any of this goes wrong).
try {
  if (!standDown) {
    writeJsonAtomic(PENDING_PATH, { sessionId: sid, at: Date.now() })
    // Stamp the turn boundary the BOARD-FIRST PreToolUse gate measures against
    // (board-first-core.mjs): a focus stamp older than this means the board does
    // not yet describe the work about to start. No stamp at all leaves the gate
    // inactive, so this hook is what arms it.
    mergeState({ turnStartedAt: Date.now() })
  }
  // The SAME boundary, but keyed per session and stamped in EVERY state —
  // stand-down included. `turnStartedAt` above is shared by all sessions and
  // written only by the owner, which is correct for the board-first gate (it
  // judges the owner alone) and wrong for any check that must bind a session
  // standing down: that session would measure its turn against a stranger's
  // clock. Its own key cannot be read by mistake, and board-first keeps
  // reading the field it always read.
  mergeState({ turnStartedAtBySession: { ...((readJson(STATE_PATH) ?? {}).turnStartedAtBySession ?? {}), [sid]: Date.now() } })
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

if (standDown) {
  console.log(
    '[batch-singleton] Eine ANDERE Session hält den Batch-Lock (lebendig geprüft). STAND DOWN: ' +
      'Diese Session ist NICHT der Batch-Worker — keine Batch-Arbeit, kein Merge nach main, ' +
      'kein TASKS.md-/Dashboard-Edit. Beantworte die Nutzer-Nachricht normal.',
  )
} else {
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
  'Karte — ALLE eingeklappt, NIE ein `open`-Attribut (Nutzer-Mandat 23.07.2026; ' +
  'das Skript im Board merkt sich, was der LESER geöffnet hat): ' +
  '(1) »Woran ich gerade arbeite« — EINE KARTE JE PARALLEL BEARBEITETEM PUNKT ' +
  '(Nutzer-Entscheidung 22.07.2026), eingeklappt Titel + Startzeit + ' +
  'voraussichtliche Endzeit, ausgeklappt Status/Details; KEIN »gerade fertig«, ' +
  '»als nächstes«, »diese Nacht fertig«. Die Karte muss IMMER zeigen, was du ' +
  'GERADE tust — auch Wartezeit-Vorarbeit (welche Folge-Punkte du gerade ' +
  'vorbereitest), nie so wirken, als würdest du nur warten/idlen. ' +
  '(2) »Von dir zu klären« — Karten, eingeklappt nur Titel. ' +
  '(3) »Warteschlange« in Arbeitsreihenfolge — eingeklappt Titel + rechts im Header ' +
  'die geschätzte Task-Dauer (»~2 h«; das ~ genügt, kein »geschätzt« davor; nach ' +
  'jedem Vorarbeit-Schritt an einem Task dessen Schätzung aktualisieren), ' +
  'KEINE Hinweise wie »neu«/»hochgezogen«. ' +
  '(4) »Erledigt« — eingeklappt Titel + Startzeit + Endzeit. Diese Sektion ist ' +
  'ZUSÄTZLICH als GANZES einklappbar (Nutzer 26.07.2026): ihre Überschrift steckt in ' +
  '<details class="sect"><summary><h2>Erledigt</h2></summary>…</details> und ist ' +
  'standardmäßig ZU — sie ist das Archiv und der längste Teil des Boards. ' +
  'Keine weiteren Sektionen (kein »Zeiten & Aufwand«, »Zuletzt passiert«, »gemeldete ' +
  'Bugs«). Was schon im eingeklappten Header steht, NICHT zusätzlich in den ausgeklappten ' +
  'Details wiederholen (z. B. Start/Endzeit der aktuellen-Arbeit-Karte nur im Header). ' +
  'Mobil-Hochformat muss gut aussehen. Empfiehlst du dringend eine ' +
  'Strukturänderung, schreibe sie als Karte in »Von dir zu klären«. ' +
  'Bei JEDER Änderung: die GANZE Datei lesen, jede Sektion gegen den Ist-Zustand ' +
  'prüfen (topaktuell, konsistent, redundanzfrei), dann `node scripts/board-publish.mjs`.' +
  mtimeNote,
)

console.log(
  '[focus-guard] Diese Nutzer-Nachricht hat den Fokus-Abgleich SCHARFGESCHALTET: bevor dieser ' +
  'Zug enden kann, musst du prüfen, ob die »Woran ich gerade arbeite«-Karte noch das nennt, was ' +
  'du WIRKLICH tust — dann `node scripts/focus.mjs confirm` (unverändert) oder `node scripts/' +
  'focus.mjs set <N> "<was>"` + Karte aktualisieren + `node scripts/board-publish.mjs` + ' +
  '`--synced` (geändert). Der Stop-Guard blockiert sonst das Zug-Ende.',
)
}

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
