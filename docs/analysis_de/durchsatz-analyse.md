# Durchsatz-Analyse: Bearbeitungszeit und Token-Verbrauch pro Task

Arbeitsauftrag-Punkt 572. Zwei Achsen, die nie zu einer Zahl verschmolzen
werden: **Achse A — Wall-Clock pro Task** (wie lange ein Punkt vom Brief bis
zum Merge braucht) und **Achse B — Tokens pro Task**. Sie handeln
gegeneinander — ein breiterer Fan-out kauft Zeit mit Tokens, ein knapperer
Brief spart beides.

Das Dokument ist **vollständig**: §1 die gemessene Basislinie, §2 die
Plausibilitätsprüfung gegen die schon veröffentlichten Anker, §3 die
**vereinigte** Maßnahmenliste (nach gemessener Wirkung geordnet), §4 was wir
ausdrücklich nicht tun sollten, §5 der Übergabe-Prompt für andere Modelle, §6
die Vorschläge, die Arbeitsauftrag-Punkte werden sollten.

Die Vereinigung in §3/§4 entstand nach CLAUDE.md §6: „Welche Maßnahmen könnte
man ergreifen?" ist ein **divergenter** Schritt und lief **blind parallel** —
Opus 5 und Fable 5 haben aus derselben Messung heraus je eine eigene,
vollständige Liste geschrieben, ohne die des anderen zu sehen. Beide Hälften
sind hier bedeutungsgleich vereinigt; **jeder Eintrag ist markiert, ob beide
Hälften ihn hatten oder nur eine** — diese Markierung ist der ganze Ertrag des
Verfahrens. Die Rohfassungen der beiden Hälften sind in der Git-Historie
erhalten (`docs/analysis_de/_572-ideen-a.md`, `_572-ideen-b.md`, entfernt im
Vereinigungs-Commit).

---

## 1. Die gemessene Basislinie

### 1.0 Eine Korrektur an der ersten Fassung dieser Messung — bitte zuerst lesen

Die erste Fassung von §1 (Commit `ddef1d66`) hatte einen **Messfehler**, den
die Prüfung der Opus-Hälfte gefunden hat. Er ist behoben, alle Zahlen unten
sind neu erhoben, und weil die beiden Ideenlisten gegen die **alten** Zahlen
geschrieben wurden, steht hier zuerst, was sich bewegt hat.

**Der Fehler.** Eine API-Antwort wird im Transkript auf **mehrere Zeilen mit
derselben `message.id`** verteilt — eine je Inhaltsblock (`thinking`, `text`,
`tool_use`, `tool_use`), und jede Zeile wiederholt dieselbe `usage`. Die
Deduplizierung nach `message.id` behielt die **erste** Zeile. Für die
Token-Summen ist das richtig (die `usage` darf nur einmal zählen), für alles
andere war es falsch: begann eine Antwort mit Denken — der Normalfall —, ging
ihr Werkzeugaufruf verloren.

**Die Behebung.** `foldResponseLines()` in
`scripts/measure-task-cost-core.mjs` faltet die Zeilen einer Antwort zu **einem**
Turn: `usage` und Kennfelder aus der ersten Zeile, frühester Zeitstempel, und
die **Vereinigung** der Werkzeugaufrufe, dedupliziert über die Block-`id`. Der
Fall ist im Unit-Test festgenagelt (`measure-task-cost-core.test.mjs`,
`describe('foldResponseLines')`): eine mehrzeilige Antwort, deren Werkzeugaufruf
auf der zweiten Zeile sitzt, **muss** gesehen werden.

**Was sich dadurch bewegt hat:**

| Größe | alte Fassung | korrigiert |
| --- | ---: | ---: |
| Antworten mit ≥ 1 Werkzeugaufruf | 25,6 % | **97,4 %** |
| Antworten mit einem Aufruf, den der Klassifikator **als Phasen-Evidenz** liest | 25,6 % | **48,4 %** (43,1 % der Kosten) |
| nach der Füllung offen (`unattributed`) | 0,9 % | **0,1 %** |
| Antworten mit **mehr als einem** Werkzeugaufruf | „kein einziger" | **1.596 = 4,9 %** |
| `verification` (gewichtet) | 43,1 % | **47,6 %** |
| `bookkeeping` (gewichtet) | 26,7 % | 26,2 % |
| `implementation` / `gates` | 16,0 % / 11,6 % | 13,2 % / 9,5 % |
| `brief` | 0,5 % | **1,9 %** |
| Maschinenstunden `verification` | 31,5 % | **37,5 %** (gleichauf mit `bookkeeping`) |
| Median-Punkt gewichtet | 5,01 M | **5,69 M** |

**Hat sich die Rangfolge der Phasen bewegt?** An der Spitze **nein**:
`verification` und `bookkeeping` bleiben die beiden großen Posten und haben
zusammen 73,8 % der Tokens (vorher 69,8 %). Drei Dinge haben sich aber
verschoben, und sie treffen Vorschläge beider Hälften:

1. **`verification` ist größer als gedacht** — auf der Token-Achse (43,1 →
   47,6 %) und besonders auf der Zeitachse (31,5 → 37,5 %, jetzt gleichauf mit
   der Buchführung statt sieben Punkte dahinter). Jeder Verifikations-Vorschlag
   beider Hälften **gewinnt** dadurch, keiner verliert.
2. **`brief` ist viermal so groß wie behauptet** (0,5 → 1,9 %; Median 103 k je
   Punkt statt 0,00 M). Beide Hälften haben die weitere Brief-Arbeit mit
   *genau* dieser 0,5-%-Zahl verworfen (A-V12, B-R10, B-R15). Diese Verwerfungen
   bleiben im Ergebnis stehen — 1,9 % ist immer noch klein —, aber ihre
   Begründung ist neu zu schreiben, und sie ist jetzt eine Abwägung statt einer
   Selbstverständlichkeit (§4).
3. **Der Satz „kein einziger Turn setzt mehr als einen Werkzeugaufruf ab" war
   ein Artefakt.** 4,9 % tun es. Das entscheidet einen **Widerspruch zwischen
   den beiden Hälften** (Opus maß 4,9 %, Fable zitierte die 0 aus der alten
   Basislinie und nannte sie „die härteste Einzelzahl"): die Maßnahme
   „unabhängige Aufrufe bündeln" bleibt richtig und groß, aber ihr Nenner ist
   95,1 %, nicht 100 %.

**Was sich NICHT bewegt hat:** die Token-Summen (6.790 M roh / 847,6 M
gewichtet), die Zähler-Anteile (78,7 % Cache-Read), die Streuung über die
Punkte, der Sockel und beide Uhren. Der Fehler saß allein in der
**Phasen-Zuordnung**, und dort in die vertrauensbildende Richtung: die
Verteilung ruht auf doppelt so viel Evidenz wie die alte Fassung zugab.

### 1.1 Woher die Zahlen kommen

| Quelle | Was daraus kommt |
| --- | --- |
| `~/.claude/projects/-workspace-hoa/` — 262 Transkripte (91 Hauptsitzungen + 171 delegierte Agenten) | Tokens und Maschinenstunden pro Antwort, pro Phase, pro Punkt |
| `scripts/measure-task-cost.mjs` (+ `-core.mjs`, Vitest-gedeckt) | die Phasen-Zuordnung selbst; `--json` gibt jede Zahl unten aus |
| `scripts/measure-context-cost-core.mjs` | Gewichtung (`COST_WEIGHTS`) und Leerlauf-Regel (30 min) — **unverändert übernommen**, damit beide Werkzeuge nicht verschieden rechnen |
| `git log --first-parent main` (214 Merges seit 06.07.2026) | die Kalender-Uhr: erster Branch-Commit → Merge, und die Main-Commits danach |
| `docs/picture-check-cost.md`, `docs/picture-check-levers.md` | die bereits gemessenen Kosten der Bild-Prüfung — zitiert, nicht neu gemessen |

**Messfenster:** 03.08.2026 11:01 UTC – 09.08.2026 11:18 UTC, also 6,01 Tage,
**32.531 API-Antworten**, **64 nach `main` gemergte Punkte**. Ältere
Transkripte hält die Maschine nicht mehr vor — das ist die härteste Grenze
dieser Messung (§1.8).

**Die Phasen** und woran der Klassifikator sie erkennt (Regeln vollständig in
`scripts/measure-task-cost-core.mjs`, `BASH_RULES` / `FILE_RULES`):

| Phase | Evidenz im Transkript |
| --- | --- |
| `brief` | `point-brief.mjs`; **Lesen** von TASKS.md / design.md / CLAUDE.md / den Kriterien-Dateien |
| `implementation` | Edits unter `src/`, `scripts/`, `docs/`; `git commit` / `add` / `push` |
| `gates` | `npm run build` / `lint` / `test:unit`, `vitest`, `tsc`, `oxlint`, `npm audit` |
| `verification` | `scripts/verify/*`, `npm test`, `test:small` / `test:large`, `VERIFY_GL=…`, `render-verify`, `picture-*`, Frames unter `verification/` |
| `merge` | `git merge`, `worktree-cleanup.mjs`, Branch-Abbau |
| `bookkeeping` | Board, Focus, Queue, `batch-*`, die Guards, TASKS-Pflege — und die Delegations-Aufrufe selbst |
| `unattributed` | der Turn hat **keinen** erkannten Werkzeugaufruf abgesetzt — bleibt offen, wird nicht geraten |

Ein Punkt („Task") ist der Git-Branch: `feat/<N>-<slug>` → Punkt N. 63,1 % der
gewichteten Kosten ordnet der Branch des Turns selbst zu, 10,0 % das Transkript
des delegierten Agenten (ein Agenten-Transkript **ist** ein Punkt), 26,9 %
gehören zu keinem Branch — das ist die Hauptsitzung (§1.6).

### 1.2 Was hier ein „Token" ist

| Zähler | roh | Anteil roh | Anteil **gewichtet** |
| --- | ---: | ---: | ---: |
| `cache_read` | 6.668,7 M | 98,2 % | **78,7 %** |
| `cache_creation` | 113,8 M | 1,7 % | 16,8 % |
| `output` | 7,6 M | 0,1 % | **4,5 %** |
| `input` | 0,1 M | 0,0 % | 0,0 % |
| **Summe** | **6.790 M** | | **847,6 M gewichtet** |

Die gewichtete Zahl ist das **Proxy** aus `COST_WEIGHTS` (Cache-Read 0,1 ·
Cache-Write 1,25 · Output 5 relativ zu einem Input-Token), keine Rechnung. Sie
ist **linear** im Turn, weshalb sie sich auf Phasen aufteilen lässt, ohne dass
die Aufteilung eine andere Operation wäre als auf den rohen Zählern. Gegen die
veröffentlichten Preise geprüft ist sie **exakt** die reale Preisrelation
(§2f).

Die Zeile, die alles Weitere rahmt: **rund vier Fünftel der gewichteten
Ausgabe ist wieder-gelesener Kontext, 4,5 % ist das, was das Modell
schreibt.**

### 1.3 Wohin die Tokens gehen — pro Phase

| Phase | gewichtet | Anteil | roh | Anteil **strikt** |
| --- | ---: | ---: | ---: | ---: |
| `verification` | 403,0 M | **47,6 %** | 3.294 M | 29,6 % |
| `bookkeeping` | 221,7 M | **26,2 %** | 1.701 M | 37,1 % |
| `implementation` | 111,9 M | 13,2 % | 943 M | 18,0 % |
| `gates` | 80,5 M | 9,5 % | 670 M | 10,6 % |
| `brief` | 15,8 M | 1,9 % | 80 M | 2,4 % |
| `merge` | 13,6 M | 1,6 % | 107 M | 2,2 % |
| `unattributed` | 0,7 M | 0,1 % | 3 M | — |

Die Spalte **strikt** ist der Fehlerbalken, nicht eine zweite Meinung: sie
ordnet nur Turns zu, die selbst einen Werkzeugaufruf abgesetzt haben, den der
Klassifikator als Phasen-Evidenz liest (48,4 % der Antworten, 43,1 % der
Kosten), und zeigt deren Verteilung. Beide Lesarten stellen dieselben zwei
Phasen an die Spitze — `verification` und `bookkeeping` zusammen **73,8 %**
(gefüllt) bzw. **66,7 %** (strikt). Ihre Reihenfolge untereinander ist
weiterhin *nicht* robust: strikt liegt `bookkeeping` vorn, gefüllt
`verification`. Der Grund ist erklärbar — Buchführung setzt viele kurze Aufrufe
ab, eine Verifikation setzt einen Aufruf ab und wartet danach viele teure Turns
lang.

### 1.4 Wohin die Zeit geht — **zwei Uhren**

**Uhr 1 — Maschinenstunden** (aktive Antwort-zu-Antwort-Zeit, Lücken > 30 min
abgeschnitten; parallele Agenten zählen jeder für sich):

| Phase | Stunden | Anteil |
| --- | ---: | ---: |
| `bookkeeping` | 81,3 | **37,5 %** |
| `verification` | 81,3 | **37,5 %** |
| `implementation` | 25,1 | 11,6 % |
| `gates` | 20,8 | 9,6 % |
| `merge` | 4,7 | 2,2 % |
| `brief` | 2,5 | 1,2 % |
| `unattributed` | 1,1 | 0,5 % |
| **Summe** | **216,8** | |

**Uhr 2 — Kalenderstunden** (Git, erster Branch-Commit → Merge). Sie enthält
die Wartezeiten, die Uhr 1 wegwirft:

| | Median | p90 | Max | n |
| --- | ---: | ---: | ---: | ---: |
| ganze Historie seit 06.07. | 0,47 h | 4,26 h | 87,0 h | 214 Merges |
| nur das Messfenster | 0,75 h | 4,65 h | 86,5 h | 64 Merges |
| Commits pro Branch (Fenster) | 5 | 11 | 87 | 64 |
| Main-Commits **nach** einem Merge (Fenster) | 3 | 9 | 12 | 64 |

Der Median-Punkt ist in **unter einer Stunde** Kalenderzeit vom ersten
Branch-Commit bis zum Merge durch, während er **1,39 Maschinenstunden**
verbraucht (§1.7) — weil in dieser Stunde bis zu drei Agenten parallel laufen.
Der p90 von 4,65 h zeigt, dass der Ausläufer die Kalenderzeit weit stärker
streckt als der Median vermuten lässt.

### 1.5 Hauptsitzung gegen Subagenten

| Scope | gewichtet | Anteil | Maschinen-h |
| --- | ---: | ---: | ---: |
| delegierte Agenten (171 Transkripte) | 585,6 M | **69,1 %** | 108,5 |
| Hauptsitzungen (91 Transkripte) | 262,6 M | **30,9 %** | 108,5 |

Die beiden verbrauchen **exakt gleich viel Zeit**, aber die Agenten verbrauchen
**mehr als doppelt so viele Tokens**. Ihre inneren Verteilungen sind fast
gegensätzlich:

| Phase | in den Agenten | in der Hauptsitzung |
| --- | ---: | ---: |
| `verification` | **61,3 %** | 17,0 % |
| `implementation` | 14,3 % | 10,8 % |
| `gates` | 12,0 % | 4,0 % |
| `bookkeeping` | 10,0 % | **62,2 %** |
| `merge` | 0,5 % | 4,0 % |
| `brief` | 1,8 % | 2,0 % |

Das ist genau die Arbeitsteilung, die CLAUDE.md §6 vorschreibt (die
Hauptsitzung delegiert und führt Buch, der Agent baut und prüft) — hier in
Zahlen. Pro Punkt gemessen liegt der Agenten-Anteil im Median bei **88,2 %**
der Kosten (p25 78,0 %, Minimum 41,4 %).

### 1.6 Wie viel Aufwand pro Task fix ist

Zwei getrennt gemessene Größen, und beide sind **nicht** dasselbe:

1. **Was in der Hauptsitzung zu keinem Branch gehört:** 228,1 M gewichtet
   (26,9 % der Gesamtausgabe). Verteilt auf die 64 Merges des Fensters sind das
   **3,56 M gewichtet je gemergtem Punkt** — ein *amortisierter* Wert, keine
   Messung pro Task: Orchestrierung, Board, Queue und Chat-Betrieb zerfallen
   nicht in Punkte.
2. **Was innerhalb eines Punktes größenunabhängig aussieht** (`brief` +
   `merge` + `bookkeeping` im Branch): Median **1,32 M**, p90 4,72 M,
   Max 8,13 M gewichtet.

Zusammen liegt der Sockel bei rund **4,9 M gewichtet je Punkt**, gegen einen
Median-Punkt von 5,69 M (§1.7). Das ist die belastbarste Einzelaussage der
Messung — **der Sockel hat die Größenordnung eines ganzen Median-Punktes** —
mit einem Fehlerbalken: der amortisierte Anteil aus (1) ist ein
Fenster-Durchschnitt, und ein Fenster mit mehr Chat-Betrieb verschiebt ihn.

**Diese Zahl ist zugleich der Preis jeder Maßnahme in §3:** wer einen
Mechanismus baut, eröffnet einen Punkt und zahlt diesen Sockel. Das Fenster
umfasst 847,6 M, also ist **1 % des Fensters = 8,5 M ≈ 1,7 Sockel**. Eine
gebaute Maßnahme, die weniger als **≈ 0,6 % des Fensters** spart, verdient
ihren Bau erst nach mehr als einem Fenster zurück; eine, die einen Guard
berührt, kostet wegen Vier-Augen und Mechanismus-Review grob das Doppelte.
Maßnahmen, die **reine Disziplin** sind (eine Zeile im Delegations-Prompt),
kosten diesen Sockel nicht und lohnen in jeder Größe.

### 1.7 Die Streuung — Median **und** Ausläufer

64 Punkte im Fenster über der Schwelle von 200 k gewichtet (darunter sind es
Transkript-Fragmente, keine Punkte; die Schwelle steht in `--min-weighted`):

| Größe | Min | p25 | **Median** | p75 | p90 | **Max** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| gewichtet | 0,40 M | 2,85 M | **5,69 M** | 13,07 M | 20,35 M | **101,76 M** |
| roh | 2,4 M | 19,4 M | 45,8 M | 92,1 M | 149,5 M | 979,7 M |
| Output-Tokens | 2 k | 23 k | 48 k | 82 k | 122 k | 213 k |
| Maschinenstunden | 0,07 | 0,67 | **1,39** | 2,85 | 5,20 | **9,58** |

**Das Geld liegt im Ausläufer.** Der teuerste Punkt allein (342,
Ctrl-Beschriftung der Akteure) trägt **16,4 %** der punktzugeordneten Kosten;
**10 von 64 Punkten tragen 50,2 %**; Mittelwert/Median = 1,70. Und die
Verifikation konzentriert sich dort noch stärker: **die zehn teuersten Punkte
halten 65,5 % aller punktzugeordneten Verifikations-Tokens.**

Die teuersten zwölf, mit ihrem Verifikations-Anteil:

| Punkt | gewichtet | Maschinen-h | davon `verification` |
| ---: | ---: | ---: | ---: |
| 342 | 101,8 M | 9,58 | 89,5 % |
| 549 | 33,8 M | 3,11 | 95,4 % |
| 479 | 28,1 M | 7,96 | 33,5 % |
| 418 | 25,4 M | 4,55 | 78,0 % |
| 485 | 24,1 M | 3,23 | 70,8 % |
| 482 | 20,8 M | 5,20 | 52,4 % |
| 323 | 20,4 M | 8,57 | 65,6 % |
| 483 | 19,9 M | 1,21 | 68,1 % |
| 475 | 18,3 M | 7,20 | 20,9 % |
| 524 | 18,2 M | 2,95 | 60,4 % |
| 493 | 17,2 M | 4,56 | 48,4 % |
| 546 | 15,5 M | 3,94 | 36,3 % |

Der Median-Punkt sieht ausgewogener aus — Anteile *innerhalb* eines Punktes,
Median über die 64: `verification` 32,8 %, `bookkeeping` 20,2 %,
`implementation` 19,7 %, `gates` 15,9 %, `brief` 1,4 %, `merge` 0,6 %. Der
Unterschied zwischen diesem Median-Profil und der Gesamtverteilung aus §1.3
(47,6 % Verifikation) ist selbst ein Befund: **die Verifikation dominiert nicht
den typischen Punkt, sondern den teuren.**

### 1.8 Die Grundgleichung — Antworten × Kontext

Die beiden Faktoren, aus denen fast jede Bezifferung in §3 folgt:

| Größe (Fenster) | Wert |
| --- | ---: |
| Antworten (dedupliziert, gefaltet) | 32.531 |
| Kontext je Antwort | Median **190 k**, p25 127 k, p75 270 k, p90 347 k |
| Output je Antwort | Median **119 Tokens**, p90 565 |
| gewichtete Kosten je Antwort | Median **21,9 k**, Mittel **26,1 k** |
| Sekunden zwischen zwei Antworten (< 30 min) | Median **6,2 s**, Mittel **24,4 s**, p90 27,3 s |
| Antworten je Punkt (branch-zugeordnet) | Median **238**, p75 417, p90 655, Max 2.438 |
| Boot-Sockel (Kontext der ersten Antwort) | Subagent **43,6 k**, Hauptsitzung **58,9 k** |
| Kontext je Antwort nach Scope | Subagent **208 k**, Hauptsitzung **164 k** |

Daraus zwei Rechenregeln, die im Folgenden benannt werden:

- **Regel 1 (Antworten).** Eine gesparte Antwort spart median **21,9 k
  gewichtet** und im Mittel **24,4 s Maschinenzeit**. Das ist der einzige
  Hebel, der auf **beiden** Achsen gleichzeitig zieht. Gegenprobe: 238
  Antworten × 24,4 s = 1,61 h gegen gemessene 1,39 Maschinenstunden, und 238 ×
  21,9 k = 5,2 M gegen gemessene 5,69 M — die Gleichung trägt.
- **Regel 2 (Dauerlast).** 1 k Tokens, die in **jeder** Antwort mitgelesen
  werden, kosten **3,25 M gewichtet je Fenster** (1 k × 0,1 × 32.531) bzw.
  **23,8 k je Median-Punkt**. Der Boot-Sockel eines Agenten (43,6 k) kostet
  damit **1,04 M je Punkt = 18 % eines Median-Punktes**, bevor eine einzige
  Projektdatei gelesen ist.

> **Aufgelöster Widerspruch zwischen den Hälften.** Opus bezifferte 1 k
> Dauerlast mit 1,2 M je Fenster, Fable mit 3,2 M. Beide rechneten richtig in
> ihrem Rahmen — Opus multiplizierte nur die **punktzugeordneten** Antworten
> (238 × 64), Fable alle Antworten des Fensters. Da die Hauptsitzung dieselbe
> Dauerlast in jeder ihrer Antworten mitzahlt, ist **Fables Zahl die für das
> Fenster richtige** und Opus' die für einen einzelnen Punkt. Beide stehen oben
> nebeneinander.

**Werkzeug-Taxonomie.** 33.318 Werkzeugaufrufe: Bash 26.665 (80,0 %), Edit
2.734, Read 2.448, Write 619, ToolSearch 187, Monitor 186, Agent 181,
TaskOutput 84, SendMessage 83, TaskStop 54, WebSearch 35, TodoWrite 23. **4,9 %
der Antworten setzen mehr als einen Aufruf ab** (1.596 Antworten, 3,8 % der
Kosten) — paralleles Werkzeugaufrufen ist fast ungenutzt.

Antworten nach Kommando-Klasse (die erste Bash-Regel gewinnt; die Klassen sind
grob, das Ordnungsverhältnis ist robust — eigene Nachmessung, nicht Teil der
Phasen-Zuordnung):

| Klasse | Antworten | Anteil an der **Gesamtausgabe** |
| --- | ---: | ---: |
| Suchen/Lesen (`grep`, `find`, `ls`, `wc`, `head`, `cat`, `sed`, `awk`, `node -e`, `jq`) | 7.835 | **25,2 %** |
| Nicht-Bash-Werkzeug (Edit/Read/Write/Agent/…) | 6.297 | 18,2 % |
| Buchführungs-Skripte (`board`, `focus`, `batch-*`, Guards, `tasks-*`) | 4.755 | 12,5 % |
| **Warten/Pollen** (`sleep`, `tail -f`, `ps`, `pgrep`, `--show`) | 2.798 | **11,1 %** |
| Verify-Suiten starten | 2.499 | 6,6 % |
| Gates (`build`/`lint`/`test:unit`/`audit`) | 1.782 | 4,7 % |
| Git-Lesen | 1.349 | 3,8 % |
| Git-Schreiben | 1.335 | 3,5 % |
| **Leerlauf-Halter** (blankes `echo idle` / `true`) | 1.189 | **3,8 %** |
| keine Werkzeugaufruf | 858 | 2,4 % |
| sonstige Shell | 395 | 1,1 % |
| `gh` | 162 | 0,4 % |

Quer dazu, und **unabhängig nachgerechnet** (die Opus-Hälfte hatte diesen
Befund gemeldet, er ist hier neu erhoben und **bestätigt**):

- **Warten + Leerlauf-Halten zusammen: 3.987 Antworten = 14,8 % der gesamten
  gewichteten Ausgabe (125,7 M).** Die Opus-Hälfte nannte 15,8 % über ein 48
  Minuten kürzeres Fenster; die Differenz ist Fensterwachstum, nicht Dissens.
  Die längste ununterbrochene Poll-Kette ist **437 Antworten = 11,5 M
  gewichtet ≈ zwei Median-Punkte, für nichts**; die nächsten sind 285, 271,
  135, 130, 91. **15 Ketten ≥ 10 tragen 1.482 Antworten = 5,2 % der
  Gesamtausgabe.** Zählt man auch Kommandos mit, die einen echten Aufruf
  *und* einen angehängten Leerlauf-Marker tragen, steigt die Klasse auf
  21,6 % — das ist die Obergrenze der Spanne, 14,8 % die harte Untergrenze.
- **Exakt wiederholte Shell-Kommandos in derselben Sitzung: 4.031 Antworten =
  15,8 % der Ausgabe.** Ein Teil davon ist legitim (`git status` nach einer
  Änderung liest absichtlich neu).

### 1.9 Fehlerbalken, und was nicht messbar war

- **Das Fenster ist 6 Tage lang.** Ältere Transkripte existieren auf dieser
  Maschine nicht mehr. Alles Punkt-bezogene gilt für die 64 Punkte dieser 6
  Tage; die Git-Uhr reicht weiter zurück (214 Merges seit 06.07.) und ist die
  einzige Größe hier mit längerem Horizont.
- **Der Füll-Fehlerbalken ist halbiert, aber nicht verschwunden.** 97,4 % der
  Antworten setzen einen Werkzeugaufruf ab, aber nur **48,4 %** setzen einen
  ab, den der Klassifikator als Phasen-Evidenz liest (43,1 % der Kosten):
  Shell-Plumbing (`grep`, `git status`, `cat`) bekommt bewusst **keine**
  Stimme. Die übrigen erben die Phase des nächstgelegenen Evidenz-Turns
  **derselben Sitzung** und nie über eine Leerlauf-Lücke hinweg; nach dem
  Füllen bleiben 0,1 % offen. Der Satz „der ganze Fehlerbalken verschwindet"
  aus der Opus-Hälfte ist also **zu stark** — er halbiert sich (22,8 % → 43,1 %
  der Kosten mit eigener Evidenz).
- **Die Proportional-Aufteilung eines Turns greift jetzt, aber selten:** 0,5 %
  der Kosten liegen auf Antworten, die mehrere Phasen berühren.
- **Bekannte Fehlklassifikationen, unkorrigiert:** ein `git push` nach einem
  Buchführungs-Commit auf `main` zählt als `implementation`.
- **Nicht messbar aus diesen Daten:** wie viel Wartezeit *innerhalb* der
  Verifikationsphase Rechenzeit und wie viel Modell-Arbeit ist (das Transkript
  datiert Turns, nicht Prozesse); wie viel eines evidenzfreien Turns Denken
  gegen Lesen ist; und die tatsächliche Rechnung in Euro — die Gewichtung ist
  ein Proxy (§2f).
- **Reproduzierbarkeit:** der Batch schreibt weiter, das Fenster wächst also
  mit jedem Lauf. Die Zahlen oben sind ein Schnappschuss vom 09.08.2026,
  11:18 UTC; `node scripts/measure-task-cost.mjs` liefert den jeweils aktuellen
  Stand, nicht exakt diese Werte.

---

## 2. Plausibilitätsprüfung gegen die bereits veröffentlichten Zahlen

Ein widersprochener Anker ist ein Befund, kein zu versteckender Fehler.

**a) „~1,8 k Tokens für den Brief gegen ~108 k für das Lesen der Dokumente"
(CLAUDE.md §6) — bestätigt, und der Gegenwert ist gewachsen.**
`node scripts/point-brief.mjs 572` liefert 8.546 Zeichen ≈ 2,1 k Tokens (Punkt
572 hat eine ungewöhnlich lange Spezifikation). Der Gegenwert dagegen ist
**veraltet**: heute ist TASKS.md 363.603 Zeichen und design.md 170.168, ein
vollständiges Lesen kostet also ≈ 89 k + 46 k ≈ **135 k Tokens statt der
zitierten ~108 k.** Ungenannt im Anker: `docs/tasks-archive.md` ist inzwischen
1,2 M Zeichen (≈ 297 k Tokens).
**Korrigiert gegenüber der ersten Fassung:** die Phase `brief` ist mit **1,9 %**
der Gesamtausgabe kein großer Posten, aber auch nicht mehr die 0,5 %, mit denen
beide Ideenlisten sie abgeräumt haben (§1.0, Punkt 2).

**b) Punkt 555: 61.117 → 44.995 Zeichen — bestätigt.** CLAUDE.md misst heute
45.543 Zeichen, also +548 (+1,2 %) Drift seit dem Schnitt. Der Schnitt hält.

**c) „87–94 % der Ausgabe über 150 k Kontext" — teilweise widerlegt, und der
Vergleich ist mit diesen Daten gar nicht sauber führbar.**
`node scripts/measure-context-cost.mjs` misst im Scope *nur Hauptsitzungen*
**67,8 %** nach der ersten Übergabe des Fensters (davor 82,4 %), im Scope
*inklusive Subagenten* aber **80,0 %** — und dort ist der Wert **gestiegen**
(davor 75,9 %). Zwei Dinge folgen: der Anker beschreibt ein Regime, das oben
nicht mehr gilt, und der Effekt der Punktgrenze ist im ehrlichen Gesamt-Scope
nicht sichtbar. Einschränkung: das „davor" liegt am 03./04.08. und **nicht** vor
der Einführung der Grenze — die alten Transkripte fehlen. Der saubere
Vorher-Nachher-Vergleich ist aus diesen Daten **nicht** herstellbar.

**d) „~3 M Tokens pro Workflow-Fan-out" — die Einheit ist unklar, und in jeder
Lesart ist die Zahl heute kein Ausnahmefall mehr.** Gewichtet kostet der
**Median**-Punkt 5,69 M und der p90-Punkt 20,35 M; roh kostet der Median-Punkt
45,8 M. In beiden Lesarten liegt ein gewöhnlicher Punkt heute über der Marke,
die damals einen großen Fan-out kennzeichnete.

**e) `docs/picture-check-cost.md`: „das teuerste Kontrollinstrument des
Projekts" — als Wall-Clock-Aussage bestätigt, als Token-Aussage widerlegt.**
Dort gemessen: ein LARGE-Lauf auf einem Backend braucht 2.536 s = 42,3 min und
schreibt 93 Frames; sie **anzusehen** kostet 150.289 Tokens, auf beiden Backends
294.096. Diese Messung zeigt: die Phase `verification` verbraucht **3.294 M
rohe** Tokens im Fenster. Selbst wenn jeder Frame jedes Laufs angesehen worden
wäre, läge das Ansehen bei einem Bruchteil eines Prozents davon. **Der Preis der
Bild-Prüfung liegt nicht im Ansehen der Bilder, sondern in der Schleife um den
Lauf herum** — Starten, Warten, Ausgaben lesen, nachfassen. Beide Aussagen
stehen nebeneinander: `picture-check-cost.md` misst die Wall-Clock und die
Frame-Tokens korrekt, `verification` als Phase ist ein Vielfaches davon.

**f) `COST_WEIGHTS` gegen die veröffentlichten Preise — bestätigt.** Input 1 ·
Cache-Write 1,25 · Cache-Read 0,1 · Output 5 ist exakt die veröffentlichte
Ökonomie (Opus 5: $5/M Input, $25/M Output → Faktor 5; Cache-Read ≈ 0,1×,
Cache-Write 1,25× bei 5-Minuten-TTL, 2× bei 1 Stunde). **Der Proxy ist keine
Konvention, sondern die Rechnung**, mit einem bekannten Fehlerbalken: bei
1-Stunden-TTL wäre der Cache-Write-Faktor 2,0 statt 1,25, was die Gesamtsumme um
bis zu +10 % verschöbe — die Rangfolge der Phasen aber nicht. Welche TTL die
Harness benutzt, ist von hier nicht messbar. (Beide Hälften haben diese Prüfung
unabhängig durchgeführt und kamen zum selben Ergebnis; Quellen in §5 der
jeweiligen Rohfassung, u. a. Anthropic-Plattformdoku Stand 24.06.2026, Flexera
„Prompt Caching breakdown" und DigitalApplied „Prompt Caching in 2026", beide
abgerufen 09.08.2026.)

---

## 3. Die vereinigten Maßnahmen, nach gemessener Wirkung geordnet

**Wie diese Liste zu lesen ist.**

- **Herkunft:** `[A+B]` = beide Hälften hatten die Maßnahme (unabhängig
  voneinander), `[nur A]` = nur Opus 5, `[nur B]` = nur Fable 5. Wo unklar war,
  ob eine Maßnahme die andere umfasst, stehen **beide**.
- **Zwei Achsen, nie addiert.** Jede Maßnahme nennt getrennt, was sie auf
  Achse A (Wall-Clock) und auf Achse B (Tokens) tut.
- **Baukosten gegengerechnet (§1.6).** Jede gebaute Maßnahme ist selbst ein
  Arbeitsauftrag-Punkt mit ~4,9 M Sockel ≈ 0,6 % des Fensters; mit
  Guard-Berührung grob das Doppelte. Die Spalte „Netto" sagt, ob sich der Bau
  **innerhalb eines Fensters** trägt.
- **Die Prozente sind nicht additiv.** Sie überschneiden sich (eine Poll-Antwort
  könnte auch eine gebündelte sein). Die Summe ist **kein** erreichbarer Wert.

### 3.1 Die Rangfolge

| # | Maßnahme | Herkunft | Achse B (Tokens) | Achse A (Wall-Clock) | Bau | Netto im Fenster |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Blockierend warten statt pollen | [A+B] | **−7 bis −9 %** (gemessen 11,1 % Poll) | neutral bis **+** | klein | **stark positiv** |
| 2 | Unabhängige Werkzeugaufrufe bündeln | [A+B] | **−4 bis −7 %** | **−4 bis −7 %** | **keiner** (Disziplin) | **stark positiv** |
| 3 | Leerlauf-Marker per Hook statt `echo idle` | [nur A] | **−3,8 %** (gemessen) | neutral | klein, Guard-nah | **positiv** |
| 4 | Fenstergrenze auch INNERHALB eines Punktes | [nur A] | **−35 bis −45 % je Punkt** (grob) | leicht − | mittel, Pilot nötig | positiv, **höchstes Risiko** |
| 5 | Verifikations-Leiter: billig iterieren, teuer einmal beweisen | [nur B] | −5 bis −15 % (grob, am Ausläufer) | **+** | klein (Regel) | **positiv** |
| 6 | Der Lande-Befehl: Buchführungsketten als EIN Kommando | [A+B] | −1,3 bis −1,9 % | **−** (serieller Engpass) | mittel | positiv |
| 7 | Ausläufer-Bremse (Sichtbarkeit, Iterations-Deckel, Vorhersage-Split) | [A+B] | −5 bis −16 % der punktzugeordneten Kosten | − bis + | mittel | positiv |
| 8 | Fail-fast auf den teuren Suiten | [A+B] | klein indirekt | **−10 bis −15 min je rotem Lauf** | klein | positiv |
| 9 | Dauerlast weiter senken (CLAUDE.md, Memory-Index) | [A+B] | **−0,4 % je 1 k** Tokens | leicht + | mittel, Nachzieh-Risiko | positiv ab ~2 k |
| 10 | Große Werkzeug-Ausgaben nie ungeschnitten in den Kontext | [nur A] | −3 bis −8 % (grob) | leicht − | klein (Disziplin + Wrapper) | positiv |
| 11 | Kontext-Quarantäne: Verifikationsschleife im frischen Agenten | [nur B] | zweistellig M am Ausläufer | − | mittel | positiv nur über Median |
| 12 | Verifikations- und Gate-Memo über Baum-Hash | [nur B] | 0,2–0,4 M je Punkt | + | mittel, Guard-nah | grenzwertig |
| 13 | Worktree-Bootstrap: `node_modules` teilen | [nur B] | klein | **1–3 min je Agent** | sehr klein | positiv |
| 14 | Wiederholte identische Abfragen abstellen | [nur A] | −3 bis −5 % (grob) | − | keiner (Disziplin) | positiv |
| 15 | Brief liefert Code-Orientierung (Pfadliste / Modul-Landkarte) | [A+B] | −2 % je Punkt | − | klein | positiv |
| 16 | Cache-Präfix- und TTL-Messung | [A+B] | unbeziffert (16,8 % Cache-Write ist der Topf) | keine | klein (Messung) | positiv als Messung |
| 17 | Guard-Vorabprüfung erweitern + Guard-Telemetrie | [A+B] | −1 bis −3 % (Ausläufer) | − | klein/mittel | positiv |
| 18 | Buchführung delegieren statt im 300-k-Kontext fahren | [nur A] | −4 bis −6 % (bedingt) | + | groß, Lease-Eingriff | offen |
| 19 | Projekteigene Abfragekommandos statt ad-hoc-`grep` | [nur A] | −3 bis −4 % (grob) | − | mittel, je Kommando | positiv, gestaffelt |
| 20 | Inkrementell in der inneren Schleife (Vitest `--changed`, `tsc`) | [A+B] | klein | **−3 % Maschinenzeit** | klein | positiv |
| 21 | Verwandte Punkte in einem Branch bündeln | [A+B] | −2,5 bis −3 M je Paar | + (späterer Merge) | **Regeländerung** | Nutzer-Entscheidung |
| 22 | Merge-Zug: ein Fast-Gate für mehrere Branches | [A+B] | klein | −2 bis −6 min je Zug | **Regeländerung** | Nutzer-Entscheidung |
| 23 | Kalenderuhr zerlegen + Stale-Branch-Alarm | [A+B] | keine | Vorarbeit für alles Achse-A | klein | Vorarbeit |
| 24 | Messung im Closing institutionalisieren | [nur B] | keine | keine | sehr klein | Vorarbeit |
| 25 | Deterministische Aufnahme (Freischalt-Investition) | [A+B] | heute 0, später groß | 0 | groß | **Wette**, s. §4 |
| 26 | Agent sieht seinen eigenen Verbrauch | [nur A] | unbeziffert | keine | klein | unsicher, s. §4 |
| 27 | Deterministische Buchführung in Hooks verlegen | [nur A] | −1,6 % (grob) | − | mittel, Guard-Eingriff | grenzwertig |
| 28 | `npm audit` nur bei Lock-Änderung | [nur A] | < 0,3 % | klein | trivial | nur **gebündelt** |
| 29 | Board-Publish nur bei Änderung | [nur B] | klein | klein | trivial | nur **gebündelt** |

### 3.2 Die Einträge im Einzelnen

Nur die Angaben, die die Tabelle nicht trägt: Gegenkosten, Risiko, und was wahr
sein müsste.

**1 — Blockierend warten statt pollen [A+B].** Gemessen 2.798 Poll-Antworten =
11,1 % der Gesamtausgabe (93,8 M), die längste Kette 437 Antworten = 11,5 M.
Ein LARGE-Lauf dauert 42,3 min; bei 30-s-Poll sind das ~84 Antworten × 21,9 k =
**1,84 M je Lauf**, ein Drittel eines Median-Punktes für einen Lauf, dessen
Ergebnis ein Wort ist. Ersatz: ein blockierender Aufruf (Bash-`timeout`, max.
600 s) oder `run_in_background` plus die Fertig-Benachrichtigung, die die
Harness liefert und die `docs/harness-primitives-evaluation.md` §5 bereits als
„ersetzt Log-Polling ganz" verbucht hat — die Messung zeigt, dass sie im Alltag
nicht benutzt wird.
*Gegenkosten Achse A:* keine, eher negativ (ein 30-s-Poll entdeckt das Ende im
Mittel 15 s zu spät).
*Risiko:* eine verschluckte Benachrichtigung lässt die Sitzung hängen — es
braucht einen Timeout-Backstop und einen zweiten Weg zum Ergebnis (die Logdatei
von `run-logged.mjs` liegt ohnehin vor).
*Voraussetzung:* für einen 42-min-Lauf reicht die 600-s-Grenze **nicht**, dort
muss die Benachrichtigung tragen.
*Untermaßnahmen, die keinen eigenen Bau brauchen:* das Poll-Intervall an die
**gemessene** Suite-Laufzeit koppeln (`picture-check-cost.md` §1 kennt sie:
`enrichments` 951 s, `flow` 140 s, `world` 73 s) — erster Poll nach 0,9 ×
Medianlaufzeit statt nach 30 s kürzt eine 84er-Kette auf 2–3 [nur A]; eine harte
Obergrenze „nach 5 Polls blockierend warten oder als hängend behandeln" kappt
den Ausläufer (15 Ketten ≥ 10 tragen 5,2 %) [nur A]; und eine **Prüfziffer im
Verify-Wrapper**, die Polls zählt und meldet, macht die Regel überhaupt erst
sichtbar, ohne einen neuen Blocker zu bauen [nur B]. Für die Gates gilt dasselbe
im Kleinen (1–3 min je Lauf, aber hohe Frequenz) [nur B].

**2 — Unabhängige Werkzeugaufrufe in EINEM Zug bündeln [A+B].** Gemessen setzen
nur **4,9 %** der Antworten mehr als einen Aufruf ab, während 80 % aller Aufrufe
Shell-Kommandos sind und Suchen/Lesen mit 25,2 % der Ausgabe der größte
Einzelposten ist. Würde nur die Hälfte der 7.835 Such-/Lese-Antworten zu
Zweierpaaren, fielen ~1.960 Antworten weg: **−5 bis −6 % auf beiden Achsen**,
ohne dass sonst irgendetwas geschieht.
*Gegenkosten:* keine — dieselbe Arbeit in weniger Runden.
*Risiko:* zwei Kommandos in einem Zug, die **doch** voneinander abhängen (ein
`git commit` und ein `git push` auf dessen Ergebnis), erzeugen einen falschen
Zustand. Regel: parallel nur, was **lesend** ist oder nachweislich unabhängig;
gebündelte Shell-Ketten dürfen den fehlschlagenden Schritt nicht verstecken.
*Voraussetzung und Schwäche, die beide Hälften nennen:* es ist **reine
Disziplin**, und Disziplin wirkt in diesem Projekt nachweislich schlecht
(Retrospektive §1: „erzwingen, nicht erinnern"). Ein Guard dafür ist praktisch
nicht baubar — „hätte gebündelt werden können" ist maschinell kaum entscheidbar.
Der realistische Weg ist ein Baustein im Delegations-Prompt **plus die
Nachmessung** (der Anteil der Mehrfach-Antworten ist mit
`measure-task-cost.mjs` messbar und heute 4,9 % — steigt er nicht, wirkt die
Maßnahme nicht).

**3 — Leerlauf-Marker per Hook statt `echo idle` [nur A].** 1.189 Antworten,
**3,8 % der Gesamtausgabe**, gemessen. Das Kommando existiert nur, weil ein
Guard „kein Leerlauf-Stopp" durchsetzt; es ist ein Modell-Zug, der nichts tut,
außer einen Zähler zu bedienen. Ein Marker, den ein **Hook** setzt, leistet
dasselbe.
*Risiko:* der Leerlauf-Guard darf nicht blind werden — er muss den Hook-Marker
genauso akzeptieren wie heute den Zug. `mechanism-review-guard` greift hier
ohnehin.

**4 — Fenstergrenze auch INNERHALB eines Punktes [nur A].** Heute ist die
Fenstergrenze an die Punktgrenze gekoppelt; ein Punkt läuft in **einem** Fenster,
und der Kontext wächst über seine 238 Median-Antworten von 44 k auf ~250 k
(Median über alle Antworten: 190 k). Schneidet man an jedem grünen, gepushten
Commit, liegt der mittlere Kontext bei rund 73 k statt 190 k: die
Cache-Read-Komponente (78,7 % der gewichteten Ausgabe) fiele grob auf ein
Drittel bis die Hälfte.
*Gegenkosten Achse A:* der Wiederaufsatz — `batch-resume-hook.mjs` orientiert
eine frische Sitzung für **~600 Tokens**, also 1–2 Antworten je Schnitt, gegen
60 gesparte Kontext-Wiederlesungen. Der Prompt-Cache geht beim Schnitt verloren
(einmal 44 k × 1,25 statt Read), amortisiert nach ~2 Antworten.
*Risiko:* **das größte dieser Liste.** Was der Agent gelernt und nicht
aufgeschrieben hat, ist weg. Gegenmittel: Schnitt **nur** an einem grünen,
gepushten Commit mit einer Übergabenotiz **im Branch**.
*Voraussetzung:* dass der Wiederaufsatz aus git + Notiz vollständig ist. Das ist
prüfbar — und **vor dem Ausrollen an EINEM Punkt zu messen**, nicht global.
*Nebenbefund aus der Recherche:* die „context rot"-Literatur (arXiv 2605.12366;
Redis; Morph, alle abgerufen 09.08.2026) legt nahe, dass der Schnitt auch eine
**Qualitäts**maßnahme wäre. **Hypothese, hier nicht gemessen** — messbar über die
Fehlerrate spät im Punkt gegen früh.

**5 — Verifikations-Leiter [nur B].** Während der Fix-Schleife eines
Render-Punkts läuft NUR die billigste abdeckende Suite auf EINEM Backend (der
WebGPU-Alltagsspur aus Punkt 571); der volle Beweis — beide Backends, ggf.
LARGE — läuft genau **einmal**, am Ende, auf dem Stand, der gemergt wird (was
die Merge-Regel ohnehin verlangt). Punkt 342 verbrannte 91,1 M in der
Verifikation; wären auch nur die Hälfte davon wiederholte teure Läufe, läge die
Ersparnis je Ausreißer-Punkt zweistellig in M. Grob, weil die Transkripte nicht
ausweisen, welcher Lauf Iteration und welcher Beweis war.
*Risiko:* gering — der finale Beweis bleibt unangetastet, nur die *Reihenfolge*
ändert sich. Die Disziplin „auf beiden Backends beweisen" wird nicht verdünnt.
*Voraussetzung:* als Regel formulieren (Brief-Baustein für Render-Punkte), sonst
bleibt es Zufall.

**6 — Der Lande-Befehl [A+B: A als „Board/Focus/Queue in einen Aufruf", B als
„die ganze Merge-Kette als ein Kommando"; hier vereinigt, weil dieselbe Sache in
zwei Größen].** Gemessen: 4.755 Buchführungs-Antworten = 12,5 % der Ausgabe;
die Kette Merge → Fast-Gate → Tick → Archiv → Board-Publish → Worktree-Cleanup
läuft heute als 8–12 einzelne Turns der Hauptsitzung bei deren vollem Kontext
(Median 164 k). Ein Skript, das die Kette deterministisch abarbeitet und **eine**
strukturierte Zusammenfassung druckt, macht daraus 2–3 Turns: 6–9 gesparte
Turns × ~26 k × 64 Merges ≈ **10–15 M ≈ 1,3–1,9 %**, und dieselbe Zeit im
seriellen Engpass.
*Risiko:* ein Sammelbefehl darf Zwischenfehler nicht verschlucken (Retrospektive
§3.38) — je Schritt lautes Scheitern, kein Weiterlaufen nach Rot. Erst alles
prüfen, dann alles schreiben. Mechanismus-Review nötig, da er Guard-nahe Abläufe
bündelt.

**7 — Die Ausläufer-Bremse [A+B, drei verschiedene Mechanismen, alle drei
behalten].** Das Ziel ist gemessen: **10 von 64 Punkten tragen 50,2 %** der
punktzugeordneten Kosten, die zehn teuersten halten **65,5 %** aller
Verifikations-Tokens, der teuerste allein 16,4 %.
- *(a) Sichtbarkeit* [nur A]: `measure-task-cost.mjs` kann je Branch messen; ein
  Hook meldet beim Überschreiten des 3-fachen Medians, und dann wird
  **entschieden**. Heute merkt niemand, dass ein Punkt 100 M kostet, bis er
  fertig ist. Deckelte man die zwölf teuersten auf p90, fielen 619 M auf ~520 M
  (−16 % der punktzugeordneten Kosten).
- *(b) Iterations-Deckel mit Eskalation* [nur B]: nach N (z. B. 3) roten
  Durchgängen derselben Browser-Suite STOPPT der Agent, schreibt eine Diagnose
  und eskaliert, statt weiterzuschleifen. *Gegenkosten Achse A:* die Eskalation
  fügt eine Übergabe ein. *Risiko:* der Deckel darf nie einen roten Zustand als
  grün durchlassen — er wandelt „weiter probieren" in „anders besetzt
  weiterarbeiten".
- *(c) Vorhersage-Split beim Einstellen* [nur B]: ein Punkt, dessen Spec Render
  + beide Backends + mehrere Systeme berührt, wird beim **Einstellen**
  geschnitten — aber nur, wenn er nach Einschätzung ≥ 3× Median (≥ ~17 M) wird,
  weil jeder Teilpunkt den Sockel von 4,9 M kostet.
*Gemeinsames Risiko (Retrospektive §3.33):* eine Ersparnis, die Nacharbeit
auslöst, ist keine. Ein teurer Punkt ist oft teuer, *weil* er schwer ist.
Deshalb **Warnung + Entscheidung, nie automatischer Abbruch.**

**8 — Fail-fast auf den teuren Suiten [A+B].** Gemessen: alle zehn
aufgezeichneten `enrichments`-Läufe dauerten 951–1029 s, **acht davon endeten
rot** und schrieben trotzdem alle 37 Frames; `flow` bricht dagegen bei einem
Fehler nach 60–90 s ab statt nach 130–156 s. Über zwei Tage waren das ≈ 2,1 h
rote Wall-Clock (`picture-check-levers.md`, Lever B-J). Dieser Hebel hat den
Replay **überlebt** und wurde nur zurückgestellt.
*Gegenkosten:* ein abgebrochener Lauf meldet nur den ersten Fehler — deshalb
fail-fast in der Iteration (passt zu 5), Volllauf für den finalen Beweis.
*Risiko:* gering; ein roter Lauf wird ohnehin nicht kreditiert.

**9 — Dauerlast weiter senken [A+B].** Nach Regel 2 spart jedes 1 k Tokens
weniger Dauerlast **3,25 M je Fenster** (0,38 %) und 23,8 k je Punkt. CLAUDE.md
ist 45.543 Zeichen ≈ 11 k Tokens, das globale CLAUDE.md und der Memory-Index
addieren ~5–8 k; zusammen sind das ~16–19 k Tokens in **jeder** Antwort **jeder**
Sitzung. Kandidaten: die Geschichtsprosa in §6 (Datumsanekdoten,
Begründungserzählungen) in ein `docs/`-Nachbardokument **verschieben** — nicht
umschreiben —, im Memory-Index Einträge zusammenlegen, deren Hook derselbe ist.
*Risiko:* Punkt 555 hat den großen Schnitt schon gemacht; ein zweiter trifft
Substanz. Retrospektive §3.30: teuer war nicht das Kürzen, sondern das Nachziehen
aller Leser — **der gefährlichste ist der, der nicht scheitert, sondern nur
nichts mehr findet.** Die Doc-Budgets müssen mitgesenkt werden, sonst füllt sich
der Platz zurück.
*Anmerkung [nur A]:* der lohnendere Teil des Sockels ist womöglich gar nicht
CLAUDE.md, sondern die **Werkzeug-Schemata**; `defer_loading` ist in dieser
Umgebung bereits aktiv, ob weitere Schemata verzögerbar sind, ist eine Frage an
die **Harness**, nicht an unseren Code.

**10 — Große Werkzeug-Ausgaben nie ungeschnitten in den Kontext [nur A].** Eine
10-k-Ausgabe in Antwort 20 eines Punktes wird in den restlichen 218 Antworten
mitgelesen: 10 k × 0,1 × 218 = **218 k gewichtet, so viel wie zehn Antworten.**
`scripts/verify/run-logged.mjs` tut das bereits für Verify-Läufe (gemessen
30.542 → 3.782 Zeichen). Auszuweiten auf `git diff` (immer `--stat` zuerst),
`grep` (immer `-c` oder `| head`), Datei-Reads (`offset`/`limit`), `npm ls`,
`gh run view`.
*Gegenkosten Achse A:* leicht negativ — eine zu knappe Ausgabe erzwingt einen
Nachschlag-Zug. Der Tausch lohnt bis zu einer Nachschlagquote von ~85 % (ein
Nachschlag kostet 21,9 k, eine gesparte 10-k-Ausgabe bringt bis zu 218 k).
*Risiko:* gering, **solange die Fehlerausgabe unbeschnitten bleibt** —
`run-logged` macht das bereits richtig.
*Feld-Bestätigung:* „regelbasiertes Beschneiden filtert Umgebungsrauschen,
**bevor** es in den Kontext gelangt" (TokenPilot, arXiv 2606.17016, abgerufen
09.08.2026) — **Hypothese** dort, bei uns durch `run-logged` bereits belegt.

**11 — Kontext-Quarantäne für die Verifikationsschleife [nur B].** Die teuren
Verifikations-Turns zahlen den ganzen Implementierungs-Verlauf mit (Punkt 342:
ø 401 k rohe Tokens je Turn). Läuft die Schleife stattdessen in einem
**frischen** Subagenten, der nur Brief, Diff-Zusammenfassung und Fehlerausgabe
hält (~50–60 k), sinkt der Cache-Read-Posten dieser Phase um den Faktor der
Kontextverkleinerung.
*Gegenkosten Achse A:* jede Übergabe Bauer → Prüfer → Bauer kostet eine
Schleife; bei kleinen Punkten frisst das die Ersparnis (lohnt erst deutlich über
dem Median).
*Risiko:* der Prüfer kennt die Baugeschichte nicht und kann eine Ausgabe
fehldeuten; ein roter Befund muss zurückwandern. Deshalb nur für die Schleife
**nach** der ersten grünen Vitest-Lage, nicht fürs Debugging selbst.
*Verhältnis zu 4:* beide schneiden den Kontext, an verschiedenen Stellen —
4 schneidet die **Sitzung** an einem git-Zustand, 11 lagert eine **Phase** aus.
Sie schließen einander nicht aus.

**12 — Verifikations- und Gate-Memo über Baum-Hash [nur B].** Ein grüner Lauf
wird mit (Suite, Backend, Hash der relevanten Pfade + Lockfile) verbucht; wird
derselbe Lauf ohne Hash-Änderung erneut verlangt (Doc-Edit, Merge ohne
Code-Konflikt), gilt das Memo. Median 764 k Gates je Punkt; ein bis zwei
vermiedene Wiederholungen ≈ 0,2–0,4 M je Punkt.
*Risiko, und der Grund für „grenzwertig":* **der Hash muss ALLES fassen, was das
Ergebnis beeinflussen kann.** Ein zu enger Hash ist ein grüner Haken gegen einen
falschen Proxy — genau die Falle, die die Verifikations-Disziplin verbietet.
Konservativ schneiden, Mechanismus-Review, und der finale Merge-Beweis bleibt
echt.

**13 — Worktree-Bootstrap [nur B].** Ein frischer Worktree hat kein
`node_modules`; jeder Agent installiert neu oder läuft in ein falsches Rot
(fehlendes `node_modules/.bin/oxlint`). Ein Bootstrap-Schritt (Symlink auf den
Haupt-`node_modules` oder `npm ci --prefer-offline`) macht jede Umgebung in
Sekunden gate-fähig: 1–3 min je Agent × ~64 Punkte ≈ 1–3 h Kalenderzeit je
Fenster, plus die Turns, die ein Agent heute fürs Einordnen des falschen Rots
zahlt. **Dieser Punkt hat sich beim Schreiben dieses Dokuments selbst bestätigt:
der Agent, der ihn schrieb, musste den Symlink von Hand setzen.**
*Risiko:* geteilte `node_modules` bei abweichendem Lockfile-Stand = falsche
Testbasis. Der Bootstrap muss den Lockfile-Hash prüfen und bei Abweichung echt
installieren.

**14 — Wiederholte identische Abfragen abstellen [nur A].** 4.031 Antworten
(15,8 %) sind ein Shell-Kommando, das in derselben Sitzung schon wortgleich
lief. Ein Teil ist legitim; der illegitime Teil ist das erneute Suchen nach
einem Fakt, der schon im Kontext steht.
*Risiko:* ein zwischenzeitlich veralteter Fakt wird nicht neu geholt — deshalb
kein Verbot, sondern ein Merkposten: was sich seit der letzten Abfrage geändert
haben *kann*, wird neu geholt; was feststeht, nicht.
*Prüfbar:* dieselbe Messung erneut fahren und sehen, ob der Anteil fällt.

**15 — Der Brief liefert Code-Orientierung [A+B, zwei Varianten].** Die ersten
Antworten eines delegierten Agenten sind fast immer Suche. [nur A]: der Brief
nennt die Dateien, die der Punkt voraussichtlich berührt, abgeleitet aus den
`§`-Auflösungen und den Pfaden, die die Spezifikation nennt. [nur B]: eine
**generierte** Modul-Landkarte (`scripts/repo-map.mjs`, je Verzeichnis eine
Zeile Zuständigkeit, ~2 k Tokens) fährt im Brief mit. Beide Varianten bleiben
stehen; sie ergänzen sich (spezifisch vs. allgemein).
*Gegenkosten:* der Brief wächst (heute ~2,1 k Tokens); +0,5 k für 5 gesparte
Antworten ist ein Tausch von etwa 50:1 zugunsten des Briefs.
*Risiko:* eine **falsche** Liste ist schlimmer als keine — sie lenkt. Deshalb als
Hinweis kennzeichnen, nicht als Vorgabe, und aus dem Baum **generieren**, nicht
pflegen (Retrospektive §3.37: ein Werkzeug, das rät, ersetzt still).

**16 — Cache-Präfix- und TTL-Messung [A+B].** Der Cache ist ein Präfix-Match:
jede Byte-Änderung im Präfix entwertet alles danach. Gemessen sind 16,8 % der
gewichteten Ausgabe Cache-Write bei nur 1,7 % der rohen Tokens (140 M
gewichtet) — der zweitgrößte Zählerposten, und niemand hat geprüft, ob er
niedriger sein könnte. Zwei prüfbare Verdachtsquellen: **(a)** Hook-Ausgaben
oder `system-reminder`, die sich je Zug ändern und früh im Prompt stehen;
**(b)** Wartefenster über der Cache-TTL — ein 42-min-LARGE ohne Zwischenturns
lässt einen 5-Minuten-Cache verfallen, der Folgeturn zahlt 200 k Kontext als
Write (1,25×) statt als Read (0,1×), rund **0,23 M je Vorfall**.
*Beobachtbarer Ersatz für den nicht zugänglichen Präfix:*
`cache_creation`/`cache_read` je Antwort über die Zeit auftragen; ein hoher
Write-Anteil **mitten** in einer Sitzung ist das Alarmzeichen.
*Nebeneffekt:* „always prep during waits" bekommt eine zweite, harte Begründung —
Zwischenturns halten den Cache warm.

**17 — Guard-Vorabprüfung und Guard-Telemetrie [A+B].** [nur A]:
`guard-preflight.mjs` existiert und ist das richtige Muster; zu erweitern auf
**ein** `--for answer`, das **alle** Guards der Kette prüft und die
Reparaturkommandos in einer Ausgabe nennt. CLAUDE.md §7.2 hält fest, dass ein
blockierter Zug ~30 Züge kosten kann — die vermiedenen Blockierschleifen sind
der eigentliche Gewinn und stecken im Ausläufer. [nur B]: **erst zählen** — wie
oft Guards real blocken und welche davon Fehlalarme sind, misst heute niemand
(die zwei dokumentierten Vorfälle allein ≈ 0,6–1 M).
*Risiko:* ein Preflight, der ein Blockieren **verpasst**, erzieht zum Vertrauen
und dann zum blockierten Zug. Er ist ausdrücklich beratend, der Guard bleibt
maßgeblich.

**18 — Buchführung delegieren [nur A].** Die Hauptsitzung trägt 62,2 % ihrer
Kosten in `bookkeeping`, bei Median-Kontext 164 k. Derselbe `board.mjs`-Aufruf
in einem frischen, kurzlebigen Agenten kostet 43,6 k × 0,1 = **4,4 k** statt
16–48 k.
*Gegenkosten Achse A:* jeder Delegationsaufruf ist selbst eine Antwort, und der
Agent bootet (44 k Cache-Write ≈ 55 k gewichtet) — ein Buchführungs-Agent lohnt
erst ab ~4 verlagerten Aufrufen.
*Risiko und Grund für „offen":* **die Lease.** Guards stehen für eine Sitzung
still, die den Batch-Lock nicht hält, und die PreToolUse-Fence verweigert einem
Nicht-Owner Merge, Tick und Board-Publish. Ein Buchführungs-Agent müsste die
Ownership erben oder ausgenommen werden — **ein Eingriff in die
Sicherungsschicht und damit kein kleiner Vorschlag.**

**19 — Projekteigene Abfragekommandos [nur A].** `point-brief.mjs` hat das für
die Spezifikation getan. Dieselbe Behandlung für häufige Repo-Fragen: „welche
Suite deckt Pfad X" (`render-verify-core.mjs` weiß es), „was ist der Stand von
Punkt N", „welche Datei hält Wert Y". Jedes Kommando ersetzt typisch 3–5
Such-Antworten durch eine.
*Gegenkosten:* Bauarbeit, und jedes Kommando ist Mechanik, die verrottet
(Retrospektive §3.25). Deshalb **gestaffelt**: je Kommando erst zeigen, dass die
Frage oft gestellt wird.
*Risiko:* ein Kommando, das **rät** statt zu scheitern, fälscht — jede Auflösung
muss ihre Herkunft nennen, wie die Referenzkarte des Briefs.

**20 — Inkrementell in der inneren Schleife [A+B].** Vitest `--changed` bzw.
Pfadfilter, `tsc --incremental`, Vite-Cache — **nur** für die Iteration; der
volle Lauf bleibt am Tor (`test:unit` im Fast-Gate, `test:small`/`test:large`
unverändert). Bei 5 Zwischenläufen je Punkt von 60 s auf 10 s sind das ~4 min je
Punkt ≈ −3 % der Maschinenzeit.
*Risiko:* **ein inkrementeller Grün-Status ist kein Abnahme-Beweis** — strikt auf
die Iteration begrenzen.

**21 — Verwandte Punkte in einem Branch bündeln [A+B].** Der Sockel ist 4,9 M
gegen einen Median-Punkt von 5,69 M. Zwei verwandte Punkte in **einem** Branch
sparen grob den amortisierten Hauptsitzungs-Anteil (3,56 M) und kosten das
zusätzliche Kontextwachstum (~0,5–1 M): **netto −2,5 bis −3 M je Paar.** Für die
~16 Punkte unter p25 (≤ 2,85 M) ist der Sockel **größer als der Punkt**.
*Gegenkosten Achse A:* der Kalender-Median steigt (zwei Punkte werden gemeinsam
fertig), der p90 sinkt eher (ein Merge statt zwei).
*Risiko:* ein Bündel, dessen eine Hälfte scheitert, blockiert die andere; und es
verwässert die Punktgrenze, die gegen das >150-k-Regime eingeführt wurde.
**Regeländerung — braucht die Zustimmung des Nutzers** (CLAUDE.md §6
Boundary-Absatz, `tasks-archive-guard`, `batch-progress-guard`).

**22 — Merge-Zug [A+B].** Drei fertige Branches nacheinander mergen (Konflikte
weiter einzeln!), aber Fast-Gate und Board-Publish **einmal** am Zug-Ende statt
dreimal.
*Gegenkosten:* ein rotes Sammel-Gate ordnet den Schuldigen nicht zu — dann auf
Einzel-Gates zurückfallen (Bisect über 2–3 Kandidaten ist billig).
*Risiko:* die Regel „nach JEDEM Merge das Fast-Gate" existiert, weil zwei sauber
automergende Punkte zusammen brechen können. Das Argument dafür: das Gate am
Zug-Ende prüft **exakt den Zustand, der deployt**. **Regeländerung — braucht die
Zustimmung des Nutzers.**

**23 — Die Kalenderuhr zerlegen [A+B].** Aus `measure-task-cost.mjs` kommt
„erster Branch-Commit → Merge"; was fehlt, ist die Zerlegung in *Bauen*,
*Verifizieren* und *auf-den-Merge-Warten*. **Ohne sie ist jede Aussage über die
Kalenderachse eine Vermutung** — der Vergleich 1,39 Maschinen- gegen 0,75
Kalenderstunden zeigt nur, dass parallel gearbeitet wird. Dazu [nur B] ein
Stale-Branch-Alarm (Board-Karte + ntfy), wenn ein Feature-Branch > 24 h ohne
Merge und ohne frischen Commit steht: der Kalender-Ausläufer (p90 4,65 h, Max
86,5 h) ist Warten, nicht Arbeit.

**24 — Die Messung institutionalisieren [nur B].** `measure-task-cost.mjs` als
fester Schritt im Closing-Zyklus (`CLOSING_STEPS`), damit jede Strukturmaßnahme
ihren Vorher/Nachher-Vergleich bekommt statt eines Bauchgefühls. Kostet Minuten
je Closing, Risiko keins — und ohne sie ist keine Maßnahme dieser Liste
abrechenbar.

**25 — Deterministische Aufnahme [A+B].** Heute bewegen zwei Läufe **derselben**
Suite auf **identischem** Code 10,9–98,6 % der Pixel, während der kleinste echte
Defekt 0,75 % bewegt. Deshalb ist die ganze Diff-Familie verworfen (§4). Die
**Voraussetzung** ist kein Toleranzknopf, sondern: die Aufnahme wartet
nachweislich auf das Bild, das sie benennt (settled camera, geladene Assets),
geseedeter PRNG, fester Timestep — danach `picture-stability.mjs` erneut messen.
Teilweise ist das schon geschehen (Punkt 375, `frameSubject.mjs`), **und eine
Neumessung der Stabilität nach dem Verschluss ist überfällig.**
*Wert:* heute null; erst nach bestandener Messung öffnet sich der Zweig (ein
Golden-Image-Vorfilter wäre gemessen 12× auf einer typischen Änderung).
*Risiko:* das Ziel kann unerreichbar sein (Last-Effekte) — deshalb als eigenes,
kleines Investitionspaket mit **messbarem Abbruchkriterium**.

**26 — Der Agent sieht seinen eigenen Verbrauch [nur A].** Der
Delegations-Prompt nennt den Median (5,69 M / 238 Antworten) als Erwartung, und
der Agent prüft sich einmal in der Mitte.
*Risiko, das gegen die Maßnahme spricht:* die Literatur warnt, dass ein
sichtbarer Zähler ein Modell zu früh abschließen lässt („Kontext-Angst",
ausdrücklich in der Anthropic-Migrationsdoku für Fable 5). Ein Verbrauchszähler
ist nicht dasselbe wie ein Kontextzähler, aber die Nähe ist zu beachten.
*Kosten:* ein bis zwei Antworten je Punkt — lohnt nur, wenn er das Verhalten
ändert.

**27 — Deterministische Buchführung in Hooks [nur A].** Board-Publish,
Batch-Marker, CI-Statusprüfung, Zeitstempel sind Schritte ohne Urteil; jeder als
Hook statt als Werkzeugaufruf spart eine Antwort à 21,9 k (grob −1,6 %).
*Risiko:* **mittel bis hoch.** Ein Hook, der schreibt, ist schwer zu debuggen;
Retrospektive §3.38 und §3.43 sind beide an dieser Klasse entstanden.
*Voraussetzung:* der Schritt ist wirklich urteilsfrei. Board-**Karten** sind es
nicht (sie formulieren), Board-**Publish** ist es.

**28/29 — `npm audit` nur bei Lock-Änderung [nur A] · Board-Publish nur bei
Änderung [nur B].** Beide < 0,3 %, beide trivial. Sie sind hier, damit die
Vereinigung sie nicht verliert, aber **keiner von beiden rechtfertigt einen
eigenen Punkt** (Sockel 4,9 M) — sie gehören in ein bestehendes Bündel. Bei
`npm audit` ist Kriterium 18 zu **präzisieren** („nach jeder Änderung" → „nach
jeder Änderung am Abhängigkeitsbaum"), nicht zu lockern; CI fährt es ohnehin.

### 3.3 Was die Harness gibt oder nicht gibt [beide Hälften, gleichlautend]

- **Hartes Token-Budget je Aufgabe:** `docs/harness-primitives-evaluation.md` §3
  hat das Workflow-BUDGET als **nicht verfügbar** befunden (Probe 07.08.2026);
  der API-Parameter `output_config.task_budget` ist über die Harness nicht
  setzbar. **Verdikt unverändert; 4 und 7 sind der Ersatz.** Bei einem
  Harness-Update erneut proben — dann wäre es die erste Wahl.
- **Entfernte Ausführung** (`isolation:"remote"`) lief nachweislich lokal und
  degradierte **still** (ebd. §6). Vor jeder Neuplanung re-proben.
- **`defer_loading` für weitere Werkzeuge** und **mid-conversation
  system/tool-Änderungen** (die den Cache erhalten, wo eine Änderung ihn sonst
  entwertet) sind **Harness-Sache, nicht unsere** — als Frage notiert, nicht als
  Maßnahme.

---

## 4. Was wir ausdrücklich **nicht** tun sollten

Eine Verwerfung ist ein Ergebnis. Beide Hälften haben Verwerfungslisten
geschrieben; sie sind hier vereinigt und **keine wurde fallengelassen**.

| Maßnahme | Herkunft | Warum nicht |
| --- | --- | --- |
| **Arbeit an billigere Modelle routen** (Kaskade, Router, „billiger Executor", Advisor-Muster) | [A+B] | Die Allowlist ist bindend (CLAUDE.md §6): Opus 5 / Fable 5 / Opus 4.8. Ökonomisch trägt es auch ohne die Regel: drei defekte Haiku-Lieferungen in 14 Minuten kosteten mehr Nacharbeit, als alle Sparmaßnahmen davor eingebracht hatten (Retrospektive §3.33). Die Feldquelle „We built a routing layer to cut our AI costs. It broke the product." (Towards Data Science, abgerufen 09.08.2026) beschreibt genau dieses Muster. |
| **Golden-Image-Vorfilter, Cross-Backend-Diff, perzeptuelle Metrik, diff-abgeleiteter Bildzuschnitt** | [A+B] | Im Replay gemessen verworfen (`picture-check-levers.md` §3.4): die ruhigste Aufnahme bewegt 27,8 % der Pixel, der kleinste echte Defekt 0,75 %. Der einzige Weg zurück führt über Maßnahme 25 und einen bestandenen `picture-stability`-Nachweis. |
| **Downscaling, Kontaktbogen, Zuschnitt auf die Region — als ERSATZ der Inspektion** | [A+B] | Im Replay verworfen; und nach §2e **zusätzlich gegenstandslos**, weil das Ansehen der Frames ein Bruchteil eines Prozents der Verifikationskosten ist. Als **Triage über voll verfügbaren Frames** bleibt es zulässig [B]. |
| **Viewport auf 28-px-Vielfache schnappen** (überlebte den Replay mit 4,9 %) | [nur A] | 4,9 % von < 0,5 % ist nichts. Nicht einmal beim nächsten Viewport-Wechsel die Aufmerksamkeit wert. |
| **Bytes sparen** (Graustufen, Palette, PNG-Kompression, JPEG, Hash-Dedup) | [A+B] | Arithmetisch tot: die Token-Kosten eines Frames hängen allein am Viewport, über eine 24-fache Byte-Spanne identisch (1.716 Tokens). |
| **Frames weglassen / die teure Suite aufteilen** | [A+B] | Der Korpus läuft andersherum: der Horizontstreifen wurde durch **Hinzufügen** eines Frames gefunden. |
| **Allgemeine Pfad→Suite-Kopplungskarte** | [A+B] | Vom Replay getötet (`TravelScene.tsx` liegt in drei Suiten). Nur die Verengung auf reine `src/ui/`-Änderungen überlebte und **ist implementiert**. |
| **Abdeckungsbasierte Testauswahl** (gemessene statt geratener Kopplung) | [nur A, mit ausdrücklichem Risikovermerk] | **Hier als „nicht jetzt" eingeordnet.** Es ist ein *anderes* Instrument als die verworfene Karte, aber: erheblicher Bau (Instrumentierung eines Browser-Laufs), laufende Kosten, und **die Verifikations-Disziplin steht auf dem Spiel** — eine Abdeckungsmessung sagt, welche Datei *ausgeführt* wurde, nicht welche das **Bild** verändert. Der gestufte Küstenverlauf kam aus einer Datei, die zur Laufzeit Geometrie liefert. Die Literatur (Rothermel/Harrold; minware; Parasoft, alle abgerufen 09.08.2026) meldet ≥ 50 % Ersparnis — **Hypothese**, und sie gilt für Unit-Suiten, nicht für Bildprüfungen. |
| **Punkte grundsätzlich kleiner schneiden** | [nur A] · Gegenposition [nur B: S1] | Rechnet sich **nicht**: Punkte halbieren verdoppelt den Sockel (4,9 M) und spart nur Kontextwachstum. **Auflösung des Widerspruchs:** Fables Vorschlag ist damit *vereinbar*, weil er den Split ausdrücklich auf Punkte ≥ 3× Median beschränkt — dort übersteigt die Ersparnis den zweiten Sockel. Als Maßnahme 7(c) übernommen, als **allgemeine** Regel verworfen. |
| **Den Arbeitsauftrag weiter aufteilen / das Archiv verschlanken / den Brief weiter optimieren** | [A+B] | **Neu begründet nach der Messkorrektur:** die Phase `brief` ist 1,9 % der Gesamtausgabe (nicht 0,5 %), Median 103 k je Punkt = 1,4 % eines Punktes. Das ist immer noch zu klein, um einen 4,9-M-Punkt zu tragen — aber die Begründung ist jetzt eine Abwägung, keine Selbstverständlichkeit. Die 1,2 M Zeichen des Archivs werden im Normalbetrieb von niemandem gelesen. **Ausnahme:** Maßnahme 15 (Code-Orientierung im Brief) ist etwas anderes und bleibt. |
| **Kürzere Berichte / knapper schreiben als Sparmaßnahme** | [A: als kleine Maßnahme] · [B: ausdrücklich NICHT als Hebel] | **Aufgelöst zugunsten von B.** Output ist 4,5 % gewichtet; selbst 30 % knapperes Schreiben spart ~1,4 %. Schreibdisziplin lohnt für Lesbarkeit, nicht für Tokens — und ein zu knapper Bericht kostet eine Rückfrage. Retrospektive §3.57: „die Anleitung an den Nutzer ist die schlechteste aller Antworten." **Kein Widerspruch zu Maßnahme 10:** dort geht es um GELESENE Werkzeug-Ausgaben, hier um GESCHRIEBENE Prosa. |
| **Reasoning-Effort senken / Denk-Token deckeln** | [nur B] | Output + Denken sind zusammen 4,5 % gewichtet; selbst eine Halbierung wäre ≤ 2,3 %, gegen ein reales Qualitätsrisiko und die stehende Nutzer-Regel „Effort High für Implementierung". Musterfall „externe Zahl überlebt die eigene Messung nicht" (Quellen: Boundev; T-Minus AI, abgerufen 09.08.2026, melden 3–7× Denk-Token auf mechanischen Schritten). |
| **Den Pool verkleinern, um Tokens zu sparen** | [nur B] | Bereits gemacht und als Denkfehler seziert (Retrospektive §3.27): Parallelität vervielfacht Rate und Durchsatz gemeinsam; **pro fertigem Punkt** bleibt es gleich. Dieselbe Falle steckt in der Feldzahl „Multi-Agenten kosten 15×" — sie misst **pro Anfrage**, nicht **pro Arbeit**. |
| **Den Beide-Backends-Beweis breiter aussetzen** | [nur B] | Verengt ein Sicherheitsnetz über das beweisbar Beitragslose hinaus (Retrospektive §3.28: die zwei Ein-Backend-Fälle saßen in backend-neutral **aussehendem** Code). Nicht verhandelbar. Maßnahme 5 verschiebt nur die Reihenfolge, nie den Beweis. |
| **Vier-Augen sparen** | [nur A] | Nicht verhandelbar, und §3.33 quantifiziert die Gegenrechnung. |
| **Screenshots ganz aus der Regression nehmen** | [nur A] | Verletzt die Verifikations-Disziplin unmittelbar. Nicht diskutabel. |
| **`verification/` untracken** | [nur A] | Spart Speicher, keine Token; und die archivierten Frames sind der Replay-Korpus. |
| **Kontext-Kompaktierung mitten in der Sitzung selbst bauen** (Summarizer) | [A+B] | Die Ebene darunter tut es bereits (das Kontext-Plateau bei ~330 k ist vermutlich genau das), und die Forschung benennt die Kosten selbst: Verlust, zerstörte Kausalstruktur, kompressions-induzierte Halluzination (arXiv 2606.11213; arXiv 2510.11967; SelfCompact via AI Weekly, alle abgerufen 09.08.2026). Der **verlustfreie** Schnitt an einem git-Zustand (Maßnahme 4) und die Quarantäne (11) sind das, was die Ebene darunter **nicht** tut. |
| **Batch-API (50 % Rabatt) · Fast Mode (2,5× Ausgabegeschwindigkeit)** | [nur A] | Batch-API ist asynchron ohne Werkzeugschleife — unsere Schleife ist interaktiv und werkzeuggetrieben; die Harness bietet den Weg nicht an. Fast Mode kostet den doppelten Preis und griffe an der falschen Stelle: unsere Wall-Clock hängt an der **Zahl** der Antworten, nicht an der Ausgabegeschwindigkeit (Median-Output 119 Tokens). |
| **Beide Backend-Pässe parallel auf dieser Maschine** | [nur B] | Halbiert nominell die LARGE-Wall-Clock, aber die Suiten brauchen eine ruhige Maschine (19 % Laufzeit-Spread unter Last; rotierende Flakes unter Parallel-Agenten sind aktenkundig). Ein Flake-Retest frisst die Ersparnis. |
| **Prompt-Caching „einführen"** | [A+B] | Bereits eingelöst: 98,2 % der rohen Tokens sind Cache-Reads — über dem für Claude Code zitierten Wert von 92,7 %. **Wichtiges negatives Ergebnis:** die populärste Sparmaßnahme des Feldes ist hier ausgereizt; die verbleibende Frage ist nicht „wie cachen wir besser", sondern „wie lesen wir weniger **oft**" (4) und „wie lesen wir weniger" (9/10). Offen bleibt allein die Präfix-Stabilität (16). |

**Ein ungelöster Widerspruch, ausdrücklich als solcher stehengelassen: der
Pool-Deckel.** [nur A] schlägt einen **getrennten** Deckel vor („3
verifizierende + n leichte"), weil die Flake-Begründung nur Browser-Läufe
betrifft und Doku-/Analyse-/Skriptarbeit sie nicht auslöst — das verkürzt die
Kalenderzeit. [nur B] hält dagegen, eine Anhebung bewege Achse A **pro Punkt**
gar nicht (die Uhr läuft je Punkt), sondern nur die Warteschlangen-Latenz, und
die reale Grenze sei die Urteilsfähigkeit der Hauptsitzung. **Die Messung
entscheidet es nicht:** dazu fehlt genau die Zerlegung der Kalenderuhr aus
Maßnahme 23. Beide Positionen stehen; die Entscheidung gehört hinter diese
Messung, nicht davor.

---

## 5. Übergabe-Prompt für andere Modelle

Zum **wörtlichen** Weitergeben, zusammen mit dem Repository-Inhalt. Er ist
absichtlich lang: sein Zweck ist, dass ein fremdes Modell **nicht zurückgibt,
was wir letzten Monat schon verworfen haben.** Die beiden Hälften waren sich
über die Sprache uneins (Entwurf A deutsch, Entwurf B englisch); **die
Entscheidung ist Deutsch**, weil der Nutzer die Antworten liest.

---

> **PROMPT — ANFANG**
>
> Du bekommst ein reales Software-Repository mit einer vollautomatisierten,
> agentischen Bau- und Prüf-Pipeline: ein Spiel-Remake in
> TypeScript/React/three.js, das fast vollständig von LLM-Agenten gebaut wird.
> Eine Hauptsitzung orchestriert; worktree-isolierte Subagenten (Pool von 3)
> bauen je einen Arbeitsauftrags-Punkt auf einem eigenen git-Branch; Merge,
> Buchführung und Bild-Verifikation bleiben in der Hauptsitzung. Jeder Punkt
> durchläuft: Brief → Implementierung → Gates (Build/Lint/Unit-Tests) →
> Browser-Verifikation (Playwright-Suiten, Screenshots, auf WebGPU **und**
> WebGL 2) → Merge → Buchführung.
>
> **Ich suche Maßnahmen, die einen Punkt billiger und schneller machen.**
>
> **ZWEI ACHSEN, DIE NIE ZU EINER ZAHL VERSCHMOLZEN WERDEN**
> - **Achse A — Wall-Clock pro Punkt** (erster Branch-Commit → Merge).
> - **Achse B — Tokens pro Punkt** (Hauptsitzung UND Subagenten zusammen;
>   gewichtet: Cache-Read 0,1 · Cache-Write 1,25 · Output 5 relativ zu einem
>   Input-Token — das ist die tatsächliche Preisrelation, keine Konvention).
>
> Sie handeln gegeneinander: ein breiterer Fan-out kauft Zeit mit Tokens, ein
> knapperer Brief spart beides. **Jeder deiner Vorschläge muss vier Dinge
> nennen: welche Achse er bewegt · WIE STARK gegen die Zahlen unten (wenn deine
> Schätzung grob ist, schreib das hin) · WAS ER AUF DER ANDEREN ACHSE KOSTET ·
> sein RISIKO für die Korrektheit der Arbeit.** Ein Vorschlag ohne diese vier
> Angaben ist unbrauchbar. Nenne zusätzlich, **was in diesem Repository wahr
> sein müsste**, damit er wirkt.
>
> **DIE GEMESSENE BASISLINIE** (Fenster 03.–09.08.2026, 262 Transkripte, 32.531
> API-Antworten, 64 fertig gemergte Punkte; Werkzeug: `scripts/measure-task-cost.mjs`;
> Details und Fehlerbalken in `docs/analysis_de/durchsatz-analyse.md` — **traue
> dieser Datei mehr als dieser Zusammenfassung**):
>
> - **Tokens je Phase (gewichtet):** Verifikation **47,6 %**, Buchführung
>   **26,2 %**, Implementierung 13,2 %, Gates 9,5 %, Brief 1,9 %, Merge 1,6 %.
> - **Maschinenzeit je Phase:** Buchführung 37,5 %, Verifikation 37,5 %,
>   Implementierung 11,6 %, Gates 9,6 %.
> - **78,7 % der gewichteten Ausgabe ist wieder-gelesener Kontext; nur 4,5 % ist
>   das, was das Modell schreibt.** 98,2 % der rohen Tokens sind Cache-Reads —
>   der Prompt-Cache ist also bereits ausgereizt. Greife den Kontext an, nicht
>   die Prosa.
> - **Subagenten tragen 69,1 % der Tokens** bei exakt derselben Maschinenzeit
>   wie die Hauptsitzung; die Hauptsitzung gibt 62,2 % ihrer eigenen Kosten für
>   Buchführung aus.
> - **Pro Punkt:** Median **5,69 M gewichtet / 238 API-Antworten / 1,39
>   Maschinenstunden**; p90 20,35 M; Maximum 101,8 M. **10 von 64 Punkten tragen
>   die Hälfte der Kosten, und die zehn teuersten halten 65,5 % aller
>   Verifikations-Tokens. Das Geld liegt im Ausläufer.**
> - **Pro Antwort:** Median 190 k Kontext, 119 Output-Tokens, 21,9 k gewichtete
>   Kosten, 24,4 s mittlerer Abstand. Daraus: *Kosten ≈ Antworten × Kontext ×
>   0,1* und *Zeit ≈ Antworten × 24 s*. **Eine gesparte Antwort spart ~22 k
>   Tokens UND ~24 s.** Und: **1 k Tokens Dauerlast im Kontext kosten 3,25 M je
>   Fenster.**
> - **Fixer Sockel je Punkt ≈ 4,9 M gewichtet** (Orchestrierung + Board + Brief
>   + Merge) gegen einen Median-Punkt von 5,69 M — **die Größenordnung eines
>   ganzen Punktes.** Rechne das gegen: jede Mechanik, die du vorschlägst, ist
>   selbst ein Punkt und kostet diesen Sockel. Eine Maßnahme, die weniger spart
>   als ihr Bau kostet, gehört in deine Verwerfungsliste.
> - **Werkzeug-Taxonomie:** 80 % aller Werkzeugaufrufe sind Shell-Kommandos.
>   Anteile an der Gesamtausgabe: Suchen/Lesen **25,2 %**, Buchführungs-Skripte
>   12,5 %, **Warten/Pollen 11,1 %**, Verify-Läufe 6,6 %, Gates 4,7 %,
>   **blankes `echo idle` als Leerlauf-Halter 3,8 %**. **Nur 4,9 % der Antworten
>   setzen mehr als einen Werkzeugaufruf ab. 15,8 % der Ausgabe geht für exakt
>   wiederholte Kommandos drauf.**
> - **Kalenderuhr (git):** erster Branch-Commit → Merge, Median 0,75 h, p90
>   4,65 h, Maximum 86,5 h.
> - **Bildprüfung:** ein Full-Frame-Screenshot kostet ~1.716 Tokens zum Ansehen;
>   eine große Browser-Regression dauert 42 min und schreibt 93 Frames **je
>   Backend**. Das Ansehen der Bilder ist ein Bruchteil eines Prozents der
>   Verifikationskosten — **der Preis steckt in der Schleife um den Lauf
>   herum.**
>
> **NICHT VERHANDELBARE RANDBEDINGUNGEN.** Ein Vorschlag, der eine davon
> verletzt, ist außerhalb des Rahmens — schlage ihn nicht vor:
>
> 1. **Die Verifikations-Disziplin bleibt.** Jedes Feature bekommt einen Test
>    auf der passenden Schicht (schnelle Unit-Schicht ohne Browser; echte
>    Browser-Suiten nur für Szene, Geometrie, Layout, Audio, Screenshots).
>    Render-/GUI-Änderungen werden **am gerenderten Bild** beurteilt, und zwar
>    auf **beiden** Grafik-Backends, wo sie verschieden zeichnen können. Kein
>    grüner Haken gegen einen angenommenen Stellvertreter (kein „Radius statt
>    Projektion", kein „Flag statt Pixel").
> 2. **Kein Golden-Image- oder Pixel-Diff-Gate, bevor die Aufnahme nachweislich
>    stabil ist.** Gemessen: zwei Läufe **derselben** Suite auf **identischem**
>    Code bewegen 10,9–98,6 % der Pixel; der kleinste echte Defekt bewegte
>    0,75 %. Jede diff-basierte Abkürzung ist damit tot, bis der Rauschboden
>    darunter liegt.
> 3. **Das Vier-Augen-Prinzip bleibt**, in zwei Modi: ein **divergenter**
>    Schritt (was könnte man tun, was könnte schiefgehen) läuft **blind
>    parallel** — zwei Modelle erarbeiten unabhängig je eine vollständige Liste,
>    danach werden sie bedeutungsgleich vereinigt; ein **konvergenter** Schritt
>    (ist dieser Diff korrekt, ist diese Messung solide) bleibt ein Review, bei
>    dem der Prüfer das Artefakt vor der Begründung liest.
> 4. **Die Modell-Allowlist bleibt.** Nur drei Premium-Modelle dürfen hier
>    Arbeit verfassen. Arbeit auf ein billigeres, schwächeres Modell zu routen
>    ist **verboten** — eine degradierte Sitzung lieferte einmal drei defekte
>    Punkte in 14 Minuten, und die Nacharbeit kostete mehr als alle
>    Sparmaßnahmen davor eingebracht hatten. Kaskade, Router, „billiger
>    Executor" fallen damit weg.
> 5. **Nichts darf schwächen, was die Sicherungsschicht fängt.** Es gibt eine
>    Kette von Guards (Zug-Ende-Hooks, PreToolUse-Sperren, git-Hooks), die
>    verhindert, dass ein Zug endet, während der Zustand einer stehenden Regel
>    widerspricht. Einen Guard **billiger** zu machen ist erlaubt; das, was er
>    fängt, zu entfernen, nicht.
> 6. **Das Designdokument ist die Autorität über den Spielinhalt** und wird nie
>    geändert, um Aufwand zu sparen.
>
> **WAS SCHON VERSUCHT WURDE — gib das nicht zurück:**
>
> - **Der Auftrags-Brief statt Leseauftrag.** Ein Generator stellt jedem
>   delegierten Agenten seine Spezifikation wörtlich zu (~2 k Tokens), statt ihn
>   die Dokumente lesen zu lassen (~135 k). **Erledigt.**
> - **Kontextgrenze an der Punktgrenze.** Eine Sitzung endet, wenn ein Punkt
>   fertig ist; ein Nachfolger startet frisch und orientiert sich für ~600
>   Tokens aus git. **Erledigt** — offen ist, ob dieselbe Grenze auch
>   *innerhalb* eines Punktes gezogen werden sollte.
> - **Der Arbeitsauftrag ist geteilt** (offene Punkte / Archiv), das
>   Regeldokument wurde von 61 k auf 45 k Zeichen geschnitten, beide haben
>   gemessene Obergrenzen. **Erledigt.**
> - **Die Ausgabe eines Prüflaufs wird zusammengefasst**, statt roh in den
>   Kontext zu fließen (gemessen 30.542 → 3.782 Zeichen bei einem roten Lauf,
>   jeder fehlgeschlagene Test weiterhin namentlich). **Erledigt.**
> - **Zwei Prüfstufen** (kleiner Alltags-Riegel / große Vollregression) und eine
>   WebGPU-Alltagsspur mit WebGL 2 als Regressionsspur. **Erledigt.**
> - **Ein Bild-Verifikations-Wächter**, der die Bildprüfung nur dort verlangt,
>   wo sie greifen kann (reine DOM-Änderungen: ein Backend statt zwei).
>   **Erledigt.**
> - **Verworfen nach Messung** (bitte nicht neu vorschlagen, außer du kannst
>   begründen, warum das Urteil nicht mehr gilt): Golden-Image-Vorfilter;
>   Cross-Backend-Diff; diff-abgeleiteter Bildzuschnitt; perzeptuelle Metrik;
>   Herunterskalieren; Kontaktbogen; Bytes sparen (Graustufen, Kompression,
>   Dedup); Frames weglassen; die teure Suite aufteilen; eine allgemeine
>   Pfad→Suite-Kopplungskarte; den Pool verkleinern; Reasoning-Effort senken;
>   selbst gebaute Kontext-Kompaktierung. Grund in fast allen Fällen: der
>   Rauschboden der Aufnahme (Randbedingung 2), die Arithmetik (die
>   Token-Kosten eines Screenshots hängen **allein** an seinen Pixelmaßen), oder
>   dass der angegriffene Posten gemessen zu klein ist.
> - **Geprüft und nicht verfügbar:** eine harte Token-Obergrenze je Aufgabe über
>   die Werkzeug-Ebene; entfernte Ausführung; ein Workflow-Resume. Wenn dein
>   Vorschlag eine dieser Fähigkeiten voraussetzt, sag das ausdrücklich dazu.
> - **Bereits eingelöst:** Prompt-Caching (98,2 % der rohen Tokens sind
>   Cache-Reads). „Nutzt doch Prompt-Caching" läuft ins Leere.
>
> **WAS ICH VON DIR WILL:**
>
> 1. Eine **vollständige** Liste von Maßnahmen, gruppiert nach der Phase, die
>    sie angreifen. Vollständigkeit ist wichtiger als Rangfolge — eine
>    ungewöhnliche Idee lässt du **nicht** weg, weil sie ungewöhnlich ist.
> 2. Je Maßnahme die fünf Angaben von oben (Achse · quantifizierte Wirkung ·
>    Gegenkosten auf der anderen Achse · Risiko · Voraussetzung).
> 3. Besonders interessieren mich Maßnahmen gegen: **(a)** die
>    Verifikations-**Schleife** um teure Punkte (Starten, Warten, Pollen,
>    Nachlesen), **(b)** den fixen Sockel je Punkt, **(c)** den Anteil
>    wieder-gelesenen Kontexts, **(d)** den Kalender-Ausläufer.
> 4. Eine Liste der Maßnahmen, die du **erwogen und verworfen** hast, mit
>    Begründung. Eine Verwerfung ist ein Ergebnis.
> 5. Wenn du eine externe Quelle benutzt: **nenne sie (Titel + URL + Datum) und
>    beurteile sie gegen die obigen Zahlen, bevor sie ein Vorschlag wird.** Ein
>    Benchmark aus einem anderen Aufbau ist hier eine **Hypothese**, kein
>    Befund — markiere jede so.
> 6. Wo du eine Zahl brauchst, die oben fehlt: **nenne das Kommando bzw. die
>    Messung, die sie liefern würde**, statt zu raten.
>
> **PROMPT — ENDE**

---

## 6. Was daraus Arbeitsauftrag-Punkte werden sollte

In dieser Reihenfolge. Jeder Eintrag ist im Endzustand formuliert und kann
wörtlich an den Arbeitsauftrag angehängt werden (englisch, wie der
Arbeitsauftrag). **Punkt 572 selbst liefert die Analyse, nicht den Umbau** — das
Anhängen ist Sache der Hauptsitzung.

**1. STOP PAYING FOR THE WAIT.** A long-running command is awaited, not polled.
The verify wrapper and every background run report their completion through the
harness notification or a single blocking call with a timeout; where a poll is
unavoidable, the FIRST wait is 0.9 × the suite's measured median runtime
(`docs/picture-check-cost.md` §1), and after five polls the run is either awaited
blocking or treated as hung. The idle marker the no-idle-stop guard reads is set
by a HOOK, not by a model turn — `echo idle` disappears from the transcripts, and
the guard accepts the hook's marker exactly as it accepts today's turn. The
verify wrapper counts the polls of a run and prints the count, so the rule is
visible rather than remembered. Measured target: polling is 11,1 % of the
weighted spend and the bare idle holds another 3,8 % (2.798 + 1.189 responses,
09.08.2026); the longest unbroken poll chain in the window was 437 responses ≈
11,5 M weighted. Re-measure after the change with
`node scripts/measure-task-cost.mjs`.
*Criticality: high (it touches the idle guard, and a guard that goes blind stops
catching an idle stop — the mechanism review of the other model applies).*

**2. ONE TURN, SEVERAL INDEPENDENT CALLS.** The delegation prompt and the batch
prompt carry one binding paragraph: independent tool calls go into ONE turn —
several reads, several greps, `build` and `lint` — while anything whose input
depends on another call's output stays sequential, and a bundled shell chain
never hides its failing step. Measured baseline: 4,9 % of responses issue more
than one call, search/read alone is 25,2 % of the weighted spend, and one saved
response is worth ~21,9 k weighted AND ~24 s. The point is complete when the
share of multi-call responses has been re-measured after the change; enforcement
is by prompt and measurement, not by a guard — "could have been bundled" is not
machine-decidable.
*Criticality: low (no mechanism, no guard; the only risk is bundling dependent
calls, which the paragraph forbids explicitly).*

**3. THE LANDING COMMAND.** `scripts/land-point.mjs <N>` runs the landing chain
deterministically — merge, fast gate, tick, archive move, board publish, worktree
cleanup — and prints ONE structured summary with a verdict per step. It fails
LOUD at the first red step and never continues past it, so no half state is left
behind, and every step it performs is one a guard already governs. Measured
target: bookkeeping is 26,2 % of the weighted spend and 37,5 % of the machine
hours, the chain runs as 8–12 main-session turns today at a median context of
164 k, and the main session spends 62,2 % of its own cost on bookkeeping.
*Criticality: med (it bundles guard-adjacent steps; a swallowed intermediate
error would advance state that nobody verified — mechanism review required).*

**4. THE WORKTREE IS GATE-READY IN SECONDS.** A fresh agent worktree carries its
dependencies without a per-worktree install: the bootstrap links the main
checkout's `node_modules` and VERIFIES the lockfile hash matches, installing for
real when it does not. The delegation brief no longer needs to tell an agent to
set the link by hand, and the false red of a missing `node_modules/.bin/oxlint`
cannot occur. Measured target: 1–3 min per agent over ~64 points per window, plus
the turns an agent spends today classifying the false red.
*Criticality: low (a wrong lockfile state would test against the wrong tree,
which the hash check prevents).*

**5. THE VERIFICATION LADDER.** While a render point is still being fixed, only
the cheapest covering suite runs, on the everyday WebGPU lane; the full proof —
both backends where they can differ, LARGE where the change warrants it — runs
exactly ONCE, on the state that is merged. The expensive browser suites abort at
the FIRST failure during that iteration (a red run is never credited anyway) and
run to completion only for the final proof. The rule is a brief building block
for render points, so it is applied rather than remembered. Measured target:
verification is 47,6 % of the weighted spend and 37,5 % of the machine hours, the
ten costliest points hold 65,5 % of all point-assigned verification tokens, and
eight of ten recorded `enrichments` runs failed while still writing all 37 frames
at 951–1029 s each.
*Criticality: med (it reorders the proof but must not dilute it — the
both-backend picture proof stays exactly as binding as it is today).*

**6. THE TAIL IS VISIBLE WHILE IT RUNS.** A point's running cost is measurable
during the point, not only after it: a hook reports when a branch passes three
times the median (≈ 17 M weighted), and the report is a DECISION point — re-cut,
re-staff, or continue deliberately — never an automatic abort. In the same
mechanism, an agent that has run the same browser suite red three times stops,
writes a diagnosis of what is red and what was tried, and escalates instead of
looping. Measured target: 10 of 64 points carry 50,2 % of the point-assigned
cost, the costliest single point 16,4 % with 89,5 % of it verification.
*Criticality: med (a cap that let a red state pass as green would be worse than
the cost it saves; the escalation path is the mechanism, the abort is not).*

**7. LARGE TOOL OUTPUT NEVER ENTERS THE CONTEXT WHOLE.** The bounded-output
discipline `scripts/verify/run-logged.mjs` already applies to verify runs extends
to the other big producers: `git diff` (`--stat` first), `grep` (`-c` or a head
bound), file reads (`offset`/`limit` instead of a whole file), `npm ls`,
`gh run view`. Error output stays UNCUT — every failing test keeps its name.
Measured target: a 10 k output entering a point's context at response 20 is re-read
by its remaining ~218 responses at 218 k weighted, ten responses' worth; the
trade pays up to a follow-up-query rate of ~85 %.
*Criticality: low (the one real risk is cutting an error message, which the rule
excludes).*

**8. THE BRIEF ORIENTS IN THE CODE, NOT ONLY IN THE SPEC.** The delegation brief
carries a GENERATED orientation: the paths the specification itself names, and a
per-directory line of responsibility derived from the tree and its file headers.
It is marked as a HINT, never as an instruction ("the specification names these
paths", not "change these files"), and it is generated on every run so it cannot
go stale. Measured target: search/read is 25,2 % of the weighted spend and the
first responses of a delegated agent are almost always search; five saved
responses per point is ~2 % of a median point.
*Criticality: low (a wrong list would misdirect, which generation-from-the-tree
and the hint framing address).*

**9. MEASURE WHAT THE CACHE AND THE CALENDAR HIDE.** Two measurements the
analysis needed and did not have, delivered together because both are pure
readings of data we already keep. (a) Cache-prefix hygiene: plot
`cache_creation` against `cache_read` per response over a session and name the
spikes — a high write share in the MIDDLE of a session points at a per-turn
change early in the prompt, a spike after a gap points at TTL expiry (a 42-min
run without intervening turns costs ~0,23 M weighted on the next turn).
(b) Calendar decomposition: split the git span first-branch-commit → merge into
building, verifying and waiting-for-the-merge, so a statement about axis A stops
being a guess. Both readings join `scripts/measure-task-cost.mjs`, and the tool
becomes a recorded step of the closing cycle (`CLOSING_STEPS`), so every
structural measure gets its before/after instead of a feeling.
*Criticality: low (pure measurement; it changes no behaviour, and it is the
precondition for judging measures 10 and the pool-cap question).*

**10. THE WINDOW BOUNDARY INSIDE A POINT — PILOTED, NOT ROLLED OUT.** The context
boundary is cut at every green, pushed commit rather than only at a point
boundary, with the handover note living in the BRANCH, not in the context. The
point delivers it for ONE point and MEASURES the result against the median
(`measure-task-cost.mjs --tasks`), and the rollout is a separate decision taken on
that measurement. A session after a cut must continue without asking a question —
that is the acceptance condition, and if it does not hold the pilot is reported as
failed rather than tuned. Measured target: context per response is a median of
190 k and re-read context is 78,7 % of the weighted spend; a cut every ~60
responses would put the mean context near 73 k.
*Criticality: high (what an agent has learned and not written down is lost at the
cut; this is the one measure on the list that can silently lower work quality,
which is why it is piloted and measured rather than adopted).*

**11. THE CAPTURE IS DETERMINISTIC, OR THE ATTEMPT IS ABANDONED.** The screenshot
path waits provably for the picture it names (settled camera, loaded assets), the
PRNG is seeded and the timestep fixed exactly as in the F8 benchmark, and
`node scripts/picture-stability.mjs` is re-measured afterwards — the shutter of
point 375 already closed part of this and the stability has not been re-measured
since. The point carries its own ABORT criterion: if the noise floor does not fall
below the smallest real defect (0,75 %), the investment is written off and
recorded as such in `docs/picture-check-levers.md`, which is a result, not a
failure. Nothing diff-based is enabled by this point itself.
*Criticality: med (it touches the capture path every render verification depends
on; a capture that waits wrongly would produce false greens, the exact failure
point 375 was built against).*

---

*Erstellt für Punkt 572. Die Messung ist reproduzierbar
(`node scripts/measure-task-cost.mjs`), das Fenster wächst mit jedem Lauf, und
die Zahlen oben sind der Stand vom 09.08.2026, 11:18 UTC.*
