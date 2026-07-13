// StatusBar HUD component (CLAUDE.md §7.1 pt. 9/17, design.md §17). Ports the
// status-bar asserts of i18n.mjs and enrichments.mjs into React Testing Library
// checks (jsdom, no browser): localized labels, no permanent coordinate
// display, and the movement-penalty hint rendered inside the bar. The
// acceptance screenshots stay in Playwright.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBar } from './StatusBar'
import { en } from '../i18n/en'
import { de } from '../i18n/de'
import { useLocale } from '../i18n'
import { freshGame, withWorld, jumpTo, terrainAt, g, COORD } from '../test/store'

withWorld()

beforeEach(() => {
  freshGame()
  useLocale.getState().setLang('en')
})
afterEach(() => {
  useLocale.getState().setLang('en')
})

describe('StatusBar localization and symbols (design.md §17.1)', () => {
  it('leads each stat with a symbol; the localized word is the tooltip, not text', () => {
    render(<StatusBar />)
    for (const label of [en.status.date, en.status.cash, en.status.provisions, en.status.gifts, en.status.region]) {
      const stat = screen.getByTitle(label)
      expect(stat).toBeInTheDocument()
      expect(stat.querySelector('.stat-icon')).toBeInTheDocument()
      // The word itself no longer takes bar width.
      expect(stat.textContent).not.toContain(label)
    }
    expect(document.body.textContent).not.toMatch(/Latitude|Longitude/)
  })

  it('shows the date as DD.MM.YYYY', () => {
    render(<StatusBar />)
    expect(screen.getByTitle(en.status.date).textContent).toBe('01.01.1890')
  })

  it('localizes the tooltips after a runtime language switch', () => {
    useLocale.getState().setLang('de')
    render(<StatusBar />)
    expect(screen.getByTitle(de.status.date)).toBeInTheDocument()
    expect(screen.getByTitle(de.status.cash)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(en.status.cash)
  })

  it('hosts the health bar inside the bar (never covered by the journal)', () => {
    render(<StatusBar />)
    expect(document.querySelector('.status-bar .status-health .health-bar-fill')).toBeInTheDocument()
  })
})

describe('movement-penalty hint (design.md §11/§17)', () => {
  it('names the slowdown inside the status bar and clears with the relief item', () => {
    jumpTo(...COORD.jungle)
    expect(terrainAt(...COORD.jungle)).toBe('jungle')
    const { rerender } = render(<StatusBar />)
    // The hint is a descendant of the bar (not a floating panel).
    const hint = document.querySelector('.status-bar .movement-penalty')
    expect(hint).toBeInTheDocument()
    expect(hint?.textContent).toBe(en.hud.movementPenalty.jungle)

    // Carrying the machete removes the jungle slowdown → hint gone.
    g().debugAddEquipment('machete')
    rerender(<StatusBar />)
    expect(document.querySelector('.movement-penalty')).not.toBeInTheDocument()
  })

  it('shows no penalty hint inside a settlement (place mode)', () => {
    g().enterPlace('cairo')
    render(<StatusBar />)
    expect(document.querySelector('.movement-penalty')).not.toBeInTheDocument()
  })
})
