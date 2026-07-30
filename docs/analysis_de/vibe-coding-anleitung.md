# Vibe Coding — kurze Anleitung aus einem echten Projekt

Für den Einstieg. Destilliert aus einem mehrwöchigen, weitgehend autonom gebauten
Projekt. Keine Klick-für-Klick-Schritte, sondern **Prompts, die du Claude gibst**,
und die Fallstricke, die dich sonst einholen. Bewusst kurz gehalten — die
ausführlichen Erfahrungen dahinter stehen in `retrospektive-zusammenarbeit.md`.

---

## Die eine Kernlehre

**Zuverlässigkeit ist eine Infrastrukturfrage, keine Charakterfrage.** Nur „gemerkte"
Probleme kamen wieder; sobald ein **Mechanismus** dastand (Check, Hook, Test),
verschwanden sie. Fordere deshalb bei allem, was dir wichtig ist, im Prompt einen
Mechanismus — nicht eine Regel:

> *Prompt-Zusatz:* „Sichere das mit einem Mechanismus zu, der die Verletzung
> unmöglich macht, und zeig mir, wo er blockiert."

Der Aufwand richtet sich nach der Wichtigkeit — ein leichter Check für eine leichte
Regel —, die Haltung ist **erzwingen statt erinnern**, ab der ersten Formulierung
und nicht erst beim zweiten Schaden. Fast alles Folgende wendet das an.

### Wie die Prompts in dieser Anleitung formuliert sind

Die Prompts unten sind **Aufträge, einen Mechanismus zu bauen** — keine Merksätze.
„Jedes neue Feature bekommt einen Test" ist eine *Regel*, die vergessen wird;
„Etabliere einen Mechanismus, der das garantiert" ist ein *Auftrag*, an dessen Ende
etwas steht, das die Regel erzwingt. Formuliere deine eigenen genauso. Wo ein
Mechanismus prinzipiell **nicht** möglich ist (etwa „sieht das für einen Menschen
richtig aus?"), steht das dabei — dann trägt nur die Aufmerksamkeit.

Manche Tipps kosten spürbar mehr Token und tragen eine grobe **Schätzung** wie
*(Kosten ≈ 2x)* — der Mehrverbrauch für die betroffene Arbeit, nicht fürs ganze
Projekt. Sie sind es meist wert; wird dein Kontingent knapp, weißt du, wo du drehst.

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

Ein zweites Modell nützt nicht, weil es *besser* wäre, sondern weil es **andere
blinde Flecken** hat — diesen Wert hebt nur eine Prüfung, keine Übergabe. Der Stopp
bei einem fremden Modell ist wichtig: Ein unbemerkt schwächeres liefert
selbstbewusst Attrappen.

Die **Obergrenze**: Eine Gegenprüfung kostet etwa so viel wie die Arbeit; die Grenze
zieht die **Sichtbarkeit des Fehlers**. Was den Ablauf steuert oder Arbeit vernichten
kann (Wächter, Sperren, Speichern/Laden, Veröffentlichungen), wird immer gegengeprüft;
was ein schneller Test sofort zeigt, nie.

---

## So setzt du ein Projekt auf (Prompts zum Kopieren)

1. **Zielbild zuerst — und nimm dir dafür Zeit.** Bevor die erste Zeile Code entsteht,
   gehört das Zielbild ausgearbeitet: was das Ergebnis können soll, wie es sich
   anfühlt, wo die Grenzen liegen. Jede Stunde hier spart ein Vielfaches an Umbau,
   denn ein Modell baut sehr schnell sehr viel vom Falschen, wenn das Ziel unscharf
   ist. Das Ausarbeiten ist dabei selbst eine ideale LLM-Aufgabe: Lass dich befragen,
   dir Lücken, Widersprüche und offene Entscheidungen zeigen und das Ergebnis
   ausformulieren — du entscheidest, es schreibt. Jede Zeile des `design.md`, das
   diesem Projekt zugrunde liegt, stammt von Claude.
   > „Bevor wir irgendetwas bauen, erarbeiten wir gemeinsam ein `design.md`, das
   > beschreibt, was am Ende existieren soll. Frag mich so lange aus, bis keine
   > wesentliche Lücke bleibt, zeig mir Widersprüche und offene Entscheidungen, und
   > formuliere es dann aus. Danach ist es die alleinige Quelle der Wahrheit: Ändere
   > es nie eigenmächtig; wenn ich etwas ändere, aktualisiere `design.md` und den
   > Code gemeinsam."

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
   > Weiterarbeit blockieren, und **kein Stand darf hochgeladen werden, den die
   > Pipeline ablehnen würde** — sonst ist die Prüfung keine Absicherung, sondern
   > eine Fehlermail. Überdecke nie einen Fehlschlag — zeig mir den Output."

5. **Regeln mechanisch erzwingen — nicht auf Vorsätze vertrauen (das Kernprinzip).**
   Unter Druck fällt genau der nicht-erzwungene Schritt weg; warte **nicht** auf den
   zweiten Schaden.
   > „Für **jede** Regel, die wirklich gelten soll, baue von Anfang an einen **Mechanismus**,
   > der ihre Verletzung unmöglich macht — einen Test, einen Git-Hook oder einen Stop-/
   > PreToolUse-Hook, der die Aktion verweigert, wenn die Regel gebrochen würde. Der Aufwand
   > soll zur Wichtigkeit passen, aber die Grundhaltung ist: **erzwingen statt erinnern**.
   > Ein Vorsatz — auch ein ausführlich niedergeschriebener — reicht nicht."

   Ein Mechanismus kann selbst falsch gebaut sein; Gegenprüfungen finden darin mehr
   Fehler als in gewöhnlichem Code:
   > „Etabliere einen Mechanismus, der beim Hinzufügen oder Ändern eines
   > Mechanismus **immer das Vier-Augen-Prinzip** erzwingt: Plan und Ergebnis
   > werden vom sekundären Modell gegengeprüft, bevor der neue Mechanismus scharf
   > geschaltet wird — und ohne festgehaltenen Prüf-Eintrag (wer, mit welchem
   > Ergebnis, welcher Stand) darf der Zug nicht enden."

   Ein „passt schon" des Autors selbst zählt nicht als Gegenprüfung.

   *(Kosten ≈ 2x)*

6. **Fortschritt sichtbar machen (wenn du mitlesen willst).**
   > „Führe ein knappes Fortschritts-Board (eine Datei oder Seite) und **etabliere einen
   > Mechanismus, der seine Aktualität erzwingt**: Es zeigt **immer den echten Stand**.
   > Er greift, **bevor** die Arbeit beginnt, nicht erst am Ende — sonst ist die Stunde
   > ungesichert, in der ich hinsehe — und merkt auch, wenn der Text steht, während die
   > Arbeit weiterlief."

---

## Automatische Tests — und ihre Tiefe abstufen

Automatische Tests sind das Rückgrat; ohne sie ist „Vibe Coding" ein Blindflug. Aber
nicht jede Änderung braucht die volle Batterie — sonst wird Testen so langsam, dass es
umgangen wird. Bewährt haben sich **abgestufte Umfänge**:

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

*(Kosten ≈ 1,5x)*

Zwei Mechanismen, die das Netz ehrlich halten:

> *Prompt:* „Etabliere einen Mechanismus, der eine Wiederholung **sichtbar** macht: Ein
> flakender Browser-Test darf einmal wiederholt werden, muss dann aber eine ‚auf
> Wiederholung bestanden — untersuchen'-Zeile hinterlassen, und der Release-Lauf muss
> strikt ohne Wiederholung grün sein. Und einen, der feste Wartezeiten aufspürt —
> gewartet wird auf eine Bedingung oder die App-Uhr, nie auf die Wanduhr."

---

## Die häufigsten Fallstricke → und was hilft

- **Grüner Test, falsches Bild.** Der Test ist grün, das Ergebnis trotzdem falsch — er prüfte
  einen Hilfswert, einen unerreichbaren Debug-Zustand, einen geratenen Näherungswert.
  → *Prompt:* „Etabliere einen Mechanismus, der eine sichtbare Änderung erst als fertig
  gelten lässt, wenn sie am **echten gerenderten Bild** unter einer Bedingung geprüft wurde,
  die ein Nutzer wirklich erreicht — und der bei einer **neuen** Blick-, Bewegungs- oder
  Zoomachse zuerst auflistet, welche alten Zusagen dadurch an einem neuen Rand prüfbar
  werden." *(Kosten ≈ 1,5x.)* *(Zuletzt: Sieht das für einen Menschen richtig aus?)*

- **Neue Features zerbrechen alte.** Eine Änderung repariert X und bricht das unbeobachtete Y.
  → *Prompt:* „Etabliere einen Mechanismus, der jede Mechanik auch im
  **Ausgangs-/Danach-Zustand** prüft und nach jedem Zusammenführen die schnelle
  Testschicht erzwingt. Bau dazu ‚Invarianten' ein, die im Entwicklungsmodus laut
  meckern, wenn eine Grundregel verletzt wird — so wird jeder Testlauf zum Detektor."

- **Angeblich behoben, aber nicht.** Der Fix wird als fertig gemeldet, das Symptom bleibt.
  → *Prompt:* „Etabliere einen Mechanismus, der einen Fix erst dann als fertig zählt,
  wenn das **Symptom am Ort des Symptoms** als behoben gezeigt wurde. Beißt du dich
  zweimal am selben Problem fest, wechsle die Perspektive — anderes Modell, frische
  Read-only-Diagnose zuerst."

- **Zahlen geschätzt statt gemessen.** ‚Das dauert ~2 Minuten', ‚das ist schneller'.
  → *Prompt:* „Etabliere einen Mechanismus, der ungemessene Zahlen abfängt: Laufzeiten,
  Performance und Kosten werden nur **gemessen** kommuniziert — Performance auf der
  **Ziel-Hardware**, nicht auf der Build-Maschine."

- **Das Kontingent ist die Grenze, nicht die Zeit.** Der Verbrauch hängt an der Größe
  jedes Kontexts, nicht an den Stunden: lange Sitzungen, die alles mitschleppen, und
  Helfer, die ihren Auftrag erst in großen Dokumenten *suchen* müssen.
  → *Prompt:* „Nenne mir die **gemessenen** Treiber. Schicke jedem Helfer seinen Auftrag als
  fertigen Kurzbrief mit, und fang für jede Aufgabe einen **frischen Kontext** an."
  *(Ein billigeres Modell für ‚einfache' Aufgaben ist der falsche Hebel — die Nacharbeit kostet mehr.)*

- **Der Assistent bleibt still stehen.** Bei langen, autonomen Läufen endet der
  Fortschritt unbemerkt.
  → *Prompt:* „Bei einer autonomen Daueraufgabe sei die **letzte Aktion jedes Schritts**
  immer ein Schritt an der Aufgabe, und baue einen Mechanismus, der ein stilles Anhalten
  verhindert."

- **Auf eine Rückfrage warten, statt weiterzuarbeiten.** So schlimm wie ein stiller
  Stopp — gerade wenn du weg bist.
  → *Prompt:* „Wenn ich weg bin, arbeite die Aufgabenliste **eigenständig** weiter und
  bleib **nie mit einer Rückfrage an mich stehen**. Triff bei Unklarheit die vernünftigste
  Annahme; nur was wirklich meine Entscheidung braucht, hältst du an sichtbarer Stelle
  fest und **gehst zum nächsten offenen Punkt über**."

- **Kommunikation verfehlt.** Zu technisch, zu lang, an der Zielgruppe vorbei.
  → *Prompt:* „Beschreibe Bugs/Status in der Sprache der Zielgruppe (Symptom zuerst, kurz,
  fürs Handy lesbar) und halte meine Format- und Sprachvorgaben auf **allen** sichtbaren
  Ausgaben ein."

- **Ein Werkzeug versteht nur genau eine Eingabeform.** Ein Skript läuft mit dem Format,
  an dem es gebaut wurde, und scheitert bei jeder Variante **lautlos** — der Folgefehler
  taucht weit entfernt auf und ist kaum zurückzuverfolgen.
  → *Prompt:* „Etabliere einen Mechanismus, der jede eingabeverarbeitende Stelle gegen
  **mehrere Eingabeformen** testet und bei einem gescheiterten Parse **sichtbar**
  scheitert, statt still einen plausiblen Ersatzwert einzusetzen."

- **Was solo grün ist, kippt unter Last.** Zeitgrenzen reißen, sobald mehrere Läufe
  parallel arbeiten — und eine Wiederholung entlastet nicht: Blieb die Last, misst sie
  zweimal denselben Zustand und nennt das Beweis.
  → *Prompt:* „Etabliere einen Mechanismus, der Last erkennt und Zeitgrenzen daran
  anpasst, statt sie fest zu verdrahten. Einen roten Lauf bewerte ich erst auf einer
  ruhigen Maschine; eine Wiederholung zählt nur, wenn die Last dazwischen weg war."

- **Doku und Code driften auseinander.** Das ‚Was' im Design-Doc passt nicht mehr zum
  ‚Wie' im Code.
  → *Prompt:* „Wenn eine Änderung das Design berührt, aktualisiere Design-Doc und Code im
  **selben** Commit. Halte Referenz-/Recherche-Dokumente aktuell, wenn sich das Fundament
  ändert."

- **Messung/Vorschau verunreinigt.** Halbfertiges wird versehentlich als ‚fertig'
  beurteilt; Popups stören Messungen.
  → *Prompt:* „Etabliere einen Mechanismus, der mein Urteil immer am
  **veröffentlichten/zusammengeführten** Stand einholt, nie an einem Zwischen-Zweig,
  und der Messläufe von störenden Fenstern freihält."

- **„Erfolgreich" heißt nicht „angekommen".** Ein Befehl meldet Erfolg, das Gewollte
  ist trotzdem nicht passiert — etwa ein Upload, der den falschen Zweig überträgt und
  zufrieden „alles aktuell" meldet, während die Arbeit nur lokal liegt.
  → *Prompt:* „Etabliere einen Mechanismus, der nach jeder Aktion mit Fernwirkung
  (Hochladen, Veröffentlichen, Ausliefern) den **Zielzustand** belegt statt der
  Erfolgsmeldung — er muss zeigen, dass mein Stand wirklich angekommen ist."

- **Deine Regelsammlung verrottet — nur merkt es niemand.** Regeln wachsen an: Widersprüche
  (auch innerhalb *einer* Datei), Doppelungen, und Regeln, die eine nie gebaute Absicherung
  behaupten.
  → *Prompt:* „Etabliere einen Mechanismus, der den ganzen Regelbestand periodisch zur
  Durchsicht zwingt — auf Aktualität, Dopplung, Widerspruch und **Wirkungslosigkeit**. Jede
  Regel wird gegen den Code geprüft, nicht gegen die Nachbarregel; zuerst die am häufigsten
  eingeblendeten Texte." *(Kosten: einmalig hoch)*

- **Ein Wächter, der nie auslöst, ist so kaputt wie einer, der immer auslöst.**
  Ein wirkungsloser Mechanismus lässt die Regel abgesichert erscheinen; einer, der bei
  jedem Schritt blockiert, erzieht zum Überlesen.
  → *Prompt:* „Etabliere einen Mechanismus, der die Schutzmechanismen selbst mitprüft:
  Hat jeder je ausgelöst? Kann er überhaupt? Doppelt er einen anderen? Ist seine Meldung
  umsetzbar — und meldet sich die brauchbarste zuerst?"

- **Der rote Test klagt den Falschen an.** Er täuscht gefährlicher als ein grüner, weil er
  zum schnellen Eingriff verleitet: Prüfungen veralten von selbst und klagen gesunden Code an.
  → *Prompt:* „Etabliere einen Mechanismus, der vor einer Code-Änderung auf einen roten Test
  hin ein **Experiment** verlangt: Belastet der Befund das Produkt oder die Messung? Gemessen
  wird nur an einem eingeschwungenen Zustand, und eine Prüfung schlägt auch dann fehl, wenn
  ihr Messwert in die *unerwartete* Richtung ausschlägt — nicht nur über der Grenze."

- **Derselbe Fakt steht an fünf Stellen — und veraltet an vier.** Wer baut, aktualisiert
  die Stelle, an der er gerade schreibt; die übrigen Kopien rotten unbemerkt.
  → *Prompt:* „Etabliere einen Mechanismus, der jedem Fakt genau **einen** verbindlichen
  Ort zuweist; alle anderen verweisen darauf. Wo sich eine Wiederholung nicht vermeiden
  lässt, prüft ein Test sie gegen den **Code**, dem der Fakt gehört, nie gegen die
  Nachbarprosa."

- **„Aufgeräumt" ohne Beweisliste.** Man räumt dort auf, wo man den Schaden vermutet,
  und übersieht den Rest — den dann jemand anders findet.
  → *Prompt:* „Etabliere einen Mechanismus, der nach jedem Zwischenfall eine
  **Beweisliste** erzwingt: Liegt alles am Zielort? Gibt es Reste (Waisen-Dateien, Tests
  ohne echte Prüfung)? Passen Dokumente und Code zusammen? Läuft alles grün?"

- **Der Autor sieht seine eigene Annahme nicht.** Wer entwirft und baut, prüft gegen dieselbe
  Vorstellung, aus der der Fehler stammt — besonders teuer bei Dingen, die *immer* laufen müssen.
  → *Prompt:* „Etabliere einen Mechanismus, der vor dem Bau **Schwierigkeit ×
  Kritikalität** einschätzt und bei Kritischem **ein anderes Modell** erst den Plan und
  danach das fertige Ergebnis gegenprüfen lässt — gegen die echten Daten, nicht gegen
  die Beschreibung, und bevor zusammengeführt wird." *(Kosten ≈ 2x)*

- **Die teuerste Prüfung großflächig verlangt.** Bildbegutachtung, ein Lauf auf einer
  zweiten Plattform, ein zweites Modell kosten ein Vielfaches. Pauschal für ganze
  Verzeichnisse gefordert, zahlst du sie auch, wo sie nichts beweisen kann.
  → *Prompt:* „Verlange die teuerste Prüfung nur für Änderungen, die dort wirklich
  abweichen können. Nimm nur aus, was **beweisbar** nichts beiträgt, und schreib die
  Grenze samt Begründung in den prüfenden Code, nicht in eine Regel daneben."

- **Was bei jedem Start mitgelesen wird, wächst — und du bezahlst es jedes Mal.** Jede
  einzelne Ergänzung ist berechtigt; irgendwann ist der größte Teil der Datei Geschichte.
  → *Prompt:* „Gib jedem Dokument, das bei jedem Start gelesen wird, eine **gemessene
  Obergrenze** mit zwei Auswegen: Detail auslagern, oder die Grenze anheben und begründen.
  Ausgelagert wird **verschoben, nicht umformuliert**, und jeder Leser der alten Stelle wird
  nachgezogen. In der Aufgabenliste steht nur Offenes, Erledigtes wandert wortgleich ins
  Archiv."

- **Im Präsens behauptet, nie nachgesehen.** „Das Feld wird bereits gesetzt" — im Code
  steht es nicht. Eine falsche Tatsachenbehauptung liefert etwas, das nichts tut und
  dabei grün ist.
  → *Prompt:* „Was du im **Präsens** behauptest, sieh vorher nach. Was erst gebaut
  werden muss, schreib in die Zukunftsform. Und prüfe jede Zusicherung, die ein
  Dokument über den Code macht, gegen den Code — oder kennzeichne sie als Absicht."

- **Jedes Teil grün, die Kette trotzdem tot.** Alle Bausteine sind getestet, am Ende
  passiert trotzdem nichts — zwischen zweien hat niemand nachgesehen.
  → *Prompt:* „Was aus mehreren Schritten besteht, spiel **einmal vollständig durch**
  und lies das Ergebnis aus den Protokollen, nicht aus den Tests. Wo eine Prüfung auch
  etwas ausführt, melde ein Scheitern im selben Atemzug wie die Freigabe."

- **Das Prüfgerät schaut durch ein zu schmales Fenster.** Es sieht nur die letzten *n*
  Einträge an oder misst erst *nach* dem Vorgang — und meldet „nichts gefunden".
  → *Prompt:* „Leite das Fenster jeder Messung aus dem **Gegenstand** ab: eine Frage über
  einen Zeitraum nach Zeit, nie nach Anzahl; eine über einen Lauf **während** des Laufs.
  Irrt eine Heuristik zur Entwarnung hin, braucht sie einen zweiten Beleg."

- **Grün über einer geschrumpften Menge.** Tausende Tests bestanden — aber ein Teil der
  Testdateien lud gar nicht und fiel aus der Bilanz. Nicht geladen ist nicht rot, sondern
  abwesend: Der Bericht liest sich *grüner* als ein Fehlschlag.
  → *Prompt:* „Melde die **Zahl der ausgeführten Testdateien** mit und vergleiche sie mit
  dem letzten grünen Lauf. Ein Rückgang ist ein Rot."

- **Die Prüfung steht hinter der Auslieferung.** Der Wächter prüft, was schon beim
  Empfänger liegt — repariert wird danach.
  → *Prompt:* „Setze jede Formprüfung **vor** den Schritt nach außen, so dass sie die
  Auslieferung verhindern kann; nur Inhaltliches darf danach laufen."

- **Plötzlich rot, obwohl niemand den Code angefasst hat.** Zwei Teile buchstabieren
  dieselbe Regel getrennt — eines schreibt, eines prüft; das blockiert *alle* Arbeit.
  → *Prompt:* „Wo ein Teil schreibt, was ein anderes prüft, **importiere** den geprüften
  Wert. Wird etwas ohne Code-Änderung rot, frag: welcher **Zustand** hat sich geändert?"

- **Der Befund stirbt mit dem Gespräch.** Ein echter Fehler fällt nebenbei auf und bleibt im
  Chat — die Aufgabenliste ist gerade gesperrt.
  → *Prompt:* „Etabliere einen Mechanismus, der Befunde sichert: ein billiges Kommando, das
  auch bei gesperrter Aufgabenliste schreibt, ein ebenso billiges ‚nichts gefunden', und eine
  Prüfung, die einen Zug **nicht enden lässt**, der untersucht und nichts hinterlassen hat —
  samt Leerungspflicht, sobald wieder geschrieben werden darf."

---

## Drei Meta-Regeln, die alles zusammenhalten

1. **Root-Cause vor Fix.** Ausreden-freie Ursachennotizen sind der Rohstoff, aus dem
   gute Mechanismen entstehen.
   > *Prompt:* „Bevor du etwas Wiederkehrendes reparierst: schreib mir in 3–5 Sätzen die
   > **mechanische** Ursache — was genau war die Annahme, die brach?"

2. **Nutzer-Artefakte sind Verträge.** Ein Dashboard, ein Ausgabeformat, eine Board-
   Struktur, die du festgelegt hast: nicht eigenmächtig umbauen. Änderungen nur als
   Vorschlag.
   > *Prompt:* „Struktur von Dingen, die ich festgelegt habe, friert ein. Schlag
   > Änderungen vor, setz sie nicht ungefragt um."

3. **Autonomie/Parallelität skaliert nur mit Infrastruktur.** Delegation vervielfacht
   — aber erst mit Isolierung und Exklusivität, sonst vervielfacht sie das Chaos. Die
   Grenze setzt nicht dein Kontingent, sondern der **Haupt-Agent**: Bei ihm endet jeder
   Strang, und je mehr Fremdstoff sein Kontext aufnimmt, desto schlechter urteilt er.
   Drei ist ein guter Start, kein Optimum — die Zahl korrigiert die Erfahrung. Und
   verlass dich nie auf die Anweisung „nur lesen": Isolierung ist eine Eigenschaft der
   **Umgebung**, nicht des Auftrags — was ein Helfer anfassen kann, fasst er irgendwann an.
   > *Prompt:* „Arbeite jede Aufgabe auf einem eigenen Feature-Branch mit eigener
   > Arbeitskopie und führe sie erst nach `main`, wenn sie fertig und verifiziert ist.
   > Gib auch jedem nur lesenden Helfer eine eigene Arbeitskopie, statt es ihm bloß
   > aufzutragen.
   > Teile parallele Aufgaben so auf, dass sie **nicht dieselben Dateien** anfassen, und
   > arbeite an höchstens **drei** gleichzeitig. Reduziere die Zahl, sobald das
   > Zusammenführen Nacharbeit erzeugt oder du Bekanntes nachlesen musst."

   *(Aufschlag ≈ 10–25 % je zusätzlichem Strang, geschätzt — Nacharbeit + Aufsicht)*

---

## Der kürzeste mögliche Start

> „Erarbeite mit mir zuerst ein `design.md` als einzige Wahrheit — frag mich dafür
> gründlich aus —, dann leg ein `TASKS.md` an. Richte die zwei
> Testschichten ein. Nach jeder Änderung: Build/Lint/Audit sauber, ein Test auf der
> passenden Schicht, ein atomarer Commit. Beurteile Sichtbares am Screenshot. Wenn
> wir eine Regel festlegen, bau sofort den Check, der sie erzwingt. Bei Kritischem
> hol ein zweites Modell als Gegenprüfer. Frag nach, wenn das Zielbild unklar ist — rate
> nicht."

Wenn du diese eine Nachricht an den Anfang stellst, hast du 80 % der Lehren dieses
Projekts eingebaut, bevor die erste Zeile Code entsteht.

<!-- GUIDE-FINGERPRINT: 50b50a15cca8d93e35b4f0e366d60d94ed708ede2bcba5ca1c5e4a5d13eed8a1 -->
