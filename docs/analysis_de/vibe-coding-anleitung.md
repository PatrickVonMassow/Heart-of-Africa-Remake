# Vibe Coding — kurze Anleitung aus einem echten Projekt

Für den Einstieg, destilliert aus einem mehrwöchigen, weitgehend autonom gebauten
Projekt: keine Klick-für-Klick-Schritte, sondern **Prompts, die du Claude gibst**, und
die Fallstricke dahinter. Ausführlich steht das alles in
`retrospektive-zusammenarbeit.md`.

---

## Die eine Kernlehre

**Gute Vorsätze halten nicht — Prüfungen halten.** Jedes Problem, das nur
„gemerkt" war, kam wieder; sobald etwas es maschinell verhinderte (ein Test, ein
Hook, ein Check), war es weg. Verlange deshalb bei allem, was dir wichtig ist, im
Prompt einen **Mechanismus** — keine Regel:

> *Prompt-Zusatz:* „Sichere das mit einem Mechanismus zu, der die Verletzung
> unmöglich macht, und zeig mir, wo er blockiert."

Der Aufwand richtet sich nach der Wichtigkeit — ein leichter Check für eine leichte
Regel —, die Haltung ist **erzwingen statt erinnern**, ab der ersten Formulierung
und nicht erst beim zweiten Schaden. Fast alles Folgende wendet das an.

### Wie die Prompts in dieser Anleitung formuliert sind

Die Prompts unten sind **Aufträge, einen Mechanismus zu bauen** — keine Merksätze.
„Jedes neue Feature bekommt einen Test" ist eine *Regel*, die vergessen wird;
„Etabliere einen Mechanismus, der das garantiert" ist ein *Auftrag*. Formuliere deine
eigenen genauso. Wo ein Mechanismus prinzipiell **nicht** möglich ist (etwa „sieht das
für einen Menschen richtig aus?"), steht das dabei — dann trägt nur die Aufmerksamkeit.

Eine **Schätzung** wie *(Kosten ≈ 2x)* meint den Mehrverbrauch der betroffenen Arbeit,
nicht des Projekts.

### Primäres und sekundäres Modell

Lege **zwei** Modelle fest und gib ihnen klare Rollen:

- Ein **primäres Modell** macht die Arbeit — bei *jeder* Schwierigkeit. Nimm die
  jeweils stärkste verfügbare Version.
- Ein **sekundäres, anderes Modell** ist für das **Vier-Augen-Prinzip** da (es
  prüft Plan und Ergebnis des primären, oder baut selbst und lässt prüfen) und
  springt als **Ausweichstufe** ein, wenn das primäre nicht in seiner höchsten
  Version verfügbar ist.

> *Prompt:* „Arbeite grundsätzlich mit **\<primäres Modell\>**, unabhängig von der
> Schwierigkeit. **\<sekundäres Modell\>** setzt du nur für das Vier-Augen-Prinzip ein
> oder als Ausweichstufe. Etabliere einen Mechanismus, der ein Arbeitsergebnis eines
> **anderen** Modells erkennt und die Arbeit stoppt, statt sie stillschweigend zu
> übernehmen."

Ein zweites Modell nützt nicht, weil es *besser* wäre, sondern weil es **andere
blinde Flecken** hat — diesen Wert hebt nur eine Prüfung, keine Übergabe. Und ein
unbemerkt schwächeres Modell liefert selbstbewusst Attrappen.

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
  → *Prompt:* „Etabliere einen Mechanismus, der jede Mechanik auch im **Danach-Zustand** prüft
  und nach jedem Zusammenführen die schnelle Testschicht erzwingt. Bau ‚Invarianten' ein, die
  im Entwicklungsmodus laut meckern — so wird jeder Testlauf zum Detektor."

- **Angeblich behoben, aber nicht.** Der Fix wird als fertig gemeldet, das Symptom bleibt.
  → *Prompt:* „Ein Fix zählt erst als fertig, wenn das **Symptom am Ort des Symptoms** als
  behoben gezeigt wurde. Beißt du dich zweimal fest, wechsle die Perspektive — anderes
  Modell, frische Read-only-Diagnose zuerst."

- **Zahlen geschätzt statt gemessen.** ‚Das dauert ~2 Minuten', ‚das ist schneller'.
  → *Prompt:* „Fange ungemessene Zahlen ab: Laufzeiten, Performance und Kosten nennst du nur
  **gemessen** — Performance auf der **Ziel-Hardware**, nicht auf der Build-Maschine."

- **Das Kontingent ist die Grenze, nicht die Zeit.** Der Verbrauch hängt an der Größe
  jedes Kontexts, nicht an den Stunden: lange Sitzungen, die alles mitschleppen, und
  Helfer, die ihren Auftrag erst in großen Dokumenten *suchen* müssen.
  → *Prompt:* „Nenne mir die **gemessenen** Treiber. Schicke jedem Helfer seinen Auftrag als
  fertigen Kurzbrief mit, und fang für jede Aufgabe einen **frischen Kontext** an."
  *(Ein billigeres Modell für ‚einfache' Aufgaben ist der falsche Hebel — die Nacharbeit kostet mehr.)*

- **Der autonome Lauf bleibt stehen — still oder wartend.** Bei langen Läufen endet der
  Fortschritt unbemerkt, oder er hängt an einer Rückfrage an dich. Beides ist gleich teuer,
  gerade wenn du weg bist.
  → *Prompt:* „Bei einer autonomen Daueraufgabe sei die **letzte Aktion jedes Schritts** immer
  ein Schritt an der Aufgabe, und baue einen Mechanismus, der ein stilles Anhalten verhindert.
  Bleib **nie mit einer Rückfrage an mich stehen**: Triff die vernünftigste Annahme; nur was
  wirklich meine Entscheidung braucht, hältst du an sichtbarer Stelle fest und **gehst zum
  nächsten offenen Punkt über**."

- **Kommunikation verfehlt.** Zu technisch, zu lang, an der Zielgruppe vorbei.
  → *Prompt:* „Beschreibe Bugs und Status in der Sprache der Zielgruppe — Symptom zuerst,
  kurz, fürs Handy lesbar — und halte meine Format- und Sprachvorgaben auf **allen**
  sichtbaren Ausgaben ein."


- **Der Test hing an seiner Umgebung, nicht am Verhalten.** Zeitgrenzen reißen unter Last;
  oder er ist nur in der Arbeitskopie grün, in der er lief — was **nicht** im Projekt liegt
  (lokale Dateien, Zugänge, Laufzeitzustand), fehlt in der Kopie eines parallelen Helfers.
  → *Prompt:* „Jeder Test bekommt seine Pfade **eingespritzt**, statt sie zu suchen, und
  Zeitgrenzen richten sich nach der gemessenen Last. Die Frage vor dem Abgeben ist nicht ‚ist
  er grün?', sondern ‚wäre er auch im **Hauptstand** grün?' Einen roten Lauf bewerte ich erst
  auf einer ruhigen Maschine."


- **Messung und Vorschau verunreinigt.** Halbfertiges wird als ‚fertig' beurteilt; Popups
  stören Messungen.
  → *Prompt:* „Hol mein Urteil immer am **veröffentlichten** Stand ein, nie an einem
  Zwischen-Zweig, und halte Messläufe von störenden Fenstern frei."

- **„Erfolgreich" heißt nicht „angekommen".** Ein Befehl meldet Erfolg, das Gewollte ist
  trotzdem nicht passiert — etwa ein Upload, der den falschen Zweig überträgt und „alles
  aktuell" meldet.
  → *Prompt:* „Etabliere einen Mechanismus, der nach jeder Aktion mit Fernwirkung
  (Hochladen, Veröffentlichen, Ausliefern) den **Zielzustand** belegt statt der
  Erfolgsmeldung; eine Abfrage ohne Treffer ist ein Befund, keine Antwort. Setze jede
  Formprüfung **vor** den Schritt nach außen, so dass sie die Auslieferung verhindern kann;
  nur Inhaltliches darf danach laufen."

- **Regeln und Wächter verrotten — nur merkt es niemand.** Regeln wachsen an: Widersprüche,
  Doppelungen, Regeln, die eine nie gebaute Absicherung behaupten. Und ein Wächter, der nie
  auslöst, ist so kaputt wie einer, der immer auslöst: der erste lässt die Regel abgesichert
  erscheinen, der zweite erzieht zum Überlesen.
  → *Prompt:* „Etabliere einen Mechanismus, der den ganzen Bestand periodisch zur Durchsicht
  zwingt — auf Aktualität, Dopplung, Widerspruch und **Wirkungslosigkeit**, zuerst die am
  häufigsten eingeblendeten Texte. Jede Regel wird gegen den Code geprüft, nicht gegen die
  Nachbarregel, und jeder Wächter gegen sich selbst: Hat er je ausgelöst? Kann er überhaupt?
  Doppelt er einen anderen? Ist seine Meldung umsetzbar?" *(Kosten: einmalig hoch)*

- **Der rote Test klagt den Falschen an.** Er täuscht gefährlicher als ein grüner, weil er
  zum schnellen Eingriff verleitet: Prüfungen veralten von selbst und klagen gesunden Code an.
  → *Prompt:* „Etabliere einen Mechanismus, der vor einer Code-Änderung auf einen roten Test
  hin ein **Experiment** verlangt: Belastet der Befund das Produkt oder die Messung? Gemessen
  wird nur an einem eingeschwungenen Zustand, und eine Prüfung schlägt auch dann fehl, wenn
  ihr Messwert in die *unerwartete* Richtung ausschlägt — nicht nur über der Grenze."

- **Derselbe Fakt steht an fünf Stellen — und veraltet an vier.** Wer baut, aktualisiert die
  Stelle, an der er gerade schreibt; die übrigen Kopien rotten unbemerkt, und das ‚Was' im
  Design-Doc passt irgendwann nicht mehr zum ‚Wie' im Code.
  → *Prompt:* „Etabliere einen Mechanismus, der jedem Fakt genau **einen** verbindlichen Ort
  zuweist; alle anderen verweisen darauf. Wo sich eine Wiederholung nicht vermeiden lässt,
  prüft ein Test sie gegen den **Code**, dem der Fakt gehört, nie gegen die Nachbarprosa.
  Berührt eine Änderung das Design, aktualisiere Design-Doc und Code im **selben** Commit."

- **„Aufgeräumt" ohne Beweisliste.** Man räumt dort auf, wo man den Schaden vermutet,
  und übersieht den Rest — den dann jemand anders findet.
  → *Prompt:* „Etabliere einen Mechanismus, der nach jedem Zwischenfall eine
  **Beweisliste** erzwingt: Liegt alles am Zielort? Gibt es Reste (Waisen-Dateien, Tests
  ohne echte Prüfung)? Passen Dokumente und Code zusammen? Läuft alles grün?"

- **Der Autor sieht seine eigene Annahme nicht.** Wer entwirft und baut, prüft gegen dieselbe
  Vorstellung, aus der der Fehler stammt — besonders teuer bei Dingen, die *immer* laufen müssen.
  → *Prompt:* „Etabliere einen Mechanismus, der vor dem Bau **Schwierigkeit × Kritikalität**
  einschätzt und bei Kritischem **ein anderes Modell** erst den Plan und dann das Ergebnis
  gegenprüfen lässt — gegen die echten Daten, und vor dem Zusammenführen." *(Kosten ≈ 2x)*

- **Die teuerste Prüfung großflächig verlangt.** Bildbegutachtung, ein zweiter Lauf, ein
  zweites Modell kosten ein Vielfaches — pauschal für ganze Verzeichnisse gefordert, zahlst
  du sie auch dort, wo sie nichts beweisen kann.
  → *Prompt:* „Verlange die teuerste Prüfung nur für Änderungen, die dort wirklich abweichen
  können, und schreib die Grenze samt Begründung in den prüfenden Code, nicht in eine Regel
  daneben."

- **Was bei jedem Start mitgelesen wird, wächst — und du bezahlst es jedes Mal.** Jede
  Ergänzung ist berechtigt; irgendwann ist der größte Teil der Datei Geschichte. Am teuersten
  sind Texte, die bei *jeder* Anfrage mitgehen — zumal wenn sie wiederholen, was eine Prüfung
  ohnehin erzwingt.
  → *Prompt:* „Gib jedem Dokument, das bei jedem Start gelesen wird, eine **gemessene
  Obergrenze**. Blockiert sie eine Ergänzung, ist die Reihenfolge: kürzen, **zusammenführen**,
  Detail auslagern — die Grenze anheben ist das **letzte** Mittel und braucht eine Begründung.
  Ausgelagert wird verschoben, nicht umformuliert; und der Commit, der eine Prüfung einführt,
  streicht den Text, den sie ersetzt."

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

- **Die Messung sah weniger, als sie behauptet.** Sie schaut nur die letzten *n* Einträge an,
  misst erst *nach* dem Vorgang, oder ein Teil der Testdateien lud gar nicht — nicht geladen
  ist nicht rot, sondern abwesend, und liest sich *grüner* als ein Fehlschlag.
  → *Prompt:* „Leite das Fenster jeder Messung aus dem **Gegenstand** ab: eine Frage über einen
  Zeitraum nach Zeit, nie nach Anzahl; eine über einen Lauf **während** des Laufs. Melde die
  **Zahl der ausgeführten Prüfungen** mit — ein Rückgang ist ein Rot —, und irrt eine Heuristik
  zur Entwarnung hin, braucht sie einen zweiten Beleg."

- **Plötzlich rot, obwohl niemand den Code angefasst hat.** Zwei Teile buchstabieren
  dieselbe Regel getrennt — eines schreibt, eines prüft; das blockiert *alle* Arbeit.
  → *Prompt:* „Wo ein Teil schreibt, was ein anderes prüft, **importiere** den geprüften
  Wert. Wird etwas ohne Code-Änderung rot, frag: welcher **Zustand** hat sich geändert?"

- **Der Befund stirbt mit dem Gespräch.** Ein echter Fehler fällt nebenbei auf und bleibt im
  Chat — die Aufgabenliste ist gerade gesperrt.
  → *Prompt:* „Etabliere einen Mechanismus, der Befunde sichert: ein billiges Kommando, das
  auch bei gesperrter Aufgabenliste schreibt, und eine Prüfung, die einen Zug **nicht enden
  lässt**, der untersucht und nichts hinterlassen hat."

- **Still ersetzt statt sichtbar gescheitert.** Fehlt eine Angabe oder passt eine Eingabe nicht
  zum erwarteten Format, setzt das Programm klaglos einen Ersatz ein — im Code sieht das nach
  Sorgfalt aus, der Folgefehler taucht weit entfernt auf. Dasselbe gilt für interne Kennungen
  in dem, was du ihm sagst.
  → *Prompt:* „Jede eingabeverarbeitende Stelle wird gegen **mehrere Eingabeformen** getestet
  und scheitert **sichtbar**, statt einen plausiblen Ersatz einzusetzen; jeder Rückfall wird
  **gemeldet**, dort wo er greift, mit dem Befehl, der ihn behebt. Nach außen geht der
  **sprechende Name**, nie das Kürzel."

- **Die Gegenprüfung wurde angestoßen, nie abgeschlossen.** Der Helfer startet das Review
  und ist fertig, bevor das Urteil kommt — es landet bei niemandem. Der Zweig sieht geprüft
  aus, und ein aufgezeichnetes „nicht zusammenführen" wirkt wie ein Haken.
  → *Prompt:* „Wer eine Gegenprüfung beauftragt, bleibt dran, bis sie da ist. Ein Urteil
  öffnet das Tor nur, wenn es **zustimmt** — ein ‚nicht zusammenführen' ist erst durch ein
  **späteres** Urteil über den korrigierten Stand erledigt."

- **Der Ausfall kommt nie an der bequemen Stelle.** Er trifft mitten in einer Aktion, und am
  tückischsten Abläufe mit **zwei Hälften**, deren zweite bei der Gegenseite liegt: fällt sie
  dazwischen aus, meldet jede Seite korrektes Verhalten, und das Ganze ist verloren.
  → *Prompt:* „Behandle jede kritische Aktion als Vorgang mit einem **wiederholbaren
  Aufräumschritt**, der bei jedem Start läuft, bevor gearbeitet wird. Prüfe die Erholung mit
  Abbrüchen zu **zufälligen** Zeitpunkten und frag danach nicht ‚läuft es weiter?', sondern
  ‚läuft es **dort** weiter, wo es sollte, und gilt Unfertiges als unfertig?'"

- **„Im Zweifel nichts tun" schützt nur gegen fehlende Daten, nicht gegen falsche.** Wird ein
  Fehlschlag weiter innen schon in einen Ersatzwert verwandelt, läuft die Aktion mit einer
  Lüge weiter.
  → *Prompt:* „Prüfe jedes `catch` mit Ersatzwert: Führt er zu **weniger** Aktion oder zu
  **mehr**? Nur weniger darf verschluckt werden."

- **Der Umzug nimmt nur mit, was versioniert ist.** Auf einem neuen Rechner kommt das Projekt
  an, die Mechanik drumherum nicht: geplante Aufgaben, Geheimnisse, gespeicherte Regeln,
  Werkzeuge liegen außerhalb. Nichts meldet ihr Fehlen — die Wächter gehören selbst dazu.
  → *Prompt:* „Führe eine Liste dessen, was das Projekt braucht und **nicht** im Repository
  liegt, und prüfe sie bei jedem Start gegen eine **Beobachtung**. Ein fehlendes Stück ist ein
  **Befund**, keine Stille."

- **Eine Priorität, die nur in Prosa steht, wirkt nicht.** Du sagst „das kommt vor allem
  anderen", der Assistent schreibt es getreu in die Aufgabenliste — und arbeitet trotzdem
  weiter das Alte ab. Der Grund ist banal: Die Reihenfolge, aus der er sich bedient, steht in
  einem anderen Feld, und Prosa liest die Maschine dort nicht. Besonders tückisch bei langen
  autonomen Läufen, weil jede Nachfolge-Sitzung deinen Chat gar nicht kennt.
  → *Prompt:* „Wenn ich etwas priorisiere, trag es an die Stelle ein, aus der die Arbeit
  tatsächlich gezogen wird, und lass eine Prüfung fehlschlagen, wenn Deklaration und
  Reihenfolge auseinanderlaufen. Und priorisiere das **Ziel**: Was das vorgezogene Feature
  schneller fertig macht, kommt mit nach vorn, auch wenn es nicht dazugehört."

- **Blockiert heißt nicht: du bist dran.** Stößt der Assistent auf eine fehlende Berechtigung,
  reicht er dir gern einen Befehl zum Ausführen — der oft gar nicht funktionieren kann, weil
  er die Umgebung nur vermutet hat. Zwei Runden deiner Zeit für Arbeit, die seine war.
  → *Prompt:* „Ein Schritt in der Umgebung, in der du arbeitest, gehört dir. Bevor du mich um
  irgendetwas bittest: **miss**, ob der Weg überhaupt trägt. Fehlt wirklich eine Fähigkeit,
  bitte **einmal um die Fähigkeit** — nie um ihre Ausführung."

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

3. **Parallel arbeiten geht nur mit Isolierung.** Ohne eigene Arbeitskopien vervielfacht
   Delegation das Chaos. Die Grenze setzt nicht dein Kontingent, sondern der
   **Haupt-Agent**: bei ihm endet jeder Strang, und je mehr Fremdstoff sein Kontext
   aufnimmt, desto schlechter urteilt er. Verlass dich nie auf „nur lesen" — was ein
   Helfer anfassen kann, fasst er an.
   > *Prompt:* „Arbeite jede Aufgabe auf einem eigenen Feature-Branch mit eigener
   > Arbeitskopie und führe sie erst nach `main`, wenn sie fertig und verifiziert ist.
   > Auch ein nur lesender Helfer bekommt eine eigene Arbeitskopie.
   > Teile parallele Aufgaben so auf, dass sie **nicht dieselben Dateien** anfassen, und
   > arbeite an höchstens **drei** gleichzeitig. Reduziere die Zahl, sobald das
   > Zusammenführen Nacharbeit erzeugt."

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

<!-- GUIDE-FINGERPRINT: a3a36516b48f0fdbbd27e8039897f163aa55087b594f2f8d875fe4ba9d25792f -->
