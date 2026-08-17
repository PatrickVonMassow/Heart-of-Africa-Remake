// The no-fusion bar (point 628), pinned in the fast layer: what the sampled
// series may show and what it must red on. The page-side sampler only counts;
// THIS is where the judgment lives.
import { describe, expect, it } from 'vitest'
import { FUSE_HARD, FUSE_MAX_SHARE, FUSE_TOLERANCE, judgeLabelFusion } from './labelFusion.mjs'

const clean = { samples: 90, fusedFrames: 0, worstDepth: 0, worstPair: null, labelsMax: 19 }

describe('judgeLabelFusion (point 628)', () => {
  it('passes a clean crowd', () => {
    expect(judgeLabelFusion(clean).ok).toBe(true)
  })

  it('fails a STANDING fusion — the reported "Villager llager" class holds in most frames', () => {
    const r = judgeLabelFusion({ ...clean, fusedFrames: 80, worstDepth: 14, worstPair: '"Villager"×"Villager" 40×14 px' })
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('80/90')
  })

  it('fails ONE deep fusion even in a single frame', () => {
    const r = judgeLabelFusion({ ...clean, fusedFrames: 1, worstDepth: FUSE_HARD + 1 })
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
    expect(judgeLabelFusion({ ...clean, labelsMax: 1 }).ok).toBe(false)
  })

  it('lets a caller with a legitimate lone subject lower the floor to 1, never to 0', () => {
    expect(judgeLabelFusion({ ...clean, labelsMax: 1 }, { minLabels: 1 }).ok).toBe(true)
    expect(judgeLabelFusion({ ...clean, labelsMax: 0 }, { minLabels: 1 }).ok).toBe(false)
  })
})
