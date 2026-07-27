// Main-thread liveness attribution for the verify suites (point 304).
//
// WHY THIS EXISTS. The voice suite's cold-load liveness gate used to measure ONE
// number — the largest gap between requestAnimationFrame timestamps — and blame
// the TTS cold load for it. Reproduced on a quiet machine, that number was
// ~15 000 ms, and it had NOTHING to do with the TTS engine: it reproduced
// unchanged with the TTS worker stubbed out entirely. A CDP trace named the
// culprits, and there are two different ones:
//
//   1. A long ANIMATION FRAME with a FREE main thread. The startup frame that
//      first needs the scene's whole shader-program set awaits the program links
//      (GLES2Implementation::GetProgramiv → CommandBufferProxyImpl::
//      WaitForGetOffset), so ONE frame can span ~15 s of wall clock while
//      ordinary tasks — timers, promise callbacks, message handlers — keep
//      running normally throughout. A raf-gap metric reads that as a 15 s
//      "freeze"; the main thread was never blocked.
//   2. A genuinely BLOCKED main thread. Synchronous work in a task starves
//      everything, timers included.
//
// Only (2) is what a liveness gate must catch, and only the part of (2) that the
// measured system caused — the renderer's own synchronous frame cost is a
// different subject and must be reported, not silently charged to the feature
// under test.
//
// So liveness is measured with a plain setInterval TICK TRAIN (it needs no paint
// and no compositor, unlike rAF) and each stall in that train is ATTRIBUTED:
// the part of it that the page spent inside its own animation-frame callbacks is
// the renderer's, the rest is unexplained and is what the gate binds. A stalled
// tick train proves a real block; an intact one proves the thread was alive
// however long the pictures took.

/** Milliseconds of [lo, hi] covered by the UNION of [start, end] intervals.
 *  Intervals may arrive unsorted and may overlap; both are normal (nested
 *  animation-frame callbacks share a frame). */
export function unionCoverage(intervals, lo, hi) {
  if (!(hi > lo)) return 0
  const clipped = []
  for (const iv of intervals) {
    const s = Math.max(lo, iv.start)
    const e = Math.min(hi, iv.end)
    if (e > s) clipped.push([s, e])
  }
  clipped.sort((a, b) => a[0] - b[0])
  let total = 0
  let curStart = null
  let curEnd = null
  for (const [s, e] of clipped) {
    if (curEnd === null || s > curEnd) {
      if (curEnd !== null) total += curEnd - curStart
      curStart = s
      curEnd = e
    } else if (e > curEnd) {
      curEnd = e
    }
  }
  if (curEnd !== null) total += curEnd - curStart
  return total
}

/** Largest gap between consecutive samples (0 for fewer than two). */
export function maxGap(times) {
  let max = 0
  for (let i = 1; i < times.length; i++) max = Math.max(max, times[i] - times[i - 1])
  return max
}

/**
 * Attribute the tick train's stalls.
 *
 * `ticks`  — timestamps of a fixed-interval main-thread timer (ms).
 * `frames` — { start, end } spans of the page's own animation-frame callbacks
 *            (ms, same clock).
 *
 * Returns, all in ms:
 *   blockMs      the largest stall NOT covered by animation-frame callbacks —
 *                the number a liveness gate binds
 *   blockAtMs    where that stall began
 *   frameBlockMs the largest single stall's frame-covered part, i.e. the biggest
 *                synchronous cost the page's own rendering imposed (reported)
 *   tickGapMs    the largest raw stall, unattributed (reported)
 */
export function attributeBlocks(ticks, frames) {
  let blockMs = 0
  let blockAtMs = 0
  let frameBlockMs = 0
  for (let i = 1; i < ticks.length; i++) {
    const lo = ticks[i - 1]
    const hi = ticks[i]
    const covered = unionCoverage(frames, lo, hi)
    const unexplained = hi - lo - covered
    if (unexplained > blockMs) {
      blockMs = unexplained
      blockAtMs = lo
    }
    if (covered > frameBlockMs) frameBlockMs = covered
  }
  return { blockMs, blockAtMs, frameBlockMs, tickGapMs: maxGap(ticks) }
}

/** Defaults for `pictureSettled`, shared with its caller so the suite reports
 *  the same numbers it gates on. */
export const SETTLE_DEFAULTS = { settleMs: 1500, quietGapMs: 250, minFrames: 10 }

/**
 * Has the picture been demonstrably LIVE for the last `settleMs`? (point 337)
 *
 * A startup measurement window must close on the picture's own signal rather
 * than a wall clock: a fixed tail can end mid-stall on a slow machine, which
 * under-reports exactly the standstill the gate exists to catch. This is that
 * signal — over the trailing window, the tick train never gapped by more than
 * `quietGapMs` AND at least `minFrames` frames were painted.
 *
 * The stretch must reach BOTH edges of the window: without that, a stall that
 * ended a moment ago leaves a short quiet tail that would read as settled. So
 * the first sample must sit within `quietGapMs` of the window's start and the
 * last within `quietGapMs` of `now`.
 *
 * `ticks` and `raf` are timestamps on one clock; `now` is that clock's reading.
 * Total on missing input — an unarmed probe is "not settled", never a crash.
 *
 * DELIBERATELY SELF-CONTAINED: startup.mjs stringifies this function into the
 * page, where the sample trains live, so it must close over nothing — no
 * imports, no module constants. `SETTLE_DEFAULTS` is therefore repeated as
 * literal fallbacks here; `liveness.test.mjs` pins the two together so they
 * cannot drift.
 */
export function pictureSettled(ticks, raf, now, options = {}) {
  const settleMs = options.settleMs ?? 1500
  const quietGapMs = options.quietGapMs ?? 250
  const minFrames = options.minFrames ?? 10
  const since = now - settleMs
  const t = (ticks ?? []).filter((x) => x >= since)
  const f = (raf ?? []).filter((x) => x >= since)
  if (t.length < 2 || f.length < minFrames) return false
  for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > quietGapMs) return false
  return t[0] - since < quietGapMs && now - t[t.length - 1] < quietGapMs
}
