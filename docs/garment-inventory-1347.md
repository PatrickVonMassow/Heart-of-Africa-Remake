# Garment picture inventory (before)

Shared raw material of the garment rebuild's two blind analyses. It records
only what the pictures show and where; it carries no cause, no candidate
construction and no proposal. State: `main` at 12e60bb30, shipped
`public/models/villager.glb` (the pipeline caches were rebuilt from today's
inputs and their export is byte-identical to the shipped file).

## How the pictures were made

| Set | Files | What |
| --- | --- | --- |
| Pipeline motion sheets | `verification/1347-inventory-motion-az35-NN.png`, `…-az215-NN.png` (NN 00–31) | Every outfit the outfit generator produces (158, numbered #0–#157, five rows per sheet: sheet NN holds #5·NN … #5·NN+4) on its sex/age body, garments with their cover mask, through walk 0/.25/.5/.75, run (jog) 0/.5, sprint .25, kneel, dig .3/.7. az35 = front-quarter from the figure's left-front, az215 = back-quarter from the right-back. Blender Workbench, flat colours per worn garment (layer order: beige, red, blue, ochre), body brown. |
| Clavicle extremes | `verification/1347-inventory-shoulders-az35-NN.png` | Same outfits on the idle's first frame with both clavicles at each extreme of `VILLAGER_POSE.shoulders` (idle, fwd, up, down, fwd+up, fwd+down). |
| Side-on walk cycle | `verification/1347-inventory-walkcycle-az90-0N.png`, `…-az-90-0N.png` | Outfits #7, #29, #42, #46, #54 (children's hip cloths) and #108, #112, #121, #153, #155 (trousers), side-on from both sides: walk 0–6/8 at stride 1 and 1.35, jog 0–3/4 at stride 1.35. |
| In-game, per place | `verification/1347-inventory-game-<place>.png` (WebGPU) and `…-webgl2.png` (WebGL 2) | Polish suite section `garment-inventory`: up to three walkers per place caught mid-stride, side-on from 3 m and 7 m; in villages also the sex/age rows of four (young: girl, boy, young woman, young man; grown: woman, man, old woman, old man), fronts and backs at 3 m. Places: bambara, hausa, tuareg, zulu, maasai, somali, baganda, san villages; Cairo and Timbuktu (port cities, walkers only). Each tile is lettered [A], [B] … in its corner. Backend asserted at boot and in the section (`assertBackend`). |
| In-game, existing sections | `verification/1347-inventory-game-situations.png`, `…-situations-webgl2.png`, `verification/1347-inventory-game-walk-pair.png` | Re-shot frames of `village-walk` (mid-stride, head carrier, kneel transition), `figure-micro` (walk a/b, Hausa and Zulu close-ups, traveller), `adult-errands` (dig pair), `children-tag` (village tag), lettered tiles; the walk-pair sheet puts the WebGPU and WebGL 2 `1380-figure-micro-walk-pair` side by side. |

Reproduction: `node scripts/villager/build.mjs inventory --out verification --sets motion|shoulders|walkcycle [--views …] [--ids …]`;
`VERIFY_GL=webgpu|webgl npm test -- polish-villagers --section=garment-inventory`.

Limits of the material:
- The pipeline sheets pose the clips as the pipeline samples them (no in-game lean, gaze or IK); the in-game frames are the game's composition but show only whoever walks there.
- Blender sheets are palette-compressed PNG (256 colours); the in-game sheets are lossless.
- Several in-game 7 m frames show the walker small or partly behind a hut wall (e.g. bambara [F], hausa [H]); the Tuareg village has no walkers, so only its rows were taken; Cairo gave one walker frame (3 m), Timbuktu two.
- The two user reports' recordings (`local/ClippingBeimLaufen.zip`, `local/WindelLook.zip`) are not in the tree; their situations were reproduced from the descriptions (walking trouser wearers side-on; children's hip cloths in walk/run, side-on and quarter views).
- Build variation (slight/stout) is not drawn; every outfit uses build 0.

## Defects seen, per garment

Reference format: `<sheet>` row `#<outfit>` column `<pose>`, or `<in-game sheet>` tile `[X]`.
"m-NN" = `verification/1347-inventory-motion-az35-NN.png`, "b-NN" = the
`az215` (back-quarter) sheet of the same number, "sh-NN" = shoulders sheet,
"wc" = walk-cycle sheets, "g-<place>" = `verification/1347-inventory-game-<place>.png`
(add `-webgl2` for the WebGL 2 copy). Categories: **L** a limb leaves or
passes through its garment; **S** garment stands visibly off the body; **T**
inner garment, body or back faces show through; **X** layering conflict
between two worn garments.

### Tight and hip garments

**`g-trousers-waist`** — worn by male youth/adult/elder and male child (bambara, hausa, mandinka, european, none); outfits #106–#111, #120–#122, #153–#156.
- T: under `g-robe-chest`, pale trouser patches on the robe at thigh/knee in sprint .25 and kneel, small ones at walk .5 (m-21 #106/#108, m-22 #110; also #107/#109/#111 under the cloak).
- S/X: under `g-shirt-chest`, kneel: the trouser knee shows as a pale ball on the ground in front of the kneeling leg (m-24 #120–#122, m-30 #153/#154, m-31 #155/#156).
- T: back-quarter run 0, a grey patch at the lifted knee where trouser and shirt meet (b-24 #120–#122).
- Side-on walk cycle (wc az90/az-90 #108, #121, #153, #155): in these frames the trouser legs cover thigh and knee in every phase; the reported bare thigh/knee of the swing leg was **not** reproduced in the pipeline sheets. In-game trouser wearers appear only standing (g-bambara [A]–[D]); no walking trouser wearer was caught side-on.

**`g-loinFlap-waist`** — female/male child, male youth/adult/elder, female youth/adult/elder (18 peoples); #0, #7, #17, #18, #19, #24–#27, #29–#31, #38–#41, #129–#143.
- L: run 0 / run .5 / sprint .25, the front flap stays hanging vertical while the forward thigh lifts; the flap's edge is drawn across/inside the lifted thigh (m-01 #7, m-03 #17, m-06 #30/#31, m-27 #138/#139).
- S: side-on child walk cycle, the back flap stands off behind the buttocks in walk 4/8 and in the run frames (wc az90-00 #7, #29).

**`g-apron-waist`** — female youth/adult/elder, male child/youth/adult/elder, female child; #14–#16, #20–#23, #28, #42–#45, #129–#131.
- L: run 0, the forward panel hangs vertical and the lifted thigh passes through its side edge (m-08 #43/#44, m-09 #45).
- T: dig .3/.7 under `g-cloak-chest`, pale apron fragments show as islands on the inner thighs and between the knees (m-04 #20–#23).
- S: side-on child walk cycle, the back panel stands off the buttocks as a flap (wc az90-00 #42, walk 4/8 and run frames).

**`g-skirtShort-waist`** — female child/youth (and under robe for female child); #1, #2, #46, #47, #54, #112.
- S: side-on walk and run, the skirt is a wide box around hips and thighs, standing off the thighs in front and behind all round; in walk 4/8 and run 1/4 the front hem stands out ahead of the lifted thigh (wc az90-00 #46, #54). Front-quarter: same tube shape around both thighs (m-09 #46, m-10 #54, m-09 #47). This is the visible match to the "diaper" description.
- T: dig .3/.7, skirt cloth folds into a horizontal shelf at hip height with the thigh skin showing through gaps (m-09 #46).

**`g-skirtKnee-waist`** — female adult/elder/youth, male youth/adult/elder; #3–#6, #35–#37, #48, #81.
- S: dig .3, the hem flares into a horizontal double ring around both knees (m-07 #35–#37, m-00 #3).
- L: kneel, the hem cuts into the kneeling thigh and the cloth folds onto the ground in a sheet (m-07 #35–#37, m-01 #5).

**`g-wrapLong-waist`** — female youth/adult/elder (bambara, mandinka); #113–#118, #123–#128.
- T: sprint .25, open tears at the thigh show the body (m-22 #113, m-23 #115/#117, m-24 #123, m-25 #125/#127).
- T: kneel, holes at hip and knee (same rows).

**`g-wrapLong-chest`** — female child/youth/adult/elder; #32–#34, #49, #50, #67–#70, #94–#96, #103–#105.
- S: front top edge gapes away from the sternum (dark inside visible) in every walk/run frame (m-06 #32–#34, m-13 #67).
- T: sprint .25, dark irregular holes at thigh/knee (m-06, m-09 #49, m-10 #50, m-18 #94, m-19 #95/#96).
- T: kneel and dig .3, holes at hip and thigh showing the body (m-06 #32–#34).

**`g-breastCloth-chest`** — female youth/adult/elder (9 peoples); #3–#6, #39–#41, #47, #81, #113, #115, #117, #123, #125, #127, #140, #141.
- S: the cloth sits as a horizontal flange under the breasts that stands off the torso in front and at the sides in every pose (m-00 #3, m-07 #39, m-08 #40/#41, m-23 #115). In game: a white ledge standing out from the torso on the women of g-bambara [A], [B], [D].

**`g-shirt-chest`** — male child/youth/adult/elder, female child; #71, #82, #100–#102, #120–#122, #153–#157.
- S: back-quarter dig .3/.7, the shirt swells into a round lump over the buttocks (b-24 #120–#122).
- See trousers for the shirt/trouser layering.

**`g-robe-chest`** — both sexes, all ages (12 peoples); #55–#60, #72–#74, #76, #78, #80, #83–#93, #106–#112, #114, #116, #118, #119, #124, #126, #128, #144–#152.
- T: sprint .25, dark round holes in the skirt part at thigh/shin (m-11 #55–#59, m-14 #72–#74, m-15 #76/#78, m-16 #80, m-29 #145–#147, m-30 #150–#152).
- T: kneel, a large opening on the side of the kneeling thigh with the dark inside of the robe visible (same rows; every robe wearer).
- S: dig .3/.7, the lower robe spreads into a wide horizontal skirt on the ground around the squatting legs (same rows).
- T: walk .25/.5, a vertical front line with small dark marks at thigh height (m-11, m-14).
- Charged situation "g-robe-chest Shown at thigh.R in run/walk": in run 0/.5 the robe's front at the right thigh shows small dark marks (m-14 #73, m-15 #76/#78); no larger bare patch is visible at this scale.
- In game: the walk-cycle pair (`1347-inventory-game-walk-pair.png`) shows a long dress where the leg passes the hem: pale blue-grey patches at the hem on WebGPU [A], dark patches on WebGL 2 [B].

**`g-toga-leftShoulder` / `g-toga-rightShoulder`** — male youth/adult/elder (sidama, somali / baganda); #61–#66, #75, #77, #79.
- S: the lower part stands off both legs as a bulky bag; in sprint .25 it bunches into a lump behind the thighs (m-12 #61–#64, m-13 #65/#66, m-15 #75/#77/#79).
- T: kneel, a large hole on the thigh side showing the dark inside (same rows).

### Loose and outer garments

**`g-cloak-bothShoulders`** — both sexes youth/adult/elder (8 peoples, mostly seasonal); #2, #4, #6, #9, #11, #13, #18, #19, #25, #53, #83, #85, #87, #89, #91, #93, #97–#99, #103–#105, #107, #109, #111.
- S: stands far off shoulders and chest; on women it carries the breast shape as two large bulges (m-00 #2/#4, m-01 #6, m-20 #103/#104).
- L: walk .25–.75, the hand and forearm come out through the cloak's side wall at hip height (m-02 #11/#13, m-03 #18/#19, m-05 #25, m-19 #97–#99).
- T: run .5 / sprint .25, round dark holes in the cloak at the hip (m-02 #11/#13, m-03 #18/#19, m-05 #25, m-19 #97–#99).
- X/T: inner robe/hood showing through the cloak as islands, every pose: red hood through blue cloak (m-16 #83, m-17 #85/#87; back-quarter b-17 #85/#87 at shoulder blades), red robe through blue cloak (m-21 #107/#109, m-22 #111), beige robe through red cloak at shoulders (m-17 #89, m-18 #91/#93). In game: blue robe patches in the black cloaks of the Tuareg rows, WebGL 2 g-tuareg-village-webgl2 [A] fourth figure (back) and [B] first figure (front).
- S: dig, the cloak's hem flares horizontally around the squat (same rows).

**`g-cloak-chest`** — female youth/adult/elder (san, wayeyi); #20–#23.
- S/L/T: as the both-shoulders cloak (bulk at chest; forearm through the side wall in walk; apron islands below in dig) (m-04 #20–#23).

**`g-cape-chest`** — female youth/adult/elder (maasai, mbuti, pedi, wayeyi); #14–#16, #48, #135–#137.
- S: a wide flared collar standing off the upper arms all round (m-02 #14, m-03 #15/#16, m-27 #135–#137).
- L: run 0/.5 and sprint .25, the raised upper arm passes through the cape surface (same rows).

**`g-cape-rightShoulder`** — male youth/adult/elder (san); #24, #26, #27.
- S: the sash part stands off the waist as a horizontal loop in front (m-04 #24, m-05 #26/#27).
- L: run 0, the raised forearm passes through the sash (same rows).

**`g-cape-leftShoulder`** — male youth/adult (maasai); #51, #52.
- S: a bunched mass around shoulder and upper arm standing off the body; in kneel and dig it folds into the torso (m-10 #51/#52).

**`g-hood-overHead`** — both sexes youth/adult/elder (bedouin, egyptian, nubians, somali, swahili, tuareg); #56, #58, #60, #62, #64, #66, #68–#70, #83–#87, #148–#150.
- T/X: beige robe or toga shows through the hood's shoulder part as white islands at chest and shoulder in every pose (m-11 #56/#58, m-12 #60/#62/#64, m-13 #66, m-16 #84, m-17 #86, m-29 #148/#149, m-30 #150). Under `g-wrapLong-chest` (#68–#70) no islands are visible.

**`g-babySling-bothShoulders`** — female adult (san); #21.
- The infant is not visible in the walk/run frames; in kneel and dig a blue lump stands above the shoulder (m-04 #21).

### Head pieces and ornaments

**`g-veil-face`** — male youth/adult/elder (tuareg); #88–#93.
- T: a dark band shows at the neck between the veil's lower edge and the robe collar, front-quarter, in every pose (m-17 #88, m-18 #90/#92) and in all six clavicle extremes (sh-18 #90/#92). With the cloak, the veil sits above the cloak collar (sh-18 #91/#93).
- In game the veiled heads read as uniform dark shapes at 3 m (g-tuareg-village [B], [D]).

**`g-neckBeads-chest`** — female youth/adult/elder (mongo, zulu); #1, #2, #132–#134.
- S: drawn as a shell over the whole chest and breasts; jagged pieces stick out at the right shoulder in every pose (m-00 #1, m-26 #132–#134).

**`g-neckBeads-neck`** — male youth, female adult/elder (berbers, zulu); #8, #9, #95, #96.
- S: kneel and dig, the ring hangs away from the neck as a loop (m-19 #95/#96).

**`g-waistBeads-waist`** — both sexes (13 peoples); #1, #2, #28, #29, #38, #42, #46, #94–#96, #112, #119, #142, #143.
- S: the bead string stands off the hips with a gap at the sides, tilted against the girdle (m-07 #38, m-05 #28/#29; side-on wc az90-00 #29, #42).

**`g-limbRings-limbs`** — female youth/adult/elder (maasai); #48–#50.
- S: run .5 / sprint .25, the wrist rings stretch along the forearm as a long band (m-09 #48).

**`g-girdleTails-waist`** (zulu, #8–#13), **`g-cap-crown`**, **`g-headRing-crown`**, **`g-topknot-crown`**, **`g-hairBag-crown`**, **`g-headband-aroundHead`**, **`g-turban-aroundHead`**: no defect seen at sheet scale.

### In-game frames not tied to one garment

- g-bambara-village [B]: the second figure (dark robe) is drawn without legs below the hem and reads as hovering above the ground.
- g-bambara-village [C]: two small detached pieces (a pink round one and a dark sliver) float in the air left of centre.
- g-hausa-village [A], [B], [D]: dark spots on the white outer garments at chest and hip; the white outer garment stands off the body as a bulky shell.

## Defect count per garment category

Counted as the bullet points above (one per garment × visible defect kind × pose group):

| Category | Garments | L | S | T | X | Total |
| --- | --- | --- | --- | --- | --- | --- |
| Trousers / shirt | 2 | 0 | 2 | 2 | 1 | 4 |
| Hip cloths (loin flap, apron, short skirt, knee skirt, girdle) | 5 | 3 | 4 | 2 | 0 | 9 |
| Long wraps (waist and chest) | 2 | 0 | 1 | 4 | 0 | 5 |
| Breast cloth | 1 | 0 | 1 | 0 | 0 | 1 |
| Robe | 1 | 0 | 1 | 5 | 0 | 6 |
| Toga | 2 | 0 | 1 | 1 | 0 | 2 |
| Cloaks | 2 | 2 | 3 | 2 | 1 | 6 |
| Capes | 3 | 2 | 3 | 0 | 0 | 5 |
| Hood | 1 | 0 | 0 | 1 | 1 | 1 |
| Baby sling | 1 | 0 | 1 | 0 | 0 | 1 |
| Veil and head pieces | 7 | 0 | 0 | 1 | 0 | 1 |
| Ornaments (neck beads ×2, waist beads, limb rings) | 4 | 0 | 4 | 0 | 0 | 4 |
| In-game, not tied to a garment | — | — | — | — | — | 3 |

(The letter columns count a bullet under every category it names, so they can sum above the Total, which counts bullets.)

## Outfit generator: every garment and combination

Enumerated from `appearanceFor` (src/systems/appearance.ts) over every people
of `PEOPLE_DRESS` and `CAST_DRESS` plus none, both sexes, all four ages, with
and without the chief's office, years 1890 and 1895, rank and non-rank cloth,
seasonal drivers off and full, and per-figure picks 0.01/0.3/0.5/0.7/0.99
(`outfitCombos` in scripts/villager/build.mjs). Body paint is no mesh and is
left out. All 31 garments of the shipped glb are worn by at least one outfit;
no generated garment is missing from the glb. The outfit number is the row
label on every pipeline sheet.

### Outfits (158)

| # | Sex | Age | Garments (pipeline mesh `g-<form>-<wear>`, innermost slot first) | Peoples producing it |
| --- | --- | --- | --- | --- |
| 0 | female | child | loinFlap-waist | maasai, mongo, pedi, san, zulu |
| 1 | female | youth | skirtShort-waist, neckBeads-chest, waistBeads-waist | zulu |
| 2 | female | youth | skirtShort-waist, cloak-bothShoulders, neckBeads-chest, waistBeads-waist | zulu |
| 3 | female | adult | skirtKnee-waist, breastCloth-chest, topknot-crown | zulu |
| 4 | female | adult | skirtKnee-waist, breastCloth-chest, cloak-bothShoulders, topknot-crown | zulu |
| 5 | female | elder | skirtKnee-waist, breastCloth-chest, topknot-crown | zulu |
| 6 | female | elder | skirtKnee-waist, breastCloth-chest, cloak-bothShoulders, topknot-crown | zulu |
| 7 | male | child | loinFlap-waist | baganda, maasai, mongo, none, pedi, san, somali, zulu |
| 8 | male | youth | girdleTails-waist, neckBeads-neck | zulu |
| 9 | male | youth | girdleTails-waist, cloak-bothShoulders, neckBeads-neck | zulu |
| 10 | male | adult | girdleTails-waist, headRing-crown | zulu |
| 11 | male | adult | girdleTails-waist, cloak-bothShoulders, headRing-crown | zulu |
| 12 | male | elder | girdleTails-waist, headRing-crown | zulu |
| 13 | male | elder | girdleTails-waist, cloak-bothShoulders, headRing-crown | zulu |
| 14 | female | youth | apron-waist, cape-chest | pedi, wayeyi |
| 15 | female | adult | apron-waist, cape-chest | pedi, wayeyi |
| 16 | female | elder | apron-waist, cape-chest | pedi, wayeyi |
| 17 | male | youth | loinFlap-waist | bambundu, banda, mbuti, mongo, pedi, wayeyi |
| 18 | male | adult | loinFlap-waist, cloak-bothShoulders | pedi, san, wayeyi |
| 19 | male | elder | loinFlap-waist, cloak-bothShoulders | pedi, san, wayeyi |
| 20 | female | youth | apron-waist, cloak-chest | san, wayeyi |
| 21 | female | adult | apron-waist, cloak-chest, babySling-bothShoulders | san |
| 22 | female | adult | apron-waist, cloak-chest | san, wayeyi |
| 23 | female | elder | apron-waist, cloak-chest | san, wayeyi |
| 24 | male | youth | loinFlap-waist, cape-rightShoulder | san |
| 25 | male | youth | loinFlap-waist, cloak-bothShoulders | san, wayeyi |
| 26 | male | adult | loinFlap-waist, cape-rightShoulder | san |
| 27 | male | elder | loinFlap-waist, cape-rightShoulder | san |
| 28 | female | child | apron-waist, waistBeads-waist | bemba, wayeyi |
| 29 | male | child | loinFlap-waist, waistBeads-waist | bambara, bambundu, banda, bemba, fang, mandinka, mbuti, sidama, wayeyi |
| 30 | male | adult | loinFlap-waist | bambundu, mongo, wayeyi |
| 31 | male | elder | loinFlap-waist | bambundu, mongo, wayeyi |
| 32 | female | youth | wrapLong-chest | baganda, bemba, hausa, none |
| 33 | female | adult | wrapLong-chest | baganda, bambundu, bemba, hausa, none, sidama |
| 34 | female | elder | wrapLong-chest | baganda, bambundu, bemba, hausa, none, sidama |
| 35 | male | youth | skirtKnee-waist | bemba |
| 36 | male | adult | skirtKnee-waist | bemba |
| 37 | male | elder | skirtKnee-waist | bemba |
| 38 | female | child | loinFlap-waist, waistBeads-waist | banda, fang, lunda, mbuti |
| 39 | female | youth | loinFlap-waist, breastCloth-chest | banda, fang, lunda |
| 40 | female | adult | loinFlap-waist, breastCloth-chest | fang, lunda |
| 41 | female | elder | loinFlap-waist, breastCloth-chest | fang, lunda |
| 42 | male | child | apron-waist, waistBeads-waist | lunda |
| 43 | male | youth | apron-waist | lunda |
| 44 | male | adult | apron-waist | lunda |
| 45 | male | elder | apron-waist | lunda |
| 46 | female | child | skirtShort-waist, waistBeads-waist | bambara, bambundu, hausa, mandinka, sidama |
| 47 | female | youth | skirtShort-waist, breastCloth-chest | bambundu, nubians |
| 48 | female | youth | skirtKnee-waist, cape-chest, limbRings-limbs | maasai |
| 49 | female | adult | wrapLong-chest, limbRings-limbs | maasai |
| 50 | female | elder | wrapLong-chest, limbRings-limbs | maasai |
| 51 | male | youth | cape-leftShoulder | maasai |
| 52 | male | adult | cape-leftShoulder | maasai |
| 53 | male | elder | cloak-bothShoulders | maasai |
| 54 | female | child | skirtShort-waist | baganda, none, nubians, somali |
| 55 | female | youth | robe-chest | bedouin, egyptian, european, somali |
| 56 | female | youth | robe-chest, hood-overHead | somali, tuareg |
| 57 | female | adult | robe-chest, hairBag-crown | somali |
| 58 | female | adult | robe-chest, hood-overHead, hairBag-crown | somali |
| 59 | female | elder | robe-chest, hairBag-crown | somali |
| 60 | female | elder | robe-chest, hood-overHead, hairBag-crown | somali |
| 61 | male | youth | toga-leftShoulder | sidama, somali |
| 62 | male | youth | toga-leftShoulder, hood-overHead | somali |
| 63 | male | adult | toga-leftShoulder | sidama, somali |
| 64 | male | adult | toga-leftShoulder, hood-overHead | somali |
| 65 | male | elder | toga-leftShoulder | sidama, somali |
| 66 | male | elder | toga-leftShoulder, hood-overHead | somali |
| 67 | female | child | wrapLong-chest | swahili |
| 68 | female | youth | wrapLong-chest, hood-overHead | swahili |
| 69 | female | adult | wrapLong-chest, hood-overHead | swahili |
| 70 | female | elder | wrapLong-chest, hood-overHead | swahili |
| 71 | male | child | shirt-chest | berbers, hausa, nubians, swahili, tuareg |
| 72 | male | youth | robe-chest, cap-crown | egyptian, swahili |
| 73 | male | adult | robe-chest, cap-crown | swahili |
| 74 | male | elder | robe-chest, cap-crown | swahili |
| 75 | male | youth | toga-rightShoulder | baganda |
| 76 | male | youth | robe-chest | baganda |
| 77 | male | adult | toga-rightShoulder | baganda |
| 78 | male | adult | robe-chest | baganda, none |
| 79 | male | elder | toga-rightShoulder | baganda |
| 80 | male | elder | robe-chest | baganda, none |
| 81 | female | youth | skirtKnee-waist, breastCloth-chest | sidama |
| 82 | female | child | shirt-chest | berbers, tuareg |
| 83 | female | youth | robe-chest, hood-overHead, cloak-bothShoulders | tuareg |
| 84 | female | adult | robe-chest, hood-overHead | bedouin, egyptian, nubians, tuareg |
| 85 | female | adult | robe-chest, hood-overHead, cloak-bothShoulders | tuareg |
| 86 | female | elder | robe-chest, hood-overHead | bedouin, egyptian, nubians, tuareg |
| 87 | female | elder | robe-chest, hood-overHead, cloak-bothShoulders | tuareg |
| 88 | male | youth | robe-chest, veil-face, turban-aroundHead | tuareg |
| 89 | male | youth | robe-chest, cloak-bothShoulders, veil-face, turban-aroundHead | tuareg |
| 90 | male | adult | robe-chest, veil-face, turban-aroundHead | tuareg |
| 91 | male | adult | robe-chest, cloak-bothShoulders, veil-face, turban-aroundHead | tuareg |
| 92 | male | elder | robe-chest, veil-face, turban-aroundHead | tuareg |
| 93 | male | elder | robe-chest, cloak-bothShoulders, veil-face, turban-aroundHead | tuareg |
| 94 | female | youth | wrapLong-chest, waistBeads-waist | berbers |
| 95 | female | adult | wrapLong-chest, waistBeads-waist, neckBeads-neck | berbers |
| 96 | female | elder | wrapLong-chest, waistBeads-waist, neckBeads-neck | berbers |
| 97 | male | youth | cloak-bothShoulders | berbers |
| 98 | male | adult | cloak-bothShoulders, turban-aroundHead | berbers |
| 99 | male | elder | cloak-bothShoulders, turban-aroundHead | berbers |
| 100 | male | youth | shirt-chest, cap-crown | nubians |
| 101 | male | adult | shirt-chest, turban-aroundHead | nubians |
| 102 | male | elder | shirt-chest, turban-aroundHead | nubians |
| 103 | female | youth | wrapLong-chest, cloak-bothShoulders | hausa |
| 104 | female | adult | wrapLong-chest, cloak-bothShoulders | hausa |
| 105 | female | elder | wrapLong-chest, cloak-bothShoulders | hausa |
| 106 | male | youth | trousers-waist, robe-chest, cap-crown | bambara, hausa, mandinka |
| 107 | male | youth | trousers-waist, robe-chest, cloak-bothShoulders, cap-crown | hausa |
| 108 | male | adult | trousers-waist, robe-chest, cap-crown | bambara, hausa, mandinka |
| 109 | male | adult | trousers-waist, robe-chest, cloak-bothShoulders, cap-crown | hausa |
| 110 | male | elder | trousers-waist, robe-chest, cap-crown | bambara, hausa, mandinka |
| 111 | male | elder | trousers-waist, robe-chest, cloak-bothShoulders, cap-crown | hausa |
| 112 | female | child | skirtShort-waist, robe-chest, waistBeads-waist | bambara, mandinka |
| 113 | female | youth | wrapLong-waist, breastCloth-chest | bambara |
| 114 | female | youth | wrapLong-waist, robe-chest | bambara |
| 115 | female | adult | wrapLong-waist, breastCloth-chest | bambara |
| 116 | female | adult | wrapLong-waist, robe-chest | bambara |
| 117 | female | elder | wrapLong-waist, breastCloth-chest | bambara |
| 118 | female | elder | wrapLong-waist, robe-chest | bambara |
| 119 | male | child | loinFlap-waist, robe-chest, waistBeads-waist | bambara, mandinka |
| 120 | male | youth | trousers-waist, shirt-chest, cap-crown | bambara, mandinka |
| 121 | male | adult | trousers-waist, shirt-chest, cap-crown | bambara, mandinka |
| 122 | male | elder | trousers-waist, shirt-chest, cap-crown | bambara, mandinka |
| 123 | female | youth | wrapLong-waist, breastCloth-chest, headband-aroundHead | mandinka |
| 124 | female | youth | wrapLong-waist, robe-chest, headband-aroundHead | mandinka |
| 125 | female | adult | wrapLong-waist, breastCloth-chest, headband-aroundHead | mandinka |
| 126 | female | adult | wrapLong-waist, robe-chest, headband-aroundHead | mandinka |
| 127 | female | elder | wrapLong-waist, breastCloth-chest, headband-aroundHead | mandinka |
| 128 | female | elder | wrapLong-waist, robe-chest, headband-aroundHead | mandinka |
| 129 | male | youth | loinFlap-waist, apron-waist | fang |
| 130 | male | adult | loinFlap-waist, apron-waist | fang |
| 131 | male | elder | loinFlap-waist, apron-waist | fang |
| 132 | female | youth | loinFlap-waist, neckBeads-chest | mongo |
| 133 | female | adult | loinFlap-waist, neckBeads-chest | mongo |
| 134 | female | elder | loinFlap-waist, neckBeads-chest | mongo |
| 135 | female | youth | loinFlap-waist, cape-chest | mbuti |
| 136 | female | adult | loinFlap-waist, cape-chest | mbuti |
| 137 | female | elder | loinFlap-waist, cape-chest | mbuti |
| 138 | male | adult | loinFlap-waist, cap-crown | mbuti |
| 139 | male | elder | loinFlap-waist, cap-crown | mbuti |
| 140 | female | adult | loinFlap-waist, breastCloth-chest, headband-aroundHead | banda |
| 141 | female | elder | loinFlap-waist, breastCloth-chest, headband-aroundHead | banda |
| 142 | male | adult | loinFlap-waist, waistBeads-waist | banda |
| 143 | male | elder | loinFlap-waist, waistBeads-waist | banda |
| 144 | female | child | robe-chest | bedouin, egyptian, european |
| 145 | male | child | robe-chest | bedouin, egyptian |
| 146 | male | adult | robe-chest, turban-aroundHead | egyptian |
| 147 | male | elder | robe-chest, turban-aroundHead | egyptian |
| 148 | male | youth | robe-chest, hood-overHead | bedouin |
| 149 | male | adult | robe-chest, hood-overHead | bedouin |
| 150 | male | elder | robe-chest, hood-overHead | bedouin |
| 151 | female | adult | robe-chest | european |
| 152 | female | elder | robe-chest | european |
| 153 | male | child | trousers-waist, shirt-chest | european |
| 154 | male | youth | trousers-waist, shirt-chest | european |
| 155 | male | adult | trousers-waist, shirt-chest | european |
| 156 | male | elder | trousers-waist, shirt-chest | european |
| 157 | male | youth | shirt-chest | none |

### Garments and who wears them (31)

| Garment | Worn by (sex: ages) | Peoples | Outfit #s |
| --- | --- | --- | --- |
| `g-apron-waist` | female: child, youth, adult, elder; male: child, youth, adult, elder | bemba, fang, lunda, pedi, san, wayeyi | 14, 15, 16, 20, 21, 22, 23, 28, 42, 43, 44, 45, 129, 130, 131 |
| `g-babySling-bothShoulders` | female: adult | san | 21 |
| `g-breastCloth-chest` | female: youth, adult, elder | bambara, bambundu, banda, fang, lunda, mandinka, nubians, sidama, zulu | 3, 4, 5, 6, 39, 40, 41, 47, 81, 113, 115, 117, 123, 125, 127, 140, 141 |
| `g-cap-crown` | male: youth, adult, elder | bambara, egyptian, hausa, mandinka, mbuti, nubians, swahili | 72, 73, 74, 100, 106, 107, 108, 109, 110, 111, 120, 121, 122, 138, 139 |
| `g-cape-chest` | female: youth, adult, elder | maasai, mbuti, pedi, wayeyi | 14, 15, 16, 48, 135, 136, 137 |
| `g-cape-leftShoulder` | male: youth, adult | maasai | 51, 52 |
| `g-cape-rightShoulder` | male: youth, adult, elder | san | 24, 26, 27 |
| `g-cloak-bothShoulders` | female: youth, adult, elder; male: youth, adult, elder | berbers, hausa, maasai, pedi, san, tuareg, wayeyi, zulu | 2, 4, 6, 9, 11, 13, 18, 19, 25, 53, 83, 85, 87, 89, 91, 93, 97, 98, 99, 103, 104, 105, 107, 109, 111 |
| `g-cloak-chest` | female: youth, adult, elder | san, wayeyi | 20, 21, 22, 23 |
| `g-girdleTails-waist` | male: youth, adult, elder | zulu | 8, 9, 10, 11, 12, 13 |
| `g-hairBag-crown` | female: adult, elder | somali | 57, 58, 59, 60 |
| `g-headRing-crown` | male: adult, elder | zulu | 10, 11, 12, 13 |
| `g-headband-aroundHead` | female: youth, adult, elder | banda, mandinka | 123, 124, 125, 126, 127, 128, 140, 141 |
| `g-hood-overHead` | female: youth, adult, elder; male: youth, adult, elder | bedouin, egyptian, nubians, somali, swahili, tuareg | 56, 58, 60, 62, 64, 66, 68, 69, 70, 83, 84, 85, 86, 87, 148, 149, 150 |
| `g-limbRings-limbs` | female: youth, adult, elder | maasai | 48, 49, 50 |
| `g-loinFlap-waist` | female: child, youth, adult, elder; male: child, youth, adult, elder | baganda, bambara, bambundu, banda, bemba, fang, lunda, maasai, mandinka, mbuti, mongo, none, pedi, san, sidama, somali, wayeyi, zulu | 0, 7, 17, 18, 19, 24, 25, 26, 27, 29, 30, 31, 38, 39, 40, 41, 119, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143 |
| `g-neckBeads-chest` | female: youth, adult, elder | mongo, zulu | 1, 2, 132, 133, 134 |
| `g-neckBeads-neck` | female: adult, elder; male: youth | berbers, zulu | 8, 9, 95, 96 |
| `g-robe-chest` | female: child, youth, adult, elder; male: child, youth, adult, elder | baganda, bambara, bedouin, egyptian, european, hausa, mandinka, none, nubians, somali, swahili, tuareg | 55, 56, 57, 58, 59, 60, 72, 73, 74, 76, 78, 80, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 106, 107, 108, 109, 110, 111, 112, 114, 116, 118, 119, 124, 126, 128, 144, 145, 146, 147, 148, 149, 150, 151, 152 |
| `g-shirt-chest` | female: child; male: child, youth, adult, elder | bambara, berbers, european, hausa, mandinka, none, nubians, swahili, tuareg | 71, 82, 100, 101, 102, 120, 121, 122, 153, 154, 155, 156, 157 |
| `g-skirtKnee-waist` | female: youth, adult, elder; male: youth, adult, elder | bemba, maasai, sidama, zulu | 3, 4, 5, 6, 35, 36, 37, 48, 81 |
| `g-skirtShort-waist` | female: child, youth | baganda, bambara, bambundu, hausa, mandinka, none, nubians, sidama, somali, zulu | 1, 2, 46, 47, 54, 112 |
| `g-toga-leftShoulder` | male: youth, adult, elder | sidama, somali | 61, 62, 63, 64, 65, 66 |
| `g-toga-rightShoulder` | male: youth, adult, elder | baganda | 75, 77, 79 |
| `g-topknot-crown` | female: adult, elder | zulu | 3, 4, 5, 6 |
| `g-trousers-waist` | male: child, youth, adult, elder | bambara, european, hausa, mandinka | 106, 107, 108, 109, 110, 111, 120, 121, 122, 153, 154, 155, 156 |
| `g-turban-aroundHead` | male: youth, adult, elder | berbers, egyptian, nubians, tuareg | 88, 89, 90, 91, 92, 93, 98, 99, 101, 102, 146, 147 |
| `g-veil-face` | male: youth, adult, elder | tuareg | 88, 89, 90, 91, 92, 93 |
| `g-waistBeads-waist` | female: child, youth, adult, elder; male: child, adult, elder | bambara, bambundu, banda, bemba, berbers, fang, hausa, lunda, mandinka, mbuti, sidama, wayeyi, zulu | 1, 2, 28, 29, 38, 42, 46, 94, 95, 96, 112, 119, 142, 143 |
| `g-wrapLong-chest` | female: child, youth, adult, elder | baganda, bambundu, bemba, berbers, hausa, maasai, none, sidama, swahili | 32, 33, 34, 49, 50, 67, 68, 69, 70, 94, 95, 96, 103, 104, 105 |
| `g-wrapLong-waist` | female: youth, adult, elder | bambara, mandinka | 113, 114, 115, 116, 117, 118, 123, 124, 125, 126, 127, 128 |

## Penetration report (information only, no gate — point 1339)

From the committed `verification/villager-body/penetration-report.md`
(commit d75db2359, 18.10.2026; 673 poses × 10 body corners = 6730 frames per
garment, figure units). Each cell: the measured maximum over every pose, and
in brackets the number of frames above 0.003. Not re-measured in this step.

| Garment | Cloth (max, frames over of 6730) | Shown | Hole | Cut | Inner | Inner hole |
| --- | --- | --- | --- | --- | --- | --- |
| `g-apron-waist` | 0.0292 (2259) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0316 (2688) | 0.0482 (1982) |
| `g-babySling-bothShoulders` | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) |
| `g-breastCloth-chest` | 0.0358 (3820) | 0.0044 (102) | 0.0000 (0) | 0.0000 (0) | 0.1117 (6379) | 0.0798 (3175) |
| `g-cap-crown` | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) |
| `g-cape-chest` | 0.0578 (4449) | 0.0931 (696) | 0.0769 (1721) | 0.0766 (331) | 0.0000 (0) | 0.0000 (0) |
| `g-cape-leftShoulder` | 0.0521 (4303) | 0.0935 (730) | 0.0745 (1248) | 0.0734 (261) | 0.0000 (0) | 0.0000 (0) |
| `g-cape-rightShoulder` | 0.0490 (4433) | 0.0908 (771) | 0.0692 (1476) | 0.0700 (81) | 0.0000 (0) | 0.0000 (0) |
| `g-cloak-bothShoulders` | 0.0518 (6085) | 0.0438 (1380) | 0.0433 (607) | 0.0406 (694) | 0.0000 (0) | 0.0000 (0) |
| `g-cloak-chest` | 0.0648 (6039) | 0.0840 (1098) | 0.0401 (716) | 0.0357 (631) | 0.0000 (0) | 0.0000 (0) |
| `g-girdleTails-waist` | 0.0272 (2047) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0236 (1607) | 0.0457 (1676) |
| `g-hairBag-crown` | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) |
| `g-headRing-crown` | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) |
| `g-headband-aroundHead` | 0.0027 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) |
| `g-hood-overHead` | 0.0470 (2754) | 0.0182 (548) | 0.0293 (789) | 0.0100 (0) | 0.0000 (0) | 0.0000 (0) |
| `g-limbRings-limbs` | 0.0133 (2305) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) |
| `g-loinFlap-waist` | 0.0244 (995) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0224 (233) | 0.0442 (1526) |
| `g-neckBeads-chest` | 0.0264 (6652) | 0.0139 (423) | 0.0000 (0) | 0.0101 (0) | 0.0888 (4253) | 0.0712 (1657) |
| `g-neckBeads-neck` | 0.0027 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0093 (1898) | 0.0000 (0) |
| `g-robe-chest` | 0.0797 (6730) | 0.0343 (770) | 0.0173 (73) | 0.0285 (112) | 0.1111 (6730) | 0.0570 (4731) |
| `g-shirt-chest` | 0.0779 (6730) | 0.1023 (1908) | 0.0392 (204) | 0.0298 (51) | 0.1131 (6730) | 0.0630 (5097) |
| `g-skirtKnee-waist` | 0.0566 (6174) | 0.1166 (2991) | 0.0509 (261) | 0.0404 (227) | 0.0727 (3116) | 0.0490 (2091) |
| `g-skirtShort-waist` | 0.0513 (3035) | 0.0064 (46) | 0.0000 (0) | 0.0049 (0) | 0.0420 (192) | 0.0412 (1035) |
| `g-toga-leftShoulder` | 0.1393 (6730) | 0.0399 (381) | 0.0096 (25) | 0.0278 (36) | 0.1126 (6250) | 0.0644 (3547) |
| `g-toga-rightShoulder` | 0.0403 (6730) | 0.0113 (751) | 0.0000 (0) | 0.0157 (0) | 0.1188 (6724) | 0.0669 (4182) |
| `g-topknot-crown` | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) |
| `g-trousers-waist` | 0.0482 (3877) | 0.0170 (2463) | 0.0042 (5) | 0.0200 (0) | 0.1381 (4756) | 0.0852 (2144) |
| `g-turban-aroundHead` | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) |
| `g-veil-face` | 0.0177 (98) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0305 (6553) | 0.0199 (2) |
| `g-waistBeads-waist` | 0.0166 (1399) | 0.0000 (0) | 0.0000 (0) | 0.0000 (0) | 0.0268 (3151) | 0.0291 (1025) |
| `g-wrapLong-chest` | 0.1403 (6730) | 0.0506 (1964) | 0.0315 (110) | 0.0463 (395) | 0.1025 (6677) | 0.0733 (4905) |
| `g-wrapLong-waist` | 0.0520 (6730) | 0.0520 (2457) | 0.0359 (70) | 0.0449 (510) | 0.0791 (4294) | 0.0807 (3861) |

Charged numbers quoted in the work order (from the report and the runtime
report): `g-veil-face` inner 0.037 under `g-shirt-chest`, 0.034 under
`g-robe-chest`, idle up to 0.040; `shoulders` clip: `g-skirtShort-waist`
0.0214 against main's idle 0.0036, 23 garments deeper than idle; runtime
`g-robe-chest` Shown at thigh.R run 0.0129, walk 0.0084 (runtime report:
walk 0.0084, cloth 0.0381 at shin.L).
