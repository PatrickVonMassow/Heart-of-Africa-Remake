// Pure detector for FIXED WALL-CLOCK WAITS in the browser suites.
//
// The project rule is to wait on a CONDITION or the app's own clock, never on
// the wall clock: a fixed sleep is either too short (a flake that accuses the
// product) or too long (a slow suite nobody wants to run). The suites carry a
// large inherited stock of them, and the load-related red runs of the last days
// all trace back to that stock.
//
// Clearing 239 of them at once is not on. So this is a RATCHET, not an
// amnesty: the current count per file is recorded, and the gate fails only when
// a file GAINS one. New waits cannot be added, and every one removed lowers the
// bar permanently. The same shape as the guard-health debt list, for the same
// reason — a check that fires on every run is a check nobody reads.

/**
 * `page.waitForTimeout(1500)` and `setTimeout(resolve, 300)` with a LITERAL
 * delay. A computed delay (`waitForTimeout(budget)`) is deliberately not
 * matched: it is usually derived from the app's own timing, which is the
 * behaviour the rule asks for.
 */
export const FIXED_WAIT_RE = /(?:waitForTimeout\(\s*\d|setTimeout\(\s*[A-Za-z_$][\w$]*\s*,\s*\d)/g

/** How many fixed waits a source text contains. */
export function countFixedWaits(source) {
  return (String(source ?? '').match(FIXED_WAIT_RE) || []).length
}

/**
 * Compare current counts against the recorded baseline.
 *
 * Returns { ok, regressions, improvements }. A regression names the file and
 * both numbers; an improvement is reported so the baseline can be lowered — an
 * un-lowered baseline would silently re-admit a wait that was just removed.
 */
export function compareToBaseline(counts, baseline) {
  const regressions = []
  const improvements = []
  const files = new Set([...Object.keys(counts ?? {}), ...Object.keys(baseline ?? {})])
  for (const f of [...files].sort()) {
    const now = counts?.[f] ?? 0
    const was = baseline?.[f] ?? 0
    if (now > was) regressions.push({ file: f, was, now })
    else if (now < was) improvements.push({ file: f, was, now })
  }
  return { ok: regressions.length === 0, regressions, improvements }
}

/** Human-readable verdict for a failing comparison. */
export function formatRegressions(regressions) {
  if (!regressions.length) return ''
  return [
    'NEUE FESTE WARTEZEIT(EN) in den Browser-Suiten:',
    ...regressions.map((r) => `  · ${r.file}: ${r.was} → ${r.now}`),
    '',
    'Gewartet wird auf eine BEDINGUNG oder die Uhr der Anwendung, nie auf die Wanduhr —',
    'eine feste Pause ist entweder zu kurz (Flackern, das dem Produkt angelastet wird)',
    'oder zu lang (eine Suite, die niemand mehr laufen lässt). Ersetze die Pause durch',
    'ein Warten auf den Zustand, den sie eigentlich abwartet.',
    'Der Altbestand ist als Sperrklinke in scripts/verify/fixed-wait-baseline.json',
    'festgehalten und darf nur SINKEN.',
  ].join('\n')
}
