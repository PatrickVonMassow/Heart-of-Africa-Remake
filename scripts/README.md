# Geodata Preprocessing (design.md §3 "Real geodata and terrain rendering")

The runtime assets under `public/geodata/` are produced fully reproducibly
by these scripts (Node ≥ 20, no npm dependencies):

```
node scripts/build-geodata.mjs             # DEM: public/geodata/dem.png + dem.json
node scripts/generate-terrain-textures.mjs # ground textures: public/geodata/tex/*.png
```

## build-geodata.mjs — real elevation model

1. Downloads Terrarium elevation tiles (zoom 6, 224 tiles ≈ 10 MB) for the
   Africa bounding box from the public AWS Open Data bucket
   `elevation-tiles-prod` (Mapzen/Linux Foundation; composite of SRTM,
   GMTED2010 and GEBCO bathymetry; no authentication). Tiles are cached in
   `scripts/.tile-cache/` (gitignored).
2. Resamples the Web-Mercator tiles bilinearly onto an equirectangular grid
   (0.025° ≈ 2.8 km; matching the game's flat lat/lon world mapping),
   bounding box longitude −20…53, latitude −37…38.
3. Ocean mask via flood fill from the map border over elevations ≤ 0 m —
   below-sea-level depressions (Qattara, Afar) thus remain land. Afterwards
   all game settlements (parsed from `src/world/geo.ts`) are stamped as
   land if they sit on sub-pixel islands (only Cape Town was affected).
4. Chamfer distance transform to the coast for the shore ramps.
5. Encoded as one opaque RGB PNG (`dem.png`, custom PNG encoder with the
   "Up" filter): R/G = (elevation m + 12000) as 16 bit, B = 0 for ocean or
   1 + coast distance/0.02°. Elevations are quantized for compression
   (land 4 m, shallow water 8 m, deep sea 50 m). Metadata in `dem.json`.

At runtime `src/world/geodata.ts` loads the PNG (native browser decode)
and provides bilinear samplers; `src/world/hydro.ts` supplies exact
distances to the authored ~1890 river/lake courses (Catmull-Rom densified,
bucket grid — no rasterization).

## generate-terrain-textures.mjs — ground materials

Deterministically generates tileable albedo and normal maps (256²,
periodic value/Worley noise) for sand, grass, rock and forest canopy. They
are blended in the terrain material (TravelScene) via vertex splat
weights; steep slopes receive bi-planar projected rock.

## png.mjs

Dependency-free PNG codec (decode: 8-bit gray/RGB/RGBA non-interlaced;
encode: 8-bit RGB), used by both scripts.
