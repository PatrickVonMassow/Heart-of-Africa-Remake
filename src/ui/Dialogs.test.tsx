// Trade + audience dialogs (CLAUDE.md §7.1 pt. 5/6/7/26, design.md §9/§12).
// Ports the render-side dialog asserts of i18n.mjs / economy.mjs / reputation.mjs
// into React Testing Library checks: the trade dialog lays goods out as a
// name/price table, villages price in gifts not money, and robbing the chief
// takes a deliberate confirmation. Pixel-perfect column alignment (getBounding-
// ClientRect) stays in Playwright — jsdom has no layout.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Dialogs } from './Dialogs'
import { en } from '../i18n/en'
import { useLocale } from '../i18n'
import { useUi } from '../state/ui'
import { freshGame, g } from '../test/store'

beforeEach(() => {
  freshGame()
  useLocale.getState().setLang('en')
  useUi.getState().setDialog(null)
})
afterEach(() => {
  useLocale.getState().setLang('en')
  useUi.getState().setDialog(null)
})

describe('trade dialog (design.md §9)', () => {
  it('lays goods out as a name/price table with buy actions, priced in $ in a port', () => {
    g().enterPlace('cairo')
    useUi.getState().setDialog({ kind: 'trade', building: 'shop' })
    render(<Dialogs />)
    expect(document.querySelector('.dialog')).toBeInTheDocument()
    const rows = document.querySelectorAll('.trade-grid .trade-row')
    expect(rows.length).toBeGreaterThan(0)
    // Every row carries a name cell and a price cell (the column).
    for (const row of rows) {
      expect(row.querySelector('.trade-name')).toBeInTheDocument()
      expect(row.querySelector('.price')).toBeInTheDocument()
    }
    expect(document.querySelector('.dialog')?.textContent).toContain('$')
  })

  it('prices village goods in gifts, not money (design.md §10)', () => {
    g().enterPlace('nubian-village') // north village → currency is gifts
    useUi.getState().setDialog({ kind: 'trade', building: 'market' })
    render(<Dialogs />)
    const txt = document.querySelector('.dialog')?.textContent ?? ''
    expect(txt).toMatch(/gifts|Gaben/i)
    expect(txt).not.toContain('$')
  })
})

describe('rob the chief (design.md §12)', () => {
  it('offers the robbery only with a rifle and gates it behind a confirmation', () => {
    g().enterPlace('nubian-village')
    useUi.getState().setDialog({ kind: 'audience' })

    // Without a rifle the audience offers no robbery button.
    const { rerender } = render(<Dialogs />)
    expect(document.querySelector('.dialog')?.textContent).not.toContain(en.dialogs.rob)

    // A rifle in the pack unlocks the Rob button; clicking it reveals the
    // deliberate confirmation gate, not an immediate robbery.
    g().debugAddEquipment('rifle')
    rerender(<Dialogs />)
    const robBtn = [...document.querySelectorAll('button')].find((b) => b.textContent === en.dialogs.rob)
    expect(robBtn).toBeTruthy()
    fireEvent.click(robBtn!)
    expect(document.querySelector('.rob-confirm')).toBeInTheDocument()
    expect(document.querySelector('.rob-confirm')?.textContent).toContain(en.dialogs.robConfirmYes)
    // The village has not been robbed yet (still in the village, confirmation pending).
    expect(g().mode).toBe('place')
  })
})
