# CLAUDE.md — Bauauftrag: POC „Das Herz von Afrika" (Neuumsetzung)

Diese Datei steuert den agentischen Build. Sie enthält Tech-Stack, Befehle,
Scope-Leitplanken, Akzeptanzkriterien und die Selbstverifikation. Sie ist
verbindlich.

---

## 1. Ziel dieses Laufs

Ein lauffähiger **Proof of Concept** der modernen Neuumsetzung. Der POC soll die
Kern-Spielschleife des Spiels demonstrieren, nicht das vollständige Spiel liefern.

Maßgeblich für alle Design-Fragen ist `design.md` im Projekt-Root. `design.md`
ist die alleinige Quelle des Soll-Zustands. Bei Widerspruch zwischen dieser Datei
und `design.md` gilt: `design.md` bestimmt das *Was* (Spielinhalt), diese Datei
bestimmt das *Wie* (Bau, Stack, Umfang des POC). Design-Inhalte werden hier nicht
dupliziert, sondern referenziert.

---

## 2. Scope-Leitplanken (verbindlich)

- **Single-Player.** Kein Multiplayer, kein Netcode, keine Rollen, keine
  Synchronisation. Sollten in Prompts oder anderweitig Multiplayer-Konzepte
  auftauchen, sind sie nicht umzusetzen.
- **Kein Onboarding-System.** Kein Tutorial-Layer, keine Absenkung der
  Einstiegshürde, keine geführte Einführung. Das Sprach-/Richtungssystem bleibt
  als Ingame-Mechanik gemäß `design.md` bestehen.
- **Keine Wiedereinführung früher entfernter Systeme.** Keine Multiplayer- oder
  Onboarding-Bausteine, keine Design-Erweiterungen über `design.md` hinaus. Fehlt
  ein *Design*-Konzept, wird es nicht erfunden, sondern als offener Punkt
  markiert.
- **Balance-Werte per educated guess.** Konkrete Zahlenwerte (Preise,
  Proviant-/Verbrauchsraten, Ereignis-Wahrscheinlichkeiten, Tempo-Faktoren) sind
  für ein spielbares Ergebnis nötig und werden gemäß `design.md` §14 frei
  kalibriert. Fehlt ein Wert in `design.md`, ist ein begründeter Startwert zu
  setzen. Regeln dafür:
  - Werte, die `design.md` konkret nennt (z. B. Startkapital 250 $, Start Kairo/
    1890), werden nicht überschrieben.
  - Alle geschätzten Werte werden zentral an einer Stelle gebündelt (z. B.
    `src/config/balance.ts`), nicht über den Code verstreut, und als kalibrierbar
    kommentiert.
  - Jeder dieser Werte ist über das Debug-Menü (§21 `design.md`) zur Laufzeit
    justierbar zu machen, soweit für das jeweilige System im POC umgesetzt. Das
    Debug-Menü ist das vorgesehene Fine-Tuning-Werkzeug.
- **Umfang des POC.** Nur die unter §7 gelisteten Akzeptanzkriterien sind Soll.
  Alles darüber hinaus ist explizit außerhalb dieses Laufs (§8).

---

## 3. Tech-Stack

- Vite (Build-Werkzeug, Dev-Server)
- React + TypeScript
- three.js
- @react-three/fiber
- @react-three/drei

**Renderer: WebGPU primär, automatischer WebGL-2-Fallback.** Ziel ist die
Nutzung moderner Hardware; das Projekt ist auf aktuelle Browser ausgelegt und
profitiert von WebGPU. Vorgaben:

- Import aus `three/webgpu`; in R3F v9 den Renderer über die async `gl`-Prop-
  Factory erzeugen und `renderer.init()` abwarten. Der WebGPURenderer fällt bei
  fehlender WebGPU-Unterstützung automatisch auf WebGL 2 zurück; dieser Fallback
  ist der definierte Ausweg, kein Neubau.
- Shader in TSL (Three Shading Language), nicht in rohem GLSL oder WGSL. TSL
  kompiliert renderer-agnostisch für beide Backends und vermeidet einen zweiten
  Codepfad.
- Kein Chrome-only-Code. Klemmt der WebGPU-Pfad im Lauf, ist auf reines WebGL
  zurückzufallen und das als offener Punkt zu vermerken, statt den Lauf zu
  blockieren.

Keine weiteren Laufzeit-Abhängigkeiten ohne Notwendigkeit. Jede zusätzliche
Abhängigkeit ist im Commit zu begründen.

---

## 4. Projektstruktur

```
projekt-root/
├── CLAUDE.md          (diese Datei)
├── design.md          (Soll-Zustand, nicht verändern)
├── package.json
├── index.html
├── vite.config.ts
├── public/
└── src/
    ├── App.tsx        (Einstieg; aktuell Render-Prüfstein)
    ├── main.tsx
    └── ...            (Spielcode hier aufbauen)
```

`design.md` wird nicht verändert. `node_modules/` bleibt außerhalb der
Versionskontrolle (Vite-`.gitignore` deckt das ab).

Der Spielcode ist thematisch zu gliedern (z. B. `src/world/`, `src/places/`,
`src/journal/`, `src/systems/`, `src/ui/`). Keine Monolith-Datei.

---

## 5. Befehle

```
npm install            # Abhängigkeiten
npm run dev            # Dev-Server (üblich http://localhost:5173)
npm run build          # Produktions-Build (muss fehlerfrei durchlaufen)
npm run preview        # Produktions-Build lokal prüfen
```

Der TypeScript-Build muss ohne Fehler durchlaufen. `npm run build` ist Teil der
Abnahme (§7).

---

## 6. Arbeitsweise

- Inkrementell arbeiten: kleine, thematisch klar abgegrenzte Commits. Nach jedem
  in sich abgeschlossenen System committen. Voraussetzung ist ein initialisiertes
  Git-Repository mit einem Erst-Commit von Gerüst, `design.md` und `CLAUDE.md`;
  ist keines vorhanden, zuerst `git init` und diesen Erst-Commit anlegen. Kein
  automatischer Push zu einem Remote.
- **Sprache.** Spielsichtbare Texte (UI, Chronik, Meldungen) auf Deutsch gemäß
  `design.md`. Der Code auf Englisch: alle Bezeichner (Variablen, Funktionen,
  Typen, Datei- und Verzeichnisnamen) und alle Kommentare in Englisch. Die in
  §4 genannten deutschen Verzeichnisbeispiele sind entsprechend englisch zu
  benennen (z. B. `src/world/`, `src/places/`, `src/journal/`, `src/systems/`,
  `src/ui/`). Ausgenommen sind nur String-Literale, die als deutscher Spieltext
  angezeigt werden.
- Kommentare knapp und sachlich. Platzhalterwerte als solche kennzeichnen.
- Nach jedem größeren System die Selbstverifikation (§7.2) ausführen und das
  Ergebnis festhalten.
- Bei Unklarheit im Design nicht raten: offenen Punkt im Code (`// OPEN: …`) und
  in einer Liste am Ende des Laufs vermerken.

---

## 7. Abnahme

### 7.1 Akzeptanzkriterien (POC-Soll)

Der POC gilt als erfüllt, wenn alle Punkte prüfbar zutreffen. Details jeweils
gemäß `design.md`; hier steht nur die prüfbare Bedingung.

1. **Build/Start.** `npm install`, `npm run dev` und `npm run build` laufen
   fehlerfrei. Die Anwendung lädt ohne Konsolenfehler.
2. **Zwei Perspektiven.** Vogelperspektive (3D-Reise über den Kontinent) und
   Ich-Perspektive (begehbarer Ort) existieren, und der Wechsel zwischen beiden
   funktioniert beim Betreten/Verlassen eines Ortes.
3. **Weltmodell.** Feste geografische Lage der Landschaftselemente gemäß
   `design.md`; das konkrete Aussehen soll grafisch aufwändig sein, Afrika soll detailliert und authentisch dargestellt werden, der Verlauf der Begrenzungen aller Land- und Kontinent-Regionen soll feingranular sein, inkl. dem Verlauf der Flüsse.
   Koordinatenanzeige (Breite/Länge in Grad) ist vorhanden. Recherhiere hierzu, wie die genaue Geographie von Afrika zu Ende des 19. Jahrhunderts war. Alle 10 Hafenstädte, 22 Völker, 17 Flüsse und sämtliche Landmarken aus `design.md` sollen umgesetzt sein.
4. **Bewegung und Zeit.** Die Figur bewegt sich in der Vogelperspektive; Datum
   und Proviant schreiten mit der Reise voran (Kalenderanzeige, Start 1890 gemäß
   `design.md`).
5. **Hafenstadt.** Mindestens Kairo als betretbare Start-Hafenstadt mit Handel
   (Kauf von Ausrüstung, Proviant, Gaben gegen `$`). Das Betreten löst den
   automatischen Checkpoint aus (vereinfachte Speicherung genügt).
6. **Dorf und Kultur-Kontakt.** Mindestens ein betretbares Dorf mit Chefhütte.
   Eine kulturell korrekte Gabe an das Oberhaupt schaltet einen Hinweis frei —
   nicht bloße Beobachtung, sondern die Gabe ist die Bedingung.
7. **Sprach-/Richtungssystem.** Das Richtungs-/Sprachsystem der Region (Nivera/
   koko/Katula gemäß `design.md`) ist rudimentär implementiert: mindestens ein
   Hinweis lässt sich dekodieren und in eine Zielrichtung/-position übersetzen.
8. **Chronik/Tagebuch.** Ein Tagebuch existiert, wächst automatisch bei
   Ereignissen und speichert Hinweise. Der handschriftliche Eintrag darf im POC
   vereinfacht dargestellt sein (Text genügt; die animierte Handschrift ist
   nicht Abnahme-relevant).
9. **Statusleiste.** Datum, Kasse, Proviant, Gaben, Handobjekt und aktuelle
   Region werden angezeigt.
10. **Ziel-Grundgerüst.** Ein prozedural platziertes Ziel (Grab) existiert; das
    Bergen mit Schaufel am Fundpunkt löst den Sieg-Zustand aus. Die vollständige
    Triangulation mehrerer Hinweise ist im POC nicht erforderlich — ein
    einzelner dekodierter Hinweis, der zum Fundpunkt führt, genügt.
11. **Spielgrafik** Die grafische Darstellung soll ansprechend und aufwändig auf AAA-Nivea sein und die bisherige schematische Darstellung des POCs ersetzen. Dazu gehört auch die Glättung der Geometrie, des Kontinents und der Flüsse, denen man bisher starke Stufen ansieht.
12. **Atmosphäre** Die Elemente zur Atmosphäre aus design.md sind umgesetzt - konkret "## 19. Atmosphäre und Immersion" und Abschnit "**Grafik und Atmosphäre.**" in "## 2. Perspektiven und Kamera".
13. **Reale Geodaten.** Der Abschnitt "**Reale Geodaten und Terrain-Darstellung.**"
    in "## 3. Weltmodell und Karte" (`design.md`) ist umgesetzt: Höhenrelief aus
    einem realen DEM (kachelbasiert, LOD-gestreamt), Küsten/Flüsse/Seen aus
    Vektordaten im Stand von ~1890 ohne sichtbare Rasterstufen, Boden über
    biom-basiertes PBR-Textur-Splatting mit Detail-Normalmaps. Prüfbar:
    Screenshots von Nildelta, Rift-Kante und einer Küstenlinie zeigen glatte,
    reale Verläufe und texturierten Boden statt Vertexfarben; die Geodaten-
    Vorverarbeitung ist im Repository reproduzierbar dokumentiert.
14. **Licht- und Post-Processing-Pipeline.** Der Abschnitt "**Licht- und
    Post-Processing-Pipeline.**" in "## 2. Perspektiven und Kamera"
    (`design.md`) ist umgesetzt: bildbasierte Umgebungsbeleuchtung (IBL),
    Himmel aus einem physikalisch begründeten Streuungsmodell konsistent zum
    Sonnenstand, kaskadierte Schatten in der Vogelperspektive, Bildraum-AO,
    Bloom, filmisches Tonemapping mit Farb-Grading und dezenter Vignette
    sowie Wasser mit Wellenfeld, tiefenabhängiger Absorption (reale
    Bathymetrie) und Schaum an Ufern und Wellenkämmen. Prüfbar: Screenshots
    beider Perspektiven zeigen die aktiven Effekte; Anwendung läuft ohne
    Konsolenfehler auf WebGPU- und WebGL-2-Pfad; Vereinfachungen (z. B. TAA,
    echte Bildraum-Reflexion/Refraktion) sind als offene Punkte benannt.
15. **Belebte, dicht bebaute Orte.** Der Abschnitt "**Belebte, dicht bebaute
    Orte (Ich-Perspektive).**" in "## 2. Perspektiven und Kamera" (`design.md`)
    ist umgesetzt: Die Ich-Perspektive zeigt deutlich mehr Gebäude als nur die
    funktionalen — zusätzliche, nicht betretbare Wohn- und Nebengebäude in
    regionaltypischer, prozedural variierter Dichte —, ein erkennbares Straßen-/
    Wegenetz sowie Bewohner, die sich glaubhaft durch den Ort bewegen und dabei
    ihre Wohnhütten betreten und verlassen. Die betretbaren Funktionsgebäude
    bleiben klar hervorgehoben. Prüfbar: Screenshots einer Hafenstadt und eines
    Dorfes zeigen dichte Bebauung mit Wegen und mehreren Nicht-Funktions-
    gebäuden; Bewohner bewegen sich und nutzen Wohnhütten; die Anwendung lädt
    ohne Konsolenfehler.
16. **Kollision innerorts.** Der Kollisions-Punkt des Abschnitts "**Belebte,
    dicht bebaute Orte (Ich-Perspektive).**" (`design.md` §2) ist umgesetzt:
    Spielfigur und Bewohner durchdringen innerorts keine Gebäude und keine
    soliden Objekte (Hütten, Zäune, Bäume, Felsen, Feuerstelle); Bewegung
    gleitet an Hindernissen ab; Bewohner bleiben nicht dauerhaft hängen;
    Zugänge zu den betretbaren Gebäuden und der Ortsausgang bleiben
    erreichbar. Prüfbar: Ein automatisierter Lauf steuert die Spielfigur
    gegen ein Gebäude und weist nach, dass sie außerhalb des Kollisionsradius
    bleibt; Interaktion mit allen Funktionsgebäuden bleibt möglich; die
    Anwendung läuft ohne Konsolenfehler.

### 7.2 Selbstverifikation (verpflichtend)

Nach Fertigstellung und nach jedem größeren System:

- `npm run build` ausführen und Fehlerfreiheit bestätigen.
- Dev-Server starten und per Headless-Screenshot (z. B. Playwright) prüfen, dass
  die jeweils betroffene Ansicht ohne Konsolenfehler rendert.
- Screenshots je Kernansicht (Vogelperspektive, Hafenstadt, Dorf/Chefhütte,
  geöffnetes Tagebuch) ablegen und gegen die Kriterien aus §7.1 abgleichen.
- Abweichungen beheben, nicht kaschieren. Ein nicht erfülltes Kriterium wird als
  solches berichtet.

---

## 8. Ausdrücklich außerhalb dieses Laufs

- Multiplayer in jeder Form.
- Onboarding, Tutorials, Absenkung der Einstiegshürde.
- Animierte handschriftliche Tagebucheinträge mit Blutspuren (§16 `design.md`).
- Vollständige Balance, Audio, dynamische Musik, ambiente Tierwelt (§19
  `design.md`), Debug-Menü (§21 `design.md`) über das für die Prüfung Nötige
  hinaus.
- Tabellarisches Lade-Menü über den einfachen Checkpoint hinaus.

Diese Punkte sind nicht zu beginnen, auch nicht teilweise, solange die
Akzeptanzkriterien aus §7.1 nicht vollständig erfüllt sind.

---

## 9. Abschluss des Laufs

Am Ende:

- Bestätigen, welche Kriterien aus §7.1 erfüllt sind, mit Screenshot-Nachweis.
- Offene Punkte (`// OPEN: …`) gesammelt auflisten.
- Getroffene Vereinfachungen und gesetzte Platzhalterwerte benennen.
- Keine stillschweigenden Erweiterungen über §7.1 hinaus.
