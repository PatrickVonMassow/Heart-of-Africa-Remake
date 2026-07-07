// HUD composition: status bar, inventory/hand bar, prompt, toast, journal,
// dialogs, start/victory overlays and the debug menu. All player-visible
// text comes from the language files (design.md §17 localization).

import { useEffect, useState } from 'react'
import { useGame, type EquipmentId } from '../state/store'
import { useUi } from '../state/ui'
import { StatusBar } from './StatusBar'
import { JournalPanel } from './JournalPanel'
import { Dialogs } from './Dialogs'
import { DebugMenu } from './DebugMenu'
import { MapOverlay } from './MapOverlay'
import { onKeyPress } from '../systems/input'
import { useStrings } from '../i18n'

function InventoryBar() {
  const t = useStrings()
  const equipment = useGame((s) => s.equipment)
  const handItem = useGame((s) => s.handItem)
  const takeInHand = useGame((s) => s.takeInHand)
  const owned = (Object.keys(equipment) as EquipmentId[]).filter((e) => (equipment[e] ?? 0) > 0)
  if (owned.length === 0) return null
  return (
    <div className="inventory-bar">
      {owned.map((e) => (
        <button
          key={e}
          className={handItem === e ? 'active' : ''}
          onClick={() => takeInHand(handItem === e ? null : e)}
          title={t.hud.handTooltip}
        >
          {t.equipment[e]}
        </button>
      ))}
    </div>
  )
}

function Toast() {
  const toast = useGame((s) => s.toast)
  const setToast = useGame((s) => s.setToast)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast, setToast])
  if (!toast) return null
  return <div className="toast">{toast}</div>
}

/** Frame counter (FPS), top right; toggled in the debug menu (design.md §21). */
function FpsCounter() {
  const t = useStrings()
  const visible = useUi((s) => s.fpsVisible)
  const [fps, setFps] = useState(0)
  useEffect(() => {
    if (!visible) return
    let frames = 0
    let last = performance.now()
    let raf = requestAnimationFrame(function loop(now) {
      frames++
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)))
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(raf)
  }, [visible])
  if (!visible) return null
  return <div className="fps-counter">{t.hud.fps(fps)}</div>
}

/** Dismissible notice when the renderer fell back to WebGL 2 (CLAUDE.md §3). */
function RendererWarning() {
  const t = useStrings()
  const fallback = useUi((s) => s.webglFallback)
  const dismissed = useUi((s) => s.webglWarningDismissed)
  if (!fallback || dismissed) return null
  return (
    <div className="renderer-warning">
      <span>{t.hud.webglFallback}</span>
      <button onClick={() => useUi.getState().dismissWebglWarning()}>
        {t.hud.webglFallbackDismiss}
      </button>
    </div>
  )
}

function Prompt() {
  const prompt = useUi((s) => s.prompt)
  const dialog = useUi((s) => s.dialog)
  if (!prompt || dialog) return null
  return <div className="prompt">{prompt}</div>
}

function VictoryOverlay() {
  const t = useStrings()
  const victory = useGame((s) => s.victory)
  const day = useGame((s) => s.day)
  const newGame = useGame((s) => s.newGame)
  if (!victory) return null
  return (
    <div className="overlay">
      <h1>{t.overlays.title}</h1>
      <p>{t.overlays.victoryText(Math.floor(day))}</p>
      <div className="actions">
        <button className="hud-button" onClick={newGame}>{t.overlays.newExpedition}</button>
      </div>
    </div>
  )
}

/** Shown once at startup when a checkpoint exists (design.md §18, simplified). */
function StartOverlay() {
  const t = useStrings()
  const [decided, setDecided] = useState(false)
  const [hadCheckpoint] = useState(() => useGame.getState().hasCheckpoint)
  const loadCheckpoint = useGame((s) => s.loadCheckpoint)
  if (decided || !hadCheckpoint) return null
  return (
    <div className="overlay">
      <h1>{t.overlays.title}</h1>
      <p>{t.overlays.checkpointFound}</p>
      <div className="actions">
        <button
          className="hud-button"
          onClick={() => {
            loadCheckpoint()
            setDecided(true)
          }}
        >
          {t.overlays.loadCheckpoint}
        </button>
        <button className="hud-button" onClick={() => setDecided(true)}>
          {t.overlays.newExpedition}
        </button>
      </div>
    </div>
  )
}

export function Hud() {
  const t = useStrings()
  const setJournalOpen = useGame((s) => s.setJournalOpen)
  const toggleDebug = useUi((s) => s.toggleDebug)
  const setDialog = useUi((s) => s.setDialog)

  useEffect(() => {
    const offT = onKeyPress('KeyT', () => {
      const g = useGame.getState()
      g.setJournalOpen(!g.journalOpen)
    })
    const offM = onKeyPress('KeyM', () => {
      if (!useUi.getState().dialog) useUi.getState().toggleMap()
    })
    const offF1 = onKeyPress('F1', () => toggleDebug())
    const offEsc = onKeyPress('Escape', () => {
      if (useUi.getState().dialog) setDialog(null)
      else if (useUi.getState().mapOpen) useUi.getState().toggleMap()
      else if (useGame.getState().journalOpen) setJournalOpen(false)
    })
    // F1 opens browser help by default — prevent that.
    const preventF1 = (e: KeyboardEvent) => {
      if (e.code === 'F1') e.preventDefault()
    }
    window.addEventListener('keydown', preventF1)
    return () => {
      offT()
      offM()
      offF1()
      offEsc()
      window.removeEventListener('keydown', preventF1)
    }
  }, [setJournalOpen, toggleDebug, setDialog])

  return (
    <>
      <StatusBar />
      <FpsCounter />
      <InventoryBar />
      <button className="hud-button journal-toggle" onClick={() => {
        const g = useGame.getState()
        g.setJournalOpen(!g.journalOpen)
      }}>
        {t.hud.journalToggle}
      </button>
      <button className="hud-button map-toggle" onClick={() => useUi.getState().toggleMap()}>
        {t.hud.mapToggle}
      </button>
      <Prompt />
      <Toast />
      <JournalPanel />
      <MapOverlay />
      <Dialogs />
      <DebugMenu />
      {/* Above panels and dialogs so it stays clickable; below the modal overlays. */}
      <RendererWarning />
      <StartOverlay />
      <VictoryOverlay />
    </>
  )
}
