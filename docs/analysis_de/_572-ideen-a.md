# Punkt 572 — Maßnahmenliste A (Opus 5, blind geschrieben)

**Was dieses Dokument ist.** Die eine Hälfte der blind-parallelen Enumeration zu
Punkt 572 nach CLAUDE.md §6. Es entstand ohne Kenntnis der Liste B; die
Vereinigung beider Listen ist ein späterer, eigener Schritt. Alles hier ist
Vorschlag oder Verwerfung — **keine Rangfolge, keine Entscheidung**, und
ausdrücklich kein Arbeitsauftrag.

**Grundlage.** `docs/analysis_de/durchsatz-analyse.md` §1 (die gemessene
Basislinie) plus eigene Nachmessungen mit `scripts/measure-task-cost.mjs` und
dessen Lesefunktion (§0 unten). Wo eine Zahl aus der Basislinie stammt, steht die
Fundstelle dabei; wo sie neu ist, steht das Kommando.

**Zwei Achsen, nie verschmolzen.**
**Achse A = Wall-Clock pro Task**, **Achse B = Tokens pro Task**. Jeder Eintrag
nennt: welche Achse er bewegt, **wie stark** (gegen die Basislinie, mit
Kennzeichnung wo die Schätzung grob ist), **was er auf der anderen Achse
kostet**, sein **Risiko für die Korrektheit der Arbeit**, und **was wahr sein
müsste**, damit er hier wirkt.

---

## 0. Eigene Nachmessungen — die Größen, die Abschnitt 1 nicht gibt

Alles im **selben Fenster** wie die Basislinie (03.08.–09.08.2026, 261
Transkripte). Die Kommandos liegen bei; die Zahlen sind mit
`scripts/measure-task-cost.mjs`' `readTurns()` erhoben.

### 0.1 Eine Korrektur an der Basislinie — der Fehlerbalken ist viel kleiner als angegeben

§1.8 sagt, nur **25,6 %** der Turns setzten einen erkannten Werkzeugaufruf ab,
der Rest erbe seine Phase per Füllung. Das ist ein **Messartefakt**, kein
Befund über die Arbeit.

Gemessen: eine API-Antwort wird im Transkript auf **mehrere Zeilen mit
derselben `message.id`** verteilt — typisch `thinking | tool_use`. Die
Deduplizierung nach `message.id` behält die **erste** Zeile, und das ist bei
2.124 von 2.885 mehrzeiligen Antworten (Stichprobe: 40 Transkripte, 5.997
Antworten) die *thinking*-Zeile **ohne** den Werkzeugaufruf. Der Klassifikator
sieht dort „kein Werkzeug".

Fasst man stattdessen **pro `message.id`** zusammen und vereinigt die
Werkzeugaufrufe:

| | Basislinie (erste Zeile gewinnt) | korrekt (pro Antwort zusammengefasst) |
| --- | ---: | ---: |
| Antworten mit ≥1 Werkzeugaufruf | 25,6 % | **97,4 %** |
| Antworten ohne Werkzeugaufruf | 74,4 % | **2,6 %** (2,4 % der Kosten) |

**Die Token-Summen der Basislinie sind davon nicht betroffen** — die
Deduplizierung nach `message.id` ist für die Abrechnung genau richtig, weil alle
Zeilen einer Antwort dieselbe `usage` tragen. Betroffen ist **allein die
Phasen-Zuordnung**: der „Füll"-Mechanismus trägt weit weniger als §1.8
befürchtet, und die Phasenverteilung ruht auf viel mehr Evidenz als dort
angenommen. Das ist eine Verbesserung des Vertrauens in §1.3, keine
Verschlechterung. **Empfehlung: `readTurns()` auf Zusammenfassung pro
`message.id` umstellen** — zwei Zeilen Code, und der ganze Fehlerbalken „25,6 %
Evidenz" verschwindet.

### 0.2 Die Grundgleichung: Kosten ≈ Antworten × Kontext × 0,1

| Größe (Fenster) | Wert |
| --- | ---: |
| Antworten (API-Antworten, dedupliziert) | 32.264 |
| Kontext je Antwort | Median **190 k**, p25 127 k, p75 270 k, p90 348 k |
| Output je Antwort | Median **120 Tokens**, p25 16, p90 566 |
| gewichtete Kosten je Antwort | Median **22 k**, Mittel 26 k |
| Sekunden zwischen zwei Antworten (< 30 min) | Median **6,2 s**, Mittel **24,4 s**, p90 27 s |
| Antworten je Punkt (branch-zugeordnet, n=62) | Median **189**, p75 351, p90 507 |
| gewichtet je Punkt (dieselbe Menge) | Median **4,75 M**, p90 16,1 M |

Zwei Konsequenzen, die den Rest des Dokuments tragen:

1. **Beide Achsen hängen an derselben Größe.** 189 Antworten × 24,4 s = 1,28 h —
   das ist praktisch die gemessene Median-Maschinenstunde von 1,39 h (§1.7). Und
   189 × 22 k = 4,2 M — praktisch die gemessenen 4,75 M. **Eine gesparte Antwort
   spart rund 22 k gewichtet UND rund 24 s Maschinenzeit.** Das ist der einzige
   Hebel, der auf beiden Achsen gleichzeitig zieht.
2. **Der zweite Faktor ist der Kontext.** Bei Median-Kontext 190 k kostet allein
   das Wiederlesen 19 k je Antwort — 86 % der 22 k. Alles, was den mittleren
   Kontext senkt, senkt Achse B **ohne** Achse A anzufassen.

Alles Weitere ist Buchhaltung über diese beiden Faktoren.

### 0.3 Wohin die Antworten gehen — Taxonomie der Werkzeugaufrufe

Werkzeug-Häufigkeit über alle 33.009 Aufrufe: **Bash 26.435 (80,1 %)**, Edit
2.710, Read 2.427, Write 614, ToolSearch 185, Agent 180, Monitor 177.
**Nur 4,9 % der Antworten setzen mehr als einen Werkzeugaufruf ab** — paralleles
Werkzeugaufrufen ist praktisch ungenutzt.

Bash-Antworten nach Kommando-Klasse (erste passende Regel gewinnt; die Klassen
sind grob, das Ordnungsverhältnis ist robust):

| Klasse | Antworten | Anteil an der **Gesamtausgabe** |
| --- | ---: | ---: |
| Suchen/Lesen (`grep`, `find`, `ls`, `wc`, `head`, `cat`, `sed`, `awk`, `node -e`, `python3`) | 10.254 | **29,9 %** |
| sonstige Shell | 3.128 | 13,6 % |
| Warten/Pollen (`sleep`, `tail -f`, `--show`, `ps`, `pgrep`) | 2.786 | 11,0 % |
| Buchführungs-Skripte (`board`, `focus`, `batch-*`, Guards, `tasks-*`) | 2.845 | 7,9 % |
| Gates (`build`/`lint`/`test:unit`/`audit`) | 1.747 | 4,4 % |
| Leerlauf-Halter (`echo idle`, `true`) | 1.189 | **3,8 %** |
| Git-Schreiben | 1.276 | 3,4 % |
| Git-Lesen | 1.105 | 3,2 % |
| Verify-Suiten starten | 657 | 2,0 % |
| `gh` | 163 | 0,4 % |

Und quer dazu:

- **Warten + Leerlauf-Halten zusammen: 4.259 Antworten = 15,8 % der gesamten
  gewichteten Ausgabe.** Die längste ununterbrochene Poll-Kette im Fenster ist
  **437 Antworten** (≈ 9,6 M gewichtet ≈ zwei Median-Punkte, für nichts). Zwölf
  Ketten ≥ 10 tragen zusammen 1.450 Antworten.
- **Exakt wiederholte Shell-Kommandos in derselben Sitzung: 3.992 Antworten =
  15,8 %.** Davon in der Klasse Suchen/Lesen allein 1.918 Antworten (8,6 %).
- **Der Boot-Sockel je Sitzung** (Kontext des allerersten Turns): Subagent Median
  **44 k**, Hauptsitzung **59 k**. Über einen Median-Punkt mit 189 Antworten
  kostet allein das Wiederlesen dieses Sockels 44 k × 0,1 × 189 = **0,83 M
  gewichtet — 17 % eines Median-Punktes**, bevor eine einzige Projektdatei
  gelesen ist.
- **Der Kontext wächst annähernd linear** mit dem Zugindex, bis er bei ~330 k
  plateauiert (vermutlich Compaction): 84 k in den ersten 25 Antworten, 204 k bei
  Antwort 100, 300 k bei Antwort 225, danach flach. Steigung ≈ **0,96 k Kontext
  je Antwort**.
- **Kontext je Antwort nach Scope:** Subagenten Median 207 k, Hauptsitzung
  163 k. Subagenten sind pro Antwort also **teurer**, nicht billiger.

### 0.4 Was die Gewichtung wert ist — geprüft gegen die veröffentlichten Preise

`COST_WEIGHTS` (Input 1 · Cache-Write 1,25 · Cache-Read 0,1 · Output 5) ist
**exakt** die veröffentlichte Ökonomie: Opus 5 kostet $5/M Input und $25/M Output
(Faktor 5), Cache-Read ≈ 0,1×, Cache-Write 1,25× bei 5-Minuten-TTL, 2× bei
1 Stunde (Anthropic-Doku, Stand 24.06.2026, zitiert über die `claude-api`-Skill).
**Der Proxy ist also keine Konvention, sondern die Rechnung** — mit einer
Einschränkung: bei 1-Stunden-TTL wäre der Cache-Write-Faktor 2,0 statt 1,25.
Welche TTL die Harness benutzt, ist von hier nicht messbar. Bei 16,8 %
gewichtetem Cache-Write-Anteil verschiebt der Unterschied die Gesamtsumme um bis
zu +10 %; die Rangfolge der Phasen ändert er nicht.

---

## 1. Maßnahmen

Gruppiert nach der Phase, die sie angreifen. Jede Nummer ist ein eigener
Vorschlag, unabhängig von den anderen lesbar.

### 1.1 Warten und Leerlauf — 15,8 % der Ausgabe, und fast alles davon ist Verlust

Das ist der Befund, den ich am wenigsten erwartet hätte, und der am besten
belegte: **jede sechste gewichtete Token-Einheit dieses Projekts wird dafür
ausgegeben, dass ein Modell mit 200 k Kontext `sleep 30` sagt.**

**A1 — Blockierend warten statt pollen.**
*Achse:* B primär, A sekundär.
*Wirkung:* 2.786 Poll-Antworten = 11,0 % der Gesamtausgabe. Ein LARGE-Lauf
dauert gemessen 42,3 min (`picture-check-cost.md` §1); bei 30-s-Poll sind das
~84 Antworten × 22 k = **1,85 M gewichtet je Lauf**, das 0,39-fache eines ganzen
Median-Punktes — für einen Lauf, dessen Ergebnis ein Wort ist. Ersetzt man das
Pollen durch einen einzigen blockierenden Aufruf (Bash mit `timeout` bis 600 s,
oder `run_in_background` plus die Completion-Benachrichtigung, die die Harness
ohnehin liefert — `docs/harness-primitives-evaluation.md` §5 hat sie bereits als
„ersetzt Log-Polling ganz" verbucht, aber die Messung zeigt, dass sie im Alltag
nicht benutzt wird), fallen 60–80 % dieser Antworten weg: **−7 bis −9 % der
Gesamtausgabe**, grobe Schätzung mit hartem Boden (die 11,0 % sind gemessen).
*Gegenkosten Achse A:* keine, eher negativ — ein 30-s-Poll entdeckt das Ende im
Mittel 15 s zu spät; eine Benachrichtigung ist sofort.
*Risiko:* eine verschluckte Benachrichtigung lässt die Sitzung hängen. Braucht
einen Timeout-Backstop und einen zweiten Weg, das Ergebnis zu erfahren (die
Log-Datei von `run-logged.mjs` liegt ohnehin vor).
*Voraussetzung:* dass die 600-s-Obergrenze des Bash-Werkzeugs reicht — für einen
42-min-Lauf reicht sie **nicht**, dort muss die Benachrichtigung tragen.

**A2 — `echo idle` abschaffen.**
*Achse:* B.
*Wirkung:* 1.189 Antworten, **3,8 % der Gesamtausgabe**, gemessen. Das Kommando
existiert, weil ein Guard „kein Leerlauf-Stopp" durchsetzt; es ist ein
Modell-Zug, der nichts tut, außer einen Zähler zu bedienen. Ein Marker, den ein
**Hook** setzt (kein Modell-Zug), leistet dasselbe. **−3,8 %**, mit sehr kleiner
Unsicherheit.
*Gegenkosten Achse A:* keine.
*Risiko:* der Leerlauf-Guard darf dadurch nicht blind werden; er muss den
Hook-Marker genauso akzeptieren wie heute den Zug. `mechanism-review-guard`
greift hier ohnehin (Änderung an einem Guard).
*Voraussetzung:* der Guard prüft eine Zustandsdatei, keine Turn-Eigenschaft.

**A3 — Poll-Intervall an die gemessene Laufzeit koppeln.**
*Achse:* B.
*Wirkung:* Das Repository kennt die Laufzeit jeder Suite
(`picture-check-cost.md` §1: `enrichments` 951 s, `flow` 140 s, `world` 73 s).
Ein erster Poll nach 0,9 × Medianlaufzeit statt nach 30 s reduziert eine
84-Poll-Kette auf 2–3. Untermenge von A1, aber **ohne jede neue Mechanik** —
reine Disziplin plus eine Tabelle, die es schon gibt.
*Gegenkosten:* keine.
*Risiko:* praktisch keins; eine zu lange erste Wartezeit kostet Wall-Clock im
Fehlerfall.

**A4 — Harte Obergrenze für Poll-Ketten.**
*Achse:* B.
*Wirkung:* Zwölf Ketten ≥ 10 tragen 1.450 Antworten (≈ 32 M gewichtet ≈ 3,8 %
der Gesamtausgabe); die längste ist 437. Eine Regel „nach 5 Polls: entweder
blockierend warten oder den Lauf als hängend behandeln" kappt genau diesen
Ausläufer. **−2 bis −3,5 %.**
*Gegenkosten:* keine.
*Risiko:* ein legitim langer Lauf würde fälschlich als hängend gemeldet — daher
„blockierend warten" als erster Ausgang, nicht „abbrechen".

### 1.2 Kontextgröße — der zweite Faktor der Grundgleichung

**B1 — Fenstergrenze auch INNERHALB eines Punktes, nicht nur an der Punktgrenze.**
*Achse:* B. **Der rechnerisch größte Einzelhebel meiner Liste.**
*Wirkung:* Heute ist die Fenstergrenze an die Punktgrenze gekoppelt (CLAUDE.md
§6: nach Merge und Tick `batch-boundary.mjs`). Ein Punkt läuft also in **einem**
Fenster, und der Kontext wächst über seine 189 Median-Antworten von 44 k auf
~230 k; der **mittlere** Kontext liegt bei den gemessenen 190–207 k. Schneidet
man stattdessen an jedem grünen, gepushten Commit — der Punkt bleibt derselbe,
nur das Fenster ist neu —, liegt der mittlere Kontext bei
44 k + 0,96 k × (Fensterlänge/2). Bei Schnitt alle 60 Antworten sind das ≈ 73 k
statt 200 k: **die Cache-Read-Komponente (78,7 % der gewichteten Ausgabe) fällt
grob auf ein Drittel bis die Hälfte, also −35 bis −45 % der Token je Punkt.**
Für die teuren Punkte ist der Effekt größer, weil sie mehr Antworten haben
(Maximum im Fenster: 2.438 Antworten in einem Transkript).
*Gegenkosten Achse A:* der Wiederaufsatz. `batch-resume-hook.mjs` orientiert eine
frische Sitzung für **~600 Tokens** (`harness-primitives-evaluation.md` §4) —
also 1–2 Antworten je Schnitt, gegen 60 gesparte Kontext-Wiederlesungen. Der
Prompt-Cache geht beim Schnitt verloren: einmal 44 k × 1,25 = 55 k
Cache-Write statt 4,4 k Read — amortisiert nach ~2 Antworten.
*Risiko:* **das ernsthafteste dieser Liste.** Was der Agent gelernt und nicht
aufgeschrieben hat, ist weg (Retrospektive §3.55, „was beim Umzug still
zurückbleibt"). Gegenmittel: Schnitt **nur** an einem grünen, gepushten Commit,
mit einer Übergabenotiz **im Branch** (nicht im Kontext) — was ohnehin die
Rettungs-Commit-Disziplin ist.
*Voraussetzung:* dass der Wiederaufsatz aus git + Notiz vollständig ist. Das ist
prüfbar: eine Sitzung nach dem Schnitt muss ohne Rückfrage weiterarbeiten
können. Vor dem Ausrollen an **einem** Punkt messen (`measure-task-cost.mjs
--tasks`), nicht global.

**B2 — Den Boot-Sockel senken (die 44 k, die jede Antwort mitliest).**
*Achse:* B.
*Wirkung:* 44 k × 0,1 × 189 Antworten = **0,83 M je Punkt = 17 % eines
Median-Punktes**. Jedes gesparte **1 k** der immer geladenen Präambel spart
19 k je Punkt, über 63 Punkte im Fenster **1,2 M**. CLAUDE.md ist heute 45.543
Zeichen ≈ 11 k Tokens, also rund ein Viertel des Sockels; der Rest sind
Werkzeug-Schemata, die Skill-Liste und der Memory-Index. Ein weiterer Schnitt von
CLAUDE.md um 30 % = 3,4 k Tokens = **−65 k je Punkt (1,4 %)**.
*Gegenkosten Achse A:* keine; Kosten sind einmalige Umbauarbeit.
*Risiko:* Punkt 555 hat den großen Schnitt schon gemacht; ein zweiter trifft
Substanz. Retrospektive §3.30: teuer war nicht das Kürzen, sondern das
Nachziehen aller Leser — **der gefährlichste ist der, der nicht scheitert,
sondern nur nichts mehr findet.**
*Voraussetzung:* dass noch Text da ist, der ausgelagert und nicht umgeschrieben
werden muss. Ehrliche Einschätzung: der Ertrag ist klein (1–2 % je Punkt) gegen
das Risiko. **Der lohnendere Teil des Sockels ist nicht CLAUDE.md, sondern die
Werkzeug-Schemata** — `ToolSearch` mit `defer_loading` ist in dieser Umgebung
bereits aktiv (die verzögerten Werkzeuge erscheinen nur als Name); zu prüfen
wäre, ob weitere Werkzeuge verzögerbar sind. Das ist eine Frage an die
Harness-Konfiguration, nicht an unseren Code.

**B3 — Große Werkzeug-Ausgaben nie in den Kontext lassen.**
*Achse:* B.
*Wirkung:* Eine 10-k-Ausgabe, die in Antwort 20 eines Punktes entsteht, wird in
den restlichen 169 Antworten mitgelesen: 10 k × 0,1 × 169 = **169 k gewichtet —
so viel wie acht Antworten.** `scripts/verify/run-logged.mjs` tut das bereits für
Verify-Läufe (gemessen 30.542 → 3.782 Zeichen). **Auszuweiten auf:** `git diff`
(immer mit `--stat` zuerst), `grep` (immer mit `-c` oder `| head`), Datei-Reads
(`offset`/`limit` statt ganzer Datei), `npm ls`, `gh run view`. Grobe Schätzung:
die Klasse „sonstige Shell" (13,6 %) und „Suchen/Lesen" (29,9 %) enthalten den
Löwenanteil solcher Ausgaben; eine Halbierung der durchschnittlichen
Ausgabenlänge dort senkt die Steigung von 0,96 k/Antwort spürbar — **−5 bis
−10 %, grob**, und der Effekt multipliziert sich mit B1 nicht, sondern
**addiert** sich (B1 kürzt die Zahl der Wiederlesungen, B3 das Gelesene).
*Gegenkosten Achse A:* leicht negativ — eine zu knappe Ausgabe erzwingt einen
Nachschlag-Zug. Das ist genau die Falle aus Retrospektive §3.33 („eine Ersparnis,
die Nacharbeit auslöst, ist keine"): 1 Nachschlag-Zug kostet 22 k, eine gesparte
10-k-Ausgabe bringt bis zu 169 k. Der Tausch lohnt bis zu einer Nachschlagquote
von ~85 %.
*Risiko:* gering, solange die **Fehlerausgabe** unbeschnitten bleibt —
`run-logged` macht das bereits richtig (jeder fehlgeschlagene Test wird
namentlich genannt).

**B4 — Prompt-Cache-Hygiene prüfen.**
*Achse:* B.
*Wirkung:* Unbekannt, deshalb ein **Prüfauftrag** und kein Vorschlag mit Zahl.
Der Cache ist ein Präfix-Match: **jede Byte-Änderung im Präfix entwertet alles
danach** (Anthropic-Doku). Wenn ein Hook oder ein `system-reminder` bei jedem Zug
etwas Wechselndes einspeist — einen Zeitstempel, eine Zählernummer, eine
wechselnde Werkzeugliste —, zahlt jede Antwort Cache-Write statt Cache-Read, also
**12,5-fach**. Gemessen sind 16,8 % der gewichteten Ausgabe Cache-Write bei nur
1,7 % der rohen Tokens; das ist ein plausibler Normalwert, aber niemand hat
geprüft, ob er niedriger sein könnte.
*Gegenkosten:* keine, es ist eine Messung.
*Risiko:* keins.
*Voraussetzung:* Zugang zum tatsächlich gesendeten Präfix — von hier aus nicht
gegeben. Der beobachtbare Ersatz: `cache_creation`/`cache_read` je Antwort über
die Zeit auftragen; ein hoher Write-Anteil **mitten** in einer Sitzung ist das
Alarmzeichen.

### 1.3 Suchen und Lesen — 29,9 % der Ausgabe, ein Kommando pro Zug

**C1 — Unabhängige Werkzeugaufrufe in EINEM Zug bündeln.**
*Achse:* **A und B gleichzeitig.** Bestes Aufwand/Nutzen-Verhältnis der ganzen
Liste.
*Wirkung:* Gemessen setzen **nur 4,9 %** der Antworten mehr als einen
Werkzeugaufruf ab, obwohl 80 % aller Aufrufe Shell-Kommandos sind und sehr viele
davon unabhängig (drei `grep` in drei Dateien, `git status` + `git log`, Lesen
zweier Dateien). Würde nur die Hälfte der 10.254 Such-/Lese-Antworten zu
Zweierpaaren, fielen **2.560 Antworten** weg: **−7,5 % Tokens und −7,5 %
Maschinenzeit**, ohne dass irgendetwas anderes geschieht. Das Feld bestätigt die
Richtung unabhängig (siehe §3, Quelle R4: „mit sequenziellem Werkzeugaufruf
zahlst du die Eingabe 24-mal, mit parallelem 3-mal").
*Gegenkosten:* keine — es ist dieselbe Arbeit in weniger Runden.
*Risiko:* zwei Kommandos in einem Zug, die **doch** voneinander abhängen (ein
`git commit` und ein `git push` auf dessen Ergebnis), erzeugen einen falschen
Zustand. Regel: parallel nur, was **lesend** ist oder nachweislich unabhängig.
Das ist genau die Unterscheidung, die die Harness-Doku als „parallel-safe"
kennt.
*Voraussetzung:* dass die Harness parallele Aufrufe in einer Antwort erlaubt —
tut sie (die Systemanweisung fordert es sogar ausdrücklich ein). Es ist also
reine **Disziplin**, kein Bau: eine Zeile im Delegations-Prompt und im
Batch-Prompt.

**C2 — Wiederholte identische Abfragen abstellen.**
*Achse:* A und B.
*Wirkung:* **3.992 Antworten (15,8 %)** sind ein Shell-Kommando, das in derselben
Sitzung schon einmal wortgleich lief; 1.918 davon (8,6 %) sind Suchen/Lesen. Ein
Teil ist legitim (`git status` nach einer Änderung liest absichtlich neu). Der
illegitime Teil ist das erneute Suchen nach einem Fakt, der schon im Kontext
steht — das ist ein Symptom von „context rot" (§3, Quelle R5) und wird von B1
teilweise mitgeheilt. Grobe Schätzung des vermeidbaren Anteils: ein Drittel →
**−5 %**.
*Gegenkosten:* keine.
*Risiko:* ein zwischenzeitlich veralteter Fakt wird nicht neu geholt. Deshalb
kein Verbot, sondern ein **Merkposten**: was sich seit der letzten Abfrage
geändert haben *kann*, wird neu geholt; was feststeht, nicht.
*Voraussetzung:* messbar überprüfbar — dieselbe Messung wieder fahren und sehen,
ob der Anteil fällt.

**C3 — Projekteigene Abfragekommandos statt ad-hoc-`grep`.**
*Achse:* A und B.
*Wirkung:* `point-brief.mjs` hat das für die Spezifikation getan, und die Phase
`brief` kostet seitdem **0,5 %** der Gesamtausgabe (§1.3) — der Beweis, dass das
Muster wirkt. Dieselbe Behandlung für die häufigen Repo-Fragen: „welche Suite
deckt Pfad X" (`render-verify-core.mjs` weiß es), „was ist der aktuelle Stand von
Punkt N", „welche Datei hält Wert Y". Jedes solche Kommando ersetzt typisch 3–5
Such-Antworten durch eine. Bei geschätzt 15 % der Suchen: **−4 %**, grob.
*Gegenkosten:* Bauarbeit; und jedes Kommando ist ein weiteres Stück Mechanik, das
gepflegt werden muss (Retrospektive §3.25: der Regelbestand verrottet wie Code).
*Risiko:* ein Kommando, das **rät** statt zu scheitern, fälscht (Retrospektive
§3.37). Jede Auflösung muss ihre Herkunft nennen — genau wie die Referenzkarte
des Briefs.

**C4 — Den Brief um die DATEILISTE erweitern.**
*Achse:* A und B.
*Wirkung:* Die ersten Antworten eines delegierten Agenten sind fast immer Suche
(„wo liegt das?"). Wenn der Brief die Dateien nennt, die der Punkt
voraussichtlich berührt — abgeleitet aus den `§`-Auflösungen und aus den Pfaden,
die die Spezifikation nennt —, entfallen davon die meisten. Bei 5 gesparten
Antworten je Punkt: 5 × 22 k × 63 = **7 M im Fenster ≈ 0,8 % der
Gesamtausgabe**; pro Punkt −2,3 %.
*Gegenkosten:* der Brief wächst (heute ~2,1 k Tokens); +0,5 k wäre 25 % mehr
Brief für 5 gesparte Antworten — der Tausch ist ungefähr 50:1 zugunsten des
Briefs.
*Risiko:* eine **falsche** Dateiliste ist schlimmer als keine — sie lenkt.
Deshalb: als Hinweis kennzeichnen, nicht als Vorgabe („diese Pfade nennt die
Spezifikation"; nicht „diese Dateien sind zu ändern").

### 1.4 Verifikation — 43,1 % der Token, 31,5 % der Maschinenzeit

Die Basislinie sagt zwei Dinge, die zusammen die Richtung bestimmen: die
Verifikation dominiert **nicht den typischen, sondern den teuren Punkt** (§1.7),
und **der Preis der Bildprüfung liegt nicht im Ansehen der Bilder, sondern in der
Schleife um den Lauf herum** (§2e). Beides zeigt in dieselbe Richtung: nicht die
Prüfung verbilligen, sondern die Schleife.

**D1 — Den Lauf fahren und die Bilder ansehen sind zwei Dinge; nur das Zweite gehört in die Hauptsitzung.**
*Achse:* B, stark.
*Wirkung:* Ein Frame kostet 1.716 Tokens zum Ansehen; eine LARGE-Runde auf beiden
Backends 294.096 Tokens, **wenn jeder Frame angesehen würde**
(`picture-check-cost.md` §6). Gegen die 359 M gewichtet der Phase `verification`
ist das ein Bruchteil eines Prozents (§2e). Die **Schleife** kostet: Starten,
Pollen, Ausgabe lesen, Nachfassen — bei 42 min und 30-s-Poll ~1,85 M je Lauf.
Also: die Hauptsitzung soll die **Frames** bekommen (10–20 k Tokens) und nicht
den **Lauf** fahren. **−1 bis −1,8 M je Bildprüfung**, das ist ein Drittel bis
ein Viertel eines Median-Punktes je Prüfung.
*Gegenkosten Achse A:* keine, wenn der Lauf im Hintergrund läuft.
*Risiko:* **hier sitzt die Verifikations-Disziplin.** Der Bildbeweis auf beiden
Backends bleibt unangetastet — die Frames werden weiter von einem Menschen bzw.
vom Hauptmodell angesehen, nur der Prozessstart wandert. `render-verify-guard`
darf dabei nicht weicher werden; er kreditiert ohnehin nur Läufe mit Exit 0.
*Voraussetzung:* dass die Frames aus dem Agenten-Worktree zuverlässig in die
Hauptsitzung kommen — sie liegen unter `verification/` und sind in git verfolgt,
also über den Branch verfügbar. Das ist heute schon so.

**D2 — Fail-fast auf der teuren Suite.**
*Achse:* A.
*Wirkung:* Gemessen: alle zehn aufgezeichneten `enrichments`-Läufe dauerten
951–1029 s, **acht davon endeten rot** und schrieben trotzdem alle 37 Frames
(`picture-check-cost.md` §1). `flow` bricht dagegen bei einem Fehler nach
59,8–90,4 s ab statt nach 130–156 s. Über zwei Tage waren das **≈ 2,1 h rote
Wall-Clock** (`picture-check-levers.md`, Lever B-J). Dieser Lever hat den Replay
**überlebt** und wurde nur als „hier außerhalb des Rahmens" zurückgestellt —
er ist zu holen.
*Gegenkosten Achse B:* keine (er spart nur Zeit, wie der Replay-Vermerk sagt) —
mit A1/A3 zusammen spart er auch Polls, also indirekt Token.
*Risiko:* ein früher Abbruch verliert die Frames, die nach dem Fehler geschrieben
worden wären. Da ein roter Lauf ohnehin nicht kreditiert wird, ist das kein
Verlust an Beweis.

**D3 — Die Verify-Ausgabe auch im GRÜNEN Fall auf eine Zeile.**
*Achse:* B.
*Wirkung:* `run-logged.mjs` schneidet den roten Fall gemessen von 476 auf 66
Zeilen. Der grüne Fall druckt heute eine Zeile je Suite (16 Suiten) plus
Rahmenwerk. Das ist bereits klein; der Rest sind die **Zwischenausgaben während
des Laufs** (15 Zeilen kommen laut Messung schon während des Laufs an) und die
**Frame-Listen**. Erwartete Wirkung: klein, **< 1 %**. Ehrlich: hier ist die
Arbeit schon getan; ich führe es nur auf, damit die Union es nicht als offen
zählt.

**D4 — Test-Impact-Auswahl über gemessene Abdeckung statt über eine Pfadkarte.**
*Achse:* A und B.
*Wirkung:* Der allgemeine Pfad→Suite-Zuordner wurde im Replay **verworfen**
(`picture-check-levers.md` §3.4, A11/B-H): die Korpus-Zeilen 2 und 5 hängen beide
an `TravelScene.tsx`, dessen Frames in `world` **und** `enrichments` **und**
`polish` liegen, „eine Karte, die das richtig routet, routet es überallhin und
spart nichts". **Das Urteil galt einer geratenen Kopplungskarte.** Eine
**gemessene** Abdeckung (welche Suite hat welche Quelldatei tatsächlich
ausgeführt) ist ein anderes Instrument: sie kennt `TravelScene` als von drei
Suiten berührt und fordert dann eben alle drei — sie spart dort, wo die Kopplung
wirklich fehlt. Wirkung nicht schätzbar ohne die Messung; das Feld berichtet für
klassische Test-Impact-Analyse deutliche Reduktionen (§3, Quelle R3), aber das
ist eine **Hypothese** für uns, kein Befund.
*Gegenkosten:* erhebliche Bauarbeit (Instrumentierung eines Browser-Laufs) und
laufende Kosten (Abdeckung erheben verlangsamt den Lauf).
*Risiko:* **hoch, und die Verifikations-Disziplin steht auf dem Spiel.** Eine
Abdeckungsmessung sagt, welche Datei *ausgeführt* wurde — nicht, welche das Bild
*verändert*. Der gestufte Küstenverlauf kam aus `src/world/redSea.ts`, einer
Datei, die zur Laufzeit Geometrie liefert und die keine Kopplungskarte einer
Küstenaufnahme zugeordnet hätte (§3.1b). Eine Abdeckungskarte hätte sie
zugeordnet — das ist das Argument dafür. Aber sie hätte auch alles andere
zugeordnet, was der Lauf berührt.
*Voraussetzung:* dass die Abdeckung **konservativ** ausfällt (im Zweifel läuft
die Suite). Als **Vorschlag mit ausdrücklichem Risikovermerk** aufgenommen, nicht
als Empfehlung.

**D5 — Deterministische Aufnahme als Voraussetzung für alles Diff-Basierte.**
*Achse:* B, langfristig.
*Wirkung:* Heute bewegen zwei Läufe **derselben** Suite auf **identischem** Code
10,9–98,6 % der Pixel, während der kleinste echte Defekt 0,75 % bewegt
(`picture-check-levers.md` §3.2). Deshalb sind A6/A7/A8/B-D/B-G/A10 **alle
verworfen**. `scripts/picture-stability.mjs` misst die Schranke und ist die
Annahmeprüfung. Wäre sie bestanden, öffnete sich der ganze Zweig: ein
Golden-Image-Vorfilter wäre gemessen 12× auf einer typischen Änderung und **0**
auf einem Lauf, der nichts bewegt hat.
*Gegenkosten:* reine Investition; heute keine Ersparnis.
*Risiko:* die eigentliche Ursache ist laut §4.6 nicht ein Toleranzknopf, sondern
dass die Aufnahme **nicht auf das Bild wartet, das sie benennt** —
`12-worldmodel-lake-victoria` zeigte zweimal verschiedene Orte, beide Male mit
Exit 0. Das ist inzwischen teilweise durch den Verschluss (Punkt 375,
`frameSubject.mjs`) adressiert. **Eine Neumessung der Stabilität nach dem
Verschluss ist überfällig** und könnte das Urteil ändern.
*Voraussetzung:* `picture-stability.mjs` meldet STABLE. Vorher kein Gate.

**D6 — Die Ausläufer-Punkte bremsen, bevor sie 100 M kosten.**
*Achse:* B.
*Wirkung:* **10 von 63 Punkten tragen die Hälfte** der punktzugeordneten Kosten
(§1.7); der teuerste (342) allein 16,8 %, mit **81 % Verifikationsanteil**.
Deckelte man die zwölf teuersten auf p90 (20,35 M), fielen 343 M auf 244 M —
**−99 M ≈ −16 % der punktzugeordneten Kosten**. Der Mechanismus:
`measure-task-cost.mjs` kann je Branch messen; ein Hook meldet beim
Überschreiten des 3-fachen Medians, und dann wird **entschieden**, ob der Punkt
neu zugeschnitten wird.
*Gegenkosten Achse A:* ein neu geschnittener Punkt braucht einen zweiten Sockel
(§1.6: 4,5 M) und eine zweite Kalenderrunde.
*Risiko:* **Retrospektive §3.33 ist hier die Bremse: eine Ersparnis, die
Nacharbeit auslöst, ist keine.** Ein teurer Punkt ist oft teuer, *weil* er schwer
ist; abbrechen macht ihn nicht billig, sondern doppelt. Deshalb ausdrücklich
**Warnung + Entscheidung**, nie automatischer Abbruch. Der eigentliche Wert
liegt in der Sichtbarkeit: heute merkt niemand, dass ein Punkt gerade 100 M
kostet, bis er fertig ist.
*Voraussetzung:* dass die Messung **während** des Punktes verfügbar ist — sie ist
es, das Transkript wird laufend geschrieben.

**D7 — Der Agent sieht seinen eigenen Verbrauch.**
*Achse:* B.
*Wirkung:* Selbstregulierung statt externem Deckel: der Delegations-Prompt nennt
den Median (4,75 M / 189 Antworten) als Erwartung, und der Agent prüft sich
einmal in der Mitte. Wirkung nicht schätzbar; die Literatur zu Task-Budgets sagt,
ein Modell, das seinen Countdown sieht, priorisiert und schließt sauber ab (§3,
Quelle R7).
*Gegenkosten:* ein bis zwei Antworten je Punkt für die Selbstmessung (−0,5 %
Wirkung, +1 % Kosten — der Tausch lohnt nur, wenn er das Verhalten ändert).
*Risiko:* **die Literatur warnt in die Gegenrichtung**: ein sichtbarer
Rest-Kontext-Zähler kann ein Modell zu früh abschließen lassen
(„Kontext-Angst", ausdrücklich in der Anthropic-Migrationsdoku für Fable 5). Der
Verbrauchszähler ist nicht dasselbe wie ein Kontextzähler, aber die Nähe ist
gewollt zu beachten.

### 1.5 Buchführung — 26,7 % der Token und **38,3 % der Maschinenzeit**, die größte Zeitfresserin

**E1 — Board, Focus und Queue in einen Aufruf bündeln.**
*Achse:* A und B.
*Wirkung:* Gemessen: `board.mjs` 562, `board-queue.mjs` 181, `focus` 175,
`board-publish` 149 Aufrufe im Fenster = **1.067 Antworten ≈ 23 M gewichtet ≈
2,8 % der Gesamtausgabe**. Ein zusammengesetzter Aufruf
(`board.mjs --focus … --card … --publish`) je Zug statt drei bis vier spart
davon grob zwei Drittel: **−1,8 %** und dieselbe Zeit.
*Gegenkosten:* keine.
*Risiko:* gering; ein zusammengesetztes Kommando, das auf halbem Weg scheitert,
hinterlässt einen halben Zustand. Also: erst alles prüfen, dann alles schreiben.

**E2 — Die Guards in EINEN Vorab-Aufruf zusammenfassen.**
*Achse:* A und B.
*Wirkung:* `guard-preflight.mjs` existiert (123 Aufrufe gemessen) und ist genau
das richtige Muster — CLAUDE.md §7.2 hält fest, dass ein blockierter Zug „~30
Züge" kosten kann. Zu erweitern: **ein** `--for answer`, das **alle** Guards der
Kette prüft und die Reparaturkommandos in einer Ausgabe nennt, statt dass jeder
Guard einzeln abgefragt oder — schlimmer — im Blockierfall entdeckt wird.
Wirkung: die vermiedenen Blockierschleifen sind der eigentliche Gewinn, und die
sind im Ausläufer versteckt (der 437er-Poll-Ausläufer ist vermutlich verwandt).
Grobe Schätzung **−1 bis −3 %**.
*Gegenkosten:* keine.
*Risiko:* ein Preflight, der ein Blockieren **verpasst**, erzieht zum Vertrauen
und dann zum blockierten Zug. Er ist ausdrücklich beratend, der Guard bleibt
maßgeblich — das steht schon so in CLAUDE.md.

**E3 — Deterministische Buchführung aus dem Modell-Zug in Hooks verlegen.**
*Achse:* A und B.
*Wirkung:* Board-Publish, Batch-Marker, CI-Statusprüfung, der Zeitstempel — das
sind Schritte ohne Urteil. Jeder davon, der als Hook läuft statt als
Werkzeugaufruf, spart eine Antwort à 22 k. Bei 3 solchen Schritten je Zyklus und
~200 Zyklen im Fenster: **−13 M ≈ −1,6 %**, grob.
*Gegenkosten:* keine laufenden.
*Risiko:* **mittel bis hoch.** Ein Hook, der schreibt (committet, veröffentlicht),
ist schwer zu debuggen, und Retrospektive §3.38 („fail-open EINMAL ist nicht
fail-open FÜR IMMER") sowie §3.43 („der Fehler, den die Fail-open-Hülle
verschluckt") sind beide an genau dieser Klasse entstanden.
`mechanism-review-guard` verlangt hier ohnehin das zweite Modell.
*Voraussetzung:* der Schritt ist wirklich urteilsfrei. Board-**Karten** sind es
nicht (sie formulieren); Board-**Publish** ist es.

**E4 — Die Buchführung DELEGIEREN statt sie im 300-k-Kontext der Hauptsitzung zu fahren.**
*Achse:* B. **Rechnerisch der größte Buchführungs-Hebel.**
*Wirkung:* Die Hauptsitzung trägt **64,1 %** ihrer Kosten in `bookkeeping`
(§1.5), bei einem Median-Kontext von 163 k und im Ausläufer über 480 k. Derselbe
`board.mjs`-Aufruf in einem frischen, kurzlebigen Agenten kostet **44 k × 0,1 =
4,4 k** statt 16–48 k. Bei den 2.845 gemessenen Buchführungs-Antworten wäre das
grob **−4 bis −6 % der Gesamtausgabe** — vorausgesetzt, sie ließen sich
vollständig verlagern, was sie nicht tun.
*Gegenkosten Achse A:* jeder Delegationsaufruf ist selbst eine Antwort, und der
Agent bootet (44 k Cache-Write = 55 k gewichtet). Ein Buchführungs-Agent lohnt
also erst ab ~4 verlagerten Aufrufen.
*Risiko:* **die Lease.** Guards stehen für eine Sitzung still, die den Batch-Lock
nicht hält (Brief-HOUSE-FACTS), und die PreToolUse-Fence verweigert einem
Nicht-Owner Merge, Tick und Board-Publish. Ein Buchführungs-Agent müsste die
Ownership erben oder ausdrücklich ausgenommen werden — **das ist ein Eingriff in
die Sicherungsschicht und damit kein kleiner Vorschlag.**
*Voraussetzung:* dass der Buchführungs-Agent den Zustand vollständig aus Dateien
liest (tut er — Board, Queue, Lock sind alle Dateien).

**E5 — Verwandte Punkte in einem Branch bündeln.**
*Achse:* B.
*Wirkung:* Der Sockel je Punkt ist **≈ 4,5 M gewichtet gegen einen Median-Punkt
von 5,0 M** (§1.6) — die belastbarste Einzelaussage der Basislinie. Zwei
verwandte Punkte in **einem** Branch, mit zwei Commits und einem Merge, sparen
grob **3,5 M** (den amortisierten Hauptsitzungs-Anteil eines Punktes, 3,55 M) und
kosten das zusätzliche Kontextwachstum (~+0,5 bis 1 M). **Netto −2,5 bis −3 M je
gebündeltem Paar ≈ ein halber Median-Punkt.** Das deckt sich mit der schon
bestehenden Regel „bundle first, don't open a point" — hier ist erstmals die
Zahl dazu.
*Gegenkosten Achse A:* der Kalender-Median steigt (zwei Punkte werden gemeinsam
fertig statt einer früh); der p90 sinkt eher, weil ein Merge statt zwei ansteht.
*Risiko:* ein Bündel, dessen eine Hälfte scheitert, blockiert die andere. Und die
TASKS-Regel „ein Punkt = ein Branch" müsste sich ändern — das ist eine
Prozessänderung mit Guard-Berührung (`tasks-archive-guard`, der Tick).
*Voraussetzung:* die Punkte berühren **nicht überlappende** Dateien oder gehören
demselben System an.

**E6 — Kürzere Berichte.**
*Achse:* B, klein.
*Wirkung:* Output ist 4,5 % der gewichteten Ausgabe (§1.2), und Output-Tokens
wiegen **5×**. Der Median-Punkt produziert 47 k Output-Tokens. Ein Drittel
kürzere Berichte und Board-Karten wären **−1,5 %** insgesamt.
*Gegenkosten:* ein zu knapper Bericht kostet eine Rückfrage — und eine Rückfrage
kostet einen ganzen Zug beim Nutzer plus einen bei uns.
*Risiko:* Retrospektive §3.57: „die Anleitung an den Nutzer ist die schlechteste
aller Antworten" — kürzen darf nie heißen, dem Nutzer Arbeit zurückzugeben.

### 1.6 Gates — 11,6 % der Token, 12,8 % der Zeit

**F1 — Vitest nur auf dem betroffenen Teil während der Arbeit.**
*Achse:* A und B.
*Wirkung:* 1.747 Gate-Antworten = 4,4 % gewichtet; die Wall-Clock ist der größere
Posten (27,4 h = 12,8 %). Vitest kann `--changed` bzw. eine Pfadfilterung; der
**volle** Lauf bleibt Pflicht vor Push und Merge (`test:unit` im Fast-Gate). Bei
5 Zwischenläufen je Punkt, die von 60 s auf 10 s fallen, sind das ~4 min je
Punkt: **−3 % der Maschinenzeit**, Token nur über die kürzere Wartezeit.
*Gegenkosten:* keine, solange der volle Lauf am Tor steht.
*Risiko:* **die Verifikations-Disziplin verlangt den vollen Lauf am Tor** — ein
Teil-Lauf darf nie ein Tor passieren. `test:small`/`test:large` bleiben, wie sie
sind.

**F2 — Prüfen, ob Gates doppelt laufen.**
*Achse:* A und B.
*Wirkung:* Es gibt einen Pre-Push-Hook, der den schnellen Riegel fährt
(Retrospektive §3.40), **und** die Regel, nach jedem Merge das Fast-Gate zu
fahren, **und** CI. Wenn der Agent build+lint+vitest zusätzlich manuell fährt,
zahlt er es zwei- bis dreimal. Zu **messen**, nicht zu vermuten: wie oft läuft
`npm run build` im selben Branch mehrfach ohne Änderung dazwischen? (Der
Wiederholungsdetektor aus §0.3 kann das beantworten: 3.992 exakte
Wiederholungen insgesamt.)
*Gegenkosten:* keine.
*Risiko:* keins, es ist eine Messung.

**F3 — `npm audit` nicht je Zug.**
*Achse:* B, klein.
*Wirkung:* 95 `audit-check`-Aufrufe im Fenster. Der Abhängigkeitsbaum ändert sich
nur bei `package-lock.json`. Ein Aufruf je Lock-Änderung statt je Gate-Runde
spart den Rest. **< 0,3 %.**
*Risiko:* Kriterium 18 verlangt Sauberkeit „nach **jeder** Änderung" — die
Bedingung wäre also zu präzisieren, nicht zu lockern. CI fährt es ohnehin.

### 1.7 Kalenderzeit — die Achse, die nur Parallelität und Wartezeit bewegt

**G1 — Der Pool-Cap ist für nicht-verifizierende Arbeit zu niedrig.**
*Achse:* A.
*Wirkung:* Retrospektive §3.27 hat geklärt: Parallelität kostet **pro fertigem
Punkt nichts**, sie vervielfacht Rate und Durchsatz gemeinsam. Der Cap von 3
existiert wegen der Aufsicht und wegen der Flakes unter Last (§3.8, „ruhige
Maschine"). Beides betrifft **Browser-Läufe**. Für Doku-, Analyse- und
Skript-Arbeit gilt es nicht. Ein getrennter Cap („3 verifizierende + n leichte")
verkürzt die Kalenderzeit, ohne die Flake-Ursache anzufassen.
*Gegenkosten Achse B:* neutral pro Punkt; die Aufsicht in der Hauptsitzung
wächst (jeder Strang endet dort — §3.27).
*Risiko:* die Hauptsitzung ist der Engpass und urteilt schlechter, je mehr
Fremdstoff ihr Kontext aufnimmt. E4 (Buchführung delegieren) und B1
(Fensterschnitt) müssten zuerst wirken.

**G2 — Merges in Blöcken statt einzeln.**
*Achse:* A.
*Wirkung:* Kalender-Median 0,75 h, **p90 4,65 h** (§1.4) — der Ausläufer ist
weit größer als der Median. Ein Teil davon ist Wartezeit auf die serialisierte
Hauptsitzung (Merge → Fast-Gate → Tick → Deploy → Cleanup). Drei fertige Branches
in einem Block gemergt teilen sich **ein** Fast-Gate statt drei.
*Gegenkosten:* ein gemeinsames Fast-Gate rot lässt nicht erkennen, welcher Branch
schuld ist — dann einzeln nachfahren.
*Risiko:* die Regel „nach JEDEM Merge das Fast-Gate" existiert genau deshalb,
weil zwei sauber automergende Punkte zusammen brechen können (CLAUDE.md §6). Ein
Block-Gate prüft das Ergebnis aller drei, also **erfüllt** es die Regel — nur die
Zuordnung eines Fehlers wird teurer.

**G3 — Messen, wie viel des Kalender-p90 Warten ist.**
*Achse:* A, Vorarbeit.
*Wirkung:* Aus `measure-task-cost.mjs` kommt „erster Branch-Commit → Merge"; was
fehlt, ist die Zerlegung in *Bauen*, *Verifizieren* und *auf-den-Merge-Warten*.
Ohne sie ist jede Aussage über die Kalenderachse eine Vermutung. Der Vergleich
Maschinenstunden (1,39 h Median) gegen Kalenderstunden (0,75 h Median) zeigt
schon, dass parallel gearbeitet wird — aber der p90 von 4,65 h gegen 5,2 h
Maschinen-p90 lässt beides zu.
*Gegenkosten/Risiko:* keine, es ist eine Messung.

### 1.8 Was die Harness gibt oder nicht gibt

**H1 — Task-Budget erneut prüfen.**
`docs/harness-primitives-evaluation.md` §3 hat die Workflow-BUDGET als **nicht
verfügbar** befunden (Probe 07.08.2026). Der API-Parameter
`output_config.task_budget` (Beta `task-budgets-2026-03-13`, Opus 5 unterstützt
ihn) ist die inhaltlich gleiche Sache auf der API-Ebene — über die Harness aber
nicht setzbar. **Verdikt unverändert: die Lücke bleibt unsere**, und B1 + D6
sind der Ersatz. Erneut probieren, wenn ein Harness-Update kommt.

**H2 — `defer_loading` für weitere Werkzeuge.**
Diese Umgebung liefert bereits verzögerte Werkzeuge (`ToolSearch`, WebSearch,
Monitor, …), die nur als Name im Kontext stehen. Das senkt den 44-k-Boot-Sockel
bereits. Ob weitere Schemata verzögerbar wären, ist eine Konfigurationsfrage —
**als Frage an die Harness notiert, nicht als Maßnahme.**

**H3 — Mid-conversation system messages / mid-conversation tool changes.**
Beide Mechanismen existieren auf der API (Opus 5) und erhalten den Cache, wo eine
Änderung des System-Prompts oder des Werkzeugsatzes ihn sonst entwertet. Sie sind
Harness-Sache, nicht unsere. **Als Hinweis für die Harness-Seite aufgenommen**,
weil sie die 16,8 % Cache-Write-Anteil erklären könnten, falls dort heute anders
verfahren wird.

---

## 2. Verworfen — mit Begründung

Eine Verwerfung ist ein Ergebnis; die Union behält sie.

| # | Maßnahme | Warum verworfen |
| --- | --- | --- |
| V1 | **Arbeit an Sonnet oder Haiku routen** (Modell-Kaskade, FrugalGPT-Muster) | Die Allowlist ist bindend (CLAUDE.md §6): Opus 5 / Fable 5 / Opus 4.8. Eine degradierte Sitzung ist ein Fähigkeitsbruch und stoppt den Batch. **Kein Vorschlag** — nur hier notiert, damit die Union nicht denkt, es sei übersehen worden. |
| V2 | **Advisor-Werkzeug** (billiger Executor + teurer Ratgeber) | Setzt einen Executor unterhalb der Allowlist voraus. Fällt mit V1. |
| V3 | **Batch-API (50 % Rabatt)** | Asynchron, bis 24 h Laufzeit, keine Werkzeugschleife. Unsere Schleife ist interaktiv und werkzeuggetrieben; die Harness bietet den Weg nicht an. Rabatt real, hier unerreichbar. |
| V4 | **Fast Mode** (2,5× Ausgabegeschwindigkeit) | Bewegt Achse A, kostet auf Achse B den doppelten Preis ($10/$50 statt $5/$25). Über die Harness nicht setzbar. Und: unsere Wall-Clock hängt an der **Zahl** der Antworten, nicht an der Ausgabegeschwindigkeit — der Median-Output ist 120 Tokens. Der Hebel griffe an der falschen Stelle. |
| V5 | **Golden-Image-Vorfilter / Cross-Backend-Diff / diff-abgeleiteter Zuschnitt / perzeptuelle Metrik** | Im Replay gemessen verworfen (`picture-check-levers.md` §3.4): die ruhigste Aufnahme bewegt 27,81 % der Pixel, der kleinste echte Defekt 0,75 %. Erst nach D5. |
| V6 | **Downscaling, Kontaktbogen, Zuschnitt auf die Region** | Im Replay als Ersatz verworfen; und **jetzt zusätzlich gegenstandslos**: die Basislinie §2e zeigt, dass das Ansehen der Frames ein Bruchteil eines Prozents der Verifikationskosten ist. Selbst ein 37×-Hebel auf einer Größe, die < 0,5 % ist, ist Rauschen. |
| V7 | **Viewport auf 28-px-Vielfache schnappen (B-A, 4,9 %)** | Überlebte den Replay, wurde für „den nächsten Viewport-Wechsel" zurückgestellt. Nach §2e ist auch das gegenstandslos: 4,9 % von < 0,5 % ist nichts. **Nicht einmal beim nächsten Viewport-Wechsel die Aufmerksamkeit wert.** |
| V8 | **Bytes sparen** (Graustufen, Palette, PNG-Kompression, JPEG, Hash-Dedup) | Auf Arithmetik verworfen (`picture-check-levers.md` A13): die Token-Kosten eines Frames hängen allein am Viewport, über eine 24-fache Byte-Spanne identisch. |
| V9 | **Frames weglassen / die teure Suite aufteilen** | Verworfen (A5/B-I): der Korpus läuft andersherum — der Horizontstreifen wurde durch **Hinzufügen** eines Frames gefunden. |
| V10 | **Pfad→Suite-Karte in allgemeiner Form** | Verworfen (A11/B-H); nur die Verengung auf reine `src/ui/`-Änderungen überlebte und ist **implementiert**. D4 schlägt ausdrücklich ein **anderes** Instrument vor. |
| V11 | **Punkte grundsätzlich kleiner schneiden** | Rechnet sich **nicht**: der Sockel ist 4,5 M gegen einen Median-Punkt von 5,0 M (§1.6). Punkte halbieren verdoppelt den Sockel und spart nur Kontextwachstum. Der Kontexthebel gehört zur **Fenster**grenze (B1), nicht zur Punktgrenze — die beiden werden hier bewusst entkoppelt. E5 geht die Gegenrichtung. |
| V12 | **Den Arbeitsauftrag weiter aufteilen / das Archiv verschlanken** | Die Phase `brief` kostet **0,5 %** der Gesamtausgabe, Median 0,00 M je Punkt (§1.6). Es ist kein Kostentreiber mehr. Die 1,2 M Zeichen des Archivs werden offensichtlich nicht gelesen. |
| V13 | **Vier-Augen sparen** | Die Regel ist nicht verhandelbar, und §3.33 der Retrospektive quantifiziert die Gegenrechnung: drei defekte Lieferungen an einem Abend kosteten mehr als alle Sparmaßnahmen davor eingebracht hatten. |
| V14 | **`verification/` untracken** | Speicher, keine Token; und die archivierten Frames sind der Replay-Korpus. Bleibt außerhalb. |
| V15 | **Kontext-Kompression selbst bauen** (eigene Zusammenfassung statt Fensterschnitt) | Die Harness/API macht das serverseitig (das Kontext-Plateau bei ~330 k ist vermutlich genau das). Etwas nachzubauen, was die Ebene darunter schon tut, ist die Fehlerklasse aus `harness-primitives-evaluation.md`. B1 (harter Schnitt an einem git-Zustand) ist das, was sie **nicht** tut. |
| V16 | **Screenshots ganz aus der Regression nehmen** | Verletzt die Verifikations-Disziplin unmittelbar. Nicht diskutabel. |

---

## 3. Online-Recherche — jede Quelle mit Urteil gegen unsere Zahlen

Regel des Punktes: **ein Benchmark aus einem anderen Aufbau ist hier eine
Hypothese, kein Befund.** Jede Zeile ist entsprechend markiert.

**R1 — Verlaufs-Wiederversand ist der dominante Posten.**
„In typischen Agenten-Sitzungen macht das erneute Senden des
Gesprächsverlaufs rund 50–60 % der gesamten Token-Ausgabe aus."
Quelle: *AI Agent Loop Token Costs: How to Constrain Context*, Augment Code,
https://www.augmentcode.com/guides/ai-agent-loop-token-cost-context-constraints
(abgerufen 09.08.2026).
**Urteil: bei uns BESTÄTIGT und übertroffen — 78,7 % der gewichteten Ausgabe ist
wieder-gelesener Kontext** (Basislinie §1.2). Das ist ein **Befund** für unser
Repository, weil wir es selbst gemessen haben; die fremde Zahl bestätigt nur die
Größenordnung. Sie stützt B1 und B3.

**R2 — Multi-Agenten kosten ~15×, Einzel-Agenten ~4× einer Chat-Interaktion; Token-Verbrauch erklärt 80 % der Leistungsvarianz.**
Quellen: *How Anthropic Built a Multi-Agent Research System*, ByteByteGo,
https://blog.bytebytego.com/p/how-anthropic-built-a-multi-agent ·
*Multi-agent AI costs 15x more, and almost nobody routes it*, Nadir,
https://getnadir.com/blog/multi-agent-orchestration-15x-token-cost/
(beide abgerufen 09.08.2026).
**Urteil: HYPOTHESE, und in der naheliegenden Lesart bei uns WIDERLEGT.** Unsere
Subagenten tragen 68,8 % der Token bei nahezu gleicher Maschinenzeit wie die
Hauptsitzung (§1.5) — aber Retrospektive §3.27 hat bereits geklärt, dass
Parallelität **pro fertigem Punkt** nichts kostet, weil der Kontext für einen
neuen Punkt ohnehin neu gefüllt wird. Der 15×-Wert misst *pro Anfrage*, nicht
*pro Arbeit*; er ist genau der Nenner-Fehler, den §3.27 benennt. **Nicht als
Argument gegen Parallelität verwenden.** Was übrig bleibt und interessant ist:
„Domänen, in denen alle Agenten denselben Kontext teilen müssen, eignen sich
nicht" — das stützt E5 (bündeln, was zusammengehört) und G1 (trennen, was nicht).

**R3 — Test-Impact-Analyse reduziert CI-Kosten deutlich.**
Quellen: *Test Impact Analysis*, minware,
https://www.minware.com/guide/best-practices/test-impact-analysis ·
*Improving Test Execution Efficiency With Test Impact Analysis*, Parasoft,
https://www.parasoft.com/blog/test-impact-analysis/ ·
*Measuring the Cost of Regression Testing in Practice*, UBC,
https://www.cs.ubc.ca/~rtholmes/papers/fse_2017_labuschange.pdf
(abgerufen 09.08.2026).
**Urteil: HYPOTHESE, und bei uns schon einmal in der geratenen Form widerlegt.**
Der Pfad→Suite-Zuordner ist im Replay gescheitert
(`picture-check-levers.md` §3.4). Die Literatur beschreibt jedoch
**abdeckungsbasierte** Auswahl (dynamisch, aus dem Lauf gemessen), nicht
pfadbasierte — das ist D4, und es ist bewusst mit hohem Risikovermerk aufgeführt.
Die zitierten Reduktionen gelten für Unit-Suiten, nicht für Bildprüfungen; sie
übertragen sich **nicht** auf unsere teuerste Kontrolle.

**R4 — Paralleles Werkzeugaufrufen: bis 3,7× Latenz-Beschleunigung; Eingabe wird 3-mal statt 24-mal bezahlt.**
Quellen: *Speculative Execution and Parallel Tool Calling*, Zylos Research,
https://zylos.ai/research/2026-04-08-speculative-execution-parallel-tool-calling-ai-agents/ ·
*Parallel Tool Calling in LLM Agents*, DEV,
https://dev.to/rahulxsingh/parallel-tool-calling-in-llm-agents-complete-guide-with-code-examples-3ilo
(abgerufen 09.08.2026).
**Urteil: HYPOTHESE mit sehr starker Passung.** Unsere Messung sagt unabhängig
dasselbe: nur **4,9 %** unserer Antworten setzen mehr als einen Aufruf ab, und
Suchen/Lesen ist mit 29,9 % der größte Einzelposten. Die fremde Zahl (24× → 3×)
ist der Extremfall; unsere konservative Rechnung in C1 nimmt nur 2× an und kommt
auf −7,5 % auf **beiden** Achsen. Das ist der Vorschlag mit dem besten
Aufwand/Nutzen-Verhältnis und er ist durch unsere eigene Messung getragen, nicht
durch die Quelle.

**R5 — „Context Rot": Leistung fällt vorhersagbar nach 20–30 Runden; Modelle übersehen Ereignisse 2–30× häufiger, wenn sie nach 800 k Tokens harmloser Aktivität auftreten.**
Quellen: *Classifier Context Rot*, arXiv,
https://arxiv.org/html/2605.12366v1 · *Context rot explained*, Redis,
https://redis.io/blog/context-rot/ · *Context Rot*, Morph,
https://www.morphllm.com/context-rot (abgerufen 09.08.2026).
**Urteil: HYPOTHESE, aber sie verändert die Begründung von B1.** Wir haben den
Fensterschnitt bisher als **Kostenmaßnahme** begründet (87–94 % über 150 k
Kontext). Diese Literatur sagt: er ist auch eine **Qualitäts**maßnahme. Das ist
für dieses Projekt bedeutsam, weil es das Risiko von B1 umdreht — der Schnitt
kostet nicht nur Orientierung, er kauft auch Urteilsschärfe. **Bei uns nicht
gemessen**; messbar wäre es über die Fehlerrate spät im Punkt gegen früh. Das
wäre eine eigene Untersuchung.

**R6 — Prompt-Caching: 45–85 % Kostensenkung; Claude Code liest 92,7 % seines Prompts aus dem Cache.**
Quellen: *How prompt caching cut our production AI agent input costs by 77 %*,
Deriv, https://derivai.substack.com/p/prompt-caching-production-ai-agent-costs ·
*Prompt Cache Hit Rate Engineering*, AgentMarketCap,
https://agentmarketcap.ai/blog/2026/04/11/prompt-cache-hit-rate-engineering-2026 ·
*The 2026 Caching Playbook for Agents*, Galileo,
https://galileo.ai/blog/the-2026-caching-playbook-for-agents-bigger-prompts-smaller-bills
(abgerufen 09.08.2026).
**Urteil: BEFUND über die Mechanik, HYPOTHESE über den Ertrag hier.** Die
Mechanik (Präfix-Match, stille Entwerter, 20-Block-Rückschau) ist
Anbieter-dokumentiert. Unser gemessener Anteil — 98,2 % der **rohen** Tokens sind
Cache-Reads (§1.2) — liegt bereits über dem zitierten Claude-Code-Wert von
92,7 %. **Der Cache ist bei uns also schon nahezu ausgereizt; hier ist nichts
mehr zu holen.** Das ist ein wichtiges negatives Ergebnis: die populärste
Sparmaßnahme des Feldes ist bei uns bereits eingelöst, und genau deshalb ist die
verbleibende Frage nicht „wie cachen wir besser", sondern „wie lesen wir
weniger **oft**" (B1) und „wie lesen wir weniger" (B2/B3).

**R7 — Kompaktierung: 132.000 Tokens auf 2.000; regelbasiertes Beschneiden senkte einen Lauf von $7,24 auf $4,22.**
Quellen: *Agent Context Compaction for Long-Running Sessions*, Zylos Research,
https://zylos.ai/research/2026-04-21-agent-context-compaction-long-running-sessions/ ·
*TokenPilot: Cache-Efficient Context Management for LLM Agents*, arXiv,
https://arxiv.org/html/2606.17016v1 ·
*Context Engineering for Production LLM Agents (2026)*, AppScale,
https://appscale.blog/en/blog/context-engineering-production-llm-agents-token-budget-compaction-2026
(abgerufen 09.08.2026).
**Urteil: HYPOTHESE, und teilweise bereits eingelöst.** Unser gemessenes
Kontext-Plateau bei ~330 k deutet darauf hin, dass die Ebene unter uns bereits
kompaktiert. Der TokenPilot-Befund („regelbasiertes Beschneiden filtert
weitschweifiges Umgebungsrauschen, **bevor** es in den Kontext gelangt") ist
dagegen **genau B3** und in unserer Hand — und `run-logged.mjs` ist der Beweis,
dass es bei uns funktioniert (30.542 → 3.782 Zeichen gemessen).

**R8 — Modell-Kaskaden: bis 3,66× Ersparnis bei 95 % Qualität (RouteLLM); Cluster-Route-Escalate.**
Quellen: *How to Reduce Agent Cost by Model Routing*, Splunk,
https://www.splunk.com/en_us/blog/artificial-intelligence/reduce-agent-cost-by-model-routing.html ·
*Cluster, Route, Escalate*, arXiv, https://arxiv.org/html/2606.27457v1 ·
*We Built a Routing Layer to Cut Our AI Costs. It Broke the Product.*, Towards
Data Science,
https://towardsdatascience.com/we-built-a-routing-layer-to-cut-our-ai-costs-it-broke-the-product/
(abgerufen 09.08.2026).
**Urteil: für uns NICHT ANWENDBAR** (Allowlist, V1). Die dritte Quelle ist
trotzdem lesenswert und stützt die Allowlist: eine Routing-Schicht, die Kosten
senkte und das Produkt brach, ist genau das Muster aus Retrospektive §3.33.

**R9 — Evaluations-Kosten: „Agent-as-a-Judge" kostete $30,58 gegen $1.297,50 menschliche Bewertung (2,29 %).**
Quellen: *Agent-as-a-Judge*, arXiv, https://arxiv.org/pdf/2410.10934 ·
*LLM-as-a-Judge in 2026*, DeepEval, https://deepeval.com/blog/llm-as-a-judge
(abgerufen 09.08.2026).
**Urteil: HYPOTHESE, und für unsere teuerste Kontrolle ausdrücklich NICHT
übertragbar.** Ein Richter-Modell kann die Frage „sieht dieses Bild für einen
Menschen richtig aus?" nicht ersetzen — genau das ist die Klasse, an der die
unsichtbare Jahreszeit vorbeiging (Bild veränderte sich zu 91,6 %, aber falsch).
Wo es übertragbar wäre: bei **textlichen** Prüfungen (Doku-Konsistenz,
Spec-Treue), und dort ist unser Vier-Augen-Prinzip bereits die stärkere Form.

**R10 — Kostenrahmen für Eval-Harnesses: „Sampling, Caching und gestufte Ausführung von Anfang an einplanen."**
Quelle: *AI Agent Evals 2026: Build an Eval Harness*,
https://igotasite4that.com/blog/ai-agent-evaluation-harness-2026/
(abgerufen 09.08.2026).
**Urteil: HYPOTHESE; bei uns bereits umgesetzt** — die Zwei-Stufen-Struktur
(SMALL/LARGE, `scripts/verify/tiers.mjs`) *ist* gestufte Ausführung. Kein neuer
Hebel, aber eine Bestätigung, dass die vorhandene Struktur der Stand des Feldes
ist.

**R11 — Anbieter-Fakten, gegen die die Gewichtung geprüft wurde.**
Quelle: Anthropic-Plattformdokumentation über die `claude-api`-Skill,
Modelltabelle Stand 24.06.2026 (Opus 5: $5/M Input, $25/M Output), Abschnitt
*Prompt Caching* (Read ≈ 0,1×, Write 1,25× bei 5-Min-TTL / 2× bei 1-h-TTL,
Mindest-Präfix 512 Tokens auf Opus 5) und *Vision* (⌈b/28⌉×⌈h/28⌉ visuelle
Tokens je Bild).
**Urteil: BEFUND.** Er validiert `COST_WEIGHTS` exakt (§0.4) und liefert
gleichzeitig den einzigen bekannten Fehlerbalken der Gewichtung (TTL-Wahl,
bis +10 % auf die Gesamtsumme).

---

## 4. Übergabe-Prompt für andere Modelle (Entwurf A)

> Zum wörtlichen Weitergeben. Er ist absichtlich lang: sein Zweck ist, dass ein
> fremdes Modell **nicht zurückgibt, was wir letzten Monat schon verworfen
> haben**.

---

**PROMPT — ANFANG**

Du bekommst ein reales Software-Repository mit einer vollautomatisierten,
agentischen Bau- und Prüf-Pipeline (Spiel-Remake in TypeScript/React/three.js;
mehrere KI-Agenten arbeiten parallel in git-Worktrees, eine Hauptsitzung
orchestriert, merged und prüft). Ich suche **Maßnahmen, die einen Arbeitsauftrag
(„Punkt") billiger und schneller machen.**

**ZWEI ACHSEN, DIE NIE ZU EINER ZAHL VERSCHMOLZEN WERDEN:**
- **Achse A — Wall-Clock pro Punkt** (vom Brief bis zum Merge).
- **Achse B — Tokens pro Punkt** (Hauptsitzung UND Subagenten zusammen).

Sie handeln gegeneinander: ein breiterer Fan-out kauft Zeit mit Tokens, ein
knapperer Brief spart beides. **Jeder deiner Vorschläge muss nennen: welche Achse
er bewegt, WIE STARK (gegen die unten stehenden Zahlen; wenn deine Schätzung grob
ist, schreib das hin), WAS ER AUF DER ANDEREN ACHSE KOSTET, und sein RISIKO für
die Korrektheit der Arbeit.** Ein Vorschlag ohne diese vier Angaben ist unbrauchbar.

**DIE GEMESSENE BASISLINIE** (Fenster 03.–09.08.2026, 261 Transkripte, 32.264
API-Antworten, 63 fertige Punkte; Werkzeug: `scripts/measure-task-cost.mjs`,
Gewichtung Input 1 / Cache-Write 1,25 / Cache-Read 0,1 / Output 5 — das ist die
tatsächliche Preisrelation, keine Konvention):

- **Verteilung der Tokens auf Phasen:** Verifikation 43,1 %, Buchführung 26,7 %,
  Implementierung 16,0 %, Gates 11,6 %, Merge 1,2 %, Brief 0,5 %.
- **Verteilung der Maschinenzeit:** Buchführung 38,3 %, Verifikation 31,5 %,
  Implementierung 13,1 %, Gates 12,8 %.
- **78,7 % der gewichteten Ausgabe ist wieder-gelesener Kontext; nur 4,5 % ist
  das, was das Modell schreibt.** 98,2 % der rohen Tokens sind Cache-Reads — der
  Prompt-Cache ist also bereits nahezu ausgereizt.
- **Pro Punkt:** Median 4,75 M gewichtet / 189 API-Antworten / 1,39
  Maschinenstunden; p90 16–20 M; Maximum 101,8 M. **10 von 63 Punkten tragen die
  Hälfte der Kosten.**
- **Pro Antwort:** Median 190 k Kontext, 120 Output-Tokens, 22 k gewichtete
  Kosten, 6,2 s Median- / 24,4 s Mittel-Abstand. Daraus die Grundgleichung:
  *Kosten ≈ Antworten × Kontext × 0,1* und *Zeit ≈ Antworten × 24 s*. **Eine
  gesparte Antwort spart ~22 k Tokens UND ~24 s.**
- **Fixer Sockel je Punkt ≈ 4,5 M gewichtet** (Orchestrierung + Board + Brief +
  Merge) — die Größenordnung eines ganzen Median-Punktes.
- **Der Kontext wächst ~1 k je Antwort** von 44 k (erster Turn: System-Prompt +
  Regeldokument + Werkzeugschemata) bis zu einem Plateau bei ~330 k.
- **Werkzeug-Taxonomie:** 80 % aller Werkzeugaufrufe sind Shell-Kommandos. Davon
  entfallen auf die Gesamtausgabe: Suchen/Lesen **29,9 %**, Warten/Pollen
  **11,0 %**, Buchführungs-Skripte 7,9 %, Gates 4,4 %, Leerlauf-Halter (`echo
  idle`) **3,8 %**. **Nur 4,9 % der Antworten setzen mehr als einen
  Werkzeugaufruf ab.** 15,8 % der Ausgabe geht für exakt wiederholte Kommandos
  drauf.
- **Kalenderuhr (git):** erster Branch-Commit → Merge, Median 0,75 h, p90 4,65 h,
  Maximum 86,5 h.

**NICHT VERHANDELBARE RANDBEDINGUNGEN.** Ein Vorschlag, der eine davon verletzt,
ist außerhalb des Rahmens — schlage ihn nicht vor:

1. **Die Verifikations-Disziplin bleibt.** Jedes Feature bekommt einen Test auf
   der passenden Schicht (schnelle Unit-Schicht ohne Browser; echte
   Browser-Suiten nur für Szene, Geometrie, Layout, Audio, Screenshots).
   Render-/GUI-Änderungen werden **am gerenderten Bild** beurteilt, und zwar auf
   **beiden** Grafik-Backends (WebGPU und WebGL 2), wo sie verschieden zeichnen
   können. Kein grüner Haken gegen einen angenommenen Stellvertreter (kein
   „Radius statt Projektion", kein „Flag statt Pixel").
2. **Kein Golden-Image-Gate, bevor die Aufnahme nachweislich stabil ist.** Wurde
   gemessen: zwei Läufe **derselben** Suite auf **identischem** Code bewegen
   10,9–98,6 % der Pixel; der kleinste echte Defekt bewegte 0,75 %. Jede
   Diff-basierte Abkürzung ist damit tot, bis der Rauschboden unter 0,75 % liegt.
3. **Das Vier-Augen-Prinzip bleibt**, in zwei Modi: ein **divergenter** Schritt
   (was könnte man tun, was könnte schiefgehen) läuft **blind parallel** — zwei
   Modelle erarbeiten unabhängig je eine vollständige Liste, danach werden sie
   bedeutungsgleich vereinigt; ein **konvergenter** Schritt (ist dieser Diff
   korrekt, ist diese Messung solide) bleibt ein Review, bei dem der Prüfer das
   Artefakt vor der Begründung liest.
4. **Die Modell-Allowlist bleibt.** Nur drei Modelle dürfen hier arbeiten.
   Arbeit auf ein billigeres, schwächeres Modell zu routen ist **verboten** und
   ist kein Vorschlag — eine Kaskade, ein Router, ein „billiger Executor" fällt
   damit weg.
5. **Nichts darf schwächen, was die Sicherungsschicht fängt.** Es gibt eine
   Kette von Guards (Zug-Ende-Hooks, PreToolUse-Sperren, git-Hooks), die
   verhindern, dass ein Zug endet, während der Zustand einer stehenden Regel
   widerspricht. Einen Guard **billiger** zu machen ist erlaubt; das, was er
   fängt, zu entfernen, nicht.
6. **Das Designdokument ist die Autorität über den Spielinhalt und wird nie
   geändert, um Aufwand zu sparen.**

**WAS SCHON VERSUCHT WURDE — gib das nicht zurück:**

- **Der Auftrags-Brief statt Leseauftrag.** Ein Generator stellt jedem
  delegierten Agenten seine Spezifikation wörtlich zu (~2 k Tokens) statt ihn die
  Dokumente lesen zu lassen (~134 k). Die Phase „Brief" kostet seitdem 0,5 % der
  Gesamtausgabe. **Erledigt.**
- **Kontextgrenze an der Punktgrenze.** Eine Sitzung endet, wenn ein Punkt fertig
  ist; ein Nachfolger startet frisch und orientiert sich für ~600 Tokens aus git.
  **Erledigt** — offen ist, ob dieselbe Grenze auch *innerhalb* eines Punktes
  gezogen werden sollte.
- **Der Arbeitsauftrag ist geteilt** (offene Punkte / Archiv), das Regeldokument
  wurde von 61 k auf 45 k Zeichen geschnitten, beide haben gemessene
  Obergrenzen. **Erledigt und ausgereizt.**
- **Die Ausgabe eines Prüflaufs wird zusammengefasst**, statt roh in den Kontext
  zu fließen (gemessen 30.542 → 3.782 Zeichen bei einem roten Lauf, jeder
  fehlgeschlagene Test weiterhin namentlich). **Erledigt.**
- **Zwei Prüfstufen** (kleiner Alltags-Riegel / große Vollregression) statt einer.
  **Erledigt.**
- **Ein Bild-Verifikations-Wächter**, der die Bildprüfung nur dort verlangt, wo
  sie greifen kann (reine DOM-Änderungen: ein Backend statt zwei; die
  Vorschlags-Suite richtet sich nach den geänderten Pfaden). **Erledigt.**
- **Verworfen nach Messung** (bitte nicht neu vorschlagen, außer du kannst
  begründen, warum das Urteil nicht mehr gilt): Golden-Image-Vorfilter;
  Cross-Backend-Diff; diff-abgeleiteter Bildzuschnitt; perzeptuelle Metrik;
  Herunterskalieren; Kontaktbogen; Bytes sparen (Graustufen, Kompression,
  Dedup); Frames weglassen; die teure Suite aufteilen; eine allgemeine
  Pfad→Suite-Kopplungskarte. Grund in fast allen Fällen: der Rauschboden der
  Aufnahme (siehe Randbedingung 2), oder die Arithmetik (die Token-Kosten eines
  Screenshots hängen **allein** an seinen Pixelmaßen, über eine 24-fache
  Byte-Spanne identisch).
- **Geprüft und nicht verfügbar:** eine harte Token-Obergrenze je Aufgabe über
  die Werkzeug-Ebene; entfernte Ausführung; ein Workflow-Resume. Wenn dein
  Vorschlag eine dieser Fähigkeiten voraussetzt, sag das ausdrücklich dazu.
- **Bereits eingelöst:** Prompt-Caching (98,2 % der rohen Tokens sind
  Cache-Reads). Vorschläge der Art „nutzt doch Prompt-Caching" laufen ins Leere.

**WAS ICH VON DIR WILL:**

1. Eine **vollständige** Liste von Maßnahmen, gruppiert nach der Phase, die sie
   angreifen. Vollständigkeit ist wichtiger als Rangfolge — eine ungewöhnliche
   Idee lässt du **nicht** weg, weil sie ungewöhnlich ist.
2. Je Maßnahme: **Achse · quantifizierte Wirkung gegen die Basislinie ·
   Gegenkosten auf der anderen Achse · Risiko für die Korrektheit · was wahr sein
   müsste, damit sie hier wirkt.**
3. Eine Liste der Maßnahmen, die du **erwogen und verworfen** hast, mit
   Begründung. Eine Verwerfung ist ein Ergebnis.
4. Wenn du eine externe Quelle benutzt: **nenne sie (Titel + URL + Datum) und
   beurteile sie gegen die obigen Zahlen, bevor sie ein Vorschlag wird.** Ein
   Benchmark aus einem anderen Aufbau ist hier eine **Hypothese**, kein Befund —
   markiere jede so.
5. Wo du eine Zahl brauchst, die oben fehlt: **nenne das Kommando bzw. die
   Messung, die sie liefern würde**, statt zu raten.

**PROMPT — ENDE**

---

## 5. Was diese Liste NICHT geleistet hat

Damit die Union weiß, wo sie nachfassen muss:

- **Die Kalenderachse ist schwach belegt.** Ich kann sagen, dass eine gesparte
  Antwort ~24 s spart, und dass der p90 bei 4,65 h liegt. Ich kann **nicht**
  sagen, wie viel davon Bauen, Prüfen oder Warten auf den serialisierten Merge
  ist (G3 ist die dafür nötige Messung). Alle Achse-A-Zahlen oben sind
  entsprechend vorsichtig.
- **Die Wirkungsschätzungen sind nicht additiv.** B1 (Fensterschnitt) und B3
  (kürzere Ausgaben) addieren sich; C1 (Bündeln) und A1 (nicht pollen)
  überschneiden sich teilweise, weil eine Poll-Antwort auch eine gebündelte sein
  könnte. Die Summe aller Prozentangaben ist **kein** erreichbarer Wert.
- **Ich habe die Kosten der Maßnahmen selbst nicht beziffert.** Jede gebaute
  Mechanik ist ein Punkt mit eigenem 4,5-M-Sockel plus Vier-Augen-Review, wo sie
  einen Guard berührt. Eine Maßnahme, die 1 % spart, kostet in der Umsetzung
  leicht mehr als sie im Fenster einbringt — die Rangfolge muss das gegenrechnen,
  und das ist ausdrücklich Aufgabe des nächsten Schritts, nicht dieses.
