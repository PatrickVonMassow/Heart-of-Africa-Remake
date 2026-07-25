# Vibe Coding — kurze Anleitung aus einem echten Projekt

Für den Einstieg. Destilliert aus einem mehrwöchigen, weitgehend autonom gebauten
Projekt (3D-Spiel, zwei Render-Backends, ~1600 Tests). Keine Klick-für-Klick-Schritte,
sondern **Prompts, die du Claude gibst**, und die Fallstricke, die dich sonst einholen.

---

## Die eine Kernlehre

**Zuverlässigkeit ist eine Infrastrukturfrage, keine Charakterfrage.** Solange ein
Problem nur „gemerkt" wurde, kam es wieder. Sobald ein **Mechanismus** dastand (ein
automatischer Check, ein Hook, ein Test), verschwand es. Merksatz:

> *Jede Regel, die wirklich gelten soll, bekommt von Anfang an einen erzwingenden
> Mechanismus — nicht ein Versprechen.*

Diese Fassung ist eine **Verschärfung**: Ursprünglich lautete der Satz „Was zweimal
schiefgeht, bekommt einen Mechanismus". Das erwies sich als zu schwach — es lässt
jeden Fehler einmal geschehen und verlässt sich bis dahin auf Vorsätze, die
nachweislich nicht halten. Der Aufwand des Mechanismus richtet sich nach der
Wichtigkeit der Regel (ein leichter Check für eine leichte Regel), aber die
Grundhaltung ist **erzwingen statt erinnern**, ab der ersten Formulierung.

Fast alles Folgende ist eine Anwendung davon.

---

## So setzt du ein Projekt auf (Prompts zum Kopieren)

1. **Zielbild zuerst, als einzige Wahrheit.**
   > „Wir schreiben zuerst ein `design.md`, das beschreibt, was am Ende existieren soll.
   > Das ist die alleinige Quelle der Wahrheit. Ändere es nie eigenmächtig; wenn ich
   > etwas ändere, aktualisiere `design.md` und den Code gemeinsam."

2. **Ein dauerhaftes Arbeitsprotokoll.**
   > „Lege ein `TASKS.md` an. Jede Änderungsanforderung wird als eigener, klar
   > umrissener Punkt ans Ende angehängt und der Reihe nach abgearbeitet — niemals
   > mittendrin abbiegen. Eine abgeschlossene Einheit = ein Commit mit aussagekräftiger
   > Nachricht. Committe/pushe nur, wenn ich es sage."

3. **Zwei Testschichten von Anfang an.**
   > „Richte zwei Ebenen ein: eine schnelle, deterministische Schicht ohne Browser für
   > Logik/Zustand (läuft in Sekunden) und wenige echte Browser-/E2E-Tests nur für das,
   > was es wirklich braucht (Rendering, Layout, Klick-Flows). **Jedes neue Feature
   > bekommt einen Test auf der passenden Schicht** — das ist Pflicht, nicht optional."

4. **Sauberer Baum nach jeder Änderung.**
   > „Nach jeder Änderung müssen Build, Linter und Abhängigkeits-Audit sauber sein
   > (null Fehler/Warnungen/bekannte Lücken). Überdecke nie einen Fehlschlag — melde ihn
   > mit dem konkreten Output."

5. **Regeln mechanisch erzwingen — nicht auf Vorsätze vertrauen (das Kernprinzip).**
   Sich darauf zu verlassen, dass das Modell sich an eine nur *niedergeschriebene* Regel
   hält, ist erwiesenermaßen unzuverlässig — auch bei bester Absicht fällt unter Druck genau
   der nicht-erzwungene Schritt weg. Warte deshalb **nicht**, bis derselbe Fehler ein zweites
   Mal passiert.
   > „Für **jede** Regel, die wirklich gelten soll, baue von Anfang an einen **Mechanismus**,
   > der ihre Verletzung unmöglich macht — einen Test, einen Git-Hook oder einen Stop-/
   > PreToolUse-Hook, der abbricht bzw. die Aktion verweigert, wenn die Regel gebrochen würde.
   > Der Aufwand des Mechanismus soll zur Wichtigkeit passen (ein leichter Guard für eine
   > leichte Regel), aber die Grundhaltung ist: **erzwingen statt erinnern**. Ein Vorsatz — und
   > selbst eine ausführlich niedergeschriebene Regel — reicht nicht."

   *(Die frühere, schwächere Form „baue den Mechanismus erst beim zweiten Auftreten" ist damit
   überholt: das zweite Auftreten ist bereits ein vermeidbarer Schaden.)*

6. **Fortschritt sichtbar machen (wenn du mitlesen willst).**
   > „Führe ein knappes Fortschritts-Board (eine Datei oder Seite), das **immer den
   > echten Stand** zeigt: woran du gerade arbeitest, was offen ist, was erledigt ist.
   > Halte die Struktur stabil und aktualisiere es sofort nach jeder Änderung."

---

## Automatische Tests — und ihre Tiefe abstufen

Automatische Tests sind das Rückgrat; ohne sie ist „Vibe Coding" ein Blindflug. Aber
nicht jede Änderung braucht die volle Batterie — sonst wird Testen so langsam, dass es
umgangen wird. Bewährt haben sich **abgestufte Umfänge**, aus denen du je nach Änderung
wählst:

- **Schnell (nach JEDER Änderung):** die Unit-Schicht ohne Browser — Logik, Zustand, reine
  Funktionen. Läuft in Sekunden, kann nie durch Browser-Timing flackern. Hierhin gehört
  alles, was ohne Browser prüfbar ist.
- **Klein (bei Sichtbarem/Interaktion):** die schnelle Schicht + ein Kernsatz echter
  Browser-/E2E-Tests — nur für das, was einen Browser wirklich braucht (Rendering, Layout,
  Klick-Flows).
- **Groß (vor jedem Release):** die volle Regression über alle Suiten und **alle
  Ziel-Backends/Geräte**, mehrfach flakefrei.

> *Prompt:* „Richte drei Test-Stufen ein — schnell (Unit, immer), klein (Unit + Kern-
> Browsertests) und groß (volle Regression auf allen Ziel-Backends). Wähl pro Änderung die
> passende Stufe und nenn mir kurz warum; die große Stufe läuft immer vor einem Release."

Zwei Regeln, die das Netz ehrlich halten:

> *Prompt:* „Jedes neue Feature bekommt einen Test auf der passenden Stufe — bevorzugt die
> schnelle, wenn es ohne Browser prüfbar ist. Flakende Browser-Tests dürfen **einmal
> sichtbar** automatisch wiederholt werden (mit einer ‚auf Wiederholung bestanden —
> untersuchen'-Zeile), aber der Release-Lauf muss auch strikt ohne Wiederholung grün sein.
> Warte Tests auf eine Bedingung oder die App-Uhr, nie auf eine feste Wartezeit."

---

## Die häufigsten Fallstricke → und was hilft

- **Grüner Test, falsches Bild.** Der gefährlichste Fehler: Der Test ist grün, aber das
  Ergebnis ist trotzdem falsch (er prüfte einen Hilfswert, einen unerreichbaren
  Debug-Zustand, einen geratenen Näherungswert).
  → *Prompt:* „Beurteile visuelle/UX-Änderungen am **echten gerenderten Bild**
  (Screenshot), nicht an einem Proxy, und nur unter Bedingungen, die ein Nutzer wirklich
  erreicht. Frag dich am Screenshot: *Sieht das für einen Menschen richtig aus?*"

- **Neue Features zerbrechen alte.** Eine Änderung repariert X und bricht das
  unbeobachtete Y.
  → *Prompt:* „Für jede Mechanik teste auch den **Ausgangs-/Danach-Zustand** mit. Baue
  eine Handvoll ‚Invarianten' ein, die im Entwicklungsmodus laut meckern, wenn eine
  Grundregel verletzt wird — so wird jeder Testlauf zum Detektor. Nach jedem
  Zusammenführen die schnelle Testschicht laufen lassen."

- **Angeblich behoben, aber nicht.** Der Fix wird als fertig gemeldet, das Symptom bleibt.
  → *Prompt:* „Ein Fix gilt erst als fertig, wenn du das **Symptom am Ort des Symptoms**
  als behoben gezeigt hast. Wenn du dich zweimal am selben Problem festbeißt, wechsle die
  Perspektive (anderes Modell, frische Read-only-Diagnose zuerst)."

- **Zahlen geschätzt statt gemessen.** ‚Das dauert ~2 Minuten', ‚das ist schneller' —
  ohne Messung.
  → *Prompt:* „Kommuniziere nur **gemessene** Zahlen (Laufzeiten, Performance,
  Kostenschätzungen). Bei Performance auf der **Ziel-Hardware** messen, nicht auf der
  Build-Maschine."

- **Zweites Modell nur bei Audits.** Ein einzelnes Modell hat blinde Flecken — gerade bei
  Dingen, die *immer* funktionieren müssen.
  → *Prompt:* „Schätze vor dem Bau **Schwierigkeit × Kritikalität** ein. Bei Kritischem
  (etwas Schwer-Reversibles, ein Sicherheits-/Kern-Mechanismus) lass ein **zweites,
  anderes Modell** Plan und Ergebnis gegenprüfen (sicher? alle Fälle? keine
  Seiteneffekte?), bevor es zusammengeführt wird."

- **Der Assistent bleibt still stehen / schläft ein.** Bei langen, autonomen Läufen endet
  der Fortschritt unbemerkt.
  → *Prompt:* „Wenn du eine Daueraufgabe autonom abarbeitest, sei die **letzte Aktion
  jedes Schritts** immer ein Schritt an der Aufgabe. Baue einen Mechanismus, der ein
  stilles Anhalten verhindert, statt dich darauf zu verlassen."

- **Auf eine Rückfrage warten, statt weiterzuarbeiten.** Genauso schlimm wie ein stiller
  Stopp: der Assistent stellt eine Frage und bleibt stehen, obwohl er weiterarbeiten
  könnte — gerade wenn du weg bist.
  → *Prompt:* „Wenn ich weg bin, arbeite die Aufgabenliste **eigenständig** weiter und
  bleib **nie mit einer Rückfrage an mich stehen**. Triff bei Unklarheit die vernünftigste
  Annahme und mach weiter; nur was wirklich meine Entscheidung braucht, hältst du kurz an
  sichtbarer Stelle fest und **gehst zum nächsten offenen Punkt über**, statt zu warten."

- **Kommunikation verfehlt.** Zu technisch, zu lang, falsche Sprache, an der Zielgruppe
  vorbei.
  → *Prompt:* „Beschreibe Bugs/Status in der Sprache der Zielgruppe (Symptom zuerst, kurz,
  fürs Handy lesbar). Halte dich an meine Format- und Sprachvorgaben auf **allen**
  sichtbaren Ausgaben."

- **Parser ist zu streng oder zu fragil bei Eingaben-Varianten.** Ein Tool (z.B. Dashboard-
  Parser zur Punkt-Nummern-Extraktion) funktioniert nur mit *exakt* einer Input-Form
  (z.B. Punkt-Nummer als Plain-Text, nicht in HTML-Tags), und versagt lautlos bei
  Varianten — führt zu Fehler-Zuständen, die schwer zu debuggen sind.
  → *Mechanismus:* Parser **robust machen**: akzeptieren mehrere Input-Formen (HTML-tags,
  plain text, beide), oder ein Unit-Test, der bewusst Varianten durchprobiert; ein
  sichtbarer Fallback, wenn der Parse fehlschlägt (z.B. `point <unknown>` statt falsch
  `<none>`), damit Fehler nicht stumm bleiben.

- **Timeouts unter Last — Tests, die solo passen, aber parallel zeitraubend sind.** Ein
  einzelner Test läuft in 10 Sekunden, aber unter Batch-Parallelismus (mehrere Prozesse
  auf einer Maschine) wartet er unnötig lange und läuft in den 60-/90-Sekunden-Timeout.
  → *Mechanismus:* Timeouts für Browser-Suiten **dynamisch anpassen** auf Batch-Kontext
  (z.B. Umgebungsvariable `BATCH_MODE=1` → Timeouts verdoppeln), ODER lokal längere
  Timeouts für alle Verifikations-Suiten (120-180s statt 90s). Beobachte auch die
  Parallelisierung selbst: volle dev-server-Parallelität ist oft ein Bottleneck (Port-
  Contention, I/O), evtl. sequenzielle oder gated Parallelität für intensive Suiten.

- **Doku und Code driften auseinander.** Das ‚Was' im Design-Doc passt nicht mehr zum
  ‚Wie' im Code.
  → *Prompt:* „Wenn eine Änderung das Design berührt, aktualisiere Design-Doc und Code im
  **selben** Commit. Halte Referenz-/Recherche-Dokumente aktuell, wenn sich das Fundament
  ändert."

- **Messung/Vorschau verunreinigt.** Halbfertiges wird versehentlich als ‚fertig'
  beurteilt; Popups stören Messungen.
  → *Prompt:* „Mein Urteil fällt immer am **veröffentlichten/zusammengeführten** Stand,
  nie an einem Zwischen-Zweig. Halte Messläufe frei von störenden Fenstern."

- **„Erfolgreich" heißt nicht „angekommen".** Ein Befehl meldet Erfolg, das Gewollte ist
  trotzdem nicht passiert — der Klassiker: auf einem Nebenzweig entwickelt, aber den
  Hauptzweig hochgeladen; Git meldet zufrieden „alles aktuell", während die Arbeit nur
  lokal liegt. Dieselbe Falle wie ein grüner Test am falschen Bild.
  → *Prompt:* „Nach jeder Aktion mit Fernwirkung (Hochladen, Veröffentlichen,
  Ausliefern): belege den **Zielzustand**, nicht die Erfolgsmeldung — zeig mir, dass
  mein aktueller Stand wirklich oben angekommen ist."

- **Deine Regelsammlung verrottet — nur merkt es niemand.** Regeln wachsen an,
  werden aber nie durchgesehen. Nach einigen Wochen fand ein Audit über 88 Regeln
  zehn Widersprüche, sechs Doppelungen und mehrere Regeln, die eine Absicherung
  *behaupteten*, die nie gebaut wurde. Am schlimmsten: Widersprüche **innerhalb
  einer Datei** (weil man den Anbau schreibt, ohne den Bestand zu lesen) und
  falsche Inhalte im Kanal mit der **höchsten Frequenz** — eine Erinnerung, die
  bei jedem Prompt erscheint, lehrte zwei längst zurückgezogene Regeln.
  → *Prompt:* „Sieh den ganzen Regelbestand periodisch durch — nicht nur auf
  Lücken, sondern auf Sauberkeit, Aktualität, Dopplung, Widerspruch,
  **Wirkungslosigkeit** und Veralterung. Prüfe jede Regel gegen den Code, nicht
  gegen die Nachbarregel. Und prüfe zuerst die Texte, die am häufigsten
  eingeblendet werden."

- **Ein Wächter, der nie auslöst, ist so kaputt wie einer, der immer auslöst.**
  Ein Prüfmechanismus kann existieren und trotzdem wirkungslos sein — etwa weil er
  nur bei einer Shell anspringt, die man kaum benutzt. Dann *gilt* die Regel als
  abgesichert, ohne es zu sein. Umgekehrt erzieht ein Wächter, der bei jedem
  Arbeitsschritt blockiert, zum Überlesen.
  → *Prompt:* „Prüfe deine Schutzmechanismen selbst mit: Hat jeder je ausgelöst?
  Kann er überhaupt auslösen? Doppelt er einen anderen? Ist seine Meldung
  umsetzbar? Und in welcher Reihenfolge melden sie sich — die brauchbarste
  Meldung muss zuerst kommen."

- **Der rote Test klagt den Falschen an.** Ein *grüner* Test kann täuschen — ein
  *roter* aber auch, und der ist gefährlicher, weil er Dringlichkeit erzeugt: An
  einem einzigen Tag klagten drei rote Prüfungen das Programm an, und alle drei
  hatten selbst unrecht (eine Markierung, die ein anderes System überschrieb; eine
  stillschweigende Abstandsannahme, die unter Last kippte; eine Messung, die einen
  Zwischenzustand traf). Prüfungen veralten von selbst, wenn sich ihre Umgebung
  ändert.
  → *Prompt:* „Bevor du auf einen roten Test hin Programmcode änderst: entscheide
  mit einem **Experiment**, ob der Befund das Produkt oder die Messung belastet.
  Miss nur an einem eingeschwungenen Zustand, und lass eine Prüfung auch dann
  fehlschlagen, wenn ihr Messwert in die *unerwartete* Richtung ausschlägt — nicht
  nur, wenn er die Grenze überschreitet."

- **Derselbe Fakt steht an fünf Stellen — und veraltet an vier.** „Zehn Häfen",
  Vorgabewerte, Tastenbelegungen, Aufzählungen: Wer ein Feature baut, aktualisiert
  die Stelle, an der er gerade schreibt; alle anderen Kopien rotten unbemerkt.
  Nachträgliche Doku-Audits *ohne* Code-Abgleich machen es schlimmer, weil sie
  falsche Aussagen ausformulieren statt sie zu prüfen.
  → *Prompt:* „Jeder Fakt bekommt genau **einen** verbindlichen Ort; alle anderen
  Stellen verweisen darauf statt ihn zu wiederholen. Wo sich eine Wiederholung nicht
  vermeiden lässt, schreib mir einen Test, der sie gegen den Code prüft, dem der
  Fakt gehört. Und prüfe Doku immer gegen den **Code**, nie gegen die Nachbarprosa."

- **„Aufgeräumt" ohne Beweisliste.** Nach einem Zwischenfall räumt man dort auf, wo
  man den Schaden vermutet — und übersieht den Rest. Der Nutzer findet ihn dann
  zufällig, was mehr Vertrauen kostet als der Zwischenfall selbst.
  → *Prompt:* „Nach jedem Zwischenfall: räum nicht nur auf, sondern arbeite eine
  Liste ab und belege jeden Punkt — liegt alles am Zielort? Gibt es Reste (Kodierung,
  Waisen-Dateien, Tests ohne echte Prüfung)? Ist jedes zuletzt gebaute Feature samt
  Tests plausibel? Passen Dokumente und Code noch zusammen? Und am Ende: läuft alles
  grün?"

- **Der Autor sieht seine eigene Annahme nicht.** Wer entwirft und baut, prüft am Ende
  gegen dieselbe Vorstellung, aus der der Fehler stammt — deshalb übersieht man
  ausgerechnet die Stelle, an der die Wirklichkeit anders aussieht als gedacht.
  → *Prompt:* „Bei allem, was zuverlässig laufen muss: lass **ein anderes Modell** erst
  den Plan und danach das fertige Ergebnis gegenprüfen — und zwar gegen die echten
  Daten, nicht gegen die Beschreibung."

---

## Drei Meta-Regeln, die alles zusammenhalten

1. **Root-Cause vor Fix.** Die besten Wendepunkte begannen mit einer schonungslosen
   Analyse des eigenen Versagens. Ausreden-freie Ursachennotizen sind der Rohstoff, aus
   dem gute Mechanismen entstehen.
   > *Prompt:* „Bevor du etwas Wiederkehrendes reparierst: schreib mir in 3–5 Sätzen die
   > **mechanische** Ursache — was genau war die Annahme, die brach?"

2. **Nutzer-Artefakte sind Verträge.** Ein Dashboard, ein Ausgabeformat, eine Board-
   Struktur, die du festgelegt hast: nicht eigenmächtig umbauen. Änderungen nur als
   Vorschlag.
   > *Prompt:* „Struktur von Dingen, die ich festgelegt habe, friert ein. Schlag
   > Änderungen vor, setz sie nicht ungefragt um."

3. **Autonomie/Parallelität skaliert nur mit Infrastruktur.** Viel Delegation ist ein
   Vervielfacher — aber erst, wenn Isolierung, saubere Zustände und Exklusivität stehen.
   Sonst vervielfacht sie das Chaos. Das konkrete Werkzeug für parallele Arbeit sind
   **Feature-Branches**: jede Aufgabe auf ihrem eigenen Zweig von `main`, und wenn mehrere
   Stränge gleichzeitig laufen, jeweils in einer **eigenen Arbeitskopie** (Git-Worktree),
   damit sich die Zweige nicht in einem Verzeichnis überschreiben. `main` bleibt dabei
   immer der fertige, geprüfte Stand — ein Zweig wird erst zusammengeführt, wenn sein Punkt
   komplett und (bei Sichtbarem: am Bild, auf allen Ziel-Backends) verifiziert ist.
   Wichtigste Voraussetzung fürs echte Parallelisieren: die gleichzeitigen Stränge dürfen
   sich **nicht dieselben Dateien** teilen — sonst kollidieren sie beim Zusammenführen.
   > *Prompt:* „Arbeite jede Aufgabe auf einem eigenen Feature-Branch von `main` und führe
   > sie erst nach `main` zusammen, wenn sie fertig und verifiziert ist, damit `main` immer
   > lauffähig bleibt. Wenn du mehrere Aufgaben parallel bearbeitest, gib jeder eine eigene
   > Arbeitskopie (Git-Worktree) und teile sie so auf, dass sie **nicht dieselben Dateien**
   > anfassen. Isolierung und Exklusivität **vor** Redundanz."

---

## Der kürzeste mögliche Start

> „Lies `design.md` als einzige Wahrheit und leg ein `TASKS.md` an. Richte die zwei
> Testschichten ein. Nach jeder Änderung: Build/Lint/Audit sauber, ein Test auf der
> passenden Schicht, ein atomarer Commit. Beurteile Sichtbares am Screenshot. Wenn dir
> wir eine Regel festlegen, bau sofort den Check, der sie erzwingt. Bei Kritischem
> hol ein zweites Modell als Gegenprüfer. Frag nach, wenn das Zielbild unklar ist — rate
> nicht."

Wenn du diese eine Nachricht an den Anfang stellst, hast du 80 % der Lehren dieses
Projekts eingebaut, bevor die erste Zeile Code entsteht.

<!-- GUIDE-FINGERPRINT: 4c91b20320c503fbd7f9bfbe770e1fff2cd62fdf30b2797df22c9d803b99d078 -->
