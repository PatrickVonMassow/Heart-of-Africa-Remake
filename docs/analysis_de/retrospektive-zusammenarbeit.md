# Retrospektive der Zusammenarbeit — „The Heart of Africa" (Remake-POC)

Zeitraum: 06.07.–26.07.2026 · Quellen: Git-Historie (alle Branches), die Memory-Dateien, TASKS.md, `docs/`, die Guard-/Hook-Skripte in `scripts/`, `.claude/settings.json` und Stichproben aus den Sitzungs-Transkripten.

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

**Lehre:** Modell-Diversität ist kein Audit-Sonderfall, sondern eine **Funktion der Kritikalität** — und hält, wie alles hier, nur als Mechanismus.

### 3.14 Fast-Gate ≠ Release-Gate

Der verpflichtende Closing-Lauf fing beim v0.2-Tag sofort einen strikten Typfehler, den die schnelle Schicht durchgelassen hatte (Testdateien werden dort transpiliert, nicht typgeprüft).

**Lehre:** Die schnelle Prüfung ist bewusst lax genug, um schnell zu sein — deshalb ist die strengste Prüfung unmittelbar vor der Auslieferung nicht verhandelbar.

### 3.15 Vollständigkeit eines Prozesses braucht ein Gate

Beim v0.2-Release setzte ich den Closing-Zyklus mit der Regression gleich und übersprang den Aufräum-Teil — also genau das, was ein Closing von einer Regression unterscheidet. Der Prozess war vollständig niedergeschrieben; seine Einhaltung hing an meinem Gedächtnis, und unter Druck fiel der nicht-erzwungene Schritt weg.

**Lehre:** Ein mehrschrittiger Prozess braucht einen **Vollständigkeits-Gate** über das Ganze, der das Ergebnis blockiert, solange nicht jeder Schritt mit Beleg abgehakt ist.

### 3.16 Mechanismus ZUERST — das übergeordnete Prinzip

Die alte Selbstheilungsregel lautete: Mechanismus bauen, wenn derselbe Fehler ein **zweites** Mal passiert. Der Nutzer verschärfte sie: Warum erst so weit kommen lassen? Die gesamte Historie dieses Dokuments ist der Beleg — fast jede Zeile oben ist ein Fehler, der sich wiederholte, bis ein Guard ihn unmöglich machte.

**Bindend:** Jede Regel, die wirklich gelten soll, bekommt **von Anfang an** einen erzwingenden Mechanismus; der Aufwand richtet sich nach der Wichtigkeit der Regel, die Grundhaltung heißt „erzwingen statt erinnern".

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

**Lehre:** Jede Zahl, die in zwei Dokumenten steht, ist eine Wette darauf, dass beide gleichzeitig gepflegt werden — und diese Wette verliert man. Ein verbindlicher Ort je Faktum, alle anderen verweisen.

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
4. **Halbtote Mechanismen sind gefährlicher als fehlende.** Ein Wächter, der nur von einer Shell scharfgeschaltet wird, die dieses Projekt kaum benutzt, *existiert* — und feuert nie. **Ein Wächter, der nie auslöst, und einer, der immer auslöst, sind beide kaputt.** Verwandt: Ein negatives Ergebnis muss von „konnte nicht messen" unterscheidbar sein — mein eigener Rundlauf über alle Wächter meldete „alle still" und maß nichts.

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

Der zweite: Der Wächter über die Auftrags-Formulierung suchte seine Verbotsphrasen als bloße Teilzeichenketten und las deshalb „is **unchanged from**" als Revisionsspur „changed from". Er blockierte einen völlig sauberen Punkt, und zwar wiederholt, bis die Ursache gefunden war. Eine Wortgrenze kostete zwei Zeilen. **Lehre:** Ein Wächter, der bei gewöhnlicher Sprache anschlägt, verliert genau das, wovon er lebt — dass man ihm glaubt. Fehlalarme sind keine Kosmetik; sie erziehen dazu, den Durchsetzer zu umgehen, und damit fällt die ganze Konstruktion in sich zusammen.

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
| `push-arrival-guard` | kein Turn-Ende, solange Commits in keiner Remote-Ref liegen | 3.18 |
| `commit-scope-guard` | kein Fremdkörper im Commit (Wurzeldateien, fremde Verzeichnisse, große Binärdateien) | private Datei im Repo |
| `tasks-archive-guard` | Arbeitsauftrag bleibt geteilt: offen in TASKS.md, erledigt im Archiv | 13.000-Zeilen-Datei je Zug |
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

Drei Konstruktionsprinzipien haben sich bewährt: **fail-open** (ein Guard-Fehler blockiert nie die Session — sonst wird das Immunsystem zur Autoimmunkrankheit), **pure, getestete Kerne** (`*-core.mjs` + Vitest) und seit dem 24.07. **ownership-aware** (ein Guard drängt nur den Lock-Owner in Pflichten).

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
6. **Verbrauch messen, bevor man ihn drosselt — und die Voraussetzung mitprüfen** (§3.31). Die Anzeige nennt die Treiber; die eigene Vermutung nennt sie nicht. Der naheliegendste Hebel bleibt dabei abgelehnt: „billigeres Modell für einfache Aufgaben" hat am 24.07. drei Lieferungen gekostet (§3.17) und damit mehr, als er gespart hätte.

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

Zuletzt aktualisiert: Montag, 27.07.2026, 14:35 · Quellen-Fingerprint: `6e5ad04fd518…`

Spalten heuristisch aus den Quellen abgeleitet (Anläufe = distinkte Datumsnennungen im Memory;
Maßnahme = Guard-Skripte mit Namens-Treffer). Die inhaltliche Bewertung gehört der Prosa oben.

| Problemklasse (Memory) | Anläufe | Schwere (heuristisch) | Maßnahme (Guard-Treffer) | Status |
|---|---|---|---|---|

Erfasste Quellen: 0 Feedback-/Projekt-Memories · 33 Guard-/Hook-Skripte · 2 Revert-/Reapply-Commits · 15 Prozess-/Meta-TASKS-Punkte (davon 8 offen).

<!-- RETRO-FINGERPRINT: 6e5ad04fd518d22d59ed0dd1b3da25e37c3c4c669fd3c1c4c2971b0f40a339c6 -->
<!-- RETRO-LAST-REFRESHED: 2026-07-27T12:35:11.270Z -->
<!-- AUTO-GENERATED:END -->
