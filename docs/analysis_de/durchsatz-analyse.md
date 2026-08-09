# Durchsatz-Analyse: Bearbeitungszeit und Token-Verbrauch pro Task

Arbeitsauftrag-Punkt 572. Zwei Achsen, die nie zu einer Zahl verschmolzen
werden: **Wall-Clock pro Task** (wie lange ein Punkt vom Brief bis zum Merge
braucht) und **Tokens pro Task**. Sie handeln gegeneinander — ein breiterer
Fan-out kauft Zeit mit Tokens, ein knapperer Brief spart beides.

Dieses Dokument entsteht in drei Etappen. **Etappe 1 — die Messung — steht
unten vollständig; die Etappen 2 und 3 sind noch leere Überschriften.** Das ist
Absicht: „Welche Maßnahmen könnte man ergreifen?" ist ein divergenter Schritt
und läuft nach CLAUDE.md §6 blind-parallel. Zwei Modelle arbeiten aus **dieser**
Messung heraus je eine eigene, vollständige Liste, ohne die des anderen zu
sehen. Deshalb enthält Abschnitt 1 keinen einzigen Vorschlag — jede hier
notierte Idee würde beide Listen ankern und genau das kaputt machen, was der
Punkt absichern soll.

---

## 1. Die gemessene Basislinie

### 1.1 Woher die Zahlen kommen

Alles unten ist **gemessen** oder aus einer gemessenen Größe **hergeleitet**,
und die Herleitung steht jeweils dabei. Wo etwas nicht messbar war, steht das
statt einer Schätzung.

| Quelle | Was daraus kommt |
| --- | --- |
| `~/.claude/projects/-workspace-hoa/` — 258 Transkripte (91 Sitzungen + 167 delegierte Agenten) | Tokens und Maschinenstunden pro Turn, pro Phase, pro Punkt |
| `scripts/measure-task-cost.mjs` (+ `-core.mjs`, Vitest-gedeckt) | die Phasen-Zuordnung selbst; `--json` gibt jede Zahl unten aus |
| `scripts/measure-context-cost-core.mjs` | Gewichtung (`COST_WEIGHTS`) und Leerlauf-Regel (30 min) — **unverändert übernommen**, damit beide Werkzeuge nicht verschieden rechnen |
| `git log --first-parent main` (214 Merges seit 06.07.2026) | die Kalender-Uhr: erster Branch-Commit → Merge, und die Main-Commits danach |
| `docs/picture-check-cost.md`, `docs/picture-check-levers.md` | die bereits gemessenen Kosten der Bild-Prüfung — zitiert, nicht neu gemessen |

**Messfenster:** 03.08.2026 11:01 UTC – 09.08.2026 10:30 UTC, also 5,98 Tage,
31.993 Turns. Ältere Transkripte hält die Maschine nicht mehr vor — das ist die
härteste Grenze dieser Messung (§1.8). In diesem Fenster wurden **64 Punkte nach
`main` gemerged**.

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

Ein Punkt („Task") ist der Git-Branch: `feat/<N>-<slug>` → Punkt N. 62,7 % der
gewichteten Kosten ordnet der Branch des Turns selbst zu, 10,0 % das Transkript
des delegierten Agenten (ein Agenten-Transkript **ist** ein Punkt), 27,3 %
gehören zu keinem Branch — das ist die Hauptsitzung (§1.6).

### 1.2 Was hier ein „Token" ist

| Zähler | roh | Anteil roh | Anteil **gewichtet** |
| --- | ---: | ---: | ---: |
| `cache_read` | 6.552 M | 98,2 % | **78,7 %** |
| `cache_creation` | 112,0 M | 1,7 % | 16,8 % |
| `output` | 7,5 M | 0,1 % | **4,5 %** |
| `input` | 0,1 M | 0,0 % | 0,0 % |
| **Summe** | **6.672 M** | | **833 M gewichtet** |

Die gewichtete Zahl ist das **Proxy** aus `COST_WEIGHTS` (Cache-Read 0,1 ·
Cache-Write 1,25 · Output 5 relativ zu einem Input-Token), keine Rechnung. Sie
ist **linear** im Turn, weshalb sie sich auf Phasen aufteilen lässt, ohne dass
die Aufteilung eine andere Operation wäre als auf den rohen Zählern.

Die Zeile, die alles Weitere rahmt: **rund vier Fünftel der gewichteten
Ausgabe ist wieder-gelesener Kontext, 4,5 % ist das, was das Modell
schreibt.** Über das ganze Fenster hat die Maschine 7,5 Mio. Output-Tokens
produziert und 6.552 Mio. Kontext-Tokens dafür durchgelesen.

### 1.3 Wohin die Tokens gehen — pro Phase

Ganzes Fenster, alle Sitzungen und Agenten zusammen:

| Phase | gewichtet | Anteil | Anteil **strikt** |
| --- | ---: | ---: | ---: |
| `verification` | 359,3 M | **43,1 %** | 25,4 % |
| `bookkeeping` | 222,1 M | **26,7 %** | 36,9 % |
| `implementation` | 133,4 M | 16,0 % | 21,9 % |
| `gates` | 96,3 M | 11,6 % | 13,3 % |
| `merge` | 10,3 M | 1,2 % | 1,9 % |
| `brief` | 4,3 M | 0,5 % | 0,6 % |
| `unattributed` | 7,2 M | 0,9 % | — |

Die Spalte **strikt** ist der Fehlerbalken, nicht eine zweite Meinung: sie
ordnet nur Turns zu, die selbst einen erkannten Werkzeugaufruf abgesetzt haben
(25,6 % aller Turns, 22,8 % der Kosten), und zeigt deren Verteilung. Beide
Lesarten stellen dieselben zwei Phasen an die Spitze — `verification` und
`bookkeeping` zusammen **69,8 %** (gefüllt) bzw. **62,3 %** (strikt) der
Kosten. Ihre Reihenfolge untereinander ist *nicht* robust: strikt liegt
`bookkeeping` vorn, gefüllt `verification`. Der Grund ist erklärbar —
Buchführung setzt viele kurze Aufrufe ab, eine Verifikation setzt einen Aufruf
ab und wartet danach viele teure Turns lang. Wer die Reihenfolge braucht, muss
sie separat messen; wer die Größenordnung braucht, hat sie.

### 1.4 Wohin die Zeit geht — **zwei Uhren**

Maschinenstunden und Kalenderstunden sind verschiedene Größen und werden nie
addiert.

**Uhr 1 — Maschinenstunden** (aktive Turn-zu-Turn-Zeit, Lücken > 30 min
abgeschnitten; parallele Agenten zählen jeder für sich):

| Phase | Stunden | Anteil |
| --- | ---: | ---: |
| `bookkeeping` | 82,1 | **38,3 %** |
| `verification` | 67,6 | **31,5 %** |
| `implementation` | 28,1 | 13,1 % |
| `gates` | 27,4 | 12,8 % |
| `merge` | 3,1 | 1,5 % |
| `brief` | 1,6 | 0,7 % |
| `unattributed` | 4,5 | 2,1 % |
| **Summe** | **214,4** | |

**Uhr 2 — Kalenderstunden** (Git, erster Branch-Commit → Merge). Sie enthält
die Wartezeiten, die Uhr 1 wegwirft:

| | Median | p90 | Max | n |
| --- | ---: | ---: | ---: | ---: |
| ganze Historie seit 06.07. | 0,47 h | 4,26 h | 87,0 h | 214 Merges |
| nur das Messfenster | 0,75 h | 4,65 h | 86,5 h | 64 Merges |
| Commits pro Branch (Fenster) | 5 | 11 | 87 | 64 |
| Main-Commits **nach** einem Merge (Fenster) | 3 | 9 | 12 | 64 |

Der Median-Punkt ist also in **unter einer Stunde** Kalenderzeit vom ersten
Branch-Commit bis zum Merge durch, während er **1,39 Maschinenstunden**
verbraucht (§1.7) — weil in dieser Stunde bis zu drei Agenten parallel laufen.
Die zweite Achse des Punktes („Bearbeitungszeit") ist damit **nicht** dieselbe
Größe wie die erste („Token-Verbrauch"), und der p90 von 4,65 h zeigt, dass der
Ausläufer die Kalenderzeit weit stärker streckt als der Median vermuten lässt.

### 1.5 Hauptsitzung gegen Subagenten

| Scope | gewichtet | Anteil | Maschinen-h |
| --- | ---: | ---: | ---: |
| delegierte Agenten (167 Transkripte) | 573 M | **68,8 %** | 106,8 |
| Hauptsitzungen (91 Transkripte) | 260 M | **31,2 %** | 107,6 |

Die beiden verbrauchen **fast gleich viel Zeit**, aber die Agenten verbrauchen
**mehr als doppelt so viele Tokens**. Ihre inneren Verteilungen sind fast
gegensätzlich:

| Phase | in den Agenten | in der Hauptsitzung |
| --- | ---: | ---: |
| `verification` | **56,0 %** | 14,8 % |
| `implementation` | 17,9 % | 11,8 % |
| `gates` | 14,8 % | 4,3 % |
| `bookkeeping` | 9,7 % | **64,0 %** |
| `merge` | 0,2 % | 3,4 % |
| `brief` | 0,3 % | 0,9 % |

Das ist genau die Arbeitsteilung, die CLAUDE.md §6 vorschreibt (die
Hauptsitzung delegiert und führt Buch, der Agent baut und prüft) — hier zum
ersten Mal in Zahlen. Pro Punkt gemessen liegt der Agenten-Anteil im Median bei
**87,8 %** der Kosten (p25 77,2 %, Minimum 41,4 %).

### 1.6 Wie viel Aufwand pro Task fix ist

Zwei getrennt gemessene Größen, und beide sind **nicht** dasselbe:

1. **Was in der Hauptsitzung zu keinem Branch gehört:** 227,4 M gewichtet
   (27,3 % der Gesamtausgabe). Verteilt auf die 64 Merges des Fensters sind das
   **3,55 M gewichtet je gemergtem Punkt** — ein *amortisierter* Wert. Er ist
   ausdrücklich keine Messung pro Task: Orchestrierung, Board, Queue und
   Chat-Betrieb zerfallen nicht in Punkte, und so zu tun wäre der Fehler
   „Schätzung als Messung", den dieses Projekt schon einmal gemacht hat.
2. **Was innerhalb eines Punktes größenunabhängig aussieht** (`brief` +
   `merge` + `bookkeeping` im Branch): Median **0,99 M**, p90 4,41 M,
   Max 7,40 M gewichtet.

Zusammen liegt der Sockel damit bei rund **4,5 M gewichtet je Punkt**, gegen
einen Median-Punkt von 5,01 M (§1.7). Diese Gegenüberstellung ist die
belastbarste Einzelaussage der Messung — **der Sockel hat die Größenordnung
eines ganzen Median-Punktes** —, aber sie hat einen Fehlerbalken: der
amortisierte Anteil aus (1) ist ein Fenster-Durchschnitt, und ein Fenster mit
mehr Chat-Betrieb verschiebt ihn.

Der `brief` ist an diesem Sockel **nicht** beteiligt: 0,5 % der Gesamtausgabe,
Median 0,00 M pro Punkt, p90 0,08 M.

### 1.7 Die Streuung — Median **und** Ausläufer

63 Punkte im Fenster über der Schwelle von 200 k gewichtet (darunter sind es
Transkript-Fragmente, keine Punkte; die Schwelle steht in `--min-weighted`):

| Größe | Min | p25 | **Median** | p75 | p90 | **Max** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| gewichtet | 0,40 M | 2,21 M | **5,01 M** | 13,07 M | 20,35 M | **101,76 M** |
| roh | 2,3 M | 17,5 M | 40,1 M | 92,1 M | 149,5 M | 979,7 M |
| Output-Tokens | 2 k | 21 k | 47 k | 72 k | 122 k | 213 k |
| Maschinenstunden | 0,07 | 0,57 | **1,39** | 2,85 | 5,20 | **9,58** |

**Das Geld liegt im Ausläufer.** Der teuerste Punkt allein (342,
Ctrl-Beschriftung der Akteure) trägt **16,8 %** der punktzugeordneten Kosten;
**10 von 63 Punkten tragen die Hälfte**; Mittelwert/Median = 1,92.

Die teuersten zwölf, mit ihrem Verifikations-Anteil:

| Punkt | gewichtet | Maschinen-h | davon `verification` |
| ---: | ---: | ---: | ---: |
| 342 | 101,8 M | 9,58 | 81 % |
| 549 | 33,8 M | 3,11 | 95 % |
| 479 | 28,1 M | 7,96 | 36 % |
| 418 | 25,4 M | 4,55 | 77 % |
| 485 | 24,1 M | 3,23 | 42 % |
| 482 | 20,8 M | 5,20 | 48 % |
| 323 | 20,3 M | 8,57 | 44 % |
| 483 | 19,9 M | 1,21 | 68 % |
| 475 | 18,3 M | 7,20 | 23 % |
| 524 | 18,2 M | 2,95 | 78 % |
| 493 | 17,2 M | 4,56 | 46 % |
| 546 | 15,5 M | 3,94 | 33 % |

Der Median-Punkt sieht dagegen ausgewogen aus — Anteile *innerhalb* eines
Punktes, Median über die 63: `verification` 27,2 %, `bookkeeping` 20,4 %,
`implementation` 19,4 %, `gates` 18,1 %, `merge` 0,1 %, `brief` 0,0 %. Der
Unterschied zwischen diesem Median-Profil und der Gesamtverteilung aus §1.3
(43,1 % Verifikation) ist selbst ein Befund: **die Verifikation dominiert nicht
den typischen Punkt, sondern den teuren.**

### 1.8 Fehlerbalken, und was nicht messbar war

- **Das Fenster ist 6 Tage lang.** Ältere Transkripte existieren auf dieser
  Maschine nicht mehr. Alles Punkt-bezogene gilt für die 63 Punkte dieser 6
  Tage; die Git-Uhr reicht weiter zurück (214 Merges seit 06.07.) und ist die
  einzige Größe hier mit längerem Horizont.
- **Der Füll-Fehlerbalken ist groß.** Nur 25,6 % der Turns (8.202 von 31.993)
  setzen einen Werkzeugaufruf ab, den der Klassifikator erkennt; sie tragen
  22,8 % der Kosten. Die übrigen erben die Phase des nächstgelegenen
  Evidenz-Turns **derselben Sitzung** und nie über eine Leerlauf-Lücke hinweg.
  Nach dem Füllen bleiben 0,9 % offen. Dass Evidenz-Turns fast genau
  durchschnittlich teuer sind (25,6 % der Turns → 22,8 % der Kosten), ist ein
  Indiz gegen eine systematische Verzerrung der Füllung, aber kein Beweis.
- **Die Proportional-Aufteilung eines Turns auf mehrere Phasen greift hier
  nie.** Gemessen: **kein einziger** Turn im Korpus setzt mehr als einen
  Werkzeugaufruf ab (18.296 Turns mit genau einem, 13.712 mit keinem). Der
  Mechanismus ist implementiert und getestet, aber auf diesem Korpus ohne
  Wirkung.
- **Bekannte Fehlklassifikationen, unkorrigiert:** ein `git push` nach einem
  Buchführungs-Commit auf `main` zählt als `implementation`; Shell-Plumbing
  (`grep`, `git status`, `git log`) bekommt bewusst **keine** Stimme, prägt also
  nur Turns, die sonst nichts getan haben, und landet dort in der Füllung.
- **Nicht messbar aus diesen Daten:** wie viel Wartezeit *innerhalb* der
  Verifikationsphase Rechenzeit und wie viel Modell-Arbeit ist (das Transkript
  datiert Turns, nicht Prozesse); wie viel eines `unattributed`-Turns Denken
  gegen Lesen ist; und die tatsächliche Rechnung in Euro — die Gewichtung ist
  ein Proxy.
- **Reproduzierbarkeit:** der Batch schreibt weiter, das Fenster wächst also
  mit jedem Lauf. Die Zahlen oben sind ein Schnappschuss vom 09.08.2026,
  10:30 UTC; `node scripts/measure-task-cost.mjs` liefert den jeweils aktuellen
  Stand, nicht exakt diese Werte.

---

## 2. Plausibilitätsprüfung gegen die bereits veröffentlichten Zahlen

Ein widersprochener Anker ist ein Befund, kein zu versteckender Fehler.

**a) „~1,8 k Tokens für den Brief gegen ~108 k für das Lesen der Dokumente"
(CLAUDE.md §6) — bestätigt, aber der Gegenwert ist gewachsen.**
`node scripts/point-brief.mjs 572` liefert 8.546 Zeichen ≈ 2,1 k Tokens; Punkt
572 hat eine ungewöhnlich lange Spezifikation, die Größenordnung stimmt. Der
Gegenwert dagegen ist **veraltet**: zum Zeitpunkt der Messung (Commit
`84e5b90b`, 27.07.2026) war TASKS.md 241.470 Zeichen und design.md 169.095
Zeichen groß, was zu den zitierten 59 k + 46 k Tokens passt (≈ 4,1 bzw.
3,7 Zeichen/Token). **Heute ist TASKS.md 360.594 Zeichen groß — 49 % mehr**,
design.md 170.168. Ein vollständiges Lesen kostet damit heute ≈ 88 k + 46 k ≈
**134 k Tokens statt der zitierten ~108 k.** Der Brief ist also mehr wert als
der Anker sagt, nicht weniger. Ungenannt im Anker: `docs/tasks-archive.md` ist
inzwischen 1.215.440 Zeichen (≈ 297 k Tokens).
Die Messung stützt das von der anderen Seite: die Phase `brief` ist mit 0,5 %
der Gesamtausgabe in keiner Richtung ein Kostentreiber.

**b) Punkt 555: 61.117 → 44.995 Zeichen — bestätigt.** CLAUDE.md misst heute
45.543 Zeichen, also +548 (+1,2 %) Drift seit dem Schnitt. Der Schnitt hält.

**c) „87–94 % der Ausgabe über 150 k Kontext" — teilweise widerlegt, und der
Vergleich ist mit diesen Daten gar nicht sauber führbar.**
`node scripts/measure-context-cost.mjs` misst heute im Scope *nur
Hauptsitzungen* **67,8 %** nach der ersten Übergabe des Fensters (davor
82,4 %), im Scope *inklusive Subagenten* aber **80,0 %** — und dort ist der
Wert **gestiegen** (davor 75,9 %). Zwei Dinge folgen: der Anker beschreibt ein
Regime, das oben nicht mehr gilt, und der Effekt der Punktgrenze ist im
ehrlichen Gesamt-Scope nicht sichtbar. Einschränkung, die dagegenspricht, das
als „die Punktgrenze wirkt nicht" zu lesen: das „davor" liegt hier am 03./04.08.
und **nicht** vor der Einführung der Grenze — die alten Transkripte fehlen. Der
saubere Vorher-Nachher-Vergleich ist aus diesen Daten **nicht** herstellbar.

**d) „~3 M Tokens pro Workflow-Fan-out" — die Einheit ist unklar, und in jeder
Lesart ist die Zahl heute kein Ausnahmefall mehr.** Gewichtet kostet der
**Median**-Punkt 5,01 M und der p90-Punkt 20,35 M; roh kostet der Median-Punkt
40,1 M. Welche Einheit der Anker meinte, ist nicht dokumentiert; in beiden
liegt ein gewöhnlicher Punkt heute auf oder über der Marke, die damals einen
großen Fan-out kennzeichnete. Das widerspricht der Zahl nicht (sie maß etwas
anderes), aber es widerspricht dem Rahmen, Fan-outs seien die teure Ausnahme.

**e) `docs/picture-check-cost.md`: „das teuerste Kontrollinstrument des
Projekts" — als Wall-Clock-Aussage bestätigt, als Token-Aussage widerlegt.**
Dort gemessen: ein LARGE-Lauf auf einem Backend braucht 2.536 s = 42,3 min und
schreibt 93 Frames; sie **anzusehen** kostet 150.289 Tokens, auf beiden Backends
294.096. Diese Messung hier zeigt: die Phase `verification` verbraucht
2.946 M **rohe** Tokens im Fenster. Selbst wenn jeder Frame jedes Laufs
angesehen worden wäre, läge das Ansehen bei einem Bruchteil eines Prozents
davon. **Der Preis der Bild-Prüfung liegt nicht im Ansehen der Bilder, sondern
in der Schleife um den Lauf herum** — Starten, Warten, Ausgaben lesen,
nachfassen. Beide Aussagen stehen nebeneinander: `picture-check-cost.md` misst
die Wall-Clock und die Frame-Tokens korrekt, `verification` als Phase ist ein
Vielfaches davon.

---

## 3. Maßnahmen, nach gemessener Wirkung geordnet

*(Etappe 2 — noch nicht gefüllt. Zwei Modelle erarbeiten blind-parallel je eine
vollständige Liste aus Abschnitt 1, danach werden beide bedeutungsgleich
vereinigt. Jeder Eintrag nennt die Achse, die er bewegt, die Wirkung, die
Gegenkosten auf der anderen Achse und sein Risiko.)*

## 4. Was wir ausdrücklich **nicht** tun sollten

*(Etappe 2 — noch nicht gefüllt, mit Begründung je Eintrag.)*

## 5. Übergabe-Prompt für andere Modelle

*(Etappe 3 — noch nicht gefüllt. Er trägt die zwei Achsen, die Basislinie aus
Abschnitt 1, die nicht verhandelbaren Randbedingungen — Verifikations-Disziplin,
Vier-Augen-Regel, Bild-Beweis auf beiden Backends — und was bereits versucht
wurde.)*
