// The no-fusion bar (point 628), pinned in the fast layer: what the sampled
// series may show and what it must red on. The page-side sampler only counts;
// THIS is where the judgment lives.
import { describe, expect, it } from 'vitest'
import { FUSE_HARD, FUSE_MAX_SHARE, FUSE_TOLERANCE, judgeLabelFusion, mergeFusionReadings } from './labelFusion.mjs'

const clean = { samples: 90, fusedFrames: 0, deepFrames: 0, worstDepth: 0, worstPair: null, labelsMin: 19, labelsMax: 19 }

describe('judgeLabelFusion (point 628)', () => {
  it('passes a clean crowd', () => {
    expect(judgeLabelFusion(clean).ok).toBe(true)
  })

  it('fails a STANDING fusion — the reported "Villager llager" class holds in most frames', () => {
    const r = judgeLabelFusion({ ...clean, fusedFrames: 80, worstDepth: 14, worstPair: '"Villager"×"Villager" 40×14 px' })
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('80/90')
  })

  it('fails an unreadable overlap that STANDS — the point-628 defect held one in 90/90 frames', () => {
    const r = judgeLabelFusion({
      ...clean,
      fusedFrames: 90,
      deepFrames: 90,
      worstDepth: FUSE_HARD + 1,
      worstPair: '"Villager"×"Villager" 40×19 px',
    })
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('STANDS')
  })

  // POINT 1067, measured 07.09.2026: the depth used to red on ONE frame of the
  // 90 while the count bar excused the very same frame. `declutterLabels` cannot
  // PLACE an overlapping pair, so such a frame is a pair that MOVED into itself
  // between the layer's decision and the sample — 1–3 frames long, on a lane
  // whose frames last 130–170 ms, and never present in the window sampled before
  // the crowd tightened (0 fused frames there in 22 traced runs).
  it('tolerates an unreadable overlap in as few frames as the cushion allows', () => {
    const allowed = Math.floor(90 * FUSE_MAX_SHARE)
    const r = judgeLabelFusion({
      ...clean,
      fusedFrames: allowed,
      deepFrames: allowed,
      worstDepth: FUSE_HARD + 1,
      worstPair: '"Villager"×"Villager" 47×19 px',
    })
    expect(r.ok).toBe(true)
    expect(r.detail).toContain(`${allowed} of them at the ${FUSE_HARD} px unreadable bar`)
  })

  it('fails one unreadable frame more than the cushion allows', () => {
    const allowed = Math.floor(90 * FUSE_MAX_SHARE)
    const r = judgeLabelFusion({
      ...clean,
      fusedFrames: allowed + 1,
      deepFrames: allowed + 1,
      worstDepth: FUSE_HARD,
      worstPair: '"Villager"×"Villager" 47×19 px',
    })
    expect(r.ok).toBe(false)
  })

  it('fails a sampler that never counted the deep frames — half a bar is not a reading', () => {
    const { deepFrames: _dropped, ...noDeep } = clean
    const r = judgeLabelFusion(noDeep)
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('deepFrames')
  })

  it('tolerates a shallow inter-refresh graze inside the share', () => {
    const allowed = Math.floor(90 * FUSE_MAX_SHARE)
    expect(allowed).toBeGreaterThan(0) // the cushion exists at the sample count the suites use
    const r = judgeLabelFusion({ ...clean, fusedFrames: allowed, worstDepth: FUSE_TOLERANCE + 2 })
    expect(r.ok).toBe(true)
  })

  it('fails one graze more than the share allows', () => {
    const allowed = Math.floor(90 * FUSE_MAX_SHARE)
    const r = judgeLabelFusion({ ...clean, fusedFrames: allowed + 1, worstDepth: FUSE_TOLERANCE + 2 })
    expect(r.ok).toBe(false)
  })

  it('fails an empty or crowdless sample — a green over nothing certifies nothing', () => {
    expect(judgeLabelFusion(null).ok).toBe(false)
    expect(judgeLabelFusion({ ...clean, samples: 0 }).ok).toBe(false)
    expect(judgeLabelFusion({ ...clean, labelsMin: 1, labelsMax: 1 }).ok).toBe(false)
  })

  it('demands the crowd HOLD through the whole sample, not peak in one frame (Sol review, 17.08.)', () => {
    // Two clean labels in the first frame, every label unmounted for the other
    // 89: a scene that HIDES labels instead of placing them must not pass.
    expect(judgeLabelFusion({ ...clean, labelsMin: 0, labelsMax: 19 }).ok).toBe(false)
  })

  it('fails a sampler that never reported the floor — peak alone is not a reading', () => {
    const { labelsMin: _dropped, ...peakOnly } = clean
    expect(judgeLabelFusion(peakOnly).ok).toBe(false)
  })

  it('lets a caller with a legitimate lone subject lower the floor to 1, never to 0', () => {
    expect(judgeLabelFusion({ ...clean, labelsMin: 1, labelsMax: 1 }, { minLabels: 1 }).ok).toBe(true)
    // minLabels: 0 is CLAMPED to 1 — an empty picture never passes any caller.
    expect(judgeLabelFusion({ ...clean, labelsMin: 0, labelsMax: 0 }, { minLabels: 0 }).ok).toBe(false)
  })
})

describe('mergeFusionReadings — the shutter is bracketed by two windows (Sol review, 17.08.)', () => {
  const pre = { samples: 45, fusedFrames: 1, deepFrames: 0, worstDepth: 8, worstPair: '"A"×"B" 10×8 px', labelsMin: 18, labelsMax: 20 }
  const post = { samples: 45, fusedFrames: 30, deepFrames: 20, worstDepth: 22, worstPair: '"C"×"D" 40×22 px', labelsMin: 17, labelsMax: 21 }

  it('sums the counts and keeps the deeper pair, the lower floor and the higher peak', () => {
    const m = mergeFusionReadings(pre, post)
    expect(m).toEqual({
      samples: 90,
      fusedFrames: 31,
      deepFrames: 20,
      worstDepth: 22,
      worstPair: '"C"×"D" 40×22 px',
      labelsMin: 17,
      labelsMax: 21,
    })
  })

  it('a fusion in EITHER window reaches the judge — the post-shutter one must not vanish', () => {
    expect(judgeLabelFusion(mergeFusionReadings({ ...clean, samples: 45 }, post)).ok).toBe(false)
    expect(judgeLabelFusion(mergeFusionReadings(post, { ...clean, samples: 45 })).ok).toBe(false)
  })

  it('refuses a merge with an empty or absent half, NAMING it — a bracket must not degrade to one window (Sol re-review)', () => {
    const noPre = judgeLabelFusion(mergeFusionReadings(null, post))
    expect(noPre.ok).toBe(false)
    expect(noPre.detail).toContain('pre-shutter')
    const noPost = judgeLabelFusion(mergeFusionReadings(pre, { samples: 0 }))
    expect(noPost.ok).toBe(false)
    expect(noPost.detail).toContain('post-shutter')
    const neither = judgeLabelFusion(mergeFusionReadings(null, null))
    expect(neither.ok).toBe(false)
    expect(neither.detail).toContain('both windows')
  })
})
