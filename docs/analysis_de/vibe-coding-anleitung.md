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

### Wie die Prompts in dieser Anleitung formuliert sind

Die Prompts unten sind bewusst **Aufträge, einen Mechanismus zu bauen** — nicht
Merksätze. Der Unterschied ist der ganze Punkt dieser Anleitung: „Jedes neue
Feature bekommt einen Test" ist eine *Regel*, die vergessen wird; „Etabliere
einen Mechanismus, der garantiert, dass jedes neue Feature einen Test bekommt"
ist ein *Auftrag*, an dessen Ende etwas steht, das die Regel erzwingt. Formuliere
deine eigenen Anweisungen genauso.

Wo ein Mechanismus prinzipiell **nicht** möglich ist (etwa „sieht das für einen
Menschen richtig aus?"), steht das ausdrücklich dabei — dann ist der Merksatz die
ehrliche Lösung, und du solltest wissen, dass er nur so gut hält wie die
Aufmerksamkeit des Moments.

### Primäres und sekundäres Modell

Lege **zwei** Modelle fest und gib ihnen klare Rollen:

- Ein **primäres Modell** macht die Arbeit — bei *jeder* Schwierigkeit. Nimm die
  jeweils stärkste verfügbare Version.
- Ein **sekundäres, anderes Modell** ist für das **Vier-Augen-Prinzip** da (es
  prüft Plan und Ergebnis des primären, oder baut selbst und lässt prüfen) und
  springt als **Ausweichstufe** ein, wenn das primäre nicht in seiner höchsten
  Version verfügbar ist.

> *Prompt:* „Arbeite grundsätzlich mit **\<primäres Modell\>**, unabhängig davon,
> wie schwer eine Aufgabe ist. **\<sekundäres Modell\>** setzt du nur für das
> Vier-Augen-Prinzip ein — es prüft Plan und Ergebnis gegen — oder als
> Ausweichstufe, wenn das primäre nicht in der höchsten Version verfügbar ist.
> Etabliere einen Mechanismus, der ein Arbeitsergebnis eines **anderen** Modells
> erkennt und die Arbeit stoppt, statt sie stillschweigend zu übernehmen."

Der Grund für die Rollentrennung: Ein zweites Modell nützt nicht, weil es *besser*
wäre, sondern weil es **andere blinde Flecken** hat. Diesen Wert hebt nur eine
Prüfung — eine bloße Übergabe schwerer Aufgaben hebt ihn nicht. (Warum der Stopp
bei einem fremden Modell nötig ist: In diesem Projekt lief eine Sitzung
unbemerkt auf einem viel schwächeren Modell und lieferte in 14 Minuten drei
Attrappen-Ergebnisse, die alle zurückgenommen werden mussten.)

---

## So setzt du ein Projekt auf (Prompts zum Kopieren)

1. **Zielbild zuerst, als einzige Wahrheit.**
   > „Wir schreiben zuerst ein `design.md`, das beschreibt, was am Ende existieren soll.
   > Das ist die alleinige Quelle der Wahrheit. Ändere es nie eigenmächtig; wenn ich
   > etwas ändere, aktualisiere `design.md` und den Code gemeinsam."

2. **Ein dauerhaftes Arbeitsprotokoll.**
   > „Lege ein `TASKS.md` an und **etabliere einen Mechanismus, der seine Regeln
   > erzwingt**: Jede Änderungsanforderung wird als eigener, klar umrissener Punkt ans
   > Ende angehängt und der Reihe nach abgearbeitet — niemals mittendrin abbiegen; eine
   > abgeschlossene Einheit = ein Commit mit aussagekräftiger Nachricht; jeder Commit
   > wird sofort hochgeladen, damit nichts nur lokal liegt."

3. **Zwei Testschichten von Anfang an.**
   > „Richte zwei Ebenen ein: eine schnelle, deterministische Schicht ohne Browser für
   > Logik/Zustand (läuft in Sekunden) und wenige echte Browser-/E2E-Tests nur für das,
   > was es wirklich braucht (Rendering, Layout, Klick-Flows). **Etabliere einen
   > Mechanismus, der garantiert, dass zu jedem neuen Feature ein Test auf der
   > passenden Schicht existiert** — der also anschlägt, wenn Produktcode ohne
   > zugehörigen Test geändert wurde."

4. **Sauberer Baum nach jeder Änderung.**
   > „Etabliere einen Mechanismus, der einen unsauberen Stand gar nicht erst
   > durchlässt: Build, Linter und Abhängigkeits-Audit müssen nach jeder Änderung
   > null Fehler, Warnungen und bekannte Lücken melden, und ein Fehlschlag muss die
   > Weiterarbeit blockieren statt nur gemeldet zu werden. Überdecke nie einen
   > Fehlschlag — zeig mir den konkreten Output."

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

   Und weil ein Mechanismus selbst falsch gebaut sein kann — in diesem Projekt fand
   die Gegenprüfung in *jedem* geprüften Guard echte Fehler, vom nie auslösenden
   Muster bis zur Notbremse mit Nebenwirkung:
   > „Etabliere einen Mechanismus, der beim Hinzufügen oder Ändern eines
   > Mechanismus **immer das Vier-Augen-Prinzip** erzwingt: Plan und Ergebnis
   > werden vom sekundären Modell gegengeprüft, bevor der neue Mechanismus scharf
   > geschaltet wird — und das Ergebnis dieser Prüfung wird festgehalten."

6. **Fortschritt sichtbar machen (wenn du mitlesen willst).**
   > „Führe ein knappes Fortschritts-Board (eine Datei oder Seite) und **etabliere einen
   > Mechanismus, der seine Aktualität erzwingt**: Es zeigt **immer den echten Stand** —
   > woran du gerade arbeitest, was offen ist, was erledigt ist —, seine Struktur bleibt
   > stabil, und der Mechanismus muss auch merken, wenn der Text unverändert bleibt,
   > während sich die Arbeit weiterbewegt hat."

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
> passende Stufe und nenn mir kurz warum; **etabliere einen Mechanismus, der die große
> Stufe vor einem Release erzwingt** und eine Freigabe ohne sie verweigert."

Zwei Mechanismen, die das Netz ehrlich halten:

> *Prompt:* „Etabliere einen Mechanismus, der eine Wiederholung **sichtbar** macht:
> Ein flakender Browser-Test darf einmal automatisch wiederholt werden, muss dann
> aber eine ‚auf Wiederholung bestanden — untersuchen'-Zeile hinterlassen, und der
> Release-Lauf muss strikt ohne Wiederholung grün sein. Etabliere außerdem einen
> Mechanismus, der feste Wartezeiten in Tests aufspürt — gewartet wird auf eine
> Bedingung oder die App-Uhr, nie auf die Wanduhr."

---

## Die häufigsten Fallstricke → und was hilft

- **Grüner Test, falsches Bild.** Der gefährlichste Fehler: Der Test ist grün, aber das
  Ergebnis ist trotzdem falsch (er prüfte einen Hilfswert, einen unerreichbaren
  Debug-Zustand, einen geratenen Näherungswert).
  → *Prompt:* „Etabliere einen Mechanismus, der eine sichtbare Änderung erst als fertig
  gelten lässt, wenn sie am **echten gerenderten Bild** unter einer Bedingung geprüft
  wurde, die ein Nutzer wirklich erreicht — nicht an einem Hilfswert und nicht in einem
  Debug-Zustand." *(Der letzte Schritt bleibt menschlich und lässt sich nicht
  mechanisieren: Sieh dir den Screenshot an und frag dich, ob das für einen Menschen
  richtig aussieht.)*

- **Neue Features zerbrechen alte.** Eine Änderung repariert X und bricht das
  unbeobachtete Y.
  → *Prompt:* „Etabliere einen Mechanismus, der jede Mechanik auch im **Ausgangs-/Danach-Zustand** prüft, und baue
  eine Handvoll ‚Invarianten' ein, die im Entwicklungsmodus laut meckern, wenn eine
  Grundregel verletzt wird — so wird jeder Testlauf zum Detektor. Nach jedem
  Zusammenführen die schnelle Testschicht laufen lassen."

- **Angeblich behoben, aber nicht.** Der Fix wird als fertig gemeldet, das Symptom bleibt.
  → *Prompt:* „Etabliere einen Mechanismus, der einen Fix erst als fertig zählt, wenn das **Symptom am Ort des Symptoms**
  als behoben gezeigt hast. Wenn du dich zweimal am selben Problem festbeißt, wechsle die
  Perspektive (anderes Modell, frische Read-only-Diagnose zuerst)."

- **Zahlen geschätzt statt gemessen.** ‚Das dauert ~2 Minuten', ‚das ist schneller' —
  ohne Messung.
  → *Prompt:* „Etabliere einen Mechanismus, der ungemessene Zahlen abfängt — kommuniziert werden nur **gemessene** Werte (Laufzeiten, Performance,
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
  → *Prompt:* „Etabliere einen Mechanismus, der mein Urteil immer am **veröffentlichten/zusammengeführten** Stand einholt,
  nie an einem Zwischen-Zweig. Halte Messläufe frei von störenden Fenstern."

- **„Erfolgreich" heißt nicht „angekommen".** Ein Befehl meldet Erfolg, das Gewollte ist
  trotzdem nicht passiert — der Klassiker: auf einem Nebenzweig entwickelt, aber den
  Hauptzweig hochgeladen; Git meldet zufrieden „alles aktuell", während die Arbeit nur
  lokal liegt. Dieselbe Falle wie ein grüner Test am falschen Bild.
  → *Prompt:* „Etabliere einen Mechanismus, der nach jeder Aktion mit Fernwirkung (Hochladen, Veröffentlichen,
  Ausliefern): belege den **Zielzustand**, nicht die Erfolgsmeldung — zeig mir, dass
  mein aktueller Stand wirklich oben angekommen ist."

- **Deine Regelsammlung verrottet — nur merkt es niemand.** Regeln wachsen an,
  werden aber nie durchgesehen. Nach einigen Wochen fand ein Audit über 88 Regeln
  zehn Widersprüche, sechs Doppelungen und mehrere Regeln, die eine Absicherung
  *behaupteten*, die nie gebaut wurde. Am schlimmsten: Widersprüche **innerhalb
  einer Datei** (weil man den Anbau schreibt, ohne den Bestand zu lesen) und
  falsche Inhalte im Kanal mit der **höchsten Frequenz** — eine Erinnerung, die
  bei jedem Prompt erscheint, lehrte zwei längst zurückgezogene Regeln.
  → *Prompt:* „Etabliere einen Mechanismus, der den ganzen Regelbestand periodisch zur Durchsicht zwingt — — nicht nur auf
  Lücken, sondern auf Sauberkeit, Aktualität, Dopplung, Widerspruch,
  **Wirkungslosigkeit** und Veralterung. Prüfe jede Regel gegen den Code, nicht
  gegen die Nachbarregel. Und prüfe zuerst die Texte, die am häufigsten
  eingeblendet werden."

- **Ein Wächter, der nie auslöst, ist so kaputt wie einer, der immer auslöst.**
  Ein Prüfmechanismus kann existieren und trotzdem wirkungslos sein — etwa weil er
  nur bei einer Shell anspringt, die man kaum benutzt. Dann *gilt* die Regel als
  abgesichert, ohne es zu sein. Umgekehrt erzieht ein Wächter, der bei jedem
  Arbeitsschritt blockiert, zum Überlesen.
  → *Prompt:* „Etabliere einen Mechanismus, der die Schutzmechanismen selbst mitprüft: Hat jeder je ausgelöst?
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
  → *Prompt:* „Etabliere einen Mechanismus, der vor jeder Code-Änderung auf einen roten Test hin entscheiden lässt —
  mit einem **Experiment**, ob der Befund das Produkt oder die Messung belastet.
  Miss nur an einem eingeschwungenen Zustand, und lass eine Prüfung auch dann
  fehlschlagen, wenn ihr Messwert in die *unerwartete* Richtung ausschlägt — nicht
  nur, wenn er die Grenze überschreitet."

- **Derselbe Fakt steht an fünf Stellen — und veraltet an vier.** „Zehn Häfen",
  Vorgabewerte, Tastenbelegungen, Aufzählungen: Wer ein Feature baut, aktualisiert
  die Stelle, an der er gerade schreibt; alle anderen Kopien rotten unbemerkt.
  Nachträgliche Doku-Audits *ohne* Code-Abgleich machen es schlimmer, weil sie
  falsche Aussagen ausformulieren statt sie zu prüfen.
  → *Prompt:* „Etabliere einen Mechanismus, der jedem Fakt genau **einen** verbindlichen Ort zuweist; alle anderen
  Stellen verweisen darauf statt ihn zu wiederholen. Wo sich eine Wiederholung nicht
  vermeiden lässt, schreib mir einen Test, der sie gegen den Code prüft, dem der
  Fakt gehört. Und prüfe Doku immer gegen den **Code**, nie gegen die Nachbarprosa."

- **„Aufgeräumt" ohne Beweisliste.** Nach einem Zwischenfall räumt man dort auf, wo
  man den Schaden vermutet — und übersieht den Rest. Der Nutzer findet ihn dann
  zufällig, was mehr Vertrauen kostet als der Zwischenfall selbst.
  → *Prompt:* „Etabliere einen Mechanismus, der nach jedem Zwischenfall eine Beweisliste erzwingt — arbeite eine
  Liste ab und belege jeden Punkt — liegt alles am Zielort? Gibt es Reste (Kodierung,
  Waisen-Dateien, Tests ohne echte Prüfung)? Ist jedes zuletzt gebaute Feature samt
  Tests plausibel? Passen Dokumente und Code noch zusammen? Und am Ende: läuft alles
  grün?"

- **Der Autor sieht seine eigene Annahme nicht.** Wer entwirft und baut, prüft am Ende
  gegen dieselbe Vorstellung, aus der der Fehler stammt — deshalb übersieht man
  ausgerechnet die Stelle, an der die Wirklichkeit anders aussieht als gedacht.
  → *Prompt:* „Etabliere einen Mechanismus, der bei allem, was zuverlässig laufen muss, **ein anderes Modell** erst
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

<!-- GUIDE-FINGERPRINT: a61320ca18a3aaf80b4a31e3db10c3a4707de7f48927f535d417950838fc0a97 -->
