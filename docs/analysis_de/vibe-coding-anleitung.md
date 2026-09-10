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
Regel —, ab der ersten Formulierung, nicht erst beim zweiten Schaden. Und gib der
Prüfmechanik ein Außen-Budget: Sonst wird sie selbst zum Hauptprodukt (§3.227).

### Wie die Prompts in dieser Anleitung formuliert sind

Die Prompts unten sind **Aufträge, einen Mechanismus zu bauen** — keine Merksätze; wo einer
**nicht** möglich ist, steht das dabei. *(Kosten ≈ 2x)* meint den Mehrverbrauch der
betroffenen Arbeit, nicht des Projekts.

### Primäres und sekundäres Modell

Lege **zwei** Modelle fest, mit klaren Rollen:

- Ein **primäres Modell** macht die gewöhnliche Arbeit. Nimm die stärkste Version.
- Ein **sekundäres, anderes Modell** übernimmt **Vier-Augen**, **Ausweichstufe** und die
  **harten Fälle**. Ist seine Spur **knapp**, eskaliere erst nach **mehreren** Fehlrunden.
- Optional, besser: ein **drittes Modell vereinigt** die blinden Ergebnisse.

> *Prompt:* „Gewöhnliche Arbeit macht **\<primäres Modell\>**. **\<sekundäres Modell\>**
> übernimmt Vier-Augen, Ausweichstufe und die harten Fälle; zur knappen Spur eskalierst du
> erst nach **\<n\>** Fehlrunden, **\<n\>** als Konstante. Etabliere einen
> Mechanismus, der ein fremdes Arbeitsergebnis erkennt und stoppt, statt es
> stillschweigend zu übernehmen. **Vereinigt** wird von einem **dritten Modell**, das an
> keiner Liste mitschrieb; jeder Eintrag steht als **nur A**, **nur B** oder **verschmolzen**."

Ein zweites Modell nützt nicht, weil es *besser* ist, sondern weil es **andere blinde
Flecken** hat. Die **Obergrenze** zieht die **Sichtbarkeit des Fehlers**: Was den Ablauf
steuert oder Arbeit vernichten kann, wird gegengeprüft; was ein schneller Test
zeigt, nie.

**Kontingent ist nicht austauschbar.** Ist ein Modell knapp, behalte ihm vor, was **nur** es
kann; Code zu schreiben, der größte Verbraucher, geht ans andere. Ein Verteiler ohne
Füllstand empfiehlt ein leeres Modell.

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

   Genau dieses Tor kann dir den ganzen Stapel blockieren: Jede Korrektur an
   einem Mechanismus ist selbst eine Mechanismus-Änderung, also wächst die
   Schuld schneller, als eine Sitzung sie abtragen kann. Bau die Notbremse
   gleich mit ein:
   > „Der Zwang muss abschaltbar sein, ohne die Messung zu verlieren: eine Zeile,
   > die den Block aufhebt, während der Bericht die offene Schuld weiter zeigt."

6. **Fortschritt sichtbar machen (wenn du mitlesen willst).**
   > „Führe ein knappes Fortschritts-Board (eine Datei oder Seite) und **etabliere einen
   > Mechanismus, der seine Aktualität erzwingt**: Es zeigt **immer den echten Stand**.
   > Er greift, **bevor** die Arbeit beginnt, nicht erst am Ende — sonst ist die Stunde
   > ungesichert, in der ich hinsehe — und merkt auch, wenn der Text steht, während die
   > Arbeit weiterlief."

---

## Automatische Tests — und ihre Tiefe abstufen

Automatische Tests sind das Rückgrat; ohne sie ist „Vibe Coding" ein Blindflug. Nicht jede
Änderung braucht die volle Batterie — sonst wird Testen umgangen. **Abgestufte Umfänge**:

- **Schnell (nach JEDER Änderung):** die Unit-Schicht ohne Browser — Logik und Zustand.
  Sekunden, und kein Browser-Timing kann sie flackern lassen.
- **Klein (bei Sichtbarem/Interaktion):** die schnelle Schicht + ein Kernsatz echter
  Browser-Tests, auf dem Unterbau des Nutzers statt auf dem bequemeren Ersatzweg.
- **Groß (vor jedem Release):** die volle Regression über alle Suiten und **Ziel-Backends**,
  mehrfach flakefrei.

> *Prompt:* „Richte drei Test-Stufen ein — schnell (Unit, immer), klein (Unit + Kern-
> Browsertests) und groß (volle Regression auf allen Ziel-Backends). Wähl pro Änderung die
> passende Stufe und nenn mir kurz warum; **etabliere einen Mechanismus**, der die große
> Stufe vor einem Release **erzwingt** und sie **verweigert**, solange die schmale zum
> geänderten Stand nicht grün ist."

*(Kosten ≈ 1,5x)* Zwei Mechanismen, die das Netz ehrlich halten:

> *Prompt:* „Etabliere einen Mechanismus, der eine Wiederholung **sichtbar** macht: Ein
> flakender Test darf einmal wiederholt werden, gilt danach als **verdächtig** und trägt keine
> Freigabe mehr. Erledigt ist ein Rot nur mit **benannter Ursache** — wiederholte Grüns
> sind keine. Und einen, der feste Wartezeiten aufspürt."

Die Ursache findest du durch **Zerlegen**, nicht durch Wiederholen.

---

## Die häufigsten Fallstricke → und was hilft

- **Grüner Test, falsches Bild.** Er prüfte einen Hilfswert oder *stellt her*, was die Handlung
  bewirkt hätte — und ist für immer grün.
  → *Prompt:* „Eine sichtbare Änderung ist erst fertig, wenn sie am **echten gerenderten Bild**
  geprüft wurde. Zu jeder Prüfung: **Welche Zeile ruft die Sache auf — und was bliebe grün, wenn
  sie kaputt wäre?** Zeit darf ein Test abkürzen, den **Aufruf** nie. Ist die **Ausgabe** das
  Produkt, lies sie am **echten Bestand**. Und das Bild
  beantwortet nicht nur ‚stimmt es?‘, sondern **wozu tut die Figur das — sieht man es ihr an?“
  *(Sieht das richtig aus?)*
- **Dem Test geht der Gegenstand unter den Füßen weg.** Er hält seinen Prüfling an einer
  Koordinate, einem Vorgabewert oder einer Simulation fest. Zieht der Prüfling um, fragt der
  Test weiter — nur über nichts mehr. Ein Rot meldet sich; ein leerer nicht.
  → *Prompt:* „**Verlegst** du etwas, ist das Anpassen der roten Stellen nur die Hälfte: Sieh
  jede übrige Zusage desselben Blocks an, ob sie **noch über etwas urteilt**. Leite den Prüfling
  **ab** statt ihn zu nennen, sonst prüf seine **Zugehörigkeit** mit. Und **stell die Gelegenheit
  her**, statt auf sie zu warten — wer wartet, ob zufällig ein Störer dasteht, prüft Würfel.“
- **Der Fühler misst sich selbst.** Er erneuert beim Nachsehen seinen Messwert oder liest, was
  ein Testlauf schreibt: Totes wirkt lebendig, der Nächste bleibt draußen.
  → *Prompt:* „Ein Lebenszeichen kommt nur aus einer Quelle, die der **Beobachter nicht
  beschreibt**. Wer entscheidet, ob **ein anderer anfangen darf**, misst einen **Handelnden** —
  Prozess oder Handle, nie Textsuche oder Dateien: **Arbeit ist kein Arbeiter.**“
- **Die Sonde kann ihr Nein nicht erreichen.** Die Prüfung könnte „tot“ sagen — aber nur, wenn man
  ihr den Beweis übergibt, und genau dieser Aufrufer übergibt ihn nicht. Ihr „lebt noch“ ist dann
  der einzig mögliche Satz.
  → *Prompt:* „Frag zu jeder Prüfung: **Kann sie mit den Eingaben dieses Aufrufers das negative
  Urteil überhaupt erreichen?** Wo nein, ist ihr Grün eine Tautologie. Und einen Fix an einer
  gemeinsamen Funktion prüfst du an **allen** Aufrufstellen, nicht nur an der, die dich biss. Und
  lies ihre **Ausnahmen**: Setzt derselbe Mechanismus, dessen Schaden sie melden soll, das Flag,
  das sie freistellt, schweigt sie genau dann, wenn es zählt.“

- **Neue Features zerbrechen alte.** Eine Änderung repariert X und bricht das unbeobachtete Y.
  → *Prompt:* „Prüfe jede Mechanik auch im **Danach-Zustand** und erzwing nach jedem
  Zusammenführen die schnelle Testschicht. Bau ‚Invarianten' ein, die im Entwicklungsmodus laut
  meckern — jeder Testlauf wird zum Detektor."

- **Angeblich behoben, im Präsens behauptet.** Der Fix gilt als fertig, das Symptom bleibt.
  → *Prompt:* „Fertig ist ein Fix, wenn das **Symptom am Ort des Symptoms** weg ist **und** der
  gleiche Versuch am **alten Stand** noch durchgeht. Was du im **Präsens** behauptest, sieh vorher
  nach. Zweimal festgebissen: wechsle das Modell."

- **Fehlalarm behoben — echter Alarm gleich mit.** Die Prüfung wird schärfer, alles grün — nur
  schlägt sie auch nicht mehr an, wenn sie sollte.
  → *Prompt:* „Entschärfst du eine Prüfung, weise **beide** Richtungen nach — Fehlalarme weg UND echte Treffer noch da. Die Fälle erfindet das **andere Modell**." *(≈ 1,3x)*

- **Runde um Runde, ohne näher zu kommen.** Das Gegenlesen findet jedes Mal etwas, der Abstand
  schließt sich nie.
  → *Prompt:* „Frag vor jeder Runde: **Hat sich etwas bewegt außer der Zählung?** Bleibt der
  Umfang, ist der Gegenstand zu groß — **teile das Ticket und arbeite jedes Stück für sich ab**.“

- **Gebaut — und nie in Betrieb genommen.** Die Ausnahme steht im Fließtext statt in der Datei,
  die das Werkzeug liest; oder das Tor urteilt richtig, nur fährt es kein Weg des Projekts.
  → *Prompt:* „Trag eine Ausnahme **im selben Zug** dort ein, wo der Mechanismus sie liest, und
  nenn zu jedem Tor den **Weg, der es fährt**.“

- **Zahlen geschätzt statt gemessen — oder gemessen ohne Uhrzeit.** ‚Das dauert ~2 Minuten'; ein
  Höchststand ohne Uhrzeit.
  → *Prompt:* „Laufzeiten, Performance und Kosten nennst du nur **gemessen**, auf der
  **Ziel-Hardware**; was altern kann, erhebe neu. Ein Maximalwert darf **entlasten**, nie
  beschuldigen — miss den **echten Lauf** über die Zeit."

- **Das Kontingent ist die Grenze, nicht die Zeit.** Der Verbrauch hängt an der Kontextgröße,
  nicht an den Stunden.
  → *Prompt:* „Nenne mir die **gemessenen** Treiber, gib jedem Helfer einen Kurzbrief und fang je
  Aufgabe einen **frischen Kontext** an. Vor einem Deckel miss den **Startboden**."

- **Es antwortet nicht das Modell, das du bestellt hast.** Bei Engpass serviert die Umgebung still
  ein schwächeres weiter.
  → *Prompt:* „Stell zu Sitzungsbeginn fest, **welches Modell tatsächlich antwortet**, und halte es
  gegen die erlaubte Reihe. Steht es außerhalb, **halte an und melde**."

- **Der autonome Lauf bleibt stehen — still oder wartend.** Beides teuer, wenn du weg bist — auch
  durch Rettungen, die einzeln richtig sind und einander verklemmen.
  → *Prompt:* „Bleib **nie mit einer Rückfrage stehen**: Annahme treffen, festhalten, weitergehen.
  Prüfe Rettung **paarweise** — jeder Wächter nennt die Bewegung, die ihn erfüllt —, zähle nur
  **Versuchtes** und sichere mit **zweitem Zeitgeber**, der am **Ergebnis** misst, nie an der
  Betriebsamkeit des Aufgefangenen."

- **Kommunikation verfehlt.** Zu technisch, zu lang, an der Zielgruppe vorbei.
  → *Prompt:* „Beschreibe Bugs und Status in der Zielgruppensprache — Symptom zuerst, fürs
  Handy lesbar — und halte Format und Sprache auf **allen** Ausgaben ein."

- **Test und Wächter hingen an ihrer Umgebung, nicht am Verhalten.** Sie messen dein Repository
  statt deinen Code — von Hand nachgeprüft bestätigt sich der Fehler selbst.
  → *Prompt:* „Jede Prüfung bekommt ihre Pfade **eingespritzt**; was fürs **ganze Projekt** gilt,
  wird an **einer** Stelle gelesen. Grün bei dir, rot im Haken? Lass es aus **beiden** Wurzeln laufen."

- **Messung und Vorschau verunreinigt.** Halbfertiges gilt als ‚fertig'.
  → *Prompt:* „Hol mein Urteil am **veröffentlichten** Stand ein, nie an einem Zwischenzweig, und
  miss auf einer ruhigen Maschine."

- **Der Bericht urteilt über den Versuch, nicht über die Wirkung.** „Erfolgreich“ heißt nicht
  „angekommen“ — und ein fehlgeschlagener Push nennt Arbeit „nur lokal“, die längst drüben liegt.
  → *Prompt:* „Beleg nach jeder Fernwirkung den **Zielzustand** statt des Versuchs, und melde beim
  Start, was **lokal fertig, aber nirgends angekommen** ist.“

- **Regeln und Wächter verrotten — nur merkt es niemand.** Eine Absicherung greift enger als ihr
  Satz, oder weiter; mehrere richtige Regeln können durch ihre Lücke etwas verbieten — und Warten
  sieht dabei wie Sorgfalt aus.
  → *Prompt:* „Schreib die **Erlaubnis im selben Satz wie ihre Grenze**. Leg Satz und Code
  periodisch **nebeneinander**, zieh **den Code auf den Satz**, und frag: **Welcher naheliegende
  Fall wird von keiner Regel erfasst?**"

- **Der genannte Ausweg trägt nicht:** Er schadet, tritt nie ein, ist längst getan — oder es gibt
  ihn als Befehl gar nicht. Dann hat die Sperre recht, und übrig bleiben Handarbeit und das
  Übergehen der Prüfung — die zwei Wege, gegen die sie gebaut wurde.
  → *Prompt:* „**Geh den Ausweg jeder Verweigerung einmal wirklich**, im auslösenden Zustand:
  Führt er zum Guten, kann er eintreten, gilt er für **den, der die Meldung liest** — und
  **welcher Befehl schreibt den verlangten Zustand?** Eine ungenutzte Lücke ist ungemeldet.“

- **Dieselbe Verweigerung ein zweites Mal — wortgleich.** Du hast begründet, warum sie nicht
  zutrifft, und sie kommt unverändert wieder. Dann irrt nicht der Wächter, sondern dein Bild
  vom Zustand.
  → *Prompt:* „Kommt eine Ablehnung **wortgleich** ein zweites Mal, wiederhol nicht die
  Begründung — **miss den Zustand neu**. Die Wiederholung ist die Meldung.“

- **Der rote Test klagt den Falschen an.** Prüfungen veralten; ein Rot täuscht gefährlich.
  → *Prompt:* „Verlang auf ein Rot hin erst ein **Experiment**: Produkt oder Messung? Gemessen
  wird nur an einem eingeschwungenen Zustand, dessen Bereitschaft der **Gegenstand** meldet, nie
  eine Uhr — und schlag auch fehl, wenn der Wert *unerwartet* ausschlägt."

- **Derselbe Fakt steht an fünf Stellen — und veraltet an vier.**
  → *Prompt:* „Gib jedem Fakt genau **einen** verbindlichen Ort; alle anderen verweisen darauf.
  Unvermeidbare Wiederholung prüft ein Test gegen den **Code**, dem der Fakt gehört; Doc und Code
  ändern sich im **selben** Commit."

- **„Aufgeräumt" ohne Beweisliste.** Man räumt dort auf, wo man den Schaden vermutet.
  → *Prompt:* „Erzwing nach jedem Zwischenfall eine **Beweisliste**: Liegt alles am Zielort? Gibt es Reste? Passen Dokumente und Code zusammen?"

- **Der Autor sieht seine eigene Annahme nicht — und wer eine fertige Liste prüft, hakt sie ab.**
  Wer baut, prüft gegen die Vorstellung, aus der der Fehler stammt.
  → *Prompt:* „Zieh bei Kritischem **ein anderes Modell** hinzu. Beim **Finden** blind parallel,
  beim **Beurteilen** Gegenlesen — **erst das Ergebnis, dann die Begründung**." *(≈ 2x)*

- **Die Lehre gilt als versorgt, sobald ihr Wächter benannt ist** — gebaut ist er damit nicht.
  → *Prompt:* „Trenne **benannt** von **gebaut**: ‚gebaut' wird am Haken des Punktes geprüft, und
  ein Bericht nennt jede Lehre, deren Wächter seit Wochen nur benannt ist."

- **Die aufgeschriebene Grenze deckt nicht, was sie behauptet.** Der Satz, was ein Mechanismus
  *nicht* leistet, wird zur Ablage für bloß nicht Getanes.
  → *Prompt:* „Liegt die Information zum **Schließen** vor, wird geschlossen. Jede verbleibende
  Grenze nennt ihre **Richtung**: zu viel durchgelassen oder zu viel verweigert."

- **Die teuerste Prüfung großflächig verlangt.** Bildbegutachtung, zweiter Lauf, zweites Modell
  kosten ein Vielfaches — pauschal gefordert, wo sie nichts beweisen. **Eine Regel ohne Preis ist
  nur eine Empfehlung:** Ein Punkt verbrannte fünf rote Zwei-Stunden-Läufe, obwohl der Auftrag
  „genau ein Vollbeweis" sagte — die Zeitangaben waren sechs Wochen alt und dreifach zu niedrig.
  → *Prompt:* „Verlange die teuerste Prüfung nur, wo eine Änderung abweichen kann, und schreib
  die Grenze samt Begründung in den prüfenden Code. An jede billigere Stufe gehört ihre
  **gemessene Dauer mit Messdatum**, und ein Prüflauf druckt den Befehl mit, der seinen Fehler
  billig reproduziert."

- **Was bei jedem Start mitgelesen wird, wächst — und du bezahlst es jedes Mal.** Jede
  Ergänzung ist berechtigt; am teuersten die, die wiederholt, was eine Prüfung erzwingt.
  → *Prompt:* „Gib jedem Dokument, das bei jedem Start gelesen wird, eine **gemessene
  Obergrenze**. Blockiert sie: kürzen, **zusammenführen**, auslagern — anheben zuletzt."

- **Jedes Teil grün, die Kette trotzdem tot.** Alle Bausteine sind getestet, am Ende passiert
  trotzdem nichts — dazwischen hat niemand nachgesehen.
  → *Prompt:* „Was aus mehreren Schritten besteht, spiel **einmal vollständig durch** und lies das
  Ergebnis aus den Protokollen, nicht aus den Tests."

- **Die Messung — und die Gegenprüfung — sah weniger, als sie behauptet.** Nur die letzten *n*
  Einträge; nicht geliefert liest sich *grüner* als ein Fehlschlag, still gekürzter Prüfstoff für
  das Modell wie ein Mangel.
  → *Prompt:* „Leite das Fenster jeder Messung aus dem **Gegenstand** ab: nach Zeit, nie nach
  Anzahl. Nenne dem **prüfenden Modell selbst** jedes weggelassene Material, nicht nur dem
  Aufrufer, und melde die **Abdeckung**; ein Urteil über halbem Material ist **Teilprüfung**.
  Ein Urteil gilt dem **Zuschnitt**, den du lieferst: Stimmt er nicht, korrigier ihn und **frag
  neu** — überstimm nie den Prüfer."

- **„Läuft der noch?" mit „ist die Ausgabe frisch?" beantwortet.** Frische belegt nur, dass jemand
  gearbeitet *hat*: Ein **fertiger** Lauf hinterlässt frische Dateien wie ein arbeitender, ein
  Commit ist sogar das **Letzte**, was einer tut. Zwei Spuren gegeneinander zu prüfen hilft nicht.
  → *Prompt:* „Miss Lebendigkeit am **Vorgang** (Kennung samt Startzeit), nie an seinen Spuren;
  unlesbar heißt **unbekannt**, nicht tot. Frische darf eine Nachfrist nur **verkürzen**."

- **Plötzlich rot, obwohl niemand den Code angefasst hat.** Zwei Teile buchstabieren dieselbe Regel
  getrennt — eines schreibt, eines prüft.
  → *Prompt:* „Wo ein Teil schreibt, was ein anderes prüft, **importiere** den Wert; der Eingang
  ist **Pflicht**, kein Vorgabewert."

- **Jeder Befund wird zur Arbeit — und die Arbeit findet neue Befunde.** Im ersten Monat richtig,
  im dritten die Ursache: Die Prüfmechanik findet ihre eigenen Fehler, der Zulauf hat keine
  Grenze, das Projekt arbeitet an sich selbst.
  → *Prompt:* „Ein Befund wird nur Arbeitspunkt bei Nutzerwirkung, Risiko, echter Blockade oder
  Vereinfachung. Sonst in eine gesammelte, **nicht blockierende** Liste."

- **Der Befund stirbt mit dem Gespräch — oder liegt dreimal abgelegt ganz hinten.**
  → *Prompt:* „Sichere Befunde mit einem billigen Kommando, das immer schreibt, und einer Prüfung,
  die keinen Zug enden lässt, der untersucht und nichts hinterlassen hat. **Such** einen Befund,
  bevor du ihn ablegst: Steht die Klasse schon da, **zieh vor** statt neu zu beschreiben."

- **Still ersetzt — »kaputt« antwortet wie »fehlt«.** Wer aus »fehlt« etwas schließt, schließt aus Schrott.
  → *Prompt:* „Jede eingabeverarbeitende Stelle scheitert **sichtbar**; **fehlend und unlesbar
  liefern verschiedene Werte**, und jeder Rückfall wird **gemeldet**, mit seinem Behebungsbefehl."

- **Die Gegenprüfung wurde angestoßen, nie abgeschlossen** — der Zweig sieht geprüft aus.
  → *Prompt:* „Wer eine Gegenprüfung beauftragt, bleibt dran, bis sie da ist. Ein ‚nicht
  zusammenführen' erledigt erst ein **späteres** Urteil über den korrigierten Stand."

- **Der Ausfall kommt nie an der bequemen Stelle** — am tückischsten mitten zwischen zwei Hälften,
  wo danach jede Seite korrektes Verhalten meldet.
  → *Prompt:* „Gib jeder kritischen Aktion einen **wiederholbaren Aufräumschritt beim Start des
  Nachfolgers**, nie am Ende des Vorgängers, und prüf ihn mit Abbrüchen zu zufälligen Zeiten.
  Liegengebliebenes erkennst du am **Besitzer, nie am Alter**: Der Vermerk wird zuletzt geschrieben."

- **Was außerhalb des Repositorys liegt, kommt nicht mit — und geht nicht zurück.** Das Projekt
  zieht um, die Mechanik nicht; wer dort etwas ändert, hat kein `git`.
  → *Prompt:* „Führe eine Liste dessen, was **nicht** im Repository liegt, und prüfe sie bei
  jedem Start gegen eine **Beobachtung**. Dort ändert niemand etwas ohne Kopie."

- **Der Alarm, der nie spricht.** Fällt die Quelle aus, meldet ein Alarm auf ein *Ereignis*
  nichts — und der Ersatzkanal hat oft nie gefeuert.
  → *Prompt:* „Überwache den **Zustand** statt des Ereignisses, und **löse jeden Ersatzkanal
  einmal echt aus**. Was anhalten darf, eskaliert nur auf **aufeinanderfolgende** Fehlschläge."

- **Der Halt, den nur ein Mensch aufhebt.** Er kostet den Rest deiner Abwesenheit — und ein
  leerer Marker sieht aus wie dein bewusster Stopp.
  → *Prompt:* „Jeder Halt bekommt eine Wiederanlauf-Uhr. Ohne Uhr bleibt nur, was **nachweislich**
  von mir kommt; alles andere wird protokolliert und kurz wiederholt."

- **Prosa wirkt nicht — als Priorität so wenig wie als Meldung.** Ein Tor hielt den eigenen
  Delegaten für fremd: Die Übergabe nannte ihn nur im Text.
  → *Prompt:* „Trag jede wirksame Angabe in das **Feld**, das der Mechanismus liest; laufen beide
  auseinander, schlägt eine Prüfung fehl. Priorisiere das **Ziel**, und sag bei jeder
  Sortierregel, was mit dem **Altbestand** geschieht: nachräumen oder liegen lassen."

- **Die Begründung, die sich im eigenen Dokument widerlegt.** Ein Sicherheitsargument und sein
  Gegenbeweis standen drei Abschnitte auseinander; vier Prüfrunden sahen je eine Hälfte, weil der
  Prüfstoff nach Größe geschnitten wird.
  → *Prompt:* „Prüf jede Rechtfertigung gegen das, was im selben Dokument schon behauptet wird —
  ein **Widerspruch in der Prosa** ist ein Befund über den **Code**."

- **Blockiert heißt nicht: du bist dran.** Fehlt eine Berechtigung, bekommst du gern einen
  Befehl gereicht — oft einen, der gar nicht funktionieren kann.
  → *Prompt:* „Ein Schritt in deiner Umgebung gehört dir; **miss** erst, ob er trägt. Fehlt eine
  Fähigkeit, bitte **einmal um sie** — nie um ihre Ausführung."

- **Nicht jedes Rot ist deins — und manches war nie eines.** Eine Prüfung, die nur „rot" und
  „grün" kennt, schiebt Fremdes dir zu.
  → *Prompt:* „Sag bei jedem Rot zuerst, **wo die Ursache liegt** — lief überhaupt ein eigener
  Schritt? Was du nicht selbst gemessen hast, ist eine **Behauptung**."

- **Die Reparatur nimmt den Reparierenden mit.** Wer die Leitung repariert, auf der er sitzt,
  verliert die nächste Reparatur mit; ein abgebrochener Lauf räumt nicht weg, was er hinterlässt.
  → *Prompt:* „Änderst du deine eigene Umgebung: Gibt es eine **kleinere Handlung**, die nur
  **ergänzt**? Und: **Wer räumt auf, wenn der Aufräumende nicht mehr da ist?**"

- **Verschlucken sieht aus wie Erfolg — und die Frage nach der Bedienung löst die Wirkung aus.**
  → *Prompt:* „Ein Ersatzwert im `catch` gilt nur, wenn er zu **weniger** Aktion führt.
  ‚Nicht gestartet' ist ein eigener Fehlschlag, nie ein Ablehnen. Ein Werkzeug mit teurer oder
  schreibender Wirkung **lehnt ein unbekanntes Argument ab**, statt es zu deuten — sonst startet
  `--help` den Zwei-Stunden-Lauf."

- **„Nichts geliefert" wurde nie nachgemessen.** Ein Lauf meldet, er habe nichts geschrieben,
  während fertige, ungesicherte Arbeit danebenliegt.
  → *Prompt:* „Eine **verneinende** Meldung nennt den **gemessenen** Zustand, den sie verneint."

- **Einigkeit und Erfolg sind keine Evidenz.** Modelle liegen gemeinsam daneben, und
  „es lief durch" beweist den Weg nicht.
  → *Prompt:* „Welcher **eine Test** macht die Ursache **sichtbar**? Sag **vor** der Messung,
  welches Ergebnis welche Erklärung ausschließt."

- **Zwei Aufträge für einen Fehler.** Derselbe Mangel wird arglos ein zweites Mal aufgeschrieben.
  → *Prompt:* „Vor jedem neuen Punkt: Such die offenen nach demselben Problem ab und **erweitere**
  den vorhandenen. Verwirfst du einen Zweig, rette, was darin über seinen Auftrag hinausgeht."

- **Zusammenlegen behält das Thema und verliert die Schärfe.** Der Überlebende sagt dasselbe —
  nur schwächer: aus „jeder Fall wird benannt geschlossen" wird „verzeichnet".
  → *Prompt:* „Prüf **drei Stellen einzeln**: Pflichtsätze, Abnahmezeile, Einstufung; die
  **stärkere** Fassung gewinnt. Zum Nachprüfen beide **ganzen** Texte, nie nur den Unterschied."

- **Gebaut heißt nicht auffindbar.** Dein Test fragt „wirkt es?", der Nutzer „komme ich dorthin?".
  → *Prompt:* „Meldet er etwas erneut, das repariert ist, nimm an, er **erreicht** es nicht — prüf
  die **Nachbarschaft** und schreib es als Test."

- **Der erste Fehlschlag macht sich selbst dauerhaft.** Eine wiederkehrende Aufgabe liest ihre
  eigene Spur, die es beim ersten Lauf nicht gibt — und bricht von da an immer ab.
  → *Prompt:* „Prüf jede wiederkehrende Aufgabe gegen den **leeren Zustand**. ‚Übersprungen' ist
  **kein Betriebszustand** — was sie nicht tut, meldet sie laut."

- **Die Kur ist teurer als der Fehler.** Eine Regel, die ein seltenes Fehlverhalten sicher
  unterbindet, verbiegt alles andere mit.
  → *Prompt:* „Ein bestätigter Befund verpflichtet zur **Untersuchung**, nicht zur Änderung: Miss
  die Kur gegen gesunde Fälle. Ist sie teurer, **buche** den Fehler mit Zahlen und verworfener Kur."

- **Die Reihenfolge wird gerankt, nicht befolgt.** Die KI fängt Neues an, während halbfertige
  Zweige liegen; die Sortierprüfungen prüfen die Liste, nie den Punkt in Arbeit.
  → *Prompt:* „Vor jedem **neuen** Punkt: nenn ihn, den vordersten offenen und jeden älteren
  angefangenen Zweig. Weichst du ab, **begründe es**; leere Angefangenes zuerst."

- **Die Grenze spricht erst beim Aufhören.** Eine Obergrenze im Schlusscheck lässt jeden Anfang
  durch; und was festhält, gilt als „nicht übergebbar".
  → *Prompt:* „Eine Grenze verwehrt die **erste** Handlung nach dem Überschreiten, nicht die
  letzte. Was den Schritt **abschließt**, bleibt erlaubt; was festhält, mach **übergebbar**."

- **Die KI repariert den Wächter, der sie gerade sperrt — oder beantwortet ihn zehnmal.** Ein Tor
  kann zu Recht sperren und trotzdem unlösbar sein; und weil ein rotes Tor den Zug neu startet,
  schreibt die KI eine neue Abschlusszeile statt einer Reparatur.
  → *Prompt:* „Sperrt ein Tor dich, ändere es nie allein: **leg dein Eigeninteresse offen**, nimm
  das zweite Urteil. Bevor ein Tor scharf geht, **zähl alle Wege auf** und prüfe seine Abhilfe.
  Eine **wiederholte** Absage heißt, dass deine Antwort nicht die Reparatur ist."

- **Der Prüflauf verändert sein eigenes Projekt.** Eine Suite, die ihren Zielpfad aus dem Quellort
  statt der Testumgebung nimmt, schreibt Zweige um und bleibt grün.
  → *Prompt:* „Etabliere einen Mechanismus, der einen Prüflauf rot färbt, sobald er das Projekt
  verändert hat, in dem er läuft — und **umgekehrt**: Solange ein Lauf läuft, schreibt **niemand**
  ins Projekt. ‚Committe jeden fertigen Schritt' und ‚der Lauf verlangt einen unveränderten Stand'
  stoßen sich sonst gegenseitig um."

- **Grün über einem Programm, das nicht startet.** Der Testlader ist milder als der echte.
  → *Prompt:* „Laden Prüfstand und Betrieb **verschieden**, gib dem Betrieb einen eigenen Zeugen."

- **Der Test vergleicht den Erzeuger mit sich selbst.** Trägt der Erzeuger den Fehler, trägt ihn
  die Erwartung mit; Grün heißt nur „nicht veraltet".
  → *Prompt:* „Frag bei jedem Test über einem **erzeugten** Artefakt, **woher die Erwartung kommt**.
  Richtigkeit braucht eine Aussage, die der Erzeuger **nicht selbst herstellt**."

- **Ein Auftrag, den du einer laufenden Sitzung nur zurufst, stirbt mit ihr.**
  → *Prompt:* „Was eine Sitzung überdauern soll, gehört in eine Datei, die dein Werkzeug beim
  nächsten Start liest. Ein Zuruf ist ein Hinweis, nie ein Auftrag."

- **Die Ausnahme existiert nur in der Verweigerung.** Ein Mechanismus verspricht einen Sonderweg
  und baut ihn nicht.
  → *Prompt:* „Baue jede zugesagte Ausnahme als eigenen Zustand und Befehl, und schreib einen Test,
  der sie **geht**. Prüffrage: Kann der ehrlichste Wortlaut der Ausnahme meine eigene Prüfung
  bestehen?"

- **Zwei Helfer, ein Projekt — und der zweite merkt es nie.** Startet dein Werkzeug automatisch
  nach, geht eine zweite Sitzung neben der laufenden auf.
  → *Prompt:* „Nimm eine **Sperre mit laufender Nummer**, die einen kleineren Anspruch **abweist**,
  und stell die Besitzfrage **vor jedem Schreibvorgang** neu."

- **Die neue Pflicht verurteilt die alten Einträge.** Der verschärfte Prüfer liest den ganzen
  Bestand und erklärt korrekt entstandene Altdaten für gefälscht.
  → *Prompt:* „Eine Pflicht in einer Prüfung, die Altbestände liest, sagt **ab wann** sie gilt."

- **Der Wächter tritt zurück — und hört dabei auf zu messen.** Wer fremde Arbeit nicht anfassen
  darf, nennt nur noch den Grund, nichts zu tun.
  → *Prompt:* „Zurücktreten heißt **nicht handeln**, nie **nicht wissen**. Lesen kollidiert mit
  nichts.“

- **Die Pflicht wächst schneller, als du sie erfüllen kannst.** Verlangt eine Prüfung „alles seit
  dem letzten Mal", wird sie unerfüllbar. Gilt ein Veto der **Datei** statt dem Befund, wächst der
  Rückstand beim Abtragen: Wer ihn behebt, fasst die Datei an und schuldet neu.
  → *Prompt:* „Binde jede Prüfpflicht an den **einzelnen Beitrag**, nie an einen offenen Zeitraum,
  und buch ein Veto gegen den **Befund**: trenne **gelesen** von bloß berührt, quittiere eine
  Reparaturkette am **Endzustand** als einen Beitrag, mach neue Befunde derselben Datei zum
  eigenen Ticket. Eine Verweigerung nennt ihren **Grund**, nie ihren Bestand; sieht eine Pflicht
  unerfüllbar aus, prüf zuerst dein **Messgerät**."

- **Zwei Prüfungen, die einander widersprechen — Gehorsam sieht aus wie ein Verstoß.** Die eine verlangt,
  freie Kapazität zu nutzen; die andere duldet keine Änderung, während sie läuft. Wer der ersten folgt,
  bricht die zweite: Die Arbeit wird verworfen, obwohl genau das Verlangte getan wurde.
  → *Prompt:* „Jede Prüfung, die eine Handlung **fordert**, muss die Fenster kennen, in denen
  eine andere sie **verbietet**. Wer etwas verbietet, sagt selbst, **wann es wieder erlaubt**
  ist — nie versteckt im Quelltext eines dritten Werkzeugs. Prüffrage: Gibt es einen einzigen
  Zug, der **beide** Auflagen erfüllt? Wenn nicht, ist nicht die Sitzung schuld."

- **Die Warnung stand dreimal da und feuerte nie — sie lag unter der falschen Überschrift.**
  Derselbe Fehler zum dritten Mal, obwohl als Absatz, Fallstrick und gemessene Regel notiert:
  abgelegt unter seinem **Thema**, gebraucht dort, wo die widersprechende Aufforderung ankam —
  im Wortlaut des Wächters, der zur Vorarbeit drängt.
  → *Prompt:* „Schreib die Ausnahme in den Text **dessen, der auffordert**, nicht ins thematisch
  passende Kapitel. An welcher **Stelle im Ablauf** wird eine Regel gelesen — und steht sie dort?
  Eine überlesene Regel ist nicht zu schwach formuliert, sondern falsch abgelegt."

- **Die Anweisung hebt ihre eigene Voraussetzung auf.** Ein Ablauf verlangt, erst eine Markierung
  zu setzen und sie dann zu veröffentlichen — doch Veröffentlichen zählt als Arbeit, und Arbeit
  löscht die Markierung. Dieselbe Falle als Sperre: Ihr Notausgang musste eine Datei schreiben —
  genau das untersagte sie.
  → *Prompt:* „Spiel jede neue Durchsetzung als **wörtlichen Gehorsam** durch und probier ihren
  Notausgang **unter** der Sperre. Zerstört die Folge ihre Voraussetzung, oder setzt der Ausweg
  eine Fähigkeit voraus, die die Sperre entzieht? Nimmt deine **Ausnahme** nur die **Prüfung**
  aus oder auch ihre **Abhilfe**?"

- **Der Rückfall rettet die Funktion und setzt still eine Vereinbarung aus.** Fällt der zweite
  Anbieter aus — oder fehlt die Datei, die deine Regel einstellt —, verhält sich jedes Werkzeug
  einzeln korrekt. Zusammen schieben sie die ganze Last auf den Anbieter, von dem du sie weg
  verteilt hattest; sichtbar nur an dessen Verbrauchsanzeige.
  → *Prompt:* „Ein Rückfall meldet, **welche Zusage er aussetzt**. Vergleiche **Regel gegen Ist**,
  nicht Ist gegen Plausibilität. Prüffrage: Welche Vereinbarung bricht er still?"

- **Die lange Messung hing am Leben der Sitzung, die sie bestellt hat.** Endet das Fenster, das
  einen langen Prüflauf startete, stirbt er mitten drin — und zwar **wie ein Fehlschlag**:
  Abbruchcode gesetzt, Fehlerliste leer, Protokoll mitten im Satz zu Ende.
  → *Prompt:* „Was **länger dauert als ein Zug**, startest du **abgekoppelt** — im **Werkzeug**,
  nicht als Merkregel. Ein Lauf ohne Schlussurteil, der **keinen** Fehlschlag nennt, heißt
  *abgebrochen*, nicht *rot*. Prüffrage: Wessen Tod nimmt diesen Lauf mit?"

- **Die Schranke aus zwei Hälften, von denen nur eine ein Polster bekam.** Dieselbe Messung,
  zwei Kriterien: eins ließ vier von neunzig durchgehen, das andere färbte bei einem rot.
  → *Prompt:* „Legt eine Prüfung mehrere Kriterien an denselben Messwert, schreib zu **jedem**
  auf, was es durchgehen lässt. Prüffrage: Steht eins ohne Toleranz neben einem mit?"

- **Das Protokoll ohne Verfallsdatum wird zum Dauerplakat.** Was dein Werkzeug über die eigene
  Entscheidung aufschreibt, nimmt niemand je wieder heraus.
  → *Prompt:* „Eine Entscheidung, die du selbst triffst, nennt die **Messung**, die sie stützen
  oder widerlegen würde, und **verfällt**, sobald diese Messung sauber vorliegt."

- **Das Werkzeug zerreißt seinen eigenen Prüflauf.** Warten ist teuer, also füllt es die
  Wartezeit — und wechselt dabei den Zweig, legt einen Arbeitsbaum an oder committet. Der Lauf
  meldet Rot, obwohl jeder einzelne Test grün war, und du suchst den Fehler im Code.
  → *Prompt:* „Solange eine Prüfung läuft, ist das Projekt **fremdes Gebiet**: Vorarbeit dieser
  Zeit ist **Lesearbeit**, keine Repository-Operation. Und bevor du ein Rot untersuchst, sag mir
  **wer den roten Zustand erzeugt hat** — der Code oder der Lauf selbst. Eine Prüfung, die
  erlaubte **Nebenläufigkeit** nicht vom Verstoß trennen kann, **meldet** statt abzubrechen."

- **Die Regel sagt, WER es tun soll — und niemand zählt, ob es je übergeben wurde.** Du legst
  fest, welche Arbeit an einen Helfer geht. Die Regel greift, jeder Bericht ist grün, und die
  Arbeit macht das Werkzeug trotzdem selbst — weil zwischen Zuteilung und Ausführung nie ein
  Aufruf steht. Nachetikettieren verbessert nur die Zahl im Bericht.
  → *Prompt:* „Zähle nicht, wie viel du ZUGETEILT hast, sondern wie oft die Übergabe wirklich
  stattfand — belege es an der Spur des Beauftragten, nicht an deiner eigenen Tabelle."

- **Die gemessene Dauer von damals tötet den gesunden Lauf von heute.** Die Prüfung wächst weiter,
  ihre hinterlegte Erwartung nicht — und das Werkzeug erklärt einen rechnenden Lauf für hängend.
  → *Prompt:* „‚Hängt, abbrechen‘ darf nie allein auf einer hinterlegten Dauer stehen: Solange der
  Prozess **rechnet** und sein Protokoll **wächst**, hängt er nicht."

- **Die Schranke verlangt genau das, was gerade entsteht.** Sie lässt nicht aufhören, solange
  ein Nachweis fehlt — und der Nachweis ist der Lauf, der noch zwei Stunden braucht.
  Verweigerung und eigene Abhilfe laufen gegeneinander.
  → *Prompt:* „Eine Schranke, die einen Nachweis fordert, muss ‚wird gerade erstellt' als
  eigenen Zustand **durchlassen** — sonst verbietet sie ihre eigene Erfüllung. Verweigert sie
  trotz nachweislich gelungener Reparatur, **miss dein Arbeitsverzeichnis und bau ihren
  Aufruf nach**: Sie urteilt über die Wurzel, aus der sie läuft."

- **Ein Rot, das bei gleichem Code kommt und geht, ist ein Befund über deine MESSUNG.** Eine
  Stichprobe aus einem langen Vorgang trifft den Defekt mal und verfehlt ihn mal.
  → *Prompt:* „Repariere dann die Prüfung, nicht das Programm: ganzen Vorgang lesen, je Vorkommen zählen, **Abdeckung als eigene Prüfung** behaupten."

- **Die schmale Stufe ist grün, die große rot — an derselben Prüfung.** Dann kauft die Leiter
  falsche Sicherheit statt Zeit: Sie lief vor einem **Merge** und wurde nie wiederholt, oder sie
  misst ein anderes Fenster als die volle Suite.
  → *Prompt:* „‚Grün' zählt nur, wenn die schmale Stufe **jünger als der letzte Merge** ist und
  **dasselbe misst** wie die große — sonst sagt sie selbst, dass ihr Grün nichts vorhersagt."

- **Zwei Aufgaben in eine gepackt, um einen teuren Lauf zu sparen.** Die fertige Hälfte wartet
  dann auf die rote, weil eine Aufgabe nur ganz fertig wird — gespart hat das nichts.
  → *Prompt:* „Bündle nur, wenn beide Hälften **plausibel im selben Lauf** grün werden; bleibt
  eine wiederholt rot, **trenne sie wieder** und liefere die fertige aus."

---

## Drei Meta-Regeln, die alles zusammenhalten

1. **Root-Cause vor Fix.** Ursachennotizen ohne Ausrede sind der Rohstoff guter Mechanismen;
   eine im Ticket **vermutete** Ursache ist gefährlicher Rohstoff: Der Ausführende sucht dann
   ihre Bestätigung.
   > *Prompt:* „Bevor du Wiederkehrendes reparierst: schreib mir in 3–5 Sätzen die
   > **mechanische** Ursache — welche Annahme brach? Eine schon notierte Ursache ist ein
   > **Kandidat**: Markiere sie und schreib vorab, welcher Befund sie zur Tatsache macht.
   > Versuche zuerst, sie unabhängig zu widerlegen. Hält sie stand, darf sie wahr sein.
   > Wer den Auftrag vergibt, misst **blind mit**."

2. **Nutzer-Artefakte sind Verträge.** Was du festgelegt hast, wird nicht eigenmächtig umgebaut.
   > *Prompt:* „Struktur von Dingen, die ich festgelegt habe, friert ein. Schlag
   > Änderungen vor, setz sie nicht ungefragt um."

3. **Parallel arbeiten geht nur mit Isolierung.** Die Grenze setzt der **Haupt-Agent**: bei ihm
   endet jeder Strang, und je mehr Fremdstoff sein Kontext aufnimmt, desto schlechter urteilt er.
   > *Prompt:* „Arbeite jede Aufgabe auf eigenem Feature-Branch mit eigener Arbeitskopie — auch
   > ein nur lesender Helfer —, führe sie erst verifiziert nach `main`, teile parallele Aufgaben
   > ohne gemeinsame Dateien und arbeite an höchstens **drei** gleichzeitig."
   > *(Aufschlag ≈ 10–25 % je Strang, geschätzt — Nacharbeit + Aufsicht)*


---

## Der kürzeste mögliche Start

> „Erarbeite mit mir zuerst ein `design.md` als einzige Wahrheit — frag mich dafür gründlich
> aus —, dann leg ein `TASKS.md` an und richte die zwei Testschichten ein. Nach jeder
> Änderung: Build/Lint/Audit sauber, ein Test auf der passenden Schicht, ein atomarer Commit.
> Beurteile Sichtbares am Screenshot. Wenn wir eine Regel festlegen, bau sofort den Check, der
> sie erzwingt — halte Prozessarbeit aber unter einem festen Budget. Bei Kritischem hol ein
> zweites Modell als Gegenprüfer. Frag nach, wenn das Zielbild unklar ist — rate nicht."

Sie ersetzt die Fallstricke oben nicht.

<!-- GUIDE-FINGERPRINT: 8540fe3edf9706379a2b7d6f718e70a0d247374d1fb53ce7c2f956c2d7ee40a0 -->
