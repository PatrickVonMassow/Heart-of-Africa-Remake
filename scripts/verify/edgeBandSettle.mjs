import { CONFIRM_READS, READ_COUNT, READ_GAP_FRAMES, READ_GAP_MS, READ_GAP_NET_MS } from './cropLuma.mjs'
import { edgeShotReading } from './edgeBandReading.mjs'

// A net for a crop that never settles, not an acceptance criterion. Exhausting
// the old 40-read settle returned the last reading as though it had settled.
export const SETTLE_READ_LIMIT = 40

/**
 * Wait for a whole SHOT to stand still, then measure that certified window.
 *
 * Two frames with less than 0.2 absolute change admitted the slow drying trend
 * that the shot's 1% drift guard rejected seconds later. A full window uses
 * READ_COUNT + CONFIRM_READS and the shot's actual gap (READ_GAP_MS AND
 * READ_GAP_FRAMES), including cold rendering that stretches the wall time.
 * edgeShotReading applies the unchanged SHOT_DRIFT_BAR to the same per-pixel,
 * rain-robust halves that will be measured; there is no independent epsilon.
 *
 * Reuse those reads. No past settle can certify an arbitrarily slower FUTURE
 * shot, so starting another window would reintroduce the timing mismatch.
 * Sliding by one read waits out convergence without changing strength or
 * retrying a band-ratio assertion. A persistent band defect stays in the final
 * reading, and a scene that never stops moving fails with its last drift.
 *
 * read returns groundSamples' { value, detail }; gap waits on the page's clock
 * and rendered frames. Injection lets Vitest exercise this exact wait loop.
 */
export async function settledEdgeShot({ read, gap }) {
  const reads = []
  let last = null
  for (let i = 0; i < SETTLE_READ_LIMIT; i++) {
    // Also wait before the first read, so the new band strength gets drawn.
    // A starved gap must never count as independent pictures of the ground.
    if (!(await gap(READ_GAP_MS, READ_GAP_FRAMES))) {
      return { value: null, detail: `read gap starved before settle read ${i + 1}: required ${READ_GAP_MS} ms and ${READ_GAP_FRAMES} frames within ${READ_GAP_NET_MS} ms` }
    }
    const cur = await read()
    if (cur.value === null) return cur
    reads.push(cur.value)
    if (reads.length < READ_COUNT + CONFIRM_READS) continue
    last = edgeShotReading(reads)
    if (last.value !== null) return last
    reads.shift()
  }
  return { value: null, detail: `ground crop did not settle after ${SETTLE_READ_LIMIT} reads: ${last?.detail ?? 'incomplete shot window'}` }
}
