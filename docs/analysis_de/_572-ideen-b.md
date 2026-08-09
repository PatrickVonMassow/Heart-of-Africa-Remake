# Punkt 572 — Ideenliste B (blind erarbeitet)

Eine der zwei blind-parallelen Hälften der divergenten Stufe von Punkt 572
(CLAUDE.md §6). Autor: Fable 5. Diese Liste wurde ohne Kenntnis der Liste A
erarbeitet, ausschließlich aus der Messung in `durchsatz-analyse.md` §1–§2,
den dort zitierten Vorarbeiten (`picture-check-cost.md`,
`picture-check-levers.md`, `harness-primitives-evaluation.md`,
`retrospektive-zusammenarbeit.md`, CLAUDE.md §6) und eigener Online-Recherche
(Abschnitt 3). Sie ist bewusst vollständig statt kuratiert — die Vereinigung
prüft und ordnet.

Die zwei Achsen bleiben getrennt: **Achse A** = Wall-Clock pro Task (Brief →
Merge), **Achse B** = Tokens pro Task (Hauptsitzung UND Subagenten). Jede
Maßnahme nennt Achse, Wirkung gegen die Basislinie, Gegenkosten auf der
anderen Achse und Risiko.

---

## 0. Eigene Zusatzmessungen, auf denen die Bezifferungen ruhen

Alle mit `node scripts/measure-task-cost.mjs --json` (09.08.2026) aus
denselben Daten wie §1 der Durchsatz-Analyse gezogen; wo eine Zahl unten
„selbst gemessen" heißt, ist sie hieraus:

- **Median 245 Turns pro Punkt**; median ≈ **176k rohe Cache-Read-Tokens pro
  Turn** (Proxy für die mittlere Kontextgröße eines Turns), gewichtet ≈
  **17,6k pro Turn**.
- **Die Top-10-Punkte tragen 51 % der punktzugeordneten Kosten und 67,3 %
  der punktzugeordneten Verifikations-Tokens.** Der teuerste (342) allein:
  101,8 M gewichtet, davon 82,9 M Verifikation, 2.438 Turns, ø 401k rohe
  Cache-Reads pro Turn.
- Von 32.166 Turns im Fenster setzen **18.296 genau EINEN Werkzeugaufruf** ab
  und 13.712 keinen; kein einziger Turn setzt mehrere ab (Basislinie §1.8).
- Zähler-Anteile gewichtet: Cache-Read 78,7 %, **Cache-Creation 16,8 %**,
  Output 4,5 %, Input ~0 %.
- Sockel: 3,55 M amortisierte Hauptsitzung + 0,99 M Median in-Branch ≈
  **4,5 M gewichtet je Punkt**.

Daraus die zwei Rechenregeln, die fast alle Bezifferungen unten treiben:

1. **Ein vermiedener Turn spart median ≈ 17,6k gewichtet** (bei den teuren
   Punkten das Doppelte bis Vierfache).
2. **1k Tokens weniger Dauerlast im Kontext spart je Median-Punkt
   ≈ 24,5k gewichtet** (1k × 245 Turns × 0,1 Cache-Read-Gewicht) — über das
   ganze Fenster ≈ 3,2 M je 1k Tokens (32k Turns).

---

## 1. Maßnahmen, nach der angegriffenen Phase

### 1.1 Verifikation (43,1 % der Tokens, 31,5 % der Maschinenstunden)

Die Messung sagt zweierlei: die Verifikation dominiert nicht den typischen
Punkt (Median-Anteil 27,2 %), sondern den teuren (67,3 % der
Verifikations-Tokens sitzen in den Top-10). Die wirksamen Maßnahmen sind
deshalb die, die **Schleifen** begrenzen, nicht die, die den Einzellauf
verbilligen.

**V1 — Verifikations-Leiter: billig iterieren, teuer nur einmal beweisen.**
Während der Fix-Schleife eines Render-Punkts läuft NUR die billigste
abdeckende Suite auf EINEM Backend (der WebGPU-Alltagsspur aus Punkt 571);
der volle Beweis — beide Backends, ggf. LARGE — läuft genau EINMAL, am Ende,
auf dem Stand, der gemergt wird (was die Merge-Regel ohnehin verlangt).
- Achse: **B primär, A sekundär.** Punkt 342 verbrannte 82,9 M in
  Verifikation; wären auch nur die Hälfte davon wiederholte teure Läufe, die
  eine Leiter durch `flow`-Iterationen ersetzt hätte (11× billiger je Lauf,
  `picture-check-cost.md` §2), läge die Ersparnis je Ausreißer-Punkt bei
  zweistelligen M. Grobe Schätzung, weil die Transkripte nicht ausweisen,
  welcher Lauf Iteration und welcher Beweis war.
- Gegenkosten: gelegentlich EINE zusätzliche Schleife, wenn der finale
  Beide-Backends-Beweis eine Divergenz zeigt, die die billige Spur nicht sah.
- Risiko: gering — der finale Beweis bleibt unangetastet; nur die
  *Reihenfolge* ändert sich. Die Disziplin „auf beiden Backends beweisen"
  wird nicht verdünnt.
- Voraussetzung: als Regel formulieren (Brief-Baustein für Render-Punkte),
  sonst bleibt es Zufall.

**V2 — Iterations-Deckel mit Eskalation statt Endlos-Schleife.** Nach N
(z. B. 3) roten Durchgängen derselben Browser-Suite auf demselben Punkt
STOPPT der Agent, schreibt eine Diagnose (was rot ist, was probiert wurde)
und eskaliert, statt weiterzuschleifen. Die Basislinie zeigt, dass genau
diese Schleifen den Ausläufer machen (342: 81 % Verifikation; Retrospektive
§3.31: ein Wächter-Loop kostete ~30 Turns bei vollem Kontext).
- Achse: **B massiv am Ausläufer** (10 von 63 Punkten tragen die Hälfte;
  ein gedeckelter 342 bei p75-Profil hätte ~85 M weniger gekostet — grob).
- Gegenkosten: **A** — die Eskalation fügt eine Übergabe ein; ein Fix, den
  Runde 4 gefunden hätte, kommt erst nach der Rückfrage.
- Risiko: mittel. Der Deckel darf nie einen roten Zustand als grün
  durchlassen — er wandelt „weiter probieren" in „anders besetzt
  weiterarbeiten" (frischer Agent, anderes Modell als Review, oder
  Punktsplit). Mechanismus-Review nötig (Guard-Familie).

**V3 — Schlanker Verifikations-Kontext (Kontext-Quarantäne).** Die teuren
Verifikations-Turns zahlen den GANZEN Implementierungs-Verlauf mit: 342 trug
ø 401k rohe Tokens pro Turn. Läuft die Verifikationsschleife stattdessen in
einem FRISCHEN Subagenten, der nur Brief, Diff-Zusammenfassung und die
Fehlerausgabe hält (~50–60k), sinkt der Cache-Read-Posten dieser Phase um
grob den Faktor der Kontextverkleinerung.
- Achse: **B.** Verifikation in Subagenten = 56 % von 573 M; selbst wenn nur
  die Ausreißer-Punkte quarantänisiert werden, ist das Potenzial
  zweistellig-M pro Fenster. Grob, weil der erreichbare Minimalkontext je
  Punkt verschieden ist.
- Gegenkosten: **A** — jede Übergabe Builder → Prüfer → Builder kostet eine
  Schleife; bei kleinen Punkten frisst das die Ersparnis (Sockel-Arithmetik:
  lohnt erst deutlich über dem Median).
- Risiko: der Prüfer kennt die Baugeschichte nicht und kann eine Ausgabe
  fehldeuten; ein roter Befund muss zurückwandern. Deshalb nur für die
  Schleife NACH der ersten grünen Vitest-Lage, nicht fürs Debugging selbst.

**V4 — Warten ohne Polling: Hintergrundlauf + Benachrichtigung, Cache warm
halten.** `harness-primitives-evaluation.md` §5 stellt fest, dass die
Fertig-Benachrichtigung das Log-Polling ersetzt; praktiziert wird trotzdem
gepollt. Ein 42-min-LARGE, alle ~2 min gepollt, sind ~20 Turns × 17,6–40k
gewichtet ≈ **0,35–0,8 M pro LARGE-Lauf**, die nichts produzieren.
- Achse: **B**, neutral bis positiv auf A.
- Gegenkosten: keine — „always prep during waits" bleibt; Vorbereitung
  während des Wartens ist sogar doppelt richtig, weil sie den Prompt-Cache
  warm hält (siehe S4).
- Risiko: praktisch keins; die Regel existiert, sie wird nur nicht
  durchgesetzt. Durchsetzung z. B. als Prüfziffer im Verify-Wrapper (zählt
  Polls und meldet sie), nicht als neuer Blocker.

**V5 — Fail-fast für die teuren Suiten (B-J aus den Bild-Hebeln, überlebt
und nie umgesetzt).** 8 von 10 aufgezeichneten `enrichments`-Läufen
scheiterten und schrieben trotzdem alle 37 Frames bei 951–1029 s — ≈ 2,1 h
roter Wall-Clock in einem Zwei-Tage-Fenster (`picture-check-levers.md` B-J).
Abbruch beim ersten Fehlschlag, VOLLLAUF nur für den finalen Beweis.
- Achse: **A** (~10–15 min je rotem Lauf), B sekundär (kürzere Warte- und
  Leseschleifen).
- Gegenkosten: ein abgebrochener Lauf meldet nur den ersten Fehler; eine
  Fix-Runde pro weiterem Fehler ist möglich. Deshalb: fail-fast in der
  Iteration (passt zu V1), Volllauf am Ende.
- Risiko: gering; der Wächter kreditiert ohnehin nur Exit-0-Läufe.

**V6 — Verifikations-Memo über Baum-Hash.** Ein grüner Suite-Lauf wird mit
(Suite, Backend, Hash der render-relevanten Pfade + Lockfile) verbucht;
verlangt der Ablauf denselben Lauf erneut, ohne dass sich am Hash etwas
geändert hat (Doc-Edit, Merge ohne Code-Konflikt), gilt das Memo statt eines
Wiederholungslaufs.
- Achse: **A und B** — spart komplette Doppel-Läufe; wie viele es gibt, ist
  aus den Transkripten nicht sauber zählbar (grob: bei jedem Merge mit
  anschließendem Re-Verify ohne Code-Änderung einer).
- Gegenkosten: keine auf der anderen Achse.
- Risiko: **der Hash muss ALLES fassen, was das Bild beeinflussen kann**
  (Quellen, Assets, Abhängigkeiten, Suite-Skripte, Viewport). Ein zu enger
  Hash ist ein grüner Haken gegen einen falschen Proxy — genau die Falle, die
  die Verifikationsdisziplin verbietet. Konservativ schneiden (lieber zu
  breit), Mechanismus-Review, und der finale Merge-Beweis bleibt echt.

**V7 — Deterministische Aufnahme als Freischalt-Investition (A9/B-E).**
Nicht der Diff-Gate selbst (dessen Ablehnung steht, §2 R1), sondern die
VORAUSSETZUNG: Aufnahme wartet nachweislich auf das benannte Bild (settled
camera, geladene Assets), geseedeter PRNG und fester Timestep im
Screenshot-Pfad wie im F8-Benchmark; danach `picture-stability.mjs` erneut
messen. Erst wenn der Boden unter dem kleinsten realen Signal (0,75 %)
liegt, wird die gesamte verworfene Diff-Familie (12× auf typische Änderung)
wieder verfügbar.
- Achse: heute keine; **B groß, aber bedingt** — der Wert realisiert sich
  erst nach bestandener Stabilitätsmessung.
- Gegenkosten: Implementierungsaufwand + eine LARGE-Revalidierung.
- Risiko: das Ziel kann sich als unerreichbar erweisen (Last-Effekte); dann
  ist der Einsatz verloren — deshalb als eigenes, kleines Investitionspaket
  mit messbarem Abbruchkriterium.

**V8 — Nachmessen, was Punkt 571 gebracht hat, und die Messung
institutionalisieren.** Die WebGPU-Alltagsspur ist einen Tag alt; ihr
messbarer Effekt (WebGPU ≈ halbe Wall-Clock von WebGL 2 auf der einzigen
Doppel-Messung, `flow` 75,5 s vs. 140,4 s, n=1) steckt noch nicht in der
Basislinie. `measure-task-cost.mjs` gehört als fester Schritt in den
Closing-Zyklus (CLOSING_STEPS), damit jede Strukturmaßnahme ihren
Vorher/Nachher-Vergleich bekommt statt eines Bauchgefühls.
- Achse: keine direkt; sie macht alle anderen Maßnahmen abrechenbar.
- Gegenkosten: Minuten pro Closing.
- Risiko: keins.

### 1.2 Buchführung (26,7 % der Tokens, 38,3 % der Maschinenstunden — 64 %
der Hauptsitzungskosten)

**B1 — Der Lande-Befehl: Merge-Ritual als EIN Kommando.** Die Serie
Merge → Fast-Gate → Tick → Archiv-Verschiebung → Board-Publish →
Worktree-Cleanup läuft heute als ~8–12 einzelne Turns der Hauptsitzung, bei
deren vollem Kontext. Ein Skript (`scripts/land-point.mjs <N>` o. ä.), das
die Kette deterministisch abarbeitet und EINE strukturierte Zusammenfassung
druckt (je Schritt Verdikt, bei Rot: Abbruch mit dem Schritt-Log), macht
daraus 2–3 Turns.
- Achse: **B** (6–9 gesparte Hauptsitzungs-Turns × ~20–40k gewichtet ≈
  0,15–0,35 M je Punkt; × 64 Merges ≈ **10–20 M pro Fenster**, grob) und
  **A** (weniger Round-Trips im seriellen Engpass Hauptsitzung).
- Gegenkosten: keine.
- Risiko: ein Sammelbefehl darf Zwischenfehler nicht verschlucken
  (Retrospektive §3.38: fail-open darf keinen Zustand fortschreiben) — je
  Schritt lautes Scheitern, kein Weiterlaufen nach Rot. Mechanismus-Review
  nötig, da er Guard-nahe Abläufe bündelt.

**B2 — Wächter-Telemetrie, dann die lautesten Fehlalarme abstellen.** Ein
geblockter Turn kostet einen vollen Kontext-Turn plus die Reparatur-Turns;
der Render-Wächter-Loop kostete einmal ~30 Turns (§3.31), der
Formulierungs-Wächter blockte zweimal fälschlich (§3.32). Wie oft Guards
heute real blocken — und welche davon Fehlalarme sind — misst niemand.
Erst zählen (eine Zeile je Block in `dashboard-state.json` o. ä.), dann die
Top-Fehlalarm-Quellen präzisieren.
- Achse: **B** (unbeziffert bis zur Zählung; die zwei dokumentierten
  Vorfälle allein ≈ 0,6–1 M).
- Gegenkosten: keine.
- Risiko: keins; die Guards selbst bleiben unangetastet — es wird nur
  gemessen, wo sie zuschnappen, und repariert, wo sie das zu Unrecht tun.

**B3 — Die Dauerlast weiter kürzen (CLAUDE.md, MEMORY.md).** CLAUDE.md
steht bei 45.543 Zeichen (~11k Tokens), das globale CLAUDE.md + der
Memory-Index addieren weitere ~5–8k Tokens; zusammen ~16–19k Tokens
Dauerlast in JEDEM Turn JEDER Sitzung und jedes Subagenten. Nach Rechenregel
2: jede weiteren 4k Tokens Kürzung ≈ **12,8 M gewichtet pro Fenster**
(4 × 3,2 M) ≈ 1,5 % der Gesamtausgabe. Kandidaten: die Geschichtsprosa in §6
(Datumsanekdoten, Begründungserzählungen) in ein `docs/`-Nachbardokument
verschieben — verschieben, nicht umschreiben (§3.30) —; im Memory-Index
Einträge zusammenlegen, deren Hook derselbe ist.
- Achse: **B**, leicht positiv auf A (kürzere Prompts, schnellere Turns).
- Gegenkosten: keine auf A.
- Risiko: das Nachziehen ist der teure Teil (§3.30: jeder Leser des alten
  Ortes muss gefunden werden); die Doc-Budgets müssen mitgesenkt werden,
  sonst füllt sich der Platz zurück (Memory-Regel „shorten, don't raise").

**B4 — Frequenz statt nur Größe: Board-Publish nur bei Änderung.**
`publishDue` existiert; sicherstellen, dass kein Ablauf „zur Sicherheit"
publiziert. Kleinmaßnahme, Achse B, Risiko keins. (Nur der Vollständigkeit
halber — vermutlich weitgehend erledigt.)

### 1.3 Implementierung und Turn-Ökonomie (16,0 %)

**I1 — Mehrere unabhängige Werkzeugaufrufe pro Turn.** Die härteste
Einzelzahl der Basislinie: **kein einziger Turn im Korpus setzt mehr als
einen Werkzeugaufruf ab** (18.296 × genau einer). Jeder Turn zahlt den
vollen Kontext; zwei unabhängige Reads oder „build + lint" als ein
Turn halbieren die Kontextzahlung für dieses Paar. Senkt Turn-Batching die
Turn-Zahl eines Median-Punkts um 20 % (49 Turns), spart das ≈ 0,86 M
gewichtet ≈ **17 % eines Median-Punkts** — die größte verhaltensbasierte
Einzelmaßnahme dieser Liste, zugleich die am schwersten durchsetzbare, weil
sie in jedem Prompt neu erinnert werden müsste (und Erinnerung nachweislich
nicht wirkt, Retrospektive §1).
- Achse: **B stark, A leicht positiv** (weniger Round-Trips).
- Gegenkosten: keine.
- Risiko: falsches Batching ABHÄNGIGER Aufrufe erzeugt Fehlarbeit; gebündelte
  Shell-Ketten dürfen den fehlschlagenden Schritt nicht verstecken (`&&` mit
  klarer Ausgabe, `run-logged` für Tests). Durchsetzung realistisch nur als
  Baustein im Delegations-Prompt + Stichprobe, nicht als Guard — ein
  Nachweis „hätte gebatcht werden können" ist maschinell kaum entscheidbar.

**I2 — Zustellung statt Suche auch für Code-Orientierung: eine
Modul-Landkarte.** Der Brief löst das für Spezifikationen (1,8k statt 134k);
für die CODE-Orientierung eines frischen Agenten gibt es kein Gegenstück —
er grept und liest sich ein. Eine generierte, kleine Landkarte
(`scripts/repo-map.mjs`: je Verzeichnis eine Zeile Zuständigkeit, die
wichtigsten Module, ~2k Tokens, im Brief mitgeliefert) senkt die
Explorations-Reads.
- Achse: **B** (grob 50–200k je Agent, je nachdem wie viel Exploration
  entfällt; unbeziffert, vorher messen: Anteil der Read/Grep-Turns vor dem
  ersten Edit).
- Gegenkosten: Pflege; eine veraltete Karte führt in die Irre (§3.37: ein
  Werkzeug, das rät, ersetzt still — die Karte muss aus dem Baum GENERIERT
  sein, nicht handgepflegt).
- Risiko: gering bei Generierung aus der Verzeichnisstruktur + Header-Kommentaren.

**I3 — Worktree-Bootstrap: `node_modules` teilen statt neu installieren.**
Der bekannte falsche Rot-Fall dieses Punkts (5 scope-Tests scheitern im
Worktree, weil `node_modules/.bin/oxlint` fehlt) zeigt: Worktree-Agenten
arbeiten ohne vollständige Abhängigkeiten oder installieren sie je Worktree
neu. Ein Bootstrap-Schritt (Hardlink/Symlink auf den Haupt-`node_modules`
oder `npm ci --prefer-offline` gegen den lokalen Cache) macht jede
Agenten-Umgebung in Sekunden gate-fähig.
- Achse: **A** (1–3 min npm-install je Agent × ~64 Punkte ≈ 1–3 h Kalender
  pro Fenster, grob) und eliminiert eine bekannte Falsch-Rot-Quelle (die
  selbst Turns kostet: jeder Agent, der die 5 roten Tests einordnen muss,
  zahlt Lese- und Erklär-Turns).
- Gegenkosten: keine.
- Risiko: geteilte `node_modules` + abweichender Lockfile-Stand auf dem
  Branch = falsche Testbasis; der Bootstrap muss den Lockfile-Hash prüfen
  und bei Abweichung echt installieren.

### 1.4 Gates (11,6 % Tokens, 12,8 % Maschinenstunden)

**G1 — Gate-Memo über Baum-Hash.** Wie V6, für build/lint/vitest: ist der
Baum-Hash seit dem letzten grünen Gate unverändert (z. B. nach einem reinen
Doc-Commit), gilt das Ergebnis weiter. Median 915k gewichtet Gates je Punkt;
ein bis zwei vermiedene Wiederholungen je Punkt ≈ **0,2–0,4 M je Punkt**
(grob).
- Gegenkosten: keine. Risiko: wie V6 — der Hash muss Quellen UND Lockfile
  UND Konfiguration fassen; konservativ schneiden.

**G2 — Gates im Hintergrund mit Benachrichtigung** (Analog V4). Build+Lint+
Vitest ≈ 1–3 min; das Polling dafür ist kleiner als bei LARGE, aber bei der
Frequenz der Gates (nach jedem Merge, nach jeder Änderung) summiert es sich.
Achse B, Risiko keins.

**G3 — Inkrementelles Bauen für den inneren Loop.** `tsc --incremental`,
Vite-Cache, Vitest `--changed` für die INNERE Schleife (nicht für den
finalen Beweis, der bleibt voll). Achse A (Minuten je Runde), Achse B über
kürzere Wartefenster. Risiko: ein inkrementeller Grün-Status ist kein
Abnahme-Beweis — strikt auf die Iteration begrenzen.

### 1.5 Struktur und Querschnitt (Sockel, Ausläufer, Cache)

**S1 — Punkt-Split nach Vorhersage, mit Sockel-Arithmetik.** Der Ausläufer
ist das Geld (10/63 = 50 %; Mittel/Median 1,92). Ein Punkt, dessen Spec
Render + beide Backends + mehrere Systeme berührt, wird beim EINSTELLEN in
Teilpunkte geschnitten. Aber: jeder Teilpunkt kostet den Sockel (~4,5 M),
also lohnt der Split erst, wenn die erwartete Ersparnis über dem addierten
Sockel liegt — als Faustregel: nur Punkte splitten, die nach Einschätzung
≥ 3× Median (≥ ~15 M) werden.
- Achse: **B am Ausläufer** (342 als 3 Punkte à p75-Profil ≈ 39 M + 2×
  Sockel ≈ 48 M statt 101,8 M — grob und rückblickend gerechnet), **A**
  ebenfalls (kleinere Punkte mergen früher).
- Gegenkosten: mehr Merges, mehr Boundaries, mehr Board-Karten.
- Risiko: ein schlecht geschnittener Split erzeugt Abhängigkeiten zwischen
  den Teilen und damit serielle Wartezeiten.

**S2 — Kleinpunkte bündeln: eine Boundary je BÜNDEL statt je Punkt.** Das
Spiegelbild von S1: für die ~16 Punkte unter p25 (≤ 2,2 M) ist der Sockel
größer als der Punkt. Zwei bis drei THEMATISCH benachbarte Kleinpunkte in
einer Session/einem Branch abarbeiten teilt sich einen Sockel.
- Achse: **B** (je vermiedener Boundary grob bis zu einige M — der
  amortisierte Anteil des Sockels ist ein Fenster-Durchschnitt, die Ersparnis
  also unscharf; der in-Branch-Anteil ~1 M je Punkt ist der harte Teil).
- Gegenkosten: **A** pro Bündel leicht höher (ein Bündel merged später als
  sein erster Punkt).
- Risiko: verwässert die Punktgrenze, die gegen das >150k-Regime eingeführt
  wurde — nur für Kleinpunkte zulassen, deren Summe klar unter der
  Kontextschwelle bleibt; **Regeländerung, braucht den Nutzer** (CLAUDE.md
  §6 Boundary-Absatz und `batch-progress-guard` sind betroffen).

**S3 — Cache-Präfix-Stabilität prüfen: die 16,8 % Cache-Creation.** 112,5 M
rohe Cache-Write-Tokens im Fenster sind gewichtet 140 M — der
zweitgrößte Zählerposten. Cache-Writes entstehen, wo der Präfix sich ändert
oder die TTL abläuft. Zwei prüfbare Verdachtsquellen: (a) Hook-Ausgaben oder
System-Reminders, die sich pro Turn ändern und früh im Prompt stehen —
jede Änderung invalidiert alles dahinter; (b) Wartefenster über der
Cache-TTL (ein 42-min-LARGE ohne Zwischenturns lässt einen 5-min-Cache
verfallen; der Folge-Turn zahlt den ganzen Kontext als Write, 1,25×, statt
Read, 0,1× — auf 200k Kontext ist das 0,23 M gewichtet Differenz je
Vorfall). Erst messen (Transkripte: Cache-Creation-Spitzen nach Lücken >
TTL bzw. mitten in Sitzungen), dann gezielt stabilisieren.
- Achse: **B**, Potenzial bis zu einigen Prozent der Gesamtausgabe —
  **Hypothese bis zur Messung.**
- Gegenkosten: keine.
- Risiko: keins an der Messung; an der Reparatur hängt es von der Quelle ab
  (Hook-Reihenfolge ändern ist ein Mechanismus-Eingriff).
- Nebeneffekt: „always prep during waits" bekommt eine zweite, harte
  Begründung — Zwischenturns halten den Cache warm.

**S4 — Ausgabe-Knappheit NICHT als Hebel behandeln.** Output ist 4,5 %
gewichtet; selbst 30 % knapperes Schreiben spart ~1,4 % der Gesamtausgabe.
Als Maßnahme geführt, damit die Vereinigung sie bewusst NIEDRIG hängt —
Schreibdisziplin lohnt für Lesbarkeit, nicht für Tokens. (Kein Widerspruch
zu B3: dort geht es um GELESENE Dauerlast, hier um Geschriebenes.)

### 1.6 Kalender-Uhr (Achse A jenseits der Maschinenstunden)

**K1 — Stale-Branch-Alarm mit hartem Zeitmaß.** Median 0,75 h, p90 4,65 h,
Max 86,5 h: der Kalender-Ausläufer ist Warten, nicht Arbeit. Ein Alarm
(Board-Karte + ntfy), wenn ein Feature-Branch > 24 h ohne Merge und ohne
frischen Commit steht, zwingt die Entscheidung „mergen, parken oder
schließen".
- Achse: **A am Ausläufer.** Gegenkosten: keine. Risiko: keins —
  `branch-hygiene-guard` prüft Verwandtes, aber erst am Turn-Ende der
  Hauptsitzung, nicht auf der Uhr.

**K2 — Merge-Zug: mehrere fertige Branches in einer Sequenz landen, ein
gemeinsames Fast-Gate.** Wenn drei Agenten nahe beieinander fertig werden,
laufen heute drei volle Ritualketten. Der Merge bleibt seriell und je Branch
(Konflikte einzeln auflösen!), aber das Fast-Gate und der Board-Publish
laufen EINMAL am Zug-Ende statt dreimal.
- Achse: **A** (2× Fast-Gate ≈ 2–6 min je Zug gespart) und **B** (weniger
  Ritual-Turns; kombiniert mit B1).
- Gegenkosten: ein rotes Sammel-Gate ordnet den Schuldigen nicht zu —
  dann fällt man auf Einzel-Gates zurück (Bisect über die 2–3 Kandidaten,
  billig bei kleinen Zügen).
- Risiko: die Regel „nach JEDEM Merge das Fast-Gate" ist bindend
  (CLAUDE.md §6) — dies ist eine REGELÄNDERUNG und braucht den Nutzer; das
  Argument dafür: das Gate am Zug-Ende prüft exakt den Zustand, der deployt.

**K3 — Pool-Deckel nicht anheben, aber auslasten.** Der Deckel 3 ist auch
Ziel (`--slots-free` existiert). Anhebung würde Achse A PRO PUNKT nicht
bewegen (die Uhr läuft je Punkt) und nur die Warteschlangen-Latenz senken;
die reale Grenze ist die Urteilsfähigkeit der Hauptsitzung (Retrospektive
§3.27). Als Maßnahme hier nur: die Auslastung MESSEN (wie oft stand ein
Slot frei, während die Queue unabhängige Punkte hielt) — der Durchsetzer
existiert, seine Wirksamkeit ist unbeziffert.

---

## 2. Erwogen und VERWORFEN, mit Grund

**R1 — Golden-Image-/Pixel-Diff-Gate (A6/A7/A8/A10/B-D/B-G/B-L).** Das
Replay-Verdikt steht: Rauschboden 27,8–99 % gegen 0,75 % kleinstes reales
Signal, und zwei Läufe fotografierten verschiedene Orte unter demselben
Namen. Kein neuer Fakt hebt das auf. Der einzige legitime Weg zurück führt
über V7 (deterministische Aufnahme) und einen bestandenen
`picture-stability`-Nachweis.

**R2 — Allgemeine Pfad→Suite-Karte.** Vom Replay getötet (Korpus-Zeilen 2
und 5: `TravelScene.tsx` liegt in drei Suiten). Die DOM-only-Verengung ist
umgesetzt; mehr gibt der Korpus nicht her.

**R3 — Weniger Frames / `enrichments` in Subsuiten teilen (A5/B-I).** Die
Historie läuft andersherum: der Horizontstreifen wurde durch das HINZUFÜGEN
eines Frames gefangen; Zeile 2 zeigt themenübergreifende Kopplung.

**R4 — Downscale/Kontaktbogen als ERSATZ der Inspektion.** Die
Feindetail-Klasse (Zeilen 1 und 3) ist nicht replaybar, also unbewiesen —
und genau dort steht der Verdacht. Als Triage ÜBER voll verfügbaren Frames
weiterhin zulässig.

**R5 — Byte-Schrumpfen (Greyscale, PNG-Qualität, …).** Arithmetisch tot:
Token-Kosten hängen am Viewport, nicht an Bytes (1.716 Tokens über eine
24×-Byte-Spanne).

**R6 — Billigere Autoren-Modelle (Sonnet/Haiku).** Verboten (Allowlist),
und die Kostenregel aus Retrospektive §3.33 trägt es auch ökonomisch: drei
defekte Haiku-Lieferungen in 14 Minuten kosteten mehr Nacharbeit, als alle
Sparmaßnahmen davor eingebracht hatten.

**R7 — Reasoning-Effort senken / Denk-Token deckeln.** Die externe
Literatur meldet 3–7× Denk-Token-Inflation auf mechanischen Schritten
(Abschnitt 3, F5) — aber HIER sind Output+Denken zusammen 4,5 % gewichtet.
Selbst eine Halbierung wäre ≤ 2,3 % der Gesamtausgabe, gegen ein reales
Qualitätsrisiko und gegen die stehende Nutzer-Regel „Effort High für
Implementierung". Das ist der Musterfall „externe Zahl überlebt die eigene
Messung nicht".

**R8 — Pool verkleinern, um Tokens zu sparen.** Bereits einmal gemacht und
als Denkfehler seziert (Retrospektive §3.27): Parallelität vervielfacht Rate
und Durchsatz gemeinsam; pro fertigem Punkt bleibt es gleich.

**R9 — Den Beide-Backends-Beweis breiter aussetzen.** Verengt ein
Sicherheitsnetz über das beweisbar Beitragslose hinaus (Retrospektive
§3.28: die zwei Ein-Backend-Fälle saßen in backend-neutral AUSSEHENDEM
Code). Nicht verhandelbar per Auftrag; V1 verschiebt nur die Reihenfolge,
nie den Beweis.

**R10 — Den Brief weiter optimieren.** 0,5 % der Gesamtausgabe, Median 0,00 M
pro Punkt. Fertig optimiert; jede weitere Stunde dort ist Liebhaberei.

**R11 — Kontext-Kompaktierung MITTEN in der Session (Summarizer).** Die
Punktgrenze erreicht denselben Schnitt verlustfrei (Neuorientierung ~600
Tokens); Summarisierung ist nachweislich verlustbehaftet und zerstört
Kausalstruktur (Abschnitt 3, F4 — die Forschung selbst benennt
compression-induced hallucination). INNERHALB eines schweren Punkts ist
V3 (Quarantäne in frische Subagenten) der sauberere Schnitt, weil er
verlustfrei am natürlichen Übergabepunkt trennt.

**R12 — Resilienz/Parallelität über Remote-Ausführung.** Geprüft und nicht
verfügbar; `isolation:"remote"` lief nachweislich lokal und degradierte
STILL (`harness-primitives-evaluation.md` §6). Vor jeder Neuplanung
re-proben.

**R13 — Hartes Token-Budget je Punkt über das Workflow-BUDGET-Primitiv.**
Das Primitiv ist in dieser Umgebung nicht exponiert (Probe 07.08.2026,
ebd. §3). V2 (Iterations-Deckel) ist der verfügbare Ersatz; bei Rückkehr des
Primitivs wäre es die erste Wahl.

**R14 — Beide Backend-Pässe PARALLEL auf dieser Maschine.** Halbiert
nominell die LARGE-Wall-Clock, aber die Suiten brauchen eine ruhige Maschine
(gemessen: 19 % Laufzeit-Spread unter Last; rotierende Flakes unter
Parallel-Agenten sind aktenkundig). Ein Flake-Retest frisst die Ersparnis,
ein durchgerutschtes Falsch-Rot kostet Vertrauen in die Suite.

**R15 — TASKS.md-Radikaldiät für Token-Zwecke.** Die Konsumenten lesen
längst über Brief und Skripte (`tasks-source.mjs`); das wholesale-Lesen ist
bereits verboten. Der Anker „~108k" ist auf ~134k gewachsen, aber es zahlt
ihn im Normalbetrieb niemand mehr. Pflege ja (Budget), Sparmaßnahme nein.

---

## 3. Online-Recherche: Befunde mit Quellen

Jeder Eintrag ist gegen die Zahlen dieses Repos geprüft und als **Befund**
(hier bestätigt/anwendbar) oder **Hypothese** (fremdes Setup, hier
unbewiesen) markiert. Ein Benchmark von woanders ist hier nie ein Befund.

**F1 — Cache-Preisstruktur 0,1× Read / 1,25× Write (5 min) / 2× Write
(1 h).** Quellen: Flexera, „Prompt Caching breakdown: Cut token spend in
2026" (https://www.flexera.com/blog/ai/prompt-caching-breakdown/, gelesen
09.08.2026); DigitalApplied, „Prompt Caching in 2026"
(https://www.digitalapplied.com/blog/prompt-caching-2026-cut-llm-costs-engineering-guide,
gelesen 09.08.2026). **Befund:** deckt sich exakt mit `COST_WEIGHTS`
(0,1 / 1,25) — unsere Gewichtung bildet die reale Ökonomie ab. Folgerung
für S3: die 16,8 % Cache-Creation sind der Posten, in dem TTL-Abläufe und
Präfix-Brüche sichtbar würden; die 1-h-Schreibstufe (2×) wäre nur dann
billiger, wenn Wartefenster > 5 min systematisch sind — messbar aus den
Transkripten.

**F2 — Caching senkt Agent-API-Kosten 41–80 % (Studie „Don't Break the
Cache", 500+ Agent-Sessions).** Via DigitalOcean, „How Does Prompt Caching
Work…" (https://www.digitalocean.com/community/tutorials/prompt-caching-cost-break-even,
gelesen 09.08.2026). **Hypothese:** hier läuft Caching längst (78,7 %
gewichtet SIND Cache-Reads); der Restnutzen liegt nicht im Einschalten,
sondern in Präfix-Stabilität und TTL (S3). Die Studie stützt die Richtung,
nicht die Höhe.

**F3 — Multi-Agent-Systeme ≈ 15× Chat-Tokens; Reads parallelisieren,
Writes nicht (Anthropic).** Quellen: Anthropic/Claude-Blog, „When to use
multi-agent systems (and when not to)"
(https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them,
gelesen 09.08.2026); The AI Engineer, „Anthropic's Multi-Agent Research
Architecture Explained"
(https://theaiengineer.substack.com/p/how-anthropic-built-multi-agent-deep,
gelesen 09.08.2026). **Befund in der Struktur:** unsere Subagenten tragen
68,8 % der Tokens bei ~gleicher Maschinenzeit — die Größenordnung
„Delegation kostet ein Mehrfaches, kauft aber Parallelität und
Kontexthygiene" bestätigt unsere Arbeitsteilung; die 15× selbst sind
**Hypothese** (anderes Setup).

**F4 — Kontext-Kompaktierung (SelfCompact 30–70 %; Context-Folding;
strukturierte Eviction) und ihre benannten Kosten: Verlust, zerstörte
Kausalstruktur, kompressions-induzierte Halluzination.** Quellen: „Beyond
Compaction: Structured Context Eviction for Long-Horizon Agents"
(https://arxiv.org/html/2606.11213v1, gelesen 09.08.2026); „Scaling
Long-Horizon LLM Agent via Context-Folding"
(https://arxiv.org/pdf/2510.11967, gelesen 09.08.2026); AI Weekly zu
SelfCompact
(https://aiweekly.co/alerts/selfcompact-cuts-agent-token-costs-up-to-70-without-fine-tuning,
gelesen 09.08.2026). **Hypothese** — und gegen unsere Messung geprüft
abgelehnt als Hauptweg (R11): die Punktgrenze schneidet verlustfrei. Der
verwertbare Kern ist die Bestätigung, dass die Alternative zum Schneiden
(mittragen) O(N²)-Kosten hat — genau unser 342.

**F5 — Reasoning-Effort-Routing: mechanische Schritte erzeugen 3–7×
Denk-Token ohne Antwortänderung; Router vor dem teuren Denken ist das
höchste ROI-Muster.** Quellen: Boundev, „Reasoning effort: cut LLM cost and
latency in production"
(https://www.boundev.ai/blog/reasoning-effort-llm-cost-latency, gelesen
09.08.2026); T-Minus AI, „Reasoning Effort, Explained"
(https://www.tminusai.com/blog/how-to-choose-reasoning-effort, gelesen
09.08.2026). **Hypothese, hier widerlegt als Hebel:** Output+Denken sind
4,5 % gewichtet — der Router würde am kleinsten Posten drehen (R7).
Aufgenommen als Beispiel, dass „Best Practice" ohne eigene Basislinie
fehlleitet.

**F6 — Retrieval statt Volltext-Lesen spart 60–80 % Kontext (RAG für
Code; snippetbasierte Zustellung mit Pfad+Zeilen-Headern).** Quellen:
MindStudio, „Token Reduction Strategies for AI Agents"
(https://www.mindstudio.ai/blog/token-reduction-strategies-ai-agents-cut-costs,
gelesen 09.08.2026); „ContextSniper: Token-Efficient Code Memory for
Repository-Level Program Repair" (https://arxiv.org/pdf/2607.01916, gelesen
09.08.2026). **Hypothese:** unser Brief IST dieses Muster für Specs
(gemessen 1,8k vs. ~134k — besser als die Literaturspanne). Der offene Rest
ist die Code-Orientierung (I2); die 60–80 % sind dort nicht zu erwarten,
weil gezieltes Grep+Read schon Praxis ist.

**F7 — Sichere Regressions-Testauswahl spart ≥ 50 % Testläufe
(TESTTUBE-Tradition; Test-Impact-Analyse).** Quellen: Rothermel/Harrold,
„Empirical Studies of a Safe Regression Test Selection Technique"
(https://dl.acm.org/doi/abs/10.1109/32.689399, gelesen 09.08.2026); minware,
„Test Impact Analysis" (https://www.minware.com/guide/best-practices/test-impact-analysis,
gelesen 09.08.2026). **Hypothese, hier durch das EIGENE Replay begrenzt:**
die allgemeine Pfad→Suite-Karte wurde am Korpus getötet (R2). Was die
Literatur „safe" nennt, setzt nachweisbare Abdeckungs-Beziehungen voraus —
für die Browser-Suiten dieses Projekts existieren die nicht; für die
Vitest-Ebene wäre `--changed` in der INNEREN Schleife der legitime Rest
(G3). Externe 50 % sind hier nicht erreichbar.

**F8 — Merge-Trains/Batching amortisieren CI-Läufe über mehrere Changes;
bei Rot wird bisektiert.** Allgemeines CI-Muster, u. a. beschrieben in der
Test-Impact-Literatur (minware, s. o.; gelesen 09.08.2026). **Hypothese:**
Grundlage von K2/V9; der Bisect-Preis ist bei 2–3er-Zügen klein. Braucht
die Regeländerung beim Nutzer.

**F9 — Claude-Code-Kostenpraxis: /clear zwischen Aufgaben, knappe
CLAUDE.md, Hintergrund-Tasks; jede CLAUDE.md-Zeile wird in jedem Turn
bezahlt.** Quellen: Claude Code Docs, „Manage costs effectively"
(https://code.claude.com/docs/en/costs, gelesen 09.08.2026); crystl.dev,
„How to Optimize Claude Code's Context Window"
(https://crystl.dev/blog/optimize-claude-code-context/, gelesen 09.08.2026).
**Befund in der Richtung:** deckt sich mit Punktgrenze (unser /clear-
Äquivalent) und Punkt 555; stützt B3 quantitativ nicht über unsere eigene
Rechenregel 2 hinaus.

---

## 4. Übergabe-Prompt für andere Modelle (Entwurf B)

Anmerkung zur Sprache: bewusst auf Englisch entworfen — externe Modelle sind
auf Englisch am stärksten, und die bindenden Repo-Dokumente (CLAUDE.md, die
Skripte) sind englisch. Die Vereinigung kann die deutsche Fassung wählen.

```
You are asked for NEW ideas to make an agentic software project cheaper and
faster PER TASK. Read the repository you were given alongside this prompt —
especially docs/analysis_de/durchsatz-analyse.md (the measured baseline),
docs/picture-check-levers.md (a prior cost exercise with replay verdicts),
docs/harness-primitives-evaluation.md, and CLAUDE.md §6 (the mechanisms
already in force). Do not propose anything those documents already tried,
rejected, or run in production — extending one beyond where it stopped is
welcome, re-inventing it is not.

THE SETUP. A game POC is built almost entirely by LLM agents: a main session
orchestrates; worktree-isolated subagents (pool of 3) each build one
work-order point on its own git branch; merge, bookkeeping and
picture-verification stay in the main session. Every point runs: brief →
implementation → gates (build/lint/unit tests) → browser verification
(Playwright suites, screenshots, on WebGPU and WebGL 2) → merge →
bookkeeping. Delegation briefs, a context boundary between points, a split
work order, output-bounded test wrappers, doc size ceilings, and a
WebGPU-everyday / WebGL2-regression lane split already exist.

TWO AXES, NEVER MERGED INTO ONE NUMBER:
  AXIS A — wall-clock per task (first branch commit → merge).
  AXIS B — tokens per task (main session AND subagents; weighted:
           cache-read 0.1, cache-write 1.25, output 5 relative to input).
They trade: a bigger fan-out buys time with tokens; a tighter brief buys
both. EVERY proposal must state: which axis it moves, a quantified estimate
against the baseline below (say when it is coarse), its cost on the OTHER
axis, and its risk to correctness.

THE MEASURED BASELINE (6-day window, 64 merged points, details and error
bars in durchsatz-analyse.md — trust that file over this summary):
  - Tokens per phase (weighted): verification 43.1 %, bookkeeping 26.7 %,
    implementation 16.0 %, gates 11.6 %, merge 1.2 %, brief 0.5 %.
  - 78.7 % of weighted spend is RE-READ CONTEXT (cache reads); 16.8 % cache
    writes; only 4.5 % is model output. Attack context, not prose.
  - Subagents carry 68.8 % of tokens; the main session's own spend is 64 %
    bookkeeping.
  - Per point: median 5.01 M weighted / 1.39 machine-hours / ~245 turns;
    p90 20.35 M; max 101.8 M. TEN of 63 points carry HALF the total; the
    top-10 carry 67 % of all verification tokens. The tail is the money.
  - Fixed overhead ≈ 4.5 M weighted per point — the size of a whole median
    point.
  - Calendar clock: median 0.75 h, p90 4.65 h, max 86.5 h.
  - One full-frame screenshot costs ~1,716 tokens to look at; a LARGE
    browser regression is 42 min wall-clock and 93 frames per backend.

NON-NEGOTIABLE CONSTRAINTS (a proposal violating one is out of scope):
  1. Verification discipline stays: every feature tested on the appropriate
     layer; render/GUI changes judged BY THE RENDERED PICTURE on both
     backends where they can differ; no green check against an assumed
     proxy; no golden-image/pixel-diff gate — it was REJECTED on
     measurement (same-code reruns move 11–98 % of a frame; the smallest
     real defect moved 0.75 %) until capture is proven stable.
  2. The four-eyes rule stays (blind-parallel for enumerating stages,
     artefact-first review for convergent ones).
  3. Only three premium models may author work (Opus 5 / Fable 5 /
     Opus 4.8). Routing work to cheaper models is FORBIDDEN — a degraded
     session once delivered three defective points in 14 minutes and the
     rework cost more than every saving before it.
  4. Guards may get CHEAPER, never weaker: nothing they catch may be
     uncaught. design.md (game content) is never changed to save effort.

ALREADY TRIED — do not return these: delegation briefs (~2k tokens vs
~134k wholesale reads); context boundary between points; work-order split
open/archive; bounded test output (run-logged); doc ceilings; DOM-only
changes verified on one backend; suite-suggestion retargeted to the
cheapest covering suite; WebGPU as the everyday lane; golden-image diffs,
general path→suite maps, fewer frames, byte-shrinking of screenshots (all
rejected on replay — read the verdicts before re-proposing, and re-propose
only with a reason the verdict no longer holds).

WHAT WE WANT FROM YOU: measures we have NOT thought of, especially ones
that attack (a) the verification LOOP around expensive points (start, wait,
poll, re-read), (b) the per-point fixed overhead, (c) the re-read-context
share, (d) the calendar tail. For each: mechanism, quantified estimate
against the numbers above, cost on the other axis, risk, and what must be
true in THIS repository for it to work. Mark every external benchmark you
cite as a hypothesis until checked against this repository's numbers.
List also the ideas you considered and rejected, with reasons — a
rejection is a result.
```

---

## Zählung

- Maßnahmen in Abschnitt 1: **26** (V1–V8, B1–B4, I1–I3, G1–G3, S1–S4,
  K1–K3, wobei S4 eine bewusste Tiefstapelung ist).
- Verworfene in Abschnitt 2: **15** (R1–R15).
- Recherche-Einträge in Abschnitt 3: **9** (F1–F9), davon 3 Befunde in der
  Struktur, 6 Hypothesen — zwei davon an den eigenen Zahlen gescheitert und
  genau deshalb dokumentiert.
