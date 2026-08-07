// The pure half of the DEV render-resource leak invariant (point 295): the
// signature, the bound/threshold decision and the settle state machine. The
// live half — that a forced leak really trips the assert and a normal session
// does not — is the browser gate in scripts/verify/settings.mjs.
import { describe, it, expect } from 'vitest'
import {
  LEAK_BOUNDS,
  SETTLE_POLICY,
  currentRenderSignature,
  evaluateReading,
  newWatch,
  renderSignature,
  stepWatch,
  type Baselines,
  type LeakCounts,
  type SignatureInput,
} from './renderLeak'
import { useUi } from '../state/ui'

const SIG: SignatureInput = {
  mode: 'travel',
  placeId: null,
  detailLevel: 'medium',
  traa: true,
  ssao: false,
  bloom: true,
  shadows: true,
  fireShadows: false,
}

const counts = (renderTargets: number, textures: number): LeakCounts => ({ renderTargets, textures })

describe('renderSignature', () => {
  it('is stable for the same state', () => {
    expect(renderSignature(SIG)).toBe(renderSignature({ ...SIG }))
  })

  it('separates every lever that legitimately changes the resident set', () => {
    const base = renderSignature(SIG)
    const variants: SignatureInput[] = [
      { ...SIG, mode: 'place', placeId: 'cairo' },
      { ...SIG, detailLevel: 'high' },
      { ...SIG, traa: false },
      { ...SIG, ssao: true },
      { ...SIG, bloom: false },
      { ...SIG, shadows: false },
      { ...SIG, fireShadows: true },
    ]
    for (const v of variants) expect(renderSignature(v)).not.toBe(base)
    expect(new Set(variants.map(renderSignature)).size).toBe(variants.length)
  })

  it('separates two settlements but ignores the place id while travelling', () => {
    // Settlements differ in campfires (shadow maps) and material sets, so they
    // must not share a baseline; in the bird's-eye view the id is stale noise.
    expect(renderSignature({ ...SIG, mode: 'place', placeId: 'cairo' })).not.toBe(
      renderSignature({ ...SIG, mode: 'place', placeId: 'zanzibar' }),
    )
    expect(renderSignature({ ...SIG, placeId: 'cairo' })).toBe(renderSignature({ ...SIG, placeId: null }))
  })
})

describe('currentRenderSignature', () => {
  it('follows the live render levers', () => {
    const before = currentRenderSignature()
    const level = useUi.getState().detailLevel
    useUi.getState().setDetailLevel(level === 'high' ? 'low' : 'high')
    expect(currentRenderSignature()).not.toBe(before)
    useUi.getState().setDetailLevel(level)
    expect(currentRenderSignature()).toBe(before)
  })
})

describe('evaluateReading', () => {
  const sig = 'travel|medium|traa/-/bloom/sun/-'

  it('records the first visit and judges nothing', () => {
    const r = evaluateReading({}, sig, counts(44, 300))
    expect(r.evaluation.verdict).toBe('baseline')
    expect(r.baselines[sig]).toEqual(counts(44, 300))
    expect(r.evaluation.delta).toEqual(counts(0, 0))
  })

  it('passes a return to the same state', () => {
    const base: Baselines = { [sig]: counts(44, 300) }
    expect(evaluateReading(base, sig, counts(44, 300)).evaluation.verdict).toBe('ok')
  })

  it('tolerates growth up to the render-target bound and fires one above it', () => {
    const base: Baselines = { [sig]: counts(44, 300) }
    const atBound = evaluateReading(base, sig, counts(44 + LEAK_BOUNDS.renderTargets, 300))
    expect(atBound.evaluation.verdict).toBe('ok')
    const over = evaluateReading(base, sig, counts(44 + LEAK_BOUNDS.renderTargets + 1, 300))
    expect(over.evaluation.verdict).toBe('leak')
    expect(over.evaluation.counter).toBe('renderTargets')
    expect(over.evaluation.detail).toContain('44 -> 47')
    expect(over.evaluation.detail).toContain(sig)
  })

  it('catches the point-276 class: three render targets per toggle cycle', () => {
    // The leak that hid behind one lucky settings.mjs check — 47 -> 50 across
    // toggle cycles. Three per cycle is already over the bound, so it reports
    // on the first return to the signature and keeps reporting after.
    let baselines: Baselines = {}
    let rt = 47
    const verdicts: string[] = []
    for (let cycle = 0; cycle < 3; cycle++) {
      const r = evaluateReading(baselines, sig, counts(rt, 300))
      baselines = r.baselines
      verdicts.push(r.evaluation.verdict)
      rt += 3
    }
    expect(verdicts).toEqual(['baseline', 'leak', 'leak'])
  })

  it('never lets a leak re-baseline itself away', () => {
    const base: Baselines = { [sig]: counts(44, 300) }
    const r = evaluateReading(base, sig, counts(60, 300))
    expect(r.evaluation.verdict).toBe('leak')
    expect(r.baselines[sig]).toEqual(counts(44, 300))
    // Still leaking on the next visit — the condition holds, so it keeps reporting.
    expect(evaluateReading(r.baselines, sig, counts(60, 300)).evaluation.verdict).toBe('leak')
  })

  it('keeps the render-target baseline where it started, up and down', () => {
    const base: Baselines = { [sig]: counts(44, 300) }
    // A momentary dip must not tighten the bar for good ...
    const dip = evaluateReading(base, sig, counts(42, 300))
    expect(dip.evaluation.verdict).toBe('ok')
    expect(dip.baselines[sig].renderTargets).toBe(44)
    // ... nor may a rise inside the tolerance raise it.
    const rise = evaluateReading(base, sig, counts(46, 300))
    expect(rise.baselines[sig].renderTargets).toBe(44)
  })

  it('ratchets the texture baseline so streamed content is not a leak', () => {
    // Terrain, flora and settlement materials keep arriving on later visits to
    // the same state, so the texture baseline follows them upward ...
    let baselines: Baselines = { [sig]: counts(44, 300) }
    for (const t of [340, 380, 420]) {
      const r = evaluateReading(baselines, sig, counts(44, t))
      expect(r.evaluation.verdict).toBe('ok')
      baselines = r.baselines
    }
    expect(baselines[sig].textures).toBe(420)
    // ... while a runaway in ONE step still fires.
    const runaway = evaluateReading(baselines, sig, counts(44, 420 + LEAK_BOUNDS.textures + 1))
    expect(runaway.evaluation.verdict).toBe('leak')
    expect(runaway.evaluation.counter).toBe('textures')
  })

  it('reports the render targets before the textures when both are over', () => {
    const base: Baselines = { [sig]: counts(44, 300) }
    const r = evaluateReading(base, sig, counts(80, 900))
    expect(r.evaluation.counter).toBe('renderTargets')
  })

  it('keeps a baseline per signature', () => {
    const a = 'travel|medium|traa/-/bloom/sun/-'
    const b = 'place:cairo|medium|traa/-/bloom/sun/fire'
    let baselines: Baselines = {}
    baselines = evaluateReading(baselines, a, counts(44, 300)).baselines
    baselines = evaluateReading(baselines, b, counts(70, 900)).baselines
    expect(evaluateReading(baselines, a, counts(44, 300)).evaluation.verdict).toBe('ok')
    expect(evaluateReading(baselines, b, counts(70, 900)).evaluation.verdict).toBe('ok')
    // The place reading must not be judged against the travel baseline.
    expect(evaluateReading(baselines, a, counts(70, 900)).evaluation.verdict).toBe('leak')
  })

  it('honours custom bounds', () => {
    const base: Baselines = { [sig]: counts(44, 300) }
    const r = evaluateReading(base, sig, counts(45, 300), { renderTargets: 0, textures: 0 })
    expect(r.evaluation.verdict).toBe('leak')
  })
})

describe('stepWatch', () => {
  const policy = SETTLE_POLICY
  /** Run the watch over a fixed reading sequence. */
  const run = (readings: Array<LeakCounts | null>) => {
    let w = newWatch('sig')
    for (const r of readings) {
      const step = stepWatch(w, r, policy)
      if (!step.watch) return step
      w = step.watch
    }
    return { watch: w }
  }

  it('waits the minimum frames even when the count never moves', () => {
    const steady = Array.from({ length: policy.minFrames - 1 }, () => counts(44, 300))
    expect(run(steady).watch).not.toBeNull()
    expect(run([...steady, counts(44, 300)]).settled).toEqual(counts(44, 300))
  })

  it('restarts the stability run when the render-target count moves', () => {
    // The mid-rebuild DIP that made point 334 report "+14 leaked": the new post
    // chain allocates only on the next rendered frame, so a moving count must
    // never be read as settled.
    const dip = [
      ...Array.from({ length: 8 }, () => counts(33, 300)),
      ...Array.from({ length: 3 }, () => counts(47, 300)),
    ]
    expect(run(dip).settled).toBeUndefined()
    const settled = run([...dip, ...Array.from({ length: 4 }, () => counts(47, 300))])
    expect(settled.settled).toEqual(counts(47, 300))
  })

  it('settles although the texture count keeps streaming upward', () => {
    let t = 300
    const readings = Array.from({ length: policy.minFrames + policy.stableFrames }, () => counts(44, (t += 7)))
    expect(run(readings).settled?.renderTargets).toBe(44)
  })

  it('gives up without judging when the count never settles', () => {
    let rt = 40
    const readings = Array.from({ length: policy.maxFrames }, () => counts(rt++, 300))
    const end = run(readings)
    expect(end.unsettled).toBe(true)
    expect(end.settled).toBeUndefined()
  })

  it('gives up without judging when there is no renderer at all', () => {
    const end = run(Array.from({ length: policy.maxFrames }, () => null))
    expect(end.unsettled).toBe(true)
    expect(end.settled).toBeUndefined()
  })

  it('a missing reading ages the watch but never settles it', () => {
    const readings = [
      ...Array.from({ length: policy.minFrames + policy.stableFrames }, () => counts(44, 300)),
    ]
    readings[readings.length - 1] = null
    const end = run(readings)
    // The frame before the null already settled it; drop that one to be sure a
    // null on its own cannot.
    const nulls = run(Array.from({ length: policy.minFrames + policy.stableFrames }, () => null))
    expect(nulls.settled).toBeUndefined()
    expect(end.settled).toBeDefined()
  })
})
