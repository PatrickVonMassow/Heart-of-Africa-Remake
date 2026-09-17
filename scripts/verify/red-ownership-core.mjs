// WHETHER A RED HOLDS THE RUN — the pure half, decided against the CLASSIFIED
// BASELINE rather than against a second set of suite passes (point 1135).
//
// The classified baseline is `scripts/render-verify-charges.mjs`: one entry per
// known-red check, each naming the OPEN work-order point that owns it and
// carrying, in its own `why`, the date and the run it was measured on. A red the
// ledger names is charged elsewhere and says nothing about the change under
// test; a red it does not name HOLDS. That lookup costs nothing, which is why
// the automatic baseline passes — up to two whole extra passes of every red
// suite of every LARGE — could be deleted without weakening the gate.
//
// `scripts/verify/baseline-classify.mjs` still measures a red against the
// pre-change tree. It is a HAND diagnosis for a red that is genuinely in doubt,
// asked for by name, never run automatically for every red of every pass.

/** Does this run want the HAND baseline diagnosis? A LARGE no longer does:
 *  point 1135 deleted the automatic baseline passes, so only an explicit
 *  `--baseline` / `VERIFY_BASELINE=1` asks for one. */
export const wantsBaseline = ({ baseline = false, env = {} }) =>
  baseline || env.VERIFY_BASELINE === '1'

export function baselineReport({ suite, backend, baseline, head, classified, logs }) {
  return { version: 1, suite, backend, baseline, head, classified, logs }
}

export function formatOwnershipVerdict({ rows, unresolved = [] }) {
  const charged = rows.filter((r) => r.elsewhere).map((r) => `"${r.title}"`)
  const held = [...rows.filter((r) => !r.elsewhere).map((r) => `${r.suite}: ${r.check} (${r.reason})`), ...unresolved]
  return `POINT REDS ${held.length ? 'HOLD' : 'DO NOT HOLD'} — charged elsewhere: ${charged.join('; ') || 'none'}` +
    ` — own or unresolved: ${held.join('; ') || 'none'}; regression verdict unchanged`
}
