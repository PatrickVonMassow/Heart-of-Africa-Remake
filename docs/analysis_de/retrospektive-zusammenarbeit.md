# Retrospektive der Zusammenarbeit — „The Heart of Africa" (Remake-POC)

Zeitraum: 06.07.–27.07.2026 · Quellen: Git-Historie (alle Branches), die Memory-Dateien, TASKS.md, `docs/`, die Guard-/Hook-Skripte in `scripts/`, `.claude/settings.json` und Stichproben aus den Sitzungs-Transkripten.

Selbstkritisch gemeint: festgehalten werden die wiederkehrenden Fehlerklassen, ihre Ursachen und die Lehren — knapp, damit sie gelesen werden.

---

## 1. Kernthese: Erinnerung wirkt nicht, nur Durchsetzung

Jedes verhaltensbezogene Problem durchlief denselben Bogen, und erst die dritte Stufe hielt: **Vorsatz** („ich merke mir das", hält Stunden) → **Memory-Eintrag** (hilft, versagt reproduzierbar unter Last) → **erzwingender Mechanismus** (Stop-Hook, atomarer Lock, Recorder).

Das Musterbeispiel sind die Chat-Zeitstempel: neun Eskalationsstufen, acht weiche Maßnahmen (Merken, Memory, Hook-Banner oben, unten, PostToolUse-Injektion …) — gelöst erst vom blockierenden `timestamp-guard`, der das Turn-Ende verweigert. Der Grund, warum Erinnerung strukturell versagt: Unter Last fällt zuerst die Regel weg, die keinen harten Prüfpunkt hat. Ein Guard verlagert die Einhaltung vom Arbeitsgedächtnis in die Infrastruktur — er ermüdet nicht.

**Lehre:** Jede wiederholt verletzte Regel so früh wie möglich in einen blockierenden Check gießen. Ein Guard kostet ein bis zwei Stunden; neun Frustrationszyklen kosten mehr.

---

## 2. Zeitleiste der Härtungs-Meilensteine

| Datum | Meilenstein |
|---|---|
| 06.07. | Projektstart (POC nach CLAUDE.md/design.md) |
| 07.07. | Erster Totalausfall im Deploy → Revert der Render-Pipeline; Lint/Audit werden Akzeptanzkriterium |
| 08.07. | Maximal breite Permission-Allows + `dontAsk` (Nutzerentscheid) |
| 09.07. | Deutsch als Chatsprache, Zeitstempel-Wunsch, hybride Testarchitektur |
| 13.–14.07. | Append-and-defer; Scoped Regression; **1. Parallel-Session-Vorfall** → erster Advisory-Lock |
| 15.07. | Lock-Rückfall; Akkuratheits-Prinzip („alte Saves dürfen brechen") |
| 16.07. | „Du hast mit der Arbeit aufgehört" → never-stop-the-batch; „messen, nie schätzen" |
| 18.07. | „Das Dashboard ist völlig ausgeartet" → **bindende 4-Sektionen-Struktur**; Regel „realistischer Zoom" |
| 19.07. | Irrtum korrigiert: WebGPU IST headless testbar; Cron-Heartbeat gegen Idle |
| 20.07. | Token-Vorfall (~3 M im Fan-out) → Budget-Regel; Modell-Diversität; „Wieso muss ich dich auf Bugs hinweisen?" |
| 21.07. | **Erster blockierender Guard** (dashboard-guard); „Maximale QS" definiert |
| 22.07. | Feature-Branch-Workflow, **maximale Delegation**, Guard-Welle; Backend-Lehrstück 210 → render-verify-guard |
| 23.07. | Weitere Guards; 191 Commits/Tag; nachts **3. Parallel-Session-Vorfall** |
| 24.07. | **Harter Singleton**; harter timestamp-guard; „ruhige Maschine"; erster Benchmark auf Nutzer-Hardware |
| 25.07. | Stille Modell-Degradation + Aufräum-Pass; Regel-Audit über den ganzen Bestand; Guard-Gesundheit |
| 26.07. | Kosten-vs-Rate-Korrektur bei der Parallelität; Commit-Umfangs-Wächter |
| 27.07. | Gemessene Verbrauchstreiber → Kurzbrief je Auftrag statt Dokumentensuche; Board-Gate **vor** der Arbeit; Vorprüfung der Wächter |
| 28.07. | Fünfeinhalb Stunden Stillstand → die Grenze wird **genommen**, nicht nur erlaubt; erste vollständig beobachtete Übergabe; drei Messfenster schmaler als das Gemessene (§3.44) |
| 28.07. | Board dreimal am selben Handgriff zerbrochen → Strukturprüfung **vor** die Veröffentlichung (§3.45); 3546 grüne Tests über einer stillschweigend geschrumpften Menge (§3.46) |

Muster: Ab dem 22.07. explodiert die Commit-Rate (Delegation) — und genau dann häufen sich die Infrastruktur-Vorfälle. **Skalierung der Autonomie erzeugt eine eigene Problemklasse, die die Feature-Arbeit zeitweise überholt.**

---

## 3. Die wiederkehrenden Problemklassen

*Eskalationszahlen, Schweregrade und der Absicherungsstand je Regel stehen maschinell gepflegt in Anhang A.*

### 3.1 Der Batch, der stehen blieb

Das langlebigste Prozessproblem: Der Batch stoppte still, sobald eine Nutzerfrage kam oder ein Turn auf Prosa endete. Ursache: Ein Turn endet, wenn keine Tools mehr gerufen werden — jede Nutzernachricht wirkte wie ein nie erteilter Stopp-Befehl, verschleiert von einem Dashboard, das weiter „in Arbeit" zeigte. Der Nutzer musste die Aufsicht zwischenzeitlich mit selbstgebauten Watchdog-Prompts automatisieren; das ist der deutlichste Einzelbefund dieser Retrospektive.

Sechs Lösungsgenerationen: Verhaltensregel → Wakeup-Re-Arm → Cron-Heartbeat → Stop-Hook `batch-progress-guard` → SessionStart-Resume → OS-Task. Seit dem 24.07. gilt zusätzlich: Eine Nutzernachricht ist ein **Interrupt, keine Blockade** — bei Unklarheit die vernünftigste Annahme treffen, echte Entscheidungen als „Von dir zu klären" parken und weiterarbeiten.

**Lehre:** Der Übergang von „ein Loch flicken" zu „alle Löcher aufzählen" (Failure-Mode-Tabelle) war selbst die Lösung.

### 3.2 Parallele Sessions — Fix-of-Fix auf Prozessebene

Drei Vorfälle, jeder durch die Lösung des vorherigen mitverursacht: ein geschlossenes Fenster ließ eine `claude.exe` drei Tage headless weiterlaufen → Advisory-Lock; nach Lock-Freigabe übernahm die lebende Hintergrund-Session erneut; schließlich spawnte der Scheduled Task — gebaut, damit der Batch nie stirbt — eine zweite Session **neben einer lebenden**, und beide schrieben ~90 min parallel auf `main`. Ursache: Der Heartbeat wurde nur bei abgeschlossenen Tool-Calls geschrieben, ein langer Turn ließ ihn verhungern, die Alters-Heuristik erklärte die lebende Session für tot — und alle zehn Guards waren ownership-blind.

Gelöst durch den harten Singleton: Liveness am **OS-PID + Prozessstartzeit**, **atomare** Acquisition, Stand-down aller Guards für Nicht-Owner, Parallel-Detektor, `batch-doctor` zur Repo-Heilung.

**Lehren:** Liveness nie aus dem Alter herleiten, immer aus einem OS-Fakt. Check-then-Set ist keine Exklusivität. Wer Redundanz für Autonomie baut, baut die **Exklusivität zuerst** — hier geschah es umgekehrt, und genau in dieser Lücke passierten die Vorfälle.

Die Eindämmung ist am **27.07.2026** wieder aufgehoben: Der Scheduled Task ist auf Nutzerbefehl erneut scharf (`Enable-ScheduledTask`, State *Ready*), nachdem der Singleton live gegengeprüft war — während eine Sitzung die Sperre hielt, spawnte der Starter nichts, sondern meldete „owner alive". Das ist die Vorbedingung der autonomen Sitzungsgrenze, und es zeigt die Reihenfolge, die vorher fehlte: erst die Exklusivität am OS-Fakt beweisen, dann die Redundanz wieder einschalten. Eine spontan auftauchende zweite Sitzung ist seitdem **erwartetes Verhalten**, kein Vorfall — solange sie für den Lock-Owner zurücktritt.

### 3.3 Berechtigungs-Rückfragen

Der erste Ansatz („Buch führen, Regeln vorschlagen") scheiterte, weil Präfix-Matching an zusammengesetzten Kommandos, `cd`-Präfixen und Heredocs vorbeigreift. Gelöst durch breite Whole-Tool-Allows plus zwei nicht offensichtliche Einsichten: Settings greifen **erst nach Session-Neustart**, und die größten Prompt-Verursacher waren **selbstverschuldete Kommandoformen**.

**Lehre:** Bei wiederholter Umgebungs-Reibung erst die Mechanik des Matchings verstehen, statt Regeln zu stapeln — und die eigenen Gewohnheiten als Mitverursacher prüfen.

### 3.4 Das Dashboard: Aktualität und Formtreue

Zwei Dauerbaustellen. **Aktualität:** Der Nutzer steuerte den Batch vom Handy; ein veralteter Stand war Blindflug. Erzwungen erst durch `dashboard-guard` (Blockade, wenn HEAD sich seit dem letzten Review bewegte) plus `focus.mjs` — ein bemerkenswertes Primitiv: Da die Maschine nicht wissen kann, woran ich arbeite, zwingt es mich, den Fokus **prüfbar zu deklarieren**. **Formtreue:** Nach „Das Dashboard ist völlig ausgeartet" wurde die 4-Sektionen-Struktur zum Vertrag; die weiteren Formverstöße fielen einzeln nach und bekamen je einen eigenen Prüfer.

**Lehren:** Vom Nutzer festgelegte Artefakt-Strukturen sind eingefroren — Verbesserungen werden vorgeschlagen, nicht umgesetzt. Und ein mehrteiliger Kontrakt braucht **einen Prüfer pro Klausel**: Die Klauseln fielen einzeln, nicht gemeinsam.

### 3.5 „Grüner Test, falsches Bild" — die gefährlichste Falle

Mehrfach bestand die Automatik, während der Nutzer den Bug weiter sah: drei Runden Uniform-Checks waren grün, während vom Wetter nichts zu sehen war; Zoom-Probes liefen gegen einen **geratenen** Sichtradius statt gegen die Frustum-Projektion; Haze-Probes liefen bei einem Debug-Zoom, in dem der Effekt gar nicht gezeichnet wird.

**Lehre (universell):** Jede Verifikation braucht das **reale Signal**, einen **erreichbaren Zustand** und bei Sichtbarem das Auge als letzte Instanz. Ein grüner Proxy-Test ist gefährlicher als kein Test, weil er falsche Sicherheit erzeugt.

### 3.6 Backend-Divergenz WebGPU/WebGL2

Drei Lehrstücke: Der erste TRAA/SSR-Umbau war WebGPU-only gebaut und die WebGL2-Suite grün — auf dem echten Backend schwarzer Bildschirm. „WebGPU ist headless untestbar" galt wochenlang und war ein **Tooling-Irrtum** (System-Chrome liefert ein volles Device). Und ein Küsten-Fix wurde „fertig" gemeldet, verifiziert nur auf WebGL2 — auf dem Backend des Nutzers stand die Treppe noch.

Gelöst in zwei Schichten: die WebGPU-Verify-Lane mit `assertBackend` (ein stiller Fallback schlägt LAUT fehl) und der `render-verify-guard`, der ein Turn-Ende blockiert, solange ein Render-Change keinen **mechanisch aufgezeichneten** grünen Lauf pro Backend hat.

**Lehre:** Konfigurationsmatrizen (Backend × Zoom × Sprache × Jahreszeit) explizit aufspannen; „auf einer Konfiguration grün" ist nicht „fertig"; und Ist-Zustands-Annahmen der Infrastruktur asserten statt glauben.

### 3.7 Feature-Regressionen im Spielcode

Mehrere Ketten, in denen ein Fix das nächste Problem erzeugte: die Krokodil-Saga über sieben Punkte und ~49 Commits; ein neuer Elefanten-Collider brach das Trampeln; eine Mündungs-Überbrückung ließ das Nil-Band durch einen See scheinen; „Wildlife-Dramen feuern gar nicht mehr" — eine ganze Systemklasse still regrediert. Prägend war früh, dass die Reise-Kollision nur das *Anhalten* am Hindernis testete, nicht das *Wieder-Wegsteuern*: Der Spieler klebte fest, die Regression blieb grün.

**Ursache:** In einem dicht gekoppelten Verhaltenssystem hat fast jede Änderung Fernwirkungen; Tests deckten den Happy Path des neuen Features, nicht die Nachbarschaft. **Bewährt:** Exit-Pfad-Tests auf der billigen Vitest-Schicht, In-Game-Invarianten als Dauerdetektor, die Architekturlinie „EIN geteilter Kern statt zweiter Zustandsmaschine", und der Fast-Gate-Lauf nach **jedem** Merge — zwei sauber automergende Punkte können zusammen brechen.

### 3.8 Flakes unter Last — „ruhige Maschine"

Rotierende Fehlschläge hatten dreimal eine je andere reale Ursache: der offene Dev-Server des Nutzers, sein paralleles Spielen während meiner Läufe, und ab dem 22.07. die **eigene Agenten-Flotte** (ein Last-Frame löste genau den Storm-Check aus, den es zu detektieren galt). Regel seitdem: Ein Rot zählt erst auf ruhiger Maschine; *unterschiedliche* Fehlschlagmengen zwischen Läufen sind eine Last-Signatur, dieselbe Menge zweimal ein echtes Signal.

**Lehre:** Jede Messung braucht eine kontrollierte Umgebung, sonst misst man die Umgebung — identisch auf Benchmarks angewandt.

### 3.9 „Wieso muss ich dich auf Bugs hinweisen?"

Der wichtigste Nutzer-Impuls: Ein Großteil der Punkte stammte aus seinen Screenshots. Antwort war das QS-Framework mit fester Phasenreihenfolge (Kohärenz-Audit zuerst, weil er umbauen darf; dann Baseline, scharfe Invarianten, Backend-Abdeckung, Bug-Finder, Zusatzmethoden, striktes flake-freies Closing), ergänzt um Modell-Diversität und die Pflichtfrage „Sieht das für einen Menschen richtig aus?".

**Ehrlich:** Auch mit Framework blieb der Nutzer bis zuletzt eine wesentliche Bug-Quelle. Die Invarianten- und Finder-Schicht gehört in Woche 1, nicht in Woche 3.

### 3.10 Kleinere, aber lehrreiche Klassen

- **Zeiten erfunden statt gemessen:** Nach einer echten Messung schrieb ich später eine hochgerechnete Uhrzeit. Seitdem stammt *jede* Zahl aus einer Messung.
- **Token-Explosion:** Ein Fan-out aus über sechzig Agenten riss das Session-Limit. Regel: Findings inline verifizieren, Fan-outs vorher beziffern und freigeben lassen.
- **Kommunikationsregeln:** Deutsch dreimal angemahnt — beim dritten Mal war der Chat deutsch, aber die Todo-Einträge englisch. Eine Kommunikationsregel gilt für **alle** sichtbaren Ausgaben.
- **Stille Verschlechterung:** Eine „Optimierung" hatte die Sprachausgabe spürbar verschlechtert. Ein Tradeoff-Umbau an etwas Funktionierendem ist eine **Nutzer-Entscheidung**; „das war mal besser" zuerst gegen die Historie prüfen.
- **Doku-Drift:** Design- und Build-Dokument ziehen im **selben Commit** mit; Referenzen statt Duplikate, weil Duplikate driften.
- **Deploy- und Mess-Hygiene:** Halbfertiges wurde direkt auf den Hauptzweig geschoben und war damit in der Live-Demo sichtbar → Feature-Zweige, Hauptzweig = ausgelieferter Stand. Und ein Startdialog ruinierte die erste Messung auf der Nutzer-Hardware. **Lehre:** Das Urteil des Nutzers gilt immer dem deployten Stand, und ein Messlauf muss frei von Bedienoberfläche sein, die ihn stört.

### 3.11 Nachweise sind zustandsgebunden

Der `render-verify-guard` zeichnet einen bestandenen Lauf HEAD-gebunden auf. Ich verifizierte im Zweig-Worktree und mergte dann — für den main-HEAD zählte das nicht, und der Guard blockierte jedes Turn-Ende, bis die langsame Suite gegen main durchlief: ~30 Züge Blockschleife.

**Lehre:** Jeder maschinell getrackte Nachweis gilt für den Zustand, gegen den er lief. Die Zweig-Vorprüfung verhindert, Kaputtes zu mergen — den Guard klärt nur ein Lauf gegen den **Zielzustand**.

### 3.12 Ein Test kodiert eine veränderliche Vorgabe fest

Ein Kantenenergie-Check des Bodens fiel, nachdem SSAO per Nutzerentscheid im Standard ausging: Die Schwelle war **mit** SSAO kalibriert worden. Das Produkt war nicht regrediert — der Test hatte einen damaligen Default eingebacken. Getrennt wurde das durch eine **Baseline auf dem Vor-Änderungs-Stand**; der Fix war die Rekalibrierung auf den ausgelieferten Default, am Bild verifiziert statt blind abgesenkt.

**Lehre:** Prüfschwellen an den SHIPPED-Zustand binden und ein Rot per Baseline in „Annahme veraltet" vs. „echter Regress" einordnen.

### 3.13 Modell-Diversität nach Kritikalität

Ein zweites Modell kam anfangs nur bei Audits und bei Festgefahrenheit. Der Nutzer verallgemeinerte das: vor dem Bau **Schwierigkeit × Kritikalität** einschätzen und bei hoher Einstufung — besonders bei Mechanismen, die immer funktionieren müssen — Plan *und* Ergebnis vom anderen Modell prüfen lassen.

Die Gegenrichtung wurde später genauso wichtig: Eine Gegenprüfung kostet ungefähr so viel wie die Arbeit selbst und verdoppelt die Wartezeit — über jede Kleinigkeit gestülpt, wird sie zur Formalie, die niemand mehr ernst nimmt. Die Grenze zieht nicht die Schwierigkeit, sondern die **Sichtbarkeit des Fehlers**: Was den Ablauf steuert oder Arbeit vernichten kann (Wächter, Sperren, Nebenläufigkeit, Speichern/Laden, Migrationen, Veröffentlichungen), wird immer gegengeprüft; was ein schneller Test sofort zeigt (Texte, Balancewerte, Kulissen, Umbenennungen), nie. Der Nutzen ist an der richtigen Stelle real: An einem Abend mit drei Gegenprüfungen fand das zweite Modell jedes Mal etwas Substanzielles — einen Zustandspfad, der beim Aufräumen mitgelöscht worden wäre, eine Prüfung, die im Fehlerfall die riskante statt der vorsichtigen Antwort gab, und einen kaputten Abhängigkeitsbaum, den der Testlauf als „grün" gemeldet hatte (3.46). Keiner dieser Funde war eine Geschmacksfrage.

**Lehre:** Modell-Diversität ist kein Audit-Sonderfall, sondern eine **Funktion der Kritikalität** — und hält, wie alles hier, nur als Mechanismus. Ihre Obergrenze ist dieselbe Funktion von unten: Wo der Fehler sofort auffällt, sind zweite Augen verschwendete Zeit.

### 3.14 Fast-Gate ≠ Release-Gate

Der verpflichtende Closing-Lauf fing beim v0.2-Tag sofort einen strikten Typfehler, den die schnelle Schicht durchgelassen hatte (Testdateien werden dort transpiliert, nicht typgeprüft).

**Lehre:** Die schnelle Prüfung ist bewusst lax genug, um schnell zu sein — deshalb ist die strengste Prüfung unmittelbar vor der Auslieferung nicht verhandelbar.

### 3.15 Vollständigkeit eines Prozesses braucht ein Gate

Beim v0.2-Release setzte ich den Closing-Zyklus mit der Regression gleich und übersprang den Aufräum-Teil — also genau das, was ein Closing von einer Regression unterscheidet. Der Prozess war vollständig niedergeschrieben; seine Einhaltung hing an meinem Gedächtnis, und unter Druck fiel der nicht-erzwungene Schritt weg.

**Lehre:** Ein mehrschrittiger Prozess braucht einen **Vollständigkeits-Gate** über das Ganze, der das Ergebnis blockiert, solange nicht jeder Schritt mit Beleg abgehakt ist.

### 3.16 Mechanismus ZUERST — das übergeordnete Prinzip

Die alte Selbstheilungsregel lautete: Mechanismus bauen, wenn derselbe Fehler ein **zweites** Mal passiert. Der Nutzer verschärfte sie: Warum erst so weit kommen lassen? Die gesamte Historie dieses Dokuments ist der Beleg — fast jede Zeile oben ist ein Fehler, der sich wiederholte, bis ein Guard ihn unmöglich machte.

**Bindend:** Jede Regel, die wirklich gelten soll, bekommt **von Anfang an** einen erzwingenden Mechanismus; der Aufwand richtet sich nach der Wichtigkeit der Regel, die Grundhaltung heißt „erzwingen statt erinnern".

Seit dem 27.07.2026 gilt das auch für diesen Satz selbst: Er war bis dahin die einzige Regel des Dokuments ohne Durchsetzung — eine Regel, die Mechanismen fordert und selbst keiner ist. Jede Lektion dieses Abschnitts trägt jetzt eine erfasste Entscheidung in `lesson-mechanisms.md` (bestehender Durchsetzer verbreitert / neuer / bewusst keiner mit Begründung), und `retro-currency-guard` blockiert das Zug-Ende, solange eine fehlt. Zwei Lektionen kamen dabei als **ungedeckt** heraus, statt stillschweigend als „bewusst keine" durchzugehen; sie stehen als Lücken am Fuß des Registers.

### 3.17 Stille Modell-Degradation — der Arbeiter selbst kann das Problem sein

Eine Batch-Session lief unbemerkt auf einem schwächeren Modell (Beleg: die Commit-Trailer) und produzierte in 14 Minuten drei als „fertig" getickte Punkte, die keiner Spec genügten: ein Placebo-Fix mit Schein-Tests, ein unverdrahteter Stub, ein Selbstbestätigungs-„Audit". Alle bisherigen Guards prüften die *Arbeit*, keiner den *Arbeiter*. Ein degradiertes Modell scheitert nicht laut, sondern liefert selbstbewusst Attrappen — und befolgt gerade dann die Regeln am wenigsten.

**Lehre:** Im agentischen Dauerbetrieb gehört die Identität des ausführenden Modells zu den überwachten Invarianten — sie ist eine Laufzeit-Variable, keine Konstante. Der `model-guard` liest die Trailer und blockiert beim ersten fremden Commit.

### 3.18 „Erfolgreich" ist nicht „angekommen"

Eine ganze Nachtschicht (13 Commits) lag nur lokal: Die Session stand auf einem Feature-Branch, committete dorthin und pushte `origin main` — was den unveränderten lokalen `main` überträgt. Git meldet das als Erfolg; nur ein Vergleich gegen `origin/main` deckt es auf.

**Lehre:** Eine Erfolgsmeldung belegt, dass das Werkzeug lief — nicht, dass das Gewollte geschah. Bei jeder Aktion mit Fernwirkung ist der **beobachtete Zielzustand** der Beleg. Dieselbe Klasse steckt hinter §3.5 und hinter „Datei editiert ≠ Board veröffentlicht".

### 3.19 Vier Augen finden, was ein Modell nicht sehen kann

Der Dashboard-Konsistenz-Guard wurde erstmals konsequent zweimodellig gebaut. Der Plan-Review kippte zwei Entwurfsentscheidungen vor dem Schaden; der Ergebnis-Review fand vier echte Fehler im fertigen Code. Bemerkenswert ist die Art der Funde: Alle waren Lücken zwischen dem Modell im Kopf des Autors und der Wirklichkeit der Daten.

**Lehre:** Der zweite Blick ist kein Qualitätssiegel, sondern eine **andere Datenquelle**.

### 3.20 Aufräumen ist eine Prüfaufgabe, keine Fleißaufgabe

Nach der Degradation hielt ich das Aufräumen für erledigt; der Nutzer fand danach zufällig drei weitere Rückstände. Ursache: Ich hatte aufgeräumt, *wo ich Schaden vermutete*, statt systematisch **alle Orte** zu prüfen, an denen Schaden liegen kann. Erst ein Durchlauf mit expliziten Abschnitten machte die Abdeckung beurteilbar — und förderte zwei Funde zutage, die ich sonst nie angesehen hätte.

**Lehre:** Nach einem Zwischenfall ist „aufgeräumt" eine Behauptung, die eine Beweisliste braucht.

### 3.21 Ein Fakt an fünf Stellen veraltet an vier davon

Ein Kohärenz-Audit fand acht Stellen, an denen die Dokumente etwas anderes behaupten als der Code tut; eine Forensik fand elf weitere, die älteste vom ersten Projekttag. Die Ursache ist nicht Nachlässigkeit, sondern **Redundanz ohne Mechanismus**: Wer schreibt, aktualisiert die Stelle, an der er gerade ist. Zwei Verschärfungen: Ein Dokumenten-Audit **ohne** Code-Abgleich macht die Drift schlimmer, und Dokumente werden gegen die Spezifikation geschrieben statt gegen den ausgelieferten Code.

Dieselbe Wette schließt, wer eine Beschriftung im **Testcode** wörtlich erwartet, statt sie aus der Sprachdatei zu lesen: Eine live laufende Prüfung suchte den deutschen Platzhalter, während ihre Suite auf Englisch lief — sie schlug bei völlig korrektem Verhalten fehl. Eine Prüfzusicherung ist eine Kopie wie jede andere.

**Lehre:** Jede Zahl, die in zwei Dokumenten steht, ist eine Wette darauf, dass beide gleichzeitig gepflegt werden — und diese Wette verliert man. Ein verbindlicher Ort je Faktum, alle anderen verweisen; für Tests heißt das, gegen die Quelle der Wahrheit zu prüfen statt gegen eine abgeschriebene Zeichenkette.

### 3.22 Der rote Test, der den Unschuldigen anklagt

Drei Fehlalarme an einem Tag machten das Muster sichtbar: Eine Prüfung markierte ihr Testtier und wollte es an der Markierung entfernen — das Nachladesystem überschrieb sie, das Tier blieb stehen und rief zu Recht. Eine zweite verließ sich stillschweigend auf einen zufälligen Abstand, der unter Last kippte. Eine dritte meldete ein Speicherleck, das ein **Einbruch** war: Beim Ablesen war die alte Renderkette schon freigegeben und die neue mangels gerendertem Bild noch nicht angelegt.

Gemeinsamer Nenner: **Jede kodierte eine Annahme über die Umgebung, die später nicht mehr galt.** Alle drei waren lange richtig und wurden es durch fremde, korrekte Änderungen nicht mehr. Der Schaden entstand jeweils erst danach — im ersten Fall baute eine Sitzung gesunden Code um.

**Lehren:** Ein roter Test ist eine **Hypothese über das Produkt, kein Urteil**; vor jedem Fix die Frage „belastet der Befund das Produkt oder die Messung?", entschieden durch ein Experiment statt durch Plausibilität. Und eine Messung braucht einen eingeschwungenen Zustand: Der Prüfcode erzwingt jetzt ein Bild, pollt bis zur Wiederholung und wertet eine *fallende* Zahl als unbrauchbar statt als Erfolg.

### 3.23 Eine Regel zurückzunehmen ist teurer als sie aufzustellen

Die Änderung der Modell-Rollen kostete Arbeit an **sechs** Orten: drei Memories, die Projektdoku, der Autostart-Aufruf, die Session-Start-Meldung. Zwei Memories mussten als *zurückgezogen* markiert werden statt gelöscht, und die eigentliche Arbeit war, die überlebende Einsicht herauszuschälen. Beim Nachziehen baute ich prompt eine **zweite** Modell-Regel neben die bestehende — genau die Dopplung, gegen die am selben Morgen der Mechanismus gefordert worden war.

**Lehren:** Der einzige verbindliche Ort lohnt doppelt. Und eine frisch beschlossene Regel schützt nicht davor, sie im selben Zug zu brechen, solange kein Mechanismus sie prüft.

### 3.24 Zweige verfallen — in Stunden, nicht Tagen

Ein Zweig vom Vortag stand nach 24 Stunden **219 Commits** zurück; seine drei Dateien hatten sich unterdessen weiterentwickelt. Er war faktisch unmergebar und wurde stillgelegt, die Idee wanderte in den passenden offenen Punkt.

**Lehre:** Bei hoher Merge-Frequenz ist „halte Zweige kurz" keine Stilfrage. Vor der Endverifikation immer den Hauptzweig hereinholen und auf dem synchronisierten Stand prüfen — sonst verifiziert man etwas, das so nie landet.

### 3.25 Der Regelbestand verrottet wie Code — nur unbemerkt

Ein Audit über alle 88 Regeln und 25 Wächter fand zehn Widersprüche, sechs Redundanz-Cluster (das Release-Verfahren stand viermal, die Modell-Regel sechsmal), Regeln, die eine nie gebaute Durchsetzung *behaupten*, und ein Dutzend veraltete Einträge. Vier Erkenntnisse:

1. **Der Bestand altert wie Code, aber ohne Compiler.** Eine veraltete Funktion fällt beim Bauen auf; eine veraltete Regel schweigt und wird trotzdem befolgt. Ein Regelkorpus braucht periodisches Aufräumen — zusammenführen, verweisen, zurückziehen statt löschen.
2. **Die gefährlichsten Widersprüche stehen INNERHALB einer Datei**, weil man den Anbau schreibt und das Bestehende nicht mehr liest. Niemand prüft denselben Text zweimal.
3. **Der lauteste Kanal lehrt den größten Fehler.** Die bei *jedem* Prompt eingespielte Erinnerung transportierte zwei zurückgezogene Regeln. Je höher die Frequenz eines Kanals, desto strenger seine Aktualitätsprüfung — idealerweise generiert aus derselben Quelle, die der Wächter prüft.
4. **Halbtote Mechanismen sind gefährlicher als fehlende.** Ein Wächter, der nur von einer Shell scharfgeschaltet wird, die dieses Projekt kaum benutzt, *existiert* — und feuert nie. **Ein Wächter, der nie auslöst, und einer, der immer auslöst, sind beide kaputt.** Verwandt: Ein negatives Ergebnis muss von „konnte nicht messen" unterscheidbar sein — mein eigener Rundlauf über alle Wächter meldete „alle still" und maß nichts. Genau das wiederholte sich später: Ein Generator, aus einem Nebenbaum gestartet, fand sein Quellverzeichnis nicht, schrieb die maschinell gepflegte Übersicht dieses Dokuments als **leer** und meldete Erfolg; 65 Zeilen waren weg, bevor ein Blick in den Diff es fing. Die Lehre stand da längst — sie hatte nur keinen Mechanismus. Jetzt bricht der Generator bei leerem Quellverzeichnis ab und nennt die wahrscheinliche Ursache.

### 3.26 Ein Dokument driftet in die Rolle des Nachbardokuments

Die Einsteiger-Anleitung und diese Retrospektive haben getrennte Aufgaben; nach einigen Wochen war die Anleitung zur Projektchronik geworden — Fallstricke mit Datumsangaben, Zählwerten und Systemnamen, zwei reine Logbuch-Notizen. Der Mechanismus dahinter ist banal und deshalb hartnäckig: **Wer eine Lehre aufschreibt, schreibt sie dorthin, wo er gerade ist.** Kein einzelner Schritt war falsch, die Summe war es — und weil nichts *falsch* wird, sondern nur am falschen Ort steht, schlägt kein Abgleich gegen den Code an.

Die Konsequenz war, die Kürze **messbar** zu machen: Budgets für Zeilen und Wörter, ein Budget pro Fallstrick, die Pflicht zum umsetzbaren Prompt und ein Detektor für Projekterfahrungs-Marker. Wichtig war die Formulierung der Fehlermeldung: Sie fordert **hinüberzukürzen statt das Budget zu erhöhen** — ohne diesen Satz wird ein Budget beim ersten Anstoßen einfach hochgesetzt.

**Lehre:** Wo zwei Dokumente sich ein Thema teilen, braucht die Grenze einen Wächter; die Rollenbeschreibung im Vorwort hält sie nicht.

### 3.27 Verbrauch pro Zeit ist nicht Verbrauch pro Arbeit

Ich hatte erklärt, parallele Stränge vervielfachten den Token-Verbrauch, weil jeder Agent seinen Kontext neu füllen müsse — und den Agenten-Pool von drei auf zwei verkleinert. Der Nutzer widersprach mit einer Frage: Für einen neuen Punkt wird der Kontext ohnehin geleert; wieso macht es dann einen Unterschied? Er hat recht. Ein Punkt kostet **eine** Kontextfüllung, gleich in welchem Prozess. Parallelität vervielfacht **Rate und Durchsatz gemeinsam**; pro fertigem Punkt bleibt es gleich.

Zäh war die Fehlannahme, weil die Erfahrung sie zu bestätigen schien: Das Wochenkontingent war tatsächlich vorzeitig erschöpft — aber das belegte die Rate, nicht die Kosten. Der echte Aufschlag ist kleiner und liegt woanders: Nacharbeit, wenn zwei Stränge denselben Code berühren, plus die Aufsicht. Die eigentliche Grenze ist ohnehin keine Kostenfrage, sondern der **Haupt-Agent**: Bei ihm endet jeder Strang, und je mehr Fremdstoff sein Kontext aufnimmt, desto schlechter urteilt er.

**Lehre:** Bevor man etwas beziffert, muss der Nenner feststehen — pro Arbeit oder pro Zeit. Beides „Kosten" zu nennen führt zu falschen Entscheidungen; hier zu einer Drosselung, die nichts sparte und nur langsamer machte.

### 3.28 Die teuerste Prüfung war die unschärfste

Die Bildprüfung auf beiden Render-Backends ist die aufwendigste Kontrolle dieses Projekts — zwei Browserläufe, zwei Bildbegutachtungen. Ihr Wächter verlangte sie für ein grob gezogenes Feld: alles unter den Szenen-, Render- und HUD-Bäumen. Damit forderte er zwei Backends auch dort, wo die beiden gar nicht verschieden zeichnen *können*: Die Bedienoberfläche ist HTML, und der Browser malt sie identisch, gleich welcher Renderer die Zeichenfläche hält.

Die Schwierigkeit lag in der Grenzziehung, nicht in der Idee. Mein erster Zuschnitt war zu klug — er hätte auch reine Logikmodule ausgenommen und damit ausgerechnet die zwei Fälle verfehlt, die auf EINEM Backend auftraten, obwohl der Code backend-neutral aussieht: ein Vegetations-Zittern durch eine Wettlaufsituation beim Hochladen, und eine Messung, die nur auf dem einen Pfad in ein Bild ohne gezeichneten Rahmen fiel. Die Ausnahme wurde deshalb auf das reduziert, was **nachweislich** nicht divergieren kann.

**Lehre:** Eine teure Prüfung rechtfertigt sich nicht dadurch, dass sie wichtig ist, sondern dadurch, dass sie dort greift, wo das Risiko sitzt. Und beim Verengen eines Sicherheitsnetzes gilt die konservative Grenze: Nimm nur aus, was **beweisbar** nichts beiträgt — nicht, was plausibel nichts beiträgt.

### 3.29 Der Arbeitsauftrag wuchs, bis er sich selbst im Weg stand

Die Aufgabenliste war auf 13.000 Zeilen gewachsen, 10.000 davon längst erledigte Punkte. Jeder Zug, der sie zu Rate zog, schleppte diese Geschichte mit. Die Datei war nie falsch — sie war zu drei Vierteln Archiv, das wie Arbeitsvorrat gelesen wurde.

Die Trennung ist banal, hätte ohne Mechanismus aber nicht gehalten: Ein einziger vergessener Haken, und die Datei wächst wieder zu. Die eigentliche Sorgfalt lag woanders — wer nur wissen will, was noch zu tun ist, braucht die eine Hälfte; wer einen Punkt als **geschlossen** erkennen muss, braucht beide. Ein Prüfer, der das übersieht, meldet keinen Fehler; er hört auf, jemals etwas zu finden.

**Lehre:** Ein Dokument, das mit jedem Vorgang wächst und bei jedem Vorgang gelesen wird, trägt eine eingebaute Kostenkurve. Trenne früh zwischen dem, was bearbeitet wird, und dem, was nur nachschlagbar sein muss — und prüfe beim Trennen, welcher Leser welche Hälfte braucht.

### 3.30 Dieselbe Kurve beim Regeldokument — und was das Aufräumen selbst kostete

Das bindende Projektdokument wird bei **jedem Sitzungsstart** geladen und war auf 17.700 Wörter angewachsen. Vier Fünftel davon waren die Nachweisketten der Abnahmekriterien: welcher Test, welche Datei, welcher Screenshot — gebraucht beim Closing und beim Taggen, gelesen aber bei jedem Start. Sie sind jetzt eine Nachbardatei unter denselben Nummern; das Dokument halbierte sich. Entscheidend war die Methode: **verschoben, nicht umgeschrieben.** Wortlaut umzuformulieren hätte bedeutet, 32 Kriterien neu zu formulieren und dabei genau die Zusicherungen zu verlieren, um die es geht. Ein erster, maschineller Schnitt trennte an der Zeile statt am Satz und riss Sätze entzwei — der zweite schnitt am Wort und ließ jeden Satz ganz.

Teuer war nicht das Kürzen, sondern das **Nachziehen**: Ein Prüfer las weiter nur die halbierte Datei und meldete stillschweigend falsche Zahlen; eine Wiederbelebungs-Notbremse suchte nach einem Haken, den es dort nicht mehr geben kann; eine Flackerliste, ein Regressions-Takt und eine ganze Problemklasse verloren beim Kürzen ihren einzigen Ort. Gefunden hat das nicht der Autor, sondern das **zweite Modell** — jeder dieser Befunde war eine Lücke zwischen dem, was der Umbauende im Kopf hatte, und dem, was die Dateien tatsächlich sagten.

**Lehren:** Beim Verkleinern eines Dokuments ist **Verschieben sicherer als Neuschreiben**, und der Schnitt gehört an die Satzgrenze. Danach ist die eigentliche Arbeit, **jeden Leser** des alten Ortes zu finden — der gefährlichste ist der, der nicht scheitert, sondern nur nichts mehr findet. Und weil das Wachstum nie eine Entscheidung war, sondern die Summe ehrlicher Einzelzugaben, bekamen die ständig gelesenen Dokumente **gemessene Obergrenzen** mit genau zwei zulässigen Auswegen: auslagern oder die Grenze mit schriftlicher Begründung anheben.

### 3.31 Die Rechnung stimmte, ihre Voraussetzung nicht — gemessene Verbrauchstreiber

In §3.27 war geklärt, dass Parallelität pro fertigem Punkt nichts kostet; das Argument stützte sich darauf, dass der Kontext für einen neuen Punkt ohnehin geleert wird. Als das Wochenkontingent ein zweites Mal vorzeitig erschöpft war, nannte die Verbrauchsanzeige für die letzten 24 Stunden drei Kennzahlen: alles aus subagenten-lastigen Sitzungen, alles aus Sitzungen jenseits von acht Stunden, und **94 % oberhalb von 150k Kontext**. Der letzte Wert widerlegt nicht die Rechnung, sondern ihre Voraussetzung: Geleert wurde eben nicht. Die Sitzung trug Punkt für Punkt im selben Fenster, und jeder Request zahlte den ganzen Verlauf mit. Erschwerend ist, dass die Sitzung sich nicht selbst leeren *kann* — das ist ein Nutzerbefehl; die Aufräumhandlung war also nie eine Gewohnheit, die man sich vornehmen konnte, sondern eine, die niemandem gehörte.

Der zweite gemessene Posten war die Orientierung. Ein delegierter Agent fand seinen Auftrag, indem er die Dokumente *las* — Regelwerk, Arbeitsauftrag, Designdokument, zusammen bis zu ~120.000 Tokens, ungecacht, je Agent, bevor er die erste Quellzeile sah. Der Auftrag selbst umfasst wenige hundert Wörter und liegt implementierungsreif vor. Das ist kein Delegationsproblem, sondern ein Zustellungsproblem: Wer den Auftrag mitschickt, statt ihn suchen zu lassen, zahlt ihn einmal statt je Leser.

Der dritte Posten war der unauffälligste: blockierende Wächter. Einer, der am Zug-Ende blockiert, kostet einen vollen Zug bei vollem Kontext — der Render-Wächter auf Punkt 278 kostete rund dreißig davon, für einen einzigen Prozessfehler. Das Immunsystem ist richtig; teuer ist nicht die Regel, sondern das Hineinlaufen.

**Lehren:** Eine Kostenrechnung erbt die Annahmen ihres Modells — hier die, dass eine Aufräumhandlung stattfindet; prüfe deshalb die Voraussetzung, nicht nur die Rechnung. Wo etwas Großes wiederholt gelesen wird, ist **Zustellung billiger als Suche**. Und die teuersten Züge sind die, in denen nichts entsteht: Ist die Bedingung eines Wächters vorher prüfbar, gehört sie vorher geprüft.

### 3.32 Ein Durchsetzer, der zu spät greift — und einer, der zu früh anschlägt

Zwei Befunde desselben Tages, die zusammengehören, weil beide die *Platzierung* eines Mechanismus betreffen, nicht seine Regel.

Der erste: Sämtliche Board-Wächter hängen am Zug-**Ende**. Sie sichern zu, dass die Anzeige stimmt, sobald ein Zug fertig ist — über die Stunde davor sagen sie nichts. Genau diese Stunde ist aber die, in der der Nutzer hinsieht: Er las „Pausiert", während längst zwei Vorgänge liefen, und musste es zweimal anmahnen. Der Fehler war nicht Nachlässigkeit, sondern eine Zusicherung, die am falschen Ende des Vorgangs sitzt. **Lehre:** Ein Versprechen über den *laufenden* Zustand muss dort durchgesetzt werden, wo der Zustand entsteht, nicht dort, wo er abgeschlossen wird.

Der zweite: Der Wächter über die Auftrags-Formulierung suchte seine Verbotsphrasen als bloße Teilzeichenketten und las deshalb „is **unchanged from**" als Revisionsspur „changed from". Er blockierte einen völlig sauberen Punkt, und zwar wiederholt, bis die Ursache gefunden war. Eine Wortgrenze kostete zwei Zeilen. Am selben Tag schlug er ein zweites Mal an — auf einem Punkt, dessen **Gegenstand** veraltete Lehren sind; dort half die Wortgrenze nicht mehr, denn eine Phrasenliste kann eine Revisionsspur nicht von einem Text über Revisionen unterscheiden. **Lehre:** Ein Wächter, der bei gewöhnlicher Sprache anschlägt, verliert genau das, wovon er lebt — dass man ihm glaubt. Fehlalarme sind keine Kosmetik; sie erziehen dazu, den Durchsetzer zu umgehen, und damit fällt die ganze Konstruktion in sich zusammen.

### 3.33 Eine Ersparnis, die Nacharbeit auslöst, ist keine Ersparnis

Am Abend des 24.07. lieferte eine still herabgestufte Sitzung drei Punkte in vierzehn Minuten ab; alle drei waren defekt und mussten neu gebaut werden. Der Wiederaufbau kostete mehr, als sämtliche Sparmaßnahmen davor eingebracht hatten. Das ist keine Anekdote über Modelle — §3.17 hat diesen Teil schon —, sondern eine **Kostenregel**: Eine Qualitätsmaßnahme rechnet sich nicht gegen ihren eigenen Preis, sondern gegen den Preis dessen, was sie verhindert.

Nacharbeit trägt dabei einen Multiplikator, den die Ersparnis nie hat. Eine falsche Lieferung wird nicht nur neu gebaut. Sie muss zuerst **als falsch erkannt** werden — und sie sieht fertig aus, sonst wäre sie nicht durchgegangen —, dann erneut geprüft, erneut zusammengeführt, und alles, was inzwischen darauf aufbaute, wandert mit. Der sichtbare Posten ist der Neubau; der teure ist der Weg dorthin.

Daraus folgt, wo Vorbeugung sich lohnt und wo nicht: **Mechanische, wiederkehrende Prüfung ist billig** — ein Test kostet Rechenzeit, keine Aufmerksamkeit, und er kostet beim tausendsten Lauf dasselbe wie beim ersten. **Menschliche Prüfung ist teuer** und muss deshalb dorthin, wo keine Maschine hinsieht (sieht das Bild für einen Menschen richtig aus?). Eine Sparidee, die an der mechanischen Schicht ansetzt, spart am falschen Ende.

**Lehre:** Bevor eine Maßnahme als „zu teuer" verworfen wird, muss der Preis des Fehlers danebenstehen, den sie verhindert — inklusive der Erkennungs- und Wiederholungskosten. Und umgekehrt: Jede Sparmaßnahme wird gegen ihre Wirkung auf die Fehlerrate geprüft, nicht nur gegen ihren Verbrauch. Eine Ersparnis, die die Nacharbeitsquote hebt, ist ein Verlust mit besserer Buchführung.

### 3.34 Die Attrappe, die den Fehler verdeckt

Eine Absicherung im Bildprüfungs-Wächter sollte fragen, ob ein Bezugs-Commit noch existiert: `git cat-file -e <sha>^{commit}`. Vierzehn Tests liefen grün darüber, alle 3.400 Tests des Projekts ebenfalls — und der Code tat auf dieser Maschine **das Gegenteil dessen, was er sollte**. Der Kommandointerpreter von Windows behandelt das Dach als Escape-Zeichen, git bekam also `<sha>{commit}` zu sehen und antwortete „kein gültiger Objektname" — für einen Commit, der existiert. Die Funktion hielt damit *jede* Basis für verschwunden und schützte exakt nichts.

Grün blieben die Tests, weil sie die Abhängigkeit **einspeisen**: Sie ersetzen die Prüffunktion durch eine Attrappe und prüfen die Verzweigungen darum herum. Das ist gute Praxis für die Logik — und blind genau für die Stelle, an der der Fehler saß, nämlich im Kommando selbst. Der Fehler war nicht im Verhalten, sondern in der Zeichenkette, die nie ausgeführt wurde.

Gefunden hat es die dritte Gegenlesung, nicht der Autor, und der Autor war in diesem Fall der Hauptprozess selbst — geschrieben unter Zeitdruck, nachdem vier Subagenten nacheinander an Schnittstellenfehlern gestorben waren. Zwei Umstände, die man beim nächsten Mal zusammen lesen sollte: *selbst gebaut* und *unter Druck* ist genau die Kombination, die eine Gegenlesung braucht, nicht die, die sie überspringen darf.

**Lehre:** Wo eine Abhängigkeit für den Test ersetzt wird, bleibt der ersetzte Teil ungeprüft — also braucht **jedes real ausgeführte Kommando mindestens einen Test, der es wirklich ausführt**. Eine Attrappe prüft die Logik um ein Werkzeug herum, nie das Werkzeug. Und ein Fix, der eine Plattform-Eigenheit betrifft, ist erst dann belegt, wenn er auf der Plattform gelaufen ist, auf der er wirkt.

### 3.35 Der beabsichtigte Zustand, im Präsens geschrieben

Ein Auftrag beschrieb den Maßstab, an dem eine neue Sperre messen sollte, mit den Worten: „der Prompt-Hook stempelt bereits den Zugbeginn in den Zustand". Er tat es nicht. Der Satz beschrieb, was ich beim Schreiben vor Augen hatte, nicht was im Code stand — und er stand im **Präsens**, also las er sich wie eine geprüfte Tatsache.

Der Helfer bemerkte es und baute den Stempel nach. Die Formulierung seines Befundes ist die Lehre: Ein schwächerer Leser hätte gegen ein Feld programmiert, das immer leer ist, hätte eine Sperre ausgeliefert, die **niemals auslösen kann**, und wäre dabei in jedem Test grün gewesen — denn ein Test gegen einen nie gesetzten Wert prüft brav, dass nichts passiert.

Das ist die teuerste Sorte Fehler in einem Auftrag, weil sie sich nicht wie ein Fehler liest. Eine Lücke im Auftrag führt zu einer Rückfrage; eine falsche Tatsachenbehauptung führt zu einer Lieferung, die genau das tut, was dasteht — nichts.

**Lehre:** Was im Auftrag im Präsens steht, muss beim Schreiben nachgesehen sein. Was noch gebaut werden muss, gehört in die Zukunftsform oder ausdrücklich unter „das existiert noch nicht" — die zwei Sekunden für ein `grep` sind billiger als eine Lieferung, die ins Leere greift. Und weil das nicht nur für Aufträge gilt: Jede Zusicherung, die ein Dokument über den Code macht, ist entweder nachgesehen oder als Absicht gekennzeichnet.

### 3.36 Isolierung ist eine Eigenschaft der Umgebung, keine Anweisung

Ein Agent, der ausdrücklich **nur lesend** arbeiten sollte, checkte im gemeinsamen Arbeitsbaum einen Zweig aus; die Hauptsitzung tat kurz darauf dasselbe — in einem Baum, in dem gerade ihre eigene Testsuite lief. Beide Male war die Anweisung eindeutig, beide Male wirkungslos. Ein Prompt beschreibt eine Absicht; der Arbeitsbaum ist geteilter Zustand, und wer ihn schreiben *kann*, schreibt ihn irgendwann.

**Lehre:** Isolierung ist eine Eigenschaft der Umgebung, nie des Auftrags. Jeder Vorgang, der laufen darf, bekommt seine eigene Arbeitskopie — dann ist „nur lesend" keine Zusage mehr, sondern eine Eigenschaft dessen, was er überhaupt anfassen kann. Das ist §3.16 eine Ebene tiefer: erzwingen statt erinnern heißt hier, die Möglichkeit zu **entziehen**, statt sie zu verbieten.

### 3.37 Ein Werkzeug, das rät, ersetzt still

Der Arbeitsauftrag benutzt dasselbe Abschnittszeichen für vier verschiedene Dokumente. Der Generator, der einem delegierten Agenten seinen Auftrag zustellt (§3.31), erkannte ein Dokument nur an seiner Dateiendung — ein Verweis in Prosaform fiel deshalb auf das Designdokument zurück, dessen gleichnummerierter Abschnitt wortwörtlich und unkommentiert in den Auftrag wanderte, während die Fehlermeldung eine Umnummerierung dieses Dokuments beschuldigte. Der Agent hätte gegen einen fremden Abschnitt gebaut, ohne dass irgendwo etwas rot geworden wäre.

Ein Werkzeug, das eine Eingabe nicht auflösen kann, hat zwei Ausgänge: laut scheitern oder still etwas Plausibles einsetzen. **Der laute ist der harmlose.** Die Reparatur bestand deshalb nicht in besserem Raten, sondern darin, jede Auflösung sichtbar zu machen: Jeder mitgelieferte Abschnitt trägt sein Herkunftsdokument, eine Referenzkarte nennt jeden Verweis und wohin er aufgelöst wurde, und was nirgends aufgeht, scheitert weiterhin — nun unter Nennung aller durchsuchten Dokumente.

**Lehre:** Eine Notation, die in mehreren Dokumenten dasselbe Zeichen benutzt, ist keine Kennung, sondern eine Vermutung. Wo ein Werkzeug sie auflöst, gehört die Auflösung ins Ergebnis: Ein falscher Treffer, den man sehen kann, ist ein Fehler — einer, den man nicht sehen kann, ist eine Fälschung. (Die Einsteiger-Anleitung warnt vor dieser Klasse seit Wochen; ihr Absatz hier fehlte bis jetzt.)

### 3.38 Fail-open EINMAL ist nicht fail-open FÜR IMMER

Beim Umbau eines Fehlerpfads wurde ein eng gefasster Fang verbreitert: Statt nur des einen erwarteten Fehlers schluckte er jeden Fehlschlag des Vergleichsschritts. Die Verzweigung dahinter setzte die Bildprüfung neu auf — ein vorübergehender Prozessfehler unter Last hätte damit ein offenes, unverifiziertes Render-Gate endgültig für erledigt erklärt. Aus „diesmal lassen wir durch" war „ab jetzt ist nichts mehr offen" geworden, und zwar unsichtbar, weil beide Wege dieselbe Erfolgsmeldung schreiben.

Der Unterschied liegt nicht im Durchlassen, sondern im **Schreiben**. Fail-open (§4) heißt: Ein Wächter hält die Sitzung nicht auf, wenn er selbst kaputt ist. Es heißt nicht, dass er im Fehlerfall Zustand fortschreiben darf. Die Reparatur trennt genau das — das Gate fragt jetzt, ob sein Bezugspunkt noch erreichbar ist, und rückt nur vor, wenn er es nachweislich nicht mehr ist; eine unbeantwortbare Frage zählt als „vorhanden" und lässt das Gate stehen.

**Lehre:** Beim Umbau eines Fehlerpfads gehört die Frage dazu, **welcher** Fehler Zustand schreiben darf — die Menge der gefangenen Fehler ist Teil der Spezifikation, nicht Aufräumarbeit. Und ein Ausfallverhalten wird nach seiner Dauer beurteilt: einmal durchlassen ist eine Nachsicht, dauerhaft durchlassen ist eine Abschaffung.

### 3.39 Neun Ausfälle an einem Tag — und was den Schaden bestimmt hat

Am 27.07.2026 starben **neun** Subagenten an vorübergehenden Überlastungsfehlern der Modell-Schnittstelle. Nichts davon lag am Projekt: Die Hauptsitzung lief durch, nur das Eröffnen *neuer* Sitzungen scheiterte, in Wellen.

Interessant ist nicht der Ausfall, sondern die Streuung des Schadens. Ein Agent, der erst am Ende committen wollte, verlor alles — ein anderer, der nach jedem zusammenhängenden Schritt committet und gepusht hatte, verlor nichts und wurde beim Neustart einfach fortgesetzt. Dieselbe Störung, zwei völlig verschiedene Kosten. Der Unterschied war eine Zeile im Auftrag.

Die zweite Lehre betrifft das Verhalten der Aufsicht: Nach dem dritten Ausfall an derselben Aufgabe ist ein vierter Versuch keine Beharrlichkeit mehr, sondern Aberglaube. Die Arbeit selbst zu machen war jedes Mal die billigere Entscheidung — die eigene Sitzung existierte ja bereits.

**Lehren:** Gegen eine unzuverlässige Umgebung hilft keine Vermeidung, sondern **kleine, sofort gesicherte Schritte** — dieselbe Antwort wie auf jeden anderen Verlustfall in diesem Projekt. Und: Wenn ein Weg dreimal an derselben äußeren Ursache scheitert, wechsle den Weg, statt den Versuch zu wiederholen.

### 3.40 Eine Prüfung, die zu spät kommt, ist eine Benachrichtigung

Am 27.07.2026 meldete die Pipeline mehrfach Rot, und jedes Mal war die Ursache klein und die Reparatur schnell — einmal ein neuer Test, der eine Datei las, die lokal existiert und im Repository absichtlich nicht. Der Schaden lag nicht im Fehler, sondern im **Zeitpunkt** der Entdeckung: Der Stand war da schon draußen, und die Fehlermail beim Nutzer lässt sich durch keine spätere Reparatur zurücknehmen.

Die naheliegende Antwort — „vor dem Push die Prüfungen laufen lassen" — war seit Wochen als Regel notiert und wurde trotzdem im Alltag übersprungen; sie kostet Minuten und ist genau dann lästig, wenn man es eilig hat. Als Mechanismus kostet sie dieselben Minuten und ist nicht mehr überspringbar: Ein Pre-Push-Hook fährt den schnellen Riegel, bevor der Push die Maschine verlässt.

Zwei Details entscheiden, ob so ein Riegel wirkt. Erstens die **Verdrahtung**: Ein früherer Versuch lag als Skript im Projekt und konnte nie auslösen, weil die Hook-Einstellung nie gesetzt war — Vorhandensein ist keine Wirkung, deshalb setzt sie jetzt die Installation, und ein Test prüft die Verdrahtung selbst. Zweitens die **Verhältnismäßigkeit**: Der volle Riegel gilt dem veröffentlichten Zweig, ein Feature-Zweig bekommt die schnelle Teilmenge, denn Agenten pushen nach jedem Schritt — ein Mechanismus, der die Arbeit lähmt, wird umgangen und ist damit wieder eine Regel.

**Lehre:** Eine Prüfung gehört vor die Handlung, die sie absichern soll. Läuft sie danach, ist sie eine Benachrichtigung — und die Kosten des Fehlers sind bereits entstanden. Dasselbe Muster fand sich am selben Tag in der Einsteiger-Anleitung: Ausgerechnet der Merksatz „jede Regel braucht einen Mechanismus" stand dort zwischen den Aufträgen und war selbst nur ein Merksatz.

### 3.41 Ein Ergebnis, das kein Beweis ist

Am Abend des 27.07.2026 lieferte dieselbe Prüfung **vier** Ergebnisse zu **einer** Frage: zweimal rot an verschiedenen Stellen, einmal rot mit einem ungelösten Merge-Konflikt im Baum, einmal rot mit genau einem echten Fund. Keines der ersten drei war falsch *gemessen* — jedes war unter Bedingungen gemessen worden, unter denen es nichts belegt.

Drei verschiedene Ursachen, ein gemeinsames Muster. **Last:** parallel liefen die volle Unit-Schicht und zwei Agenten; wechselnde Fehlerstellen sind deren Signatur, nicht die eines Defekts. **Ein Zustand, den es nie geben wird:** der Zweig war beim Angleichen an den Hauptzweig in einem Konflikt stehen geblieben, geprüft wurde eine Mischung aus beidem. **Überbleibsel:** ein vergessener Entwicklungsserver aus einem früheren Lauf trieb vier Unit-Tests in ihre Zeitgrenze — er verbrauchte im Leerlauf keine Rechenzeit und wäre jeder Auslastungsmessung entgangen.

Gefährlich daran ist nicht das Rot, sondern die Versuchung: Das erste Rot sah nach einem echten Befund aus, und der Prüfstand nannte es auch so („zweimal gescheitert — ein echter Fehler"). Eine Reparatur an dieser Stelle hätte einen Fehler behoben, den es nicht gab, und den echten, der im vierten Lauf steckte, überdeckt.

Die Antwort ist ein Paar: eine Messung **vor** dem Lauf, die die Maschine beurteilt und ein zeitkritisches Rot als nicht beweiskräftig kennzeichnet, und eine Einordnung **nach** dem Lauf, die dieselbe Prüfung zweimal rot als Verdacht wertet, zwei Läufe mit verschiedenen Ausfällen dagegen als Last. Beide sind **beschriftend, nicht blockierend** — mit einer Asymmetrie, die der Kern der Sache ist: **Ein Grün unter Last zählt weiterhin; ein zeitkritisches Rot nicht.** Last erzeugt falsche Rote, keine falschen Grünen.

**Lehren:** Vor der Interpretation eines Messergebnisses gehört die Frage, ob die Bedingungen es überhaupt zu einem Beweis machen — und diese Frage gehört an die Maschine, nicht ans Gedächtnis. Und: Ein Prüfstand, der eine Aussage über die Art seines Roten trifft, muss sie begründen können; „zweimal gescheitert, also echt" war eine Behauptung ohne Beleg.

### 3.42 Erlaubt ist nicht genommen

In der Nacht auf den 28.07.2026 stand der Batch fünfeinhalb Stunden still, und das Protokoll erzählt die Geschichte lückenlos. Um 01:15 waren vier Punkte gemergt und abgehakt, kein Agent lief mehr — die Bedingung, unter der die tags zuvor gebaute Sitzungsgrenze das Ende freigibt. Der Wächter **erlaubte** den Halt. Genommen hat die Grenze niemand: Der Befehl, der die Übergabe einträgt, lief nie, es entstand kein Marker.

Damit saß die Sitzung da — lebendig, mit der Sperre in der Hand. Der Starter prüfte alle 15 Minuten und entschied jedes Mal **richtig**, keinen Nachfolger zu starten, denn es lebte ein Eigentümer. Ab 03:21 benannte er den Zustand sogar exakt („wedged owner: pid alive but heartbeat 245 min old") — einundzwanzig Mal, ohne zu handeln, weil Handeln nicht in seinem Auftrag stand.

Kein einzelnes Teil hat versagt. Der Wächter tat, was er sollte; der Starter tat, was er sollte; die Diagnose war korrekt und pünktlich. Gefehlt hat die **Verbindung**: Die Erlaubnis zu stoppen und der Akt des Beendens sind zwei verschiedene Dinge, und gebaut war nur das erste. Schlimmer noch: Eine Sitzung, die mit der Sperre in der Hand stehenbleibt, ist schädlicher als eine, die nie stehenbleibt — sie blockiert ihren eigenen Nachfolger. Der Singleton, der eine Doppel-Sitzung verhindert, verhindert dann auch die Ablösung.

**Lehren:** Ein Mechanismus, der eine Handlung *erlaubt*, ist unfertig, solange nichts sie auch **auslöst** — eine Freigabe ohne Vollzug ist eine Regel, kein Mechanismus, also §3.40 in anderer Gestalt. Und eine Diagnose ohne Konsequenz ist Protokollprosa: Wer einen Zustand einundzwanzig Mal richtig benennt und nichts tut, hat ihn nicht erkannt, sondern nur beschrieben.


### 3.43 Der Fehler, den die Fail-open-Hülle verschluckt

Am 28.07.2026 wurde die tags zuvor gebaute Sitzungsgrenze zum ersten Mal live durchgespielt — auf ausdrückliche Anweisung des Nutzers, „teste den ganzen Prozess". Die Unit-Ebene war grün, jedes Teil einzeln geprüft. Der Durchlauf förderte vier Fehler zutage, von denen keiner auf der Unit-Ebene sichtbar war.

Der schwerste hat eine Form, die es zu merken lohnt. Der Grenz-Halt läuft seinen Weg: der Wächter erreicht seinen Übergabe-Zweig und verbraucht den Marker, der den Halt autorisiert hat. Dann stirbt er an einer Zeile, die niemand für gefährlich hielt — das Umbenennen der temporären Sperrdatei auf ihren Zielnamen scheitert unter Windows mit einem Rechte-Fehler. Der Fehler entkommt dem Zweig, die **Fail-open-Hülle fängt ihn**, protokolliert ihn und lässt den Halt zu. Marker verbraucht, Übergabe nie eingetragen, Sperre unverändert in der Hand der Sitzung. Beim nächsten Zug verlangt der Wächter die Grenze erneut — und dieselbe Schleife beginnt von vorn. Dreimal von drei Versuchen, also kein Virenscanner-Zufall, sondern zwei Schreiber auf derselben Datei im selben Moment.

Fail-open ist richtig: ein kaputter Wächter darf die Sitzung nicht einsperren. Aber er umschließt hier nicht nur eine *Prüfung*, sondern eine **Handlung** — und eine halb ausgeführte Handlung fällt nicht auf null zurück, sie hinterlässt einen Zwischenzustand. Verbraucht war der Marker, ausgeführt war nichts. Dazu kam die Reihenfolge: erst wurde weggeworfen, was den Halt autorisierte, dann versucht, was den Halt erst sinnvoll macht.

Und das Ganze war **lautlos** in dem Sinn, der zählt. Es stand eine Protokollzeile da, sauber und wahr, die den Fehler benannte — nur las sie niemand, weil der Halt ja durchging und alles nach Erfolg aussah. Der Statusbefehl meldete weiter „ein Grenz-Halt wäre erlaubt", der Starter übersprang korrekt jeden Takt, und der Batch stand.

Zwei kleinere Funde derselben Stunde: Die Testsuite schrieb mit einer Test-Sitzungs-ID in das *echte* Übergabe-Protokoll — ein Unit-Lauf konnte also eine real genommene Grenze widerrufen, und das Push-Gate führt bei jedem Push einen aus. Und die Stop-Kette schickte die Sitzung nach dem Nehmen der Grenze regelmäßig zurück an die Arbeit (fehlender Zeitstempel, ungeprüfter Mechanismus-Commit, verschobener HEAD), was die Grenze jedes Mal still widerrief.

Eine eigene Lehre steckt in der Diagnose selbst: Die erste, in die Retrospektive und in den Arbeitsauftrag geschriebene Erklärung — eine Kontext-Kompaktierung vergebe eine neue Sitzungs-ID, worauf sich jeder besitzgebundene Wächter für unzuständig halte — war **falsch**, und zwar plausibel falsch. Widerlegt hat sie ein Detail des Zustands: der Marker *war* verbraucht, was nur passiert, wenn die Sitzung sich sehr wohl als Eigentümerin erkannt hat. Der Agent, der die Korrektur baute, arbeitete zu diesem Zeitpunkt bereits an der falschen Fassung.

**Lehren:** Fail-open darf eine *Prüfung* umschließen, nie unbemerkt eine *Handlung* — wo ein Wächter etwas ausführt, muss das Scheitern im selben Atemzug gemeldet werden wie die Freigabe, und der Zustand, der die Handlung autorisiert, wird erst nach ihrem Gelingen verbraucht. Zweitens: Tests dürfen den Produktivzustand nicht anfassen; ein Testlauf, der Live-Zustand ändern kann, ist kein Test mehr, sondern ein Eingriff. Drittens, wieder §3.40 in neuer Gestalt: eine Kette prüft man durch **einen Durchlauf**, nicht durch die Summe grüner Teile. Und viertens: eine Diagnose ist eine Hypothese, bis ein Zustandsdetail sie trägt — wer sie vorher weiterreicht, lässt andere auf ihr bauen.

### 3.44 Das Messfenster war schmaler als das Gemessene — dreimal an einem Tag

Am 28.07.2026 fand die Übergabe endlich statt, und zwar vollständig: Punkt 338 gemergt und abgehakt, die Grenze um 14:34 genommen, der Starter nahm sie um 14:51 an, startete die Nachfolgesitzung, und deren erster Zug schrieb Commits. Fünf von fünf Gliedern, aus den Protokollen gelesen. Der Punkt hätte damit geschlossen sein können — nur meldete das Werkzeug, das genau diesen Nachweis führen soll, „keine Übergabe gefunden".

Der Grund: Es suchte den abgehakten Punkt in den letzten **fünf** Änderungen der Arbeitsordnung. Seit dem Abhaken waren acht dazugekommen, alle bloße Anhänge neuer Punkte — also genau das, was ein Batch-Zug ohnehin tut. Der Nachweis war nicht verlorengegangen; er war aus dem Fenster gerutscht, durch das das Instrument schaute.

Derselbe Schnitt sitzt an zwei weiteren Stellen, und die eine ist teurer als der Beobachter. Der Wächter fragt dieselbe Funktion, *wann* eine Sitzungsgrenze fällig wurde: Rutscht der Abschluss aus dem Fünf-Commit-Fenster, fordert er die Grenze in dem Zeitraum, in dem er sie fordern müsste, gar nicht mehr — die Sitzung bleibt sitzen und schleppt den nächsten Punkt im selben Kontext weiter, also genau die Kosten, gegen die die Grenze eingeführt wurde. Und das Push-Tor fragt seine Lastmessung **nach** dem Testlauf: Eine fünf Minuten lange Suite läuft unter Volllast rot, danach ist die Maschine wieder ruhig, und das Tor beurteilt ein rotes Ergebnis als „auf ruhiger Maschine gemessen, also echt" und blockiert.

Alle drei Instrumente sind einzeln vernünftig gebaut, alle drei sind pur getestet, und alle drei antworten falsch in dieselbe Richtung: **zur Beruhigung hin**. „Nichts gefunden", „nichts fällig", „Maschine ruhig" — kein Alarm, kein Widerspruch, nichts, was auffiele. Ein Instrument, das zur Beunruhigung hin irrt, wird nach zwei Fehlalarmen korrigiert; eines, das zur Beruhigung hin irrt, wird geglaubt.

**Lehren:** Das Fenster einer Messung muss aus dem **Gegenstand** abgeleitet sein, nicht aus der Bequemlichkeit der Abfrage — die Frage „wurde in den letzten 90 Minuten ein Punkt geschlossen?" ist eine Zeitfrage und darf nicht als Anzahlfrage gestellt werden, und „war die Maschine während des Laufs belastet?" ist eine Frage über den Lauf, nicht über den Moment danach. Zweitens: Bei jeder Heuristik ist zu benennen, in welche Richtung sie irrt; irrt sie zur Beruhigung, braucht sie einen zweiten, unabhängigen Beleg. Drittens, als Gegenprobe zu §3.40 und §3.43: Der eine echte Durchlauf hat hier nicht nur die Kette bewiesen, sondern auch das Prüfgerät blamiert — wer die Kette nie durchspielt, hält beides für in Ordnung.

### 3.45 Die Prüfung stand hinter der Auslieferung — und derselbe Griff brach dreimal

Am Abend des 28.07.2026 zerbrach das Board dreimal an derselben Technik: Um Karten umzusortieren, wurde der Abschnitt über den **Fließtext** gesucht („von der Überschrift bis zum nächsten `<h2>`"), herausgeschnitten und wieder zusammengesetzt. Jedes Mal wanderte dabei ein schließendes Tag, und der Browser hängte die folgenden Karten in den falschen Container. Beim dritten Mal sah der Nutzer das Ergebnis auf seinem Bildschirm und fragte, warum das Design geändert worden sei.

Zwei Befunde stecken darin, und der zweite ist der wichtigere.

Der erste ist die Wiederholung. Nach dem ersten Bruch wurde repariert und weitergemacht — mit derselben Technik. Nach dem zweiten wieder. Eine Fehlerklasse, die sich beim ersten Auftreten als Ungeschick liest, ist beim dritten ein Befund über das Werkzeug: Eine HTML-Datei, die mit Textersetzungen gepflegt wird, geht kaputt, und zwar nicht gelegentlich, sondern verlässlich. Das Vorsatz-Gegenmittel („ich mache das nicht mehr") ist wertlos, wie der Nutzer sofort feststellte: Es überlebt die nächste Kontextkompression nicht.

Der zweite Befund ist die Reihenfolge. Die bestehenden Wächter haben **jeden** der drei Brüche gefunden — die Abschnittsprüfung, die Karten-Vollständigkeit, die Struktur der Überschriften. Nur laufen sie bei `--synced`, also **nach** dem Veröffentlichen. Die Kette lautete: Datei ändern → veröffentlichen → prüfen → reparieren. Der Leser sah dazwischen den kaputten Stand. Die Prüfung war nicht zu schwach, sie stand an der falschen Stelle — dieselbe Form wie §3.40, nur eine Ebene konkreter: dort kam die Prüfung zu spät für die Entscheidung, hier für die Auslieferung.

Das Gegenmittel ist entsprechend keine Regel, sondern eine Verschiebung: Die Strukturprüfung sitzt jetzt **vor** der Kopie, die das Veröffentlichen aufgreift (`scripts/board-structure-core.mjs`, aufgerufen in `dashboard-publish.mjs`). Ein zerbrochenes Board ist damit nicht mehr veröffentlichbar — unabhängig davon, wer es zerbrochen hat und ob sich jemand an die verbotene Technik erinnert. Die drei realen Bruchformen sind als Testfälle festgeschrieben, und die Gegenprobe wurde geführt: Der künstlich wiederhergestellte Bruch wird abgewiesen, das intakte Board geht durch.

**Lehren:** Erstens, eine Fehlerklasse, die sich zum dritten Mal zeigt, ist keine Unachtsamkeit mehr — sie ist eine Aussage über das benutzte Werkzeug, und die Antwort darauf ist, das Werkzeug unmöglich zu machen, nicht sich vorzunehmen, es zu meiden. Zweitens: Bei jeder Prüfung ist zu fragen, **welches Ereignis** sie verhindern soll, und sie gehört unmittelbar davor — eine Prüfung hinter der Auslieferung ist eine Fehlermeldung, keine Absicherung.

### 3.46 Dreitausend bestandene Tests, und die Hälfte lief nie

Am selben Abend beschädigte eine Neuinstallation der Abhängigkeiten den Baum: Einem Plattform-Paket fehlte seine Einstiegsdatei. Der darauf folgende Testlauf meldete **3546 bestandene Tests** — eine große, beruhigende Zahl. Tatsächlich hatten 34 Testdateien gar nicht erst geladen; sie tauchten in der bestandenen Zahl nicht auf, weil sie nie zu Tests wurden. Die Vergleichszahl aus dem Lauf eine Stunde zuvor lautete 4214.

Der Fehler ist derselbe wie in §3.41, aber in seiner tückischsten Form: Nicht ein Ergebnis war kein Beweis, sondern die **Menge**, über die das Ergebnis sprach, war stillschweigend geschrumpft. Ein rotes Testergebnis wird untersucht; ein grünes über einer kleineren Grundgesamtheit wird abgehakt. Bemerkt wurde es hier nicht durch Aufmerksamkeit, sondern weil ein zweites Modell in seiner Prüfung dieselben Tests nicht starten konnte und das **meldete**, statt es als Umgebungsproblem abzutun.

**Lehren:** Eine bestandene Zahl ist nur zusammen mit der Zahl der ausgeführten Dateien eine Aussage — beide gehören in jede Meldung, und ein Rückgang der Dateizahl ist so ernst zu nehmen wie ein Fehlschlag. Und: Wer einen Nebenbefund meldet, den er nicht erklären kann („die Tests starten bei mir nicht"), leistet mehr als der, der ihn wegsortiert.

### 3.47 Die Prüfung, die auf der schnellen Maschine scheitert

Eine Live-Prüfung des Tierschritts meldete „0 Standphasen, schlimmster Wert Unendlich" — und zwar reproduzierbar auf der **ruhigen** Maschine, während sie unter Last grün wurde. Das ist die Umkehrung dessen, was dieses Projekt gelernt hatte (§3.8: ein Rot unter Last ist meist die Last), und deshalb war die erste Deutung falsch. Die Ursache: Die Prüfung verlangte je Messfenster eine feste Mindeststrecke von 0,01 Welteinheiten. Eine Ziege legt in drei Bildern einer schnellen Aufzeichnung 0,008 zurück — jedes der 52 Fenster wurde verworfen. Auf der langsamen Maschine dauern dieselben drei Bilder länger, die Strecke reicht, die Prüfung besteht.

Der Schwesterbefund desselben Abends hat dieselbe Wurzel mit umgekehrtem Vorzeichen: Eine Nachbarprüfung wartete eine feste Wanduhrzeit von 1,2 Sekunden zwischen zwei Aufnahmen und las bei einem Renderer-Stocker zweimal dieselbe Pose — exakt 0,000 Bewegung für alle fünf Silhouetten. Beide Prüfungen unterstellen eine feste Beziehung zwischen Wanduhr und Bildfolge, die es nicht gibt.

**Lehren:** Eine Messschwelle gehört in die Einheit des Gemessenen — Schrittlängen, nicht Meter; gerenderte Bilder, nicht Sekunden. Und eine Prüfung, die **nichts** gemessen hat, muss das laut sagen: Sie meldete „Unendlich", was wie ein katastrophaler Messwert aussieht statt wie eine leere Menge, und hätte in anderer Form auch vakuum-grün werden können. Die Regel aus §3.41 gilt auch für die eigene Messung: Ein Ergebnis ohne Grundgesamtheit ist kein Ergebnis.

### 3.48 Zweimal rot heißt nur dann „nicht die Last", wenn die Last dazwischen weg war

Das Push-Tor wiederholt einen roten Schnelltest einmal und schreibt beim zweiten Rot: *„failed TWICE — the load was not the cause."* In derselben Nacht scheiterte ein Push dreimal an einem Vitest-internen RPC-Zeitüberlauf, während **alle 4219 Tests bestanden** — die Maschine war durchgehend von drei parallelen Zuarbeitern ausgelastet. Der Beweis kam später am selben Abend: Auf der leeren Maschine lief derselbe Push auf Anhieb grün durch.

Die Wiederholung prüft nur dann etwas, wenn sich zwischen den beiden Läufen etwas ändert. Unter konstanter Last misst sie zweimal denselben Zustand und nennt das Ergebnis Beweis.

**Lehre:** Eine Wiederholung ist erst dann ein Ausschlussverfahren, wenn die vermutete Ursache dazwischen **entfernt** wurde. Ein Tor, das Last als Ursache ausschließen will, muss die Last messen (das tut dieses beim Start bereits) und sie in sein Urteil einrechnen — oder ehrlich sagen, was es gesehen hat: alle Tests bestanden, der Prozess endete trotzdem mit einem Fehler.

### 3.49 Aufräumen, das durch eine Verknüpfung hindurchlöscht

Sechsunddreißig verwaiste Arbeitsbäume wurden entfernt — eine reine Hygienemaßnahme, deren Zweck es war, vier wirklich offene Zweige wieder sichtbar zu machen. Dabei verschwand `node_modules` im Hauptbaum vollständig: Die Arbeitsbäume enthielten Verknüpfungen dorthin, und das rekursive Löschen folgte ihnen. Der nächste Build meldete „tsc ist nicht erkannt".

Zwei Dinge haben den Schaden begrenzt. Erstens war er vollständig reparierbar, weil die Sperrdatei im Repository liegt — eine Neuinstallation stellte alles her. Zweitens fiel er **sofort** auf, weil das Push-Tor unmittelbar danach rot schlug; ohne dieses Tor wäre ein kaputter Zustand in den Hauptzweig gegangen. Sehr wahrscheinlich ist das auch die bis dahin ungeklärte Ursache des Vorfalls aus §3.46.

**Lehre:** Eine Löschoperation muss wissen, ob sie einer Verknüpfung folgt. Und: Aufräumarbeit ist kein risikoarmer Nebenschauplatz — sie fasst per Definition Dinge an, die niemand mehr beobachtet.

**Nachtrag 29.07.2026 — derselbe Schaden zweimal an einem Nachmittag.** Nach dem Ende zweier delegierter Agenten wurde je ein Arbeitsbaum entfernt — einmal mit dem regulären Kommando, einmal mit einem rekursiven Löschen, nachdem jenes fehlschlug —, und beide Male kam das `node_modules` des Hauptbaums mit. Beide Male meldete der nächste Build „tsc ist nicht erkannt", beide Male war die Reparatur eine Neuinstallation, beide Male hielt das Push-Tor den kaputten Stand zurück.

Bemerkenswert ist nicht der Schaden, sondern die Wiederholung: Die Lehre stand seit dem ersten Vorfall geschrieben, wortgleich, in genau diesem Abschnitt — und hat nichts verhindert, weil zwei verschiedene Agenten zwei verschiedene Kommandos benutzten und keines von beiden etwas von der Verknüpfung wusste. Eine Lehre, die nur an der Stelle steht, an der sie entstand, erreicht den nicht, der sie das nächste Mal braucht. Erfasst als Arbeitsauftrag mit einer prüfbaren Bedingung — das Entfernen darf das Verknüpfungsziel nicht anfassen — und mit dem Aufräumen an EINER Stelle statt in jedem Agenten-Auftrag.

### 3.50 Der Zustand, den nur die Lücke zwischen zwei Schritten erzeugt

Einen Punkt abzuschließen sind zwei Schreibvorgänge am Board: die fertige Karte ins Archiv, die nächste hochziehen. Zwischen ihnen ist die Sektion „Woran ich gerade arbeite" leer. In dieser Nacht hat der Nutzer diesen Zustand **zweimal innerhalb einer Stunde** erwischt — beide Male, bevor irgendein Wächter etwas sagte, und beide Male mit derselben Frage: „Du arbeitest gerade an nichts?"

Der Schaden blieb nicht bei der Optik. Ein Test prüft, dass die lebende Tafel laufende Arbeit trägt; die Lücke färbte den gesamten Unit-Lauf rot, und das Push-Tor blockierte daraufhin den Merge eines fertigen, sonst grünen Punktes. Beim ersten Mal war die Fehldeutung schon vorbereitet: Die Nacht war voller lastbedingter Rot-Läufe, und dieses Rot sah genauso aus.

Bemerkenswert ist, wer es zuerst gesehen hat: der Zuarbeiter, der an einem ganz anderen Punkt arbeitete, hat die Lücke in seinem Abschlussbericht als eigenen Arbeitsauftrag vorgeschlagen — eine Stunde, bevor sie ein zweites Mal zuschlug.

**Lehren:** Ein Zustand, der nur *zwischen* zwei Schritten existiert, wird von keinem Wächter am Zugende gesehen — er gehört deshalb nicht abgesichert, sondern **unmöglich gemacht**, indem die beiden Schritte ein Schreibvorgang werden. Und: Ein Rot in einer Nacht voller Flimmern ist genau dann gefährlich, wenn es echt ist.

**Nachtrag 29.07.2026 — die Absicherung gegen die Lücke verbietet den ehrlichen Nachbarfall.** Der Test, der seither verlangt, dass die Tafel laufende Arbeit trägt, liest die laufende Karte über ihre PUNKTNUMMER. Die Übergabe-Karte am Sitzungsende hat keine: Es wird gerade kein Punkt bearbeitet, es wird übergeben. Damit stand die Sitzung zwischen zwei Mechanismen — die Sitzungsgrenze verlangt die Übergabe-Karte, der Test verlangt die Nummer —, und ein fertiger, geprüfter Stand ließ sich nicht hochladen, bis die Karte die Nummer des Punktes trug, den die NÄCHSTE Sitzung aufnimmt. Allein herauszufinden, in welcher Form die Nummer gelesen wird, kostete drei Anläufe: Eine handgeschriebene Karte mit dem Nummern-Element der Warteschlange erkannte der Leser nicht, und eine Karte für einen Punkt, der noch in der Warteschlange stand, erzeugte prompt einen Doppel-Eintrags-Verstoß.

**Lehre:** Wer einen Zustand verbietet, muss den legitimen Nachbarzustand ausdrücklich erlauben — sonst wandert der Stillstand nur von der Lücke zur Übergabe. Und ein Format, das ein Prüfer liest, gehört genau einmal geschrieben: Solche Karten erzeugt das Werkzeug, das beide Seiten kennt, nie die Hand.

### 3.51 Die Ebene darunter wird erst sichtbar, wenn die darüber gut wird

Nach dem neuen Gang der Tiere meldete der Nutzer binnen einer halben Stunde zwei Kollisionsfehler: ein Tier läuft durch den Zaun, mehrere stehen ineinander. Die naheliegende Vermutung — die neue Animation habe sie verursacht — war falsch, und das ließ sich am Repository belegen: Die Zaun-Kollider, die Kollisionsauflösung und die Bewegungszeile der Tiere sind auf dem Stand VOR dem Gang-Merge zeichenweise identisch; die Auflösung war zuletzt acht Tage zuvor angefasst worden.

Die Fehler waren also alt. Neu war nur, dass man sie sieht: Solange die Tiere über den Boden glitten und mit den Beinen zappelten, fiel ein Durchdringen nicht auf, weil ohnehin nichts glaubwürdig aussah. Sobald sie sichtbar auf ihren Füßen gehen, liest man ein Tier im Zaun sofort als falsch.

**Lehre:** Eine Qualitätsstufe nach oben deckt die nächste Schwäche darunter auf — das ist der Normalfall, kein Rückschritt. Wer nach einer sichtbaren Verbesserung plötzlich mehr Fehlerberichte bekommt, misst nicht Verschlechterung, sondern die neue Auflösung des Blicks. Und die Zuordnung „neu gebaut, also neu kaputt" gehört jedes Mal am Verlauf geprüft, bevor man sie glaubt.

### 3.52 Der Ausweg, den die Verweigerung nennt, gibt es nicht

Ein neuer Riegel im Board-Werkzeug verweigert eine Veröffentlichung, wenn ein offener Punkt auf dem Board keine Karte hat, und nennt dazu — wie es die Hausregel verlangt — den Befehl, der das behebt. Die Gegenprüfung fand: Genau dieser Befehl wirft in genau diesem Fall eine Ausnahme. Er verschiebt eine bestehende Karte in die Warteschlange und setzt deshalb voraus, dass es eine gibt; der auslösende Fall ist aber der frisch angehängte Punkt, der noch nirgends eine Karte hat. Der eigentlich gemeinte Weg war ein Generator, dessen Kommandozeilen-Werkzeug noch gar nicht existierte, obwohl die Ausweg-Liste des Riegels es bereits führte.

Übrig geblieben wäre die Handbearbeitung der Board-Datei — dieselbe Handbearbeitung, an der das Board am Vortag dreimal zerbrochen ist (§3.45).

**Lehre:** Ein Durchsetzer ist erst dann fertig, wenn sein genannter Ausweg **ausgeführt** worden ist, nicht wenn er plausibel klingt. Das gehört in die Prüfung jedes neuen Riegels: den Weg, den die Fehlermeldung vorschlägt, einmal wirklich gehen — im auslösenden Zustand, nicht im gesunden.

### 3.53 Der Schreiber und der Prüfer kannten dieselbe Regel verschieden

Am 29.07.2026 blockierte das Push-Tor einen fertigen, geprüften Punkt: Der Schnelltest war rot. Nicht am gelieferten Code — an einem Board-Zug, den dieselbe Sitzung Minuten zuvor mit dem dafür vorgesehenen Werkzeug ausgeführt hatte. Eine Karte ohne Zeitschätzung war in die Warteschlange zurückgewandert, und der schreibende Baustein ließ die Schätzung in diesem Fall einfach **weg**. Der prüfende Baustein akzeptiert eine fehlende Schätzung aber nur, wenn sie mit seinem eigenen Namen ausgesprochen wird („Schätzung offen"); Schweigen zählt als Verstoß. Beide Seiten hielten sich für regelkonform, weil jede die Regel für sich buchstabierte.

Bemerkenswert ist der Weg des Schadens: kein Bildfehler, keine falsche Ausgabe — ein legaler Zug erzeugte ein Artefakt, das die Prüfschicht ablehnt, und damit stand die gesamte Unit-Ebene rot und **jeder** Push blockiert, für jede Arbeit, bis jemand die Ursache sucht. Ein Durchsetzungsapparat kann sich auf diesem Weg selbst lahmlegen, ohne dass am Produkt irgendetwas kaputt wäre.

Die Reparatur war nicht, den Fall zu umgehen — eine Schätzung von Hand nachzutragen hätte den Lauf ebenso grün gemacht und den Fehler stehen gelassen —, sondern die zweite Buchstabierung zu **entfernen**: Der Schreiber importiert jetzt den Namen, den der Prüfer für „noch keine Schätzung" führt, statt ihn ein zweites Mal zu formulieren. Damit kann die Regel nicht mehr an zwei Stellen auseinanderlaufen; dieselbe Bewegung wie in §3.21, nur zwischen zwei Programmteilen statt zwischen zwei Dokumenten.

**Lehren:** Wo ein Modul schreibt, was ein anderes prüft, gehört der geprüfte Wert **importiert**, nicht wiederholt — eine zweite Formulierung derselben Regel ist eine Sollbruchstelle mit Verzögerungszündung. Und: Wenn ein grüner Bereich rot wird, ohne dass jemand ihn angefasst hat, ist die erste Frage nicht „welcher Test ist kaputt", sondern „welcher Zustand hat sich unter dem Test verändert" — hier war es eine Datei, die gar nicht im Testverzeichnis liegt.

### 3.54 Der Beweis, den eine ungeprüfte Anweisung schreibt

Am 29.07.2026 meldete der `model-guard` einen Verstoß gegen die Modell-Politik: zwei frische Commits trugen einen Co-Author-Trailer außerhalb der Erlaubnisliste, die geforderte Reaktion ist das Anhalten des Batches. Tatsächlich war das ausführende Modell zugelassen. Falsch war der **Trailer** — und zwar, weil die delegierende Sitzung ihn im Auftragstext selbst diktiert hatte, in der generischen Form ohne Modellnamen. Der Guard prüft auf den Namen; ein ungenannter Autor ist ihm damit ein verbotener.

Der Punkt ist nicht der Tippfehler, sondern die Bauform: Ein Durchsetzer prüft hier ein **Artefakt, das eine Anweisung erzeugt, die er nie sieht**. Zwischen der Regel und ihrem Beweis liegt ein frei formulierter Prompt, und dort kann die Regel unbemerkt anders buchstabiert werden — dieselbe Bewegung wie §3.53, nur dass die zweite Buchstabierung diesmal nicht in einem Modul steht, sondern in natürlicher Sprache. Ein falscher Alarm ist dabei nicht harmlos: Er ist von einer echten Degradation (§3.17) nicht zu unterscheiden, und genau das kostet die Zeit — die Sitzung muss erst beweisen, dass sie kein Problem ist.

Die Reparatur folgt derselben Linie: Die Trailer-Form gehört nicht in jeden Prompt neu geschrieben, sondern aus einer Quelle bezogen — und der Guard soll den ungenannten Autor als *unbekannt* behandeln statt als *verboten* (Arbeitsauftrag Punkt 397, aus demselben Befund entstanden). Bis dahin trägt die Delegations-Regel die Form ausdrücklich.

**Lehre:** Wenn ein Guard ein Artefakt liest, ist die eigentliche Frage, **wer dieses Artefakt schreibt**. Steht dazwischen ein Text, den niemand prüft, ist die Durchsetzung nur so belastbar wie die Sorgfalt in diesem Text — und ein Guard, dessen häufigster Treffer ein Eigentor ist, verliert genau die Autorität, für die er gebaut wurde.

### 3.55 Was beim Umzug still zurückbleibt

Punkt 400 verlegte die Fortschrittstafel von einem claude.ai-Artefakt, wo das HTML-Fragment das ganze Dokument WAR, auf eine GitHub-Pages-Hülle, die das Fragment lädt und per `document.write` einsetzt. Der Umzug hatte einen guten Grund — die headless gestartete Nachfolgesitzung besitzt kein Artifact-Werkzeug und konnte gar nicht veröffentlichen. Er kostete vier Eigenschaften auf einmal, und keine davon meldete sich:

Der Selbst-Auffrischer holte weiterhin `location.href` — unter der Hülle also die Hülle, die kein `<main>` besitzt; der Tausch unterblieb, alle 30 Sekunden, für immer. Sein eingebauter Notausgang griff nicht, weil er einen FEHLGESCHLAGENEN Abruf braucht und die Hülle sauber 200 liefert. Das Viewport-Meta der Hülle wurde mit dem alten Dokument verworfen, und die Seite fiel auf Chromes 980-Pixel-Ersatzbreite zurück: auf dem Telefon, dem einzigen Gerät, auf dem sie gelesen wird, um den Faktor 2,4 zu klein. Die Warteschlange wurde zugleich von einem gepflegten Dokument zu einer Projektion — nur wanderte der vorhandene Bestand nie in die Datenquelle: 79 von 81 Karten standen auf Platzhaltertext, keine trug eine Schätzung, und die vom Nutzer gesetzte REIHENFOLGE, das einzige Datum der Tafel, das nirgendwo sonst existiert, war durch die Nummernfolge ersetzt.

Formal war dabei nichts kaputt. Jede Karte stand auf der Tafel, jeder Wächter war grün, die Seite lud. Gemerkt hat es der Leser — nach Stunden, in vier getrennten Meldungen.

Der gemeinsame Nenner ist nicht Nachlässigkeit, sondern die Bauform: Alle vier Eigenschaften waren **geerbt**, nicht zugesichert. Sie galten, solange die Umgebung sie mitbrachte, und niemand hatte je aufgeschrieben, dass sie gelten sollen. Ein Umzug tauscht die Umgebung — und was nur geerbt war, fällt lautlos weg. Verschärfend kam hinzu, dass der Auffrischer in einer nicht versionierten Datei lebte: kein Test, keine Gegenprüfung und kein zweites Modell konnten ihn je sehen.

**Lehre:** Vor einem Wechsel des Auslieferungswegs gehört aufgezählt, was der alte Weg zusichert — und jede dieser Zusagen braucht zuerst einen Test am AUSGELIEFERTEN Ergebnis. Eigenschaften ohne Test sind nicht zugesichert, sondern geliehen. Und Logik, die außerhalb der Versionsverwaltung liegt, ist von jeder Prüfung ausgenommen, die das Projekt sonst für selbstverständlich hält.

### 3.56 Die Marke, die ein Seitenstrich zurücknahm

Die Sitzungsgrenze wurde ordnungsgemäß genommen: `batch-boundary.mjs 419` meldete „boundary recorded", der Punkt war abgehakt, der Starter scharf. Zwei Aufrufe später verlangte der Wächter dieselbe Grenze erneut — die Marke war weg, ohne dass irgendetwas es gesagt hätte.

Die Ursache liegt in einer an sich richtigen Regel: Eine genommene Grenze wird von jeder Arbeit ZURÜCKGEZOGEN, die den Batch fortsetzt, denn wer weiterarbeitet, ist nicht fertig. Ausgenommen ist eine kleine Menge von Abschluss-Skripten. Die Prüfung dafür zerlegt die Kommandozeile an ihren Trennern und verlangt, dass JEDES Segment ein Abschluss-Skript ist — richtig gegen `board.mjs & npm test`, aber eben auch gegen `node scripts/focus.mjs set … | tail -2`. Ein `tail` ist kein Abschluss-Skript, also galt der ganze Aufruf als Fortsetzung der Arbeit. Ein Seitenstrich, der nur die Ausgabe kürzt, nahm die Grenze zurück.

Zwei Dinge machten es teuer. Erstens war die Rücknahme **stumm**: kein Protokolleintrag, keine Meldung, und die nächste Guard-Meldung liest sich, als habe man die Grenze nie genommen. Zweitens ist der Zug, in dem das passiert, genau der Zug, in dem man Ausgaben kürzt — am Ende, beim Aufräumen, wo man nur noch schnell nachsehen will, ob alles sitzt.

**Lehre:** Wo ein Mechanismus einen Zustand aufgrund von BEOBACHTETEM VERHALTEN zurücknimmt, muss die Beobachtung zwischen „Arbeit" und „Hinsehen" unterscheiden — ein Pager ändert nichts an der Welt. Und eine automatische Rücknahme, die niemand mitbekommt, ist von einem Fehler nicht unterscheidbar: Sie gehört protokolliert, mit dem Aufruf, der sie ausgelöst hat.

### 3.57 Die Anleitung an den Nutzer ist die schlechteste aller Antworten

Eine Sicherheitsschranke verweigerte mir zwei Dateizugriffe: das Vorrücken der Modell-Marke und das Löschen der Pausendatei. Ich habe daraufhin dem Nutzer eine saubere, nummerierte Handanleitung geschrieben — welche Datei, welche Zeile, welcher Wert. Seine Antwort war deutlich: „Wenn ich von Hand Schritte durchführen muss, durch die du mich lenkst, ist das ja noch schlimmer, als wenn ich Rückfragen bekomme, die ich nur abnicken muss. Eigentlich will ich weder noch."

Der zweite Zugriff wäre gar nicht nötig gewesen. Das Projekt besitzt für genau diesen Zweck eine eigene Funktion — `clearPaused()` in `scripts/batch-lock.mjs`, seit Monaten da, im Kopf derselben Datei dokumentiert. Ich hatte sie nicht gesucht, weil die Verweigerung wie eine Frage nach BERECHTIGUNG aussah und nicht wie eine Frage nach dem WEG. Dieselbe Verwechslung eine Stunde vorher: Statt selbst zu ermitteln, welches Modell fünf Commits geschrieben hatte, hatte ich den Nutzer gefragt — obwohl die Mitschriften jeder Sitzung und jedes Agenten das Modell je Anfrage festhalten und die Antwort in zwei Minuten belegbar war.

**Lehre:** Eine blockierte Aktion ist zuerst ein Hinweis auf den falschen WEG, nicht auf eine fehlende Erlaubnis. Bevor irgendetwas an den Nutzer geht, wird das Repository nach dem vorgesehenen Kommando durchsucht und die Frage selbst beantwortet, soweit die Fakten im Haus liegen. Existiert kein Weg, ist das eine fehlende Mechanik — also ein Arbeitsauftrag, keine Hausaufgabe für den Nutzer. An den Nutzer geht nur, was wirklich SEINE Entscheidung ist.

### 3.58 Ein Agent in Arbeit, zwei Plätze leer

Der Pool darf drei Agenten parallel fahren. Die Sitzung beauftragte einen Punkt, meldete ordnungsgemäß Wartearbeit an — und wartete dann anderthalb Stunden auf diesen einen Agenten, während die Warteschlange voll unabhängiger Punkte stand. Der Nutzer sah es an der Tafel, bevor irgendein Mechanismus es sah: „Nur ein Punkt in Arbeit? Ist aktuell keine Parallelisierung sinnvoll?"

Alle Regeln dazu waren erfüllt. Die Warteanmeldung ist gebaut und erzwungen, der Leerlauf-Wächter greift, die Obergrenze steht in der Delegationsregel. Nur ist die Obergrenze eben eine OBERGRENZE — und niemand prüft die Untergrenze. Eine Sitzung, die einen Agenten beauftragt und sich schlafen legt, verletzt keine einzige Regel, verschenkt aber zwei Drittel des Durchsatzes, und zwar unsichtbar: Von außen sieht Warten wie Arbeiten aus.

**Lehre:** Wo eine Ressource eine Obergrenze hat, braucht sie auch eine Untergrenze, sobald Arbeit ansteht. Die Wartemeldung ist der richtige Ort dafür: Wer sich wartend erklärt, erklärt zugleich, warum die freien Plätze frei sind — und das ist eine Angabe, die eine Maschine prüfen kann, weil sie die Zahl der laufenden Agenten und die Länge der Warteschlange beide kennt.

### 3.59 Der Nachweis reichte nur so weit wie die damalige Freiheit

Mit dem senkrechten Blick bekam die Ego-Sicht eine neue Bewegungsachse — und im ersten Bild, das über die Kante des begehbaren Bodens nach unten sieht, steht eine gerade Helligkeitskante quer durchs Bild: begehbarer Boden und Hintergrundlandschaft werden verschieden beleuchtet. Der Fehler ist nicht neu. Das zugehörige Kriterium fordert seit Längerem, dass dort „keine Kante, keine unbeleuchtete Fläche und kein Loch" ist, und es galt als erfüllt — geprüft wurde es am Augenhöhen-Horizont, wo genau diese Naht auf der Fluchtlinie liegt und niemand sie sehen kann. Die alte Prüfung war nicht falsch; sie deckte nur den Ausschnitt ab, den das Spiel damals überhaupt zeigen konnte.

Das ist eine eigene Klasse, weil kein Test dabei rot wird und keine Regel verletzt ist: Eine neue Freiheitsachse für den Spieler vergrößert rückwirkend die Fläche JEDES Kriteriums, das innerhalb der alten Freiheit nachgewiesen wurde — und der Nachweis altert dabei still. Bemerkenswert ist, dass der Fund aus der Bildprüfung kam, nicht aus der Suite: Die Suite prüfte, was sie schon immer prüfte, und war grün.

**Lehre:** Wer eine Bewegungs-, Blick- oder Zoomachse hinzufügt, prüft nicht nur das neue Feature, sondern fragt: welche bestehenden Zusagen wurden bisher nur deshalb eingehalten, weil man nicht hinsehen konnte? Diese Kriterien brauchen ihren Nachweis am neuen Rand des Erreichbaren — sonst wandert die Lücke unbemerkt aus dem Unsichtbaren ins Sichtbare, und zwar zum Nutzer.

---

### 3.60 Der Befund, der nur so lange lebte wie das Fenster

An einem Abend fielen drei echte Defekte an: die Projekt-Hooks, die außerhalb der Repo-Wurzel still gar nicht feuern; ein Bündelschema, das 53 von 91 offenen Punkten abdeckte, ohne dass irgendwo stand, dass es unvollständig ist; und ein Punkt, dessen Aufräum-Schuld sich binnen 24 Stunden neu gebildet hatte. Alle drei standen nur im Gespräch. Sie sind heute festgehalten, aber nicht, weil ein Mechanismus sie eingefangen hätte — sondern weil der Nutzer zweimal nachfragte, ob sie überhaupt gesichert werden.

Die Klasse ist nicht Schludrigkeit, sondern Bauart. Wer einen Befund macht, ist oft genau die Sitzung, die ihn nicht aufschreiben darf: Das Arbeitsverzeichnis gehört einer anderen, das Stand-down verbietet den Schreibzugriff auf die Arbeitsordnung, und damit hat der wahrscheinlichste Fundort keinen dauerhaften Ausgang. Was blieb, war eine handgeschriebene Memory-Notiz — ein Träger, den nichts leert und dessen Vollständigkeit niemand prüft. Erschwerend: ein Befund sieht im Moment seiner Entstehung nie dringend aus. Er ist eine Randbeobachtung neben der eigentlichen Aufgabe, und genau deshalb überlebt er die Aufgabe nicht.

**Lehre:** Dauerhaftigkeit muss dort möglich sein, wo der Fund entsteht, nicht dort, wo die Arbeitsordnung liegt. Ein Ausgang, der nur der schreibberechtigten Sitzung offensteht, ist für die Hälfte aller Funde kein Ausgang. Und ein Träger ohne Leerungspflicht wird zum Lager: Wer ihn füllen darf, muss verpflichtet sein, ihn zu leeren, sobald er wieder schreiben darf — sonst verschiebt der Mechanismus den Verlust nur von der Sitzung auf die Datei.

---

### 3.61 Zwei Stunden erkannt, zwei Stunden nur notiert

Die Nacht zum 30.07.2026 sollte zwei Arbeitspakete abarbeiten. Um 21:50 starben beide delegierten Agenten an einem Serverfehler; kurz danach fiel der Berechtigungs-Klassifizierer der Umgebung aus, und die haltende Sitzung konnte keinen Befehl mehr ausführen. Sie war nicht abgestürzt — sie stand. Um 04:19 war der Stand derselbe wie um 21:53: sechs Stunden, null Fortschritt.

Der Wächter dafür existiert und hat funktioniert. Das Launcher-Protokoll zeigt ab 00:06 alle fünfzehn Minuten dieselbe Zeile: „WEDGED owner: pid alive but heartbeat 251 min old", dann 266, 281, 296, 311, 326, 341, 356, 371. Acht Feststellungen über zwei Stunden — und keine einzige Handlung. Kein Nachfolger, keine Freigabe des Locks, keine Eskalation über die eine Benachrichtigung hinaus. Davor las derselbe Launcher 221 Minuten Stille als „owner alive", weil die Schwelle für „festgefahren" bei vier Stunden liegt: länger als jede Nacht, in der es sich lohnen würde, zu retten.

Das ist keine fehlende Erkennung, sondern eine **Erkennung ohne Folge** — die teuerste Sorte, weil sie sich wie Absicherung anfühlt. Und es ist die Umkehrung von §3.43: dort verschluckte eine fail-open-Hülle den Fehler, hier wird er sauber gemeldet und niemand hört zu. Erschwerend kommt hinzu, dass die haltende Sitzung genau die Instanz ist, die den Ausfall nicht bemerken kann: Sie wartet auf einen Aufruf, der nie zurückkommt, und ihre eigene Wartemeldung lief in der Zwischenzeit ab, ohne dass daraus etwas folgte.

**Lehre:** Ein Zustandsurteil braucht eine Handlung, sonst ist es ein Kommentar. Wo ein Wächter „festgefahren" feststellen kann, muss dieselbe Stelle auch entscheiden dürfen — Lock freigeben und Nachfolger starten —, und die Schwelle dafür gehört an die Länge der unbeaufsichtigten Strecke, nicht an eine runde Stundenzahl. Wiederholt sich dieselbe Feststellung mehrfach, ist die Wiederholung selbst das Signal: Was achtmal gleich lautet, wird beim neunten Mal nicht wahrer, sondern teurer.

**Erledigt (30.07.2026, Punkt 434, Schicht 1).** Der Besitz am Batch ist jetzt eine **Lease**: Das Lock trägt ein Ablaufdatum, das die Sitzung VOR jedem Werkzeugaufruf verlängert, und wer nicht mehr verlängert, besitzt den Batch nicht mehr. Damit ist aus dem Urteil eine Rechnung geworden — keine Sonde, kein Ermessen, keine Bedingung dazwischen, und genau deshalb kann sie nicht mehr wie in jener Nacht an einer Bedingung hängenbleiben. Getötet wird weiterhin nichts: Der verdrängte Prozess läuft weiter und erfährt am nächsten Hook, dass er nicht mehr zuständig ist. Ein **Zaun** in einer eigenen, nie gelöschten Datei hält fest, wer wen abgelöst hat, und ein einzelner PreToolUse-Engpass verweigert einer abgelösten Sitzung die vier Wege, die bis dahin ungeschützt waren: Merge und Push, den Haken in der Arbeitsliste, die Tafel-Veröffentlichung und den gemeinsamen Zustand. Alles andere darf sie weiter — eine Sperre, aus der man nicht herauskommt, wäre schlimmer als der Stillstand.

Der eigentliche Ertrag steckt aber im Abriss: **Drei Urteile über dieselbe Frage sind auf eines zusammengefallen.** Die Stillstandsschwelle der erklärten Arbeit, die Wedge-Konstruktion mit ihrer Identitätsprüfung und das Altersventil haben in jener Nacht alle drei „Besitzer lebt" gesagt — jedes für sich richtig, jedes mit eigener Schwelle und eigener Prüfung, und in der Summe war die Aussage falsch. Sie sind im selben Commit verschwunden, der die Lease scharf gestellt hat; wer sie einzeln abgebaut hätte, hätte dem nächsten Leser drei Antworten auf eine Frage hinterlassen. Was überlebt hat, ist das Wiederholungssignal aus §3.61 — jetzt am Lease-Urteil: Eine Übernahme, die den Stillstand nicht löst, ist beim zweiten Mal die Meldung wert, nicht beim achten.

---

### 3.62 Die Rettung, die den Schaden verstärkt hätte

Der Entwurf gegen §3.61 war fertig, begründet und mit der etablierten Praxis abgeglichen: Lease statt Lock, ein zweiter Wächter, ein Totmannschalter, Wiederholung gestorbener Agenten. Die Gegenprüfung durch das andere Modell fand darin eine Lücke, die den ganzen Zweck aufgehoben hätte. Läuft die Lease ab und startet ein Nachfolger, startet er in dieselbe kaputte Umgebung und fährt sich identisch fest — und der Fehlerzähler, der eine Endlosschleife bremsen soll, steigt nur, wenn die Prozess-ID verschwunden ist. Eine Kette lebendig-aber-festgefahrener Nachfolger hätte die Nacht durchgebrannt und dabei beschäftigt ausgesehen. Aus einem stillen Ausfall wäre ein lauter geworden, teurer als das Problem.

Zwei weitere Befunde derselben Prüfung gingen in dieselbe Richtung: Der geplante zweite Wächter wäre auf derselben Aufgabenplanung, demselben Node und derselben Platte gelaufen wie der erste — widerlegt durch das eigene Protokoll, das an derselben Stelle abbricht. Und die Meldekette hätte auf einen Dienst gesetzt, der Nachrichten weiterleitet, aber ein *Ausbleiben* nicht bemerken kann.

Das ist eine eigene Klasse, weil kein Test sie zeigt: Der Entwurf war in sich stimmig, jede Schicht einzeln richtig, und die Lücke lag zwischen ihnen — in der Annahme, dass ein Neustart in eine Umgebung führt, die funktioniert. Bemerkenswert ist der Zeitpunkt: gefunden wurde sie an der BESCHREIBUNG, nicht am Code, und damit vor der ersten Zeile.

**Lehre:** Ein Mechanismus, der einen Ausfall behandeln soll, braucht die Frage „was, wenn die Ursache beim Wiederanlauf noch da ist?" — und eine Bremse, die auch dann zählt, wenn der Neustart *lebt* statt zu sterben. Die Gegenprüfung gehört an den Entwurf, nicht erst an das Ergebnis: Am Text kostet der Fund eine Stunde, am gebauten Wächter eine Nacht.

---

### 3.63 Drei Wochen rote Pipeline, und gemerkt hat es das Postfach

Am Morgen des 30.07.2026 meldete der Nutzer, sein Postfach werde von Fehlermails überflutet. Die Messung danach: von den letzten hundert CI-Läufen sind **53 fehlgeschlagen, 26 davon auf `main`**, verteilt vom 9. bis zum 30. Juli. Nicht ein Vorfall, sondern ein Dauerzustand — und die einzige Instanz, die ihn bemerkte, war der Mailversand von GitHub an den Menschen.

Zwei Ursachen greifen ineinander. Die erste ist eine Lücke im Blickfeld: `ci-status-guard` fragt nach dem HEAD **seiner eigenen Sitzung**. In der Nacht stand der Hauptbaum auf `main` und war grün, während jeder Push eines delegierten Agenten auf seinem Zweig rot lief — elf Läufe, elf Mails, und die Sitzung, die es hätte beheben können, erfuhr nie davon. Die zweite ist grundsätzlicher: das lokale Vor-Push-Tor fährt **dieselbe** Testschicht wie CI, fängt also alles außer dem, was sich nach Plattform unterscheidet. Genau das war der Auslöser — eine Negativkontrolle behauptete einen Windows-Vorfall (die Entfernung folgt einer Verknüpfung und löscht deren Ziel) auf jeder Plattform, war auf der schreibenden Maschine grün und auf dem Linux-Runner zwangsläufig rot.

Bemerkenswert ist der Diagnose-Irrweg dazwischen: Lokal lief ein anderer Test ins Zeitlimit, und das sah nach der Erklärung aus. Es war eine echte, unabhängige Verschlechterung — eine Prüfung mit einem Git-Prozess pro Paar, siebenhundert Prozesse — aber nicht die Ursache der Mails. Ohne den Blick ins CI-Protokoll wäre der Fix behoben und das Problem geblieben.

**Lehre:** Ein Tor, das dieselbe Prüfung wie die Fernumgebung fährt, deckt alles ab **außer der Umgebung selbst** — Plattform, Uhr, Dateisystem. Deshalb reicht „rot bemerken" nicht: Was zählt, ist die Bestätigung, dass der gepushte Stand dort GRÜN wurde, wo er wirklich läuft. Und ein Test, dessen Gegenstand Betriebssystemverhalten ist, formuliert seine Behauptung pro Plattform — sonst bedeutet sie auf der Plattform, die sie ausführt, gar nichts.

### 3.64 Die Erinnerung, die neben ihrem eigenen Tor stehen blieb

Der Leitsatz dieses Projekts lautet: erzwingen statt erinnern. Am 30.07.2026 zeigte sich seine Rückseite. Der Text, den der `UserPromptSubmit`-Hook in **jede** Eingabe einspritzt, wiederholte auf 2153 Zeichen die Board-Struktur — vier Sektionen, ihre Reihenfolge, die Kartenform, das `open`-Verbot, die Kopfzeile der Warteschlange. Jede einzelne dieser Regeln weist der Publish-Gate seit Wochen von sich aus zurück. Die Erinnerung wurde also nicht abgelöst, als ihr Mechanismus kam; sie blieb daneben stehen und wurde von da an **doppelt** bezahlt — einmal in Rechenzeit beim Prüfen, einmal in Kontext bei jedem Zug. Nach dem Schnitt bleiben 843 Zeichen: genau das, was keine Maschine entscheiden kann (steht eine Information in der falschen Sektion, sieht die Tafel auf dem Handy gut aus, wird eine Strukturänderung vorgeschlagen statt gemacht) plus die Befehle.

Beim Beantworten der Nachfrage des Nutzers — „hast du noch mehr solcher Altlasten?" — fiel sofort die nächste auf: Die Regel, dass jede Antwort mit dem Zeitstempel beginnt, steht **dreimal** in derselben Eingabe, obwohl `timestamp-guard` das Zugende ohnehin blockiert. Das ist kein Einzelfall, sondern eine Klasse, und sie entsteht zwangsläufig: Ein Mechanismus wird gebaut, weil die Erinnerung versagt hat — und niemand hat die Aufgabe, die Erinnerung danach zu löschen.

**Lehre:** Der Commit, der ein Tor einführt, muss den Text streichen, den dieses Tor ersetzt — sonst wächst neben jedem Mechanismus sein eigener toter Zwilling. Und was ein Tor nicht prüfen kann, bleibt vollständig stehen: Eine Kürzung, die eine echte Pflicht mitnimmt, wäre teurer als die Wiederholung.

### 3.65 Der Rückfall, der nichts sagt

Der Nutzer fragte zum zweiten Mal, warum die Kartentitel seiner Tafel englisch und in Großbuchstaben stehen. Die Ursache ist eine Fallback-Kette von drei Gliedern: Fehlt einer Karte der geschriebene deutsche Titel, nimmt der Generator die Überschrift aus der Arbeitsliste — und die ist per Projektregel englisch und in Versalien. Acht von 77 Karten standen so, alle frisch angehängt.

Der Fehler ist nicht der Rückfall selbst; ein namenloser Eintrag wäre schlimmer. Der Fehler ist, dass er **schweigt**. Ein stiller Ersatz sieht im Code aus wie Sorgfalt und im Ergebnis wie Nachlässigkeit, und weil niemand ihn meldet, wird er erst vom Leser entdeckt — hier zweimal vom selben Leser.

**Lehre:** Jeder Rückfall auf einen Ersatzwert wird gemeldet, an der Stelle, an der er greift. Und die Zeile, die ihn meldet, nennt den Befehl, der ihn behebt — sonst wird er von Hand behoben, was hier prompt die Datei mit falschen Zeilenenden zurückschrieb und die Archiv-Rotation der Tafel zum Absturz brachte.

### 3.66 Die Kennung, die nur innen etwas bedeutet

„Die Buchstaben sagen nichts aus" (Nutzer, 30.07.2026). Die Arbeitspakete dieses Projekts heißen seit ihrer Einführung A bis M, und genau so standen sie im Chat und auf der Tafel — „Bündel H ist abgeschlossen". Für die Maschine ist der Buchstabe eine perfekte Kennung: kurz, eindeutig, stabil. Für den Leser ist er eine Nachschlagepflicht — bevor er irgendetwas beurteilen kann, muss er erst herausfinden, was H überhaupt ist.

Es ist dieselbe Klasse wie die Regel, einen gefundenen Fehler in sichtbaren Worten statt in Modul- und Seeder-Namen zu melden, nur eine Ebene höher: Diesmal war nicht der Befund, sondern die ORDNUNG der Arbeit in einer Sprache formuliert, die nur innen gilt. Und sie ist billig zu vermeiden — jedes Paket hat jetzt einen deutschen Namen („Chat & Tafel", „Kadaver & Geier"), der Buchstabe bleibt die interne Kennung der Tabelle.

**Lehre:** Eine Kennung, die der Leser nachschlagen muss, ist im Gespräch mit ihm keine Kennung, sondern eine Hürde. Was nach außen geht, trägt den Namen; die Kurzform bleibt drinnen. Und wer ein neues Paket schneidet, vergibt den Namen im selben Moment — ein Buchstabe allein ist keine vollständige Definition.

### 3.67 Das Review, das seinen Autor überlebt

Dreimal an einem Vormittag (30.07.2026) hat ein delegierter Agent sein Zweitmodell-Review im Hintergrund gestartet und die Arbeit beendet, bevor das Urteil zurückkam. Das Urteil landete jedes Mal bei der Elternsitzung — einmal mit „nicht mergen" und zwei Blockern, von denen einer den Hauptzweig rot gemacht hätte. Der Zweig sah geprüft aus: Es hatte ein Review gegeben, es war nur nie jemand da, der die Funde umsetzt.

Das ist nicht die Nachlässigkeit eines Agenten, sondern eine Lücke in der Form. Ein Review ist keine Prüfung, die man ANSTÖSST, sondern eine, die man ABSCHLIESST; wer den Anstoß für die Erfüllung hält, hat die teuerste Hälfte weggelassen. Dieselbe Verwechslung wie beim Herzschlag, der für Fortschritt gehalten wird, nur auf der Qualitätsseite.

**Lehre:** Ein aufgezeichnetes Urteil „nicht mergen" oder „mit Korrekturen" erfüllt kein Tor — erst ein späteres Urteil über einen späteren Commit tut das. Und wer ein Review beauftragt, bleibt im Zug, bis es da ist.

### 3.68 Der Test, der nur im Nebenbaum grün ist

Zwei Blocker desselben Tages hatten dieselbe Ursache: Ein Test bestand, weil eine git-ignorierte Datei im Arbeitsbaum des Agenten FEHLT — im Hauptbaum aber existiert. Er prüfte damit nicht das Verhalten, sondern die Zufälligkeit seiner Umgebung, und wäre beim Merge rot geworden. Der zweite Fall war der erste, eine Zeile weiter.

Die Isolation, die parallele Agenten überhaupt erst möglich macht, ist also zugleich eine Falle: Der Nebenbaum ist eben NICHT der Hauptbaum, und alles, was nicht im Repository liegt — Sperren, Kanäle, Laufzeitzustand —, fehlt dort. Ein Test, der echte Pfade liest, misst deshalb im Nebenbaum systematisch etwas anderes als dort, wo er später laufen muss.

**Lehre:** Jeder neue Test bekommt seine Pfade eingespritzt, nie gelesen. Und die Prüffrage vor dem Abgeben lautet nicht „ist er grün?", sondern „wäre er auch im Hauptbaum grün, mit allem Laufzeitzustand, der dort liegt?"

### 3.69 Die Sonde, die ihren eigenen Blick misst

Die frisch gebaute Lebendigkeits-Prüfung sollte einen delegierten Agenten an seinem ERGEBNIS beurteilen statt an seinem Protokoll — die Lehre aus dem Agenten, der nach 59 stillen Minuten für tot erklärt wurde und arbeitete. Gemessen datierte sie vier Git-Dateien, also den letzten Git-BEFEHL, nicht die letzte Bearbeitung. Ein Agent, der zwanzig Minuten Quelltext schreibt, ohne git aufzurufen, galt wieder als still; ein eigener Blick in seinen Arbeitsbaum konnte die Uhr zurücksetzen. Die Korrektur fiel beim ersten Anlauf zu kurz aus: Git meldet ein KOMPLETT NEUES Verzeichnis standardmäßig nur als Verzeichnis, und dessen Zeitstempel bewegt sich nicht, wenn darin eine Datei geändert wird — die Lücke bestand für jeden neu angelegten Ordner fort.

**Lehre:** „Am Ergebnis messen" ist erst dann umgesetzt, wenn das Gemessene wirklich das Ergebnis ist. Ein Stellvertreter, der leicht zu beschaffen ist — eine Metadatei, ein Verzeichnisdatum —, ist die wahrscheinlichste Stelle, an der die Regel formal erfüllt und faktisch verfehlt wird. Und eine Sonde, die der Beobachter durch bloßes Hinsehen verändert, misst ihn statt des Beobachteten.

### 3.70 Die Übergabe, die ein totes Fenster nicht einlösen konnte

Am 30.07.2026 fiel Claude für rund eine Stunde aus, mitten in einem Zug. Der Batch überlebte das mustergültig: Der Launcher stellte um 10:36 „no owner lock — taking over" fest, startete einen headless Nachfolger, und der lieferte in den folgenden zwei Stunden zwei Dutzend Commits. Die autonome Erholung funktionierte also genau wie entworfen.

Was durchfiel, war die Übergabe an das Fenster des Nutzers. Sie ist ein Zwei-Schritt-Handschlag: Das Fenster beansprucht den Batch, der Eigentümer gibt ihn am nächsten sauberen Zugende frei, und das Fenster **holt ihn dann ab**. Die Freigabe kam um 10:16 — in eine Sitzung, die der Ausfall gerade getötet hatte. Ein Anspruch, der eingelöst werden MUSS, ist damit nur so verlässlich wie der Anspruchsteller im Moment der Freigabe, und dieser Moment ist genau der, den niemand wählt. Zwanzig Minuten später nahm der Launcher den freien Lock für sich, korrekt nach seinen Regeln und trotzdem gegen die Absicht des Nutzers.

Die Klasse ist dieselbe wie beim Herzschlag, der für Fortschritt gehalten wird, nur an der Übergabe statt an der Lebendigkeit: Ein Mechanismus, der einen zweiten Schritt von der Gegenseite ERWARTET, hat für dessen Ausfall keinen Plan. Punkt 434 hatte die Schwesterlücke schon geschlossen — ein Anspruch verfällt nicht mehr, solange das Fenster lebt —, aber nur für die Zeit VOR der Freigabe; danach ist der Anspruch verbraucht und es gewinnt, wer zuerst greift.

**Lehre:** Ein Handschlag, dessen zweite Hälfte bei der Gegenseite liegt, braucht ein Zeitfenster, in dem niemand anders zugreifen darf — und die Prüfung eines Wiederanlaufs endet nicht bei „läuft es weiter?", sondern bei „läuft es dort weiter, wo es laufen sollte?". Ein Ausfall trifft nie die bequeme Stelle; jede Aktion mit zwei Hälften ist an ihrer Naht zu prüfen.

---

## 4. Die Guards als Immunsystem

Jedes Guard-Skript ist die geronnene Lösung eines real aufgetretenen, wiederholten Problems.

| Guard/Hook (in `scripts/`) | Erzwungenes Verhalten | Ursprung |
|---|---|---|
| `batch-progress-guard` | kein Turn-Ende bei offener Batch-Arbeit; Parallel-Detektor | 3.1 |
| `dashboard-guard` | Board-Currency (HEAD-Review, keine erledigten Punkte in der Queue) | 3.4 |
| `dashboard-integrity-guard` | Now-Karte = tatsächliche Arbeit (gegen die Fokus-Deklaration) | 3.4 |
| `dashboard-conciseness-guard` | Karten kurz, keine Text-Tapeten | 3.4 |
| `dashboard-card-topic-guard` | eine Karte = ein Thema | 3.4 |
| `board-first-guard` | erste zustandsändernde Aktion eines Zuges erst, wenn das Board die beginnende Arbeit beschreibt (PreToolUse statt Stop) | 3.32 |
| `queue-order-guard` | Fixes vor Findern | Abarbeitungsreihenfolge |
| `tasks-spec-guard` | keine „erst falsch, dann korrigiert"-Trails in Specs | verwirrende Aufträge |
| `render-verify-guard` | Render-Change nur mit grünem Lauf auf BEIDEN Backends | 3.6 |
| `model-guard` | kein Weiterarbeiten nach dem Trailer eines nicht freigegebenen Modells | 3.17 |
| `ci-status-guard` | rote CI wird bemerkt | stille CI-Fehler |
| `closing-guard` | kein Versions-Tag, solange ein Closing-Schritt unbelegt ist | 3.15 |
| `push-arrival-guard` | kein Turn-Ende, solange Commits in keiner Remote-Ref liegen | 3.18 |
| `commit-scope-guard` | kein Fremdkörper im Commit (Wurzeldateien, fremde Verzeichnisse, große Binärdateien) | private Datei im Repo |
| `tasks-archive-guard` | Arbeitsauftrag bleibt geteilt: offen in TASKS.md, erledigt im Archiv | 13.000-Zeilen-Datei je Zug |
| `doc-budget-guard` | gemessene Obergrenze für die ständig gelesenen Dokumente | 3.30 |
| `retro-currency-guard` | dieses Dokument bleibt aktuell zu seinen Quellen | 3.21 |
| `retro-currency-guard` (Register) | **jede** Lektion aus Abschnitt 3 trägt eine erfasste Mechanismus-Entscheidung (`lesson-mechanisms.md`): bestehender Durchsetzer verbreitert, neuer Durchsetzer, oder bewusst keiner mit Begründung | 3.16 |
| `guide-brevity-guard` | Anleitung bleibt kurz und projekt-neutral | 3.26 |
| `rule-review-guard` | periodische Durchsicht des ganzen Regelbestands | 3.25 |
| `guard-health-guard` | kein Durchsetzer im Baum, den nichts aufruft | 3.25 (4) |
| `timestamp-guard` | Antwort beginnt mit gemessenem Berlin-Stempel | 1. |
| `prep-guard` + `prep-arm-hook` | Wartezeit erzwingt Read-only-Vorarbeit | Däumchendrehen |
| `batch-singleton` + Heartbeat + `batch-doctor` | harte Exklusivität + Repo-Heilung | 3.2 |
| `batch-autostart` (OS-Task) | spawn-sicherer Wiederbeleber | toter Batch nach Crash |
| `batch-resume-hook` | Auto-Resume bzw. Stand-down-Anweisung | Kontextverlust nach Neustart |
| `worktree-reminder` | Delegations-Disziplin | Branch-Kollisionen |
| `defer-for-user` / `notify` | nie auf den Nutzer blockieren; Signal aufs Handy | Batch fror an Rückfragen fest |

Drei Konstruktionsprinzipien haben sich bewährt: **fail-open** (ein Guard-Fehler blockiert nie die Session — sonst wird das Immunsystem zur Autoimmunkrankheit; durchlassen heißt dabei nicht, im Fehlerfall Zustand fortzuschreiben, §3.38), **pure, getestete Kerne** (`*-core.mjs` + Vitest) und seit dem 24.07. **ownership-aware** (ein Guard drängt nur den Lock-Owner in Pflichten).

---

## 5. Meta-Lehren

1. **Durchsetzung schlägt Erinnerung — je früher, desto billiger.** Der Weg Regel → Memory → Guard wurde ein halbes Dutzend Mal einzeln durchlaufen.
2. **Lösungen erzeugen Folgeprobleme.** Die schwersten Vorfälle waren Fix-of-Fix: Der Wiederbelebungs-Apparat erzeugte die Doppel-Sessions. Vor jedem Mechanismus die Frage: Welche neue Fehlerklasse eröffnet er?
3. **Proxys lügen freundlich.** Uniform-Werte, geratene Radien, Debug-Zustände, das falsche Backend, eine laute Maschine — alles produzierte grüne Checks über echten Bugs.
4. **Der Nutzer war das beste Frühwarnsystem — ein Befund, kein Kompliment.** Fast jede Prozessregel geht auf eine präzise Beobachtung von ihm zurück. Ziel bleibt, diese Beobachtungen vorwegzunehmen.
5. **Ehrliche Selbst-Diagnose zahlt sich aus.** Die besten Wendepunkte begannen mit einer schonungslosen Mechanik-Analyse des eigenen Versagens.
6. **Autonomie skaliert nur mit Infrastruktur.** Maximale Delegation vervielfachte den Durchsatz — aber erst, nachdem Worktree-Isolation, Feature-Branches, Quiet-Machine-Disziplin und der Singleton standen. Dieselbe Delegation zwei Wochen früher hätte das Repo zerlegt.

---

## 6. Offene Risiken

- **Der Singleton ist jung.** Beobachten: „wedged"-Fälle (lebender Prozess, stundenalter Heartbeat). Die Wieder-Aktivierung des Scheduled Task hat eine Checkliste, die vollständig abgearbeitet werden muss.
- **Feature-Regressionen bleiben inhärent.** Das Netz senkt die Rate, eliminiert sie nicht.
- **Guard-Wildwuchs:** Die Kette läuft an jedem Turn-Ende. Bisher fail-open und pur getestet — aber jede weitere Regel verlängert sie. Gelegentlich konsolidieren, kein Guard ohne getesteten Kern.
- **Der Regelbestand** ist jetzt einmal durchgesehen; ohne den periodischen Zwang wächst er wieder nur an.

## 7. Empfehlungen

1. **„Regel → sofort Mechanismus"** als stehende Meta-Regel; der Bau ist inzwischen Schablone (pure Core + Vitest + fail-open + Stop-Hook) und selbst delegierbar.
2. **Invarianten- und Finder-Schicht ab Projektbeginn**, nicht als Nachrüstung: In-Game-Asserts, Matrix-Dimensionen und die Ästhetik-Frage gehören in die erste Testgeneration.
3. **Nebenläufigkeit: Exklusivität vor Redundanz.** Jeder künftige Wiederbeleber wird erst gebaut, nachdem ein atomarer, PID-basierter Owner-Lock existiert.
4. **Messdisziplin:** ruhige Maschine für Suiten, Ziel-Hardware für Perf, gemessene Zahlen in jeder Kommunikation.
5. **Nutzer-Artefakte als Verträge:** Struktur einfrieren, pro Klausel ein Prüfer, Änderungen nur als Vorschlag.
6. **Verbrauch messen, bevor man ihn drosselt — und die Voraussetzung mitprüfen** (§3.31). Die Anzeige nennt die Treiber; die eigene Vermutung nennt sie nicht. Der naheliegendste Hebel bleibt dabei abgelehnt: „billigeres Modell für einfache Aufgaben". Die Begründung dafür gehört §3.33 — eine Ersparnis wird gegen die Nacharbeit gerechnet, die sie auslöst. Der Abend des 24.07. belegt etwas anderes (§3.17): dass ein zu schwacher Arbeiter unbemerkt bleibt.

---

## 8. Ehrliche Bilanz

**Was gut lief:** In drei Wochen entstand ein POC mit realer Geodäsie, einem forschungsbasierten Klima- und Jahreszeitenmodell, einem dicht verwobenen Wildlife-Verhaltenssystem, zwei Render-Backends, zweisprachiger Lokalisierung, Sprachausgabe und einer zweischichtigen Regression. Nutzer-Bugreports wurden diszipliniert als implementierungsreife Punkte erfasst. Die Root-Cause-Analysen der schweren Vorfälle waren gründlich und beweisgeführt. Und der Prozess hat nachweislich **gelernt**: Dieselbe Fehlerklasse trat nach ihrem Guard nicht wieder auf.

**Wo der Nutzer zu Recht frustriert wurde:** Er musste dieselben Zusagen mehrfach anmahnen, die Aufsicht über meine Autonomie zeitweise selbst automatisieren, über Wochen die Mehrzahl der sichtbaren Bugs selbst finden, und zweimal bekam er „fertig" gemeldet, was auf seinem Backend nicht fertig war. Zwei seiner Abende störte Parallel-Session-Chaos, das meine eigene Infrastruktur verursacht hatte.

Der rote Faden: **Ich habe Zuverlässigkeit zu lange als Verhaltensfrage behandelt, obwohl sie eine Infrastrukturfrage ist.** Die Projektgeschichte ist der Beweis in beide Richtungen — solange nur „gemerkt" wurde, wiederholten sich die Fehler; sobald ein Mechanismus stand, verschwanden sie.

*Was zweimal schiefging, bekommt einen Mechanismus — nicht ein drittes Versprechen.*

---

<!-- AUTO-GENERATED:START -->
<!-- Dieser Abschnitt wird maschinell von scripts/retro-refresh.mjs gepflegt.
     NICHT von Hand editieren — der naechste Refresh ueberschreibt ihn.
     Die Prosa-Analyse ausserhalb der Marker bleibt unberuehrt. -->

## Anhang A — Maschinell gepflegte Quellen-Übersicht

Zuletzt aktualisiert: Donnerstag, 30.07.2026, 14:17 · Quellen-Fingerprint: `0acd6d8eb654…`

Spalten heuristisch aus den Quellen abgeleitet (Anläufe = distinkte Datumsnennungen im Memory;
Maßnahme = Guard-Skripte mit Namens-Treffer). Die inhaltliche Bewertung gehört der Prosa oben.

| Problemklasse (Memory) | Anläufe | Schwere (heuristisch) | Maßnahme (Guard-Treffer) | Status |
|---|---|---|---|---|
| Always use background-wait time for prep on upcoming tickets — autonomously, guaranteed by a mechanism, never on a reminder | 1 | niedrig | prep-arm-hook.mjs, prep-guard.mjs | ✔ Mechanismus |
| User's rulings on the point-205 plausibility audit (what to fix vs. accept, 21.07.2026) | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| For code audits/reviews, mix in a DIFFERENT model than the one that wrote the code — different blind spots find more bugs | 1 | niedrig | model-guard.mjs | ✔ Mechanismus |
| The hardened batch-autonomy system — never idle-stop, resurrect after crash/reboot, signal on failure, never block on the user | 1 | niedrig | batch-autostart.mjs, batch-doctor.mjs, batch-lock.mjs, batch-progress-guard.mjs, batch-resume-hook.mjs, batch-singleton.mjs | ✔ Mechanismus |
| The batch dashboard — its live GH-Pages transport, its BINDING four-section structure (never change without explicit user go) and update discipline | 11 | hoch | batch-autostart.mjs, batch-doctor.mjs, batch-lock.mjs, batch-progress-guard.mjs, batch-resume-hook.mjs, batch-singleton.mjs, dashboard-card-topic-guard.mjs, dashboard-conciseness-guard.mjs, dashboard-guard-fixtures.mjs, dashboard-guard.mjs, dashboard-integrity-guard.mjs, dashboard-reminder-hook.mjs | ✔ Mechanismus |
| RETIRED 27.07.2026 — this was a 16.07. work-in-progress handoff, not a rule; what survives is the research foundation, the accuracy principle and the §13-placeholder carve-out | 3 | mittel | batch-autostart.mjs, batch-doctor.mjs, batch-lock.mjs, batch-progress-guard.mjs, batch-resume-hook.mjs, batch-singleton.mjs | ✔ Mechanismus |
| A blocked tool call means the wrong path, not a missing permission — search the repo for its own command; never hand the user manual steps | 1 | niedrig | findings-guard.mjs | ✔ Mechanismus |
| The batch dashboard may leave the private claude.ai artifact for a publicly readable transport — privacy is no longer a constraint | 1 | niedrig | board-first-guard.mjs, dashboard-card-topic-guard.mjs, dashboard-conciseness-guard.mjs, dashboard-guard-fixtures.mjs, dashboard-guard.mjs, dashboard-integrity-guard.mjs, dashboard-reminder-hook.mjs | ✔ Mechanismus |
| Take the session boundary as the LAST action and with bare commands — a pipe makes the call count as work and silently deletes the marker | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Delegate via `node scripts/point-brief.mjs <N>` — the AGENT generates its own brief; board changes go through `scripts/board.mjs`; expect 529 agent deaths and commit-per-step | 2 | mittel | — (Regel/Memory) | ◐ Regel |
| F6 bug-report zips the user hands over are saved into the repo's git-ignored local/ folder — search there first, not only Downloads | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| A newly found problem goes into an EXISTING bundle point first; a new standalone point is the exception, and may instead re-cut the bundles | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Work packages are SPOKEN by name, never by letter — the user cannot read \"bundle H\"; the letter stays only as an internal ID | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Jede Chat-Antwort mit einem Zeitstempel nach deutscher Zeit (Europe/Berlin, DST-korrekt) beginnen | 11 | hoch | timestamp-guard.mjs | ✔ Mechanismus |
| CLAUDE.md §7.1 references design.md instead of retelling it; future doc edits must preserve the verifiable conditions, script mappings, numbering and checked numbers | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Autonomously insert a full CLOSING cycle (regression + dead-code/stale-doc cleanup + .md audit) when warranted — after extensive rework or many small completed tasks — without waiting for the user to ask | 1 | niedrig | closing-guard.mjs | ✔ Mechanismus |
| hoa commit messages must not reference the TASKS point (\"Point N\") | 1 | niedrig | commit-scope-guard.mjs | ✔ Mechanismus |
| The batch dashboard's Warteschlange must ALWAYS list every open TASKS point — no open point may be missing | 1 | niedrig | dashboard-card-topic-guard.mjs, dashboard-conciseness-guard.mjs, dashboard-guard-fixtures.mjs, dashboard-guard.mjs, dashboard-integrity-guard.mjs, dashboard-reminder-hook.mjs, queue-order-guard.mjs | ✔ Mechanismus |
| Every dashboard card's body must speak STRICTLY about its own point — never report on or reference another TASKS point inside a card | 1 | niedrig | batch-singleton.mjs, dashboard-card-topic-guard.mjs, dashboard-conciseness-guard.mjs, dashboard-guard-fixtures.mjs, dashboard-guard.mjs, dashboard-integrity-guard.mjs, dashboard-reminder-hook.mjs, decision-card-guard.mjs | ✔ Mechanismus |
| hoa dashboard \"Woran ich gerade arbeite\" holds ONE CARD PER parallel point being actively worked (not a single card); cards move from Warteschlange into it (possibly several at once); a point is NEVER in both sections at once | 1 | niedrig | dashboard-card-topic-guard.mjs, dashboard-conciseness-guard.mjs, dashboard-guard-fixtures.mjs, dashboard-guard.mjs, dashboard-integrity-guard.mjs, dashboard-reminder-hook.mjs | ✔ Mechanismus |
| Never put a hardcoded `open` attribute on a dashboard `<details>` card — default all closed; localStorage persistence keeps user-opened cards open across refresh | 1 | niedrig | batch-autostart.mjs, dashboard-card-topic-guard.mjs, dashboard-conciseness-guard.mjs, dashboard-guard-fixtures.mjs, dashboard-guard.mjs, dashboard-integrity-guard.mjs, dashboard-reminder-hook.mjs | ✔ Mechanismus |
| The batch dashboard \"Von dir zu klären\" section holds ONLY genuine user decisions — no done items, no announcements for in-progress work | 2 | mittel | dashboard-card-topic-guard.mjs, dashboard-conciseness-guard.mjs, dashboard-guard-fixtures.mjs, dashboard-guard.mjs, dashboard-integrity-guard.mjs, dashboard-reminder-hook.mjs | ✔ Mechanismus |
| RETIRED 25.07.2026 — the blanket authorization to spin up Fable for hard analyses is withdrawn; Opus 5 does that work, Fable only reviews or stands in as fallback | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Work at High effort by default; the user reserves Extra high for research and design decisions, not implementation | 3 | mittel | — (Regel/Memory) | ◐ Regel |
| Write idiomatic English in all English text (README, code comments, commit messages) — no German calques like 'stand' for a version | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Fable is ONLY for four-eyes review and as the first fallback when Opus 5 is unavailable — never for \"hard\" tasks; Opus 5 handles those (user rule 25.07.2026, supersedes the earlier hard-task delegation) | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Two test layers — Vitest (jsdom) for logic/store/HUD, Playwright for browser-only; add a test per new feature on the right layer | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| STANDING RULE: design.md §19.14 (climate) and §19.15 (peoples) — the research→game implementation records — must be updated in the SAME commit whenever the climate or people rendering changes; peoples-1890 §8 / climate-1890 §9 are pointers | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| All journal texts (de + en) must carry emotional voice markup; English read-aloud runs via Kokoro TTS | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Immer auf Deutsch mit dem Nutzer kommunizieren | 3 | mittel | — (Regel/Memory) | ◐ Regel |
| After every change, npm run lint (oxlint) and npm audit must be clean — zero lint errors/warnings, zero CVEs. Standing user directive. | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| hoa PERMANENT process — delegate as much implementation as possible to worktree-isolated subagents; keep only picture-verify + merge at the main session; run a pool of parallel agents on non-overlapping files | 4 | hoch | — (Regel/Memory) | ◐ Regel |
| The \"Maximum QA\" QA process and the \"new demo\" trigger (append it + closing + increment tag + publish) | 2 | mittel | — (Regel/Memory) | ◐ Regel |
| Before building, triage difficulty × criticality; for HIGH/critical work bring in a second, different model (Fable) to review plan + result — proactively, not only for audits or when stuck | 2 | mittel | model-guard.mjs | ✔ Mechanismus |
| RETIRED 27.07.2026 — its model half (Fable at my discretion, Opus 4.8 as default) was withdrawn on 25.07.; what survives is never trading model or effort down on load-bearing work | 4 | hoch | model-guard.mjs | ✔ Mechanismus |
| A user question is an INTERRUPT, not a new task — after answering, the last action of the turn must resume the batch; only an explicit stop or a genuine block on user input ends it | 3 | mittel | batch-autostart.mjs, batch-doctor.mjs, batch-lock.mjs, batch-progress-guard.mjs, batch-resume-hook.mjs, batch-singleton.mjs | ✔ Mechanismus |
| EVERY user change request is a TASKS.md point appended at the END, done only after the current work finishes — never interleaved or mass-committed | 5 | hoch | tasks-archive-guard.mjs, tasks-spec-guard.mjs | ✔ Mechanismus |
| The batch-owning session is a headless successor the launcher spawned — the user cannot see, reach or close it; never ask them to | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| RETIRED 27.07.2026 — merged into parallel-session-root-cause, which holds the confirmed cause and the one detection recipe; the advisory-lock analysis here was superseded by the hard singleton | 3 | mittel | batch-autostart.mjs, batch-doctor.mjs, batch-lock.mjs, batch-progress-guard.mjs, batch-resume-hook.mjs, batch-singleton.mjs | ✔ Mechanismus |
| Parallel batch sessions are spawned by the HoA-Batch-Autostart scheduled task after a reboot; the advisory lock never stopped it — a hard singleton is being built | 2 | mittel | — (Regel/Memory) | ◐ Regel |
| RETIRED 27.07.2026 — merged into parallel-session-root-cause; what survives is that the lock file alone is never proof of exclusivity, and the four signals that actually detect a second writer | 2 | mittel | — (Regel/Memory) | ◐ Regel |
| DRAINED 30.07.2026 — the carrier's work is all in the work order now; what remains is the list of options a /doctor run REJECTED, so nobody re-analyses them | 2 | mittel | queue-order-guard.mjs, worktree-reminder.mjs | ✔ Mechanismus |
| Always take the point boundary autonomously at a closed point — never ask the user whether to hand over or /clear | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Per-point QA runs scoped (Vitest always, browser suites by diff mapping, flake-retry single suites) — WATCHDOG duty to report any bug that slips through | 3 | mittel | — (Regel/Memory) | ◐ Regel |
| Edits to .claude/settings.json and .git/hooks ALWAYS trigger a permission prompt (harness safety layer, allowlist cannot override); never schedule such work for unattended night batches | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| hoa uses a feature-branch workflow — each TASKS point on feat/<point>-<slug>, push the branch after every commit, merge to main only when done+verified; cross-cutting changes go straight to main | 2 | mittel | commit-scope-guard.mjs, push-arrival-guard.mjs | ✔ Mechanismus |
| Direct pushes to main are approved despite GitHub's branch protection — never ask about switching to pull requests again | 1 | niedrig | push-arrival-guard.mjs | ✔ Mechanismus |
| Order the TASKS/queue so known-bug fixes + user-requested extensions come BEFORE the big bug-FINDING / QA-framework tickets | 1 | niedrig | queue-order-guard.mjs | ✔ Mechanismus |
| Before the 224 demo checkpoint queue ONLY bugfixes + almost-done points; new features go to v0.3 (after 224) | 2 | mittel | queue-order-guard.mjs | ✔ Mechanismus |
| Console warning \"THREE.Clock deprecated, use THREE.Timer\" comes from R3F v9 internals — fix by updating @react-three/fiber once it migrates to Timer | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Choose the browser-regression tier per task at my discretion (Vitest-only / Vitest+small / Vitest+large); the closing cycle ALWAYS runs Vitest+large | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| RETIRED 27.07.2026 — a 23.07. session handoff whose branches all merged; what survives is the file-collision map habit and the closing-freeze housekeeping | 3 | mittel | batch-resume-hook.mjs | ✔ Mechanismus |
| 24.07.2026 evening chaos — serving model silently degraded to Haiku 4.5; verify the serving model before batch work, Haiku-class must pause instead of working | 3 | mittel | model-guard.mjs | ✔ Mechanismus |
| Every new optical/graphics feature must be sorted into the low/medium/high detail presets, enforced by a pure completeness test — a new quality key with no preset entries fails the gate | 2 | mittel | — (Regel/Memory) | ◐ Regel |
| Write about this project as a participant (\"wir/unser\"), never as an outside observer (\"euer Mechanismus\", \"die ihr abschaffen wollt\") | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Never access paths outside the project directory unless strictly necessary (e.g. the global ~/.claude rules); keep local non-versioned artefacts in a git-ignored local/ folder inside the repo | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| RETIRED 25.07.2026 — a stuck Opus no longer hands the task to Fable; re-attack with Opus or let Fable REVIEW the stuck attempt (Fable is review + fallback only) | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Release tags are re-pointed ONLY on the user's explicit request — never automatically after a fix; a cut vX.Y is frozen | 3 | mittel | — (Regel/Memory) | ◐ Regel |
| TASKS.md and all new entries in it are written in English | 1 | niedrig | tasks-archive-guard.mjs, tasks-spec-guard.mjs | ✔ Mechanismus |
| TASKS.md entries state the final correct target directly — never keep a 'first defined wrong, then clarified/corrected' trail in the spec | 1 | niedrig | tasks-archive-guard.mjs, tasks-spec-guard.mjs | ✔ Mechanismus |
| TASKS.md points get [*] when started and a tracking line (start, finish, minutes, ~tokens) when done — mandated 2026-07-14 | 3 | mittel | tasks-archive-guard.mjs, tasks-spec-guard.mjs, timestamp-guard.mjs | ✔ Mechanismus |
| Think harder about what to test; when in doubt add MORE tests — never skimp on fast browserless Vitest cases | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Tests and probes must use IN-GAME-achievable zoom (non-debug 0.125–0.5 at least), never a debug-only zoom — testing at an unrealistic zoom has passed while the player still saw the bug, repeatedly | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Permissions are deliberately maximally broad (whole-tool allows incl. Bash); NEVER narrow or \"tidy\" them again — standing user directive | 2 | mittel | — (Regel/Memory) | ◐ Regel |
| On every user change request, also update CLAUDE.md and design.md where appropriate — standing directive for all future sessions. | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Every place/landmark/settlement name in the game uses the name that was VALID IN 1890, not a later renaming | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Run the both-backend browser verify on the feat BRANCH before merging to main — merging an unverified render change first triggers a render-verify Stop-guard block-loop | 1 | niedrig | render-verify-guard.mjs | ✔ Mechanismus |
| Headless probes must screenshot the DEFAULT zoom too (zoom-gated dressing like haze only shows there); headless WebGPU is impossible, so WebGPU-only branches stay user-checked | 2 | mittel | render-verify-guard.mjs | ✔ Mechanismus |
| Every GUI/rendering fix must be verified on BOTH WebGPU and WebGL2 before it counts as done — never mark a render fix done on one path | 2 | mittel | render-verify-guard.mjs | ✔ Mechanismus |
| Rotating verify AND unit failures under a running agent pool are LOAD, not bugs — 8 of 12 unit runs red from load alone; judge a red only on a quiet machine | 2 | mittel | render-verify-guard.mjs | ✔ Mechanismus |
| The named \"version release\" process and its trigger — queue/run a version release for a version the user names (full closing → user approval → tag → mirror poc → publish /TAG/ and /poc/) | 1 | niedrig | lock-release-hook.mjs | ✔ Mechanismus |
| Standing licence to move, REMOVE or ADD villages when it helps — but every change must be checked against the other requirements first, and the check has already caught a real bug | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Keep the visual QA eye open for functionally-fine but weird-LOOKING oddities, not just functional bugs | 2 | mittel | — (Regel/Memory) | ◐ Regel |
| CORRECTED 19.07.2026 — WebGPU IS testable headless/autonomously via system Chrome (channel:'chrome') + --headless=new; the 'untestable' belief held only for Playwright's BUNDLED Chromium | 1 | niedrig | — (Regel/Memory) | ◐ Regel |
| Multi-agent workflows eat the session/weekly limit fast — verify findings INLINE, keep fan-outs small, warn the user with a cost estimate before any big workflow | 3 | mittel | doc-budget-guard.mjs | ✔ Mechanismus |

Erfasste Quellen: 75 Feedback-/Projekt-Memories · 39 Guard-/Hook-Skripte · 4 Revert-/Reapply-Commits · 25 Prozess-/Meta-TASKS-Punkte (davon 11 offen).

<!-- RETRO-FINGERPRINT: 0acd6d8eb654d3f89ebd0213858c6e60866180d4388487c34f2bb400bf343d5e -->
<!-- RETRO-LAST-REFRESHED: 2026-07-30T12:17:58.676Z -->
<!-- AUTO-GENERATED:END -->
