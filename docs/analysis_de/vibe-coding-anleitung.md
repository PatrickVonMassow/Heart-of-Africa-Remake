# Vibe Coding — kurze Anleitung aus einem echten Projekt

Für den Einstieg, destilliert aus einem mehrwöchigen, weitgehend autonom gebauten
Projekt: keine Klick-für-Klick-Schritte, sondern **Prompts, die du Claude gibst**, und
die Fallstricke dahinter. Ausführlich in `retrospektive-zusammenarbeit.md`.

---

## Die eine Kernlehre

**Gute Vorsätze halten nicht — Prüfungen halten.** Jedes Problem, das nur
„gemerkt" war, kam wieder; sobald ein Test oder ein Hook es maschinell verhinderte,
war es weg. Verlange deshalb bei allem, was dir wichtig ist, im Prompt einen
**Mechanismus** — keine Regel:

> *Prompt-Zusatz:* „Sichere das mit einem Mechanismus zu, der die Verletzung
> unmöglich macht, und zeig mir, wo er blockiert."

Der Aufwand richtet sich nach der Wichtigkeit — ein leichter Check für eine leichte
Regel —, und zwar ab der ersten Formulierung, nicht erst beim zweiten Schaden.

### Wie die Prompts in dieser Anleitung formuliert sind

Die Prompts unten sind **Aufträge, einen Mechanismus zu bauen** — keine Merksätze; wo einer
prinzipiell **nicht** möglich ist, steht das dabei. Eine **Schätzung** wie *(Kosten ≈ 2x)*
meint den Mehrverbrauch der betroffenen Arbeit, nicht des Projekts.

### Primäres und sekundäres Modell

Lege **zwei** Modelle fest, mit klaren Rollen:

- Ein **primäres Modell** macht die gewöhnliche Arbeit. Nimm die jeweils stärkste
  verfügbare Version.
- Ein **sekundäres, anderes Modell** übernimmt das **Vier-Augen-Prinzip**, die
  **Ausweichstufe** — und die **harten Fälle**: als schwierig/fehleranfällig
  Eingeschätztes. Ist seine Spur **knapp**, eskaliere erst nach **mehreren** erfolglosen
  Runden.

> *Prompt:* „Gewöhnliche Arbeit macht **\<primäres Modell\>**. **\<sekundäres Modell\>**
> übernimmt Vier-Augen, Ausweichstufe und als schwierig/fehleranfällig eingeschätzte
> Aufgaben; zur knappen Spur eskalierst du erst nach **\<n\>** erfolglosen Runden;
> **\<n\>** ist eine Konstante. Etabliere einen Mechanismus, der ein
> Arbeitsergebnis eines **anderen** Modells erkennt und die Arbeit stoppt, statt sie
> stillschweigend zu übernehmen."

Ein zweites Modell nützt nicht, weil es *besser* wäre, sondern weil es **andere blinde
Flecken** hat. Die **Obergrenze** zieht die **Sichtbarkeit des Fehlers**: Was den Ablauf
steuert oder Arbeit vernichten kann, wird gegengeprüft; was ein schneller Test
zeigt, nie.

**Kontingent ist nicht austauschbar.** Ist ein Modell knapp, behalte ihm vor, was **nur** es
kann; das Schreiben von Code, der größte Verbraucher, geht ans andere. Ein Verteiler, der den
Füllstand nicht liest, empfiehlt ein leeres Modell.

> *Prompt:* „Sag mir vor Ende eines Kontingents, welche Arbeit an das Modell mit Restvolumen
> geht; eine leere Spur empfiehlst du nie. Ist das zweite Modell nicht erreichbar, melde die
> Folge — kein Vier-Augen, solange das gilt —, statt einspurig weiterzuarbeiten."

---

## So setzt du ein Projekt auf (Prompts zum Kopieren)

1. **Zielbild zuerst — und nimm dir dafür Zeit.** Jede Stunde hier spart ein Vielfaches
   an Umbau: Ein Modell baut sehr schnell sehr viel vom Falschen, wenn das Ziel unscharf
   ist. Das Ausarbeiten ist selbst eine ideale LLM-Aufgabe — du entscheidest, es schreibt.
   > „Bevor wir bauen, erarbeiten wir gemeinsam ein `design.md`, das beschreibt, was am Ende
   > existieren soll. Frag mich aus, bis keine wesentliche Lücke bleibt, und zeig mir Widersprüche
   > und offene Entscheidungen. Danach ist es die alleinige Quelle der Wahrheit: Ändere es nie
   > eigenmächtig; ändere ich etwas, aktualisiere `design.md` und den Code gemeinsam."

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
   > PreToolUse-Hook, der die Aktion verweigert, wenn die Regel gebrochen würde.
   > Ein Vorsatz — auch ein ausführlich niedergeschriebener — reicht nicht."

   Ein Mechanismus kann selbst falsch gebaut sein; Gegenprüfungen finden darin
   besonders viel:
   > „Etabliere einen Mechanismus, der beim Hinzufügen oder Ändern eines
   > Mechanismus **immer das Vier-Augen-Prinzip** erzwingt: Plan und Ergebnis
   > werden vom sekundären Modell gegengeprüft, bevor er scharf geschaltet wird —
   > und ohne festgehaltenen Prüf-Eintrag (wer, welches Ergebnis, welcher Stand)
   > darf der Zug nicht enden."

   Ein „passt schon" des Autors zählt nicht. *(Kosten ≈ 2x)*

6. **Fortschritt sichtbar machen (wenn du mitlesen willst).**
   > „Führe ein knappes Fortschritts-Board (eine Datei oder Seite) und **etabliere einen
   > Mechanismus, der seine Aktualität erzwingt**: Es zeigt **immer den echten Stand**.
   > Er greift, **bevor** die Arbeit beginnt, nicht erst am Ende — sonst ist die Stunde
   > ungesichert, in der ich hinsehe — und merkt auch, wenn der Text steht, während die
   > Arbeit weiterlief."

---

## Automatische Tests — und ihre Tiefe abstufen

Automatische Tests sind das Rückgrat; ohne sie ist „Vibe Coding" ein Blindflug. Aber nicht
jede Änderung braucht die volle Batterie — sonst wird Testen umgangen. Bewährt sind
**abgestufte Umfänge**:

- **Schnell (nach JEDER Änderung):** die Unit-Schicht ohne Browser — Logik, Zustand, reine
  Funktionen. Läuft in Sekunden, kann nie durch Browser-Timing flackern.
- **Klein (bei Sichtbarem/Interaktion):** die schnelle Schicht + ein Kernsatz echter
  Browser-/E2E-Tests (Rendering, Layout, Klick-Flows). Gibt es mehrere Unterbauten, prüf
  auf dem der Nutzer, nicht auf dem bequemeren Ersatzweg.
- **Groß (vor jedem Release):** die volle Regression über alle Suiten und **alle
  Ziel-Backends/Geräte**, mehrfach flakefrei.

> *Prompt:* „Richte drei Test-Stufen ein — schnell (Unit, immer), klein (Unit + Kern-
> Browsertests) und groß (volle Regression auf allen Ziel-Backends). Wähl pro Änderung die
> passende Stufe und nenn mir kurz warum; **etabliere einen Mechanismus, der die große
> Stufe vor einem Release erzwingt** und eine Freigabe ohne sie verweigert."

*(Kosten ≈ 1,5x)*

Zwei Mechanismen, die das Netz ehrlich halten:

> *Prompt:* „Etabliere einen Mechanismus, der eine Wiederholung **sichtbar** macht: Ein
> flakender Test darf einmal wiederholt werden, gilt danach aber als **verdächtig** und trägt
> keine Freigabe mehr; der Release-Lauf muss strikt ohne Wiederholung grün sein. Erledigt ist
> ein Rot nur mit **benannter Ursache** — wiederholte Grüns sind keine. Und einen, der feste
> Wartezeiten aufspürt."

---

## Die häufigsten Fallstricke → und was hilft

- **Grüner Test, falsches Bild.** Der Test ist grün, das Ergebnis falsch — er prüfte einen
  Hilfswert, einen unerreichbaren Zustand. Oder das Beweisbild entstand vor der fertigen Szene.
  → *Prompt:* „Eine sichtbare Änderung gilt erst als fertig, wenn sie am **echten gerenderten
  Bild** unter einer erreichbaren Bedingung geprüft wurde — und ein Prüfbild entsteht erst, wenn
  die Darstellung fertig ist." *(≈ 1,5x.)* *(Zuletzt: Sieht das für einen Menschen richtig aus?)*

- **Neue Features zerbrechen alte.** Eine Änderung repariert X und bricht das unbeobachtete Y.
  → *Prompt:* „Etabliere einen Mechanismus, der jede Mechanik auch im **Danach-Zustand** prüft und
  nach jedem Zusammenführen die schnelle Testschicht erzwingt. Bau ‚Invarianten' ein, die im
  Entwicklungsmodus laut meckern — jeder Testlauf wird so zum Detektor."

- **Angeblich behoben — und im Präsens behauptet.** Der Fix gilt als fertig, das Symptom bleibt;
  „das Feld wird bereits gesetzt" steht so im Code nicht.
  → *Prompt:* „Fertig ist ein Fix, wenn das **Symptom am Ort des Symptoms** behoben ist **und** der
  gleiche Versuch am **alten Stand** noch durchgeht. Was du im **Präsens** behauptest, sieh vorher
  nach; Gebautes erst in der Zukunftsform. Zweimal festgebissen: wechsle das Modell."

- **Fehlalarm behoben — echter Alarm gleich mit.** Du lässt eine zu oft anschlagende Prüfung
  verschärfen, alles wird grün — nur schlägt sie auch nicht mehr an, wenn sie sollte. Ein
  Fehlalarm meldet sich, ein ausgefallener nie.
  → *Prompt:* „Entschärfst du eine Prüfung, weise **beide** Richtungen nach — Fehlalarme weg UND
  echte Treffer noch da. Die Fälle erfindet das **andere Modell**, an der Mechanik gemessen statt
  an Testnamen." *(Kosten ≈ 1,3x.)*

- **Gebaut — und nie in Betrieb genommen.** Die Ausnahme steht im Fließtext statt in der Datei,
  die das Werkzeug liest; oder die Verbesserung ist fertig, nur führt nichts jemanden dorthin.
  → *Prompt:* „Eine Ausnahme trägst du **im selben Zug** dort ein, wo der Mechanismus sie liest,
  eine Fähigkeit dort, wo jemand nach ihr greift. Und wenn etwas ‚wartet': **worauf genau**?"

- **Zahlen geschätzt statt gemessen — auch die, die dir jemand reicht.** ‚Das dauert ~2 Minuten';
  oder ein Wert, der einmal stimmte.
  → *Prompt:* „Laufzeiten, Performance und Kosten nennst du nur **gemessen**, Performance auf der
  **Ziel-Hardware**; was altern kann, erhebe neu."

- **Das Kontingent ist die Grenze, nicht die Zeit.** Der Verbrauch hängt an der Größe jedes
  Kontexts, nicht an den Stunden: lange Sitzungen, und Helfer, die ihren Auftrag erst in
  großen Dokumenten *suchen*.
  → *Prompt:* „Nenne mir die **gemessenen** Treiber, schick jedem Helfer seinen Auftrag als
  fertigen Kurzbrief mit und fang je Aufgabe einen **frischen Kontext** an."

- **Der autonome Lauf bleibt stehen — still oder wartend.** Der Fortschritt endet unbemerkt
  oder hängt an einer Rückfrage — beides gleich teuer, wenn du weg bist.
  → *Prompt:* „Bei einer Daueraufgabe sei die **letzte Aktion jedes Schritts** ein Schritt an der
  Aufgabe, und bleib **nie mit einer Rückfrage stehen**: vernünftigste Annahme treffen, sichtbar
  festhalten, was mich braucht, weitergehen. Jedes Warten bricht auch beim **Fehler** ab."

- **Kommunikation verfehlt.** Zu technisch, zu lang, an der Zielgruppe vorbei.
  → *Prompt:* „Beschreibe Bugs und Status in der Sprache der Zielgruppe — Symptom zuerst, fürs
  Handy lesbar — und halte Format und Sprache auf **allen** Ausgaben ein."

- **Der Test hing an seiner Umgebung, nicht am Verhalten.** Zeitgrenzen reißen unter Last;
  oder er ist nur dort grün, wo er lief.
  → *Prompt:* „Jeder Test bekommt seine Pfade **eingespritzt**, Zeitgrenzen richten sich nach der
  gemessenen Last, und sein **Nachweis** landet dort, wo der Hauptstand ihn liest. Vor dem
  Abgeben: ‚auch im **Hauptstand** grün?'"

- **Messung und Vorschau verunreinigt.** Halbfertiges wird als ‚fertig' beurteilt.
  → *Prompt:* „Hol mein Urteil am **veröffentlichten** Stand ein, nie an einem Zwischenzweig, und
  miss auf einer ruhigen Maschine."

- **„Erfolgreich" heißt nicht „angekommen".** Ein Befehl meldet Erfolg, das Gewollte ist
  trotzdem nicht passiert; eine Warnung in einer **geglückten** Aktion ist unsichtbar — und ein
  Tor, das den Push zu Recht verweigert, meldet nichts — es wächst nur ein Stapel.
  → *Prompt:* „Beleg nach jeder Aktion mit Fernwirkung den **Zielzustand** statt der
  Erfolgsmeldung, und melde beim Start, was **lokal fertig, aber nirgends angekommen** ist."

- **Regeln und Wächter verrotten — nur merkt es niemand.** Der Bestand wächst an Widersprüchen
  und an Regeln, deren Absicherung enger greift als ihr Satz: Sie feuert, wird geglaubt, deckt
  nur einen Teil.
  → *Prompt:* „Sieh den Bestand periodisch durch — Aktualität, Dopplung, Widerspruch,
  **Wirkungslosigkeit**. Leg Satz und Code **nebeneinander** und zieh **den Code auf den
  Satz**." *(einmalig hoch)*

- **Der rote Test klagt den Falschen an.** Prüfungen veralten; ein Rot täuscht
  gefährlicher als ein Grün.
  → *Prompt:* „Verlang auf ein Rot hin erst ein **Experiment**: Produkt oder Messung? Gemessen
  wird nur an einem eingeschwungenen Zustand, dessen Bereitschaft der **Gegenstand** meldet —
  nie eine Uhr. Schlag auch fehl, wenn der Wert *unerwartet* ausschlägt."

- **Derselbe Fakt steht an fünf Stellen — und veraltet an vier.** Wer baut, pflegt nur, wo er
  schreibt.
  → *Prompt:* „Gib jedem Fakt genau **einen** verbindlichen Ort; alle anderen verweisen darauf.
  Unvermeidbare Wiederholung prüft ein Test gegen den **Code**, dem der Fakt gehört. Berührt eine
  Änderung das Design, aktualisiere Doc und Code im **selben** Commit."

- **„Aufgeräumt" ohne Beweisliste.** Man räumt dort auf, wo man den Schaden vermutet.
  → *Prompt:* „Erzwing nach jedem Zwischenfall eine **Beweisliste**: Liegt alles am Zielort? Gibt es Reste? Passen Dokumente und Code zusammen?"

- **Der Autor sieht seine eigene Annahme nicht — und wer eine fertige Liste prüft, hakt sie ab.**
  Wer baut, prüft gegen dieselbe Vorstellung, aus der der Fehler stammt.
  → *Prompt:* „Schätze vor dem Bau **Schwierigkeit × Kritikalität** und zieh bei Kritischem **ein
  anderes Modell** hinzu. Beim **Finden** blind parallel: gleiche Vorgabe, je ein vollständiges
  Ergebnis; beim **Beurteilen** Gegenlesen, aber **erst das Ergebnis, dann die Begründung**.
  **Vereinigt** wird nach Bedeutung, vom Modell, das an **keiner** Liste mitschrieb."
  *(≈ 2x für den Fundschritt)*

- **Die Lehre gilt als versorgt, sobald ihr Wächter benannt ist** — gebaut ist er damit nicht.
  → *Prompt:* „Trenne **benannt** von **gebaut**: ‚gebaut' wird am Haken des Punktes geprüft, nicht
  der Prosa geglaubt; ein Bericht nennt jede Lehre, deren Wächter seit Wochen nur benannt ist.
  Kein Blocker auf die Lücke selbst — eine benannte Lücke ist mehr wert als erfundene Deckung."

- **Die aufgeschriebene Grenze deckt nicht, was sie behauptet.** Der Satz, was ein Mechanismus
  *nicht* leistet, wird zur Ablage für das, was bloß nicht getan wurde — zweimal stand so ein
  echter Defekt als „gewollte Restlücke" im Vertrag, einmal mit grünem Test.
  → *Prompt:* „Liegt die Information zum **Schließen** vor, wird geschlossen. Jede verbleibende
  Grenze nennt ihre **Richtung**: zu viel durchgelassen oder zu viel verweigert."

- **Die teuerste Prüfung großflächig verlangt.** Bildbegutachtung, ein zweiter Lauf, ein
  zweites Modell kosten ein Vielfaches — pauschal gefordert, zahlst du sie auch dort, wo sie
  nichts beweisen kann.
  → *Prompt:* „Verlange die teuerste Prüfung nur, wo eine Änderung wirklich abweichen kann,
  und schreib die Grenze samt Begründung in den prüfenden Code."

- **Was bei jedem Start mitgelesen wird, wächst — und du bezahlst es jedes Mal.** Jede
  Ergänzung ist berechtigt; am teuersten die, die wiederholt, was eine Prüfung erzwingt.
  → *Prompt:* „Gib jedem Dokument, das bei jedem Start gelesen wird, eine **gemessene
  Obergrenze**. Blockiert sie eine Ergänzung: kürzen, **zusammenführen**, auslagern — anheben
  ist das **letzte** Mittel. Der Commit, der eine Prüfung einführt, streicht ihren Merktext."

- **Jedes Teil grün, die Kette trotzdem tot.** Alle Bausteine sind getestet, am Ende
  passiert trotzdem nichts — dazwischen hat niemand nachgesehen.
  → *Prompt:* „Was aus mehreren Schritten besteht, spiel **einmal vollständig durch**
  und lies das Ergebnis aus den Protokollen, nicht aus den Tests. Wo eine Prüfung auch
  etwas ausführt, melde ein Scheitern im selben Atemzug wie die Freigabe."

- **Die Messung — und die Gegenprüfung — sah weniger, als sie behauptet.** Nur die letzten *n*
  Einträge, ein Teil der Tests lud nicht, dem Prüfer wurde die Hälfte nie gereicht. Nicht
  geliefert ist nicht rot, sondern abwesend — und liest sich *grüner* als ein Fehlschlag.
  → *Prompt:* „Leite das Fenster jeder Messung aus dem **Gegenstand** ab: nach Zeit, nie nach
  Anzahl. Melde die **Abdeckung** mit; ein Urteil über unvollständigem Material ist **Teilprüfung**."

- **Plötzlich rot, obwohl niemand den Code angefasst hat.** Zwei Teile buchstabieren dieselbe Regel
  getrennt — eines schreibt, eines prüft; das blockiert *alle* Arbeit.
  → *Prompt:* „Wo ein Teil schreibt, was ein anderes prüft, **importiere** den geprüften
  Wert. Wird etwas ohne Code-Änderung rot, frag: welcher **Zustand** hat sich geändert?"

- **Der Befund stirbt mit dem Gespräch.** Ein echter Fehler fällt nebenbei auf und bleibt im Chat.
  → *Prompt:* „Etabliere einen Mechanismus, der Befunde sichert: ein billiges Kommando, das immer
  schreibt, und eine Prüfung, die einen Zug **nicht enden lässt**, der untersucht und nichts
  hinterlassen hat."

- **Still ersetzt statt sichtbar gescheitert.** Fehlt eine Angabe, setzt das Programm klaglos
  einen Ersatz ein — der Folgefehler taucht weit weg auf.
  → *Prompt:* „Jede eingabeverarbeitende Stelle wird gegen **mehrere Eingabeformen** getestet und
  scheitert **sichtbar**; jeder Rückfall wird **gemeldet**, mit dem Befehl, der ihn behebt."

- **Die Gegenprüfung wurde angestoßen, nie abgeschlossen** — der Zweig sieht geprüft aus.
  → *Prompt:* „Wer eine Gegenprüfung beauftragt, bleibt dran, bis sie da ist. Ein ‚nicht
  zusammenführen' erledigt erst ein **späteres** Urteil über den korrigierten Stand."

- **Der Ausfall kommt nie an der bequemen Stelle.** Am tückischsten bei **zwei Hälften**, deren
  zweite bei der Gegenseite liegt: fällt sie dazwischen aus, meldet jede Seite korrektes Verhalten.
  → *Prompt:* „Gib jeder kritischen Aktion einen **wiederholbaren Aufräumschritt** bei jedem Start.
  Prüf die Erholung mit Abbrüchen zu **zufälligen** Zeiten und frag: ‚läuft es **dort** weiter, wo
  es sollte?'"

- **Der Umzug nimmt nur mit, was versioniert ist.** Das Projekt kommt an, die Mechanik nicht —
  und ein stummer Wächter ist schlimmer als keiner: die Regel gilt als durchgesetzt.
  → *Prompt:* „Führe eine Liste dessen, was das Projekt braucht und **nicht** im Repository
  liegt, und prüfe sie bei jedem Start gegen eine **Beobachtung**."

- **Der Alarm, der nie spricht.** Fällt die Quelle aus, meldet ein Alarm auf ein *Ereignis*
  nichts — und ein Ersatzkanal, den du für scharf hältst, hat oft nie gefeuert.
  → *Prompt:* „Überwache den **Zustand** statt des Ereignisses, und **löse jeden Ersatzkanal
  einmal echt aus**. Was anhalten darf, eskaliert nur auf **aufeinanderfolgende** Fehlschläge."

- **Eine Priorität, die nur in Prosa steht, wirkt nicht.** Die Reihenfolge, aus der gearbeitet
  wird, steht woanders — und die Nachfolge-Sitzung kennt deinen Chat nicht.
  → *Prompt:* „Trag Priorisiertes dort ein, wo die Arbeit gezogen wird, und lass eine Prüfung
  fehlschlagen, wenn beides auseinanderläuft. Priorisiere das **Ziel**: Was das Feature
  schneller fertig macht, kommt mit nach vorn."

- **Blockiert heißt nicht: du bist dran.** Bei fehlender Berechtigung bekommst du gern einen
  Befehl gereicht — oft einen, der gar nicht funktionieren kann.
  → *Prompt:* „Ein Schritt in deiner Umgebung gehört dir; **miss** erst, ob der Weg trägt. Fehlt
  wirklich eine Fähigkeit, bitte **einmal um die Fähigkeit** — nie um ihre Ausführung."

- **Nicht jedes Rot ist deins.** Eine Prüfung, die nur „rot" und „grün" kennt, schiebt fremde
  Ausfälle deinem Code zu.
  → *Prompt:* „Sag bei jedem Rot zuerst, **wo die Ursache liegt** — lief überhaupt ein eigener
  Schritt? Liegt sie außerhalb, nenn den **echten Griff** dort."

- **Die Reparatur nimmt den Reparierenden mit.** Wer die Leitung repariert, auf der er sitzt,
  verliert mit dem Fehlschlag die nächste Reparatur mit.
  → *Prompt:* „Bevor du deine eigene Umgebung änderst: Gibt es eine **kleinere Handlung**, die nur
  **ergänzt**? Und lass jeden Neuaufbau nach **offen** scheitern — ein zugesperrter Stand ist
  nicht mehr reparierbar."

- **Verschlucken sieht aus wie Erfolg — ein nie gestartetes Werkzeug wie ein strenges.**
  → *Prompt:* „Ein Ersatzwert im `catch` gilt nur, wenn er zu **weniger** Aktion führt.
  ‚Nicht gestartet' ist ein eigener Fehlschlag, nie ein Ablehnen."

- **Einigkeit und Erfolg sind keine Evidenz.** Modelle können gemeinsam danebenliegen, und
  „es lief durch" beweist den Weg nicht — du hattest den Dialog weggeklickt.
  → *Prompt:* „Welcher **eine Test** macht die Ursache **sichtbar**? Sag **vor** der Messung,
  welches Ergebnis welche Erklärung ausschließt."

- **Zwei Aufträge für einen Fehler.** Derselbe Mangel wird arglos ein zweites Mal aufgeschrieben.
  → *Prompt:* „Vor jedem neuen Punkt: Such die offenen nach demselben Problem ab — gibt es einen,
  **erweitere ihn**. Verwirfst du einen Zweig, rette, was über seinen Auftrag hinaus darin steckt."

- **Gebaut heißt nicht auffindbar.** Dein Test fragt „wirkt es?", der Nutzer „komme ich dorthin?".
  → *Prompt:* „Meldet er etwas erneut, das repariert ist, nimm an, er **erreicht** es nicht — prüf
  die **Nachbarschaft**, und wo das als Test schreibbar ist, schreib es als Test."

- **Der erste Fehlschlag macht sich selbst dauerhaft.** Eine wiederkehrende Aufgabe liest ihre
  eigene Spur, die es beim ersten Lauf nicht gibt — und bricht von da an immer ab.
  → *Prompt:* „Prüf jede wiederkehrende Aufgabe gegen den **leeren Zustand**; so beginnt sie nach
  jedem Neustart. ‚Übersprungen' ist **kein Betriebszustand** — was sie nicht tut, meldet sie laut."

- **Die Kur ist teurer als der Fehler.** Eine Regel, die ein seltenes Fehlverhalten sicher
  unterbindet, verbiegt das Verhalten überall sonst mit.
  → *Prompt:* „Ein bestätigter Befund verpflichtet zur **Untersuchung**, nicht zur Änderung: Miss
  die Kur gegen gesunde Fälle. Ist sie teurer als der Fehler, **buche** ihn mit Zahlen und
  verworfener Kur — verschweigen gilt nicht, still beheben auch nicht."

- **Die Reihenfolge wird gerankt, nicht befolgt.** Die KI fängt Neues an, während halbfertige
  Zweige liegen. Prüfungen der Sortierung sind grün: Sie prüfen die Liste, nie den Punkt, an
  dem gearbeitet wird.
  → *Prompt:* „Vor jedem **neuen** Punkt: nenn ihn, den vordersten offenen und jeden älteren
  angefangenen Zweig. Weichst du ab, **begründe es**; leere Angefangenes zuerst."

---

## Drei Meta-Regeln, die alles zusammenhalten

1. **Root-Cause vor Fix.** Ausreden-freie Ursachennotizen sind der Rohstoff, aus dem
   gute Mechanismen entstehen.
   > *Prompt:* „Bevor du etwas Wiederkehrendes reparierst: schreib mir in 3–5 Sätzen die
   > **mechanische** Ursache — was genau war die Annahme, die brach?"

2. **Nutzer-Artefakte sind Verträge.** Ein Dashboard, ein Ausgabeformat, eine Board-
   Struktur, die du festgelegt hast: nicht eigenmächtig umbauen, Änderungen nur als
   Vorschlag.
   > *Prompt:* „Struktur von Dingen, die ich festgelegt habe, friert ein. Schlag
   > Änderungen vor, setz sie nicht ungefragt um."

3. **Parallel arbeiten geht nur mit Isolierung.** Die Grenze setzt nicht dein Kontingent,
   sondern der **Haupt-Agent**: bei ihm endet jeder Strang, und je mehr Fremdstoff sein
   Kontext aufnimmt, desto schlechter urteilt er. Verlass dich nie auf „nur lesen".
   > *Prompt:* „Arbeite jede Aufgabe auf einem eigenen Feature-Branch mit eigener
   > Arbeitskopie und führe sie erst nach `main`, wenn sie verifiziert ist — auch ein nur
   > lesender Helfer bekommt eine eigene. Teile parallele Aufgaben so auf, dass sie **nicht
   > dieselben Dateien** anfassen, und arbeite an höchstens **drei** gleichzeitig."

   *(Aufschlag ≈ 10–25 % je zusätzlichem Strang, geschätzt — Nacharbeit + Aufsicht)*

---

## Der kürzeste mögliche Start

> „Erarbeite mit mir zuerst ein `design.md` als einzige Wahrheit — frag mich dafür gründlich
> aus —, dann leg ein `TASKS.md` an und richte die zwei Testschichten ein. Nach jeder
> Änderung: Build/Lint/Audit sauber, ein Test auf der passenden Schicht, ein atomarer Commit.
> Beurteile Sichtbares am Screenshot. Wenn wir eine Regel festlegen, bau sofort den Check, der
> sie erzwingt. Bei Kritischem hol ein zweites Modell als Gegenprüfer. Frag nach, wenn das
> Zielbild unklar ist — rate nicht."

Sie setzt auf, woran alles andere hängt — ersetzt aber die Fallstricke oben nicht.

<!-- GUIDE-FINGERPRINT: 0f29ac9a6c99b803a450e2eb3afd29ce4aea322171a766e72975f6e4f1c3df88 -->
