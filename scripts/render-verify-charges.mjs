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
 * @property {string} why      one dated sentence of evidence
 * @property {string} [suite]  only this suite's reds (omitted: any suite)
 * @property {'webgpu'|'webgl'} [backend] only this backend's reds (omitted: both)
 * @property {'check'|'console'} [kind]   only a failing check, or only a console error
 */

/** @type {RedCharge[]} */
export const RED_CHARGES = [
  {
    point: 666,
    suite: 'polish',
    kind: 'check',
    match: /no child walks without getting anywhere/i,
    why:
      'Inherited by 666 at the 657 tick (13.08.2026), exactly as 666 was filed to do; a third ' +
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
    point: 506,
    suite: 'polish',
    backend: 'webgpu',
    kind: 'check',
    match: /settlement walker \(goat\)/i,
    why:
      'Measured 07.08.2026: the stance check reds in BOTH WebGPU runs (20 stance intervals, ' +
      'worst foot travel 0.967) and passes on WebGL 2 (0.337) — the software lane cannot draw ' +
      'fast enough to answer a rate question, which is point 506. Backend-scoped on purpose: ' +
      'on the WebGL 2 lane this check stays a real red.',
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
    kind: 'check',
    match: /15-worldmodel-victoria-falls/i,
    why:
      'Measured 11.08.2026 on main at 3f639f0d: the falls frame reds as "subject not in the ' +
      'rendered picture", twice including the suite own retry, while the six other landmark ' +
      'frames of the same run pass — and the SAME suite on WebGL 2 passes all seven in the same ' +
      'sitting, so the charge is scoped to WebGPU and a WebGL 2 red stays a real red. Point 627 ' +
      'owns it until the cause — an unsettled jump or a real placement change — is named.',
  },
]
