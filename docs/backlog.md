# Backlog (non-blocking)

Collected findings that did not pass the intake rule of CLAUDE.md §2 (user
decision 01.09.2026): no reproducible player impact, no security or data risk,
no real blockade, and not a deletion/simplification. Nothing here gates a merge,
a landing, or the closing; entries are batched, deduplicated, and revisited only
when their area is touched anyway or a triage says otherwise.

Format: one line per finding — `- YYYY-MM-DD <source> — <finding>`.

<!-- entries -->
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

## NUTZER-AUFTRAG 07.09.2026: Brunnen komplett aus dem Dorf entfernen (07.09.2026)

Nutzer-Auftrag, priorisiert, Begruendung Kommunikationsmechanik: 'Zudem macht der Brunnen in dem Dorf ohnehin wenig Sinn, wenn die Erwachsenen immer zum Fluss laufen. Entferne ihn komplett aus dem Dorf (priorisierter Fix fuer Kommunikationsmechanik).' Ausloeser war Report hoa-state-2026-09-07-1702816850 (bambara-village, seed 1702816850): 'Brunnen haengt im Zaun'. UMFANG (gemessen): lifeSpots.ts — 'well' aus VILLAGE_SPOTS (Z9) streichen, dazu die beiden Stationen in villageAdultStations (Z32 der Brunnen, Z33 der Halt des Wassertraegers) und die Aufzaehlung im Kopfkommentar Z17. PlaceLife.tsx — Komponente Well (Z1599-1633) und ihr Rendering (Z2999) loeschen, dazu der TaskWalker mit carry='jar' (Z3010-3019), dessen Ziel der Brunnenhalt ist; Kommentare Z7 und Z2558 ziehen mit. layout.ts — der Brunnen-Collider (Z1452) faellt weg; Z762 (Object.values(VILLAGE_SPOTS)) schrumpft von selbst. lifeSpots.test.ts Z48-51 erwartet den Brunnen unter den Stationen und muss mit. ENTSCHEIDUNG zum Krugtraeger: ersatzlos streichen statt umhaengen — alle Krug-Wege gehoeren damit den Errand-Erwachsenen auf dem Wasserpfad, und die Lehre bekommt keinen stummen dritten Krugtraeger daneben. Weniger Stationen machen die Platzierung des Kinder-Spielgrunds (Punkt 481.4) nur leichter, kein Regressionsrisiko.

## NUTZER-AUFTRAG 07.09.2026: eigener spaeterer Task fuer das Clipping von Lebens-Requisiten (07.09.2026)

Nutzer-Auftrag: 'reihe einen weiteren Task fuer das Clipping-Problem ein, der spaeter erledigt wird' — also NICHT priorisiert, eigener Punkt, nach dem Brunnen-Fix. Befund dazu (gemessen in layout.ts): die festen Requisitenplaetze VILLAGE_SPOTS werden gegen WOHNBAUTEN freigehalten (isFree Z774 prueft jeden Kandidaten gegen lifeSpots), aber ZAEUNE werden ohne jede Lebens-Requisiten-Pruefung gesetzt: fences.push an Z1108, Z1113, Z1229 (Gehoeftring), Z1293 und Z1335 (Steinring r 17.5 um (0,0.5)) konsultiert lifeSpots nirgends. Deshalb kann ein Gehoeftring quer durch einen festen Requisitenplatz laufen — im Report hoa-state-2026-09-07-1702816850 traf es den Brunnen bei (9, 8.5). Der Brunnen verschwindet zwar mit dem prioritaeren Auftrag, die Exposition bleibt aber fuer Sprecherpaar (4.6,5.6), Stampferin (-7,1.2), Trommler (-2.2,0.2) und Weberin (-8.5,-7) bestehen. Aufgabe: Zaunzuege gegen die Requisitenplaetze pruefen (Zaun weglassen, Ring verschieben oder Platz aus dem Plan heraus setzen wie beim Wasserpfad), plus ein Test ueber mehrere Seeds, dass kein Requisiten-Collider einen Zaunpfosten oder eine Wohnbaute schneidet.

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
