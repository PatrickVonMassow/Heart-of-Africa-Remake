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
