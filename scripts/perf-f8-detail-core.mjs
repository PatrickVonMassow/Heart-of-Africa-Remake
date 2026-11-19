// Pure analysis for scripts/perf-f8-detail.mjs (docs/perf-1543-driving-hitches.md):
// per measured F8 phase, the CPU median/p95 (the report's own quantile rule)
// and the per-system share of the WORST frames' CPU time, from the DEV
// `window.__f8detail` records written by src/systems/benchmarkRun.ts.

/** Quantile by the F8 report's rule: sorted index floor(q * n), clamped. */
export function quantile(xs, q) {
  const s = [...xs].sort((a, b) => a - b)
  return s.length === 0 ? 0 : s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

/**
 * One phase record → { median, p95, ratio, max, worst: [{ name, ms, share }] }.
 * `worstN` frames with the highest CPU time are pooled; each system's booked
 * ms in them over their summed CPU ms is its share; 'unbooked' is the rest
 * (render internals not wrapped, GC, browser work inside the window).
 */
export function phaseDetail(rec, worstN = 8) {
  const cpu = rec.cpuMs
  const median = quantile(cpu, 0.5)
  const p95 = quantile(cpu, 0.95)
  const order = cpu.map((ms, i) => ({ ms, i })).sort((a, b) => b.ms - a.ms).slice(0, worstN)
  const total = order.reduce((a, f) => a + f.ms, 0)
  const sums = {}
  let booked = 0
  let gcFrames = 0
  for (const f of order) {
    const work = { ...(rec.work?.[f.i] ?? {}) }
    // shader-program builds run inside render-submit: count them once.
    if (work['render-submit'] !== undefined && work['shader-programs'] !== undefined)
      work['render-submit'] = Math.max(0, work['render-submit'] - work['shader-programs'])
    for (const [k, v] of Object.entries(work)) {
      sums[k] = (sums[k] ?? 0) + v
      booked += v
    }
    if ((rec.heapDropMb?.[f.i] ?? 0) > 0) gcFrames += 1
  }
  sums.unbooked = Math.max(0, total - booked)
  const worst = Object.entries(sums)
    .map(([name, ms]) => ({ name, ms: +ms.toFixed(1), share: total > 0 ? +(ms / total).toFixed(2) : 0 }))
    .sort((a, b) => b.ms - a.ms)
  return {
    median: +median.toFixed(2),
    p95: +p95.toFixed(2),
    ratio: median > 0 ? +(p95 / median).toFixed(2) : 0,
    max: +Math.max(0, ...cpu).toFixed(1),
    worstFrames: order.map((f) => +f.ms.toFixed(1)),
    gcFrames,
    probe: rec.work !== null && rec.work !== undefined,
    worst,
  }
}

/** The measured records of one phase name, in run order. */
export function measuredPhases(detail, phase) {
  return (detail ?? []).filter((r) => r.measured && r.phase === phase)
}
