# Lektion → Mechanismus: das Entscheidungsregister

Zu jeder Lektion der Retrospektive (`retrospektive-zusammenarbeit.md`, Abschnitt 3)
steht hier **eine erfasste Entscheidung** über ihren Mechanismus. Grund: Eine
Lehre, die nur aufgeschrieben ist, ist nicht befolgt — §1 des Nachbardokuments
sagt genau das, und eine Regel, die lediglich fordert „jede Regel braucht einen
Mechanismus", ist selbst wieder nur eine Regel. Was sie wirksam macht, ist eine
je Lektion **festgehaltene Entscheidung** plus etwas, das ihr Fehlen bemerkt.

Das Bemerken übernimmt `retro-currency-guard` (Kern: `scripts/retro-core.mjs`,
`evaluateLedger`). Eine Lektion ohne Zeile hier blockiert das Zug-Ende — genau in
dem Moment, in dem die Entscheidung noch billig ist.

## Die drei zulässigen Ergebnisse

| Ergebnis | Bedeutung |
|---|---|
| **1** | Ein **bestehender** Durchsetzer wurde erweitert/angepasst — das **bevorzugte** Ergebnis. |
| **2** | Ein **neuer** Durchsetzer, nur wo kein bestehender passt. |
| **3** | **Bewusst keiner**, mit geschriebener Begründung — die ehrliche Antwort auf eine Lehre, die keine Maschine prüfen kann („sieht das für einen Menschen richtig aus?"). |

Die Reihenfolge der Fragen bei jeder neuen Lektion, gegen den Wildwuchs
(§6 „Guard-Wildwuchs"): Deckt ein **bestehender** Durchsetzer das schon ab? Lässt
sich einer **verbreitern**, statt einen Geschwister-Guard danebenzustellen? Macht
diese Lektion eine **ältere Regel überflüssig**, sodass der Bestand *schrumpft*?
Ein neuer Guard ist das letzte Mittel. Eine Entscheidung, die zwei Regeln zu
einer zusammenführt, ist die bestmögliche Antwort.

## Was die Prüfung beweist — und was nicht

Sie beweist, dass **eine Entscheidung existiert** und dass ein benannter
Durchsetzer **auf eine reale Datei zeigt**. Das schließt genau den Defekt, den
`docs/rule-corpus-audit.md` in Zeile A29 festhält: eine Regel, die eine nie
gebaute Durchsetzung *behauptet*.

Sie beweist **nicht**, dass der genannte Durchsetzer die Lektion inhaltlich
*abdeckt*. Das kann keine billige Prüfung: Eine Namens-Heuristik würde
Fehlalarme produzieren (zwischen `render-verify-guard` und „Grüner Test, falsches
Bild" gibt es keine gemeinsame Zeichenkette), und Fehlalarme erziehen dazu, den
Durchsetzer zu umgehen (§3.32). Die Deckung bleibt daher **prüfungsgetragen** —
sie gehört in die periodische Regel-Durchsicht (`scripts/rule-review-guard.mjs`)
und in die geschuldete Vier-Augen-Pflicht für Mechanismen
(`docs/rule-corpus-audit.md`, D-b). Dieser Vorbehalt steht hier, weil die falsche
Sicherheit nicht aus der Grenze entsteht, sondern aus dem Verschweigen der Grenze.

## Lücken werden gemeldet, nicht stillschweigend zu einer „3"

Eine Lektion **ohne jede Durchsetzung** ist keine bewusste Entscheidung gegen
einen Mechanismus. Solche Zeilen tragen die Marke `LÜCKE:` in der Begründung,
sind maschinell auszählbar (`ledgerGaps`) und stehen unten noch einmal als Liste.

---

## Register

| Lektion | Titel | Ergebnis | Durchsetzer / Begründung |
|---|---|---|---|
| 3.1 | Der Batch, der stehen blieb | 2 | `scripts/batch-progress-guard.mjs`, `scripts/batch-resume-hook.mjs` — sechs Lösungsgenerationen, die letzte war der blockierende Guard. |
| 3.2 | Parallele Sessions — Fix-of-Fix auf Prozessebene | 2 | `scripts/batch-singleton.mjs`, `scripts/lock-heartbeat-hook.mjs`, `scripts/batch-doctor.mjs` — harte Exklusivität am OS-Fakt plus Repo-Heilung. |
| 3.3 | Berechtigungs-Rückfragen | 3 | Bewusst keiner: Die Lösung war eine **Konfiguration** (breite Whole-Tool-Allows in `.claude/settings.json`), kein Verhalten. Eine ausgebliebene Rückfrage ist maschinell nicht beobachtbar, und Settings-Edits fragen immer nach — ein Guard hätte nichts zu prüfen. |
| 3.4 | Das Dashboard: Aktualität und Formtreue | 2 | `scripts/dashboard-guard.mjs`, `scripts/dashboard-integrity-guard.mjs`, `scripts/dashboard-conciseness-guard.mjs`, `scripts/dashboard-card-topic-guard.mjs` — ein Prüfer je Vertragsklausel, weil die Klauseln einzeln fielen. |
| 3.5 | „Grüner Test, falsches Bild" — die gefährlichste Falle | 1 | `scripts/render-verify-guard.mjs` deckt die **sichtbare** Klasse ab (Bild auf beiden Backends). Der allgemeine Satz „reales Signal, erreichbarer Zustand" bleibt urteilsgetragen — `docs/rule-corpus-audit.md` D-l hält fest, dass die nicht-visuellen Klassen offen sind. |
| 3.6 | Backend-Divergenz WebGPU/WebGL2 | 2 | `scripts/render-verify-guard.mjs`, `scripts/verify/tiers.mjs` — ein stiller Backend-Fallback schlägt seit `assertBackend` laut fehl. |
| 3.7 | Feature-Regressionen im Spielcode | 1 | `scripts/pre-push-gate.mjs` erzwingt das schnelle Gate vor jedem Push auf den ausgelieferten Zweig — die Regel „Fast-Gate nach **jedem** Merge" hing vorher am Gedächtnis. Die Exit-Pfad-Testdisziplin selbst bleibt Auftragsregel. |
| 3.8 | Flakes unter Last — „ruhige Maschine" | 3 | Bewusst keiner: Der Guard müsste die Systemlast der **Nutzer**-Maschine messen und ein Rot verwerfen — genau die Vermischung von Messung und Urteil, vor der §3.22 warnt. Die Unterscheidung „gleiche Fehlschlagmenge zweimal = echtes Signal" ist Urteilssache. |
| 3.9 | „Wieso muss ich dich auf Bugs hinweisen?" | 3 | Bewusst keiner: Das QS-Framework (`docs/maximum-qa.md`) ist eine **Phasenreihenfolge**, kein prüfbarer Zustand; seine harte Kante ist der Closing-Vollständigkeits-Gate (§3.15). Die Pflichtfrage „sieht das für einen Menschen richtig aus?" ist per Definition menschlich. |
| 3.10 | Kleinere, aber lehrreiche Klassen | 3 | Sammelabschnitt aus sechs Kleinklassen. Die durchgesetzten Teile liegen bei ihren eigenen Lektionen (Deploy-Hygiene → `scripts/pre-push-gate.mjs`, Doku-Drift → 3.21, Token-Budget → 3.31). Eigenständig bleiben hier gemessene-statt-geschätzte Zahlen, Kommunikationsregeln und stille Verschlechterung — alle drei prüfen ein Urteil, keinen Zustand. |
| 3.11 | Nachweise sind zustandsgebunden | 1 | `scripts/render-verify-state.mjs`, `scripts/render-verify-guard.mjs` — der Nachweis war schon HEAD-gebunden; die Lektion schärfte den **Umgang** damit (gegen den Zielzustand laufen lassen), nicht den Mechanismus. |
| 3.12 | Ein Test kodiert eine veränderliche Vorgabe fest | 3 | Bewusst keiner: Ob eine Schwelle gegen den ausgelieferten Default oder gegen einen alten kalibriert wurde, steht in keiner Datei — es ist die Herkunft einer Zahl. Prüfbar ist nur das Vorgehen (Baseline auf dem Vor-Änderungs-Stand), und das ist eine Handlung, kein Zustand. |
| 3.13 | Modell-Diversität nach Kritikalität | 3 | `LÜCKE:` Kein Durchsetzer. `docs/rule-corpus-audit.md` A29 hält fest, dass die Regel eine Stop-Hook-Prüfung **behauptet**, die nie existierte; D-b beschreibt den Bau (Attestierung am Mechanismus-Datei + Name des prüfenden Modells, das autorierende Modell abgelehnt). Als eigener Arbeitspunkt geführt — gemeinsam mit 3.19, denn beide brauchen **denselben** Durchsetzer, nicht zwei. |
| 3.14 | Fast-Gate ≠ Release-Gate | 1 | `scripts/closing-guard.mjs`, `scripts/pre-push-gate.mjs` — der bestehende Closing-Gate deckt die Auslieferungsseite ab; die Lektion begründet, warum er nicht durch das schnelle Gate ersetzbar ist. |
| 3.15 | Vollständigkeit eines Prozesses braucht ein Gate | 2 | `scripts/closing-guard-core.mjs`, `scripts/closing-guard.mjs` — kein Versions-Tag, solange ein Closing-Schritt unbelegt ist. |
| 3.16 | Mechanismus ZUERST — das übergeordnete Prinzip | 2 | `scripts/retro-core.mjs` (`evaluateLedger`) + `scripts/retro-currency-guard.mjs` + dieses Register. Die Meta-Regel war bis zum 27.07.2026 selbst nur eine Regel; sie ist jetzt je Lektion eine erfasste, geprüfte Entscheidung. |
| 3.17 | Stille Modell-Degradation — der Arbeiter selbst kann das Problem sein | 2 | `scripts/model-guard-core.mjs`, `scripts/model-guard.mjs` — die Identität des ausführenden Modells als überwachte Laufzeit-Invariante, gelesen aus den Commit-Trailern. |
| 3.18 | „Erfolgreich" ist nicht „angekommen" | 2 | `scripts/push-arrival-core.mjs`, `scripts/push-arrival-guard.mjs` — kein Zug-Ende, solange Commits in keiner Remote-Ref liegen. |
| 3.19 | Vier Augen finden, was ein Modell nicht sehen kann | 3 | `LÜCKE:` Kein Durchsetzer. Identisch zu 3.13 in der Sache: Der Vier-Augen-Zwang für neue/geänderte Mechanismen ist von der Einsteiger-Anleitung angeordnet, wurde als gebaut *behauptet* und existiert nicht (`docs/rule-corpus-audit.md` A29/D-b). **Ein** Durchsetzer schließt beide Zeilen — der Bestand wächst dabei um eins, nicht um zwei. |
| 3.20 | Aufräumen ist eine Prüfaufgabe, keine Fleißaufgabe | 3 | `LÜCKE:` Kein Durchsetzer für den **Zwischenfall**-Fall. Die Form existiert und ist erzwungen — `scripts/closing-guard-core.mjs` führt eine belegpflichtige Schrittliste —, aber nur für eine Auslieferung; nach der Modell-Degradation und dem Doppel-Session-Vorfall lief das Aufräumen aus dem Gedächtnis (`docs/rule-corpus-audit.md` D-k). Die billige Fassung ist eine zweite Schrittliste im selben Guard. |
| 3.21 | Ein Fakt an fünf Stellen veraltet an vier davon | 1 | `src/config/qualityDoc.test.ts` ist das Muster (Prosa gegen den Code geprüft, der den Fakt besitzt); `scripts/retro-currency-guard.mjs` hält dieses Dokumentenpaar aktuell. Verallgemeinert ist es nicht: `docs/rule-corpus-audit.md` D-d hält vier lebende Drifts dieser Klasse fest, alle im Memory-Korpus, den kein Test erreicht. |
| 3.22 | Der rote Test, der den Unschuldigen anklagt | 3 | Bewusst keiner: „Belastet der Befund das Produkt oder die Messung?" ist eine Entscheidung **vor** dem Code-Edit; keine Prüfung kann sie beobachten (`docs/rule-corpus-audit.md` D-e führt sie ausdrücklich als nicht mechanisierbar). |
| 3.23 | Eine Regel zurückzunehmen ist teurer als sie aufzustellen | 1 | `scripts/rule-review-guard.mjs`, `scripts/rule-review-core.mjs` — die periodische Durchsicht ist der Ort, an dem Dopplungen und halb zurückgenommene Regeln auffallen. Ein eigener Guard neben ihr wäre genau der Anbau, den die Lektion beklagt. |
| 3.24 | Zweige verfallen — in Stunden, nicht Tagen | 3 | Bewusst keiner: Ein Zweigalter-Gate würde legitime lange Arbeit blockieren. Die teure Folge ist ohnehin gedeckt — `scripts/render-verify-guard.mjs` bindet den Nachweis an den Zustand, gegen den er lief, sodass ein veralteter Zweig eine erneute Prüfung erzwingt statt still durchzurutschen. |
| 3.25 | Der Regelbestand verrottet wie Code — nur unbemerkt | 2 | `scripts/rule-review-guard.mjs` (periodischer Zwang) und `scripts/guard-health-guard.mjs` (kein Durchsetzer, den nichts aufruft). Zusätzlich bricht `scripts/retro-sources.mjs` bei leerem Quellverzeichnis laut ab — der „still leer geschriebene Anhang" aus Punkt 4 der Lektion. |
| 3.26 | Ein Dokument driftet in die Rolle des Nachbardokuments | 2 | `scripts/guide-brevity-core.mjs`, `scripts/guide-brevity-guard.mjs` — Budgets je Fallstrick plus ein Detektor für Projekterfahrungs-Marker; die Fehlermeldung fordert **hinüberzukürzen**, statt das Budget zu heben. |
| 3.27 | Verbrauch pro Zeit ist nicht Verbrauch pro Arbeit | 3 | Bewusst keiner: Der Fehler war ein **Denkfehler** in einer Kostenrechnung (falscher Nenner). Prüfbar wäre höchstens, ob eine Zahl gemessen ist — und auch das nicht, siehe `docs/rule-corpus-audit.md` D-g. |
| 3.28 | Die teuerste Prüfung war die unschärfste | 1 | `scripts/render-verify-core.mjs` (`isBackendSensitivePath`), `scripts/render-verify-guard.mjs` — der bestehende Guard wurde **verengt**, nicht ersetzt: zwei Backends nur noch dort, wo sie verschieden zeichnen können. |
| 3.29 | Der Arbeitsauftrag wuchs, bis er sich selbst im Weg stand | 2 | `scripts/tasks-archive-guard-core.mjs`, `scripts/tasks-archive-guard.mjs`, `scripts/tasks-source.mjs` — offen in `TASKS.md`, erledigt im Archiv, und beide Hälften über einen Leser, der weiß, wer welche braucht. |
| 3.30 | Dieselbe Kurve beim Regeldokument — und was das Aufräumen selbst kostete | 2 | `scripts/doc-budget-core.mjs`, `scripts/doc-budget-guard.mjs` — gemessene Obergrenzen mit genau zwei zulässigen Auswegen: auslagern oder die Grenze mit schriftlicher Begründung anheben. |
| 3.31 | Die Rechnung stimmte, ihre Voraussetzung nicht — gemessene Verbrauchstreiber | 2 | `scripts/point-brief.mjs` (Zustellung statt Suche) und `scripts/guard-preflight.mjs` (die Bedingung eines Wächters vorher prüfen, statt einen vollen Zug hineinzulaufen). Die dritte Lehre — die Sitzungsgrenze — ist ein **Nutzerbefehl** und deshalb hier nicht durchsetzbar. |
| 3.32 | Ein Durchsetzer, der zu spät greift — und einer, der zu früh anschlägt | 2 | `scripts/board-first-core.mjs`, `scripts/board-first-guard.mjs` — das Versprechen über den *laufenden* Zustand wird jetzt vor der Arbeit durchgesetzt (PreToolUse), nicht am Zug-Ende. Die Fehlalarm-Hälfte sitzt als Wortgrenze in `scripts/tasks-spec-guard-core.mjs`. |
| 3.33 | Eine Ersparnis, die Nacharbeit auslöst, ist keine Ersparnis | 3 | Bewusst keiner: eine **Kostenregel** für Entscheidungen über Maßnahmen, kein prüfbarer Repo-Zustand. Ihr konkretester Fall — der zu schwache Arbeiter — ist bei 3.17 durchgesetzt. |
| 3.34 | Die Attrappe, die den Fehler verdeckt | 1 | `scripts/guard-hooks.test.mjs` — die Wächter werden gestartet, wie die Umgebung sie startet (echter Prozess, echtes stdin, echter Verdikt), statt hinter Attrappen geprüft. Die allgemeine Fassung („jedes real ausgeführte Kommando braucht einen Test, der es ausführt") ist damit für die Guard-Kette erfüllt, für beliebigen Code nicht. |
| 3.35 | Der beabsichtigte Zustand, im Präsens geschrieben | 1 | `scripts/point-brief-core.mjs`, `scripts/point-brief.mjs` scheitern laut an einem Verweis, der nirgends aufgeht — die **Referenz**-Klasse. Die **Behauptungs**-Klasse (eine Präsens-Zusicherung über den Code) bleibt offen, `docs/rule-corpus-audit.md` D-i. |
| 3.36 | Isolierung ist eine Eigenschaft der Umgebung, keine Anweisung | 1 | `scripts/worktree-reminder.mjs`, `scripts/worktree-reminder-core.mjs` plus die Worktree-Isolierung der Delegation selbst: Der Agent kann den Hauptbaum nicht anfassen, statt es zugesagt zu bekommen. |
| 3.37 | Ein Werkzeug, das rät, ersetzt still | 2 | `scripts/point-brief-core.mjs` — jeder mitgelieferte Abschnitt trägt sein Herkunftsdokument, eine Referenzkarte nennt jede Auflösung, und was nirgends aufgeht, scheitert unter Nennung aller durchsuchten Dokumente. |
| 3.38 | Fail-open EINMAL ist nicht fail-open FÜR IMMER | 1 | `scripts/render-verify-core.mjs`, `scripts/render-verify-guard.mjs` — derselbe Guard, repariert an der entscheidenden Stelle: Er lässt im Fehlerfall durch, schreibt aber keinen Zustand fort; eine unbeantwortbare Frage zählt als „vorhanden". |
| 3.39 | Neun Ausfälle an einem Tag — und was den Schaden bestimmt hat | 1 | `scripts/push-arrival-guard.mjs` sichert die zweite Hälfte („sofort gesichert"); die erste Hälfte — nach **jedem** zusammenhängenden Schritt committen — steht als bindende Zeile im Delegations-Auftrag (`scripts/point-brief.mjs`). Der Unterschied zwischen Totalverlust und Fortsetzung war genau diese Zeile. |
| 3.40 | Eine Prüfung, die zu spät kommt, ist eine Benachrichtigung | 2 | `scripts/pre-push-gate-core.mjs`, `scripts/pre-push-gate.mjs`, `scripts/git-hooks/pre-push`, verdrahtet über `scripts/enable-hooks.mjs` — die Prüfung sitzt jetzt **vor** der Handlung, und ein Test prüft die Verdrahtung selbst. |

---

## Offene Durchsetzungslücken (Stand 27.07.2026)

Aus der Rückerfassung, nicht stillschweigend als „bewusst keine" abgelegt:

1. **3.13 + 3.19 — Vier Augen bei Mechanismen.** Der wertvollste offene Posten:
   von der Einsteiger-Anleitung angeordnet, als gebaut *behauptet*
   (`docs/rule-corpus-audit.md` A29), nie existiert. **Beide Lektionen schließt
   derselbe eine Durchsetzer** — sie sind hier absichtlich als ein Posten
   geführt, damit der Bestand um eins wächst statt um zwei. Als eigener
   Arbeitspunkt geführt.
2. **3.20 — Beweisliste nach einem Zwischenfall.** Die Form ist gebaut und
   erzwungen, aber nur für die Auslieferung (`scripts/closing-guard-core.mjs`).
   Die billige Fassung ist eine zweite Schrittliste im **selben** Guard — kein
   neuer Guard.

Teil-Deckungen, die keine Lücke im Sinne dieser Liste sind, aber in der
periodischen Regel-Durchsicht wieder aufzurufen sind: 3.5 (nur die sichtbare
Klasse), 3.21 (nur dokumentseitig, nicht im Memory-Korpus), 3.34 (nur die
Guard-Kette), 3.35 (nur die Referenz-, nicht die Behauptungsklasse).
