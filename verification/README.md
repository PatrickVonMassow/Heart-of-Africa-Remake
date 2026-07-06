# Selbstverifikation (CLAUDE.md §7.2)

Stand: 6. Juli 2026. Headless-Prüfung mit Playwright (Chromium) gegen den
Dev-Server; Produktions-Build zusätzlich über `npm run preview` geprüft.
Alle Läufe ohne Konsolenfehler.

## Automatisierter End-to-End-Lauf (flow.mjs, 20 Prüfungen — alle PASS)

1. Start in Kairo (Ich-Perspektive), Tagebuch offen mit „Aufbruch"-Eintrag
2. Startkapital 250 $, Proviant 5 Wochen, 2 Gaben (design.md §6/§18)
3. Handel: Schaufel (−20 $) und Goldschmuck-Gabe (−30 $) gekauft
4. Ort verlassen → Vogelperspektive; erneutes Betreten → Checkpoint in
   localStorage + Tagebucheintrag
5. Reise zum Dorf: Datum/Proviant schreiten mit der Bewegung voran
6. Dorf der Nubier betreten (Ich-Perspektive, Tagebucheintrag)
7. Alter Mann: Sprach-Hinweis („Nivera" = Norden) als Tagebucheintrag
8. Chefhütte: kulturell korrekte Gabe (Gold, Region Norden) schaltet den
   Fundort-Hinweis frei (Nivera + Koordinaten); neutrale/abgelehnte Gaben nicht
9. Grab liegt prozedural nördlich des Dorfes (Richtungswort stimmt)
10. Graben ohne Schaufel in der Hand schlägt fehl; mit Schaufel am
    Fundpunkt → Sieg-Zustand

Zusätzlich (checkpoint.mjs): Seiten-Reload zeigt „Checkpoint laden";
Laden stellt Spielstand wieder her.

## Screenshots (Kernansichten)

| Datei | Ansicht |
|---|---|
| 01-vogelperspektive.png | Vogelperspektive: Nil, Kairo, Spielfigur, Statusleiste, Koordinaten |
| 02-hafenstadt-kairo-handel.png | Kairo (Ich-Perspektive) mit Handelsdialog |
| 03-dorf-nubier.png | Dorf der Nubier mit Chefhütte und Bewohner |
| 04-chefhuette-audienz.png | Audienz beim Oberhaupt (Gaben-Dialog) |
| 05-tagebuch-hinweis.png | Geöffnetes Tagebuch mit Sprach- und Fundort-Hinweis |
| 06-start-tagebuch.png | Spielstart mit Aufbruch-Eintrag |
| 07-sieg.png | Sieg-Zustand nach Bergen des Grabes |
| 08-debug-menue.png | Debug-Menü (F1) mit Balance-Reglern |
| 09-produktions-build.png | Produktions-Build (`npm run preview`) |

## Nachtrag: Weltmodell-Vollausbau (§7.1.3, verschärfte Fassung)

Stand: 6. Juli 2026, zweiter Lauf (verify-world.mjs). Headless-Prüfung gegen
den Dev-Server, alle Prüfungen PASS, keine Konsolenfehler:

- Zählungen: 10 Hafenstädte, 22 Dörfer (eines je Volk, Regionen gemäß
  design.md §4.5), 17 Flüsse, 8 Seen, 11 Berge, 5 Wasserfälle,
  Elefantenfriedhof.
- Jeder Ort liegt auf begehbarem Land; deklarierte Region = Regionsmodell.
- Jede Flussmündung (ohne Binnen-Zusammenflüsse) liegt < 0,5 Grad von der
  Küste; jeder Wasserfall < 0,25 Grad von seinem Fluss.
- Seen-Raster trifft alle 8 Seezentren; Grabungs-Zielgebiet bleibt begehbar
  (92/100 Stichproben Wüste/Savanne).
- Performanz: 20 000 Terrain-Samples in ~175 ms (räumlicher Index).

| Datei | Ansicht |
|---|---|
| 10-weltmodell-nildelta-kairo.png | Nillauf mit fruchtbaren Ufern, Kairo am Ostufer, Deltaküste |
| 11-weltmodell-khartum-zusammenfluss.png | Zusammenfluss von Weißem und Blauem Nil bei Khartum |
| 12-weltmodell-viktoriasee.png | Viktoriasee mit Dorf der Uganda am Nordufer |
| 13-weltmodell-kilimandscharo.png | Kilimandscharo/Meru mit Schneekappen, Dorf der Masai |
| 14-weltmodell-kongomuendung-boma.png | Kongomündung mit Boma und Livingstone-Fällen |
| 15-weltmodell-victoriafaelle.png | Victoria-Fälle am Sambesi |
| 16-weltmodell-kapstadt.png | Kap-Halbinsel mit Kapstadt |
| 17-weltmodell-tschadsee.png | Tschadsee (großer Umriss von ~1890) |

## Nachtrag: Grafik-Überarbeitung (§7.1.11)

Stand: 6. Juli 2026, dritter Lauf (shots.mjs, preview-shot.mjs). Headless-
Prüfung gegen Dev-Server und Produktions-Preview, 0 Konsolenfehler, `npm run
build` fehlerfrei. Umgesetzt: TSL-Himmelskuppel (Gradient, Sonne, ziehende
Wolken), Sonnenlicht mit weichen Schatten (PCF), ACES-Tone-Mapping,
animiertes Ozean-/Flusswasser (Wellenhub, Farbrauschen, Glitzern), nahtlos
geglättete Terrain-Normalen mit Biom-Farbverläufen und Detail-Rauschen,
instanzierte Vegetation je Biom (Akazien, Dschungelbäume, Palmen, Büsche,
Felsen), detaillierte Orts-Marker, Spielfigur mit Laufrichtung/-animation
sowie überarbeitete begehbare Orte (Verputz-/Lehm-/Stroh-Materialien,
Gebäudedetails, Lagerfeuer, Requisiten, Bodenbewuchs).

| Datei | Ansicht |
|---|---|
| 18-grafik-hafenstadt-kairo.png | Kairo (Ich-Perspektive): Gebäude mit Markise/Attika, Palmen, Schatten |
| 19-grafik-vogelperspektive-nildelta.png | Nildelta: animiertes Meer, fruchtbare Ufer, Kairo-Marker |
| 20-grafik-savanne-kilimandscharo.png | Ostafrika: Berge, Seen, Akazien-Savanne, Dunst |
| 21-grafik-dschungel-kongo.png | Kongobecken: dichter Dschungel, Flüsse, Stanley-Fälle |
| 22-grafik-kueste-lagos.png | Guineaküste bei Lagos: tiefer Ozean mit Glitzern |
| 23-grafik-dorf-masai.png | Dorf (Ich-Perspektive): Hütten, Lagerfeuer, Alter Mann |
| 24-grafik-chefhuette-nah.png | Chefhütte nah: Stroh-/Lehm-Texturen, Regalia |
| 25-grafik-tagebuch.png | Geöffnetes Tagebuch über der neuen Grafik |
| 26-grafik-produktions-build.png | Produktions-Build (`npm run preview`) |
