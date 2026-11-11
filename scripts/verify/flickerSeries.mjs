// The flicker judgement of a moving-camera pass (work-order point 315): a run
// of CONSECUTIVE frames taken while the camera walks a continuous path, one
// small step per frame. True motion changes a pixel smoothly from frame to
// frame; a depth fight flips it back and forth (A → B → A) as the camera
// moves. The judge counts those flips on luma.
//
// Pure: frames are { data, width, height, channels } raw buffers (sharp's raw
// output), so the rule is unit-tested without a browser.

/** Luma difference (0..255) a pixel must jump by, both ways, to count as a flip. */
export const FLIP_THRESHOLD = 48

/** Largest share of pixels that may flip in any frame triple. */
export const FLIP_SHARE_LIMIT = 0.0015

function luma(frame, i) {
  const c = frame.channels
  return 0.299 * frame.data[i * c] + 0.587 * frame.data[i * c + 1] + 0.114 * frame.data[i * c + 2]
}

/**
 * Count the pixels that flip in each consecutive triple (f0, f1, f2): a jump
 * of at least `threshold` from f0 to f1 and back by at least `threshold` from
 * f1 to f2, with f2 within `threshold / 2` of f0. Returns the per-triple
 * shares and the worst one.
 */
export function judgeFlickerSeries(frames, { threshold = FLIP_THRESHOLD, limit = FLIP_SHARE_LIMIT } = {}) {
  if (frames.length < 3) throw new Error(`flicker series: ${frames.length} frame(s), at least 3 are needed`)
  const { width, height } = frames[0]
  for (const f of frames) {
    if (f.width !== width || f.height !== height) throw new Error('flicker series: frames differ in size')
  }
  const n = width * height
  const shares = []
  for (let k = 0; k + 2 < frames.length; k++) {
    let flips = 0
    for (let i = 0; i < n; i++) {
      const a = luma(frames[k], i)
      const b = luma(frames[k + 1], i)
      const c = luma(frames[k + 2], i)
      const up = b - a
      const back = c - b
      if (Math.abs(up) >= threshold && Math.abs(back) >= threshold && Math.sign(up) !== Math.sign(back) && Math.abs(c - a) <= threshold / 2) {
        flips++
      }
    }
    shares.push(flips / n)
  }
  const worst = Math.max(...shares)
  return { ok: worst <= limit, worst, worstAt: shares.indexOf(worst), shares, limit }
}
