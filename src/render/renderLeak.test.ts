// The pure half of the DEV render-resource leak invariant (point 295): the
// signature, the bound/threshold decision and the settle state machine. The
// live half — that a forced leak really trips the assert and a normal session
// does not — is the browser gate in scripts/verify/settings.mjs.
import { describe, it, expect } from 'vitest'
import {
  LEAK_BOUNDS,
  PIPELINE_RETURN_BOUNDS,
  PIPELINE_RETURN_START,
  TEXTURE_RETURN_BOUNDS,
  SETTLE_POLICY,
  currentRenderSignature,
  evaluateReading,
  judgePipelineReturn,
  judgePlaceHop,
  textureCensus,
  PLACE_HOP_BOUNDS,
  PLACE_HOP_START,
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
  panoramaCaptured: false,
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
      { ...SIG, panoramaCaptured: true },
    ]
    for (const v of variants) expect(renderSignature(v)).not.toBe(base)
    expect(new Set(variants.map(renderSignature)).size).toBe(variants.length)
  })

  it('separates a settlement seen before any capture from the same one seen after (point 545)', () => {
    // The capture takes its two targets on the FIRST shot and keeps them, so a
    // settlement entered directly (no capture yet) legitimately holds fewer
    // render targets than the same settlement entered from the travel scene.
    // Sharing one baseline made every later visit read as a permanent leak.
    const before = renderSignature({ ...SIG, mode: 'place', placeId: 'maasai-village' })
    const after = renderSignature({ ...SIG, mode: 'place', placeId: 'maasai-village', panoramaCaptured: true })
    expect(before).not.toBe(after)
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
  /** A signature that has finished forming its baseline. */
  const warm = (c: LeakCounts): Baselines => ({ [sig]: { ...c, visits: 2, textureMark: c.textures } })

  it('records the first visit and judges nothing', () => {
    const r = evaluateReading({}, sig, counts(44, 300))
    expect(r.evaluation.verdict).toBe('baseline')
    expect(r.baselines[sig]).toEqual({ ...counts(44, 300), visits: 1, textureMark: 300 })
    expect(r.evaluation.delta).toEqual(counts(0, 0))
  })

  it('forms the baseline from the high-water mark of the warm-up visits', () => {
    // The measured false positive: the first settled reading after entering a
    // settlement lands while the place is still building (Cairo 18/39 against a
    // steady 22/58), so the SECOND reading must be able to raise the bar — and
    // only after that is anything judged.
    let baselines: Baselines = {}
    const seen: string[] = []
    for (const c of [counts(18, 39), counts(22, 58), counts(22, 59), counts(22, 59)]) {
      const r = evaluateReading(baselines, sig, c)
      baselines = r.baselines
      seen.push(r.evaluation.verdict)
    }
    expect(seen).toEqual(['baseline', 'baseline', 'ok', 'ok'])
    expect(baselines[sig].renderTargets).toBe(22)
  })

  it('passes a return to the same state', () => {
    expect(evaluateReading(warm(counts(44, 300)), sig, counts(44, 300)).evaluation.verdict).toBe('ok')
  })

  it('tolerates growth up to the render-target bound and fires one above it', () => {
    const base = warm(counts(44, 300))
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
    // toggle cycles. The warm-up swallows the first growth step; from the first
    // JUDGED reading on it screams and never stops.
    let baselines: Baselines = {}
    let rt = 47
    const verdicts: string[] = []
    for (let cycle = 0; cycle < 5; cycle++) {
      const r = evaluateReading(baselines, sig, counts(rt, 300))
      baselines = r.baselines
      verdicts.push(r.evaluation.verdict)
      rt += 3
    }
    expect(verdicts).toEqual(['baseline', 'baseline', 'leak', 'leak', 'leak'])
  })

  it('never lets a leak re-baseline itself away', () => {
    const r = evaluateReading(warm(counts(44, 300)), sig, counts(60, 300))
    expect(r.evaluation.verdict).toBe('leak')
    expect(r.baselines[sig].renderTargets).toBe(44)
    expect(r.baselines[sig].textures).toBe(300)
    // Still leaking on the next visit — the condition holds, so it keeps reporting.
    expect(evaluateReading(r.baselines, sig, counts(60, 300)).evaluation.verdict).toBe('leak')
  })

  it('keeps the render-target baseline where it started, up and down', () => {
    const base = warm(counts(44, 300))
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
    let baselines: Baselines = warm(counts(44, 300))
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

  it('bounds the total texture drift, so the ratchet cannot hide a slow leak', () => {
    // A leak too small for the per-step bound would otherwise raise its own bar
    // on every visit and never report.
    let baselines: Baselines = warm(counts(44, 300))
    const verdicts: string[] = []
    for (let step = 1; step <= 7; step++) {
      const r = evaluateReading(baselines, sig, counts(44, 300 + step * (LEAK_BOUNDS.textures / 2)))
      baselines = r.baselines
      verdicts.push(r.evaluation.verdict)
    }
    expect(verdicts.slice(0, 6)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok'])
    expect(verdicts[6]).toBe('leak')
    // The drift is measured from where the WARM-UP left the baseline, not from
    // the ratcheted value it kept raising.
    expect(baselines[sig].textureMark).toBe(300)
  })

  it('reports the render targets before the textures when both are over', () => {
    const r = evaluateReading(warm(counts(44, 300)), sig, counts(80, 900))
    expect(r.evaluation.counter).toBe('renderTargets')
  })

  it('keeps a baseline per signature', () => {
    const a = 'travel|medium|traa/-/bloom/sun/-'
    const b = 'place:cairo|medium|traa/-/bloom/sun/fire'
    let baselines: Baselines = {}
    for (let i = 0; i < 2; i++) {
      baselines = evaluateReading(baselines, a, counts(44, 300)).baselines
      baselines = evaluateReading(baselines, b, counts(70, 900)).baselines
    }
    expect(evaluateReading(baselines, a, counts(44, 300)).evaluation.verdict).toBe('ok')
    expect(evaluateReading(baselines, b, counts(70, 900)).evaluation.verdict).toBe('ok')
    // The place reading must not be judged against the travel baseline.
    expect(evaluateReading(baselines, a, counts(70, 900)).evaluation.verdict).toBe('leak')
  })

  it('honours custom bounds and warm-up length', () => {
    const r = evaluateReading(warm(counts(44, 300)), sig, counts(45, 300), { renderTargets: 0, textures: 0 })
    expect(r.evaluation.verdict).toBe('leak')
    // A longer warm-up keeps recording instead of judging.
    const later = evaluateReading(warm(counts(44, 300)), sig, counts(99, 300), LEAK_BOUNDS, 5)
    expect(later.evaluation.verdict).toBe('baseline')
    expect(later.baselines[sig].renderTargets).toBe(99)
  })
})

describe('stepWatch', () => {
  const policy = SETTLE_POLICY
  /** Run the watch over a fixed reading sequence. */
  const run = (readings: Array<LeakCounts | null>) => {
    let w = newWatch('sig')
    let settled: LeakCounts | undefined
    for (const r of readings) {
      const step = stepWatch(w, r, policy)
      settled ??= step.settled
      if (!step.watch) return { ...step, settled }
      w = step.watch
    }
    return { watch: w, settled }
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
      ...Array.from({ length: policy.stableFrames - 1 }, () => counts(33, 300)),
      ...Array.from({ length: policy.stableFrames - 1 }, () => counts(47, 300)),
    ]
    expect(run(dip).settled).toBeUndefined()
    const settled = run([...dip, counts(47, 300), counts(47, 300)])
    expect(settled.settled).toEqual(counts(47, 300))
  })

  it('settles although the texture count keeps streaming upward', () => {
    let t = 300
    const readings = Array.from({ length: policy.minFrames + policy.stableFrames }, () => counts(44, (t += 7)))
    expect(run(readings).settled?.renderTargets).toBe(44)
  })

  it('reports the texture-settled reading only once the texture count repeats too', () => {
    // The return and hop judgements compare textures across states, so they
    // wait past the render-target settle while a place's textures still climb.
    let t = 300
    const climbing = Array.from({ length: policy.minFrames + 10 }, () => counts(44, (t += 1)))
    const steady = Array.from({ length: policy.stableFrames + 1 }, () => counts(44, t))
    const end = run([...climbing, ...steady])
    expect(end.settled).toEqual(counts(44, 300 + policy.minFrames))
    expect(end.texturesSettled).toEqual(counts(44, t))
    expect(run(climbing).texturesSettled).toBeUndefined()
    // steady from the start: both on the same frame
    const both = run(Array.from({ length: policy.minFrames }, () => counts(44, 300)))
    expect(both.settled).toEqual(counts(44, 300))
    expect(both.texturesSettled).toEqual(counts(44, 300))
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
    // A torn-down canvas hands back nothing; the watch may age towards its
    // give-up point on that, but it must never call a missing reading settled.
    const blind: Array<LeakCounts | null> = Array.from(
      { length: policy.minFrames + policy.stableFrames },
      () => null,
    )
    expect(run(blind).settled).toBeUndefined()
    // Only real readings can settle it, and a gap does not throw away the
    // stability already earned: once the renderer answers again, the watch
    // finishes on the readings it actually got.
    const afterGap = [...blind, ...Array.from({ length: policy.stableFrames + 1 }, () => counts(44, 300))]
    expect(run(afterGap).settled).toEqual(counts(44, 300))
    expect(run(afterGap.slice(0, -1)).settled).toBeUndefined()
  })
})

describe('pipeline return after a place visit', () => {
  const bounds = { step: 10, total: 25 }

  it('passes a visit that returns to the entry reading or near it', () => {
    const r = judgePipelineReturn(PIPELINE_RETURN_START, 64, 66, bounds)
    expect(r.evaluation.verdict).toBe('ok')
    expect(r.evaluation.delta).toBe(2)
    expect(r.state).toEqual({ visits: 1, growth: 2 })
  })

  it('flags one visit that leaves more than the step bound behind', () => {
    const r = judgePipelineReturn(PIPELINE_RETURN_START, 64, 104, bounds)
    expect(r.evaluation.verdict).toBe('leak')
    expect(r.evaluation.detail).toMatch(/64 -> 104/)
  })

  it('flags a leak too small per visit once it grows with the villages visited', () => {
    let state = PIPELINE_RETURN_START
    let entry = 64
    const verdicts: string[] = []
    for (let i = 0; i < 5; i++) {
      const r = judgePipelineReturn(state, entry, entry + 6, bounds)
      state = r.state
      entry += 6
      verdicts.push(r.evaluation.verdict)
    }
    expect(verdicts).toEqual(['ok', 'ok', 'ok', 'ok', 'leak'])
    expect(state.growth).toBe(30)
  })

  it('lets noise cancel and never carries a negative balance', () => {
    let { state } = judgePipelineReturn(PIPELINE_RETURN_START, 70, 60, bounds)
    expect(state.growth).toBe(0)
    ;({ state } = judgePipelineReturn(state, 60, 68, bounds))
    ;({ state } = judgePipelineReturn(state, 68, 61, bounds))
    expect(state).toEqual({ visits: 3, growth: 1 })
  })

  it('reproduces the measured unreleased growth (~40 per village) as a leak under the default bounds', () => {
    expect(judgePipelineReturn(PIPELINE_RETURN_START, 64, 104).evaluation.verdict).toBe('leak')
    expect(PIPELINE_RETURN_BOUNDS.step).toBeLessThan(40)
  })
})

describe('texture return after a place visit', () => {
  it('reproduces the measured ~3-4 textures per village as a leak within a few villages', () => {
    let state = PIPELINE_RETURN_START
    let entry = 75
    const verdicts: string[] = []
    for (let i = 0; i < 8; i++) {
      const r = judgePipelineReturn(state, entry, entry + 3.5, TEXTURE_RETURN_BOUNDS, 'textures')
      state = r.state
      entry += 3.5
      verdicts.push(r.evaluation.verdict)
      if (r.evaluation.verdict === 'leak') expect(r.evaluation.detail).toMatch(/^textures after place visit/)
    }
    expect(verdicts.slice(0, 6)).toEqual(Array(6).fill('ok'))
    expect(verdicts[7]).toBe('leak')
  })

  it('passes a released place whose textures come back to the entry count', () => {
    let state = PIPELINE_RETURN_START
    for (const back of [76, 74, 75, 77, 75]) {
      const r = judgePipelineReturn(state, 75, back, TEXTURE_RETURN_BOUNDS, 'textures')
      state = r.state
      expect(r.evaluation.verdict).toBe('ok')
    }
  })
})

describe('place-to-place hop', () => {
  const at = (placeId: string, textures: number | null, pipelines: number | null = 100) => ({ placeId, textures, pipelines })

  it('judges nothing on the first settlement of a chain or a re-settle of the same one', () => {
    let r = judgePlaceHop(PLACE_HOP_START, at('a', 60))
    expect(r.evaluation).toBeNull()
    r = judgePlaceHop(r.state, at('a', 64))
    expect(r.evaluation).toBeNull()
    expect(r.state.last).toEqual(at('a', 64))
  })

  it('reports the measured ~7 textures per village hop without tripping: that leg belongs to point 1566', () => {
    let state = judgePlaceHop(PLACE_HOP_START, at('v0', 57)).state
    for (let i = 1; i <= 8; i++) {
      const r = judgePlaceHop(state, at(`v${i}`, 57 + 7 * i))
      state = r.state
      expect(r.evaluation!.verdict).toBe('ok')
      expect(r.evaluation!.detail).toMatch(/textures \d+ -> \d+ \(\+7/)
    }
    expect(state.growth.textures).toBe(56)
  })

  it('reproduces the measured ~40 pipelines per village hop as a leak within a few villages', () => {
    let state = judgePlaceHop(PLACE_HOP_START, at('v0', 60, 64)).state
    const verdicts: string[] = []
    for (let i = 1; i <= 5; i++) {
      const r = judgePlaceHop(state, at(`v${i}`, 60, 64 + 40 * i))
      state = r.state
      verdicts.push(r.evaluation!.verdict)
      if (r.evaluation!.verdict === 'leak') {
        expect(r.evaluation!.counter).toBe('pipelines')
        expect(r.evaluation!.detail).toMatch(/grow with the villages visited/)
      }
    }
    expect(verdicts.slice(0, 3)).toEqual(Array(3).fill('ok'))
    expect(verdicts[3]).toBe('leak')
  })

  it('lets village differences cancel, flooring the net growth at zero', () => {
    let state = judgePlaceHop(PLACE_HOP_START, at('a', 60)).state
    for (const [id, t] of [['b', 75], ['c', 52], ['d', 70], ['e', 58], ['f', 72], ['g', 61]] as const) {
      const r = judgePlaceHop(state, at(id, t))
      state = r.state
      expect(r.evaluation!.verdict).toBe('ok')
    }
    expect(state.growth.textures).toBeLessThanOrEqual(PLACE_HOP_BOUNDS.textures.total)
  })

  it('flags one hop over the step bound, on pipelines too', () => {
    const s = judgePlaceHop(PLACE_HOP_START, at('a', 60, 100)).state
    const r = judgePlaceHop(s, at('b', 60, 100 + PLACE_HOP_BOUNDS.pipelines.step + 1))
    expect(r.evaluation!.verdict).toBe('leak')
    expect(r.evaluation!.counter).toBe('pipelines')
    expect(r.evaluation!.detail).toMatch(/one hop left its pipelines behind/)
  })

  it('fails soft on an unreadable counter', () => {
    const s = judgePlaceHop(PLACE_HOP_START, at('a', null, null)).state
    const r = judgePlaceHop(s, at('b', 500, 900))
    expect(r.evaluation!.verdict).toBe('ok')
    expect(r.evaluation!.delta).toEqual({ pipelines: null, textures: null })
    expect(r.state.growth).toEqual({ pipelines: 0, textures: 0 })
  })
})

describe('texture census', () => {
  it('groups resident textures by kind, skips attributes and reports the change since the last census', async () => {
    const THREE = await import('three/webgpu')
    const morph = () => new THREE.DataArrayTexture(new Uint8Array(4 * 2 * 2 * 3), 2, 2, 3)
    const rt = new THREE.RenderTarget(8, 8)
    rt.texture.name = 'shadow'
    const map = new Map<object, unknown>([
      [morph(), 48],
      [morph(), 48],
      [rt.texture, 256],
      [new THREE.BufferAttribute(new Float32Array(3), 3), { size: 12, type: 'attributes' }],
    ])
    const first = textureCensus(map)
    expect(first.find((k) => k.kind === 'DataArrayTexture [array] 2x2x3')).toEqual({ kind: 'DataArrayTexture [array] 2x2x3', count: 2, bytes: 96, delta: 0 })
    expect(first.find((k) => k.kind.includes('"shadow"'))?.kind).toMatch(/\[rt\] 8x8/)
    expect(first.reduce((n, k) => n + k.count, 0)).toBe(3)
    map.set(morph(), 48)
    map.delete(rt.texture)
    const next = textureCensus(map, new Map(first.map((k) => [k.kind, k.count])))
    expect(next[0]).toMatchObject({ kind: 'DataArrayTexture [array] 2x2x3', count: 3, delta: 1 })
    expect(next.find((k) => k.kind.includes('"shadow"'))).toMatchObject({ count: 0, delta: -1 })
  })
})
