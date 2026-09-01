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
 * @property {boolean} [detailReadsPrefix] the signature reads only the FRONT of the
 *   measurement, so the entry keeps charging on a record the 200-character bound CUT.
 *   Opt-in per entry and safety-critical: everything else is refused on a cut record,
 *   because a signature that quietly excuses the wrong red is the failure mode this
 *   table exists to prevent. The `why` of an entry that sets it states how far the
 *   signature reaches and why the removed tail cannot matter (render-verify-core.mjs).
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
    // ANCHORED AT THE NAME'S START (review finding, 28.08.2026, round 22). The
    // fragments floated free, so "Graphics levels" inside any future settings
    // check would have been charged here. A stored CHECK name is the label the
    // suite printed, so its start is exactly where these six begin. Measured
    // before the change: no red in the recorded window matches this pattern at
    // all, so nothing accounted for today stops being.
    match:
      /^(TRAA (off again|toggle stress):|F9 low:|Graphics levels:|the leak block produced no OTHER|first-person ground shows micro-detail)/i,
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
    // AND THAT SENTENCE IS ABOUT *THIS* ENTRY'S SCOPE, NOT A BAN (cross-vendor
    // review, 01.09.2026): entries further down DO carry those object names as
    // their whole signature. They may, because each was measured on this one
    // lane and is scoped to suite, backend, compatibility level and console
    // kind, and each dies with point 514 — the scope does the work the cause
    // cannot. What stays forbidden is what this comment was written against: an
    // entry HERE, whose evidence is the RGBA16Float root, reaching those names
    // as a bare alternative.
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
    // ONE ALTERNATIVE, ONE DETAIL — SO THEY CANNOT CROSS (review finding,
    // 28.08.2026, round 22). `match` and `detailMatch` are asked
    // independently, so a red whose NAME was the RGBA16Float root could pass the
    // narrow half on an `Invalid TextureView` sentence somewhere else in its
    // detail — the opposite of what the root alternative claims to require. The
    // measured sentences are the same in both halves now, which couples them:
    // the root's detail must name multisampling, and each downstream sentence
    // must name its own object.
    match: /^console error: THREE\.WebGPURenderer: Uncaptured WebGPU GPUValidationError: The texture format \(TextureFormat::RGBA16Float\) does not sup/i,
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
    detailMatch: /^THREE\.WebGPURenderer: Uncaptured WebGPU GPUValidationError: The texture format \(TextureFormat::RGBA16Float\) does not support multisampling/i,
  },
  // THE TWO DOWNSTREAM SENTENCES GET THEIR OWN ENTRIES (review finding,
  // 28.08.2026, round 22). One entry cannot pair a name alternative with a
  // detail alternative: `match` and `detailMatch` are asked independently, so a
  // red NAMED for the root passed the narrow half on a TextureView sentence
  // somewhere else in its detail — the opposite of what the root claims to
  // require. Split, each alternative is coupled to its own detail by
  // construction. Everything else about them is the entry above: the same lane,
  // the same measured cascade, the same expiry with point 514, and the same
  // limit point 990 owns.
  {
    point: 514,
    suite: 'settings',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'console',
    why:
      'THE MSAA ATTACHMENT HALF of the cascade the entry above describes in full, split out ' +
      '28.08.2026 (round 22) so its name and its measured sentence cannot be satisfied by a ' +
      'different alternative. Read off the two 13.08.2026 webgpu/settings records, where both ' +
      'attachments print this sentence beside the root. On the core adapter, on WebGL 2, in ' +
      'another suite or as a CHECK it stays a real red, and the charge dies with point 514.',
    match: /^console error: THREE\.WebGPURenderer: Uncaptured WebGPU GPUValidationError: \[Invalid Texture "output-msaa"\] is invalid due to a previous/i,
    detailMatch: /^THREE\.WebGPURenderer: Uncaptured WebGPU GPUValidationError: \[Invalid Texture "output-msaa"\] is invalid due to a previous error/i,
  },
  {
    // ONE ATTACHMENT PER ENTRY (review finding, 28.08.2026, round 23). The two
    // names shared one alternation, and `match` and `detailMatch` choose from it
    // independently — so an OUTPUT name passed the narrow half on a NORMAL
    // detail, which is the same crossing round 22 split the three sentences to
    // prevent, one level down.
    point: 514,
    suite: 'settings',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'console',
    why:
      'THE SECOND MSAA ATTACHMENT, split from the first 28.08.2026 (round 23) so its name and ' +
      'its measured sentence cannot be satisfied by the other one. Everything else is the entry ' +
      'above: the same lane, the same measured cascade, the same expiry with point 514.',
    match: /^console error: THREE\.WebGPURenderer: Uncaptured WebGPU GPUValidationError: \[Invalid Texture "normal-msaa"\] is invalid due to a previous/i,
    detailMatch: /^THREE\.WebGPURenderer: Uncaptured WebGPU GPUValidationError: \[Invalid Texture "normal-msaa"\] is invalid due to a previous error/i,
  },
  {
    point: 514,
    suite: 'settings',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'console',
    why:
      'THE TEXTURE-VIEW HALF of the same cascade, split out 28.08.2026 (round 22) for the same ' +
      'reason. It is the ONE downstream object name the storm was measured with, in the ' +
      'uncaptured-validation form; the separately measured ShadowMaterial async-pipeline form ' +
      'has its own narrow entry below. ' +
      'What this entry still cannot ask is whether the root it points back to is present and ' +
      'uncharged in the same record: a charge reads ONE red and never the run around it, which ' +
      'is POINT 990. On core, on WebGL 2, in another suite or as a CHECK it stays a real red, ' +
      'and the charge dies with point 514.',
    // ANCHORED AT THE STORED IDENTITY (review finding, 28.08.2026, round 23).
    // Unanchored, it matched the sentence wherever it appeared — including
    // inside an `Async render pipeline creation failed` message, which THIS
    // entry was never measured on. That form has since been measured and has an
    // entry of its own below, narrowly, per pipeline class (01.09.2026); the
    // anchor stays for the reason it was added, which is that one entry may not
    // answer for another entry's evidence (cross-vendor review, 01.09.2026:
    // this comment still said the async form had no owner at all).
    match: /^console error: THREE\.WebGPURenderer: Uncaptured WebGPU GPUValidationError: \[Invalid TextureView\] is invalid due to a previous error/i,
    detailMatch: /^THREE\.WebGPURenderer: Uncaptured WebGPU GPUValidationError: \[Invalid TextureView\] is invalid due to a previous error/i,
  },
  {
    point: 514,
    suite: 'settings',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'console',
    // The recorder cuts the normalised error at 120 characters. The measured
    // ShadowMaterial and RenderPipeline names retain `[Invalid TextureView]`;
    // the longer MeshStandardMaterial/NodeMaterial names retain only the shown
    // prefix. Numeric pipeline ids vary, which marks the detail as varied, so
    // the stable stored NAME is the narrowest evidence these reds retain. The
    // four alternatives are the complete measured allowlist from the two LARGE
    // attempts — never a generic async-pipeline match.
    match:
      /^console error: THREE\.WebGPURenderer: Async render pipeline creation failed \(renderPipeline_(?:ShadowMaterial_\d+\): \[Invalid TextureView\](?:\s|$)|MeshStandardMaterial_\d+\): \[Invalid Texture|MeshStandardNodeMaterial_\d+\): \[Invalid Text|RenderPipeline_\d+\): \[Invalid TextureView\](?:\s|$))/i,
    why:
      'THE ASYNC PIPELINE SIGNATURE OF POINT 514\'S MSAA CASCADE, charged 31.08.2026 from the ' +
      'full WebGPU LARGE settings block: the measured ShadowMaterial, MeshStandardMaterial, ' +
      'MeshStandardNodeMaterial and RenderPipeline variants fail on an Invalid TextureView ' +
      'immediately after the RGBA16Float multisampling root. Scoped to the measured compatibility ' +
      'settings console lane and to those four pipeline classes; every other pipeline family ' +
      'remains a real red, and the charge dies with point 514. ' +
      'AND WHAT THE 120-CHARACTER CUT COSTS, SAID PLAINLY (cross-vendor review, 01.09.2026, ' +
      'merge-with-fixes): only the ShadowMaterial and RenderPipeline alternatives can demand the ' +
      'whole `[Invalid TextureView]`. The two longer class names push the object past the bound, ' +
      'so their alternatives stop at `[Invalid Texture` and `[Invalid Text` and therefore excuse ' +
      'ANY invalid-texture object for those two families — `[Invalid Texture "output-msaa"]` ' +
      'included, which is the cascade root itself and is separately charged in any case. The ' +
      'stored record cannot distinguish them, so this is the widest the evidence supports rather ' +
      'than the narrowest anyone would like; narrowing it needs a record that keeps more than the ' +
      'bound, which is POINT 1018. ' +
      'THE SIGNATURES ALSO DEPEND ON THE DIGIT COUNT OF A GENERATED ID, and that is a silent ' +
      'edge in the OTHER direction: `MeshStandardNodeMaterial_999` retains the shown prefix while ' +
      'a four-digit id cuts one character earlier and matches nothing, so the same measured red ' +
      'stops being accounted for. That fails toward a real red, which is the safe side, but it ' +
      'means an unchanged defect can reappear as an unowned one after a renumbering.',
  },
  {
    point: 514,
    suite: 'settings',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'console',
    // At the same 120-character bound the measured name ends after the first
    // two generated renderContext digits. The uncaptured error class, invalid
    // object type, encoder source and context prefix all survive; its changing
    // detail does not, so no detailMatch may honestly be applied.
    match:
      /^console error: THREE\.WebGPURenderer: Uncaptured WebGPU GPUValidationError: \[Invalid CommandBuffer from CommandEncoder "renderContext_\d{2}$/i,
    why:
      'THE COMMAND-BUFFER SIGNATURE OF POINT 514\'S MSAA CASCADE, charged 31.08.2026 from the ' +
      'full WebGPU LARGE settings block: the uncaptured Invalid CommandBuffer from ' +
      'CommandEncoder renderContext_11 error follows the same RGBA16Float root and TextureView ' +
      'failures. Scoped to that compatibility settings console lane and to every stable word the ' +
      'record retains; neighbouring WebGPU validation errors remain real reds, and the charge ' +
      'dies with point 514. ' +
      'THE TWO DIGITS ARE THE BOUND, NOT THE CONTEXT (cross-vendor review, 01.09.2026): the ' +
      'pattern ends at `renderContext_` plus exactly two digits because that is where the ' +
      '120-character cut falls, so it covers `renderContext_11` as measured and `_32`/`_34` as ' +
      're-measured on 01.09.2026 — and NOT a one- or three-digit id, whose different cut leaves ' +
      'a different stored name that this entry does not match. Such a red stays a real red, which ' +
      'is the safe direction, but the same measured failure then reads as unowned.',
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
    match: /^frame 15-worldmodel-victoria-falls\b/i,
    // NARROWED TO THE MEASURED FAILURE MODE (review finding, 28.08.2026, round
    // 25). Its evidence covers one way this frame reds — the subject missing
    // from the rendered picture — and unlike the three entries point 995 owns,
    // this one accounts for no recorded red today, so reading the detail costs
    // nothing and a different failure of the same frame stays a real red. A
    // record written before the detail was kept carries none and is out of
    // reach, which is the honest answer and not a charge.
    detailMatch: /subject is not in the rendered picture/i,
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
    match: /^frame 11-worldmodel-khartoum-confluence\b/i,
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
      'whose level went unrecorded — so the narrowing withdraws no charge that stands. ' +
      'AND THE FAILURE MODE STAYS UNNARROWED, MEASURED (cross-vendor review, 28.08.2026, round ' +
      '22, which asked for it): the evidence covers one way this frame reds, and a `detailMatch` ' +
      'is the instrument that would say so — but the reds this entry accounts for were recorded ' +
      'BEFORE the record kept a detail, and carry none. Read that day: every one of them has an ' +
      'empty detail, so adding the narrow half today would withdraw a standing charge and block ' +
      'the render set on evidence that has not changed. It becomes narrowable the first time ' +
      'this red is recorded again, with its measurement. It is POINT 995, which owns re-recording ' +
      'these reds so the narrow half becomes reachable at all.',
  },
  {
    point: 938,
    suite: 'enrichments',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    match: /^the streamed dressing does not grow over a session at a fixed anchor/i,
    why:
      'Measured 26.08.2026: five recorded webgpu/enrichments runs of 17.08.2026 carry this check ' +
      'red with point=null, because the check names point 278 and 278 is TICKED — a charge dies ' +
      'with its point, so the red had no owner it could be charged to. Point 938 was opened for ' +
      'exactly this red and is the owner until it settles whether the check or the dressing is ' +
      'stale. ' +
      'SCOPED TO THE COMPATIBILITY LEVEL 28.08.2026 (cross-vendor review), with every other ' +
      'WebGPU entry: an entry may excuse only the lane its evidence measured, and on the CORE ' +
      'adapter the player runs this red stays real. Measured that day across the 40 recorded ' +
      'runs: every WebGPU run that recorded a level recorded COMPATIBILITY and no core-level ' +
      'run has ever been written here, and no red this entry accounts for today sits on a run ' +
      'whose level went unrecorded — so the narrowing withdraws no charge that stands. ' +
      'AND THE FAILURE MODE STAYS UNNARROWED for the reason the point-627 entry above states in ' +
      'full (cross-vendor review, 28.08.2026, round 22): the reds this entry accounts for were ' +
      'recorded before the record kept a detail and carry none, so the narrow half would ' +
      'withdraw a standing charge today. Measured that day, empty on every one of them. POINT 995 ' +
      'owns it.',
  },
  {
    point: 939,
    suite: 'startup',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'console',
    // ANCHORED AT THE STORED IDENTITY (review finding, 28.08.2026, round 24):
    // the fragment floated free, so any future startup console red quoting it
    // would have been charged here.
    match: /^console error: Failed to load resource: the server responded with a status of 504 \(Outdated Optimize Dep\)/i,
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
    point: 939,
    suite: 'report',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    match: /^no console errors$/i,
    // DETAIL-SCOPED, and it has to be: "no console errors" is a generic
    // assertion, so the name alone would excuse EVERY console error the report
    // suite ever reports. Only the 504 sentence is excused, and only when the
    // whole detail is that sentence — repeated, as the check joins repeats with
    // ` | ` — and nothing else. A second, different error riding along keeps the
    // red.
    detailMatch:
      /^(Failed to load resource: the server responded with a status of 504 \(Outdated Optimize Dep\))( \| \1)*$/i,
    why:
      'THE SAME VITE TRANSIENT POINT 939 OWNS, ARRIVING IN THE REPORT SUITE AS A CHECK. Measured '
      + '30.08.2026 on `main`, webgpu/report at recorded featureLevel=compatibility: the dev server '
      + 're-bundled its dependency optimizer during the run and answered two requests with 504, '
      + 'which CLAUDE.md classifies as an environment transient rather than a product defect. 939 '
      + 'entered it as a `startup`/`webgpu`/`console` red, so neither the suite nor the kind reaches '
      + 'this reading and it stood unaccounted. Scoped to the lane and level it was measured on and '
      + 'to nothing else: the WebGL 2 run of the same suite the same hour passed WHOLE (34 checks, '
      + '0 fail), so that lane gets no entry here. The charge dies with point 939.',
  },
  {
    point: 514,
    suite: 'enrichments',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    match: /^frame 72-water-victoria-falls\b/i,
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
      'record was re-read that day and carries featureLevel=compatibility. ' +
      'AND THE FAILURE MODE STAYS UNNARROWED for the reason the point-627 entry above states in ' +
      'full (cross-vendor review, 28.08.2026, round 22): the reds this entry accounts for were ' +
      'recorded before the record kept a detail and carry none, so the narrow half would ' +
      'withdraw a standing charge today. Measured that day, empty on every one of them. POINT 995 ' +
      'owns it.',
  },
  {
    point: 938,
    suite: 'enrichments',
    backend: 'webgl',
    kind: 'check',
    match: /^the streamed dressing does not grow over a session at a fixed anchor/i,
    why:
      'THE WebGL 2 HALF OF POINT 938, measured 29.08.2026 and entered because the WebGPU entry ' +
      'above is scoped to that lane and its compatibility level, so it deliberately excuses ' +
      'nothing here. Classified with scripts/verify/baseline-classify.mjs enrichments at ' +
      'VERIFY_GL=webgl against the merge-base 4acf6039abe0: the check is red on the BASELINE and ' +
      'on the branch with the IDENTICAL detail — {"samples":[0,0,0,0,0],"min":0,"max":0,' +
      '"spread":0} — over two baseline runs and seven branch observations, so it is pre-existing ' +
      'and nothing about the bank-round rebuild touches it. Zero samples on both sides says the ' +
      'dressing does not stream at all here rather than that it grows too little, which is the ' +
      'same question 938 already owns: whether the CHECK or the dressing is the stale one. The ' +
      'charge dies with that point.',
  },
  {
    point: 1009,
    suite: 'benchmark',
    backend: 'webgl',
    kind: 'check',
    match:
      /^(restored: (ssaoEnabled|travelZoom|travelSpeed|seed|day)|Math\.random is the original function again)$/i,
    why:
      'THE WebGL 2 HALF. ' +
      'FILED AS 1009 ON 29.08.2026, the day the six were classified. Measured in the LARGE run on ' +
      'feat/687-roam-bound-fixes (WebGL 2) and classified with baseline-classify against the ' +
      'merge-base 4acf6039abe0: ALL SIX are already red on the baseline, so none of them is the ' +
      'communication rebuild\'s. Before that classification NOTHING owned them — no open point ' +
      'named them and this table held no benchmark entry at all — so they reddened every full ' +
      'regression with no owner, which is the one thing CLAUDE.md 7.2 forbids and the reason a ' +
      'LARGE could not go green for any point. The defect they report is real and 1009 holds it: ' +
      'the F8 measurement run borrows the world — a pinned seed and day, a fixed travel zoom and ' +
      'speed, the SSAO switch, and Math.random replaced so a frame draws the same way twice — and ' +
      'returns none of it. THIS IS THE WebGL 2 HALF OF A CHARGE THAT USED TO CARRY NO BACKEND ' +
      'AT ALL, split into two measured halves (cross-vendor review, GPT-5.6 Sol, ' +
      '30.08.2026, which rightly refused the earlier argument): the unscoped entry ' +
      'used to rest on the reasoning that the restore path is plain JavaScript state and has ' +
      'nothing to do with which renderer drew the rows — but reasoning is not a measurement, and ' +
      'a WebGPU red would have been excused on an argument. The LARGE run of 30.08.2026 supplies ' +
      'what was missing: all six read red on webgl/benchmark and again on webgpu/benchmark at ' +
      'recorded featureLevel=compatibility, twice on each lane. The two WebGPU timestamp rows of ' +
      'the same run fail for their own reasons and are NOT covered here. The charge dies with ' +
      'the point.',
  },
  {
    point: 1009,
    suite: 'benchmark',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    match:
      /^(restored: (ssaoEnabled|travelZoom|travelSpeed|seed|day)|Math\.random is the original function again)$/i,
    why:
      'THE WebGPU HALF, SCOPED TO THE COMPATIBILITY LEVEL (cross-vendor review, GPT-5.6 Sol, ' +
      '30.08.2026): one entry without a level also excused the CORE adapter the player runs and ' +
      'a run that recorded no level at all, neither of which this evidence measured. Both ' +
      'recorded WebGPU readings of 30.08.2026 carry featureLevel=compatibility. ' +
      'FILED AS 1009 ON 29.08.2026, the day the six were classified. Measured in the LARGE run on ' +
      'feat/687-roam-bound-fixes (WebGL 2) and classified with baseline-classify against the ' +
      'merge-base 4acf6039abe0: ALL SIX are already red on the baseline, so none of them is the ' +
      'communication rebuild\'s. Before that classification NOTHING owned them — no open point ' +
      'named them and this table held no benchmark entry at all — so they reddened every full ' +
      'regression with no owner, which is the one thing CLAUDE.md 7.2 forbids and the reason a ' +
      'LARGE could not go green for any point. The defect they report is real and 1009 holds it: ' +
      'the F8 measurement run borrows the world — a pinned seed and day, a fixed travel zoom and ' +
      'speed, the SSAO switch, and Math.random replaced so a frame draws the same way twice — and ' +
      'returns none of it. THIS IS THE WebGPU HALF OF A CHARGE THAT USED TO CARRY NO BACKEND ' +
      'AT ALL, split into two measured halves (cross-vendor review, GPT-5.6 Sol, ' +
      '30.08.2026, which rightly refused the earlier argument): the unscoped entry ' +
      'used to rest on the reasoning that the restore path is plain JavaScript state and has ' +
      'nothing to do with which renderer drew the rows — but reasoning is not a measurement, and ' +
      'a WebGPU red would have been excused on an argument. The LARGE run of 30.08.2026 supplies ' +
      'what was missing: all six read red on webgl/benchmark and again on webgpu/benchmark at ' +
      'recorded featureLevel=compatibility, twice on each lane. The two WebGPU timestamp rows of ' +
      'the same run fail for their own reasons and are NOT covered here. The charge dies with ' +
      'the point.',
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
  {
    point: 698,
    suite: 'polish',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    match: /^the children walk PAST the traveller/i,
    // DETAIL-SCOPED 30.08.2026 (cross-vendor review, GPT-5.6 Sol, do-not-merge
    // finding 4): the name alone charged EVERY future failure of this check,
    // including one caused by a round that no longer plays at all — which is the
    // opposite of what 698 owns. 698's claim is DENSITY: the round runs, and the
    // crossing merely does not fall inside the window. So the detail must show the
    // round opening runs at all; a window that never reached the `run` phase is a
    // different defect and stays a real red.
    // A POSITIVE COUNT, not merely the word (cross-vendor review, GPT-5.6 Sol,
    // round 2): `run×0` satisfied `run×` and would have charged away exactly
    // the broken round this narrowing exists to keep red.
    detailMatch: /crossed his line;[\s\S]*phases \[[^\]]*run×[1-9]/i,
    // AND IT READS THE FRONT OF THE MEASUREMENT, WHICH THIS ENTRY DECLARES
    // (cross-vendor review, GPT-5.6 Sol, three refusals over the truncation
    // finding). The crossing line is 223 characters, so EVERY record of it is
    // cut at 200 — and a cut measurement may answer only an entry that says in
    // its own voice that its signature reads the front and the missing tail
    // cannot matter. This one does: it needs the crossing count and the phase
    // list with a positive `run×`, both of which stand at character 178 of the
    // kept text, 22 characters clear of the bound. What the bound removes is the
    // ` over 45s played, 3 tagged` epilogue, which the signature never reads and
    // which cannot turn a running round into a broken one. The declaration is
    // reviewed with the entry, and it is the only thing that keeps this measured
    // charge alive without letting the reader guess the author's intent out of
    // the pattern text.
    detailReadsPrefix: true,
    why:
      'THE USER DECIDED THIS ONE BY NAME. Measured 17.08.2026 on this same branch and filed as '
      + 'point 698, whose first line records the ruling: land the bank round as it stands and '
      + 'calibrate the crossing density there. Counted only while the round is RUNNING — which is '
      + 'what the check now does — three of four measured cases show no crossing at all inside a '
      + '200 s window, and the first crossing needs 251 s / 81 s / 447 s / 228 s of game time over '
      + '600 s. The polish window is 45 s, so a red here is the DENSITY 698 owns, not a broken '
      + 'round: the same suite passed the same check whole on the retry of the 29.08.2026 LARGE '
      + 'run (200 checks, 0 fail), and the mechanic itself — the runs, the tags, the body '
      + 'separation, the stranger berth — passes in the same section. '
      + 'Scoped to suite, backend, level and kind like its neighbours: the charge dies with point '
      + '698, and on a CORE adapter this check was never measured and stays a real red. '
      + 'AND IT READS THE FRONT OF A MEASUREMENT THE RECORD CUT (detailReadsPrefix): the crossing '
      + 'line is 223 characters, so every record of it is cut at the 200-character bound. The '
      + 'signature needs the crossing count and a positive `run×` in the phase list, and both '
      + 'stand 22 characters clear of that bound; what the bound removes is the '
      + '" over 45s played, 3 tagged" epilogue, which the signature never reads and which cannot '
      + 'turn a running round into a broken one.',
  },
  {
    point: 698,
    suite: 'polish',
    backend: 'webgl',
    kind: 'check',
    match: /^the children walk PAST the traveller/i,
    // The same detail constraint as the WebGPU half, for the same reason: 698
    // owns the DENSITY, and a window that never reached the `run` phase is a
    // different defect that stays a real red.
    detailMatch: /crossed his line;[\s\S]*phases \[[^\]]*run×[1-9]/i,
    // Reads the front, for the reason the WebGPU entry above sets out at length:
    // the same 223-character measurement, the same signature, the same 22
    // characters of clearance before the bound.
    detailReadsPrefix: true,
    why:
      'THE WebGL 2 HALF OF POINT 698, measured 30.08.2026 and entered because the WebGPU entry '
      + 'above is scoped to that lane and its compatibility level, so it deliberately excuses '
      + 'nothing here. The LARGE run on feat/686-five-word-lexicon-game read "0 of 4 crossed his '
      + 'line" over 45 s played with phases [run×39 part×161 roam×695] — the round OPENED 39 runs, '
      + 'so it plays and the crossing merely did not fall inside the window, which is exactly the '
      + 'density 698 owns and not a broken round. The retry of the same suite passed whole (200 '
      + 'checks, 0 fail), as it did on 29.08.2026. '
      + 'Which lane drew the frame does not reach this check: the children are simulated in plain '
      + 'JavaScript and the check reads their positions, not their pixels — the WebGPU half was '
      + 'measured first only because that is the lane it first reddened on. The charge dies with '
      + 'point 698. '
      + 'AND IT READS THE FRONT OF A MEASUREMENT THE RECORD CUT (detailReadsPrefix), for the '
      + 'reason the WebGPU half sets out: the same 223-character crossing line, cut at the '
      + '200-character bound, with the crossing count and the positive `run×` standing clear of '
      + 'it and only the trailing epilogue removed.',
  },
  {
    point: 1012,
    suite: 'benchmark',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    match: /^WebGPU: real GPU timestamps were measured for/i,
    // NARROWED 30.08.2026 (cross-vendor review, GPT-5.6 Sol, do-not-merge finding
    // 2): the feature level does NOT test the capability, so on a compatibility
    // adapter that DOES expose `timestamp-query` a genuine timestamp regression
    // would have been charged here. This cause-bearing every-row check therefore
    // rests on the red's own stated reason; the exact low-preset companion point
    // 1012 also names is owned separately below.
    // ANCHORED AT BOTH ENDS 30.08.2026 (cross-vendor review, GPT-5.6 Sol,
    // do-not-merge on a7e9ce5): unanchored, a detail carrying the known reason
    // PLUS a second, genuinely different failure still matched. The detail this
    // check prints is `<n>/<n> rows, reason "<reason>"` and nothing else, so the
    // excuse is that whole line or nothing.
    // THE ROW COUNT MUST BE A REAL SAMPLE 30.08.2026 (cross-vendor review, GPT-5.6
    // Sol, do-not-merge on a333f20): `\d+` accepted `0/0 rows` — a benchmark that
    // produced NO ROWS AT ALL. That report passes the earlier `every` check
    // vacuously and reaches this line with the same reason string, so the empty
    // measurement would have been charged as the measured 0/33 and 0/3.
    detailMatch: /^0\/[1-9]\d* rows, reason "adapter without the timestamp-query feature"$/i,
    why:
      'A CHECK THAT CANNOT PASS ON THE LANE IT RUNS ON, filed as point 1012 on 29.08.2026. Both '
      + 'attempts of the 29.08.2026 LARGE run on feat/687-roam-bound-fixes read 0/33 rows and 0/3 '
      + 'low rows, and the red prints its own cause: "adapter without the timestamp-query '
      + 'feature". Point 1009 mentions the pair in prose but owns the borrowed world, not this — '
      + 'its final state and verifiable list name only the five restored settings and Math.random. '
      + 'Scoped to the compatibility level on purpose: on an adapter that DOES expose '
      + 'timestamp-query a missing timestamp is a real defect and stays red. The charge dies with '
      + 'point 1012, which owes the UNAVAILABLE verdict that replaces it.',
  },
  {
    point: 1012,
    suite: 'benchmark',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    match: /^WebGPU: real GPU timestamps were measured for the low-preset rows too$/i,
    detailMatch: /^0\/[1-9]\d* low rows with gpu$/i,
    why:
      'THE SECOND TIMESTAMP CHECK POINT 1012 NAMES, charged 31.08.2026 from the same two ' +
      'compatibility-lane LARGE attempts as its cause-bearing companion: 0/3 low rows carried GPU ' +
      'time because the adapter exposes no timestamp-query feature. The exact check name and a ' +
      'non-empty all-missing low-row sample are required; every other benchmark row stays red. ' +
      'AND WHAT THIS SIGNATURE CANNOT ASK, STATED RATHER THAN GLOSSED (cross-vendor review, ' +
      '01.09.2026, merge-with-fixes): the low check PRINTS NO REASON, so unlike its companion ' +
      'this entry cannot read the capability gap out of the red, and the feature level does not ' +
      'test the capability either. What contains it is arithmetic, not the level: `0/N low rows` ' +
      'with N at least one means the EVERY-ROW check failed in the same run, and on an adapter ' +
      'that does expose timestamp-query that check prints a DIFFERENT reason — so its own charge ' +
      'refuses, the run keeps an unaccounted red, and no picture can be read as covered. The ' +
      'excuse therefore costs a missed low-row regression only in a run that is already blocked ' +
      'for the same reason. The charge dies with point 1012, whose final state replaces both ' +
      'impossible failures with an UNAVAILABLE verdict while preserving the assertion on capable ' +
      'adapters — and which is where the low check learns to print its reason, so this entry can ' +
      'require it the way its companion does.',
  },
  {
    point: 514,
    suite: 'benchmark',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    match: /^no console errors$/i,
    // ANCHORED AT BOTH ENDS 30.08.2026 (cross-vendor review, GPT-5.6 Sol,
    // do-not-merge finding 3): unanchored, a "no console errors" red carrying the
    // known sentence PLUS a brand-new console error still matched, so the entry
    // did not keep what it promised to keep. The detail must be that sentence and
    // nothing more.
    detailMatch:
      /^THREE\.WebGPURenderer: Uncaptured WebGPU GPUValidationError: The texture format \(TextureFormat::RGBA16Float\) does not support multisampling\.?$/i,
    why:
      'THE MSAA CASCADE REACHING A FOURTH SUITE, charged 29.08.2026. This is the same lane fault '
      + 'point 514 §5 owns, arriving in the benchmark suite instead of settings: both attempts of '
      + 'the LARGE run on feat/687-roam-bound-fixes failed "no console errors" carrying exactly '
      + '"THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: The texture format '
      + '(TextureFormat::RGBA16Float) does not support multisampling." — the fallback edge that '
      + 'cannot exist on this lane. '
      + 'DETAIL-SCOPED, not merely name-scoped: "no console errors" is a generic assertion, so '
      + 'without detailMatch this entry would have excused ANY console error the benchmark ever '
      + 'reports. Only the measured RGBA16Float sentence is excused; every other console error in '
      + 'this suite stays a real red, on this lane as on any other. The charge dies with 514.',
  },
  {
    point: 927,
    suite: 'report',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    // SPLIT FROM THE COMPOSITE CHECK 30.08.2026 (cross-vendor review, GPT-5.6
    // Sol): these two name the PICTURE in their own text — one names the missing
    // `.png` member, the other says the archive carries no screenshot — so the
    // name alone is the evidence. The composite check below is a different case
    // and gets its own entry.
    // THE PNG MEMBER IS THE MEASURED ONE, NOT ANY PNG (cross-vendor review,
    // GPT-5.6 Sol, do-not-merge on 5691e9f): `.*\.png` accepted every PNG-member
    // check the report suite might ever grow. The name the suite prints is built
    // from the download stem `hoa-state-<date>-<n>`, so that shape is the whole
    // of what 927 measured; a future `thumbnail.png` member is a different red.
    match: /^(member hoa-state-\d{4}-\d{2}-\d{2}-\d+\.png is present|the archive carries a screenshot)$/i,
    why:
      'POINT 927 OWNS THIS RED IN FULL AND IN ITS OWN WORDS: "The F6 bug report hands the user an '
      + 'archive WITHOUT the picture", measured 26.08.2026 on main (f14cf8e9) via '
      + 'baseline-classify, red in BOTH baseline runs, and named there as a WebGPU-ONLY defect — '
      + 'the identical tree passes the report suite whole on WebGL 2 with all four members '
      + 'present. The 29.08.2026 LARGE run on feat/687-roam-bound-fixes reproduces exactly the '
      + 'three checks 927 lists, twice, on the WebGPU lane. '
      + 'BACKEND-SCOPED for the reason the point itself measured: on WebGL 2 these three stay real '
      + 'reds, because there the picture is there and its absence would be a NEW defect. '
      + 'LEVEL-SCOPED like every other WebGPU entry in this ledger: 927 recorded no feature '
      + 'level, while BOTH runs that reproduce it here carry featureLevel=compatibility, so the '
      + 'core adapter the player runs was never measured and the same three checks stay red '
      + 'there. This entry accounts for the red; it does '
      + 'not soften it — 927 is criticality HIGH and the archive is a broken channel to the user '
      + 'until it lands.',
  },
  {
    point: 927,
    suite: 'report',
    backend: 'webgpu',
    featureLevel: 'compatibility',
    kind: 'check',
    match: /^the archive holds picture, state, overlay and description$/i,
    // THE COMPOSITE CHECK NEEDS ITS DETAIL, and this is why it is a separate
    // entry (cross-vendor review, GPT-5.6 Sol, 30.08.2026). "the archive holds
    // picture, state, overlay and description" fails whenever ANY of those four
    // members is missing — but point 927 owns exactly one of those failures, the
    // missing PICTURE. An archive that lost its state or its overlay is a defect
    // nobody has measured and must stay red.
    //
    // The detail lists the members the archive DID hold, so the picture-loss
    // shape is: the other three present, and no `.png` anywhere in the list.
    // THE STATE LOOKAHEAD MUST NOT BE SATISFIED BY THE OVERLAY (cross-vendor
    // review, GPT-5.6 Sol, do-not-merge on 5691e9f): `(?=.*\.json)` was already
    // true of `-overlay.json`, so an archive that had ALSO lost its state matched
    // and was charged as the measured picture loss. The state member is named by
    // the download stem (cross-vendor review, round 2: `not the overlay` still
    // accepted any other JSON, so an archive holding a `metadata.json` instead of
    // its state would have matched). Each member is bounded by the separator the
    // detail joins on (round 3: an unbounded name accepted `<stem>.json.bak`, which
    // is not the state member at all; round 4: the terminal boundary must be the
    // SEPARATOR `, `, not a bare comma; round 5: a separator BOUNDARY cannot be
    // told from a member whose own name contains `, `, so the expression stops
    // guessing where members end and describes the WHOLE detail instead — exactly
    // three members, each one built from the download stem the suite writes, which
    // by its own `^hoa-state-\d{4}-\d{2}-\d{2}-\d+\.zip$` shape can hold no comma;
    // round 6: describing the members SEPARATELY still let one stand in for another
    // — an `-overlay.txt` satisfied the description, and nothing tied the three to
    // ONE stem. The detail is now the measured line itself, the stem captured once
    // and required to repeat, in the order point 927 recorded it; round 8: and
    // CASE-SENSITIVE, because the suite writes these names in lower case and a
    // `HOA-STATE-….JSON` member is one nobody has measured).
    detailMatch:
      /^(hoa-state-\d{4}-\d{2}-\d{2}-\d+)\.json, \1-overlay\.json, \1\.txt$/,
    why:
      'THE SAME DEFECT POINT 927 OWNS, READ THROUGH THE ONE CHECK THAT CAN ALSO FAIL FOR ANOTHER ' +
      'REASON. 927 measured a WebGPU archive holding its `.json`, `-overlay.json` and `.txt` and ' +
      'NOTHING ELSE — "the zip holds only .json, -overlay.json and .txt" are its own words — and ' +
      'the LARGE run of 29.08.2026 on feat/687-roam-bound-fixes reproduced exactly that, twice, ' +
      'the detail naming those three members and no picture. ' +
      'DETAIL-SCOPED, unlike its sibling entry: the two checks there name the picture themselves, ' +
      'while this one is a composite over four members and would otherwise have excused a lost ' +
      'STATE or a lost OVERLAY — failures nobody has measured and 927 does not own. ' +
      'Backend- and level-scoped for the reasons the sibling entry states, and the charge dies ' +
      'with 927, which is criticality HIGH: the archive is a broken channel to the user until it ' +
      'lands.',
  },
  {
    point: 1010,
    suite: 'polish',
    backend: 'webgl',
    kind: 'check',
    match: /^no two Ctrl labels fuse in the village crowd/i,
    // DETAIL-SCOPED 30.08.2026 (cross-vendor review, GPT-5.6 Sol, do-not-merge on
    // ffc9c23): the name alone charged EVERY future failure of this check — a
    // SUSTAINED fusion regression, where most frames hold a fused pair, would have
    // been swallowed as the single-frame observation 1010 owns. What was measured
    // is one frame out of the sample, deep enough to cross the unreadable bar, with
    // the retry green. A red on more than one frame, a red without the deep bar, or
    // a crowd that never held stays a real red. The whole printed line is spelled
    // out rather than left to a wildcard (cross-vendor review, round 2): the words
    // `unreadable bar` can also appear inside the label pair the detail quotes.
    // The retry's own verdict is NOT in this detail and cannot be constrained here;
    // it is part of the record this charge cites, not of the red it reads.
    // THE SAMPLE AND THE PAIR ARE BOTH MANDATORY 30.08.2026 (cross-vendor review,
    // GPT-5.6 Sol, do-not-merge on a333f20): `1/\d+` accepted the impossible
    // `1/0 frames`, and the optional `( \[…\])?` accepted a detail that has LOST
    // the pair identity. `worstDepth` and `worstPair` come from the same reading in
    // labelFusion.mjs, so a line printing a depth without its pair is a broken
    // measurement — a different red from the one 1010 owns.
    // AND THE PAIR IS SPELLED OUT, NOT MERELY BRACKETED (same review, round 2):
    // `\[[^\]]*\]` matches an EMPTY bracket, so the identity was still optional in
    // substance. polish.mjs writes `"<a>"×"<b>" <across>×<down> px`, and that is
    // the only shape excused here.
    detailMatch:
      /^1\/[1-9]\d* frames held a pair fused beyond \d+ px \(allowed \d+\), deepest \d+ px \["[^"]+"×"[^"]+" \d+×\d+ px\], \d+–\d+ labels across the sample — as deep as the \d+ px unreadable bar$/i,
    why:
      'THE RED WHOSE CHECK NAMES A TICKED POINT, filed as point 1010 on 29.08.2026. The check '
      + 'prints "(point 628)", 628 is ticked and lives in docs/tasks-archive.md, and a charge dies '
      + 'with its point by construction — so the red had no owner at all. Measured in the '
      + '29.08.2026 LARGE run on feat/687-roam-bound-fixes, WebGL 2: 1/90 frames held a pair fused '
      + 'beyond 6 px, deepest 19 px, and the retry passed with 200 checks, so the record is '
      + 'SUSPECT and covers nothing. '
      + 'This entry gives the red an owner that can CLOSE it; it does not decide the cause. Point '
      + '1010 owes the throttle probe that separates real fusion at this crowd density from a '
      + 'loaded host, and the charge dies with it.',
  },
]
