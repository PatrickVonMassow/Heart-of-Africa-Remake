// The flicker judgement of a moving-camera pass (work-order point 315): a run
// of CONSECUTIVE frames taken while the camera walks a continuous path, one
// small step per frame. True motion changes a pixel smoothly from frame to
// frame; a depth fight flips it back and forth (A → B → A) as the camera
// moves. The judge counts those flips on luma — but a NARROW feature moving
// across the frame (a pole, a stripe one pixel wide stepping one column per
// frame) also makes a fixed pixel go A → B → A. So a flip counts only when the
// pixel's neighbourhood in the middle frame is NOT the previous frame's
// neighbourhood shifted by up to MOTION_RADIUS pixels: content that arrived
// from next door is motion; a surface that appears out of nowhere and leaves
// again is a fight.
//
// Pure: frames are { data, width, height, channels } raw buffers (sharp's raw
// output), so the rule is unit-tested without a browser.

/** Luma difference (0..255) a pixel must jump by, both ways, to count as a flip. */
export const FLIP_THRESHOLD = 48

/** Largest share of pixels that may flip in any frame triple. */
export const FLIP_SHARE_LIMIT = 0.0015

/** How far (pixels, each axis) a feature may move between two frames and
 *  still be recognised as motion rather than a flip. */
export const MOTION_RADIUS = 2

function luma(frame, i) {
  const c = frame.channels
  return 0.299 * frame.data[i * c] + 0.587 * frame.data[i * c + 1] + 0.114 * frame.data[i * c + 2]
}

/** Does the 3×3 neighbourhood of (x, y) in `b` reappear in `a` shifted by
 *  some (dx, dy) ≠ 0 within the motion radius — the changed CENTRE pixel
 *  itself matching its shifted source within tol, and the neighbourhood's
 *  mean luma difference below tol? The centre test matters: a mean over nine
 *  pixels dilutes one changed pixel among eight unchanged ones (a 100-point
 *  jump averages 11.1), so a stationary toggling pixel would pass as motion.
 *  Edge pixels compare only the in-frame part. */
function movedFrom(a, b, x, y, width, height, tol) {
  const centre = luma(b, y * width + x)
  for (let dy = -MOTION_RADIUS; dy <= MOTION_RADIUS; dy++) {
    for (let dx = -MOTION_RADIUS; dx <= MOTION_RADIUS; dx++) {
      if (dx === 0 && dy === 0) continue
      const sx = x - dx
      const sy = y - dy
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
      if (Math.abs(centre - luma(a, sy * width + sx)) >= tol) continue
      let sum = 0
      let n = 0
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const bx = x + ox
          const by = y + oy
          const ax = bx - dx
          const ay = by - dy
          if (bx < 0 || by < 0 || bx >= width || by >= height || ax < 0 || ay < 0 || ax >= width || ay >= height) continue
          sum += Math.abs(luma(b, by * width + bx) - luma(a, ay * width + ax))
          n++
        }
      }
      if (n >= 4 && sum / n < tol) return true
    }
  }
  return false
}

/**
 * Count the pixels that flip in each consecutive triple (f0, f1, f2): a jump
 * of at least `threshold` from f0 to f1 and back by at least `threshold` from
 * f1 to f2, with f2 within `threshold / 2` of f0, and f1's neighbourhood not
 * f0's shifted by a step of motion. Returns the per-triple
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
        // Content that moved in from next door (and moves on) is motion, not a fight.
        const x = i % width
        const y = (i - x) / width
        if (movedFrom(frames[k], frames[k + 1], x, y, width, height, threshold / 3)) continue
        flips++
      }
    }
    shares.push(flips / n)
  }
  const worst = Math.max(...shares)
  return { ok: worst <= limit, worst, worstAt: shares.indexOf(worst), shares, limit }
}
