# Acceptance criteria — detail (CLAUDE.md §7.1)

The full detail of the two largest acceptance criteria, §7.1 no. 20 (comfort, audio and
the debug menu) and no. 21 (water realism). Moved out of CLAUDE.md because that file is
sent with EVERY turn of EVERY session and inherited by every delegated subagent, while
this detail is needed only when the criterion is worked on or closed — the same move the
evidence chains made to docs/acceptance-evidence.md. The wording is moved verbatim, under
the SAME numbers; nothing here is repeated in §7.1, which keeps the criterion's number,
its bold title, a short acceptance condition, the `Detail:` pointer and the `Evidence:`
line. A criterion and its detail section change in the SAME commit.

---

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
