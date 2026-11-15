// Smoke over the village fire and dust under a walker's feet (design.md §19.10).
// Pure: where a smoke puff stands and how dense it reads as a function of its
// height and the fire's weather factor, and whether a walker's step may raise
// dust from the ground's wetness. The drawn billboards live in SmokeDust.tsx.

/** The plume's calibratable shape (`balance.fireSmoke`). */
export interface PlumeTuning {
  /** Height (m) a puff reaches at the end of its life in dry weather. */
  height: number
  /** Lateral lean (m) per metre of height: the drift the plume leans with. */
  driftPerM: number
  /** Compass bearing (degrees, 0 = +Z) the plume leans toward. */
  driftDirDeg: number
  /** Puff size (m) at the hearth and at the top of the column. */
  startSize: number
  endSize: number
  /** Peak opacity of a puff (0..1). */
  opacity: number
  /** Exponent of the thinning with height: higher thins sooner. */
  thinning: number
}

/** One smoke billboard, relative to the hearth. */
export interface PlumePuff {
  x: number
  y: number
  z: number
  size: number
  opacity: number
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))

/** Share of a puff's life over which it fades in at the hearth. */
const PUFF_FADE_IN = 0.12

/**
 * A puff at life fraction `age` (0 at the hearth, 1 at the column's top) under
 * the fire's `weather` factor (1 dry, lower under rain, 0 for a fire that is
 * out — `fireShelterResponse(...).rainFactor`, the factor the flame follows).
 * The column leans with height by `driftPerM`, widens and thins as it rises,
 * and rain both shortens it (guttering) and thins it; at weather 0 it is gone.
 */
export function plumePuff(age: number, weather: number, t: PlumeTuning): PlumePuff {
  const a = clamp01(age)
  const w = clamp01(weather)
  const top = Math.max(0, t.height) * (0.35 + 0.65 * w)
  const y = a * top
  const lean = Math.max(0, t.driftPerM) * y
  const dir = (t.driftDirDeg * Math.PI) / 180
  const fadeIn = Math.min(1, a / PUFF_FADE_IN)
  const thin = Math.pow(1 - a, Math.max(0, t.thinning))
  return {
    x: Math.sin(dir) * lean,
    y,
    z: Math.cos(dir) * lean,
    size: t.startSize + (t.endSize - t.startSize) * a,
    opacity: clamp01(t.opacity) * w * fadeIn * thin,
  }
}

/** Life fraction of puff `i` of `n` at time `time` (s) with a `life` (s) cycle:
 *  the puffs are evenly staggered so the column is always populated. */
export function plumeAge(i: number, n: number, time: number, life: number): number {
  const phase = time / Math.max(1e-3, life) + i / Math.max(1, n)
  return phase - Math.floor(phase)
}

/** The walker dust's calibratable look (`balance.walkerDust`). */
export interface DustTuning {
  /** Ground wetness (0..1, after the shelter mask) at and above which no dust rises. */
  dryBelow: number
  /** Seconds a puff lives. */
  life: number
  /** Puff size (m) when kicked up, and how much it grows over its life (factor). */
  size: number
  growth: number
  /** Height (m) a puff lifts over its life. */
  lift: number
  /** Peak opacity (0..1). */
  opacity: number
  /** Metres walked between two puffs. */
  spacing: number
}

/** Whether a step raises dust: only on DRY ground. `wetness` is the ground's
 *  wetness at the foot (0..1, `groundWetnessFactor` shaped by the shelter mask). */
export function dustRises(wetness: number, t: Pick<DustTuning, 'dryBelow'>): boolean {
  return clamp01(wetness) < Math.max(0, t.dryBelow)
}

/** A dust puff at life fraction `age`: kicked up at the foot, lifting, growing and fading. */
export function dustPuff(age: number, t: DustTuning): { lift: number; size: number; opacity: number } {
  const a = clamp01(age)
  return {
    lift: a * Math.max(0, t.lift),
    size: Math.max(0, t.size) * (1 + Math.max(0, t.growth) * a),
    opacity: clamp01(t.opacity) * Math.min(1, a / PUFF_FADE_IN) * (1 - a) * (1 - a),
  }
}
