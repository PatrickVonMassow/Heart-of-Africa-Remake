// The decision layer of the TRAA-toggle render-target leak gate (settings.mjs,
// CLAUDE.md §7.1 pt. 32). Kept pure and separate so the rule can be pinned in
// the Vitest layer instead of only by running a browser suite.
//
// WHY THIS EXISTS (point 334). The gate used to compare two RAW readings of
// `renderer.info.memory.textures` taken 600 ms after a toggle, and reported a
// bare "33 -> 47". Two things were wrong with that:
//
//  1. THE BASELINE WAS NOT A STEADY STATE. A pipeline rebuild frees the old
//     post chain immediately (the useLayoutEffect cleanup) but the new chain's
//     render targets are allocated only on the next RENDERED frame — and a
//     headless page that nothing forces to paint drops to zero rAF ticks for
//     seconds at a time. Sampled in that window the count sits in a DIP with
//     the whole post chain missing (measured: 33 instead of 47 in the bird's-
//     eye view, i.e. 12 render targets / 14 textures absent). The next samples
//     land after a frame, so the gate read "+14 leaked" where nothing had
//     leaked at all — the count had merely come back. Both samples must
//     therefore be SETTLED (see `settledReading` in settings.mjs), and the
//     comparison is two-sided: an unsettled sample now fails loudly instead of
//     passing silently when the DIP happens to land on the second reading.
//  2. THE MESSAGE NAMED NOTHING. Two numbers cannot say what survived, so the
//     first occurrence cost a full investigation. `survivorBreakdown` turns a
//     pair of live-texture snapshots into a per-kind delta, so the next
//     failure states which resources are the extra ones.

/** Stable per-kind key for one live-texture descriptor. Dimensions, format and
 *  role are what identify a render-target set; the object identity is not
 *  usable across a rebuild (every rebuild makes fresh objects). */
export function textureKey(d) {
  const role = d.isDepth ? 'depth' : d.isRT ? 'target' : 'plain'
  const size = `${d.w}x${d.h}${d.depth > 1 ? 'x' + d.depth : ''}`
  return `${d.cls ?? 'Texture'} ${size} ${role} fmt=${d.format} type=${d.type}${d.name ? ` "${d.name}"` : ''}`
}

/** Count descriptors per kind. */
export function tallyByKind(list) {
  const t = new Map()
  for (const d of list) {
    const k = textureKey(d)
    t.set(k, (t.get(k) ?? 0) + 1)
  }
  return t
}

/** Per-kind difference between two live-texture snapshots, biggest change
 *  first, only the kinds that actually moved. This is the answer to "which
 *  resources survive" — with no leak it is empty. */
export function survivorBreakdown(before, after, limit = 6) {
  const a = tallyByKind(before)
  const b = tallyByKind(after)
  const rows = []
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const delta = (b.get(k) ?? 0) - (a.get(k) ?? 0)
    if (delta !== 0) rows.push({ kind: k, delta, before: a.get(k) ?? 0, after: b.get(k) ?? 0 })
  }
  rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
  return rows.slice(0, limit)
}

/** Render a breakdown as one readable line. */
export function formatBreakdown(rows) {
  if (rows.length === 0) return 'no per-kind change'
  return rows.map((r) => `${r.delta > 0 ? '+' : ''}${r.delta} ${r.kind} (${r.before}->${r.after})`).join('; ')
}

/**
 * The gate itself. `before`/`after` are SETTLED texture counts around the
 * toggle stress; `liveBefore`/`liveAfter` the matching live-texture snapshots
 * (may be empty — the verdict then just omits the breakdown).
 *
 * Two-sided by design: the count must RETURN to where it started. A rise is a
 * leak; a fall means a sample was taken mid-rebuild and the measurement cannot
 * be trusted — the failure mode that made the +14 false alarm look real.
 */
export function leakVerdict({ before, after, cycles, tolerance = 2, liveBefore = [], liveAfter = [] }) {
  const delta = after - before
  const ok = Math.abs(delta) <= tolerance
  const rows = survivorBreakdown(liveBefore, liveAfter)
  const sign = delta > 0 ? `+${delta}` : `${delta}`
  let detail = `${before} -> ${after} (${sign} over ${cycles} cycles, tolerance ±${tolerance})`
  if (!ok) {
    detail += delta > 0
      ? ` — LEAKED, surviving: ${formatBreakdown(rows)}`
      : ` — count FELL, so a reading was taken mid-rebuild (post chain not re-allocated); missing: ${formatBreakdown(rows)}`
  }
  return { ok, delta, detail, rows }
}
