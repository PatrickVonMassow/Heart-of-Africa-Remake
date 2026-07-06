# Das Herz von Afrika — Neuumsetzung: Design

Dieses Dokument beschreibt den Sollzustand einer modernen Indie-Neuumsetzung. Grundlage ist die Spielmechanik des Originals (siehe „Das Herz von Afrika — Vollständige Spielmechanik"); dieses Dokument übernimmt deren Systeme und legt die für die Neuumsetzung entschiedenen Punkte fest.

---

## 1. Technische Rahmenarchitektur

- Umsetzung als Web-Anwendung mit Three.js unter React Three Fiber.
- Zwei Darstellungsmodi (§2): 3D-Vogelperspektive für die Reise durch Afrika, Ich-Perspektive innerhalb von Orten.

---

## 2. Perspektiven und Kamera

**Vogelperspektive (Reise durch Afrika).**
Die Navigation über den Kontinent funktioniert wie im Original aus der Vogelperspektive, die Umgebung wird jedoch als 3D-Grafik dargestellt (Gelände, Flüsse, Vegetation, Landmarken). Die Kamera folgt der Spielfigur von oben. Sichtbar ist ein Ausschnitt der Karte — der Sichtbereich der Spielfigur, also die Umgebung rund um die aktuelle Position innerhalb Afrikas.

**Ich-Perspektive (Orte).**
Beim Betreten eines Dorfes oder einer Hafenstadt wechselt das Spiel in die Ich-Perspektive. Der Ort ist begehbar: man läuft durch den Ort und zu den Gebäuden, kauft und verkauft dort Waren (§9) und hält im Dorf Audienz beim Oberhaupt (§12).

**Wechsel.**
Verlässt man den Ort, wechselt das Spiel zurück in die Vogelperspektive mit dem Sichtbereich rund um die aktuelle Position.

**Grafik und Atmosphäre.**
Dörfer und ihre Bewohner sind typisch für die jeweilige Region gestaltet (Bauweise, Kleidung, Vegetation entsprechend Wüste, Savanne, Dschungel, Hochland, Seen/Rift). Hafenstädte wirken wohlhabender (feste, größere Bauten, geschäftiges Treiben), Dörfer naturnäher (einfache, regionaltypische Behausungen). Die Darstellung erzeugt je Ort und Region eine entsprechende Atmosphäre.

---

## 3. Weltmodell und Karte

- Fester Kontinent Afrika: Die geografische Lage aller Landschaftselemente (Küsten, Flüsse, Dschungel, Gebirge, Seen, Landmarken, Ortslagen) steht fest. Das konkrete Aussehen der Landschaft sowie das Aussehen der Dörfer samt Verteilung der Hütten werden jedoch in jedem Spieldurchlauf prozedural festgelegt (§18). Zusätzlich werden bewegliche Ziele (Grab, vergrabene Schätze) je Partie neu platziert.
- Die Welt gibt Afrika geografisch authentisch so wieder, wie es im Jahr 1890 war. Die real existierenden Landmarken aus §4.4 liegen an ihren korrekten geografischen Positionen.
- Fünf Regionen mit eigener Landschaft, eigenen Völkern und eigenem Wertprofil: Norden (Wüste/Sahara), Westen (Savanne), Zentral (Dschungel/Kongobecken), Osten (Gebirge/Seen/Rift), Süden (Hochplateau).
- Geländetypen: Ozean, Küste, Wüste, Savanne/offenes Land, Dschungel/Grasland, Gebirge, Wasser (Fluss/See).
- Koordinatensystem: Standort in Grad, angezeigt als „Breite … Grad Nord/Süd" und „Länge … Grad West/Ost". Dieses System ist zugleich Grundlage der Hinweise (§13).

---

## 4. Orte

### 4.1 Hafenstädte (10)
Nachschub, Handel, Fähren, Entdeckungsprämien; automatisches Speichern (Checkpoint).
Kairo (Nordostecke; stets die Startstadt), Tanger (Nordwestküste), Khartum (Nordost-Binnenland), St. Louis (Westküste), Timbuktu (West-Binnenland), Lagos (Golf von Guinea), Boma (Kongomündung), Berbera (Horn von Afrika), Sansibar (Ostküste), Kapstadt (Südspitze).

### 4.2 Völker (22)
Träger der Hinweise und des Regionalhandels. Regionszuordnung siehe §4.5.
Masai, Bantu, Zulu, Buschmänner, Batwa, Lunda, Pygmäen, Suaheli, Somali, Hausa, Mongo, Sidamo, Banda, Nubier, Tuareg, Berber, Bombara, Mandingo, Bemba, Bambundu, Uganda, Fang.

### 4.3 Flüsse (17)
Grundlage der Richtungs-/Ortshinweise (Mündung/Quelle); mit Kanu befahrbar.
Blauer Nil, Nil, Weißer Nil, Djuba, Ruvuma, Sambesi, Limpopo, Vaal, Oranje, Sankuru, Kasai, Ubangi, Kongo, Benue, Volta, Niger, Senegal. Jeder Fluss hat je einen benannten Mündungs- und Quellort.

### 4.4 Landmarken
Seen (Tschadsee, Tanasee, Albertsee, Edwardsee, Viktoriasee, Rudolfsee, Tanganjikasee, Nyasasee), Berge (Toubkal, Emi Koussi, Kilimandscharo, Kenia, Elgon u. a.), Wasserfälle (Stanley-, Livingstone-, Kabalega-, Victoria-, Augrabies-Fälle). Sonderort: Elefantenfriedhof (wertvolles Elfenbein).

### 4.5 Regionszuordnung
| Region | Landschaft | Völker |
|---|---|---|
| Norden | Wüste/Sahara | Tuareg, Berber, Nubier, Bombara |
| Westen | Savanne | Hausa, Mandingo, Fang |
| Zentral | Dschungel/Kongobecken | Mongo, Pygmäen, Banda, Bambundu, Lunda |
| Osten | Gebirge/Seen/Rift | Masai, Suaheli, Somali, Sidamo, Uganda |
| Süden | Hochplateau | Batwa, Bemba, Bantu, Zulu, Buschmänner |

---

## 5. Zeit und Kalender

- Monate (Anzeige, ausgeschrieben): Januar bis Dezember, mit Jahreszahl (Start 1890).
- Zeit schreitet durch Reise und Aktionen voran; große Distanzen und schwieriges Gelände kosten mehr Zeit.
- Mehrjährige Frist, kommuniziert über gestufte Meldungen: Fortschritt/Belohnung bei Entdeckung, erste Warnung, zweite Warnung, Fristablauf (Niederlage).

---

## 6. Ressourcen und Zustände

- Währung: \$ (Zahlungsmittel in den Hafenstädten). Startkapital 250 \$. Verwendung: Ausrüstung, Proviant, Fähren, Gaben; Einnahmen durch Verkauf und Entdeckungsprämien.
- Proviant (Essen): Verbrauch pro Zeitschritt; nachkaufbar.
- Wasser: die Feldflasche ist stets gefüllt und schützt in der Wüste vor Dehydration.
- Gaben: Tauschgüter für Oberhäupter; erzeugen Wohlwollen und schalten Hinweise frei. Zugleich Zahlungsmittel in den einheimischen Dörfern (dort gilt kein Geld).
- „In der Hand" gehaltenes Objekt: zentrale Interaktionsvariable für Geländebeweglichkeit (§11), Verhalten der Einheimischen (§12) und Schatzfund.

Störzustände (verändern Steuerung/Sicht, können tödlich sein): Fieber/Krankheit (v. a. Feuchtgebiete) → zeitweise unkontrollierte Steuerung; Dehydration (Wüste ohne Wasser) → Drift, mit gefüllter Feldflasche vermeidbar; Sonnenblindheit (Wüste) → eingeschränkte Sicht, kann tödlich enden — die Feldflasche hilft dagegen nicht, Erholung nur außerhalb der Wüste; Wunden (Tiere/Überfälle). Fieber und Wunden heilt Medizin. Verlust der Expedition → Nachfolger.

**Lager (Zwischenlager).**
Inventar-Zwischenlager entlasten das begrenzte Inventar und erlauben es, etwa das Kanu zurückzulassen, wenn man sich von Gewässern entfernt (an Land verursacht es einen Tempo-Malus, §7, §11).

Freies Lager: In der Vogelperspektive lässt sich überall im Freien ein Lager aufschlagen, in dem beliebig viele Inventargegenstände abgelegt werden. Es wird auf der Karte mit einem X markiert. Ein solches Lager kann jedoch geplündert werden; die abgelegten Gegenstände sind dort nicht sicher.

Dorf-Lager: Ist man in einem einheimischen Dorf „Geehrter Freund" (§12), kann man dort jederzeit beliebig viele Inventargegenstände einlagern; sie verschwinden nie. Verscherzt man es sich jedoch in dieser Region durch einen Raubüberfall (§12), sind die dort eingelagerten Gegenstände unwiederbringlich verloren.

---

## 7. Ausrüstung und Wirkungen

| Item | Wirkung |
|---|---|
| Seil | Aufstieg im Gebirge; ohne Seil kein Bergpass |
| Machete | Durchquerung von Dschungel/dichtem Grasland; bietet auch Schutz vor Tierangriffen, jedoch schwächer als das Gewehr |
| Schaufel | Ausgraben von Schätzen und Grab an markierten Fundpunkten |
| Gewehr | Jagd und Verteidigung; bietet den stärksten Schutz bei Tierangriffen an Land — stärker als die Machete (§14). In der Hand getragen lässt es Dorfbewohner fliehen und ermöglicht Raubüberfälle in Hütten — mit dauerhaftem Reputationsverlust im Ort (§12) |
| Medizin | Heilung von Fieber/Krankheit |
| Gaben | Tauschgüter für Oberhäupter (Wohlwollen, Hinweise) |
| Feldflasche | stets voll; schützt in der Wüste vor Dehydration (nicht vor Sonnenblindheit) |
| Karte | Orientierungshilfe |
| Kanu | schnelle Reise auf Flüssen/Seen; an Land getragen = Tempo-Malus |

Kernregel: Das gehaltene Objekt entscheidet zugleich über Geländebeweglichkeit, Reaktion der Einheimischen und Schatzfund. Handelt es sich um eine Waffe (Gewehr oder Machete), erhöht das Halten in der Hand zusätzlich den Schutz vor Angriffen wilder Tiere, wobei ein Gewehr stärker schützt als eine Machete (§14).

---

## 8. Wertgegenstände und Kultur-/Wertmatrix

Schatzfunde/Wertgegenstände: Gold, Elfenbein, Silber, Kupfer, Smaragd, Statue.

Grundprinzip: Der Wert eines Gegenstands ist regions-/kulturabhängig. Was eine Region verehrt, bringt dort viel; was sie ablehnt, wird nicht gekauft oder erzeugt Feindseligkeit. Das erzwingt kontinentweiten Arbitragehandel.

| Region | hoher Wert / verehrt | abgelehnt / gefährlich |
|---|---|---|
| Norden | Gold, Smaragde | Silber |
| Westen | Elfenbein | Smaragd |
| Zentral | Silber | Gold |
| Süden | Kupfer, Smaragde | Elfenbein |
| Osten | Smaragde | Kupfer |

Ein sichtbar getragener Wertgegenstand löst je nach Region eine positive oder negative Reaktion aus.

---

## 9. Gebäudetypen und Funktionen

In Dörfern und Hafenstädten gibt es verschiedene Gebäudetypen. In der Ich-Perspektive sind sie begehbar.

| Gebäude | Funktion |
|---|---|
| Laden | Verkauf von Medizin, Gaben, Karte |
| Reisebüro | Fahrkartenverkauf: Reise zu einer anderen Hafenstadt |
| Basar | An- und Verkauf von Schatzfunden |
| Waffenhütte | Verkauf von Gewehr, Machete |
| Geräte-Hütte | Verkauf von Schaufel, Seil, Feldflasche |
| Markthütte | Verkauf von Kanu, Essen |
| Chefhütte | nur im Dorf: Audienz mit dem Oberhaupt zur Einholung von Hinweisen |

---

## 10. Handel und Ökonomie

- Orte des Handels: siehe §9.
- Zahlungsmittel: In Hafenstädten wird mit Geld gehandelt, in einheimischen Dörfern mit Gaben (Tauschgütern).
- Basar (Schatzfunde): Ware anbieten → Kaufmann nennt ein Gebot → annehmen oder ablehnen. Passt der Gegenstand nicht ins regionale Wertprofil, wird er abgelehnt.
- Preislogik: Basispreis je Ware; Schatzfunde zusätzlich mit regionalem Faktor und An-/Verkaufsspanne. Der Gewinn entsteht aus regionaler Arbitrage.
- Fähren (Reisebüro): Reise zwischen Häfen gegen Gebühr; spart Zeit gegenüber der Landreise.
- Entdeckungsprämie: Für gemeldete Entdeckungen (neue Dörfer, Landmarken) wird Geld überwiesen; Gutschrift beim nächsten Hafenbesuch.

---

## 11. Gelände und Bewegung

| Gelände | Handobjekt | Ohne / Mit |
|---|---|---|
| Wüste | Feldflasche | ohne: Dehydration (Drift), Tempoverlust; mit gefüllter Feldflasche: keine Dehydration. Sonnenblindheit droht unabhängig davon; die Feldflasche hilft dagegen nicht |
| Dschungel | Machete | ohne: nahezu unpassierbar; mit: durchquerbar |
| Gebirge | Seil | ohne: kein Aufstieg/Absturzrisiko; mit: begehbar |
| Fluss/See | Kanu | mit: schnelle Wasserreise; an Land: Tempo-Malus |
| Savanne/offen | Gewehr (außerhalb Dörfer) | ohne: höheres Überfallrisiko |
| Grabungspunkt | Schaufel | ohne: kein Fund; mit: ausgraben |

**Bewegungsgrenze.**
Die Bewegung ist auf den Kontinent und seine Binnengewässer (Flüsse, Seen) beschränkt. Der umgebende Ozean ist nicht befahrbar; der Kontinent kann nicht verlassen werden.

**Wasser, Strömung und Wasserfälle.**
Gewässer weisen eine Strömung auf, die im direkten Umfeld von Wasserfällen (§4.4) besonders stark ist. Mit der Strömung bewegt man sich schneller, gegen die Strömung langsamer. Dort besteht das Risiko, hinuntergerissen zu werden — mit Verletzungen und dem Verlust eines Großteils der Inventargegenstände.

Man kann sich auch ohne Kanu im Wasser fortbewegen, ist dann jedoch langsamer und anfälliger für die Strömung. Zusätzlich besteht das Risiko, von einem Krokodil angegriffen und verletzt oder gefressen zu werden. Ohne Kanu wird das Gewehr im Wasser nass und hilft dann nicht; nur eine Machete senkt das Risiko. Im Kanu bleibt das Gewehr trocken und wirkt wie gewohnt.

Bewegung in der Vogelperspektive; das Gelände wird als 3D dargestellt, die Steuerung bleibt Draufsicht-orientiert.

---

## 12. Audienz beim Oberhaupt

Der Zugang zu Hinweisen führt über Oberhäupter, in der Chefhütte eines Dorfes (Ich-Perspektive). Ablauf:
1. Dorf betreten (nicht mit sichtbarem Gewehr — sonst Flucht/Blockade).
2. Chefhütte aufsuchen, Audienz.
3. Kulturell passende Gabe überreichen → Wohlwollen.
4. Bei ausreichendem Wohlwollen: Hinweis auf Grab/Schatz (in die Chronik, §15).
5. Falsches Verhalten: Feindseligkeit, Vertreibung.

**Geehrter Freund.**
Erfüllt man ein Oberhaupt wiederholt korrekt, verleiht es den Status „Geehrter Freund". Dieser gilt für alle Dörfer der jeweiligen Region (Norden, Westen, Zentral, Süden, Osten). Wie jedes Ereignis wird die Verleihung über das Tagebuch mitgeteilt: Es öffnet sich ein neuer Eintrag, in dem das Oberhaupt zusichert, dass seine Einwohner den Reisenden von nun an beschützen. Begeht man einen Raubüberfall, geht dieser Status unwiederbringlich verloren.

Wirkung: In der unmittelbaren Umgebung der einheimischen Dörfer der Region beschützen die Einheimischen den Reisenden vor Angriffen von Tieren und Räubern (§14); er kann dann höchstens leicht verletzt werden. Ist man kurz vorm Sterben, eilen Einwohner mit Nahrung, Wasser oder Medizin herbei. Zudem erhält man in den Dörfern der Region stets kostenlos Nahrung, Wasser und Medizin. Jedes solche Ereignis wird per Tagebucheintrag mitgeteilt. Meist erscheint ein Eintrag wie „Ich wurde von Löwen angegriffen. Eine Gruppe von Einwohnern der … ist mir sofort zu Hilfe geeilt und hat mich vor dem Angriff gerettet. Ich wurde nur leicht verletzt."

**Raubüberfall und Reputation.**
Nimmt man in einer Hütte das Gewehr in die Hand, lassen sich Waren rauben und in beliebiger Menge mitnehmen. Das verfeindet alle Dörfer der Region dauerhaft: Danach ist keine Hütte der Region mehr betretbar, und es gibt keine Hinweise mehr von den Oberhäuptern. Außerdem geht durch einen Raubüberfall der Status „Geehrter Freund" unwiederbringlich verloren — samt der Schutzwirkung.

---

## 13. Sprach- und Hinweissystem

Kernrätsel des Spiels: Aus Richtungs- und Ortsangaben der Einheimischen die Fundposition bestimmen. Das Verstehen der Sprache ist Teil des Spiels.

### 13.1 Hinweiskonstruktion
Hinweise verbinden Landmarke + Richtung + Koordinaten, z. B. „Gebiet um [Ort]", „[Fluss]-Mündung"/„[Fluss]-Quelle", kombiniert mit Nord/Süd/Ost/West und „Breite/Länge … Grad". Als Bezugspunkte dienen nicht nur Flüsse, sondern auch Seen, Berge und Wasserfälle. Landmarken sind Flüsse, Städte, Völker, Seen, Berge und Wasserfälle.

### 13.2 Regionale Richtungssysteme
Jede Region drückt Richtungen anders aus; der Spieler muss das jeweilige System erschließen:
- Norden: Richtung relativ zum Windursprung; „Nivera" = Norden.
- Westen: „koko" = Nord, „Katula" = Ost, „Phuthswama" = Süd, „Mimbumi" = West.
- Zentral: Richtungen relativ zu „Utomba".
- Süden: Jahreszeiten als Richtungen — Sommer = Nord, Winter = Süd, Frühling = Ost, Herbst = West.
- Osten: relativ zu „Odabi"; „Relolo" = Nord, „Dethamee" = Süd.

Glossar (Landmarken in lokaler Sprache): El Mora Levimara / Mongdamara (Kongo), Lastwana (Sambesi), Gumba lu Untoba (Victoria-Fälle), Unumpara (Kilimandscharo), Galumba / Ut-hu Manbwama (Elefanten), Oz Oz / Oink Oink / Auke Auke (unspezifisches Wissen).

### 13.3 Kaskade und Zeitlimit
Pro Region verrät typischerweise ein Volk den regionalen Fundort-Hinweis; die übrigen liefern nur unspezifisches Wissen. Mehrere Hinweise werden zur genauen Grabposition trianguliert.

---

## 14. Zufallsereignisse

Verdeckte Auslösung pro Zeitschritt/Region/Zustand:
- Angriffe wilder Tiere (Löwen, Leoparden und Schlangen): Ein Angriff kann verletzen oder töten. Bei Leoparden ist das Risiko schwerer Verletzungen oder gefressen zu werden geringer als bei Löwen. Das Mitführen eines Gewehrs oder einer Machete senkt das Risiko — ein Gewehr stärker als eine Machete; hält man die Waffe zusätzlich in der Hand, sinkt das Risiko weiter. Die Chronik meldet den Ausgang in Sätzen der Art „Ich wurde von Löwen angegriffen.", „Ich entkam.", „Ich benutzte das Gewehr." oder „Ich wurde leicht verletzt.".
- Angriffe durch Räuber: können verletzen und Inventargegenstände entwenden. Wie bei Tierangriffen senkt eine Machete das Risiko, ein Gewehr stärker.
- Schutz durch „Geehrter Freund": In der Umgebung der Dörfer einer Region, in der man diesen Status besitzt, eilen die Einheimischen bei Tier- und Räuberangriffen zu Hilfe; man kann dann höchstens leicht verletzt werden (§12).
- Krokodilangriffe im Wasser: Bewegt man sich durch Gewässer, kann ein Krokodil angreifen und verletzen oder fressen. Ohne Kanu wird das Gewehr nass und hilft nicht — dann senkt nur eine Machete das Risiko; im Kanu wirkt das Gewehr normal (§11).
- Strömung an Wasserfällen: In der Nähe von Wasserfällen kann die starke Strömung die Figur hinunterreißen — mit Verletzungen und dem Verlust eines Großteils der Inventargegenstände (§11).
- Krankheit/Fieber (klima-/regionsabhängig) → Störzustand (§6).
- Fieberdelirium → zeitweise unkontrollierte Steuerung.
- Wüstengefahren: Dehydration (mit gefüllter Feldflasche vermeidbar) und Sonnenblindheit (Erholung nur außerhalb der Wüste, §6).
- Wetter (z. B. Sandsturm mit Sichtverlust).
- Fund von Verstecken/Lagern/Überresten.

Item-Hilfe: Bei Ereignissen hilft das passende Ausrüstungsstück, insbesondere das in der Hand gehaltene — Gewehr oder Machete senken das Risiko bei Tier- und Räuberangriffen an Land (ein Gewehr stärker als eine Machete; in der Hand stärker als nur mitgeführt); gegen Krokodile im Wasser hilft die Machete stets, ein Gewehr nur im Kanu (ohne Kanu wird es nass und wirkt nicht); Gewehr schreckt Diebe ab; Medizin heilt Wunden und Fieber; die Feldflasche schützt vor Dehydration (nicht vor Sonnenblindheit).

Konkrete Wahrscheinlichkeiten werden für die Balance frei kalibriert.

---

## 15. Chronik / Tagebuch

Automatisch mitwachsende, deutschsprachige Erzählchronik der Reise. Funktionen: Stimmungsträger und Speicher der eingeholten Hinweise. Einträge entstehen aus Vorlagen mit eingesetzten Orten/Richtungen und aus Ereignissen.

**Tonalität und Immersion.**
Das Tagebuch ist das zentrale Mittel zur Erzeugung von Immersion: Viele Ereignisse sieht man nicht, sondern erfährt sie nur als Text — vergleichbar mit dem Lesen eines Romans. Die Einträge sind daher stets mitreißend formuliert und drücken je nach Situation Faszination über Neues, Dramatik, Unverständnis, Bedenken, Hoffnung u. Ä. aus. Bereits die Textbausteine, aus denen die Einträge zusammengesetzt werden, müssen entsprechend mitreißend geschrieben sein.

**Betreten einer neuen Region.**
Betritt man zum ersten Mal eine neue Region, öffnet sich das Tagebuch, verkündet die Region und zeigt einen Eintrag, der die Faszination des Reisenden über diese Region und ihre Eigenarten beschreibt.

**Tod der Figur.**
Stirbt die Figur, kann sie keinen Tagebucheintrag mehr verfassen. Statt eines Eintrags erscheint dann ein Bericht, dass die Überreste des Forschers gefunden wurden — ein schauderhafter Anblick, der auf die Todesursache schließen lässt (etwa, dass er von Löwen gefressen wurde).

---

## 16. Darstellung von Ereignissen

Ereignisse (Tier- und Räuberangriffe, Hinweise der Oberhäupter, Statusänderungen u. a., §14) werden nicht als eigene Szene explizit dargestellt. Der Spieler erfährt von ihnen dadurch, dass sich das Tagebuch automatisch öffnet und ein neuer Eintrag hinzukommt.

Der Eintrag erscheint nicht als fertiger Text, sondern wird sichtbar von einer Hand in Handschrift hineingeschrieben.

Ist die Figur verletzt, sind der schreibenden Hand die Verletzungen anzusehen, und zwar in erkennbarer Schwere: Bei einer schweren Verletzung ist die Hand blutig, bei leichteren Verletzungen entsprechend weniger gezeichnet. Beispiel: Der Eintrag „Ich wurde von Löwen angegriffen und schwer verletzt." wird von einer blutigen Hand geschrieben. Ein von einer blutigen Hand geschriebener Eintrag enthält entsprechend Blutspuren.

Kann die Figur nicht mehr schreiben (Tod), entfällt der handschriftliche Eintrag; stattdessen erscheint der Bericht über die gefundenen Überreste (§15).

---

## 17. Benutzeroberfläche

- Vogelperspektive: Sichtbereich der Umgebung; Statusleiste mit Datum, Kasse, Proviant, Gaben, Handobjekt; Anzeige der aktuellen Region; Koordinatenanzeige. Zugriff auf Chronik und Objekte (Item in die Hand nehmen, Karte betrachten, Medizin einnehmen). Weitere Funktionen: Standortabfrage, Gesundheitsabfrage, Lager anlegen (§6) sowie eine Erkundungsübersicht, die zeigt, wie weit die aktuelle Region bereits erkundet ist.
- Ich-Perspektive (Orte): begehbarer Raum, Interaktionsaufforderungen an Gebäuden/Personen, Handels- und Dialogfenster. Eine Gabe an einen Einheimischen liefert zudem eine Orientierung über die Gebäude des Ortes, wobei die wichtigen, betretbaren Gebäude hervorgehoben werden.
- Bedienung maus-/tastatur- und gamepad-tauglich.

---

## 18. Sieg/Niederlage, prozedurale Platzierung, Speichern

- Sieg: das prozedural platzierte Grab rechtzeitig finden und bergen.
- Niederlage: Fristablauf oder Verlust der Expedition (→ Nachfolger).
- Prozedural je Partie: Position von Grab und Caches, das konkrete Aussehen der Landschaft sowie das Aussehen der Dörfer samt Verteilung der Hütten. Die geografische Lage der Landschaftselemente (Dschungel, Gebirge, Flüsse usw.) bleibt fest. Sonderfundorte: Elefantenfriedhof, Lager/Verstecke.
- Speichern: automatisch beim Besuch einer Hafenstadt. Die Hafenstädte fungieren als Checkpoints; manuelles Speichern entfällt.
- Laden: Beim Laden erscheint eine Übersicht aller Hafenstadt-Besuche als Tabelle mit je einer Zeile pro Besuch. Angezeigt werden Hafenstadt, Datum (im Spiel), Geld, Nahrung, Gaben und Gesundheitszustand; daraus wählt der Spieler den Stand, ab dem fortgesetzt wird.

| Hafenstadt | Datum | Geld | Nahrung | Gaben | Gesundheitszustand |
|---|---|---|---|---|---|
| Kairo | 3. Jan. 1890 | 250 \$ | 5 Wochen | 2 | gesund |

---

## 19. Atmosphäre und Immersion

Ergänzende Elemente, die das Afrika-Gefühl verstärken, überwiegend ohne neue Mechanik.

- Regionale Geräuschkulisse und dynamische Musik: eigene Klanglandschaften je Region (Savannen-Insekten und Weite, Dschungel mit Vögeln und Affen, Wüstenwind, Trommeln in Dorfnähe). Wechselt beim Regionsübergang und beim Perspektivwechsel.
- Lebende Tierwelt als Kulisse: nicht bedrohliche Tiere im Sichtbereich (Elefanten- und Huftierherden, Giraffen, Zebras, Flamingos an den Seen). Rein visuell, verankert Ort und Region. Die Tiere interagieren auch untereinander (etwa ein Löwe, der ein Zebra reißt) — als ambiente Szenerie ohne Einfluss auf den Spieler.
- Geier bei schlechtem Gesundheitszustand: Ist die Figur gesundheitlich in schlechtem Zustand (§6), kreisen zeitweise Geier über ihr und folgen ihr — als atmosphärisches Signal ohne eigene Mechanik.
- Klima und Umgebungsoptik: regionstypische Atmosphäre wie Hitzeflimmern in der Wüste, feuchter Dunst im Dschungel und klare Luft im Hochland. Rein visuell.
- Dorf- und Marktleben in der Ich-Perspektive: Bewohner bei Alltagstätigkeiten (Kochen, Weben, Vieh, spielende Kinder). Reine Animation; macht Orte lebendig und unterstreicht den Kontrast zwischen wohlhabender Hafenstadt und naturnahem Dorf.
- Illustrierte Tagebucheinträge: gelegentliche Handskizzen (ein Tier, eine Landmarke, ein Gesicht) neben dem Text, passend zur handschriftlichen Darstellung (§16).
- Selbstzeichnende Karte: Die Karte füllt sich beim Erkunden als handgezeichnete Skizze statt bloßer Nebelentfernung; passt zur Erkundungsübersicht (§17).

Es gibt keinen Tag-/Nacht-Wechsel: Die Spielzeit läuft im Zeitraffer (rund fünf Jahre Expeditionsdauer über große Distanzen), ein Echtzeit-Tageslauf würde ständige Wechsel erzeugen und die Partie unnötig verlängern.

---

## 20. Kern-Spielschleife

1. Hafenstadt (Ich-Perspektive): Ausrüstung, Gaben, Waffen, Feldflasche, Seil, Kanu, Proviant kaufen; ggf. Fähre. Das Betreten der Hafenstadt speichert automatisch (Checkpoint).
2. Region ansteuern (Vogelperspektive, 3D); passendes Gelände-Item führen.
3. Dorf betreten (Ich-Perspektive): Chefhütte aufsuchen.
4. Kulturell korrekte Gabe → Hinweis in die Chronik.
5. Sprach-/Richtungssystem der Region erschließen, Hinweis dekodieren, Zielposition bestimmen.
6. Zur Zielposition reisen, Gelände-Items beachten, mit Schaufel graben → Schatz.
7. Schatzfunde regionsklug am Basar verkaufen.
8. Gesundheit und Zeit managen.
9. Entdeckungen an Häfen zu Geld machen.
10. Mehrere Hinweise triangulieren → Grab finden → Sieg.

---

## 21. Debug-Menü

Ein mit F1 aufrufbares Debug-Menü. Alle Einstellungen wirken sich direkt auf das laufende Spiel aus; kein Neustart nötig.

- Laufgeschwindigkeit der Spielfigur innerorts (in Dörfern und Hafenstädten).
- Laufgeschwindigkeit der Spielfigur außerorts (Reise über den Kontinent).
- Geschwindigkeit des Nahrungsverbrauchs beim Laufen; bei 0 hält der Nahrungsvorrat ewig.
- Checkbox: Zufallsereignisse können auftreten (§14), standardmäßig an.
- Je ein Button pro Art von Zufallsereignis (§14), um es sofort auszulösen.
- Checkbox: alle versteckten Objekte anzeigen (Position von Schatz/Grab, Caches usw.), standardmäßig aus.
- Sofortiges Springen zu jeder Hafenstadt.
- Eingabefelder für Kontostand, Gaben und Nahrung.
- Eingabefeld für die Inventar-Kapazität.
- Beliebiges Item dem Inventar hinzufügen; wird das Inventar dadurch überfüllt, erhöht sich die Inventar-Kapazität automatisch entsprechend.
