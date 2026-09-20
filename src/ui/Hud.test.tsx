// HUD inventory + overlays (CLAUDE.md §7.1 pt. 4/9/22, design.md §17/§15).
// Ports the InventoryBar .inv-active glow asserts (enrichments.mjs) and the
// defeat-overlay render (health.mjs) into React Testing Library checks. The
// InventoryBar/overlays are internal to Hud, so the whole HUD is rendered
// (three-free; the R3F scene is never mounted here).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { Hud, LoadMenu } from './Hud'
import { en } from '../i18n/en'
import { de } from '../i18n/de'
import { useLocale } from '../i18n'
import { UNSTUCK_KEY_CODE, UNSTUCK_KEY_LABEL } from '../systems/unstuck'
import { useGame, canCampHere, type GameState } from '../state/store'
import { START_YEAR } from '../config/balance'
import { dispatchSyntheticKey, GAMEPAD_BUTTON_KEYS } from '../systems/input'
import { ctrlHeld, subscribeCtrlHold } from './ctrlHold'
import { MONTH_KEYS } from '../systems/season'
import { useUi } from '../state/ui'
import { freshGame, withWorld, jumpTo, terrainAt, g, COORD } from '../test/store'
import { balance } from '../config/balance'
import { FORM_SOCKETS, socketPosition } from '../world/forms'

withWorld()

beforeEach(() => {
  freshGame()
  useLocale.getState().setLang('en')
  // newGame() does not reset hasCheckpoint, and the UI store is a singleton —
  // clear both so overlays/prompts from a prior test never leak in.
  useGame.setState({ hasCheckpoint: false })
  useUi.setState({ dialog: null, prompt: null, enterPlaceId: null, mapOpen: false, webglFallback: false, webglWarningDismissed: false, touchActive: false })
})
afterEach(() => {
  useLocale.getState().setLang('en')
  useUi.setState({ dialog: null, prompt: null, enterPlaceId: null, mapOpen: false, webglFallback: false, webglWarningDismissed: false, touchActive: false })
})

const invClass = (eq: string) => document.querySelector(`[data-eq="${eq}"]`)?.className ?? ''

describe('clay impression inventory click', () => {
  it('answers a wrong place, fits at the talus, and refuses a spent socket without consuming the form', () => {
    const talus = socketPosition(FORM_SOCKETS.find((s) => s.id === 'bandiagara-talus')!)
    jumpTo(talus.lat + 4 * balance.digRadius / 10, talus.lon)
    useGame.setState({ carriedForms: ['rock-relief'], toast: null })
    const { getByRole } = render(<Hud />)
    const form = getByRole('button', { name: en.forms['rock-relief'] })
    const journalBefore = g().journal

    fireEvent.click(form)

    expect(g().toast).toBe(en.toasts.formNoFit)
    expect(g().spentSockets).toEqual([])
    expect(g().journal).toEqual(journalBefore)

    jumpTo(talus.lat, talus.lon)
    fireEvent.click(form)

    expect(g().toast).toBe(en.toasts.pocSolved)
    expect(g().spentSockets).toEqual(['bandiagara-talus'])
    expect(g().journal.filter((e) => e.text.key === 'journal.mouldFitted')).toHaveLength(1)
    expect(g().carriedForms).toEqual(['rock-relief'])
    const fittedJournal = g().journal

    g().setJournalOpen(false)
    fireEvent.click(form)

    expect(g().toast).toBe(en.toasts.formNoFit)
    expect(g().spentSockets).toEqual(['bandiagara-talus'])
    expect(g().journal).toEqual(fittedJournal)
    expect(g().carriedForms).toEqual(['rock-relief'])
  })
})

describe('InventoryBar .inv-active glow (design.md §17)', () => {
  it('a canoe on water glows while an idle item does not', () => {
    jumpTo(...COORD.water)
    expect(terrainAt(...COORD.water)).toBe('water')
    g().debugAddEquipment('canoe')
    g().debugAddEquipment('shovel')
    render(<Hud />)
    expect(invClass('canoe')).toContain('inv-active')
    expect(invClass('shovel')).not.toContain('inv-active')
  })

  it('the canoe does not glow on land (idle possession)', () => {
    jumpTo(...COORD.savanna)
    g().debugAddEquipment('canoe')
    render(<Hud />)
    expect(invClass('canoe')).not.toContain('inv-active')
  })

  it('medicine glows while a curable affliction is active', () => {
    jumpTo(...COORD.savanna)
    g().debugAddEquipment('medicine')
    render(<Hud />)
    expect(invClass('medicine')).not.toContain('inv-active')
    g().debugSetAffliction('fever', true)
    render(<Hud />)
    expect(invClass('medicine')).toContain('inv-active')
  })
})

describe('map overlay anchors above the inventory bar (point 163)', () => {
  it('the inventory bar publishes its height as --inv-bar-height, cleared on unmount', () => {
    jumpTo(...COORD.savanna)
    g().debugAddEquipment('shovel')
    const { unmount } = render(<Hud />)
    // Present bar → the ResizeObserver effect publishes the height (the map CSS
    // reads it to anchor its bottom above however many rows the bar wraps to).
    expect(document.documentElement.style.getPropertyValue('--inv-bar-height')).toMatch(/px$/)
    unmount()
    // Cleared when the bar leaves, so the map falls back to the single-row default.
    expect(document.documentElement.style.getPropertyValue('--inv-bar-height')).toBe('')
  })

  it('a bar holding only a carried form publishes its height too (cross-vendor review of point 689)', () => {
    jumpTo(...COORD.savanna)
    // No equipment, no treasure: the bar is absent, and nothing observes it.
    const { rerender } = render(<Hud />)
    expect(document.documentElement.style.getPropertyValue('--inv-bar-height')).toBe('')
    // The impression arrives — the bar appears for the form alone and must
    // publish, or the map overlay anchors at the no-bar height.
    useGame.setState({ carriedForms: ['rock-relief'] })
    rerender(<Hud />)
    expect(document.documentElement.style.getPropertyValue('--inv-bar-height')).toMatch(/px$/)
  })
})

describe('bottom-right button row: map always, camp only where allowed (point 93)', () => {
  const btn = (cls: string) => document.querySelector(`.hud-bottom-right .${cls}`)

  it('the map button sits left of the journal button and opens the map', () => {
    render(<Hud />)
    const map = btn('map-toggle')
    const journal = btn('journal-toggle')
    expect(map).toBeInTheDocument()
    expect(journal).toBeInTheDocument()
    expect(map!.textContent).toBe(en.hud.mapToggle)
    // DOM order: the map button precedes the journal button.
    expect(map!.compareDocumentPosition(journal!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    fireEvent.click(map!)
    expect(useUi.getState().mapOpen).toBe(true)
  })

  it('shows the camp button while travelling', () => {
    useGame.setState({ mode: 'travel', placeId: null })
    render(<Hud />)
    expect(btn('camp-toggle')).toBeInTheDocument()
  })

  it('hides the camp button in a port', () => {
    useGame.setState({ mode: 'place', placeId: 'cairo' })
    render(<Hud />)
    expect(btn('camp-toggle')).not.toBeInTheDocument()
    // The map and journal buttons stay.
    expect(btn('map-toggle')).toBeInTheDocument()
    expect(btn('journal-toggle')).toBeInTheDocument()
  })

  it('hides the camp button in a non-friend village but shows it in a friend village', () => {
    useGame.setState({ mode: 'place', placeId: 'maasai-village', honoredFriend: {} })
    const { rerender } = render(<Hud />)
    expect(btn('camp-toggle')).not.toBeInTheDocument()
    // Masai village is in the East region; becoming its Honored Friend enables camping.
    useGame.setState({ honoredFriend: { east: true } })
    rerender(<Hud />)
    expect(btn('camp-toggle')).toBeInTheDocument()
  })

  it('canCampHere matches the button: travel yes, port no, friend village yes (pure)', () => {
    expect(canCampHere({ mode: 'travel', placeId: null, honoredFriend: {} })).toBe(true)
    expect(canCampHere({ mode: 'place', placeId: 'cairo', honoredFriend: {} })).toBe(false)
    expect(canCampHere({ mode: 'place', placeId: 'maasai-village', honoredFriend: {} })).toBe(false)
    expect(canCampHere({ mode: 'place', placeId: 'maasai-village', honoredFriend: { east: true } })).toBe(true)
  })
})

describe('defeat overlay (design.md §15/§18)', () => {
  it('shows the remains report and a successor button on death', () => {
    useGame.setState({ defeat: 'death', deathCause: 'wounds', hasCheckpoint: true })
    render(<Hud />)
    const overlay = document.querySelector('.overlay.defeat')
    expect(overlay).toBeInTheDocument()
    expect(overlay?.textContent).toContain(en.overlays.successor)
  })

  it('recalls the expedition on deadline expiry with no successor button', () => {
    useGame.setState({ defeat: 'deadline', hasCheckpoint: true })
    render(<Hud />)
    const overlay = document.querySelector('.overlay.defeat')
    expect(overlay).toBeInTheDocument()
    // Deadline expiry offers no successor (design.md §18).
    expect(overlay?.textContent).not.toContain(en.overlays.successor)
  })
})

describe('sun-blindness veil (design.md §6)', () => {
  it('renders the glaring veil while sun-blind and removes it when healed', () => {
    useGame.setState({ afflictions: { fever: false, dehydration: false, sunblind: true, wounds: 0 } })
    const { rerender } = render(<Hud />)
    expect(document.querySelector('.sunblind-veil')).toBeInTheDocument()
    useGame.setState({ afflictions: { fever: false, dehydration: false, sunblind: false, wounds: 0 } })
    rerender(<Hud />)
    expect(document.querySelector('.sunblind-veil')).not.toBeInTheDocument()
  })
})

describe('load menu table (design.md §18)', () => {
  it('lists one row per port visit with the tabular columns and health word', () => {
    // Two distinct port visits lay down two snapshots (each enterPlace saves).
    useGame.setState({ health: 30 })
    g().enterPlace('cairo')
    g().leavePlace()
    useGame.setState({ health: 90 })
    g().enterPlace('zanzibar')
    expect(g().hasCheckpoint).toBe(true)

    // The startup overlay that reaches the load table is suspended for the PoC
    // (SAVE_LOAD_ENABLED, pt. 284), so render the LoadMenu directly — the load
    // code is kept intact for a one-flip revert, so its columns stay covered.
    render(<LoadMenu onDone={() => {}} onBack={() => {}} />)

    const table = document.querySelector('table.load-menu')
    expect(table).toBeInTheDocument()
    const headers = [...table!.querySelectorAll('thead th')].map((th) => th.textContent)
    expect(headers).toContain(en.loadMenu.port)
    expect(headers).toContain(en.status.cash)
    expect(headers).toContain(en.loadMenu.health)
    expect(table!.querySelectorAll('tbody tr').length).toBe(2)
    // The health state renders as a localized word (healthy/weakened/poor).
    const states = Object.values(en.health.states)
    expect(states.some((w) => table!.textContent?.includes(w))).toBe(true)
  })

  it('the startup load prompt is suppressed for the PoC even with a checkpoint (pt. 284)', () => {
    // A checkpoint exists, but SAVE_LOAD_ENABLED is false, so the HUD must NOT
    // render the start overlay / "load a saved game?" popup — the game begins
    // directly. Guards the user-requested disable against a regression.
    g().enterPlace('cairo')
    expect(g().hasCheckpoint).toBe(true)
    render(<Hud />)
    const loadBtn = [...document.querySelectorAll('button')].find((b) => b.textContent === en.overlays.loadCheckpoint)
    expect(loadBtn).toBeUndefined()
    expect(document.querySelector('table.load-menu')).not.toBeInTheDocument()
  })
})

describe('toast (design.md §17)', () => {
  it('renders the current toast message', () => {
    g().setToast('a lion roars nearby')
    render(<Hud />)
    const toast = document.querySelector('.toast')
    expect(toast).toBeInTheDocument()
    expect(toast?.textContent).toBe('a lion roars nearby')
  })

  it('renders no toast when there is none', () => {
    g().setToast(null)
    render(<Hud />)
    expect(document.querySelector('.toast')).not.toBeInTheDocument()
  })
})

describe('interaction prompt (design.md §17)', () => {
  it('shows the prompt when set and no dialog is open', () => {
    useUi.getState().setPrompt(en.prompts.openCamp)
    render(<Hud />)
    const prompt = document.querySelector('.prompt')
    expect(prompt).toBeInTheDocument()
    expect(prompt?.textContent).toBe(en.prompts.openCamp)
  })

  it('hides the prompt while a dialog is open', () => {
    useUi.getState().setPrompt(en.prompts.openCamp)
    useUi.getState().setDialog({ kind: 'bazaar' })
    render(<Hud />)
    expect(document.querySelector('.prompt')).not.toBeInTheDocument()
  })

  // Point 317: the settlement enter hint carries its own anchor class, which
  // CSS lifts from the bottom bar to just below the screen centre. Ordinary
  // prompts (camp, doors, elder) must NOT get it.
  it('marks only the settlement enter hint with the below-centre anchor class', () => {
    useUi.setState({ prompt: en.prompts.enterPlace('Cairo'), enterPlaceId: 'cairo' })
    const { unmount } = render(<Hud />)
    expect(document.querySelector('.prompt')?.className).toContain('prompt-enter')
    unmount()
    // Same prompt text, no enter candidate → the plain bottom-anchored prompt.
    useUi.setState({ prompt: en.prompts.openCamp, enterPlaceId: null })
    render(<Hud />)
    expect(document.querySelector('.prompt')).toBeInTheDocument()
    expect(document.querySelector('.prompt')?.className).not.toContain('prompt-enter')
  })

  it('keeps the below-centre anchor on the tappable touch variant', () => {
    useUi.setState({ prompt: en.prompts.enterPlace('Cairo'), enterPlaceId: 'cairo', touchActive: true })
    render(<Hud />)
    const el = document.querySelector('.prompt') as HTMLElement
    expect(el.tagName).toBe('BUTTON')
    expect(el.className).toContain('prompt-enter')
    expect(el.className).toContain('prompt-tappable')
  })
})

describe('renderer warning (CLAUDE.md §3)', () => {
  it('shows the WebGL 2 fallback notice and hides it once dismissed', () => {
    useUi.getState().setWebglFallback(true)
    const { rerender } = render(<Hud />)
    const warning = document.querySelector('.renderer-warning')
    expect(warning).toBeInTheDocument()
    expect(warning?.textContent).toContain(en.hud.webglFallback)
    const dismiss = [...warning!.querySelectorAll('button')].find((b) => b.textContent === en.hud.webglFallbackDismiss)
    fireEvent.click(dismiss!)
    rerender(<Hud />)
    expect(document.querySelector('.renderer-warning')).not.toBeInTheDocument()
  })
})

describe('victory overlay (design.md §15)', () => {
  it('shows the victory report when the tomb is found', () => {
    useGame.setState({ victory: true })
    render(<Hud />)
    const victory = [...document.querySelectorAll('.overlay')].find((o) =>
      o.textContent?.includes('found the tomb of the great king'),
    )
    expect(victory).toBeTruthy()
    expect(victory?.classList.contains('defeat')).toBe(false)
  })
})

describe('InventoryBar canteen glow (design.md §6)', () => {
  it('warns as the canteen runs low, then critical, then empty', () => {
    g().debugAddEquipment('canteen')
    const { rerender } = render(<Hud />)
    useGame.setState({ canteenFill: 0.15 })
    rerender(<Hud />)
    expect(invClass('canteen')).toContain('canteen-low')
    useGame.setState({ canteenFill: 0.03 })
    rerender(<Hud />)
    expect(invClass('canteen')).toContain('canteen-crit')
    useGame.setState({ canteenFill: 0 })
    rerender(<Hud />)
    expect(invClass('canteen')).toContain('canteen-empty')
  })

  it('blinks below a third of the fill and stops above it (design.md §6.1)', () => {
    g().debugAddEquipment('canteen')
    const { rerender } = render(<Hud />)
    useGame.setState({ canteenFill: 0.32 })
    rerender(<Hud />)
    expect(invClass('canteen')).toContain('canteen-blink')
    expect(invClass('canteen')).toContain('canteen-low') // yellow from a third down
    useGame.setState({ canteenFill: 0.34 })
    rerender(<Hud />)
    expect(invClass('canteen')).not.toContain('canteen-blink')
    expect(invClass('canteen')).not.toContain('canteen-low')
    useGame.setState({ canteenFill: 0 })
    rerender(<Hud />)
    expect(invClass('canteen')).toContain('canteen-blink') // empty keeps blinking
  })
})

describe('InventoryBar present-valuable button (design.md §8)', () => {
  it('shows a present button for each owned treasure', () => {
    g().debugAddTreasure('gold')
    render(<Hud />)
    const btn = [...document.querySelectorAll('.inventory-bar button')].find((b) =>
      b.textContent?.includes(en.treasures.gold),
    )
    expect(btn).toBeTruthy()
    expect(btn?.textContent).toContain('(1)')
  })
})

describe('InventoryBar quest find (design.md §6)', () => {
  const findButton = () => document.querySelector('[data-find="rockArtefact"]') as HTMLElement | null

  it('is absent while the find still lies buried', () => {
    expect(g().rockArtefact).toBe('buried')
    render(<Hud />)
    expect(findButton()).toBeNull()
  })

  it('stands in the bar under its own name while it is carried', () => {
    useGame.setState({ rockArtefact: 'carried' })
    render(<Hud />)
    const btn = findButton()
    expect(btn).toBeTruthy()
    expect(btn).toHaveAccessibleName(en.finds.rockArtefact)
    // It ACTS on a click, like medicine and the shovel — not a passive label.
    expect(btn?.tagName).toBe('BUTTON')
    expect(btn?.getAttribute('title')).toBe(en.hud.findTooltip)
  })

  it('carries its name in the player’s own language', () => {
    useLocale.getState().setLang('de')
    useGame.setState({ rockArtefact: 'carried' })
    render(<Hud />)
    expect(findButton()).toHaveAccessibleName(de.finds.rockArtefact)
    expect(findButton()?.getAttribute('title')).toBe(de.hud.findTooltip)
  })

  it('leaves the bar once it is given', () => {
    useGame.setState({ rockArtefact: 'given' })
    render(<Hud />)
    expect(findButton()).toBeNull()
  })

  it('the click IS the hand-over — used where nobody takes it, it says why', () => {
    useGame.setState({ rockArtefact: 'carried' })
    render(<Hud />)
    fireEvent.click(findButton()!)
    // Out on the map there is no chief to lay it in the hands of: the find
    // stays and the refusal is a toast in the player's language.
    expect(g().rockArtefact).toBe('carried')
    expect(g().toast).toBe(en.toasts.findNeedsChief)
  })

  it('shows the bar for the find alone, with nothing else carried', () => {
    useGame.setState({ equipment: {}, rockArtefact: 'carried' })
    render(<Hud />)
    expect(document.querySelector('.inventory-bar')).toBeTruthy()
    expect(findButton()).toBeTruthy()
  })
})

describe('HealthBar (design.md §17.1)', () => {
  const fill = () => document.querySelector('.health-bar-fill') as HTMLElement | null
  const hueOf = (el: HTMLElement) => Number(el.getAttribute('data-hue'))

  it('is full-width and green at full health', () => {
    useGame.setState({ health: balance.health.max })
    render(<Hud />)
    const f = fill()
    expect(f).toBeTruthy()
    expect(f!.style.width).toBe('100%')
    expect(hueOf(f!)).toBe(120) // green
    expect(document.querySelector('.health-bar')?.className).not.toContain('health-low')
  })

  it('blinks below a third of max health and stops above it (design.md §17.1)', () => {
    useGame.setState({ health: balance.health.max / 3 - 1 })
    const { rerender } = render(<Hud />)
    expect(document.querySelector('.health-bar')?.className).toContain('health-low')
    useGame.setState({ health: balance.health.max / 3 + 1 })
    rerender(<Hud />)
    expect(document.querySelector('.health-bar')?.className).not.toContain('health-low')
  })

  it('shrinks and reddens toward zero health', () => {
    useGame.setState({ health: balance.health.max * 0.1 })
    render(<Hud />)
    const f = fill()!
    expect(parseFloat(f.style.width)).toBeCloseTo(10, 5)
    expect(hueOf(f)).toBeLessThan(20) // red-ish, not green
  })

  it('shows an affliction badge to the left of the bar for each active affliction', () => {
    useGame.setState({ afflictions: { fever: true, dehydration: false, sunblind: true, wounds: 2 } })
    render(<Hud />)
    const badges = [...document.querySelectorAll('.affliction-badge')].map((e) => e.textContent)
    expect(badges).toEqual([en.health.fever, en.health.sunblind, en.health.woundsSevere])
    // Each badge precedes the health bar in the same status row (rendered left of it).
    const row = document.querySelector('.health-status')!
    const kids = [...row.children]
    expect(kids.findIndex((c) => c.classList.contains('health-bar'))).toBe(badges.length)
  })

  it('shows no affliction badge when healthy', () => {
    useGame.setState({ afflictions: { fever: false, dehydration: false, sunblind: false, wounds: 0 } })
    render(<Hud />)
    expect(document.querySelectorAll('.affliction-badge').length).toBe(0)
  })
})

describe('F3 unlocks the extended zoom alongside the loadout (design.md §21.1)', () => {
  it('sets wheelZoomEnabled and grants the loadout on one press', () => {
    useUi.setState({ wheelZoomEnabled: false })
    render(<Hud />)
    fireEvent.keyDown(window, { code: 'F3' })
    expect(useUi.getState().wheelZoomEnabled).toBe(true)
    expect(g().money).toBe(100000)
  })

  it('also sets the fast test-traversal travel speed to 25 (point 154)', () => {
    balance.travelSpeed = 5.6
    render(<Hud />)
    fireEvent.keyDown(window, { code: 'F3' })
    expect(balance.travelSpeed).toBe(25)
  })
})

describe('F9 cycles the graphics quality level (design.md §21, point 276)', () => {
  it('steps DOWN one level, wrapping the bottom to the top: medium → low → high → medium', () => {
    useUi.setState({ detailLevel: 'medium' })
    render(<Hud />)
    fireEvent.keyDown(window, { code: 'F9' })
    expect(useUi.getState().detailLevel).toBe('low')
    fireEvent.keyDown(window, { code: 'F9' })
    expect(useUi.getState().detailLevel).toBe('high')
    fireEvent.keyDown(window, { code: 'F9' })
    expect(useUi.getState().detailLevel).toBe('medium')
  })

  it('is in the preventDefault set (the browser default is suppressed)', () => {
    render(<Hud />)
    const e = new KeyboardEvent('keydown', { code: 'F9', cancelable: true, bubbles: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })

  it('leaves the individual debug flags untouched (read derived)', () => {
    useUi.setState({ detailLevel: 'medium', ssaoEnabled: true, shadowsEnabled: true })
    render(<Hud />)
    fireEvent.keyDown(window, { code: 'F9' })
    expect(useUi.getState().detailLevel).toBe('low')
    expect(useUi.getState().ssaoEnabled).toBe(true) // not clobbered
    expect(useUi.getState().shadowsEnabled).toBe(true)
  })
})

describe('Touch controls mount only with ui.touchActive (design.md §17.5, point 84)', () => {
  it('renders no .touch-controls on desktop (touchActive false)', () => {
    render(<Hud />)
    expect(document.querySelector('.touch-controls')).toBeNull()
  })

  it('mounts the stick and look surface when touchActive', () => {
    useUi.setState({ touchActive: true })
    render(<Hud />)
    expect(document.querySelector('.touch-controls')).not.toBeNull()
    expect(document.querySelector('.touch-stick')).not.toBeNull()
    expect(document.querySelector('.touch-look')).not.toBeNull()
  })

  it('leaves the prompt a plain label on desktop and makes it tappable on touch', () => {
    useUi.setState({ prompt: 'Space — Elder' })
    const { rerender } = render(<Hud />)
    // Desktop: a non-interactive div, no tappable button.
    expect(document.querySelector('.prompt')?.tagName).toBe('DIV')
    expect(document.querySelector('.prompt-tappable')).toBeNull()
    // Touch: the prompt becomes a button that dispatches the Space use key.
    useUi.setState({ touchActive: true })
    rerender(<Hud />)
    const tappable = document.querySelector('.prompt-tappable') as HTMLButtonElement
    expect(tappable).not.toBeNull()
    let sawSpace = false
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space') sawSpace = true }
    window.addEventListener('keydown', onKey)
    fireEvent.click(tappable)
    window.removeEventListener('keydown', onKey)
    expect(sawSpace).toBe(true)
  })

  // Work-order 610: a touch-only player has no U key, so the hint that names it
  // must BE the button — otherwise the escape of 604 exists but is unreachable
  // for him, and a wedge still costs the expedition.
  it('makes the stuck hint tappable on touch and dispatches the key it names', () => {
    g().setToast(en.toasts.stuckHint(UNSTUCK_KEY_LABEL))
    const { rerender } = render(<Hud />)
    // Desktop: a plain notice, nothing to press.
    expect(document.querySelector('.toast')?.tagName).toBe('DIV')
    expect(document.querySelector('.toast-tappable')).toBeNull()
    useUi.setState({ touchActive: true })
    rerender(<Hud />)
    const tappable = document.querySelector('.toast-tappable') as HTMLButtonElement
    expect(tappable).not.toBeNull()
    expect(tappable.tagName).toBe('BUTTON')
    expect(tappable.textContent).toBe(en.toasts.stuckHint(UNSTUCK_KEY_LABEL))
    const seen: string[] = []
    const onKey = (e: KeyboardEvent) => seen.push(e.code)
    window.addEventListener('keydown', onKey)
    fireEvent.click(tappable)
    window.removeEventListener('keydown', onKey)
    expect(seen).toContain(UNSTUCK_KEY_CODE)
  })

  it('leaves every other toast a plain label, even on touch', () => {
    useUi.setState({ touchActive: true })
    g().setToast(en.toasts.unstuckFreed)
    render(<Hud />)
    expect(document.querySelector('.toast')?.tagName).toBe('DIV')
    expect(document.querySelector('.toast-tappable')).toBeNull()
  })

  it('the tappable hint follows the language, so a German player taps his own text', () => {
    useUi.setState({ touchActive: true })
    useLocale.getState().setLang('de')
    g().setToast(de.toasts.stuckHint(UNSTUCK_KEY_LABEL))
    render(<Hud />)
    const tappable = document.querySelector('.toast-tappable') as HTMLButtonElement
    expect(tappable).not.toBeNull()
    expect(tappable.textContent).toBe(de.toasts.stuckHint(UNSTUCK_KEY_LABEL))
  })
})

describe('inventory bar sorts alphabetically by localized name (point 104)', () => {
  const domOrder = () => [...document.querySelectorAll('[data-eq]')].map((el) => el.getAttribute('data-eq'))

  it('orders gear by the English labels', () => {
    for (const item of ['shovel', 'rope', 'machete', 'rifle', 'medicine', 'canteen'] as const) {
      g().debugAddEquipment(item)
    }
    render(<Hud />)
    // Canteen < Machete < Medicine < Rifle < Rope < Shovel
    expect(domOrder()).toEqual(['canteen', 'machete', 'medicine', 'rifle', 'rope', 'shovel'])
  })

  it('re-sorts on a language switch (German labels)', () => {
    for (const item of ['shovel', 'rope', 'machete', 'rifle', 'medicine', 'canteen'] as const) {
      g().debugAddEquipment(item)
    }
    useLocale.getState().setLang('de')
    render(<Hud />)
    // Feldflasche < Gewehr < Machete < Medizin < Schaufel < Seil
    expect(domOrder()).toEqual(['canteen', 'rifle', 'machete', 'medicine', 'shovel', 'rope'])
  })
})


describe('FpsCounter (design.md §21, point 173)', () => {
  it('renders nothing while fpsVisible is off', () => {
    useUi.setState({ fpsVisible: false })
    render(<Hud />)
    expect(document.querySelector('.fps-counter')).not.toBeInTheDocument()
  })

  it('shows the localized fps format while visible', () => {
    useUi.setState({ fpsVisible: true })
    render(<Hud />)
    const el = document.querySelector('.fps-counter')
    expect(el).toBeInTheDocument()
    // Before the first rAF sample resolves, the counter reads its initial 0.
    expect(el?.textContent).toBe(en.hud.fps(0))
  })
})

describe('HealthBar wound badges and fraction clamp (design.md §17.1, point 173)', () => {
  const fill = () => document.querySelector('.health-bar-fill') as HTMLElement | null
  const hueOf = (el: HTMLElement) => Number(el.getAttribute('data-hue'))

  it('shows the light-wound badge for wounds === 1 (only wounds:2 was exercised before)', () => {
    useGame.setState({ afflictions: { fever: false, dehydration: false, sunblind: false, wounds: 1 } })
    render(<Hud />)
    const badges = [...document.querySelectorAll('.affliction-badge')].map((e) => e.textContent)
    expect(badges).toEqual([en.health.woundsLight])
  })

  it('clamps health above max to a full green bar', () => {
    useGame.setState({ health: balance.health.max * 5 })
    render(<Hud />)
    const f = fill()!
    expect(f.style.width).toBe('100%')
    expect(hueOf(f)).toBe(120)
  })

  it('clamps negative health to an empty red bar', () => {
    useGame.setState({ health: -50 })
    render(<Hud />)
    const f = fill()!
    expect(f.style.width).toBe('0%')
    expect(hueOf(f)).toBe(0)
  })
})

describe('month keys (design.md §21.1 — stepping the seasons)', () => {
  it('binds the twelve adjacent keys of the number row, in month order', () => {
    // PHYSICAL codes: the row reads 1..0 ß ´ on a German keyboard and 1..0 - =
    // on a US one, and the same twelve keys mean Jan..Dec either way.
    expect(MONTH_KEYS).toEqual([
      'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6',
      'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal',
    ])
    expect(MONTH_KEYS).toHaveLength(12)
    expect(new Set(MONTH_KEYS).size).toBe(12) // no key means two months
  })

  // Work-order 601: the chords on this row were handed back to the browser
  // (Ctrl+1–9 tab jumps, Ctrl +/−/0 zoom). The handler must therefore stand
  // down under a modifier, or one press does BOTH — switching the tab and
  // silently moving the expedition's date.
  it('does not move the date on a Ctrl press, and leaves the chord to the browser', () => {
    render(<Hud />)
    const monthOf = () =>
      new Date(Date.UTC(START_YEAR, 0, 1) + useGame.getState().day * 86400000).getUTCMonth()
    const before = useGame.getState().day
    const notPrevented = window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Digit3', ctrlKey: true, cancelable: true }),
    )
    expect(useGame.getState().day).toBe(before) // the date did not move
    expect(notPrevented).toBe(true) // …and the browser keeps its tab jump
    // Alt and Meta are the same case.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Equal', altKey: true, cancelable: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', metaKey: true, cancelable: true }))
    expect(useGame.getState().day).toBe(before)
    // Plain digits belong to inventory; Shift alone jumps the month.
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3', cancelable: true }))
    expect(useGame.getState().day).toBe(before)
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3', shiftKey: true, cancelable: true }))
    expect(monthOf()).toBe(2) // March
    expect(useGame.getState().day).not.toBe(before)
  })

  it('moves the entire month row to Shift alone, also while Shift names labels', () => {
    useUi.getState().setLabelModifier('shift')
    const offLabels = subscribeCtrlHold(() => {})
    const { unmount } = render(<Hud />)
    try {
      for (const [i, code] of MONTH_KEYS.entries()) {
        const before = g().day
        for (const mods of [{}, { shiftKey: true, ctrlKey: true }, { shiftKey: true, altKey: true }, { shiftKey: true, metaKey: true }]) {
          fireEvent.keyDown(window, { code, ...mods })
          expect(g().day).toBe(before)
        }
        fireEvent.keyDown(window, { code, shiftKey: true })
        expect(ctrlHeld()).toBe(true)
        const date = new Date(Date.UTC(START_YEAR, 0, 1) + g().day * 86400000)
        expect(date.getUTCMonth()).toBe(i)
      }
    } finally {
      unmount()
      offLabels()
      useUi.getState().setLabelModifier('ctrl')
    }
  })

  it('jumps the store to that month, keeping the year', () => {
    const year3 = (Date.UTC(START_YEAR + 2, 5, 20) - Date.UTC(START_YEAR, 0, 1)) / 86400000
    useGame.setState({ day: year3 })
    useGame.getState().debugJumpToMonth(MONTH_KEYS.indexOf('Equal') + 1) // the last key = December
    const d = new Date(Date.UTC(START_YEAR, 0, 1) + useGame.getState().day * 86400000)
    expect(d.getUTCMonth()).toBe(11)
    expect(d.getUTCFullYear()).toBe(START_YEAR + 2) // the expedition keeps its year
  })
})


describe('every inventory slot answers a press (design.md §17.1)', () => {
  // The shovel in the open is the model: pressed where nothing is buried it
  // says so in a TOAST and writes no chronicle page. Every other slot follows —
  // where the item cannot act right now, the traveller says why.
  const pressBoth = (expected: string) => {
    const { container, unmount } = render(<Hud />)
    const bar = container.querySelector('.inventory-bar')!
    // One item under test, so the slot is the first and its key is Digit1.
    expect(bar.children).toHaveLength(1)
    const slot = bar.children[0] as HTMLButtonElement
    expect(slot.tagName).toBe('BUTTON')
    const journalBefore = g().journal
    const presses: [string, () => void][] = [
      ['click', () => fireEvent.click(slot)],
      ['Digit1', () => fireEvent.keyDown(window, { code: 'Digit1' })],
    ]
    for (const [how, press] of presses) {
      act(() => useGame.setState({ toast: null }))
      press()
      expect(g().toast, how).toBe(expected)
      expect(g().journal, how).toBe(journalBefore) // a toast, never an entry
    }
    unmount()
  }
  const inTheOpen = (coord: readonly [number, number], state: Partial<GameState>) => {
    jumpTo(coord[0], coord[1])
    act(() => useGame.setState({ equipment: {}, ...state }))
  }
  const inASettlement = (state: Partial<GameState>, placeId = 'cairo') =>
    act(() => useGame.setState({ mode: 'place', placeId, equipment: {}, ...state }))

  it('the rifle: it comes up by itself in the open, and threatens nobody in a settlement', () => {
    inTheOpen(COORD.savanna, { equipment: { rifle: 1 } })
    pressBoth(en.toasts.rifleReady)
    inASettlement({ equipment: { rifle: 1 } })
    pressBoth(en.toasts.rifleInSettlement)
  })

  it('the rope: it waits for a climb, takes his weight on a mountain, finds nothing to climb indoors', () => {
    inTheOpen(COORD.savanna, { equipment: { rope: 1 } })
    pressBoth(en.toasts.ropeReady)
    inTheOpen(COORD.mountain, { equipment: { rope: 1 } })
    expect(terrainAt(...COORD.mountain)).toBe('mountain')
    pressBoth(en.toasts.ropeInUse)
    inASettlement({ equipment: { rope: 1 } })
    pressBoth(en.toasts.ropeInSettlement)
  })

  it('the machete: it waits for the jungle, clears it where it stands, stays sheathed among people', () => {
    inTheOpen(COORD.savanna, { equipment: { machete: 1 } })
    pressBoth(en.toasts.macheteReady)
    inTheOpen(COORD.jungle, { equipment: { machete: 1 } })
    expect(terrainAt(...COORD.jungle)).toBe('jungle')
    pressBoth(en.toasts.macheteInUse)
    inASettlement({ equipment: { machete: 1 } })
    pressBoth(en.toasts.macheteInSettlement)
  })

  it('the canoe: it launches itself at water, carries him on it, finds no water in a settlement', () => {
    inTheOpen(COORD.savanna, { equipment: { canoe: 1 } })
    pressBoth(en.toasts.canoeReady)
    inTheOpen(COORD.water, { equipment: { canoe: 1 } })
    expect(terrainAt(...COORD.water)).toBe('water')
    pressBoth(en.toasts.canoeInUse)
    inASettlement({ equipment: { canoe: 1 } })
    pressBoth(en.toasts.canoeInSettlement)
  })

  it('the canteen gives the same answer in both views, in the player’s language', () => {
    inTheOpen(COORD.savanna, { equipment: { canteen: 1 } })
    pressBoth(en.toasts.canteenReady)
    inASettlement({ equipment: { canteen: 1 } })
    pressBoth(en.toasts.canteenReady)
    act(() => useLocale.getState().setLang('de'))
    pressBoth(de.toasts.canteenReady)
  })

  it('the shovel does not dig up the ground people live on', () => {
    inASettlement({ equipment: { shovel: 1 } })
    pressBoth(en.toasts.digInSettlement)
  })

  it('a carried form is pressed against stone out in the open, not in a settlement', () => {
    inASettlement({ carriedForms: ['rock-relief'] })
    pressBoth(en.toasts.formInSettlement)
  })

  it('a treasure: nobody out on the map to show it to, and the bazaar only trades it', () => {
    inTheOpen(COORD.savanna, { treasures: { ...g().treasures, gold: 1 } })
    pressBoth(en.toasts.valuableNobodyHere)
    inASettlement({ treasures: { ...g().treasures, gold: 1 } })
    pressBoth(en.toasts.valuableBazaar)
  })

  it('a village that neither reveres nor rejects the material looks without interest', () => {
    // The north reveres gold and emerald and rejects silver: copper leaves it cold.
    inASettlement({ treasures: { ...g().treasures, copper: 1 } }, 'nubian-village')
    const { container, unmount } = render(<Hud />)
    const slot = container.querySelector('.inventory-bar')!.children[0] as HTMLButtonElement
    const journalBefore = g().journal
    fireEvent.click(slot)
    expect(g().toast).toBe(en.toasts.valuableIndifferent)
    expect(g().journal).toBe(journalBefore)
    expect(g().valuableShown['nubian-village']).toBe(true)
    unmount()
  })
})

describe('inventory keyboard and gamepad access', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each(['travel', 'place'] as const)('uses the matching displayed slot in %s without moving the date', (mode) => {
    useGame.setState({ mode, placeId: mode === 'place' ? 'cairo' : null,
      equipment: { medicine: 2, shovel: 1 }, afflictions: { ...g().afflictions, fever: true } })
    const { container } = render(<Hud />)
    const before = g().day
    const slots = container.querySelector('.inventory-bar')!.children
    expect(slots[0].querySelector('.inv-digit')).toHaveTextContent('1')
    expect(slots[1].querySelector('.inv-digit')).toHaveTextContent('2')
    fireEvent.keyDown(window, { code: 'Digit1' })
    expect(g().equipment.medicine).toBe(1)
    expect(g().afflictions.fever).toBe(false)
    const dig = vi.spyOn(g(), 'dig').mockImplementation(() => {})
    fireEvent.keyDown(window, { code: 'Digit2' })
    expect(dig).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { code: 'Digit9' })
    expect(dig).toHaveBeenCalledTimes(1)
    expect(g().equipment.medicine).toBe(1)
    expect(g().day).toBe(before)
  })

  it('shares the visible localized order across passive gear, forms, finds and treasures, numbering only nine', () => {
    useGame.setState({ mode: 'travel', placeId: null, equipment: { canteen: 1, shovel: 1 }, carriedForms: ['rock-relief'],
      rockArtefact: 'carried', treasures: { gold: 1, silver: 1, emerald: 1, copper: 1, ivory: 1, statue: 1 } })
    const form = vi.spyOn(g(), 'useCarriedForm').mockImplementation(() => {})
    const find = vi.spyOn(g(), 'handArtefactToChief').mockImplementation(() => {})
    const present = vi.spyOn(g(), 'presentValuable').mockImplementation(() => {})
    const dig = vi.spyOn(g(), 'dig').mockImplementation(() => {})
    const { container } = render(<Hud />)
    for (const lang of ['en', 'de'] as const) {
      act(() => useLocale.getState().setLang(lang))
      const slots = [...container.querySelector('.inventory-bar')!.children]
      expect(slots).toHaveLength(10)
      expect(container.querySelectorAll('.inv-digit')).toHaveLength(9)
      const shovelIndex = slots.findIndex((slot) => slot.getAttribute('data-eq') === 'shovel')
      fireEvent.keyDown(window, { code: `Digit${shovelIndex + 1}` })
      fireEvent.keyDown(window, { code: 'Digit3' })
      fireEvent.keyDown(window, { code: 'Digit4' })
      const t = lang === 'en' ? en : de
      const treasures = Object.keys(g().treasures) as (keyof typeof t.treasures)[]
      treasures.sort((a, b) => t.treasures[a].localeCompare(t.treasures[b], lang))
      for (let i = 5; i <= 9; i++) {
        fireEvent.keyDown(window, { code: `Digit${i}` })
        expect(present).toHaveBeenLastCalledWith(treasures[i - 5])
      }
    }
    expect(dig).toHaveBeenCalledTimes(2)
    expect(form).toHaveBeenCalledTimes(2)
    expect(find).toHaveBeenCalledTimes(2)
    expect(present).toHaveBeenCalledTimes(10)
    fireEvent.keyDown(window, { code: 'Digit0' })
    expect(present).toHaveBeenCalledTimes(10)
  })

  it('ignores empty slots, repeats, browser chords, typing and open dialogs', () => {
    const dig = vi.spyOn(g(), 'dig').mockImplementation(() => {})
    const { rerender } = render(<Hud />)
    fireEvent.keyDown(window, { code: 'Digit1' })
    act(() => useGame.setState({ equipment: { canteen: 1, shovel: 1 } }))
    rerender(<Hud />)
    fireEvent.keyDown(window, { code: 'Digit1' })
    for (const mods of [{ repeat: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }]) {
      fireEvent.keyDown(window, { code: 'Digit2', ...mods })
    }
    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { code: 'Digit2' })
    input.remove()
    act(() => useUi.getState().setDialog({ kind: 'agency' }))
    fireEvent.keyDown(window, { code: 'Digit2' })
    expect(dig).not.toHaveBeenCalled()
  })

  it('selects and highlights slots from the d-pad without using them or taking A', () => {
    useGame.setState({ equipment: { medicine: 1, shovel: 1 } })
    const dig = vi.spyOn(g(), 'dig').mockImplementation(() => {})
    const medicine = vi.spyOn(g(), 'useMedicine').mockImplementation(() => {})
    const { container, unmount } = render(<Hud />)
    const selected = () => container.querySelector('.inv-selected')?.getAttribute('data-eq')
    const pad = (button: number) => act(() => dispatchSyntheticKey(GAMEPAD_BUTTON_KEYS[button], 'gamepad'))
    fireEvent.keyDown(window, { code: 'ArrowRight' })
    expect(selected()).toBeUndefined()
    pad(15)
    expect(selected()).toBe('medicine')
    pad(15)
    expect(selected()).toBe('shovel')
    pad(0)
    expect(dig).not.toHaveBeenCalled()
    pad(14)
    expect(selected()).toBe('medicine')
    pad(14)
    expect(selected()).toBe('shovel')
    expect(medicine).not.toHaveBeenCalled()
    unmount()
    fireEvent.keyDown(window, { code: 'Digit2' })
    expect(dig).not.toHaveBeenCalled()
  })
})


describe('settlement cursor mode hint', () => {
  const pointerDescriptor = Object.getOwnPropertyDescriptor(document, 'pointerLockElement')
  const webdriverDescriptor = Object.getOwnPropertyDescriptor(navigator, 'webdriver')
  const lock = (element: Element | null) => {
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: element })
    fireEvent(document, new Event('pointerlockchange'))
  }
  beforeEach(() => {
    Object.defineProperty(navigator, 'webdriver', { configurable: true, value: false })
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: null })
    useGame.setState({ mode: 'place', placeId: 'cairo' })
  })
  afterEach(() => {
    if (pointerDescriptor) Object.defineProperty(document, 'pointerLockElement', pointerDescriptor)
    else Reflect.deleteProperty(document, 'pointerLockElement')
    if (webdriverDescriptor) Object.defineProperty(navigator, 'webdriver', webdriverDescriptor)
    else Reflect.deleteProperty(navigator, 'webdriver')
  })

  it.each(['en', 'de'] as const)('names both actual lock states in %s', (lang) => {
    const strings = lang === 'en' ? en : de
    useLocale.getState().setLang(lang)
    const { container, getByText } = render(<Hud />)
    expect(getByText(strings.hud.cursorModeUnlocked)).toBeInTheDocument()
    const canvas = document.createElement('canvas')
    lock(canvas)
    expect(getByText(strings.hud.cursorModeLocked)).toHaveClass('cursor-mode-locked')
    lock(null)
    expect(getByText(strings.hud.cursorModeUnlocked)).not.toHaveClass('cursor-mode-locked')
    act(() => useGame.setState({ mode: 'travel', placeId: null }))
    expect(container.querySelector('.cursor-mode-hint')).toBeNull()
  })

  it('says nothing under automation or on touch, where there is no cursor to take', () => {
    useUi.setState({ touchActive: false })
    const { container, rerender } = render(<Hud />)
    expect(container.querySelector('.cursor-mode-hint')).not.toBeNull()
    act(() => useUi.setState({ touchActive: true }))
    rerender(<Hud />)
    expect(container.querySelector('.cursor-mode-hint')).toBeNull()
    act(() => useUi.setState({ touchActive: false }))
    rerender(<Hud />)
    expect(container.querySelector('.cursor-mode-hint')).not.toBeNull()
    Object.defineProperty(navigator, 'webdriver', { configurable: true, value: true })
    rerender(<Hud />)
    act(() => useGame.setState({ mode: 'place', placeId: 'cairo' }))
    expect(container.querySelector('.cursor-mode-hint')).toBeNull()
  })

  it('reads a lock already held at mount and updates the language live', () => {
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, value: document.createElement('canvas') })
    const { getByText } = render(<Hud />)
    expect(getByText(en.hud.cursorModeLocked)).toBeInTheDocument()
    act(() => useLocale.getState().setLang('de'))
    expect(getByText(de.hud.cursorModeLocked)).toBeInTheDocument()
  })

  it('stands in the row itself, centred, not in the bar\'s left group (point 1160)', () => {
    const { container } = render(<Hud />)
    const hint = container.querySelector('.cursor-mode-hint')
    expect(hint).not.toBeNull()
    expect(container.querySelector('.hud-bottom-left .cursor-mode-hint')).toBeNull()
    expect(hint!.parentElement).toBe(container.querySelector('.hud-bottom-row'))
    // Nothing is measurable in jsdom, so the CSS's own centring stands.
    expect(hint).toHaveClass('cursor-mode-centre')
    expect(hint!.getAttribute('style')).toBeNull()
  })

  it('hides both hints under browser automation, matching the lock skip', () => {
    Object.defineProperty(navigator, 'webdriver', { configurable: true, value: true })
    const { container } = render(<Hud />)
    expect(container.querySelector('.cursor-mode-hint')).toBeNull()
    lock(document.createElement('canvas'))
    expect(container.querySelector('.cursor-mode-hint')).toBeNull()
  })
})
