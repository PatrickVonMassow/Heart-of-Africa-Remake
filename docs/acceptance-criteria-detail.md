# Acceptance criteria — detail (CLAUDE.md §7.1)

The acceptance criteria of CLAUDE.md §7.1 in full. Moved out of that file because it is
sent with EVERY turn of EVERY session and inherited by every delegated subagent, while
the full wording is needed only when a criterion is worked on or closed — the same move
the evidence chains made to docs/acceptance-evidence.md, and the same one nos. 20 and 21
made first. Each section carries its criterion COMPLETE and verbatim, notices included,
so the move can drop nothing; §7.1 keeps the number, the bold title, one short
acceptance condition, the `Detail:` pointer and the `Evidence:` line, and THIS file is
what governs where the two differ in detail. Only nos. 1, 10 and 11 — genuinely one short
statement each — and no. 18, which the work order exempts by name, stay whole in §7.1 and
have no section here. A criterion and its detail section change in the SAME commit.

---

## 2. Two perspectives.

Bird's-eye view (3D travel across the continent) and first-person view (walkable
settlement) exist; switching between them is movement-based, confirmed with the SPACE use
key, per `design.md` §2.3. In particular: functional buildings are entered with the SPACE
use key while standing at their door (door proximity shows the prompt and arms the key —
merely walking into the door no longer enters), and the elder is addressed with the same
use key. Settlement entry from the bird's-eye view is likewise movement-based but
confirmed with SPACE: within the enter radius the localized hint "Space to enter <name>"
shows (the map name-label hidden while it does) and a SPACE press enters; reaching the
radius alone never enters. The hint honours the §17.2 discovery gate (point 287): an
UNDISCOVERED settlement's name stays hidden — the hint reads its localized KIND
placeholder ("Unknown village", matching its map label; point 318) until the place is
discovered, while a known-from-start port always names itself. The accidental-entry
debounce/clearance is removed (no just-left re-entry lock, no move-clear timing). A SPACE
press while the traveller is on a water cell still does not enter, so a river passage
never pulls him in. Entering focuses the controls without an extra click per `design.md`
§17.5 (HUD buttons blurred; mouse-look engages on entry from the SPACE keypress, with the
click as fallback).

## 3. World model.

The fixed, authentic ~1890 geography of `design.md` §3.1/§3.2 — researched against the
real end-of-19th-century state — with all 10 port cities, 22 peoples, 17 rivers and every
landmark of §4, graphically elaborate with fine-grained land outlines and river courses.
Region borders carry the localized region name on each side of the line in both views
(§3.2); map-point labels are discovery-gated (§17.2) EXCEPT the known-from-start places of
§17.2 — the ten port cities and the Giza monument site (point 273) — which show their
names from the outset (never a kind placeholder), a legacy save migrating to mark them
discovered (§3.2/§17.2, point 288); coordinates are read out on demand via the position
query (§3.2, pt. 30), never shown permanently. The exploration map is implemented per
§19.11 (an engraved ~1890 atlas plate on worn paper — graticule, blue water ink, hachures,
each region named once in spaced capitals — under a fog of war that each explored area
clears a window through). Every village keeps the small minimum river-water clearance of
§4.2 (its footprint never reaches into a river) — the clearances SCALE with the
calibratable river width (point 156): ports stay AT the river per the §4.2 exemption but
their rendered cluster clears the band by its own smaller footprint margin, and every
landmark (cultural fields, natural sites except the flooding Okavango, the elephant
graveyard) auto-clears at build time by its field radius.

## 4. Movement and time.

The character moves in the bird's-eye view; date and provisions advance with the journey
(calendar display, start 1890) — in the relaxed exploration preset (`design.md` §6.1) the
provision and canteen drain RATES default to zero, so the date advances while stocks drain
only once a non-zero rate is set in the debug menu. The movement boundary, Red Sea cut,
Mediterranean always-blocked rule and world trim of `design.md` §11.2/§3.1 hold. So do the
ropeless mountain climb with its warning and fall risk (§7/§11), the visible
movement-penalty reason incl. the canoe-on-land penalty and its once-per-type journal
announcement (§11.1, both languages, voice markup, flag in the checkpoint),
possession-based item effects incl. the canoe ride/drag depiction (§6.1/§7), and the
bird's-eye collision with trees and animals (§11/§19 — a fast step is caught at the near
edge with no tunnelling; small dressing and carcasses stay passable — only the large solid
dressing collides. EVERY collider here is DERIVED from the placement the renderer DRAWS —
the plant's `placedFloraAt`, the animal's own instance matrix, never its behaviour spot —
so nothing unrendered leaves a phantom collider, points 129/378). A blocked boundary never
PINS the traveller (§11.2, point 316): a blocked step resolves by SLIDING along it
(`slideAlongBlocked`, the shape the settlement and tree/animal resolves already use), only
a fully closed direction fan reports the blocked notice, and the passive current obeys the
same resolve (pt. 21).

## 5. Port city.

At least Cairo as the enterable starting port with trade (buying equipment, provisions and
gifts for `$`). Entering triggers the automatic checkpoint (`design.md` §18; simplified
saving is sufficient). Buy AND sell dialogs (shop buy-back, bazaar buy/sell, ferry) use
the same aligned price-table layout and buy gear back for the local currency per §9.

## 6. Village and cultural contact.

At least one enterable village with a chief's hut; a culturally correct gift is the
condition for a hint — not mere observation (`design.md` §12). The village trading post
barters the baseline goods for gifts and buys gear back for gifts — money has no value
there (§9).

## 7. Language/direction system.

The full system of `design.md` §13 is implemented: the regional direction systems and
glossary names of §13.2, taught by the village elder (a second talk reveals what the
region reveres, §8); hints combine landmark, direction word and coordinate (§13.1); a raw
hint deciphers retroactively in either order (§13.2).

OPEN (`design.md` §13.4): this criterion pins what is BUILT, not the target state.
Understanding the inhabitants is to become a central mechanic — learned by observing and
testing rather than handed over by an elder, with one invented-but-researched language per
region (a Chants-of-Sennaar-like direction; e.g. a West African drum-signal tongue). The
mechanic is undecided and needs its own research pass first, so §13.2's glossary and
§13.3's delivery are placeholders under review. Do not build on them — and do not PROTECT
them either: until the new mechanic is settled, disturbing this system is not a reason to
compromise a change elsewhere. Once it IS settled and built, it becomes load-bearing like
any other system.

## 8. Chronicle/journal.

A journal exists, grows automatically on events and stores hints (`design.md` §15); plain
text suffices (the animated handwriting is pt. 29). EVERY walkable place — port, village,
monument — is journaled on its first entry in its own ~1890 voice (§16), never a
boilerplate, and again on a changed situation; a `PLACES` sweep fails on a silent place.

## 9. Status bar.

Date, funds, provisions, gifts and current region are displayed per `design.md` §17.1 — no
hand-item slot, no permanent coordinates; transient status hints (e.g. the
movement-penalty reason, pt. 4) render CENTRED inside the status bar; each stat is led by
its symbol with the localized word as tooltip and the date reads DD.MM.YYYY; the inventory
item currently in use glows, and the health bar with its affliction badges sits inside the
bar's right end per §17.1 (never covered by the journal). Holding Ctrl names animals,
people and usable objects on screen (§17.8).

## 12. Atmosphere.

The atmosphere elements of `design.md` §19 are implemented — the ambient wildlife of
§19.2–§19.8 (streaming and carcass discipline, the predator hunt with its food webs and
feeding over its ragged ground stain, elephant herds and trampling, movement discipline
and body separation incl. the open-ocean backstop, vultures, shore and grazing life, and
the herds' family life with calf predation and water drama), §19.9's climate and landscape
dressing, §2.4's "Graphics and atmosphere", and §4.4's elephant-graveyard dressing
(readable at a glance).

SUPERSEDED AS A TARGET (user 25.07.2026, design.md §19.5): water is for crossing, not for
lingering — a FLIGHT is never restricted by river or lake at all, and the §19.5 revision
states it. The evidence section pins what is BUILT today.

OPEN: tree-climbing-to-flee (§9 open item), and the one seasonal-dress reading the
research allows but the figures cannot yet show — a wrap worn DIFFERENTLY in the cold
rather than in greater number (§19.13).

## 13. Real geodata.

The real-geodata terrain rendering of `design.md` §3.3 is implemented (DEM relief, ~1890
vector coasts/rivers/lakes without raster steps, biome-based PBR splatting, domain-warped
meandering biome borders).

## 14. Lighting and post-processing pipeline.

The pipeline of `design.md` §2.7 is implemented (IBL, physically grounded sky consistent
with the sun, cascaded shadows in the bird's-eye view, screen-space AO, bloom, filmic tone
mapping with color grading and a subtle vignette, and the water feature set: wave field,
depth-dependent absorption over real bathymetry, shore/crest foam). Its shader programs
build OFF the startup critical path: the first frames draw the ready set and the rest
links behind them, so the loading picture stands still no longer than the calibratable
`balance.startup.pictureFreezeBudgetMs`, which counts the WHOLE standstill — a renderer
busy inside one long frame included.

## 15. Lively, densely built settlements.

`design.md` §2.6 (dense non-functional building fabric, a recognizable path network,
surface micro-structure at eye height — ground grain/pebble relief, structured and
weathered building materials — inhabitants who believably use the settlement and their
homes, clearly highlighted functional buildings), §4.1 (settlement size mirrors real ~1890
importance; enlarged ports outscale villages), §19.10 (the village life vignettes) and
§2.5 (the surroundings panorama of the real map landscape, its relief capped, double-sided
and rock-shaded) are implemented, as is the §2.6 street rule: ports grow an organic lane
network (winding alleys, small irregular squares — no grid) whose buildings front their
lane with the door side, while every village follows its people's period-accurate ~1890
organising principle (design.md §4.5:
ring/street/compound/scatter/ksar/riverstrip/coastrow).

## 16. Collision inside settlements.

The collision rules of `design.md` §2.6 hold, incl. inhabitants using dwelling doors the
player cannot and every door onto reachable free ground. Rectangular buildings collide as
oriented boxes (exact corners, no gaps) and the clearance keeps the camera's near plane
out of every wall — pressing against one must never show its inside. A move is SWEPT from
the previous position (point 413): it stops at the first collider's near edge and slides,
never landing beyond it; a fence collides as the panel run the picture draws (a capsule
per panel, not a circle per post); each animal collides with the others. No inhabitant is
ever stuck (point 155): every walker errand target and animal grazing anchor has a clear
standing circle AND an escape direction against the FULL collider set, else nudged to the
nearest free spot; a walker pinned past `balance.walkerUnstuckSeconds` (debug-editable) is
teleport-nudged free — inhabitants only, never the player.

## 17. Localization.

The game is fully playable in English as well as German per `design.md` §17.7 (all
player-visible text from the language files, runtime language switch defaulting to
English, language-neutral journal storage re-rendered on switch, localized proper names;
another language must require only a new language file).

## 19. Journal voice markup and read-aloud.

The voice markup and read-aloud of `design.md` §15.2/§15.3 hold: every journal text in
both language files carries the markers, the UI never shows one, English entries narrate
via the in-browser Kokoro TTS with the markup shaping the delivery, a new entry
auto-narrates without a click, and narration blocked by the autoplay policy is deferred to
the first gesture instead of dropped. The journal is non-modal per §16.1 (movement
continues, only modal dialogs block; entering a building with SPACE at its door works with
the journal open), and the panel ends above the camp/map/journal toggles per §17.4. German
read-aloud stays an open item until a German-capable voice exists.

## 20. Comfort and audio settings.

The control/audio calibration holds:
mouse-look sensitivity defaults to 0.0011 rad/px, walk speed inside
settlements to 10 m/s, strafing and walking backward to 80 % of the
forward speed (a diagonal is never faster than straight; `design.md`
§2.2), the first-person eye height is 1.5 m, the view pitches with
mouse and right stick (inverted by default, clamped 85° short of
vertical by `balance.lookPitchLimitDeg`), a single ambience volume
(default 0.1) scales the whole soundscape incl. the §19.1 proximity
calls (a nearby animal's call rises and fades with distance); the
ocean surf is COASTAL (point 153): its gain fades with the distance to
the nearest coast — full within a calibratable near radius, exactly 0 at
and beyond a calibratable cutoff (`balance.surf.nearRadius`/`cutoff`) —
so it is heard at sea and in seaside ports but silent inland, and
per-source volume sliders sit over the master volume
(`balance.birdsongVolume` for the birdsong), all debug-editable; the
overland travel speed defaults to 5.6 (calibrated calm), and the
terrain relief items are tunable as factors (§11/§21.2). All of these
are adjustable at runtime in the debug menu (§21) in both languages.
The zoom behavior of §21.4 holds: the bird's-eye mouse-wheel zoom is
always active (0.125x-16x) starting at the closer default 0.5. A debug
checkbox gates zoom-out beyond that default (disabling clamps a wider
view back), and the unlocked range reaches a whole-continent view.
The camera near plane snaps back to the first-person
default the moment another scene takes the shared camera — entering a
settlement straight out of the debug zoom must never clip hut walls.
The menu itself is STRUCTURED (§21, point 393): its ~130 controls sit
in eleven named, collapsible groups — grouped by what a person is
doing when he opens the menu, not by the balance object a value lives
in — all collapsed at first, an opened one remembered for the session,
under a filter field that narrows the whole menu to the controls whose
localized label matches what is typed. The regrouping loses nothing: a
completeness pin in `src/ui/DebugMenu.test.tsx` names every control
and its group and fails on a dropped or an unannounced one.
The debug menu offers the §21.3 dropdown selectors
(jump-to: every named map point — ports, villages, monuments (point
273), mountains, waterfalls, lakes, cultural landmarks, natural sites,
the elephant graveyard and the tomb — grouped by category and alphabetically
sorted per group (`src/ui/DebugMenu.test.tsx`); equipment; gifts),
the read-only render-backend row and the journal
do-not-disturb option (§16.2; also F2); the §21.1 shortcuts hold (F1
menu, F2 do-not-disturb, F3 full loadout — all gear/treasures, 100000
gifts/dollars/provisions, full health, full canteen, no afflictions,
capacity raised to fit, the extended zoom unlocked, and travel speed
25 for fast test traversal (point 154) — F4 canoe
toggle — F6 the COMPLETE bug report in one keypress: a top-most modal
with an autofocused description field and one download handing out
picture, state JSON (incl. balance and UI), overlay
list and description as ONE zip named from the dump stem, the
reproduction summary — seed, position, region, date, travel speed,
graphics level — at the TOP of the JSON. The screenshot is read back
INSIDE a rendered frame (no `preserveDrawingBuffer` — it would cost
every player frame) and holds the scene ALONE; labels and HUD are
DOM and ride along in the overlay list, which the description file
states; F5 stays the browser's reload (it fires before
preventDefault can stop it, hence F6; the lower F-key that Windows Chrome
binds to Caret-Browsing is left to the browser) and F9 cycles the
GRAPHICS QUALITY LEVEL — low / medium / high (design.md §2.7/§21,
point 276 part B), default MEDIUM. Each press steps DOWN one level, wrapping the bottom to
the top: medium → low → high → medium. A `detailLevel` in `useUi` maps
through the `QUALITY_PRESETS` registry (`src/config/quality.ts`) to a
value for EVERY quality-relevant lever (dpr cap; SSAO/TRAA/bloom;
sun-shadow on/off + map resolution 1024/2048/4096; campfire shadows +
the 256²/512² soft variant; terrain refine; flora fog factor + cast
shadow; haze/rain intensity; calm water; wildlife density); the render
consumers read the current level through effective selectors (`effectiveSsao = QUALITY_PRESETS[
detailLevel].ssao && ssaoEnabled`, etc.) that NEVER clobber the
individual debug allow-flags — those still tune a feature within a level
(unlike `activateTouch`, which keeps clobbering; the touch preset stays a
SUBSET of low). SSAO is high-only; TRAA+bloom, SUN shadows and campfire
shadows are all off on low — `QUALITY_PRESETS.low.sunShadows` is FALSE
(point 305), so low casts no shadow passes at all and its 1024
`sunShadowResolution` is only the ladder's floor, never rendered;
the lever priority follows the real-hardware
benchmark (point 277: fill-rate first — dpr, post — geometry last). A
localized toast names the new level and a localized debug picker sets it.
ENFORCEMENT: a pure completeness gate (`src/config/quality.test.ts`)
asserts every level defines every quality key, so a new optical feature
added without low/medium/high entries FAILS (the §21 sort-into-levels
convention), and the per-level values are tabulated in
`docs/graphics-detail-levels.md`, kept in sync with the registry by
`src/config/qualityDoc.test.ts` (it fails if a preset value changes or a
key is added without the doc). The preset reads per level, the F9
cycle order and the completeness gate are pure-tested in
`src/state/ui.test.ts` + `src/config/quality.test.ts` (with `floraFogFar`
in `src/scenes/travel/floraStreaming.test.ts`), the F9 cycle +
preventDefault + non-clobber in `src/ui/Hud.test.tsx`; the debug menu's
graphics section is a SINGLE localized detail-level dropdown — the
per-setting graphics allow-flags (TRAA/SSAO/half/full/campfire shadows) are
no longer exposed there but remain internal store fields for the touch
preset and the F8 benchmark — asserted in `src/ui/DebugMenu.test.tsx`, and
the live F9 cycle + effective flips in `scripts/verify/settings.mjs`;
verifiable via `src/state/stateDump.test.ts` (the serialiser captures
every data field, drops the actions, stays deterministic, the summary
on top), `src/report/*.test.ts` (the zip an unzip accepts, the
assembly, the overlay snapshot incl. the doubled-label witness),
`src/ui/StateDump.test.tsx` (hidden by default, F6 opens with the field
focused, the typed text reaches the archive, Esc closes leaving focus
on no control, both languages, the F6 default prevented, F5 untouched)
and `scripts/verify/report.mjs` (a live F6 run on BOTH backends whose
PNG member is DECODED and must vary — a blank capture is a valid
PNG) — F8 the in-game render benchmark (point 277), the one
debug tool that SHIPS IN THE DELIVERED BUILD (the levers of point 276
must be priced on the USER's hardware, not on the headless one), its
runner LAZILY imported on the keypress so it stays out of the eager
startup chunks: it sweeps the ten graphics configs of §21.1 over one
identical route (dense savanna standing, empty desert standing,
driving out of the savanna — the anchors of `scripts/perf-bench.mjs`)
and DETERMINISTICALLY — a seeded PRNG installed over `Math.random` for
the run, world seed/date/position/travel speed/zoom/journal and the
event+deadline switches reset before every section, and a FIXED
simulation timestep (1/60 s) stepped a FIXED number of frames, so the
path and every roll repeat and only the measured wall-clock varies —
then offers the report (environment incl. backend/adapter/build
commit; per config THREE series — the REAL GPU time from the WebGPU
backend's timestamp queries, the CPU time inside the frame and the
wall-clock frame time, each median/p95/p99/max — plus fps,
`renderer.info` draw calls/triangles and a scene-graph triangle count
per system) as a downloadable JSON with a readable digest plus a copy
button, behind a localized modal whose Esc aborts and restores every
setting. The GPU series is the point: a page cannot disable vsync, so
a config 40 % dearer on the GPU moves NEITHER a capped wall clock NOR
the CPU time — exactly the geometry lever of point 276 would look
free. Where timestamps are unavailable (WebGL 2, or an adapter
without `timestamp-query`) the series is FLAGGED with its reason,
never fabricated, and the report names which series is the
trustworthy one (`headline`, in the digest and the result panel).
The sweep forces the HIGH level so every lever stays measurable; a
FINAL profiling pass (point 293, `LOW_CONFIG_NAME`) then applies the
actual LOW `QUALITY_PRESETS` values and reports, per route section at
low, the per-system scene-graph triangle share, the draw calls and the
same GPU/CPU/wall series — ranked most-expensive-first, with a digest
line naming the top remaining cost centres ("at LOW the frame is
dominated by: terrain 42 %, flora 28 % …") and a localized ranking in
the result panel, so a player on a slow PC sees WHERE the cost still
sits at low (design.md §21.1);
verifiable via
`src/systems/benchmark.test.ts` (sweep plan, route, fixed-timestep
clock, statistics, breakdown, report shaping, and the low profile —
`buildLowProfile` ranking only the low rows, null without them, and
the digest lines),
`src/ui/BenchmarkOverlay.test.tsx` (F8 starts the lazy runner and
prevents the browser default, Esc aborts/closes, both languages) and
`scripts/verify/benchmark.mjs` (a live `?bench=short` run: one row per
config × phase, the progress modal, the GPU series measured on WebGPU
and flagged-with-reason on WebGL 2, and every setting —
`Math.random` included — restored afterwards)); the
canteen's consumption
rates and capacity are editable (§21.2), as is the parental rescue
burst (`balance.family.rescueBurst`, §19.8 pt. 12 — the field's
write-through pinned in `src/ui/DebugMenu.test.tsx`). Modal windows and full-screen
overlays always render above the in-scene floating labels (§17.4).

## 21. Water realism.

The visual water realism of `design.md` §11.3 is
implemented (rivers in carved beds rendering as one continuous,
unbroken ribbon descending from source to mouth, bridged stray sea
points, a calm surface with a visible current strengthening at rapids
and falls, five white waterfall cascades with plunge-pool foam,
springs in open land, flat lake surfaces just above their carved
beds), the §11.3 mouth-junction and no-interior-notch rules (point
211: a sea-mouth ribbon carries `MOUTH_BRIDGE` axis points past the
coast contour into the receiving shelf, so no beach strip parts river
and sea; and each ribbon row lifts via the shared
`ribbonRowSurfaceAt` until every water-typed terrain sample across
its own band sits below the sheet, so a cross-sloping bank's carved
wedge can never poke a notch through the water — the reported Cairo
cut-out; the canoe float reads the SAME lifted rows, one formula in
`waterSurface.ts`), the §11.3 width/course rule (rivers wider than scale via the
calibratable `river.widthFactor` balance value — carved bed, ribbon,
water mask and clearances all derive from ONE width; the course
interpolated through the shared centripetal spline so no source
control point turns in a hard corner), as is the current's effect on
movement (§11.3): a passive
downstream drift every frame, scaled by the nearest river segment's
downstream direction and boosted near waterfalls (calibratable balance
values: `currentDrift`, `currentWaterfallBoost`,
`currentWaterfallRadius`), covering real distance so it advances time
and provisions (and ticks health/deadline) — never free movement.
Being swept over falls is gameplay via pt. 23 (waterfall-sweep event).
The current may never HOLD the traveller (§11.2/§11.3, point 316): a
river reaches the sea as SLACK WATER — its push ramps to nothing over
the last `balance.river.mouthSlackDeg` of a sea-ending course, while a
course ending at a confluence keeps its pace — the drift resolves a
blocked boundary through the same slide the overland move uses, and
EVERY sea mouth is swept for a pocket the current could hold a swimmer
in. Ribbon, mouth bridge and the ocean's impassability are untouched:
no new way off the continent.

## 22. Health and afflictions.

The health system of `design.md` §6 is implemented: a health pool drained by starvation
and the afflictions of §6.2 (fever delirium, dehydration with the canteen fill mechanics
and low-fill warnings of §6.1, sun blindness healing only outside the desert, light/severe
wounds), medicine as the instant cure, the staged natural wound healing of §6.2
(calibratable, debug-editable day counts — a wound alone is never an unavoidable death),
regeneration while fed and affliction-free, the remains report and successor on death
(§15.6), the health query (H), the wound shown on the traveler's bird's-eye figure scaling
with severity (§6.2), and vultures circling at poor condition (§19.6); health/afflictions
travel with the checkpoint; all drains/thresholds are balance values adjustable in the
debug menu, which also toggles afflictions for testing.

## 23. Random events.

`design.md` §14 is implemented as a hidden per-day roll while travelling, modulated by
terrain and state: the event kinds of §14.1 (with the predator danger order cheetah <
leopard < hyena < lion), the item-protection rules of §14.2 (by mere possession; rifle >
machete; against crocodiles the machete always, the rifle only from the canoe), the
first-time danger warnings of §14.4 (incl. the canoe-aware water warning that never
advises what is already in use), and the direct attack on walking into a wandering
bird's-eye predator (§19.3; same protection/outcome rules, rate-limited by the event
cooldown and suppressed with the random-event system). Wounds/afflictions feed the health
system (pt. 22), fatal attacks end in the remains report, and every event is told through
a journal entry in both languages with voice markup (§16). Rates are balance values
calibrated low so events are rare, and in the relaxed exploration preset the whole
random-event system defaults to OFF (§14.3); the debug menu toggles it on and triggers
each kind directly (§21.3), and the §14.4 first-time danger warnings stay active either
way.

## 24. Deadline and successor.

The multi-year deadline of `design.md` §5/§18 is implemented (balance value, ~5 years)
with staged journal warnings at 60 % and 85 % of the granted time — each exactly once, in
both languages — the recall on expiry (defeat overlay, journal silent, no successor), and
the §18 successor flow on death (pt. 22): resume at the last checkpoint, day penalty,
silently inherited warning stage, takeover entry.

TEMPORARY (`design.md` §5.1, user 16.07.2026): the deadline is SUSPENDED in the shipped
config (`balance.deadline.enabled` false) — the expedition never ends on time; instead the
calendar STOPS at 31.12.1895, the end of the game's window, at every day-advancing path.
The mechanism stays implemented and tested (the tests enable the flag), so lifting the
suspension is a one-value revert. Do not delete the deadline code, and do not "fix" the
tests by dropping the flag.

## 25. Trade economy.

`design.md` §8/§9/§10 is implemented: shovel-recovered treasure caches (one per region
plus a statue site, placed anew each run) and the elephant graveyard's limited random
ivory hauls (§4.4); the capacity-limited inventory (balance value — buying or digging
beyond it is refused; the debug menu edits capacity and gift count and auto-raises on
overfilling debug adds, §21); the bazaar with regional value factors, buy/sell spread and
the standing per-port quote (§10); the travel agency's ferry passages between all ports
with distance-based fare and duration (Zanzibar reachable); discovery bounties credited on
the next port visit as a telegraphic transfer whose journal entry names the discoveries
and the amount (the known-from-start places of §17.2 — the ten ports and the Giza monument
site — earn no bounty for themselves, §17.2/point 288/point 273), and kind-flavored
first-sighting entries for landmarks (§10, once per landmark, both languages, voice
markup) — including the eight built cultural landmarks of §4.4 (Meroë, Giza, Great
Zimbabwe, Lalibela, Kilwa, Aksum, Gondar, Bandiagara), framed as African achievements, and
the four natural point-landmarks (Ngorongoro, Ol Doinyo Lengai, Okavango, Sudd); the
valuable-presentation reactions of the §8 matrix; and the baseline goods in every
settlement with money in ports and gifts in villages (§9). All new texts exist in both
languages with voice markup.

## 26. Standing with the natives.

The reputation system of `design.md` §12 is implemented: hostility and expulsion on a
rejected gift with the hostility period and its wear-off, the "Honored Friend" status with
its pledge journal entry and regional protections (attack outcomes capped at lightly
injured with rescue entries naming the people, near-death aid with cooldown, free village
supplies), and the robbery behind a deliberate safety confirmation with its rich haul
reported in the chronicle and its permanent regional consequences incl. the irretrievably
forfeited friendship. Item effects are possession-based (§6.1/§7): merely carrying a rifle
blocks no audience and scares no villager. All new texts exist in both languages with
voice markup.

## 27. Camps (item caches).

The camps of `design.md` §6.3 are implemented: free camps pitched (or reopened nearby)
with C in the open, holding any number of inventory items (taking back respects the
inventory capacity; storing the canoe leaves it behind, dropping its land penalty), marked
with the map X and the bird's-eye pole marker, with the per-day looting risk (balance
value) revealed by a journal entry on return; village caches gated by "Honored Friend",
persistent, and irretrievably destroyed by a robbery in the region. All new texts exist in
both languages with voice markup.

## 28. Full saving and loading.

The port-snapshot saving and tabular load overview of `design.md` §18 are implemented —
one snapshot per port visit (a placeholder cap keeps only the most recent ones), the
overview table with port city, in-game date, money, food, gifts and health state, manual
saving omitted. A legacy single-slot checkpoint migrates as one table row; the successor
(pt. 24) resumes from the latest snapshot. All menu texts exist in both languages.

TEMPORARY (user decision 24.07.2026): the LOAD side is SUSPENDED for the PoC — the startup
"a saved game was found — load it?" prompt is disabled (`SAVE_LOAD_ENABLED = false` in
`src/ui/Hud.tsx`), so every launch begins a fresh expedition with no popup. Saving still
runs (the snapshots and the successor flow are untouched and tested), and re-enabling is
the one-value flip. `scripts/verify/flow.mjs` asserts the inverse of the old behaviour:
with a checkpoint seeded, NO start overlay appears and the game runs.

## 29. Animated handwriting.

The animated handwriting of `design.md` §16.3 is implemented (stroke-by-stroke reveal
behind the pen hand, click-to-finish, the wound level on the hand, persistent blood traces
on pages written by a wounded hand, no entry for a dead character — the remains report
takes over, pt. 22 — and silent writing under do-not-disturb, §16.2), and the journal
keeps the newest content in view per §15.4.

## 30. Gamepad and position query.

The gamepad controls of `design.md` §17.5 hold (left stick merged with WASD, right stick
first-person turn, the button-to-key mapping via synthetic key events — no second input
path — standard-mapped pads only, and the deliberate-input engagement guard against idle
axis drift), and the position query (§17.1/§3.2) reports the current coordinates and
region as a localized toast on P — the way to read coordinates, which are never shown
permanently.

## 31. Settlement orientation and panorama wildlife.

The gift-unlocked building orientation of `design.md` §17.3 holds (pulsing markers on the
important, enterable buildings after the first accepted gift, persisted per settlement,
announced by a localized toast), as does the §2.5 panorama wildlife (region-typical
silhouettes drifting beyond the settlement edge — far and small, hazed toward the sky,
standing on the ground the frame DRAWS under them rather than a monument looming or
clipping to a black sliver; points 92/94; their species the region's own bird's-eye pool
and never crossing a fixed skyline landmark, point 102). The footing is the higher of the
backdrop relief at the silhouette's own spot and the settlement's visible ground line —
the sight line over the walkable ground disc's edge from the live camera (`panoramaStandY`
/ `discHorizonY`, point 181). Outside the disc the backdrop may rise but never sink below
the ground plane, and a ring is pinned on the disc edge, so at any place the walkable
ground meets the panorama with no edge, no unlit face and no hole (point 381). The
silhouettes WALK rather than glide (point 255): built with pivoted legs, they swing them
on the shared distance-driven gait phase (`gaitPhase`/`legSwingAngle`) fed by the arc they
drift along their ring, so a faster one steps faster and a stalled one stands still — a
wall-clock bob is never the driver. They only ever walk FORWARD (point 286): the facing is
DERIVED from the ring velocity tangent (`panoramaDriftYaw`, the codebase's atan2(vx,vz)
convention), so a silhouette can never reverse, and the stride phase rides the arc
expressed in the silhouette's OWN rendered frame (`panoramaGaitDistance`, the world arc ÷
its enlargement `scale`), so the leg cadence stays consistent with the rendered body's
slow horizon crawl.

## 32. Render pipeline upgrades.

TRAA, screen-space reflections and true water refraction (`design.md` §2.7) were rebuilt
in small backend-neutral steps, each confirmed on real hardware — the lesson from the
reverted first attempt, whose untested WebGPU-only TRAA/SSR branch rendered a black scene.
Step 1 is done and accepted: TRAA runs backend-neutrally (upstream `TRAANode`, velocity
MRT, MSAA off), passed its manual WebGPU check (stable across repeated toggles, visually
on par with 4× MSAA) and is on by default; the debug checkbox (`design.md` §21.3) switches
back to the render pass' MSAA. Step 2 (SSR) was delivered, then REMOVED by user decision:
with the bird's-eye camera never at grazing angles and the first-person scenes having no
water or gloss, no in-game situation makes it read — so the pipeline reads exactly as
after step 1. True water refraction remains OPEN.
