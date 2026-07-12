// HUD composition: status bar, inventory/hand bar, prompt, toast, journal,
// dialogs, start/victory overlays and the debug menu. All player-visible
// text comes from the language files (design.md §17 localization).

import { useEffect, useState } from 'react'
import { healthState, listCheckpoints, useGame, type EquipmentId } from '../state/store'
import { TREASURE_IDS } from '../systems/economy'
import { placeById, worldToLatLon } from '../world/geo'
import { sampleTerrain } from '../world/terrain'
import { START_YEAR, balance } from '../config/balance'
import { useUi } from '../state/ui'
import { StatusBar } from './StatusBar'
import { JournalPanel } from './JournalPanel'
import { Dialogs } from './Dialogs'
import { DebugMenu } from './DebugMenu'
import { MapOverlay } from './MapOverlay'
import { onKeyPress } from '../systems/input'
import { getStrings, useStrings } from '../i18n'

function InventoryBar() {
  const t = useStrings()
  const equipment = useGame((s) => s.equipment)
  const treasures = useGame((s) => s.treasures)
  const canteenFill = useGame((s) => s.canteenFill)
  const mode = useGame((s) => s.mode)
  const pos = useGame((s) => s.pos)
  const seed = useGame((s) => s.seed)
  const afflictions = useGame((s) => s.afflictions)
  const owned = (Object.keys(equipment) as EquipmentId[]).filter((e) => (equipment[e] ?? 0) > 0)
  const ownedTreasures = TREASURE_IDS.filter((id) => treasures[id] > 0)
  if (owned.length === 0 && ownedTreasures.length === 0) return null

  // Medicine, map and shovel are used by clicking them on the spot (design.md
  // §17); the rest act by mere possession (rifle/rope/machete/canoe) or show a
  // reading (canteen fill), so they are passive labels, not buttons.
  const activateItem = (e: EquipmentId) => {
    const g = useGame.getState()
    if (e === 'medicine') g.useMedicine()
    else if (e === 'map') useUi.getState().toggleMap()
    else if (e === 'shovel') g.dig()
  }
  const clickable = (e: EquipmentId) => e === 'medicine' || e === 'map' || e === 'shovel'

  // An item "in use" glows in the inventory: a carried relief item currently
  // countering the terrain (canoe on water, machete in jungle, rope on a
  // mountain), and medicine while there is a curable affliction (fever/wounds).
  const active = new Set<EquipmentId>()
  if (mode === 'travel') {
    const ll = worldToLatLon(pos.x, pos.z)
    const terrain = sampleTerrain(ll.lat, ll.lon, seed).type
    if ((terrain === 'water' || terrain === 'ocean') && (equipment.canoe ?? 0) > 0) active.add('canoe')
    if (terrain === 'jungle' && (equipment.machete ?? 0) > 0) active.add('machete')
    if (terrain === 'mountain' && (equipment.rope ?? 0) > 0) active.add('rope')
  }
  if ((equipment.medicine ?? 0) > 0 && (afflictions.fever || afflictions.wounds > 0)) active.add('medicine')

  const canteenPct = Math.round(canteenFill * 100)
  const canteenGlow =
    canteenFill <= 0 ? ' canteen-empty' : canteenFill < 0.05 ? ' canteen-crit' : canteenFill < 0.2 ? ' canteen-low' : ''

  return (
    <div className="inventory-bar">
      {owned.map((e) => {
        const activeCls = active.has(e) ? ' inv-active' : ''
        if (e === 'canteen') {
          return (
            <span key={e} data-eq={e} className={`inv-item canteen${canteenGlow}`} title={t.hud.canteenTooltip}>
              {t.equipment.canteen} {canteenPct}%
            </span>
          )
        }
        if (clickable(e)) {
          const label = e === 'medicine' ? `${t.equipment.medicine} (${equipment.medicine})` : t.equipment[e]
          return (
            <button key={e} data-eq={e} className={activeCls.trim()} onClick={() => activateItem(e)} title={t.hud.useTooltip}>
              {label}
            </button>
          )
        }
        // Passive gear: its effect follows possession (design.md §11/§14).
        return (
          <span key={e} data-eq={e} className={`inv-item${activeCls}`} title={t.hud.passiveTooltip}>
            {t.equipment[e]}
          </span>
        )
      })}
      {/* Presenting a valuable to a village provokes the §8 reaction. */}
      {ownedTreasures.map((id) => (
        <button key={id} onClick={() => useGame.getState().presentValuable(id)} title={t.hud.presentTooltip}>
          {t.treasures[id]} ({treasures[id]})
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

/** Health bar, bottom-left (design.md §17.1): a filled bar that is green at
 *  full health and shades ever redder toward zero. */
function HealthBar() {
  const t = useStrings()
  const health = useGame((s) => s.health)
  const frac = Math.max(0, Math.min(1, health / balance.health.max))
  // Hue sweeps green (120°) → red (0°) as health drops, so the colour reads
  // the condition at a glance without needing the H query.
  const hue = Math.round(120 * frac)
  return (
    <div className="health-bar" title={t.hud.healthBar} aria-label={t.hud.healthBar}>
      <div
        className="health-bar-fill"
        data-hue={hue}
        style={{ width: `${frac * 100}%`, background: `hsl(${hue}, 68%, 44%)` }}
      />
    </div>
  )
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


/** Sun blindness (design.md §6): the view narrows to a glaring tunnel. */
function SunblindVeil() {
  const sunblind = useGame((s) => s.afflictions.sunblind)
  if (!sunblind) return null
  return <div className="sunblind-veil" />
}

/**
 * Defeat overlay (design.md §15/§18): on death the journal falls silent and
 * a report about the explorer's remains appears instead.
 */
function DefeatOverlay() {
  const t = useStrings()
  const defeat = useGame((s) => s.defeat)
  const deathCause = useGame((s) => s.deathCause)
  const day = useGame((s) => s.day)
  const newGame = useGame((s) => s.newGame)
  const hasCheckpoint = useGame((s) => s.hasCheckpoint)
  const successorTakeOver = useGame((s) => s.successorTakeOver)
  if (!defeat) return null
  return (
    <div className="overlay defeat">
      <h1>{t.overlays.title}</h1>
      <p>
        {defeat === 'death'
          ? t.overlays.remainsReport(t.overlays.deathCauses[deathCause ?? 'wounds'], Math.floor(day))
          : t.overlays.deadlineExpired(Math.floor(day))}
      </p>
      <div className="actions">
        {defeat === 'death' && hasCheckpoint && (
          <button className="hud-button" onClick={() => successorTakeOver()}>
            {t.overlays.successor}
          </button>
        )}
        <button className="hud-button" onClick={newGame}>{t.overlays.newExpedition}</button>
      </div>
    </div>
  )
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

/**
 * Load menu (design.md §18): an overview of all port visits as a table —
 * port city, date, money, food, gifts and health state — from which the
 * player picks the state to continue from.
 */
function LoadMenu({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const t = useStrings()
  const loadCheckpoint = useGame((s) => s.loadCheckpoint)
  const [rows] = useState(() => listCheckpoints())
  return (
    <div className="overlay">
      <h1>{t.loadMenu.title}</h1>
      <table className="load-menu">
        <thead>
          <tr>
            <th>{t.loadMenu.port}</th>
            <th>{t.status.date}</th>
            <th>{t.status.cash}</th>
            <th>{t.status.provisions}</th>
            <th>{t.status.gifts}</th>
            <th>{t.loadMenu.health}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {[...rows].reverse().map((r) => (
            <tr key={r.index}>
              <td>{t.places[r.placeId] ?? r.placeId}</td>
              <td>{t.formatDate(r.day, START_YEAR)}</td>
              <td>{Math.floor(r.money)} $</td>
              <td>{t.status.provisionsWeeks(t.formatDecimal(r.foodDays / 7))}</td>
              <td>{r.gifts}</td>
              <td>{t.health.states[healthState(r.health)]}</td>
              <td>
                <button
                  className="hud-button"
                  onClick={() => {
                    if (loadCheckpoint(r.index)) onDone()
                  }}
                >
                  {t.loadMenu.resume}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions">
        <button className="hud-button" onClick={onBack}>{t.loadMenu.back}</button>
      </div>
    </div>
  )
}

/** Shown once at startup when checkpoints exist (design.md §18). */
function StartOverlay() {
  const t = useStrings()
  const [decided, setDecided] = useState(false)
  const [showLoad, setShowLoad] = useState(false)
  const [hadCheckpoint] = useState(() => useGame.getState().hasCheckpoint)
  if (decided || !hadCheckpoint) return null
  if (showLoad) return <LoadMenu onDone={() => setDecided(true)} onBack={() => setShowLoad(false)} />
  return (
    <div className="overlay">
      <h1>{t.overlays.title}</h1>
      <p>{t.overlays.checkpointFound}</p>
      <div className="actions">
        <button className="hud-button" onClick={() => setShowLoad(true)}>
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
    // Tab toggles the journal (design.md §17). It is handled directly rather
    // than via onKeyPress so its default focus-cycling can be suppressed —
    // except inside form controls (debug menu / dialog fields), where Tab
    // still navigates between them, so it never causes focus problems.
    const onTab = (e: KeyboardEvent) => {
      if (e.code !== 'Tab') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      const g = useGame.getState()
      g.setJournalOpen(!g.journalOpen)
    }
    window.addEventListener('keydown', onTab)
    const offM = onKeyPress('KeyM', () => {
      if (!useUi.getState().dialog) useUi.getState().toggleMap()
    })
    const offF1 = onKeyPress('F1', () => toggleDebug())
    // H: health query (design.md §17) as a toast in the current language.
    const offH = onKeyPress('KeyH', () => {
      const g = useGame.getState()
      const st = getStrings()
      const state = st.health.states[healthState(g.health)]
      const list = [
        g.afflictions.fever ? st.health.fever : null,
        g.afflictions.dehydration ? st.health.dehydration : null,
        g.afflictions.sunblind ? st.health.sunblind : null,
        g.afflictions.wounds === 1 ? st.health.woundsLight : null,
        g.afflictions.wounds === 2 ? st.health.woundsSevere : null,
      ].filter((x): x is string => x !== null)
      g.setToast(st.health.report(state, list))
    })
    // P: position query (design.md §17) — the coordinates as a spoken-style
    // toast in the current language (the status bar shows them permanently).
    const offP = onKeyPress('KeyP', () => {
      const g = useGame.getState()
      const st = getStrings()
      const coords =
        g.mode === 'place' && g.placeId
          ? { lat: placeById(g.placeId).lat, lon: placeById(g.placeId).lon }
          : worldToLatLon(g.pos.x, g.pos.z)
      g.setToast(st.toasts.positionReport(st.formatLatLon(coords.lat, coords.lon), st.regions[g.region]))
    })
    // C: camps (design.md §6/§17) — pitch/open a free camp while travelling,
    // open the village cache inside villages (Honored Friend privilege).
    const offC = onKeyPress('KeyC', () => {
      if (useUi.getState().dialog) return
      const g = useGame.getState()
      if (g.mode === 'travel') g.pitchOrOpenCamp()
      else g.openVillageCamp()
    })
    // F2 toggles the journal do-not-disturb option (design.md §16/§21).
    const offF2 = onKeyPress('F2', () => {
      const ui = useUi.getState()
      ui.setJournalDnd(!ui.journalDnd)
      const s = getStrings()
      useGame.getState().setToast(ui.journalDnd ? s.toasts.journalDndOff : s.toasts.journalDndOn)
    })
    // F3 grants the full debug loadout and unlocks the extended zoom
    // (design.md §21.1).
    const offF3 = onKeyPress('F3', () => {
      useGame.getState().debugFullLoadout()
      useUi.getState().setWheelZoomEnabled(true)
    })
    // F4 toggles the canoe in and out of the pack (design.md §21).
    const offF4 = onKeyPress('F4', () => useGame.getState().debugToggleCanoe())
    const offEsc = onKeyPress('Escape', () => {
      if (useUi.getState().dialog) setDialog(null)
      else if (useUi.getState().mapOpen) useUi.getState().toggleMap()
      else if (useGame.getState().journalOpen) setJournalOpen(false)
    })
    // Function keys trigger browser actions by default (F1 help, F3 find) —
    // prevent that for the keys the game uses.
    const preventFn = (e: KeyboardEvent) => {
      if (e.code === 'F1' || e.code === 'F3') e.preventDefault()
    }
    window.addEventListener('keydown', preventFn)
    return () => {
      window.removeEventListener('keydown', onTab)
      offM()
      offF1()
      offF2()
      offF3()
      offF4()
      offH()
      offP()
      offC()
      offEsc()
      window.removeEventListener('keydown', preventFn)
    }
  }, [setJournalOpen, toggleDebug, setDialog])

  return (
    <>
      <StatusBar />
      <FpsCounter />
      <HealthBar />
      <InventoryBar />
      <button className="hud-button journal-toggle" onClick={() => {
        const g = useGame.getState()
        g.setJournalOpen(!g.journalOpen)
      }}>
        {t.hud.journalToggle}
      </button>
      <button className="hud-button camp-toggle" onClick={() => {
        if (useUi.getState().dialog) return
        const g = useGame.getState()
        if (g.mode === 'travel') g.pitchOrOpenCamp()
        else g.openVillageCamp()
      }}>
        {t.hud.campToggle}
      </button>
      <Prompt />
      <Toast />
      <JournalPanel />
      <MapOverlay />
      <Dialogs />
      <DebugMenu />
      {/* Above panels and dialogs so it stays clickable; below the modal overlays. */}
      <SunblindVeil />
      <RendererWarning />
      <StartOverlay />
      <VictoryOverlay />
      <DefeatOverlay />
    </>
  )
}
