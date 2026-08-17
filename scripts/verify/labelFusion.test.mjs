// The no-fusion bar (point 628), pinned in the fast layer: what the sampled
// series may show and what it must red on. The page-side sampler only counts;
// THIS is where the judgment lives.
import { describe, expect, it } from 'vitest'
import { FUSE_HARD, FUSE_MAX_SHARE, FUSE_TOLERANCE, judgeLabelFusion, mergeFusionReadings } from './labelFusion.mjs'

const clean = { samples: 90, fusedFrames: 0, worstDepth: 0, worstPair: null, labelsMin: 19, labelsMax: 19 }

describe('judgeLabelFusion (point 628)', () => {
  it('passes a clean crowd', () => {
    expect(judgeLabelFusion(clean).ok).toBe(true)
  })

  it('fails a STANDING fusion — the reported "Villager llager" class holds in most frames', () => {
    const r = judgeLabelFusion({ ...clean, fusedFrames: 80, worstDepth: 14, worstPair: '"Villager"×"Villager" 40×14 px' })
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('80/90')
  })

  it('fails ONE fusion AS DEEP AS the unreadable bar, even in a single frame', () => {
    const r = judgeLabelFusion({ ...clean, fusedFrames: 1, worstDepth: FUSE_HARD })
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('unreadable')
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
  const pre = { samples: 45, fusedFrames: 1, worstDepth: 8, worstPair: '"A"×"B" 10×8 px', labelsMin: 18, labelsMax: 20 }
  const post = { samples: 45, fusedFrames: 3, worstDepth: 22, worstPair: '"C"×"D" 40×22 px', labelsMin: 17, labelsMax: 21 }

  it('sums the counts and keeps the deeper pair, the lower floor and the higher peak', () => {
    const m = mergeFusionReadings(pre, post)
    expect(m).toEqual({ samples: 90, fusedFrames: 4, worstDepth: 22, worstPair: '"C"×"D" 40×22 px', labelsMin: 17, labelsMax: 21 })
  })

  it('a fusion in EITHER window reaches the judge — the post-shutter one must not vanish', () => {
    expect(judgeLabelFusion(mergeFusionReadings({ ...clean, samples: 45 }, post)).ok).toBe(false)
    expect(judgeLabelFusion(mergeFusionReadings(post, { ...clean, samples: 45 })).ok).toBe(false)
  })

  it('an empty window degrades to the other rather than diluting it', () => {
    expect(mergeFusionReadings(null, post)).toEqual(post)
    expect(mergeFusionReadings(pre, { samples: 0 })).toEqual(pre)
    expect(judgeLabelFusion(mergeFusionReadings(null, null)).ok).toBe(false)
  })
})
