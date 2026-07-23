// F6 state-dump popup (design.md §21.1): the complete game state as pretty
// JSON in a top-most modal (§17.4), with download and copy controls so the
// state can be attached to a bug report. Read-only and selectable; opening
// never moves focus onto a control (§17.5 — no autofocus, no .focus()).

import { useMemo } from 'react'
import { useGame } from '../state/store'
import { useUi } from '../state/ui'
import { dumpFilename, dumpGameState } from '../state/stateDump'
import { getStrings, useStrings } from '../i18n'

export function StateDump() {
  const t = useStrings()
  const open = useUi((s) => s.stateDumpOpen)
  // The dump is a snapshot of the moment F6 was pressed — recomputed on each
  // open, not live-tracking every store change while the popup stays up.
  const json = useMemo(
    () => (open ? dumpGameState(useGame.getState(), { ui: useUi.getState() }) : ''),
    [open],
  )
  if (!open) return null

  const download = () => {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = dumpFilename(useGame.getState().seed)
    a.click()
    URL.revokeObjectURL(url)
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
        <pre className="state-dump-json">{json}</pre>
        <div className="actions">
          <button className="hud-button state-dump-download" onClick={download}>
            {t.stateDump.download}
          </button>
          <button className="hud-button state-dump-copy" onClick={copy}>
            {t.stateDump.copy}
          </button>
          <button className="hud-button state-dump-close" onClick={() => useUi.getState().toggleStateDump()}>
            {t.stateDump.close}
          </button>
        </div>
      </div>
    </div>
  )
}
