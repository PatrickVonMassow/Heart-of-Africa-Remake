// DEV frame/burst attribution probe (docs/perf-driving-hitches.md,
// docs/perf-1543-driving-hitches.md): the two
// movement-threshold bursts in the travel view — the terrain chunk builds on a
// boundary crossing and the flora instance rebuild every 16 wu (amortised over
// up to FLORA_FILL_MAX_FRAMES frames) — record their per-frame cost here, alongside a ring buffer of frame deltas. TravelScene
// exposes it as `window.__perf` in DEV so a driven verification (and manual
// profiling) can attribute long frames to their burst. Recording is a few
// field writes per frame; nothing reads the data unless asked.

export interface BurstStat {
  count: number
  lastMs: number
  maxMs: number
  totalMs: number
}

function makeStat(): BurstStat {
  return { count: 0, lastMs: 0, maxMs: 0, totalMs: 0 }
}

/** Ring-buffer capacity: ~25 s of frames at 120 fps (a full bench sample). */
export const FRAME_RING_CAP = 3000

/** One rendered frame's CPU cost, measured exactly as the F8 benchmark does
 *  (R3F's before-effect to after-effect: useFrame work plus render submission),
 *  with the per-system bookings of src/systems/longFrame.ts inside it and the
 *  JS-heap drop across it (> 0: a garbage collection ran in the frame). */
export interface CpuFrame {
  t: number
  cpu: number
  work: Record<string, number>
  heapDropMb: number
}

export const PERF = {
  terrain: makeStat(),
  flora: makeStat(),
  frames: [] as Array<{ t: number; dt: number }>,
  cpuFrames: [] as CpuFrame[],
}

/** Append one CPU frame to its bounded ring. */
export function recordCpuFrame(frame: CpuFrame): void {
  PERF.cpuFrames.push(frame)
  if (PERF.cpuFrames.length > FRAME_RING_CAP) PERF.cpuFrames.shift()
}

/** Fold one burst's elapsed milliseconds into its stat. */
export function recordBurst(stat: BurstStat, ms: number): void {
  stat.count += 1
  stat.lastMs = ms
  if (ms > stat.maxMs) stat.maxMs = ms
  stat.totalMs += ms
}

/** Append one frame delta (ms) at timestamp `t` to the bounded ring. */
export function recordFrame(t: number, dtMs: number): void {
  PERF.frames.push({ t, dt: dtMs })
  if (PERF.frames.length > FRAME_RING_CAP) PERF.frames.shift()
}

/** The longest frame delta (ms) recorded at or after `sinceT` (0 = all). */
export function maxFrameMs(sinceT = 0): number {
  let max = 0
  for (const f of PERF.frames) {
    if (f.t >= sinceT && f.dt > max) max = f.dt
  }
  return max
}

/** Zero every stat and clear the frame ring (a measurement pass starts fresh). */
export function resetPerf(): void {
  for (const s of [PERF.terrain, PERF.flora]) {
    s.count = 0
    s.lastMs = 0
    s.maxMs = 0
    s.totalMs = 0
  }
  PERF.frames.length = 0
  PERF.cpuFrames.length = 0
}
