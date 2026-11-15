// Dev-mode long-frame detector for the travel view (docs/perf-1523-findings.md).
//
// Instrumented systems add their main-thread milliseconds to the CURRENT frame
// window with `markFrameWork`; the travel scene's root frame callback closes the
// window once per frame with `closeFrameWindow`. A window at or above
// `balance.travelFrame.longFrameMs` is reported with the system that owned most
// of it — or as unattributed when no instrumented system owned a real share, so
// the report never blames a bystander.
//
// The report is a console.warn plus a bounded `window.__longFrameLog`, rate-
// limited per owner. It deliberately does NOT use devAssert's console.error: the
// headless verify lanes paint on a software rasteriser whose ordinary frames
// already exceed the line, and that environment transient must not fail every
// suite (CLAUDE.md §7.2: fail soft for environment transients). DEV only.

import { balance } from '../config/balance'

/** System names the travel view attributes long frames to. */
export type FrameSystem = 'terrain-stream' | 'flora-stream' | 'shader-programs' | 'environment-rebake'

export interface LongFrameReport {
  /** Length of the closed frame window (ms). */
  ms: number
  /** The owning system, or 'unattributed'. */
  owner: FrameSystem | 'unattributed'
  /** Instrumented milliseconds per system inside the window. */
  work: Partial<Record<FrameSystem, number>>
  t: number
}

const work: Partial<Record<FrameSystem, number>> = {}
let windowStart: number | null = null
const lastWarned = new Map<string, number>()
const WARN_RATE_MS = 2000
const LOG_CAP = 100

/** Add `ms` of main-thread work by `system` to the current frame window. */
export function markFrameWork(system: FrameSystem, ms: number): void {
  if (!import.meta.env.DEV) return
  work[system] = (work[system] ?? 0) + ms
}

/** The owner of a frame window: the system with the most instrumented work,
 *  provided it owns at least `ownerShare` of the window; else 'unattributed'. */
export function frameOwner(
  windowMs: number,
  frameWork: Partial<Record<FrameSystem, number>>,
  ownerShare: number,
): FrameSystem | 'unattributed' {
  let best: FrameSystem | null = null
  let bestMs = 0
  for (const [name, ms] of Object.entries(frameWork) as Array<[FrameSystem, number]>) {
    if (ms > bestMs) {
      best = name
      bestMs = ms
    }
  }
  return best !== null && bestMs >= windowMs * ownerShare ? best : 'unattributed'
}

/** Close the frame window at `now` (performance.now ms): returns the report if
 *  the window was long, else null, and opens the next window. */
export function closeFrameWindow(now: number): LongFrameReport | null {
  if (!import.meta.env.DEV) return null
  const start = windowStart
  windowStart = now
  let report: LongFrameReport | null = null
  if (start !== null) {
    const ms = now - start
    const { longFrameMs, ownerShare } = balance.travelFrame
    if (ms >= longFrameMs) {
      report = { ms, owner: frameOwner(ms, work, ownerShare), work: { ...work }, t: now }
      emit(report)
    }
  }
  for (const k of Object.keys(work) as FrameSystem[]) delete work[k]
  return report
}

/** Forget the open window (scene unmount): the gap until the next travel frame
 *  is not a frame. */
export function resetFrameWindow(): void {
  windowStart = null
  for (const k of Object.keys(work) as FrameSystem[]) delete work[k]
  lastWarned.clear()
}

function emit(report: LongFrameReport): void {
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __longFrameLog?: LongFrameReport[] }
    const log = (w.__longFrameLog ??= [])
    log.push(report)
    if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP)
  }
  const last = lastWarned.get(report.owner) ?? -Infinity
  if (report.t - last < WARN_RATE_MS) return
  lastWarned.set(report.owner, report.t)
  const parts = Object.entries(report.work).map(([k, v]) => `${k} ${v.toFixed(1)} ms`)
  console.warn(
    `[LONG FRAME] travel ${report.ms.toFixed(0)} ms — owner: ${report.owner}${parts.length ? ` (${parts.join(', ')})` : ''}`,
  )
}
