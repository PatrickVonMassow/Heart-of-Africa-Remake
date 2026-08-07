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
// the post pipeline (src/render/Effects.tsx), the shadow maps and the panorama
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
// it judges. A reading that never settles (a headless page that stops painting)
// is recorded and DROPPED, never asserted: fail-soft on an environment stall,
// fail-loud only on a product bug.
//
// DEV only — the whole module is behind import.meta.env.DEV and is imported
// dynamically from src/App.tsx, so it is absent from the shipped bundle.

import * as THREE from 'three/webgpu'
import { devAssert } from '../systems/devAssert'
import { getRenderContext } from './renderContext'
import { panoramaCaptureTargetsAllocated } from '../scenes/travel/panoramaCapture'
import { useGame } from '../state/store'
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

/** The levers that legitimately change the resident GPU set. Everything not in
 *  here must NOT move the counts — that is what makes a rise a leak. */
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
 *  one transition of delay: a leak that grows per transition is still over the
 *  bound on the first judged reading. */
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
 * A 'leak' leaves the baselines untouched, so the condition keeps reporting for
 * as long as it holds instead of silently re-baselining itself away.
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
  /** Identical consecutive render-target readings that make a reading settled.
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
}

/** A fresh settle watch for a signature. */
export function newWatch(signature: string): Watch {
  return { signature, frames: 0, stable: 0, last: null }
}

export interface StepResult {
  /** The watch to carry into the next frame; null once it is finished. */
  watch: Watch | null
  /** Set when the reading settled and may be judged. */
  settled?: LeakCounts
  /** Set when the watch gave up — judge nothing (fail-soft on a stalled page). */
  unsettled?: true
}

/**
 * One frame of the settle watch, pure. `counts` is the reading for this frame,
 * or null when no renderer is available (a torn-down canvas): a missing reading
 * ages the watch towards its give-up point but never settles it.
 */
export function stepWatch(
  w: Watch,
  counts: LeakCounts | null,
  policy: SettlePolicy = SETTLE_POLICY,
): StepResult {
  const frames = w.frames + 1
  let stable = w.stable
  let last = w.last
  if (counts) {
    if (counts.renderTargets === last) stable++
    else {
      stable = 0
      last = counts.renderTargets
    }
    if (frames >= policy.minFrames && stable >= policy.stableFrames) {
      return { watch: null, settled: counts }
    }
  }
  if (frames >= policy.maxFrames) return { watch: null, unsettled: true }
  return { watch: { signature: w.signature, frames, stable, last } }
}

let baselines: Baselines = {}
let history: HistoryEntry[] = []
let violations: HistoryEntry[] = []
let currentSignature: string | null = null
let watch: Watch | null = null
let rafHandle: number | null = null
/** Render targets deliberately leaked by the forceLeak() probe (verification). */
let forced: THREE.RenderTarget[] = []

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

/** Current render signature, read from the live stores. */
export function currentRenderSignature(): string {
  const g = useGame.getState()
  const u = useUi.getState()
  return renderSignature({
    mode: g.mode,
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
  const step = stepWatch(w, counts)
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
    return
  }
  if (step.unsettled) {
    push({
      signature: w.signature,
      outcome: 'unsettled',
      counts: counts ?? undefined,
      detail: counts
        ? `no settled reading within ${SETTLE_POLICY.maxFrames} frames (last ${counts.renderTargets} render targets)`
        : `no renderer within ${SETTLE_POLICY.maxFrames} frames`,
      frames,
    })
    return
  }
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
      detail: `superseded by ${signature} after ${watch.frames} frames`,
      frames: watch.frames,
    })
  }
  watch = newWatch(signature)
  schedule()
}

function onStateChange(): void {
  const sig = currentRenderSignature()
  if (sig === currentSignature) return
  currentSignature = sig
  startWatch(sig)
}

/** Drop every recorded baseline and log, and re-watch the current state. Used by
 *  the headless verification after its deliberate leak. */
function reset(): void {
  baselines = {}
  history = []
  violations = []
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
    }),
    reset,
    forceLeak,
    releaseForced,
  }
}
