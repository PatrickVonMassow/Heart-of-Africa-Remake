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
etwas steht, das die Regel erzwingt. Formuliere deine eigenen genauso.

Wo ein Mechanismus prinzipiell **nicht** möglich ist (etwa „sieht das für einen
Menschen richtig aus?"), steht das dabei — dann trägt nur die Aufmerksamkeit.

Manche Tipps kosten spürbar mehr Token. Die tragen eine grobe **Schätzung** wie
*(Kosten ≈ 2x)* — gemeint ist der Mehrverbrauch für die betroffene Arbeit, nicht
fürs ganze Projekt. Sie sind es meist wert; wenn dein Kontingent knapp wird, weißt
du damit, wo du zuerst drehst.

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
bei einem fremden Modell ist wichtig: Ein unbemerkt schwächeres Modell liefert
selbstbewusst Attrappen.

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
   > PreToolUse-Hook, der abbricht bzw. die Aktion verweigert, wenn die Regel gebrochen würde.
   > Der Aufwand soll zur Wichtigkeit passen (ein leichter Guard für eine leichte Regel),
   > aber die Grundhaltung ist: **erzwingen statt erinnern**. Ein Vorsatz — auch ein
   > ausführlich niedergeschriebener — reicht nicht."

   Ein Mechanismus kann selbst falsch gebaut sein; Gegenprüfungen finden darin mehr
   Fehler als in gewöhnlichem Code:
   > „Etabliere einen Mechanismus, der beim Hinzufügen oder Ändern eines
   > Mechanismus **immer das Vier-Augen-Prinzip** erzwingt: Plan und Ergebnis
   > werden vom sekundären Modell gegengeprüft, bevor der neue Mechanismus scharf
   > geschaltet wird — und das Ergebnis dieser Prüfung wird festgehalten."

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
  Debug-Zustand." *(Kosten ≈ 1,5x — Bilder sind teuer.)* *(Der letzte Schritt bleibt menschlich:
  Sieh dir den Screenshot an und frag dich, ob das für einen Menschen richtig aussieht.)*

- **Neue Features zerbrechen alte.** Eine Änderung repariert X und bricht das
  unbeobachtete Y.
  → *Prompt:* „Etabliere einen Mechanismus, der jede Mechanik auch im
  **Ausgangs-/Danach-Zustand** prüft und nach jedem Zusammenführen die schnelle
  Testschicht erzwingt. Bau dazu ‚Invarianten' ein, die im Entwicklungsmodus laut
  meckern, wenn eine Grundregel verletzt wird — so wird jeder Testlauf zum Detektor."

- **Angeblich behoben, aber nicht.** Der Fix wird als fertig gemeldet, das Symptom bleibt.
  → *Prompt:* „Etabliere einen Mechanismus, der einen Fix erst dann als fertig zählt,
  wenn das **Symptom am Ort des Symptoms** als behoben gezeigt wurde. Beißt du dich
  zweimal am selben Problem fest, wechsle die Perspektive — anderes Modell, frische
  Read-only-Diagnose zuerst."

- **Zahlen geschätzt statt gemessen.** ‚Das dauert ~2 Minuten', ‚das ist schneller' —
  ohne Messung.
  → *Prompt:* „Etabliere einen Mechanismus, der ungemessene Zahlen abfängt: Laufzeiten,
  Performance und Kosten werden nur **gemessen** kommuniziert — Performance auf der
  **Ziel-Hardware**, nicht auf der Build-Maschine."

- **Das Kontingent ist die Grenze, nicht die Zeit.** Der Verbrauch hängt nicht an den
  Stunden, sondern an der Größe jedes Kontexts: lange Sitzungen, die jede Aufgabe im
  selben Fenster mitschleppen, und Helfer, die ihren Auftrag in großen Dokumenten erst
  *suchen* müssen.
  → *Prompt:* „Lies die Verbrauchsanzeige und nenne mir die **gemessenen** Treiber. Schicke
  jedem Helfer seinen Auftrag als fertigen Kurzbrief mit, statt ihn in den Projektdokumenten
  suchen zu lassen, und fang für jede neue Aufgabe einen **frischen Kontext** an."
  *(Ein billigeres Modell für ‚einfache' Aufgaben ist der falsche Hebel: Die Nacharbeit an
  einer schwachen Lieferung kostet mehr als die Ersparnis.)*

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

- **Ein Werkzeug versteht nur genau eine Eingabeform.** Ein Skript läuft mit dem Format,
  an dem es gebaut wurde, und scheitert bei jeder Variante **lautlos** — der Folgefehler
  taucht weit entfernt auf und ist kaum zurückzuverfolgen.
  → *Prompt:* „Etabliere einen Mechanismus, der jede eingabeverarbeitende Stelle gegen
  **mehrere Eingabeformen** testet und bei einem gescheiterten Parse **sichtbar**
  scheitert, statt still einen plausiblen Ersatzwert einzusetzen."

- **Was solo grün ist, kippt unter Last.** Zeitgrenzen, die auf einer ruhigen Maschine
  großzügig wirken, reißen, sobald mehrere Läufe parallel arbeiten — und der rote Lauf
  sieht dann aus wie ein Produktfehler.
  → *Prompt:* „Etabliere einen Mechanismus, der Last erkennt und Zeitgrenzen daran
  anpasst, statt sie fest zu verdrahten. Einen roten Lauf bewerte ich erst auf einer
  ruhigen Maschine — vorher wird kein Code geändert."

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

- **Deine Regelsammlung verrottet — nur merkt es niemand.** Regeln wachsen an und
  werden nie durchgesehen: Widersprüche (auch innerhalb *einer* Datei), Doppelungen,
  und Regeln, die eine Absicherung behaupten, die nie gebaut wurde. Am teuersten sind
  Fehler in den Texten, die am häufigsten eingeblendet werden.
  → *Prompt:* „Etabliere einen Mechanismus, der den ganzen Regelbestand periodisch zur
  Durchsicht zwingt — nicht nur auf Lücken, sondern auf Sauberkeit, Aktualität,
  Dopplung, Widerspruch, **Wirkungslosigkeit** und Veralterung. Jede Regel wird gegen
  den Code geprüft, nicht gegen die Nachbarregel; zuerst die Texte, die am häufigsten
  eingeblendet werden." *(Kosten: einmalig hoch)*

- **Ein Wächter, der nie auslöst, ist so kaputt wie einer, der immer auslöst.**
  Ein Mechanismus kann existieren und wirkungslos sein — dann gilt die Regel als
  abgesichert, ohne es zu sein. Und wer bei jedem Schritt blockiert, erzieht zum
  Überlesen.
  → *Prompt:* „Etabliere einen Mechanismus, der die Schutzmechanismen selbst mitprüft: Hat jeder je ausgelöst?
  Kann er überhaupt auslösen? Doppelt er einen anderen? Ist seine Meldung
  umsetzbar? Und in welcher Reihenfolge melden sie sich — die brauchbarste
  Meldung muss zuerst kommen."

- **Der rote Test klagt den Falschen an.** Ein grüner Test kann täuschen — ein roter
  auch, und der ist gefährlicher, weil er zum schnellen Eingriff verleitet. Prüfungen
  veralten von selbst, wenn sich ihre Umgebung ändert, und klagen dann gesunden Code an.
  → *Prompt:* „Etabliere einen Mechanismus, der vor einer Code-Änderung auf einen roten
  Test hin ein **Experiment** verlangt: Belastet der Befund das Produkt oder die
  Messung? Gemessen wird nur an einem eingeschwungenen Zustand, und eine Prüfung schlägt
  auch dann fehl, wenn ihr Messwert in die *unerwartete* Richtung ausschlägt — nicht
  nur, wenn er die Grenze überschreitet."

- **Derselbe Fakt steht an fünf Stellen — und veraltet an vier.** Zählwerte,
  Vorgabewerte, Tastenbelegungen, Aufzählungen: Wer baut, aktualisiert die Stelle, an
  der er gerade schreibt; die übrigen Kopien rotten unbemerkt. Doku-Audits *ohne*
  Code-Abgleich machen es schlimmer.
  → *Prompt:* „Etabliere einen Mechanismus, der jedem Fakt genau **einen** verbindlichen
  Ort zuweist; alle anderen Stellen verweisen darauf, statt ihn zu wiederholen. Wo sich
  eine Wiederholung nicht vermeiden lässt, prüft ein Test sie gegen den Code, dem der
  Fakt gehört — Doku wird immer gegen den **Code** geprüft, nie gegen die Nachbarprosa."

- **„Aufgeräumt" ohne Beweisliste.** Nach einem Zwischenfall räumt man dort auf, wo
  man den Schaden vermutet, und übersieht den Rest — den dann jemand anders findet.
  → *Prompt:* „Etabliere einen Mechanismus, der nach jedem Zwischenfall eine
  **Beweisliste** erzwingt, deren Punkte einzeln zu belegen sind: Liegt alles am
  Zielort? Gibt es Reste (kaputte Kodierung, Waisen-Dateien, Tests ohne echte Prüfung)?
  Ist jedes zuletzt gebaute Feature samt Tests plausibel? Passen Dokumente und Code noch
  zusammen? Läuft am Ende alles grün?"

- **Der Autor sieht seine eigene Annahme nicht.** Wer entwirft und baut, prüft am Ende
  gegen dieselbe Vorstellung, aus der der Fehler stammt. Ein einzelnes Modell hat blinde
  Flecken — besonders bei Dingen, die *immer* funktionieren müssen.
  → *Prompt:* „Etabliere einen Mechanismus, der vor dem Bau **Schwierigkeit ×
  Kritikalität** einschätzt und bei Kritischem **ein anderes Modell** erst den Plan und
  danach das fertige Ergebnis gegenprüfen lässt — gegen die echten Daten, nicht gegen
  die Beschreibung, und bevor zusammengeführt wird." *(Kosten ≈ 2x)*

- **Die teuerste Prüfung großflächig verlangt.** Bildbegutachtung, ein zweiter
  Lauf auf einer anderen Plattform, ein zweites Modell: Solche Kontrollen kosten
  ein Vielfaches der übrigen. Wird eine davon pauschal für ganze Verzeichnisse
  gefordert, zahlst du sie auch für Änderungen, bei denen sie nichts beweisen kann.
  → *Prompt:* „Verlange die teuerste Prüfung nur für Änderungen, die dort wirklich
  abweichen können. Nimm dabei nur aus, was **beweisbar** nichts beitragen kann —
  nicht, was plausibel nichts beiträgt —, und schreib die Grenze samt Begründung
  in den prüfenden Code, nicht in eine Regel daneben."

- **Das Regeldokument wird bei jedem Start geladen — und wächst trotzdem.** Jede
  einzelne Ergänzung ist berechtigt; die Summe macht das Dokument zu einem Posten,
  den du bei jeder Sitzung bezahlst.
  → *Prompt:* „Gib den Dokumenten, die bei jedem Start oder jedem Vorgang gelesen
  werden, eine **gemessene Obergrenze** mit genau zwei Auswegen: Detail in eine
  Nachbardatei auslagern, oder die Grenze anheben und die Begründung danebenschreiben.
  Beim Auslagern wird **verschoben, nicht umformuliert** — und danach jeder Leser der
  alten Stelle nachgezogen; der gefährlichste ist der, der nicht scheitert, sondern
  nur nichts mehr findet."

- **Die Aufgabenliste wächst und wird trotzdem jedes Mal ganz gelesen.** Was
  erledigt ist, bleibt darin stehen; nach ein paar Wochen ist der größte Teil der
  Datei Geschichte, die bei jedem Vorgang mitgelesen wird.
  → *Prompt:* „Halte in der Aufgabenliste nur die OFFENEN Aufgaben. Eine erledigte
  wandert wortgleich und mit ihrer Nummer in ein Archiv, und ein Mechanismus
  erzwingt das. Prüfe beim Trennen, welcher Leser welche Hälfte braucht: Wer nur
  wissen will, was zu tun ist, liest die offene; wer erkennen muss, dass etwas
  **abgeschlossen** ist, braucht beide."

- **Im Präsens behauptet, nie nachgesehen.** In deiner Anweisung steht „das Feld wird
  bereits gesetzt", weil du es dir so vorstellst — im Code steht es nicht. Eine Lücke
  im Auftrag führt zur Rückfrage; eine falsche Tatsachenbehauptung führt zu einer
  Lieferung, die genau das tut, was dasteht: nichts — und dabei grün ist.
  → *Prompt:* „Was du in einem Auftrag im **Präsens** behauptest, sieh vorher nach. Was
  erst gebaut werden muss, schreib in die Zukunftsform oder ausdrücklich unter ‚das
  existiert noch nicht'. Und prüfe jede Zusicherung, die ein Dokument über den Code
  macht, gegen den Code — oder kennzeichne sie als Absicht."

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

<!-- GUIDE-FINGERPRINT: 730f6c517a12d7e2e7291d52584c89fa17e30fd0c2d470246b872f99671b7243 -->
