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
]
