# Backlog (non-blocking)

Collected findings that did not pass the intake rule of CLAUDE.md §2 (user
decision 01.09.2026): no reproducible player impact, no security or data risk,
no real blockade, and not a deletion/simplification. Nothing here gates a merge,
a landing, or the closing; entries are batched, deduplicated, and revisited only
when their area is touched anyway or a triage says otherwise.

Format: one line per finding — `- YYYY-MM-DD <source> — <finding>`.

<!-- entries -->
- 2026-09-25 point 659 round 6, R6-N1 — the frame shutter checks subject projection but
  did not detect hut occlusion: `05-chief-walks-out.png` was accepted from inside the hut
  although the chief himself was absent from the visible picture. WebGPU continuous-route
  run on `b9cffdc7b`, log `local/verify-logs/2026-09-25T11-00-29-016-communication.log`,
  receipt and frames `local/659-round6-red/` (reviewer's main checkout). The subsequent
  phase assertion correctly failed because the chief had reached the drummer. The driver
  now faces the chief's path from the door before calling him; the shared shutter's occlusion limitation remains
  non-blocking. Promote only if it reproduces as a false approval outside this driver.
- 2026-09-21 Weberin-Gespräch (`docs/peoples-1890.md`, `src/scenes/place/lifeSpots.ts` `LOOM_SPOT`)
  — die Völker-Doku kennt kein Weben: `grep -rli "weaver|loom" docs` trifft `peoples-1890.md`
  nicht. `design.md` nennt Weben unter den Alltagstätigkeiten, aber weder Bauform noch Technik
  sind belegt, und der stehende Rahmen im Dorf ist damit eine reine Setzung. Für Bambara/Mande
  wäre die lange, flach gespannte Schmalbandkette die zu prüfende Alternative. Kein Spielerimpakt
  heute; PROMOTE, sobald der Webstuhl eine tragende Rolle bekommt — der unten skizzierte zweite
  Kanal hängt an einer langen, gerichteten Kette.
- 2026-09-21 Nutzergespräch (Entwurf, ausdrücklich unbeauftragt: »erstmal nur diskutieren«)
  — ZWEITER KANAL FÜR `UPSTREAM`/`DOWNSTREAM` AN DER WEBERIN. Der Webstuhl liegt parallel zum
  Fluss, die Weberin sitzt in der MITTE der Kette und nennt eine Richtung; die Gehilfin geht die
  Kette entlang in diese Richtung und arbeitet dort. Trägt `design.md`:416 (kein Wort ohne
  Adressaten, Reaktion und sichtbare Folge) und :412 (eine Richtung wird von einem Körper
  getragen, nicht berührt); der Sitz in der Mitte schließt die Fehllesung „komm/geh"
  konstruktiv aus, weil beide Rufe von ihr WEGführen. Der Nutzen ist der Schnitt, nicht die
  Wiederholung: die einzige Gemeinsamkeit von Uferspiel und Webstuhl ist die Flussachse.
  ZWEI OFFENE STELLEN: (1) Sichtlinie aufs Wasser gegen 10 m Abstand zur Kinderstrecke
  (`talk.reach` 10, `BANK_MIN_GAP` 4 / `BANK_MAX_GAP` 14); (2) das flussab-Ende der Kette fällt
  in dieselbe Hörweite wie `RIVER` am Wasserpfadkopf (Punkt 688 §1). Kehrt außerdem 688 §3 um
  („The direction words are the children's now") und wäre damit eine Designänderung an
  `design.md`, `docs/communication-poc-spec.md` und der archivierten 688 gemeinsam. Skizze:
  https://claude.ai/code/artifact/e74c2571-24b2-4dae-84e0-6b5429c673d3
  NACHTRAG Nutzer 21.09.2026, 14:29: die prozedurale Dorferzeugung müsste dafür Platz
  garantieren — zwischen der Weberin samt Gerät und dem Kinderspiel muss der Abstand sicher
  eingehalten werden, nicht zufällig entstehen. Dazu die Beobachtung, dass es **beim Kinderspiel
  heute schon manchmal eng** ist; das ist noch nicht mit Seed und Bild gemessen und deshalb
  hier statt als Punkt. PROMOTE, sobald eine Enge reproduziert ist — dann trägt sie auch die
  Platzgarantie, denn eine zweite Station an derselben Achse verschärft eine Enge, die es
  bereits gibt.
- 2026-09-17 batch owner (01:26 and 08:05, `.claude/batch-launcher.log` "stopping on SIGTERM")
  — a `kill` sent from inside the container to headless Chrome processes (orphans reparented
  to PID 1, or a process group holding the detached logged run) stopped the WHOLE container
  within seconds, twice in one morning, with the WSL VM alive the second time. A suite that
  closes Chrome through Playwright survives. Operating rule recorded in the owner memory:
  never signal Chrome from inside; abandon a run with `batch-in-flight.mjs --clear` and let
  the wrapper run out. Point 1069 should record the trigger as the signal, not the suite;
  point 1064 covers the missing container restart policy. PROMOTE to a point if it recurs
  without a kill.
- 2026-09-17 context handover (`scripts/batch-in-flight.mjs` ~1286, `assessTransfer`)
  — a declared logged run is judged transferable only when its record's HEAD equals
  `currentHeadOf({cwd})`, the MAIN tree's HEAD, so a run on a point's worktree can never
  transfer: `--prepare --context` blocks with "its run covers HEAD <branch tip>, not the
  <main HEAD> being handed over", and of its four named ways out only ABANDON works, which
  throws the run away (measured twice: 01:23 by the predecessor, 08:03 by this session).
  Simplification: compare against the declared `--branch` tip when the declaration names one.
- 2026-09-16 point 1139 landing (`scripts/verify/baseline-classify.mjs`, `scripts/render-verify-guard.mjs`)
  — a classification run records its BASELINE measurement into the point's own render-verify
  state, so the branch inherits reds that belong to the code WITHOUT its change. Measured today:
  the classifier's `polish` pass over the baseline printed "the invitation names the guess key E",
  "E opens the guess for the highlighted speaker" and six further point-1139/588 checks as reds —
  which is exactly right for code that does not carry the change, and exactly wrong as a red of
  the branch. The guard then offers only fix / charge / file for them, and none of the three fits
  a measurement of the old code. It did not block here (no render path pending at that HEAD) and
  the covering runs of both lanes were recorded separately, so this is collected, not a point.

- 2026-09-13 point 1072 landing (`scripts/verify/run-wait.mjs`) — a healthy LARGE was reported
  HUNG and recorded as a batch standstill. The run record's `expectedRuntimeMs` covers the SUITE
  time only (42m 16s here), but a run that ends with red suites then enters its baseline
  classification and runs every red suite TWICE against the merge-base checkout. On this run that
  phase was working normally — the log growing, one baseline log appearing per suite — when
  `--await` printed "HUNG — 108m 11s is past 2.5x this run's expectation. The wait has been
  recorded as hung and the batch emergency lane will treat it as a standstill; end the run rather
  than waiting again." The run in fact ran to its end at 120m 28s and carried the only both-backend
  evidence that could land the point; ending it there would have cost the landing and handed a
  working batch to the emergency lane. The 2.5x bound is measured against a number that never
  claimed to cover classification. Two cheap directions if it is ever picked up: the writer extends
  the expectation when it enters the classification phase, or the hung test stops applying once the
  log shows the classification banner. Collected rather than queued: it mis-advises, it does not
  block — judgment overrode it here — and the infrastructure freeze of CLAUDE.md §2 keeps it out of
  the work order until it actually costs a run.
  CLOSED by point 1137 (16.09.2026): it did cost a run two days later, twice, and became the
  blockade in front of the release. The repair is neither of the two directions above but the one
  they share: the hung verdict now needs SILENCE as well as the clock — no log line, no record
  update and no frame for a whole 15-minute progress lease — so the classification phase, a long
  `polish` pass and every other long-but-working run report OVERDUE instead of HUNG.
- 2026-09-13 point 1072 LARGE (WebGPU, `polish`, feat/1072 at 5a5c8d7a5) — the suite went red on
  its first attempt and clean on the retry, so the run is recorded SUSPECT and covers nothing
  (CLAUDE.md §7.2). Three of its reds have owners and one family has none. Owned: `leaving after
  several settlement visits stays fluid (point 96) — 3528 ms` [`travel-panorama-capture`] is the
  duration signature point 1050 already carries at 3683 ms and 3292 ms, and the recorder resolved
  it to 1050 by itself; the console red `[ASSERT] adult-atom-lost — dig-first: villager 2 ran out
  of time with his site word unspoken` is charged to point 1073. UNOWNED: the four
  `adult-errands` checks (`a village adult is really filling his jar, clear of the others — no
  carrier reached the fill phase in 180 s`, and the three that follow it with "no filling
  carrier"), and the console red `[ASSERT] adult-atom-lost — water-back: villager 0 ran out of
  time with his walk word unspoken`. Both are the 180 s `errandSeconds` backstop being reached:
  the errand does not finish, so the fill phase never arrives and the owed word is dropped. The
  1073 charge scopes itself to the DIG readings on purpose and names the water errand's own point
  as the owner of the rest — but that point, 1087, has since closed, so the water reading now has
  no owner at all. Not charged and not queued here: it is not reproducible. The WebGL 2 LARGE of
  the same code (b50ccb836, which differs from the tip only by a review record in
  `.claude/mechanism-reviews.jsonl`) had `adult-errands` green and a DIFFERENT polish section red
  (`settlement-season` at the full 60 s, charged to 642), the WebGPU retry was clean over 266
  checks, and the branch diff cannot reach errand scheduling or the hush — it threads a camera
  bearing and a voice register through the existing speech calls. A rotating, load-shaped
  signature on a host whose quiet-machine check reported MACHINE STATE UNKNOWN. If it recurs on a
  measured quiet host, the question is whether the water reading should widen the 1073 charge
  (the mechanism is the one 1073 owns for every errand, not only for dig) or become its own point.
- 2026-09-06 point 689 LARGE regression (`world`, feat/689 at 8c70662b8, WebGL 2) — the landmark
  frame `11-worldmodel-khartoum-confluence` red with "its subject is not in the rendered picture:
  off the left and bottom edge of the frame". That is verbatim the unsettled-jump signature point
  627 owns, but every measurement behind the charge in `scripts/render-verify-charges.mjs` is
  WebGPU/compatibility, and that entry states outright that a WebGL 2 red stays a real red — so
  this is the FIRST WebGL 2 sighting of the signature, and it carries the detail line the
  point-627 entry says it has been waiting for (point 995 owns re-recording these reds). The run
  died in its own `world` retry when the session did, so the retry's verdict was never written.
  Re-measured 06.09. 08:02 on the same branch and backend, `world --section=landmark-frames`:
  green, all seven landmark frames written and none refused by the shutter. Not reproducible; no
  player impact — the frame is a test camera jump, not a game state. The red is NOT covered by
  that green: point 689 lands only on a LARGE that goes green on its own.
- 2026-09-06 point 689 WebGPU proof runs (`world`, feat/689 at 49df5fb3d) — the two talus-foot
  checks ("the use key at the talus foot fits the impression and solves the puzzle", "a second
  press at the spent socket answers like a wrong place") went red in 3 of 6 runner attempts
  across three sittings (05.09. 23:51 run 1, 06.09. 00:24 run 2, 06.09. 04:34 run 2), always
  both together and always after the wrong-place press had passed, and green in 8 of 8 attempts
  afterwards (3 section-only, 3 full standalone, 2 runner). The runner discards the suite's
  `console errors:` detail, so no attempt recorded what the press said, the mode, or an open
  dialog; the branch now prints that detail on the FAIL line itself. Not reproducible, no player
  impact; revisit with the next red's detail line.
- 2026-07-14 memory r3f-clock-deprecation-watch — the dev console warns `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.` (three r185+). It comes from @react-three/fiber v9's internal render-loop Clock, not from this project's code. On a dependency-maintenance pass, check whether a newer @react-three/fiber has migrated its loop to `THREE.Timer`; if so, update and confirm the warning is gone. No change in this repository is expected.
- 2026-09-01 cross-vendor review of point 1036 (GPT-5.6 Sol, merge-with-fixes) — the spawned status regression in `scripts/guard-hooks.test.mjs` covers the ordinary finding path, not the `report-gap` path: no case arranges a gap state and asserts that the findings still print above the gap report. No player impact and no blockade — the composed printing is covered by reading, the gap arrangement is expensive to build in a temp repo.
- 2026-09-03 point 688 picture verification (WebGL 2) — the `speech-hypothesis` section's "the speaking figure itself stands in the frame, under its note (point 485)" reported 5 of 8 frames off (body at 821,761 against a label bottom at 691) on one WebGL 2 polish pass, and passed on the retry and on a fresh first-try run of the same suite at the same HEAD. No reproduction in three passes, no WebGPU sighting, and nothing in the diff touches the label's placement. Worth a look the next time that section is worked: the rotation suggests the label is measured before it has settled, not that it sits wrong.
- 2026-09-03 F6 "BalancierendeFelsen" (seed 516331552, bambara-village, WebGPU) — beside the
  balancing play rocks the frame shows a white quadruped floating above the open water in the
  middle distance, feet off the surface; the report's wildlife section lists 0 animals in
  radius, so the floater sits outside it or is place dressing. Worth a look when wildlife
  anchoring is next worked; archive: local/incoming-f6/BalancierendeFelsen/.
- 2026-09-03 polish frames, both backends (verification/111-village-season-wet.png) — among the
  thin rain streaks one oversized billboard renders as a solid vertical pillar (WebGPU) or a
  broad translucent band (WebGL 2), roughly a hut wide and half the frame tall. Likely a rain
  particle whose scale or near-camera clamp misses; purely aesthetic, no check judges it.
- 2026-09-03 Sol lane down provider-side: the ChatGPT Codex backend answers 404 on
  /backend-api/codex/responses for every request — valid login, any model id, with and
  without -m; the last successful Sol ledger entry is 02.09. ~14:07. A CLI update
  0.147.0→0.153.0 changed nothing and `review-sol --probe` still passes, so the id
  handling is fine and the outage is on the provider. Confirmed 03.09. ~17:10: BOTH
  vendors had incidents on their status pages (user), Anthropic threw 529 Overloaded on
  Opus in the same window, and fresh community reports matched the exact Codex 404.
  Effect: the OpenAI-lane commands exit 3. User decision 03.09.2026: do NOT take
  the §6 same-vendor fallback for this — wait until the providers recover; the work goes
  to the top models. No repo defect; re-probe with a minimal `ask-astra --kind explain`
  before routing OpenAI-lane work. CLOSED 05.09.2026: `codex exec -m gpt-6-astra` answers
  over provider `openai`, and the lane moved to GPT-6 Astra with that measurement.
- 2026-09-04 `mechanism-review.mjs --record` prints the wrong reason when `--model-at`
  is not anchored. The reviewer identity check wants a timestamp that lands on an actual
  `message.model` row of the session transcript; a freshly generated `new Date()` is a
  little later than the last written row and is rejected — but the refusal is the same
  text it prints when the two flags are MISSING ("pass --model-at <ISO> and
  --model-transcript <session.jsonl>"), so the obvious reading is "the flags did not
  arrive" and the same wrong value gets retried. `checkAuthorshipFile` itself returns a
  clean `agreement` for the anchored timestamp, so only the message is wrong. Cost three
  attempts while recording the point-1051 review; the working call reads the anchor out
  of the transcript's last model-bearing row first. Non-blocking: the gate stands down
  under the 01.09. decision, and the record went through once anchored.
- 2026-09-05 session-death hunt — `scripts/finding.mjs --record` appends its MEMORY.md index line
  with `appendFileSync` and no leading newline; when the index has no trailing newline (the
  doc-budget count keeps it that way) the line glues onto the last entry. Cosmetic, fixed by
  hand once; a `\n`-guard before the append would end it.
- 2026-09-05 session-death hunt — `.claude/session-process.json` (the claude-ancestor cache the
  emergency strike reads as its target list) holds 93 entries, most for pids long dead, some
  keyed by fixture ids (`x`, `answer-test-session`, `tool-output-interception-test`) that tests
  wrote into the live file. No harm now that the tests are pinned, but a live registry that
  tests can write is the shape that made 05.09. possible; worth a sweep and a fixture path.
- 2026-09-05 four abandoned feature branches and their worktrees survive their points.
  Measured on main: `feat/834-durable-authoring-lane` (122 commits ahead, last 24.08.) belongs
  to a point that was CUT that same day into 889–895 and landed instead through
  `feat/834-takeover-drills` (merge b8f169f73), so its branch is dead work still holding a
  worktree; `feat/847-brevity-guard-gaps` (17 commits, last 23.08.) belongs to a point that is
  still OPEN, so its work is unmerged rather than dead; `feat/901-superseded-ci-run` and
  `feat/1049-queue-order-rule` each carry a single "Record hostile-test authoring commission"
  commit and nothing else. Nothing is lost — everything is committed and on a branch — but the
  five live worktrees are what makes `batch-doctor --gate` report every unit run INCONCLUSIVE
  under load, which is how they were found. Non-blocking, and deliberately NOT acted on here:
  deleting 847's branch would discard work for an open point, and the "merge ends the branch"
  rule says nothing about a branch whose point was cut. Whoever picks this up decides per
  branch, and asks before any deletion.
- 2026-09-06 three picture observations from the point-689 evidence frames, none of them that
  point's own claim, all read at full resolution from `verification/18|19|20`:
  (a) the Bandiagara escarpment renders as a smooth brown box. Two frames earlier the
  communication erratic reads convincingly as rock — faceted grey block, scree at its foot —
  and the cliff the whole PoC puzzle ends at reads as a crate. The socket works and 689 does
  not ask for cliff geometry, so this is scenery debt, not a defect of that point.
  (b) same frame: two elephants stand at the puzzle's climax, one apparently overlapping the
  ruin geometry. Whether the animal walks THROUGH the landmark or only looks that way from the
  top-down camera was NOT resolved. Note against it: the `collision` suite passed 40 checks in
  the same run, which makes the camera the likelier reading.
  (c) `18-worldmodel-bambara-village-niger.png`: only the traveller's head is visible, sitting
  on the roof of the middle hut, his body hidden by it — it reads as the figure standing INSIDE
  a hut. The frame predates 689 (04.09.) and was only regenerated here. Same caveat as (b):
  `collision` sees nothing.
- 2026-09-06 the three picture-heavy suites of a LARGE run take two to three times their
  measured medians on this host: `polish` 21 min against a median of 5.7, `enrichments` ~19 min,
  while the light suites ran at normal speed. The renderer is genuinely busy throughout
  (64-69 % CPU, frames written continuously), so it is a slowdown and not a hang. What is
  missing is the measurement that would decide it: the quiet-machine check reports
  "GPU load NOT measured (no sysfs gpu_busy_percent, no nvidia-smi)" on this host, so whatever
  else uses the card is invisible to us. One whole-suite LARGE now costs ~90 min per backend.
- 2026-09-06 point 603's ground-detail measurement is DRIFTING, which its own text does not yet
  record: 1.08-1.09 on 13.08.2026, twice 1.07 today (06.09.) against the unchanged bar of 1.1,
  both attempts on the same run. A number that moves is a different question from a number that
  sits still under its bar, and 603 owes the verdict either way.
- 2026-09-06 the board and the in-flight declaration contradict each other the moment a landed
  point still owes closing work. `batch-in-flight.mjs --waiting-on` insists every evidence item
  name a point ("1 evidence item(s) name no point"), while `board-publish.mjs` refuses to render
  a now-section whose focus names a point that is no longer open ("the owner focus names point
  689, which is not open"). Passing `--point 689` therefore satisfies the first and breaks the
  second, and omitting it breaks the first — so a wait taken during a landed point's closing
  duties cannot be declared at all. Measured today between the merge of 689 and its covering
  WebGL run: four attempts, every combination refused. The `closing <N>` board card exists for
  exactly this state and is accepted; the in-flight declaration simply does not know about it.
  No player impact, and the workaround is to run the wait undeclared, which is why this is an
  observation and not a point.
- 2026-09-06 `20-worldmodel-bandiagara-talus-foot.png` on BOTH backends of the merged state
  (WebGPU compatibility 21 FPS, WebGL 2 49 FPS): the two elephants dominate the upper half of
  the frame and read as oversized against the traveller and the ruin slab beside them. This is
  the scale question, separate from the overlap noted above on 05.09.: there the doubt was
  whether an animal walks through the landmark, here it is how big the animal is at all. Both
  frames are otherwise identical between the backends, so it is not a renderer artefact.

- 06.09.2026: A batch claim expires after 30 min without claimant ACTIVITY, and a background polling loop is not activity — the launcher took the released lock first. Renew the claim (re-run batch-claim.mjs) while waiting, or claim only when the release is near.

- 2026-09-06 the `polish` suite's cost table is stale, and `run-wait.mjs --await` therefore calls
  a healthy run HUNG. Measured today on `feat/691-space-guess-and-nearest-candidate`: the plan
  promised "21 frames, 5m 41s"; the WebGPU pass wrote 44 frames in 26m 48s and the WebGL 2 pass
  44 frames in 49m 02s, both GREEN. Past 2.5x the expectation the await prints "HUNG … end the
  run rather than waiting again" and records a standstill for the emergency lane — so the
  advice, followed, would have thrown away two green passes of a mandatory both-backends picture
  check. The frame count is already reported as "a floor, not a ceiling"; the TIME is not, and
  it is the one the hung verdict is computed from. No player impact; the workaround is to judge
  progress from the frames being written and keep awaiting.

- 2026-09-06 under a HARD throttle the browser lane dies before it measures anything, and the
  death has no owner. Measured with `throttle-probe polish --section=speech-hypothesis --backend
  webgl --runs 6` at about a quarter of one core: run 2 of 6 read `0 pass, 0 fail, 0
  console-errors (exit 1)` with `page.evaluate: Execution context was destroyed, most likely
  because of a navigation` thrown from `assertBackend` (`scripts/verify/_browser.mjs:100`, called
  at `scripts/verify/polish.mjs:146`) — the dev server reloaded the page while the backend
  assertion was reading `window.__renderer`, so the run measured nothing at all rather than
  failing a check. The same six runs were otherwise green, and twelve unthrottled runs on both
  backends carried no red, so it is load-shaped: the Vite optimizer re-bundling behind an open
  page, the same environment class point 939 owns for the 504 console reading, but a different
  signature and not covered by its charge. No player impact and no blockade — a full suite run is
  never taken at a quarter core — which is why this is an observation rather than a point. If it
  ever reaches an unthrottled lane it needs an owner, because a run that measured nothing is a
  real red and no retry may close it.

- 2026-09-06 `batch-doctor --gate` derives "live agent" from a worktree EXISTING rather than from
  its activity, so its gate verdict can never come back cleanly green while a corpse stands.
  Measured on tonight's run: the gate declared INCONCLUSIVE (load) and named "4 live agent
  worktree(s)" — `point-1049`, `point-834`, `point-847`, `point-901`. `batch-in-flight
  --agent-check` over those exact four paths judged them `quiet`, "no commit and nothing written
  for 5299 min" — roughly 88 hours dead. So the activity test the doctor is missing already
  exists in the same repository. Nothing is at risk in them: all four branches are fully pushed
  (1049 and 901 one commit each, 847 seventeen, 834 one hundred twenty-two). The same run had a
  second, GENUINE load source — the concurrent `test:unit` of point 1058's landing — so this
  reading alone did not decide the verdict, and the doctor's own advice ("repeat once the agent
  pool is idle") is unreachable as long as existence counts as work. No player impact and no
  blockade: an inconclusive verdict never approves anything, and the doctor says the batch
  continues. The cheap fix is one call, not a new mechanism.

- 2026-09-12 point 1087 picture review — `verification/1087-village-carrier-returns-with-water.png`
  carries its declared subject (the carrier with the full jar and a readable water disc at its
  rim), but he stands at the LEFT EDGE and about two thirds of the frame is empty savannah and
  sky; a human reader does not find the subject first. The check is green because it requires the
  carrier to be CONTAINED, not centred. Framing only — the stale-shutter defects of the same
  section already belong to point 1108, and this is neither of them.
- 2026-09-12 batch operation — `scripts/batch-doctor.mjs --gate` and a running verification run
  collide. The Stop hook demanded the doctor gate because of a parallel session; its gate runs
  `npm run test:unit` + `build` + `lint` in the main tree while point 1087's LARGE run, which
  begins with the same unit suite, was running in the worktree. The LARGE run died after 6 m 53 s
  on a 20 s timeout in `scripts/mechanism-review-guard.test.mjs`, and the runner itself wrote
  "UNDER LOAD — a timeout failure under load is not evidence of a broken test". Two hours of run
  time lost. Neither side knows about the other; the in-flight declaration would know, but the
  doctor does not read it. No player impact and no blockade, so it is collected here.

## The give's second evidence frame is aimed by construction, not by rule (measured 07.09.2026, FIXED 08.09.2026)

`150-artefact-chiefs-answer` in `scripts/verify/polish.mjs` stepped the camera back seven
metres and looked at the chief from the traveller's own eye height — setting his position and
his bearing, and never his PITCH. On WebGPU that composed well on 07.09.2026 and on WebGL 2 it
came out pitched at the sky; on 08.09.2026 the WebGPU shot came out that way too: two thirds
cloud, the roof filling the rest, the chief nowhere in it and his note jammed against the
inventory bar. The shutter passed it every time, because the declared subject was the note two
metres ABOVE him and a note at the bottom edge is still in the picture.

Both halves are closed now. The pose that composes the shot levels the view, so the angle no
longer arrives from whatever the block before it last looked at; and the frame declares the
CHIEF'S CHEST, which cannot be in a picture aimed at the sky — so the same mis-aim is refused
instead of photographed.

## Point 1064's cross-vendor review covers only half its files (07.09.2026)

GPT-6 Astra reviewed pass 1/2 of `cd0418380` — `PlaceScene.tsx`, `chiefMeeting.ts`,
`chiefPresence.ts` — with the verdict `merge` and no defects; the record stands in
`.claude/mechanism-reviews.jsonl`. Pass 2 was launched after the merge had landed and refused:
"cd04183 does not diverge from main, so there is no branch range to show". Still owed a
reviewer are `src/state/store.ts`, `src/ui/Hud.tsx` and `src/world/finds.ts` — the give's
refusal path, the bar's carried-only rule and the find list. Re-runnable with an explicit
`--since 107af759566b3c201e91367bd711312924be5ec8 --pass 2` plus those three `--file`s;
`mechanism-review.mjs --list` shows the debt. Non-blocking: the mechanism gate no longer
blocks under the infrastructure freeze and the point is landed. Recorded so the range is not
re-derived — the lesson is to run the review BEFORE the merge takes the branch range away.

## Richtungsansage des Ufer-Spiels bleibt außer Hörweite (07.09.2026)

Die Runde sagt vor jedem Lauf an (bankGame.ts announceRun, lueckenlos, da der Lauf auf s.direction!==null wartet), aber der Ansager ist der Laeufer am STARTfelsen und der Faenger tippt ROCK am ZIELfelsen. Die Felsen stehen 19,7 m auseinander (riverBank.ts), hearingRadius ist 10 m und ein HARTER Schnitt: jenseits davon kein Ton, kein Label und keine Zeigegeste (spokenGesture.ts speechReach, PlaceLife.tsx speakBankUtterance). Die Seiten wechseln pro Lauf, also ist ein Zuschauer an einem Felsen bestenfalls jeden zweiten Lauf in Hoerweite; in der Mitte 9,85 m zu beiden bei ~4 % Pegel. Beleg: State-Dump hoa-state-2026-09-07-1186491426 (bambara-village) enthaelt nach der ganzen Sitzung nur zwei gehoerte Woerter, BA-ba-ba-BA und ba-ba-BA-BA; RIVER und beide Richtungswoerter fehlen. Testluecke: bankGame.test.ts prueft nur die Alternation und laeuft mit utteranceGapSeconds 0 ohne jede Distanzpruefung. Nutzer-Meldung 07.09.2026: 'Die Kinder muessen vor jedem Start ihre Richtung ansagen. Ich sehe sie das nur selten machen.'

## Rate-Einladung ist in der Konzept-Ansicht unsichtbar (07.09.2026)

Die Einladung 'Space – Bedeutung raten' haengt am Sprechzettel (SpeechLabelCard.tsx: targeted && !conceptLabels) und ist damit abgeschaltet, solange die Debug-Konzeptansicht laeuft. Im State-Dump hoa-state-2026-09-07-1186491426 steht ui.speechConceptLabels: true — der Nutzer hatte sie an und sah deshalb nie eine Aufforderung; er hielt es fuer eine Regression der SPACE-Umstellung (Punkt 691). Zusaetzlich erscheint die Einladung nur innerhalb hearingRadius 10 m (speechUseCandidate) und nur fuer die ~2,6 s, die das Label steht (communication.labelSeconds). Nutzer-Meldung 07.09.2026: 'Zudem fehlt die Aufforderung, dass man mittels Benutzen-Taste eine Vermutung hinterlegen kann.'

## stallSeconds der Erwachsenen-Errands wird nirgends gelesen (07.09.2026)

balance.villageLife.adultErrands.stallSeconds (20 s, 'kein Fortschritt -> Errand loslassen', Punkt 586) ist im Interface AdultWorkConfig deklariert, im Debug-Menue einstellbar (DebugMenu.tsx adultErrandStall) und in adultWork.test.ts gesetzt — aber stepAdultWork liest cfg.stallSeconds NIRGENDS; nur cfg.errandSeconds (180 s) wird ausgewertet. Die Steckengeblieben-Erkennung in PlaceLife.tsx greift ausserdem nur bei einem Villager, der zu GEHEN versucht (moved < step*0.25), nicht bei einem, der planmaessig steht. Dazu die Hush-Blockade: ein DIG-Paar wird stumm geschaltet, sobald ein Kind in Hoerweite ist oder die Grube nicht frei ist (adultWork.ts t.hushed = true), und steht dann bis zum 180-s-Backstop. Seit dem Ufer-Spiel (Punkt 687) laufen die Kinder quer durchs Dorf, 'Kind in Hoerweite' ist also viel haeufiger als bei der Platzierung der Grubenplaetze angenommen. Passt zur Nutzer-Meldung im Report hoa-state-2026-09-07-1186491426 (bambara-village): 'Was ist mit diesen beiden Erwachsenen. Die stehen da die ganze Zeit herum.' Am Bild noch nicht bestaetigt — das PNG im Archiv unter /backup/hoa/local/ ist noch nicht angesehen.

## Wasserholen der Erwachsenen ist ein Kreislauf ohne Ziel (07.09.2026)

Nutzer-Meldung 07.09.2026: 'Die Erwachsenen scheinen zum Selbstzweck Wasser zu holen. Sie laufen damit ein paar Meter Richtung Dorf, ohne das Wasser irgendwo hinzubringen, sagen dann wieder River, kehren um und holen wieder neues.' Nachgemessen in adultWork.ts/PlaceLife.tsx: (1) water-back wird auf den naechsten FREIEN Villager im Umkreis WATER_FOOT_REACH=4 um den Wasserfuss besetzt (nearestFree) — das ist in aller Regel genau der Mann, der eben die water-out-Errand dort beendet hat (dwellSeconds 6, danach task=null, free=true). Derselbe Mann geht also runter und kommt hoch. (2) Der volle Krug entsteht aus dem Nichts: water-back setzt carry='fullJar' beim Casting, niemand fuellt etwas; water-out behaelt bis zuletzt 'emptyJar' und endet am Wasser, ohne je voll zurueckzukommen. (3) Das Ziel der Rueckkehr ist waterHead bei Radius 15 (layout.ts WATER_PATH_HEAD_RADIUS) — der Rand des bebauten Grundes, keine Huette, kein Wasserplatz, kein Empfaenger. Bei Ankunft faellt RIVER, dann 'else if (t.arrived && t.phase===walk) state.tasks[i]=null' — Aufgabe weg, carry='none', der volle Krug verschwindet auf der Stelle (PlaceLife headJar.visible = carry==='fullJar'). Die Spec (docs/communication-poc-spec.md 'The adults teach RIVER through an empty-jar departure and a full-jar return at the village end of the water path') beschreibt genau diese zwei Situationen — der Code folgt ihr also woertlich; was fehlt, ist ein sichtbares Ziel des Wassers, damit die Lehre nicht als Selbstzweck liest. Braucht eine Design-Entscheidung (Wasserplatz/Krugreihe an der Huette als Empfangspunkt) plus getrennte Traeger fuer Hin- und Rueckweg.

## NUTZER-AUFTRAG 07.09.2026: Brunnen komplett aus dem Dorf entfernen (07.09.2026) — EINGEREIHT als Punkt 1092 (10.09.2026), dort in der Fassung des Nutzers vom 10.09.: nur bambara-village, die anderen Doerfer behalten den Brunnen

Nutzer-Auftrag, priorisiert, Begruendung Kommunikationsmechanik: 'Zudem macht der Brunnen in dem Dorf ohnehin wenig Sinn, wenn die Erwachsenen immer zum Fluss laufen. Entferne ihn komplett aus dem Dorf (priorisierter Fix fuer Kommunikationsmechanik).' Ausloeser war Report hoa-state-2026-09-07-1702816850 (bambara-village, seed 1702816850): 'Brunnen haengt im Zaun'. UMFANG (gemessen): lifeSpots.ts — 'well' aus VILLAGE_SPOTS (Z9) streichen, dazu die beiden Stationen in villageAdultStations (Z32 der Brunnen, Z33 der Halt des Wassertraegers) und die Aufzaehlung im Kopfkommentar Z17. PlaceLife.tsx — Komponente Well (Z1599-1633) und ihr Rendering (Z2999) loeschen, dazu der TaskWalker mit carry='jar' (Z3010-3019), dessen Ziel der Brunnenhalt ist; Kommentare Z7 und Z2558 ziehen mit. layout.ts — der Brunnen-Collider (Z1452) faellt weg; Z762 (Object.values(VILLAGE_SPOTS)) schrumpft von selbst. lifeSpots.test.ts Z48-51 erwartet den Brunnen unter den Stationen und muss mit. ENTSCHEIDUNG zum Krugtraeger: ersatzlos streichen statt umhaengen — alle Krug-Wege gehoeren damit den Errand-Erwachsenen auf dem Wasserpfad, und die Lehre bekommt keinen stummen dritten Krugtraeger daneben. Weniger Stationen machen die Platzierung des Kinder-Spielgrunds (Punkt 481.4) nur leichter, kein Regressionsrisiko.

## NUTZER-AUFTRAG 07.09.2026: eigener spaeterer Task fuer das Clipping von Lebens-Requisiten (07.09.2026) — EINGEREIHT als Punkt 1093 (10.09.2026)

Nutzer-Auftrag: 'reihe einen weiteren Task fuer das Clipping-Problem ein, der spaeter erledigt wird' — also NICHT priorisiert, eigener Punkt, nach dem Brunnen-Fix. Befund dazu (gemessen in layout.ts): die festen Requisitenplaetze VILLAGE_SPOTS werden gegen WOHNBAUTEN freigehalten (isFree Z774 prueft jeden Kandidaten gegen lifeSpots), aber ZAEUNE werden ohne jede Lebens-Requisiten-Pruefung gesetzt: fences.push an Z1108, Z1113, Z1229 (Gehoeftring), Z1293 und Z1335 (Steinring r 17.5 um (0,0.5)) konsultiert lifeSpots nirgends. Deshalb kann ein Gehoeftring quer durch einen festen Requisitenplatz laufen — im Report hoa-state-2026-09-07-1702816850 traf es den Brunnen bei (9, 8.5). Der Brunnen verschwindet zwar mit dem prioritaeren Auftrag, die Exposition bleibt aber fuer Sprecherpaar (4.6,5.6), Stampferin (-7,1.2), Trommler (-2.2,0.2) und Weberin (-8.5,-7) bestehen. Aufgabe: Zaunzuege gegen die Requisitenplaetze pruefen (Zaun weglassen, Ring verschieben oder Platz aus dem Plan heraus setzen wie beim Wasserpfad), plus ein Test ueber mehrere Seeds, dass kein Requisiten-Collider einen Zaunpfosten oder eine Wohnbaute schneidet.

Building and fence clearance implemented with point 1143: `layout.ts` opens fence panels around the full prop and figure footprints. `lifeStationClearance.test.ts` covers 300 seeds each for Bambara, Maasai and Swahili, plus representative seeds for every village plan. The `polish` section `village-stations` stages the reported weaver for both-backend picture review.

## Clipping trifft die Kommunikationslehre nicht — 1045 tut es (07.09.2026)

Frage des Nutzers 07.09.2026: betrifft das Clipping ausser dem Brunnen auch anderes, das fuer die Kommunikationsmechanik zaehlt? Gemessen in layout.ts: (a) Der WASSERPFAD wird gegen den GESAMTEN Collider-Satz inkl. Gehoeftzaeune geprueft (Z1554-1600, collidersNearRun/standingClear); findet der Sweep keinen freien geraden Lauf, wird waterPath=null gesetzt (Z1642) — der Pfad clippt also nie, das Dorf verliert dann aber die RIVER-Lehre ganz. Genau das ist der OFFENE Punkt 1045 ('Two village layouts have no straight walk to the water, so they teach no RIVER', TASKS.md Z14430), gemessen an bambara seed 7 und 1337. (b) DIG-SITES pruefen ebenfalls standingClear gegen den Collider-Satz (Z1827) plus Kinder-Hoerweite (Z1828). (c) Die PLAY ROCKS liegen auf der Uferlobe bei ~32,5 m, ausserhalb des Gehoeftbandes. Ungeprueft bleiben allein die FESTEN Requisitenplaetze VILLAGE_SPOTS: clears() des Gehoeftrings (Z1192-1207) kennt nur andere Ringe und die funktionalen Gebaeude, und isFree haelt nur WOHNBAUTEN von den Plaetzen frei. Exposition nach Radius: Brunnen (9,8.5) r 12.4 mitten im Gehoeftband cr 13.5-17.5 minus Ring ~7, also Innenkante ~6.5; Sprecherpaar r 7.2 und Stampferin r 7.1 knapp erreichbar; Trommler r 2.2 sicher. FOLGERUNG: das Clipping ist ein Bild- und Begehbarkeitsfehler, kein Lehrfehler — es bricht keine der drei Lehrflaechen. Empfehlung an den Nutzer: Requisiten-Clipping bleibt der spaetere Task, vorgezogen gehoert stattdessen Punkt 1045.

## Bank game: the direction call never reaches the documented spectator stand (07.09.2026)

Measured 07.09.2026 (discussion only, no code change). The children's bank game announces the run direction at the START rock (bankGame.ts announceRun, speaker = nearest child to rockAt(stage, s.from)), and the sides swap every run so the announcer alternates between the two rock ends. The stretch between the play rocks is 19.7 m (riverBank.ts, pinned by riverBank.test.ts). balance.communication.hearingRadius is 10 m with a HARD cutoff (heard.ts isWithinHearing) and gain = 1/(1+24*(d/r)^2) (speaking.ts hearingGain): 14 % at half the radius, 4 % at the rim. bankPlayRocksView -- the stand the project itself defines as where the stage is watched and photographed, the only one with both rocks in frame -- sits one full stretch length off the axis from the middle, i.e. hypot(19.7, 9.85) = 22.0 m from EACH rock. So from that stand the announcement is not merely faint, it is outside the cutoff entirely: reception is zero, every run. The player can only hear it by standing at a rock, where he loses the stretch, and then only on the runs that start at his end. Raising hearingRadius alone does not fix it and breaks three other things: the value also bounds gesture and overhead label (balance.ts, 'range of the WHOLE act'); childPlayGround minClearance plus the devAssert 'tag-play-ground-unseparated' (PlaceLife.tsx) require the children's quarter to clear every adult vignette by that radius, which is geometrically impossible at 20 m in a 28 m disc with the drummer 2.2 m off centre; and adultWork's childrenHear / invitationClear hush the adults and refuse DIG invitations within radius + arrival slack of the play ground, both play rocks and the water foot, so 20 m would silence the adults' RIVER/DIG teaching. Even 20 m would not reach the 22 m stand. Candidate direction discussed with the operator: make carrying distance a property of the UTTERANCE (a call across the bank is a shout, a dig invitation beside the hole is not) rather than of the settlement -- one balance field, no new mechanism -- so the separation budget stays at 10 m for ordinary speech. The missing test measures reception over a full round FROM bankPlayRocksView, which today is zero. Not yet queued; the operator asked for discussion first.

## Village speech has no stereo bearing, and the hush flag is both cause and exemption (07.09.2026)

Measured 07.09.2026 (discussion only, no code change). TWO things found while checking whether the adults' hush could be dropped in favour of the player telling voices apart by ear. (1) NO SPATIALISATION AT ALL: src/ contains no PannerNode, createPanner, StereoPanner or PositionalAudio. speaking.ts phrasePlan takes a scalar distance and returns a scalar peak (hearingGain), and ambience.ts routes every syllable through one mono speechBus. All village speech arrives dead centre, whatever the bearing to the speaker. Two overlapping voices therefore cannot be separated by direction, only by level -- and the level says nothing when the two speakers stand at similar distance. Every voice also shares one timbre and the same two pitches (ba/BA, 140 Hz and 1.68x), which is the hardest case for the ear. So any argument of the form 'overlap is fine, stereo sorts it out' does not hold on the current build; a StereoPanner per utterance driven by the camera bearing would be a small, self-contained addition and would make the argument true. (2) THE HUSH FLAG IS ITS OWN EXEMPTION: in adultWork.ts, view.childrenHear() sets t.hushed = true and leaves t.owes true, so the word is DEFERRED, not cancelled -- it falls as soon as the children are out of earshot. But assertNoOwedWord (adultWork.ts:176-182) fires 'adult-atom-lost' only when !task.owes || task.hushed === true is false, i.e. hushed is exactly the exemption that permits an owed word to be dropped when the villager runs out of time. At the current 10 m radius the hush is rare and brief, so this is latent. Any enlargement of the hearing/carrying radius makes the hush frequent or permanent, and the adults' RIVER/DIG words would then be lost SILENTLY, with the one assert that should catch it disarmed by the very flag causing the loss. If the carrying distance is ever raised, the hush must become a bounded deferral (speak anyway after a hold) rather than an open one, and the assert must stop taking hushed as a blanket excuse. WHAT DOES WORK as a disambiguator, confirmed: pickSpeechTarget takes the NEAREST speaker inside the hearing radius and his label alone carries highlight and SPACE invitation; other speakers' labels stand unhighlighted (speechLabel.ts showSpeechLabel keeps one label per speaker); pickUseCandidate arbitrates the speaker against doors and other SPACE meanings. The player is never in doubt WHICH utterance he is annotating. The residual gap is that hearUtterance records EVERY in-range utterance, target or not, so overlap fills the journal with entries whose accompanying act the player could not attach. Not yet queued; the operator asked for discussion first.

## Der dokumentierte Pfad des Findings-Traegers ist der falsche — der Owner liest eine leere Datei (07.09.2026)

Gemessen 07.09.2026 18:50. Der Batch-Owner-Runbook (docs/batch-owner-runbook.md, Abschnitt 'Board and owner-only operating hooks') nennt als Traeger /home/node/.claude/projects/-workspace-hoa-/memory/findings-carrier.md — MIT Bindestrich am Slug — und der Kopfkommentar IM Traeger begruendet diesen Bindestrich ausdruecklich ('findings-paths.mjs derives that slug from the repository root trailing slash'). scripts/finding.mjs benutzt aber tatsaechlich /home/node/.claude/projects/-workspace-hoa/memory/findings-carrier.md, OHNE Bindestrich. BEIDE Dateien existieren. WIRKUNG, in dieser Sitzung real eingetreten: Ich habe zu Beginn des Zuges die dokumentierte Datei mit Bindestrich gelesen, dort 0 offene Eintraege gezaehlt (alle 297 abgehakt) und dem Nutzer 'Findings-Traeger geprueft: 0 offene Eintraege, nichts zu uebertragen' gemeldet. Das war FALSCH: im echten Traeger ohne Bindestrich standen zu diesem Zeitpunkt 9 wartende Befunde von 16:11-16:49, DARUNTER ZWEI NUTZER-AUFTRAEGE vom 07.09.2026 (Brunnen komplett aus dem Dorf entfernen; eigener spaeterer Task fuer Requisiten-Clipping). Sichtbar wurde das erst, als der PostToolUse-Hook nach batch-in-flight --clear von sich aus 'FINDINGS CARRIER: 9 waiting' meldete — nicht durch meine Pruefung. Der Traeger mit Bindestrich ist also ein historischer Rest, dessen eigener Kopftext die Verwechslung aktiv erzeugt. VORSCHLAG: entweder den Rest-Traeger loeschen und Runbook plus Kopfkommentar auf den Pfad ohne Bindestrich stellen, oder die Nennung eines Pfades in der Doku ganz streichen und ausschliesslich 'node scripts/finding.mjs --drain' als Zugang dokumentieren — der Befehl war die ganze Zeit richtig, nur die Datei daneben nicht.

## Punkt 1070: der Autoren-Screenshot ist bei 4 FPS aufgenommen und das CHIEF-Label sitzt ueber dem Huettendach (07.09.2026)

Gemessen 07.09.2026 am committeten verification/151-chief-beside-his-drummer.png des Zweigs feat/1070-chief-to-drummer (HEAD 4a995578c), angesehen in voller Aufloesung. WAS STIMMT: Haeuptling (weisse Kopfbedeckung, gelbes Gewand) steht neben dem Trommler, beide von vorn, Trommeln und Trommelstock im Bild, Szene vollstaendig gestreamt (Huetten, Feuer, Zaun, Wasser am Horizont, Himmel). ZWEI OFFENE PUNKTE FUER DAS BILDURTEIL DES NACHFOLGERS: (1) Der HUD-Zaehler zeigt 4 FPS. Der Container-Befund vom 04.08.2026 haelt fest, dass die Szene bei niedriger Bildrate rund fuenfmal langsamer einstroemt und Suiten mit festen Wartezeiten zu frueh fotografieren; hier ist die Szene zwar sichtbar voll, aber eine Bewegungsaussage — der Haeuptling GEHT sichtbar heraus und kommt an — laesst sich aus einem Standbild bei 4 FPS nicht belegen. Die Gehphase gehoert auf beiden Backends bewegt geprueft, nicht am Einzelbild. (2) Das Sprechzettel-Label 'Chief' schwebt ueber dem Dach der rechten Huette, deutlich oberhalb und links versetzt zu jeder Figur. Ob es damit den Trommler meint, der laut Punktspezifikation AUF DIE HUETTE ZEIGT und das Wort CHIEF spricht, oder ob es fehlplatziert ueber der Figur haengt, ist am Standbild nicht entscheidbar. Beides muss vor dem Landen am laufenden Bild geklaert werden. Nicht als Fehler behauptet — als ungepruefter Rest markiert, weil die Sitzung den Batch-Zaun verloren hat, bevor sie die Suiten fahren konnte.

## User decision 07.09.2026: stereo panner for village speech, and higher pitches for children (07.09.2026)

Operator decision during the bank-game hearing discussion, verbatim: 'Okay, dann brauchen wir einen StereoPanner. Zudem sollen die Kinder zwei Tonhoehen verwenden, die hoeher sind als bei den Erwachsenen. Dann klingt es auch mehr nach Kinderstimmen.' TWO ordered changes. (1) STEREO PANNER: village speech currently has no spatialisation at all -- no PannerNode/StereoPanner/PositionalAudio anywhere in src, speaking.ts phrasePlan returns a scalar peak from a scalar distance, ambience.ts routes every syllable through one mono speechBus. Add a per-utterance stereo position driven by the bearing from the camera to the speaker, so two overlapping voices can be told apart by direction. This is what makes the operator's argument true -- that overlapping teaching voices need not be prevented by hushing, because the player can separate them by ear. (2) CHILD PITCHES: every voice currently shares one carrier pitch and one interval (balance.communication.speechPitchHz 140, speechPitchInterval 1.68 -- a major sixth), so children and adults are acoustically identical. The children get their own, HIGHER low/high pair, which both sounds like children and gives the player a second separation cue independent of direction and level. The two-tone low/high relation itself must stay intact -- it is what carries the whole language (lexicon.ts direction pair is an exact tonal mirror) -- so this is a transposition of the pair, not a new interval, unless the interval is deliberately chosen too. Consequences to carry: the ambience.test.ts speech headroom measurement is calibrated against the deployed audio graph and will need re-measuring for the new pitches; the balance fields are calibratable per CLAUDE.md 2. Both changes are prerequisites for relaxing the adults' hush (see the finding on hearingRadius coupling and the adult-atom-lost exemption). Not yet queued as work-order points -- the operator asked for a numbered summary first.

## Die Hush-Begruendung der Ufer-Karte traegt nicht: hushed haengt an der Kindernaehe, nicht an der Ruf-Tragweite (07.09.2026)

Gemessen 07.09.2026 19:15 beim Ausformulieren der sechs Karten-Aspekte. Die Karte 'Ufer-Ansage' begruendet Aspekt 4 (Verstummen begrenzen) damit, dass Aspekt 3 (Tragweite als Eigenschaft der Aeusserung, Ruf ~22 m) ohne ihn zum stillen Wortverlust wuerde. Diese Kausalkette traegt so NICHT. childrenHear (PlaceLife.tsx:2243-2253) prueft die Distanz KIND->SPRECHENDER Erwachsener gegen balance.communication.hearingRadius; ebenso invitationClear (PlaceLife.tsx:2259-2270) gegen hearingRadius + WORK_ARRIVE_RADIUS. Eine SEPARATE callReach-Groesse fuer die Ruf-Momente laesst beide unveraehrt bei 10 m — das Trennungsbudget bleibt, wie die Karte selbst zusagt, und genau deshalb erzeugt Aspekt 3 keinen zusaetzlichen Hush. Die urspruengliche Begruendung stammt aus dem Backlog-Befund 'Village speech has no stereo bearing', der von einer GLOBALEN Radiusvergroesserung ausging ('Any enlargement of the hearing/carrying radius makes the hush frequent or permanent'); die Karte hat den Aspekt danach auf die Aeusserung verfeinert, die Begruendung aber mitgenommen. WAS STATTDESSEN TRAEGT, ebenfalls gemessen: t.hushed wird in adultWork.ts an drei Stellen gesetzt (339 Einladung, 349 und 352 Grubenwort) und innerhalb einer laufenden Aufgabe NIE zurueckgenommen — das einzige delete steht in 266 beim Giessen einer frischen Initiator-Aufgabe. assertNoOwedWord (176-182) nimmt hushed===true als Freibrief, das geschuldete Wort fallen zu lassen. Seit dem Ufer-Spiel (Punkt 687) laufen die Kinder quer durchs Dorf, 'Kind in Hoerweite' ist also viel haeufiger als bei der Platzierung der Grubenplaetze angenommen, und der einzige Ausgang ist der 180-s-errandSeconds-Backstop (stallSeconds 20 s wird nirgends gelesen — siehe den Backlog-Eintrag dazu). Das ist derselbe Defekt wie die Nutzer-Meldung 'Was ist mit diesen beiden Erwachsenen. Die stehen da die ganze Zeit herum.' FOLGE FUER DEN PUNKTTEXT: Aspekt 4 bleibt faellig und bleibt mit 3+5 gebuendelt (Nutzer-Entscheidung 07.09.2026 19:08, 'Setze alle 6 Punkte so um, wie jetzt in der Karte beschrieben'), aber seine Begruendung wird auf diese Messung umgeschrieben statt auf die Kausalkette der Karte. Dem Nutzer 19:16 gemeldet.

## Der sanktionierte Nicht-Owner-Weg ist unbenutzbar: --request verlangt eine Datei, und der Stand-down verbietet jede Datei (07.09.2026)

Gemessen 07.09.2026 19:10-19:12. Situation: Der Nutzer erteilte in DIESEM Fenster einen Arbeitsauftrag (sechs Aspekte der Karte 'Ufer-Ansage' einreihen), waehrend Sitzung 937c9c08 den Batch-Lock hielt. Das Memory 'user-orders-go-through-the-carrier' und der Kopftext des Traegers nennen dafuer genau einen Weg: node scripts/finding.mjs --request "<Titel>" --spec-file <pfad> --why-file <pfad>. Dieser Weg ist fuer eine Nicht-Owner-Sitzung NICHT GEHBAR, weil --request (scripts/finding.mjs:181-185) die fertige Spezifikation ausschliesslich als DATEI annimmt — es gibt kein --spec/--why als Inline-Text —, der Batch-Stand-down aber JEDE Schreiboperation dieser Sitzung ablehnt. Gemessen abgelehnt wurden: Write nach /tmp/claude-1000/<session>/scratchpad/spec-voice.md, Write nach why-voice.md, bash 'mkdir -p' auf dasselbe Scratchpad-Verzeichnis, und sogar 'git branch -a --sort=-committerdate' (als 'state-changing segment ... on main' zurueckgewiesen). WAS DAGEGEN FUNKTIONIERT, in derselben Sitzung geprueft: finding.mjs --record mit inline --detail laeuft durch, und batch-claim.mjs laeuft durch. Der Traeger selbst ist also nicht gesperrt — nur der Umweg ueber Dateien, den ausgerechnet der --request-Pfad erzwingt. WIRKUNG: Der eine Mechanismus, der einen Nutzer-Auftrag aus einem Nicht-Owner-Fenster nachweisbar an den Owner uebergibt, faellt genau dann aus, wenn er gebraucht wird; als Ersatz blieb nur der Batch-Anspruch, also ein echter Eingriff in den laufenden Batch (der Nutzer hat ihn 07.09.2026 19:12 ausdruecklich gewaehlt). VORSCHLAG: --request zusaetzlich --spec/--why als Inline-Flags annehmen lassen, so wie --record es fuer --detail bereits tut; dann braucht der Nicht-Owner-Weg keine Datei und keinen Batch-Anspruch. Reproduzierbar: aus einer Sitzung ohne Lock ein Write in das eigene Scratchpad versuchen.

## Gegenbeleg: am 06.09. gingen drei --request-Uebergaben aus einem Nicht-Owner-Fenster gegen einen LEBENDEN Owner durch (07.09.2026)

Gemessen 07.09.2026 19:20 auf Nachfrage des Nutzers ('Bisher konntest du doch immer Specs ohne Batch uebergeben, oder?'). ERGAENZT den Befund 'Der sanktionierte Nicht-Owner-Weg ist unbenutzbar'. BELEG: Der Traeger enthaelt 14 [request]-Eintraege; die juengsten drei stammen vom 2026-09-06T11:52:27Z, 11:52:54Z und 11:53:22Z, Sitzungs-Tag 6c6d1be1, und wurden zu den Punkten 1064, 1065 und 1066. Aus .claude/batch-activity.jsonl: der Lock gehoerte zu diesem Zeitpunkt b7321dff (owner-claim 2026-09-06T10:35:51Z 'successor-converted-pending-spawn'), das naechste Ereignis ist erst 'pause awaiting-user' um 12:10:47Z, und b7321dff sendete um 11:37, 11:46, 11:56 und 12:01 foreground-activity mit lebender pid 2387673 (process-exit erst 12:01:23Z). 6c6d1be1 selbst beansprucht den Lock erst 12:32:17Z. Also: Nicht-Owner-Fenster, lebender Fremd-Owner, drei erfolgreiche Datei-basierte Uebergaben. WAECHTER UNVERAENDERT: ownershipStandDownDecision (board-first-core.mjs:163-206) blockiert seit 23cee76d4 vom 24.08.2026 jedes Edit/Write/MultiEdit/NotebookEdit/Agent ohne Pfadausnahme (einzige Ausnahmen: isBoardFile, paused===true, isWorktreeCheckout); seit dem 06.09. gibt es keinen Commit auf board-first-core.mjs, board-first-guard.mjs, command-classify-core.mjs oder batch-lease-core.mjs. HEUTE GEMESSEN ABGELEHNT in derselben Lage: Write ins eigene Scratchpad (zweimal, verschiedene Dateien), 'mkdir -p' auf ein BEREITS BESTEHENDES Scratchpad-Verzeichnis, 'git branch -a --sort=-committerdate'. NICHT AUFGEKLAERT und deshalb nicht als Regression behauptet: ueber welchen Schreibweg 6c6d1be1 seine --spec-file/--why-file-Dateien am 06.09. erzeugt hat. Die Klassifikation urteilt segmentweise am Kommando-KOPF (command-classify-core.mjs isMutatingSegment/segmentIntent), 'node' ist kein schreibender Kopf — ein 'node -e' mit writeFileSync oder ein Heredoc koennte also durchgelaufen sein, waehrend das Write-Werkzeug abgelehnt wird. Das waere kein funktionierender Weg, sondern ein Loch: derselbe Vorgang haengt davon ab, welches Werkzeug man waehlt. BEIDE Auflagen des Vorschlags bleiben: --request Inline-Flags geben (dann braucht der Weg keine Datei), UND entscheiden, ob die Kopf-Klassifikation ein Loch ist oder eine gewollte Ausnahme.
- 2026-09-07 user proposal (ChatGPT) — an OpenAI "owner-assistant" would take the owner work
  itself: hand it point brief, git status, author report, review receipt and verify digest, get
  back STATE/VERDICT/NEXT_COMMAND/RISKS/NEEDS_CLAUDE_JUDGMENT, and normally just run NEXT_COMMAND.
  VERIFIED, not assumed: `scripts/ask-astra.mjs` really does carry --kind diagnose|audit|enumerate|
  explain with --file/--log/--diff, so a fifth kind `owner-step` would be small, and the cost
  diagnosis holds (07.09.: Opus 5 141k output against 28.4M cache-read, Fable 486k against 43.9M —
  the spend is context, not thinking). THREE OBJECTIONS: the middle of the proposal is already
  routed (diff inspection, log diagnosis and test-result judgment are our diagnose/audit and have
  gone to Astra since 14:48; only "analyse state, determine the next step" is new); ask-astra
  fetches nothing, so the SELECTION of the material is the judgment work, and a fixed five-artefact
  packet is mechanical exactly where we really burn context — chasing a red into a file nobody
  predicted; and running NEXT_COMMAND unread abolishes the check instead of moving it, against our
  own rule that a reviewer handed a finished list checks that list. MEASURED remainder: of 374 open
  points 115 stay here through the verification carve-out, 196 go to Astra unmarked and 62 as hard;
  only 19 of the 115 matched on an incidental word (webgpu/webgl/visual/both backends), so cutting
  the markers narrower would move 5 % of the queue. `prefer-astra` is already the top switch
  setting. RECOMMENDATION: build `owner-step` as a fifth ask-astra kind but NOT as the normal
  path — only for the red triage after a verify run, where the material really is bounded (log,
  diff, charge ledger); NEEDS_CLAUDE_JUDGMENT stays a hard gate and no NEXT_COMMAND runs unread
  where the step is irreversible (landing, merge, push, tag). Not built: the user asked for an
  answer only (07.09.2026, 21:59). Not a work-order point under the CLAUDE.md §2 intake rule — no
  player impact, no risk, no blockade, and it adds rather than deletes.

## A verification frame passed with nothing drawn in it (measured 08.09.2026)

The 07.09.2026 22:21 picture run refreshed `verification/52-collision-port-wall.png` and drew it
BLACK: the HUD over an empty screen, 23 KB against 644 KB, with no scene at all. The collision
suite reported `PASS 40 pass, 0 fail` over it, so the shutter's subject declaration accepted a
frame in which nothing had been rendered — the check that is supposed to refuse a mis-aimed frame
cannot see an unrendered one. The frame was restored from `main` before the 1070 branch landed, so
nothing black is in the repository; the cause is unfixed and unexplained. Two questions are open:
why that ONE frame came out black while every other frame of the same run drew, and what a subject
declaration has to say about the rendered pixels for an empty picture to be refused. No player
impact and no blockade — the restore was one command — so it is recorded here rather than made a
point, in the class point 514 §5 already describes for black frames on this lane.

## The polish suite's recorded cost is a quarter of what it measures (measured 08.09.2026)

`run-wait.mjs --await` announces `expected 5m 41s` for the `polish` suite and declares the wait
HUNG at 2.5x that. Measured on this host the same day: 27m 17s, 32m 18s and 24m 41s for three
separate green runs. The consequence is not cosmetic — an honest blocking wait on a healthy run is
told it is a standstill and advised to "end the run rather than waiting again", which is exactly
the wrong move, and the batch emergency lane records the wait as hung. Related, and with the same
root: `batch-in-flight.mjs` refuses to record a waiting position for such a run, because the suite
writes its log only when a suite finishes, so the evidence check reads the log as "silent for 24
min" while the run is demonstrably writing a frame every three minutes. No player impact; the fix
is a re-measurement of the cost table, not a mechanism.

## The flow suite's chief frame may claim a pairing its village does not show (measured 08.09.2026)

`verification/04-chief-outside-his-hut.png` is declared "the chief standing beside his drummer,
both seen from the front" (`scripts/verify/flow.mjs`), and the version the 07.09.2026 22:21 run drew
shows the chief half BEHIND a second figure carrying a pole, with the drums several metres to their
left beside a third man. The geometry point 1070 really proves — one stride beside the drummer,
abreast, same bearing — is measured by `polish.mjs` in the BAMBARA village, while flow photographs
the NUBIAN one, where nothing checks the pairing before the shutter. Either the label overclaims
for that village or the walk lands him elsewhere there. The freshly drawn frame was not committed
and the older one was not re-judged, so this is a question, not a measured defect: no player impact,
and the mechanism itself is proven where it is checked.

## Infrastructure grew threefold while the game stood still (measured 08.09.2026)

Line counts on `main`, taken from the git history: `scripts/` went 97,542 lines (06.08.) →
191,757 (20.08.) → 266,859 (01.09.) → 273,603 (08.09.). `src/` without tests went 54,256 →
63,122 → 63,324 → 66,038 — between 20.08. and 01.09. that is 202 lines of game code in twelve
days. Open `TASKS.md` points over the same span: 118 → 237 → 358 → 374. Merges per day on `main`
held at 9–16 from 19.08. to 28.08. and fell to 1–4 from 29.08. onward, so the merge count read
healthy for the ten days in which almost everything merged was infrastructure. The infrastructure
freeze of 01.09. is measurable: `scripts/` has since grown 6,700 rather than 75,000 lines per week.
No player impact and no mechanism to build — this is the evidence base for the open Umsteuerung
measures 4–9, recorded so the next stocktaking does not have to re-derive it.

## The play rock's measured radius is an upper bound, not the surface (measured 08.09.2026)

`playRockSurface.ts` bins each triangle EDGE's crossing of a ring height by bearing and keeps
the LARGEST radius in each bin (`measure`, ~line 93); `fillGaps` then copies a neighbour's
radius into any bin no edge crossed. Both err outward: the drawn face between two vertices lies
INSIDE the radius of those vertices, so the answer is the circumscribed radius of the facet,
not the facet. `reachFrom` therefore places the touching hand a little too far out — a hair of
air rather than a hand through the stone, which is the harmless direction. Magnitude, measured
against the constants: `PROFILE_BINS = 32` gives 11.25° bins, and the lookup rounds to the
NEAREST bin, so the worst chord sagitta on a 1.2 m rock is 1.2·(1−cos 5.625°) ≈ 5.8 mm — under
a centimetre, against a spec tolerance of "a few centimetres, never through it"
(work-order 1065 PART A). Found by GPT-6 Astra's cross-vendor review of d35e890 and rated P1
there; the measurement above is why it is filed here instead: no reproducible player impact,
no blockade, and nothing deleted or simplified by fixing it (CLAUDE.md §2 finding intake). The
exact fix, if the tolerance ever tightens, is to intersect the requested radial ray with the
actual triangle cross-section rather than binning its endpoints. Note that `fillGaps` has no
such bound — a bin with no crossing takes a neighbour's radius whole — so a much coarser rock
mesh would need this looked at again.
## The polish runtime expectation is a quarter of the measured one (measured 08.09.2026)

`run-wait.mjs --plan polish` promises 5m 41s and 21 frames; the constant behind it
(`scripts/verify/run-wait-core.mjs` `polish: 340.9`, mirrored from
`docs/picture-check-cost.md` §1, whose measurement window is 25.–27.07.2026) is six weeks old.
Measured over every FULL-suite polish run record in this checkout and its worktrees
(`local/verify-logs/*.run.json`, `--section` runs excluded): 19 runs, median 1658.6 s; the 14
passing ones median 1614.0 s at 44 frames; the nine passing WebGL-2 ones median 1470.0 s. The
consequence is a false verdict, not a lost run: `--await` gives up after 9m 01s, calls the run
HUNG at 20 min and books it into the emergency lane as a standstill, while the Chrome GPU and
renderer processes are measurably computing at 69 % and 33 % and the dev server stands. The run
itself finishes and its completion notification arrives, so the wait is recoverable by declaring
it with `batch-in-flight --waiting-on`. `scripts/measure-picture-cost.mjs` reports a polish median
of 127.0 s over 15 runs, which is lower still — it appears to count PARTIAL `--section` runs, so
refreshing the table needs that separation first. No player impact and no blockade under the
infrastructure freeze; recorded so the next refresh of §1 does not have to re-derive it.

## The play rock's binned radius is a circumscribed bound, not its surface (measured 08.09.2026)

`playRockSurface.measure` keeps, per 11.25° bin, the LARGEST radius at which an edge of the
drawn face crosses that bin, and `fillGaps` copies a neighbouring bin into an empty one. Both
round outward, so the radius a toucher is placed against is the bin's circumscribed bound rather
than the face inside it. GPT-6 Astra rated it P1 in the `d35e890` round of work-order 1065.
Measured against the shipped `PROFILE_BINS = 32` on a 1.2 m play rock the worst case is under
5.8 mm — an order under the few-centimetre tolerance the tap is judged at (`TOUCH_GAP` 3 cm,
the browser check 6 cm), and it errs toward AIR rather than through the stone, so the hand
never disappears into the rock. The exact fix, when the file is open anyway: keep the minimum
radius over the bin's own edge samples instead of the maximum, and interpolate an empty bin
between its two neighbours rather than copying one. No player impact and no blockade, so it is
filed here under the CLAUDE.md §2 intake rule instead of becoming a point.

## The clothing research carries adults, not children (discussion 08.09.2026, no code change)

The user asked whether the village figures have a sex. They do not: `child` and `villager`
carry a grammatical gender and nothing else, a bank child has role, arrival and heading but no
such field, the bodies differ only in scale, cloth, role, kneeling and legs, and `dress.ts`
knows six seasonal wraps and no sex at all.

Whether that should change is a design question, and the corpus answers only half of it.
`docs/peoples-1890.md` distinguishes women and men extensively and with sources — the Zulu
isidwaba against the isipuku worn "by males and females", the Tuareg tagelmust explicitly "by
men, not women", the Swahili kanga period-correct from 1876-86, the two cloths of Bambara and
Hausa women in Barth, the larger Nama and San leather cloak an infant is carried in, the Somali
chignon in its dark blue bag with no face veil, and the standing warning that Atlas Berber women
do NOT veil. For CHILDREN the same research yields almost nothing: Pedi herd boys, San children
often without even a cloak, and Barth's schoolboys. A girl or a boy would therefore be largely
invented, which CLAUDE.md §2 forbids; the documented difference between children is the WORKING
ROLE, not the dress.

Two hooks if it is ever decided. The journal already tells the player that among the Tuareg it
is the men who go veiled and not the women, while the picture shows sexless cones — that is the
strongest entry point, because the text already claims what the scene does not show. And the
hold-Ctrl label knows only the KIND today, so a visibly female figure needs a noun per figure
rather than per kind. One warning for any such build: the corpus's passages on women's clothing
run straight into period reports of extensive nakedness, so a depiction would have to clothe
deliberately against its own source, and that choice would have to be argued rather than made
silently.

Why the dress work never split by sex, from the record rather than from memory. The order of
16.07.2026 behind point 137 named two axes and sex was not one of them — "deutliche Unterschiede
bzgl. der Kleidung je nach Region und Jahreszeit" (`docs/tasks-archive.md`, point 137) — and
design.md carries no sex for the inhabitants to this day. The research pass was read with the
SEASONAL question: §2.6 asks whether the same person wears more in the cold and §7 is a pure
season sweep, so the women's and men's material in §2 was never put as its own question; where
the source does touch sex it reports NO difference, the isipuku being worn "by males and
females". The body could not have carried it either: point 120g recorded on 16.07.2026 that the
primitive figures cannot even show a wrap worn differently, and arms arrived only with point 479
on 03.08.2026, so the one shape change ever built is the Somali head-muffle. And the system has
the wrong axis for it: `dress.ts` hangs on physical drivers (coldness, harmattan, karif), while
sex has no driver and would be a per-figure attribute rather than another table row.

One inconsistency found on the way, small and real: `docs/design-reference.md` §19.15 states for
the Tuareg that "the wealthier MEN wear the bernus", while the scene puts the cloak on roughly a
third of ARBITRARY figures — a rank gate standing where the source names a rank AND sex gate. It
is the only place where the current depiction contradicts its own recorded source, and the
cheapest thing to correct if the topic is ever picked up.

## The LARGE run of 08.09.2026 started on a machine that was not quiet

The quiet-machine check of the 1065 LARGE run reported MACHINE NOT QUIET at the shutter: a
forgotten vite dev server from that very checkout was still running (pid 2848232, port 42729),
and GPU load could not be read at all on this host (no sysfs `gpu_busy_percent`, no `nvidia-smi`).
The pick contained startup, polish, voice, settings, enrichments and benchmark — precisely the
timing-sensitive suites. The run proceeded and its pass/fail verdicts stand; its TIMING verdicts
cover nothing, which is 115 minutes of measurement thrown away. The server was left alive because
the run was still using the tree. Not filed as a point: point 296 already owns the quiet-machine
check, and the fix is operational — shut the dev servers down before a LARGE run, not more
mechanism.

## A red first backend lane ends the LARGE run, so the second lane never runs

Read on 08.09.2026 while reporting progress: with the WebGL 2 lane near its end and three suites
already carrying a CANDIDATE REAL FAILURE, the remaining runtime was reported as "the same round
again on WebGPU". That round cannot come. The run ended with exit 1 after 115m 20s and its
receipt names `backend: WebGL 2` alone — a red first lane terminates the run. The consequence for
any progress report: once lane one carries a candidate real failure, the remainder is the rest of
lane one, never a second lane, and the covering second-backend run has to be started separately —
which is exactly what `render-verify-guard` then demands before the branch may merge. The runner
behaves correctly here; what was wrong was the reading of it, so this is a note rather than a
point.

## The polish retry hangs after a red, and its expected runtime is stale

Measured 08.09.2026. After a red first attempt, `run-all` started the prescribed retry (point
200) and then wrote nothing for 24 minutes: `polish.mjs` alive at 2 % CPU, two Chrome instances
standing, the log ending at the retry line. `run-wait --await` booked the run as HUNG after
51m 30s — two and a half times the 5m 41s expectation — and pointed at killing it rather than
waiting again; SIGTERM did not clear the processes, SIGKILL did. Open: whether the retry raises
its own dev server and wedges on the occupied port or on the first attempt's still-open Chrome.
Noticed beside it: polish takes about 28 minutes on this machine against the
`expectedRuntimeMs` of 340900 ms recorded in run.json, so every hang detection fires early.
Infrastructure, and the freeze (CLAUDE.md §2) keeps it here until it reproducibly blocks.

## The scattered boulders are far darker than the play rocks

Seen on the picture evidence `187-child-on-the-boulder` (09.09.2026, both backends): the stone
the child stands on reads almost black, while the two play rocks in the same village
(`687-bank-play-rocks`) stand there a light stone grey. Both sit on the same bright sand under
the same sun. The scattered stone comes from `buildRock` (dodecahedron, detail 0, tint
`#8a8178`), the play rocks from `buildPlayRock` (detail 1, its own weathering); the scattered
stones also share the `GroundScatter` material with the grass tufts, whose `colorNode` runs
through `seasonTintNode`. To check: whether the season tint or the coarse faceting of the
detail-0 mesh darkens them. No blocker — the climb reads on both backends — but it looks wrong
to a human eye.

## The beginner guide has no room left for a new lesson

Reviewing `docs/analysis_de/vibe-coding-anleitung.md` against the sources of 09.09.2026, one
pitfall it does not yet carry wanted in: *a numeric bar measured on a single sample* — it stands
green for months and breaks under a change that does not touch the mechanism it judges, because it
never held a property, only the luck of one world, one seed, one machine; the lesson is to measure
the SHIPPED state over several samples before suspecting your own change. The entry does not fit:
`guide-brevity-core.test.mjs` holds a hard ceiling and demands that both caps carry the guard's
exact measured size ("no unearned headroom"), so any growth reads red. The entry was therefore
taken back out; the class itself stands permanently in the retrospective as §3.252. To decide: the
guide shortens an existing entry to make room, or the ceiling is raised once, deliberately. It does
not grow quietly, and that is the intent.

## Two polish runs on one checkout tear each other up (09.09.2026)

Non-blocking, collected. On 09.09.2026 two `polish` runs were started 7.3 s
apart on the SAME checkout while a third was still finishing. Both drew into
the one `verification/` directory, wrote partial frame sets (32 and 35 of 48)
and exited 1; neither log printed a single section, so neither carried a red
anybody could own. Both were signed off as crashes with their evidence, and the
fresh WebGL 2 run afterwards came back green.

Nothing stops the second start: the quiet-machine check NAMES the leftovers and
lets the run proceed by design. Whether that is worth a refusal rather than a
warning is a judgement for whoever next touches that check — it costs two runs
each time, and it happened twice in one night.

## The guard's own unit file sits close enough to the per-test cap to red under load (measured 10.09.2026)

Non-blocking, collected — and a near relative of the entry above. `scripts/mechanism-review-guard.test.mjs`
runs 65 cases in 34.0 s on a quiet machine, which puts its slowest single case within reach of the
20 s per-test timeout. On 10.09.2026 a covering LARGE run and a `batch-doctor --gate` overlapped —
both run the whole unit suite — and the LARGE died 5m 23s in on exactly that file, with
`bootstrapBase > seeds the anchor from the one shape that carries the flag AND the baseline` timing
out. Nothing was wrong with the product: the same file passed in the doctor's own gate and in a
standalone `vitest run` of all 465 files the same hour.

The run diagnosed itself correctly ("UNDER LOAD — the unit stage failed on a machine whose quiet
could not be verified"), so no mechanism is missing. What is collected here is the MARGIN: a unit
file this near the cap converts any contention into a red that costs a whole two-hour run, and it is
the second time in two days that one run has been paid for by another starting beside it. Whoever
next touches that file can buy the margin back by splitting its slowest case; nobody needs to.

## `run-logged.mjs --help` starts a full LARGE run instead of printing help (measured 10.09.2026)

Non-blocking, collected — and the third relative of the two entries above, all of them a run paid
for by something other than the work it was meant to cover. `scripts/verify/run-logged.mjs` treats
every argument as a suite selector and has no help branch, so `node scripts/verify/run-logged.mjs
--help` does not print usage: it launches the default LARGE regression — build, lint, the whole
unit suite, then both browser lanes — under the command name `verify --help`.

It is not a one-off. The run store holds five such records: `local/verify-logs` in the main tree
carries `verify --help` runs from 07.09., 08.09. and 09.09., the point-1065 worktree carries one
from 09.09., and this session started a sixth at 11:43 UTC while looking for the launch command
and killed it by hand a minute later. Each accident costs up to a two-hour run on a shared machine
and leaves a junk receipt that `run-wait --status` will happily report as the last run — the
09.09. one still reads `verify --help — RED` there, which is the shape of a real red.

The fix is a few lines: recognise `--help`/`-h` before the suite parse and print the usage block
`run-wait.mjs` already prints. Nobody needs to do it today; whoever next touches that file can.

It is also not confined to that one file. Two more of the same shape were measured the same day,
both of them by a session that was only looking for a usage line: `node scripts/verify/run-all.mjs
--help` opened the LARGE regression and had passed build, lint and the type-check before it was
killed by hand, and `node scripts/retro-refresh.mjs --help` silently RAN the refresh and rewrote
the retrospective's timestamp. Neither refuses an unknown flag; both treat it as ordinary input.
Whoever takes the fix should recognise `--help`/`-h` in all three.

## `wait-lease --status` calls a dead run's lease running (measured 10.09.2026)

Non-blocking, collected. `node scripts/wait-lease.mjs --status` reported three leases as `running`
at session start today while all three processes were gone — the LARGE runs of the session that had
died with the container. `waitTimeoutDecision` in `scripts/wait-lease-core.mjs` derives the state
from `deadlineAt` and `hungAt` alone and never asks whether the pid is alive, so a lease of a dead
run reads as live until its own deadline crosses, which for a LARGE is over an hour away.

It cost nothing here: `--release` cleared all three and `.claude/wait-leases.json` went back to the
empty state it is committed in. What it can cost is a session that believes the line and waits for
a run nobody is running — the shape the whole await mechanism exists to prevent. The lease already
records `pid` and `pidStartedAt`, so the liveness check is a comparison it can already make.

## The fill frame's camera picks a side without checking it (09.09.2026)

Non-blocking, collected. The frame of the water carrier now stands square to
the walk into the water rather than on the line from the world origin, which is
what made the dip legible at all. GPT-6 Astra pointed out in the same review
that the perpendicular has TWO sides and the code takes one of them unchecked:
with a bank that curves, the chosen anchor can land inside land even when the
other side is open, and nothing measures clearance before the shutter.

It is not a defect in the one village the PoC draws — the frame was judged and
it carries its subject — so it stays collected rather than becoming a point.
Whoever adds a second river village decides it there, with a ground sample at
both candidates and the one nearer the carrier's own footing winning.

The frame it describes was shed from feat/1065-teaching-hands-touch with the
rest of the water carrier on 10.09.2026 and belongs to work-order 1087 now. The
finding is kept here rather than deleted, because the camera will be rebuilt.

- **`run-wait.mjs --await` resolves a relative log against the main worktree, then blames the caller.**
  Measured 10.09.2026. Called from a worktree with the log path relative to that worktree,
  it answered "no verify run record at <path>. … A run started through `npm test` … writes
  one beside its log; a suite started by hand does not." The record existed, and the run had
  been started through the wrapper — the message diagnoses the wrong cause and sends the
  caller off to restart a two-hour run. An absolute path works. Non-blocking: the remedy is
  to resolve the path against the caller's cwd, or to say "not found at <resolved path>"
  instead of asserting how the run was started.

- **A commissioned author closes with an empty commit.**
  Measured 10.09.2026 on point 1088: the Astra lane's final commit `d5d5c87` ("Complete the
  authored changes") carries no file at all, and it is the commit the branch tip stands on,
  so the tip's subject describes nothing that was written. Non-blocking: it costs a reader
  one lookup to find the commit that holds the work. The remedy is for the lane to skip the
  closing commit when the tree is already clean.

## A run the operator ends himself is recorded as a CRASHED RUN (11.09.2026)

Non-blocking, collected. `render-verify-guard` keeps a list of runs that "died
rather than reported", and it grew by two on 11.09.2026 — both of them WebGL 2
`polish` passes this session terminated on purpose: one on the explicit
instruction of `run-wait --await` ("end the run rather than waiting again"), one
by a `pkill` of my own. A deliberate SIGTERM is not an observed failure of the
product, but it enters the same list and leaves it only through the same
signature as a real crash.

It costs nothing but the signature, and the signature is honest work — the
record does say what happened. Kept here rather than made a point because
nothing is blocked and nobody is misled: the list names the backend, the suite
and the minute, and a reader who was there knows which is which. Whoever
touches that recorder next can carry the operator's own termination as its own
outcome, so the crash list stays a list of crashes.

## The tagged child's head flattens with its crouch (11.09.2026)

Non-blocking, collected; target point 687. `PlaceLife.tsx` squats a tagged child
with `g.scale.set(1, CROUCH_SQUAT, 1)` on its whole group, and that reaches the
head sphere: at 0.66 the skull is drawn as a disc.

Point 1085 measured the identical artefact on the water carrier at 0.72 — a
deflated ball hovering over a traffic cone — and fixed it by handing `Figure` the
caller's squash through a `squat` prop. Note what that fix had to be: a local
`scale.y` on the head CANNOT undo the squash, because the squash sits on the
figure's group ABOVE the trunk and the trunk is rotated by the lean, so the exact
inverse is `Rx(-lean) · diag(1,1/s,1)` — a counter-rotation as well as a stretch.
The check that proves it reads the head off its WORLD MATRIX; a `Box3` over the
same head called it 0.73 where the matrix calls it 1.000, because a box's corners
swing out under the counter-rotation.

The tagged child does not pass that prop and keeps the flattened head.
Pre-existing and fast-moving, no player blockade, so it waits here: the fix is the
one prop on the child's `Figure`, and the check is the matrix reading, not a box.

## A `--section` run pays a cold browser and dev-server boot every time (11.09.2026)

Measured on point 1085: `verify polish --section=adult-errands` takes 110 s, of
which the 18 assertions are a fraction — the rest is the quiet-machine check, the
GPU preflight with its own browser, and `starting dev server` (the 504 "Outdated
Optimize Dep" errors in the same logs are the server being rebuilt under a test).
`scripts/verify/_server.mjs` reuses nothing between runs. A warm server held across
the section runs of one development cycle would take the cheap rung from ~110 s to
an estimated ~25 s and is the largest structural lever left after point 1104 — but
it is a rebuild of the server lifecycle, not a small change, so it waits here.

## A teaching arrival outside the player's earshot shows nothing at all (11.09.2026)

Measured while landing point 1110. A runner that arrives, reaches the stone and
holds a perfectly good contact — 1.37 mm solved gap — draws **no gesture at all**
if it stands beyond the 10 m hearing radius: `speakBankUtterance` calls
`gestureIfHeard`, which rests the arm (point 580). The child then walks to the
rock and simply stands there, arm down, and the teaching moment the player is
meant to read never exists.

That gate is pre-existing and deliberate. What 1110 changed is how OFTEN it is
hit: the alternate-facet search added for the contact fix can pick a stand well
round the flank, and a measured +25° approach put the runner 10.43 m from the
listener where the straight-in stand is closer. So silent, armless arrivals are
now somewhat more likely than before.

No player blockade — the tap moment at the near rock is unaffected and the round
still teaches — so it waits here rather than becoming a point. Two directions if
it is ever picked up: prefer the audible stand among equally good candidates, or
let the arm reach even when the word is not heard, on the grounds that a hand on
a stone is a thing you can SEE from outside earshot. The second is a design
question for `design.md` 13.4, not a bug fix.

## `polish --section=adult-errands` fails at exactly the earshot boundary (11.09.2026)

Seen once in the WebGL 2 pass of point 1110, green on the retry and green on
WebGPU in the same tree: "no adult word ever falls inside the children`s earshot
— nearest utterance to the children: DIG at 10.0 m from a child". The assertion
is `nearestBankVoice > 10` against a hearing radius of exactly 10 m, so an adult
that happens to speak while standing ON the radius fails a check whose intent is
that the word is not HEARD. Not reproducible and not caused by that point
(`adultWork.ts` does not use the changed movement helper), so it is recorded here
rather than charged: if it recurs, the question is whether the bar should be
`>= 10` — or whether an adult standing exactly at the children's earshot is the
real finding.

## The `settlement-fabric` frames shoot before the scene has drawn (11.09.2026)

Measured while investigating point 1103, which this finding voided. The two
frames of `polish`'s `settlement-fabric` section — `101-street-village-plan` and
`102-cairo-lane-plan` (`scripts/verify/polish.mjs:1743-1766`) — are taken about
800 ms after `enterPlace`, with no scene-readiness wait: `waitForTimeout(400)`,
`toggleMap()`, `waitForTimeout(400)`. Their declared subject is the DOM overlay
`.map-place-plan`, and the check beside them reads `window.__placeLayout`, so
both pass regardless of what the 3D scene behind the overlay has managed to
draw. Neighbouring sections settle for 2500 ms before their shutter.

The consequence is not a failing check but a MISLEADING PICTURE: on a slow host
the frame keeps whatever the lane rendered in those 800 ms, which was sky and
haze in the three WebGL 2 copies on file and a completely empty image at 0 FPS
in the WebGPU run of 11.09.2026 20:01
(`local/verify-logs/2026-09-11T20-01-23-301-polish.log`). Read as evidence about
the SCENE, those frames say whatever the host's frame rate said that minute.
That is exactly how point 1103 came to be filed as a HIGH-criticality
player-visible WebGL 2 defect: two such frames were read against each other, and
the labels — DOM elements drawn from layout data, present on both lanes from the
first millisecond — made the comparison look controlled.

No player impact, so it is collected here rather than made a point. Whoever picks
it up decides between settling the scene before the shutter (as the neighbouring
sections do) and declaring these two frames as OVERLAY-only evidence, so that
nobody reads the background as a statement about rendering. The second is the
cheaper honest fix.

## First-person ground micro-detail fails on both `main` and every branch (12.09.2026)

`settings --section=ground-detail` fails its edge-energy check on WebGL 2 with a laplacian
mean of 1.06-1.07, measured on `main` at bf27c94e6 and again on an unrelated feature branch
at f14ce3438. It touches no feature diff and holds finished work hostage in every whole-suite
run it appears in, which is exactly the attribution the 10.09.2026 decision decoupled.
Non-blocking and collected here: it needs its own point once someone measures whether the
ground really lost its micro-detail or the bar drifted.

## LOW now allocates a velocity attachment it never reads (12.09.2026)

Point 1112's repair keeps the scene MRT identical in every mode, so the LOW graphics
level allocates and writes an RGBA16F velocity attachment although no temporal resolve
consumes it. Calculated, not measured: 8 bytes per render pixel, ~10.4 MB of additional
logical payload per full image write at 1440x900 / DPR 1, ~593 MiB/s at 60 writes per
second. Overdraw, clears, compression and tiling are not represented, and no frame time
was taken. Omitting velocity on LOW would change the fragment layout again and bring the
relink the repair exists to remove, so the alternative is a second scene pass, not a
smaller MRT. Non-blocking: the LOW picture draws, and no measurement says the fill cost
is player-visible. It needs its own point only once someone measures the frame time on a
weak GPU.

## What the closing regression actually costs, measured at one point (12.09.2026)

Measured across point 1112's twelve suite runs (161 min of suite wall clock): the cheap
ladder works — iteration ran on 1-3 minute sections and the full regression ran exactly
once, at the end, where it found no side effect of the point at all. The cost now sits in
that single round: 138 of the 161 minutes are the two closing passes (WebGL 2, 98 min
against an expectation of 25; WebGPU, 40 min), and three causes multiply. The regression
starts chronically red and no red belongs to the point under test (ground-detail,
dressing-growth, chief-to-drummer, the fill-pose staging, the Victoria Falls frame); every
red suite is retried once, so three red suites become six passes rather than three; and the
result then carries "MACHINE STATE UNKNOWN" and "UNDER LOAD — NOT AUTHORITATIVE" and asks
for another run. Each foreign red afterwards costs hand work in the charge ledger.

The point for this already exists and is open: 1089 describes the same thing from the
measurement at point 1065. What this measurement adds is that the cure is not another
process mechanism but the four or five chronically red checks themselves — repair them, or
lay each down once as a classified baseline (measure 1 of point 1104, done so far for a
single red). Non-blocking and collected here on the user's instruction of 12.09.2026 to
discuss this first and change nothing in the process yet.

## The handover card claims nothing is running while an adopted run runs (12.09.2026)

`scripts/batch-boundary-core.mjs` ends every boundary card with "Hier läuft nichts weiter.",
whether or not the handover passes transferable in-flight work on. Measured at 23:22 on
12.09.2026: the context watermark handed over while the LARGE two-backend regression for
point 1087 (pid 441803) was in its WebGPU pass, declared transferable, and adopted by the
successor — so the board told the user nothing was running while two hours of regression ran
on. The session appended the true state as its own paragraph rather than touching the
sanctioned wording. Non-blocking under the infrastructure freeze: nobody is misdirected into
an action by it, the card's own purpose (naming WHY the handover happens) is intact, and the
fix is one sentence in a card generator, not a mechanism.

## The beginner guide is missing the ceiling a green run cannot show (13.09.2026)

The retrospective's newest lesson of the same evening (§3.270) has no counterpart in
`docs/analysis_de/vibe-coding-anleitung.md`: four CI runs of one branch died as "cancelled"
because the `fast` job's 15-minute limit was consumed while every signal read green — the
last two passing runs, one of them on main, left about fifteen seconds of headroom, so the
next point adding any test at all had to fail, whichever one it was. The failure word names
neither cause nor repair, and no retry heals it.

The guide's existing duration pitfall ("Die gemessene Dauer von damals tötet den gesunden
Lauf von heute") is the other side of it: a stored expectation killing a healthy run. The
missing one is a healthy run hiding that it has nearly spent its limit — generalisable to
any reader with a job timeout, which is why it belongs in the guide and not only in the
retrospective.

Measured price, 13.09.2026: the bullet as drafted costs 9 lines and 106 words, and the
guide's ceiling IS the guard's exact measured size and only ratchets down
(`scripts/guide-brevity-core.test.mjs`, "sets both ceilings to the guard's exact measured
size"). So the room must be CUT elsewhere first, the way design.md paid for its
speech-floor section. Drafted, measured, reverted in 55b12d04e's successor commit rather
than left half-applied; non-blocking, because the guide is prose nobody's build reads.

## A unit test spends twenty seconds reading the live review history (14.09.2026)

`scripts/mechanism-review-guard.test.mjs` has two cases that scan the REAL review
history through `gatherMechanismReviewInputs`. Measured 14.09.2026 in isolation:
23.34 s and 20.60 s. Point 1073's second author raised both to a 60 s per-case
budget so the unit gate stays green, which is the right unblocking move and was
accepted in review.

The cost grows with the history, so the budget will be raised again. The test asks
a question about the guard, not about the archive: a fixture history would answer
it in milliseconds and would not drift. Non-blocking — noted so the next raise is
recognised as the third one, not the first.

## Der Saum-Test des Erdhaufens beweist die Saumschließung nicht (14.09.2026)

`src/scenes/place/digSpoilGeometry.test.ts` prüft, dass die Vertex-Positionen des
Polar-Netzes eindeutig sind. Das beweist die Eigenschaft nicht, die der Test tragen
soll: ließe man die umlaufenden Dreiecke am Saum weg, blieben diese Zusicherung und
die Normalen-Prüfungen grün. Belastbar wäre eine Kantenzählung — nur die Kanten des
Außenrands haben ein inzidentes Dreieck, alle anderen zwei.

Gefunden von GPT-6 Astra im cross-vendor Review von d9e60b3c0 (P3, Gesamturteil
merge). Kein Produktdefekt: das Netz ist nachgerechnet korrekt, nur der Test hält
weniger, als er verspricht. Nicht sofort behoben, weil der Zweig zu diesem Zeitpunkt
unter einem laufenden Zwei-Backend-Bildlauf stand und eine Änderung ihn entwertet
hätte.

## Erledigt-Karten des Boards behaupten pauschal ausstehende Abschlussarbeiten (14.09.2026)

Über die Erledigt-Sektion läuft die Schablone „dieser Punkt ist zusammengeführt und
abgehakt; die Abschlussarbeiten stehen noch aus" — gezählt mindestens acht Karten.
Für 1087 und 1113 nachgemessen: kein lokaler Zweig, kein Remote-Zweig, kein
Worktree. Die Arbeiten sind vollständig erledigt, die Karte sagt das Gegenteil.

Es ist Generator-Verhalten, keine einzelne vergessene Karte: von Hand editiert stünde
der Satz beim nächsten Publish wieder da. Board-Struktur wird nicht eigenmächtig
geändert (Dashboard-Regel), deshalb hier gesammelt statt umgesetzt. Nebenbefund:
dieselbe Sektion enthält transliterierte Umlaute (etwa „Haeuser"), die der
Umlaut-Audit dort nicht prüft — er greift nur auf Aktuell- und Warteschlangenkarten.

## Lebendigkeit wird aus der Buchhaltung abgeleitet statt am Prozess gemessen (14.09.2026)

Zwei Ausprägungen derselben Abkürzung an einem Vormittag, beide an der laufenden
Zwei-Backend-LARGE für Punkt 1056 gemessen. Ausführlich steht der Fall als §3.272 in
der Retrospektive; hier nur, was am Mechanismus zu tun bliebe.

ERSTENS die Ernte-Anweisung. Die Warteschlangen-Karte erklärte den Lauf für verwaist
und wies an, ihn neu aufzusetzen. Tot war nur sein Besitzer; der Lauf stand nach 43
Minuten in den langen Suiten. Ein Neuaufsetzen hätte diese 43 Minuten weggeworfen.
Wer einen Lauf für verwaist erklärt, muss getrennt messen und getrennt melden, ob
sein BESITZER lebt und ob ER lebt — aus einem toten Besitzer folgt eine Adoption
(`--adopt`), nie ein Neustart.

ZWEITENS die In-Flight-Prüfung. Sie wies die Deklaration der Wartestellung mit
`evidence-gone` und der Begründung „log silent for 28 min" ab, während der Lauf
nachweislich rechnete: chrome-headless auf 63,3 % und 49,5 % CPU bei 17:50 bzw. 13:56
CPU-Zeit, zwei frische Beweisbilder binnen fünf Minuten. Die `polish`-Suite schreibt
ihre Logzeile erst am Suite-Ende und läuft im Median 55 Minuten — die Mtime des Logs
ist in dieser Spanne per Konstruktion alt. Der Fortschrittsbeweis einer Bildsuite sind
die geschriebenen FRAMES und die CPU-Zeit des Browsers, nicht die Logdatei.

Nicht umgesetzt wegen des Infrastruktur-Freezes: Beide Fälle wurden erkannt und
umgangen, keiner hat Spielarbeit dauerhaft blockiert. Die Umgehung für den zweiten
ist eine Deklaration ohne `--log`, die auf der Worktree-Aktivität durchgeht.

NEBENBEFUND aus demselben Vormittag: Jeder aufgezeichnete Befund verändert den
Quellen-Fingerprint der Retrospektive und meldet sie damit als STALE. Der geforderte
Refresh erzeugt dann eine Änderung, die nur aus Fingerprint und Zeitstempel besteht.
Zweimal hintereinander gemessen. Ein Tretrad, kein Defekt — aber es kostet je einen
Lauf und einen Commit.

## Ein vom Nutzer erlassenes Closing kostet dreizehn einzelne Verzichtsbuchungen (14.09.2026)

Beim `poc`-Tag vom 14.09.2026 hat der Nutzer den Closing-Durchlauf ausdrücklich
erlassen („In diesem Fall ist kein Closing-Durchlauf notwendig"). `closing-guard`
verweigerte das Tag bei 0/13 Schritten; sein einziger vorgesehener Weg ist, JEDEN
der dreizehn Schritte einzeln mit der Verzichtserklärung als Evidenz zu buchen.
Zusätzlich lehnt `regression-after-cleanup` eine wortgleiche Evidenz zu
`large-regression` ab — der Verzicht braucht also zwei verschieden formulierte
Texte für denselben Sachverhalt.

Inhaltlich ist das richtig: der Verzicht bleibt als Text in der Checkliste stehen,
statt als erfundene Grün-Meldung zu verschwinden. Es fehlt nur der eine Befehl
dafür, etwa ein `--waive-all "<Zitat des Nutzers>"`, das die dreizehn Buchungen mit
je eigener Formulierung setzt.

Nicht umgesetzt wegen des Infrastruktur-Freezes: kein Spielerimpakt, keine
Blockade — der Weg existiert und wurde gegangen, er ist nur umständlich.

## Das Wasserpaar findet im ersten Anlauf nicht zusammen (14.09.2026)

Der Abschnittslauf `polish --section=adult-errands` auf WebGL 2 färbte im ERSTEN
Anlauf rot und im zweiten grün (SUSPECT, deckt damit nichts):

    FAIL  a village adult is really filling his jar, clear of the others
          — no carrier reached the fill phase in 180 s
    ERR:  [ASSERT] adult-pair-never-met — water-back: villager 1 expired still
          on his way to the walk word; the pair never assembled

Dieselbe Zusicherung feuert auch in den Unit-Tests (`tagShuffle.test.ts`) als
stderr-Zeile, dort gleich zweimal in der Grabvariante (`dig-first`, `dig-second`)
und einmal als `way-out-missing` in mandinka-village — ohne den Test rot zu
machen. Das ist genau die Deadlock-Klasse, die Punkt 1073 repariert hat; sie ist
seltener geworden, aber nicht verschwunden.

Gegenmessung derselben Stunde: der ganze Durchgang fuhr die Erwachsenenarbeit
danach zweimal ohne diesen Roten — WebGPU 268/0/0 im ersten Anlauf, WebGL 2
267/1/0 mit einem fremden, verbuchten Roten. Ein Punkt wird daraus deshalb NICHT:
nicht reproduzierbar, kein Spielerimpakt gemessen, keine stehende Blockade.

Wenn er wiederkommt, ist das hier die zweite Messung — dann gehört er in einen
eigenen Punkt mit `node scripts/throttle-probe.mjs polish --section=adult-errands
--backend webgl --runs 8` als erster Messung.

## Der deckende Lauf stirbt mit seinem Arbeitsverzeichnis (15.09.2026)

Die beiden deckenden `polish`-Läufe für Punkt 1127 liefen im Arbeitsverzeichnis
des Punktes. Beim Landen räumt die Kette das Verzeichnis ab — und mit ihm das
Protokoll (`local/verify-logs/`) und den Laufdatensatz (`.claude/render-verify-state.json`),
die beide PRO Checkout liegen. Auf `main` steht danach ein Bildwächter, der von
zwei gefahrenen Läufen nichts weiß, obwohl die Bilder selbst als
`verification/*.png` im Repositorium committet sind.

Ausweg war eine protokollierte Ausnahme (`render-verify-guard --defer`) mit den
Messwerten im Text — also genau die Handschrift, die das Ladenbuch abschaffen
sollte. Der billige Weg wäre, den Laufdatensatz beim Landen aus dem
Arbeitsverzeichnis in den Haupt-Checkout zu übernehmen, bevor das Verzeichnis
fällt; die Kette weiß an dieser Stelle beides.

Nicht als Punkt eingereiht wegen des Infrastruktur-Freezes: kein Spielerimpakt,
keine stehende Blockade — der Weg existiert und wurde gegangen. Kommt es
wieder, gehört es zu Punkt 1123, der schon zwei Defekte derselben Familie trägt.

ERLEDIGT (17.09.2026): es kam wieder und wurde als Punkt 1142 gefahren.
Laufdatensatz und Protokoll liegen jetzt im Haupt-Checkout, und der Wächter
liest einen Lauf über den Commit, den er nennt — nach dem Merge ein Vorfahr von
`main`.

## Der Bildschirm-Wächter verweigert jeden Zug, wenn die Sitzung im Arbeitsverzeichnis steht (15.09.2026)

Der Stop-Wächter liest `.claude/dashboard-state.json` AUS DEM VERZEICHNIS, in dem
er läuft. Ein Arbeitsverzeichnis eines Punktes hat eine eigene, praktisch leere
Fassung dieser Datei — ohne `dashboardPath` und ohne Veröffentlichungs-Eintrag.
Steht die Sitzung dort, findet er keine Registrierung und meldet "BATCH DASHBOARD
NOT REGISTERED", obwohl Board, Fokus und Registrierung im Haupt-Checkout tadellos
stehen und derselbe Wächter von dort grün ist.

Gemessen am 15.09.2026: der Wächter hat vier Züge hintereinander verweigert.
Aus dem Haupt-Checkout mit derselben Sitzungs-ID auf stdin war er still; aus dem
Arbeitsverzeichnis blockierte er. Nachregistrieren HILFT DORT NICHT — `--synced`
verweigert im Arbeitsverzeichnis mit "this board was never published", weil auch
der Veröffentlichungs-Eintrag pro Checkout liegt.

Die Reparatur ist, das Arbeitsverzeichnis der Sitzung im Haupt-Checkout zu
lassen und Befehle für den Punkt-Checkout mit `git -C` oder in einer Subshell zu
fahren, statt mit `cd` dorthin zu wandern. Das deckt sich mit der stehenden
Notiz "Session cwd stays in main tree".

Nicht als Punkt eingereiht wegen des Infrastruktur-Freezes: kein Spielerimpakt,
und der Weg daran vorbei ist eine Verhaltensregel, keine Änderung. Kommt es
wieder, wäre der billige Weg, den Marker aus dem gemeinsamen Git-Verzeichnis zu
lesen statt aus dem laufenden Checkout — die Registrierung gilt ohnehin für die
ganze Batch, nicht für einen Checkout.

## Die Wartehilfe erklärt einen gesunden Bild-Lauf für hängend (15.09.2026)

`run-wait.mjs --await` meldet "HUNG" und rät zum Abbruch, sobald ein Lauf das
2,5-fache seiner ERWARTUNG überschreitet. Für `polish` ist diese Erwartung
5m 41s aus der Median-Tabelle — derselbe Aufruf druckt zwei Zeilen darüber
seine eigene Beobachtungsreihe: 9,9 bis 61,5 Minuten, Median 55,2, über sechs
Läufe. Die Abbruchschwelle liegt damit bei 14 Minuten, also unterhalb der
Hälfte dessen, was das Werkzeug selbst als typisch ausweist.

Gemessen am 15.09.2026: der Alleinlauf der Bild-Suite wurde nach 18m 16s als
hängend erfasst, während er alle drei Minuten ein Bild schrieb und der
GPU-Prozess auf 68 % stand. Gefolgt wäre der Rat, einen gesunden Lauf
abzuwürgen — und ein Abbruch deckt nichts, also hätte er den Lauf ein zweites
Mal gekostet.

Nicht als Punkt eingereiht wegen des Infrastruktur-Freezes: kein Spielerimpakt,
und der Weg daran vorbei ist gemessenes Urteil statt Gehorsam. Der billige Weg
wäre, die Schwelle an die BEOBACHTETE Bandbreite zu hängen statt an die
Median-Tabelle, wo beide ohnehin nebeneinander gedruckt werden.

Zum dritten Mal gemessen, 15.09.2026, 10:49, beim Deckungsbeweis des Punktes
1126: derselbe Rat nach 29m 19s, während der Lauf zwei Minuten zuvor noch
Bilder schrieb. Ich habe hier zunächst einen Arbeitsauftrag daraus gemacht und
ihn wieder zurückgenommen — genau das meint §2 mit „Duplikate werden
geschlossen, nicht neu mechanisiert". Die Zählung bleibt: dreimal gesehen,
dreimal ohne Spielerimpakt, weiterhin kein Punkt.

## Der batch-resume-Kopf nach /clear ist auf den Sitzungsbeginn eingefroren (15.09.2026)

Gemessen 15.09.2026, 12:08–12:12: Die `SessionStart:clear`-Zeile meldete „402
open point(s); the first in work-order order is 1126", obwohl Punkt 1126 seit
11:42 abgehakt war. Ein direkter Aufruf von `scripts/batch-resume-hook.mjs` um
12:12 antwortete korrekt mit 401 offenen Punkten und 1076 an der Spitze — der
Kern liest die Arbeitsliste also richtig, die zugestellte Zeile stammt aus einer
älteren Berechnung.

Wirkung: ein frischer Worker nach `/clear` kann auf einen bereits gelandeten
Punkt gezeigt werden und ihn erneut anfassen. Nicht als Punkt eingereiht wegen
des Infrastruktur-Freezes: kein Spielerimpakt, und der erste Blick auf den
Zweig- und Hakenstand fängt es ab. Der billige Weg wäre, die Zeile beim
Zustellen zu berechnen statt beim Sitzungsstart.

## Vier Ortsmarken stapeln sich am Kilimandscharo (15.09.2026)

Beim Nachhalten der aufgefrischten Abnahmebilder gesehen, WebGL-2-Spur,
`verification/13-worldmodel-kilimanjaro.png`: „Unknown village", zweimal
„Unknown mountain" und „Unknown landmark" überlagern einander, zwei davon sind
am linken Bildrand abgeschnitten, und der Kompatibilitätshinweis druckt
zusätzlich quer durch die oberste Marke. Dasselbe Bild steht seit dem letzten
Stand unverändert im Archiv — es ist kein Rückfall, sondern der bisherige
Zustand.

Wirkung: an einer dichten Landmarkengruppe wird die Beschriftung unlesbar; der
Spieler kann nicht zuordnen, welcher Name zu welchem Berg gehört. Nicht als
Punkt eingereiht: kein blockierender Defekt, keine Datenfrage, und die Marken
verlieren ihre Überlappung, sobald der Spieler einen Schritt weitergeht. Der
billige Weg wäre, überlappende Marken gegeneinander auszublenden statt sie zu
versetzen.

## Die Fehlerquote des Wasserauftrags ist nicht gemessen (15.09.2026)

Aus dem Code des 1131-Zweigs abgeleitet, kein Sweep gefahren: Die Blockade am
Wasserstand trifft einen Teil der Aufträge, nicht alle — sie hängt daran, wo der
Sender bei der Vergabe zufällig steht, nicht an der Lage der beiden Standplätze
zueinander. Wie groß dieser Teil ist, steht nicht fest. Der Wiederholungs-
Harnisch aus `72dc3907c` kann die Quote über einen Seed- und Startpositions-
Sweep der Baseline liefern.

Wirkung: keine — die Reparatur von Punkt 1131 hebt die Blockade unabhängig von
ihrer Häufigkeit auf, und die Quote beträfe allein die Nachbetrachtung. Nicht
als Punkt eingereiht: kein Spielerimpakt, keine Datenfrage, kein Blocker; die
Messung kostet einen ruhigen Rechner für einen Sweep, den niemand braucht,
solange der Rundgang gelingt. Der billige Weg wäre, die Quote beim nächsten
ohnehin fälligen Baseline-Lauf mitzuzählen.

## Der 45-Minuten-Riegel je Suite steht unter dem gemessenen Band (16.09.2026)

Aus Punkt 1137 mitgemessen, noch nie ausgelöst: `run-all.mjs` tötet eine Suite
nach `SUITE_TIMEOUT_MS` = 45 min mit SIGKILL und der Zeile „KILLED after 45 min
wall timeout (hung, not slow)". Ein ganzer `polish`-Durchgang wurde im September
mit 9,9–61,5 min gemessen (docs/picture-check-cost.md §7). Das Band gilt für den
ganzen Durchgang samt Bau-, Lint- und Unit-Stufe, die Suite selbst liegt
darunter — in 314 abgelegten Läufen steht die Zeile kein einziges Mal. Aber es
ist dieselbe Familie wie der Hängend-Befund: eine feste Zahl gegen eine Laufzeit,
die niemand nachgemessen hat, und im Zweifel stirbt der gesunde Lauf.

Wirkung: keine gemessene — kein Lauf hat den Riegel je berührt. Nicht als Punkt
eingereiht: kein Spielerimpakt, keine Datenfrage, keine Blockade, und der
Infrastruktur-Freeze hält ihn draußen, bis er wirklich einen Lauf kostet. Der
billige Weg wäre, ihn gegen dieselbe Stillstandsprobe zu tauschen, die der
Hängend-Befund jetzt benutzt, statt die Zahl zu erhöhen.

## Geparkte Zweige zählen als lebende Agentenlanes (16.09.2026)

`batch-doctor --gate` hat am 16.09. ein rotes `npm run test:unit` als
„INCONCLUSIVE (load)" eingestuft und dabei fünf Arbeitsbäume als „live agent
worktree(s)" genannt — `point-1049`, `point-1133`, `point-834`, `point-847`,
`point-901`. In keinem davon lief ein Prozess; es sind geparkte Zweige offener
Punkte, der jüngste vom 15.09., der älteste vom 23.08. Gezählt wird ihre bloße
Existenz, nicht ihre Arbeit.

Wirkung: das Tor kann auf diesem Rechner kein rotes Urteil mehr fällen, solange
irgendein Zweig geparkt ist — ein Rot wird immer als Last erklärt. Nicht als
Punkt eingereiht: es macht ein Urteil weicher, statt eines zu fälschen, und die
Last-Einstufung ist genau die Vorsicht, die die Retrospektive §3.22/§3.48
verlangt. Der billige Weg wäre, denselben Lebendtest zu benutzen, den
`batch-in-flight.mjs --agent-check` schon fährt: ein Arbeitsbaum ohne laufenden
Prozess und ohne fortschreitenden Zweig ist geparkt, nicht belegt.

## Ein festgefahrener Lauf kann von fremden Bildern am Leben gehalten werden (16.09.2026)

Aus fünf Prüfrunden zu Punkt 1137, von GPT-6 Astra gefunden und nicht
geschlossen: Der Prüfläufer erkennt einen festgefahrenen Lauf daran, dass dieser
eine ganze Viertelstunde lang nichts mehr geschrieben hat. Weil eine lange
Bildsuite zwischen ihrer Startzeile und ihrer Ergebniszeile nichts ins Log
schreibt, tastet der Lauf zusätzlich seine eigenen Bilder ab — und
`verification/` ist ein gemeinsames Verzeichnis ohne Laufkennung. Ein wirklich
festgefahrener Lauf hält seinen Aufseher am Leben; nimmt in dieser Zeit ein
anderer Lauf Bilder auf, wandert die Fortschrittsmarke des festgefahrenen mit.
Von innen korrigiert das nichts, denn ein festgefahrener Lauf schreibt nie eine
eigene echte Marke.

Wirkung: das Hängend-Urteil kann sich verzögern, solange jemand anders
fotografiert — es fällt nicht falsch, es fällt später. Die lesende Seite ist
davon frei: sie sieht nur Marke und Log des Laufs, nach dem sie gefragt wird.
Nicht als Punkt eingereiht: die entgegengesetzte Störung ist die teure und die
belegte — an einem Abend wurden zwei kerngesunde Läufe beendet und die
Veröffentlichung stand hinter dem deckenden Bildlauf still, den sie erzeugt
hätten. Ein Melder, der gelegentlich spät anschlägt, ist einem vorzuziehen, der
zuverlässig tötet, was er beobachtet. Der saubere Weg wäre ein Bild, das seinen
Lauf benennt — eine Änderung an jedem Suite-Auslöser, nicht am Prüfläufer.

## Eine Marke, deren Besitzer sich mitten im Lauf ändert, bleibt stehen (16.09.2026)

Aus der zehnten Prüfrunde zu Punkt 1137, von GPT-6 Astra gefunden und bewusst
nicht geschlossen: Der Lauf hält seine Fortschrittsmarke offen und verschiebt
ihren Zeitstempel über den Dateideskriptor. Ein ausdrückliches Setzen des
Zeitstempels unterliegt aber nicht denselben Rechteprüfungen wie ein gewöhnliches
Schreiben — ändert jemand mitten im Lauf den Besitzer der Markendatei, verweigert
das System das Setzen, während das Log weiter Bytes annimmt. Der Lauf wird dann
allein an seinem Log gemessen; eine lange, stille Bildsuite könnte so nach einer
Viertelstunde als hängend gemeldet werden.

Wirkung: eine Falschmeldung, kein getöteter Lauf — das Hängend-Urteil berichtet,
es beendet nichts. Voraussetzung ist ein Eingriff von außen an einer Datei, die
dem Lauf gehört. Nicht als Punkt eingereiht: kein Spielerimpakt, keine
Datenfrage, keine Blockade — und die Brücken, die in den Runden sechs bis neun
für genau diese Klasse gebaut wurden, haben jedes Mal mehr gekostet als der Fall,
den sie abdeckten (zerschnittene Ergebniszeilen im Log, eine Frist, die sich
selbst erneuerte, verlorene Beobachtungen). Der billige Weg wäre, gar keinen zu
bauen und die Meldung zu lesen, wie sie gemeint ist.

## Zehn Prüfrunden an einem Punkt: die Abbruchentscheidung (16.09.2026)

Punkt 1137 hat zehn kreuzverlagerte Prüfrunden durchlaufen; jede fand etwas
Echtes, und die Voraussetzungen wurden von Runde zu Runde enger — von einer
veralteten Kostentabelle über eine Umfrage, die ihre eigene Akte neu schreibt,
bis zu einem Besitzerwechsel an einer Datei mitten im Lauf. Abgebrochen wurde
nach Runde zehn, mit folgender Begründung: Alles, was einen **gesunden Lauf
beenden** kann, ist repariert und durch Tests festgehalten. Was bleibt, lässt das
Hängend-Urteil zu spät oder falsch **melden** — und eine Meldung tötet nichts.
Der Infrastruktur-Freeze (CLAUDE.md §2) arbeitet an einem Infrastrukturdefekt
nur, wenn er reproduzierbar blockiert oder eine falsche Freigabe erlaubt; beides
trifft auf den Rest nicht zu.

## `--help` startet auf den beiden schwersten Einstiegen einen vollen Prüflauf (16.09.2026)

Beim Bearbeiten von Punkt 1137 selbst aufgelaufen: `node
scripts/verify/run-logged.mjs --help` und `node scripts/verify/run-all.mjs
--help` geben keine Hilfe aus, sondern starten die volle LARGE-Regression über
beide Grafikwege — gemessen rund zwei Stunden. `parseArgs` in
`scripts/verify/tiers.mjs` sammelt jedes `-`-Argument nur in `flags` ein; damit
bleibt `filter` leer und `tier` null, und genau das ist die Signatur des
vollen Laufs (`fullRun`, `isLargeEquivalent`). `run-logged.mjs` reicht alles
weiter, was es nicht selbst verbraucht, also auch `--help`.

Verschärfend ist die Uneinheitlichkeit: `scripts/verify/run-wait.mjs --help`
gibt eine ordentliche Hilfe aus. Wer sie dort lernt, probiert sie beim Nachbarn.

Wirkung am 16.09.2026: ein ungewollter LARGE-Lauf, der dem echten Lauf desselben
Punktes die Maschine streitig machte und dessen Ruhe-Annahme entwertete. Weil
der Aufruf in `head -40` lief, wäre er zusätzlich mitten im Lauf über ein
geschlossenes Rohr gestorben.

Nicht als Punkt eingereiht: kein Spielerimpakt, keine Datenfrage, keine
Blockade, und der Lauf wird korrekt aufgezeichnet — es gibt keine falsche
Freigabe. Der billige Weg wäre eine Zeile in beiden Einstiegen, die `--help`
und `-h` vor jeder Arbeit abfängt und die Nutzungszeile druckt, die in
`run-logged.mjs` bereits im Kopfkommentar steht.

WIEDERHOLUNG AM 17.09.2026, und zwar genau auf dem hier beschriebenen Weg: Die
Nachfolgesitzung kannte `run-wait.mjs --help`, probierte es beim Nachbarn
`run-all.mjs` und startete einen vollen Lauf, den sie nach rund 40 Sekunden
abbrach. Zweimal in zwölf Stunden, von zwei verschiedenen Sitzungen, ist keine
Unachtsamkeit mehr, sondern die vorhergesagte Wirkung. Der Eintrag wird nicht
verdoppelt; die Lehre steht jetzt zusätzlich im Gedächtnis, wo sie vor dem
Aufruf gelesen wird, statt nur hier, wo sie danach gefunden wird.

## Der Warteschlangen-Neubau überschreibt die Prosa der aktuellen Karte (16.09.2026)

`node scripts/board-queue.mjs` baut die Warteschlange aus dem Arbeitsauftrag neu — und ersetzt
dabei den Text der Karte unter „Woran ich gerade arbeite" durch die abgeleitete Zeile aus der
In-Flight-Markierung (`point <N>: current work · Wartestellung: <englischer --waiting-on-Text>`).
Am 16.09.2026 ist das in einer Sitzung zweimal passiert: einmal nach dem Nachziehen von drei
Zeitschätzungen, einmal nach einer Kartenänderung. Beide Male stand danach englischer
Werkzeug-Jargon auf einer Seite, die der Nutzer auf dem Telefon liest, und der eigentliche
Status war weg.

Folge: Nach jedem `board-queue.mjs` muss der Status der aktuellen Karte von Hand neu geschrieben
werden. Wer das vergisst, veröffentlicht eine Karte, die nicht mehr sagt, was läuft.

Nicht blockierend — der Status lässt sich sofort wiederherstellen. Die saubere Lösung wäre, dass
der Neubau die Prosa der aktuellen Karte gar nicht anfasst; das ist aber eine Änderung am
Board-Werkzeug und fällt unter den Infrastruktur-Stopp, solange es nur Nacharbeit kostet.

## Der Arbeitsbaum eines beauftragten Agenten sieht den Fehlerbericht nicht (16.09.2026)

Der Auftrag zu Punkt 1138 nennt `local/ErwachseneEingeklemmt.zip` als das zu messende Bild —
und der Astra-Autorenlauf hat die Arbeit verweigert, weil die Datei fehlte. `local/` ist
git-ignoriert, also bekommt ein frischer `git worktree add` sie nie, und
`scripts/worktree-bootstrap.mjs` verlinkt ausschließlich `node_modules`.

Ein Symlink auf das ganze Verzeichnis löst es NICHT: `.gitignore` Zeile 221 lautet `/local/`
mit Schrägstrich, was ein Verzeichnis trifft, einen Symlink aber nicht — der Arbeitsbaum zeigte
`?? local`, und `author-astra.mjs` startet auf einem schmutzigen Baum gar nicht erst. Von Hand
aufgelöst mit einem echten `local/`-Verzeichnis, das Symlinks auf die beiden Beweis-Einträge
enthält.

Jeder künftige Punkt, der einen übergebenen Fehlerbericht misst (680, 1082 …), läuft in
dieselbe Wand. Der saubere Weg ist Dokumentation, nicht ein Link: `scripts/point-brief.mjs`
sollte `local/`-Pfade als absoluten Pfad des Haupt-Checkouts ausgeben, den ein Agent direkt
lesen kann. Ein Symlink auf das ganze Verzeichnis darf NICHT leichtfertig dazukommen —
`scripts/worktree-cleanup.mjs` existiert, weil `rm -rf` bzw. `git worktree remove` dem
`node_modules`-Link am 29.07.2026 zweimal in den Hauptbaum gefolgt ist, und in `local/` liegen
die unwiederbringlichen Fehlerberichte des Nutzers.

Nicht als Punkt eingereiht: der Handgriff dauert Sekunden und ist hier beschrieben; die Blockade
ist damit aufgehoben, und der Infrastruktur-Stopp gilt weiter.

## Der Unit-Lauf liest eine Datei außerhalb jedes Checkouts und stirbt an ihr (17.09.2026)

Der Bildlauf zu Punkt 1045 starb nach 7m 04s in der Unit-Stufe, ohne ein
einziges Bild zu zeichnen: `scripts/guard-hooks.test.mjs > doc-budget-guard >
ALLOWS documents within budget` erwartete `clean` und bekam `would-block`.
Ursache war keine Codeänderung, sondern eine Zeile in `MEMORY.md`, die die
Sitzung während des Laufs hinzufügte und zwei Minuten später wieder entfernte.
`scripts/doc-budget-core.mjs` führt `MEMORY.md` (Ort `project-memory`) unter den
Dokumenten, die es LIVE vermisst; für diese zwei Minuten lag die Datei über
ihrem Budget, und der Test, der nur prüft, ob der Wächter überhaupt
durchlässt, ging mit ihr rot. Derselbe Baum lief danach in 1,9 s grün.

Die Absicherung, die genau das verhindern soll, konnte es nicht sehen:
`scripts/repository-integrity.mjs` prüft HEAD, Index, eigenen Branch-Ref und
geteilte Config des laufenden Arbeitsbaums. `MEMORY.md` liegt in
`~/.claude/projects/…/memory/`, außerhalb jedes Checkouts — kein Ref, kein
Index, kein Arbeitsbaum hat sich bewegt. Der Lauf ist an dieser Stelle also
nicht hermetisch: jede Sitzung, die ihr Gedächtnis pflegt, kann eine fremde
Verifikation umbringen, und der Befund nennt dabei ein Dokument, das mit der
geprüften Änderung nichts zu tun hat.

Nicht als Punkt eingereiht: kein Spielerimpakt und keine falsche Freigabe — der
Lauf wird korrekt rot und korrekt aufgezeichnet. Die Kosten sind Maschinenzeit
und eine irreführende Fehlermeldung. Zwei billige Wege stehen offen, falls es
wiederkommt: den Budget-Fall des Wächtertests gegen eine FESTE Vorrichtung
laufen lassen statt gegen die lebenden Dokumente, oder `MEMORY.md` aus der
live vermessenen Liste nehmen und ihr Budget allein im Stop-Hook prüfen.
Bis dahin gilt die Regel, die jetzt im Gedächtnis steht: Während eines Laufs
wird gelesen — auch im Gedächtnisverzeichnis.

## Die i18n-Suite meldet „0 pass, 0 fail", obwohl sie prüft (17.09.2026)

Im Beweislauf zu Punkt 1140 meldete `scripts/verify/i18n.mjs` auf WebGPU als
VOLLE Suite `PASS i18n 0 pass, 0 fail, 0 console-errors`. Ich habe die Zeile
zweimal als „diese Suite hat nichts geprüft" gelesen und sie so an den Nutzer
gemeldet, bevor ich ihre Quelle aufschlug.

Das war falsch. Die Suite hat bewusst keine `check()`-Aufrufe — ihr eigener
Kommentar sagt es: die Textasserts sind nach Vitest gezogen, und was in ihr
bleibt, braucht einen echten Browser. Geprüft wird durch drei Dinge, die der
Zähler nicht zählt: die fünf Verschluss-Aufnahmen (der Shutter von Punkt 375
wirft, wenn das Element nicht auf dem Schirm steht, statt ein Bild als Beleg
für einen nie geöffneten Dialog abzulegen), das Konsolenfehler-Tor (`exit 1`
bei jedem Fehler) und die Wache gegen einen ausgewählten Abschnitt, der nie
ausgeführt wurde.

Kein Deckungsloch, sondern ein Lesefehler-Risiko in der Verdikt-Zeile: „0 pass,
0 fail" ist für einen Leser nicht von einer Nullprüfung zu unterscheiden, und
die Verwechslung führt geradewegs zu einer falschen Rot- oder Leermeldung über
eine Suite, die ihre Arbeit getan hat.

Nicht als Punkt eingereiht (Befundaufnahme CLAUDE.md §2): kein Spielerimpakt,
kein Sicherheitsrisiko, keine Blockade und keine falsche Freigabe — die Suite
schlägt korrekt fehl, wenn eine Aufnahme oder die Konsole rot wird. Der billige
Weg, falls es wieder stört: die Verdikt-Zeile einer suite ohne `check()` nennen
lassen, was stattdessen lief (Aufnahmen, Fehlertor), statt eine Null zu drucken.

## Das Steuerkreuz wählt einen Inventarplatz, den nichts benutzen kann (17.09.2026)

Punkt 1140 gibt dem Gamepad Zugang zur Inventarleiste: Steuerkreuz links und
rechts wandern durch die Plätze, der gewählte Platz bekommt einen Rahmen. Nur
benutzen kann ihn niemand — die Spezifikation des Punktes sagt ausdrücklich
„A bleibt die Benutzen-Taste", und A löst weiter den Rateversuch aus. Die
Auswahl ist damit eine Anzeige ohne Wirkung.

Das ist keine Regression: Vor 1140 war die Leiste reine Mausbedienung, ein
Gamepad-Spieler kam also genausowenig an einen Gegenstand. Der Punkt hat den
Zustand nicht verschlechtert, sondern nur sichtbar gemacht.

Nicht als Punkt eingereiht (Befundaufnahme CLAUDE.md §2): Der Autor hat die
Vorgabe wörtlich umgesetzt, und die fehlende Benutzen-Taste ist eine
Gestaltungsentscheidung, keine Fehlfunktion — §17.5 lässt dem Steuerkreuz keine
freie Taste übrig, was genau der Grund war, A nicht doppelt zu belegen. Der
billige Weg, falls es stört: eine Schultertaste oder ein kurzer Druck auf L3
benutzt den gewählten Platz. Das ist eine Belegungsentscheidung des Nutzers,
kein Mangel, den ich allein entscheiden sollte.

## Der Hänge-Detektor liest die Polish-Suite falsch, die erst am Ende schreibt (17.09.2026)

Gemessen 17.09.2026 (Befund aus dem Träger, 17:40): `run-wait --await` erklärte
einen gesunden vollen Polish-Lauf nach 19m04s für hängend („written nothing for
15m00s") und meldete der Notfallspur einen Stillstand. Der Lauf arbeitete in
diesem Moment (Chrome-Renderer bei 67 % CPU, GPU-Prozess bei 33 %) und endete
danach normal. Die Ursache ist strukturell: Polish schreibt konstruktionsbedingt
nur eine Zeile am Start und die PASS/FAIL-Zeile am Ende, und sein gemessenes
Band liegt bei 9,9–61,5 min (Median 55,2). Ein Schweigedetektor von 15 min kann
für diese Suite nie richtig liegen.

Nicht als Punkt eingereiht (Befundaufnahme CLAUDE.md §2, Infrastruktur-Freeze):
Der Lauf selbst war grün, das Fehlurteil hat keine Landung blockiert und keine
falsche Freigabe erzeugt. Falls es stört, ist der billige Weg, die Regel
abzuschalten, nicht sie umzubauen: den Schweigedetektor für Polish aussetzen
oder ihm die Frames unter `verification/` als Fortschrittssignal geben, statt
das Log. Kosten, wenn es bleibt: die meistgelaufene Suite wird bei jedem vollen
Durchgang als Stillstand gemeldet, und der Bediener lernt, das Urteil zu
ignorieren.

## Die Laufprotokolle eines Branches sterben gar nicht mit seinem Worktree (18.09.2026)

Gemessen 18.09.2026 beim Bau von Punkt 1134. Der Punkt bestellt, die `run.json`
eines gelandeten Punktes beim Merge in das Haupt-Checkout zu kopieren, weil
`local/verify-logs/` ignoriert und pro Worktree sei und die Protokolle mit dem
Baum verschwänden. Der Kopierschritt ist gebaut und liegt auf `main` — er hat
bei seiner eigenen Landung aber NICHTS zu tun gefunden: alle fünf `run.json` der
Branch-Läufe lagen bereits unter `/workspace/hoa/local/verify-logs/`, obwohl
jeder Lauf mit cwd im Worktree gestartet wurde. Die Quittung der Läufe nennt
denselben Hauptbaum-Pfad.

Nicht als Punkt eingereiht (Befundaufnahme CLAUDE.md §2, Infrastruktur-Freeze):
kein Spielerbelang, keine Blockade, keine falsche Freigabe — der Kopierschritt
ist in dieser Konfiguration schlicht ein No-op und schadet nicht. Offen bleibt
die Frage, für welche Lauf-Formen die im Punkt genannte Messgrenze überhaupt
gilt; wer sie das nächste Mal braucht, misst sie an einer Suite, die ihr Log
tatsächlich im Worktree anlegt, statt sie aus dem Punkttext zu übernehmen.

## Fünf `feat/`-Branches überleben ihren Merge, zwei davon mit ungemergter Arbeit

Gemessen 18.09.2026 auf `main` d8e1e6129. `git worktree list` und `git branch`
nennen `feat/1049-queue-order-rule`, `feat/834-durable-authoring-lane`,
`feat/847-brevity-guard-gaps`, `feat/901-superseded-ci-run` und
`feat/1133-detached-authoring-run` — jeweils mit Worktree und Remote-Branch.
CLAUDE.md §6 sagt: der Merge beendet den Branch.

Zwei tragen Substanz, die niemand gemergt hat. `feat/847` hält 622 Zeilen über
`scripts/guide-brevity-core.mjs` und dessen Test, sein Punkt 847 ist noch OFFEN,
und `main` ist seit dem 23.08. in mindestens fünf Commits durch dieselbe Datei
gelaufen — der Branch ist ein Monat Divergenz. `feat/834` hält 12402 Zeilen über
54 Dateien, während sein Punkt in `docs/tasks-archive.md` als erledigt steht: was
834 gelandet hat, war nicht dieser Branch. Die beiden anderen halten je einen
Datensatz in `.claude/mechanism-reviews.jsonl`.

Nicht als Punkt eingereiht (Befundaufnahme CLAUDE.md §2, Infrastruktur-Freeze):
kein Spielerbelang, keine Blockade, keine falsche Freigabe — alle fünf sind
gepusht, es geht nichts verloren. Was fehlt, ist die Unterscheidbarkeit: ein
Leser sieht den aufgegebenen Branches nicht an, dass sie aufgegeben sind. Wer
847 anfasst, prüft zuerst, ob die 622 Zeilen gegen das heutige `main` überhaupt
noch tragen, statt sie zu mergen.

## Die Lastmessung starb mit der Sitzung, die sie gestartet hatte

Gemessen 18.09.2026. `scripts/throttle-probe.mjs polish --section=children-motion
--runs 8` lief seit 07:04 als übergebener Lauf der Vorgängersitzung. Er hing ohne
`setsid` an deren Shell (PID 1971198 unter zsh 1971197 unter der Sitzung 1501826).
Als diese Sitzung endete, endete auch die Sonde — nach vier von acht Läufen.

Die vier vorhandenen Läufe liegen unter
`local/throttle-probe/polish-children-motion-2026-09-18T05-04-42-790Z/` und sind
alle grün (`8 pass, 0 fail, exit 0`). Der fünfte Lauf (05:31:28Z) reddete mit null
Bildern, während mein eigenes main-Push-Tor die Maschine belegte — derselbe Fehler,
den §3.267 der Retrospektive beschreibt. Ein Urteil trägt die Messung damit nicht:
vier Grün sind weder eine Bestätigung noch eine Entlastung des Rot, das Punkt 1068
gehört.

Nicht als eigener Punkt eingereiht: Punkt 1133 behebt genau diese Todesklasse für
beauftragte Läufe und wird gerade geschrieben; die offene Messung selbst gehört
Punkt 1068. Festgehalten ist hier nur, dass ein Messlauf dieselbe Kopplung hat wie
ein Autorenlauf — wer die Sonde das nächste Mal startet, koppelt sie ab, und er
fasst die Maschine währenddessen nicht an.

- **A charged red printed with its section tag is only half accounted for.** Measured
  18.09.2026 on a whole `flow` pass at `ddb5e7e32`: the run record strips the generated
  section tag into its own field, so its red is keyed `# starting gifts`, while
  `failedChecks(out)` keeps the tag and keys the same red
  `# starting gifts [--section=core-loop]`. The ledger entry matches BOTH names — the
  charge itself is fine — but the printed key is absent from `recordedKeys`, so
  `run-all.mjs` (~L388) builds it a second row and reports "charged for one reading of
  this check but not for every one this run produced". `allOwned` is then false for a pass
  whose every red has an owner. Non-blocking: `render-verify-guard` was clean for point
  1146's merge with exactly this state. Same shape for every section-tagged charge in the
  ledger (point 1119's `polish` entry among them).

- **Ein deckender Bildlauf verliert seinen Beleg an die nächste Diagnose-Sprosse** (gemessen
  18.09.2026). `scripts/render-verify-core.mjs` liest den JÜNGSTEN Lauf je Grafiklinie, nicht den
  jüngsten DECKENDEN: Acht Abschnittsläufe einer Drossel-Sonde haben den halbstündigen deckenden
  Lauf, der unmittelbar davor grün stand, als Beleg gelöscht, und der teure Lauf musste ein
  zweites Mal fahren. Die Reihenfolge-Regel dagegen steht in der Rückschau (§3.290: erst
  diagnostizieren, dann beweisen); der Lesefehler selbst wartet hier, weil er nur eine
  Wiederholung kostet und nichts Falsches durchlässt (Infrastruktur-Freeze 01.09.2026).

- **Die WebGL-2-Aufnahme des `speech-guess`-Abschnitts zeigt keine Siedlung** (gemessen
  18.09.2026 auf diesem Rechner, auf `feat/1158` UND als Kontrolle auf unverändertem `main`).
  Dasselbe Bild: unter WebGPU steht das Massai-Dorf da — Hütten, Feuer, Bewohner, Gelände —,
  unter WebGL 2 ist die Fläche leer und trägt nur Statusleiste, Kompatibilitätshinweis, den
  Rate-Dialog und die untere HUD-Zeile. Die FPS-Anzeige liest 1 FPS auf dem Zweig und 0 FPS
  auf `main`, die Szene erreicht auf der ANGLE-Kette dieses Rechners also womöglich schlicht
  ihr erstes gezeichnetes Bild nicht, statt defekt leer zu sein. Der Abschnitt bleibt dabei
  GRÜN: seine Prüfungen lesen das DOM, nie das Bild. Nicht als Punkt eingereiht, weil die
  regulären Both-Backend-LARGE-Läufe auf WebGL 2 sonst brauchbare Bilder liefern — spräche das
  Gegenteil, wäre es ein Auslieferungsfehler der Fallback-Linie und gehörte sofort nach vorn.
  Festgehalten ist: die WebGL-2-Aufnahme DIESES Abschnitts taugt derzeit nicht als Bildbeleg,
  und wer sie das nächste Mal braucht, prüft zuerst, ob die Szene überhaupt gezeichnet war.

- **Die Anfängeranleitung steht exakt auf ihrer Obergrenze und hat für die Lehre vom
  18.09.2026 keinen Platz** (gemessen an diesem Tag): 700 Zeilen und 6847 Wörter sind das
  Budget, und die Datei liegt genau darauf — jeder neue Fallstrick, auch ein auf sechs Zeilen
  gekürzter, reißt beide Grenzen. Die Lehre selbst ist vollständig in der Retrospektive
  festgehalten (§3.291: eine Reparatur, die auf einer nie gemessenen Browser-Konstante ruht,
  und ein nur vom Nutzer beurteilbarer Fehler, der auf einen plausiblen Mechanismus hin
  abgehakt wurde). Was hier wartet, ist der redaktionelle Durchgang, den der Wächter selbst
  verlangt: einen bestehenden Eintrag in die Retrospektive hinüberkürzen, damit ein Platz
  frei wird. Nicht als Punkt eingereiht, weil nichts Falsches im Bestand steht — es fehlt
  nur eine Ergänzung.

- **Der Worktree von Punkt 834 überlebt seinen Abschluss und verfälscht die Lastmessung**
  (gemessen 18.09.2026, 22:13): `docs/tasks-archive.md` führt 834 als abgeschlossen, doch
  `.claude/worktrees/point-834` und `feat/834-durable-authoring-lane` bestehen weiter — mit
  122 Commits, die nicht in `main` sind. Nach CLAUDE.md §6 beendet der Merge den Branch;
  hier ist er weder entfernt noch offensichtlich gemergt, und ob der Punkt über einen
  anderen Branch geschlossen wurde oder hier ungemergte Arbeit liegt, ist ungeprüft.
  Gemessene Folge, nicht nur Kosmetik: `batch-doctor` zählt die vier vorhandenen Worktrees
  (1049, 834, 847, 901) als laufende Agenten und hat sein Tor deshalb am selben Abend als
  INCONCLUSIVE gemeldet, statt den Zustand von `main` zu beurteilen. Für 1049, 847 und 901
  ist diese Zählung richtig — die Punkte sind offen, die Branches geparkt; nur 834 ist
  falsch. Nicht als Punkt eingereiht, weil nichts am Spiel dranhängt und die Sperre sich von
  selbst löst, sobald die Maschine ruhig ist. Wer es aufräumt, prüft ZUERST, wohin die 122
  Commits gehören — ein blindes `worktree-cleanup` verwirft sie.

- **Der Tafel-Wächter und sein eigener Stop-Hook widersprechen sich im Übergabezustand**
  (gemessen 18.09.2026, 22:22-22:25, viermal hintereinander): `node
  scripts/dashboard-guard.mjs` endet mit 0 und schweigt, `--synced .batch-dashboard.html`
  quittiert „dashboard registered at HEAD 7c0cad4" samt Integritätsschnappschüssen für 411
  Karten — und der Stop-Hook desselben Wächters meldet im selben Zug BATCH DASHBOARD NOT
  REGISTERED. Unterschied zum Normalfall: die Tafel steht im Übergabezustand, also ohne
  Now-Karte, und `focus.mjs show` meldet `declared focus : -` bei `pivot check: clear`.
  Verdacht, ungeprüft und als Verdacht notiert: der Stop-Pfad verlangt eine Fokus-NUMMER,
  die es in diesem Zustand per Konstruktion nicht gibt, während der CLI-Pfad das leere Feld
  annimmt. Nicht als Punkt eingereiht: es blockiert nichts, und unter dem
  Infrastruktur-Einfrieren wird kein Wächter umgebaut, nur weil er im Weg steht. Warum es
  trotzdem hier steht: eine Falschmeldung, die von einem echten Tafel-Fehler nicht zu
  unterscheiden ist, stumpft den Wächter ab — und ein abgestumpfter Wächter ist schlimmer
  als keiner.

- **Die Browser-Prüfung des Steuerungshinweises übt ihren Resize-Beobachter nicht**
  (Kreuz-Prüfung GPT-6 Astra, 19.09.2026, zu Punkt 1160): Jede Messung im Abschnitt
  `hud-bottom-row` schaltet den Touch-Schalter um und baut den Hinweis damit neu auf —
  *nachdem* Inventarbreite und Ansichtsgröße schon verändert sind. Die Platzierung steht
  deshalb jedes Mal aus der ersten Layout-Messung fest, und die Prüfungen blieben grün,
  wenn man `ResizeObserver` und den `resize`-Zuhörer aus `Hud.tsx` ersatzlos entfernte.
  Was fehlt, sind Prüfungen, die den Hinweis MONTIERT lassen, während sich Gruppenbreite,
  Ansichtsgröße, Sprache und Sperrzustand ändern. Nicht als Punkt eingereiht: reine
  Testabdeckung, kein Spielerimpakt — das Verhalten selbst ist auf beiden Backends am Bild
  belegt (`verification/1160-steering-hint-centred.png`). Wer es aufgreift, prüft zuerst,
  ob der Touch-Umschalter überhaupt nötig bleibt, sobald die Automatik-Maske steht.

## Der Doktor hat keine Prüfung für seine eigene Pfadliste (20.09.2026)

`scripts/batch-doctor.mjs` las die Pfade seiner schmutzigen Dateien mit einem festen
`slice(3)`, während sein Git-Helfer die ganze Ausgabe trimmt — das erste Zeichen der ersten
Zeile fiel weg. Der Fehler überlebte, weil die Liste nur GEZÄHLT und nie GELESEN wurde; erst
eine Ausnahme, die einen Pfad vergleicht, brachte ihn ans Licht (Commit „Keep the doctor from
quarantining the wait it is standing next to"). Behoben ist er, ungeprüft bleibt er: die
Extraktion sitzt im Skript, nicht im Kern, und ein Test dafür verlangte einen Export, also
Umbau. Nicht als Punkt eingereiht: kein Spielerimpakt, und der Defekt ist gemessen behoben
(dirty=2 → dirty=1 auf demselben Baum). Wer den Kern das nächste Mal ohnehin anfasst, zieht
die Zeile mit hinüber und prüft sie dort.

## Der Zeigersperr-Beobachter bleibt über sein Zeitfenster hinaus scharf (21.09.2026)

Die Erholung in `src/scenes/place/pointerLock.ts` (Punkt 1158) hält ihre Absicht
`wantsLock` absichtlich über das 3-Sekunden-Fenster hinaus, damit eine späte echte
Bewegungstaste die Sperre noch holen kann, wenn der Browser frische Nutzeraktivierung
verlangt. Solange diese Absicht steht, bleibt auch der `MutationObserver` verbunden, der
auf `document.body` mit `subtree: true` und `attributes: true` jede Klassenänderung im
ganzen Dokument sieht — und die HUD-Elemente ändern ihre Klassen häufig. Aufgelöst wird er
erst durch Gewährung, Escape, Dialog, Overlay, Fensterwechsel, verborgene Seite, HUD-Klick
oder Szenenabbau; der Rückruf selbst macht nur ein `querySelector('.overlay')`.
Nicht als Punkt eingereiht: kein gemessener Spielerimpakt, keine reproduzierbare
Bildrate-Einbuße, und die Absicht über das Fenster hinaus ist die eigentliche Antwort auf
die zweite Lesart des Punktes. Wer die Datei das nächste Mal anfasst, misst, ob der
Beobachter in einer belebten Siedlung spürbar kostet, und engt ihn sonst auf den
Overlay-Wurzelknoten ein, statt ihn über den ganzen Baum zu legen.

## Ein laufender beauftragter Autor ist in keiner Wiederaufnahme-Prüfung sichtbar (21.09.2026)

Die Batch-Wiederaufnahme las `scripts/focus.mjs show` („1158: returned to queue"),
TASKS.md (1158 als ersten offenen Punkt) und den Punkt-Brief. Alle drei stimmten und
alle drei waren irreführend: In `.claude/worktrees/point-1158` lag `feat/1158-escape-cooldown-return`
mit dem fertigen Fix, 190 Zeilen Tests, vermerkter Mechanismus-Prüfung und einem bereits
CI-grünen Merge mit main. Keine der gelesenen Quellen nennt einen Worktree oder einen
Branch, also wurde der Punkt komplett neu gebaut — samt voller Unit-Suite —, bis `ps`
zufällig dessen laufendes `run-all.mjs` zeigte. Die Quelle, die es gesagt hätte, ist
`git worktree list` beziehungsweise `git branch -a`. Nicht als Punkt eingereiht: kein
Spielerimpakt, keine Blockade, und die wirksame Abhilfe ist eine Gewohnheit, kein
Mechanismus — sie steht als Memory-Regel „Check for an existing branch first". Wer die
Wiederaufnahme ohnehin anfasst, lässt sie den Branch oder Worktree zum Punkt nennen,
bevor sie ihn als offen anbietet.

## `--agent-check` urteilt „alive" auf Dateien, die eine beendete Suite geschrieben hat (21.09.2026)

Im selben Vorgang meldete `node scripts/batch-in-flight.mjs --agent-check --worktree
.claude/worktrees/point-1158` zweimal „DO NOT REPLACE THIS AGENT: work output 0 min old
(working files)", obwohl in der Prozessliste kein Autorprozess mehr stand — die 0 Minuten
alten Dateien waren die 76 `verification/*.png`, die seine gerade beendete Bild-Suite
geschrieben hatte. Das Urteil ist bewusst vorsichtig (am 30.07.2026 wurde ein lebender
Agent für tot erklärt und zwei fertige Punkte neu gebaut), also ist die Richtung richtig;
was fehlt, ist die Unterscheidung zwischen „der Autor schreibt" und „sein Werkzeug hat
geschrieben". Nicht als Punkt eingereiht: die falsche Richtung ist die harmlose, und die
Infrastruktur steht unter Einfriergebot. Wer es ohnehin anfasst, schließt regenerierbare
Ausgabeordner aus der Lebendprüfung aus oder verlangt zusätzlich einen Prozess.

## Ein `--section`-Lauf überschreibt die Vollpass-Bilder mit Kaltstart-Bildern (21.09.2026)

`npm test -- polish --section=speech-guess` schrieb `verification/148-speech-guess-invitation.png`
neu: 62.900 Bytes, leeres blassgrünes Feld, keine Hütten, keine Berge, kein Feuer, HUD-Zähler
„1 FPS". Der auf main eingecheckte Stand desselben Bildes, auf DEMSELBEN Backend (WebGL 2,
gleicher Kompatibilitätshinweis im Bild), ist 624.037 Bytes und zeigt das volle Maasai-Dorf
bei 52 FPS. Es ist also kein Backend-Unterschied, sondern ein Kaltstart: der Abschnittslauf
öffnet den Verschluss, bevor die Szene steht, während der Vollpass die Blöcke davor als
Aufwärmung hat. Die Prüfung selbst bleibt grün, weil ihr erklärtes Subjekt — die Sprechnotiz —
im Bild ist; nichts meldet den Verlust. `verification/` ist in git verfolgt, also ersetzt ein
`git add -A` nach einem Abschnittslauf gute Vollpass-Bilder durch Kaltstart-Bilder, und der
nächste Bildvergleich steht auf dem verschlechterten Stand. Hier waren 76 Dateien betroffen;
alle wurden mit `git restore verification/` verworfen, bevor gelandet wurde. Nicht als Punkt
eingereiht: kein Spielerimpakt, und die billigste Abhilfe — ein Abschnittslauf schreibt seine
Bilder gar nicht erst in den verfolgten Ordner — ist Infrastruktur unter Einfriergebot. Bis
dahin gilt die Handregel: nach einem `--section`-Lauf nie `verification/` mitcommitten.

## Fünf verwaiste Autor-Arbeitsbäume stehen ohne Eintrag irgendwo (21.09.2026)

Nachdem der Neubau von Punkt 1158 genau an dieser Blindheit lag, wurde der Bestand gemessen:
`git worktree list` zeigt fünf Punkt-Arbeitsbäume, und in keinem läuft ein Autorprozess.

| Punkt | Zweig | vor/hinter main | letzter Commit | Punkt offen? |
| --- | --- | --- | --- | --- |
| 690 | `feat/690-port-city-tag-game` | +10 / −35 | vor 21 Stunden | ja |
| 1049 | `feat/1049-queue-order-rule` | +1 / −1550 | vor 3 Wochen | ja |
| 834 | `feat/834-durable-authoring-lane` | +122 / −3326 | vor 4 Wochen | nein |
| 847 | `feat/847-brevity-guard-gaps` | +17 / −3518 | vor 4 Wochen | ja |
| 901 | `feat/901-superseded-ci-run` | +1 / −2003 | vor 3 Wochen | ja |

Der alarmierendste Fall löst sich auf: Punkt 834 ist geschlossen und trägt trotzdem 122 Commits
mit 12.402 Zeilen, die main nicht hat — aber das Archiv sagt warum. Der Punkt wurde am
24.08.2026 zerschnitten, weil die Gegenlese von ~12.000 Zeilen in keine Runde passt; die Nähte
sind die Punkte 889 bis 895, und der Zweig ist das aufbewahrte Material dafür. **Er darf nicht
gelöscht werden**, und dasselbe gilt für jeden anderen hier, solange seine Arbeit weder gelandet
noch geprüft verworfen ist.

Was bleibt, ist die Sichtbarkeit: Keine dieser fünf Lagen steht auf dem Board, im Auftrag oder
in der Fokuszeile, und 690 ist der NÄCHSTE Punkt in der Reihenfolge — sein Zweig trägt bereits
zehn Commits mit dem Betreff „Complete the authored changes". Wer dort ankommt, übernimmt und
landet, statt neu zu bauen. Nicht als Punkt eingereiht: kein Spielerimpakt, nichts ist verloren,
und die Abhilfe ist dieselbe Gewohnheit wie oben — vor jedem Punktbeginn den Bestand ansehen.

## Ein Hafenkind trat einmal auf der Stelle — und nur einmal (21.09.2026)

Beim Landen von Punkt 690 las der `children-motion`-Abschnitt auf WebGL 2 in Kairo das
schlechteste Kind mit 2,80 % seiner beurteilten Zeit (Gruppe 0,56 %, 43 von 5880
Ein-Sekunden-Fenstern) gegen das Tor von 0,25 %. Das ist genau die Sorte Meldung, die
Punkt 690 fürchtet — »ein Kind steckt im Hafen fest« —, und deshalb wurde ihr
nachgegangen, statt sie zu wiederholen, bis sie grün war.

Nachgemessen wurde sie nicht: der reine Nachlauf desselben Spiels — sechs Weltzahlen mal
60/30/14 Bilder je Sekunde, also achtzehn Wiederholungen je Ort — setzt Kairos
schlechtestes Kind auf 0,056 %, nicht schlechter als die Dörfer (bambara 0,154 %, maasai
0,112 %). Der zweite WebGL-2-Lauf desselben Abschnitts an derselben Fassung war grün, der
WebGPU-Lauf ebenfalls. Die Hafenbühne trägt den Tritt also nicht mit sich.

Was bleibt, ist der bekannte, seltene Zufallstritt der Punkte 1068/1081/1169 — auf einer
Maschine, deren Ruhe dieser Wirt nicht messen kann (kein GPU-Zähler). Nicht eingereiht:
kein reproduzierbarer Spielerimpakt, und die Ursache hat bereits drei offene Punkte. Was
diese Landung dagegen dauerhaft hinterlässt: das Tor läuft jetzt auch über den Hafen und
das banklose Dorf, und jedes `children-motion`-Urteil nennt die Siedlung, in der es
gefällt wurde.

## Die Spiegelregel der Trommelsprache ist nicht eindeutig: RIVER und CHIEF (21.09.2026)

Aus einer Nutzerfrage: Wird die Bedeutung der hohen und tiefen BA-Folgen je Spielstart neu
ausgewürfelt, und könnten flussauf und flussab als Gegenteile gebaut sein? Beides ist
beantwortet, und die Antwort ist gut — aber sie legt eine Schwäche frei.

Nichts wird ausgewürfelt: Das Lexikon ist eine feste Modulkonstante (`src/communication/
lexicon.ts`), ohne Seed und ohne Startwahl. Und das Richtungspaar ist bereits doppelt
motiviert — `UPSTREAM` ba-ba-BA-BA steigt, `DOWNSTREAM` BA-BA-ba-ba fällt, sichtbar gegen die
Strömung (`src/scenes/place/bankGame.ts`), und die beiden sind exakte Umkehrungen voneinander,
per Test festgenagelt (`src/communication/lexicon.test.ts`). Das Rätsel erzwingt die Anwendung,
weil die Häuptlingsantwort nur `DOWNSTREAM` enthält (`src/communication/drumMessage.ts`).

Die Schwäche: Unter der Bauregel — vier Silben, gerade Zahl Hochtöne — gibt es sechs gemischte
Folgen. `ROCK` BA-ba-ba-BA und `DIG` ba-BA-BA-ba sind Palindrome und stützen die Regel damit
(kein Gegenteil, also eigener Spiegel). `RIVER` ba-BA-ba-BA und `CHIEF` BA-ba-BA-ba bilden
jedoch ein Spiegelpaar OHNE Gegensatzbedeutung. Wer aus dem Richtungspaar „Umkehrung heißt
Gegenteil" verallgemeinert, bekommt dort genau die falsche Hypothese, vor der die Gegenlese vom
13.08.2026 gewarnt hat.

Innerhalb des heutigen Vorrats ist die Lücke nicht zu schließen: Für `CHIEF` gibt es keinen
freien Platz. Übrig sind nur die beiden Eintonfolgen, also vier identische Schläge, und die sind
am schlechtesten hörbar. Eine Änderung bräuchte den Bruch der Längen- und Paritätsregel und
kostete damit die Zwei-Silben-Verhördistanz, auf der die ganze Hörbarkeit steht. Der Code kennt
die Lücke und argumentiert an Ort und Stelle damit, dass nur das Richtungspaar im selben Atemzug
gesagt wird (`lexicon.ts`).

WEITERGEFÜHRT ALS PUNKT 1174 (21.09.2026): Der Nutzer hat am selben Tag verlangt, das Vokabular
je Spielstart zu würfeln. Damit wandert das überzählige Spiegelpaar von Start zu Start, und der
Punkt hält es mit seiner Regel (b) aus dem Auftrag heraus, wo es am meisten schadet. Was hier
stehen bleibt, ist die Abzählung, auf der diese Regel steht — nicht mehr eine offene Schwäche.

## Fünf verwaiste Worktrees, einer davon ein offener Punkt (22.09.2026)

Gemessen 22.09.2026 11:12: `git worktree list` zeigt neben dem Haupt-Checkout fünf
`feat/`-Worktrees ohne lebenden Autor — point-1049 (`feat/1049-queue-order-rule`, drei
Wochen), point-1174 (`feat/1174-rolled-lexicon`, vier Stunden), point-834
(`feat/834-durable-authoring-lane`, vier Wochen), point-847 (`feat/847-brevity-guard-gaps`,
vier Wochen), point-901 (`feat/901-superseded-ci-run`, drei Wochen). Kein claude-, astra- oder
codex-Prozess lief im selben Zug auf einem davon. 1174 ist ein OFFENER Punkt (TASKS.md), die
anderen vier sind drei bis vier Wochen alt. Offen ist, ob einer ungelandete Arbeit hält oder ob
alle fünf Reste sind. Aufgeräumt wird ausschließlich mit `scripts/worktree-cleanup.mjs`, nie mit
den nackten git-Befehlen — der `node_modules`-Link folgt sonst in den Hauptbaum. NICHT als Punkt
eingereiht: kein Spielerschaden, keine Blockade, und der Infrastruktur-Freeze (CLAUDE.md §2)
lässt Aufräumarbeit an Worktrees nicht vor Spielarbeit.

## render-verify-guard blockt auf testreinen Harness-Dateien (22.09.2026)

Gemessen 22.09.2026: Der Guard blockt das Zugende für `src/scenes/place/layoutHarness.ts` und
`src/scenes/place/tagShuffleHarness.ts` (aus den Punkten 1178/1180). Beide Dateien sind
TESTREIN — ein grep über `src/` und `scripts/` findet keinen Importeur außerhalb von
`*.test.ts`, und `layoutHarness.ts` sagt das in Zeile 2 selbst. Sie rufen `buildLayout`, eine
reine Funktion, und cachen deren Ergebnis je (place, seed); sie ändern nichts an dem, was
gerendert wird. Der Guard entscheidet allein am Pfadpräfix `src/scenes/place/` und kann Harness
von Renderpfad nicht unterscheiden. FOLGE: zwei Suite-Läufe von je rund dreißig Minuten für eine
Änderung, die kein Pixel bewegen kann — jeder Test-Fixture-Refactor unter `src/scenes/` kostet
das. MÖGLICHE ENGFÜHRUNG, nicht gebaut: eine Datei unter einem Renderpfad, die kein
Nicht-Test-Modul importiert, schuldet kein Bild. Unter dem Infrastruktur-Freeze (CLAUDE.md §2)
wird die Regel im Einzelfall mit `--defer` abgeschaltet statt umgebaut; als Punkt lohnt sie sich
erst, wenn sie wiederholt Spielarbeit aufhält.

## Die Webstuhl-Hilfsperson hat keine Arbeitsanimation, und beide Kettenenden sehen gleich aus (22.09.2026)

Aus der Nutzermeldung vom 22.09.2026: „Das mit dem Weben funktioniert. Allerdings finde ich nicht
erkennbar, dass da jemand am Weben ist und was die Hilfsperson macht." Gemessen im selben Zug,
ZWEI getrennte Befunde.

(1) DIE HILFSPERSON IST UNFERTIG. `PlaceLife.tsx` setzt bei `helperWorking` beide Arme auf
`armAim(0, -0.85)` und `lean 0.35` — ein STEHENDES Bild ohne Zyklus, `tendDwellSeconds` = 5 s
lang unbewegt, nichts in den Händen, und am getendeten Kettenende ändert sich hinterher nichts.
„Was macht der" ist damit auch aus zwei Metern nicht beantwortbar. Schwerer wiegt die Folge für
den Zweck der Station: Beide Kettenenden sehen identisch aus, also trägt das Wort
UPSTREAM/DOWNSTREAM keine sichtbare Konsequenz, und der Gang liest sich als Herumlaufen statt als
Folge des Wortes.

(2) DAS WEBEN IST VORHANDEN, ABER SCHWACH. `loomPose` schreibt beide Arme jeden Frame
(`carry = atan2(0.16, 0.28)`, also ±30°, `lean` 0.1..0.24), das Schiffchen fährt, das Tuch wächst
0,11 je 2,6-s-Durchgang. Aber `LOOM_BUILD.warpY` 0,22, `stakeHeight` 0,34, `stripWidth` 0,12 — der
ganze Apparat liegt unter Kniehöhe, die gesamte Bewegung ist waagerecht und klein, und es gibt
KEINEN Ton: `src/systems/ambience.ts` kennt Trommel, Schritte, Donner, Trampeln und Sprache, aber
kein einziges Arbeitsgeräusch im Dorf — dabei ist ein Schmalstreifen-Webstuhl vor allem ein
Klacken. `speechRoute(ac, dest, pan)` existiert inzwischen, ein ortsbezogener Riet-Schlag ist
also machbar.

NICHT EINGEREIHT: Der Nutzer wollte ausdrücklich erst diskutieren. Die Frage, ob die Station vom
Platz aus oder erst davor lesbar sein soll, steht als Entscheidungskarte „Webstuhl: vom Platz aus
erkennen oder erst, wenn man davorsteht?" auf der Tafel. Befund (1) wird unabhängig von der
Antwort gebaut, (2) hängt an ihr.

## Der Retry-Takt der automatischen Pause kennt keinen Nutzer-Halt (22.09.2026)

Gemessen am 22.09.2026 zwischen 20:52 und 20:58. Der Nutzer hatte die Batch
angehalten und in der laufenden Sitzung ausdrücklich gesagt, vor dem
Weiterlaufen stehe eine Umstellung an; der SessionStart-Hook wies dieselbe
Sitzung korrekt an, nicht selbst fortzusetzen. Die Pause-Marke war aber vom
Typ `automatic` (cause `runaway`, `retry-after` 18:46:06Z), und als dieser
Takt ablief, startete der Autostart-Watchdog um 20:56 eine autonome Sitzung
(`claimedAt` 1790103392299, trigger `watchdog`), die den Lock nahm und der
betreuten Sitzung jede Mutation mit STAND-DOWN verweigerte. Ein maschinell
gesetzter Retry-Takt überschreibt damit einen menschlichen Halt, der nach dem
Setzen der Marke ausgesprochen wurde.

Die Sitzung, die den Lock abgab, hat die Marke anschließend als `user-stop`
mit `retry-after: never` neu geschrieben — das ist die richtige Form, aber sie
entstand von Hand und erst nach dem Zwischenfall. Was fehlt, ist der Übergang:
Ein Nutzer-Halt, der während einer laufenden automatischen Pause ausgesprochen
wird, muss deren Takt löschen, statt ihn weiterlaufen zu lassen.

NICHT EINGEREIHT: Infrastruktur-Freeze (Nutzerentscheidung 01.09.2026). Der
Fall hat kein Spielwerk blockiert und keine falsche Freigabe erlaubt; er hat
eine Sitzung Arbeitszeit gekostet.

## `polish` adult-errands: die Montage-Wartebedingung akzeptiert veraltete Hooks (22.09.2026)

Gemessen beim Bildnachweis von Punkt 1184 auf WebGPU: In 2 von 4 Läufen der
Sektion `adult-errands` (16:50 und 22:41, beide auf `feat/1184-word-then-act`)
stirbt `polish` an `scripts/verify/polish.mjs:7524` mit
`TypeError: Cannot read properties of undefined (reading 'digSites')`, weil
`window.__placeLayout` in diesem Moment fehlt; der Lauf 23:28 am selben Commit
und der Lauf 23:24 am Merge-Base `d6954d956` kamen an derselben Stelle durch.
Die Wartebedingung davor (`__placeWalkers?.sample && __placeErrands`) prüft nur
Hooks aus `PlaceLife`, die beim Ortswechsel stehen bleiben können, nicht den
`PlaceScene`-Hook `__placeLayout`, den der nächste Schritt liest. Vermutete
Ursache: Warten auf veraltete Hooks des vorigen Orts; die naheliegende
Reparatur ist, auch auf `__placeLayout` zu warten. Folge: der Absturz beendet
die Suite und kostet die Abdeckung der fünf folgenden Sektionen.

NICHT EINGEREIHT: Infrastruktur-Freeze (Nutzerentscheidung 01.09.2026). Ein
Wiederholungslauf kommt durch; wird der Absturz reproduzierbar, gehört er als
Punkt in die Arbeitsordnung.

- Cross-model review of the lockless user-stop writer (point 1193) was not run: the whole-file range (batch-autostart.mjs) exceeded the 200k review budget and Astra is claude-only. Diff-scoped review of `scripts/batch-pause.mjs`, `batch-pause-core.mjs` classifyPause and the launcher's recovery branch remains open (23.09.2026).
- Astra outage fallback (point 1194), Fable review notes, 23.09.2026: no manual lift of an active fallback before its probe clock expires (`ask-astra --anyway` is the only manual probe; say so in docs/astra-routing.md); `fallbackLine` names "Fable 5.1 reads Opus 5.5" even when the chain would land on Opus 4.8; `review-astra-cli.test.mjs`'s `run()` helper does not default `ASTRA_SHARE_FILE` to a temp file, so a future outage-stub test could write the real share file; an Astra-lane authoring attempt during an outage exits 5 and is relaunched on Opus by hand — nothing re-dispatches it.

- Die Leerlauf-Behauptung der Tafel sperrt das Anlegen einer frischen Nutzeranordnung
  (§3.306, gemessen 23.09.2026). `board-first-core` verweigert jede Schreiboperation, solange
  »Gerade keine laufende Arbeit« steht; `now <N>` braucht eine Warteschlangen-Karte aus
  TASKS.md, `closing <N>` einen gemergten Punkt — und der Punkt, der die erste Bedingung
  erfüllen würde, entsteht nur durch genau die verbotene Schreiboperation. Durchgekommen bin
  ich allein über die Einmal-pro-Zug-Freigabe des board-first-Tors.
  NICHT EINGEREIHT: Infrastruktur-Freeze (Nutzerentscheidung 01.09.2026). Der Defekt lässt
  nichts Falsches durch und blockiert keine laufende Spielarbeit; ein vierter Kartentyp wäre
  genau der Wiederaufbau, den CLAUDE.md §2 untersagt.

- **Hunted calf still treats river water as blocked** (24.09.2026, from point 312). Flights now
  swim rivers, but `calfFleeStep` (a calf run down by a land hunt) still deflects at river banks;
  design.md §19.8 wants the calf run down in the open, so whether it may enter water is a design
  question. Also still unwired since point 192: roaming crossings (`roamCrossing`,
  `balance.waterCross.chance`) are tested but called by no game mover.
- **The main-write guard misses `>>` and heredocs** (24.09.2026). It catches `sed -i` and `>` but
  lets `>>` and heredoc writes through, so a non-owner session can grow a memory file it cannot shrink again. NOT QUEUED: infrastructure freeze (CLAUDE.md §2) — it lets
  nothing false through that a review would miss and blocks no game work.
- **Toast overlaps the open journal's heading** (24.09.2026, flow frame
  `05-journal-after-chief-meeting.png`). At 1280x800 the centred toast lies over the journal
  panel's "Tagebuch" title. NOT QUEUED: cosmetic layout with no blocked action; queue it if a
  player reports it.
- **Board shows nothing in progress while a declared wait lacks evidence** (24.09.2026). A
  `batch-in-flight --waiting-on` without `--point/--pid/--log` is judged `no-evidence`, so the
  board read idle for ~30 min while a main-push gate ran. NOT QUEUED: display-only,
  infrastructure freeze (CLAUDE.md §2). Simplification when picked up: default `--pid` to the
  caller, or refuse a declaration without evidence.
- **A swimmer makes no headway against the Niger near Mopti** (25.09.2026, point 659 route). At
  lat 14.64-14.67, lon -4.10 (water, nothing in the way) a swimmer steering 3.4 units upstream
  made no progress for 15 s: the local current outruns swim speed. NOT QUEUED: a player walks
  the bank round it; queue it if a route needs swimming upstream there (design.md §11).
- **A water carrier's errand once ended with the empty jar before the water** (24.09.2026, point
  659 route, seed 42, HEAD `503e611a1`). Eight minutes later the carrier was on a dig errand and
  never filled; likely the stall or errand-expiry release dropping the pair. NOT QUEUED: seen
  once, not in the following green runs on either backend; the continuous route now records
  `water-errand-abandoned`, so a repeat is filed with its state.
- **`board.mjs focus` drops the other now-cards** (25.09.2026, reproduced twice 05:37–05:49).
  With 659 and 1208 both current, `board.mjs focus 659 …` cut "Woran ich gerade arbeite" down to
  the 659 card and removed 1208's now- and queue card; dashboard-guard then refused the stop
  ("open point 1208 appears nowhere"). Workaround: `board-queue.mjs set`, render, `board.mjs
  promote` again. NOT QUEUED: infrastructure under the 01.09 freeze, with a workaround.

## Board card titles keep a hold marker after the point resumes

Found 25.09.2026 (board chat). The queue card for point 659 still read
"Die ganze Verständigungskette durchgespielt (angehalten)" although the point
had long since resumed and its round 6 was the live focus. The marker lives in
the card title in `.claude/board-queue.json` and nothing strips it when a point
is picked up again, so the board contradicted itself until the user reported it.
Corrected by hand with `scripts/board.mjs title 659`. Non-blocking: no player
impact, board bookkeeping only.

## Communication route: two framing weaknesses seen in round 7

Found 26.09.2026 in the point-659 route evidence (`communication-webgpu-1790372136841-*`).
`03-dig-invitation`: the driver keeps within 0.6 × talk reach of the initiator, so on WebGPU it
stood right behind him; his head fills the foreground and the label sits high above it. The WebGL
twin shows the pair and the label cleanly. `07-clay-impression` / `07-answer-sounding`: the
"Space — Have the answer beaten again" prompt sits over inventory slot 6 ("Clay Impression of a
Rock"); both stay legible. Non-blocking: the game behaves correctly and every word is readable.

## CI flake: batch-daemon M40 lease-fence test

Found 26.09.2026 on main `22f10b130` (CI run 36199903308, job fast (1)):
`scripts/batch-daemon.test.mjs` › "fences a resumed worker whose lease moved on" (M40)
read "no usable lease; ownership is uncertain…" instead of /not the lease that stands/.
The same commit was green in the local pre-push gate and the rerun of the failed job
was green. Non-blocking: infrastructure timing under the 01.09 freeze, no player impact;
queue it only if it reproduces.
- 2026-09-26 main 62a6642d0, webgpu/communication `--section=continuous-route` — red once under
  load (a concurrent Astra vitest run): `[ASSERT] adult-atom-lost — bambara-village: water-back pair
  1/0/walk: forced after 224.77s; overrun situation water-out pair 0/1 (speaker blocked)`. The same
  section on the quiet machine at 5f34e87dd went green (12/12). Not reproducible, so not queued;
  a second sighting on a quiet host makes it a point. The whole-suite covering run on both
  backends is still owed for the render paths landed since 27d3cc2.
  Settled 26.09.2026: `VERIFY_GL=webgl node scripts/verify/run-all.mjs communication` on
  bae5ea3b5 went green (exit 0, 74 frames); the WebGPU whole-suite run was already clean.
- 2026-09-26 main bae5ea3b5, `node scripts/verify/board-layout.mjs` — 8 FAILs on the LIVE board
  only: title-share and column-width checks for cards #9632 and #1192 (long card titles). The
  fixture board is green. Board presentation, no player impact; queue it only if a card
  becomes unreadable in portrait.
