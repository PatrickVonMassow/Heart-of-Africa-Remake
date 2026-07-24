// The ONE way into the render benchmark (design.md §21.1, point 280).
//
// The benchmark ships in the delivered build because its numbers must come from
// the player's own hardware — which means the player has to be able to START it
// there. A single function key is not enough for that: on many keyboards F8 is a
// hardware/media key that needs Fn and never produces a keydown at all, browser
// extensions and DevTools bind it, and the failure looks identical to a broken
// build. So the key, the debug-menu button and the ?bench=1 URL parameter all
// come through here.
//
// The runner is imported LAZILY so it stays out of the eager startup chunks
// (like the TTS stack), and a failure to load or start raises the localized
// toast rather than doing nothing — a silent no-op is indistinguishable from a
// key that never arrived, which is exactly the confusion this point fixes.

import { useUi } from '../state/ui'
import { useGame } from '../state/store'
import { getStrings } from '../i18n'

/** Start the benchmark, or explain why it could not start. Never throws. */
export async function startBenchmarkSafely(options: { short?: boolean } = {}): Promise<void> {
  const ui = useUi.getState()
  if (ui.benchProgress || ui.benchReport) return // already running or showing its report
  try {
    const runner = await import('./benchmarkRun')
    await runner.startBenchmark(options)
  } catch {
    useGame.getState().setToast(getStrings().benchmark.unavailable)
  }
}

/** Whether the page was opened with the benchmark's own URL parameter — the
 *  entry point no keyboard, focus rule or extension can intercept, and the
 *  easiest thing to hand a remote tester as a link. `?bench=short` shortens the
 *  sampling the way the automated check does. */
export function benchmarkFromUrl(search: string): { start: boolean; short: boolean } {
  const value = new URLSearchParams(search).get('bench')
  if (value === null) return { start: false, short: false }
  return { start: value !== '0' && value !== 'false', short: value === 'short' }
}
