// DEV render-resource leak invariant (point 295) — the in-game-assert principle
// (src/systems/devAssert.ts) applied to GPU resources.
//
// WHY. The point-276 TRAA leak grew the WebGPU render-target set by 3 per toggle
// cycle and was caught only because ONE check in scripts/verify/settings.mjs
// happened to look at renderer.info at the right moment. Every other suite and
// every manual session ran straight past it. This watch turns the same reading
// into a standing invariant: whenever the renderer RETURNS to a state it has
// held before, its resident render-target count must not have grown — else
// console.error + a probe-log entry, in every dev session and every headless
// suite (whose console-error gates fail on it).
//
// THE RULE IS "same state, same cost", not "the counts never move". A place
// scene legitimately holds more than the bird's-eye view, and the high detail
// level more than the low one, so every reading is filed under a SIGNATURE of
// the levers that legitimately change the resident set, and compared only
// against an earlier reading of that same signature.
//
// STRICT ON RENDER TARGETS, COARSE ON TEXTURES. Render targets are allocated by
// the post pipeline (src/render/Effects.tsx), the shadow maps (each scene's own,
// freed when it is left — the bird's-eye sun is a singleton and needs
// src/render/shadowRelease.ts to do it, point 546) and the panorama
// capture's two targets (src/scenes/travel/panoramaCapture.ts, allocated on the
// first capture and kept for the session, so a settlement visit adds none) —
// a bounded set that content never inflates, so a rise of more than
// LEAK_BOUNDS.renderTargets is a real leak.
// Plain TEXTURES stream in with terrain, flora and settlement materials for as
// long as the player explores, so a strict bound there would be a false-positive
// machine; the texture half is a coarse RUNAWAY net (one transition may not add
// more than LEAK_BOUNDS.textures) whose baseline ratchets up with legitimate
// streaming.
//
// MEASURED AT A SETTLED STATE. A pipeline rebuild frees the old chain at commit
// but allocates the new one's targets only on the next RENDERED frame; read in
// that window the count sits in a DIP with the whole post chain missing — the
// trap that produced point 334's false "+14 leaked". So the watch samples on
// requestAnimationFrame and waits for the render-target count to repeat before
// it judges. A reading that does not settle within the frame budget is
// recorded and DROPPED, never asserted; a page that stops producing animation
// frames altogether leaves its watch pending and judges nothing. Fail-soft on
// an environment stall, fail-loud only on a product bug.
//
// DEV only — the whole module is behind import.meta.env.DEV and is imported
// dynamically from src/App.tsx, so it is absent from the shipped bundle.

import * as THREE from 'three/webgpu'
import { devAssert } from '../systems/devAssert'
import { getRenderContext } from './renderContext'
import { panoramaCaptureTargetsAllocated } from '../scenes/travel/panoramaCapture'
import { useGame } from '../state/store'
import { currentPlaceVisit } from '../state/placeVisit'
import {
  useUi,
  effectiveTraa,
  effectiveSsao,
  effectiveBloom,
  effectiveShadows,
  effectiveFireShadows,
} from '../state/ui'

/** The two renderer.info.memory counters this invariant watches. */
export interface LeakCounts {
  renderTargets: number
  textures: number
}

/** How much a counter may grow across a return to the SAME signature.
 *  Calibratable dev-only thresholds (not gameplay balance values):
 *  - renderTargets: the post chain rebuild is deterministic, and the panorama
 *    capture keeps its two targets rather than allocating per shot, so anything
 *    above a couple is a leak.
 *  - textures: one transition may legitimately bring a whole settlement's
 *    material set with it; measured worst legitimate step is far below this. */
export const LEAK_BOUNDS: LeakCounts = { renderTargets: 2, textures: 96 }

// --- Pipeline return (point 1447) ---------------------------------------------
// The render-target/texture watch above compares a state with ITSELF, and each
// settlement is its own signature — so a place that left its pipelines behind
// (three frees a render object, and so its pipeline, only when its material is
// disposed) was never judged. This half compares the renderer's cached pipeline
// count (`renderer._pipelines.caches.size`) on RETURNING to the bird's-eye view
// with the reading taken the moment the player left it for the place.

/** Calibratable dev-only bounds (not gameplay balance values) on the pipelines
 *  a settlement visit may leave behind once the bird's-eye view has settled:
 *  - step: one visit's net growth. The unreleased place scene grew ~40 per
 *    village (point 1446 measurement, 25.10.2026); a released one returns
 *    near zero, the bird's-eye streaming a few around the return.
 *  - total: the net growth summed over all visits, so a leak too small for one
 *    step still trips once it grows with the number of villages visited. */
export const PIPELINE_RETURN_BOUNDS = { step: 24, total: 72 }

export type PipelineReturnBounds = typeof PIPELINE_RETURN_BOUNDS

/** The same judgement on `renderer.info.memory.textures`. Calibratable,
 *  dev-only: an unreleased place left ~3-4 textures per village (owner
 *  measurement 21.11.2026, 75 -> 115 over 12 villages); a step of 8 passes
 *  return noise, a total of 24 trips a steady leak within a few villages. */
export const TEXTURE_RETURN_BOUNDS: PipelineReturnBounds = { step: 8, total: 24 }

export interface PipelineReturnState {
  /** Visits judged so far. */
  visits: number
  /** Net pipeline growth summed over the judged visits, floored at zero. */
  growth: number
}

export const PIPELINE_RETURN_START: PipelineReturnState = { visits: 0, growth: 0 }

export interface PipelineReturnEvaluation {
  verdict: 'ok' | 'leak'
  /** Pipelines on leaving the bird's-eye view, and on its settled return. */
  entry: number
  back: number
  delta: number
  detail: string
}

/** Judge one return to the bird's-eye view against the reading at entry. Pure. */
export function judgePipelineReturn(
  state: PipelineReturnState,
  entry: number,
  back: number,
  bounds: PipelineReturnBounds = PIPELINE_RETURN_BOUNDS,
  what: 'pipelines' | 'textures' = 'pipelines',
): { evaluation: PipelineReturnEvaluation; state: PipelineReturnState } {
  const delta = back - entry
  const next: PipelineReturnState = { visits: state.visits + 1, growth: Math.max(0, state.growth + delta) }
  const overStep = delta > bounds.step
  const overTotal = next.growth > bounds.total
  const verdict = overStep || overTotal ? 'leak' : 'ok'
  const detail =
    `${what} after place visit ${next.visits}: ${entry} -> ${back} (${delta >= 0 ? '+' : ''}${delta}, ` +
    `allowed +${bounds.step}); net growth over all visits ${next.growth} (allowed ${bounds.total})` +
    (verdict === 'leak' ? (overStep ? ` — one visit left its ${what} behind` : ` — ${what} grow with the villages visited`) : '')
  return { evaluation: { verdict, entry, back, delta, detail }, state: next }
}

// --- Place-to-place hop (point 1447) -------------------------------------------
// The return judgement above needs the bird's-eye view in between. A walk from
// one settlement straight into the next (leavePlace + enterPlace in one tick —
// the villager-dress suite's goToPlace, or a save loaded inside a place) never
// settles in travel, so it was judged by nothing while the owner measured ~7
// textures per village. This half compares each place's settled reading with
// the previous place's, and bounds the net growth over consecutive hops.

/** Calibratable dev-only bounds (not gameplay balance values) on the growth
 *  from one settled settlement to the next one entered without travel between:
 *  - step: one hop. Two villages legitimately differ (fires, materials, the
 *    figures' morph textures), and the first settled reading can land while a
 *    place still builds, so the step is generous. Measured 21.11.2026 (seed 42,
 *    WebGPU, fresh boot): bambara-village settles at 103-104 pipelines whether
 *    entered after zulu-village (78) or after giza (40), so the small port city
 *    before it makes a legitimate +63 hop; 72 leaves that margin.
 *  - total: the net growth summed over the hops, floored at zero, so village
 *    differences cancel while a steady leak (~7 textures per village, owner
 *    measurement 21.11.2026) trips within about seven villages. */
export type PlaceHopBounds = { pipelines: PipelineReturnBounds; textures: PipelineReturnBounds }

export const PLACE_HOP_BOUNDS: PlaceHopBounds = {
  pipelines: { step: 72, total: 120 },
  textures: { step: 24, total: 48 },
}

/** One settled reading inside a settlement; a null counter is unreadable. */
export interface PlaceHopReading {
  placeId: string
  /** The entry count (state/placeVisit.ts): a leave and re-entry of the same
   *  place is a new visit and a hop; absent, a same-place reading re-settles. */
  visit?: number
  /** The render setup the reading was taken under (the signature without its
   *  place: detail level and post/shadow flags). Absent, setups are not compared. */
  setup?: string
  pipelines: number | null
  textures: number | null
}

type HopCounter = 'pipelines' | 'textures'

/** One render setup's hop chain: its last usable reading per counter and the
 *  net growth summed over its judged hops, floored at zero. */
export interface PlaceHopChain {
  last: PlaceHopReading
  growth: { pipelines: number; textures: number }
  /** Per counter, when `last` CARRIES an older usable value across hops whose
   *  own reading was unreadable: the place it was read in and the hops it now
   *  spans. Absent, the value is the reading of `last` itself. */
  carried?: Partial<Record<HopCounter, { from: string; hops: number }>>
}

export interface PlaceHopState {
  /** The hop chain of each render setup seen since the bird's-eye view last
   *  settled (a chain needs no travel between; a settled bird's-eye reading
   *  clears them all). A reading is compared only with the previous reading of
   *  its own setup, so alternating setups cannot hide growth and growth never
   *  carries from one setup into another. Readings without a setup share ''. */
  chains: Record<string, PlaceHopChain>
  hops: number
}

export const PLACE_HOP_START: PlaceHopState = { chains: {}, hops: 0 }

export interface PlaceHopEvaluation {
  verdict: 'ok' | 'leak'
  from: string
  to: string
  /** Per counter: the change across this hop (null when either side is unreadable). */
  delta: { pipelines: number | null; textures: number | null }
  counter?: 'pipelines' | 'textures'
  detail: string
  /** The census kinds that grew across this hop (filled by the live watch). */
  grew?: string
  /** The visit (state/placeVisit.ts) of the reading judged, so a caller can
   *  name the hop by when it started rather than when its verdict appeared. */
  visit?: number
}

/**
 * Judge one settled settlement reading against the previous reading of the same
 * render setup, pure. A reading of the SAME place and visit (a settings toggle
 * re-settling it) only updates its setup's last reading; the first reading of a
 * setup's chain judges nothing.
 *
 * An unreadable (null) counter never replaces the last usable reading: the
 * older value is CARRIED under the new visit and marked as such. The next usable
 * reading of that counter is judged against the carried value — a same-visit
 * re-settle too, so a hop left while shaders compiled cannot hide its growth.
 * A delta spanning n hops is bounded by n × step (n legitimate hops may each
 * differ by up to a step); the total bound applies unchanged.
 */
export function judgePlaceHop(
  state: PlaceHopState,
  reading: PlaceHopReading,
  bounds: PlaceHopBounds = PLACE_HOP_BOUNDS,
  judgePipelines = true,
): { evaluation: PlaceHopEvaluation | null; state: PlaceHopState } {
  // Like for like only: another detail level or post/shadow setup holds another
  // resident set (a low-detail reading drew fewer figures at a smaller target;
  // polish-settlement rain-depth's low/medium/high sweep, point 1566).
  const key = reading.setup ?? ''
  const chain = state.chains[key]
  const prev = chain?.last
  const growth0 = chain?.growth ?? { pipelines: 0, textures: 0 }
  const sameVisit = !!prev && prev.placeId === reading.placeId && prev.visit === reading.visit
  const counters = ['pipelines', 'textures'] as const
  const last: PlaceHopReading = { ...reading }
  const carried: NonNullable<PlaceHopChain['carried']> = {}
  const delta: Record<HopCounter, number | null> = { pipelines: null, textures: null }
  const spanned: Record<HopCounter, number> = { pipelines: 1, textures: 1 }
  const from: Record<HopCounter, string> = { pipelines: prev?.placeId ?? '', textures: prev?.placeId ?? '' }
  for (const c of counters) {
    const was = prev?.[c] ?? null
    const carry = chain?.carried?.[c]
    if (reading[c] === null) {
      last[c] = was
      // a new hop widens the carry; a same-visit re-settle keeps it as it was
      if (was !== null) carried[c] = carry ? { ...carry, hops: carry.hops + (sameVisit ? 0 : 1) } : sameVisit ? undefined : { from: prev!.placeId, hops: 1 }
      if (!carried[c]) delete carried[c]
      continue
    }
    if (was === null || (sameVisit && !carry)) continue
    delta[c] = reading[c]! - was
    spanned[c] = carry ? carry.hops + (sameVisit ? 0 : 1) : 1
    from[c] = carry?.from ?? prev!.placeId
  }
  const judged = counters.some((c) => delta[c] !== null)
  if (!prev || (sameVisit && !judged)) {
    return { evaluation: null, state: { ...state, chains: { ...state.chains, [key]: { last, growth: growth0, carried } } } }
  }
  const growth = {
    pipelines: delta.pipelines === null ? growth0.pipelines : Math.max(0, growth0.pipelines + delta.pipelines),
    textures: delta.textures === null ? growth0.textures : Math.max(0, growth0.textures + delta.textures),
  }
  // a deferred judgement of a same-visit re-settle belongs to the hop already counted
  const hops = sameVisit ? state.hops : state.hops + 1
  const step = (c: HopCounter) => bounds[c].step * spanned[c]
  let counter: HopCounter | undefined
  let why = ''
  // The textures leg judges on both backends (the figures' morph textures are
  // released by the place sweep since point 1566). `judgePipelines` false
  // (WebGL 2) only reports the pipelines leg: its count still drifts ~2 per hop
  // there (polish-settlement 21.11.2026, 238 -> 269 over 23 hops), which point
  // 1570 owns; WebGPU stays bounded and judged.
  for (const c of judgePipelines ? (['textures', 'pipelines'] as const) : (['textures'] as const)) {
    const d = delta[c]
    if (d === null || counter) continue
    if (d > step(c)) {
      counter = c
      why = ` — one hop left its ${c} behind`
    } else if (growth[c] > bounds[c].total) {
      counter = c
      why = ` — ${c} grow with the villages visited`
    }
  }
  const part = (c: HopCounter) => {
    const d = delta[c]
    if (d === null) return `${c} unreadable`
    const over = spanned[c] > 1 ? ` over ${spanned[c]} hops from ${from[c]}` : ''
    return `${c} ${reading[c]! - d} -> ${reading[c]} (${d >= 0 ? '+' : ''}${d}, allowed +${step(c)}${over}; net ${growth[c]}, allowed ${bounds[c].total})`
  }
  // the place the judged value was read in (a carried one names its own)
  const origin = delta.textures !== null ? from.textures : delta.pipelines !== null ? from.pipelines : prev.placeId
  const detail = `place hop ${hops} ${origin} -> ${reading.placeId}: ${part('textures')}; ${part('pipelines')}${why}`
  return {
    evaluation: { verdict: counter ? 'leak' : 'ok', from: origin, to: reading.placeId, delta, counter, detail, visit: reading.visit },
    state: { hops, chains: { ...state.chains, [key]: { last, growth, carried } } },
  }
}

// --- Texture census (DEV probe, point 1447) -----------------------------------
// The counters say HOW MANY textures stay resident, not WHICH. This groups the
// textures the renderer holds (`renderer.info.memoryMap`, three internals) by
// kind, so a texture that outlives its settlement shows up as a kind whose count
// grows from one village to the next: `console.table(__renderLeak.textureKinds())`.

type CensusTexture = {
  isTexture?: boolean
  constructor?: { name?: string }
  name?: string
  image?: { width?: number; height?: number; depth?: number } | null
  isRenderTargetTexture?: boolean
  isDepthTexture?: boolean
  isDataArrayTexture?: boolean
  isStorageTexture?: boolean
  isCubeTexture?: boolean
  isFramebufferTexture?: boolean
}

export interface TextureKind {
  kind: string
  count: number
  bytes: number
  /** Change in count since the previous census (0 on the first). */
  delta: number
}

/** One texture's census key: class, flags, size and name. */
export function textureKindOf(t: unknown): string {
  const tex = t as CensusTexture
  const flags = (
    [
      ['rt', tex.isRenderTargetTexture],
      ['depth', tex.isDepthTexture],
      ['array', tex.isDataArrayTexture],
      ['storage', tex.isStorageTexture],
      ['cube', tex.isCubeTexture],
      ['framebuffer', tex.isFramebufferTexture],
    ] as const
  )
    .filter(([, on]) => on)
    .map(([f]) => f)
  const img = tex.image
  const size = img ? `${img.width ?? '?'}x${img.height ?? '?'}${(img.depth ?? 1) > 1 ? `x${img.depth}` : ''}` : 'no-image'
  return [tex.constructor?.name ?? 'Texture', flags.length ? `[${flags.join(',')}]` : '', size, tex.name ? `"${tex.name}"` : '']
    .filter(Boolean)
    .join(' ')
}

/** Group the textures of a renderer memory map by kind, pure; attributes (the
 *  map's other entries) are skipped. `previous` (kind -> count) fills `delta`. */
export function textureCensus(
  memoryMap: Map<object, unknown> | null | undefined,
  previous: ReadonlyMap<string, number> = new Map(),
): TextureKind[] {
  const kinds = new Map<string, TextureKind>()
  for (const [t, size] of memoryMap ?? []) {
    if (!(t as CensusTexture).isTexture) continue
    const kind = textureKindOf(t)
    const k = kinds.get(kind) ?? { kind, count: 0, bytes: 0, delta: 0 }
    k.count++
    k.bytes += typeof size === 'number' ? size : 0
    kinds.set(kind, k)
  }
  for (const kind of previous.keys()) if (!kinds.has(kind)) kinds.set(kind, { kind, count: 0, bytes: 0, delta: 0 })
  for (const k of kinds.values()) k.delta = k.count - (previous.get(k.kind) ?? (previous.size ? 0 : k.count))
  return [...kinds.values()].sort((a, b) => b.delta - a.delta || b.count - a.count)
}

/** The levers that legitimately change the resident GPU set. Everything not in
 *  here must NOT move the render-target count, and may move the texture count
 *  only within its bounds (streaming) — that is what makes a rise a leak. */
export interface SignatureInput {
  mode: string
  /** Settlements differ in fires (shadow maps) and materials; only meaningful
   *  in place mode, where it keeps two settlements from sharing a baseline. */
  placeId: string | null
  detailLevel: string
  traa: boolean
  ssao: boolean
  bloom: boolean
  shadows: boolean
  fireShadows: boolean
  /** Whether the panorama capture has allocated its two targets yet (point
   *  545). They are taken on the FIRST capture and then kept for the session,
   *  so a settlement entered before any capture and the same settlement
   *  entered after one legitimately hold different sets — without this lever
   *  the first, capture-less visits set the baseline and every later visit
   *  read as a permanent leak. It stays a leak DETECTOR either way: the flag
   *  only ever goes false→true once, so a capture that allocated per shot
   *  (which is what point 545 found) still grows inside the true state. */
  panoramaCaptured: boolean
}

/** Stable key for one render state. */
export function renderSignature(i: SignatureInput): string {
  const flags = [
    i.traa ? 'traa' : '-',
    i.ssao ? 'ssao' : '-',
    i.bloom ? 'bloom' : '-',
    i.shadows ? 'sun' : '-',
    i.fireShadows ? 'fire' : '-',
    i.panoramaCaptured ? 'band' : '-',
  ].join('/')
  const place = i.mode === 'place' ? `:${i.placeId ?? 'unknown'}` : ''
  return `${i.mode}${place}|${i.detailLevel}|${flags}`
}

export type LeakVerdict = 'baseline' | 'ok' | 'leak'

export interface LeakEvaluation {
  verdict: LeakVerdict
  signature: string
  counts: LeakCounts
  /** The baseline compared against (equal to `counts` on the first visit). */
  baseline: LeakCounts
  delta: LeakCounts
  /** Which counter tripped; only set when the verdict is 'leak'. */
  counter?: keyof LeakCounts
  /** One-line reason, ready for the assert detail / the probe log. */
  detail: string
}

export interface Baseline extends LeakCounts {
  /** Settled readings filed under this signature so far. */
  visits: number
  /** The texture count the WARM-UP left behind, before any ratcheting. The
   *  ratchet would otherwise make a steady texture leak invisible — every
   *  step small enough to pass raises the bar for the next one — so the total
   *  drift away from this mark is bounded too. */
  textureMark: number
}

export type Baselines = Readonly<Record<string, Baseline>>

/** Settled readings a signature spends FORMING its baseline before it is judged
 *  against one. Measured (probe, 07.08.2026): the first settled reading after
 *  entering a settlement lands while the place is still building — Cairo read
 *  18 render targets / 39 textures where its steady state is 22 / 58, and every
 *  later visit would have been reported as a +4 leak. The baseline is therefore
 *  the HIGH-WATER MARK over the first visits, not the first reading. The cost is
 *  one transition of delay: a leak that grows by more than the bound per
 *  transition is still caught on the first judged reading, a smaller one by
 *  the total-drift bound below. */
const WARMUP_VISITS = 2

/** How far the ratcheting texture baseline may drift from the warm-up mark in
 *  total, as a multiple of the per-transition bound. Without this the ratchet
 *  is a blind spot: a leak that adds fewer textures per transition than the
 *  bound would raise its own baseline for ever. Measured resident sets are
 *  ~40-70 textures, so three bounds of drift is far above any legitimate
 *  streaming and far below a leak that would starve the device. */
const TEXTURE_DRIFT_FACTOR = 3

/**
 * The decision layer, pure: judge one settled reading against the recorded
 * baselines and return the evaluation together with the NEXT baseline set.
 *
 * - while a signature is still forming its baseline → 'baseline' (record the
 *   high-water mark, judge nothing);
 * - render targets above `baseline + bounds.renderTargets` → 'leak' (strict);
 * - textures above `baseline + bounds.textures` in ONE step, or more than
 *   `TEXTURE_DRIFT_FACTOR` bounds above the warm-up mark in TOTAL → 'leak';
 * - otherwise 'ok'. The render-target baseline then STAYS where the warm-up put
 *   it — neither raised (a leak must not re-baseline itself away) nor lowered (a
 *   momentary dip must not tighten the bar for good) — while the texture
 *   baseline ratchets UP to the current reading, so legitimately streamed
 *   content does not accumulate into a false alarm on the next visit. The
 *   ratchet is what the total-drift bound above closes: it must not let a leak
 *   too small for one step raise its own bar for ever.
 *
 * A 'leak' leaves the baseline counts untouched (only the visit count
 * advances), so the condition keeps reporting for as long as it holds instead
 * of silently re-baselining itself away.
 */
export function evaluateReading(
  baselines: Baselines,
  signature: string,
  counts: LeakCounts,
  bounds: LeakCounts = LEAK_BOUNDS,
  warmupVisits: number = WARMUP_VISITS,
): { evaluation: LeakEvaluation; baselines: Baselines } {
  const base = baselines[signature]
  const visits = (base?.visits ?? 0) + 1
  if (!base || visits <= warmupVisits) {
    const textures = Math.max(base?.textures ?? 0, counts.textures)
    const mark: Baseline = {
      renderTargets: Math.max(base?.renderTargets ?? 0, counts.renderTargets),
      textures,
      visits,
      textureMark: textures,
    }
    return {
      evaluation: {
        verdict: 'baseline',
        signature,
        counts,
        baseline: mark,
        delta: { renderTargets: 0, textures: 0 },
        detail:
          `baseline ${visits}/${warmupVisits} for ${signature}: ` +
          `${mark.renderTargets} render targets, ${mark.textures} textures`,
      },
      baselines: { ...baselines, [signature]: mark },
    }
  }
  const delta: LeakCounts = {
    renderTargets: counts.renderTargets - base.renderTargets,
    textures: counts.textures - base.textures,
  }
  const driftLimit = bounds.textures * TEXTURE_DRIFT_FACTOR
  const drift = counts.textures - base.textureMark
  const counter: keyof LeakCounts | undefined =
    delta.renderTargets > bounds.renderTargets
      ? 'renderTargets'
      : delta.textures > bounds.textures || drift > driftLimit
        ? 'textures'
        : undefined
  if (counter) {
    const overStep = counter === 'renderTargets' || delta.textures > bounds.textures
    return {
      evaluation: {
        verdict: 'leak',
        signature,
        counts,
        baseline: base,
        delta,
        counter,
        detail:
          (overStep
            ? `${counter} grew back at ${signature}: ${base[counter]} -> ${counts[counter]} ` +
              `(+${delta[counter]}, allowed +${bounds[counter]}); `
            : `textures drifted at ${signature}: ${base.textureMark} -> ${counts.textures} ` +
              `(+${drift} since the baseline was formed, allowed +${driftLimit}); `) +
          `render targets ${base.renderTargets}->${counts.renderTargets}, textures ${base.textures}->${counts.textures}`,
      },
      baselines: { ...baselines, [signature]: { ...base, visits } },
    }
  }
  return {
    evaluation: {
      verdict: 'ok',
      signature,
      counts,
      baseline: base,
      delta,
      detail:
        `${signature}: render targets ${base.renderTargets}->${counts.renderTargets}, ` +
        `textures ${base.textures}->${counts.textures}`,
    },
    baselines: {
      ...baselines,
      [signature]: {
        renderTargets: base.renderTargets,
        textures: Math.max(base.textures, counts.textures),
        visits,
        textureMark: base.textureMark,
      },
    },
  }
}

/** How a settle watch ended. 'unsettled' and 'superseded' judge nothing. */
export type WatchOutcome = LeakVerdict | 'unsettled' | 'superseded'

export interface HistoryEntry {
  signature: string
  outcome: WatchOutcome
  counts?: LeakCounts
  detail: string
  frames: number
}

// --- Settle policy (frame counts, not wall clock — the counts only move on a
// rendered frame, and a headless page that nothing forces to paint can drop to
// ~0 rAF ticks for seconds) ----------------------------------------------------
export interface SettlePolicy {
  /** Frames that must pass after a transition before a reading may count. */
  minFrames: number
  /** Repeats of the render-target reading, after the first, that make a
   *  reading settled. A frame without a reading (no renderer) neither breaks
   *  nor extends the run.
   *  Settling is judged on the RENDER TARGETS alone: the texture count keeps
   *  moving while content streams, so demanding it repeat would leave the
   *  strict half of the invariant permanently unsettled. */
  stableFrames: number
  /** Give up (and judge nothing) after this many frames. */
  maxFrames: number
}

/** Measured (probe, 07.08.2026): six stable frames is a tenth of a second at
 *  60 Hz and read a settlement that was still building. The window is wide
 *  enough that a scene has visibly stopped allocating, and the WARM-UP visits
 *  above cover what a wider window still cannot. */
export const SETTLE_POLICY: SettlePolicy = { minFrames: 20, stableFrames: 12, maxFrames: 600 }

/** Cap on the retained probe log. */
const HISTORY_CAP = 60

export interface Watch {
  signature: string
  frames: number
  stable: number
  last: number | null
  /** Repeats of the texture reading, after the first. */
  texStable: number
  texLast: number | null
  /** The render-target half has settled and been judged; the watch now waits
   *  only for the texture count to settle for the return and hop judgements. */
  targetsSettled: boolean
}

/** A fresh settle watch for a signature. */
export function newWatch(signature: string): Watch {
  return { signature, frames: 0, stable: 0, last: null, texStable: 0, texLast: null, targetsSettled: false }
}

export interface StepResult {
  /** The watch to carry into the next frame; null once it is finished. */
  watch: Watch | null
  /** Set when the render-target count settled: the reading the strict
   *  same-signature judgement (evaluateReading) takes. */
  settled?: LeakCounts
  /** Set once the TEXTURE count has settled too (at the same frame or later):
   *  the reading the return and hop judgements take. They compare textures
   *  across states, and a place's textures can still climb while its render
   *  targets stand (Cairo's first settled reading sat 19 textures under its
   *  steady state, probe 07.08.2026) — read there, a hop out of a still-building
   *  place against a built one spends most of the hop bound on the build. */
  texturesSettled?: LeakCounts
  /** Set when the watch gave up — judge nothing more (fail-soft on a stalled
   *  page); a watch whose render targets had settled has been judged already. */
  unsettled?: true
}

/**
 * One frame of the settle watch, pure. `counts` is the reading for this frame,
 * or null when no renderer is available (a torn-down canvas): a missing reading
 * ages the watch towards its give-up point but never settles it. `compiling`
 * (shader pipelines still queued or pending) holds the TEXTURE reading back:
 * three uploads a render object's textures — the figures' morph
 * DataArrayTextures among them — at its first draw after its pipeline compiled,
 * so a count read mid-compile stands still under load and misses a whole place's
 * set (point 1566: polish-settlement's full run read zulu-village at 56
 * textures / 146 pipelines and its re-entry at 85 / 195).
 */
export function stepWatch(
  w: Watch,
  counts: LeakCounts | null,
  policy: SettlePolicy = SETTLE_POLICY,
  compiling = false,
): StepResult {
  const frames = w.frames + 1
  let { stable, last, texStable, texLast } = w
  if (counts) {
    if (counts.renderTargets === last) stable++
    else {
      stable = 0
      last = counts.renderTargets
    }
    if (compiling) {
      texStable = 0
      texLast = null
    } else if (counts.textures === texLast) texStable++
    else {
      texStable = 0
      texLast = counts.textures
    }
    const texturesSettled = texStable >= policy.stableFrames ? counts : undefined
    if (!w.targetsSettled && frames >= policy.minFrames && stable >= policy.stableFrames) {
      if (texturesSettled) return { watch: null, settled: counts, texturesSettled }
      return { watch: { signature: w.signature, frames, stable, last, texStable, texLast, targetsSettled: true }, settled: counts }
    }
    if (w.targetsSettled && texturesSettled) return { watch: null, texturesSettled }
  }
  if (frames >= policy.maxFrames) return { watch: null, unsettled: true }
  return { watch: { signature: w.signature, frames, stable, last, texStable, texLast, targetsSettled: w.targetsSettled } }
}

let baselines: Baselines = {}
let history: HistoryEntry[] = []
let violations: HistoryEntry[] = []
let currentSignature: string | null = null
let watch: Watch | null = null
let rafHandle: number | null = null
/** Render targets deliberately leaked by the forceLeak() probe (verification). */
let forced: THREE.RenderTarget[] = []
/** The counters read when the player last left the bird's-eye view for a
 *  place; null while no return is pending. Either counter may be unreadable
 *  (null) without cancelling the other's judgement. */
let pendingVisit: { signature: string; pipelines: number | null; textures: number | null } | null = null
let lastMode: string | null = null
let pipelineState: PipelineReturnState = PIPELINE_RETURN_START
let pipelineHistory: PipelineReturnEvaluation[] = []
let textureState: PipelineReturnState = PIPELINE_RETURN_START
let textureHistory: PipelineReturnEvaluation[] = []
let hopState: PlaceHopState = PLACE_HOP_START
let hopHistory: PlaceHopEvaluation[] = []
let lastCensus: ReadonlyMap<string, number> = new Map()
/** The place and visit the running watch belongs to, captured at its start: a
 *  superseded watch is judged after the store has already moved on. */
let watchPlace: { placeId: string | null; visit: number } = { placeId: null, visit: 0 }
/** The signature whose texture count last settled, and that settled count;
 *  cleared by a new watch. The return entry is this count, never a fresh
 *  reading at departure (a transient dip would read as growth on return). */
let texturesSettledFor: { signature: string; textures: number } | null = null

/** `renderer._pipelines.caches.size` — three internals, so read defensively;
 *  null where the renderer or the field is missing (fail soft). */
function readPipelines(): number | null {
  const gl = getRenderContext()?.gl as unknown as { _pipelines?: { caches?: { size?: number } } } | undefined
  const size = gl?._pipelines?.caches?.size
  return typeof size === 'number' ? size : null
}

/** True on the WebGPU backend; the hop judge's pipelines leg is calibrated
 *  there and only reported on WebGL 2 (see judgePlaceHop). */
/** True while the async shader compile (render/asyncPipelines.ts, exposed by
 *  App.tsx in dev) still has pipelines queued or pending; unreadable → false. */
function pipelinesCompiling(): boolean {
  const read = (window as unknown as { __shaderPipelines?: () => { pending: number; queued: number } | null }).__shaderPipelines
  const s = typeof read === 'function' ? read() : null
  return !!s && (s.pending > 0 || s.queued > 0)
}

function isWebGpuRenderer(): boolean {
  const gl = getRenderContext()?.gl as unknown as { backend?: { isWebGPUBackend?: boolean } } | undefined
  return gl?.backend?.isWebGPUBackend === true
}

/** A settled bird's-eye reading closes a pending place visit — compared only
 *  like for like: a return under another bird's-eye signature than the one
 *  left (a graphics setting changed during the visit) holds a different
 *  resident set, so the visit is dropped unjudged. */
function judgePendingReturn(signature: string, texBack: number | null): void {
  if (pendingVisit === null || !signature.startsWith('travel|')) return
  const visit = pendingVisit
  pendingVisit = null
  if (visit.signature !== signature) return
  const back = readPipelines()
  const { pipelines: entry, textures: texEntry } = visit
  if (texEntry !== null && texBack !== null) {
    const t = judgePipelineReturn(textureState, texEntry, texBack, TEXTURE_RETURN_BOUNDS, 'textures')
    textureState = t.state
    textureHistory.push(t.evaluation)
    if (textureHistory.length > HISTORY_CAP) textureHistory.splice(0, textureHistory.length - HISTORY_CAP)
    devAssert(t.evaluation.verdict !== 'leak', 'render-texture-return-leak', () => t.evaluation.detail)
  }
  if (back === null || entry === null) return
  const { evaluation, state } = judgePipelineReturn(pipelineState, entry, back)
  pipelineState = state
  pipelineHistory.push(evaluation)
  if (pipelineHistory.length > HISTORY_CAP) pipelineHistory.splice(0, pipelineHistory.length - HISTORY_CAP)
  devAssert(evaluation.verdict !== 'leak', 'render-pipeline-leak', () => evaluation.detail)
}

/** A settled reading feeds the place-to-place hop chain: a settlement reading
 *  is judged against the previous settlement's, a bird's-eye one ends the chain. */
function judgeHop(signature: string, textures: number | null): void {
  if (signature.startsWith('travel|')) {
    // A chain ends here, and its growth with it: the return judgement owns
    // what a visit leaves behind in the bird's-eye view.
    hopState = { ...PLACE_HOP_START, hops: hopState.hops }
    hopCensus = null
    return
  }
  const { placeId, visit } = watchPlace
  if (!signature.startsWith('place:') || !placeId) return
  const { evaluation, state } = judgePlaceHop(
    hopState,
    { placeId, visit, setup: signature.slice(signature.indexOf('|') + 1), pipelines: readPipelines(), textures },
    PLACE_HOP_BOUNDS,
    isWebGpuRenderer(),
  )
  hopState = state
  // The census at this reading, so a leak names the texture kinds that grew
  // since the previous place reading, not only their count.
  const memoryMap = readMemoryMap()
  const kinds = memoryMap ? new Map(textureCensus(memoryMap).map((k) => [k.kind, k.count])) : null
  const before = hopCensus
  hopCensus = kinds
  if (!evaluation) return
  evaluation.grew = grownKinds(before, kinds)
  hopHistory.push(evaluation)
  if (hopHistory.length > HISTORY_CAP) hopHistory.splice(0, hopHistory.length - HISTORY_CAP)
  devAssert(evaluation.verdict !== 'leak', 'render-place-hop-leak', () => `${evaluation.detail}; grew: ${evaluation.grew}`)
}

let hopCensus: ReadonlyMap<string, number> | null = null

function readMemoryMap(): Map<object, unknown> | null {
  return (getRenderContext()?.gl?.info as { memoryMap?: Map<object, unknown> } | undefined)?.memoryMap ?? null
}

/** The kinds whose count rose from `before` to `after`, largest first, pure. */
export function grownKinds(
  before: ReadonlyMap<string, number> | null,
  after: ReadonlyMap<string, number> | null,
  limit = 6,
): string {
  if (!before || !after) return 'census unreadable'
  const grown = [...after]
    .map(([kind, n]) => [kind, n - (before.get(kind) ?? 0)] as const)
    .filter(([, d]) => d > 0)
    .sort((a, b) => b[1] - a[1])
  if (!grown.length) return 'no kind'
  return grown
    .slice(0, limit)
    .map(([kind, d]) => `${kind} +${d}`)
    .join(', ')
}

function readCounts(): LeakCounts | null {
  const memory = getRenderContext()?.gl?.info?.memory as LeakCounts | undefined
  if (!memory) return null
  return { renderTargets: memory.renderTargets ?? 0, textures: memory.textures ?? 0 }
}

function push(entry: HistoryEntry): void {
  history.push(entry)
  if (history.length > HISTORY_CAP) history.splice(0, history.length - HISTORY_CAP)
  if (entry.outcome === 'leak') {
    violations.push(entry)
    if (violations.length > HISTORY_CAP) violations.splice(0, violations.length - HISTORY_CAP)
  }
}

/** Current render signature, read from the live stores; `mode` overrides the
 *  store's (the bird's-eye signature being left, read at the store change). */
export function currentRenderSignature(mode?: string): string {
  const g = useGame.getState()
  const u = useUi.getState()
  return renderSignature({
    mode: mode ?? g.mode,
    placeId: g.placeId,
    detailLevel: u.detailLevel,
    traa: effectiveTraa(u),
    ssao: effectiveSsao(u),
    bloom: effectiveBloom(u),
    shadows: effectiveShadows(u),
    fireShadows: effectiveFireShadows(u),
    panoramaCaptured: panoramaCaptureTargetsAllocated(),
  })
}

function settleStep(): void {
  rafHandle = null
  const w = watch
  if (!w) return
  const counts = readCounts()
  const step = stepWatch(w, counts, SETTLE_POLICY, pipelinesCompiling())
  const frames = step.watch?.frames ?? w.frames + 1
  watch = step.watch
  if (step.settled) {
    const { evaluation, baselines: next } = evaluateReading(baselines, w.signature, step.settled)
    baselines = next
    push({
      signature: w.signature,
      outcome: evaluation.verdict,
      counts: step.settled,
      detail: evaluation.detail,
      frames,
    })
    // The invariant itself: a leak reports through the shared dev-assert channel
    // (console.error + window.__assertLog), so every headless suite's
    // console-error gate fails on it and every manual session shows it.
    devAssert(evaluation.verdict !== 'leak', 'render-resource-leak', () => evaluation.detail)
  }
  if (step.texturesSettled) {
    texturesSettledFor = { signature: w.signature, textures: step.texturesSettled.textures }
    judgePendingReturn(w.signature, step.texturesSettled.textures)
    judgeHop(w.signature, step.texturesSettled.textures)
  }
  // Render targets stood but textures kept streaming: the pipeline legs still
  // judge, on an unreadable texture count (review 21.11.2026).
  if (step.unsettled && w.targetsSettled) {
    judgePendingReturn(w.signature, null)
    judgeHop(w.signature, null)
  }
  if (step.unsettled) {
    push({
      signature: w.signature,
      outcome: 'unsettled',
      counts: counts ?? undefined,
      detail: w.targetsSettled
        ? `textures did not settle within ${SETTLE_POLICY.maxFrames} frames: return and hop judged on pipelines only`
        : counts
          ? `no settled reading within ${SETTLE_POLICY.maxFrames} frames (last ${counts.renderTargets} render targets)`
          : `no renderer within ${SETTLE_POLICY.maxFrames} frames`,
      frames,
    })
    return
  }
  if (!step.watch) return
  schedule()
}

function schedule(): void {
  if (rafHandle !== null || typeof requestAnimationFrame !== 'function') return
  rafHandle = requestAnimationFrame(settleStep)
}

/** Start (or replace) the settle watch for a signature. A watch still running
 *  when the state moves on again is SUPERSEDED, never judged — its reading
 *  would belong to the old signature. */
function startWatch(signature: string): void {
  if (watch) {
    push({
      signature: watch.signature,
      outcome: 'superseded',
      detail: `superseded by ${signature} after ${watch.frames} frames`
        + (watch.targetsSettled ? ': return and hop judged on pipelines only' : ''),
      frames: watch.frames,
    })
  }
  const g = useGame.getState()
  watchPlace = { placeId: g.mode === 'place' ? g.placeId : null, visit: currentPlaceVisit() }
  watch = newWatch(signature)
  texturesSettledFor = null
  schedule()
}

/** A watch left while its render targets stood but textures still streamed —
 *  the player moving on within the texture settle (review 21.11.2026): its
 *  pipeline legs judge on the reading it leaves, before the store change
 *  records the next visit's entry. */
function judgeStreamingWatch(): void {
  if (!watch?.targetsSettled) return
  judgePendingReturn(watch.signature, null)
  judgeHop(watch.signature, null)
}

function onStateChange(): void {
  // Read at the store change itself, before React unmounts the bird's-eye view.
  const mode = useGame.getState().mode
  const sig = currentRenderSignature()
  // A visit only counts on a mode or place change (state/placeVisit.ts), which
  // always changes the signature, so the signature alone tells a new watch.
  const changed = sig !== currentSignature
  if (changed) judgeStreamingWatch()
  if (lastMode === 'travel' && mode === 'place' && pendingVisit === null) {
    // The texture entry under the return's own gate: a bird's-eye count that
    // has settled with no shader compile pending. Read mid-stream, uploads
    // still due at departure would count as left behind on the settled return.
    const settled = texturesSettledFor?.signature === currentSignature && !pipelinesCompiling()
    pendingVisit = {
      signature: currentRenderSignature('travel'),
      pipelines: readPipelines(),
      textures: settled ? texturesSettledFor!.textures : null,
    }
  }
  lastMode = mode
  if (!changed) return
  currentSignature = sig
  startWatch(sig)
}

/** Drop every recorded baseline and log, and re-watch the current state. Used by
 *  the headless verification after its deliberate leak. */
function reset(): void {
  baselines = {}
  history = []
  violations = []
  pendingVisit = null
  pipelineState = PIPELINE_RETURN_START
  pipelineHistory = []
  textureState = PIPELINE_RETURN_START
  textureHistory = []
  hopState = PLACE_HOP_START
  hopCensus = null
  hopHistory = []
  currentSignature = currentRenderSignature()
  startWatch(currentSignature)
}

/**
 * Verification probe: leak `n` render targets FOR REAL — allocate them and
 * initialise them by rendering an empty throwaway scene into each (three counts
 * a render target in `info.memory.renderTargets` the moment the backend
 * initialises it), then keep them undisposed. The LIVE scene and camera are
 * deliberately not used: a second render of the real scene would fight the TRAA
 * jitter and the camera's view offset. Returns the render-target count after
 * the leak, or -1 with no renderer.
 */
function forceLeak(n: number): number {
  const ctx = getRenderContext()
  if (!ctx) return -1
  const gl = ctx.gl
  const prev = gl.getRenderTarget()
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10)
  for (let i = 0; i < n; i++) {
    const target = new THREE.RenderTarget(64, 64)
    forced.push(target)
    gl.setRenderTarget(target)
    gl.render(scene, camera)
  }
  gl.setRenderTarget(prev)
  return gl.info.memory.renderTargets
}

/** Free what forceLeak() leaked and start over with clean baselines, so the rest
 *  of a verification run measures an honest renderer again. */
function releaseForced(): number {
  for (const t of forced) t.dispose()
  const n = forced.length
  forced = []
  reset()
  return n
}

/**
 * Arm the watch. Idempotent across HMR and React StrictMode's double mount (the
 * flag lives on `window`, not in module scope, which HMR would reset), DEV only.
 */
export function armRenderLeakWatch(): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return
  const w = window as unknown as Record<string, unknown>
  if (w.__renderLeakArmed) return
  w.__renderLeakArmed = true
  currentSignature = currentRenderSignature()
  lastMode = useGame.getState().mode
  startWatch(currentSignature)
  useGame.subscribe(onStateChange)
  useUi.subscribe(onStateChange)
  w.__renderLeak = {
    state: () => ({
      armed: true,
      signature: currentSignature,
      watching: watch?.signature ?? null,
      bounds: LEAK_BOUNDS,
      baselines,
      history,
      violations,
      forced: forced.length,
      pipelines: {
        current: readPipelines(),
        entry: pendingVisit?.pipelines ?? null,
        bounds: PIPELINE_RETURN_BOUNDS,
        state: pipelineState,
        history: pipelineHistory,
      },
      textureReturn: {
        entry: pendingVisit?.textures ?? null,
        bounds: TEXTURE_RETURN_BOUNDS,
        state: textureState,
        history: textureHistory,
      },
      placeHop: {
        visit: currentPlaceVisit(),
        bounds: PLACE_HOP_BOUNDS,
        state: hopState,
        history: hopHistory,
      },
    }),
    reset,
    forceLeak,
    releaseForced,
    /** The resident textures by kind, with the count change since the last call. */
    textureKinds: () => {
      const memoryMap = (getRenderContext()?.gl?.info as { memoryMap?: Map<object, unknown> } | undefined)?.memoryMap
      // No memory map (three internals moved, no renderer): unreadable, not
      // "every texture freed" — and the last census stays the baseline.
      if (!memoryMap) return null
      const census = textureCensus(memoryMap, lastCensus)
      lastCensus = new Map(census.filter((k) => k.count > 0).map((k) => [k.kind, k.count]))
      return census
    },
  }
}
