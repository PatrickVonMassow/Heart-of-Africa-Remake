// In-game render benchmark (design.md §21.1, F8): the modal progress overlay
// while the sweep runs, and the result panel with the download/copy controls
// once it is done. All text comes from the language files (§17).
//
// The heavy runner (src/systems/benchmarkRun.ts) is imported lazily on the
// keypress; this overlay only reads the progress/report the runner publishes
// into the UI store, so it costs nothing while no benchmark runs.

import { useGame } from '../state/store'
import { useUi } from '../state/ui'
import { formatDuration, type BenchPhaseName } from '../systems/benchmark'
import { getStrings, useStrings } from '../i18n'
import type { Strings } from '../i18n/types'

function phaseLabel(t: Strings, phase: string): string {
  const map: Record<BenchPhaseName, string> = {
    'savanna-standing': t.benchmark.phases.savannaStanding,
    'desert-standing': t.benchmark.phases.desertStanding,
    'savanna-driving': t.benchmark.phases.savannaDriving,
  }
  return map[phase as BenchPhaseName] ?? phase
}

/** The digest the report file carries as its first key — shown for a glance
 *  check before the file is sent on. */
function summaryOf(json: string): string {
  try {
    const parsed = JSON.parse(json) as { summary?: string[] }
    return (parsed.summary ?? []).join('\n')
  } catch {
    return ''
  }
}

export function BenchmarkOverlay() {
  const t = useStrings()
  const progress = useUi((s) => s.benchProgress)
  const report = useUi((s) => s.benchReport)

  if (report) {
    const download = () => {
      const blob = new Blob([report.json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = report.filename
      a.click()
      URL.revokeObjectURL(url)
    }
    const copy = () => {
      void navigator.clipboard
        ?.writeText(report.json)
        .then(() => useGame.getState().setToast(getStrings().benchmark.copied))
        .catch(() => {
          // Clipboard unavailable (permissions) — the text stays selectable.
        })
    }
    return (
      <div className="dialog-backdrop bench-backdrop">
        <div className="dialog bench-report">
          <h3>{t.benchmark.doneTitle}</h3>
          {report.aborted && <p className="bench-aborted">{t.benchmark.abortedNote}</p>}
          <pre className="bench-summary">{summaryOf(report.json)}</pre>
          <div className="actions">
            <button className="hud-button bench-download" onClick={download}>
              {t.benchmark.download}
            </button>
            <button className="hud-button bench-copy" onClick={copy}>
              {t.benchmark.copy}
            </button>
            <button className="hud-button bench-close" onClick={() => useUi.getState().setBenchReport(null)}>
              {t.benchmark.close}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!progress) return null
  const pct = progress.framesTotal > 0 ? Math.round((progress.framesDone / progress.framesTotal) * 100) : 0
  return (
    <div className="dialog-backdrop bench-backdrop">
      <div className="dialog bench-progress">
        <h3>{t.benchmark.title}</h3>
        <p className="bench-config">
          {progress.config === null
            ? t.benchmark.warmup
            : t.benchmark.config(progress.config, progress.configIndex, progress.configCount)}
        </p>
        <p className="bench-phase">{t.benchmark.phase(phaseLabel(t, progress.phase))}</p>
        <div className="bench-bar">
          <div className="bench-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="bench-remaining">{t.benchmark.remaining(formatDuration(progress.remainingMs))}</p>
        <p className="bench-abort-hint">{t.benchmark.abortHint}</p>
      </div>
    </div>
  )
}
