// F6 bug report (design.md §21.1): one keypress produces the whole report —
// the PICTURE of the moment, the complete game state and the user's own words,
// handed out as ONE .zip the user can pass on unopened.
//
// The picture is read back from the canvas inside a rendered tick (see
// render/frameCapture.ts) and holds the 3-D scene alone; every label and the
// HUD are DOM, so they travel as the overlay snapshot beside it.
//
// Top-most modal (§17.4). Esc closes it, from the description field too, and
// leaves focus on no control (§17.5) — the field itself is autofocused on
// purpose, so the user can start typing the moment the modal appears.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '../state/store'
import { useUi } from '../state/ui'
import {
  dumpFilename,
  dumpGameState,
  dumpSummary,
  wildlifeReportCounts,
  type DumpEnvironment,
} from '../state/stateDump'
import { getStrings, useLocale, useStrings } from '../i18n'
import { captureRenderedFrame } from '../render/frameCapture'
import { describeBackend } from '../render/backendInfo'
import { getRenderContext } from '../render/renderContext'
import { snapshotOverlay, type OverlayItem } from '../report/overlaySnapshot'
import { buildBugReport, dataUrlToBytes } from '../report/bugReport'

/** Environment header for the dump and the description file (§21.1). */
function reportEnvironment(): DumpEnvironment {
  const { backend, adapter } = describeBackend(getRenderContext()?.gl)
  return {
    build: import.meta.env.MODE,
    commit: import.meta.env.VITE_BUILD_COMMIT ?? 'unknown',
    backend,
    adapter,
    language: useLocale.getState().lang,
    quality: useUi.getState().detailLevel,
    userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio,
  }
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function StateDump() {
  const t = useStrings()
  const open = useUi((s) => s.stateDumpOpen)
  const [description, setDescription] = useState('')
  // The picture and the overlay are captured ONCE, at the moment F6 was
  // pressed — that is the moment the user is reporting, not the moment they
  // finish typing.
  const capture = useRef<string | null>(null)
  const overlay = useRef<OverlayItem[]>([])
  const env = useRef<DumpEnvironment | null>(null)
  // The dump is a snapshot of that same moment — recomputed on each open, not
  // live-tracking every store change while the popup stays up.
  const json = useMemo(
    () =>
      open
        ? dumpGameState(useGame.getState(), {
            ui: useUi.getState(),
            env: reportEnvironment(),
            detailLevel: useUi.getState().detailLevel,
          })
        : '',
    [open],
  )

  useEffect(() => {
    if (!open) return
    setDescription('')
    capture.current = null
    env.current = reportEnvironment()
    // The modal is already mounted here; snapshotOverlay skips its own
    // backdrop, so the report describes the game, not the report.
    overlay.current = snapshotOverlay(document.querySelector('.game-root') ?? document.body, {
      viewport: { width: window.innerWidth, height: window.innerHeight },
    })
    let cancelled = false
    void captureRenderedFrame().then((frame) => {
      if (!cancelled) capture.current = frame?.dataUrl ?? null
    })
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  const close = () => {
    // Esc must not leave focus sitting on a control (§17.5).
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    useUi.getState().toggleStateDump()
  }

  /** The whole report: picture + state + overlay + description, as one zip. */
  const downloadReport = () => {
    const game = useGame.getState()
    const environment = env.current ?? reportEnvironment()
    const s = getStrings()
    const report = buildBugReport({
      dumpFilename: dumpFilename(game.seed),
      stateJson: json,
      description,
      png: dataUrlToBytes(capture.current),
      overlay: overlay.current,
      summary: dumpSummary(game, useUi.getState().detailLevel),
      // Read back from the very JSON that goes into the archive, so the
      // description can never name other counts than the file holds.
      wildlife: wildlifeReportCounts(json),
      env: environment,
      texts: s.stateDump.report,
    })
    saveBlob(new Blob([report.zip as BlobPart], { type: 'application/zip' }), report.filename)
    game.setToast(s.stateDump.saved)
  }

  /** The state alone, unchanged from before — still one click away. */
  const download = () => {
    saveBlob(new Blob([json], { type: 'application/json' }), dumpFilename(useGame.getState().seed))
  }

  const copy = () => {
    void navigator.clipboard
      ?.writeText(json)
      .then(() => useGame.getState().setToast(getStrings().stateDump.copied))
      .catch(() => {
        // Clipboard unavailable (permissions) — the text stays selectable.
      })
  }

  return (
    <div className="dialog-backdrop state-dump-backdrop">
      <div className="dialog state-dump">
        <h3>{t.stateDump.title}</h3>
        <label className="state-dump-label" htmlFor="state-dump-description">
          {t.stateDump.descriptionLabel}
        </label>
        <textarea
          id="state-dump-description"
          className="state-dump-description"
          autoFocus
          rows={3}
          value={description}
          placeholder={t.stateDump.descriptionPlaceholder}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            // Game keys ignore a typing target (systems/input.ts), so Esc and
            // F6 are served here while the field has focus.
            if (e.key === 'Escape' || e.key === 'F6') {
              e.preventDefault()
              e.stopPropagation()
              close()
            }
          }}
        />
        <p className="state-dump-contents">{t.stateDump.contents}</p>
        <pre className="state-dump-json">{json}</pre>
        <div className="actions">
          <button className="hud-button state-dump-report" onClick={downloadReport}>
            {t.stateDump.downloadReport}
          </button>
          <button className="hud-button state-dump-download" onClick={download}>
            {t.stateDump.download}
          </button>
          <button className="hud-button state-dump-copy" onClick={copy}>
            {t.stateDump.copy}
          </button>
          <button className="hud-button state-dump-close" onClick={close}>
            {t.stateDump.close}
          </button>
        </div>
      </div>
    </div>
  )
}
