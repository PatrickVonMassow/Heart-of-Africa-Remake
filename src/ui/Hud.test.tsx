// HUD inventory + overlays (CLAUDE.md §7.1 pt. 4/9/22, design.md §17/§15).
// Ports the InventoryBar .inv-active glow asserts (enrichments.mjs) and the
// defeat-overlay render (health.mjs) into React Testing Library checks. The
// InventoryBar/overlays are internal to Hud, so the whole HUD is rendered
// (three-free; the R3F scene is never mounted here).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Hud } from './Hud'
import { en } from '../i18n/en'
import { useLocale } from '../i18n'
import { useGame, canCampHere } from '../state/store'
import { useUi } from '../state/ui'
import { freshGame, withWorld, jumpTo, terrainAt, g, COORD } from '../test/store'
import { balance } from '../config/balance'

withWorld()

beforeEach(() => {
  freshGame()
  useLocale.getState().setLang('en')
  // newGame() does not reset hasCheckpoint, and the UI store is a singleton —
  // clear both so overlays/prompts from a prior test never leak in.
  useGame.setState({ hasCheckpoint: false })
  useUi.setState({ dialog: null, prompt: null, mapOpen: false, webglFallback: false, webglWarningDismissed: false })
})
afterEach(() => {
  useLocale.getState().setLang('en')
  useUi.setState({ dialog: null, prompt: null, mapOpen: false, webglFallback: false, webglWarningDismissed: false })
})

const invClass = (eq: string) => document.querySelector(`[data-eq="${eq}"]`)?.className ?? ''

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
    useGame.setState({ mode: 'place', placeId: 'masai-village', honoredFriend: {}, regionRobbed: {} })
    const { rerender } = render(<Hud />)
    expect(btn('camp-toggle')).not.toBeInTheDocument()
    // Masai village is in the East region; becoming its Honored Friend enables camping.
    useGame.setState({ honoredFriend: { east: true } })
    rerender(<Hud />)
    expect(btn('camp-toggle')).toBeInTheDocument()
  })

  it('canCampHere matches the button: travel yes, port no, friend village yes (pure)', () => {
    expect(canCampHere({ mode: 'travel', placeId: null, honoredFriend: {}, regionRobbed: {} })).toBe(true)
    expect(canCampHere({ mode: 'place', placeId: 'cairo', honoredFriend: {}, regionRobbed: {} })).toBe(false)
    expect(canCampHere({ mode: 'place', placeId: 'masai-village', honoredFriend: {}, regionRobbed: {} })).toBe(false)
    expect(canCampHere({ mode: 'place', placeId: 'masai-village', honoredFriend: { east: true }, regionRobbed: {} })).toBe(true)
    // A robbed region forfeits camping even as a friend.
    expect(canCampHere({ mode: 'place', placeId: 'masai-village', honoredFriend: { east: true }, regionRobbed: { east: true } })).toBe(false)
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

    render(<Hud />)
    // The start overlay offers to load; click through to the table.
    const loadBtn = [...document.querySelectorAll('button')].find((b) => b.textContent === en.overlays.loadCheckpoint)
    expect(loadBtn).toBeTruthy()
    fireEvent.click(loadBtn!)

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
})
