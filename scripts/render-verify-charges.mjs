// THE RED CHARGE LEDGER — which currently-known red belongs to which OPEN
// work-order point (point 550). Data only: the matching and the decision live in
// render-verify-core.mjs, so amending this list never rewrites the mechanism.
//
// WHY IT EXISTS. render-verify-guard counted only an exit-0 run as coverage, and
// on 07.08.2026 `polish` could not exit 0 for reasons belonging to OTHER points:
// the render-target assert of point 546 fired as a console error on both
// backends (fixed and ticked 08.08.2026 — its entry left with the tick, which is
// the expiry working), and the goat-stance check reds on the software WebGPU
// lane (point 506). Every change under scripts/verify/ — even a pure comment
// diff — could then only be cleared by a hand-written `--defer`, and a gate
// routinely overridden by hand stops being a gate.
//
// WHAT AN ENTRY MEANS. "This red is already named and owned by an open point, so
// it says nothing about MY change." It is NOT a pass: the run is recorded as
// ACCOUNTED FOR, never as clean, and the guard prints which point each red was
// charged to. The moment the owning point is ticked, its entries stop clearing
// anything — a red that outlives its point is unaccounted again, which is
// exactly how a stale exception is meant to die.
//
// RULES FOR ADDING ONE (keep this list SHORT — it is a list of known defects):
//   - `point` names an OPEN work-order point that describes THIS red. A red
//     nobody has filed gets a point first, not a ledger entry.
//   - Scope as NARROWLY as the evidence allows: `suite` and `backend` restrict
//     where the charge applies. A check that reds only on the software WebGPU
//     lane must stay a real red on WebGL 2.
//   - `match` is tested against the red's printed name (a failing check's label,
//     or `console error: <normalised text>` for a console pseudo-check). Match on
//     the stable part of the wording, never on a measured number.
//   - `why` is one dated sentence: the evidence that this red is that point's.
//
// The Vitest sweep (render-verify-core.test.mjs) pins the shape of every entry
// and that each one still names a point the work order holds open.

/**
 * @typedef {object} RedCharge
 * @property {number} point    the OPEN work-order point that owns this red
 * @property {RegExp} match    tested against the red's printed name
 * @property {RegExp} [detailMatch] when present, the printed measurement must match too
 * @property {string} why      one dated sentence of evidence
 * @property {string} [suite]  only this suite's reds (omitted: any suite)
 * @property {'webgpu'|'webgl'} [backend] only this backend's reds (omitted: both)
 * @property {'core'|'compatibility'} [featureLevel] only runs recorded AT that WebGPU
 *   feature level (point 505). For a lane fault the player never meets: the
 *   compatibility adapter loses MSAA, so its errors must stay REAL reds on a core
 *   adapter. A run that recorded no level matches no level-scoped charge.
 * @property {'check'|'console'} [kind]   only a failing check, or only a console error
 */

/** @type {RedCharge[]} */
export const RED_CHARGES = [
  {
    point: 733,
    suite: 'startup',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    match: /loading picture never freezes longer than the balance budget/i,
    why:
      'FILED AS 733 ON 19.08.2026, THE DAY THE LANE CAME BACK. The startup freeze assertion had ' +
      'never been evaluated on this host: no browser suite could run here at all until point 732 ' +
      'restored the GPU backend, so this red is newly VISIBLE, not newly broken, and it says ' +
      'nothing about a change under scripts/verify/. MEASURED four times across two runs at ' +
      'b2f6f5f5 (worst standstill 7632 / 8167 / 7833 / 7801 ms against the 4000 ms budget, ' +
      'blocked thread ~3.3 s, ~2.3 s inside one animation frame): the readings sit within 7 % of ' +
      'each other at load average 3.1-4.7, where a load artefact scatters, so it is reproducible ' +
      'and not the machine. 733 owns naming whether the freeze belongs to the app or to the ' +
      'compatibility adapter the restored lane rides, and the charge dies with that point. ' +
      'SCOPED TO THAT LANE 28.08.2026 (cross-vendor review): the entry carried neither backend ' +
      'nor level while its own evidence names one restored compatibility adapter, so it would ' +
      'have excused the same freeze on WebGL 2 and on the core adapter, where nobody has ever ' +
      'measured it. Both recorded reds — the two webgpu/startup runs of 19.08.2026 12:09 — carry ' +
      'featureLevel=compatibility, so the narrowing takes no evidence away; and should the freeze ' +
      'turn out to be the product rather than the lane, it stays a real red on the unmeasured ' +
      'lanes until someone runs them.',
  },
  {
    point: 694,
    suite: 'polish',
    backend: 'webgl',
    kind: 'check',
    match: /no child walks without getting anywhere/i,
    detailMatch: /worst child \d+ at \d+\.\d+s, 1\.29 m walked inside 0\.32 m/i,
    why:
      'OWNED BY 694 SINCE 666 LANDED (14.08.2026): a charge expires with its point by ' +
      'construction, so an acceptance meant to outlive point 666 cannot be charged to it — ' +
      '694 holds it until the measure is sharpened or the acceptance is made permanent. ' +
      'DECISION (b), 14.08.2026: accept only the measured WebGL 2 composition, at its named ' +
      'expected live rate of one run in ten; a different backend or a detail other than exactly ' +
      '1.29 m walked inside 0.32 m stays unaccounted and red. The player-visible WebGPU standstill ' +
      'was not this accepted window: the reported-seed replay reproduced child 3 shivering ' +
      'permanently because every 0.9 m anchor crossing reset the rescue clock. The behavior fix ' +
      'now completes that clock, carries the child 2.30 m once, and leaves the remaining 88 s ' +
      'clean at both trace scales. Inherited by 666 at the 657 tick (13.08.2026), exactly as 666 ' +
      'was filed to do; a third ' +
      'trigger of the same window — the way-round sign boundary inside the release ramp, cure ' +
      'measured and rejected 13.08.2026 (evadeHeading ramp comment) — is charged with it. ' +
      'RESIDUAL after the point-657 second round (measured 13.08.2026 on the deterministic ' +
      'replay panel). The first-round carve, orbit and peel took the live worst-child shares ' +
      'from red-in-3-of-10 (to 1.53 %) to one red in ten (WebGL 2 0.44 %, WebGPU worst 0.23 %); ' +
      'the second round traced that red to the evade commitment RELEASING ON A CLIFF ' +
      '(evadeHeading: the un-wrap vanished whole below the 150-degree band, a 2*pi*t heading ' +
      'jump — two co-walking evaders flipped 197 degrees together in open ground) and cured it ' +
      'with the release ramp, pinned by the deterministic dt-seed-14 replay (red at exactly ' +
      '0.25 % before, inside every gate after). What remains, measured over 40 live-cadence ' +
      'replay seeds (1/24 bambara red at 0.31 %, maasai and swahili 0/8): SINGLE LEGITIMATE ' +
      'EVENTS the one-second window reads as pacing when one lands on a child — a catch that ' +
      'reverses the new chaser exactly along its own approach line (the quarry\'s position ' +
      'dictates the out-leg; traced at t=90.3-91.0, dt-seed 1, the rim at (10.5,-16.9)) and a ' +
      'playmate-contact walk (nearKid 0.25 m, deliberately left to the separation — four ' +
      'playmate-wall shapes degraded healthy villages, and two more downstream cures were ' +
      'measured and rejected this round, recorded in evadeHeading). At a ~30 s live trace one ' +
      'such event is over the 0.25 % gate on its own, so a rare live red of this composition ' +
      'remains possible; it is closed by reading the trace (a catch or a contact at the worst ' +
      'window, no rescue, 0.00 m carried), not by retrying. The post-ramp LIVE panel ' +
      '(13.08.2026, merged state 389440ea, quiet machine, 5 runs per backend) confirms it: ' +
      'WebGPU 5/5 green (worst child 0.09 %), WebGL 2 4/5 green and ONE red of exactly this ' +
      'composition — child 3 at 0.39 %, worst window 8.9 s, 1.29 m walked inside 0.32 m, no ' +
      'rescue at the window, 0.00 m carried in the whole run. The 1.29 m walk is the single ' +
      'event\'s own signature: green runs on both backends carry the SAME 1.29 m window under ' +
      'gate (0.09-0.11 %); red is only where one lands on a child whose judged share is small.',
  },
  {
    point: 694,
    suite: 'polish',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    match: /no child walks without getting anywhere/i,
    detailMatch: /worst child \d+ at \d+\.\d+s, 1\.42 m walked inside 0\.31 m/i,
    why:
      'THE SAME COMPOSITION ON THE OTHER BACKEND (measured 14.08.2026, 03:58, polish re-run on ' +
      'main c71d6780, WebGPU): 0.29 % of the judged time, worst child 1 at 22.2 s, 1.42 m walked ' +
      'inside 0.31 m, 3 of 4664 one-second windows, 0.00 % in the 0.5 s bursts. The composition ' +
      'PREDATES the point-666 rescue fix — 666 measured it at 0.31 % on a live-cadence replay ' +
      'seed before that fix existed, the same magnitude as today\'s 0.29 % — but that says ' +
      'nothing about its RATE after the fix, which is unmeasured and is point 694\'s to measure. ' +
      'A detailMatch ENTRY USED TO WORK FORWARD ONLY, and no longer does (measured 14.08.2026, ' +
      'repaired 28.08.2026 under point 734, pinned by a Vitest case): the parser hands chargeReds ' +
      'the printed detail, so the owner was stamped while the run was RECORDED — but the record ' +
      'kept name/key/kind/point and DROPPED the detail, so a red already on disk could never be ' +
      'charged afterwards. This one was not, which is why closing it took a deferral and a re-run ' +
      'rather than the charge the ledger advertises. The record now keeps the measurement (200 ' +
      'characters, the same text the charge was matched against), so an entry written today owns ' +
      'a red recorded today onwards. Reds recorded BEFORE that repair carry no detail and stay ' +
      'out of reach of a detailMatch entry — the information was never written down, and nothing ' +
      'can recover it. ' +
      'It disproves the backend scoping of the entry above — the artefact is the one-second ' +
      'window meeting a live dt cadence, not a renderer — and it shows why a signature keyed to a ' +
      'measured number cannot cover a stochastic artefact: this run minted a new one. Both ' +
      'entries are the STOPGAP that keeps the release branch honest until point 694 replaces ' +
      'them with an answer that holds for a SHAPE (a marginal single-event exceedance) rather ' +
      'than for a number, and on both backends.' +
      'SCOPED TO THE COMPATIBILITY LEVEL 28.08.2026 (cross-vendor review), with every other ' +
      'WebGPU entry: an entry may excuse only the lane its evidence measured, and on the CORE ' +
      'adapter the player runs this red stays real. Measured that day across the 40 recorded ' +
      'runs: every WebGPU run that recorded a level recorded COMPATIBILITY and no core-level ' +
      'run has ever been written here, and no red this entry accounts for today sits on a run ' +
      'whose level went unrecorded — so the narrowing withdraws no charge that stands.',
  },
  {
    // RE-POINTED 20.08.2026: point 506 was folded into 642, and a charge to a ticked point
    // expires. 642 carries 506's mechanism, so it owns this red now.
    // THE STATED REASON NO LONGER HOLDS AS WRITTEN. 506 argued from a SOFTWARE WebGPU lane.
    // Measured today with scripts/verify/backend-lane-check.mjs: BOTH lanes are hardware-backed
    // on the same GPU and WebGPU reports COMPATIBILITY level. That refutes the software premise
    // and nothing more — it does not measure the two lanes' rates against each other and it
    // does not show what causes the stance red. (The cross-vendor review of 20.08.2026 refused
    // the causal reading this comment first carried, and it was right to.) Point 725 disputes
    // the artefact reading altogether. So this entry is a stopgap on contested ground: it keeps
    // the release branch honest, and 642 owes the measurement that decides whether the red is a
    // lane artefact or a product defect.
    point: 642,
    suite: 'polish',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    // SCOPED TO THE MEASURED ASSERTION, not to the walker's label (cross-vendor
    // review of c33b031, finding 2). The label prefix alone matched every future
    // check trackFeet could emit under that name, so a NEW goat red would have
    // been charged away by an entry that never measured it. Only the planted-foot
    // assertion of point 300 was measured, and only it is excused.
    match: /settlement walker \(goat\): the planted foot holds its ground spot/i,
    why:
      'Measured 07.08.2026: the stance check reds in BOTH WebGPU runs (20 stance intervals, ' +
      'worst foot travel 0.967) and passes on WebGL 2 (0.337). The original reading — a software ' +
      'lane too slow to answer a rate question — was REFUTED on 20.08.2026: both lanes are ' +
      'hardware-backed and WebGPU reports compatibility level. What causes the difference is ' +
      'UNMEASURED, and point 725 disputes the artefact reading altogether, so this entry now ' +
      'excuses a red whose explanation is open. ' +
      'Backend-scoped on purpose: on the WebGL 2 lane this check stays a real red. ' +
      'LEVEL-SCOPED 28.08.2026 (cross-vendor review) for the reason the entry already states ' +
      'itself: the refutation rests on the measured lane reporting COMPATIBILITY, so the same ' +
      'check on a core adapter was never measured and stays red. Both recorded reds — the two ' +
      'webgpu/polish runs of 17.08.2026 — carry featureLevel=compatibility.',
  },
  {
    point: 514,
    suite: 'settings',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    why:
      'THE LANE, NOT THE PRODUCT — point 514 §5/§6 already owns this family in prose; this is ' +
      'the machine-readable half, added 13.08.2026 when it stood between a DOM-only change and ' +
      'its merge. SCOPED TO THE COMPATIBILITY LEVEL 19.08.2026 (cross-vendor review), like the ' +
      'console half below and for the same reason: the fault is the lane\'s, so on the CORE ' +
      'adapter the player runs each of these checks stays a real red. Both 13.08.2026 ' +
      'webgpu/settings records this was read off recorded featureLevel=compatibility, so the ' +
      'evidence is unchanged by the narrowing. ' +
      'On the WebGPU compatibility lane every check that switches TRAA OFF falls back ' +
      'to an MSAA path that cannot exist there: `RGBA16Float does not support multisampling` ' +
      'arrives as an uncaptured GPUValidationError and the scene then renders black (mean 2.2-2.5), ' +
      'which also reddens the ground-detail and F9 graphics-level checks and every "no new console ' +
      'errors" assertion in the same run. WebGL 2 passes the same suite on the same tree minutes ' +
      'apart, and `baseline-classify` labelled 16 of 17 of these pre-existing (09.08.2026). ' +
      'Backend-scoped and suite-scoped on purpose: on WebGL 2 each of these stays a real red, and ' +
      'the charge dies with point 514, which must decide whether the lane records these as ' +
      'UNAVAILABLE rather than red. ' +
      'AND WHAT IT STILL CANNOT ASK, NAMED BY ITS OWNER (cross-vendor review, 28.08.2026, round ' +
      '21): the entry excuses these six CHECKS on the measured lane without being able to verify ' +
      'that the MSAA cascade is what reddened them, because a charge reads ONE red and never the ' +
      'run around it. That is POINT 990, which owns giving a charge a reading of the whole ' +
      'record; until it lands, suite, backend, level and kind are the whole of this scope, and ' +
      'the charge dies with point 514 in any case. ' +
      'KIND-SCOPED 28.08.2026 (cross-vendor review): every name this entry lists is a CHECK the ' +
      'suite prints, the console side of the same cascade has its own entry below with its own ' +
      'signature, and unscoped this one would have excused a console red carrying one of these ' +
      'texts — a red nobody measured. Measured before the change: no red in the recorded window ' +
      'matches this pattern at all, so nothing accounted for today stops being.',
    match:
      /(TRAA (off again|toggle stress)|F9 low|Graphics levels|the leak block produced no OTHER|first-person ground shows micro-detail)/i,
  },
  {
    point: 514,
    suite: 'settings',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'console',
    why:
      'THE SAME LANE FAULT FROM THE OTHER SIDE, charged 19.08.2026. The entry above already ' +
      'excuses the CHECKS that report these errors ("TRAA off again: no new console errors", ' +
      '"Graphics levels: no new console errors across the F9 cycle"), while the console ' +
      'pseudo-checks carrying the identical texts stayed unaccounted — so the same measured lane ' +
      'fault blocked the gate through a second door. The cascade is one root cause, named in point ' +
      '514 §5: on the compatibility lane the MSAA fallback cannot exist, `RGBA16Float does not ' +
      'support multisampling` arrives as an uncaptured GPUValidationError, and the invalid ' +
      'msaa-texture/view/command-buffer and async-pipeline errors are its downstream. Read off the ' +
      'two 13.08.2026 webgpu/settings records, where they sit beside the checks the entry above ' +
      'already charges, and BOTH recorded featureLevel=compatibility. Scoped to that LEVEL as well ' +
      'as to suite, backend and kind (cross-model review, 19.08.2026: three of the texts are ' +
      'generic WebGPU cascade wording, so unscoped they would excuse a real defect on the CORE ' +
      'adapter the player runs). On core each of these stays a real red, and the charge dies with ' +
      'point 514.',
    // The RGBA16Float alternative names the ONE evidenced validation error —
    // "The texture format (TextureFormat::RGBA16Float) does not sup[port
    // multisampling]", as the recorded names carry it (cut by the 120-char
    // normalisation) — never the bare format name: a different RGBA16Float
    // fault on this lane is NOT the measured cascade and must stay red
    // (round-5 review, 19.08.2026).
    //
    // AND WHAT THAT ALTERNATIVE DOES NOT COVER, PLAINLY (review finding,
    // 28.08.2026): it ends at `does not sup` because that is where the STORED
    // NAME ends — measured over the 45 distinct console identities in
    // local/verify-baseline-logs, every one of these texts is 138-165
    // characters and the record keeps 15 + 120. The operation that would
    // distinguish this validation error from another RGBA16Float
    // unsupported-operation cascade is therefore not in the record at all, so
    // such a cascade on this lane WOULD be charged here. What holds the entry
    // narrow instead is the rest of its scope — this suite, this backend, the
    // console kind, and the compatibility feature level — and the fact that the
    // charge dies with point 514.
    //
    // AND THE MSAA TEXTURE ALTERNATIVE CARRIES ITS SENTENCE (review finding,
    // 28.08.2026, round 19). It read the OBJECT NAME alone — `Invalid Texture
    // "output-msaa"` — which any future defect touching either attachment would
    // have printed, and it would have been charged here retroactively. More of
    // the measured text fits: the stored name keeps 15 + 120 characters, and the
    // whole sentence is 127, so `… is invalid due to a previous` survives the
    // cut for both attachment names. The alternative is that, and a downstream
    // sentence about either texture from any OTHER validation error stays red.
    //
    // THE THREE GENERIC ALTERNATIVES ARE REPLACED BY THE CASCADE'S OWN
    // SIGNATURE (review finding, 28.08.2026). `Invalid TextureView` and
    // `Invalid CommandBuffer from CommandEncoder` are ordinary WebGPU object
    // names: they say nothing about a cause, and a charge reads ONE red at a
    // time, so an unrelated settings defect printing either would have been
    // charged here retroactively.
    //
    // THE DOWNSTREAM SENTENCE IS NOT SELF-LIMITING, AND THIS ENTRY NO LONGER
    // CLAIMS IT IS (review finding, 28.08.2026). The earlier wording argued
    // that `is invalid due to a previous error` may be owned wholesale because
    // the ROOT it points back to is a red of its own that nothing here charges.
    // A charge sees ONE red, never the run, so nothing verifies that the root
    // is present and still uncharged in the SAME record — a lone downstream
    // message, with its root gone or already excused, was owned outright. The
    // alternative is therefore cut down to the object name the storm was
    // MEASURED with (`[Invalid TextureView]`, in the uncaptured-validation
    // form, never the async-pipeline one), so a downstream sentence from any
    // other object stays a real red. Verifying the root in the record needs a
    // charge that can read the whole run, which this mechanism does not have;
    // that is POINT 990, which owns it, rather than something argued away here.
    // Round 21 raised the same reading again: until 990 lands, suite, backend,
    // the compatibility level, the console kind and the measured sentence are
    // the whole of this scope, and the charge dies with point 514 in any case.
    //
    // `Async render pipeline creation failed` is dropped outright: point 734
    // records that it has NO owning point in the work order and must be given
    // one the moment a run reproduces it, so owning it here would bury the very
    // defect the point says to file. Measured before the change: no recorded
    // red in the 40-run window matches any of the three, so nothing accounted
    // for today stops being.
    match:
      /(GPUValidationError: The texture format \(TextureFormat::RGBA16Float\) does not sup|GPUValidationError: \[Invalid Texture "(output|normal)-msaa"\] is invalid due to a previous|GPUValidationError: \[Invalid TextureView\] is invalid due to a previous error)/i,
    // AND THE ROOT IS READ OFF THE DETAIL, WHERE ITS SENTENCE SURVIVES WHOLE
    // (review finding, 28.08.2026, round 20). The stored NAME keeps 120
    // normalised characters and the root sentence is 137, so it ends at
    // `does not sup` — which any OTHER unsupported-operation error on the same
    // format would also produce, and the entry conceded as much rather than
    // fixing it. The stored DETAIL keeps 200 raw characters, so the word that
    // tells them apart is on the record after all. The narrow half is asked only
    // of the root alternative; a red whose detail says a different unsupported
    // operation is refused and stays red, and so is one whose measurement varied
    // within the run. A record written before the detail was kept carries none
    // and is out of this entry's reach — the information was never written down,
    // which is the honest answer and not a charge.
    detailMatch: /(RGBA16Float\) does not support multisampling|Invalid Texture "(output|normal)-msaa"|Invalid TextureView)/i,
  },
  {
    point: 568,
    suite: 'polish',
    backend: 'webgl',
    kind: 'check',
    match: /water beyond the plate.s rim is the SAME water/i,
    why:
      'Measured 09.08.2026 twice on WebGL 2 with the world seed pinned to 42: red on one run ' +
      '(samples 13.8/12.1/19.3 against a limit of 12) and fully green on the next at the same ' +
      'commit and the same seed, so the world is not what moves. That rotation IS point 568, ' +
      'which must establish whether the sample is taken too early or the rim seam is real.',
  },
  {
    point: 568,
    suite: 'polish',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    match: /water beyond the plate.s rim is the SAME water/i,
    why:
      'The SAME rotation, measured on WebGPU 13.08.2026. Listed as its own entry rather than by ' +
      'dropping the backend field (cross-vendor review, 13.08.2026): the evidence names two ' +
      'lanes, so the charge names those two and a third backend added tomorrow is uncharged ' +
      'until someone measures it there.' +
      'SCOPED TO THE COMPATIBILITY LEVEL 28.08.2026 (cross-vendor review), with every other ' +
      'WebGPU entry: an entry may excuse only the lane its evidence measured, and on the CORE ' +
      'adapter the player runs this red stays real. Measured that day across the 40 recorded ' +
      'runs: every WebGPU run that recorded a level recorded COMPATIBILITY and no core-level ' +
      'run has ever been written here, and no red this entry accounts for today sits on a run ' +
      'whose level went unrecorded — so the narrowing withdraws no charge that stands.',
  },
  {
    point: 570,
    suite: 'polish',
    backend: 'webgl',
    kind: 'check',
    match: /both children read whole, apart and at least/i,
    why:
      'Measured 09.08.2026 on main at 3e33ff83, WebGL 2: red once, while the point-557 agent ' +
      'passed the same check twice on the same change. Point 524, which the check names, is ' +
      'CLOSED, so the red is owned by point 570 until that point establishes whether the ' +
      'children genuinely regressed or the check rotates.',
  },
  {
    point: 627,
    suite: 'world',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    match: /15-worldmodel-victoria-falls/i,
    why:
      'Measured 11.08.2026 on main at 3f639f0d: the falls frame reds as "subject not in the ' +
      'rendered picture", twice including the suite own retry, while the six other landmark ' +
      'frames of the same run pass — and the SAME suite on WebGL 2 passes all seven in the same ' +
      'sitting, so the charge is scoped to WebGPU and a WebGL 2 red stays a real red. Point 627 ' +
      'owns it until the cause — an unsettled jump or a real placement change — is named.' +
      'SCOPED TO THE COMPATIBILITY LEVEL 28.08.2026 (cross-vendor review), with every other ' +
      'WebGPU entry: an entry may excuse only the lane its evidence measured, and on the CORE ' +
      'adapter the player runs this red stays real. Measured that day across the 40 recorded ' +
      'runs: every WebGPU run that recorded a level recorded COMPATIBILITY and no core-level ' +
      'run has ever been written here, and no red this entry accounts for today sits on a run ' +
      'whose level went unrecorded — so the narrowing withdraws no charge that stands.',
  },
  {
    point: 627,
    suite: 'world',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    match: /11-worldmodel-khartoum-confluence/i,
    why:
      'Measured 26.08.2026 on main at f178ea6d, on a quiet machine, four runs across two ' +
      'sittings: the Khartoum frame reds with the SAME wording as the falls frame of 11.08. — ' +
      '"its subject is not in the rendered picture: off the left and bottom edge of the frame" — ' +
      'twice including the suite own retry, while the six other landmark frames pass and the same ' +
      'suite on WebGL 2 passes all seven in the same sitting. The signature has ROTATED from one ' +
      'landmark to another, which decides the second of the two causes point 627 had to choose ' +
      'between, and it stays 627 until the unsettled jump is fixed at its cause.' +
      'SCOPED TO THE COMPATIBILITY LEVEL 28.08.2026 (cross-vendor review), with every other ' +
      'WebGPU entry: an entry may excuse only the lane its evidence measured, and on the CORE ' +
      'adapter the player runs this red stays real. Measured that day across the 40 recorded ' +
      'runs: every WebGPU run that recorded a level recorded COMPATIBILITY and no core-level ' +
      'run has ever been written here, and no red this entry accounts for today sits on a run ' +
      'whose level went unrecorded — so the narrowing withdraws no charge that stands.',
  },
  {
    point: 938,
    suite: 'enrichments',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    match: /streamed dressing does not grow over a session at a fixed anchor/i,
    why:
      'Measured 26.08.2026: five recorded webgpu/enrichments runs of 17.08.2026 carry this check ' +
      'red with point=null, because the check names point 278 and 278 is TICKED — a charge dies ' +
      'with its point, so the red had no owner it could be charged to. Point 938 was opened for ' +
      'exactly this red and is the owner until it settles whether the check or the dressing is ' +
      'stale.' +
      'SCOPED TO THE COMPATIBILITY LEVEL 28.08.2026 (cross-vendor review), with every other ' +
      'WebGPU entry: an entry may excuse only the lane its evidence measured, and on the CORE ' +
      'adapter the player runs this red stays real. Measured that day across the 40 recorded ' +
      'runs: every WebGPU run that recorded a level recorded COMPATIBILITY and no core-level ' +
      'run has ever been written here, and no red this entry accounts for today sits on a run ' +
      'whose level went unrecorded — so the narrowing withdraws no charge that stands.',
  },
  {
    point: 939,
    suite: 'startup',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'console',
    match: /Outdated Optimize Dep/i,
    why:
      'Measured 26.08.2026: the webgpu/startup run of 19.08.2026 12:09:17 carries this one console ' +
      'red — Vite re-bundling its dependency optimizer in the middle of the run, an environment ' +
      'transient by CLAUDE.md own classification and not a product defect, captured by the ' +
      'recorder as an ordinary console red. Point 939 was opened for exactly this red and owns it ' +
      'until the lane is made immune or the text is classified as environment.' +
      'SCOPED TO THE COMPATIBILITY LEVEL 28.08.2026 (cross-vendor review), with every other ' +
      'WebGPU entry: an entry may excuse only the lane its evidence measured, and on the CORE ' +
      'adapter the player runs this red stays real. Measured that day across the 40 recorded ' +
      'runs: every WebGPU run that recorded a level recorded COMPATIBILITY and no core-level ' +
      'run has ever been written here, and no red this entry accounts for today sits on a run ' +
      'whose level went unrecorded — so the narrowing withdraws no charge that stands.',
  },
  {
    point: 514,
    suite: 'enrichments',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    match: /72-water-victoria-falls/i,
    why:
      'Measured 26.08.2026 on the recorded state: the webgpu/enrichments run of 17.08.2026 08:25 ' +
      'carries this frame red unaccounted. Point 514 already names this exact frame missing its ' +
      'subject on the WebGPU compatibility lane while the WebGL 2 run of the same suite minutes ' +
      'apart did not, and its final state — the wait after a jump polling the camera arrival ' +
      'instead of counting milliseconds — is the cause this red has; it is 514 until that lands. ' +
      'SCOPED TO THE COMPATIBILITY LEVEL 28.08.2026 (cross-vendor review), like the two ' +
      'webgpu/settings entries above and for the same reason: the evidence names a lane fault, so ' +
      'unscoped this entry would retroactively excuse the same frame on the CORE adapter the player ' +
      'runs, where it stays a real red. The narrowing changes no evidence — the 17.08.2026 08:25 ' +
      'record was re-read that day and carries featureLevel=compatibility.',
  },
  {
    point: 603,
    suite: 'settings',
    backend: 'webgl',
    kind: 'check',
    match: /first-person ground shows micro-detail/i,
    why:
      'Measured 13.08.2026 on main at 238d786f, WebGL 2: both attempts read a Laplacian mean of ' +
      '1.08 and 1.09 against the bar of 1.1 while every other check of the suite passed, which is ' +
      'the red point 603 declares itself the owner of ("UNTIL THEN this point is where that red is ' +
      'charged") and which only the WebGPU half of the ledger had entered, under point 514.',
  },
]
