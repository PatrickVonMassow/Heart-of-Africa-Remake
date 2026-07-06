# Geodaten-Vorverarbeitung (design.md §3 „Reale Geodaten und Terrain-Darstellung")

Die Laufzeit-Assets unter `public/geodata/` werden vollständig reproduzierbar
aus diesen Skripten erzeugt (Node ≥ 20, keine npm-Abhängigkeiten):

```
node scripts/build-geodata.mjs             # DEM: public/geodata/dem.png + dem.json
node scripts/generate-terrain-textures.mjs # Boden-Texturen: public/geodata/tex/*.png
```

## build-geodata.mjs — reales Höhenmodell

1. Lädt Terrarium-Höhenkacheln (Zoom 6, 224 Kacheln ≈ 10 MB) für die
   Afrika-Bounding-Box aus dem öffentlichen AWS-Open-Data-Bucket
   `elevation-tiles-prod` (Mapzen/Linux Foundation; Komposit aus SRTM,
   GMTED2010 und GEBCO-Bathymetrie; keine Authentifizierung). Die Kacheln
   werden in `scripts/.tile-cache/` zwischengespeichert (gitignored).
2. Resampled die Web-Mercator-Kacheln bilinear auf ein äquirektangulares
   Gitter (0,025° ≈ 2,8 km; passend zur flachen Breite/Länge-Weltabbildung
   des Spiels), Bounding-Box Länge −20…53, Breite −37…38.
3. Ozean-Maske per Flutfüllung vom Kartenrand über Höhen ≤ 0 m — Senken
   unter dem Meeresspiegel (Qattara, Afar) bleiben so Land. Anschließend
   werden alle Spielorte (aus `src/world/geo.ts` geparst) als Land
   gestempelt, falls sie auf Subpixel-Inseln liegen (betraf nur Kapstadt).
4. Chamfer-Distanztransformation zur Küste für die Ufer-Rampen.
5. Kodierung als ein opakes RGB-PNG (`dem.png`, eigener PNG-Encoder mit
   „Up"-Filter): R/G = (Höhe m + 12000) als 16 Bit, B = 0 für Ozean bzw.
   1 + Küstendistanz/0,02°. Höhen werden zur Kompression quantisiert
   (Land 4 m, Ozean 50 m). Metadaten in `dem.json`.

Zur Laufzeit lädt `src/world/geodata.ts` das PNG (nativer Browser-Decode)
und stellt bilineare Sampler bereit; `src/world/hydro.ts` liefert exakte
Distanzen zu den redaktionell erfassten ~1890-Fluss-/Seeverläufen
(Catmull-Rom-verdichtet, Bucket-Grid — keine Rasterung).

## generate-terrain-textures.mjs — Boden-Materialien

Erzeugt deterministisch kachelbare Albedo- und Normalmaps (256², periodisches
Value-/Worley-Noise) für Sand, Gras, Fels und Walddach. Sie werden im
Terrain-Material (TravelScene) über Vertex-Splat-Gewichte gemischt; steile
Hänge erhalten bi-planar projizierten Fels.

## png.mjs

Abhängigkeitsfreier PNG-Codec (Decode: 8-Bit Gray/RGB/RGBA non-interlaced;
Encode: 8-Bit RGB), genutzt von beiden Skripten.
