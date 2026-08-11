# TASKS — sequential feature batch

The OPEN work order. A ticked point moves, verbatim and with its number, into
`docs/tasks-archive.md`; `tasks-archive-guard` blocks a tick left behind here.
States are `[ ]` open and `[x]` done — nothing in between.

**Where the rules live.** The build, the test tiers, the branch/merge workflow
and the closing cycle are in CLAUDE.md (§5, §6, §7.2, §9), not here. The WORKING
ORDER is the dashboard's Warteschlange, held by `queue-order-guard`; ordering prose
here went stale describing finished points, and a second place for one fact is
the drift this project keeps paying for.

This file and every entry in it are written in English. Commit messages never
reference the point number.

**A point may state its acceptance condition machine-readably**, because prose
alone let a point be ticked for feeling finished. A body line beginning `PROOF:`
names a command; the tick is refused until it has run at the CURRENT HEAD
(`node scripts/point-proof-guard.mjs --ran <N> --evidence "<result>"`; `--status`
lists what is outstanding). Opt-in, EVERY such line demanded, and one inside a
code span or quotes — as here — is prose, not a demand.

## Regression command

```sh
npm run test:unit   # fast layer (jsdom) — always
npm run test:small  # + the everyday browser gate
npm test            # LARGE: build → lint → vitest → every suite → preview
```

Per point: build + lint + audit + the whole Vitest layer, plus the browser suites
the diff touches. LARGE is mandatory on a scene core (TravelScene/Wildlife/
PlaceScene, the renderer/post pipeline, store.ts), at every ~4th point as a
collective gate, before every closing, and whenever a flake retry failed twice.

Diff → browser-suite mapping: `src/i18n/` → i18n · store/systems logic → Vitest
only (flow if the core loop is touched) · `src/scenes/place/` → collision,
polish, settings · `src/scenes/travel/` → enrichments, events, health ·
`src/render/` → settings, enrichments, polish · `src/ui/` → i18n, enrichments,
settings, flow · journal/TTS → voice, handwriting · `src/world/` → world,
enrichments · `scripts/verify/X.mjs` → X itself · `*.md` → docs. When unsure,
include the suite.

Flake policy: if exactly ONE suite fails on a check from this list — its only
home — rerun that suite standalone once; green counts and is noted in the tick,
red twice is a real investigation. The list: the movement 0.00 m read, the bathe
probability, TTS timing, the calf-sacrifice behaviour window, frame-starved
screenshot probes, the spawn body-spacing settle window. WATCHDOG: if this
scoping ever lets through a bug a full run would have caught, report it to the
user at once and the policy is reconsidered.

**Every point adds a test on the appropriate layer** — Vitest for anything
assertable without a browser, a browser suite only for the
scene/RAF/geometry/CSS/audio/screenshot cases (`scripts/verify/README.md`).

On failure after correction attempts: STOP, report, do not build on a broken base.
Tests are never weakened; a red run is fixed in the production code.

**Where doc updates go (user 26.07.2026):** CLAUDE.md §7.1 states WHAT must hold,
`docs/acceptance-evidence.md` proves it under the same number. A changed or added
behaviour updates BOTH in one commit; a point that only adds a test touches the
evidence alone. Older specs saying "CLAUDE.md §7.1" mean both halves.

## Work packages (bundles)

Open points are worked in BUNDLES: one branch, one verification, one regression
round, a commit per member point. `docs/work-packages.md` is the table — which
point sits where, what stays unbundled, in what order. Every open point appears
there exactly once; a new point joins a bundle when appended.

## Checklist

- [ ] 648. THE CHILDREN SNAG, JITTER AND CLIP THROUGH EACH OTHER (user F6 reports
  11.08.2026, 19:08–19:11, all three from ONE state — `local/bugreports/`
  `KindHaengtKurzFest.zip`, `KindZittertAufStelleHerum.zip`,
  `KinderKlemmenKurzIneinander.zip`; seed 2972259115, `place` mode in the bambara-village,
  west region, production build e1bd2fa, WebGPU, quality medium, viewport 1899×984 @dpr
  1.25). Three symptoms of ONE system, filed as one point because they share the child
  steering code and must not be split across branches:
  1. "Kind hängt kurz fest" — a child stops moving for a moment and then frees itself.
  2. "Kind zittert auf der Stelle herum" — a child jitters in place instead of walking,
     which is the signature of a target it reaches and overshoots every frame, or of two
     forces cancelling.
  3. "Kinder klemmen kurz ineinander" — two children occupy the same space for a moment
     before separating, so the separation either acts too late or is overridden.
  THE USER IS BLOCKED ON THIS: he reported it while trying to exercise the communication
  mechanic (§13/§19.10 — the teaching children), and jittering, snagging children make that
  untestable. That is why it stands at the head of the work order.
  WHERE IT LIVES: `src/scenes/place/childSituations.ts` and `lifeSpots.ts` (what a child is
  doing and where it stands), `tagGame.ts` (the chase that moves them), `collision.ts` (the
  swept move and the separation between inhabitants), with `inhabitantBodies.ts` for the
  radius each one occupies. The state dump carries no per-child runtime state, so the
  reproduction is in-game at that seed.
  FINAL STATE: all three are traced to a NAMED cause and fixed there — not damped by
  raising a smoothing constant until the symptom stops showing, which would leave the
  cause and cost the next reader the same hunt. A child that reaches its target settles
  instead of oscillating; two children never occupy one another's radius, however briefly;
  and no child is ever held motionless by geometry it should walk around. Where two of the
  three share one cause, that is stated rather than split into three fixes.
  VERIFIABLE: Vitest over the pure steering — a child at its target does not oscillate
  across frames (its position converges rather than alternating), two children pushed into
  one another separate within one step and never overlap, and a child pathing past a
  building corner keeps moving. Plus the browser layer at the reported seed: the children
  are watched over a run of frames and no child's position alternates, freezes or overlaps
  another's radius. Judge it by WATCHING them, not only by the assertions — the complaint is
  what the player sees.
  Criticality: high — it is what the user is blocked on, and it is the visible surface of
  the settlement the whole communication PoC is played in. Bundle: Dorfleben.

- [ ] 581. THE SETTLEMENT BOUNDARY IS TOO FAINT, AND ITS SLIDER IS ALREADY AT THE CEILING
  (user 09.08.2026, F6 report `local/bugreports/DorfgrenzeSchlechtErkennbar.zip`: "Die
  Dorfgrenze ist zu schlecht erkennbar. Der Kontrast muss höher sein"). MEASURED from his
  state: `placeEdgeBand` stands at the shipped defaults, `widthM: 3`, `wanderM: 0.9`,
  `strength: 1` — and `strength` is documented as "0 (invisible) .. 1 (the full per-kind
  look)". He is therefore already looking at the STRONGEST edge the game can draw, and it
  is not enough. This is not a calibration miss: there is no knob left to turn, so the
  per-kind look itself carries too little contrast against the ground it sits on.
  FINAL STATE: the boundary READS at a glance from inside the settlement, at the walking
  pace and eye height the player actually has, in every settlement kind and on the ground
  colours they stand on — the Bambara village's pale sand is the case that failed, so it
  is the case that must be shown to work. The contrast comes from the band's own design
  (value against the surrounding ground, not hue alone — the report is from a sand-on-sand
  village), and it stays a give-way rather than becoming a painted stripe: the §2.6 look
  is a threshold the player reads, not a fence. `strength: 1` remains the full look, so
  the ceiling moves with the design rather than being raised past it.
  VERIFIABLE: the PICTURE decides, since the complaint is legibility — a first-person
  frame from inside the settlement at the boundary in at least the Bambara village and
  one contrasting settlement kind, on BOTH backends, judged by looking. Plus a pure test
  pinning the contrast the design settles on (the band's value against the sampled ground
  value stays above the chosen minimum for every settlement kind), so a later ground or
  palette change cannot quietly erase it again.
  Criticality: medium — the boundary is what tells the player where the settlement ends
  and the bird's-eye view resumes; §2.6 and criterion 15 both rest on it being legible.

- [ ] 453. WHAT IS THE LION EATING? (user bug report 30.07.2026,
  `local/WasFrisstDerLoewe.zip`, seed 1608676381, east region at the river, WebGPU/high:
  "Er scheint zu fressen und die Geier kreisen, aber ich sehe keine Beute"; bundle Kadaver &
  Geier). In the frame the lion stands head-down in its feeding pose, vulture shadows circle
  over the ground — and there is no prey body anywhere. Two candidates, both consistent with
  the code: (a) the carcass was consumed (`carcassSeconds` reached 0 and it was removed) while
  the feeding pose and the vulture staging carry on — a state that does not clear when its
  subject disappears; (b) what remains is the prey remnant of `Wildlife.tsx` (the scrap left at
  the kill site), which renders as a small white sphere and reads to a human as nothing at all.
  Find out which by reproducing from the seed, then fix so that the picture always answers the
  question: while a predator feeds, something recognisable as prey lies under it; when the
  carcass is gone, the pose and the vultures end with it.
  VERIFIABLE: Vitest on the behaviour — a predator's feeding state cannot outlive its carcass,
  and a remnant that keeps vultures on station is itself renderable; plus a browser frame from
  that seed showing predator and prey together, on both backends.

- [ ] 628. THE HOLD-CTRL LAYER LABELS A CAMP TWICE AND NAMES THE PLAYER'S OWN BOAT
  (found 11.08.2026 while re-testing the roster for point 600, and deliberately not fixed
  there: both halves are a judgment about what the layer PROMISES, not a defect in the
  state coverage that point closed).
  FINAL STATE:
  1. A PITCHED CAMP CARRIES EXACTLY ONE LABEL. `CampMarkers` in
     `src/scenes/travel/TravelScene.tsx` draws a permanent `map-label` reading
     `labels.camp` AND registers the same object with the hold-Ctrl layer, whose text is
     that same word — so holding Ctrl stacks two identical boxes over one camp. The camp
     STAYS in point 342's roster, which names "a pitched camp, a set-down canoe"
     explicitly, so the cure is the one the elder already uses: an object that carries a
     permanent label of its own is not offered a second time by the Ctrl layer, whoever
     draws it. Stating that as a rule about permanent labels, not a per-object exception,
     is the point — a second exception list would rot the way the first one nearly did.
  2. THE TRAVELLER'S OWN CANOE IS NOT NAMED. The marked canoe groups at the same call site
     are the boat the player rides or drags. The layer's promise is "what am I looking
     at", and the player's own vehicle is not that. A canoe SET DOWN in the world keeps
     its label, per the same roster line.
  3. TWO LABELS NEVER OVERLAP INTO ONE UNREADABLE BOX (seen 11.08.2026 in
     `verification/148-ctrl-actor-labels-village.png`, the point-600 evidence frame). Where
     two villagers stand close, their boxes overlap and the picture reads "Villager llager"
     and "Villa Villager" — each label is correct, the PICTURE is not, and no test looks at
     it because every check asks the DOM whether the text is present. The layer therefore
     declutters: boxes that would overlap are offset, or the further one is dropped while
     the nearer keeps its name. Which of the two is a judgment to make at the picture, on a
     crowd, not in the abstract.
  VERIFIABLE: the pure source/roster test gains both cases — a pitched camp yields exactly
  one offered label, a ridden or dragged canoe yields none while a set-down one yields its
  own; the declutter is judged AT THE FRAME on a crowded village, since a DOM assertion is
  exactly the proxy that let this through; plus the browser check that asks the scene what
  it DREW asserts that no two labels of identical text stand at one position.
  Criticality: low — nothing breaks, but a doubled box is exactly the noise the elder
  exception exists to prevent, and naming the player's own boat makes the layer read as
  though it labels everything indiscriminately.


- [ ] 651. THE VILLAGE DRUM BED IS A 1.9-SECOND LOOP (user 11.08.2026, testing the deployed
  `main`, build e1bd2fa, in the Bambara village: "Das monotone Trommel-Ambient-Geräusch nervt
  übrigens total.").
  MEASURED: `emitDrums` in `src/systems/ambience.ts` plays ONE hard-wired bar — step 0.24 s,
  pattern [1, 0, 0.6, 0, 1, 0, 0.6, 0.4], always the same 130→55 Hz sine envelope — and the
  emitter fires it every 2.2 s for as long as the player is in the village
  (`emitter('drums', 2.2, 2.2, emitDrums)`, target volume 0.5 in the village, 0.18 nearby).
  There is no second figure, no rest between bars, no dynamics, no randomness. What the player
  hears is exactly that: a 1.9-second loop running for the whole visit.
  THE CONSTRAINT THAT DECIDES THE SHAPE: the drums are not only ambience. The drum MESSAGE
  (`src/communication/drumMessage.ts`) carries meaning, and the player must be able to tell the
  meaningless bed from the message. Any fix that merely makes the bed more varied must not blur
  that line — the bed stays recognisably the bed.
  FINAL STATE: the bed has rests and variation — several patterns, shifting accents, silence
  between phrases, slight tempo/pitch spread per village — and stays timbrally separate from the
  message drumming. It thins out the longer the player stays. Every value is calibratable in
  `src/config/balance.ts` and adjustable at runtime in the debug menu (CLAUDE.md §2).
  VERIFIABLE: Vitest over the pure pattern selection — variation across N bars, a guaranteed
  share of rests, never the same pattern twice in a row, the per-village spread — plus the
  existing mix check that the speech syllables stay audible over the bed (DRUM_BEAT_PEAK,
  point 605). Whether it still annoys him is the user's judgement against the deployed build,
  asked once this lands.
  Criticality: medium — it is a sound the player cannot escape while in a village, and it sits
  next to the mechanic he is meant to be listening to. Bundle: Ton.

- [ ] 641. THE GIZA EDGE CHECK REDS ON WEBGPU AND NOBODY KNOWS WHY (measured 11.08.2026 on
  branch `feat/600-ctrl-label-states`, head fde5a652). `polish` on WebGPU: `giza (wet): the
  swept ground inside is measurably darkened, the open land outside is untouched — inside
  ×0.905 · boundary ×0.951 · outside ×0.963`. It appeared in ONE of three full runs; the same
  section run three times in isolation on the same backend and head passed 3/3. That is
  exactly the state point 640 forbids closing on repetition, so it is filed instead.
  FINAL STATE: the cause is NAMED with evidence — a genuine intermittent in the sweep's
  darkening, a measurement that samples before the ground has settled, or a threshold that
  sits too close to the values it separates (0.951 against 0.963 is a 1.2 % margin, which is
  the first thing to check) — and fixed at that cause. The throttle probe of point 640 is the
  instrument: if the red reproduces under throttle, it is timing; if it never does, the margin
  and the sampling are the suspects.
  WORK ALREADY STANDS ON A BRANCH (11.08.2026). `feat/641-giza-edge-red` is PUSHED at 8eaa9a6f
  — three commits: a ground crop read by its MEDIAN so a rain streak cannot fake the edge band, that
  crop helper classified as the pure decision layer it is, and a soak budget a loaded machine can
  meet. The agent was STOPPED mid-run to free a pool slot for the user-blocking point 648, not
  because the work was wrong. Whoever takes this point RESUMES from that branch and re-runs the
  throttle probe on both backends, which is exactly where it was interrupted.
  VERIFIABLE: the failure reproduced deterministically by a named mechanism, then absent after
  the fix by the same mechanism; `polish --section=settlement-edge` green on both backends,
  three runs each, on a quiet machine AND under throttle.
  Criticality: medium — no player sees it, but an unexplained red on the release branch makes
  the picture gate untrustworthy exactly where the release needs it.

- [ ] 633. THE RELEASE'S CLOSING RUN — TWO REGRESSIONS WITH THE CLEANUP BETWEEN THEM (user
  11.08.2026, splitting point 174: "Dafür scheint mir die Schätzung von 1 h viel zu wenig
  zu sein"). 174 carried the whole release in one card estimated at ~1 h, which was true
  when it meant "tag and publish" and is false now that the closing run hangs off it.
  Measured on this tree: one LARGE regression is ~42 min of runtime (the SMALL tier ~8),
  and it is run TWICE with "flake-free" allowing repeats; the cleanup reads 761 code files
  / ~240k lines and 39 documents / ~534k words, and it is read TWICE because both models
  read blind of each other. So the work is a day or two, and it is not the tagging. This
  point IS that work; 174 keeps the irreversible last hour.
  ORDER: it runs AFTER point 631 (which anchors the sequence in the closing checklist) and
  AFTER 634, so its cleanup already merges through the third model, and BEFORE 174. Running it before 631 would prove nothing — nothing would hold the order of
  its own steps.
  FINAL STATE, in this order, each step recorded through `scripts/closing-guard.mjs --step`:
  1. FIRST full LARGE regression on BOTH backends at the HEAD to be released, flake-free,
     plus lint and the dependency audit.
  2. THE CLEANUP, as a BLIND-PARALLEL four-eyes stage (CLAUDE.md §6): GPT-5.6 Sol and
     Opus 5 work from the same inputs — the whole of `src/`, `scripts/` and every `.md` —
     to their own COMPLETE list of legacy cruft (dead code, stale docs, stale comments,
     contradictory or orphaned prose), NEITHER seeing the other's result before both are
     done. The two lists are then merged into a union deduplicated BY MEANING, keeping
     both readings wherever it is unclear that one subsumes the other, MARKING what only
     one side found, and dropping nothing for being unusual. Every entry is then decided:
     removed, kept with a written reason, or filed as its own point.
  3. SECOND full LARGE regression on BOTH backends, at a HEAD that includes the last
     cleanup commit — this is the run 631's order check measures.
  4. The remaining §9 steps: implementation sections, the graphics-detail doc, the §7.1
     acceptance criteria with evidence, open items, simplifications.
  THEN 174 takes over: report "ready to tag" and wait for the user's go.
  VERIFIABLE: `node scripts/closing-guard.mjs --status` shows every step recorded with its
  evidence, the second regression's evidence naming a commit younger than the youngest
  cleanup commit; both regression runs green on both backends; and the cleanup's union
  documented with, per entry, which model found it and what was decided.
  Criticality: HIGH — it is what the tag certifies, and v0.2 shipped with these steps
  skipped.

- [ ] 174. Tag the demo build `v0.3` and publish it at
  https://patrickvonmassow.github.io/Heart-of-Africa-Remake/v0.3/.
  GATE (user 10.08.2026, replacing the 19.07.2026 wording): v0.3 no longer waits for
  EVERY open bugfix — that gate was unreachable and pushed the release out
  indefinitely. What must be closed is exactly two classes:
  1. the CRITICAL bugs (the tier-c block at the head of the work order — anything that
     ends the player's session, loses the expedition, or voids a verification), and
  2. everything on the COMMUNICATION MECHANIC, until the PoC is in a usable state —
     that is the release's purpose.
  Everything else — visuals, ambience, wildlife, the big audits — ships AFTER v0.3.
  AND THE USER MUST HAVE GOT THROUGH THE MECHANIC ONCE (his decision 11.08.2026, 19:16:
  "Wir sind weit von einem brauchbaren Stand der Kommunikationsmechanik entfernt. Wenn die
  gemeldeten Bugs behoben sind, kann ich überhaupt mal anfangen, das eigentliche Feature zu
  testen."). Green gates are not enough: as long as the reported defects keep him from
  reaching the communication mechanic at all, nobody has tested what this release exists
  for. So the gate also requires one completed play-through of the mechanic on the
  deployed `main`, by the user. This tightens condition 2 above, it does not replace it.
  THE CLOSING RUN IS ITS OWN POINT (user 11.08.2026, on the estimate: the ~1 h here was
  true when this meant "tag and publish"). The SEQUENCE is binding and runs BEFORE this
  point: full LARGE regression on both backends → the blind-parallel four-eyes cleanup of
  legacy in ALL code and ALL documents (CLAUDE.md §6, closing step
  `cleanup-blind-parallel`) → a SECOND full LARGE regression after the last cleanup commit
  (`regression-after-cleanup`) → and only THEN the user's go for the tag. Point 633 carries
  that run; point 631 anchored the order in the closing checklist, which refuses a tag
  while the second regression does not stand after the cleanup. What
  remains here is the irreversible last hour: the tag, the `poc` move, the deploy and the
  check that the URLs serve the new state. No tag is cut on an unclosed state: this point
  is never ticked without a complete closing run recorded at the very HEAD that carries
  the tag, so the checklist gate holds here as much as it holds on 633.
  FINAL TAG HELD FOR THE USER. The tag and the /v0.3/ publish are the one
  irreversible, outward-facing step: do ALL the work up to it, then report "ready to
  tag" and WAIT for the user's explicit go for that tag (`tags-only-on-request`).
  When it comes, tag `v0.3` at that HEAD, MOVE the `poc` tag to the same commit, and
  run the deploy via `workflow_dispatch` — the Pages workflow enumerates every `v*`
  tag plus `poc` dynamically, but a tag push alone does not trigger it. Then VERIFY
  that /v0.3/ and /poc/ serve the new state, and FREEZE the tag: it is never
  re-pointed.

- [ ] 642. EVERY CHECK THAT CAN BE LOAD-PROOF IS MADE LOAD-PROOF, AND THE REST SAYS SO (user
  11.08.2026: "Was ist mit dem Problem, dass nicht alle Tests Last-resistent sind? … Das muss
  nicht mehr vor der 0.3 passieren, aber möglichst bald danach"). The rebuild that replaced
  wall-clock waits with waiting on the app's own state was applied CASE BY CASE, never swept:
  measured 11.08.2026, the bird's-eye half of the Ctrl-label check had taken the one-moment
  snapshot on 08.08., the settlement half never did, and the same defect reappeared there
  three days later. Nothing forbids the pattern, so the next one will appear again.
  THE TWO KINDS MUST BE SEPARATED, because "no test may fail from load" is only half
  achievable and pretending otherwise would produce a green that means nothing:
  1. A STATE check — does this exist, is it drawn there, does the label read that — CAN be
     made load-proof, and must be: poll on the app's own frames or state until the answer is
     stable, read every side of a comparison in ONE evaluation, never compare two separate
     round trips. Sweep every `scripts/verify/*.mjs` for the pattern and fix each site.
  2. A TIMING check — frame budget, animation smoothness, how long a step takes — is
     load-sensitive BY NATURE. It is not made load-proof; it is RECOGNISED: under load its
     verdict does not count as evidence (the runner already prints exactly that) and it is
     reported as UNMEASURED rather than red, so a loaded machine can never manufacture a
     failure nor hide one.
  3. A GATE keeps the pattern out: a pure test over the verify sources refuses a comparison
     assembled from two separate `page.evaluate` calls. The agent that found this case left
     the gate undone on purpose and asked for the decision — this point is the decision.
  VERIFIABLE: the sweep names every site it changed and every one it deliberately left,
  with which kind it is; the gate fails on a re-introduced two-round-trip comparison and
  passes on the fixed shape; and the throttle probe of point 640 shows 0/8 skew for each
  repaired state check that previously skewed.
  Criticality: HIGH — a suite that can fail from load makes every red arguable, which is the
  door point 640 closes from the other side.

- [ ] 630. A SHELL WRITE INTO `.claude/` RAISES A PROMPT IN THE USER'S VS CODE WINDOW
  (measured twice 11.08.2026 — once by a delegated agent, once by a direct probe; user
  requirement the same day: "Es dürfen niemals Rückfragen hier in VS Code kommen"). THE
  RULE, as measured: a write by SHELL REDIRECTION into `.claude/` raises the harness
  permission prompt regardless of our settings. `echo probe > local/perm-probe.txt` runs
  through unasked; the identical line against `.claude/perm-probe.txt` asks. Both settings
  files already allow Bash as a WHOLE tool with `defaultMode: dontAsk`, so the prompt comes
  from a protection layer ABOVE the allowlist and cannot be switched off by an entry in it
  (the five narrow entries in `.claude/settings.local.json` are the trace of earlier
  clicks, not the cause). Node scripts writing the SAME files through `fs` — `board.mjs`,
  `board-queue.mjs`, `batch-*.mjs`, `queue-rank.mjs` — never ask; not once across a whole
  night.
  FINAL STATE, without editing `settings.json` (editing it would itself raise the prompt):
  the PreToolUse chain already holds two guards on the Bash tool (`closing-guard.mjs`,
  `firewall-guard.mjs`). One of them gains a check that DENIES a shell line carrying a
  redirection, a `cp`/`mv`/`tee`/`sed -i` or an `rm` into `.claude/`, with a reason naming
  the right way instead — the project script that owns that file, or the Write tool. A
  hook's deny arrives BEFORE the prompt, so it turns a question to the user into an
  instruction to the agent. Separately, no test may write its state into `.claude/`: it
  goes to a temporary directory passed by environment variable, the way
  `decision-card-guard` already does with `DECISION_CARD_GUARD_STATE` — that is exactly
  what the point-590 agent got stuck on.
  VERIFIABLE: Vitest cases over the pure matcher — each of the write forms above against
  `.claude/` is denied with the naming reason, a read (`cat`, `grep`, `node … --status`)
  and every write outside `.claude/` passes untouched, and a `.claude` substring inside an
  unrelated word or path does not trip it; plus a test-hygiene case that no test writes
  into `.claude/`.
  Criticality: high — the user has forbidden prompts in that window outright, and a prompt
  in an unattended session is a stall nobody is there to clear. Bundle: Modell & Wächter.

- [ ] 632. A LESSON COUNTS AS SERVED THE MOMENT ITS ENFORCER IS NAMED — NOT WHEN IT STANDS
  (user 11.08.2026: "Lehren sind schön und gut, aber es muss sichergestellt werden, dass sie
  auch eingehalten werden." MEASURED against the directory `docs/analysis_de/lesson-mechanisms.md`,
  107 lessons: 53 class 1 (an existing enforcer widened), 30 class 2 (a new enforcer), 24
  class 3 (a stated gap). But 29 entries name a REMAINDER that is not enforced today, mostly
  in the words "until point NNN is built, nothing protects against this pattern" — and 9 of
  the 12 points they name are still OPEN (602, 609, 553, 558, 560, 561, 629, 630, 631); only
  573, 612 and 572 are built. So the 1/2/3 classification measures the DECISION about an
  enforcer, not its EXISTENCE, and the check that forces the decision — `scripts/retro-core.test.mjs`
  — is satisfied as soon as the line is written. That is exactly what the user saw.)
  FINAL STATE:
  1. EVERY DIRECTORY ENTRY CARRIES A MACHINE-READABLE ENFORCEMENT STATE — `named`, `built`
     or `none` (a deliberate gap) — and, where it is `named`, the work-order point number
     that would build it.
  2. `built` IS NOT BELIEVED FROM PROSE. A check in the fast layer derives it from the TICK
     of the named point in the work order (`scripts/tasks-source.mjs` `readTasksAll`, so an
     archived point counts as closed), and FAILS when an entry claims `built` while its
     point is still open.
  3. A REPORT, NOT A BLOCKER, MAKES THE AGE VISIBLE. The closing run and the batch day's
     first turn list every lesson whose enforcer has been merely `named` for more than a
     calibratable N days, with its age and its point number. That number is the one nobody
     sees today.
  4. A REPEAT PULLS THE POINT FORWARD. The queue ranking moves such a point up as soon as
     the SAME mistake occurs a second time: the repetition is the evidence that the gap is
     expensive.
  EXPLICITLY NOT a blocking guard on the mere EXISTENCE of a gap. An honestly named gap is
  better than an invented cover (retrospective §3.32), and a gate on it would teach us to
  stop naming gaps at all.
  VERIFIABLE: Vitest over the directory parser and the tick derivation — an entry claiming
  `built` against an open point fails, the same entry against a ticked point passes, an
  archived point counts as ticked, and a `named` entry older than N days appears in the
  report with the right age; plus the report's own output asserted on a fixture directory.
  Criticality: high — it decides whether our whole apparatus of lessons takes effect or
  merely records.

- [ ] 614. EXECUTE THE FOUR-EYES WORK-ORDER CLEANUP (10.08.2026; the verdict of a
  BLIND-PARALLEL analysis by two models on the 148 open points — CLAUDE.md §6, divergent
  stage). Both runs were merged by MEANING; where only one model found an item it is
  MARKED as such and kept. This point EXECUTES the verdict on `TASKS.md` and
  `docs/work-packages.md`; it is main-only work, so it does not go to a feature branch.
  MERGES — both models independently found these (each is ONE defect reported several
  times, and every extra copy costs its own verification round):
  · 569 + 606 → 573. All three are `scripts/verify/scope.test.mjs` resolving
    `node_modules/.bin/oxlint` under `process.cwd()`, red in every agent worktree.
    Keep 573's false-green clause (a spawn that never ran also exits non-zero) and its
    spawn-assertion gate, plus 569's dependency bootstrap and 606's sweep of the other
    local-binary resolutions.
  · 608 → 590. Same file, same guard, same final state; 590 additionally ranks a newly
    appended point. Fold in 471's two paragraphs on the stored-versus-documented order
    and leave 471 its picker/slot-feeding half.
  · 609 → 542. 542 already arms `point-proof-guard` as one of its three dormant guards,
    and both are attended-only. Keep 609's "is this guard reachable from the settings
    chain at all" inventory check as a 542 deliverable.
  · 500 + 501 → 523. One empty leave-capture (opaque 0.000, 0 px west, 0 px east)
    reported three times; keep 500's drawable-versus-committed and 501's cached-capture
    as the two candidate causes inside 523.
  · 336 + 570 (+ 568, ONE model) → 200. Both say so in their own text; one owner for the
    rotating-staging flake family, one verification round.
  · 522 → 321 (ONE model). 321 rebuilds the whole grass-fire depiction; 522 adds a single
    clause about measuring drawn fire pixels.
  · 463 part A → 504 (ONE model); part B stays with the guard sweep.
  CONTRADICTION TO RESOLVE, not merge: 612 item 2 (an idle owner loses the lock after a
  short window) and 517 item 5 (the launcher EXTENDS the lease while evidence advances)
  pull the same `leaseUntil` arithmetic in opposite directions. ONE function must own
  the decision, or whichever lands second silently undoes the first.
  NO LONGER VALID AS WRITTEN — with the evidence each model recorded:
  · 466 — its work exists already. `node scripts/verify/docs.mjs` exits green at HEAD, including
    the detail-pointer checks this point asks to ADD. Tick and archive.
  · 184 / 203 / 207 / 309 / 330 — each carries internal DONE records and archived
    successors, so each reads as an unstarted 60-line block in every context that loads
    the work order. Re-cut to what actually REMAINS (184: pillars 1+2, its execution
    clause contradicts the §6 model policy and the no-ultracode rule; 203: the inspection
    passes, B/D/E; 207: ii–vii, and (ii)'s golden-image gate is REJECTED by point 361 —
    strike or condition it; 309: the LARGE proof only; 330: fold the residual into 303,
    591 and the closing cycle).
  · 265 and 269 — the RESEARCH half is delivered in `docs/fauna-behaviour-1890.md`;
    strike the research clause, keep the build.
  · 531 — its VERIFIABLE greps for a phrase `design.md` no longer contains, so the test
    would pass without the fix. The defect stands; re-word the acceptance.
  · 537 — `prep-guard` already left `KNOWN_UNTESTED`; the list is 6 names, not 7.
  · 512 — its arithmetic quotes a 61.6 KB CLAUDE.md; the file is 45.5 KB since the
    evidence and detail moved out. Re-derive the lever's size before selling it.
  · 607 — the drifted count drifted again (162 in the test, 132 in the evidence), which
    is that point's own thesis.
  · 451 — half delivered (stdin works); what remains is the explicit flag and the loud
    refusal of an unknown one.
  · 379 and 380 — their blocking clauses name points that are archived done; strike them.
  · 357 — its wordless-voices clause rests on §13.4 being undecided, which the delivered
    communication PoC settled; the gap it describes is real, the clause is not.
  PREMISE TO RE-MEASURE BEFORE ANY WORK: 506 argues from a SOFTWARE WebGPU lane at
  ~1 fps, while archived point 505 put the lane on the card and open point 498 states the
  factor is history — the work order contradicts itself, and 506/507/514/498 all hang off
  the answer. One run of `scripts/verify/backend-lane-check.mjs` plus one timed
  `VERIFY_GL=webgpu` suite settles it.
  ALSO: `docs/work-packages.md` is measurably behind — it ranks archived points at the
  head and `bundle-first-guard --status` reports 52 unbundled open points against the 29
  its own text claims. Reconcile it in the same pass; it is the precondition 542 names.
  VERIFIABLE: after the pass, every merged point is gone from `TASKS.md` with its unique
  clauses present in the survivor; `tasks-archive-guard`, `queue-order-guard` and
  `bundle-first-guard --status` are clean; and the open count drops by the number of
  merges and ticks made. No point is deleted without its content landing somewhere.
  Criticality: medium — it removes verification rounds that would otherwise be paid
  several times for one defect, and it stops five blocks from reading as unstarted work.

- [ ] 639. THE ASSURANCE REGIME FOR THE RELEASE MACHINERY (user 11.08.2026: "Das Ganze ist
  ein kritischer neuer Mechanismus … Überlege, ob du die drei verfügbaren Modelle hier noch
  intensiver zur gegenseitigen Absicherung einsetzen kannst … Der Umbau hat daher maximale
  Kritikalität und muss entsprechend gründlich verifiziert werden, bevor er scharfgeschaltet
  wird"). Points 635–638 decide, unattended and daily, WHAT is worked and WHAT is tagged. A
  fault there does not crash — it quietly works the wrong thing, or freezes a tag on a state
  nobody closed. This point is the regime those four are built under; it is written once
  here instead of four times, and each of them names it.
  IT RUNS FIRST AND ALONGSIDE, NEVER AFTER (user 11.08.2026: "Das Problem an diesem Vorgehen
  ist, dass der Punkt erst ganz am Ende steht und bis dahin schon einige Zeit lang die
  anderen Änderungen scharfgeschaltet sind"). He is right, and the correction is not to
  hurry this point but to bind it to each step: the hazard enumeration happens BEFORE the
  first line of 635, the differential harness is written WITH the deciding core rather than
  after it, and NOTHING of 635–638 is ARMED until its instrument here has been applied to
  it. Where an instrument is still owed, the mechanism ships report-only — it says what it
  would do and does nothing, which cannot cause the chaos an armed wrong decision would.
  FINAL STATE — five instruments, each answering a different failure:
  1. THREE-WAY HAZARD ENUMERATION, BLIND. Before a line is written, all THREE models — Opus
     5, GPT-5.6 Sol, Fable 5 — answer the same question from the same inputs and see none of
     the others' answers: what can go wrong with this mechanism, which state makes it act
     wrongly, what does it do on a torn file, a half-ticked block, two sessions at once? The
     three lists are merged by the model that wrote NONE of them, by the accounting of point
     634 (every input entry findable in the union). The union IS the test list; nothing is
     dropped for sounding unlikely.
  2. DIFFERENTIAL IMPLEMENTATION OF THE DECIDING CORE. The pure function that answers "is
     this block finished, and what follows" is written TWICE, independently, from the same
     spec by two different models, and a fuzz harness runs both over thousands of generated
     states — blocks with holes, ticks out of order, missing records, duplicates. ANY
     disagreement is a finding to be settled before either version ships. This is the one
     instrument that finds what all three models were confidently wrong about together,
     because it compares behaviour instead of opinions.
  3. ADVERSARIAL PASS ON THE ACTING HALF. A model that neither built nor reviewed the
     tagging gets one brief: make it tag a state that is not closed. Whatever it finds is a
     defect, not a scenario.
  4. SHADOW BEFORE ARMED. 636 runs report-only through at least one real release, and its
     proposals are compared by hand with what a human would have cut. Arming is a separate,
     recorded step.
  5. EVERY RULE THESE POINTS INTRODUCE SHIPS WITH ITS ENFORCER (user 11.08.2026: "Die
     Einhaltung sollen auch durch Mechanismen zugesichert werden"). Each of 635–638 carries
     a table — rule, and where it is enforced: a guard, a test in the fast layer, or
     explicitly NONE with the reason. A rule whose enforcer column is empty blocks the tick.
     This is the lesson of point 632 applied to its own construction: a rule that exists
     only as prose is a rule nobody keeps, and "the enforcer is named" is not the same as
     "the enforcer stands", so the column names the FILE that enforces it, not an intention.
     The hard cases are known in advance and none may end as prose: the tag acts only on a
     recorded complete closing; arming a mechanism out of shadow mode is a RECORDED step and
     the acting path refuses without that record; the backlog cannot be deleted; a point
     belongs to exactly one block; an intent from the page is refused unless it is signed.
  6. THE FOUR-EYES RECORD PER POINT. Each of 635–638 carries its own recorded review by a
     model that did not author it, and none is ticked on a `do-not-merge` or an unanswered
     `merge-with-fixes` — the criticality gate already enforces exactly this, and 636 is
     MAXIMUM, so it also carries the adversarial pass above.
  VERIFIABLE: the union of the three hazard lists exists with its accounting; the
  differential harness runs in the fast layer and reports zero disagreements over its
  generated corpus; the adversarial brief and its answer are recorded; the shadow log of one
  release exists and was compared; and `node scripts/criticality-review-guard.mjs --status`
  is clean for all four points.
  Criticality: MAXIMUM — it is the assurance the other four are trusted on.

- [ ] 635. THE QUEUE IS CUT INTO RELEASES, AND THE CUT IS DATA (user 11.08.2026, sketching
  the board: "Unterteilung der Warteschlange in Releases … für jedes Release eines und
  unten ein Abschnitt Backlog"). Today the scope of a release is PROSE inside point 174 —
  nothing can check whether a point belongs to v0.3, and nothing tells the batch where one
  release ends and the next begins. As data it becomes what the whole release mechanism
  stands on: the block boundary IS the moment the closing run and the tag fall due (631/633).
  FINAL STATE:
  1. A point's release is a STORED ASSIGNMENT — one small tracked file, point number to
     block ("v0.3", "v0.4", or the backlog). NOT a second order: the sequence WITHIN a block
     stays derived from `TASKS.md`, exactly as points 590/608 established, because a second
     hand-kept list is the defect those points removed and the user saw twice.
  2. The board renders one collapsible section PER BLOCK, top to bottom, ending in "Backlog
     (bisher in keinem Release eingeplant)" — named so it reads as "not yet scheduled",
     never as "unimportant", or work quietly dies there. Each block header carries its count
     and the sum of its estimates ("Release 0.4 — 12 Punkte, ~40 h"), so an unrealistic cut
     is visible at a glance.
  3. `queue-order-guard` learns blocks: the rendered sequence must equal block order first,
     then the work order's sequence inside each block. Every open point sits in exactly one
     block; a point in none is REPORTED (the backlog is a decision, not a default).
  4. The work order names the block per point — one line, so the assignment survives without
     the board and a brief can carry it.
  5. BLOCKS ARE CREATED, DELETED AND ORDERED BY THE USER (his addition, 11.08.2026). Their
     sequence is STORED, never sorted by version number: he must be able to slip a "0.4.1"
     between 0.4 and 0.5, and no ordering rule derived from the name can be trusted to do
     that. Deleting an EMPTY block is immediate; deleting one that still holds points warns
     first, and on confirmation its points move to the TOP of the backlog IN THEIR ORDER —
     they were ranked against each other once, and that ranking is not thrown away because
     the block around them went.
  6. THE BACKLOG CANNOT BE DELETED. It is where a point goes when it belongs nowhere else,
     and a queue without it would have to invent one.
  EVERY RULE ABOVE SHIPS WITH ITS ENFORCER, in the table point 639 demands — a guard, a
  test, or an explicit "none" with its reason. A rule left as prose does not count as
  delivered.
  VERIFIABLE: Vitest over the pure derivation — a point in no block is reported; a block
  order that disagrees with the render blocks; the within-block sequence follows TASKS.md;
  a deleted block's points arrive at the top of the backlog in their old order; a block
  inserted between two others keeps the stored sequence; the backlog cannot be removed; an
  unreadable assignment file fails OPEN (no guard may trap a session). Plus the real
  board rendered from the live work order, with the current v0.3 set taken from point 174.
  Criticality: HIGH — every later release step reads this cut. Verified under the regime of
  point 639.

- [ ] 636. A FINISHED BLOCK CLOSES AND TAGS ITSELF (user 11.08.2026: "Du sollst diese
  Release-Blöcke von oben nach unten abarbeiten. Am Ende jedes Blocks soll automatisch der
  übliche Release-Abschluss passieren … Das Taggen auf die Release-Version kannst du
  selbständig immer direkt machen und es unter …/VERSION/ veröffentlichen"). This is the
  point that ACTS on its own, so it is the one that can do lasting damage: a tag is frozen
  and never re-pointed.
  IT NEEDS 631, 634 and 633 FIRST — the order check, the third-model merge and the closing
  run itself. Armed before them it would tag a state whose cleanup came after its only
  green regression.
  FINAL STATE:
  1. WHEN THE LAST POINT OF A BLOCK IS TICKED, the closing run of 633 is DUE, and the batch
     may not start the next block before it is recorded complete.
  2. THE VERSION TAG BECOMES OURS TO CUT. The standing rule — no tag without the user's
     explicit go — is SOFTENED by his decision of 11.08.2026, and everywhere it is written:
     `CLAUDE.md` §6 (release mechanism), the memory rule `tags-only-on-request`,
     `scripts/closing-guard-core.mjs` and every remedy text repeating it. The new rule:
     `vX.Y` is cut and published at `…/vX.Y/` WITHOUT asking, but ONLY on a HEAD whose
     closing run is recorded complete — the checklist gate stays exactly as binding, it
     merely stops waiting for a human sentence.
  3. `poc` STAYS THE USER'S. It moves only on his explicit go for that version, because that
     is the address he tests as "the current state".
  4. SHADOW FIRST, ACT SECOND. The mechanism ships REPORT-ONLY: it names the tag it WOULD
     cut, on which HEAD, from which recorded evidence, and does nothing. It is armed only
     after it has been right about a real release without acting. A frozen tag on a bad
     state cannot be repaired, so the cheap insurance is taken.
  EVERY RULE ABOVE SHIPS WITH ITS ENFORCER, in the table point 639 demands — a guard, a
  test, or an explicit "none" with its reason. A rule left as prose does not count as
  delivered.
  VERIFIABLE: Vitest over the pure decision — a block with an open point is not finished; a
  finished block with an incomplete closing record yields NO tag and names what is missing;
  a complete record yields exactly one tag proposal with its HEAD; `poc` never appears in an
  automatic proposal. Plus the shadow log of one real release, compared by hand against what
  a human would have cut.
  Criticality: MAXIMUM — it acts unattended and its mistakes are permanent. Verified under
  the regime of point 639.

- [ ] 638. A TICKET I OPEN MYSELF GETS ITS URGENCY DECIDED, NOT ITS DEFAULT (user
  11.08.2026: "Wenn du selbständig neue Tickets anlegst, bewerte deren Dringlichkeit …
  Wenn du unsicher bist, lege mir eine Karte unter 'Von dir zu klären' an. Das muss
  zuverlässig verankert sein"). Append-and-defer puts every new point LAST — the right
  default for a wish, the wrong one for a defect that breaks what the current release
  promises. The difference is exactly what the author knows while writing and forgets an
  hour later.
  FINAL STATE:
  1. OPENING A POINT ANSWERS ONE QUESTION: does it break something the CURRENT block
     promises (→ into that block, at the position its urgency earns), is it ordinary work
     (→ a later block), or is it not urgent (→ the backlog)? The answer is recorded WITH the
     point, in one line, so a placement can be read back and challenged.
  2. UNSURE IS AN ANSWER, and it has a destination: a "Von dir zu klären" card naming the
     point, the two placements considered and what makes it doubtful. Never a silent
     default.
  3. IT IS ENFORCED, not remembered: a new point carrying no placement decision blocks the
     turn end, the way the work-order guards already block an unranked append. Rule and
     enforcer land together — the lesson of point 632 is that a named enforcer is not one.
  VERIFIABLE: Vitest — a new point with no recorded placement blocks; each of the three
  placements passes; "unsure" passes only with a matching board card; the check fails OPEN
  on unreadable input. Plus a replay over the points opened on 10./11.08.2026, which must
  reproduce their actual placement or name the disagreement.
  Criticality: HIGH — it decides what is worked next, silently and every day. Verified under
  the regime of point 639.

- [ ] 637. THE BOARD BECOMES A PLACE TO DECIDE, NOT ONLY TO READ (user 11.08.2026: "Drag &
  Drop von Punkten in der Warteschlange … So kann ich selbstständig solche Änderungen
  vornehmen, ohne immer über dich gehen zu müssen").
  FINAL STATE:
  1. A card can be dragged WITHIN a block and BETWEEN blocks. On touch — the user reads the
     board on his phone in portrait — every drag has a MENU equivalent ("nach Release 0.4",
     "ganz nach oben"); dragging is the desktop path, tapping the mobile one.
  2. THE PAGE CANNOT WRITE INTO THE REPOSITORY, and the design says so rather than
     pretending otherwise: a move emits a SIGNED intent over the transport the chat already
     uses (`scripts/chat-core.mjs` — signed, verified, replay-proof; anything unsigned,
     stale or already seen is dropped). A session applies it: a move between blocks rewrites
     the assignment of 635, a move within a block moves the point's block in `TASKS.md`.
  3. THE LATENCY IS VISIBLE. A moved card reads "vorgemerkt" until a session has applied it,
     with the time it was requested. Without that the user drags, sees nothing happen, and
     drags again — the failure mode of every optimistic interface that is not one.
  4. BLOCKS THEMSELVES ARE MANAGED FROM THE BOARD, by the same signed path: create a block,
     rename it, move it in the sequence (a "0.4.1" slipped between 0.4 and 0.5), delete it.
     Deleting a block that still holds cards asks first and says how many it would move;
     confirmed, its points land at the TOP of the backlog in their old order. The backlog
     offers no delete at all.
  5. An intent that cannot be applied (the point was ticked meanwhile, the block is gone) is
     REPORTED on the board, never silently dropped.
  EVERY RULE ABOVE SHIPS WITH ITS ENFORCER, in the table point 639 demands — a guard, a
  test, or an explicit "none" with its reason. A rule left as prose does not count as
  delivered.
  VERIFIABLE: Vitest over the pure intent handling — an unsigned or replayed intent is
  refused; an intent naming a ticked point is reported; a valid between-block intent yields
  exactly one assignment change and no reordering; a within-block intent yields exactly one
  work-order move. Plus one real drag applied end to end, and the mobile menu exercised in
  the browser layer.
  Criticality: HIGH — it writes into the work order from a public page. Verified under the
  regime of point 639.

- [ ] 456. THE TEST THAT IS ONLY GREEN IN THE SIDE TREE (retrospective §3.68, 30.07.2026;
  bundle Testinfrastruktur). Two blockers of one day shared a cause: a test passed because a
  git-ignored file is ABSENT in the agent's worktree while it exists in the main tree — it
  measured its environment, not the behaviour, and would have gone red on the merge. Add a
  pure hygiene gate in the Vitest layer, after the pattern of this project's completeness
  gates (`src/config/quality.test.ts`): a test file must have its paths INJECTED and may not
  read a real repository path — `.claude/`, a git-ignored path, an absolute path into the
  checkout. Existing offenders are either fixed or listed in an explicit, justified allowlist,
  so the gate starts green and cannot be "fixed" by growing that list silently.
  VERIFIABLE: the gate's own tests (a compliant file passes, each forbidden shape fails, an
  allowlisted file passes with its reason present); `npm run test:unit` stays green.
  THE SAME CLASS FROM THE OTHER SIDE (measured 10.08.2026): `scripts/worktree-bootstrap.mjs`
  answered "NONE — this checkout already has node_modules" for a `node_modules/` that held
  exactly `.tmp`, `.vite` and `.vite-temp` — no package, no `.bin`. The brief calls that
  script the FIRST command in a new worktree, so its verdict is read as "set up". Commands
  still ran, but only because the worktrees sit INSIDE the main checkout and Node resolution
  walks up into it; anything that probes a PATH instead of resolving — the
  `<root>/node_modules/.bin/oxlint` shape point 606 replaced in `scope.test.mjs` — missed,
  and its red read as a defect in the change under test.
  ALSO IN FINAL STATE: the presence check requires a real dependency (a package directory or
  `.bin`), never a directory Vite created, and the verdict NAMES where the resolution
  actually lands. VERIFIABLE additionally: a fixture worktree whose `node_modules` holds only
  cache directories is reported as NOT bootstrapped and is linked.

- [ ] 558. A VERIFY RUN TAKEN IN A WORKTREE IS DESTROYED WITH THE WORKTREE (measured
  08.08.2026 at the merge of point 549; bundle Testinfrastruktur). The render-verify
  ledger lives at `.claude/render-verify-state.json`, and `scripts/repo-paths.mjs`
  resolves `REPO_ROOT` from the SCRIPT's own location — so a suite run inside a git
  worktree writes its record into THAT worktree, never into the main tree, and
  `scripts/worktree-cleanup.mjs` deletes it with the directory. The cost is exact: the
  three WebGPU `polish` runs that proved point 549 on its branch were gone the moment
  the branch's worktree was cleaned, and `render-verify-guard` — correctly, by what it
  can see — demanded the WebGPU suite again on `main`, ~15 minutes more for a picture
  already taken. CLAUDE.md §6 delegates every point to a WORKTREE-isolated agent, so
  this hits EVERY delegated render point: the agent's own backend evidence never
  reaches the guard that asks for it, and the session either re-runs it or writes a
  deferral for a run that actually happened.
  FINAL STATE: a verify run records where the guard reads it — one ledger per
  REPOSITORY, not per working tree. The ledger path resolves against the git COMMON
  directory (`git rev-parse --git-common-dir`, whose parent is the main tree) instead
  of the script's own path, so a run inside a worktree lands in the main tree's
  `.claude/render-verify-state.json` and survives the cleanup. Each record NAMES the
  tree and the commit it was taken on, so a branch run is distinguishable from a main
  run, and the guard's coverage question is unchanged — was this backend proven since
  the last render-file edit — with no new exemption. Every other `.claude/` state a
  worktree agent WRITES and the main session later READS is checked in the same pass
  and either moved to the common directory or documented as deliberately per-tree.
  VERIFIABLE: a Vitest case pins the resolution in both directions — with a `.git`
  FILE pointing at a worktree gitdir the ledger path comes out in the MAIN tree, with
  an ordinary `.git` directory it is unchanged (the case must fail against today's
  code, or it proves nothing); and a run recorded from a worktree is found by
  `coveringRun` in the main tree after that worktree is removed.
  Criticality: medium — no product defect, but it voids the evidence of every
  delegated render point silently, which pushes the session toward re-running or
  deferring what was already proven.

- [ ] 574. A BARE VERIFY SCRIPT PHOTOGRAPHS WHATEVER SERVER HOLDS PORT 5173 (found
  09.08.2026 during the point-264 picture check; it had already invalidated one accepted
  picture acceptance before anyone noticed).
  `scripts/verify/enrichments.mjs` — and every suite that reads it — falls back to
  `BASE_URL ?? 'http://localhost:5173/'`. Run standalone, as the repair loop and every
  delegation brief tell an agent to do, the suite attaches to whatever dev server happens
  to be listening on that port. On 09.08.2026 that was a leftover server from an abandoned
  worktree, serving code from BEFORE the fix under test: every check passed, every frame
  looked plausible, and the picture that was accepted showed the OLD build. `run-all.mjs`
  cannot hit this — it starts its own server on a free port in its own working directory —
  so the trap sits exactly on the path taken when someone is iterating fast.
  FINAL STATE: a suite started without a server of its own REFUSES to run rather than
  guessing a port. The fallback to a hard-coded 5173 is removed; with no `BASE_URL` the
  suite either starts its own dev server (preferred — the repair loop stays one command)
  or exits naming the command that does. Where a server IS supplied, the suite asserts
  before its first screenshot that the server it reached serves THIS working tree — a
  build stamp the dev server exposes and the suite compares against the checkout it runs
  from — so an attached-to-the-wrong-server run dies loudly instead of photographing a
  stranger.
  SECOND WAY A FRAME PROVES NOTHING: IT IS EMPTY (found 11.08.2026, landing point 610).
  The collision suite rewrote `verification/52-collision-port-wall.png` as an ENTIRELY
  BLACK picture on the WebGPU lane — 23 KB against 657 KB, nothing in it but the HUD bar,
  where the frame is named for the port wall the camera is pressed against — and the run
  exited 0 with the shutter (`scripts/verify/frameSubject.mjs`) raising nothing. The same
  frame on the WebGL 2 lane shows the lit wall, so the picture proof was void on exactly
  the lane the player uses. The shutter projects the SUBJECT into the frame and asks
  whether it is in view; it never asks whether anything was DRAWN, and an empty picture
  answers "in view" as readily as a full one.
  FINAL STATE: the shutter refuses a frame with nothing drawn in it, on the same footing
  as one whose subject is out of view and with the same loud message — judged by what the
  renderer reports for the frame it just wrote (draw calls / triangles, the reading
  `sceneReady` already takes), never by file size. WHY the WebGPU lane draws that wall
  black while WebGL 2 draws it lit is ESTABLISHED as part of this, not guessed: either the
  player standing at a wall sees black on his own backend — a game defect, which then gets
  its own point — or the headless WebGPU lane cannot draw that view, which the deferral
  path must then say out loud instead of writing a frame.
  VERIFIABLE: pure Vitest for the refusal (no BASE_URL and no own server → a non-zero exit
  naming the remedy, never a run), for the stamp comparison (a mismatched stamp fails) and
  for the empty-frame refusal (a renderer reading of zero drawn geometry → no frame
  written, remedy named); plus the real proof — a suite pointed at a server from a
  DIFFERENT checkout must fail, where today it passes green, and the black port-wall frame
  must be refused where today it is written.
  Criticality: high — it does not break the game, but it silently voids the picture
  proof, which is the one check this project cannot replace with a test.

- [ ] 567. A KILLED SESSION LEAVES ITS VERIFY RUN BEHIND, AND NOTHING STOPS IT
  (measured 09.08.2026, 00:12–00:14, on the resumption after the point-342 session died;
  bundle Testinfrastruktur). The dead session's `run-all polish enrichments` (pid 1641328)
  was still running nine minutes later, together with its Vite dev server and its headless
  Chrome, and it competed for the machine with the run the successor had just started.
  That is precisely the load that makes the software WebGPU lane report rate checks as
  product defects (points 506/564), so the successor's first evidence was worthless before
  it was read.
  TWO MECHANISMS LOOKED AND BOTH LET IT PASS:
  (a) `batch-doctor` ran first and reported `strayProcesses=0`. Its stray probe judges the
      MAIN checkout, and every one of these processes was launched from an agent WORKTREE
      (`.claude/worktrees/…`), so the one mechanism whose whole job is to mend a torn tree
      before work resumes did not see the loudest torn thing in it.
  (b) The point-296 quiet-machine check DID see them — it named all three by pid with
      "FROM THIS CHECKOUT" and the sentence "a forgotten dev server has already cost a whole
      unit run" — but only as a WARNING, after the run had already started, and its remedy
      (`--on-load=defer`) has to be passed BEFORE the run by someone who already knows. So
      the check that found the problem also let the tainted run proceed.
  FINAL STATE:
  1. `batch-doctor`'s stray probe covers EVERY checkout of this repository — the main tree
     and every registered worktree — so a verify run, dev server or automation browser from
     any of them is a stray. `--repair` ends them, logged by pid and command like every
     other repair, because an owner that is provably dead cannot own a process either.
  2. The quiet-machine check ACTS on its own finding: leftovers belonging to this project
     (a verify suite, a Vite server, an automation browser) are not a warning but a HALT —
     the run stops before its first frame, naming the pids and the one command that clears
     them. A run started against known self-inflicted load produces evidence nobody may use,
     which is worse than no run.
  3. The halt is overridable for the case where the leftovers are deliberate
     (`--on-load=proceed`), and an overridden run is marked in its output as taken under
     known load, so its timing verdicts are never later read as clean.
  VERIFIABLE: pure Vitest — the stray probe returns a worktree-launched verify process for a
  repository whose worktree list contains it, and `--repair` plans its termination; the
  quiet-machine verdict is HALT for a self-owned leftover, PROCEED for an unrelated busy
  machine, and PROCEED-MARKED under the override, with the pids named in every case.
  Criticality: medium, frequency HIGH (every killed session can leave one behind).

- [ ] 599. MEASURE WHAT THE CACHE AND THE CALENDAR HIDE (point 572's measure 9). Two
  measurements the throughput analysis needed and did not have, delivered together because
  both are pure readings of data we already keep.
  (a) CACHE-PREFIX HYGIENE: plot `cache_creation` against `cache_read` per response over a
      session and name the spikes — a high write share in the MIDDLE of a session points
      at a per-turn change early in the prompt, a spike after a gap points at TTL expiry
      (a 42-min run without intervening turns costs ~0.23 M weighted on the next turn).
  (b) CALENDAR DECOMPOSITION: split the git span first-branch-commit → merge into
      building, verifying and waiting-for-the-merge, from named timestamps, and compute the
      CRITICAL PATH — machine hours are not calendar hours while three agents run in
      parallel, and that conversion is where our own ranking table slipped.
  (c) THE RUN RECORD MUST NAME THE STATE IT RAN ON. `recordRun` in
      `scripts/render-verify-recorder.mjs` stores backend, suite, exit, screenshots and reds
      — and neither the `git HEAD` nor the TREE HASH. So the two questions that would decide
      a verification memo cannot be asked at all: how often did the identical check run twice
      on an identical tree, and how often did a final proof run on a tree that differs from
      the one that was merged. Both fields are added, and the grouping by
      `(treeHash, suite, backend, tier)` becomes a reading. Nothing is BUILT on the answer
      until the answer exists — a cached green standing in for a real rendered result is the
      forbidden proxy, which is why the memo itself stays unbuilt.
  (d) THE RUN RECORD MUST NAME THE MACHINE IT RAN ON. `scripts/verify/machine-load-core.mjs`
      already computes a quiet/busy/loaded verdict and `run-all.mjs` already probes it — the
      verdict is simply not stored. Stored, it turns "browser reds correlate with load" from
      an anecdote into a measurement (first attempt against retry, by load level), and that
      decides whether the answer is a new semaphore or simply making the EXISTING
      `--on-load=defer` the default for browser suites. Widening what exists beats building.
  (e) THE PICTURE-READING PATTERN IS COUNTED BEFORE IT IS CHANGED: how many responses read a
      `verification/*.png`, how many images each carried, what share of a picture check that
      is. A proposal to view several frames per turn is worth up to ~1.58 M per backend per
      check IF frames are read one at a time today — which nobody has measured, and an
      earlier reading points the other way. If the count is low the idea dies for free. Were
      it ever acted on: frames stay full-resolution and individually attached, groups stay
      small, and this never becomes a contact sheet or a downscale.
  (f) GUARD TELEMETRY: which guard blocks how often, and what a blocked turn cost.
  Every reading joins `scripts/measure-task-cost.mjs`, and that tool becomes a RECORDED
  step of the closing cycle (`CLOSING_STEPS`), so every structural measure gets its
  before/after instead of a feeling.
  IT RUNS EARLY IN THIS SERIES, not late: four separate decisions now wait on it — the
  verification memo, the merge-candidate proof, the load semaphore and the frame-reading
  change — plus the machine-versus-calendar correction. A measurement that gates four
  judgments belongs before them, not after.
  Criticality: low — pure measurement; it changes no behaviour, and it is the precondition
  for judging the remaining structural levers.

- [ ] 595. THE VERIFICATION LADDER (point 572's measure 5). While a render point is still
  being FIXED, only the cheapest covering suite runs, on the everyday WebGPU lane; the
  full proof — both backends where they can differ, LARGE where the change warrants it —
  runs exactly ONCE, on the EXACT MERGE CANDIDATE — `main` merged into the branch, the tree
  that will land — with the recorded `git HEAD` of that run as the evidence that the verified
  tree IS the merged one. Nothing enforces or measures that today. The expensive browser
  suites abort at the FIRST failure during that iteration (a red run is never credited
  anyway) and run to completion only for the final proof. The rule is a brief building block
  for render points, so it is applied rather than remembered.
  A RED IS A RED. No "critical versus cosmetic" class is introduced to decide what may be
  aborted on — the classification buys nothing here, because an iteration run is not credited
  either way, and it would open the door to waving a red through.
  THE SHARED FINAL RUN IS ALREADY DECIDED, and this point must not be read as contradicting
  it: `docs/work-packages.md` settled that several FINISHED per-point branches may be merged
  together and ONE regression run over the merged result — "the only sizeable saving left".
  What that shared run may replace is the repeated full REGRESSION. The both-backend PICTURE
  proof stays on the branch, BEFORE the merge, exactly as it is today; merging first to
  verify afterwards cost about thirty turns of a block-loop on 24.07.2026.
  THE UNIT LAYER HAS THE SAME LADDER: `vitest --changed` or a path filter and
  `tsc --incremental` are legal WHILE REPAIRING, and an incremental green is never an
  acceptance — the full fast gate stays the proof. One rule covering both layers, not two
  half-rules.
  MEASURED TARGET: verification is 47.0 % of the weighted spend and 37.4 % of the machine
  hours, the ten costliest points hold 64.4 % of all point-assigned verification tokens,
  and eight of ten recorded `enrichments` runs failed while still writing all 37 frames at
  951–1029 s each.
  THE LADDER'S CHEAPEST RUNG ALREADY EXISTS AND IS UNUSED (user question 09.08.2026: "Und
  die neuen Möglichkeiten für differenziertes Testen durch 566 werden auch inzwischen bei
  den Feature- und Bugtests eingesetzt?"). Point 566 built `--section=<name>`, and
  `enrichments` declares nine of them; the resolver, the PARTIAL marking and the refusal to
  count a partial run as coverage all work. CHECKED 09.08.2026: nothing routes anyone to
  it. It appears in `scripts/verify/README.md` and in `tiers.mjs`, in no delegation brief,
  in no agent prompt and in no rule text — the three agents commissioned that same evening
  were not told about it either — and the recorded render-verify runs contain no partial
  run at all. So the ladder's bottom rung is not a thing to invent here; it is a built
  tool to PUT IN THE PATH. This point therefore also: (a) makes `--section` the stated
  iteration rung for a render point in the delegation brief's building block, so an agent
  reaches for it before replaying a whole pass; (b) SECTIONS the remaining render suites,
  which 566 deferred ("enrichments first, then the other render suites"); and (c) states
  in the same building block that the final proof is whole-suite, so the cheap rung can
  never be mistaken for the acceptance.
  WORK FOR 595–598 ALREADY STANDS ON A BRANCH (11.08.2026). A session that died left
  `feat/595-598-verification-ladder-brief` PUSHED at 0d555552 — four commits plus a merge of
  `origin/main`, covering all four points — with its worktree
  `.claude/worktrees/agent-a7b6ba2cc654e6411` still in the tree. It was never reported,
  verified or landed. Whoever takes these points STARTS FROM THAT BRANCH and verifies it
  against the specs here; rebuilding from scratch throws away finished work. Cleaning that
  worktree away before the branch has been judged is what point 629 exists to prevent.
  Criticality: medium — it reorders the proof but must not dilute it; the both-backend
  picture proof stays exactly as binding as it is today.

- [ ] 598. THE BRIEF ORIENTS IN THE CODE, NOT ONLY IN THE SPEC (point 572's measure 8).
  The delegation brief carries a GENERATED orientation: the paths the specification itself
  names, and a per-directory line of responsibility derived from the tree and its file
  headers. It is marked as a HINT, never as an instruction ("the specification names these
  paths", not "change these files"), and it is generated on every run so it cannot go
  stale.
  AND IT NAMES THE PLANNED CHECK: which suite, and which `--section` of it, will verify this
  point — derived from the diff→suite mapping and the ladder rung, generated like the rest so
  it cannot go stale, and marked as a hint like the path list. This is the cheapest possible
  answer to what the ladder point found: a rung that is built and routed to nobody gets used
  when it stands in the artefact the agent reads FIRST, not in a rule it must remember.
  MEASURED TARGET: search/read is 25.2 % of the weighted spend and the first responses of
  a delegated agent are almost always search; five saved responses per point is ~2 % of a
  median point.
  NOT THE OPPOSITE DIRECTION: shrinking the brief was weighed and rejected on the arithmetic.
  Removing 1.5k tokens saves ~35.7k weighted per point, while a single reference the agent
  must then look up costs 22.9k — it breaks even at 1.5 extra lookups and goes negative
  after. The brief is 1.9 % of the spend and exists to avoid the ~108k wholesale read.
  Criticality: low — a wrong list would misdirect, which generation-from-the-tree and the
  hint framing address.

- [ ] 597. LARGE TOOL OUTPUT NEVER ENTERS THE CONTEXT WHOLE (point 572's measure 7). The
  bounded-output discipline `scripts/verify/run-logged.mjs` already applies to verify runs
  extends to the other big producers: `git diff` (`--stat` first), `grep` (`-c` or a head
  bound), file reads (`offset`/`limit` instead of a whole file), `npm ls`, `gh run view`.
  ERROR OUTPUT STAYS UNCUT — every failing test keeps its name.
  THE ON-DEMAND PATH IS NAMED, not reinvented: `node scripts/verify/run-logged.mjs --show
  <log>` already hands back the whole run when the digest is not enough. What must NOT be
  adopted is the tempting inverse — a runner that returns only the names of failing suites
  by default; error output stays uncut.
  MEASURED TARGET: a 10k output entering a point's context at response 20 is re-read by
  its remaining ~218 responses at 218k weighted, ten responses' worth; the trade pays up
  to a follow-up-query rate of ~85 %.
  THE STANDING LOAD IS THE SAME ARITHMETIC ON A LARGER SCALE: 1k of permanently carried
  text costs 3.27 M per window, so CLAUDE.md alone (~11.4k tokens) is ~4.2 % of it, and
  per-turn injected text that CHANGES additionally breaks the cache prefix. So: a hook that
  succeeded says nothing, and the per-turn injections are audited. CONDITIONAL on point
  599's cache reading, and it cuts TEXT only — never a duty that is enforced rather than
  remembered.
  Criticality: low — the one real risk is cutting an error message, which the rule
  excludes.

- [ ] 596. THE TAIL IS VISIBLE WHILE IT RUNS (point 572's measure 6). A point's running
  cost is measurable DURING the point, not only after it: a hook reports when a branch
  passes three times the median (≈ 17 M weighted), and that report is a DECISION point —
  re-cut, re-staff, or continue deliberately — never an automatic abort. In the same
  mechanism, an agent that has run the same browser suite red three times STOPS, writes a
  diagnosis of what is red and what was tried, and escalates instead of looping.
  MEASURED TARGET: 10 of 64 points carry 48.8 % of the point-assigned cost, the costliest
  single point 15.8 % of it with 89.0 % of that in verification.
  THE DIAGNOSIS MUST LAND WHERE THE SUCCESSOR LOOKS — on the work order or the board, not
  only inside the agent's report, which nobody reads again. Otherwise the next attempt is
  the same attempt.
  THE AUTOMATIC ABORT IS REFUSED, and the refusal is recorded here so it is not proposed a
  fourth time: a hard turn cap or a four-hour timeout discards work that may be nearly done
  AND pays a second 5.0 M build socle against a 5.82 M median point; its progress metric
  ("share of tests passed") is a proxy, and judging by a proxy is the one thing this project
  does not trade. Our tail points were expensive because the work was hard — the costliest
  carried 89 % verification — not because a loop ran away.
  A WALL-CLOCK TRIGGER may join the token trigger once point 599 delivers an honest calendar
  decomposition; until then there is no honest wall-clock per point to trigger on.
  Criticality: medium — a cap that let a red state pass as green would be worse than the
  cost it saves, so the escalation path is the mechanism and the abort is not.

- [ ] 553. AN EXPLICIT CONTEXT BUDGET PER POINT, AND A WRITTEN HANDOFF WHEN IT IS SPENT
  (08.08.2026, chosen BY MEASUREMENT as point 373 requires — the closing measurement is
  recorded in `docs/batch-autonomy.md`, "The closing measurement under the built levers").
  THE STATE THE MEASUREMENT LEAVES: under the boundary and the bounded verify digest the
  rate is 0.988 %/h in the honest full scope (1.091 %/h top-level only), against the
  ~0.6 %/h that fits the weekly quota — about 1.6× the ceiling, so a further lever is owed.
  WHY THIS LEVER AND NOT THE OTHERS, from the same figures: 62 % of the counted turns and
  58 % of the weighted spend come from DELEGATED-AGENT transcripts, so option (b) — moving
  the reading-heavy part of a point into an agent — only RELOCATES the cost unless the
  agent's own context is bounded too, and option (a), a boundary at a bundle member, cuts
  where the bundle scheme no longer claims a saving (`docs/work-packages.md`). Option (c)
  cuts inside both, which is why it is the one built here.
  WHAT IS BUILT: a context budget that is MEASURED, not estimated, and that applies to the
  main session AND to a delegated agent.
  (a) THE BUDGET IS READ FROM THE SAME PLACE THE MEASUREMENT IS — the turn's context size,
  derived by the pure core `scripts/measure-context-cost-core.mjs` already uses, so a
  second accounting is never invented. A calibratable ceiling per point sits with the other
  batch constants, and the shipped starting value is justified against the measured
  distribution (median peak 153k, p90 307k in the full scope), not guessed.
  (b) THE HANDOFF IS WRITTEN, NOT IMPLIED. On crossing the ceiling mid-point the session
  writes a handoff — what the point is, what is done, what the next session must do first,
  the branch and the last commit — through a command (`scripts/point-handoff.mjs`) that
  owns the file's shape, and ENDS. `batch-resume-hook` hands the successor that handoff the
  way it hands a fresh session the work order, so the successor resumes the POINT rather
  than re-deriving it. A handoff that names no branch or no next action is refused at the
  writing, not discovered at the reading.
  (c) A DELEGATED AGENT OBEYS THE SAME CEILING. Its brief carries the budget, and an agent
  that spends it returns its handoff as its report instead of building on; the parent
  re-delegates from that handoff. An agent silently continuing past the ceiling is the case
  that makes the whole lever cosmetic, so the parent CHECKS the returned report against the
  agent's own transcript size rather than trusting the claim.
  (d) `batch-progress-guard` LEARNS THE THIRD LEGAL STOP. Ending is already legal at a
  closed point with an armed launcher; a spent budget with a written handoff and an armed
  launcher joins it. Every other stop stays illegal, so the guard can never be talked into
  an idle stop by writing a handoff for work that was never started.
  (e) AN ORPHANED BRANCH IS SURFACED, NOT LEFT TO CHANCE (found 11.08.2026). The handoff
  covers the session that hands over deliberately; it does nothing for the agent that dies
  without one, and that is the case that actually cost work. Two feature branches sat in
  the tree unreported — one carrying ~2000 lines for points that still read as untouched,
  one fully superseded — and the only thing that found them was a resuming session running
  `git worktree list` on a hunch. So the resume path REPORTS every branch that has commits
  `main` does not contain and no live agent behind it, with its point, its last commit and
  its age, exactly as it reports the work order; and a branch whose work has landed under
  another number is ENDED at that landing rather than left to be re-triaged. VERIFIABLE by
  Vitest on the pure core — an orphan is listed, a branch with a live agent is not, a
  contained branch is not — plus the resume hook printing it.
  MEASURE THE RESULT, as 373 did and on the same tool: `node scripts/measure-context-cost.mjs`
  for a full day after the lever lands, in BOTH scopes, against the 0.988 %/h this point
  starts from and the 0.6 %/h that fits. The point counts as delivered when the rate is
  measured and reported honestly — met or not — never when the mechanism merely runs.
  VERIFIABLE: pure Vitest on the decision core — a session under the ceiling continues; one
  over it with a written handoff and an armed launcher may stop; one over it with NO handoff
  blocks; a handoff missing its branch or its next action is refused; an unreadable
  transcript ALLOWS the stop (fail-open, as every guard here). Live: one point actually
  handed over mid-way and finished by the successor from the handoff alone.
  MECHANISM REVIEW REQUIRED (CLAUDE.md §7.2): this changes a guard.
  FOLDED IN FROM POINT 572 (measure 10, "the window boundary inside a point"): that
  proposal is this lever, differing only in the cut TRIGGER and in demanding a pilot, so
  it is decided HERE rather than appended as a second owner. THE TRIGGER QUESTION: cut at
  every green, pushed commit, or at the measured context ceiling this point already
  defines? Whichever is chosen, it is PILOTED on ONE point and MEASURED against the median
  (`measure-task-cost.mjs --tasks`) before any rollout, and the rollout is a separate
  decision taken on that measurement. ACCEPTANCE: a session after a cut continues WITHOUT
  ASKING A QUESTION — if that does not hold, the pilot is reported as FAILED rather than
  tuned. Measured target: context per response is a median of 190k and re-read context is
  75.8 % of the weighted spend; a cut every ~60 responses would put the mean context near
  73k. This is the one measure on the list that can silently lower work quality — what an
  agent has learned and not written down is lost at the cut — which is why it is piloted
  and measured rather than adopted.
  Criticality: high — this is the batch's dominant running cost, and a lever that reports
  a saving it did not make is worse than none: it retires the question. The measurement is
  therefore part of the delivery, not a follow-up.
  AND IT BINDS THE ATTENDED SESSION, NOT ONLY A DELEGATED POINT (measured 10.08.2026).
  One attended session absorbed SIX separate user requests plus the two full reports of a
  blind-parallel analysis in a SINGLE stretch — a dashboard question that grew into a
  re-ranking, a release re-gating, a work-order cleanup and five branch landings. Nothing
  stopped it, because every existing ceiling is written for a delegated point and the
  boundary rule fires only at a CLOSED point, which an attended session in the middle of a
  conversation never reaches. FINAL STATE: the same budget mechanism counts an attended
  session's spend, and on crossing the ceiling the Stop chain requires ONE of two answers
  before the turn may end — the written handoff and a boundary, or a stated reason why this
  stretch must continue (a merge in flight, a user waiting on this very answer). A NEW topic
  that is not a continuation of the current one may not be started past the ceiling; it is
  APPENDED to the work order and taken by the next session. The ceiling is measured, not
  guessed: it is derived from the same recorded spend this point already reads.

- [ ] 512. THE BUILD ORDER IS PAID AGAIN BY EVERY SUBAGENT (user decision
  05.08.2026 on the card "Bauanleitung für Subagenten aufteilen?"). Measured:
  `CLAUDE.md` is 61.6 KB — §1–5 8.0 KB, §6 13.6 KB, §7 37.5 KB (of which §7.2 is
  7.4 KB), §9 2.0 KB — and every delegated agent receives all of it, though a
  building agent never touches the 32 acceptance criteria, the batch handover, the
  board rules, the model policy or the release mechanics. An agent-facing core is
  ~19 KB, so ~68 % of the rule document falls away per agent.
  FINAL STATE:
  1. `CLAUDE.md` keeps ONE binding text and gains a declared SPLIT: the
     agent-facing core (goal, scope guardrails, stack, structure, commands, the
     working rules a builder obeys — commits, branch discipline, language, voice
     markup, test layers — and §7.2 self-verification) and the session part (batch
     ownership and handover, board, delegation machinery, model policy, release
     and closing). Neither is a summary of the other: every rule lives in exactly
     one of them, and nothing is dropped.
  2. Delegated agents receive the core only. The mechanism is the one that already
     exists for this purpose — the point brief (`scripts/point-brief.mjs`) — so a
     builder gets brief + core and no longer the whole document.
  3. A rule that moves keeps its enforcement: any guard, hook or test that reads
     `CLAUDE.md` by section is updated in the same commit, and the doc-budget
     entries follow the split.
  4. The session part stays the authority for a session that OWNS the batch, so
     nothing about the batch, the board or a release becomes less binding.
  VERIFIABLE: a delegated agent's prompt carries the core and not the session
  part; `scripts/point-brief.mjs` names which document it assumes; every rule of
  the old file is findable in exactly one of the two halves (a test sweeps the
  section headings for coverage and for duplication).

- [ ] 511. THE MEMORY INDEX STILL CARRIES WHAT THIRTY GUARDS NOW ENFORCE
  (measured 05.08.2026 on the user's question about context cost). The numbers
  first, so the effort goes where the cost is: the memory INDEX is 13.2 KB / 86
  lines (~3.3k tokens) per session and the 74 entry files load only on recall,
  while `CLAUDE.md` is 61.6 KB (~15k tokens) and is paid AGAIN by every subagent —
  ~82 % of the session floor against the index's ~16 %, and the floor multiplies
  per agent. Splitting `CLAUDE.md` is the real lever, is the user's call and is
  published as the decision card "Bauanleitung für Subagenten aufteilen?"; this
  point does the part that needs no decision.
  FINAL STATE:
  1. Every memory entry whose rule is ENFORCED by an armed guard is retired from
     the index, its content living on wherever the guard documents itself. An
     entry stays when it carries a JUDGEMENT a guard cannot make (taste, history,
     a user ruling) — the test is "would a session behave differently without it,
     given the guard already fires?".
  2. `docs/rule-corpus-audit.md` records the measurement above and each retirement
     with its enforcing guard, so the next audit starts from evidence.
  VERIFIABLE: the index names no entry whose whole content is an armed guard's
  rule; the audit doc lists each retired entry beside the guard that replaced it.



- [ ] 471. THE WORK ORDER STARVES THE POOL IT IS SUPPOSED TO FEED (user 30.07.2026, drawn
  from the branch-per-point ruling: "Dann sollte die aktuelle Abarbeitungsreihenfolge dahingend
  optimiert werden, dass sie den potenziellen Vorteil der Bündel optimal nutzt"; bundle
  Session- & Repo-Hygiene). With one branch per point settled, a bundle's remaining value is
  its ORDER and its COLLISION MAP — and those two pull in opposite directions, which nothing
  in the order accounts for. A bundle is defined BY SHARED FILES, so its members are precisely
  the points that CANNOT run beside each other. "Order of work" in `docs/work-packages.md` is a
  strict bundle-after-bundle ranking, so a pool of three drawing from the top of it can be fed
  by ONE agent whenever the leading bundle's points collide — the cap becomes 1 of 3 without
  anything reporting it. The three slots ran full on 30.07.2026 only because that evening's
  points happened to come from three different bundles.
  FINAL STATE: the picker takes the next point from each of the top N DISTINCT bundles rather
  than the top N points, so the leading bundle contributes one agent and the next ones fill the
  remaining slots; the ranking in `docs/work-packages.md` stays the PRIORITY and is not
  reordered by the picker. Two points that must share a branch (same files, per point 452's
  grouping) count as ONE slot. Where the top bundles are not file-disjoint from each other, the
  ranking itself is adjusted so that they are — the priority order decides WHICH bundles lead,
  the disjointness decides only their arrangement among near-equals.
  THE NEXT-UP LINE IS NOT PART OF THIS POINT ANY MORE. It was added here when the queue was
  grouped and the next point had disappeared behind a collapsed bundle; the grouping was taken back
  out the same evening (point 472), so the first card of the flat queue names it again and a
  separate line would only be a second place for the same fact to go stale.
  THE REUSE IS NARROW AND IT IS THE RISKY HALF (user 30.07.2026: "Das klingt riskant, weil sein
  Kontext dann noch mit den Anforderungen des vorherigen Punktes verwaessert ist." — correct, and it
  bounds the rule rather than cancelling it). CONDITIONS, all of them: reuse ONLY when the next point
  touches files the running agent already holds — the case where a fresh agent would both re-read
  them and collide on the branch; the follow-up arrives as a FULL brief, the same document a fresh
  agent would get, opening with the explicit statement that the previous point's requirements are
  CLOSED and bind nothing here; one commit per point, so the diff stays attributable; and the
  four-eyes review reads the DIFF, never the agent's account of it. A third point in one context is
  not taken — after two the agent is done and the next goes to a fresh one, because the token saving
  shrinks with every reuse while the bleed risk does not.
  AND IT IS WATCHED, not assumed: the reuse is recorded per point, and if a reused agent's work
  draws more review findings than a fresh one's over the next ten points, the rule is dropped rather
  than defended. That comparison is part of what the reporting command prints.
  AND THE STORED ORDER IS NOT THE DOCUMENTED ONE (measured 30.07.2026, right after the flat queue
  came back). The queue renders from a hand-curated order array in the board data, and that array
  predates the ranking in docs/work-packages.md: the first card is 440 while the documented working
  order opens with Urlaubsfestigkeit. So the flat list reads as an order and is not the one the work
  is actually taken in — the same lie the grouping was reverted for, one layer down. The order the
  queue renders must BE the picker's order, derived from the documented ranking, never a second
  hand-kept list that can drift from it.
  WHAT THE DRIFT COST, measured 04.08.2026: the user's brief of 03.08.2026 put the communication
  PoC before the whole queue, and the session wrote that priority into TASKS.md as PROSE ("gives
  every point here PRIORITY over the rest of the queue") at 01:29. No picker reads prose. The
  ranking in docs/work-packages.md still opened with Urlaubsfestigkeit and the stored order still
  led with 440, so every successor session that night re-oriented from the queue, took its top and
  spent the hours until 09:21 on test infrastructure while the twelve points the user had put first
  sat at queue position 60. A declared priority that only the reader can see is not a priority.
  SO, in addition: a priority declared in the work order must be MACHINE-READ into the ranking, and
  a guard must fail when the two disagree — the declaration, the ranking and the stored order are
  one statement or the turn does not end.
  MEASURED, not asserted: the point is delivered when a command reports, for the current work
  order, how many agents the top of the queue can actually feed, and that figure is 3 (or the
  reason it cannot be). `--slots-free` already demands a reason for an idle slot; this makes
  the ORDER answer for it instead of the session.
  VERIFIABLE: pure cases on the picker — a leading bundle of colliding points yields one
  candidate and the next bundles fill the rest; a file-disjoint pair inside one bundle still
  yields two; the priority ranking is never violated by the disjointness rule; and the
  reporting command's figure matches the picker's own answer on the real work order.

Feature: the communication PoC. Reference: docs/communication-poc-spec.md, which
carries the lexicon, the staged contrasts and the decisions the brief left open.
The user's brief of 03.08.2026 gives every point here PRIORITY over the rest of
the queue.

Build order, chosen so no two parallel agents own the same file:
  wave 1  477 (src/communication) · 482 (src/world, place layout) · 479 (the figure)
  wave 2  478 (speech, needs 477) · 484 (journal, needs 477) · 488 (edge, needs 482)
  wave 3  480 (tag game, needs 479) · 485 (labels, needs 484)
  wave 4  481 (children teach) · 483 (adults teach)
  wave 5  486 (drums) · 487 (digging)

- [ ] 552. THE CI GUARD REPLAYS A FROZEN REASON AND SENDS THE READER AT A GREEN RUN
  (measured 07.08.2026, cost two turns of false search; bundle Testinfrastruktur).
  `ci-status-guard` caches its verdict per sha in `.claude/ci-status-guard-state.json`
  and re-asks GitHub every `RECHECK_MS`. The VERDICT is re-derived correctly — a sha
  whose runs are still pending stays `pending`. The REASON TEXT is not: it is written
  once, when the sha first goes pending, and replayed on every later block. Tonight it
  named `Deploy to GitHub Pages` run 31219906237 three times in a row as "still
  running" while that run had already concluded `success` minutes earlier and the only
  unfinished run was `CI`. Both statements the guard made were individually true —
  something was still running, and that run had once been running — but together they
  point the reader at a green run and hide the red one. Two turns went into querying the
  named run and confirming it was fine.
  FINAL STATE: the reason travels with the verdict. When a cached entry is re-checked,
  the text is re-derived from the runs that are pending AT THAT MOMENT, so it names a
  run that is genuinely unfinished; a cached reason is never re-emitted after its own
  re-check. Where several runs are pending, the message says how many and names them
  rather than picking one silently. The caching itself stays as it is — this is not a
  reason to ask GitHub more often.
  VERIFIABLE: Vitest on the pure core — an entry cached as pending against run A, then
  re-checked in a world where A concluded green and B is still running, reports B and
  not A; an entry re-checked with nothing pending stops blocking; the message for two
  pending runs names both. Plus a case pinning that no API call is added by the change.
  SECOND HALF, SAME GUARD (measured 11.08.2026): the guard watches EVERY pushed ref, and
  a ref a delegated agent is still BUILDING ON can never satisfy it. While one agent
  worked, its branch took a push every few minutes; GitHub's concurrency group cancels
  the in-progress run on each new push, so the branch presented `cancelled, cancelled,
  cancelled, queued` — never a CONCLUDED run. The main session's turn end was blocked
  four times in ~25 minutes, each block answered by a blocking wait that returned
  "cancelled" and taught nothing. The rule is right where it came from (26 red runs on
  `main` unseen for three weeks) and wrong here: an agent's intermediate commit is not a
  state anybody claims is done — the same reasoning that gives a RESCUE commit
  `[skip ci]` — and the state that must be green is the one `land-point.mjs` re-tests at
  the merge anyway.
  FINAL STATE, second half: (a) a CANCELLED run is never read as pending. A run that
  GitHub stopped because a newer push arrived is a known, harmless outcome, so the guard
  judges the NEWEST run per (ref, workflow) and names that cause where an older one was
  cancelled. (b) A ref carrying a
  LIVE delegated agent — the liveness probe of `scripts/batch-in-flight.mjs` already
  exists and is already consulted at the landing — does not BLOCK on an unfinished run;
  it is REPORTED as still building and judged when the agent reports. (c) A genuinely RED
  run blocks in EVERY case, agent alive or not: this must not become a way to push red
  work past the gate by keeping an agent running.
  VERIFIABLE, second half: Vitest over the pure core — a ref whose newest run was
  cancelled by a newer push does not block; a ref with a live agent and a pending run
  reports instead of blocking; the SAME ref with no live agent still blocks; a red run
  blocks with the agent alive. Plus the transcript case: four consecutive blocks naming
  cancelled runs produce one "still building" line instead.
  Criticality: low-medium — the gate's decision was right every time, so nothing unsafe
  landed. What it cost is trust and turns: a guard whose stated reason does not survive
  a check is one the next reader starts arguing with instead of obeying, and one that
  cannot be satisfied at all is one the next session looks for a way around.

- [ ] 460. A RED VERIFICATION MUST BE DIAGNOSABLE WITHOUT RE-RUNNING IT (30.07.2026; bundle
  K). `runSuite` in `scripts/verify/run-all.mjs` captures each suite's complete output, prints
  only the verdict line plus, on a failure, the `FAIL`/`ERR:` lines and a hardcoded 12-line
  tail — and then DISCARDS the rest. So the context is already bounded; what is missing is the
  EVIDENCE. Diagnosing a red suite today means running it again, and a browser suite on two
  backends is the most expensive wall-clock item we have.
  FINAL STATE: `runSuite` — and the preview and cross-browser paths — writes each suite's
  complete captured output to `local/verify-logs/<run-stamp>/<suite>-<backend>.log` (`local/`
  is git-ignored) and prints that path beside the verdict line, so a session reads the tail of
  a NAMED file instead of re-running the suite. The failure tail length becomes calibratable
  (`VERIFY_FAIL_TAIL`, default the current 12) and applies to EVERY failure, not only a crash.
  What must NOT change: the SUITES' own stdout stays full — the runner parses `^PASS`/`^FAIL`
  counts, `console errors: (\d+)` and `failedChecks` out of it, and condensing the suites
  rather than the runner would blind exactly that parsing. A suite invoked DIRECTLY (`node
  scripts/verify/render.mjs`, the render-verify-guard's per-backend runs) is out of scope; the
  documented route for a condensed run is the runner's filter form, and
  `scripts/verify/README.md` says so. NOT the mechanism: a context compaction — a lossy
  summary of guard, lease and focus state is exactly what the point boundary was built to
  avoid.
  VERIFIABLE: the pure shaping (verdict line, the path line, the calibratable tail length,
  what a green versus a red suite prints) is covered in the Vitest layer; the live path is
  proven by an existing browser suite run writing its log file.
  PRIORITY: behind 458 and 459 — it is a wall-clock and diagnosis saving, not the context
  saving it was drafted for.

- [ ] 504. EVERY BATCH OWNER IS DISPOSSESSED AT HALF AN HOUR OF AGE
  (measured 04.08.2026, 18:50Z and root-caused at 19:00Z). The autostart launcher
  logged "owner provably dead (pid-reused) — taking over" and spawned a second
  session while the owner it judged dead was ALIVE and mid-work: it was running a
  browser suite for the point-499 classification and its own dev server was
  serving. Fifteen minutes earlier the SAME pid had read "owner alive". Nothing
  about the process changed — only the pid-reuse verdict did.
  ROOT CAUSE, MEASURED: the DERIVED pid start time drifts against the RECORDED
  one. Probing the owner's pid five times with the repo's own `probePid` returned
  `startedAt` 1785867604027–604031 while the lock recorded 1785867601073 for that
  very process — ~2.96 s apart, past the fixed `PID_START_TOLERANCE_MS = 2000`
  (`scripts/batch-doctor-core.mjs`). The probe derives the start time from a
  boot-time base (uptime/btime) that walks against the wall clock in this WSL2
  container, so the gap GROWS with the owner's age: at 15 minutes the drift was
  ~1 s and the tick read "pid-alive", at 30 minutes it was ~3 s and the same tick
  read "pid-reused". This is systematic, not a one-off — it dispossesses EVERY
  owner on EVERY long point, and it is exactly the double session the hard
  singleton of 24.07.2026 exists to prevent. Two browser-suite runs on one
  machine also invalidate every timing measurement the batch takes.
  FINAL STATE:
  1. PID identity is no longer judged by comparing two start times read from
     clocks that drift apart. Either both are re-derived from ONE reading at
     compare time, or identity is keyed on a drift-free handle (`/proc/<pid>`
     inode plus an argv match), or the tolerance grows with the owner's age.
     Whichever is chosen is written down with the measurement that justifies it.
  2. A "pid-reused" verdict against a pid whose `/proc` entry still names the
     SAME argv and session is not believed. The takeover additionally requires
     the corroborating signals the tick already reads — declared work advancing,
     heartbeat age — before it dispossesses an owner.
  3. A Vitest case feeds a DRIFTING clock base and proves a live owner of any age
     is never read as recycled; a genuinely recycled pid must still be caught, so
     the test covers both directions.
  REPRODUCED ON A SECOND OWNER (05.08.2026, 20:37): the launcher spawned session
  e3f5442b against the LIVE owner 7c21e596 (pid 2257916, 30:44 of age, eight
  running child shells including a browser suite in a worktree). Measured on the
  spot: the in-flight declaration recorded `pidStartedAt` 1785953215453 while
  `probePid` returned 1785953218212 for the same pid at that moment — 2759 ms
  apart, past the same fixed 2000 ms tolerance, on the same drift curve (~1 s at
  15 min, ~3 s at 30 min). The intruder stood down without touching the batch, so
  the damage stayed at one duplicated session; the drift is confirmed systematic
  and owner-independent.
  REPRODUCED A THIRD TIME, AND THIS ONE COST WORK (08.08.2026, 19:55:22Z): the
  launcher logged the same "owner provably dead (pid-reused)" against pid 1055612,
  which was ALIVE and mid-verification — the second-backend `polish` run for point
  342, started 86 s earlier, with its dev server serving. The dispossessed session
  took its point-556 notice and stood down correctly, so the stand-down half works;
  the run it was in the middle of died with it and had to be repeated.
  AND IT PROVES POINT 556 DOES NOT COVER THIS DOOR: `leaseTakeoverDecision` — the
  corroboration that refuses to dispossess a live owner whose declared work is
  advancing — was never reached, because "pid-reused" resolves to `provably dead`,
  which the tick ranks AHEAD of the lease branch. The owner had a valid declared
  wait on its worktree at that moment and it changed nothing. Clause 2 below is
  therefore about the DEAD door specifically: its corroboration must sit on the
  pid-identity verdict itself, not only on the lease path 556 hardened.
  The drift-free handle of clause 1 has a concrete candidate on this host: identity
  as (`/proc/sys/kernel/random/boot_id`, `starttime` jiffies from `/proc/<pid>/stat`)
  — both boot-domain, so the wall clock never enters the comparison. Measured while
  writing this: `processStartTime` computes `Date.now() - (uptime - starttime/HZ)`,
  and the uptime-derived boot instant stood 0.9 s from the `btime`-derived one on a
  quiet machine — under the 2000 ms tolerance at that moment, but on the same curve.
  VERIFIABLE: the unit layer pins both directions against a drifting base, and a
  batch owner older than an hour is still read as alive by
  `node scripts/batch-doctor.mjs` on this host.

- [ ] 515. THE PARALLEL-SESSION DETECTOR COUNTS A PLACEHOLDER OWNER AS A SECOND
  SESSION (measured 05.08.2026). The batch PAUSED ITSELF at 13:06 because the
  alert "PARALLEL batch sessions" had gone five times unanswered. The alert was
  FALSE. `.claude/batch-lock.json` carried the placeholder `x` as its `sessionId`
  (still visible as `sessionIdBefore`, restamped 12:07). The detector compares the
  lock's owner id against the observed session ids; a placeholder matches no real
  id, so EVERY live session read as an additional one. The log proves it twice
  over: `08:06 owner=x plus 45289138-…`, `11:06 owner=x plus 52543006-…` — two
  different "second" ids against the same placeholder owner, and on both occasions
  exactly ONE claude process was running (pid 1470, the very pid the lock names).
  The cost is not the alert but the escalation: a self-pause that only a human can
  lift, on evidence that was never there.
  FINAL STATE:
  1. A lock whose `sessionId` is not a valid session id counts as owner UNKNOWN,
     never as a foreign owner. The detector may then report "owner unknown"; it may
     not report parallel sessions.
  2. A session whose pid equals the lock's pid is NEVER a second session, whatever
     the ids say — the pid is the stronger evidence and settles it first.
  3. Both cases are covered by Vitest in the pure decision core.
  4. The escalation chain itself stays untouched: five unanswered alerts still
     pause the batch. The point removes the false alert, never the response to a
     real one.
  5. A self-pause no longer writes a card into "Von dir zu klären" (user
     05.08.2026: "das liegt nicht in meiner Hand. Analysiere und behebe du das").
     That section holds GENUINE user decisions only; diagnosing a pause and
     lifting it is the session's own work. The pause is instead reported where the
     session's own state is reported — the now-card — so the reader sees it
     without being asked to act on it.
  WHERE THE PLACEHOLDER COMES FROM, MEASURED 05.08.2026 21:08 — the point above
  treats it as weather; it is written by our own code. `ownsLock(sessionId)`
  (`scripts/batch-singleton.mjs`) RESTAMPS the lock's `sessionId` to whatever id
  the CALLER passed as soon as process ancestry proves the lock belongs to this
  process tree. Any caller reaching it with a throwaway id — `--session x` through
  `resolveSessionId` — therefore renames a LIVE owner's lock to that id, which is
  exactly the `sessionIdBefore: <real id>` / `sessionId: "x"` pair both incidents
  left behind. `isProbeSessionId` is the only filter and does not recognise a bare
  placeholder.
  WHAT IT COST TODAY, and why item 2 above is not enough on its own: the renamed
  owner could no longer prove itself either, because `ownsLock` with the REAL id
  then answered `pid-reused` — point 504's drifting start-time compare, on the same
  lock, in the same minute. The live session was fenced out of its OWN batch (no
  merge, no push, no tick) with two delegated agents still building, and the claim
  path could not resolve it: the owner that must honour a claim at its next clean
  moment IS that fenced session, so the handover deadlocks. Ownership was restored
  by writing the recorded `sessionIdBefore` back by hand — the repair the toolchain
  does not offer.
  6. A RESTAMP DEMANDS A PLAUSIBLE SESSION ID. `ownsLock` renames a lock only for
     an id of the shape a real session carries; a placeholder, a probe id or an
     empty string leaves the recorded owner untouched and answers the ownership
     question without writing. Renaming a lock is a side effect of asking a
     question, so the question must be safe to ask.
  7. AN OWNER HOLDING THE LOCK'S PID HAS A SUPPORTED WAY BACK. Where the lock's
     `pid` is this very process (argv and session match) but the id no longer does,
     one command re-stamps it — `node scripts/batch-doctor.mjs --repair` treats it
     as a torn state and names it in its verdict, rather than reporting "consistent"
     as it did today. Hand-editing the lock is then never the only path.
  VERIFIABLE: a lock carrying a placeholder id plus one live session produces no
  parallel-session alert in the pure core's tests, and the same setup replayed
  against the real detector stays silent; a Vitest case pins that the pause path
  writes no "Von dir zu klären" card; a placeholder id passed to `ownsLock` leaves
  the lock's recorded owner byte-identical while a real id still restamps; and the
  doctor reports the pid-mine/id-foreign lock as torn and repairs it.

- [ ] 517. THE LEASE-EXPIRY TAKEOVER IGNORES AN HONOURED CLAIM (measured
  05.08.2026). The launcher tick took the batch from session 91c1ac42 after 67
  minutes without a lease renewal (LEASE EXPIRED) and spawned a FRESH headless
  successor, although a claim from the user's own window d68e8df9 had stood since
  14:14 with `honour: true` — the same tick had still respected that claim at
  12:36Z ("reserved — the user is working in that window"). The boundary path knows
  the CLAIMING_WINDOW target (`boundaryHandover` in `scripts/batch-boundary.mjs`);
  the lease-expiry path in `scripts/batch-launcher-core.mjs` does not, and spawns a
  successor unconditionally. The consequence is that a user who wants to take over
  WITHOUT forcing anything can wait arbitrarily long: the batch moves from session
  to session past him.
  FINAL STATE:
  1. On lease expiry the launcher reads the claim state before it decides. With an
     HONOURED claim standing, the lock is RELEASED and RESERVED for the claiming
     window instead of being handed to a new successor — the same target the
     boundary path already resolves.
  2. Both paths reach that decision through ONE shared function, so a future change
     cannot fix one and leave the other behind; the boundary path keeps its current
     behaviour byte for byte.
  3. A claim that is expired, or whose claimant is dead, still yields a successor —
     the reservation follows the claim's own `honour` verdict, nothing else.
  4. The reservation is bounded: a claiming window that never takes the lock does
     not stall the batch forever, and what the bound is, is stated where the
     reservation is written.
  MEASURED AGAIN ON A SECOND TRIGGER (06.08.2026, 02:22Z): the same tick took the
  batch from session 898cbf40 with "LEASE EXPIRED — has not renewed for 55 min", in
  the same breath as its own reading "declared work advancing — branch
  refs/heads/feat/483-adults-teach-landscape — tip 2 min old; worktree … active 0 min
  ago". The owner was alive and stayed alive: two minutes AFTER the takeover it
  started a `polish` run that rewrote 34 verification frames inside the very worktree
  the new owner was merging from. The lease renews BEFORE each call, so an owner that
  legitimately WAITS inside ONE long call — on a delegated agent, on a browser suite —
  cannot renew at all; the in-flight declaration exists to hold the lock for exactly
  that case, but it lapses after 45 minutes and nothing extends it while its own
  evidence is still moving. The lease arithmetic itself is not in question (user
  30.07.2026) — what is missing is a renewal that runs OUTSIDE the blocked session.
  FINAL STATE (continued):
  5. The launcher tick, which already re-reads a declaration's evidence every cycle,
     EXTENDS the lease while that evidence is provably advancing, and stops the
     moment it is not. Ownership therefore stays arithmetic — a standstill still
     loses the batch, because quiet evidence renews nothing — but a wait that is
     genuinely working keeps it however long the call runs. The 45-minute lapse
     remains the backstop for a declaration whose evidence went quiet.
  6. Items 1 and 5 are the same decision and reach it through the shared function of
     item 2: one place decides what an expired lease means.
  VERIFIABLE: pure Vitest on the launcher's decision (lease expired + honoured claim
  → reserve, never spawn; lease expired + no claim → spawn; lease expired + expired
  claim → spawn; the bound elapses → spawn; lease expired + a declaration whose
  evidence still advances → renew, never spawn; lease expired + a declaration whose
  evidence has gone quiet → spawn), and the boundary path's existing tests stay green
  unchanged.

- [ ] 463. TWO LIVENESS READINGS THE FORCED HANDOVER PROVED WRONG (30.07.2026, both
  observed while taking the batch back by force; bundle Session- & Repo-Hygiene).
  PART A — A KILLED OWNER READS AS ALIVE FOR FIVE MINUTES. `assessOwner`
  (`scripts/batch-singleton.mjs`) returns `fresh-heartbeat` for any heartbeat younger than
  `DEAD_CONFIRM_MS` WITHOUT probing the pid, so a stopped owner keeps the batch for up to
  five minutes and the claimant is told, wrongly, that a live session holds it. FINAL STATE:
  when the lock carries a pid and a start time, a fresh heartbeat is confirmed by the same
  identity probe the claim path already uses; a heartbeat that is fresh but whose process is
  provably gone reads as DEAD at once. The generous window stays for a lock WITHOUT a usable
  pid (a legacy or foreign-host lock), where the probe cannot decide — that is what the
  window was for.
  PART B — A GUARD THAT DOES NOT STAND DOWN. `scripts/guide-brevity-guard.mjs` checks only
  `.claude/batch-paused`; it has no `heldByOtherLiveOwner` stand-down, and it blocked the
  turn end of a session that did NOT own the batch over doc debt the OWNER had just committed.
  The house rule is that every guard stands down for a non-owner and for a paused batch.
  FINAL STATE: the guard stands down like the others. IN THE SAME POINT, sweep the guard
  directory for the same omission — a guard is either wired with the stand-down or is
  deliberately global with the reason written beside it — and record the sweep's result in
  the commit message, so this is a one-off audit rather than a recurring surprise.
  VERIFIABLE: the pure layer covers both — a fresh heartbeat with a dead pid assessed as
  dead, a fresh heartbeat without a pid still assessed alive, and the guard's stand-down for
  a non-owner; the sweep is evidenced by the commit message naming every guard checked.

- [ ] 554. THE CHAT WATCHER LEAKS ORPHANS THE SUPERVISION CANNOT SEE (measured
  08.08.2026 on a quiet machine, while point 309's regression ran). `pgrep -f
  chat-watcher.mjs` returns TEN live processes — the oldest running since 04.08.,
  three days — while `.claude/chat-watcher.json` names exactly one (pid 2861724).
  `watcherSupervision()` (scripts/chat-watcher-core.mjs) decides purely from that
  ONE recorded pid: alive → `none`, otherwise → `start`. A watcher that is not (or
  no longer) the one in the pidfile is therefore INVISIBLE to it and is never
  stopped, and every start that overwrites the pidfile orphans its predecessor for
  good. The drift hypothesis from `verify-owner-really-dead` was MEASURED and
  RULED OUT: `probePid(2861724).startedAt` deviates 231 ms from the recorded
  `pidStartedAt` against a 2000 ms `WATCHER_PID_TOLERANCE_MS`, so the supervision
  reads its own pidfile process as live and correctly starts no second one — the
  orphans are residue of earlier runs, not of the running tick.
  WHY IT MATTERS: each orphan holds its own ntfy subscription and can spawn a
  responder on one chat message — the multiple-answer failure the singleton work
  exists to prevent. It is latent, not cosmetic.
  FINAL STATE: the supervision judges the process POPULATION, not one recorded pid.
  It enumerates the live watchers by their command line (the `pgrep`-shaped probe
  the singleton family already uses), keeps the pidfile's process when that one is
  genuinely alive, elects exactly one survivor when it is not, and STOPS every
  other. Liveness stays by IDENTITY, never by bare existence, so a recycled pid is
  never killed for inheriting a number. A paused batch still stops all of them.
  SEPARATE AND COSMETIC, same file, fix it in passing: every line in
  `.claude/chat-watcher.log` is written TWICE, with identical millisecond and
  identical sessionId — one process writing twice, because stdout and stderr share
  one fd (`stdio: ['ignore', out, out]`, scripts/batch-autostart.mjs:390) and the
  logger emits on both. One line per event.
  VERIFIABLE: pure Vitest on the decision core with the enumeration injected — two
  live watchers plus a pidfile naming one yields `stop` for the other and `none`
  for the recorded one; a pidfile naming a DEAD pid beside two live ones elects one
  and stops the rest; a recycled pid (existence yes, start time outside tolerance)
  is never stopped as if it were ours; `paused` stops all; an empty population
  yields `start`. Plus a live check: after one launcher tick, `pgrep -fc
  chat-watcher.mjs` is 1, and the log carries each event once.
  IT STOPPED BEING LATENT (08.08.2026, 08:05): the user reported receiving the SAME
  answer seven times in a row for a reply this session sent exactly once. Eleven
  watchers were live at that moment. Ten were stopped by hand to end the user-visible
  spam, which is remediation and not the fix — the supervision that let them
  accumulate is unchanged, and a fresh tick spawns another whenever the pidfile's
  process is not the one it finds.
  Criticality: raised to HIGH — no longer a latent risk but a fault the user sees,
  and it reaches him directly rather than through the build.

- [ ] 455. A RED THAT LOAD DID NOT EXPLAIN (30.07.2026, measured: `batch-doctor --gate` called
  a real unit-test failure INCONCLUSIVE because of "1 live agent worktree", and that worktree
  had last been written the previous evening; bundle Testinfrastruktur). The load excuse is
  right in principle (retrospective §3.22/§3.48) and was wrong here: it downgraded a genuine
  red — the retro ledger demanding entries for three lessons — to "repeat later", which
  unattended means the batch runs on a red tree for hours. A worktree only counts as LIVE
  evidence of load when something has recently been WRITTEN in it (the probe of point 434
  already dates an agent by its edits — reuse it, do not build a second one), and the verdict
  names its evidence: which worktree, how old its newest edit, what CPU was measured. A stale
  worktree directory is debris (443) and never an excuse.
  THE SAME EXCUSE FROM THE PROCESS SIDE (11.08.2026, measured): the quiet-machine check of the
  verify runner counted the BATCH SESSION ITSELF as "another verify/browser suite run" — its
  evidence line named `pid 1373729: /usr/local/share/npm-global/bin/claude -p Autonome
  Batch-Wiederaufnahme …`, because the session's own prompt text contains the verify script
  names and the probe matches the whole command line. Unattended that is total: every run of an
  autonomous session declares itself loaded, so every red it takes is "not authoritative" by
  house rule. A process counts as load only when it IS a suite (its argv NAMES a
  `scripts/verify/` entry point as the program, not inside a prompt), and the session's own
  process and its descendants never count as load against themselves.
  VERIFIABLE: Vitest on the pure verdict — a red beside a worktree whose newest edit is hours
  old is BROKEN, not inconclusive; a red beside a worktree edited a minute ago stays
  inconclusive; the reason string names the deciding measurement. Plus, on the process probe: a
  `claude -p "<prompt naming scripts/verify/run-all.mjs>"` argv is NOT load, a real
  `node scripts/verify/run-all.mjs polish` argv IS, and the session's own pid never counts.

- [ ] 602. WHAT ELSE DID WE BUILD AND NEVER USE? (user 09.08.2026, on learning that the
  section runner of point 566 has never been used once: "Dass du 566 nicht eingesetzt
  hast, ist aber fatal und legt eine grundsätzliche Lücke auf. Lege einen weiteren Punkt
  an, um zu prüfen, ob es noch weitere Mechanismen gibt, die du gebaut hast, um Dinge zu
  verbessern, aber dann nie eingesetzt. Und überlege, ob es eine Möglichkeit gibt, sowas in
  Zukunft zu verhindern."). THE KNOWN CASE: 566 built `--section=<name>`, `enrichments`
  declares nine sections, the resolver and the PARTIAL marking work — and it appears in the
  verify README and in `tiers.mjs` and NOWHERE ELSE. No delegation brief, no agent prompt,
  no rule text names it; no recorded run is partial; the three agents commissioned the
  evening this was found were not told about it either. It was BUILT but never ROUTED, and
  nothing noticed for a day.
  THIS IS A DIFFERENT AXIS FROM POINT 591. That audit asks whether the practice obeys the
  written rules. This one asks a question no rule covers: which delivered CAPABILITIES are
  never exercised? A capability nobody was told about breaks no rule — it simply sits
  there, and every guard in the house stays green.
  PART ONE — THE SWEEP. Enumerate what was delivered as an improvement and ask, per entry,
  for EVIDENCE OF USE: the CLI flags and options of `scripts/**`, the debug-menu levers,
  the dev hooks (`window.__*`), the verify runner's modes and tiers, the recorded
  registers, and every helper a rule or brief was supposed to route work through. Evidence
  means a recorded run, a log line, a register entry, a commit that invoked it, or a
  document that puts it in someone's path — NOT the fact that it exists and is tested. Its
  own tests do not count: 566's resolver is Vitest-covered and was still never used.
  Each finding is classified: USE IT (route it, and say where), RETIRE IT (delete the
  capability and its tests — an unused mechanism is carrying cost), or KEEP UNUSED with a
  written reason (a fallback for a case that has not occurred is legitimately idle).
  PART TWO — THE PREVENTION, which is the half the user asked for. Three parts, in
  ascending cost:
  1. ROUTED IS PART OF DELIVERED. A point that builds a capability names, in the same
     commit, the place that makes someone reach for it — the delegation-brief building
     block, a rule line, a runner default, a printed hint at the moment of the expensive
     alternative. Building without routing is half a delivery, and this is the cheapest of
     the three because it costs one sentence at the time the author still knows where the
     capability belongs.
  2. EVERY CAPABILITY DECLARES ITS USAGE SIGNAL. At delivery, the point states what would
     PROVE the capability is being used — a counter, a recorded run, a log line, a register
     entry. A capability whose use cannot be observed is not finished, because nobody can
     ever answer the question the user just asked without reading the whole repository.
  3. A PERIODIC UNUSED REPORT, and deliberately a REPORT, not a block: a command lists the
     declared capabilities whose usage signal has not fired since delivery, past a grace
     period. It runs in the closing cycle, where a slow question belongs. It does not block
     a turn — an idle fallback is not a defect, and a gate that fired on one would teach
     everyone to declare no signal at all.
  DELIVERABLE: `docs/unused-mechanisms-audit.md` — the sweep with its evidence per entry
  and the three classes, plus what was routed on the spot; everything larger becomes its
  own appended point, ranked deliberately. The prevention's three parts land as rule text
  and as the report command, and the rule text is the part that must not be skipped.
  METHOD: the sweep is a DIVERGENT, ENUMERATING stage — "what did we build that nobody
  uses" is exactly the question where a reviewer handed a list checks that list — so it
  runs BLIND PARALLEL across both models and the two results are merged by MEANING
  (CLAUDE.md §6). The prevention's design is convergent and takes the ordinary review.
  Criticality: HIGH — every unused mechanism was paid for twice: once when it was built,
  and again in every hour it would have saved and did not.


- [ ] 603. THE GROUND'S MICRO-DETAIL SITS JUST UNDER ITS OWN BAR, AND NOBODY OWNS IT
  (measured 10.08.2026 during the acceptance of the play-session packages; the triage point
  of 04.08.2026 named this failure and closed without giving it an owner). The `settings`
  check `first-person ground shows micro-detail (edge energy)` reads a Laplacian mean of
  1.08–1.09 against a bar of 1.1 — red twice in a row on a QUIET machine, and
  `baseline-classify` against the pre-merge commit calls it PRE-EXISTING / stale
  assumption. It has therefore been red for days while every run charged it to "known",
  which is precisely how a check stops being evidence.
  WHAT MAKES IT WORTH A POINT rather than a threshold nudge: 1.08 against 1.1 is not a
  wrong number, it is a number without a verdict. Either the ground genuinely lost the
  grain that acceptance criterion 15 demands at eye height, or the crop the check measures
  no longer contains the surface it was written for. On 04.08.2026 the same check read 0.00
  with AND without the graphics card, which proved it was not the hardware and left the
  question open.
  FINAL STATE, decided BY THE PICTURE and never by the number (the triage point's own
  rule): take the frame the check measures at the current head, look at it, and say which
  of the two it is. If the ground lost its relief, that is a render defect and is fixed. If
  the check crops somewhere the relief never was, the CHECK is corrected — with the reason
  written into it — and never by lowering the bar until it passes. Whichever it is, the
  check goes green on a quiet machine twice in a row, or it is deleted with its reason.
  UNTIL THEN this point is where that red is charged, so an acceptance run can state its
  reds honestly instead of carrying an unowned one.
  Criticality: medium — no crash and nothing the player reports, but an unowned red inside
  the everyday gate is a hole in the one signal every other point is judged by.

- [ ] 528. THE DEPLOY THAT NEVER REACHES A RUNNER LEAVES THE SITE STALE, AND POINT
  526 IS UNPROVEN ON THE LIVE PATH (measured 06.08.2026, immediately after 526
  merged). Point 526's VERIFIABLE demands, besides its Vitest layer, ONE REAL
  DEPLOY RUN proving a commit still reaches the live site. That proof could not be
  taken: from 15:35 UTC GitHub Actions was degraded — two runs died in `Set up
  job` with `Failed to resolve action download info. Error: Internal Server
  Error` / `Service Unavailable`, `workflow_dispatch` answered HTTP 500, and the
  one run whose build succeeded (31117749040) had its `deploy` job cancelled at
  16:15:56 UTC with ZERO steps recorded, 15.5 minutes after becoming eligible —
  it never got a runner. What 526 DID prove against a real red run is its
  classifier: `classifyFailureCause` read run 31116867124 as `external` with the
  remedy naming the unblock command, so item 4 holds. Items 1, 2 and 5 — the
  cancel-and-retry inside a run that actually executes — remain unexercised.
  Consequence meanwhile: `main` stands at ee125053 while the site still serves
  c728c816, so the user judges render work against a stale build.
  The classifier half was BUILT the same evening, on `main`, because the guard was
  holding the session over a red no push could clear: a failed job that executed
  no step of ours now reads as external — but only where the failing workflow's
  OWN file is proven unchanged since its last green run, since a broken `uses:`
  or `runs-on` dies in the same shape and IS ours; such a red no longer blocks the
  turn end, it re-alerts hourly instead, and the waiver is judged against EVERY
  red on the commit so one outage cannot excuse another workflow's real failure.
  Two-pass Fable review recorded. What that leaves is below.
  FINAL STATE:
  1. The live proof of 526 is taken: one deploy run whose `deploy` job really
     executes, whose `Verdict` step prints its explicit line, and after which the
     served site matches `main`. Recorded in `docs/acceptance-evidence.md` beside
     the criterion it belongs to.
  2. It is settled by measurement whether the deploy job's own
     `timeout-minutes: 25` contributed to the cancellation (the 15.5-minute gap
     says it did not, but the value was chosen without this failure in view);
     the value is either justified in a comment or corrected.
  3. A deploy that never reached the site is NOTICED without a human looking:
     the batch learns that the served build lags `main`, names both revisions,
     and retries once GitHub answers again — the site being stale is the fault
     that matters, not the run being red. This is the item the outage showed to
     matter most: every alarm the project has fires on a RED RUN, and none on a
     site that quietly serves yesterday.
  4. The reviewer's two recorded residuals are closed or written off with a
     reason: a workflow byte-identical to its last green run can still be broken
     from outside (a retired `runs-on` image, a yanked action tag), which the
     "untouched" proof reads as an outage though only a push fixes it; and
     `fetchJobs` walks only the first 30 jobs of a run.
  VERIFIABLE: pure Vitest on the stale-site comparison (served revision vs
  `main`) and on the two residuals of item 4, plus the one real deploy run of
  item 1 with its run id recorded.

- [ ] 507. A LOST WEBGPU DEVICE ENDS THE RUN QUIETLY AND THE PICTURE BLACK
  (measured 05.08.2026, both quiet runs of `invariants` on the software WebGPU
  lane). The suite ends `2 pass, 0 fail` with 9 and 2 console errors —
  `AbortError: Failed to execute 'mapAsync' on 'GPUBuffer': A valid external
  Instance reference no longer exists`, `THREE.WebGPURenderer: WebGPU Device
  Lost: Reason: unknown`, `OperationError: Instance dropped in popErrorScope`.
  The checks after the loss never run at all; only the console-error gate turns
  the suite red, so the count reads like a partial pass and the loss itself is
  named nowhere. The same loss in the shipped game is what point 493 photographed
  on the mispinned lane: a black canvas behind a live HUD.
  FINAL STATE:
  1. The renderer NOTICES a lost device: `device.lost` is awaited, and the loss
     goes to the dev-mode assert channel with its reason, so every test run and
     every manual session detects it at the moment it happens.
  2. A suite whose device dies FAILS AT THE LOSS, naming it, instead of reporting
     the checks it managed before — a check count that stops early may never read
     as a pass.
  3. The player is told rather than left with a black picture: a lost device
     raises the same localized, dismissible notice path as the WebGL 2 fallback
     (both languages, from the language files), naming that the picture stopped
     and what to do — never a silent black canvas behind a live HUD.
  4. Whether the loss is the software lane's device giving up under a long run or
     a teardown racing an in-flight readback is decided BY THE EVIDENCE the first
     step now produces, and the answer is written into
     `docs/host-environment.md`'s lane section.
  VERIFIABLE: a Vitest case proves the loss handler fires the assert and the
  localized notice from a simulated `device.lost` in both languages; a browser
  case proves a suite that loses its device reports the loss as its failure
  rather than a truncated pass; and `VERIFY_GL=webgpu npm test -- invariants`
  either completes on this host or names the device loss as its verdict.

- [ ] 519. THE JOURNAL'S HANDWRITING EXISTS ONLY ON THE AUTHOR'S OWN MACHINE
  (measured 05.08.2026 while verifying point 394 in this Linux container). The
  journal's handwritten look (§16/§16.3, acceptance criterion 29) is asked for by
  NAME alone: `font-family: 'Segoe Script', 'Bradley Hand', 'Comic Sans MS',
  cursive` (`src/index.css:700`, and the observation input at :885). All three are
  HOST fonts — Segoe Script ships with Windows, Bradley Hand with macOS, Comic Sans
  with neither Linux nor Android. Where none is installed the browser falls back to
  the generic `cursive`, which on this host resolves to DejaVu Sans: an upright
  sans-serif. The chronicle then reads as plain text, the stroke-by-stroke reveal
  writes in that plain text, and the whole conceit of a hand-written journal is gone
  — for every player not on Windows or macOS, and for every verification frame
  captured off such a host (which is why frames 81/82/83 regenerated in a container
  are weaker evidence than the Windows-captured originals).
  FINAL STATE: the handwriting SHIPS WITH THE GAME instead of being borrowed from
  the host. One open-licence handwriting face is self-hosted as an `@font-face`
  from a repository-local woff2 (subset to the characters the two language files
  actually use, German umlauts and ß included), declared FIRST in both stacks with
  today's host fonts kept behind it and generic `cursive` last. It loads from the
  bundle like every other asset — never from a CDN, so the game's own look never
  needs a network — and the licence text travels with the file. Its size is stated
  in the commit that adds it, per the dependency-justification rule.
  VERIFIABLE: pure Vitest that both stacks name the bundled family first and that an
  `@font-face` rule defines it from a repository-local path (no `http(s):` source);
  and a browser check on this container — which has none of the three system fonts —
  that the journal's rendered text is actually drawn in the bundled face
  (`document.fonts.check`) and measures a different width from the generic fallback,
  so a silent fallback fails loudly instead of quietly producing plain text.
  Screenshot 81 refreshed on the bundled face.

- [ ] 551. THE TRANSIENT STATUS HINT IS DRAWN ON TOP OF THE REGION NAME (seen
  07.08.2026 in the verification frames `121-harmattan-pall-january.png` and
  `122-atlas-snow-february.png`, WebGL 2, and reproducible in every frame the
  enrichments suite writes while the canoe hint stands). The centred hint "The canoe is
  dead weight on land and slows me — better left in a camp for long overland stretches."
  and the region name occupy the SAME strip of the status bar, and both are drawn: the
  frames read "Westcanoe is dead weight …" and "Northanoe is dead weight …", the region
  word running into the hint's first word. It is not a clipping artefact — the hint's
  own bordered box sits over an unhidden label.
  Acceptance criterion 9 (`CLAUDE.md` §7.1) puts BOTH there on purpose: the region is a
  permanent stat and the hint renders "CENTRED inside the status bar itself, not in a
  separate floating panel". So the collision is by construction, and the fix belongs on
  the hint's side, not by moving it back out into a panel.
  FINAL STATE: while a transient hint stands, the status bar YIELDS the strip it needs —
  whatever permanent element the hint would overlap is hidden for its lifetime (not
  faded, not shifted under it) and comes back unchanged when the hint expires. The hint
  keeps its centred position and its box. Which elements can be yielded is decided by
  measured overlap, not by a hard-coded guess about which stat sits where.
  VERIFIABLE: a Vitest case on the HUD component — with a hint active, the overlapped
  permanent element is not rendered, and after the hint expires it is back; plus a
  browser frame showing the hint over a status bar with no text behind it. Both
  languages, since the German hint has a different width.
  Criticality: medium — nothing breaks, but it is the first thing in the picture a reader
  sees as sloppy, and it is in every screenshot the suites write.

- [ ] 464. A RED UNIT LAYER REACHED `main` THROUGH THE PRE-PUSH GATE (user 30.07.2026:
  "Sorge dafür, dass das sicher nicht mehr passiert."; bundle Testinfrastruktur). CI run 30555562185 on
  `main`, commit `4d580957`, failed at step `npm run test:unit` — the guide-brevity audit,
  because that commit pushed `docs/analysis_de/vibe-coding-anleitung.md` over its budget. The
  commit four minutes later paid for it, so the red was brief, but it MAILED the repository
  owner and it is the second such report in one day. The pre-push gate exists precisely to
  make this impossible, and on the same afternoon it PROVED it can fail closed (it refused a
  push of this session's with "unit ran an unreadable file count … nothing was compared").
  So the defect is not "the gate is missing" but "the gate's verdict is not binding".
  THE PATH IS MEASURED, not guessed (11.08.2026, the same failure a second time): the push of
  `7eb2076f` turned `main` red at `npm run test:unit` and mailed the owner, and the red is
  `scripts/retro-core.test.mjs` — two freshly written retrospective sections without an entry
  in the lesson-mechanism ledger. Reproduced locally on that exact commit: 1 failed, 52
  passed. The gate let it through because it REUSED an older unit verdict:
  `.claude/pre-push-gate-state.json` names its last unit run at 2026-08-11T03:56Z with 9660
  tests while CI ran 9685, so no fresh run was recorded for this push, and the gate's own line
  ("unit ran N — the same N files as the last green run") says why: the reuse is keyed on the
  SET OF TEST FILES, which does not change when a test reads a DOCUMENT that did. That is the
  same blind spot `isProseOnlyPath` deliberately avoids elsewhere — a prose commit is not
  test-neutral when a test asserts about the prose.
  SO THE FIX HAS TWO HALVES: the reuse key must cover every input a test READS, not only the
  test files themselves (in doubt, run — a reused verdict is only ever an optimisation), and
  the verdict must be bound to the sha as below.
  FINAL STATE, whichever path it was: a push of `main` carries a RECORDED gate verdict — the
  HEAD sha it was computed for, the suite counts, the verdict — and a push whose recorded
  verdict does not belong to the exact sha being pushed is REFUSED, not warned about. An
  internal error in the gate refuses the push as well: this is the one guard in the project
  that must fail CLOSED, because the thing on the other side is a red `main` and a mail to
  the user. `--no-verify` is refused for `main` the same way.
  VERIFIABLE: the pure layer covers the verdict record (accepted for the matching sha,
  refused for a different one, refused when absent, refused on an internal error), and a live
  push attempt on a deliberately red tree is refused.

- [ ] 457. A RECORDED "DO NOT MERGE" MUST NOT SATISFY THE GATE (retrospective §3.67,
  30.07.2026 — three cases in one morning, one of which would have turned `main` red; bundle
  Modell & Wächter). `scripts/mechanism-review-guard.mjs` asks WHETHER the other model's review
  is recorded, not WHAT it says: an agent started its review in the background, finished before
  the verdict returned, and the branch looked reviewed. Make polarity and order part of the
  condition — a verdict of "do not merge" or "with corrections" no longer satisfies the gate;
  only a LATER verdict on a LATER commit does. Second half in the delegation brief
  (`scripts/point-brief.mjs`), at the line where the commit-per-step rule already lives:
  whoever commissions a review stays in the turn until it is back.
  SECOND SOURCE OF THE SAME JUDGMENT (measured 11.08.2026 on point 640, which the gate
  refused while every review it asked for existed). "Later" is decided by TWO facts: the
  clearing commit must DESCEND from the refused one, and the clearing row must be RECORDED
  after it. The first is a property of the code and is sound. The second is a property of
  when somebody typed the command — and an agent that reviews all round and writes its rows
  in one batch at the end can write them in any order. Here the closing `merge` landed in
  the ledger six seconds BEFORE the refusal it answers, so the gate reported "a later merge
  exists, but not for a LATER commit" about a commit that demonstrably descends from it, and
  the point could not be ticked until the row was written again.
  FINAL STATE for it: the descent test decides alone where it can. Where the clearing
  commit descends from the refused one, the review IS the answer, whatever order the rows
  reached the file — record time only breaks a tie the code cannot (two records against the
  SAME commit, where nothing changed between them, which is the case the rule was built
  for). The refusal the gate prints names which of the two facts is missing, so the reader
  is not sent to look for a fix that was already made.
  VERIFIABLE: Vitest on the decision — a negative verdict blocks, a positive one on an OLDER
  commit blocks, a positive one on the current commit passes; a positive one on a DESCENDANT
  commit passes even when its record timestamp precedes the refusal's; two records on the
  SAME commit still block; the brief's text is pinned by its existing test.

- [ ] 510. THE RENDER-VERIFY CORE COUNTS A RUN THAT NEVER CONFIRMED ITS BACKEND
  (four-eyes review of point 505's gate change, 05.08.2026 — the reviewer cleared
  that change and left these three beside it).
  FINAL STATE:
  1. `coveringRun` (`scripts/render-verify-core.mjs`) counts a run only when it
     also CONFIRMED its backend. Today it reads the exit code alone, so a run that
     never reached `assertBackend` covers — and since that call is what writes the
     feature level, such a run carries neither signal and still passes. Vitest
     pins both directions.
  2. `coveringRun(runs, b, since, null)` no longer throws: the options default
     catches `null` as well as `undefined`, or the totality test stops claiming
     more than holds. The outer guard catches it fail-open today, so this is
     honesty about the core's contract, not a live defect.
  3. The CLOSING (§9) demands a core-level WebGPU sighting once per release, so a
     compatibility-level lane never becomes the sole WebGPU evidence for a tag.
     The turn gate stays level-agnostic — demanding core there would hard-block
     every render change on a host whose only adapter is compat (point 505).
  VERIFIABLE: Vitest — an unasserted run never covers, an asserted one does, and
  the options default survives `null`; `scripts/closing-guard-core.mjs` carries the
  core-level step and `--status` lists it.

- [ ] 518. THE SHUTTER JUDGES ITS AIM BEFORE THE WAIT AND NEVER RE-JUDGES (found
  05.08.2026 while closing point 489). `captureFrame` checks that the frame's
  declared subject is in the picture, and only THEN waits up to 120 s for the scene
  to finish drawing. Nothing re-judges the aim afterwards. Where the camera drifts
  during that wait, the frame is written with its subject out of view while the
  shutter reports it was in view — precisely the class of defect points 375 and 489
  exist to prevent. The drift is not hypothetical: the Nile current carries the
  traveller downstream for as long as he stands in the river (CLAUDE.md §7.1 pt. 21),
  which is why frames 117/118 had to be re-aimed immediately before each shot rather
  than once at the start.
  FINAL STATE:
  1. The subject check runs AGAIN after the readiness wait, immediately before the
     shutter opens, and that second reading is the one that decides. A frame whose
     subject left the picture during the wait FAILS LOUDLY, naming what was found
     instead — the same message the first check already produces.
  2. The re-probe costs nothing where nothing moved: it is the existing projection
     read, not a second settle.
  3. The re-aim that points 117/118 carry today is no longer the mechanism that
     keeps a drifting frame honest — it may stay as an aim, but the guarantee comes
     from the shutter.
  TWO MORE FINDINGS FROM THE FOUR-EYES REVIEW OF 489 (Fable 5, 05.08.2026, verdict
  merge-with-fixes — they belong here because they are the same gate and the same
  file, and one verification round should close all three):
  4. STILLNESS CONFLATES FINISHED WITH NOT-RENDERING. The readiness verdict reads
     only the draw-call and triangle counts, so a render loop that has STALLED
     freezes them exactly as a finished scene does — and the shutter opens on a
     half-built frame. The wait must additionally demand that the frame counter is
     ADVANCING, so "the numbers stopped moving" can only mean the scene settled,
     never that drawing stopped.
  5. THE QUIET WINDOW HAS ALMOST NO MARGIN. `quietMs` is 5 s against a plateau
     measured at 4 s — one second of reserve on the host the wait was written for,
     and this is the class of value that a slower host eats first. Set it from the
     measured plateau with a stated factor, calibratable like every other such
     value, rather than as a bare constant. The blank-frame FLOOR is re-measured in
     the same pass: `sceneReady-core.mjs` states blank frames stand at 5.5k
     triangles while `world.mjs` measured blank washes at 14–16k against a 20k
     floor — two comments in the same change contradict each other, and the
     surviving one is whichever the measurement supports.
  6. `settle: false` IS UNREACHABLE FOR EVERY KIND BUT `world`.
     `normaliseDeclaration` (`scripts/verify/frameSubject-core.mjs`) keeps the
     `settle` field only for `world` frames and drops it silently for `general`,
     `local` and `place`, so those can never ask for the drawn-only mode. The
     measured consequence is in `scripts/verify/visualsweep.mjs`: its filmstrip
     frames are `general` frames taken WHILE THE TRAVELLER DRIVES AWAY — the motion
     IS the strip — and they now serve the full stand-still wait, which under
     continuous streaming risks the 120 s timeout and in any case destroys the
     1.8 s cadence the strip exists for. The mode must be reachable from every kind
     whose frame can legitimately photograph a moment, and a dropped field must
     never be the silent answer.
  7. AN ELEMENT FRAME PHOTOGRAPHS THE WHOLE SCENE WITH NO WAIT AT ALL (measured
     05.08.2026 on the point-394 branch: `verification/81-handwriting.png` showed a
     BLACK settlement — no ground, no buildings, only floating labels — while the
     same suite's later frame drew Cairo's alley completely; reproduced on a quiet
     machine, so it is systematic, not load). `sceneReadyMode`
     (`scripts/verify/sceneReady-core.mjs`) returns `'none'` for every
     `kind: 'element'` frame, on the reasoning that a DOM subject is complete the
     moment it is on screen — but `captureFrame` then takes a FULL-PAGE screenshot
     unless the declaration carries `clip` or `locator`, so the whole 3-D scene
     behind the element is photographed with no readiness wait at all. Measured
     across `scripts/verify/*.mjs`: 22 element frames, 21 of them full-page, none
     using the `sceneReady: true` escape hatch. The mode must follow the CAPTURE,
     not the subject: an element frame that writes the full page serves the same
     stand-still wait as any other scene frame, and only a clipped or locator-bound
     capture keeps the no-wait mode. `scripts/verify/sceneReady.test.mjs` pins the
     current rule (its "its subject is DOM" case) and changes with it.
     REPRODUCED ON `main` (05.08.2026 21:25, both backends green): a plain `flow`
     run rewrote `verification/02-port-cairo-trade.png` with the settlement behind
     the trade dialog BLACK, where the committed frame shows Cairo's alley. So this
     is not one branch's accident — every element frame in the set is one slow load
     away from photographing an empty world, and the eight frames that run rewrote
     were restored rather than committed.
  8. NOTHING EVER ASKS WHETHER THE CANVAS DREW (found 09.08.2026 by the four-eyes
     review of point 566). A `place` or `local` frame proves its subject through the
     DOM labels, and those labels sit in the HUD layer — they are on screen whether
     or not the scene behind them rendered. Measured: that branch rewrote
     `verification/77-enrich-village-life.png` from a Maasai village (huts, fire,
     inhabitants, 669 KB) to a BLACK canvas carrying only the HUD and the Market
     Hut / Chief's Hut / Elder labels (31 KB), and the shutter opened on it and
     exited 0. Item 7 closes the no-wait path that produces such a frame; this item
     closes the ACCEPTANCE of one, which is the half that makes it evidence.
     FINAL STATE: any capture that includes the canvas additionally requires the
     canvas to have DRAWN — the written frame is sampled and REFUSED when one colour
     occupies more than a calibratable share of it (start at 98 %: a rendered
     African scene never approaches that, while a black or single-wash canvas
     exceeds it immediately). The refusal names the dominant colour and its share,
     in the same voice as the subject refusal. A frame that legitimately photographs
     a near-uniform picture declares that intent explicitly rather than being
     exempted by kind, so the exemption is visible in the declaration and not a
     silent property of the mode. A clipped or locator-bound capture that never
     includes the canvas is out of scope.
     CORROBORATED 09.08.2026 by running each `enrichments` section alone: the fault
     is not one frame and not only BLACK. `88-canoe-ride.png` collapsed 993 KB → 47 KB
     as a uniform GREY HAZE at 11 FPS, `104-region-border-river.png` 1.39 MB → 51 KB
     as a black canvas carrying only the HUD and its "Unknown waterfall"/"Unknown
     lake" labels — both accepted, both exit 0. Most such captures pass `settle:
     false`, whose readiness mode requires only THAT a picture exists. This is why
     the measure is colour DOMINANCE and not file size: on identical code one
     section's frame moved 261 KB ↔ 662 KB between two runs, so size decides
     nothing and a reviewer must open the image.
  The re-probe of item 1 applies in the STAND-STILL mode only: the drawn-only wait
  is near zero, and re-probing there would add flake on exactly the fast-moving
  subjects that mode serves. The stale comment in `frameSubject.mjs` claiming
  nothing moves the camera during the wait is corrected in the same commit — commit
  `02be8c7d` already falsifies it. The Vitest gap the review names is closed with
  it: the readiness mode is currently tested on hand-built objects only, never
  through `normaliseDeclaration`, which is what hid item 6.
  VERIFIABLE: pure Vitest on the shutter's decision (subject in view before AND
  after → written; in view before, gone after → refused with the second reading in
  the message; a frame that needs no readiness wait behaves exactly as today; a
  canvas-bearing frame whose picture is one colour past the share is refused naming
  that colour, while a rendered frame and a declared near-uniform one pass; a
  full-page element frame serves the stand-still wait while a clipped or
  locator-bound one does not), and live the two Aswan frames stay green.


- [ ] 565. A DRINKING WILDEBEEST CALF STANDS BURIED IN THE GROUND
  (caught 08.08.2026, 19:xx, by the in-game anchoring tripwire on the `enrichments`
  WebGL 2 lane). The dev-mode assert fired: `animal-buried — wildebeest bodyY=1.09
  ground=1.82 y=1.82 young=false bathe=false drink=true dodge=false hop=false
  chunk=14,1 shoreSeed=false parent=false child=true dPlayer=14`. The body sits 0.73
  BELOW the terrain the same frame samples under it, and it is not a one-frame
  transient: the assert only speaks on the SECOND consecutive violating visit
  (`floatStrike >= 2`, ~13 frames apart), so this animal stood buried for at least two
  assert visits while the player was 14 units away — in view.
  IT IS NOT THE LABEL LAYER'S DOING: the run that caught it carried point 342's change
  to `Wildlife.tsx`, but that change only READS `a.drawn` and pushes to an array; the
  assert dates from 21.07.2026 and the anchoring code it watches is untouched. Treat it
  as a pre-existing defect the tripwire surfaced, not a regression — but CONFIRM that on
  `main` before fixing, because a confirmation is one run and a wrong assumption is a
  rebuild.
  THE LEAD THE DUMP GIVES: `drink=true` and `child=true` with `bathe=false`. The drink
  cycle lowers the body toward the water, and a CALF carries a smaller `scale`, which
  shrinks the assert's own tolerance (`ground - 0.75 * a.scale`) at the same time as the
  drink pose lowers the body — so the pair is the suspect, not either alone. `y` equals
  `ground` exactly (1.82), so the ANCHOR is right and it is the body offset below it
  that is wrong.
  FINAL STATE: a drinking animal of any age keeps its body above its own ground sample
  for the whole drink cycle, at every scale the herds spawn; the tripwire stays armed and
  unchanged (it is the detector, not the thing to tune away); and if the drink pose
  legitimately needs to dip lower than the current tolerance, the tolerance is derived
  from the pose rather than widened flat.
  VERIFIABLE: a Vitest case over the drink-pose body offset sweeps the full scale range
  the herds use, at both ages, and asserts the offset never falls below the ground
  sample; `enrichments` runs on both backends without the `animal-buried` assert firing.

- [ ] 522. THE BURNING GRASS DOES NOT BURN (observed 05.08.2026 while closing point
  323). `verification/131-burning-grass.png` is the frame that proves the §19.9
  bush fire, and no fire is visible in it to the eye — the frame passes its checks
  and shows dry grass. Either the dressing does not draw at the moment the shutter
  opens (the fire is a moving effect and the frame may catch it between states), or
  it draws too faintly to read at that distance and zoom, or the check measures
  something the picture does not show. This is exactly the "looks-wrong-but-passes"
  class: a green check standing in front of an invisible feature.
  FINAL STATE: the fire READS in the frame a human looks at — flame and smoke
  visible at the zoom the criterion is judged at — and the check that guards it
  measures the drawn fire (pixels of flame/smoke in the frame region), not a state
  flag beside it. If the effect turns out to be drawing correctly and only the
  frame's aim or moment is wrong, the aim is fixed and the finding recorded as
  such; a feature that cannot be seen is not delivered either way.
  VERIFIABLE: the refreshed frame 131 shows the fire to a human on both backends,
  and its check fails when the fire is switched off in the debug menu — proving the
  check reads the picture rather than the intent.

- [ ] 523. THE PANORAMA LEAVE-CAPTURE COMES OUT EMPTY, AND TWO CHECKS ON `main`
  HAVE BEEN RED FOR IT (measured 05.08.2026 while closing point 480, on BOTH
  backends, and classified PRE-EXISTING on `main` by
  `node scripts/verify/baseline-classify.mjs polish --ref origin/main`). The two
  failing checks are `the leave capture bakes the surrounding terrain into the band
  (point 227)` and `the band is compass-true`. The numbers name the cause rather
  than a threshold: the leave-capture reads OPAQUE 0.000 with 0 px west and 0 px
  east — it captures NOTHING, so both checks judge an empty image and neither can
  pass. Whatever the band looks like in the game, its evidence has been absent long
  enough that a red on `main` stopped being noticed, which is exactly the state
  point 387 exists to end.
  FINAL STATE: the leave-capture produces a non-empty image again — the cause is
  found and named (a capture taken before the panorama is drawn, a target that
  moved, or a capture path that silently yields a blank surface), not worked around
  by lowering the opacity floor. Both checks then judge a real picture and pass on
  both backends. If the capture legitimately cannot run headless on one backend,
  that is a recorded deferral naming the backend, never a quiet skip.
  VERIFIABLE: `polish` green on WebGL 2 and WebGPU on a quiet machine, with the
  leave-capture's opacity and its west/east pixel counts printed in the run so an
  empty capture can never again read as a threshold miss; plus a pure test that the
  check FAILS on an all-transparent capture instead of reporting a band verdict.

- [ ] 500. THE LEAVE CAPTURE BAKES A TERRAINLESS BAND ON A SLOW HOST
  (measured 04.08.2026 during the point-499 triage, 3 of 3 runs). The `polish`
  check on the maasai-village leave capture reads the bottom quarter of the
  panorama backdrop as opaque 0.000 — the captured band carries no terrain at
  all. This is NOT the fixed-wait class the triage closed: the capture fires as
  the travel scene MOUNTS, so no amount of waiting afterwards can change what it
  photographed. The cause named by the reading is `panoramaCaptureReady`, which
  gates on terrain chunks being COMMITTED rather than on their being DRAWABLE —
  on the fast Windows host the two coincide, on this one they do not.
  FINAL STATE:
  1. The capture gate holds until the surrounding terrain actually RENDERS, not
     until its chunks exist. The condition is read from what the renderer draws,
     never from a chunk count or a wall-clock allowance.
  2. Point 227's grey-horizon symptom cannot return on a slow host: the check
     that caught this stays, and is not weakened.
  3. A capture that would still be unready at its deadline says so — a black or
     terrainless band is never written silently.
  VERIFIABLE: the `polish` leave-capture check passes three consecutive runs on
  the container host, and the same run on the WebGPU (software) lane; the
  captured band is inspected as a PICTURE once, not only as a number.

- [ ] 501. THE COMPASS PROBE PILLAR NEVER REACHES THE PANORAMA BAND
  (measured 04.08.2026 during the point-499 triage, 3 of 3 runs). The `polish`
  orientation check reads west 0 px / east 0 px for its DEV probe pillar, while
  the water fractions of the SAME capture became non-zero once the scene was
  built — so the capture happens, but the pillar is not in it. The unverified
  suspicion the triage recorded: `hasPanoramaCapture` short-circuits a
  re-capture, so the check's `delete window.__placePanorama` clears the hook but
  not the cached capture, and the pillar is added to a capture that is never
  taken again.
  FINAL STATE:
  1. The suspicion is CONFIRMED OR REFUTED first, at the code, before anything
     is changed — a fix built on the wrong cause is the more expensive mistake.
  2. Either the probe reliably enters the capture it is set up for, or the
     orientation is measured another way that does not depend on injecting
     geometry into a cached capture. Whichever is chosen is written down with
     its reason.
  VERIFIABLE: the `polish` compass check passes three consecutive runs and fails
  when the panorama orientation is deliberately inverted — a check that cannot
  fail proves nothing.


- [ ] 321. GRASS FIRE READS WRONG ON EVERY COUNT (user 25.07.2026 with screenshot:
  the burning-grass event shows a column of flat orange blocks — no recognizable
  FIRE FRONT, "strange waves" that make no sense, and the burn SCARS do not read as
  burnt ground). Rebuild the §14/§19 grass-fire depiction: (a) a readable FRONT — a
  curved, advancing line of flame with a bright leading edge and smoke rising
  behind it, not a stack of quads; (b) identify and drop/rework whatever produces
  the wave artefact (likely the animated flame sheet's UV/vertex wobble read at
  bird's-eye distance); (c) BURN SCARS that read as burnt earth — dark, sooty
  ground tint following the terrain like the point-267 blood tint, with soft
  irregular edges, not orange blocks. Calibratable extent/speed under balance,
  quality entries for all three levels. VERIFIABLE: pure tests for the front
  geometry (advancing line, bounded curvature, scar polygon trailing the front) and
  the scar tint sampling; live check that the front's leading pixels read clearly
  brighter/warmer than the trailing scar and the scar clearly DARKER than unburnt
  savanna; screenshot 131 refreshed and judged on BOTH backends.

- [ ] 319. CROCODILE KILL AFTERMATH: PREY DISSOLVES WITHOUT SINK OR VISIBLE SCAVENGER
  (user 25.07.2026: a crocodile seized an animal, the crocodile disappeared at some
  point, and the prey then kept slowly dissolving — possibly "eaten" with no vulture
  visible). Per §19.16 a crocodile KILL must SINK — the river keeps the body, no
  bank carcass, no vulture; a slow in-place dissolve with no visible actor matches
  NO legitimate path. INVESTIGATE the victim's state machine after the croc leaves:
  every crocodile exit path (kill → sink; grip-deadline release → victim freed
  ALIVE; croc streamed out by the view ring mid-drama) must leave the victim in a
  consistent, VISIBLE state — either sinking (kill) or alive and walking (release);
  the carcass-shrink animation must only ever run with a visible feeding/scavenging
  actor present (lion feed, vulture flock, ground scavenger), never as an invisible
  decay. Likely suspects to check: the caught victim being handed to the ordinary
  land-carcass system when the grip ends instead of the sink path, and the shrink
  timer running detached from any feeder. VERIFIABLE: pure tests over the croc exit
  paths (kill/sink, deadline-release/alive, ring-despawn — victim state asserted
  for each); an enrichments stage reproducing the reported sequence (catch → croc
  leaves → victim must either sink or stand up, and NO shrink without an actor —
  add a dev-assert for "shrinking carcass has no feeder" so every session detects
  it); both backends.

- [ ] 326. A PARENT DIES WITH NO VISIBLE CAUSE AFTER A CROCODILE KILL (user
  25.07.2026: crocodile took a calf, crocodile gone, the parent stood at the death
  spot and simply fell over dead — reading as suicide). Every §19.8 death must have
  a VISIBLE cause on screen (a predator that reaches it, a trample, a drowning, a
  fall). Audit the vigil/grief paths against the crocodile case: a parent standing
  vigil after a crocodile kill either is taken by a VISIBLE predator (the point-121f
  draw that spawns beyond the ring and walks in) or survives and rejoins — never
  dies in place with no actor. Add a dev-assert "death without a visible cause"
  covering every death path so the class is caught in every session. Related to
  point 319. VERIFIABLE: pure test enumerating the death causes, each setting a
  cause field; the assert fires on a synthetic causeless death; a staged
  croc-kill-then-vigil ends in one of the two legitimate outcomes; both backends.

- [ ] 314. DRIFTING PALE PATCHES ON WATER (user 25.07.2026, screenshot: bird's-eye at
  a river mouth near the ocean — two elongated pale/greenish patches ON the water
  surface near the shore, which MOVE/CHANGE as the traveller walks; "immer noch
  gelegentlich", i.e. the class was seen before). DIAGNOSE BY THE PICTURE first
  (drive the reported shore on both backends, screenshot series), then root-cause —
  candidate hypotheses to check, not to assume: (1) shore/crest foam sampled in a
  non-world-anchored space so the mask swims with the camera; (2) the far-sheet vs
  near-water overlap at the coast (zoom-gated far sheet showing through); (3) the
  point-211 ribbon-row lift re-evaluating per terrain-chunk LOD so lifted rows pop
  as chunks stream (matches "changes while walking"); (4) foam from the river mouth
  bridge (MOUTH_BRIDGE) rows extending into the shelf. FIX the identified cause; the
  §11.3 continuity/never-buried/mouth-bridge invariants stay green. VERIFIABLE: a
  driven enrichments check at the reported spot asserts the water pixels stay
  stable while the traveller moves (frame-diff over the water region bounded, on
  BOTH backends), plus the screenshot pair before/after; pure test for whichever
  sampling rule was wrong.

- [ ] 575. THE ANIMALS CARRY NO PELT PATTERN AND NO FACE (found 09.08.2026 by the
  point-264 control frame, which photographed two zebras at the player's own zoom).
  `ZEBRA_SPEC` paints the body `#d8d4cc` and the head `#9a958c`, flat and untextured —
  a zebra with NO STRIPES. At the reachable bird's-eye zoom (0.125–0.5, default 0.5) the
  animal reads as a uniform light capsule; nothing identifies the species, and two of them
  side by side read as one pale bar. The point-264 control frame
  (`verification/148a-intraspecies-clash-pose-off.png`) is the evidence. By inspection the
  same holds for the other `buildQuadruped` species — this is the shared model, not one
  animal.
  FINAL STATE: every ambient species is IDENTIFIABLE at the zoom the player uses. The
  zebra carries stripes, and each other species the audit finds unmarked carries the
  marking that identifies it (giraffe patches, the darker mane and cape where the species
  has one). The pattern is applied so it survives being small — the silhouette and the
  large-scale bands do the work, fine texture does not — and it is procedural/TSL rather
  than an added texture asset, so it costs no download and stays backend-neutral. Faces
  get whatever minimum reads at distance and no more. The cost is measured before and
  after, and the feature is sorted into the three detail levels with its
  `QUALITY_PRESETS` entries and the matching row in `docs/graphics-detail-levels.md`.
  VERIFIABLE: a frame per treated species at zoom 0.5, judged by looking — the species is
  recognisable — plus the before/after cost measurement, on both backends.
  Criticality: medium — it is the visual identity of every animal in the bird's-eye view,
  and acceptance criterion 11 (no schematic look) speaks to exactly this.

- [ ] 533. WHAT BRINGS THE CONTAINER BACK AFTER A HOST REBOOT (found 07.08.2026 while
  merging point 447; bundle Urlaubsfestigkeit). Point 447 hardened the WINDOWS boot path —
  `HoA-Batch-Autostart` with an at-logon trigger, plus `HoA-Batch-Watchdog` watching it —
  and its measurements date from 30.07.2026, when the batch still ran on that host. Since
  03.08.2026 it runs inside the LINUX container (`docs/host-environment.md`), where the
  launcher is the daemon `scripts/batch-launcher.mjs`, which lives and dies with the
  container. A Windows reboot therefore takes the batch down, and the hardened task then
  starts a launcher on a host the work no longer runs on: a GREEN boot path over a dead
  batch, which is exactly the silent failure the bundle exists to remove.
  ESTABLISH FIRST, DO NOT ASSUME: what starts the container today (Docker Desktop autostart,
  a WSL distro, the devcontainer CLI, a task) and whether the launcher daemon comes up with
  it. The answer is RECORDED in `docs/host-environment.md` under the launcher row, which
  today names the two launchers side by side without saying which one is live.
  DELIVER: (a) the Windows setup script of point 447 gains an idempotent, dry-runnable step
  that brings the CONTAINER up at logon/boot and starts the launcher daemon inside it —
  same conventions as `scripts/windows/setup-boot-path.ps1` (elevated once, "Nothing
  changed" on a second run, definitions exported to `local/`); (b) `windows-task-watch.mjs`
  checks the CONTAINER and the daemon, not only the two tasks, because a task that runs and
  starts nothing must not report green; (c) the readiness command of point 448 gains that
  line with its remedy.
  VERIFIABLE: Vitest on the pure parts (the probe verdicts, the idempotency decision, the
  green-over-dead case failing). The live acceptance is one elevated run on the Windows host
  and one real reboot, recorded as evidence — the container path cannot be proven from
  inside the container, and point 449's drill is where it is exercised afterwards.

- [ ] 448. ONE COMMAND THAT SAYS "READY FOR A FORTNIGHT ALONE" (30.07.2026; bundle
  Urlaubsfestigkeit). Before an absence, nothing today reports whether the chain is intact —
  and the failures that hurt most are the silent ones. `scripts/vacation-ready.mjs` answers it
  in one read-only run, each line PASS/WARN/FAIL with the remedy: both scheduled tasks present,
  enabled, last result 0; `AutoAdminLogon` set; free disk space above a threshold; the GitHub
  PAT valid with its REMAINING LIFETIME (a token that expires mid-absence fails every push
  from then on, silently — warn below 30 days); the Claude authentication present and not due
  to expire; the guard chain answering (`guard-preflight` clean); the GitHub watchdog workflow
  enabled and its last run green; no stale park file; the doctor's verdict consistent; no
  worktree debris; and the date of the last chaos drill (449) with a warning when it predates
  the last change to the resilience layers.
  VERIFIABLE: Vitest on the pure verdict assembly (one case per line, PASS/WARN/FAIL and the
  overall exit code — 0 only when nothing is FAIL) with every probe injected; one live run
  against the real machine as the acceptance evidence.

- [ ] 449. THE CHAOS DRILL — KILLS AT RANDOM MOMENTS (user 30.07.2026: "Beachte, dass ein
  Ausfall eines Elements zu jedem beliebigen Zeitpunkt passieren kann - auch mitten in einer
  kritischen Aktion von dir"; bundle Urlaubsfestigkeit). Everything in this bundle is a claim
  until an outage has been survived under observation, and the lesson of 30.07.2026 is exactly
  that a designed handover still failed in practice. `scripts/chaos-drill.mjs` kills the batch
  owner at a RANDOM moment inside a chosen critical action — during a merge, during a push,
  during a browser verification, during the tick in TASKS.md, during a board publish — and
  then asserts, without human help: the tree returns to a consistent state, the launcher
  starts a successor, the successor works, and the interrupted point is correctly still OPEN
  (the transaction property: the tick on `main` is the commit point, so nothing half-done can
  count as done). It runs each action several times with different timings, writes a report per
  run to `local/`, and records the date the readiness check (448) reads.
  VERIFIABLE: the drill itself is the verification — one green report per critical action, plus
  Vitest for its pure parts (the kill-moment plan, the verdict assembly). A drill that cannot
  produce a verdict FAILS rather than passing quietly.

- [ ] 200. VERIFY-SCRIPT ROBUSTNESS pass — fix the 26 wall-clock/radius
  findings in the test scripts (Pillar-2 group E; exact list in the 184 log:
  20 in enrichments, plus polish 270, settings 183/277, flow 242, voice 56,
  touch 75). Two patterns, both established: (1) render-loop behaviours polled
  on the SIM clock (__pollSim/__sleepSim/simTime) or on the check's OWN
  condition — never a fixed wall wait (the point-177 class; the elephant-roam
  and lion-feed flakes were exactly this); (2) "in view / beyond the ring"
  judged by __camera.onScreen/ndc projection — never an assumed radius (the
  point-172 class), with checks that TEST a radius-feature keeping the radius
  but saying so. Work file-by-file, run each touched suite after its change
  (both backends for the WebGPU-lane suites; touch/voice webgl-only), and
  fold the result into the final-closing 3× flake-free gate — this point IS
  the systematic version of the one-off de-flakes done so far (some findings
  may already be partly fixed, e.g. settings 277: verify against HEAD first).
  PROGRESS 21.07.2026: converted the six named non-enrichments waits (commit
  7ed3c56) + six enrichments family/predator/scavenge/rescue STAGING settles to
  __sleepSim (5127afa, af4533f) — all touched suites green.
  MEASURED 09.08.2026 (closing point 566, WebGL 2): the residue is a ROTATING
  SINGLE failure, and it is what makes the suite unable to produce a clean run on
  demand. Six runs of `enrichments` on byte-identical product code (`src/` did not
  change) gave one fully green 251/251 and five runs of 249–250 pass with 1–2 red
  — never the same check twice: "prey squeezed against a bank flees ALONG it"
  (pt. 201; the failing sample ended `onWater:true`, path 8.2 / net 6.2, against
  11.3 / 11.3 when it passes), "holding Ctrl names the animals in view" (pt. 342;
  `0 animals of 1 labels`), "a calf out of reach past the reunion window is handed
  to the adoption" (pt. 341; `separated:false`) and "a predator staged during the
  window still makes the calf RUN" (pt. 369; `fleeBefore 5 == fleeAfter 5`). The
  runner's own classifier called both double-reds a LOAD/FLAKE signature, and a
  baseline run of the CURRENT checks against the pre-566 tree reproduced the same
  instability — so these are the suite's own staging, not a product defect and not
  the sectioning. Each is a STAGING settle of exactly the two patterns above; fixing
  them is what makes a green run repeatable rather than lucky.
  AND THEY ARE NAMED BUT NOT CHARGED (found 09.08.2026 while preparing point 309).
  The measurement above pins each rotating red to an OPEN point (201, 342, 341, 369),
  but `scripts/render-verify-charges.mjs` holds exactly ONE entry (point 506, polish,
  goat walker) and none of these four. `render-verify-core`'s `runVerdict` counts a
  run as covering only when EVERY red is charged to an open point, so an `enrichments`
  run comes back UNACCOUNTED even though its reds are measured, owned and understood.
  The cost is exact: point 309's one remaining gate is a green LARGE run, and that gate
  cannot be reached by waiting for a quiet machine — the run would have to come up clean
  on the one-in-six chance the measurement recorded.
  DECIDE, DO NOT DRIFT: either these four staging settles are fixed here (the point's
  own job, and the honest fix), or the four reds are CHARGED to their points in the
  ledger the mechanism provides for exactly this case. Charging is legitimate — it is
  what the ledger is for — but it silences the checks, so it is a deliberate decision
  written down with its reason, never a quiet workaround. Whichever is chosen, 309 stops
  waiting on a green that cannot arrive.
  PROGRESS 21.07.2026 (evening): three more increments, each validated green +
  pushed — (1) FAIL-SOFT against a whole-run ABORT (7360b62): a rare mid-check
  scene remount briefly nulls window.__wildlife; a non-optional herdsRef access
  threw an UNCAUGHT error that killed the entire run and DEFEATED the auto-retry
  (a crash on attempt 1 + any rotating flake on attempt 2 = double failure). The
  collision-drive loops now optional-chain the hook and __pollSim wraps its
  doneFn in try/catch — a crash becomes at worst one recoverable check miss. This
  was the key structural win: the suite now reaches green via retry-cushioning as
  designed. (2) Canoe/swim staging settles -> condition polls (same commit).
  (3) The collision drive-in/escape loops bound by SIM time with a wall cap
  (79ff2cb) — a wall-timed window ran too few frames under load (escaped 0 vs
  5.3). NEXT / NOT YET DONE (a flood-convergence batch was tried and REVERTED
  unvalidated — do it right): replace the long weather blend waits
  (waitForTimeout 4000-4500, "blends at 0.02/frame": Nile flood ~5047, Okavango
  ~5090, harmattan ~5119) with a convergence poll — BUT settle on the value the
  CHECK ACTUALLY READS, not just the blend driver: the harmattan check reads
  __climate.fog().far, which LAGS __climate.dust() by its own fog blend, so
  settling on dust() returned before fogFar closed and the Jan<Aug assertion
  failed (161 vs 153). Settle on fogFar (and for the Nile settle on surfaceAt,
  for the Okavango on deltaWaterScale — whatever the check compares), or poll
  until ALL read values are stable. Speeds up every run ~15-20 s AND de-flakes.
  FLAKE SITES OBSERVED IN THE 25.07 CLOSING RUNS (three LARGE runs, quiet machine — each
  red was a DIFFERENT check, which is the signature of rotating flakiness rather than a
  regression): flow fails its FIRST navigation on a cold dev server in every one of the
  three runs (0 pass / exit 1, the networkidle wait) and passes on retry — the most
  reproducible site and the best next fix; collision once (19/20); enrichments twice, at
  DIFFERENT checks — the point-267 blood-stain-on-a-slope check (holeFraction 0 but the
  blob/soak counts short) and the point-278 dressing-growth check reporting samples
  [0,0,0,0,0], i.e. a measurement that collected NOTHING rather than a real growth
  reading (the same class as points 292/334/304 — the check, not the product). Fix these
  four first: they are what stands between the suite and the flake-free closing gate.
  REMAINING drama flakes still rotating (cushioned by the retry, to root-cause
  for the closing's strict 3x gate): point-102 vicinity count, plover 145b,
  calf-play, parent-guards-calf, the crocodile-spawn cluster. NEW SITES seen in
  the 25.07 quiet-machine LARGE (point-309 re-validation): flow's FIRST
  navigation `networkidle` wait times out on a cold dev server (failed twice in
  the LARGE, then 31/31 green on an isolated retry — wait for the app's own
  ready signal instead of networkidle); rotating one-off reds in enrichments:
  the crocodile eye-knobs check (274), the STAGED parent-sacrifice calfFreed
  flag, and the 121f drawn-predator (each red exactly once across two tries).
  PROGRESS 22.07: the lone-scavenger-185 landing is now DETERMINISTIC (commit
  f76dc3d) — before polling, remove other carcasses from its target pool + shove
  nearby live animals clear + commit the bird to the injected carcass. CLOSING
  NOTES for the others (do NOT repeat these dead ends): (a) the vicinity-102
  budget must NOT simply be widened — MORE sim time lets the seeded grazers
  WANDER out of the leave-point radius (the code comment says exactly this), so a
  bigger budget is counterproductive; fix by counting from the settlement ANCHOR
  (where the seeder guarantees the min) or by pinning the count to the immediate
  post-leave moment. (b) calf-play (samples:0): a calf gambols only ~25% duty
  (GAMBOL 4s/16s) AND canPlay needs no active lion + calf near its parent (not
  play-locked) + a CALF_HUNT_SPECIES; force a young calf beside its parent with
  playLock cleared so it stays play-eligible through the poll. (c) plover-145b
  (dead:true): the bird dies before its broken-wing act — keep it alive / force
  its lure state. TRIPWIRE-TRANSIENT
  ROBUSTNESS (for the closing's 3× flake-free): the point-203A anchoring tripwire
  intermittently fires ONE console-error per several enrichments runs on a rare
  1-frame anchoring transient at a state transition — observed a floating
  wildebeest and a buried shore-seeded drinker at the waterline, different each
  run, none reproducible, imperceptible at 60 fps. The tripwire samples per
  frame, so it catches the single transition frame before the next frame
  corrects. FIX for the closing: make the tripwire tolerate a 1-frame transient
  — only console.error when the SAME animal violates on 2+ consecutive
  assert-visits (a per-animal strike counter), so a persistent float (a real
  bug) still fails loudly while a one-frame spawn/drink/shore-seed transition
  does not. Do this as part of the closing prep so the LARGE gate can reach 3×
  clean.
  OBSERVED 22.07 (a WebGL enrichments run during the 210b work): 207 pass, 2 fail,
  0 console-errors — both KNOWN rotating staging flakes, cushioned by the retry:
  (1) plover-145b again `dead:true` (the bird died before its broken-wing act —
  the documented cause above); (2) the point-129 witness "a tree contact blocks
  the entry but leaves N/S/W free" with `reached:false` (minDist 1.41, N/S/W all
  ~2.2-2.4 free) — a NEW entry for the rotating-flake list: the driven post-
  collision move did not COMPLETE in the frames allotted (the 200 SIM-clock class,
  not a real collision bug — the free directions are all open). ADD to the
  closing root-cause set: poll the point-129 driven move on the SIM clock / its
  own arrival condition rather than a fixed frame budget. The point-102 vicinity
  check (this session's anchor fix) PASSED first try, confirming that fix.
  OBSERVED 24.07 (a WebGL enrichments run under CPU overload during the 278
  verify): the point-121 check "a feed that ends without a kill leaves no remnant"
  failed `{deadBefore:4,deadAfter:5,calfAlive:true}` — a NEW rotating-flake entry.
  It counts GLOBAL dead animals over a 2.5-sim-second window during which OTHER
  dramas keep running, so any unrelated concurrent predation in that window fails
  it even though the STAGED feed left the calf alive and no remnant. Confirmed a
  load flake, not a real bug: the same check PASSED on a quiet-machine re-run
  (222 pass, 0 fail). ROOT-CAUSE FIX for the closing: scope the assertion to the
  staged feed — count only deaths of the feed's own actors (or freeze other hunts
  for the window), not the global dead-count, so a concurrent drama can't fail it.
  LESSON reinforced (memory `verify-suites-need-a-quiet-machine`): never run a
  verify suite while a worktree agent builds — evaluate a red only on a quiet box.
  OBSERVED 05.08.2026 (a WebGL enrichments run on the Linux container host, while
  closing point 489): first try 243 pass / 2 fail at the point-119 trampling and the
  point-128 scavenger-drama checks, green on retry (245/0) — neither in that diff's
  touch set, so a THIRD and FOURTH rotating site on this host. The same day, under
  load, the point-278 dressing-growth check read `{samples:[0,0,0,0,0]}` — the
  `__sleepSim(6)` settle elapsed with too few frames for the streamer to populate the
  desert anchor, so `liveInstances()` legitimately read 0; on a quiet machine the same
  check reads `{samples:[18,18,18,18,18]}` and passes. That is this point's pattern (1)
  exactly: a streaming behaviour measured against a settle rather than against its own
  condition. Fix it by polling until the anchor's instance count is non-zero, not by
  lengthening the settle.

- [ ] 309. SERVING-MODEL DEGRADATION: REPAIR + TRIPWIRE (user 25.07.2026). REPAIR: the
  late-evening session of 24.07 ran silently on Haiku 4.5 (proven by the Co-Authored-By
  commit trailers) and merged three deliveries that missed their specs; main is RESTORED
  to the last pre-degradation state fd85464 on every touched path — the placebo
  proximity-call fix incl. its assert-nothing tests (expect(true)) reverted (292
  reopens), the unwired detect-load stub removed (296 reopens), the rubber-stamp
  guard-chain audit removed (297 reopens), the load-corrupted verification PNGs
  restored, the three TASKS ticks undone — while the legitimately recorded
  .claude/closing-state.json is kept; the load-tainted working-tree churn (PNGs, retro
  appendix, ineffective settings additionalDirectories, untracked pre-push stub) and the
  unauthorized local .git/hooks/pre-push are discarded. MODEL ALLOWLIST (user
  25.07.2026): ONLY Opus 5 (default), Opus 4.8 (fallback when Opus 5 is unavailable)
  and Fable 5 (occasional four-eyes work) may run the batch — Sonnet, Haiku and every
  other model are NOT acceptable; if the policy cannot be held, the batch STOPS. The
  batch autostart therefore launches `--model claude-opus-5[1m] --fallback-model
  claude-opus-4-8[1m]` (flag verified against the bundled CLI). TRIPWIRE
  (mechanism-first): a Stop-hook guard (pure core scripts/model-guard-core.mjs +
  fail-open wrapper scripts/model-guard.mjs, wired FIRST in the Stop chain) parses the
  recent commits' Co-Authored-By trailers; any commit after the committed baseline
  (.claude/model-guard-baseline.json) authored by a Claude model OUTSIDE the allowlist
  BLOCKS the turn end with a pause-the-batch instruction and pings ntfy — a degraded
  session is caught at its FIRST commit, and an unknown future model name fails
  closed. The guard stands down while .claude/batch-paused exists (no block loop once
  paused); the batch-resume hook names the allowlist on every session start.
  VERIFIABLE: model-guard-core Vitest sweep (trailer parse incl. malformed lines,
  allowlist pass for Opus 5/Opus 4.8/Fable 5 variants, breach for Haiku AND Sonnet AND
  unknown models, mixed-co-author flagging, human co-authors and merge commits
  ignored, baseline cutoff boundary, empty log); the repaired state passes the full
  LARGE regression on a quiet machine (both backends), which also re-validates the
  four Opus points merged before the degradation (262/273/293/305).
  WHAT THE PROOF STILL COSTS (measured 08.08.2026, after point 549 landed). The repair and
  the tripwire are complete and in `main`; only the regression proof is outstanding. 549
  settled the WebGL 2 half — three consecutive `polish` runs came out clean with no retry —
  so a LARGE now REACHES the WebGPU half, which it never did before. There it will report
  one red: `settlement walker (goat)` passed one of three runs, needed the retry in the
  second and failed both attempts of the third at worst foot/body travel 1.929–2.318. That
  is the software lane's throughput, charged to point 506 in `render-verify-charges.mjs`,
  not a product defect. So take this proof either after 506 lands, or with that one red
  recorded as the charge it is — never as a clean both-backend LARGE.

- [ ] 312. ANIMALS ARE WATER-SHY, NOT WATER-BARRED (user 25.07.2026, revising the
  point-192 rule; former point 324 is folded in here). The rule was read far too
  strictly: "animals must not stand around in water" — so that a canoe passage stays
  clear — hardened into "water is off limits to them". What the player sees is a
  fleeing animal PRESSING against the waterline or skating along the bank hunting for
  a way around, instead of simply swimming across; and a calf swept into the water
  sticking at the bank so its drama never plays out.
  THE RULE IS STATED IN ONE PLACE — design.md §19.5. This point BUILDS it; do not
  restate it elsewhere.
  (a) NO SPAWN, NO LINGERING — unchanged, and the reason the rule exists. An animal
  never spawns in water and never idles, grazes, rests or waits in it; one that comes
  to rest on water makes for the nearest bank. A channel the player canoes must never
  be blocked by a parked animal. This half must stay demonstrably intact — and it is
  what ENDS every water passage: the moment a flight stops, the animal turns for the
  NEAREST bank and SWIMS out under its own power. It is never snapped back onto land,
  which is how the old setback behaved; shyness must read as shyness, not as a
  teleport.
  (b) CROSSING IS ORDINARY: a ROAMING animal may take on a channel rather than turn
  from it, governed by the calibratable `balance.waterCross.*` (width, readiness).
  (c) FLIGHT IS UNRESTRICTED. Fleeing anything — a predator, an oncoming elephant, the
  traveller, fire — the animal enters the water the moment its escape leads there: no
  dead-end precondition, no pressure radius, no width limit, no chance roll.
  CONCRETELY: the along-shore deflection (`deflectedStep`) applies to the OCEAN edge
  ONLY, so a flight meeting a river or lake goes IN rather than sliding along the bank.
  A juvenile returning to its parent (§19.8) moves under the same freedom.
  (d) A WATER DRAMA OWNS ITS ACTOR (the folded 324): while a §19.8 water drama runs —
  the swept calf, the wading rescuer, a crocodile's victim — no leave-the-water rule
  may pull the animal out. The exemption keys on the DRAMA STATE, not on the species.
  (e) TWO INVARIANTS UNTOUCHED: the open sea of §11 stays the world's edge (the ocean
  setback is exactly as it is), and every water passage RESOLVES — a bank is reached or
  the deadline grounds the animal there (invariant I4), so nothing swims forever.
  ANCHORS: `fleeCrossing`, `crossingTarget`, `deflectedStep` and the water setback in
  `src/scenes/travel/wildlifeBehavior.ts`, with their call sites in
  `src/scenes/travel/Wildlife.tsx` (the three flight sources — predator flee, elephant
  dart, player-shy — and the calf follow branch); `waterEdgeRules.ts` holds the
  drinker/bather bank targeting, which does NOT change.
  WHAT SHRINKS RATHER THAN GROWS: the boxed-trigger machinery this point once called
  for (a pressure radius, a boxed-persistence hysteresis, a crossing chance for
  flights) is NOT to be built — under (c) a flight needs no trigger at all. Add no
  balance values for it.
  DOCS in the same commit: design.md §19.5 already states the target; CLAUDE.md §7.1
  point 12 currently carries a forward-pointer at the superseded claim and must be
  rewritten to the built state when this lands, dropping that pointer.
  VERIFIABLE: pure — a flight step whose heading meets river or lake water is NOT
  deflected along the bank, while the same step at an ocean edge still is; a roaming
  crossing still honours its width and readiness values while a flight ignores both; a
  drama-flagged animal is setback-exempt while its drama runs and subject to it again
  afterwards; an idle animal that ends up on water heads for the nearest bank. Live
  (`scripts/verify/enrichments.mjs`, both backends): an elephant driven at a grazer on
  a STRAIGHT bank — where an along-shore slide IS available — sends it into the water
  and out the far side; an animal the PLAYER drives into a river and then leaves alone
  is out of the water within moments — swimming to the nearest bank, its path sampled
  so it is a swim and not a jump; the staged swept calf reaches mid-channel and its
  drama resolves; and across a driven pass no animal is found standing in a channel, so
  the canoe lane stays clear.

- [ ] 333. WHY THE DOCS DRIFT — AND A MECHANISM AGAINST IT (root-cause analysis
  25.07.2026, user question "where does all this drift come from — were there
  problems before the degraded session too?"). ANSWER: yes, and it has nothing to do
  with that session. Measured on the four features merged after v0.2: 262 touched
  design.md (+2 lines) and NOT CLAUDE.md; 273 touched both (+17/+2) but only ADDED
  its new paragraphs and left the five older places that state the now-false "ten
  ports"; 293 touched design.md and the detail-level doc but not CLAUDE.md §7.1; 305
  touched ONLY docs/graphics-detail-levels.md — the one doc with a SYNC TEST
  (src/config/qualityDoc.test.ts) — and left design.md §2.7/§21/§21.3 stating the
  opposite. The pattern is exact: a doc gets updated where a MECHANISM demands it or
  where the author is already writing; a fact that lives REDUNDANTLY in several
  places drifts in all the copies nobody was editing. The deeper cause is the
  redundancy itself — "the ten port cities" is asserted in five places, LOW's shadow
  behaviour in four. BUILD: (a) a pure DOC-FACT guard that pins the small set of
  facts stated redundantly across design.md/CLAUDE.md against the CODE that owns
  them (known-from-start count from `KNOWN_FROM_START_PLACES`, per-level quality
  values from `QUALITY_PRESETS`, the debug jump-to category list from the menu's own
  groups, the balance-value names the docs cite) — it fails when a doc's number
  disagrees with the code's, like qualityDoc.test.ts already does for one doc; (b) a
  merge-time check that a feature commit touching a §7.1-covered system also touched
  the doc section that covers it, or says why not; (c) reduce the redundancy where
  possible — one authoritative statement per fact, referenced elsewhere (the
  §7.1-references-design.md convention already exists; apply it to the drifted
  facts). METHOD: model-diverse (a second model reviews the fact inventory for
  completeness — an incomplete inventory is the failure mode). VERIFIABLE: the guard
  fails on each of point 332's real drifts when they are re-introduced, and passes
  on the corrected docs; the fact inventory is listed in the guard's header.
  SCOPE WIDENED (user 25.07.2026: "establish mechanisms that make such
  inconsistencies and redundancies impossible in future"): the point delivers a
  STANDING regime, not a one-off sweep. (d) SINGLE SOURCE OF TRUTH as the primary
  cure: for every fact the audit found duplicated, ONE place states it and the
  others reference that place — CLAUDE.md §7.1 already follows this convention
  toward design.md (§7.1 cites sections instead of repeating content, per the
  claude-71-reference-not-duplicate rule) and it is simply not applied to counts,
  defaults and enumerations; extend it there, and where a doc must restate a value
  for readability, mark it as derived and cover it by (a). (e) A DUPLICATION
  DETECTOR that fails when a NEW redundant statement of a covered fact appears
  (a count/keybinding/default that the inventory owns showing up in a second
  place), so the redundancy cannot creep back after (c) removed it. (f) The
  merge-time check of (b) becomes part of the standing gate, not a review step:
  a commit that changes a fact-owning constant must touch the doc that owns the
  fact, or state why not. (g) The regime is documented in CLAUDE.md §4 (docs
  conventions) so a future contributor — human or model — finds the rule where the
  documents themselves are described. ACCEPTANCE for the whole point: re-running
  the 25.07 coherence audit against the finished state reports no drift and no
  new duplication, and each mechanism fails on a deliberately re-introduced
  violation.
  GUARD INVENTORY (from the 25.07 forensic sweep — build these checks in this
  order, best value first; the ENUMERATION checks alone would have caught 6 of the
  11 older drifts): (1) design.md §21.2's tunable list vs the debug menu's own
  number fields; (2) design.md §21.3's toggle/tool list vs the menu's checkboxes
  and selects; (3) the jump-to category list (design.md §21.3 + CLAUDE.md §7.1
  pt 20) vs the menu's groups; (4) the touch-preset lever list (design.md §17.5 +
  §7.1 pt 30) vs `activateTouch`; (5) docs/peoples-1890.md's village coordinates vs
  `VILLAGE_HEARTLANDS`; (6) the known-from-start set (five doc sites) vs
  `KNOWN_FROM_START_PLACES`; (7) the F-key roster vs the HUD's key handling.
  Then the COUNTS, each owned by one code constant: ports/peoples/rivers,
  waterfalls/lakes, cultural landmarks/natural sites, village plans, ice massifs,
  seasonal-dress peoples, benchmark configs, quality levels. Then the DEFAULTS the
  docs quote (walk speed, strafe factor, ambience volume, starting money, start
  date and the 1890-1895 window, ivory range, shadow-map sizes, level default and
  cycle order, the F3 loadout numbers, the thunder delay band).
  TWO FURTHER ROOT CAUSES the sweep exposed, to be addressed by the regime:
  (i) a DOC AUDIT WITHOUT A CODE CHECK can make drift WORSE — a 17.07 docs-only
  audit rewrote a terse correct line into an elaborate false one; every doc audit
  must therefore verify against the CODE, never against neighbouring prose;
  (ii) docs get written against the TASKS SPEC rather than the shipped code — the
  cited `panoramaVicinityRadius` never existed in any commit, it came from a spec
  draft; a doc's symbol citations must be checked against the code that shipped.

- [ ] 336. THE WHOLE CROCODILE STAGING FAMILY IS FRAGILE — REBUILD IT, NOT ONE CASE
  AT A TIME (escalated 25.07.2026 after four consecutive runs each failed a DIFFERENT
  crocodile check). History: the lunge case was found resting on an unpinned
  assumption (its red turned out to be machine load, proven by a quiet-machine
  repeat) and was pinned; the next run failed the TOO-LATE case, where the parent
  arrived in time after all and the crocodile took it instead of the calf; that was
  pinned too; the next run failed the VANISH case with gripped:false — the crocodile
  never seized at all (diag: drink true, dist 0.1, crocLunge false). Fixing one case
  per run is a treadmill: the family shares one `crocDrama` helper whose five modes
  each depend on a different implicit precondition (a distance, an arrival time, a
  drink state, a lunge that must fire), and every one of them is a separate way for
  the staging to miss while the GAME behaves correctly.
  DO INSTEAD — one rebuild of the helper: (a) every mode states its preconditions
  EXPLICITLY and asserts them before measuring, so a miss reports "staging did not
  reach its precondition" instead of accusing the product; (b) every mode pins its
  outcome roll (rescue, lunge and too-late now do; vanish and sacrifice must too);
  (c) the seizure itself is established deterministically — poll for the grip with a
  generous sim budget and FAIL THE STAGING, not the behaviour, if it never happens;
  (d) each mode gets its own tiny setup helper instead of one branching function, so
  a change to one ending cannot shift another's timing (the point-311 lesson at test
  level). VERIFIABLE: enrichments green on BOTH backends THREE times in a row on a
  quiet machine — the flake-free bar the closing gate needs; a staging miss produces
  a distinct, self-naming failure message; the five §19.16 endings still each assert
  their real outcome (no masking). RELATED: this is the concrete first slice of point
  200's flake work, and point 294's auto-classification would have labelled all four
  reds "staging, not product" without a manual repeat each time.

- [ ] 347. THE STARTING QUALITY LEVEL FROM THE URL (user 25.07.2026; design.md §21.1
  states the target). `?quality=low|medium|high` on any deployment URL — the GH-Pages
  root, `/poc/`, a `/vX.Y/` folder — opens the session at that level, so a link handed
  to someone whose hardware is known already fits it. Case-insensitive; an unknown,
  empty or missing value leaves the ordinary default (`medium`) standing without any
  player-visible complaint.
  FOLLOW THE EXISTING IDIOM, do not invent a second one: a PURE parse function beside
  `benchmarkFromUrl` (`src/systems/startBenchmark.ts`) taking the raw `location.search`
  and returning a `DetailLevel | null`, with the call site applying it.
  APPLY IT BEFORE THE FIRST FRAME, not after mount. `detailLevel` is NOT persisted
  today (no localStorage in `src/state/ui.ts`), so this is purely the initial value —
  but setting it from an effect after the first render would draw a frame at medium and
  then rebuild the whole post chain and shadow maps, a visible hitch on exactly the
  weak hardware the low link is meant for. Seed the store's initial state from the URL.
  AND IT DECIDES DOWNLOADS, not just looks. Level-gated ASSETS — the horizon maps of
  point 346 are the first, several megabytes of them — must see the URL level before
  they decide whether to fetch. A `?quality=low` link that still pulls the high-level
  assets and then ignores them would defeat its own purpose on the exact connection it
  was sent to. Whichever of the two points lands second must verify this pairing:
  loading with `?quality=low` issues NO request for a level-gated asset.
  DELIBERATELY UNCHANGED: the touch preset (§17.5) still applies its own subset-of-low
  flags when the touch layer arms, even if the URL asked for high. That is the existing
  rule — the preset is tied to the touch layer, not to a guess about the device — and a
  URL parameter is not a reason to break it. Do not "fix" this.
  NO TOAST. F9 announces a CHANGE; a URL-set level is the session's starting default
  and announces nothing.
  VERIFIABLE: pure — the parser sweeps the three level names, mixed case, an unknown
  value, an empty search, a search carrying other parameters (`?bench=short&quality=low`
  in either order), and a repeated parameter, returning null wherever the value is not
  a level. Component/live — a page loaded with `?quality=low` has the low preset in
  effect on its FIRST rendered frame (assert through an effective selector, e.g. sun
  shadows off, not the raw field), `?quality=high` likewise, and no console errors.
  DOCS: design.md §21.1 already states it; name the parameter in the README's play
  links if that file lists them, so the shareable form is discoverable.

- [ ] 422. THE BEGINNER GUIDE IS FULL, AND TODAY'S LESSON HAS NOWHERE TO GO
  (29.07.2026, found while doing the guide review the currency guard demands).
  `docs/analysis_de/vibe-coding-anleitung.md` sits at EXACTLY its budget — 401 lines of
  401, 3398 words of 3398 (`scripts/guide-brevity-core.mjs`). The gate is right to hold
  it there: a beginner guide that grows without bound stops being read. But it means the
  guide can no longer absorb a new lesson at all, and the currency guard will keep asking
  for one — two mechanisms pulling opposite ways, with no path through.
  THE LESSON THAT HAS NOWHERE TO GO, and it is the day's biggest: changing WHERE or HOW
  something is delivered does not carry the old path's guarantees along, and what no test
  pins falls away SILENTLY — the page still loads, the tests stay green, only a promise no
  longer holds. Point 419 measured four such losses from one move. Its special case: logic
  living in a file version control does not track, which no test and no second model can
  see.
  DECIDE AND DO, in this order: (1) read the guide whole and judge which existing entry is
  now the WEAKEST — the budget is a forcing function, so a new lesson earns its place by
  displacing one, not by widening the frame; (2) if genuinely nothing is weaker, raise both
  budgets deliberately in `guide-brevity-core.mjs` with the justification in the same
  commit, the way the doc-budget ceilings are raised; (3) either way the new pitfall goes
  in with its prompt, in the guide's established form.
  VERIFIABLE: `scripts/guide-brevity-core.test.mjs` stays green (the real guide inside its
  budget), the guide contains the new pitfall, and `node scripts/retro-refresh.mjs
  --guide-reviewed` is re-attested afterwards.
  NOTE: the guide currency was attested on 29.07. against the sources of that day; the
  review found this gap and could not close it, which is what this point exists for.

- [ ] 438. THE PROJECT HOOKS CANNOT FIRE OUTSIDE THE REPO ROOT (29.07.2026, measured in a
  `/doctor` run and reviewed by the second model; bundle Modell & Wächter). All 31 project hooks in
  `.claude/settings.json` are wired RELATIVELY (`node scripts/x.mjs`), so a session whose cwd
  is not the repo root loses the WHOLE guard chain to a non-blocking `Cannot find module` —
  silently, because a non-blocking hook error produces no notice. MEASURED over 46 transcripts
  (06.–29.07.): session 8210a7ce 99 failures against 11 successes, 830a6878 44/51, f8c46e2f
  43/245, 68c8c394 12/81, plus two worktree sessions. The failing cwds are the memory
  directory, `hoa/local`, `~/.claude`, a second checkout, and removed agent worktrees; most
  frequent are lock-heartbeat 45×, prep-arm 28×, closing-guard 26×, board-first-guard 20×,
  every Stop guard 4×. THE PROOF OF CAUSE: the two USER-scope hooks are wired ABSOLUTELY and
  never failed. The four-eyes review confirmed the damage — a guard blocks via stdout JSON
  with EXIT 0, so a crash (exit 1) is non-blocking and THE VETO IS LOST: a crashed
  `closing-guard` would have let a version tag through.
  STATE 07.08.2026: the DETECTOR is built, reviewed over three rounds and on `main` —
  `guard-health-core.mjs` judges each hook row's anchoring, `--wiring` prints every
  replacement line, and `RELATIVE_WIRING_ROLLOUT` ratchets in both directions (a new
  relative hook is a finding, and so is a record whose line is already anchored). What is
  OWED is the rewiring itself: all 39 hook lines are still relative, and editing
  `.claude/settings.json` needs an ATTENDED session. Measured from a foreign cwd with real
  spawns: the relative form dies with `Cannot find module`, the anchored form fires, and the
  `node -e` bootstrap fires only when it splices the path into `argv[1]`.
  THE ROLLOUT, in the shape that review left it, and in this order:
  (a) PILOT ONE harmless high-frequency hook (`lock-heartbeat-hook`) on
  `node "$CLAUDE_PROJECT_DIR/scripts/…"` and verify it in a NEW session from a non-root cwd
  (settings need a session restart) — only then the other 30. Never all at once: a failed
  expansion would disable all 31 silently.
  (b) Keep a shell-agnostic fallback ready (a `node -e` bootstrap reading
  `process.env.CLAUDE_PROJECT_DIR`). A hardcoded absolute path is the LAST resort only —
  `.claude/settings.json` is committed and would then bind every checkout.
  (c) The new check belongs in `guard-health-core.mjs`, which already audits "can it fire at
  all", but it needs STRUCTURED input: `wiringText()` hands it settings plus active git hooks
  as one blob, and `scripts/git-hooks/pre-push`+`commit-msg` are relative ON PURPOSE (git
  guarantees the repo root), so a naive check would accuse them.
  (d) The switch CHANGES WORKTREE SEMANTICS — a worktree agent would run the MAIN tree's
  guards against main-tree state instead of its own toothless checkout copies. That is
  better, but it is a deliberate decision and belongs in the commit message, not in a silent
  side effect.
  (e) The removed-worktree class is NOT fixed by this (a dead cwd kills the spawn itself) and
  stays with the worktree-hygiene work.
  VERIFIABLE: pure Vitest on the wiring audit — a relatively wired project hook is reported, a
  `$CLAUDE_PROJECT_DIR`-anchored one is not, the two git hooks are never accused, and an
  unreadable settings file allows (fail-open). Live: one new session started from a non-root
  cwd shows the piloted hook firing where it previously failed.
  ATTENDED ONLY: `.claude/settings.json` always raises a permission prompt. MECHANISM REVIEW
  REQUIRED (CLAUDE.md §7.2).
  DOCS in the same commit: `docs/batch-autonomy.md` where the guard chain is described, and
  CLAUDE.md §7.2 only if the families it names change.

- [ ] 451. THE REPLY THAT SENT ITS OWN FLAG (user 30.07.2026: "Was ist mit dem Chat los?" —
  two agent messages on the board read literally `--text-stdin`; bundle Chat & Tafel).
  `scripts/board.mjs` accepts `--text-stdin` for German prose; `scripts/chat-reply.mjs` does
  NOT — it joins `process.argv.slice(2)` into the message, so the flag itself was published as
  the answer, twice, and the user's real replies never arrived. Fix both halves: accept
  `--text-stdin` with the same meaning as in `board.mjs`, and REFUSE any unknown `--flag`
  loudly (exit 1, naming it) instead of sending it as text — a send that silently publishes an
  option is worse than no send. Check the sibling writers for the same shape while there.
  VERIFIABLE: Vitest on the argument parsing — `--text-stdin` reads stdin, an unknown flag
  exits non-zero and posts nothing, a plain text argument still works, and a text that merely
  BEGINS with a dash is still sendable (via stdin), so the guard cannot swallow legitimate
  prose.

- [ ] 465. A NOW-CARD OUTLIVES THE SESSION THAT WROTE IT (user 30.07.2026, from the board
  screenshot: "'Gerade keine laufende Arbeit' ist auch nicht wirklich wahr … beim nächsten
  Mal wird es wieder so eine geben, oder?"; bundle Chat & Tafel). After the forced handover the
  stopped session's card "Gerade keine laufende Arbeit" (17:09) still stood in "Woran ich
  gerade arbeite" BESIDE the new session's card, so the board claimed work and no work at
  once. It was removed by hand — which is the defect: a now-card is written by a session and
  cleared by NOBODY when that session dies or loses the batch.
  FINAL STATE: a now-card carries the session that wrote it. At publish time a card counts as
  ORPHANED when its session no longer holds the batch lock, or when its stamp predates the
  current owner's `acquiredAt`; an orphaned card is REMOVED rather than left standing, and
  the publish gate refuses a board that still shows one — the same shape as its existing
  refusal of a board missing a card for an open point. The board must rather refuse itself
  than show something false; that is the property this and point 439 (a card title falling
  silently back to "Punkt N") have in common.
  VERIFIABLE: the pure layer covers orphan detection (foreign session, stamp older than the
  current acquisition, own live card kept) and the gate's refusal; a live handover leaves no
  stale card behind.

- [ ] 466. THE DOC VERIFICATION CHECKS A SENTENCE THE README NO LONGER HAS (30.07.2026,
  found by the agent that shrank the always-loaded instruction file; reproduced on unmodified
  `main`, so it is PRE-EXISTING and was not caused by that work; bundle Testinfrastruktur).
  `scripts/verify/docs.mjs` fails two checks — "README states an acceptance-criteria count"
  and "README count matches CLAUDE.md §7.1" — because the README no longer carries the
  "All N acceptance criteria" phrase the check greps for. A verification that is red for a
  reason nobody is fixing trains everyone to ignore it, which is the failure mode that let a
  red run sit unnoticed for three weeks before.
  FINAL STATE: decide it in the commit and act, do not silence it — either the README carries
  the count again (and the check keeps it honest), or the two checks go and their intent is
  written into the commit message. Whichever way, `node scripts/verify/docs.mjs` exits 0 on a
  clean `main`.
  IN THE SAME POINT: `docs.mjs` gains the `Detail:` pointer check that mirrors its existing
  `Evidence:` checks — every acceptance criterion whose detail was moved out must resolve to
  a real section in `docs/acceptance-criteria-detail.md`, so the move can never rot the way an
  unchecked pointer does. That is a gate change and therefore needs the other model's recorded
  review before it lands (`mechanism-review-guard`).
  VERIFIABLE: `docs.mjs` green on `main`; the pure layer covers the pointer check against a
  present, a missing and a misspelled detail section.

- [ ] 531. THE SPEC DOCUMENTS STILL DESCRIBE THE OLD BIRD'S-EYE COLLISION (found
  06.08.2026 while closing point 299, escalated by the building agent rather than
  guessed around). Point 299 added a settlement footprint to the bird's-eye
  collision and made a debug jump to an enterable place ENTER it, but two spec
  passages still describe the state before it: `design.md` §11 names the bird's-eye
  colliders as "trees and animals" only, and §21.3 describes the jump-to picker as
  landing in the bird's-eye view in every case. `CLAUDE.md` §7.1 point 4 repeats the
  same "trees and animals" wording. The evidence chain
  (`docs/acceptance-evidence.md` §4) was updated with the point and is correct — it
  is only the two spec files that lag.
  WHY IT WAS NOT DONE IN THE SAME COMMIT, which is the rule: both files sit AT their
  measured ceilings in `scripts/doc-budget-core.mjs` (CLAUDE.md 8991 of 8992 words,
  design.md 28164 of 28171), so the ~70 words the correction needs do not fit.
  FINAL STATE: `design.md` §11 names the settlement footprint among the bird's-eye
  colliders with its one-way rule, §21.3 states that a jump to an ENTERABLE target
  enters it while a jump to any other target stays a bird's-eye jump, and
  `CLAUDE.md` §7.1 point 4 matches. The words are won back by TIGHTENING prose in
  the same two files — per the standing rule a blocked budget means shorten or
  merge, and raising a ceiling is the last resort and needs the user's agreement.
  If no tightening of comparable value is found, the point ESCALATES the ceiling
  question to the user instead of silently raising it.
  VERIFIABLE: `node scripts/doc-budget-core.mjs` (or the doc-budget guard) green
  with both passages present; `scripts/verify/docs.mjs` green; a grep for "trees and
  animals" finds no bird's-eye collision passage that omits the settlement.

- [ ] 532. THE COLLISION SUITE COUNTS A DIFFERENT NUMBER OF CHECKS EVERY RUN
  (found 07.08.2026 while merging point 349). Three runs of `collision` against the
  SAME tree (`main` 72fe646a) reported 19, 24 and 25 checks: the 24-check run failed
  `PoC village: the teaching stone is in the layout — null` on both its try and its
  retry, the 19-check run never ran that check at all and went green, and WebGPU
  reported 25 green. So a green `collision` run does not prove the coverage the
  previous green run had, and a real teaching-stone defect disappears by itself on
  the next run. This is the class of the closed point 404 — a passing count over a
  set that silently shrank — one suite further on, and it defeats the flake policy
  too: "the same check failed twice" cannot be judged when the check is not always
  asked.
  FINAL STATE:
  1. The suite's check SET is deterministic: the same tree asks the same questions
     every run, on both backends. Whatever the suite currently picks procedurally —
     the evidence points at WHICH settlement it reaches for, and whether that one
     happens to carry a teaching stone — is chosen from a pinned seed or iterated in
     full, not sampled.
  2. A check that cannot run REPORTS that it did not run, as a named skip with its
     reason. A silently absent check is the defect here; a loud skip is not.
  3. The run's summary states the expected check count beside the actual one and
     FAILS when they differ, so a shrunken set is a red rather than a smaller green.
     Where the count is legitimately variable, the pinned expectation says so with
     its range and its reason.
  4. SETTLE THE TEACHING STONE FIRST, because the answer decides (1): is the stone
     optional in the PoC village by design, or was it missing when the 24-check run
     read `null`? If it is genuinely sometimes absent, the check states the
     precondition and skips loudly per (2); if it must always be there, the null is
     a product bug and is fixed here.
  VERIFIABLE: pure Vitest over the suite's check registry where the choice is
  derivable, plus three consecutive `collision` runs on a quiet machine — WebGL 2 and
  WebGPU — reporting the SAME check count, and a deliberately removed check turning
  the run red instead of shrinking it.

- [ ] 534. ONE PROJECT-SLUG RESOLVER, AND A FINDING RECORDED FROM A WORKTREE SURVIVES
  (guard/memory audit 07.08.2026, findings 1/3/6 — `docs/guard-memory-audit.md`).
  MEASURED: `findings-paths.projectSlug` maps the repo path to the memory directory with a
  bare `replace(/[^A-Za-z0-9]/g,'-')` while `retro-sources.defaultMemoryDir` strips the
  trailing dash and lowercases a drive letter. `REPO_ROOT` ends in a separator, so the two
  answer DIFFERENTLY — `-workspace-hoa-` against `-workspace-hoa` — and both directories
  exist on disk: 74 memories plus `MEMORY.md` in one, the findings carrier ALONE in the
  other. `memoryIndexPath()` therefore points at a `MEMORY.md` that is not there, so
  `ensureIndexed()` in `finding.mjs` takes its catch branch on EVERY call and has never
  linked the carrier; the index line that reaches it was written by hand. On Windows the
  same split reads `C--…` against `c--…`.
  SECOND HALF, same resolver: `carrierPath()` derives from the CHECKOUT path, so a finding
  recorded from `…/.claude/worktrees/agent-XXXX/` writes a carrier of that worktree's own,
  which the owner's `--drain` never reads and which dies with the worktree. Worktree agents
  are the project's principal finders under maximal delegation, so this is the common case,
  not the edge one. `retro-sources` already refuses LOUDLY on this defect class.
  DELIVER: (a) ONE resolver — `retro-sources`' form is the correct one (it matches the
  directory the harness really writes) and `findings-paths` imports it instead of restating
  it; (b) `carrierPath()` NORMALISES a worktree checkout to its main one (the shape
  `memoryDirVariants` already uses) and REFUSES loudly rather than writing when it still
  cannot resolve; (c) the existing carrier file is moved to the resolved directory and
  `ensureIndexed()` links it for real; (d) `MEMORY.md`'s carrier pointer stops naming a
  literal Windows path — which no longer exists on this Linux host — and names the COMMAND
  that prints the path instead, so it cannot go stale on the next host.
  VERIFIABLE: pure Vitest — the two resolvers answer identically for a path with and without
  a trailing separator and for a Windows drive letter; a worktree path normalises to its main
  checkout; an unresolvable path throws rather than writing; `ensureIndexed()` links into a
  real index. Live: a finding recorded from a worktree is read by `--drain` in the main tree.
  Criticality: high (the carrier is the only thing that outlives a finding session).

- [ ] 535. ONE DEFINITION OF WHAT COUNTS AS A MECHANISM, AND IT REACHES THE HOOKS
  (guard/memory audit 07.08.2026, findings 2/5). CLAUDE.md §7.2 states that
  `mechanism-review-guard` "lets no new or changed guard, gate or HOOK end a turn without
  the OTHER model's recorded review". `isMechanismPath` matches `-guard`/`-gate` and
  `scripts/git-hooks/*` only, so EIGHT wired enforcers stand outside it — `batch-resume-hook`,
  `dashboard-reminder-hook`, `lock-heartbeat-hook`, `lock-release-hook`, `prep-arm-hook`,
  `dashboard-sync`, `worktree-reminder` and their cores. `dashboard-reminder-hook` is the file
  `HIGH_FREQUENCY_FIRST` names FIRST, its text replayed at every prompt, and it can be
  rewritten today with no second pair of eyes.
  The same disagreement runs one layer down: `rule-review-state.countCorpusEntries` counts
  `/-(guard|hook)\.mjs$/` while `guard-health-core.ENFORCER_RE` includes `-gate`, so
  `model-trailer-gate.mjs` and `pre-push-gate.mjs` are outside the corpus the review SCHEDULE
  watches — its growth trigger cannot see that class grow at all.
  DELIVER: (a) WIDEN `isMechanismPath` to `-hook` — the file's own comment already argues the
  name-based reach, so this is a one-line, reviewable edit; CLAUDE.md is NOT weakened to match
  the code; (b) `countCorpusEntries` imports `ENFORCER_RE` instead of restating it, as
  `guard-inventory-core` already does. The count moves 107 → 109, so the review attestation is
  RE-RECORDED in the same commit or the schedule reads the change as growth.
  A THIRD SHAPE, met 09.08.2026 while closing point 566: a gate need not be a `.mjs` enforcer
  at all. Arming `no-undef`/`no-var` over `scripts/**/*.mjs` in `.oxlintrc.json` created a gate
  that now refuses commits through `npm run lint` in CI, the fast gate and the pre-push hook —
  and `isMechanismPath` matches neither a `.json` config nor `scripts/verify/*`, so nothing
  fired. The review happened because §6 was obeyed by hand, and it returned
  `merge-with-fixes` on four confirmed defects, one of which let the very bug the gate exists
  to kill return undetected. So the reach must also cover WHAT A GATE IS WIRED THROUGH, not
  only what a file is called: at minimum the lint/audit configuration the gate commands read
  (`.oxlintrc.json`, and the `test`/`lint` script definitions in `package.json`).
  VERIFIABLE: pure Vitest — a `-hook` path is a mechanism path and a `-hook` change with no
  review record BLOCKS; an `.oxlintrc.json` rule change likewise BLOCKS unreviewed; the corpus
  count matches `guard-inventory`'s enforcer count on the real tree.
  Criticality: high (it decides what the four-eyes gate sees at all).

- [ ] 536. THE TWO WIRED ENFORCERS NO SELECTOR REACHES GET CONVENTIONAL NAMES
  (guard/memory audit 07.08.2026, finding 4). `dashboard-sync.mjs` (Stop) and
  `worktree-reminder.mjs` (PreToolUse/Agent) enforce real rules with pure cores, but their
  names end in none of `-guard`/`-gate`/`-hook`. So `guard-health` never asks whether they are
  still wired or tested, `countCorpusEntries` never counts them, and the four-eyes gate passes
  over them. Nothing is broken TODAY — which is the finding: were either unwired tomorrow, no
  check would say so.
  DELIVER: rename to `dashboard-sync-guard.mjs` and `worktree-reminder-hook.mjs` (cores and
  tests with them) in ONE commit together with their `.claude/settings.json` lines, so the
  chain is never half-renamed. ATTENDED: the settings file always prompts, so this point is
  worked in an attended session, not by a delegated agent.
  VERIFIABLE: `node scripts/guard-inventory.mjs` reports `unconventional 0`, `guard-health`
  lists both, and the corpus count rises by two — with the attestation re-recorded in the same
  commit as in point 535. Criticality: medium.

- [ ] 537. THE UNTESTED-GUARD RATCHET IS RATCHETED, AND THE REAL DEBT NAMED
  (guard/memory audit 07.08.2026, finding 8). `KNOWN_UNTESTED` records seven enforcers as
  lacking a tested core and states the list "can only shrink — remove a name the moment its
  core gains a test". Judged by the module's OWN `tested` rule, four now pass:
  `batch-progress-guard`, `batch-resume-hook`, `dashboard-reminder-hook`, `lock-heartbeat-hook`.
  The list overstates the debt by more than half, and a standing amnesty nobody re-reads is
  how the real debt hides.
  DELIVER: delete those four names; keep `lock-release-hook`, `prep-guard` and `prep-arm-hook`
  — which has no local import at all — each with its debt named in one line. Add the ratchet's
  own check: a name whose core IS tested fails the gate instead of sitting there.
  VERIFIABLE: pure Vitest — a tested core still listed in `KNOWN_UNTESTED` FAILS; the three
  remaining names pass; the list cannot grow without a written reason. Criticality: medium.

- [ ] 538. TWO MEMORIES THAT DESCRIBE MECHANISMS THAT ARE GONE
  (guard/memory audit 07.08.2026, findings 7/10). `chat-timestamp` — 7.7 KB, the project's
  third-largest memory, loaded every session — states that `dashboard-reminder-hook.mjs` emits
  the timestamp obligation as its first and last line, "(Zeilen 66 und 131)". Point 440 took
  that out, and the hook now says the OPPOSITE in its own header: the rule is not stated there,
  `timestamp-guard` blocks the turn. The RULE is live; only its stated mechanism is wrong.
  And the memory index calls `pending-queue-work-29-07` a "CARRIER for findings not yet in
  TASKS.md" with the instruction "delete the file once they are filed" — the file has been
  marked DRAINED since 30.07.2026 and deliberately survives, because it holds the one thing a
  work-order point cannot: what a `/doctor` run rejected ON PURPOSE. The index line orders the
  deletion of exactly that record.
  DELIVER: (a) `chat-timestamp` corrected to the layers that are live (the user-scope hook plus
  `timestamp-guard`) and its nine-escalation history cut to the surviving rule — a memory that
  cites LINE NUMBERS drifts by construction, so it cites the file's statement instead; (b) the
  index line for `pending-queue-work-29-07` rewritten to what the file now is, a record of
  rejected options that is not to be re-analysed, with the deletion instruction removed.
  VERIFIABLE: no runtime invariant — this is corpus hygiene. The proof is that neither memory
  names a mechanism the tree does not have; check each claim against the code that owns it.
  Criticality: low, frequency HIGH (both texts load every session).

- [ ] 607. THE EVIDENCE FOR CRITERION 20 NAMES A CONTROL COUNT THAT IS TWO DOZEN SHORT
  (found while delivering point 605). `docs/acceptance-evidence.md` §20 states that the
  completeness test pins "132 controls"; the debug menu now carries 158. The number was
  right when it was written and has not been maintained since, which makes the evidence
  chain read as current while it is not.
  FINAL STATE: the count is not written in prose at all. §20 names the TEST that pins the
  completeness (which is what actually holds the property) and states the count only
  where a machine keeps it true — or, if the number stays in the document, the sync test
  that already guards `docs/graphics-detail-levels.md` gains the same duty for this
  figure, so a drifted count fails the unit layer instead of quietly aging. The rest of
  `docs/acceptance-evidence.md` is swept for the same class of hand-maintained number in
  the same commit.
  VERIFIABLE: Vitest — the guard fails on a deliberately wrong count and passes on the
  real one; `npm run test:unit` green.
  Criticality: low — a documentation defect, but in the file the closing run reads as
  proof.

- [ ] 609. THE PROOF GUARD IS BUILT, TAUGHT AND WIRED TO NOTHING (found 10.08.2026 by the
  second model while clearing point 594). `scripts/point-proof-guard.mjs` refuses the tick of
  a point whose `PROOF:` line has not run at the current HEAD — the mechanism exists, has a
  register, a `--status` and a CLI, and point 594 just taught it to recognise the landing
  command. It has NO hook entry in `.claude/settings.json`. Its PreToolUse mode therefore
  never runs: no `PROOF:` line has ever been demanded of anyone, and 594's teaching bites
  only once somebody arms it. This is the retrospective's lesson "built, tested, documented — and
  put in nobody's way" again, in the one family whose whole purpose is to be in the way.
  FINAL STATE:
  1. The guard is ARMED in `.claude/settings.json`, in the PreToolUse chain beside the other
     tick gates, and a run proves it fires: a point carrying a `PROOF:` line cannot be ticked
     until its command has run at HEAD, and one without such a line is untouched.
  2. WIRING IS ATTENDED WORK — `.claude/settings.json` prompts on every edit, so this point is
     done in a session with the user present, not by a delegated agent.
  3. THE CLASS, NOT THE CASE: every guard the repository ships is checked for the same gap.
     `scripts/guard-inventory-core.mjs` already knows the inventory — it gains the question
     "is this guard reachable from the settings chain at all?", and an unwired guard is named
     loudly rather than counted as present. `guard-health-guard` carries the verdict, so the
     next one cannot sit unwired for a month.
  VERIFIABLE: Vitest — the inventory check fails on a fixture whose guard has no hook entry
  and passes when it has one; plus the recorded live proof of 1, since an armed hook is the
  one thing the unit layer cannot demonstrate about the real settings file.
  Criticality: medium — nothing the player sees, but it is a gate everyone believed was
  closed, and the belief is what made it worth nothing.

- [ ] 611. THE FENCE TEST TOLERATES WHAT IT CLAIMS TO FORBID (four-eyes finding on point
  604, 10.08.2026). `src/scenes/place/layout.test.ts:664` asserts that no dwelling grows
  through a fence with `toBeGreaterThan(-0.5)`, while the worst real case — the tuareg
  camp's tent through its own windbreak — measures -0.463 m: 3.7 cm of headroom, no comment
  naming what is tolerated, and a test name that claims more than it enforces. The measured
  field (second model, 10.08.2026): tuareg -0.463, maasai +0.04, somali +0.06, pedi +0.12,
  zulu +0.17. They are open wedge corners rather than closed pockets — a player backs out
  the way he came — which is why 604 shipped without them, but a silent threshold is how
  the next real crossing arrives unnoticed.
  FINAL STATE: either the tuareg camp is seated so its tent clears its windbreak like every
  other plan, or the tolerated case is NAMED in the test — the specific plan, the measured
  value and why an open corner is acceptable — with the threshold set just past the named
  case rather than at a round number, so a NEW crossing fails even while the old one stands.
  The other four plans are asserted positive, not merely above -0.5.
  VERIFIABLE: Vitest — the named case passes, a deliberately worsened plan fails, and the
  four clear plans are held above zero.
  Criticality: low — nothing traps the player today, but the assertion is the one thing
  standing between a future crossing and the picture.

- [ ] 467. THE VERSIONED BOARD REFRESHER REACHES NO READER (30.07.2026, found by the agent
  that fixed the refresh stealing the chat's focus; bundle Chat & Tafel). Two halves of one
  hole. (a) `scripts/board-refresher-core.mjs` exports `refresherScript()` /
  `REFRESHER_SOURCE`, but NO production script imports them — neither `scripts/board.mjs` nor
  `scripts/board-publish.mjs` touches the module; the script text that actually runs lives
  literally inside `.batch-dashboard.html`, and a SECOND, DIVERGED hand-copy sits in
  `origin/board:board.html`, where it does not even dispatch the `hoa-board-swapped` event the
  chat re-injection is documented to ride on. So a fix made in the versioned source reaches
  nobody, and the two copies drift with nothing comparing them. (b) The module's own comment
  claims `structureViolations` refuses a board that does not carry the versioned script — it
  contains no such check, so the promise "versioned, therefore it cannot break silently" is
  not held by anything.
  FINAL STATE: ONE source of the refresher script, injected by the publish path, so what the
  reader runs is what the repository versions; the diverged copy in the `board` branch is
  produced by that path rather than maintained by hand; and the structure check the comment
  promises either EXISTS and fails a board whose script does not match the versioned source,
  or the comment goes. The `hoa-board-swapped` dispatch must be present in whatever the reader
  actually runs.
  VERIFIABLE: a Vitest case asserting the published board's script is byte-identical to
  `REFRESHER_SOURCE`, one asserting the structure check refuses a board carrying a foreign or
  absent script, and one covering the event dispatch. Plus one published board reviewed by
  eye — a swap must still re-inject the chat.

- [ ] 468. THE SAME BLIND PARSE SITS IN TWO MORE READERS OF THE WORK ORDER (30.07.2026,
  named by the agent that fixed the board's title parse; bundle Modell & Wächter). The defect
  shape of point 439 — a `$`-anchored line pattern applied to `split('\n')` output, which
  matches NOTHING when the file arrives with CRLF because `.` does not match `\r` and `$` does
  not stand before it — was found in two further readers that were NOT in that point's file
  scope: `parsePointSpecs` in `scripts/dashboard-integrity-guard-core.mjs` (its whole spec map
  comes back empty, so every per-point check silently passes on nothing — observed live on
  30.07.2026, when it reported 96 queue cards as "point does not exist") and
  `processTaskPoints` in `scripts/retro-core.mjs`. Two more carry the same shape but are
  LF-fed by construction today (`retro-core.mjs` around line 94,
  `batch-handover-observe-core.mjs` around line 52) — a construction, not a guarantee.
  The line endings on disk were normalised on 30.07.2026, so the symptom is gone; the READERS
  are still one bad checkout away from it, and the class is retrospective §3.72: over a
  known non-empty source, an empty parse is a FINDING, not an answer.
  FINAL STATE: every reader of the work order tolerates both line-ending forms, and the two
  guard-side readers REPORT an empty parse over a non-empty file instead of passing. A sweep
  names every remaining instance of the shape in `scripts/` and either fixes it or records why
  it cannot arrive with CRLF. Both files are guard cores, so the other model's recorded review
  is required before the merge (`mechanism-review-guard`).
  VERIFIABLE: one Vitest case per fixed reader whose fixture text carries CRLF explicitly (a
  fixture written with `\n` passes before the fix and proves nothing), plus one asserting the
  empty-parse report fires for a non-empty source.

- [ ] 491. QUEUE PROSE WRITTEN ONLY INTO THE HTML IS LOST ON THE NEXT REBUILD
  (measured 04.08.2026, and it cost the German text of thirteen cards). The
  Warteschlange is a PROJECTION: `scripts/board-queue.mjs` renders it from
  `.claude/board-queue.json`. But `node scripts/board.mjs queue <N> "<text>"`
  writes the rendered card into `.batch-dashboard.html` ALONE, and nothing writes
  it back to the data file. So the German titles, estimates and prose of points
  477–489 stood correctly on the board and evaporated at the first
  `board-queue.mjs` run — the board reverted to the work order's English
  headlines and "Noch keine Beschreibung auf dem Board". They were recoverable
  only because the previous publish commit was still reachable on the board
  branch; one more publish would have made the loss permanent.
  FINAL STATE:
  1. Whatever writes a queue card writes the DATA file, exactly as `board.mjs
     title` already does for titles ("the Warteschlange is a projection, so a
     title that lived only in the HTML would evaporate on the next rebuild" — the
     comment is right, and `queue` is the case it does not cover).
  2. A rebuild that would DROP prose or a title an existing card carries refuses,
     or restores it from the HTML first. A projection may narrow the board's
     content silently only where the work order genuinely says less.
  3. `board-queue.mjs` reports what it changed per card, not only the totals: the
     run that destroyed thirteen cards printed "queue rebuilt … 109 card(s)" and
     a hint listing them as "no prose yet", which reads like a state, not a loss.
  VERIFIABLE: pure Vitest — a card written through `board.mjs queue` survives a
  rebuild; a rebuild that would blank an existing card's prose is refused or
  restores it; the report names the cards it emptied.

- [ ] 495. A VERSIONED GIT HOOK WITHOUT ITS EXECUTABLE BIT IS SILENTLY INERT
  (found 04.08.2026). `scripts/git-hooks/pre-push` was committed 100644. Git for
  Windows runs a hook whichever mode it carries, so the gate worked on the old
  host and fell silent the moment the working copy moved to Linux — the only
  trace was one hint line inside a SUCCESSFUL push ("hook was ignored because
  it's not set as executable"), which no gate reads. The bit is restored, so this
  point is not the fix but the MECHANISM that keeps the next hook from repeating
  it: `scripts/enable-hooks.mjs` already wires `core.hooksPath` on every
  `npm install` and is the one place that knows the hook directory.
  FINAL STATE:
  1. `enable-hooks.mjs` also ensures every file directly under
     `scripts/git-hooks/` is executable for the user on POSIX — `chmod` the
     working file AND `git update-index --chmod=+x` where the INDEX mode is
     644, so a fresh clone gets it too rather than needing the same repair.
     Windows has no such mode; the step is skipped there, not faked.
  2. It stays FAIL-OPEN and quiet, like the rest of that script: a read-only
     checkout, a tarball without `.git`, a hook directory that does not exist —
     each leaves the install green. Only a mode it actually changed is reported,
     one line per file, so a silent repair cannot pass for "nothing was wrong".
  3. The DETECTION half widens the enforcer built for exactly this question:
     `guard-health-guard` ("no enforcer may sit in the tree unable to fire")
     already reads the active hook directory, but only its CONTENT. It also
     judges the arming — a hook in the active directory without the executable
     bit is a finding like an unwired guard, reported the same way, on POSIX
     only. Widening it, not a sibling guard beside it.
  4. A Vitest case pins both decisions: given a listing of hook files with their
     modes, which need a chmod, and which count as unable to fire. Pure
     functions, so no test touches a real repository.
  VERIFIABLE: `npm run test:unit` covers both decision functions, including the
  no-op case, a 644 hook, a non-POSIX platform and an unreadable directory;
  `git ls-files -s scripts/git-hooks/` reports 100755 for every hook; and
  `node scripts/guard-health-guard.mjs --status` names a hook whose bit was
  removed.

- [ ] 497. THE GERMAN-LANGUAGE RULE HAS NO MECHANISM AT ALL, AND THE AUDIT
  PASSED IT ANYWAY (user 04.08.2026: "Warum schreibst du die ganze Zeit auf
  Englisch? Klappt der Mechanismus nicht? Falls ja, klappen vielleicht auch
  andere Mechanismen nicht."). Answers to the user are German (memory
  `language-german`); on 04.08.2026 a whole session narrated in English and
  nothing objected. The reason is not a broken enforcer but a MISSING one: the
  rule lives only in a memory line. Its neighbour proves the point — the
  chat-timestamp rule carries an injection hook AND a blocking Stop guard
  (`timestamp-guard.mjs`) that reads the outgoing reply, and it has not slipped
  once. `docs/rule-corpus-audit.md` row A25 nevertheless records
  `language-german` as "OK" with an EMPTY finding column, because that audit
  asked whether each rule's TEXT was current, never whether anything MEASURES
  it. `guard-health-guard` has the same blind spot from the other side: it
  proves every wired enforcer can fire (32 of 32 today) and says nothing about a
  rule that never got one.
  FINAL STATE:
  1. A Stop-chain guard judges the LANGUAGE of the turn's outgoing answer and
     blocks a reply whose prose is not German. It rides the layer that already
     works for the stamp: the same reply text `timestamp-guard` reads, a pure
     decision core, Vitest-covered, fail-OPEN on any internal error, standing
     down for a session that does not own the batch lock and for a paused batch.
  2. The decision is made on PROSE ONLY, so the code rules stay untouched: fenced
     code blocks, inline code spans, file paths, identifiers, commit subjects,
     command output and quoted English source text are stripped before judging.
     A German sentence naming English identifiers passes; an English sentence of
     narration does not. The verdict is a stopword-ratio decision over what
     remains, with a minimum word count below which it abstains rather than
     guesses — an abstain is an allow.
  3. The remedy line says what to do rather than scolding: write the answer in
     German, code and commits stay English, and it names `language-german`.
  4. The DETECTION half closes the audit's blind spot rather than adding a
     sibling to it: `docs/rule-corpus-audit.md` gains a WHAT-MEASURES-THIS axis,
     filled for every row — an enforcer name, a test, or "nothing". Every row
     that reads "nothing" is either given a mechanism or recorded as
     deliberately unenforced WITH the reason, the way A19
     (`english-no-germanisms`) already is. A25 becomes the worked example.
  VERIFIABLE: pure Vitest over the decision core — an English narration
  paragraph is blocked; a German answer containing English identifiers, paths,
  a fenced diff and a quoted English error message passes; a two-word answer
  abstains; the guard allows on any internal error and when the session does not
  own the lock. `node scripts/guard-health-guard.mjs --status` still reports
  every enforcer wired with the new one counted, and no row in
  `docs/rule-corpus-audit.md` is left with an empty measured-by cell.

- [ ] 498. WHAT THE SOFTWARE SECOND LANE COSTS THE FULL REGRESSION, MEASURED
  (user 04.08.2026, asking against the open decision "Zweite Bahn läuft in
  Software — reicht das?"). Point 493 restored both lanes and measured ONE
  suite: `flow` runs 58 s on the hardware WebGL lane and 3 min 41 s on the
  software WebGPU lane, a factor of 3.8. What nobody has measured is the number
  the user actually decides on — the WHOLE regression. A LARGE run is two passes
  (the full set on WebGL 2 with preflight and prod preview, then every suite
  except `touch`/`voice` on WebGPU), so the software lane is not a small tail:
  it is a second near-complete pass at software speed. The pre-container figure
  on record is "30–40 minutes" (`docs/batch-resilience.md`), taken on Windows
  where BOTH passes had the GPU.
  FINAL STATE:
  1. One LARGE run on `main` is timed end to end, and the two passes are timed
     SEPARATELY — the WebGL pass and the WebGPU pass — because only the split
     shows what the software lane costs and what the GPU gained.
  2. `docs/host-environment.md` records all of it beside the existing per-suite
     figures: the two pass durations, the total, the 30–40 min Windows baseline
     it is compared against, and the date and machine state of the run (a
     measurement taken under a running agent pool is worth less, and says so).
  3. The comparison is stated HONESTLY in both directions: the WebGL pass is
     faster than it was on Windows, the WebGPU pass slower, and the answer to
     "is the total worse than before" follows from the measured numbers rather
     than from the factor 3.8 extrapolated.
  4. The measured total is carried onto the open decision card, so the user
     decides against a number rather than an estimate.
  5. THE MACHINE STATE IS PART OF THE NUMBER (user 05.08.2026). The host carried
     other load through the morning, so a run taken then is a SECURED UPPER BOUND
     and is labelled as one wherever it is written down. An upper bound settles
     the question only while it stays BELOW the 30–40 min Windows baseline; above
     it, the run is repeated on a quiet machine before any verdict is drawn.
  6. The software-lane premise is gone (point 505): the WebGPU pass now draws on
     the card at 0.73× the WebGL lane's rate rather than the software lane's 0.26,
     so the factor 3.8 is history and the measurement records what REPLACED it.
  VERIFIABLE: `docs/host-environment.md` names both pass durations, the total
  and the baseline with its date; the run's own log is quoted for each figure;
  and no figure in that section is an extrapolation — every one is a wall-clock
  reading of a run that happened.

- [ ] 506. THE SOFTWARE LANE REDDENS AT CHECKS IT CANNOT DRAW FAST ENOUGH TO
  ANSWER (measured 05.08.2026, 01:50–03:40, on a machine with no second verify
  run — the quiet repeat point 499 asked for). Four checks fail on the software
  WebGPU lane and pass, measured, on the hardware WebGL 2 lane, and every one of
  them is a rate the lane cannot deliver rather than a broken product:
  `polish` "settlement walker (goat): the planted foot holds its ground spot"
  reports MEASURED NOTHING — 1 usable stance interval where it needs 3, against
  23 intervals with a worst travel of 0.337 on the WebGL lane; `polish` "the dry
  settlement season reading settles before it is read — after 60176 ms";
  `settings` "a footstep fires with a surface class while walking (point 97)",
  twice, green on WebGL; and `benchmark` dies outright with
  `page.waitForFunction: Timeout 300000ms exceeded` (`benchmark.mjs:89`) because
  its fixed 864-frame route cannot finish in software. `docs/host-environment.md`
  already states the underlying fact — SwiftShader draws roughly one frame per
  second, so "a green run there proves nothing about timing" — but nothing acts
  on it, so every run shows red for it and a real regression would hide in that
  noise.
  COLLISION CARRIES TWO MORE OF THE SAME (measured 05.08.2026, three runs on the
  software lane, green on WebGL 2): "inhabitant walked out and re-entered its
  dwelling through the door — no walk→inside transition observed" and "no inhabitant
  stays pinned past the unstuck window", the latter reporting `"ok":true` beside
  `anyMoved:false` — it FAILS while its rule holds, because at roughly one frame per
  second nothing moves far enough inside the observation window to measure. That is
  the MEASURED-NOTHING signature, and a check that reports a rule as broken while
  saying the rule held is the worst kind of red: it reads as a product defect.
  IT IS NOT ONLY REDS: on 05.08.2026 `VERIFY_GL=webgpu run-all polish` ran 27
  minutes in a synced branch, printed nothing after "starting dev server", wrote no
  frame at all and had to be killed, while `world collision` had passed on the same
  lane minutes earlier. So the lane can also HANG, and while it does, no figure or
  settlement point has a second backend at all — every such merge then owes a loud
  deferral instead of a picture.
  THE GOAT CHECK NOW ROTATES ON THAT LANE INSTEAD OF STANDING RED (measured 08.08.2026,
  three WebGPU `polish` runs after point 549 rebuilt its sampling): it passed one run,
  needed the retry in the second, and failed BOTH attempts of the third — worst foot/body
  travel 2.016, 2.318 and 1.929 against an unchanged bar of 0.25, over 19–27 stance
  intervals with unbroken stances of 103–117 frames. At roughly one frame per second such
  a stance spans a minute and a half of world time, in which the goat plainly walks: the
  figure measures the lane, not the foot. The same check reads 0.047–0.059 on WebGL 2. A
  rotating red is worse than a standing one — it is the shape that teaches a reader to
  wave the lane's reds off — and only the skip of FINAL STATE 2 removes it.
  FINAL STATE:
  1. The run MEASURES the lane's delivered frame rate once, from the running
     page, and reports it in the run header — every verdict below names the lane
     it was taken on rather than assuming one.
  2. A check whose subject is a RATE or a wall-clock budget (stance intervals per
     walk, a settle deadline, the fixed-frame benchmark route) declares the
     throughput it needs. Below it the check SKIPS, naming the measured figure
     and that the lane cannot answer it; it never reds and never passes silently.
  3. NO product threshold moves. The skip is a property of the lane; on a lane
     that meets the throughput the identical check runs unchanged and must still
     fail on a real regression.
  4. Lane skips are counted in the run summary, so a lane that skips half a suite
     can never be mistaken for a green both-backend verification — what the §7.2
     both-backend rule counts is what actually RAN.
  VERIFIABLE: on this host `VERIFY_GL=webgpu npm test -- polish settings
  benchmark` ends green with exactly those four checks reported as lane skips
  naming the measured frame rate, while `VERIFY_GL=webgl` runs all four for real;
  a Vitest case pins the pure skip decision (needed vs measured throughput) in
  both directions, including that a hardware lane never skips.

- [ ] 508. EACH NOW-CARD IS JUDGED BY ITS OWN NUMBER (measured 05.08.2026, bundle
  Chat & Tafel). `parseNowCard` in `scripts/queue-order-guard-core.mjs` cuts the
  WHOLE "Woran ich gerade arbeite" section out as ONE text and files it under the
  FIRST card's number. Several now-cards at once are explicitly allowed (one per
  point in active work), so every word in any of them is charged to the first: today
  "Fertig ist der Weltteil" in the 482 card blocked the turn end with the message
  that the 485 card claimed completion, and the topic guard reported 482 for a
  cross-reference that stood in a different card. A guard that names the wrong card
  sends the session to edit correct text, which is worse than not firing.
  FINAL STATE:
  1. The section is split per `<details class="now">`, and every now-card is judged
     against its OWN point number — by the done-claim check, the card-topic check
     and the conciseness check alike.
  2. A card without a recognisable number is reported as such, never silently
     merged into its neighbour.
  3. The guards keep failing open on an unparseable board.
  VERIFIABLE: pure Vitest on a board with three now-cards where only the SECOND
  carries a done-claim, a cross-point mention and an over-long paragraph — each
  finding must name the second card's point, and a single-now-card board must behave
  exactly as it does today.

- [ ] 514. THE COMPATIBILITY LANE HAS TWO REDS THE WEBGL LANE DOES NOT (measured
  05.08.2026 on `main`, both lanes run minutes apart on the same machine, right
  after the lane moved onto the card in point 505). `enrichments` on the WebGPU
  compatibility lane died twice for different reasons — run 1 after 157 green
  checks with `page.evaluate: TypeError: Cannot read properties of undefined
  (reading 'herdsRef')`, i.e. `window.__wildlife` was gone at the moment of
  access; run 2 with `frame 72-water-victoria-falls — its subject is not in the
  rendered picture`. The SAME suite on WebGL 2, twice, showed neither: 244 pass
  and only the measures-nothing dressing flake point 200 already lists. The lane
  is now the project's second evidence lane, so its own faults have to be
  separated from the product's.
  FINAL STATE:
  1. Each of the two is CLASSIFIED, on a quiet machine, as either a lane fault or
     a product defect — the suspicion is recorded so nobody re-derives it: the
     dev hook is deleted on unmount and the compat lane builds the scene on a
     different schedule, so the access may fall into a window the suite does not
     wait through; and the falls frame may sit differently because compat forces
     MSAA off.
  2. What turns out to be the suite's own timing is fixed at the READINESS, not
     with a longer wait: the access waits for the hook the same way the boot
     sequence does.
  3. What turns out to be a product difference between the feature levels is
     stated in `docs/host-environment.md`, so a reader knows which lane can carry
     which verdict.
  4. Nothing here weakens the shutter: a frame whose subject is not in the picture
     stays a failure — the point fixes the cause, never the assertion.
  5. `settings` belongs to the same classification (measured 06.08.2026, twice):
     on the compatibility lane every check that switches TRAA OFF fails, because
     the MSAA path it falls back to cannot exist there — `RGBA16Float does not
     support multisampling` arrives as an uncaptured GPUValidationError and the
     scene then renders black (mean 2.2). WebGL 2 passes the same suite 52/0
     minutes apart. If that is structural, the host-environment section says so
     and the lane's verdict for MSAA checks is recorded as unavailable rather
     than red.
  6. IT IS NO LONGER ONE SUITE'S PROBLEM (09.08.2026, two delegated agents
     independently, on different branches and on the merge-base): the same
     `RGBA16Float does not support multisampling` and the same black frames now
     stand between every RENDER point and its merge, because CLAUDE.md §6 demands
     the picture proof on BOTH backends where they can differ. `baseline-classify`
     labels 16 of 17 `settings` failures pre-existing, WebGL 2 passes the same tree
     59/1 with no console error — so the product is not what is red, the lane is.
     Until this point closes, a render package can be verified on WebGL 2 and its
     WebGPU half is OWED, and that owing is stated at the merge rather than passed
     over in silence. This is what raises the point's urgency; it changes nothing
     about what it must deliver.
  7. A SECOND, CHEAPER DEFECT OF THE SAME FAMILY, found while chasing the first:
     `bootGame` in `scripts/verify/_boot.mjs` calls `webglLaunchOptions` WITHOUT the
     environment, so the Gallium pin never lands and any probe built on that boot
     renders a BLACK canvas while the real suites render the game. It cost one agent
     two probe runs and it is exactly the shape that gets misread as a product
     defect. Fixed here, with a pure test that the boot's launch options carry the
     pin.
  VERIFIABLE: `enrichments` and `settings` run green twice in a row on the
  compatibility lane on a quiet machine, or the host-environment section names the
  difference that makes it structurally impossible there. Plus: a probe built on
  `bootGame` renders the scene, not a black canvas.

- [ ] 520. THE BOARD DEMANDS A TIME IT GIVES NO WAY TO WRITE (found 05.08.2026
  while closing point 394). `dashboard-guard` refuses the turn end when a
  current-work card's estimate is less than 15 minutes away (`now-eta-soon`) and
  instructs "give each a realistic new `~HH:MM`" — but `scripts/board.mjs` has no
  command that writes one: `status`, `title`, `now`, `queue` and `done` all leave
  the card's `<span class="meta">` untouched, and `promote` takes a times argument
  only when a card is first raised out of the queue. The only remaining way is to
  hand-edit `.batch-dashboard.html` — precisely the act that, per the comment on
  `setCardTitle` in `scripts/board-core.mjs` (point 439), once wrote CRLF into the
  file and crashed `attest`. A guard that names a remedy the toolchain cannot
  perform sends every session down that path.
  FINAL STATE: `node scripts/board.mjs eta <point> "~HH:MM"` rewrites ONLY the
  estimate half of that card's meta span (the start time stays as it is), refuses
  a point that has no current-work card and a time that is not in the board's
  `~HH:MM` shape, and publishes like every other editing command — so the loop
  stays "one editing command, then `attest`". The guard message names this command
  instead of describing the edit.
  VERIFIABLE: pure Vitest on the rewrite (the estimate changes, the start time and
  the body do not; an unknown point and a malformed time both throw; the file is
  written with LF endings whatever it held before), plus a case that the
  `now-eta-soon` remedy text names the new command.

- [ ] 521. THE ENRICHMENT SUITE AIMS BY STOPWATCH AND ABORTS BEFORE ITS OWN
  EVIDENCE (found 05.08.2026 while closing point 323). `scripts/verify/
  enrichments.mjs` jumps the traveller with `debugJumpTo` — which sets the
  POSITION instantly while the travel camera SPRINGS toward it — and then waits a
  fixed 1500 ms before shooting. Whether the camera has arrived is therefore a
  question of frame rate: on a loaded machine, or on the slower backend, it has
  not, and `72-water-victoria-falls` fails "subject not in the picture". The
  failure is not cosmetic — it ABORTS the run before frame 137, the picture the
  blood-stain criterion is judged by, so a green product looks red and its evidence
  never gets taken. Measured: four such aborts on WebGPU under load, 245/245 green
  on the same tree once the machine quietened.
  FINAL STATE: the wait after a jump POLLS the camera having arrived — the spring's
  own settle, read through the existing `window.__camera` projection the shutter
  already uses — instead of counting milliseconds, with a stated timeout that fails
  with the measured distance still to go. `scripts/verify/fixedWaits.test.mjs`
  already forbids fixed waits in the verify scripts; this one survives because it
  is written as a bare `waitForTimeout` the rule's pattern misses, so the rule is
  widened to catch it in the same pass.
  THE SAME CLASS IN `polish`, measured 06.08.2026 while closing point 480: the tag
  frame's standpoint took FOUR iterations to find (a tree and an empty paddock, two
  children behind an adult, a hut wall filling the screen), and a fresh run on the
  other backend still wrote a frame with the chase pair NOT in it while every tag
  check passed — so the aim is fragile in both suites, and a frame can miss its
  subject without anything failing. The frame that carries the criterion is
  additionally shot from beside a hut whose unlit side fills the picture's left
  quarter: legible, but the standpoint is chosen by luck rather than by a rule.
  The aim therefore belongs where the shutter can judge it — the subject
  declaration (§7.2, point 375) names the PAIR, and the shutter refuses the frame
  when it is not drawn, instead of the script hunting for a standpoint by hand.
  VERIFIABLE: pure Vitest that the fixed-wait rule flags this shape, and the
  enrichments suite green on BOTH backends on a machine that is deliberately busy;
  for the tag frame, a run whose standpoint misses the pair FAILS instead of
  writing the frame.
  FOLDED IN FROM POINT 572 (measure 11, "the capture is deterministic, or the attempt is
  abandoned"): the settled camera is this point's own subject, so the rest of that measure
  is delivered here rather than by a second owner of the capture path. Beyond the poll,
  the PRNG is seeded and the timestep fixed exactly as in the F8 benchmark, and
  `node scripts/picture-stability.mjs` is RE-MEASURED afterwards — point 375's shutter
  closed part of this and the stability has not been re-measured since. The extension
  carries its own ABORT criterion: if the noise floor does not fall below the smallest
  real defect (0.75 %), the investment is written off and recorded as such in
  `docs/picture-check-levers.md`, which is a result, not a failure. Nothing diff-based is
  enabled by this point itself.

- [ ] 529. A STOP HOOK IN THE USER SCOPE NOW ENFORCES WHAT A PROJECT GUARD
  ALREADY HARD-BLOCKS (measured 06.08.2026 while taking the turn-cost inventory).
  `~/.claude/hooks/check-reply-timestamp.cjs` is registered as a Stop hook in the
  user scope and checks the chat timestamp — the same rule
  `scripts/timestamp-guard.mjs` blocks the turn end on, hard. It therefore buys
  nothing and costs one node process at every turn end. ATTENDED ONLY: removing it
  edits `~/.claude/settings.json`, a protected path that always prompts, so no
  headless session can do it.
  FINAL STATE: the `check-reply-timestamp.cjs` Stop-hook registration is gone from
  the user-scope settings, and the file with it; one turn end is measured before
  and after to show the saved spawn. `~/.claude/hooks/berlin-timestamp.cjs` STAYS —
  since the point-440 cut it is the only injected statement of the timestamp rule,
  and the versioned copy lives at `scripts/hooks/berlin-timestamp.cjs`.
  VERIFIABLE: a reply written without the stamp is still refused (timestamp-guard
  blocks it) after the removal, and the Stop chain's process count drops by one.

- [ ] 542. THREE BUILT GUARDS ARE STILL ASLEEP, AND THE ARMING NEEDS AN ATTENDED
  SESSION (07.08.2026). `path-scope-guard`, `bundle-first-guard` and
  `point-proof-guard` are built, tested and recorded in `INTENTIONALLY_DORMANT`
  (`scripts/guard-health-core.mjs`). None of them enforces anything, because arming
  one means editing `.claude/settings.json`, which always raises a permission prompt
  and can therefore not be done by a worktree agent or a headless batch session. A
  guard that exists and does not fire is worse than no guard: the map claims an
  enforcer where there is none.
  FINAL STATE: all three wired, each in its own commit, each REMOVING its
  `INTENTIONALLY_DORMANT` entry in the SAME commit — the inverse check added with
  point 437 now BLOCKS on a wired enforcer that still carries a dormant record, so
  the two halves cannot drift apart. `point-proof-guard` goes into PreToolUse with
  the matcher `Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell`, the shape
  `closing-guard` uses; the other two take the placement their own headers state.
  ONE PRECONDITION, and it is real work rather than a formality:
  `bundle-first-guard` reports 29 open points in no bundle of
  `docs/work-packages.md` — the drift it exists to catch. Reconcile the scheme
  against the full open set (`node scripts/bundle-first-guard.mjs --status`) BEFORE
  wiring it, or its first turn blocks on a backlog it did not cause.
  VERIFIABLE: after each arming, a fresh session's `node scripts/guard-preflight.mjs
  --for answer --session <id>` lists the guard rather than passing over it, and
  `node scripts/guard-health-guard.mjs` reports no dormant record for a wired
  enforcer (that IS the CLI — there is no `scripts/guard-health.mjs`).
  Criticality: medium — the guards themselves are reviewed and tested; what is at
  stake is that a wrongly placed hook line disables a chain silently.

- [ ] 548. THE PANORAMA BAND'S TWO REVIEW OBSERVATIONS (second model, 07.08.2026; it
  judged BOTH as non-blocking and asked for them as their own point rather than as
  argument). (a) THE ONCE-PER-SESSION CAPTURE TARGETS DO NOT SURVIVE A RENDERER
  RECREATION. `src/scenes/travel/panoramaCapture.ts` holds `targets` module-global, and
  the band is GPU-initialised by one clearing pass on whichever renderer was live at the
  FIRST capture. `WebGLTextureUtils.copyTextureToTexture` destructures the destination's
  `textureGPU` with no lazy init, so a NEW renderer — a context loss, a canvas remount —
  would copy into an uninitialised texture and the empty band of point 545 returns
  SILENTLY, with every check green. Unreachable today (one renderer per app lifetime,
  context loss unhandled app-wide), which is why it is low: the capture is no worse off
  than the rest of the game. Remedy: re-run the band's init clear when the renderer
  identity changes, and pin the identity check in the pure layer.
  (b) THE ENTER-SIDE FIRST-CAPTURE STALL HAS NO BUDGET GATE. `withSynchronousPipelineCompile`
  costs a measured ~3.4 s in ONE frame for the first capture on the slow WebGL 2 lane
  (~0.2–0.4 s warm, none on WebGPU), and it lands on the APPROACH into a settlement —
  a path every player on the fallback backend takes. Point 96's fluidity check bounds
  the LEAVE only (`scripts/verify/polish.mjs`), and the capture fires outside its
  measured window, so nothing today would notice that cost growing. It is bounded,
  once per session and honestly documented — a hitch, not a hole — but this project
  enforces rather than remembers. Remedy: a measured budget on the enter transition
  the way `balance.startup.pictureFreezeBudgetMs` bounds the startup standstill,
  calibratable and debug-editable like its sibling.
  FINAL STATE: a renderer recreated mid-session gets a correctly initialised band rather
  than a silently empty one, and the enter-side capture stall is bounded by a check that
  fails when it grows.
  VERIFIABLE: a Vitest case for the renderer-identity re-init, and a browser check that
  measures the ENTER transition the way point 96 measures the leave.
  Criticality: low — neither is reachable or harmful today; both are the kind of thing
  that stays invisible until the day it is not.

- [ ] 559. THE TIME-TRACKING MANDATE IS ABOLISHED, ITS USEFUL HALF KEPT (user decision
  08.08.2026, answering the board card "Zeiterfassung in der Arbeitsordnung: abschaffen
  oder wiederbeleben?"; bundle Arbeitsordnung). The rule mandated 14.07.2026 prescribes
  four point states — `[ ]` untouched, `[*]` in progress, `[~]` implemented but
  regression pending, `[x]` done — and under every ticked point a `(track: start →
  finish, minutes, ~tokens, model, effort)` line. Measured 27.07.2026 and again on
  08.08.2026: the two intermediate states appear NOWHERE in the work order, and the
  tracking line stands 0 times among the open points and 32 times in the archive, the
  last of them mid-July. The rule is loaded into every session as the memory entry
  `tasks-time-tracking` and has not been followed for three weeks; no guard enforces
  it. The user chose the recommended option — ABOLISH the prescriptive half rather than
  revive it with a mechanism, because what is actually read is the per-card ESTIMATE on
  the board, and that survives without the bookkeeping.
  FINAL STATE: the memory entry prescribes nothing any more. Deleted from it: the four
  checkbox states with every instruction to set `[*]`/`[~]`, and the `(track: …)` line
  with its start/finish/minutes/token/model fields and the 85/15 input-output token
  heuristic. KEPT, as the entry's whole remaining content: ETA calibration — dashboard
  finish estimates are stated at the CATEGORY MEDIAN (small/logic 25–50 min,
  scene/behaviour 60–100 min, minus ~10–15 min under the scoped regression process),
  they LEARN from what points actually took, and an ETA refresh rides on a publish that
  happens anyway instead of causing one. The entry is renamed and re-described to match
  what it now says — it is no longer about tracking — its `MEMORY.md` index line
  rewritten with it, and any `[[tasks-time-tracking]]` link updated.
  `docs/rule-corpus-audit.md` records it as DECIDED-ABOLISHED with this date and the
  user's ruling, not as an open question. The 32 historical `(track: …)` lines in
  `docs/tasks-archive.md` STAY untouched — they record what happened, and rewriting
  history buys nothing. Nothing is added in exchange: no guard, no hook, no substitute
  field. (The answered board card was already taken off "Von dir zu klären" on
  08.08.2026 — a decided question does not wait there for its point to land.)
  VERIFIABLE: a repository-wide search for `(track:` finds hits ONLY in
  `docs/tasks-archive.md` and in the audit documents that count them — never in
  `TASKS.md`, and nowhere as an instruction; a search for the `[*]`/`[~]` states finds
  no rule text demanding them; the rewritten memory entry names no obligation, and
  `MEMORY.md` holds exactly one line for it under its new name. `npm run test:unit` and
  the doc-budget guard stay green (the change only shortens).
  Criticality: low — process hygiene. A rule that formally binds every session while
  nobody follows it teaches that the rule corpus may be ignored, and that cost is
  charged to every other rule.

- [ ] 560. THE ONLY ACTIVE CHANNEL FOR A RED BRANCH RUN IS NOT CONFIGURED (measured
  08.08.2026 during the live proof of point 513; bundle Modell & Wächter). The CI
  workflow has always carried an ntfy alert step for a failed run, and that step has
  never fired: the probe run reported `NTFY_TOPIC secret not set — skipping the failure
  alert`. While a red `feat/**` run still mailed the owner, the dead step cost nothing —
  the mail was the signal. Point 513 deliberately removed that mail, and what remains for
  a red branch run is the commit status: a PASSIVE mark somebody must go and look at. So
  today a branch gate can fail and nothing at all leaves the repository.
  FINAL STATE: a failed CI gate reaches the owner over ntfy on EVERY ref where it is not
  the mail's job — that is, on `feat/**`, where 513 silenced the mail — and stays silent
  where a green run makes it noise. The repository secret `NTFY_TOPIC` is set from the
  topic the repository already uses (`.claude/ntfy-topic`, the same topic
  `scripts/notify.mjs` posts to, so the owner's existing subscription receives it), and
  the workflow step that reads it is confirmed to fire. Setting a repository SECRET is a
  configuration change on the user's GitHub account, so it is done with his go, not
  silently; if he declines, the point closes by RECORDING that a red branch run has no
  active channel — never by leaving the doc claiming one.
  VERIFIABLE: a deliberately red push to a throwaway `feat/` branch delivers an ntfy
  message naming the ref and the failed step, and the same push on a green state delivers
  none; `scripts/verify/README.md`'s notification section names the channel that actually
  carries a branch failure.
  Criticality: medium — it is the difference between a silent failure and a noticed one,
  and it only became live with 513.

- [ ] 561. THE SILENCED BRANCH GATE HAS THREE BLIND SPOTS (four-eyes review of point 513
  by Fable 5, 08.08.2026; bundle Modell & Wächter). Point 513 deliberately makes a red
  `feat/**` run conclude `success` so it stops mailing the owner. The consequence was
  measured, not guessed: the GitHub jobs API reports the failed step's conclusion as
  `success` too, so NO reader of a run's conclusion can recover the truth — only the
  commit status `ci/gate (branch)` carries it. Three holes follow, and none of them is a
  defect of 513's decision.
  FINAL STATE, three parts:
  (a) THE MERGE READS THE BRANCH GATE. `scripts/ci-status-guard.mjs` judges run
      conclusions, so it no longer blocks a turn end on a red branch gate — which is what
      the user chose ("red on a branch is expressly normal"). The residual risk is
      specific: a failure that only the CI host reproduces — the Ubuntu-only class the
      30.07.2026 lesson was written about — now rides a branch to the merge unseen and
      surfaces afterwards as a MAILING red on `main`. So the branch gate is read where it
      still matters: before a merge to `main`, the branch head's `ci/gate (branch)` commit
      status must be green, and a red one blocks the merge with the failing step named.
      Turn ends on a branch stay unblocked.
  (b) A FAILURE BEFORE THE VERDICT STEP IS NOT A GREEN. `checkout` and `setup-node` carry
      no `id`, so if one fails soft on a branch, every later step — including
      `node scripts/ci-gate-verdict.mjs`, whose file was never checked out — fails soft,
      every output stays empty and the run reports a clean green with no status, no summary
      and no alert. Rare (GitHub-infra transients only) and therefore cheap to close: the
      verdict invocation gets a shell fallback that emits `failed=true` plus a
      `verdict-unavailable` step name when the script cannot run at all.
  (c) THE UNUSED FIELD GOES. `ci-gate-verdict-core.mjs` computes `protectedRef` from the
      imported `PROTECTED_REF` and pins it in tests, but nothing consumes it — the mail
      decision is `!isSoftRun(…)`, which is correctly BROADER (tags, dispatch, PRs). An
      unread field that looks authoritative is what a later reader will reach for. Drop it
      with its pins, or consume it and say where.
  ALSO RECORDED, no work: a job-level failure (the 15-minute `timeout-minutes`, a dead
  runner) fails past every `continue-on-error`, concludes `failure` and still mails. That
  is the safer direction for a hang and stays as it is — the docs simply do not claim
  otherwise.
  VERIFIABLE: (a) a merge attempt with a red `ci/gate (branch)` on the branch head is
  refused and names the failed step, a green one passes, and a turn end on that same red
  branch is NOT blocked; (b) a workflow run whose verdict script is unavailable reports
  `failed=true` with `verdict-unavailable`; (c) a repository-wide search finds no reader of
  `protectedRef`. Pure Vitest for each.
  Criticality: medium — (a) is the one that can let a real regression reach `main`.

- [ ] 563. THE TAG FRAME'S NEW READABILITY JUDGE HAS THREE SOFT SPOTS (four-eyes
  review of point 524 by the second model, 08.08.2026, verdict merge; bundle
  Testinfrastruktur). `scripts/verify/tagFrameReading.mjs` decides whether the
  village-tag evidence frame readably shows both children, and it was accepted as
  correct — its 67 px floor is genuinely derived from the figure's own geometry and
  its Vitest pin goes red without a browser. Three findings are recorded rather than
  fixed in that merge, because none of them is the failure the point closed and each
  needs its own measurement.
  FINAL STATE:
  1. THE OCCLUSION BAND STILL ADMITS A HUGGING OCCLUDER. A hit is counted as the
     child itself while it lies within ±15 % of the child's distance, so a surface
     roughly 0.8 m in front of the pair at a 5.5 m stand reads as the child at every
     sample: `occluded` stays 0 and `confirmed` reaches 5 while a human sees a rock.
     The probe names what it hit (`hitName`), and the verdict uses that name — a
     sample confirms the child only when the thing hit IS the child — so the distance
     band stops being the sole evidence of identity.
  2. THE FLOOR IS TIED TO A GEOMETRY NOTHING PINS. `KID_HEIGHT` and `KID_BODY_WIDTH`
     mirror the rendered figure (`src/scenes/place/PlaceLife.tsx`, `src/render/
     figures.ts`) by hand; a future change to the figure silently invalidates the
     derived 67 px without any test noticing. A Vitest sync test derives both from
     the figure source and fails when they drift apart — the same shape as the
     existing quality-doc sync test.
  3. A RED RUN NAMES THE WRONG STANDPOINT. In `scripts/verify/polish.mjs` the
     diagnostic calls its report the "best read" while the variable it prints is
     overwritten by every failing bearing, so a red run hands the reader the LAST
     bearing tried instead of the best one seen — the reader then investigates a
     standpoint that was never the near miss. The reported reading is the best one
     by the judge's own ranking, or the message says plainly that it is the last.
  VERIFIABLE: pure Vitest — a reading whose confirming hits are all a foreign object
  is rejected (1); the sync test fails on a deliberately altered figure constant (2);
  the diagnostic picks the best of a series of failing readings, not the last (3).
  No browser run is needed for any of the three.

- [ ] 564. "CANDIDATE REAL FAILURE" IS ASSERTED WITH CONFIDENCE THE RUN DID NOT EARN
  (measured 08.08.2026, 18:22Z). The retry classifier calls a check that fails in BOTH
  runs a "CANDIDATE REAL FAILURE" and names the diff words it touches — here `polish`
  "settlement walker (goat): the planted foot holds its ground spot (point 300)", twice,
  with the note "[touches the diff: goat, foot, hold, point]" against a change that only
  attached a metadata field to that group. Re-run on a quiet machine 100 minutes later,
  same code: `polish` 164 pass, 0 fail, FIRST try. The failure was machine load, and the
  classifier had already said so in its own log — the point-296 quiet-machine check ran
  at the top of that same run and reported "MACHINE STATE UNKNOWN: GPU load NOT measured
  (no GPU busy counter on this host)". The two verdicts never meet.
  WHY THE HEURISTIC IS WRONG HERE, precisely: it reads a repeated failure as evidence of
  a real defect because a FLAKE is assumed to rotate. Load does not rotate — a check that
  measures a RATE (frames, stance intervals, settling) fails deterministically for as long
  as the machine is busy, so the very checks most likely to be load-victims are the ones
  the heuristic is most confident about. The diff-word match compounds it: matching on
  "goat, foot, hold, point" against a spec that contains those words is a coincidence
  detector, not evidence.
  FINAL STATE:
  1. The classifier's verdict CARRIES the machine reading it was made under. Where the
     quiet-machine check reported UNKNOWN or LOADED, a twice-failing check is reported as
     UNDECIDED — "failed twice, but the machine could not be shown to be quiet; re-run on
     a quiet machine before believing this" — never as a candidate real failure.
  2. The rate-sensitive checks are MARKED as such where they are defined (the same set
     point 506 already names for the software lane), and the classifier says so when one
     of them is the twice-failing check.
  3. The diff-word match is reported as what it is: a word overlap, not a causal link. It
     may not appear at all in an UNDECIDED verdict, where it reads as corroboration.
  VERIFIABLE: pure Vitest over the classifier — the same twice-failed input yields
  CANDIDATE REAL FAILURE under a measured-quiet machine and UNDECIDED under an unknown or
  loaded one; a rate-marked check is named as rate-sensitive in the verdict; and the
  diff-word list is absent from an UNDECIDED verdict.

- [ ] 568. THE POLISH WATER-SAMENESS CHECK ROTATES ITS VERDICT (measured 09.08.2026 by
  the agent delivering point 557, on WebGL 2, with the world seed pinned to 42 at the
  launcher; bundle Testinfrastruktur). Step 13.8 of `polish` — "the water beyond the
  plate's rim is the SAME water as the water at the bank (≤ 12/255)" — went RED on the
  first run with samples 13.8, 12.1 and 19.3 straddling the limit, and fully GREEN on a
  second run at the IDENTICAL commit and the IDENTICAL seed (164 PASS, 0 FAIL). The seed
  work is not the cause: `polish` was seeded 42 before and after, so the world it walked
  was the same both times. What rotates therefore sits BELOW the layout — the water
  shading itself, or the moment the sample is taken.
  WHY IT MATTERS BEYOND THE FLAKE: point 549 pinned the seed precisely so a red could be
  believed. A check that still rotates on a fixed world is the next layer of the same
  problem, and it sits on the everyday gate where it costs a rerun every time.
  FINAL STATE: the cause is IDENTIFIED before anything is tuned — the two candidates are
  a genuine frame-timing dependence (the sample taken before the water material has
  settled, in which case the check polls on the app's own clock rather than a fixed
  wait) and a real shading seam at the plate rim that only sometimes exceeds the
  tolerance (in which case it is a PRODUCT defect and the check is right to fire). The
  tolerance is NOT widened to make the red go away until it is established which of the
  two it is; if it is the product, the water fix comes first and the check stays.
  VERIFIABLE: the check runs ten times on the pinned seed with the same verdict every
  time, and whichever cause was found is named in the commit message with its evidence.
  Criticality: medium — it does not itself hide a product defect, but it may BE one, and
  it erodes the trust in a red that point 549 was built to restore.

- [ ] 570. THE CHILDREN-PHOTOGRAPHABLE CHECK REDS ON THE PINNED WORLD (measured
  09.08.2026 on `main` at 3e33ff83, WebGL 2, immediately after point 557 pinned the world
  seed at the launcher; bundle Testinfrastruktur). `polish`'s check "the game is
  photographable: both children read whole, apart and at least 67 px tall, unoccluded,
  WITH the village behind them (point 524)" went RED. Point 524 is CLOSED, so this red
  belongs to nobody: it is either a regression against a criterion the project already
  accepted, or a check that was never stable and only looked stable because every run
  walked a different world.
  WHAT THE EVIDENCE SAYS SO FAR: the point-557 agent ran `polish` twice on the same
  change and this check passed BOTH times; the first run on `main` failed it. So it is
  not simply "the pinned world puts the children out of view" — that would fail every
  time. Two candidates remain: a genuine intermittency in where the children are placed
  or when the frame is taken, and a load sensitivity (the failing run shared the machine
  with a finishing agent).
  FINAL STATE: the cause is ESTABLISHED before anything is tuned — run the check ten
  times on the pinned seed on a QUIET machine and record how many pass. If it fails
  consistently, the children's placement regressed against point 524 and the PRODUCT is
  fixed; if it rotates, it joins the staging-settle family of point 200 and is fixed the
  same way (poll on the app's own clock, never a fixed wait). The threshold (67 px,
  unoccluded, village behind) is NOT relaxed to make the red go away — it is the wording
  point 524 was accepted against.
  MEASURED FURTHER THE SAME MORNING, and it shifts the odds: across four `polish` runs on
  09.08.2026 the suite failed with THREE DIFFERENT pairs of checks and passed twice — the
  children pair, then the water check alone, then two `giza (wet)` checks, then two clean
  runs (WebGL 2 exit 0, WebGPU exit 0 on the retry). So the children check is most likely
  another member of the rotating staging family of point 200 rather than a regression
  against point 524. It is NOT ruled out — the ten-run measurement below still decides —
  but expect the staging fix, not a product fix.
  VERIFIABLE: ten consecutive runs on the pinned seed with the same verdict, and the
  cause named in the commit message with its evidence.
  Criticality: medium — it may be a real regression against a closed criterion, and until
  it is owned it blocks every render-set change from ever recording a covering run.

- [ ] 265. ELDERLY (GERIATRIC) ANIMAL VARIANTS — an OLD version of each suitable
  species, visibly aged AND behaviourally distinct, plus natural death of old age
  (user 23.07.2026). PRIORITY/POSITION: queued BEFORE point 203 (do this content
  feature before the 203 visual bug-finder). RESEARCH FIRST (a standalone Fable pass,
  no code, safe to run in parallel): realistic geriatric APPEARANCE and BEHAVIOUR for
  the game's fauna (the savanna grazers, elephants, the predators) and a realistic
  natural-DEATH process — recorded, cited, in a new `docs/fauna-behaviour-1890.md`
  (matching the citation/marker discipline of `docs/peoples-1890.md`; if a fauna doc
  already exists, extend it). What to establish: the visible senescence cues (thinner/
  sway-backed body, duller/greyer or worn coat, prominent shoulder/hip bones, worn or
  broken tusks and sunken temples on old elephants, a stiffer/limping gait); the
  behavioural shifts (moves slower; old males ousted from the herd and turning
  SOLITARY — the classic old buffalo/elephant bull; withdrawal from intraspecies
  contests: an elder no longer INITIATES a §264 fight and always LOSES to a younger
  adult, fleeing an impending conspecific conflict); and the real basis for a
  "dying" pattern (an old elephant's last molars wear out, so it seeks soft forage
  near water/marsh and dies there — the grounded kernel the §4.4 "elephant graveyard"
  folklore romanticizes; vultures do gather around a visibly dying/weak animal). Add
  any further fitting, game-appropriate geriatric traits the research turns up. BUILD
  (per the research): (a) APPEARANCE — an elderly-adult build schema analogous to the
  point-169 baby schema (`buildLionCub`/the grazer calves) in `src/render/fauna.ts`
  (`buildElderly*`/an age flag on the adult build): clearly-old cues per the research,
  pure-tested for its proportions/part markers like the calf schema. (b) BEHAVIOUR —
  pure helpers in `src/scenes/travel/wildlifeBehavior.ts`: an elderly adult moves at a
  calibratable reduced speed factor, never initiates §264 intraspecies combat and
  ALWAYS loses to a younger adult (the §264/§125 outcome matrix returns the elder as
  loser; the elder flees an impending conspecific conflict), and — for GRAZERS and
  the big cats (NOT elephants) — an ousted old male withdraws from the herd/pride and
  turns solitary (per `docs/fauna-behaviour-1890.md`: old elephant BULLS keep high
  status, so no ostracism for them; the crocodile gets NO elderly variant — no legible
  aged cues). (c) NATURAL DEATH — an elderly animal occasionally dies with NO external
  cause, at a calibratable low rate; the DYING PROCESS is depicted (`Wildlife.tsx` + a
  pure state helper): the animal slows progressively, the §19.6/§22 poor-condition
  vultures GATHER over it and descend as it collapses (the ground-truth reuse of the
  pt-22 omen — the "patient circling of a doomed animal" is embellished, so key the
  flock on the distressed/downed animal, not a long pre-death circle), it falls dead,
  and the vultures consume it through the existing carcass system. An ELEPHANT that
  begins dying instead drifts toward WATER (its worn last molars can no longer grind
  coarse forage, so it seeks soft riverside/aquatic vegetation) and dies THERE — the
  REAL mechanic per the research; the §4.4 elephant graveyard is framed as WHERE these
  water-side deaths accumulate (folklore landmark + accurate mechanic coexisting), and
  the mass death-pilgrimage is MYTH and is NOT built. (d) CALIBRATION — the elderly fraction of adults, the elderly speed
  factor, the natural-death rate, and the dying-slowdown duration are `balance.ts`
  values, debug-editable (§21). Ties to point 264 (the elder always loses a fight),
  point 169 (the analogous age schema), §4.4 (the graveyard death) and §19.6 (the
  vultures). VERIFIABLE: pure tests (`src/render/fauna.test.ts` — the elderly schema's
  aged proportions/markers, built alongside the calves; `src/scenes/travel/
  wildlifeBehavior.test.ts` — elderly speed factor strictly below the adult, elder
  never initiates and always loses §264 combat, the natural-death roll boundaries, the
  dying-slowdown curve, and the elephant-dying-target picking the graveyard); a live
  check in `scripts/verify/enrichments.mjs` (a forced elderly natural death: slows →
  vultures circle → falls → consumed; a dying elephant heads to the graveyard) with a
  screenshot, picture-verified on BOTH backends. DOCS: `docs/fauna-behaviour-1890.md`
  (research, in the SAME branch/commit as the build it informs), design.md §19 (a new
  subsection: elderly variants, their behaviour, natural death and the elephant
  graveyard death), the balance values. Any new sighting/death journal text in BOTH
  languages with voice markup. NOTE: heavy `wildlifeBehavior.ts`/`Wildlife.tsx`/
  `fauna.ts`/`balance` overlap — do NOT delegate the BUILD concurrently with another
  wildlife point; the RESEARCH half and the pure schema/behaviour helpers (in new
  files) can start in parallel, the scene wiring waits for the wildlife cluster to be
  free. Implementation-ready.

- [ ] 269. BIRDS FLEE BY FLYING + REGION-APPROPRIATE AERIAL PREDATORS (research-gated)
  (user 23.07.2026). Two linked additions, BOTH gated on a Fable research pass first.
  (A) FLIGHT-CAPABLE BIRDS ESCAPE BY FLYING: every bird species that can fly gets a
  GROUND (perched/sitting/feeding) state and an IN-AIR (flying) state; when it flees a
  ground predator (or an approaching elephant) it TAKES OFF and flies, which puts it
  OUT OF REACH of ground predators and elephants (they can no longer catch it in the
  air). A ground predator can catch a bird ONLY if it SURPRISES it while the bird is
  still ON THE GROUND (took off too late) — an airborne bird is safe from ground
  hunters. So the existing bird fauna (the shore/scavenger birds, the plover, vultures,
  etc.) needs the ground↔air state and a takeoff-on-flee transition.
  (B) AERIAL PREDATORS (research settled — docs/fauna-behaviour-1890.md §B): add
  region-appropriate FLYING predators (raptors) that hunt prey birds and catch them IN
  THE AIR, per the researched per-region table (§B2.1): falcons (peregrine/lanner/
  barbary) and the two hawk-eagles (African, Ayres's) attack by a STOOP/DESCEND, while
  the accipiter/harrier/fish-eagle majority use an air-catch tail-chase or an ambush
  from cover (no height). The stoop is BUILT — but as a SCRIPTED "descend-and-strike"
  EVENT (the raptor enters high, plunges onto a flying bird, strikes, resolves), NOT a
  persistent 3D flight-height simulation (the research explicitly warns against a full
  altitude-band layer, since most raptors don't use height). So there is at most a
  simple two-state high/low for the stoop event itself, not a per-bird altitude field.
  RESEARCH FIRST (Fable pass, docs-only, extend `docs/fauna-behaviour-1890.md`): which
  African raptors/aerial hunters (~1890, by region) take BIRDS as prey; their hunting
  mode (stoop/dive vs. tail-chase), typical prey birds, whether flight-height layering
  and a surprise-from-above are realistic, and whether "a ground predator only gets a
  bird caught on the ground" matches real behaviour. Produce a cited per-region aerial-
  predator + prey-bird table with the same PERIOD/INFERRED/MYTH markers, and a short
  "Implementation brief" (§B4 — already delivered; the research half is DONE). BUILD
  (after the wildlife cluster is free): the bird ground/air state machine +
  takeoff-on-flee (pure flee helpers in `src/scenes/travel/wildlifeBehavior.ts`, wired
  in `src/scenes/travel/Wildlife.tsx`) — with the researched fly/no-fly split (small
  birds and flamingos fly to escape, the flamingo with a laborious running take-off as
  a vulnerable window; plover CHICKS crouch/freeze and can be caught, the adult flies
  and does the broken-wing distraction); the aerial-predator species (build in
  `src/render/fauna.ts`, seeded from a new region-keyed aerial-predator pool per §B2.1)
  with an air-catch tail-chase for the ambush guild and the SCRIPTED descend-and-strike
  for the falcon/hawk-eagle guild; ground predators lose the airborne target. Reuse the
  existing hunt/flee/carcass machinery; every started drama resolves (I4). All
  calibratable (takeoff trigger distance, the stoop's high/low band, dive chance/speed,
  aerial-hunt rate) and debug-editable. VERIFIABLE: pure tests — a fleeing bird
  transitions to air and a ground predator's reach excludes an airborne bird while a
  still-grounded (surprised) one is catchable; the aerial predator's air-catch and (if
  built) the height-gated dive; region pools sane. Live check / screenshot: a forced
  ground-predator approach makes birds take off and escape, and (if built) an aerial
  predator stoops on a flying bird — on BOTH backends. DOCS: `docs/fauna-behaviour-1890.md`
  (research); design.md §19 (bird flight escape + aerial predators). Any new
  sighting/journal text both languages with voice markup. NOTE: wildlife-render/behaviour
  cluster (Wildlife.tsx/wildlifeBehavior.ts/fauna.ts) — the RESEARCH runs in parallel
  now; the BUILD waits for the cluster to be free and does NOT run concurrently with
  another Wildlife.tsx point. Implementation-ready once the research lands.

- [ ] 310. LOW-PRESET PERFORMANCE PASS FOR TWO OPPOSITE DEVICES (user 25.07.2026,
  recalibrated 06.08.2026). LOW must run WELL on a weak Windows desktop AND on the
  Galaxy S25 — one preset, two opposite bottlenecks, which is the whole difficulty
  of this point.
  INPUTS — REAL F8 REPORTS. `local/hoa-bench-2026-08-03-webgpu-kohler.json` (WEAK
  Windows desktop, AMD RDNA-3, WebGPU with real GPU timestamps, production build
  2b6b417, 2195x1235 at dpr 1.75, deposited by the user 06.08.2026) is what this
  point is CALIBRATED against, being the slowest machine measured. It is NOT the
  user's own PC — that one runs MEDIUM acceptably, and its occasional stutter is
  explicitly not part of this point. `local/samsung-s25-bench.json` (Galaxy S25,
  Adreno 8xx) is the second target. `local/m1pro-bench.json` is CONTEXT ONLY: it
  predates the LOW preset and its absolute GPU milliseconds aggregate passes — judge
  that machine on its FRAME series and on ratios between its own configs.
  NO SECOND RUN IS AVAILABLE (user 06.08.2026): the weak PC is a third party's and
  cannot be re-measured, so plan no step that needs a fresh run on a user machine.
  Everything needed is in the deposited report — real GPU timestamps, eleven
  ablation configs, per-system triangle and mesh counts per phase.
  WHAT THE TWO DEVICES SAY.
  - DESKTOP: the default (medium) preset is unplayable — 17.9 / 12.7 / 13.1 fps at a
    GPU median of 45.22 / 68.35 / 65.93 ms. LOW holds 60 fps with almost no headroom
    in the desert: GPU median 14.81 ms of the 16.70 ms budget (89 %), 95th-percentile
    frame 33.7 ms — every twentieth frame is dropped. Savanna 8.65 ms, driving
    9.63 ms (p95 frame 33.1 ms); CPU 5.20 / 7.70 / 6.80 ms.
  - S25: LOW GPU 9.83 / 8.72 / 6.95 ms against a CPU of 8.70 / 7.50 / 7.60 ms. The
    CPU sits AS HIGH AS the GPU, so a pixel cut alone buys the phone little — this is
    where the behaviour-throttling and instance-count levers pay.
  THE DECISIVE READING — THE LOW FRAME IS PIXEL-BOUND, NOT TRIANGLE-BOUND. At LOW the
  desert draws 542,748 triangles in 55 calls for 14.81 ms while the savanna draws
  1,008,904 triangles in 58 calls for 8.65 ms: nearly double the geometry at 58 % of
  the cost. The ablations agree — from dpr 1.75 to dpr 1 the pixel count falls 3.06x
  and the GPU time 2.77x / 2.91x / 3.10x, almost exactly in step. This governs the
  ORDER of the delivery: the dpr cap is the primary lever, and the triangle levers
  below must never be reported as the fix for the desert phase, whose share figures
  are shares of TRIANGLES, never of milliseconds. The constant 425,118-triangle /
  180-mesh system is 78 % of the desert frame at LOW on this second device and
  backend too, and travel-dressing is 53 % of the savanna frame (531,058 tris),
  matching the S25.
  SALVAGED IDEA (25.07, from the retired `feat/276-wildlife-lod` branch — see point
  329): throttling the BEHAVIOUR updates of off-screen animals cuts the driving
  frame cost. The branch itself was retired unmerged (219 commits behind main, its
  three files moved on 16/9/1 commits since), but the lever is sound and belongs
  here: update animals outside the rendered frame at a reduced rate (projected via
  the shared `isOnScreen`, never an assumed radius — the point-172 rule), keeping
  every §19 drama deadline in sim time so no drama stalls. Judge it on the CPU
  series, where both devices sit at 5-9 ms at LOW.
  DIAGNOSIS DONE (25.07, main session): the unnamed 425k system IS the river/lake
  water geometry — `src/scenes/travel/Rivers.tsx` mounts the ribbon mesh and every
  lake sheet with NO `name` prop (around the `<mesh geometry={geometry}
  material={riverMat}>` / lake map), so `groupKey` in src/systems/benchmark.ts falls
  back to the material name `MeshStandardNodeMaterial`; the courses are global and
  biome-independent, which explains the constant count in every phase. Deliver:
  (a) NAME those groups (and any other unnamed one) so the F8 report attributes
  every system, (b) a LOW flora/dressing DENSITY lever (calibratable
  instance-count factor on top of the existing floraFogFactor radius cut — the §19.9
  dressing keeps reading as savanna, only thinner), (c) a LOW geometry lever for the
  identified 425k-tris system (e.g. coarser river-ribbon tessellation on LOW if it is
  the water — every §11.3 continuity/never-buried invariant must keep passing), (d) a
  calibratable `dprCap` BELOW 1 on LOW itself (starting value 0.8 = 0.64x the pixels,
  which projects the desert's 14.81 ms near 9.5 ms) — the primary lever, not a
  last resort, and the touch preset stays a SUBSET of low. EVERY new lever gets
  entries in ALL THREE QUALITY_PRESETS levels (the src/config/quality.test.ts
  completeness gate and the docs/graphics-detail-levels.md sync test enforce this),
  stays debug-tunable within its level, and reads through the point-276
  effective-selector pattern. The delivery must move BOTH the pixel cost and the
  CPU/instance cost: a LOW that only cuts dpr fixes the desktop and leaves the phone
  where it is. VERIFIABLE: pure tests for each new preset key; the §11.3/§19 suites
  stay green at LOW (ribbon continuity, dressing-streaming no-pop projection checks);
  picture checked on BOTH backends at LOW; and the price check in this order —
  FIRST hardware-independent arithmetic against the deposited numbers (the rendered
  pixel count and the per-system triangles the new levers remove, with the desert's
  14.81 ms projected to 10 ms or below by the measured pixel-to-time
  proportionality), THEN a before/after F8 run of the SAME three phases at LOW on the
  project's own verification host, whose absolute milliseconds mean nothing but whose
  RELATIVE drop must confirm the projection rather than contradict it — without a
  visual regression the user rejects.

- [ ] 315. THE SPHINX IS REBUILT FROM SCRATCH, FAR MORE ELABORATE (user 28.07.2026,
  superseding every earlier display report about it — the flicker, the shape and the
  half-buried read are all answered by the new model, not by patching the old one). The
  user's verdict on the deployed build: "die Darstellung der Sphinx gefällt mir allgemein
  nicht … man kann sie kaum als Sphinx erkennen", and the screenshot shows why — a stack
  of plain boxes with a slab on top, reading as a gate or a table, at a monument every
  player recognises on sight. The FIRST-PERSON view is what matters most; the bird's-eye
  landmark and the §2.5 skyline silhouette are named as "auch nicht schön" and are part of
  the same job.
  THE TARGET: a Great Sphinx that is recognisable at a glance from any standpoint a player
  can reach, and worth walking up to — a couchant lion body with the forepaws stretched
  forward, a human head in the nemes headdress with its brow band and the folded lappets
  falling to the chest, the broken nose and the missing beard of the real monument, the
  chest between the paws, and the weathered horizontal banding of the limestone courses.
  It is the one built landmark in the game with a FACE; it must not be the crudest.
  ACCURACY AND RECOGNISABILITY, and how to hold both: `docs/giza-1890.md` records the
  ~1890 state — the body buried to the shoulders, only head, neck and upper back standing
  clear, which is exactly what makes the current model unreadable. Do NOT dig it out; the
  period state is researched and stands. Buy the recognisability from DETAIL and from the
  drift's own shape instead: the emergent head carries the nemes, the face and the neck at
  a resolution that reads from across the site, and the sand mound is modelled as a body
  UNDER sand — a long couchant swell with the shoulders' shape showing through and the
  back ridge breaking the surface — rather than a heap beside a box. A player who has
  never seen the site must be able to say "that is the Sphinx"; a player who knows it must
  find the 1890 burial line where the photographs put it. If, once built, those two
  genuinely cannot be reconciled, say so with the pictures rather than quietly abandoning
  either — the choice is then the user's.
  ALL THREE SCALES, one model, three levels of detail: (a) FIRST-PERSON at the site, the
  full model; (b) the BIRD'S-EYE landmark, seen from above and far — the silhouette from
  that angle is what carries it, so the paws, the body swell and the head must be
  distinguishable at the travel scale rather than a lump; (c) the §2.5 SKYLINE silhouette
  from Cairo (point 82), where only the outline exists and it must still read as a
  crouching figure with a raised head. Derive them from ONE definition so the three cannot
  drift apart, the way the Giza plateau's two records did (point 338).
  COST IS PART OF THE JOB: the site model may be elaborate, but it is drawn every frame at
  a place the player stands in. Sort it into the quality levels like every other optical
  feature (§21, `QUALITY_PRESETS` in `src/config/quality.ts`) — a fuller mesh on high, a
  reduced one on low — and report the measured frame cost at the site on BOTH backends at
  LOW and at MEDIUM. A level that cannot afford the full mesh gets the reduced one, named
  and tested, never a silent downgrade.
  WHAT THIS REPLACES: the old spec asked for a mound envelope and blamed a coplanar sheet
  for a flicker at the body's base. Both die with the old geometry — but the flicker is
  still the sharpest acceptance signal available, so the live check MOVES the camera
  rather than taking one still, and no z-offset may be used to hide a fight that the new
  model should not have.
  VERIFIABLE: pure Vitest on the shared definition — the three levels of detail come from
  one source, the burial line matches the documented ~1890 state, head and upper back
  stand clear of the drift while every other body part sits below it, the drift's
  footprint does not exceed the body's by more than its skirt, and the collidable mass
  still matches the drawn body (point 378's rule). Live on BOTH backends: a screenshot SET
  from several standpoints inside the site — face on, in profile, from behind, and one low
  enough to look along the drift — plus the bird's-eye landmark and the Cairo skyline
  frame, judged by the picture; and a moving-camera pass that shows no flicker anywhere on
  the model.
  DOCS in the same commit: `docs/acceptance-evidence.md` §15/§25 gain the chain, and
  `docs/graphics-detail-levels.md` the new per-level entries.

- [ ] 391. THE GIZA MONUMENTS STAND AT A MONUMENTAL SCALE IN THE FIRST-PERSON VIEW (user
  28.07.2026). Standing on the plateau, the pyramids and the Sphinx must read as GIANTS —
  markedly larger than today, so that a person at their foot is a speck against them. The
  stated reason is a planned later feature and belongs in the record: the user intends a
  secret entrance, found by deciphering hints from inhabitants, that leads into a further
  first-person scene INSIDE the monument, where more clues to the treasure wait. Entering
  is only plausible if the outside is big enough to hold an inside. THAT FEATURE IS NOT
  BUILT HERE — this point delivers the scale it needs, nothing more; no entrance, no
  interior scene, no hint chain.
  WHAT TO CHANGE: the site-scale geometry in `src/scenes/place/gizaSite.ts` (the pyramid
  cones and the Sphinx). Take the REAL proportions as the yardstick — the Great Pyramid
  stood ~146 m tall on a ~230 m base, the Sphinx ~20 m tall and ~73 m long — and state in
  the commit what fraction of real scale the site now uses and why. The eye height is
  1.5 m (§20), so the numbers decide the feeling: from the base, the apex must be far
  above the top of the frame at the default field of view.
  WHAT IT COLLIDES WITH, and none of it may be broken quietly:
  · the WALKABLE RADIUS (point 390) — bigger monuments need more ground to be seen from,
    and both points touch the same site. Work them on ONE branch, 390 first: the radius is
    measured against what the picture offers, and the picture changes here.
  · the SPHINX MODEL (point 315) — same file, same monument. Whichever lands second
    rebases on the first; do not build the new Sphinx twice at two sizes.
  · the COLLIDERS must follow the drawn masses, not the old ones (point 378's rule: the
    collider is derived from the placement the renderer draws). This is a REPORTED bug the
    user ruled belongs here rather than in a point of its own (dump
    `hoa-state-2026-07-29-4196407680`, Giza, WebGPU, medium: the traveller walks into the
    pyramid). Root cause, already measured — do not re-analyse: `gizaColliders`
    (`src/scenes/place/gizaSite.ts`) uses only the cone footprint
    (`pyramidFootprint` = base/√2), while the DRAWN masses reach further —
    Khafre's bedrock plinth to 1.14·base and Menkaure's granite skirt to 1.02·base
    (`gizaSitePyramidParts` in `src/render/landmarks.ts`).
  · the PLACE MAP inside Giza is EMPTY (second dump, same seed, `mapOpen: true`,
    `mode: place (giza)`), and it is fixed here. Measured cause: `MapOverlay`'s `PlacePlan`
    (`src/ui/MapOverlay.tsx`) draws the layout's buildings, dwellings and lanes, but
    `buildGizaLayout` leaves `interactives`/`dwellings`/`paths`/`rocks` empty — the
    monuments exist ONLY as colliders, which the plan does not read. Fix it GENERICALLY
    over `layout.colliders`, so a future monument-like place inherits a drawn plan instead
    of the same blank sheet, with a Vitest case that the Giza plan is non-empty.
  · the BACKDROP and panorama (points 181/381) — a taller monument may now rise past the
    ground line the silhouettes stand on; the seam checks in
    `src/scenes/place/backdrop.test.ts` must still hold.
  · the BIRD'S-EYE landmark and the Cairo SKYLINE (point 82) are a DIFFERENT scale and are
    NOT enlarged by this point — check that they are unchanged, and say so.
  VERIFIABLE: pure Vitest on the site geometry — the pyramid height and base, and the
  Sphinx length, sit at the stated fraction of the real proportions, and the collider set
  matches the drawn masses. Live on BOTH backends: a first-person frame from the base of
  the great pyramid looking up (the apex out of frame is the point), one from the site
  centre showing all three, and one at the Sphinx — judged by the picture, plus the
  measured frame cost at LOW and MEDIUM.
  DOCS in the same commit: design.md §4.4 states the monumental first-person scale and
  names the planned interior as an OPEN idea, not a promise. design.md sits at its
  measured ceiling, so the sentence is paid for by a measured raise with its justification
  in `scripts/doc-budget-core.mjs`, or by shortening elsewhere — the guard decides, not a
  round number.

- [ ] 320. SPRINGS AS REAL 3D BUBBLING WATER (user 25.07.2026: the springs still
  read as a mere symbol — animated now, but flat; they should LOOK like a spring
  with water bubbling three-dimensionally). Rework the §11.3 spring depiction at
  travel scale into a small 3D water feature. ANCHOR (25.07, main session): the
  current spring is built in `src/scenes/travel/Rivers.tsx` as a stack of FLAT discs
  — circle meshes rotated `-Math.PI / 2` (the pool, a damp-ground ring and the
  animated ripple), which is exactly why it reads as a symbol however it animates.
  Replace that stack with: a low dome/upwelling mesh whose
  surface visibly bubbles (TSL displacement/normal animation — renderer-agnostic,
  both backends), a bright welling centre with concentric ripple rings, a small
  wet pool/outflow meeting the terrain (no floating disc, no billboard), sized to
  read at the default zoom 0.5 without dominating. Calibratable size/intensity
  under balance (debug-editable); quality-level entries for ALL THREE
  QUALITY_PRESETS (the completeness gate enforces this) — LOW may use a cheaper
  variant but the feature stays visible. VERIFIABLE: the existing "at least one
  spring" check extended: the spring mesh is 3D (non-flat bounding box), its
  surface animates over sim time (vertex/pixel delta between two sampled frames at
  the spring, both backends), and it sits ON the terrain (no gap/clip at the rim —
  ray/heights check); screenshot pair added to the §7.2 evidence set; the picture
  judged on BOTH backends per the render rule.

- [ ] 322. STAGED-EVENT FAILURES ARE EASY TO MISS (user 25.07.2026: staging "calf
  mired at waterfall" appeared to do nothing; the user later suspected an unseen
  error message). Make every debug stage/trigger outcome UNMISSABLE: a persistent,
  clearly styled result banner — success names what was staged and where, failure
  names the missing precondition in plain language ("no waterfall within reach —
  jump to a waterfall first") — staying until dismissed or superseded, both
  languages. Also RE-CHECK the mired-at-waterfall staging itself against a
  realistic debug session: if its precondition search radius is too small, widen it
  or teleport-stage like the other dramas. VERIFIABLE: pure test of the
  outcome→message mapping (every stageable event has success AND failure text in
  both languages, no silent path); settings.mjs live-checks the banner on an unmet
  precondition and a successful stage; both languages.

- [ ] 327. TWO NEARBY CARCASSES MUST SHARE ONE VULTURE FLOCK (user 25.07.2026: a
  second flock spawns and the two overlap). Give the §19.6 flock a claim over a
  carcass CLUSTER: a new carcass within a calibratable radius of a flock's current
  target joins that flock's queue instead of drawing a second flock, and the flock
  works them in turn, leaving only when the cluster is done. No two flocks may be
  active within the cluster radius. VERIFIABLE: pure test of the cluster claim (a
  carcass inside joins, one outside draws its own flock; boundary exact); live
  check with two staged carcasses close together — exactly one flock, both eaten,
  no overlap; both backends.

- [ ] 328. VULTURES DO NOT VISIBLY LAND (user 25.07.2026: "they seem to fly one
  moment and stand the next — is there a landing at all?"). Add a real landing
  approach to the §19.6 flock AND the lone ground scavenger: a descending glide
  along the approach heading with slowing forward speed, a flare with raised wings
  just before touchdown, then the standing pose — over a calibratable window long
  enough to read at bird's-eye distance; likewise a visible take-off (run/flap into
  the climb) instead of an instant switch to flight. VERIFIABLE: pure test of the
  landing profile (height decreases monotonically to the landed height across the
  window, forward speed decreases, the flare pose fires in the last phase); live
  check that a landing bird's sampled height passes through intermediate values (no
  single-frame snap) while the point-128 "stands on its own ground" clearance still
  holds; screenshot of the flare; both backends.

- [ ] 343. THE SUN STANDS WHERE IT REALLY STOOD — ELEVATION FROM DATE AND LATITUDE
  (user 25.07.2026; design.md §2.7 states the target). Today `SUN_DIR` is a hard
  constant in BOTH scenes — `[0.5, 0.62, 0.38]` in `src/scenes/travel/TravelScene.tsx`
  and `[0.52, 0.68, 0.34]` in `src/scenes/place/PlaceScene.tsx`, an elevation of ~45°
  for the whole continent and the whole five-year window. The season only dims and
  reddens it. That is why the relief reads flat: at that angle a 3000 m massif throws
  ~3 km of shadow, about ONE DEM texel.
  TARGET: derive the sun's elevation and azimuth from the real solar geometry —
  declination from the DATE (the same date that drives §19.13) and the traveller's own
  LATITUDE — at a FIXED local solar hour. There is no time of day in this game and
  none is being added; the hour is a calibratable constant, `balance.sun.hour`,
  DEFAULT 16:00. That default is load-bearing and must not be "tidied" to noon: at
  local noon the sun stands 90° over the equator in March and 83° over Cairo in June,
  which casts no usable shadow at all, while at 16:00 the elevation runs about 7°-37°
  across the entire map and year (Cairo 37° June / 11° December, Cape Town 9° in its
  June winter). One hour later breaks it — at 17:00 the Cape sun in June is BELOW the
  horizon, and a fixed hour must never put the sun under the horizon anywhere in the
  world window (lat -37..38, all 365 days).
  ONE DEFINITION, READ BY BOTH SCENES. The two constants above are not merely stale,
  they DISAGREE (~45° against ~48°) — the same sun stands at two heights depending on
  which view holds the camera. The derivation therefore lands in ONE place that travel
  and settlement both read; neither scene keeps a sun of its own, or they drift apart
  again the first time one of them is touched.
  EVERYTHING THE SUN FEEDS MUST FOLLOW IT, or the picture contradicts itself: the
  directional light AND its shadow camera in both scenes, the sky dome's disc and halo
  (`src/render/sky.tsx`, whose `sunDirection` must keep agreeing with the light — its
  own comment says so), and the baked environment light
  (`createEnvironmentTexture`/`IBL_SUN` in `src/render/Effects.tsx`), re-derived when
  the date or the position changes and NEVER per frame.
  THE SETTLEMENT IS THE STRICTER OF THE TWO (user 28.07.2026). Point 344's eye
  adaptation and sun glare build DIRECTLY on this angle, and at eye height a wrong sun
  is not a subtlety — it decides whether the traveller is dazzled turning west, and
  where every wall's shadow falls in a lane he walks through. The settlement sun is
  therefore derived from the SETTLEMENT's own latitude and the current date, never from
  a scene default, and the acceptance below judges it at eye height.
  AND THE JOURNEY MUST SHOW IT (user 28.07.2026). The bird's-eye view is where the
  change becomes legible: walking the continent from the Mediterranean to the Cape at
  one date, the shadows must visibly turn and lengthen as the latitude runs out — and
  the same place in June and in December must not look alike. A sun that is merely
  CORRECT per frame but whose change no traveller notices misses the point of this
  ticket; the live acceptance therefore measures a TRAVERSE, not only a single spot.
  THE SKY PRESETS ARE THE REAL WORK, not the arithmetic. They are authored for a high
  sun; a low sun under an unchanged noon-blue dome reads as a bug — the same failure
  the overcast handling already guards against (a dimmed sun under a bright blue sky,
  sky.tsx). The horizon must warm and redden as the sun drops. Judge this by the
  PICTURE on both backends, not by the uniform.
  WATCH THE SHADOW QUALITY at the low end: cascaded shadow maps degrade at grazing sun
  angles (long shadows, peter-panning, cascade seams). If the 7° end proves ugly, clamp
  the elevation used for the SHADOW camera to a calibratable floor while the visible
  sun keeps its true angle — and record that as a deliberate divergence, never silently.
  NOT A QUALITY LEVER: this is world model like the seasons and applies at EVERY
  graphics level. It adds no per-frame cost and gets no `QUALITY_PRESETS` key.
  DEBUG: the sun direction stays inspectable and the hour editable in the debug menu
  (§21.2), so a tester can walk the whole range without waiting for a date.
  VERIFIABLE: pure (`src/systems/`) — declination and hour angle produce the known
  elevations above (Cairo June/December, the equator at equinox, Cape Town June), the
  hemispheres invert across the year, and a SWEEP over the full world bounds × all 365
  days asserts the sun never falls to or below the horizon at the default hour (the
  17:00 counter-case is pinned as the witness that the bound is real); the azimuth is
  westerly in the afternoon for both hemispheres; and a NORTH-SOUTH SWEEP at one date
  returns a monotonically changing elevation, so the traverse below has something to
  show. Live (`scripts/verify/enrichments.mjs` + `polish.mjs`, BOTH backends,
  screenshots): the same place rendered in June and in December differs measurably in
  pixels and in shadow direction; a TRAVERSE of at least three widely separated
  latitudes at one date yields shadows whose measured direction and length differ
  between the stops — the check the user's "you should notice it while walking" asks
  for; inside a settlement, at EYE HEIGHT, the shadows agree with the sky-dome sun disc
  rather than pointing elsewhere; no console errors.
  DOCS: design.md §2.7 already states it; CLAUDE.md §7.1 point 14 gains the built
  behaviour when this lands.

- [ ] 344. EYE ADAPTATION AND SUN GLARE, HIGHEST QUALITY LEVEL (user 25.07.2026;
  design.md §2.7 states the target). BUILDS ON POINT 343 — before the sun is low there
  is nothing to be dazzled by, and with a 50° vertical field of view the first-person
  camera sees roughly -25°..+25°, so the 16:00 sun (6.7°..37°) sits IN FRAME whenever
  the traveller turns west over most of the map and year. Both halves belong in ONE
  point: they share the same tuning pass over the same image, and building them apart
  would mean turning the same dial twice.
  (a) EYE ADAPTATION — the effect the player reads as high dynamic range. The exposure
  follows the frame's mean luminance (from the HDR buffer's mip chain, not a CPU
  readback): facing the sun darkens the scene, turning into a lane's shade opens it up
  again. The range is BOUNDED and calibratable around today's fixed
  `toneMappingExposure` of 1.05 (`src/App.tsx`) — `balance.exposure.*`,
  debug-editable — and the two directions have their own time constants (brightening
  fast, darkening slow, as an eye does). A bounded controller, never free-running.
  FIRST PERSON ONLY. The bird's-eye view keeps its fixed exposure: design.md §2.7
  forbids post-processing that costs the map view its readability, and a map whose
  brightness breathes while driving is precisely that. This is a rule, not a
  performance choice — do not "unify" the two scenes.
  (b) GLARE. The sun disc in `src/render/sky.tsx` (`disc = pow(s, 1200) * 3.0`) must
  sit clearly above the bloom threshold so it blooms on its own, plus the upstream
  `three/addons/tsl/display/LensflareNode.js` WITH an occlusion test: a hut wall or
  roof edge moving in front of the sun kills the glare in the same frame. Without that
  test the flare survives its occluder and reads as a sticker on the lens — the single
  detail that separates a convincing glare from a cheap one.
  QUALITY: highest level only, with entries for all three levels in `QUALITY_PRESETS`
  (`src/config/quality.ts`) and `docs/graphics-detail-levels.md` updated in the same
  commit — the completeness gate and the doc-sync test both fail otherwise.
  ESTIMATED COST ~0.3-0.8 ms; the real number comes from F8 on the user's hardware.
  VERIFIABLE: pure — the exposure controller maps luminance to a target within its
  clamp, converges from both directions, honours its asymmetric time constants and
  cannot run away from a black or a blown-out frame; the preset completeness and doc
  sync cover the new keys. Live (BOTH backends, screenshots): in a settlement facing
  the sun the rendered frame's mean brightness FALLS within a bounded number of frames
  and recovers when the traveller turns away — measured in PIXELS, never in the
  uniform (the §7.2 lesson that three rounds of uniform-level checks once passed while
  the player saw nothing); the glare is present with the sun in the open and gone with
  a building between; and in the bird's-eye view a driven pass leaves the exposure
  UNCHANGED, which is the readability guard's own witness.
  DOCS: design.md §2.7 already states it; CLAUDE.md §7.1 point 14 gains the built
  behaviour when this lands.

- [ ] 345. SUN SHAFTS THROUGH WHAT STANDS IN THE WAY, HIGHEST QUALITY LEVEL (user
  25.07.2026). With the low afternoon sun of point 343, a palm crown, a roof edge, the
  Djinguereber minaret or the Giza pyramids finally have something to cast shafts
  through. Wire the upstream `three/addons/tsl/display/GodraysNode.js`
  (`godrays(depthNode, camera, light)`) into the post chain in `src/render/Effects.tsx`
  beside the existing GTAO/bloom/TRAA nodes.
  FIRST PERSON ONLY, and for a reason worth writing down: screen-space godrays need
  the light IN the frame, and the bird's-eye camera looks ~60° down while the sun
  stands at most 37° up — it is never in that frame. Wiring the pass there would cost
  milliseconds for an effect nobody can see. Do not enable it in the travel scene.
  QUALITY: highest level only, entries for all three levels in `QUALITY_PRESETS` plus
  `docs/graphics-detail-levels.md` in the same commit.
  THIS ONE IS PRICED BEFORE IT IS KEPT. It is the only effect in this family with a
  real per-pixel cost (estimated +1.5-3 ms; on the measured S25 baseline of ~12.6 ms
  GPU that is +12-25 %). Run F8 on the user's hardware BEFORE and AFTER on the same
  build and record both digests in the commit. If the cost is not worth the picture,
  the point is closed by REMOVING the pass and recording the measurement — that is a
  legitimate outcome, exactly as the SSR removal was, and it must not drag point 344
  with it.
  VERIFIABLE: pure — the preset completeness gate and the doc-sync test cover the new
  key; the pass is absent from the travel scene's chain by construction. Live (BOTH
  backends, screenshots): in a settlement with the sun behind a roof edge, the pixels
  along the sun direction brighten measurably against the same frame with the level
  stepped down — judged on the image, not on the flag; no console errors; the F8
  before/after numbers are recorded.

- [ ] 346. HORIZON MAPS BAKED FROM THE DEM — SELF-SHADOWING AND SKY OCCLUSION AT
  PLANETARY RANGE (user 25.07.2026; design.md §2.7 states the target). A new offline
  step beside `scripts/build-geodata.mjs` measures, per DEM texel, the HORIZON ANGLE —
  how high the land rises around that point — and the terrain shader reads it. Two
  effects out of one bake: the land SHADES ITSELF far beyond any shadow map's reach,
  and every hollow sees less sky than the ridge above it and is lit accordingly.
  IT ONLY PAYS BECAUSE OF POINT 343, and depends on it: at the old fixed ~45° sun a
  3000 m massif threw ~3 km of shadow, about one DEM texel. At the 16:00 sun's low end
  (~9°) the same massif throws ~19 km — nearly seven texels, visible terrain shading
  across the view.
  THE ALGORITHM IS THE WHOLE FEASIBILITY QUESTION. Naive ray marching is 8.8 M texels ×
  directions × ~100 steps ≈ billions of samples and is not an option in Node. Use the
  standard horizon SWEEP (per direction, march the grid line by line keeping a monotone
  stack of candidate horizons), which is linear in texels — seconds, not hours. Pin the
  sweep against a brute-force reference on a SMALL patch in the tests: that comparison
  is what proves the fast path correct.
  ONLY SIX DIRECTIONS ARE NEEDED, and the reason is worth keeping: because the hour is
  FIXED (point 343), the sun's azimuth never leaves a 74° westerly arc — 233°..307°
  over the entire map and every day of the year. Bake that arc at ~15° steps (6 slices)
  plus ONE direction-averaged sky-occlusion channel; a full circle would be wasted
  storage. The fragment interpolates between the two slices bracketing the current
  azimuth.
  IF THE DEBUG HOUR LEAVES THE ARC (the `balance.sun.hour` field of point 343 is
  editable), the shading must CLAMP to the nearest baked slice and say so through the
  dev channel — never silently shade from the wrong direction. Pure-test that clamp.
  ASSET BUDGET, to be settled by the PICTURE and recorded: 7 channels (6 + occlusion)
  in two RGBA textures. At half DEM resolution (1460×1500, ~6 km per texel) that is
  ~17.5 MB raw, roughly 5-9 MB as PNG; at quarter resolution ~4.4 MB raw, ~1.3-2.2 MB.
  Start at half, and drop to quarter if the download budget bites — today's whole
  `dem.png` is 6 MB, so this may not dwarf it. Horizon angles are low-frequency and a
  soft, kilometre-scale shadow edge is physically right, so a coarse map is not a
  compromise in the way a coarse shadow map would be.
  SCOPE: the bird's-eye TERRAIN only. Settlements have their own local scene and ground
  and are untouched.
  QUALITY: on at MEDIUM and HIGH, off at LOW — and at low the extra textures are NOT
  FETCHED at all, since the runtime cost is one texture lookup but the download and
  video memory are what a weak device actually cannot afford. Entries for all three
  levels in `QUALITY_PRESETS` plus `docs/graphics-detail-levels.md` in the same commit.
  THE FETCH IS GATED ON THE EFFECTIVE LEVEL, not merely the use of the result: at low
  the request is never issued, so a `?quality=low` link (point 347) costs the player
  those megabytes NOTHING — the whole reason that link exists. The gate must therefore
  sit at the request, never at "load it and ignore it". Two consequences to build for:
  the load is LAZY and keyed on the level, and RAISING the level at runtime (F9, the
  debug picker) fetches the maps then and applies them when they arrive, without
  blocking the frame or stalling the level switch. Pure-test both directions — no
  request at low, exactly one request when the level rises, and none again on a second
  rise.
  DOCS: design.md §2.7 already states it; the preprocessing must be documented
  reproducibly like the existing geodata pipeline (§7.1 point 13), and CLAUDE.md §7.1
  point 14 gains the built behaviour when this lands.
  VERIFIABLE: pure — the sweep matches a brute-force horizon reference on a small
  synthetic patch (a cone, a ridge, a flat plain: a flat plain yields horizon 0 in
  every direction, a wall yields the analytic angle); the azimuth arc actually covers
  every (latitude, day) the game can produce, with a case just outside it clamping and
  reporting; sky occlusion is monotone (a pit is more occluded than the ridge beside
  it); the preset completeness and doc-sync gates cover the new keys. Live
  (`scripts/verify/enrichments.mjs`, BOTH backends, screenshots): at a massif with the
  low-sun date, the ground on the sun-facing side reads measurably brighter in PIXELS
  than the ground in its lee at the same elevation band, and that contrast is FLAT with
  the quality level stepped to low — the effect is judged on the image, never on the
  flag; no console errors; the build step is reproducible from a clean checkout.

- [ ] 348. THE VILLAGE FIRE IN THE RAIN (user 25.07.2026, screenshot: the Zulu village
  under visible rain, the §19.10 fire burning uncovered in the open with the
  inhabitants standing around it as if the weather were not happening). Point 142
  already made the fire answer to a place's own COLD, harmattan and karif; RAIN is the
  driver it never got, and rain is the one that contradicts the picture outright — an
  open fire in the open does not burn through a downpour.
  TWO MORE FAULTS IN THE SAME OBJECT, reported 27.07.2026 with a screenshot of the
  Mbuti village under rain, and they must be fixed WITH the rain behaviour rather than
  after it — a shrinking flame that keeps them would only shrink the fault:
  (a) THE FLAME FLOATS. A fire reduced by the weather still stands ON the ground: its
  base sits in the hearth, on the fire pit's own surface, at every size the rain rule
  produces. Whatever scales it must scale it about its base, not its centre — check the
  full range the rule can reach, including the smallest, because the gap grows as the
  flame shrinks.
  (b) THE VILLAGERS WALK THROUGH IT. The fire needs a collider — the user's own
  suggestion, and the right one: the hearth plus a calibratable clearance radius
  (a `balance` value, debug-editable) joins the settlement's collider set, so inhabitants
  path AROUND it and the player cannot stand in the flames either. The §2.6 rule that no
  walker may be trapped applies: adding an obstacle in the middle of a yard must not
  strand anyone, so the errand-target validation runs against the widened set.
  VERIFIABLE for both: pure Vitest — the flame's base stays at hearth height across the
  whole scale range (the floating case fails before the fix), and the hearth collider is
  in the set every walker path is validated against, with no walker target left inside
  it; live, one first-person frame in the rain showing flame on ground, and a walker
  observed pathing around the hearth rather than through it.
  RESEARCH FIRST, then build — this is a people question, not a graphics question.
  Establish from `docs/peoples-1890.md` (extending it where it is silent) where each
  people's cooking fire actually SAT around 1890: a hearth inside the dwelling, a
  roofed cooking shelter beside it, or an open yard fire. The Zulu case in the
  screenshot is the likely "hearth inside the hut" reading, but it must be confirmed
  rather than assumed, and the answer will differ by people.
  THEN THE BEHAVIOUR, decided per people from that evidence — the §19.13 dress rule is
  the model to follow (six peoples change their dress on real evidence, sixteen do not;
  a blanket rule for all would be the invention this project refuses): under rain past
  a calibratable intensity, a village either shelters its fire under a structure that
  people REALLY built there, or the yard fire is out and the life vignette moves under
  cover — inhabitants inside or under the eaves, the fire relit when the rain passes.
  DO NOT put a generic canopy over every village fire. A shelter that no one there
  built is the same class of error as a garment no one there wore.
  KEEP: the point-142 cold/harmattan/karif behaviour, and the §19.10 vignette's normal
  dry-weather life, entirely unchanged.
  DOCS in the same commit: design.md §19.10 and §19.13 gain the rain driver;
  `docs/peoples-1890.md` gains the hearth/shelter evidence AND its implementation
  section is updated in the same commit (the standing rule that research and the game
  table never drift apart).
  VERIFIABLE: pure — every people in the roster has a DECIDED rain behaviour (the sweep
  fails on a people nobody decided about, exactly as the dress sweep does); the rain
  threshold is a calibratable, debug-editable value and the transition is deterministic;
  a village whose people keep an indoor hearth shows no yard fire under rain, and lights
  it again when the rain stops. Live (`scripts/verify/polish.mjs`, BOTH backends,
  screenshot): the Zulu village forced into heavy rain shows the decided state rather
  than an uncovered burning fire, and the same village in dry weather is unchanged from
  today.

- [ ] 350. THE KNEELING VILLAGER IS A SQUASHED VILLAGER (user 25.07.2026, deployed
  build: a figure in the Zulu village alternates between normal and visibly FLATTENED).
  ROOT CAUSE, already located: `Figure` in `src/scenes/place/PlaceLife.tsx` fakes
  kneeling with a NON-UNIFORM vertical squash — `scale={[scale, scale * (kneel ? 0.75 :
  1), scale]}` (line ~60) on top of a shortened body cone (`bodyH = kneel ? 0.55 : 1.0`).
  The squash applies to the WHOLE figure, the head included, so the head reads as a
  flattened ellipsoid: kneeling shortens the legs, it does not compress the skull. And
  the alternation the user sees is `TaskWalker` (line ~496) swapping the standing and
  kneeling groups by VISIBILITY when it starts and ends its work at the well — an
  instant pop between two different-looking figures.
  TARGET: a kneeling pose built from PROPORTIONS, not from a vertical scale. The lower
  body folds (a shorter, wider base) and the whole figure sits lower, while the head and
  every other part keep their true shape — the group's scale stays UNIFORM. And the
  transition reads as a movement rather than a swap: the figure lowers into the pose and
  rises out of it over a short, calibratable time, so no frame shows one figure replaced
  by another. Every user of `kneel` gets it — the cook, the fire tender and the errand
  walker at the well.
  VERIFIABLE: pure (`src/render/figures.test.ts` or a test beside it) — the kneeling
  build applies no non-uniform scale (x, y and z factors equal) and its head radius
  matches the standing figure's, while the pose is genuinely lower (a bounded overall
  height reduction); the standing build is unchanged. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshot): across the frames in which a
  task walker starts and finishes its work, no single frame changes the figure's
  rendered height by more than the transition's per-frame step — the pop is what the
  check is for.

- [ ] 353. SHELTERED GROUND STAYS LESS WET (user 25.07.2026). In the rain the whole
  settlement floor darkens uniformly, so the earth under a roof overhang or a tree crown
  soaks exactly like the open yard. Make wetness SPATIAL — and less, not none: ground
  under cover reads drier than the open ground around it, but never bone dry, because
  wind-blown rain and splash reach under every eave (the user's own correction, and the
  realistic reading).
  WHY IT IS CHEAP, and the reason to build it this way: a settlement's roofs and trees
  do not move. The coverage is therefore computed ONCE when the place is built — a
  shelter mask over the ground disc, derived from the layout's known building footprints
  with their roof overhangs and the tree crown radii — not per frame and not per fragment
  against a list of obstacles. Prefer that CPU bake over a top-down depth pass: it needs
  no extra render target, and it is pure-testable, which a GPU pass is not.
  THE COMBINATION: the existing global ground wetness (`setGroundWetness` /
  `groundWetnessFactor`, wired through `src/render/seasonTint.ts` and the season module)
  is multiplied by the mask through a calibratable `balance.rain.shelterStrength` that is
  strictly BELOW full, so full cover reduces the wetness without ever reaching zero.
  Edges are soft — a hard-edged dry disc under a tree would look worse than the uniform
  wetness it replaces.
  THE DRIP LINE, if it comes cheap: just OUTSIDE the eaves the runoff makes a band
  WETTER than the open ground. It is the detail that sells the whole effect, and it is
  the same mask read at its gradient. Calibratable; drop it rather than fake it.
  KEEP: dry weather completely unchanged — with no rain the mask must make NO visible
  difference anywhere.
  A USEFUL BY-PRODUCT to note in the commit: this same mask answers "is this spot under
  cover", which is what point 348 needs to move village life under a roof.
  NO QUALITY KEY: a one-time bake plus a texture lookup in a material already drawn, like
  point 352 — record the reasoning rather than adding a lever for nothing.
  VERIFIABLE: pure — the mask built from a layout with one hut is high under the roof
  footprint, falls off across a soft margin and is zero well outside it; a tree crown
  produces the same under its radius; the combined wetness at full shelter is strictly
  between zero and the open-ground value (the "less wet, not dry" rule, boundary-tested),
  and equals the open value everywhere when the shelter strength is zero. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshot): in a village forced into
  rain, a ground crop under a hut's eaves reads measurably lighter in PIXELS than a crop
  in the open yard, while in dry weather the two crops match — judged on the image, not
  on the uniform.

- [ ] 354. RAIN FALLS FROM A BRIGHT BLUE SKY IN THE SETTLEMENT (user 25.07.2026,
  deployed build: the Zulu village on 03.01.1890 — high summer rains — with clear rain
  streaks against an almost cloudless blue dome). Under rain the sky must read heavy.
  THE MECHANISM EXISTS AND IS WIRED, which is what makes this worth a careful look
  rather than a quick tint: `PlaceScene.tsx` computes `skyOvercastParams(wet, strength)`
  each frame and calls `setSkyOvercast(grayMix, cloudBoost)`, and the parameters are
  substantial at that date — `grayMix = 0.75 × wetness × weatherStrength`, with the same
  wetness that is visibly producing the rain streaks. So the numbers say overcast while
  the picture says blue. DIAGNOSE WHERE THE VALUE IS LOST before changing any constant:
  candidates are the uniform not reaching the PLACE dome's material instance (the travel
  dome and the settlement dome are separate mounts), `balance.season.weatherStrength`
  sitting low, the gray being mixed under a base colour that dominates it, or the cloud
  deck not thickening at all — the screenshot shows essentially no cloud despite a
  `cloudBoost` of the same magnitude. Name the actual cause in the commit.
  THE TEST DID NOT CATCH IT, AND THAT IS THE SECOND HALF OF THIS POINT. The settlement
  season checks in `scripts/verify/polish.mjs` assert on the VALUES behind
  `__placeSeason()` — "the rains gray the settlement dome and thicken its cloud deck"
  compares numbers, not pixels. They are green while the player sees a blue sky. This is
  the exact failure the project already recorded once for the seasons (point 147: three
  rounds of uniform-level checks passed while the player saw nothing), and the remedy is
  the one that worked there — MEASURE THE PICTURE. Replace or supplement those
  assertions with a pixel comparison of the same sky region in a dry month and in a wet
  month at the SAME settlement, the way the travel ground already proves its season
  (screenshots 115/116). A parameter assertion may stay as a supporting check; it may not
  be the evidence.
  KEEP: the dry-season sky unchanged, the §19.13 thunderstorm flash and the harmattan
  dust dome (their own axis, not the wet gray) untouched, and the rain streaks as they
  are — the streaks are not the complaint.
  VERIFIABLE: pure — `skyOvercastParams` keeps its curve (already tested); a new test
  pins whatever wiring turns out to be broken, so it cannot silently return. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshots): a crop of the SKY above the
  horizon at one settlement is measurably darker and less saturated in its wet month
  than in its dry month, and the difference is large enough that a person would call it
  overcast; the existing dry-month picture is unchanged.

- [ ] 356. THE INHABITANTS NOTICE THE TRAVELLER (user 25.07.2026). Today they do not:
  in `src/scenes/place/PlaceLife.tsx` the player appears ONLY as a collision radius, so
  a settlement is a diorama that happens to be occupied. Being SEEN is the strongest
  signal that a place is inhabited, and for a European walking into an African village
  in 1890 it is also the historically obvious reaction.
  TARGET: within a calibratable notice radius an inhabitant turns its head — the whole
  figure's facing, since these figures have no separate head — toward the traveller for
  a few seconds, then returns to its errand. Children break off what they are doing and
  stare a moment longer; the goats shy a step away. Everyone keeps their task: this is a
  glance, never a state that stops the village.
  RULES THAT KEEP IT FROM BECOMING CREEPY OR MECHANICAL: a cooldown per inhabitant so
  the same figure does not track the player continuously; a cap on how many notice at
  once (a whole village turning in unison reads as a horror film, not a place); the turn
  rides the existing capped turn rate rather than snapping; and a drama or errand that
  must not be interrupted (the elder in an audience, a walker inside a building) is
  exempt. Values in `balance.villageLife.*`, debug-editable.
  VERIFIABLE: pure — the notice predicate fires inside the radius and not outside,
  respects the cooldown, and never selects more than the cap; the resulting facing is a
  bounded step toward the player, never a snap. Live (`scripts/verify/polish.mjs`, BOTH
  backends, screenshot): walking past a group, at least one inhabitant's yaw turns
  measurably toward the player and returns afterwards, while the errands continue.
  DOCS: design.md §19.10 gains the glance beside the existing village vignettes.

- [ ] 357. THE VILLAGE SOUNDS INHABITED (user 25.07.2026). Checked: the settlement
  soundscape in `src/systems/ambience.ts` runs exactly ONE layer for a village —
  `setTarget('drums', 0.5)`. No voices, no pestle, no goats, no fire. Sound carries
  "inhabited" further than any visual, and its absence is not noticed until it is there.
  TARGET, as layers over the existing master ambience volume (§20), each with its own
  calibratable level like `balance.birdsongVolume`: a low murmur of VOICES at
  conversational distance; the thud of the mortar, timed to the pestle that is already
  animated rather than looping free; goats; and the fire's crackle rising as the
  traveller nears the fire ring (the §19.1 proximity model already exists for animal
  calls — reuse it, do not build a second one).
  THE VOICES STAY WORDLESS, and that is a decision, not a shortcut: the language
  mechanic of §13.4 is explicitly undecided and under review, so anything resembling
  speech would commit the game to an answer this point has no business giving. A murmur
  commits to nothing and can be replaced when §13 is settled.
  KEEP: the drums as they are, the port and travel soundscapes untouched, and the single
  master volume in charge of everything (§20).
  VERIFIABLE: pure (`src/systems/ambience.test.ts`) — each new layer's gain follows its
  own slider and the master, is zero outside a village, and the fire layer rises and
  falls with distance across a swept range. Live (`scripts/verify/settings.mjs`): inside
  a village the new layers are audible in the graph's gain values and fall silent when
  the master is muted; no console errors.
  DOCS: design.md §19.10/§20 name the village layers.

- [ ] 358. SMOKE OVER THE FIRE, DUST UNDER THE FEET (user 25.07.2026). A thin smoke
  column drifting from the §19.10 fire reads as "someone lives here" from further away
  than any figure does, and dust kicked up where a walker crosses dry ground makes the
  ground feel walked on rather than walked over.
  TARGET: a slow, thin smoke plume above the fire that leans with a calibratable drift
  and thins with height; and a small, short-lived dust puff at a walker's feet on DRY
  ground only. Both tie into what already exists: the smoke thins or gutters under rain
  the way the fire itself already answers to weather (point 142), and the dust is
  suppressed once the ground is wet (the wetness the season already drives, and the
  sheltered-ground mask of point 353 where that lands first).
  QUALITY: declare all three levels in `QUALITY_PRESETS` with the doc kept in sync —
  this is the kind of small optical addition the §21 convention exists for. Keep it
  cheap: a handful of soft billboards, not a particle system with a budget.
  VERIFIABLE: pure — the plume's drift and thinning are a function of height and the
  weather factor, and the dust predicate is false on wet ground and true on dry; the
  preset completeness and doc-sync gates cover the new keys. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshots): above the fire the pixels
  differ from the same crop with the effect disabled, in dry weather a walking
  inhabitant raises visible dust and in rain it does not.
  DOCS: design.md §19.10.

- [ ] 359. THE CATTLE PEOPLES' KRAAL IS EMPTY (user 25.07.2026, from the Zulu village
  screenshot: the enclosure stands there with nothing in it — `PlaceLife.tsx` puts GOATS
  in a pen, cattle do not exist). For a Zulu umuzi the cattle enclosure is not scenery
  but the centre of the homestead, and an empty one is a conspicuous absence.
  EVIDENCE FIRST, as with every people question here: establish from
  `docs/peoples-1890.md` which of the 22 peoples kept CATTLE around 1890 and in what
  arrangement — a central kraal, a herd out at pasture, none at all — and extend the
  research section where it is silent. The cattle-less peoples (the Bemba among them,
  per the existing rinderpest text) get NO cattle; the camel peoples keep camels.
  THEN THE HERD, and this is what makes it more than decoration: the game already models
  the great rinderpest panzootic of 1888-1897 (`rinderpestPhase`, docs/peoples-1890.md
  §5) and already tells it in the first-visit vignettes. The kraal must agree with that
  text — full in 1890, devastated from 1891/92, slowly recovering afterwards, with the
  phase read from the VISIT DATE exactly as the vignette reads it. A village whose
  journal entry speaks of the emutai while its kraal stands full would contradict itself.
  KEEP: the goats and their pen as they are; the §19.10 life, the layout and the
  colliders otherwise untouched; cattle are collidable like any other solid body.
  VERIFIABLE: pure — every people resolves to a decided cattle arrangement (the sweep
  fails on an undecided one, as the dress sweep does); the herd size falls across the
  rinderpest phases for a cattle people and stays zero for a cattle-less one, boundary-
  tested at the phase dates; the animals stay inside the pen and out of its fence. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshot): the Zulu kraal holds cattle
  in 1890 and visibly fewer in 1893, and the Bemba village has none in either year.
  DOCS in the same commit: design.md §19.10 and the implementation section of
  `docs/peoples-1890.md` (the standing rule that research and game table never drift).

- [ ] 360. THE INHABITANTS TAKE NOTICE OF EACH OTHER (user 25.07.2026). Every villager
  runs its errand alone: they pass within a metre of one another and nothing happens.
  A place where nobody acknowledges anybody reads as a set of independent machines
  sharing a courtyard.
  TARGET, three encounters built on what already exists in `src/scenes/place/
  PlaceLife.tsx`:
  (a) A MEETING. Two walkers whose paths cross stop for a few seconds, turn to face each
  other, exchange a small lean — the figures have no arms to raise, so the greeting is
  carried by facing, a brief bow-like lean and the pause itself — and then go on.
  (b) A HANDOVER. The errand walkers already carry a `bundle` or a `jar`; sometimes a
  meeting passes that load to the other, who carries it onward to ITS destination. The
  object must visibly change owner — one carrier, then the other, never two or none.
  (c) A GATHERING. More than one figure at the fire at the same time rather than the
  lone tender: two or three around it, one of them kneeling. This DEPENDS ON POINT 350 —
  the kneeling pose must be a real pose before several figures use it, or the gathering
  multiplies a visibly squashed figure.
  RULES: a meeting always ends (a window, then both resume — the house rule that nothing
  started runs forever); a pair that has just met is not eligible again for a cooldown,
  or two figures will greet each other in a loop; a meeting never begins where the pair
  would stand inside a collider or block a doorway; and the errands still COMPLETE — the
  village must not become a place where everyone chats and nothing arrives.
  KEEP: the point-155 guarantees (clear standing circle, escape direction, the pinned-
  walker nudge) and the ordinary errand rhythm as the backbone.
  VERIFIABLE: pure — the partner choice takes an available walker within the radius and
  never one already in an encounter or inside a building; the handover moves the load
  exactly once (source empty, target carrying); the meeting window expires
  deterministically and the cooldown blocks an immediate repeat. Live
  (`scripts/verify/polish.mjs`, BOTH backends, screenshot): over a sampled interval at
  least one pair meets, both yaws turn toward each other, they part, and the errand
  targets are still reached afterwards; no walker is left standing past its window.
  DOCS: design.md §19.10 beside the existing village vignettes.

- [ ] 362. THE CROSSING TURNED BACK — the crocodile takes a calf mid-channel
  (user 26.07.2026; design.md §19.8 states the target). Two systems exist and have
  never met: the purposeful water crossing (`crossingTarget`/`shouldStartCrossing`
  in `src/scenes/travel/wildlifeBehavior.ts`, point 192) and the crocodile ambush
  (§19.16, `crocodileTargetWeight` and the hunt core). Join them into the one scene
  §19.8 is missing — a family in open water.
  A CROSSING TAKES THE FAMILY. When a parent with a living calf starts a crossing,
  the calf enters with it and swims at its flank (the existing leash, at the wade
  speed both already use); the pair is one crossing, not two. A calf alone never
  starts one.
  THE AMBUSH FIRES MID-CHANNEL. The crocodile's target weighting, today biased to
  drinkers and juveniles AT the bank, gains the swimming calf as its strongest
  case — a calibratable weight beside the existing ones (§21.2, debug-editable).
  THE REVERSAL IS THE PICTURE. On the seizure the parent turns round — against the
  direction the rest of the herd is taking — and swims back. Its heading reversal
  goes through the ordinary capped turn rate (§19.5: no body ever whips round), and
  the rest of the herd does NOT turn: it completes the crossing and walks up the far
  bank. That contrast is what the scene is for; a verification that cannot see it is
  not passing.
  THE ENDINGS ARE THE EXISTING ONES, not new: the return is a RESCUE, so it takes
  the rescue burst braked by `seasonFlowFactor` (`wadeSpeed`) and rolls the SAME
  §19.8 defence matrix used at the waterline — drive-off, taken-in-the-calf's-place,
  or too late. NO vigil exists here (the water takes the body, §19.8); a too-late
  parent makes the NEAREST bank and rejoins its herd. Every branch resolves on a
  bank — reuse the crossing deadline so nothing is left swimming (§19.5).
  ANCHORS: `src/scenes/travel/wildlifeBehavior.ts` (crossing, crocodile weighting,
  defence resolution, `wadeSpeed`), `src/scenes/travel/Wildlife.tsx` ~2373–2500
  (the water-drama frame code and its `seasonFlowFactor` calls) and ~3855 (the
  crossing swim speed), `src/config/balance.ts` `waterDrama`, `src/i18n/{de,en}.ts`
  for the debug label.
  VERIFIABLE: pure (`wildlifeBehavior.test.ts`) — a parent's crossing takes its calf
  and only its calf; the mid-channel weight beats the bank cases; the reversal
  respects the turn cap; each defence outcome reaches a terminal state and a
  too-late parent ends on a bank, never in the channel; no branch can leave the
  water-drama state set past the deadline. Live (`scripts/verify/wildlife.mjs`, ONE
  backend — this is behaviour, not shading; the reversal is judged on the recorded
  positions plus one screenshot): a seeded crossing produces a herd that finishes
  while one animal reverses.
  DOCS: design.md §19.8 + §21.2 already state it; add the balance value's comment
  and the acceptance-evidence line under §12.

- [ ] 363. THE STRAGGLER — a lame calf the herd leaves behind (user 26.07.2026;
  design.md §19.8 states the target). Every §19 drama is fast: a charge, a seizure,
  a plunge. This one is slow, and nothing is scripted to kill — it is the only
  scene in the game whose tension is WAITING.
  THE LAMENESS. With a calibratable chance (§21.2, debug-editable) a calf that
  SURVIVES a hunt — the parent drove the predator off (points 124/125/145c), or the
  chase simply broke off — is left lame: a calibratable speed penalty for a
  calibratable healing window. Keep the chance low; a drive-off that always cost
  something would turn the successful defence into a second sacrifice.
  THE HERD DRAWS AWAY. A lame calf cannot hold the group pace, and its parent does
  not leave it (the §19.8 constant, already implemented for the mire vigil of point
  123 — reuse that stay-behind, do not write a second one). The herd keeps its
  ordinary roaming; the pair simply falls behind and stands alone in the open.
  NO PREDATOR IS SENT. Do not spawn or steer one. The existing juvenile hunt bias
  now has an easier target because the pair is isolated and slow; that is the whole
  mechanism. If a hunt does find them the ORDINARY grammar runs (shield, charge,
  roll) — the parent does not surrender, because nothing has died.
  IT ALWAYS RESOLVES (the point-118 lesson): on the healing window the limp ends and
  the pair rejoins the herd; a streamed-away herd is the adoption/regroup case that
  already exists. A lame calf must never be left permanently detached.
  ANCHORS: `src/scenes/travel/wildlifeBehavior.ts` (the hunt outcome/drive-off
  resolution, the mire stay-behind, the leash and group pacing), `Wildlife.tsx` for
  the per-frame speed, `src/config/balance.ts` `waterDrama`'s neighbourhood (add the
  values beside the family-drama block), `src/i18n/{de,en}.ts` labels.
  VERIFIABLE: pure — the lameness fires only after a SURVIVED hunt and only on its
  chance; the penalty applies to the calf and the parent's stay-behind mirrors it;
  the pair falls measurably behind a roaming herd; the window heals and the pair
  rejoins; no state leaves a calf detached past the window. Live
  (`scripts/verify/wildlife.mjs`, ONE backend): with the chance forced to 1 a
  post-hunt pair is measurably behind the herd's centroid and later back with it.
  DOCS: design.md §19.8 + §21.2 already state it; balance comments and the
  acceptance-evidence line under §12.

- [ ] 364. THE FLOOD SWELLS THE DRAMA CURRENT — and can take a calf at the crest
  (user 26.07.2026; design.md §19.8 states the target). This point fixes a real
  inconsistency first and adds a drama second; both land together.
  THE BUG. `seasonFlowFactor(CURRENT_WEATHER.wetness, dryFlowFactor, wetFlowFactor)`
  (Wildlife.tsx ~2373/2466/2485/3855) keys the drama current on LOCAL wetness alone.
  The game's own flood model is deliberately REMOTE-fed (design.md §19.9, points
  138/139): the Nile crests at Cairo in October where it never rains, and the
  Okavango peaks in July inside Botswana's dry season. So today the water dramas run
  at their dry-season gentlest exactly when the modelled river is at its most
  dangerous. THE FIX: the effective factor is the HIGHER of the wetness-fed factor
  and a flood-fed one — `nileFloodAt`/`okavangoFloodAt` (`src/systems/season.ts`)
  scaled by a calibratable balance value (§21.2, debug-editable) — so the crest
  swells the current, shortens the self-rescue and brakes the rescue burst through
  the paths that already read the factor. Wire it in ONE place (a helper beside
  `seasonFlowFactor`) so no call site can be forgotten.
  THE DRAMA. At a swollen crest a crossing (point 362) can lose the calf to the
  CURRENT rather than to a crocodile: it is carried downstream past its parent's
  reach, and the parent turns downstream after it — a rescue on the same rolls and
  the same brake, which the point-122 drowning window may end for BOTH. This is the
  existing drowning drama reached by a new road, not a new death: reuse
  `drownSeconds`/`drownFlowThreshold` unchanged.
  WHAT MUST NOT CHANGE: the flood stays VERTICAL (§19.9) — no ground becomes water,
  no §4.2 village clearance moves, the ribbon keeps its width. Only the force
  changes. A test must pin that.
  SEQUENCING: 362 lands first (this point's drama rides its crossing); the flow-factor
  fix is independent and may land even if 362 slips.
  ANCHORS: `src/systems/season.ts` (`nileFloodAt`, `okavangoFloodAt`),
  `src/scenes/travel/wildlifeBehavior.ts` (`seasonFlowFactor`, `wadeSpeed`, the
  drowning core ~1745), `Wildlife.tsx` at the four call sites above,
  `src/config/balance.ts` `waterDrama`, `src/i18n/{de,en}.ts`.
  VERIFIABLE: pure — at Cairo in October (wetness 0) the effective factor is
  significantly above the dry floor and near the wet case, while a rainless
  non-flood day stays at the floor; the Okavango does the same in July; the factor
  is never LOWER than today's wetness-fed value anywhere (a pure sweep over the
  year × both systems); the drowning window and threshold are untouched; the flood
  changes no water mask, ribbon width or clearance (assert against the existing
  world sweep). Live (`scripts/verify/wildlife.mjs`, ONE backend): at the October
  crest a seeded crossing is visibly carried downstream and its rescue is slower
  than the same seed in the dry season.
  DOCS: design.md §19.8 + §21.2 already state it; balance comments and the
  acceptance-evidence line under §12.

- [ ] 379. ABU SIMBEL BECOMES A WALKABLE SITE (user 27.07.2026; a FEATURE, and the user's
  own instruction is that the open DEFECTS come first — it waits behind them). The world carries
  eight built cultural landmarks (Meroë, Giza, Great Zimbabwe, Lalibela, Kilwa, Aksum,
  Gondar, Bandiagara) and four natural ones; the rock temples of Abu Simbel are absent,
  and they belong: in 1890 they stood — cleared of sand by Belzoni in 1817 and a fixed
  point of every Nile journey — at the Nubian reach the traveller passes on the way
  south, in their ORIGINAL place beside the river (the 1960s relocation is far outside
  this game's window, so the site sits at the historical coordinates, not the modern
  ones).
  IT IS ENTERABLE, LIKE THE PYRAMIDS (user 27.07.2026): the traveller walks up to it in
  the bird's-eye view and enters with SPACE, exactly as point 273 made the Giza monument
  site walkable — the same enter radius, the same discovery gate, the same non-overlap
  rule against every other place's enter disc, and a first-person site the player can
  cross. Point 273 is the pattern to follow rather than a second mechanism to invent;
  read what it built before designing anything.
  ONE PLACE, ONE LABEL — do not repeat the Giza mistake (user 27.07.2026). Making the
  pyramids walkable left the site defined TWICE, as a cultural landmark AND as a map
  point, so the bird's-eye view carries two overlapping names for one thing (that is
  work-order point 338, still open). Abu Simbel is entered into the world ONCE, in
  whichever of the two forms carries an enterable site, and it must NOT also stand as a
  second definition. Point 338 decides which form survives for Giza; this point follows
  that decision rather than inventing a third arrangement — and if 338 is still open
  when this is built, it is fixed FIRST, because building a second double label while
  the first is being removed is the same defect twice.
  VERIFIABLE for that half: a pure test asserting the site appears EXACTLY ONCE across
  the landmark and map-point definitions, and one bird's-eye frame at in-game zoom
  showing a single label.
  BUILD THE REST AS THE OTHER EIGHT ARE BUILT, not as a special case: an entry in
  `src/world/data/landmarks.ts` with its ~1890-correct coordinates, the field radius and
  water clearance the §4.2 sweep in `src/world/world.test.ts` applies to every landmark,
  a localized name in BOTH language files, a first-sighting journal entry in the §10
  kind-flavoured shape (both languages, §15 voice markup, once per landmark), the
  discovery bounty, and the debug-menu jump-to entry in its alphabetical place.
  THE FRAMING IS THE §4.4 ONE: an African achievement seen by a traveller, not a
  curiosity. Four colossal seated figures cut from the cliff face, a smaller temple
  beside them, the river below — the entry says what the traveller SEES and what it
  meant, in the register the other seven use.
  RESEARCH BEFORE PLACING: confirm the coordinates and the 1890 state against
  `docs/peoples-1890.md` (it already mentions the site) and the sources that document
  the other landmarks; if the research contradicts anything here, the research wins and
  the point is corrected rather than forced.
  VERIFIABLE: the existing landmark sweeps in `src/world/world.test.ts` cover it
  automatically once it is in the data (clearance, no overlap, the label rules); add the
  i18n completeness case both languages already have, and the first-sighting entry test
  beside the other landmarks'. One bird's-eye screenshot at in-game zoom showing the
  site labelled where it belongs on the Nile.
  DOCS in the same commit: `design.md` §4.4 (the landmark list is design content — this
  is a genuine addition and pays its measured words), CLAUDE.md §7.1 pt 25 where the
  eight are enumerated, and the evidence section.

- [ ] 380. THE SURROUNDINGS SHOW THE NEIGHBOUR THAT IS REALLY THERE (user 27.07.2026,
  reported from the deployed build). Standing at the Giza monument site the traveller
  does NOT see Cairo on the horizon, while standing in Cairo he does see the pyramids —
  and in 1890 the two are barely fifteen kilometres apart, in flat desert, in plain
  view of each other. The asymmetry is the report; the rule it breaks is §2.5, which
  promises the surroundings panorama of the real map landscape.
  DIAGNOSE BEFORE BUILDING, because the two directions probably have DIFFERENT causes:
  the backdrop band (`src/scenes/place/backdrop.ts`) is built from `sampleTerrain`
  alone — relief, no settlements and no monuments — so it cannot be what shows the
  pyramids from Cairo; that view is far more likely Cairo's own local dressing. Confirm
  which mechanism draws each side before deciding where the fix belongs. A fix in the
  wrong one produces a pyramid that hangs in the sky, which is exactly the class points
  92/94/181 already paid for.
  THE TARGET: a settlement or monument that is genuinely within sight distance reads on
  the horizon from the other, at the right BEARING and the right apparent size, sitting
  on the ground the backdrop draws (`panoramaStandY`/`discHorizonY`, the point-181
  footing rule) — never floating, never a black sliver. Sight distance is a
  calibratable balance value, debug-editable, and the rule is symmetric by construction
  rather than by two hand-written cases.
  SCOPE HONESTLY: if the research shows the general case (every neighbouring place
  within sight) costs far more than the Giza↔Cairo pair the user reported, say so with
  the measured reason and deliver the general mechanism only if it is affordable —
  a hard-coded pair is NOT an acceptable substitute, because the next pair reopens it.
  VERIFIABLE: pure Vitest on the bearing/size/footing computation for a neighbour at a
  given distance (present within sight, absent beyond it, correct bearing on both
  sides — the symmetry pinned as a property, not as two examples); plus one Playwright
  frame from each side, judged by PROJECTING the neighbour into the picture per §7.2,
  never by an assumed radius.
  ORDER: point 381 (the torn seam at that very site) is FIXED FIRST — adding a
  neighbour to a horizon that is itself broken would build on sand.
  DOCS in the same commit: `design.md` §2.5 (what the panorama shows is design content)
  and CLAUDE.md §7.1 pt 31 with its evidence section.

- [ ] 384. RAIN THAT TOUCHES THE WORLD — WET GROUND, IMPACTS, LIT DROPS (user 27.07.2026,
  after looking at the settlement rain on the deployed build: "the rain is simply painted
  over the picture — it has no effect on the optics at all"). Measured against the code,
  that reading is nearly right: `src/scenes/place/PlaceRain.tsx` draws 700 instanced
  quads in an UNLIT `MeshBasicNodeMaterial` of one constant colour (0.66/0.72/0.8), fog
  off, depth-write off, inside a 15-unit column centred on the eye. The streaks do stand
  in the world and are occluded by huts — but nothing else in the scene knows it is
  raining. This point closes that gap with the three cheapest steps, in the order of
  effect per cost; point 385 carries the two dearer ones.
  (1) WET SURFACES — the biggest gain for the least work, and it needs no new particle.
  A single scene-wide wetness value (the place's own `rainAmount`, already computed)
  drives the existing materials: roughness down, albedo slightly darkened, specular
  response up, so ground, roofs and walls go dark and glossy and the village fire
  reflects in the wet earth. Sheltered ground is EXEMPT — work-order point 353 owns that
  rule; this point must not fight it, so read it first and drive both from one value.
  (2) THE RAIN REACHES THE GROUND, AND ARRIVES. Today the column is a fixed box around
  the head and drops recycle at its lower edge — which is why the player sees them stop
  in mid-air. A drop ends at the GROUND under it (the terrain/settlement height at its
  own x/z), and its end is an IMPACT: a short-lived, small ring or splash quad at that
  spot, alpha-fading, instanced like the drops themselves. On water the impact is a
  ring; on dust it is a puff — one shape parameterised, not two systems.
  (3) LIT DROPS INSTEAD OF ONE FLAT COLOUR. A streak's brightness follows the sun/sky
  direction and the view angle, so it reads bright against a dark hut and nearly
  vanishes against a bright sky, and the drops of one gust no longer look identical.
  QUALITY LEVELS ARE PART OF THE POINT, not an afterthought (§21 convention): every new
  lever gets a low/medium/high entry in `QUALITY_PRESETS` (`src/config/quality.ts`) and a
  row in `docs/graphics-detail-levels.md` — the completeness gate in
  `src/config/quality.test.ts` fails otherwise. Rain that costs frames on LOW is a
  regression, so low keeps the plain streaks and the wetness value at most; impacts and
  lit drops are medium/high.
  BOTH BACKENDS, ONE PATH: TSL only, no WebGPU-only branch (CLAUDE.md §3) — the
  reverted TRAA attempt is the precedent for what a second code path costs.
  VERIFIABLE: pure Vitest on the wetness mapping (dry → today's values, wet → the
  darkened/glossier set, sheltered ground unchanged) and on the impact placement (a
  drop's end equals the ground height under it, never the column's lower edge); the
  quality-preset completeness and doc-sync gates green; live, one first-person frame in
  the rain on BOTH backends showing wet ground and drops that arrive, judged by the
  picture, plus the §21 detail levels stepped through without a red.
  DOCS in the same commit: design.md §19.13 (what rain does to the picture is design
  content), `docs/graphics-detail-levels.md`, and CLAUDE.md §7.1 pt 12 with its evidence
  section.

- [ ] 385. RAIN WITH DEPTH AND WEATHER — LAYERS, STREAK SHAPE, DIMMED SUN (user
  27.07.2026; the second half of the rain work, deliberately LAST in the queue, after
  point 379). Point 384 makes the rain touch the world; this makes the rain itself read
  as weather rather than as particles.
  (4) DEPTH INSTEAD OF ONE CURTAIN: two or three layers at different distances and
  speeds, with the streak LENGTH following the drop's velocity relative to the camera
  and soft, faded ends rather than hard rectangles. That is the classic way volume is
  suggested without more particles — the count stays where it is or falls.
  (5) THE WEATHER CHANGES THE LIGHT: while it rains the sun is damped, the haze rises
  and the view distance shortens, so a downpour looks like one from inside a hut as well
  as from the open. This is where the rain stops being an overlay: the scene gets darker
  and flatter, and the fire is suddenly the brightest thing in the village.
  BOUNDARY: the blue sky under rain is work-order point 354 and stays there — this point
  changes the LIGHT, not the sky dome, and the two must be built so neither undoes the
  other. Read 354 before starting; if it is still open when this begins, say in the
  commit how the two interact.
  QUALITY LEVELS, as in 384: every lever gets its low/medium/high entry and its doc row;
  the layered rain and the light damping are medium/high, low keeps one layer and the
  undimmed sun.
  BOTH BACKENDS, ONE PATH: TSL only, no backend branch.
  VERIFIABLE: pure Vitest on the layer/velocity mapping (streak length follows relative
  speed; a stalled camera does not stretch a drop) and on the light damping (rain 0 →
  today's sun and haze exactly; rain 1 → the damped set; monotone in between); live, one
  first-person frame per backend in the open and one from under a roof, judged by the
  picture, at each detail level.
  DOCS in the same commit: design.md §19.13, `docs/graphics-detail-levels.md`, CLAUDE.md
  §7.1 pt 12 and its evidence section.

- [ ] 414. THE BIRD'S-EYE ANIMALS GET THE WALK THE SETTLEMENT ONES HAVE (29.07.2026,
  user asked after seeing the settlement gait: "could this walk be carried over to the
  bird's-eye view?"). Yes — and the hard part is already built and tested. `src/render/
  fauna.ts` carries the whole derivation as pure functions: `footReach`, `strideLength`,
  `gaitCadence`, `isStance`, `gaitFootFraction`, `gaitPhase`, `legSwingAngle`,
  `gaitBodyLift`, `groundPitch`, `footBodyOffset`, `seatFootOnGround`. The settlement
  walkers, the panorama silhouettes and the goats all read it. `src/scenes/travel/
  Wildlife.tsx` reads NONE of it — measured: no reference to any of those names. Its
  animals carry only a grazing-shuffle phase, so a walking herd slides.
  WHAT IS ACTUALLY MISSING is not the maths but the BODY: the travel animals are drawn
  from `animalBodies.ts` without pivoted legs, and they are INSTANCED (19 instanced
  meshes in `Wildlife.tsx`) because a bird's-eye frame holds far more animals than a
  settlement. So this point is a rendering-cost question wearing an animation costume,
  and it must be answered in that order:
  1. Give the travel bodies pivoted legs from the SAME part description the settlement
     bodies use, so one definition drives both and they cannot drift apart (the §300
     lesson, and the reason the panorama and the village already agree).
  2. Drive them from the SAME distance-driven phase — the animal's own travelled arc,
     never a wall clock — so a faster animal steps faster and a standing one stands
     still, exactly as the settlement does today.
  3. MEASURE before deciding the scope: extra per-leg instance matrices at herd scale
     are the cost, and this project has the instrument for it (F8, the in-game
     benchmark, on the user's own hardware — the headless machine's numbers are not the
     player's). If the full articulation is too dear at distance, degrade by DISTANCE
     rather than by dropping the feature: articulated near the traveller, the cheaper
     body-lift-only cue further out, nothing at the horizon — and say where each band
     begins.
  4. SORT IT INTO THE THREE QUALITY LEVELS (`QUALITY_PRESETS`, the §21 convention): the
     completeness gate fails a new optical feature that lacks low/medium/high entries,
     and `docs/graphics-detail-levels.md` is updated in the same commit.
     THE LEVEL IS THE PRIMARY AXIS, decided by the user 29.07.2026: HIGH always carries
     the walk, LOW never does, and MEDIUM is decided BY THE MEASUREMENT of step 3 — it
     gets the walk if the F8 numbers on the user's own hardware show it comfortably
     inside the frame budget, and stays without it if they do not. Do not guess that
     value: run the benchmark, put the two rows (medium with and without) in the point's
     record, and let them decide. The distance banding of step 3 is then a refinement
     INSIDE a level that carries the feature, not a substitute for the level split.
  NOT IN SCOPE: foot-on-ground seating for bird's-eye animals. The settlement needed it
  because a silhouette stands on compressed backdrop relief; at travel distance the
  terrain under a walking animal is near-flat per stride, and seating every foot of a
  herd is exactly the cost this point is trying to contain. Revisit only if the picture
  shows floating feet.
  VERIFIABLE: pure Vitest — a travel animal's stride advances with the distance it
  covered (not with elapsed time), a standing animal's phase does not move, and the
  cadence differs between a long-legged and a short-legged species; plus the
  `QUALITY_PRESETS` completeness test and the doc-sync test. Live (`scripts/verify/`,
  BOTH backends): a herd photographed twice a stride apart shows moved legs, and the F8
  report's per-system triangle/draw-call rows are attached to the point so the cost is
  on the record.
  DOCS in the same commit: design.md §19 where the wildlife is described, and
  `docs/graphics-detail-levels.md`.

- [ ] 415. THE TUAREG TENT READS AS A HEAP OF SAND (29.07.2026, user in the Tuareg
  village, North: "what are these cones supposed to be? Sand piles? They look more like
  mini tents"). They ARE tents — `Tent` in `PlaceScene.tsx` is a single
  `coneGeometry(r·1.25, h)` in the cloth material, a 0.45-unit pole and a small dark
  entrance flap. Standing on pale sand in the pale cloth colour, a smooth tall cone
  reads as a dune, and the flap is far too small to say otherwise. The user's reaction
  is the correct one: nothing in the shape says "someone lives here".
  THE REAL FORM IS ALMOST THE OPPOSITE, and it is what makes it readable: a Tuareg tent
  (ehen) of that period is LOW and WIDE, not tall and pointed — mats or hides stretched
  over an arched wooden frame, dark against the sand, with the long side open toward the
  lee and the frame's poles and guy lines visible. Height well under a standing person,
  width several times the height. RESEARCH IT FIRST against `docs/peoples-1890.md`
  (Tuareg material is in §2.4 and §7.2) and record what the sources support before
  modelling; where the evidence is thin, say so in the point rather than inventing
  detail — the accuracy principle of this project applies to dwellings as much as to
  clothing, and the guide's own rule is that a real system is never faked.
  WHAT TO BUILD: replace the cone for the NORTH dwelling kind with the arched form —
  a low curved shell, dark mat/hide colouring against the light ground, an open side,
  and the frame legible at eye height (design.md §2.6 asks for structure and weathering
  at eye height, which a smooth cone cannot carry). Keep it cheap: this is a village
  dressing element and appears many times.
  CHECK THE OTHER PEOPLES' TENTS at the same time: the `tent` kind is also used to dress
  the market in other regions. Those are trade awnings, not dwellings, and must not
  inherit the desert form — say which shape each use gets.
  VERIFIABLE: pure Vitest on the geometry description (the north dwelling is wider than
  it is tall, and the market awning is not the same part), plus the existing layout
  tests. Live (`scripts/verify/polish.mjs`, BOTH backends, screenshot): the Tuareg
  village photographed at eye height — the tents must be distinguishable from the ground
  by colour as well as by shape, which is exactly what fails today.
  DOCS in the same commit: `docs/peoples-1890.md` §8 (the research-to-game table) gains
  the dwelling row for the Tuareg, per the standing rule that the implementation
  sections move with the rendering.

- [ ] 428. THE WALKABLE GROUND MEETS THE PANORAMA AT A VISIBLE STEP (29.07.2026, found by
  the picture check of the vertical look, on BOTH backends). Standing at the settlement's
  walkable edge and looking DOWN over it — a view the game only gained with the vertical
  look — the walkable disc and the backdrop relief behind it read as TWO surfaces, not one
  ground: a straight horizontal brightness step runs across the whole frame where they
  meet, the backdrop side markedly darker, and the seam itself is faintly stepped in
  short straight segments rather than following the terrain. Evidence:
  `verification/145-look-down-disc-edge.png`, recorded on WebGL 2 and on WebGPU (the step
  is on both, the shading difference is larger on WebGPU).
  WHAT IS ALREADY TRUE AND MUST STAY: point 381 closed the HOLE at that edge — outside the
  disc the backdrop never sinks below the ground plane and a ring is pinned on the disc
  edge — and CLAUDE.md §7.1 pt 31 states the ground meets the panorama "with no edge, no
  unlit face and no hole". That criterion was verified from an eye-level horizon, where
  the seam sits at the vanishing line and cannot be seen; the pitch put it in frame. So
  this is not a regression of 381 but the rest of its own criterion, and 381's geometry
  fix is not to be undone.
  TARGET: from any position and any pitch the walkable ground and the backdrop read as ONE
  continuous ground — no tonal step at the seam beyond what the terrain itself explains,
  and no straight-segment rim. Find WHICH of the two the step belongs to before changing
  either: compare the two surfaces' shading inputs (do both take the same sun direction,
  the same IBL/ambient term, the same tone mapping stage, and does the backdrop get the
  biome splat the disc gets, or a flat fallback colour?), and check whether the point-381
  ring is drawn in its own tone rather than the disc's. A material/lighting mismatch is
  the likely cause; a geometry gap is not — the picture shows contact, not a crack.
  VERIFIABLE: Vitest in `src/scenes/place/backdrop.test.ts` — the disc and the backdrop
  resolve the same lighting inputs at coincident points on the seam, so a future change
  that gives one of them its own term FAILS. Live in `scripts/verify/polish.mjs`: from the
  disc edge looking down, scan a vertical pixel column across the seam IN THE ONE FRAME
  and assert the luminance step at the contact stays under a calibratable threshold — a
  within-frame measure, never a cross-run image diff (point 361 forbids the latter). Both
  backends, judged by the picture: the same frame must show one ground.
  DOCS in the same commit: the evidence section `docs/acceptance-evidence.md` §31 records
  the pitched-view check beside the existing eye-level one.

- [ ] 591. DOES THE PROJECT STILL OBEY ITS OWN RULES? A FULL ADHERENCE AUDIT (user
  09.08.2026: "Wir scheinen so einige unserer eigenen Projektregeln zu verletzen. Lege
  auch einen Task an, der ein Review des ganzen Projekts macht, um zu prüfen, ob es noch
  mehr in der Richtung gibt"). THIS IS A DIFFERENT AXIS FROM POINT 307. That audit
  (`docs/rule-corpus-audit.md`, 27.07.2026) judged the rules AGAINST EACH OTHER —
  duplication, contradiction, dead entries. This one judges the rules against REALITY: for
  every written rule, does the repository, the mechanism set and the daily practice
  actually comply? The two cases that prompted it both passed 307 untouched, because
  neither is a defect IN a rule: the board sorted its queue from a hand-kept array while
  the work order was declared the single home of the order (point 590), and the play
  session found twelve accepted points broken against the "judge by the real signal" rule
  CLAUDE.md §7.2 has stated since the beginning (point 589).
  SCOPE — the whole corpus, each part named so none is silently skipped: `CLAUDE.md`;
  `design.md`'s process sections; the `TASKS.md` preamble; `docs/work-packages.md`;
  `scripts/verify/README.md`; the project memories and their index; the derived advice
  documents in `docs/analysis_de/`; and the user-global `~/.claude/CLAUDE.md`, which 307
  named as a gap and did not judge.
  METHOD — THIS IS A DIVERGENT STEP, so it runs BLIND PARALLEL, not as a review (CLAUDE.md
  §6): both models work from the same corpus to their own complete finding list, neither
  seeing the other's, and the two are merged into a union deduplicated BY MEANING, keeping
  both wherever it is unclear that one subsumes the other and marking what only one found.
  A reviewer handed a finished list checks that list, and the whole risk here is the
  violation nobody thought to look for.
  EVERY FINDING CARRIES ITS EVIDENCE — the rule text quoted, and the artefact, command
  output or commit that contradicts it. A suspicion without both is not a finding.
  EVERY FINDING IS THEN CLASSIFIED, because "we broke a rule" is not yet a decision:
    (a) THE RULE IS RIGHT, THE PRACTICE IS WRONG → repair the practice, and where the
        breach could recur silently, name the enforcer that would have caught it;
    (b) THE PRACTICE IS RIGHT, THE RULE IS STALE → change the rule, in the document that
        owns it, so the corpus stops describing a past state;
    (c) THE RULE IS UNENFORCEABLE OR DEAD → abolish it the way point 559 abolished the
        time-tracking mandate. A rule that formally binds every session while nobody
        follows it teaches that the corpus may be ignored, and that cost is charged to
        every other rule.
  ONE CUT MUST BE MADE EXPLICITLY: list every rule whose ONLY enforcement is memory — no
  guard, no gate, no hook, no test. That list is the audit's most valuable single output,
  because it is exactly the set that can drift without anything going red, and it is where
  both of today's cases sat.
  DELIVERABLE: `docs/rule-adherence-audit.md` — the findings with evidence and class, the
  memory-only list, and what was repaired on the spot. Everything not repairable in the
  audit itself becomes an appended point, ranked deliberately (point 590's rule), NOT a
  paragraph in a document nobody re-reads.
  VERIFIABLE: every finding names a rule location and a contradicting artefact that can be
  re-checked by a command; the memory-only list is reproduced by a repeatable search over
  the enforcer set; and the two known cases (589, 590) appear in the audit, since an audit
  that misses the findings that triggered it has not covered its own ground.
  Criticality: HIGH — an unnoticed breach means a rule is believed to be in force while it
  is not, which is worse than having no rule: nobody looks again.

The eight points below are the third deliverable of point 572 — the throughput analysis
of 09.08.2026 — which was ticked without them. `docs/analysis_de/durchsatz-analyse.md` §6
states them in their final form and ranks them; they are appended here in that order. The
three further measures of that section are NOT points: measure 4 folds into 569, measure
10 into 553 and measure 11 into 521, each recorded in the point it belongs to, because a
second owner for one defect is how two half-fixes get built.

THEY WERE THEN CHECKED AGAINST THREE EXTERNAL ANALYSES (Deepseek, Gemini and ChatGPT, given
the same repository documents; `local/Optimierungen.md`), blind-parallel by two models per
CLAUDE.md §6. RESULT: not one external proposal earned a point of its own — a point costs
about 5.0 M weighted to run, and every genuinely new item saves less than that, so each was
folded into the owner it belongs to and the specs above carry them. What the outside eyes
DID deliver: the largest single uncaptured pot (15.2 % of all output spent re-asking exactly
identical questions, now in 593), a defect in our own ranking table (machine time was sold
as calendar time, corrected in 593 and measured by 599), and the discovery that our run
records name neither the tree nor the machine a run happened on — which is why two of the
proposals could not even be decided (599 c/d). Everything else was already covered, already
built, or already rejected on our own measurements. THE ORDER CHANGED with it: 593 runs
first because it is the only member with zero build cost, 599 moved forward because four
later decisions wait on its readings, and the ladder (595) now precedes the landing command
(594) — verification is 47 % of the spend against bookkeeping's 26 %, and a rule is cheaper
to land than a mechanism that needs a review.

- [ ] 303. CODE REVIEW OF ALL CHANGES SINCE v0.1 — validate every test is still VALID (user
  24.07.2026). QUEUE POSITION: the NEXT task after 224. Stale tests keep surfacing only as
  incidental findings (today alone: a strict type-check, heavy fuzz timeouts, and checks that
  ASSUMED pre-276 defaults — SSAO on, campfire shadows off — so they measured the wrong
  state; worst case is a check that stays GREEN while the feature is broken). Do a SYSTEMATIC
  review of the ENTIRE diff since the `v0.1` tag (code AND tests): for each area, does the
  test still assert what it claims, at a REACHABLE state, judged by the REAL signal — or has
  a later change made it stale / tautological / always-green? Focus classes: checks that
  assume a default a later point changed (the point-276 default flips are the template),
  pixel/screenshot thresholds calibrated against a since-changed look, and invariants a
  refactor turned into no-ops. Fix or re-validate each finding. METHOD: a COMBINATION of
  Opus 5 and Fable 5 (model-diverse review, the point-298 spirit) — the two models review the
  diff independently and cross-check findings. START ONLY AFTER the user's VS Code restart
  (so it runs on Opus 5). ANCHORS: `git diff v0.1..HEAD`, all `src/**/*.test.ts[x]` and
  `scripts/verify/*.mjs`. VERIFIABLE: a written report per reviewed area with a verdict
  (valid / stale→fixed), each stale test fixed with its correction. No player-visible text.

- [ ] 285. HUNT ACCUMULATION BUGS AND MEMORY LEAKS — A REPEATABLE FABLE ANALYSIS
  (user 24.07.2026, learning from point 278: a fixed anchor drew ever more animals
  because streamed wildlife re-seeded on every return without releasing the
  re-homed originals — an UNBOUNDED growth that a normal test never caught because
  it only checks one moment, not a trend). Establish a proactive, REPEATABLE method
  — like point 205 is for world plausibility — that finds this whole bug class
  before the user does. Use MODEL DIVERSITY: a thorough FABLE analysis (different
  eyes than the Opus authors, per the audit rule), delivered in TWO prongs.
  PRONG A — CODE REVIEW for the leak/accumulation classes: resources created but
  never disposed (three.js geometries/materials/textures/render targets, instanced
  buffers — `renderer.info.memory` should be flat at a fixed state); growing
  collections never pruned (module-level Map/Set/array caches, the `refineCache`/
  `chunkLatestKey`/`spawnedChunks`-style maps, event/subscription registries);
  streaming or respawn that re-adds without truncating the previous fill (the 278
  class — re-seed keyed on distance while a re-homed entity outlives its key);
  React effects whose cleanup is missing or wrong (listeners, RAF, timers,
  observers); per-frame allocations that feed GC pressure. Produce a findings list,
  each with the file/line and the mechanism.
  PRONG B — RUNTIME TESTS that catch a TREND, not a moment: a reusable probe/harness
  (build on `scripts/perf-breakdown.mjs` + the point-277 count probes) that drives
  the real game over TIME — repeated jumps/round-trips between anchors, long driving,
  repeated place enter/leave (scene mount/unmount) cycles — and asserts that the
  measured quantities CONVERGE rather than grow: scene-graph triangle/mesh counts
  per system, `renderer.info.memory.geometries`/`.textures`, `performance.memory`
  JS heap (Chromium), instanced counts, and listener counts. A monotonic rise beyond
  a small tolerance over N cycles is a finding. Make it a script that can be re-run
  each release (a `scripts/verify/leaks.mjs` or a documented harness), on BOTH
  backends where the metric is backend-relevant.
  DELIVERABLE: the findings (evidence = the growth curve per finding), ranked by
  severity; propose fixes. Land the clear, self-contained fixes as their own atomic
  commits/points; file the larger ones as follow-up TASKS points. VERIFY each fix
  the point-278 way — a pure convergence test that FAILS on the old behaviour and a
  live trend check. DOCS: record the method and the run recipe (design.md where a
  system changes, plus a short `docs/leak-hunt.md` or a section in
  `docs/perf-276-findings.md`). This is analysis-first: diagnose and propose before
  changing load-bearing streaming/render code. Budget the fan-out (per the
  workflows-token-budget rule) — scope Prong A inline first, then run Prong B's
  harness. Implementation-ready.

- [ ] 330. FULL POST-DEGRADATION ASSURANCE PASS — nothing new starts until this is
  100 % green (user 25.07.2026, after three separate leftovers were found by chance:
  the board's broken umlauts, the board's inconsistency, and a whole night's work
  sitting unpushed on a feature branch). The user's verdict on the cleanup so far:
  incomplete. Do ALL of the following, in this order, and report each with evidence:
  (A) COMPLETENESS — prove that every piece of work exists on GitHub `origin/main`:
  no local commit ahead of origin (`git rev-list --count origin/main..HEAD` == 0 on
  every checkout), no stash, no untracked-but-wanted file, no remote branch holding
  work that main lacks, and the working tree clean; the deployed page builds from
  that same commit. (B) RESIDUE HUNT — sweep for further traces of the degraded
  session beyond the three already found: re-run the mojibake detector over EVERY
  text file in the repo (not just the board), diff main against the pre-degradation
  commit fd85464 file-by-file and justify every remaining difference, check for
  orphaned/never-referenced files added that evening, stale `.claude` state, and any
  test whose assertions cannot fail (the `expect(true)` class) anywhere in the
  suite. (C) FEATURE AUDIT SINCE v0.2 — for EVERY feature merged after the v0.2 tag
  (bafd9b2, 24.07 21:15): 262 orphan adoption, 273 walkable Giza site, 293 benchmark
  low-preset profiling, 305 LOW sun-shadows-off, 306 closing-completeness guard, 308
  dashboard-sync guard, 309 model tripwire, 313 dashboard consistency audit — judge
  the IMPLEMENTATION for plausibility (does it do what its spec claims, at the state
  a player/operator actually reaches?) and the TESTS for validity (would each test
  FAIL if the feature were reverted? does it assert the real signal or a proxy?).
  Use model diversity: a different model than the author reviews. (D) GREEN PROOF —
  a FULL CLOSING RUN, not merely a regression (user 25.07.2026: "the closing
  contains a full regression anyway"): all eleven steps of `scripts/closing-guard-core.mjs`
  (`CLOSING_STEPS`), driven with `node scripts/closing-guard.mjs --status` and
  `--step <id> --evidence "<proof>"` per step — the LARGE regression on a QUIET
  machine on BOTH backends being one of them, plus lint/audit, the dead-code,
  stale-doc, stale-comment and .md audits, the research-doc implementation
  sections, the graphics-detail-level doc, the §7.1 acceptance confirmation, the
  open-items list and the simplifications list. CLOSING FREEZE applies (CLAUDE.md
  §9): no parallel agent work may land while it runs — the in-flight bug agents
  must be merged or parked FIRST, and the closing then runs on the frozen main.
  Any red is either fixed or recorded as a known, justified exception with the
  user's ruling. (E) COHERENCE —
  does everything still fit together (user 25.07.2026)? Cross-check, for the whole
  current state: design.md and CLAUDE.md §7.1 against what the code actually does
  (every feature merged since v0.2 must be described where the docs describe its
  system, and no doc may still pin behaviour the code has left behind); the
  implementations against their tests (every §7.1 "Verifiable" clause names a test
  that exists and still asserts that clause); the research docs' implementation
  sections (peoples-1890 §8, climate-1890 §9, graphics-detail-levels) against the
  code they mirror; the dashboard against TASKS.md (already guarded — confirm the
  guard covers what the 25.07 audit found by hand); and the memory corpus against
  the rules actually in force. VERIFIABLE: a written report per section with the
  commands run and their output; the tick happens only when (D) is genuinely green
  and (E) reports no unexplained mismatch.

  PROGRESS 25.07 (main session): (A) done — 0 local commits ahead of origin/main,
  clean tree, no work-bearing remote branch left (13 fully-merged ones deleted on
  GitHub), the two remaining stashes identified as deliberately parked older work
  (a dead-session perf-bench edit 23.07, a picture-rejected coast attempt 22.07 —
  both pre-degradation, left untouched). (B) partly done — a repo-wide sweep of
  2305 text files found NO double-encoded text outside this guard's own source
  (a self-reference: the detector flagged the damaged sequences quoted in its own
  comment; rewritten so it no longer quotes them), and NO assertion-free test: the
  five candidates the sweep flagged all assert through helper functions
  (`fired()`, `foliageOf()`, `expectRise()`), i.e. scanner false positives. Still
  open in (B): the file-by-file diff against fd85464 and the orphaned-file check.
  (B) COMPLETED 25.07: the file-by-file diff against fd85464 (excluding the
  screenshots) shows 16 differences, every one of them accounted for as today's own
  work — the model tripwire, the dashboard audit, the guard wirings, the two
  analysis docs, the queued points and the deliberately kept closing-state; nothing
  unexplained remains. The orphan scan over all 61 scripts found exactly one never
  imported file, `scripts/check-deployed-benchmark.mjs`, which is a deliberate
  manual tool (documented "Usage:" header, point 277) and not debris. A
  model-diverse review of the two guard commits merged this morning
  (closing-guard fixes + dashboard-sync wiring) additionally verified: the reverted
  Haiku files are byte-identical to the pre-degradation state, the three stub files
  are absent, no merge artefacts remain, and the retained closing-state cannot
  pre-satisfy the tag gate (it is keyed to a different commit; `--status` reports
  0/11 at HEAD). That review's own findings are queued as point 331.

- [ ] 205. A WORLD & FUNCTIONALITY PLAUSIBILITY AUDIT — a THIRD audit kind beyond
  code bugs (Pillar 2) and visual/behaviour bugs (203): does the world and its
  functionality make SENSE and COHERE, not just work? (user request 20.07.2026:
  there may be systems that work but are pointless, useless, or run counter to
  others.) For EACH system/feature — walk design.md's feature list AND the §7.1
  acceptance systems — ask:
   (1) PURPOSE: does it make sense in-world (~1890 Africa) AND as a mechanic, and
       would a player grasp why it exists?
   (2) USE: does it actually affect the game loop, or is it dead weight nobody
       engages — a building you enter for nothing, an item never needed, a stat
       shown but never decisive, a mechanic with no consequence?
   (3) COHERENCE: does it CONTRADICT or undercut another system — one rewards what
       another punishes, two overlapping mechanics that only confuse, a shortcut
       that trivialises a challenge?
   (4) SETTING FIT: consistent with the researched ~1890 world + design.md intent
       (no anachronism; plausible geography, ecology, economy)?
   (5) WORTH: does it earn its complexity, or add surface without depth?
  WORLD PLAUSIBILITY specifically: the ECOLOGY (every predator has prey and every
  prey a plausible predator in its own region; the herds/dramas are ecologically
  sensible), the ECONOMY (trade is meaningful — goods have a use, prices force
  decisions, the ferry/bazaar/village-barter each have a reason, the money-vs-gifts
  split coheres), EXPLORATION (each region/landmark has a reason to visit; the goal
  is reachable, motivated, and the hint cascade truly leads there), SURVIVAL
  (provisions/health/afflictions create real decisions, not noise), and the
  CROSS-SYSTEM loop (exploration → language → hints → goal; reputation → access;
  economy → equipment → capability) actually holds together.
  RESEARCH-BACKED WORLD ACCURACY (added per user 23.07.2026): beyond coherence,
  run a RESEARCH pass over EVERY concrete element of the game world and check it
  against the ACTUAL ~1890 record — verified against real sources, NOT free
  invention. The trigger/exemplar: the Great Sphinx of Giza was BURIED TO THE
  SHOULDERS in sand until the 1920s excavation, so a ~1890 depiction must show it
  sand-buried — yet it was built free-standing (fixed within the walkable-pyramids
  scene, point 273). That is a case of insufficient prior research, and the concern
  generalises: sweep the whole world for the same class of error — each landmark
  and monument (its real ~1890 state of construction/ruin/burial), each people's
  material culture and settlement form, the flora/fauna ranges, the rivers/lakes/
  ice, the trade goods and their period plausibility, place names and their 1890
  forms — asking for EACH: is this accurate for the EPOCH (~1890, not modern, not
  ancient), the REGION, and the SEASON as depicted? Flag every anachronism or
  unresearched guess with the correct researched state and a source. This is
  ANALYSIS + PROPOSALS ONLY — change nothing now; because the world keeps evolving
  until 205 runs, fold this research into 205's pass then so the latest state is
  audited. Most findings are design judgments for the USER; clear objective
  inaccuracies (a monument in the wrong physical state for 1890, an anachronistic
  good, a mis-dated name) are filed. A model-diverse (Fable) research lens is
  welcome within the point-200 token limits.
  METHOD: system-by-system + the cross-system matrix, and PLAY the loop end to end
  asking "why am I doing this / does it matter". OUTPUT: unlike the mechanical
  audits, most findings here are DESIGN JUDGMENTS — design.md is authoritative and
  design changes are the USER's call — so each is written up and DISCUSSED WITH THE
  USER, not autonomously "fixed". Only clear OBJECTIVE incoherences (a predator
  with no prey in a region, an item with literally no effect, two directly
  contradictory rules) get filed as points; the rest are a design conversation. A
  model-diverse pass is welcome (a Fable lens on "does this cohere") within the
  point-200 token limits.

- [ ] 203. EXTEND 184 — a SYSTEMATIC visual + liveness bug-finder (user request
  20.07.2026: "Bugs wie die … sollten leicht für dich zu finden sein … Kannst
  du 184 dahingehend erweitern, dass es selbst viel mehr Bugs in der Richtung
  findet?"). ROOT CAUSE of the miss: the invariant harness checks POSITIONS
  (I1 pop-in / I5 ocean / I6 interpenetration), but the whole recurring class
  the user keeps stumbling on is either RENDERED-GEOMETRY-vs-terrain (187 croc
  submerged, 202 vultures clipping, 190 Lake Edward floating, 185 scavenger,
  196 drinkers) or LIVENESS (188 predator pacing, 201 calf stuck, 193 idle
  standoff, 191 foreign family) — neither systematically swept. THREE additions,
  all cost-light (NO agent fan-out — pure/live checks + me inspecting
  screenshots in the main loop; the point-200 token concern applies):
  (A) ANCHORING INVARIANT — the highest-value one. A render hook exposes, per
  rendered animal/bird/prop each frame, its world (x,z), the LOWEST point of its
  POSED+SCALED mesh (bounding-box min-y after the live pitch/roll/scale — for a
  bird that means the pecking head and the spread wing tips), and a support
  point. A driven sweep over all regions asserts for every rendered thing: its
  lowest point is NOT below the sampled ground at its footprint (no clip — sample
  under the wing/limb EXTENTS, not just the centre), it is NOT far above the
  ground with nothing under it (no float), and a water-dweller sits at the
  rendered water SURFACE (no submerge/hover). This single check catches
  187/202/190/185/196 and their future recurrences.
  (B) LIVENESS INVARIANT — the deferred I3/I4 generalised. Over a long driven +
  staged observation, track each actor's position and state; flag any actor in a
  LIVE state (a hunt mode, a leave, a chase-victim, a caught, a finished feed)
  whose position is FROZEN (variance ~0) or OSCILLATING (paces a short segment)
  past a calibratable deadline, and any predator within touch range of LIVE prey
  where for a window neither engages nor flees. Catches 188/201/193 and kin.
  Extend (A) to STATIC water bodies too: every lake sheet / marsh fan sits at or
  just above its own bed and no edge vertex hangs over the lower neighbouring
  terrain (retro-catches 190 Lake Edward, 189 Sudd) — the same geometry-vs-terrain
  idea applied to the placed water, swept over all 8 lakes + the natural sites.
  (C) VISUAL SCREENSHOT SWEEP + INSPECTION — the catch-all for what the
  invariants do not anticipate, done the way the USER finds them but
  exhaustively: drive to a diverse set of spots and STAGE each drama (hunt,
  rescue, crocodile, trample, drink, flood, each biome/season), screenshot each,
  and VISUALLY inspect every image for anomalies (buried / floating / overlapping
  / mis-posed / wrong-looking things). Each anomaly → verify against the code →
  file a real one as its own point + fix. Keep a checklist of scenes so the sweep
  is repeatable and grows.
  KEEP THE VIRTUAL EYES OPEN FOR "LOOKS-WRONG" ODDITIES (user directive
  21.07.2026): the inspection must catch not only functional bugs but things that
  are functionally FINE yet look WEIRD to a human eye — the aesthetic/plausibility
  class the user keeps spotting: the stepped coastline (209), the sea-arm poking
  into the desert (210), a river that stops short of the sea with a beach gap or a
  notch punched in the water (211), and any similar "it works but it's ugly/odd"
  artefact (jagged edges, seams, holes, mismatched scale/colour, an object that
  reads wrong even though nothing errors). These pass every functional check, so
  ONLY the eye finds them — treat "does this look right to a human?" as a
  first-class question on every frame, and file each real one as its own point.
  (D) CROSS-SYSTEM / TARGETING SANITY — the class where a reaction or event fires
  for the WRONG actor or situation (derived from the past reports 162 a flock
  descends on a family the parent just SAVED, 168 carrion not shown when it
  should be, 191 a foreign family chases the hunter, 194 the lion claims the
  crocodile's prey). Invariant: every emergent system OWNS a unique actor (no two
  claim one — the 194 seam), and every reaction is KEYED to its correct trigger
  (only the victim's OWN parent charges/shields; a kill-flock forms only over a
  real feed or remnant; a scavenger commits only to an unowned carcass). Track,
  each frame, the (system → actor) map and the (reaction → trigger) link across a
  driven + staged run and assert no shared claim and no mismatched reaction.
  (E) VISIBLE-EFFECT / "the picture, not the uniform" — the point-147 lesson made
  a standing check (three rounds of uniform-level checks once passed while the
  player saw NOTHING; also 143 rain inside a settlement, 144 plants change,
  164/167 season/rain transitions): for each state toggle (season month, rain,
  flood, harmattan, fire, dress, dry-season bleach) assert the RENDERED frame
  changes measurably in PIXELS between the two states at a spot that should show
  it, AND that the state does NOT leak where it must not (no rain in a rainless
  desert, the season is the PLACE's not the traveller's). Pixel-diff based, a
  small fixed scene set. Retro-catches the whole "passes numerically, invisible
  on screen" family.
  (C) IS THE PRIMARY NET, NOT A FALLBACK (user insight 20.07.2026: "Es kann nicht
  sein, dass ich eine Minute zufällig drauf los laufe und mir direkt mehrere Bugs
  ins Auge springen, obwohl du gerade eine aufwändige Härtung vorgenommen hast").
  The invariants only find what I THOUGHT to check; the game is visual + emergent,
  so the reliable net is to LOOK at it the way the user does — but exhaustively.
  Make (C) a DENSE, standing, repeatable sweep: a grid of locations (each biome,
  each named place + landmark, coasts, river banks, lakes, the graveyard) × a set
  of staged situations (each drama, drink/bathe, flood, fire, each season/weather).
  CRITICAL (user 20.07.2026): a jump to a spot is only the POSITIONING — most bugs
  appear only while MOVING and OVER TIME (pop-in, plants jumping, the predator
  pacing, the calf snagging while it flees, streaming/edge artefacts). So at each
  spot DRIVE (hold a walk, and also a longer traverse across the region) and
  capture a FILMSTRIP of frames along the path, and LET the emergent dramas play
  out — capture a temporal SEQUENCE over several seconds, not one static shot. The
  static shot serves only the anchoring class; the driven filmstrip + the drama
  sequence are what catch the movement/emergent bugs. I VISUALLY inspect every
  frame (and the frame-to-frame deltas) for anything that looks off, logging each
  anomaly. Aim for the coverage a human would need hours of play to hit.
  TIME AXIS (user 20.07.2026): the sweep also varies the CALENDAR — MONTHS and
  YEARS (1890-1895) — and checks the weather/season effects AND THEIR TRANSITIONS
  are correct at the right place: harmattan Sahel Jan-Mar vs Aug, Atlas snow Feb
  vs Jul, the Nile flood crest Oct vs low Apr (at Aswan), the Okavango flood in
  the local-dry Jul vs Jan, equatorial ice, hail only in a heavy storm, the
  rinderpest years vs a clear year, the dry-season bleach vs the wet green, and
  the border-easing of rain (167). Sample intelligently — each feature at its
  PEAK month and an OFF month at its OWN location, plus a couple of stepped
  transitions to see the ease-in — not the full month×place cross product.
  BACKEND AXIS: run the whole sweep on BOTH WebGL2 AND the real WebGPU (the
  system-Chrome lane) — some visual bugs are WebGPU-ONLY (175 crown jitter, 181
  silhouette float) and never show on the headless WebGL2 path the first pass
  used.
  FULL DIMENSION SET (thought through 20.07.2026 — the sweep varies ALL of these,
  sampled intelligently, not the full cross product):
   1. LOCATION (biome, named place, coast, river bank, lake, landmark, graveyard).
   2. SITUATION/EVENT (each drama: hunt/rescue/sacrifice/crocodile/trample/vigil;
      drink & bathe; the weather events: flood, fire, hail, lightning).
   3. MONTH (season/weather + the transitions between them).
   4. YEAR 1890-1895 (rinderpest years, the deadline stages, the flood cycle).
   5. BACKEND (WebGL2 + real WebGPU).
   6. MOVEMENT (static vs a driven filmstrip — the movement/streaming bugs).
   7. ZOOM — the big one: the pop-in / streaming / far-sheet / haze / flora-edge
      class is ZOOM-DEPENDENT (164/171/172/183). Sample the achievable 0.25 & 0.5
      AND the unlocked wide debug zooms up to the whole-continent view; a bug at a
      wide zoom is invisible at 0.5 and vice versa.
   8. SCENE/PERSPECTIVE — the other big one: everything so far is the bird's-eye
      TRAVEL scene, but the FIRST-PERSON SETTLEMENTS are a whole scene with their
      own classes (walker stuck 155/198, collision/clipping into walls 16, dense
      building fabric, inhabitants using dwellings, the §2.5 panorama + its
      wildlife 181, the skyline landmarks). Sweep each port + a sample of villages:
      walk around inside, press against walls, watch the inhabitants and the
      panorama. Also the bird's-eye ⇄ settlement TRANSITION.
   9. PLAYER STATE — the rendered traveller changes: canoe RIDDEN on water vs
      DRAGGED on land, the wound on the figure by severity, swimming chest-deep,
      the item-in-use glow, afflictions. Sweep the canoe on water AND land, a
      wounded figure, a swim.
   10. TIME OF DAY / SUN — if the sky/sun varies within a day (verify), sweep the
      lighting extremes; else note it is fixed.
   11. TRAVEL DIRECTION / CAMERA HEADING — the panorama capture is bearing-
      dependent (82/99); drive several headings.
  The two most important additions are ZOOM (7) and the SETTLEMENT scene (8) —
  neither was in the first pass, and both hide whole bug families.
  SAMPLING METHOD (user 20.07.2026 — the dimensions span a huge space that can
  only be grazed; a principled sample beats a sparse grid). Three ideas combined:
   • SPLIT BY COST. The automated invariants (A/B/D/E/F-N) are CHEAP (pass/fail,
     no human) — run them on a DENSE sample (many location×time×zoom points, even
     thousands). The VISUAL inspection (C) is EXPENSIVE (my eyes) — sample it
     SPARSELY but smartly, and reserve extra visual budget for wherever an
     invariant already flags something. This alone reallocates most of the space
     to the cheap axis.
   • TARGETED for CAUSALLY-LOCATED effects. Weather/season/flood/dress/rinderpest
     do not need a cross product — each effect lives at KNOWN coordinates. Drive
     the effect→coordinate map from docs/climate-1890.md and design.md §19.13:
     each effect at its PEAK month + an OFF month + one stepped TRANSITION, at its
     OWN place. Exact and complete for that family, ~40 cases, no combinatorics.
   • PAIRWISE (2-wise) COVERING ARRAY for the GENERIC dimensions (location,
     movement, zoom, backend, scene, player-state, heading). Empirically the large
     majority of bugs are triggered by ONE factor or the interaction of TWO — a
     covering array that hits every PAIR of dimension-values needs only ~dozens of
     cases (generate with IPOG/AETG-style greedy), not the full product, yet
     catches all 1- and 2-factor interactions. Generate the array in the finder.
   • RISK-WEIGHTED + ADAPTIVE on top. Over-sample the known-hot regions (coasts,
     water edges, the dramas, the exact user-reported spots) and the
     recently-CHANGED code; and DENSIFY around any anomaly a pass turns up (an
     invariant flag or a visual hunch) — a second, finer sample in that slice.
   NET: dense-cheap invariants + a pairwise+targeted+risk visual sample (~100-150
   inspected scenarios) + adaptive follow-up — good coverage at a feasible cost,
   instead of a false-comfort sparse grid. This is the honest answer to "why did a minute of walking beat
  the hardening"; A/B/D/E are the cheap automated first pass under it.
  MORE INVARIANT CLASSES (derived by thinking through what else can look wrong —
  the cheap automated complements to the visual sweep):
   - (F) FACING/ORIENTATION: a moving animal's rendered facing tracks its
     velocity (no walking backwards/sideways); a figure/sign/door faces a sane
     direction (doors already checked — extend to animals + props).
   - (G) SCALE/PROPORTION: every rendered thing is within its species/type size
     band; a calf is smaller than its parent; no giant/tiny outlier; a landmark's
     apparent size is plausible.
   - (H) STATIC-OBJECT OVERLAP: no two solid statics interpenetrate (buildings,
     rocks, large flora, props, landmark meshes) and no label overlaps a monument
     — the I6 idea applied to the non-animal scene.
   - (I) MATERIAL/COLOUR: no pure-black or magenta (missing-texture) pixels where
     geometry renders; no z-fight flicker on a static camera (temporal diff);
     colour plausible per biome (no snow in the desert, no bone-dry tropics).
   - (K) WATER CONTINUITY/FLOW: rivers stay one unbroken descending ribbon (no
     gap, no uphill run, flow direction matches the descent) — extend the pt-21
     checks with a monotonic-descent + flow-direction assertion.
   - (N) TELEPORT/FROZEN: no rendered thing jumps > a threshold in one frame (the
     179/183 tunneling/pop class, generalised); a MOVING animal's animation phase
     advances (no frozen T-pose).
  BUILD ORDER: (A) first (retro-catches the most, cheap), then (B), (D), (E), the
  cheap extras (F/G/H/I/K/N) as they fit, and (C) the dense visual sweep as the
  standing pre-closing pass — run the WHOLE finder before the final closing.
  Across all classes this would have caught the great majority of the past
  emergent-scene reports without the user ever seeing them. Run the whole finder BEFORE the final
  closing so the batch of finds is fixed in one push. Each real find is its own
  atomic point/commit. Docs: CLAUDE §7.2 gains the anchoring + liveness invariant
  suites; this is the pillar the harness was missing.
  DONE (A) 21.07.2026 — the anchoring tripwire is BUILT and it immediately paid
  for itself. Implementation: a throttled (~1/13 per frame) dev-only assert in
  the wildlife render loop compares each rendered body's height against the
  terrain sampled at its OWN anchor (a.x/a.z), tolerances −0.75·scale/+2.5·scale
  (buried/floating), exemptions exactly mirroring the water-sweep's drama locks
  (plus drink until 196) so scripted poses are never flagged; violations go
  through the 207(i) devAssert channel and fail ANY suite. A `grounded` gate
  (set on the animal's first water-sweep visit, which now HARD-sets the standing
  height instead of easing) keeps test-staged injections with hard-coded y from
  false-firing before their first sweep correction. WHAT IT CAUGHT (the real
  class bug, fixed in the same commit): movers carried STALE standing heights —
  every follow/flee/dodge/guard/charge/vigil step updated x/z but not y, so
  on any slope the whole background herd slowly sank into (or floated off) the
  earth as it drifted; the worst case was the ordinary calf-follow step (every
  background calf tails its parent). Fixed by making EVERY mover carry its own
  ground height (land only — water occupants belong to their dramas), including
  the two sweep-skipped rescue-parent walks (the land approach to a calf in the
  water and the escort back), and by refreshing the locally captured render
  height in the same frame a correction lands (no one-frame buried render on a
  long-dt hitch). Proof: enrichments 207 pass / 0 fail / 0 console-errors with
  the tripwire armed; build+lint+vitest+audit clean. (B)-(N) and the visual
  sweep (C) remain open above.

- [ ] 207. ADDITIONAL FINDING METHODS that complement the existing audits (Pillar
  2 code, 203 visual/behaviour, 205 plausibility) and together lift coverage
  sharply (user request 20.07.2026). The existing net is designed-scenario
  invariants + an inspected visual sweep + static review; these orthogonal METHODS
  raise sensitivity a lot:
   (i) [DONE 21.07.2026] IN-GAME INVARIANT ASSERTIONS — built as
     src/systems/devAssert.ts (dev-only, per-code rate limit, console.error so
     EVERY suite's console-error gate fails on a violation, window.__assertLog
     for probes; 3 pure tests). First invariants live, piggybacked on the
     water-sweep slice at no extra pass: finite positions, the crossing/caught/
     croc-grip deadlines (I4 made loud). Proven silent across two full
     enrichments runs (207/0 incl. every staged drama). Extend the invariant
     set opportunistically as systems change. ORIGINAL: the biggest force-multiplier. Instrument the
     game code with DEV-MODE assertions that fire the MOMENT a rule breaks,
     ANYWHERE (no animal rendered below its ground; no NaN/Infinity position;
     every started drama carries a deadline; a lake sheet never below its bed;
     herd counts within bounds; nothing on impassable ocean). One __assert channel
     to the console → every test run AND every manual play session becomes a
     detector, not just where a test happens to look. Turns silent corruption
     loud. DO THIS FIRST — it multiplies every other test's and the user's own
     play's sensitivity at once.
   (ii) GOLDEN-IMAGE DIFFERENTIAL — cheap automated visual regression: bake a
     baseline of the 203 sweep frames; future runs DIFF against them and flag any
     unintended pixel change. A no-inspection alarm that a fix did not break the
     look elsewhere; complements the inspection-heavy sweep.
   (iii) PROPERTY FUZZING + DISTRIBUTION CHECKS — random-sample the state space
     (positions, months, states) and run the cheap invariants on thousands of
     random states (edge cases the designed grid misses); over a long run collect
     distributions (hunt directions, calf ratios, drama outcomes, spawn counts)
     and assert they are not degenerate (the 135/169 variety class).
   (iv) SOAK / ENDURANCE — fast-forward a LONG sim run with the invariants +
     assertions live, watching for leaks, herd ballooning, drama accumulation,
     slowdown, drift (bugs that only surface after long play, e.g. the 186 pin).
   (v) METAMORPHIC RELATIONS — checks needing no golden reference: a round trip
     A→B→A returns to the same state; the same scene at two zooms shows the same
     animals; month X and X+12 look the same; leave-and-re-enter is stable.
   (vi) AUTOMATED PLAYER-JOURNEY across seeds/strategies — extend the one E2E flow
     to many, asserting the goal stays reachable, the hint cascade always leads
     there, no softlock, the deadline beatable.
   (vii) CONSOLE/TELEMETRY MINING — scan every run's console for warnings / NaN /
     shader-recompile / dropped-frame / THREE-deprecation noise, fail on new ones.
  BUILD ORDER: (i) then (ii) first (highest leverage), the rest layer in over the
  finder. These join 203/204/205 as the pre-tag quality framework.

- [ ] 184. PRE-TAG HARDENING — a MUCH stronger, systematic quality pass to reach a
  high-confidence bug-free state before the final closing run and the v0.2 tag.
  User decision 19.07.2026, after a cluster of elementary-functionality bugs kept
  surfacing in play (178 vultures pop in; 179 a lion tunnels through parent + calf;
  180 elephants wedge at a shore; 181 skyline fauna float; 183 animals pop into the
  frame while driving) DESPITE point 173's quality push. Runs AFTER the individual
  fixes 178-183 and hunts what remains.
  EXECUTION (user-approved 19.07.2026): run 184 with ULTRACODE (multi-agent
  Workflow orchestration) on OPUS 4.8, effort HIGH — xhigh for the design/audit
  phase (the invariant-harness architecture and the five-class sweeps), high for
  implementation; trivial mechanical sub-stages (the WebGL2 smoke scaffold, blunt
  test skeletons) may drop to a cheaper model / low effort via per-agent override.
  The audit sweeps and the adversarial finding-verification are the reasoning heart
  — keep those on Opus 4.8. First step is the WebGPU lane (Pillar 3); it may be
  pulled forward if needed to verify a play-test fix (e.g. 181's likely
  WebGPU-specific float).
  WHY 173 DID NOT CATCH THESE — the gap 184 must close: 173 hunted PURE-LOGIC test
  gaps and added ~90 VITEST tests. Vitest runs in jsdom — no 3D scene, no camera,
  no RAF wildlife, no rendering — so it is STRUCTURALLY BLIND to this whole class
  (pop-in, float, wedge, tunnel, unresolved drama), which lives only in the live
  browser scene. 173 ran the EXISTING Playwright checks (and tiered them) but added
  NO systematic, world-wide, CONTINUOUS invariant sweep; the existing browser
  checks assert SPECIFIC scenarios at SPECIFIC spots, and some measure by PROXY (a
  radius, a wall-clock wait) so they stay GREEN while the player sees a bug (183:
  the point-165 check is green at its Maasai spot while the real pop is elsewhere).
  And nobody ran ADVERSARIAL PLAY across the world — exactly how the user found
  them. So 184 attacks the LIVE-SCENE / EMERGENT / VISUAL layer systematically, not
  with more pure-logic tests. THREE PILLARS:
  PILLAR 1 — a CONTINUOUS-INVARIANT "long adversarial play" harness (the core new
  work; a new LARGE-tier suite, e.g. scripts/verify/invariants.mjs). ONE Playwright
  session drives a LONG scripted traversal that crosses EVERY region and biome
  (debugJumpTo between region waypoints, then drive with KeyW + turns while
  SWEEPING THE FULL STANDARD ZOOM RANGE 0.25-0.5 — both the closest 0.25 and the
  widest-standard 0.5, and points between — NEVER a debug wide zoom. BINDING (user
  19.07.2026): everything must work across the WHOLE standard-mode zoom range; a
  green result at only one level, or at a debug zoom, does not count — that
  praxisfremd-zoom testing is exactly what hid bugs the player saw (183). If point
  182 lands first, the standard range starts at 0.125), forces BOTH dry and wet
  seasons at each, enters/leaves
  several settlements, drives river corridors (the Nile end to end), and provokes
  the dramas (inject predators/calves/crocodiles as the existing checks do). EVERY
  FRAME it evaluates GLOBAL INVARIANTS over the live state
  (__wildlife/__camera/__player/__vegetation/__rivers), judged by PROJECTION
  (__camera.onScreen/ndc) and the SIM CLOCK (simTime), and FAILS with full context
  {simTime, invariant, species, pos, ndc} on the FIRST violation:
    I1 NO POP-IN — every animal is off-screen the frame it first joins the herds,
       land AND river, achievable zoom (178/183 class).
    I2 NO FLOAT — every rendered figure / silhouette / landed bird / dragged hull
       foot-y is at its ground/horizon anchor, |delta| bounded (181/128 class).
    I3 NO WEDGE — no animal/inhabitant with a move target stays within epsilon of
       its position past a bounded stuck window (180/155 class).
    I4 NO UNRESOLVED DRAMA — every started drama (caught calf, lunge, charge,
       vigil, mourning, trample, plunge) resolves within its window (179/121 class).
    I5 NO ANIMAL ON IMPASSABLE WATER/OCEAN outside the sanctioned water dramas.
    I6 NO BODY INTERPENETRATION beyond the design.md 19.5 separation threshold.
    I7 NO PREDATOR TUNNELING — a predator that reaches its victim resolves
       (catch/contact/drive-off), never passes through, dt-robust at a big clamped
       dt (179 class).
    Each invariant is ALSO a PURE predicate unit-tested in Vitest with crafted
    states, so the rule itself is testable and the live pass only wires it to the
    scene.
  PILLAR 2 — a SYSTEMATIC CODE AUDIT of the five recurring failure classes, run as
  SEVERAL PARALLEL SUBAGENT SWEEPS (the 173 analysis pattern, aimed at the
  scene/emergent layer), each READING its area and reporting findings WITH CODE
  EVIDENCE: (A) every spawn/despawn/seed/stream path gated by an ASSUMED RADIUS
  (viewR / fog.far / 100x-zoom / a hard-coded distance) instead of the projected
  frustum; (B) every wedge/pin site (water, terrain corners, buildings, props,
  bodies, settlement edges); (C) every ground/horizon anchor (feet vs centre,
  slope/scale lift, with/without a capture); (D) every catch/charge/lunge/
  swept-resolve for dt-tunneling and non-resolution; (E) every live check in
  scripts/verify/*.mjs judging "in view" by a radius or waiting by wall-clock
  instead of projection/sim-clock. Each confirmed finding is fixed and covered by a
  Pillar-1 invariant or a pure test; a non-trivial one may become its own TASKS
  point + atomic commit; small ones fixed inline. LOG every finding.
  MODEL MIX (user decision, 20.07.2026): run the audit sweeps with a MIX of Opus 4.8
  AND Fable 5 agents (Workflow `opts.model: 'opus'` / `'fable'`) — NOT for a proven
  Fable capability edge (unverified, its name hints at a different specialisation) but
  for MODEL DIVERSITY: the code was written mostly by Opus, so a different-model auditor
  carries different blind spots and catches what the author-model is systematically
  blind to. Distribute the five sweeps (A-E) across both models; where budget allows,
  double-cover a sweep with one agent of each so the two lenses overlap on the same area.
  PILLAR 3 — an AUTOMATED WEBGPU LANE (the headless-WebGPU breakthrough,
  19.07.2026 — this replaces the old "manual checklist because headless can't do
  WebGPU"). PROVEN: WebGPU IS testable headless AND autonomously — launch SYSTEM
  Chrome (Playwright channel:'chrome') with --headless=new + --enable-unsafe-webgpu
  + --enable-gpu and navigate to a localhost (SECURE-CONTEXT) page; the game then
  runs on the REAL WebGPU backend (measured: __renderer.backend.isWebGPUBackend =
  true, webglFallback = false, a correct ~548 KB scene screenshot, ZERO console
  errors, on the NVIDIA GPU, no window). The old belief was a Playwright
  BUNDLED-Chromium limitation (its headless requestDevice fails), not a principle.
  BUILD a WebGPU LANE into the verify harness — a launcher switch: bundled-chromium
  / WebGL2 (as today) PLUS system-Chrome / WebGPU — and run the Pillar-1 invariant
  harness AND the acceptance screenshots on the WebGPU backend, ASSERTING the
  backend really is WebGPU (isWebGPUBackend, never a silent fallback). This catches
  the WebGPU-ONLY classes autonomously: the point-175 crown jitter, the reverted
  TRAA/SSR black-screen (pt.32), any backend-specific race. Keep the WebGL2 lane
  too (the game ships both). This is the FIRST step of 184 — Pillars 1-2 gain their
  real teeth once the invariants run on the actual WebGPU backend the player uses;
  and as the lane's own proof, try to REPRODUCE point 175's jitter headless on it.
  A tiny manual note remains only for what even the WebGPU lane cannot see (a
  subjective look call). Caveat: needs a real GPU + Chrome (present on the user's
  machine); flag if a GPU-less CI would fall back.
  BUILD NOTE (scoped 20.07.2026, from the harness): all ~15 verify suites currently
  launch their OWN browser with the identical line `const browser = await
  chromium.launch({ args: ['--enable-unsafe-webgpu','--use-angle=d3d11','--enable-gpu']
  })` — Playwright's BUNDLED Chromium, which silently runs WebGL2 headless despite the
  flags. So the lane is a small, mechanical refactor: (1) add scripts/verify/_browser.mjs
  exporting `launchVerifyBrowser()` that reads an env switch (e.g. VERIFY_GL) — 'webgpu'
  -> `chromium.launch({ channel:'chrome', args:['--headless=new','--enable-unsafe-webgpu',
  '--enable-gpu'] })`, 'webgl' -> today's bundled line — plus `assertBackend(page,'webgpu')`
  reading `window.__renderer.backend.isWebGPUBackend` and THROWING on a silent fallback
  (the guardrail); (2) replace each suite's launch line with the helper and call
  assertBackend right after the game first loads (after the initial waitForFunction
  (window.__game)); (3) in run-all.mjs (launchServer is at ~line 102) loop the suite runs
  over the backend dimension per the TIER DESIGN below and set VERIFY_GL. Do NOT hand-edit
  15 files ad hoc at the end of a session — this is Pillar 3's structured job (validate
  WebGPU-headless holds under FULL-suite load + determinism first, per conditions a-c).
  PROGRESS (20.07.2026, commit 4cc4049): step (1) DONE — scripts/verify/_browser.mjs
  built with launchVerifyBrowser (VERIFY_GL webgpu=system-Chrome+--headless=new /
  webgl=bundled+ANGLE, default webgl during roll-in) + assertBackend (throws on a
  silent fallback via __renderer.backend.isWebGPUBackend). Step (2) STARTED — settings.mjs
  is the first converted suite and the lane is PROVEN END-TO-END: settings runs the FULL
  suite on the REAL WebGPU backend under system Chrome (webgl default 30/0 unchanged;
  VERIFY_GL=webgpu ran with assertBackend confirming WebGPU — no silent fallback). FIRST
  CATCH (the lane's value shown immediately): under WebGPU the 5 lion-feed checks fail
  with ALL-ZERO animation values (head pitch 0, prey-side 0, stain scale 1.0) — the
  render loop is still cold in the checks' wall-clock window (WebGPU shader compile), a
  TEST-ROBUSTNESS gap (the point-177 sim-clock discipline not yet applied to settings'
  feeding block), NOT a game bug (the feed plays on real WebGPU hardware). REMAINING:
  make the timing-sensitive checks WebGPU-robust (wait for the render loop to warm /
  sim-clock the sampling), convert the other suites the same way, wire run-all.mjs's
  tiers over the backend dimension, then flip the default per conditions a-c. This is
  the flagship's determinism work — continue with fresh focus, not rushed.
  PROGRESS 2 (20.07.2026): the feed catch CLASSIFIED as TIMING and fixed WebGPU-robust
  (poll for the depiction; commit a10607f) — settings 30/0 on BOTH backends. Then the
  four biggest/most-diverse suites are on the lane: settings (first-person), enrichments
  (wildlife — 202/0 on WebGPU FIRST TRY, the point-177 sim-clock already hardens it,
  commit 7d48fb6), flow (core loop — 32/0 on WebGPU) and collision (settlement, commit
  6a12035). collision surfaced 8 more timing-class catches: 7 EJECTIONS (push from a
  collider centre to the surface) starved by a fixed pushFrames on the slower WebGPU
  frames — fixed with a poll-based pushUntilClear (webgl 20/0, webgpu ejections pass).
  The PATTERN is now clear and repeatable: render-loop-driven behaviour read via a
  fixed wall-clock window fails on WebGPU's colder/slower headless frames; the fix is
  always to POLL for the behaviour (never a bigger fixed wait — a naive settle bump to
  fix the 8th catch, the chief-hut door LATCH re-arm, let a walker drift onto a door
  standpoint and flaked webgl, so it was reverted). OPEN Pillar-3 items: (i) the
  collision operable check needs a proper latch-aware / walker-robust poll rework so
  the chief-hut door opens on WebGPU without perturbing webgl (currently webgpu 19/20);
  (ii) convert the remaining 9 suites (events/health/voice/i18n/polish/gamepad/
  handwriting/touch/preview) applying the same poll pattern to any timing-class catch;
  (iii) wire run-all.mjs's tiers over the backend dimension; (iv) flip the default per
  conditions a-c. The lane itself is comprehensively PROVEN; the rest is the systematic
  grind — fresh focus.
  PROGRESS 3 (20.07.2026, commits 4c41447 + 2b16df0): ALL 12 DEV SUITES converted to
  the lane (settings/enrichments/flow/collision/events/health/polish/voice/i18n/
  gamepad/handwriting/touch — only preview, the prod-build suite, is left). webgl green
  across all (the default is unchanged). On WebGPU: settings/enrichments/flow/events/
  health/i18n GREEN; the timing-class catches fixed via the poll pattern were the feed,
  the 7 collision ejections and the vulture-circling check. The remaining WebGPU
  catches are ALL the SAME timing class and now clearly a SYSTEMATIC rework rather than
  one-offs: (a) the input-driven suites gamepad (5)/touch (3)/voice (1)/handwriting
  read moved 0.00 / yaw 0.00 / hang because synthetic input -> render-loop movement is
  not processed in a fixed wall-clock window on the slower/colder WebGPU headless
  cadence — every such check must POLL for the movement/yaw/interaction to happen; (b)
  the collision operable chief-hut door (latch re-arm — a naive fixed-settle bump
  traded it for a webgl walker-drift flake, so it needs a latch-aware/walker-robust
  poll); (c) the polish "direct enter falls back" capture reads active true and STAYS
  true past a 15 s poll — a DEEPER, non-timing WebGPU finding (a panorama capture
  persists on a direct place->place enter on WebGPU where WebGL2 falls back), to be
  investigated (real capture-caching difference vs a test-ordering artifact). NEXT
  (the flagship's core, fresh/deliberate — ideally the Ultracode workflow the user
  approved for 184): (1) systematically poll-ify the input/RAF checks + the operable
  rework; (2) investigate the polish capture finding; (3) convert preview + wire the
  run-all tiers over the backend dimension + flip the default; (4) Pillar 1 (the
  continuous-invariant harness) and Pillar 2 (the audit sweeps) — still untouched, the
  bulk of 184's original scope. The WebGPU lane (Pillar 3's foundation) is DONE and
  PROVEN; what remains is the methodical determinism rework + Pillars 1-2.
  PROGRESS 4 (20.07.2026, commits 83f7682 + b45ade8): the SIMPLE timing class is now
  fixed and its poll pattern proven — gamepad's 5 input checks (stick/yaw/journal/
  interact) were poll-ified with two reusable helpers, holdAxesUntil (hold a stick and
  poll the check's own condition, then centre) and pulseButtonUntil (pulse a button on
  clean edges until its effect lands), and gamepad is now 9/0 on BOTH backends;
  handwriting's WebGPU HANG (a bare .entry.writing click waiting on actionability) was
  removed with a force+timeout+catch click (now 9/1, was a hang). But the OTHER input/
  RAF suites turned out to be DEEPER, system-Chrome-specific findings, NOT the simple
  timing class (a poll fix for touch made it WORSE and was reverted): (a) touch — the
  CDP Input.dispatchTouchEvent injection produces NO movement at all under system
  Chrome + WebGPU (holding the finger through a 15 s poll still read moved 0.0), so it
  is a CDP-touch/system-Chrome incompatibility, not frame starvation; (b) voice — the
  Kokoro TTS never reaches the speaking state under system-Chrome-WebGPU, so its
  300000 ms speak-state waits hang the suite; (c) handwriting's click-to-finish still
  fails (9/10); plus the earlier (d) collision operable chief-hut latch (19/20) and (e)
  polish capture-persistence. These five are genuine investigations (system-Chrome CDP/
  TTS quirks vs real issues), NOT quick polls — do them deliberately, not rushed. So
  the honest 184 state: Pillar 3's lane + the tractable timing-class rework are DONE;
  the deeper findings (a-e), preview + the tier wiring + default flip, and Pillars 1
  (invariant harness) and 2 (Ultracode audit) — the bulk of 184's original scope —
  remain, best as a fresh/deliberate effort.
  PROGRESS 5 (20.07.2026, commit 50ea09d): preview (the prod-build suite) routed
  through launchVerifyBrowser too — ALL 15 verify suites now use the shared lane
  launcher; the webgl default is byte-identical so the normal regression is unchanged
  (preview has no DEV __renderer, so no assertBackend — its WebGPU validation goes with
  the tier wiring). READ-ONLY PREP for the touch finding (a): the virtual stick
  (src/ui/TouchControls.tsx) drives movement through POINTER events — onStickDown does
  setPointerCapture(pointerId) and records the origin, onStickMove fires setTouchStick
  ONLY when `stickPointer.current === e.pointerId`. So the likely reason CDP touch
  produces no movement under system-Chrome-WebGPU is a pointer-synthesis difference:
  the touchStart/touchMove may synthesise INCONSISTENT pointerIds (so onStickMove's id
  guard rejects the move), or setPointerCapture rejects the synthetic id, or the hit
  test misses .touch-stick. Confirming needs LIVE instrumentation on system Chrome
  (log the pointerId/target reaching onStickDown vs onStickMove) — not a read-only
  deduction and not a blind poll; do it deliberately.
  PROGRESS 6 (20.07.2026): tried the live pointer diagnostic but run-all.mjs FILTERS a
  suite's stdout to the PASS/FAIL lines, so a console.log('PTRDIAG …') is dropped —
  seeing it needs a DIRECT run against a standalone dev server (extra plumbing). The
  KEY insight makes that unnecessary for the resolution, though: the exact pointerId
  cause does not change the outcome. touch's arm TAP (touchStart+End) works but its
  stick/drag (touchStart+MOVE) does not, and voice's TTS never reaches the speak state
  — both are system-Chrome-HEADLESS limitations (CDP touchMove/pointer-capture and the
  Kokoro WASM speak-state), not game bugs. RESOLUTION (a user tier-design call, flagged
  in the dashboard's "Von dir zu klären"): run touch + voice WebGL2-ONLY and the other
  13 on WebGPU+WebGL2 — legitimate under condition (a) (the WebGL2 fallback is tested
  regardless), but it DEVIATES from "GROSS = all suites on both backends", so it needs
  the user's ok (or the alternative: a deliberate workaround — synthetic pointer events
  for touch, an alternative TTS speak detection for voice). This resolves findings (a)
  touch and (b) voice into a tier decision; (c) handwriting click-finish, (d) collision
  operable latch, (e) polish capture-persistence remain smaller investigations.
  DIRECTION (user 19.07.2026, "run all browser regression on WebGPU?"): make
  WebGPU the PRIMARY/default browser-regression lane — it matches what the player
  runs and catches the WebGPU-only class across the WHOLE suite, not just a special
  test. THREE conditions before flipping the default: (a) KEEP a WebGL2 lane — the
  game ships the WebGL2 fallback for WebGPU-less hardware (CLAUDE §3), so it must
  not go untested (at least a smoke subset every run, the full suite periodically);
  (b) VALIDATE DETERMINISM FIRST — a backend switch shifts every check's render/RAF
  timing profile (incl. the ~15 s WebGPU cold-load stall, App.tsx), and since 177
  is entirely about timing determinism, confirm all ~200 checks stay green AND
  flake-free on WebGPU across several runs before defaulting, or a new flake source
  replaces the old; (c) MEASURE THE COST — the per-launch WebGPU cold-load slows
  the regression; quantify it and, if steep, keep the fast WebGL2 lane for the
  quick everyday gate and run WebGPU on the LARGE tier. Also revisit the
  __ttsForceWasm hook (CLAUDE §3): with a real WebGPU device present, decide
  whether the voice suite still forces WASM (the render-WebGPU vs onnxruntime-
  WebGPU GPU-process contention, point 117) or exercises the WebGPU voice path.
  TIER DESIGN (user 19.07.2026): SMALL runs the current small-tier suite set (point
  173's fast low-flake subset — same suites, same count) on WEBGPU, plus one WebGL2
  SMOKE test (init + a render screenshot + one core flow, so a grossly broken
  fallback is caught). LARGE runs ALL browser suites on BOTH backends — once on
  WebGPU, once on WebGL2 — plus the prod preview. Vitest stays the fast
  backend-independent inner loop. Prerequisites: 177's determinism landed and the
  suites proven green AND flake-free on WebGPU; measure the per-launch cold-load
  cost. Updates CLAUDE §5, scripts/verify/run-all.mjs and scripts/verify/README.md;
  the suite→tier map is unchanged — each tier gains a backend dimension.
  ACCEPTANCE: (1) the invariant suite (Pillar 1) exists, covers I1-I7 across the
  WHOLE standard-mode zoom range (0.25-0.5, both ends, NEVER a debug zoom — the
  user's binding 19.07.2026 addition specifically for 184), and is GREEN across at
  least THREE consecutive LARGE runs with NO rotating flakes (sim-clock/projection
  throughout); (2) every audit finding (Pillar 2) is fixed
  and regression-covered; (3) the full LARGE regression is green 3x flake-free; (4)
  the WebGPU lane (Pillar 3) runs the invariant harness AND the acceptance
  screenshots on the REAL WebGPU backend (isWebGPUBackend asserted, no silent
  fallback) and is green, with any residual manual-only item named; (5) a written
  summary of what was
  audited, found, fixed and the residual risk. Only THEN the final closing run,
  then the v0.2 tag (174). Docs: quality/process point; adds a CLAUDE 7.1 verifiable
  line for the new invariant suite and updates the CLAUDE 5/7.2 test architecture;
  the 172/177 disciplines. (Requested 19.07.2026 — "be significantly more
  thorough"; gates v0.2 together with 178-183.)
  PILLAR-2 FINDING LOG (read phase complete, harvested 20.07.2026; full "why"
  texts in the workflow journal wf_716721d3-a95). 51 deduped findings; the
  agent-verify phase was stopped on the user's token concern — each finding is
  verified INLINE at fix time instead. Disposition: 3 filed individually
  (Wildlife 736 → 187 croc-under-surface; Wildlife 3454 → 194 claim-steal;
  Wildlife 3614 → 188 leave-no-deadline, matches the user's ocean-pacing
  report); game-code groups → 195 (radius-not-frustum spawn/despawn: Wildlife
  3441, 3386, 1462+1465, 1084, 3432 + wildlifeBehavior 628, 282), 196
  (bed/ground-anchor depictions: Wildlife 2806, 2751, 2282, 913), 197
  (drama-state exclusions/gating: Wildlife 2091+2092, 3048, 2056, 2136, 1978,
  3340), 198 (PlaceLife 764 nudge failure), 199 (canoeDrag 152 pitch-clamp
  drift); the 26 verify-SCRIPT robustness findings (wall-clock/radius in
  enrichments 753, 928, 946, 969, 1058, 1092, 1141, 1146, 1292, 1671+1690,
  1973, 2375, 3027, 4071, 4102, 4182, 4544, 4611, 4756, 5335; polish 270;
  settings 183, 277; flow 242; voice 56; touch 75) → 200.

- [ ] 224. CONFIRM THE v0.2 CHECKPOINT IS SERVED (re-cut 10.08.2026 from the
  four-eyes work-order analysis; the original demanded work that is already done).
  The checkpoint itself SHIPPED: `git tag` carries `v0.2` at `bafd9b25` (24.07.2026),
  the `poc` tag has since moved on, and the Pages workflow enumerates every `v*` tag
  plus `poc` dynamically (`.github/workflows/deploy-pages.yml`) rather than through the
  hard-coded tag loop this point described. The tick was evidently lost in the
  24./25.07.2026 degradation repair.
  WHAT REMAINS: confirm that /v0.2/ and /poc/ both resolve and serve their frozen
  builds, then close this point. The v0.2 tag is FROZEN and is never re-pointed
  (`tags-only-on-request`) — this point may not cut, move or re-cut any tag.
  VERIFIABLE: two HTTP 200s with the expected build stamp, recorded in the closing
  evidence.
  Criticality: low — bookkeeping on a delivery that already happened.

- [ ] 615. THE NOT-RUN GATE IS DISARMED BY A COMMENT, AND THE BOOTSTRAP SKIPS ITS OWN
  LOCKFILE CHECK (four-eyes review of the landed point 573 by the second model,
  10.08.2026, verdict merge-with-fixes; both defects live-verified by the reviewer, not
  argued). Point 573 closed the false green where a spawn that never ran was read as
  "the linter rejected". Two holes remain in the mechanisms it delivered:
  1. `establishesRun` (`scripts/verify/spawnAssertion.mjs`) matches its RUN_ESTABLISHERS
     against the UNMASKED case text, while every other match in that module runs over
     `maskCode` output — the module's own rule that a string must never be mistaken for
     code. So a COMMENT naming the helper disarms the gate: a case that asserts a
     non-zero exit as a rejection, with `// TODO: route this through didRun once the
     helper lands` above it, yields zero findings. Two further spellings of the same
     defect also slip past: `expect(r.status !== 0).toBe(true)` (the boolean wrap) and
     `expect(r.status).toBe(1)` (the literal code).
     FINAL STATE: run-establishment is decided over MASKED text like every other match in
     the module, and the boolean-wrap and literal-non-zero spellings are recognised as
     the same assertion as `not.toBe(0)`. The alias and wrapper cases
     (`const { status: verdict } = spawnSync(…)`) stay outside the gate's reach and are
     NAMED as its documented limit rather than silently missed.
  2. `planBootstrap`'s `hasOwnDeps` short-circuit (`scripts/worktree-bootstrap-core.mjs`)
     returns "this checkout already has node_modules" BEFORE the lockfile hash is
     compared, so a worktree whose lockfile has since diverged — by its own change or by
     merging main's — keeps running its gates against the donor's dependency tree. That
     is precisely what the plan's own `lockDiffers` reason exists to prevent.
     FINAL STATE: the lockfile hash is compared whenever a linked or installed
     `node_modules` is already present, and a divergence installs for real instead of
     proceeding. A DANGLING link (the donor's tree deleted) is relinked or installed
     rather than throwing a bare EEXIST, and its message names the remedy.
  VERIFIABLE: pure Vitest — the comment-disarmed snippet above, the boolean wrap and the
  literal non-zero each produce a finding; a case that genuinely establishes the run
  produces none; and the plan for a present-but-diverged lockfile is "install", for a
  dangling link "relink or install", both with their reason. Plus the real proof for the
  bootstrap half: a worktree bootstrapped, its lockfile then changed, re-bootstrapped,
  and the resulting tree is the one its own lockfile describes.
  Criticality: medium — both halves restore a signal the fast layer is believed to give
  and does not, which is the same failure class point 573 was opened for.

- [ ] 616. THE IDLE MODES POINT 612 DOES NOT REACH (blind-parallel enumeration by both
  models, 10.08.2026 — CLAUDE.md §6 divergent stage; merged by meaning, and every item
  below is evidenced in `.claude/batch-launcher.log` or in the code it names). Point 612
  binds OWNERSHIP to work. Three further channels can hold the batch still while nothing
  is broken, each with a longer observed stall than the one 612 repairs:
  1. A CLAIM RESERVES WITHOUT WORKING. `assessClaim` honours a takeover claim for as long
     as its claimant's pid provably lives, and a window's pid lives for days — observed:
     `skip: session … has CLAIMED the batch 132 min ago`. FINAL STATE: the same idle
     arithmetic 612 applies to ownership applies to a claim — a claimant that shows no
     owner-attributable activity within the idle window stops reserving. One decision
     function owns both verdicts, so the two can never disagree.
  2. NOBODY WATCHES THE LAUNCHER. The daemon has no supervisor: its only arming path is
     the CLI `--start`, and it supervises the chat watcher rather than the other way
     round. If it dies while a headless owner runs and that owner then crashes without a
     boundary, no tick ever comes and the batch is orphaned until a human opens a window.
     FINAL STATE: a second, dumb leg — the chat watcher and every session-start hook
     re-arm a dead launcher, which `--start` already tolerates being called on a live one.
     One process death may not orphan the batch.
  3. AN EXTERNAL-INFRA PAUSE HAS NO CLOCK. A board page unreachable behind its CDN and a
     starved Actions runner both escalate to a deliberate pause that no clock ever ends —
     observed twice, and `skip: batch is paused with no restart clock` 21 times. The pause
     is right; parking forever is not, because the cause is external and transient by
     nature. FINAL STATE: an infrastructure pause carries a probe-and-resume clock and
     retries hourly; a pause whose cause is a DECISION (a degraded serving model, an open
     user question) stays clockless as it is today.
  WHAT STAYS THE NAMED RESIDUAL, deliberately not engineered at: an exhausted usage quota,
  a genuine user decision, and a container that is down — none is reachable from inside the
  repository, and the first two are correct behaviour rather than a defect.
  VERIFIABLE: pure Vitest per part (a claim without owner-attributable activity stops
  reserving at the window boundary while a working one does not; the re-arm is idempotent
  against a live launcher and starts a dead one; an infrastructure pause yields a next-probe
  time while a decision pause yields none), plus the chaos drill of point 449 gaining a case
  that kills the launcher and asserts the next session re-arms it.
  Criticality: high for unattended operation — each of the three has already cost more
  standing-still time than the failure 612 repairs.

- [ ] 617. AN OWNER THAT WORKS ONCE AND THEN IDLES STILL HOLDS THE BATCH FOR AN HOUR
  (four-eyes finding on point 612, 10.08.2026, recorded with its merge verdict). Point 612
  binds ownership to work, but its idle window only reaches a session that has completed
  NO call since taking the lock (`workedSinceClaim === false`). That restriction is right
  as far as it goes — the literal rule would dispossess a session in the middle of a
  30–40-minute regression, and each dispossession spawns a successor beside a working
  owner, which is the 24.07.2026 double-spawn as an everyday event. What it leaves open is
  the point's own sentence, "it either works or it releases": an owner that completes one
  call and then goes quiet keeps the batch for the full lease.
  FINAL STATE: idleness is decided by two facts instead of one — silence longer than the
  window AND no call in flight. The second needs its own stamp: `leaseUntil` cannot serve,
  because a declared wait extends it by up to four hours, so a renewal timestamp is written
  where the call actually renews and the idle verdict reads THAT. A session inside a long
  call is never dispossessed; a session that finished its last call and went quiet is, at
  the window. The decision stays in the one ownership function point 612 built, so no
  second arithmetic can disagree with it.
  VERIFIABLE: pure Vitest — a long call in flight holds the lock past the window; the same
  session with the call finished loses it at the window; a declared wait still holds; the
  boundary cases exactly at the window; and the renewal stamp is written by the real hook
  path, not only by the test.
  Criticality: high — it is the batch's ownership arithmetic, and getting it wrong either
  strands the queue or produces two live owners.

- [ ] 618. A MODIFIED KEY STILL DOES TWO THINGS AT ONCE OUTSIDE THE CALENDAR ROW
  (four-eyes finding on point 601, 10.08.2026, recorded with its merge verdict). Point 601
  closed this defect class for the calendar keys: a chord the game hands back to the browser
  must not ALSO run the game's own handler, or one press does two things and the game's half
  is silent. The reviewer found the class survives in three places 601 did not reach, all of
  them pre-existing.
  FINAL STATE:
  1. `onTab` in `src/ui/Hud.tsx` goes through the same modifier check as every other
     handler instead of bypassing `onKeyPress`. Today a windowed Ctrl+Tab switches the
     browser tab AND toggles the journal; Ctrl+Tab is not one of the three reserved chords
     the prevention path can swallow, so standing the handler down is the only cure.
  2. Meta counts as a modifier wherever Ctrl and Alt already do. On macOS the game acts on
     Cmd+G (dig), Cmd+C (pitch camp) and Cmd+M (map) while the browser or the OS runs its
     own command on the same press — the same one-press-two-things the point closed, and
     the comment in `src/systems/keyboardGuard.ts` claiming nothing a page does reaches
     these is true only of Cmd+W/T/N.
  3. The four YEAR-key registrations get the same test cover the month keys have. Removing
     their opt-in currently passes the suite, although Ctrl+NumpadAdd is a browser zoom the
     game deliberately hands back.
  VERIFIABLE: Vitest — Ctrl+Tab leaves the journal closed and the event unprevented, so the
  browser keeps its chord, while a plain Tab still toggles it; each of the Meta-modified
  game keys leaves its action untaken; and each of the four year keys is pinned in both
  directions, so removing an opt-in reds the suite.
  Criticality: medium — it takes no session down the way Ctrl+W did, but every instance is
  a silent state change the player did not ask for and cannot see the cause of.

- [ ] 619. THE DRESSING PAIR NO LONGER GESTURES, AND design.md SAYS SO (user decision
  10.08.2026, answering the card the point-580 fix raised). The village's conversing pair
  is pure dressing that never utters anything, and since gestures were tied to speech
  behind the earshot gate it only stands, turns and shifts its weight. `design.md` §19.10
  still promises the older behaviour, and the user chose the simpler of the two ways
  offered: strike the gesturing rather than give the pair a voice.
  FINAL STATE: in `design.md` §19.10 the vignette reads "pairs stand together in
  conversation" — the ", gesturing" is struck, and nothing else in the sentence or the
  list around it changes. No code changes: the behaviour the line now describes is what
  already ships. The word count drops, so no budget question arises.
  VERIFIABLE: the phrase "in conversation, gesturing" no longer occurs in `design.md`, and
  the existing gesture tests stay green — the delivered behaviour is untouched, this point
  only makes the document describe it.
  Criticality: low — it is a documentation correction, but an uncorrected line is a
  standing invitation to "restore" a behaviour that was deliberately removed.

- [ ] 620. A FRAME PASSES ITS CHECKS WHILE SHOWING NOTHING AT ALL (measured 10.08.2026
  while landing point 588; bundle Testinfrastruktur). `VERIFY_GL=webgl node
  scripts/verify/run-all.mjs polish --section=speech-guess` passes all 11 checks and writes
  `148-speech-guess-invitation.png` / `149-speech-guess-dialog.png` showing the note and the
  dialog over PURE BLACK — no village, no sky. It is neither the host nor the change: the
  `villager-gestures` section on the SAME tree and the SAME backend draws the settlement in
  full, and `speech-guess` on WebGPU draws it in full. The section stages itself onto
  whichever object named `inhabitant` `scene.traverse` finds FIRST and teleports the player
  four units beside it; on the slower WebGL 2 lane (1–2 FPS) that pick is taken before the
  scene has settled, so the camera lands where it sees nothing. The frame-subject shutter
  (point 375) passed it, correctly by its own rule: the label's anchor DOES project into the
  frame. The subject was present; the world behind it was not.
  FINAL STATE:
  1. The `speech-guess` section stages only once the scene has SETTLED — the same
     "triangle count still moving" settle the worldmodel frames already use — and picks its
     figure deterministically rather than by traverse order, so the frame is the same
     picture on either backend.
  2. The shutter learns the second half of point 375's promise: a frame whose subject is in
     view but whose PICTURE is empty is refused, naming what it found. "Empty" is judged by
     the scene the frame claims (a `local`/`place` frame must have the settlement drawn),
     not by a pixel threshold — point 361 rejected pixel metrics as a gate, and this is a
     question about the scene graph, which the page can answer directly.
  VERIFIABLE: the section's two frames show the settlement on BOTH backends; a unit case
  over the shutter's pure core refuses a frame whose declared subject projects into an
  otherwise undrawn scene and accepts the same frame once the scene is drawn.
  Criticality: medium — nothing the player sees is broken, but a real regression in that
  view is invisible on the WebGL 2 lane for as long as this stands, which is the exact harm
  the picture check exists to prevent.

- [ ] 621. A CEILING RAISE IS NO LONGER A QUESTION FOR THE USER (user decision
  10.08.2026, via the board chat: "Frage mich in Zukunft allgemein nicht mehr bzgl.
  Anhebungen"; bundle Chat & Tafel). The measured doc ceilings in
  `scripts/doc-budget-core.mjs` currently have two ways out, and the second one —
  raising the limit — is written everywhere as needing the user's agreement, so a
  blocked addition can stall on a question. The user has withdrawn that requirement
  generally: the decision is ours to take.
  FINAL STATE:
  1. The rule reads: when a budget blocks an addition, SHORTEN or MERGE what is
     there; where no tightening of comparable value exists, RAISE the ceiling in the
     SAME commit and JUSTIFY the raise in that commit message. No user question, in
     either direction — the raise stays a deliberate, written act, it is simply not
     escalated.
  2. Point 531's spec drops its closing escalation clause ("the point ESCALATES the
     ceiling question to the user instead of silently raising it") and states the
     rule above instead; the rest of that point is untouched.
  3. Every place that repeats the old wording says the new one: the header of
     `scripts/doc-budget-core.mjs`, `docs/analysis_de/vibe-coding-anleitung.md`,
     `docs/analysis_de/lesson-mechanisms.md` §3.30 and the rule row in
     `docs/analysis_de/retrospektive-zusammenarbeit.md`. The 102-word raise in
     `scripts/doc-budget-core.mjs` still carries "NOT yet confirmed by the user"
     beside its value; that note goes with the rule it belongs to.
  VERIFIABLE: a grep for "user's agreement" / "Begründung anheben" / "ESCALATES the
  ceiling" finds no doc-budget occurrence that still routes a raise through the user;
  `node scripts/doc-budget-core.mjs` and `scripts/verify/docs.mjs` green.
  Criticality: low — a process rule, no player-visible behaviour.

- [ ] 622. A VERIFY RUN THAT RAN NOTHING REPORTS GREEN, AND AN UNKNOWN FLAG RUNS
  EVERYTHING (found 10.08.2026 while verifying point 592; bundle Prüfkosten).
  Two shapes of the same hole in `scripts/verify/tiers.mjs`' `parseArgs`, both
  reproduced today: `node scripts/verify/run-logged.mjs --help` sorted `--help`
  into `flags`, left `filter` empty and therefore started a FULL both-backends
  LARGE run (killed after it had booted); `node scripts/verify/run-all.mjs helth`
  intersected a typo'd suite name to the EMPTY set and printed `ALL GREEN — 0
  suites run` in under a second. The second is the dangerous one — it is a green
  verdict for a run that proved nothing, the failure class points 375 and 574
  exist for; the first only burns 42 minutes.
  FINAL STATE:
  1. An argument the runner does not know is REFUSED before anything is built or
     booted — an unknown flag and a filter token naming no suite each exit
     non-zero within a tenth of a second and name what does exist. The
     `--section` path's early validation in `run-all.mjs` is the model and the
     place to join.
  2. `--help` / `-h` prints the usage of `run-all.mjs` and of
     `scripts/verify/run-logged.mjs` and exits 0 WITHOUT running anything.
  3. A run whose chosen suite set is EMPTY is never GREEN: it exits non-zero and
     names the filter that matched nothing. "0 suites run" is a failure verdict.
  4. `scripts/verify/tiers.test.mjs` pins all three in the fast layer, including
     that a KNOWN flag (`--baseline`, `--section=…`, `--quiet`) still parses.
  VERIFIABLE: `node scripts/verify/run-all.mjs helth` exits non-zero naming the
  suites, `node scripts/verify/run-logged.mjs --help` prints usage and runs
  nothing, `npm run test:unit` green.
  Criticality: medium — it touches the argument path of every regression command,
  so a mistake there silences the whole gate; the other model's mechanism review
  applies.

- [ ] 623. AN ANSWERED CARD OUTLIVES ITS ANSWER (user 10.08.2026, in the attended
  window: "Das ist schon ein paar mal passiert, dass eine Karte nicht gelöscht wurde,
  die ich beantwortet habe. Etabliere einen Mechanismus dagegen."; bundle Chat & Tafel).
  Measured the same evening: the card "design.md: 102 Wörter mehr, oder 102 anderswo
  streichen?" was answered through the board chat around 21:00, the answer was carried
  durably into the memory rule AND into point 621 by 21:11 — and the card still stood
  on the board ninety minutes later, until the user asked why. `decision-card-guard`
  covers the OPPOSITE direction only (a decision requested of the user must exist as a
  card); nothing checks that a card the user has ANSWERED goes away, so the board keeps
  asking what is settled and the user cannot tell an open question from a closed one.
  FINAL STATE — both halves inside the EXISTING `decision-card-guard` (core plus
  `.claude/decision-card-guard-state.json`; a second guard would double the surface for
  one rule):
  1. THE REVIEW IS DUE AT EVERY USER MESSAGE. A turn that carries a user message may
     not END while an open VDZK card stands undecided AGAINST that message. The channel
     does not matter and needs no integration: a typed prompt and a chat message the
     watcher spawned a responder for both arrive as the last USER entry of the
     transcript the Stop hook already reads. Per card
     the session either REMOVES it (`node scripts/board.mjs vdzk-remove "<fragment>"`)
     or records that this message did not answer it (`node scripts/board.mjs vdzk-keep
     "<fragment>" [...]`, several fragments in one call, written to the guard state and
     never to the board). The record is keyed to the MESSAGE (its transcript uuid), so
     the NEXT user message arms every card again — he answers whichever he likes,
     whenever — and a card ADDED in that same turn is never demanded, it postdates the
     message.
  2. A SUSPECTED HIT COSTS A REASON. Where a card's title and the user's message share
     a distinctive term (normalised, at least 5 characters, outside the stop list),
     `vdzk-keep` for that card REQUIRES `--why "<why the message did not answer it>"`;
     every other card is kept by being listed. That is the two-tier loudness this
     project already uses elsewhere: cheap where nothing points at the card, deliberate
     where something does.
  3. A SESSION THAT MAY NOT TOUCH THE BOARD CARRIES THE ANSWER INSTEAD. The window the
     user writes into is usually NOT the batch owner (stand-down: no board edit) —
     which is exactly what happened on 10.08. For it both remedies collapse into one:
     `node scripts/vdzk-answer.mjs "<fragment>" --answer "<what the user decided>"`,
     appended to `.claude/vdzk-answers.json`. THIS half does NOT stand down for a
     non-owner: it demands a RECORD, not a board edit. The OWNER's turn end is then
     blocked while an unapplied answer waits; it removes the card and clears the entry
     (`node scripts/vdzk-answer.mjs --applied "<fragment>"`), and an entry naming a card
     that no longer exists clears itself.
  4. Fail-OPEN like every guard here (an internal error allows the stop), the decision
     logic pure in `decision-card-guard-core.mjs`, and the remedy NAMES the exact
     command per card — a guard that only says "decide" is a guard that gets
     rubber-stamped.
  5. AND THE SAME GUARD STOPS COUNTING A LOOK BACK AS A REQUEST (measured 10.08.2026,
     two turns lost in one session; bundled here because it is the same core). "Die beste
     Werbung für deine Entscheidung von heute Abend" ASKS FOR NOTHING — it names a ruling
     the user gave hours earlier — and the guard blocked it, because a `address: 'sentence'`
     phrase only tests whether the sentence ADDRESSES the user, which a retrospect does
     exactly as much as a request. So a sentence in the PAST TENSE, or carrying a
     backward-pointing marker (von heute, von gestern, vorhin, damals, bereits, schon),
     is not a request while it has neither a question mark nor an imperative. The
     fail direction is unchanged — in doubt, block — but a pure retrospect is not a
     doubtful case. The SAME holds for a sentence that merely DESCRIBES a standing
     arrangement ("poc bleibt deine Entscheidung", "das Taggen liegt bei dir"): it reports
     who decides, it does not ask. Measured 11.08.2026, two turns in one morning, both on
     the phrase `deine entscheidung`; a phrase that names a decision-MAKER without a
     question mark and without an imperative is a statement, and the gate says so.
  VERIFIABLE: Vitest cases in `scripts/decision-card-guard-core.test.mjs` covering — a
  user message with two open cards blocks; one removed plus one kept passes; the same
  cards pass silently on a turn with NO user message; a NEW user message re-arms both;
  a card added this turn is not demanded; a shared distinctive term forces `--why`
  while a shared stop word ("nicht", "board", "punkt") does not; a carried answer blocks
  the owner and passes the non-owner; an answer naming a vanished card self-clears; a
  throwing state read allows the stop. Plus the replay of the 10.08 case: the real card
  titles and the real user message, which must block; and, for item 5, the real sentence
  that must NOT block beside a present-tense request that still must.
  Criticality: HIGH — it is a guard, so `mechanism-review-guard` demands the other
  model's recorded review, and its failure mode is the user acting on a question that
  was settled hours ago.

- [ ] 625. THE SAME DEFECT WAS BUILT TWICE, IN PARALLEL (measured 11.08.2026, 00:12).
  Point 590 ("THE BOARD'S QUEUE ORDER IS A SECOND COPY OF THE WORK ORDER, AND IT KEEPS
  DRIFTING", from the user's report of 09.08.) and point 608 ("THE BOARD'S ORDER IS
  HAND-KEPT AND DRIFTS FROM THE WORK ORDER", a finding of 10.08.) name ONE defect and
  demand ONE final state: the queue's order is derived from `TASKS.md` instead of the
  `order` array in `.claude/board-queue.json`. Two agents built it at the same time, on
  the SAME two files (`scripts/board-queue-core.mjs`, `scripts/queue-order-guard-core.mjs`),
  so the branches could never both land; one full agent run plus its own review was spent
  twice over. The duplication was visible in the two headlines, and two mechanisms let it
  through — the finding was opened as a NEW point while the user's report stood open
  (against `bundle-first`), and the free-slot check listed 608 as "independent of the
  running branches" while both rebuilt the same core.
  FINAL STATE:
  1. OPENING A POINT LOOKS FOR ITS TWIN. Recording a finding or appending a point reports
     the open points whose headline shares its distinctive terms, or whose spec names the
     same file, and asks the author to fold it in or to say in one line why it is genuinely
     separate. It never refuses — a false twin costs a sentence, a missed one costs a
     whole build.
  2. COMMISSIONING AN AGENT COMPARES FILES, NOT NUMBERS. The independence a free slot is
     judged by reads the FILES each candidate would touch — from the paths its spec names,
     and from those the running branches have already changed (`git diff --name-only
     main...<branch>`) — and a candidate that shares one is reported as OVERLAPPING rather
     than independent. `scripts/batch-in-flight-core.mjs` holds that judgment today and
     had it wrong.
  3. The resolution of the concrete case is not part of this point: 590 lands (it also
     covers the rank side and absorbs 608's duplicate check) and 608 is ticked as covered
     by it.
  VERIFIABLE: Vitest — two headlines sharing a distinctive term are reported as twins while
  two sharing only stop words are not; a candidate whose spec names a file a running branch
  changed is OVERLAPPING; one that names none is independent; the real 590/608 pair, as
  they stood on 11.08.2026, is reported as a twin AND as overlapping.
  Criticality: MEDIUM — no player-visible behaviour, but it wastes whole agent runs and
  produces branches that cannot both land.

- [ ] 626. THE BOULDER'S PROOF PROVES THE WRONG THING (four-eyes review by GPT-5.6 Sol of
  the landed point 585, 11.08.2026; two findings re-verified against the tree before
  filing). 585 stood the landmark erratic on the ground and was landed on a green picture
  — but its evidence does not hold what it claims, and a second defect class it fixed is
  untested:
  1. THE SEAT CHECK IS SELF-REFERENTIAL. `scripts/verify/world.mjs:154-174` calls the
     block "seated" when `r.y` equals `r.groundY` — both read from the SAME site object.
     That proves the SCENE COPIED the site's number, never that the block stands on the
     DRAWN terrain. It is exactly the proxy this project forbids (CLAUDE.md §7.2: judge by
     the rendered result, never by an assumed value). The check must read the height of the
     drawn mesh under the block's footprint — the vertices the bird's-eye mesh was built
     from — and compare THAT with the drawn base.
  2. A NEW TEST ASSERTS AGAINST AN OCEAN. `src/scenes/place/groundScatter.test.ts` never
     calls `setupGeodata()`, so its world is water everywhere — the trap 585's own report
     named for two other files, reproduced in the file it added. It loads the dataset, or
     it proves nothing about the shore rule.
  3. AND THE PLACEMENT STILL HAS EDGES the review named and nobody has refuted: the
     footprint is probed at 25 discrete points, so a wet or blocked sliver between them
     survives; an exhausted search returns the village coordinate WITHOUT proving it dry;
     and the all-water seed 4242 is returned wet with `communicationRock.test.ts:207-232`
     blessing it. Either each is genuinely unreachable in play — then the test says so in
     one line — or the search fails LOUDLY instead of returning a spot it cannot vouch for.
  VERIFIABLE: the seat check FAILS when the scene is made to draw the block a metre above
  its site (a deliberate regression, reverted), which the current check cannot detect;
  `groundScatter.test.ts` green with the geodata loaded; and a stated verdict per edge in 3.
  Criticality: HIGH — this is the landmark the communication goal is dug up at, and the
  check that was supposed to protect it does not.

- [ ] 627. THE VICTORIA FALLS FRAME PHOTOGRAPHS SOMEWHERE ELSE (measured 11.08.2026 on
  `main` at 3f639f0d, after the point-585 landing; bundle Testinfrastruktur). `world`
  reds on ONE of its seven landmark frames: `15-worldmodel-victoria-falls — its subject is
  not in the rendered picture: off the left and bottom edge of the frame`. It survived the
  suite's own retry, and it is WEBGPU-ONLY: the same suite on WebGL 2, in the same sitting,
  writes all seven frames green — which is why the charge that accounts for it is scoped to
  that lane and a WebGL 2 red stays a real red. On the 585 branch the WebGPU run had passed
  minutes earlier, so it is either a genuine regression of the jump or a rotating timing
  failure, and which of the two is exactly what this point must settle. The six
  other landmarks (Khartoum, Lake Victoria, Kilimanjaro, the Congo mouth, Cape Town, Lake
  Chad) pass in the same run, so it is not the shutter and not the projection: those refuse
  correctly, which is why this was caught at all.
  FINAL STATE: the cause is NAMED with evidence — the jump to (-17.9, 25.9) not settling
  before the shutter opens, a camera clamp at that latitude, or a real placement change —
  and fixed at that cause. If it is timing, the frame waits on the STATE the jump reaches,
  never on a wall-clock; a fixed sleep is not an answer here (CLAUDE.md §7.2). The charge
  entry in `scripts/render-verify-charges.mjs` that currently accounts for this red goes
  when the point is ticked.
  VERIFIABLE: `world` green on BOTH backends, three runs each, the falls frame written and
  showing the falls; and the deliberate regression (a jump that does not settle) must make
  the check red again.
  Criticality: medium — it blocks no player, but an unaccounted red on `main` blinds the
  render gate for every later change.

- [ ] 643. A RED IS RELEASED BY THE WRONG PROOF: THE SUITE PASSED, NOT THE CHECK (found by
  GPT-5.6 Sol while reviewing point 640, and left standing there as a named boundary rather
  than smuggled into that point's scope). Point 640 settled how a red is CLOSED — cause,
  charge, or its own point. What it does not settle is how a red is RELEASED once recorded.
  Today the record releases a red when the red's own SUITE comes up covering on code newer
  than the red. That is one level too coarse: a suite holds many checks, so a deliberate
  no-op edit inside the render set plus one green run of that suite releases a red whose
  own check never ran again. The release then rests on the suite having passed, not on the
  thing that failed having passed.
  FINAL STATE: the record keeps a resolution history PER CHECK, not per suite — for each
  named check, the newest code it last passed on. A recorded red is released only when THAT
  CHECK passed on code newer than the red; a green run of its suite that did not exercise
  it leaves it standing, and the record says which check is still outstanding rather than
  reporting the suite as covering. A check that has been removed or renamed is reported as
  such, never treated as passed by absence.
  VERIFIABLE: Vitest over the pure core in `scripts/render-verify-core.mjs` — a red on
  check A is NOT released by a run in which only check B passed, is released by a run in
  which A passed on newer code, and a run whose check set no longer contains A reports A as
  vanished rather than covered; plus the concrete case that motivated it, a no-op render
  edit and one green suite run leaving the red standing.
  Criticality: medium — it does not let broken code land (the fast gate still runs), but it
  lets a red be signed off by evidence that never touched it, which is the same defect
  class point 640 closed from the other side. Bundle: Testinfrastruktur.


- [ ] 645. CRITERION 7 DESCRIBES THE PLACEHOLDER, NOT THE COMMUNICATION MECHANICS THAT WERE
  BUILT (found 11.08.2026 in conversation with the user while the batch was paused).
  `docs/acceptance-criteria-detail.md` §7 and the short form in CLAUDE.md §7.1 point 7 still
  describe the OLD placeholder — the village elder handing out a glossary and direction
  words — together with the OPEN note against `design.md` §13.4 saying the real mechanic is
  undecided and nothing should be built on it. What is built and shipped on `main` is the
  mechanic the user specified: `src/communication/` with `lexicon`, `speaking`, `heard`,
  `speechLabel`, `speechTarget`, `spokenGesture`, `drumMessage` and `chiefReply`, plus the
  teaching adults and children of the Bambara village (points 580–583, 588 and their
  successors).
  WHY IT MATTERS: the detail section is the PROOF text read at the closing run and at the
  v0.3 tag. As it stands it would sign off a built mechanic as a placeholder, and its
  sentence "do not build on it, but do not protect it either" invites sacrificing that
  mechanic when something else changes.
  FINAL STATE: criterion 7 and its detail section describe the mechanic that exists, naming
  its files; the evidence chain in `docs/acceptance-evidence.md` §7 points at the tests that
  actually prove it; and what is GENUINELY still open from `design.md` §13.4 — the invented
  language per region — stands as a clearly bounded remainder rather than as a blanket
  "undecided".
  VERIFIABLE: no runtime invariant — this is proof-document hygiene. The proof is that every
  file and test §7 names exists and covers what the section claims; check each claim against
  the code that owns it. CLAUDE.md §7.1, the detail section and the evidence section change
  in the SAME commit, per the rule each of them states.
  Criticality: medium — no player sees it, but it is the document the closing run and the
  release tag read as proof, and it currently misreports delivered work as unbuilt.
  Bundle: Dokumentation.

- [ ] 646. THE REPO DOCTOR IS THE SECOND DOOR INTO THE SAME DISASTER (found 11.08.2026 by the
  agent delivering point 629, and left to its own point rather than smuggled into that
  scope). Point 629 closes the LANDING's path to deleting a live agent's worktree.
  `scripts/batch-doctor.mjs`'s `remove-orphan-worktrees` reaches the same directories under
  `.claude/worktrees/` by a different route. It is the narrower door — it only removes
  directories git does NOT list, and it re-judges at execute time, so a REGISTERED live tree
  is skipped twice — but the hole is an UNREGISTERED live tree, and
  `scripts/batch-doctor-states.mjs` already names it in its own comment: "the registration is
  the ONLY shield a live agent's tree has here — the idle window does not help, because a
  directory's mtime never moves while the agent writes in its SUBdirectories." A
  `git worktree prune` that drops a record while an agent is still working in that tree
  produces exactly that state, and is a plausible path to the 11.08.2026 incident whose exact
  code path point 629 could not reconstruct.
  FINAL STATE: `remove-orphan-worktrees` proves liveness before it deletes, by the same
  standard point 629 establishes for the landing — git's own worktree lock, uncommitted
  content, and recent writes probed BELOW the directory rather than at it, with every
  unknown answering "keep and report" instead of "delete". An unregistered tree that cannot
  be proven dead is reported by name and left standing; the doctor says what it left and why,
  so a genuine orphan is still cleared by an operator who can see it.
  VERIFIABLE: Vitest over the pure selector — an unregistered but LIVE tree (locked, or
  dirty, or written to below its root) is reported and NOT removed; an unregistered tree
  provably dead by all three probes is removed; an unreadable probe answers keep, not delete;
  plus the mtime case the existing comment names, where the root's own timestamp is stale
  while a subdirectory is being written.
  Criticality: high — same failure class as point 629 and the same cost: it destroys work
  that is already done, and it fires while the pool is busiest. Bundle: Session- & Repo-Hygiene.

- [ ] 647. A FULL-SUITE RED ON THE 629 BRANCH WHOSE TEST NOBODY CAN NAME (11.08.2026, 18:03,
  on `feat/629-cleanup-spares-live-worktrees`). One test in a full `npm run test:unit` run
  failed; the run's output was truncated before the name was read, and no vitest report
  artifact is kept in the repository, so the test cannot be recovered from the run. It is
  filed rather than explained, because point 640 forbids the other closings: the same test
  set had been green four minutes earlier and has been green 5/5 since, and that covers
  nothing.
  THE ONE CANDIDATE, RECORDED AS A HYPOTHESIS AND NOT AS A CAUSE. In that same window the
  author found and fixed a genuine sub-millisecond `mtime` vs `Date.now()` race in a test he
  had just written (`f5a6feb8`, the index-refresh case). It is the only nondeterminism known
  to have been introduced in that window, so it is the first thing to test — but nothing ties
  it to the red beyond the coincidence of timing.
  FINAL STATE, TWO HALVES. (a) The red is named: either the candidate above is confirmed by
  reproducing a failure with the pre-`f5a6feb8` test and showing it absent after, or another
  cause is found; if neither is reachable, this point closes by RECORDING that the run is
  unrecoverable and naming what was changed so it cannot happen again. (b) The reason it is
  unrecoverable is removed: a full unit run keeps a machine-readable report of which tests
  failed (vitest's own reporter into a git-ignored path is enough), so the next red of this
  kind is answerable from the record instead of from memory. Half (b) is what makes half (a)
  the last time this question is unanswerable.
  VERIFIABLE: for (b), a deliberately failing test leaves its NAME in the report file and a
  green run leaves a report with no failures — pinned by a Vitest case over whatever pure
  part the wiring has, plus one real run. For (a), whichever of the two closings applies,
  recorded with its evidence.
  Criticality: medium — the red is on a branch, not on `main`, and the fast gate still stands
  between it and a landing; what makes it worth a point is that it could not be ANSWERED,
  which is the condition points 455, 640 and 643 all exist to end. Bundle: Testinfrastruktur.

- [ ] 649. THE CLEANUP'S NEW LOCK PROTOCOL STILL HAS FOUR WAYS TO GO WRONG (GPT-5.6 Sol,
  fifth review of point 629, on the delta 213702f..ae40a08; recorded 11.08.2026 and filed
  rather than held back, because 629 landed and these are defects in the mechanism it
  added). Point 629 replaced a cleanup that deleted live worktrees; it now takes git's own
  worktree lock, proves the tree's identity, and recovers only a lock of its own whose
  holder is provably dead. That is a large improvement on what stood before, and none of
  the four below reaches the old failure — but each is a hole in the NEW protocol.
  1. THE PARSER CLAIMS REASONS THE FORMATTER NEVER WRITES. `parseCleanupLock` TRIMS before
     matching its anchored signature, so a foreign reason padded with whitespace —
     `" worktree-cleanup verifying and deleting (pid 999999 start 1) "` — reads as OURS and
     becomes recoverable once that pid is absent. The collision tests carry no padding.
  2. LOSING THE LOCK CAN STILL END IN AN UNLOCKED DELETION. `takeCleanupLock` returns as
     soon as the FIRST acquisition succeeds, and `matchesExpectation` rejects only a
     NON-EMPTY foreign lock. A concurrent stale-lock recovery that clears our lock and
     pauses before retaking it leaves NO lock at all: verification sees an empty reason,
     passes, and the deletion proceeds without exclusion. The race tests always install the
     competing lock immediately, so the empty interval is never exercised.
  3. `tryUnlock` STILL COMPARES AND UNLOCKS AS TWO ACTS. It re-reads the reason, then runs
     an unconditional `git worktree unlock`. A recovery that clears ours and a winner that
     installs its own between those two calls means we release the WINNER's lock — the same
     defect the re-read was added to close, moved one step later.
  4. A LOCK NOTHING CAN EVER CLEAR. `cleanupLockReason` writes `start 0` when the
     process-start probe cannot answer, and `staleLockVerdict` permanently refuses to
     recover any zero-start lock. A crash while holding such a lock wedges that worktree for
     good; the recovery tests all use non-zero synthetic starts.
  TWO MORE, OF THE ORIGINAL CLASS, found by the whole-branch review (GPT-5.6 Sol,
  5ceaa3ab..ae40a081). These are BRANCH loss rather than worktree loss, but the cost is the
  same — a live tree left standing on a branch that no longer exists:
  5. A DETACHED NON-AGENT WORKTREE IS TREATED AS FOREIGN AND THEREFORE PROTECTS NOTHING. In
     `judgeCleanupTarget`, `if (!has)` classifies a detached non-agent tree as `foreign`;
     `selectCleanupTargets` then leaves it out of `reported`, and its EMPTY branch fails the
     fallback branch comparison. So a live manual worktree that happens to be rebasing the
     landed branch permits BOTH branch deletions — the exact shape of the incident, one level
     up.
  6. THE BRANCH BLOCKER IS READ FROM A STALE SNAPSHOT. `branchBlocked` in `land-point.mjs`
     uses the `cleanup` snapshot taken minutes earlier and never re-lists the worktrees before
     deleting; `deleteLandedBranch` then runs the local and the remote deletion as two
     commands. A detached tree appearing AFTER selection can lose both branches, and a live
     tree that recreates the local branch after `branch -d` can still lose its remote. The
     tests cover command failure and ordering, not either concurrent transition.
  FINAL STATE: 1, 3, 4, 5 and 6 are fixed at their cause — the parser matches what the formatter
  writes with no normalisation that widens it, the release is made a single act or, where
  git offers no such primitive, is narrowed and its residual written down, and a lock this
  command wrote that carries no usable identity is recoverable by SOME stated rule rather
  than never. For 2 the honest answer may be that git gives no way to hold exclusion across
  the gap; then verification must treat an EMPTY lock where we hold one as a refusal, not
  as a pass, which closes the deletion path even if the exclusion cannot be kept.
  VERIFIABLE: a Vitest case per hole, each failing before its fix — a padded foreign
  reason is refused as foreign; a verification that finds no lock while `weLocked` refuses;
  a release that finds a foreign lock in place leaves it standing; and a zero-start lock of
  ours is recoverable by the stated rule. For 5 and 6: a detached non-agent worktree holding
  the landed branch BLOCKS both branch deletions, and a tree that appears between the
  selection and the deletion blocks them too — the branch state is re-read at the moment of
  deletion, not taken from the plan. The existing suite stays green.
  Criticality: high — same subject as 629 and the same cost if it goes wrong, and it is
  live on `main` today. Bundle: Session- & Repo-Hygiene.

- [ ] 650. A REVIEW'S COVERAGE IS READ ALONG WITH ITS VERDICT (retrospective §3.110,
  11.08.2026). `scripts/review-sol.mjs` builds the reviewer's material from the whole
  commit range and stops at a cap; past it, files are dropped and the reviewer says so IN
  PROSE ("TRUNCATED/omitted"). Point 629 was reviewed five times and every single round
  reported `worktree-cleanup.mjs` and its test tail as unseen. Nobody acted on it for four
  rounds, and the first read of that file found a defect. An absent finding over material
  that was never delivered reads exactly like a clean verdict.
  THE MECHANISM EXISTS AND ONLY NEEDS WIDENING: `review-sol.mjs` already REFUSES to print a
  record command when the reviewed range is narrower than the sha being recorded — the same
  place decides here.
  FINAL STATE: the tool knows what it actually sent. It reports the coverage next to the
  verdict — how many files went in, which were dropped at the cap — and a verdict over
  truncated material is marked PARTIAL, both on screen and in the recorded ledger entry, so
  `.claude/mechanism-reviews.jsonl` can never carry an unqualified "merge" for a change the
  reviewer only half saw. A PARTIAL review does not satisfy the criticality gate on its own;
  the uncovered paths are named, and covering them — a second run scoped to the remainder,
  or a recorded human read — is what completes it. Since the cap bites hardest on the
  longest branches, the tool also SUGGESTS the narrower range when it truncates, which is
  what actually worked on 629.
  VERIFIABLE: Vitest over the pure part — a reviewer output naming truncation yields a
  PARTIAL verdict and a ledger entry carrying that flag; a full-material review does not;
  and the criticality gate refuses a PARTIAL as the sole clearance for a HIGH point.
  Criticality: medium — it does not break the product, but it decides how much a review is
  worth, and every HIGH point is signed off on one. Bundle: Modell & Wächter.
