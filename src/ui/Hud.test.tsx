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
import { useGame } from '../state/store'
import { useUi } from '../state/ui'
import { freshGame, withWorld, jumpTo, terrainAt, g, COORD } from '../test/store'

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
