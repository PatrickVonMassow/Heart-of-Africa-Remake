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
import { freshGame, g, useGame } from '../test/store'
import { PLACES } from '../world/geo'

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

describe('bazaar dialog (design.md §10)', () => {
  it('prices the treasure buy list in $ and offers an owned treasure', () => {
    g().enterPlace('cairo')
    useUi.getState().setDialog({ kind: 'bazaar' })
    const { rerender } = render(<Dialogs />)
    // The buy list is priced in dollars (a column of .price cells).
    expect(document.querySelector('.dialog')?.textContent).toContain('$')
    expect(document.querySelectorAll('.dialog .price').length).toBeGreaterThan(0)
    // No offer button until a treasure is carried.
    const offerBtns = () => [...document.querySelectorAll('button')].filter((b) => b.textContent === en.dialogs.offer)
    expect(offerBtns().length).toBe(0)
    // Gold is revered in the North, so Cairo's bazaar trades it.
    g().debugAddTreasure('gold')
    rerender(<Dialogs />)
    expect(offerBtns().length).toBeGreaterThan(0)
  })

  it('shows an accept/decline bid row after offering a treasure', () => {
    g().enterPlace('cairo')
    g().debugAddTreasure('gold')
    useUi.getState().setDialog({ kind: 'bazaar' })
    const { rerender } = render(<Dialogs />)
    g().offerTreasure('gold')
    rerender(<Dialogs />)
    const bidRow = document.querySelector('.bazaar-bid')
    expect(bidRow).toBeInTheDocument()
    const btnTexts = [...bidRow!.querySelectorAll('button')].map((b) => b.textContent)
    expect(btnTexts).toContain(en.dialogs.accept)
    expect(btnTexts).toContain(en.dialogs.decline)
  })
})

describe('travel agency dialog (design.md §10)', () => {
  it('lists a passage to every other port with a fare and a duration', () => {
    g().enterPlace('cairo')
    useUi.getState().setDialog({ kind: 'agency' })
    render(<Dialogs />)
    const bookBtns = [...document.querySelectorAll('button')].filter((b) => b.textContent === en.dialogs.book)
    const otherPorts = PLACES.filter((p) => p.kind === 'port' && p.id !== 'cairo').length
    expect(bookBtns.length).toBe(otherPorts)
    // Each passage row carries a $ fare and a day count.
    const text = document.querySelector('.dialog')?.textContent ?? ''
    expect(text).toContain('$')
    expect(text).toMatch(/days/i)
  })

  it('disables the book button when money is below the fare', () => {
    g().enterPlace('cairo')
    useGame.setState({ money: 0 })
    useUi.getState().setDialog({ kind: 'agency' })
    render(<Dialogs />)
    const bookBtns = [...document.querySelectorAll('button')].filter((b) => b.textContent === en.dialogs.book)
    expect(bookBtns.length).toBeGreaterThan(0)
    for (const b of bookBtns) expect(b).toBeDisabled()
  })
})

describe('camp dialog — free camp (design.md §6)', () => {
  it('stores from the pack, showing empty-camp flavor then contents + take buttons', () => {
    // A free camp is pitched only while travelling; it opens its own dialog.
    useGame.setState({ mode: 'travel', placeId: null })
    g().debugAddEquipment('shovel')
    g().pitchOrOpenCamp()
    const { rerender } = render(<Dialogs />)
    expect(document.querySelector('.dialog h3')?.textContent).toBe(en.dialogs.campTitle)

    const storeBtns = () => [...document.querySelectorAll('button')].filter((b) => b.textContent === en.dialogs.campStore)
    const takeBtns = () => [...document.querySelectorAll('button')].filter((b) => b.textContent === en.dialogs.campTake)
    const text = () => document.querySelector('.dialog')?.textContent ?? ''

    // The pack has gear to store; the fresh cache is empty.
    expect(storeBtns().length).toBeGreaterThan(0)
    expect(takeBtns().length).toBe(0)
    expect(text()).toContain(en.dialogs.campEmpty)

    // Store the shovel: the cache now shows contents and a take button.
    g().campStore('equipment', 'shovel')
    rerender(<Dialogs />)
    expect(takeBtns().length).toBeGreaterThan(0)
    expect(text()).toContain(en.dialogs.campContents)
  })
})

describe('audience dialog (design.md §8/§12)', () => {
  it('shows five gift rows, each disabled when its stock is 0', () => {
    g().enterPlace('nubian-village')
    useGame.setState({ gifts: { gold: 0, silver: 0, emerald: 0, copper: 0, ivory: 0 } })
    useUi.getState().setDialog({ kind: 'audience' })
    render(<Dialogs />)
    const rows = document.querySelectorAll('.dialog .row')
    expect(rows.length).toBe(5)
    for (const row of rows) expect(row.querySelector('button')).toBeDisabled()
  })

  it('switches the mood flavor with the chief\'s goodwill', () => {
    g().enterPlace('nubian-village')
    useUi.getState().setDialog({ kind: 'audience' })
    const { rerender } = render(<Dialogs />)
    const text = () => document.querySelector('.dialog')?.textContent ?? ''
    // Goodwill 0 → guarded (moodLow).
    expect(text()).toContain(en.dialogs.moodLow)
    useGame.setState({ goodwill: { 'nubian-village': 1 } })
    rerender(<Dialogs />)
    expect(text()).toContain(en.dialogs.moodMid)
    // goodwillForHint is 2, so 3 clears the high-mood threshold.
    useGame.setState({ goodwill: { 'nubian-village': 3 } })
    rerender(<Dialogs />)
    expect(text()).toContain(en.dialogs.moodHigh)
  })

  it('shows the chief-done flavor once a hint/unspecific has been given', () => {
    g().enterPlace('nubian-village')
    useUi.getState().setDialog({ kind: 'audience' })
    const { rerender } = render(<Dialogs />)
    expect(document.querySelector('.dialog')?.textContent).not.toContain(en.dialogs.chiefDone)
    useGame.setState({ unspecificGiven: { 'nubian-village': true } })
    rerender(<Dialogs />)
    expect(document.querySelector('.dialog')?.textContent).toContain(en.dialogs.chiefDone)
  })
})
